import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chapterFor,chapterStats,chapterQuestions,questionCounts,questionGroups} from '../dist/curriculum.mjs';
import {validateBackup} from '../dist/core.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../dist/'+name,import.meta.url)));
const chapters=read('curriculum.json'),questions=read('questions.json');
test('all questions have one valid same-subject chapter in the 32-unit textbook outline',()=>{
 assert.equal(chapters.length,32);
 assert.equal(chapters.filter(c=>c.subject==='재무회계').length,18);
 assert.equal(chapters.filter(c=>c.subject==='세무회계').length,14);
 assert.equal(new Set(chapters.map(c=>c.id)).size,32);
 assert.deepEqual(chapters.filter(c=>c.standalone).map(c=>c.id),['F4-1','T4-1']);
 for(const q of questions){const c=chapters.find(c=>c.id===q.chapterId);assert.ok(c,q.id);assert.equal(c.subject,q.subject,q.id)}
 const available=questions.filter(q=>!q.incomplete);
 assert.equal(chapters.reduce((n,c)=>n+available.filter(q=>q.chapterId===c.id).length,0),2393);
});
test('classification follows the task when incidental terms appear in data or choices',()=>{
 const expected={'2026-05-09':'F2-2','2026-07-10':'F2-2','2026-09-17':'F2-2','2024-09-21':'F2-5','2026-01-25':'F2-7','2026-06-73':'T5-3','2026-09-45':'T2-2','2023-12-57':'T3-1'};
 for(const [id,cid]of Object.entries(expected))assert.equal(questions.find(q=>q.id===id).chapterId,cid,id);
});
test('chapter overrides use existing backup format without mutating old labels, notes or attempts',()=>{
 const q=questions.find(q=>q.id==='2026-05-09');
 const legacy={topic:'나의 기존 분류',note:'풀이 노트',bookmarked:true};
 assert.equal(chapterFor(q,legacy,chapters).id,'F2-2');assert.equal(legacy.topic,'나의 기존 분류');
 const r={...legacy,topic:'curriculum:F3-3'};
 assert.equal(chapterFor(q,r,chapters).id,'F3-3');
 assert.equal(chapterFor(q,{topic:'curriculum:T2-2'},chapters).id,'F2-2');
 assert.equal(chapterFor(q,{topic:'curriculum:unknown'},chapters).id,'F2-2');
 assert.deepEqual(validateBackup({version:1,records:{[q.id]:r}},new Set([q.id])),{[q.id]:r});
});
test('mastery excludes incorrect or uncertain answers even if all questions were attempted',()=>{
 const qs=[{id:'a'},{id:'b'},{id:'c'},{id:'d'}];
 assert.deepEqual(chapterStats(qs,{a:{attempts:1,correct:true,confidence:'sure'},b:{attempts:2,correct:true,confidence:'guess'},c:{attempts:3,correct:false,confidence:'sure'}}),{total:4,attempted:3,confident:1,weak:2});
});

test('chapter browsing defaults to all four years and year filtering is optional',()=>{
 const all=chapterQuestions(questions,{},chapters,{subject:'재무회계',chapterId:'F2-2'});
 assert.deepEqual([...new Set(all.map(q=>q.year))],[2026,2025,2024,2023]);
 const selected=chapterQuestions(questions,{},chapters,{subject:'재무회계',chapterId:'F2-2',year:'2025'});
 assert.ok(selected.length>0&&selected.length<all.length);
 assert.ok(selected.every(q=>q.year===2025&&q.subject==='재무회계'&&q.chapterId==='F2-2'));
 assert.equal(chapterQuestions(questions,{},chapters,{subject:'재무회계'}).length,1200);
});
test('combined and year-grouped lists contain exactly the same source questions without duplicates',()=>{
 const all=chapterQuestions(questions,{},chapters,{subject:'세무회계',chapterId:'T2-2'});
 const combined=questionGroups(all),grouped=questionGroups(all,'year');
 assert.equal(combined.length,1);assert.equal(combined[0].year,null);
 assert.deepEqual(grouped.map(g=>g.year),[2026,2025,2024,2023]);
 assert.deepEqual(grouped.flatMap(g=>g.questions).map(q=>q.id),combined[0].questions.map(q=>q.id));
 assert.equal(new Set(grouped.flatMap(g=>g.questions).map(q=>q.id)).size,all.length);
 assert.deepEqual(questionGroups([],'year'),[]);
});
test('source counts keep all seven incomplete originals visible while separating playable counts',()=>{
 assert.deepEqual(questionCounts(questions),{owned:2400,available:2393,excluded:7});
 const tax2025=chapterQuestions(questions,{},chapters,{subject:'세무회계',year:'2025'});
 assert.deepEqual(questionCounts(tax2025),{owned:320,available:316,excluded:4});
 const allChapters=chapters.flatMap(c=>chapterQuestions(questions,{},chapters,{subject:c.subject,chapterId:c.id}));
 assert.equal(allChapters.length,2400);assert.equal(new Set(allChapters.map(q=>q.id)).size,2400);
 assert.equal(allChapters.filter(q=>q.incomplete).length,7);
});
test('browsing applies personal chapter choices without changing source data or legacy notes',()=>{
 const q=questions.find(q=>q.id==='2026-05-09');const record={topic:'curriculum:F3-3',note:'기존 노트',bookmarked:true};
 const original=JSON.stringify(q),copy={...record};
 assert.ok(chapterQuestions(questions,{[q.id]:record},chapters,{chapterId:'F3-3'}).some(item=>item.id===q.id));
 assert.ok(!chapterQuestions(questions,{[q.id]:record},chapters,{chapterId:'F2-2'}).some(item=>item.id===q.id));
 assert.equal(JSON.stringify(q),original);assert.deepEqual(record,copy);
});
