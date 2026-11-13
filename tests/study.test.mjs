import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {grade,due,validateBackup} from '../dist/core.mjs';
const questions=JSON.parse(readFileSync(new URL('../dist/questions.json',import.meta.url)));
const ids=new Set(questions.map(q=>q.id));
test('all six original answer sheets match all 480 imported questions',()=>{
 assert.equal(questions.length,480);assert.equal(ids.size,480);
 for(const month of [1,3,5,6,7,9]){
  const name=readdirSync(new URL('../sources/',import.meta.url)).find(s=>s.startsWith(`26년_${month}월_`));
  const raw=readFileSync(new URL('../sources/'+name,import.meta.url),'utf8');
  const expected=new Map();
  for(const match of raw.matchAll(/^\|\s*(\d+)\s*\|\s*([1-4])\s*\|\s*(\d+)\s*\|\s*([1-4])\s*\|\s*(\d+)\s*\|\s*([1-4])\s*\|\s*(\d+)\s*\|\s*([1-4])\s*\|$/gm))
   for(let i=1;i<=8;i+=2)expected.set(+match[i],+match[i+1]);
  assert.equal(expected.size,80);
  for(const q of questions.filter(q=>q.month===month)){
   assert.equal(q.answer,expected.get(q.number));assert.equal(q.subject,q.number<=40?'재무회계':'세무회계');
   assert.ok(q.html.length>0);assert.ok(q.options.length===0||q.options.length===4);
   assert.ok(!/<script|onerror\s*=|javascript:/i.test(q.html+q.options.join('')));
  }
 }
});
test('three incomplete originals are preserved but flagged; September 72 has verified answer',()=>{
 assert.deepEqual(questions.filter(q=>q.incomplete).map(q=>q.id).sort(),['2026-09-47','2026-09-50','2026-09-55']);
 assert.equal(questions.find(q=>q.id==='2026-09-72').answer,1);
 assert.equal(questions.filter(q=>!q.incomplete).length,477);
});
test('wrong and guessed answers enter next-day review, confident correct answers expand intervals',()=>{
 const now=1_800_000_000_000,day=86400000;
 let r=grade(undefined,3,1,'sure',now);assert.equal(r.correct,false);assert.equal(r.dueAt,now+day);
 assert.equal(due(r,now),false);assert.equal(due(r,now+day),true);
 r=grade(r,1,1,'sure',now);assert.equal(r.streak,1);assert.equal(r.attempts,2);
 r=grade(r,1,1,'sure',now);assert.equal(r.dueAt,now+3*day);
 r=grade(r,1,1,'guess',now);assert.equal(r.streak,0);assert.equal(r.dueAt,now+day);
 r=grade({...r,note:'my note',bookmarked:true},1,1,'unsure',now);assert.equal(r.note,'my note');assert.equal(r.bookmarked,true);
});
test('backups round-trip and reject invalid answers, IDs, timestamps and oversized notes',()=>{
 const r=grade({note:'영세율 복습',topic:'나의 분류',bookmarked:true},1,1,'sure',100);
 const data={version:1,records:{'2026-09-72':r}};
 assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(data)),ids),data.records);
 for(const change of [{answer:9},{confidence:'invalid'},{dueAt:'tomorrow'},{note:'x'.repeat(20001)}])assert.throws(()=>validateBackup({version:1,records:{'2026-09-72':{...r,...change}}},ids));
 assert.throws(()=>validateBackup({version:1,records:{unknown:r}},ids));
 assert.throws(()=>validateBackup({version:2,records:{}},ids));
});
