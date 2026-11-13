import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {MemoSync} from '../dist/memo-sync.mjs';

const memo=(text='영세율은 공제·환급 가능',id='vat')=>({id,title:'부가가치세',text,createdAt:100,updatedAt:200});
function memory(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),data}}
function service(){
 const rows=new Map();let offline=false,delay=null;
 return {rows,setOffline:value=>offline=value,setDelay:value=>delay=value,adapter:{
  async list(){if(offline)throw Error('offline');return structuredClone([...rows.values()])},
  async get(id){if(offline)throw Error('offline');return structuredClone(rows.get(id)||null)},
  async write(value,base){
   if(offline)throw Error('offline');if(delay)await delay();
   const current=rows.get(value.id);
   if((base===null&&current)||(base!==null&&current?.revision!==base))return null;
   const row={...value,revision:(current?.revision||0)+1};rows.set(value.id,row);return structuredClone(row);
  }
 }};
}
function make(service,storage=memory(),userId='user-a',extra={}){
 return new MemoSync({userId,adapter:service.adapter,storage,uuid:randomUUID,...extra});
}
test('cloud memos reload on a fresh device and deleted memos do not return',async()=>{
 const server=service(),a=make(server);a.put(memo());await a.sync();assert.equal(a.count,0);
 const b=make(server);await b.sync();assert.equal(b.memos[0].text,memo().text);
 b.remove('vat');await b.sync();await a.sync();assert.equal(a.memos.length,0);
 assert.equal(server.rows.get('vat').deleted,true);a.close();b.close();
});
test('offline edits survive reload and reconnect; account caches remain separate',async()=>{
 const server=service(),storage=memory();server.setOffline(true);
 const a=make(server,storage);a.put(memo('오프라인 메모'));await a.sync();a.close();
 const b=make(server,storage,'user-b');assert.equal(b.memos.length,0);assert.equal(b.count,0);b.close();
 const restored=make(server,storage);assert.equal(restored.count,1);assert.equal(restored.memos[0].text,'오프라인 메모');
 server.setOffline(false);await restored.sync();assert.equal(restored.count,0);assert.equal(server.rows.get('vat').text,'오프라인 메모');restored.close();
});
test('simultaneous edits preserve both device contents as a conflict copy',async()=>{
 const server=service(),a=make(server),b=make(server);a.put(memo('처음'));await a.sync();await b.sync();
 a.put({...memo('기기 A'),updatedAt:300});await a.sync();
 b.put({...memo('기기 B'),updatedAt:400});await b.sync();await b.sync();
 assert.deepEqual([...server.rows.values()].map(r=>r.text).sort(),['기기 A','기기 B']);
 assert.equal(b.memos.length,2);a.close();b.close();
});
test('a stale deletion preserves a newer edit from another device',async()=>{
 const server=service(),a=make(server),b=make(server);a.put(memo());await a.sync();await b.sync();
 a.put({...memo('다른 기기의 최신 내용'),updatedAt:400});await a.sync();b.remove('vat');await b.sync();
 assert.equal(b.memos[0].text,'다른 기기의 최신 내용');assert.equal(server.rows.get('vat').deleted,false);a.close();b.close();
});
test('typing while a write is in flight queues the newer content',async()=>{
 const server=service(),a=make(server);let release;
 server.setDelay(()=>new Promise(resolve=>{release=resolve}));a.put(memo('첫 입력'));const first=a.sync();
 a.put({...memo('요청 중 추가 입력'),updatedAt:300});release();await first;server.setDelay(null);
 assert.equal(a.memos[0].text,'요청 중 추가 입력');assert.equal(a.count,1);
 await a.sync();assert.equal(server.rows.get('vat').text,'요청 중 추가 입력');assert.equal(a.count,0);a.close();
});
test('a retry after a lost successful response does not create duplicate notes',async()=>{
 const server=service(),a=make(server);a.put(memo());server.rows.set('vat',{...memo(),revision:1,deleted:false});
 await a.sync();assert.equal(a.count,0);assert.equal(server.rows.size,1);a.close();
});
test('logout during a request prevents late responses from changing the visible account',async()=>{
 const server=service();let release,changes=0;
 const a=make(server,memory(),'user-a',{onChange:()=>changes++});server.setDelay(()=>new Promise(resolve=>{release=resolve}));
 a.put(memo());const request=a.sync(),before=changes;a.close();release();await request;assert.equal(changes,before);
});
test('backup IDs matching object prototype names remain ordinary memo IDs',async()=>{
 const server=service(),a=make(server);a.put(memo('안전한 메모','__proto__'));await a.sync();
 assert.equal(a.memos[0].id,'__proto__');assert.equal(a.memos[0].text,'안전한 메모');a.close();
});
