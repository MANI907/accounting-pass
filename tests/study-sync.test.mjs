import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {StudySync,cleanStudyEvent} from '../dist/study-sync.mjs';
import {grade} from '../dist/core.mjs';

const id='2026-09-72',other='2023-01-01',answers=new Map([[id,1],[other,3]]);
function memory(){const rows=new Map();return {getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v),rows}}
function service(){
 const rows=new Map();let offline=false,delay=null,loseResponse=false;
 return {rows,offline:v=>offline=v,delay:v=>delay=v,loseResponse:()=>loseResponse=true,adapter:{
  async list(){if(offline)throw Error('offline');return structuredClone([...rows.values()])},
  async write(events){
   if(offline)throw Error('offline');if(delay)await delay();
   for(const e of events)if(!rows.has(e.id))rows.set(e.id,structuredClone(e));
   if(loseResponse){loseResponse=false;throw Error('response lost')}
  }
 }};
}
function make(server,storage=memory(),userId='A',extra={}){let clock=100000;return new StudySync({userId,storage,adapter:server.adapter,answers,uuid:randomUUID,now:()=>++clock,...extra})}
test('attempts, bookmarks, notes, custom topics and resume position survive a fresh device',async()=>{
 const server=service(),a=make(server);a.attempt(id,3,'unsure');a.field(id,'bookmark',true);a.field(id,'note','영세율은 공제 가능');a.field(id,'topic','부가세');a.position(id);await a.sync();
 const b=make(server);await b.sync();const r=b.snapshot.records[id];assert.equal(r.correct,false);assert.equal(r.attempts,1);assert.equal(r.bookmarked,true);assert.equal(r.note,'영세율은 공제 가능');assert.equal(r.topic,'부가세');assert.equal(b.snapshot.position,id);a.close();b.close();
});
test('two devices solving the same question retain both attempts and independent fields',async()=>{
 const server=service(),a=make(server),b=make(server);a.attempt(id,1,'sure');b.attempt(id,3,'guess');a.field(id,'bookmark',true);b.field(id,'note','다른 기기 풀이');
 await a.sync();await b.sync();await a.sync();for(const client of [a,b]){assert.equal(client.snapshot.records[id].attempts,2);assert.equal(client.snapshot.records[id].bookmarked,true);assert.equal(client.snapshot.records[id].note,'다른 기기 풀이');client.close();}
});
test('offline edits reload under their account and reconnect without affecting another account',async()=>{
 const server=service(),storage=memory();server.offline(true);const a=make(server,storage);a.attempt(id,1,'sure');a.field(id,'note','오프라인');await a.sync();a.close();
 const otherAccount=make(server,storage,'B');assert.equal(Object.keys(otherAccount.snapshot.records).length,0);otherAccount.close();
 const restored=make(server,storage);assert.equal(restored.count,2);server.offline(false);await restored.sync();assert.equal(restored.count,0);assert.equal(restored.snapshot.records[id].note,'오프라인');restored.close();
});
test('repeated browser migration is idempotent and preserves newer account records',async()=>{
 const server=service(),a=make(server),old=grade({note:'기존 노트',bookmarked:true},3,1,'guess',100);
 assert.equal(a.importRecords({[id]:old},{position:id}),1);assert.equal(a.importRecords({[id]:old},{position:id}),0);
 a.attempt(id,1,'sure');a.field(id,'note','새 계정 노트');a.importRecords({[id]:old});assert.equal(a.snapshot.records[id].attempts,2);assert.equal(a.snapshot.records[id].note,'새 계정 노트');assert.equal(a.snapshot.records[id].correct,true);await a.sync();a.close();
});
test('explicit backup restore replaces requested fields and keeps unrelated account data',async()=>{
 const server=service(),a=make(server);a.attempt(id,1,'sure');a.field(other,'bookmark',true);a.importRecords({[id]:grade({note:'백업 노트'},3,1,'unsure',50)},{onlyMissing:false});
 assert.equal(a.snapshot.records[id].correct,false);assert.equal(a.snapshot.records[id].note,'백업 노트');assert.equal(a.snapshot.records[other].bookmarked,true);a.close();
});
test('typing during a request keeps the newer edit and does not double count attempts',async()=>{
 const server=service(),a=make(server);let release;server.delay(()=>new Promise(resolve=>release=resolve));a.field(id,'note','첫 내용');const request=a.sync();a.field(id,'note','요청 중 편집');release();await request;server.delay(null);await a.sync();assert.equal(a.snapshot.records[id].note,'요청 중 편집');assert.equal(a.count,0);a.close();
});
test('lost-response retry followed by more typing preserves immutable event IDs and latest text',async()=>{
 const server=service(),storage=memory(),a=make(server,storage);a.field(id,'note','먼저 서버에 도착한 내용');server.loseResponse();await a.sync();a.close();
 const restored=make(server,storage);restored.field(id,'note','응답 유실 후 추가 편집');assert.equal(restored.count,2);await restored.sync();assert.equal(restored.snapshot.records[id].note,'응답 유실 후 추가 편집');assert.equal(server.rows.size,2);restored.close();
});
test('logout ignores in-flight responses and subsequent callbacks',async()=>{
 const server=service();let release,calls=0;const a=make(server,memory(),'A',{onChange:()=>calls++});server.delay(()=>new Promise(resolve=>release=resolve));a.attempt(id,1,'sure');const request=a.sync(),before=calls;a.close();release();await request;assert.equal(calls,before);
});
test('invalid study operations are rejected before storage or network writes',()=>{
 const base={id:'event',questionId:id,kind:'attempt',payload:{answer:1,confidence:'sure'},at:100};
 for(const patch of [{questionId:'../../x'},{kind:'admin'},{at:Infinity},{payload:{answer:9,confidence:'sure'}}])assert.throws(()=>cleanStudyEvent({...base,...patch}));
 const server=service(),a=make(server);assert.throws(()=>a.attempt('unknown',1,'sure'));assert.equal(a.count,0);a.close();
});
