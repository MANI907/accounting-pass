import {validateMemos} from './core.mjs';

// One cache/outbox per account. Browser-only memos keep their original key.
export class MemoSync {
 constructor({userId,adapter,storage,onChange=()=>{},onStatus=()=>{},onConflict=()=>{},uuid=()=>crypto.randomUUID()}){
  this.userId=userId;this.adapter=adapter;this.storage=storage;this.onChange=onChange;this.onStatus=onStatus;this.onConflict=onConflict;this.uuid=uuid;
  this.key='accounting-pass-cloud-memos-v1:'+userId;this.items=Object.create(null);this.pending=Object.create(null);this.closed=false;this.timer=null;this.running=null;this.cacheError=false;
  try{
   const cached=JSON.parse(storage.getItem(this.key)||'null');
   if(cached?.userId===userId){
    for(const row of cached.items||[])this.items[row.id]=cleanRow(row);
    for(const [id,p] of Object.entries(cached.pending||{})){
     const memo=cleanRow(p.memo);
     if(id!==memo.id||!(p.base===null||Number.isSafeInteger(p.base)&&p.base>0))throw Error('Invalid outbox');
     this.pending[id]={memo,base:p.base,token:String(p.token)};
    }
   }
  }catch{this.cacheError=true;this.items=Object.create(null);this.pending=Object.create(null);}
 }
 get memos(){return Object.values(this.items).filter(m=>!m.deleted).map(({revision,deleted,...m})=>m)}
 get count(){return Object.keys(this.pending).length}
 status(){return this.cacheError?'cache-error':this.count?'pending':'saved'}
 notify(){if(!this.closed){this.onChange(this.memos);this.onStatus(this.status())}}
 persist(){
  try{this.storage.setItem(this.key,JSON.stringify({userId:this.userId,items:Object.values(this.items),pending:this.pending}));this.cacheError=false;}
  catch{this.cacheError=true;}
 }
 put(memo){
  if(this.closed)throw Error('로그인을 확인해 주세요.');
  const clean=validateMemos([memo])[0];const old=this.items[clean.id];
  this.items[clean.id]={...clean,revision:old?.revision||0,deleted:false};
  this.pending[clean.id]={memo:this.items[clean.id],base:this.pending[clean.id]?.base??(old?.revision||null),token:this.uuid()};
  this.persist();this.notify();this.schedule();
 }
 remove(id){
  const old=this.items[id];if(!old||this.closed)return;
  const memo={...old,title:'',text:'',deleted:true,updatedAt:Math.max(Date.now(),old.updatedAt)};
  this.items[id]=memo;
  this.pending[id]={memo,base:this.pending[id]?.base??(old.revision||null),token:this.uuid()};
  this.persist();this.notify();this.schedule();
 }
 schedule(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.sync(),800)}
 close(){this.closed=true;clearTimeout(this.timer)}
 async sync(){
  if(this.closed)return;
  if(this.running)return this.running;
  clearTimeout(this.timer);
  this.running=this.cycle().finally(()=>{this.running=null});
  return this.running;
 }
 async cycle(){
  this.onStatus('syncing');
  try{
   // Snapshot IDs; edits arriving during a request keep a fresh outbox token.
   for(const id of Object.keys(this.pending)){
    if(this.closed)return;
    const sent=this.pending[id];if(!sent)continue;
    const result=await this.adapter.write(sent.memo,sent.base);
    if(this.closed)return;
    const current=this.pending[id];
    if(result){
     const row=cleanRow(result);
     if(current?.token===sent.token){delete this.pending[id];this.items[id]=row;}
     else if(current){current.base=row.revision;this.items[id]={...current.memo,revision:row.revision};}
    }else{
     const remote=await this.adapter.get(id);
     if(this.closed)return;
     if(!remote)throw Error('저장 상태를 확인하지 못했습니다. 다시 시도해 주세요.');
     const row=cleanRow(remote),latest=this.pending[id];
     // A lost HTTP response may mean the write already succeeded.
     if(sameContent(row,sent.memo)){
      if(latest?.token===sent.token){delete this.pending[id];this.items[id]=row;}
      else if(latest){latest.base=row.revision;this.items[id]={...latest.memo,revision:row.revision};}
     }else{
      this.items[id]=row;delete this.pending[id];
      if(latest&&!latest.memo.deleted){
       const copy={...latest.memo,id:this.uuid(),title:(latest.memo.title||'제목 없는 메모').slice(0,105)+' (기기 사본)',revision:0,deleted:false};
       this.items[copy.id]=copy;this.pending[copy.id]={memo:copy,base:null,token:this.uuid()};
      }
      this.onConflict();
     }
    }
    this.persist();this.notify();
   }
   const rows=await this.adapter.list();if(this.closed)return;
   const remote=Object.create(null);for(const row of rows){const clean=cleanRow(row);remote[clean.id]=clean;}
   for(const [id,p] of Object.entries(this.pending))remote[id]=this.items[id]||p.memo;
   this.items=remote;this.persist();this.notify();
   if(this.count)this.schedule();
  }catch(error){
   if(!this.closed){this.persist();this.onStatus(this.cacheError?'cache-error':'offline');}
  }
 }
}
function cleanRow(value){
 const memo=validateMemos([value])[0];
 if(!Number.isSafeInteger(value.revision)||value.revision<0||typeof value.deleted!=='boolean')throw Error('Invalid cloud memo');
 return {...memo,revision:value.revision,deleted:value.deleted};
}
function sameContent(a,b){return ['title','text','createdAt','updatedAt','deleted'].every(key=>a[key]===b[key])}

export function supabaseMemoAdapter(client,userId){
 const table=()=>client.from('study_memos');
 const fields='id,title,text,created_at,updated_at,revision,deleted';
 const decode=row=>({id:row.id,title:row.title,text:row.text,createdAt:Number(row.created_at),updatedAt:Number(row.updated_at),revision:row.revision,deleted:row.deleted});
 return {
  async list(){
   const output=[];
   for(let offset=0;;offset+=500){
    const {data,error}=await table().select(fields).eq('user_id',userId).order('id').range(offset,offset+499);
    if(error)throw error;output.push(...data.map(decode));if(data.length<500)return output;
   }
  },
  async get(id){const {data,error}=await table().select(fields).eq('user_id',userId).eq('id',id).maybeSingle();if(error)throw error;return data?decode(data):null},
  async write(memo,base){
   const row={id:memo.id,user_id:userId,title:memo.title,text:memo.text,created_at:memo.createdAt,updated_at:memo.updatedAt,deleted:memo.deleted};
   const query=base===null?table().insert(row):table().update(row).eq('user_id',userId).eq('id',memo.id).eq('revision',base);
   const {data,error}=await query.select(fields).maybeSingle();
   if(error){if(error.code==='23505')return null;throw error}
   return data?decode(data):null;
  }
 };
}
