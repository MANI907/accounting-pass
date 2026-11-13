import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {grade,due,validateBackup,validateMemos,readBackup,mergeMemos} from '../dist/core.mjs';
const questions=JSON.parse(readFileSync(new URL('../dist/questions.json',import.meta.url)));
const ids=new Set(questions.map(q=>q.id));
test('every source question has an individual explanation tied to its exact source and official answer',()=>{
 const bank=JSON.parse(readFileSync(new URL('../content/explanations.json',import.meta.url)));
 assert.equal(Object.keys(bank).length,480);
 for(const q of questions.filter(q=>q.year===2026)){
  const entry=bank[q.id];
  assert.equal(entry.answer,q.answer);
  assert.equal(entry.sourceHash,createHash('sha256').update(q.raw).digest('hex'));
  assert.equal(q.explanation,entry.text);
  assert.ok(q.explanation.length>=40);
  assert.notEqual(q.explanation,q.note);
  assert.equal(q.explanationOrigin,'학습용 자체 해설');
  assert.equal(q.explanationStatus,q.incomplete?'source_incomplete':'authored');
 }
 assert.equal(questions.filter(q=>q.year===2026&&!q.incomplete&&q.explanation).length,477);
});
test('calculation explanations include the result for each exam session',()=>{
 const results=[['2026-01-10',9500000*.04-(200000-120000)],['2026-03-21',(5000000-500000)/3*6/12],['2026-05-14',30000*(60000/100000)],['2026-06-36',10000000/50000000*100],['2026-07-74',730000000*.031*92/365+3000000],['2026-09-77',(44000000+3300000)*10/110]];
 for(const[id,value] of results){assert.ok(questions.find(q=>q.id===id).explanation.includes(Math.round(value).toLocaleString('en-US')),id)}
});
test('all six original answer sheets match all 480 imported questions',()=>{
 assert.equal(questions.filter(q=>q.year===2026).length,480);assert.equal(ids.size,questions.length);
 for(const month of [1,3,5,6,7,9]){
  const name=readdirSync(new URL('../sources/',import.meta.url)).find(s=>s.startsWith(`26년_${month}월_`));
  const raw=readFileSync(new URL('../sources/'+name,import.meta.url),'utf8');
  const expected=new Map();
  for(const match of raw.matchAll(/^\|\s*(\d+)\s*\|\s*([1-4])\s*\|\s*(\d+)\s*\|\s*([1-4])\s*\|\s*(\d+)\s*\|\s*([1-4])\s*\|\s*(\d+)\s*\|\s*([1-4])\s*\|$/gm))
   for(let i=1;i<=8;i+=2)expected.set(+match[i],+match[i+1]);
  assert.equal(expected.size,80);
  for(const q of questions.filter(q=>q.year===2026&&q.month===month)){
   assert.equal(q.answer,expected.get(q.number));assert.equal(q.subject,q.number<=40?'재무회계':'세무회계');
   assert.ok(q.html.length>0);assert.ok(q.options.length===0||q.options.length===4);
   assert.ok(!/<script|onerror\s*=|javascript:/i.test(q.html+q.options.join('')));
  }
 }
});
test('three incomplete originals are preserved but flagged; September 72 has verified answer',()=>{
 assert.deepEqual(questions.filter(q=>q.year===2026&&q.incomplete).map(q=>q.id).sort(),['2026-09-47','2026-09-50','2026-09-55']);
 assert.equal(questions.find(q=>q.id==='2026-09-72').answer,1);
 assert.equal(questions.filter(q=>q.year===2026&&!q.incomplete).length,477);
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
 assert.throws(()=>validateBackup({version:3,records:{}},ids));
});

const memoFixture={id:'memo-1',title:'부가가치세',text:'영세율: 매입세액 공제·환급 가능',createdAt:100,updatedAt:200};
test('v2 backups preserve standalone memos; v1 imports leave current memos untouched',()=>{
 const current={version:2,records:{},memos:[memoFixture]};
 assert.deepEqual(readBackup(JSON.parse(JSON.stringify(current)),ids),{records:{},memos:[memoFixture]});
 assert.equal(readBackup({version:1,records:{}},ids).memos,null);
 assert.throws(()=>readBackup({version:2,records:{}},ids));
});
test('merging notebook backups adds distinct memos and never overwrites newer local text',()=>{
 const newer={...memoFixture,text:'수정한 내용',updatedAt:300};
 const other={...memoFixture,id:'memo-2',title:'소득세'};
 const merged=mergeMemos([newer],[memoFixture,other]);
 assert.equal(merged.length,2);assert.equal(merged.find(m=>m.id==='memo-1').text,'수정한 내용');
 assert.equal(mergeMemos([memoFixture],[newer])[0].text,'수정한 내용');
 assert.equal(mergeMemos([memoFixture],[memoFixture]).length,1);
});
test('notebook import rejects duplicate IDs, invalid timestamps and oversized content without mutating original data',()=>{
 assert.throws(()=>validateMemos([memoFixture,memoFixture]));
 for(const patch of [{id:'<script>'},{updatedAt:50},{updatedAt:Infinity},{title:'x'.repeat(121)},{text:'x'.repeat(20001)}])assert.throws(()=>validateMemos([{...memoFixture,...patch}]));
 assert.throws(()=>validateMemos({}));
 const result=validateMemos([memoFixture]);result[0].text='changed';assert.notEqual(result[0].text,memoFixture.text);
 assert.equal(validateMemos([{...memoFixture,text:'<script>alert(1)</script>'}])[0].text,'<script>alert(1)</script>');
});

test('all thirty sessions retain 80 unique original question IDs and their original-year labels',()=>{
 assert.equal(questions.length,2400);assert.equal(ids.size,2400);
 const report=JSON.parse(readFileSync(new URL('../dist/import-report.json',import.meta.url)));
 assert.equal(report.sessions.length,30);assert.equal(report.available,2393);
 for(const year of [2023,2024,2025,2026]){
  const subset=questions.filter(q=>q.year===year);assert.equal(subset.length,year===2026?480:640);
  for(const month of new Set(subset.map(q=>q.month))){const session=subset.filter(q=>q.month===month);assert.deepEqual(session.map(q=>q.number),Array.from({length:80},(_,i)=>i+1));assert.equal(session[0].id,`${year}-${String(month).padStart(2,'0')}-01`)}
 }
 assert.equal(questions.filter(q=>q.incomplete).length,7);
});
test('all 2400 official answers match independently extracted HTML, Markdown and text answer sheets',()=>{
 for(const file of new Set(questions.map(q=>q.answerSource))){
  const raw=readFileSync(new URL('../sources/'+file,import.meta.url),'utf8').replaceAll('[','').replaceAll(']','');
  let rows=[];
  if(raw.includes('<tr')){
   for(const row of raw.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)){
    const cells=[...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(m=>m[1].replace(/<[^>]*>/g,'').trim());
    if(cells.length===8&&cells.every(c=>/^\d+$/.test(c)))rows.push(cells.map(Number));
   }
  }else{
   for(const line of raw.split('\n')){const cells=line.trim().replace(/^\||\|$/g,'').split('|').map(s=>s.trim());if(cells.length===8&&cells.every(s=>/^\d+$/.test(s)))rows.push(cells.map(Number));}
   if(!rows.length){
    const after=raw.split('재무회계')[1];assert.ok(after,file);
    for(const part of after.split('세무회계')){const numbers=(part.replace(/\b[12]\)\s*/g,'').match(/\b\d+\b/g)||[]).map(Number);assert.equal(numbers.length,80,file);for(let i=0;i<80;i+=8)rows.push(numbers.slice(i,i+8));}
   }
  }
  assert.equal(rows.length,20,file);const expected=new Map();
  rows.forEach((row,index)=>{for(let i=0;i<8;i+=2){const n=row[i]+(index>=10&&Math.max(...row.filter((_,j)=>j%2===0))<=40?40:0);assert.ok(!expected.has(n));expected.set(n,row[i+1]);}});
  const session=questions.filter(q=>q.answerSource===file);assert.equal(session.length,80,file);
  for(const q of session)assert.equal(q.answer,expected.get(q.number),q.id);
 }
});
test('new questions without reviewed explanations remain explicitly pending',()=>{
 for(const q of questions.filter(q=>q.year<2026)){
  if(!q.explanation){assert.equal(q.explanationStatus,'pending');continue;}
  assert.equal(q.explanationStatus,'matched');assert.equal(q.subject,'재무회계');assert.ok(ids.has(q.explanationSourceId));
 }
});
