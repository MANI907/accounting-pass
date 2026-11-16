import {grade,validateBackup} from './core.mjs';

const kinds=new Set(['attempt','bookmark','note','topic','position','baseline']);
const questionPattern=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[1-7]\d|80)$/;
export function cleanStudyEvent(event){
 if(!event||typeof event.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(event.id)||!questionPattern.test(event.questionId)||!kinds.has(event.kind)||!Number.isSafeInteger(event.at)||event.at<0||event.at>8640000000000000)throw Error('학습 기록 형식을 확인해 주세요.');
 const p=event.payload;let payload;
 if(!p||typeof p!=='object'||Array.isArray(p))throw Error('학습 내용 형식 오류');
 if(event.kind==='attempt'){
  if(!Number.isInteger(p.answer)||p.answer<1||p.answer>4||!['sure','unsure','guess'].includes(p.confidence))throw Error('풀이 기록 형식 오류');
  payload={answer:p.answer,confidence:p.confidence};
 }else if(event.kind==='bookmark'){
  if(typeof p.value!=='boolean')throw Error('북마크 형식 오류');payload={value:p.value};
 }else if(event.kind==='note'||event.kind==='topic'){
  if(typeof p.value!=='string'||p.value.length>20000)throw Error('풀이 노트 형식 오류');payload={value:p.value};
 }else if(event.kind==='baseline'){
  payload=validateBackup({version:1,records:{[event.questionId]:p}},new Set([event.questionId]))[event.questionId];
  if(!payload.answer)throw Error('가져온 풀이 기록 형식 오류');
 }else payload={};
 return {id:event.id,questionId:event.questionId,kind:event.kind,payload,at:event.at};
}

export function reduceStudyEvents(events,answers){
 const records=Object.create(null);let position='';
 for(const event of [...events].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))){
  const {questionId:id,kind,payload,at}=event;if(!answers.has(id))continue;
  if(kind==='position'){position=id;continue;}
  const previous=records[id]||{};
  if(kind==='attempt')records[id]=grade(previous,payload.answer,answers.get(id),payload.confidence,at);
  else if(kind==='baseline'){
   const {answer,confidence,attempts,lastAt,dueAt,streak}=payload;
   records[id]={...previous,answer,confidence,attempts,lastAt,dueAt,streak,correct:answer===answers.get(id)};
  }else records[id]={...previous,[kind==='bookmark'?'bookmarked':kind]:payload.value};
 }
 return {records,position};
}

// Immutable operations avoid losing attempts when two devices work offline.
export class StudySync {
 constructor({userId,adapter,storage,answers,onChange=()=>{},onStatus=()=>{},uuid=()=>crypto.randomUUID(),now=()=>Date.now()}){
  Object.assign(this,{userId,adapter,storage,answers,onChange,onStatus,uuid,now});
  this.key='accounting-pass-cloud-study-v1:'+userId;this.events=new Map();this.pending=new Map();this.inflight=new Set();this.dispatched=new Set();this.closed=false;this.running=null;this.timer=null;this.cacheError=false;this.loaded=false;this.clock=0;this.batching=false;
  try{
   const value=JSON.parse(storage.getItem(this.key)||'null');
   if(value?.userId===userId){
    for(const event of value.events||[]){const clean=cleanStudyEvent(event);this.events.set(clean.id,clean);this.clock=Math.max(this.clock,clean.at);}
    for(const id of value.pending||[])if(this.events.has(id))this.pending.set(id,this.events.get(id));
    for(const id of value.dispatched||[])if(this.pending.has(id))this.dispatched.add(id);
   }
  }catch{this.cacheError=true;this.events.clear();this.pending.clear();}
 }
 get snapshot(){return reduceStudyEvents(this.events.values(),this.answers)}
 get count(){return this.pending.size}
 status(){return this.cacheError?'cache-error':this.count?'pending':this.loaded?'saved':'loading'}
 persist(){
  try{this.storage.setItem(this.key,JSON.stringify({userId:this.userId,events:[...this.events.values()],pending:[...this.pending.keys()],dispatched:[...this.dispatched]}));this.cacheError=false;}
  catch{this.cacheError=true;}
 }
 notify(){if(!this.closed){this.onChange(this.snapshot);this.onStatus(this.status())}}
 enqueue(questionId,kind,payload){
  if(this.closed||!this.answers.has(questionId))throw Error('로그인과 문제 번호를 확인해 주세요.');
  // Replace unsent text/position edits; in-flight immutable events get new IDs.
  const coalesce=kind!=='attempt';
  const old=coalesce?[...this.pending.values()].find(e=>e.kind===kind&&(kind==='position'||e.questionId===questionId)&&!this.dispatched.has(e.id)):null;
  const event=cleanStudyEvent({id:old?.id||this.uuid(),questionId,kind,payload,at:Math.max(this.now(),this.clock+1)});
  this.clock=event.at;this.events.set(event.id,event);this.pending.set(event.id,event);
  if(!this.batching){this.persist();this.notify();this.schedule();}
 }
 attempt(id,answer,confidence){this.enqueue(id,'attempt',{answer,confidence})}
 field(id,kind,value){if(!['note','topic','bookmark'].includes(kind))throw Error('지원하지 않는 기록입니다.');this.enqueue(id,kind,{value})}
 position(id){if(id)this.enqueue(id,'position',{})}
 importRecords(value,{onlyMissing=true,position=''}={}){
  const clean=validateBackup({version:1,records:value},new Set(this.answers.keys()));
  const current=this.snapshot.records;let count=0;
  this.batching=true;
  try{for(const [id,record] of Object.entries(clean)){
   const previous=current[id]||{};let changed=false;
   if(record.answer&&(!onlyMissing||!previous.answer)){
    const {answer,confidence,attempts,lastAt,dueAt,streak}=record;
    this.enqueue(id,'baseline',{answer,confidence,attempts,lastAt,dueAt,streak,correct:answer===this.answers.get(id)});changed=true;
   }
   for(const kind of ['note','topic','bookmark']){
    const key=kind==='bookmark'?'bookmarked':kind;
    if(key in record&&(!onlyMissing||!(key in previous))){this.field(id,kind,record[key]);changed=true;}
   }
   if(changed)count++;
  }
  if(position&&this.answers.has(position)&&(!onlyMissing||!this.snapshot.position))this.position(position);
  }finally{this.batching=false;this.persist();this.notify();if(this.count)this.schedule();}
  return count;
 }
 schedule(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.sync(),800)}
 close(){this.closed=true;clearTimeout(this.timer)}
 async sync(){
  if(this.closed)return;if(this.running)return this.running;clearTimeout(this.timer);
  this.running=this.cycle().finally(()=>{this.running=null});return this.running;
 }
 async cycle(){
  this.onStatus('syncing');
  try{
   const batch=[...this.pending.values()].slice(0,100);
   if(batch.length){
    for(const e of batch){this.inflight.add(e.id);this.dispatched.add(e.id);}this.persist();
    try{await this.adapter.write(batch);}finally{for(const e of batch)this.inflight.delete(e.id);}
    if(this.closed)return;
    for(const e of batch){this.pending.delete(e.id);this.dispatched.delete(e.id);}
    this.persist();this.notify();
   }
   const rows=await this.adapter.list();if(this.closed)return;
   for(const row of rows){const e=cleanStudyEvent(row);if(!this.pending.has(e.id))this.events.set(e.id,e);this.clock=Math.max(this.clock,e.at);}
   this.loaded=true;this.persist();this.notify();if(this.count)this.schedule();
  }catch{if(!this.closed){this.persist();this.onStatus(this.cacheError?'cache-error':'offline');}}
 }
}

export function supabaseStudyAdapter(client,userId){
 return {
  async write(events){
   const rows=events.map(e=>({user_id:userId,id:e.id,question_id:e.questionId,kind:e.kind,payload:e.payload,happened_at:e.at}));
   const {error}=await client.from('study_events').upsert(rows,{onConflict:'user_id,id',ignoreDuplicates:true});if(error)throw error;
  },
  async list(){
   const output=[];let cursor='';
   for(;;){
    let query=client.from('study_events').select('id,question_id,kind,payload,happened_at').eq('user_id',userId).order('id').limit(500);
    if(cursor)query=query.gt('id',cursor);
    const {data,error}=await query;if(error)throw error;
    output.push(...data.map(r=>({id:r.id,questionId:r.question_id,kind:r.kind,payload:r.payload,at:Number(r.happened_at)})));
    if(data.length<500)return output;cursor=data.at(-1).id;
   }
  }
 };
}
