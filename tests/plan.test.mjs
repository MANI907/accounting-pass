import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newPlan,validatePlan,todayKey,addDays,dayCount,planTimeline,planScope,scopeProgress,activityForDate,dailyPlan} from '../dist/plan.mjs';
import {reduceStudyEvents} from '../dist/study-sync.mjs';
const questions=JSON.parse(readFileSync(new URL('../dist/questions.json',import.meta.url))),chapters=JSON.parse(readFileSync(new URL('../dist/curriculum.json',import.meta.url)));
const context={chapters,years:[2023,2024,2025,2026]},date='2026-11-18';
const make=(patch={})=>validatePlan({...newPlan({...context,date,id:'plan-test'}),...patch},context);
test('planning is opt-in; a custom plan defaults to all years and supports any selected duration',()=>{
 assert.equal(validatePlan(null,context),null);assert.equal(validatePlan(undefined,context),null);
 const p=make({endDate:'2026-12-01',weekdayMinutes:60,weekendMinutes:120});assert.equal(dayCount(p.startDate,p.endDate),14);assert.equal(p.primaryYear,'');assert.equal(p.supplementYear,'');
 const timeline=planTimeline(p),dates=timeline.flatMap(phase=>Array.from({length:dayCount(phase.start,phase.end)},(_,i)=>addDays(phase.start,i)));
 assert.equal(dates.length,14);assert.equal(new Set(dates).size,14);assert.equal(dates.at(-1),'2026-12-01');
});
test('the optional month template matches the given three-week, repair, session and final-day schedule',()=>{
 const p=make({...newPlan({...context,date,id:'month',template:'month'})}),timeline=planTimeline(p);
 assert.equal(p.primaryYear,'2026');assert.equal(p.supplementYear,'2025');assert.equal(p.endDate,'2026-12-18');
 assert.deepEqual(timeline.map(t=>[t.start,t.end]),[['2026-11-18','2026-11-24'],['2026-11-25','2026-12-01'],['2026-12-02','2026-12-08'],['2026-12-09','2026-12-11'],['2026-12-12','2026-12-17'],['2026-12-18','2026-12-18']]);
 assert.equal(new Set(timeline.slice(0,3).flatMap(t=>t.chapterIds)).size,32);
});
test('calendar days use Korea time and recommended blocks stay inside each chosen daily budget',()=>{
 assert.equal(todayKey(Date.parse('2026-11-17T15:00:00Z')),'2026-11-18');assert.equal(todayKey(Date.parse('2026-11-17T14:59:59Z')),'2026-11-17');
 const p=make({weekdayGoal:19}),weekday=dailyPlan(p,questions,{},chapters,[],date),weekend=dailyPlan(p,questions,{},chapters,[],'2026-11-21');
 assert.equal(weekday.budget,120);assert.equal(weekend.budget,240);
 for(const m of [weekday,weekend]){assert.equal(m.reviewMinutes+m.memoMinutes+m.recommendations.reduce((n,r)=>n+r.minutes,0),m.budget);assert.equal(m.recommendations.reduce((n,r)=>n+r.goal,0),m.goal);}
 const rest=dailyPlan(make({weekdayMinutes:0}),questions,{},chapters,[],date);assert.equal(rest.budget,0);
});
test('primary progress and optional supplementary questions stay separate and omit missing choices',()=>{
 const p=make({...newPlan({...context,date,id:'month',template:'month'})});
 assert.equal(planScope(p,questions,{},chapters).length,477);assert.equal(planScope(p,questions,{},chapters,p.supplementYear).length,636);
 assert.ok(planScope(p,questions,{},chapters).every(q=>q.year===2026&&!q.incomplete));
 const one=make({chapterIds:['F2-2'],primaryYear:'2025'});assert.ok(planScope(one,questions,{},chapters).every(q=>q.subject==='재무회계'&&q.year===2025&&q.chapterId==='F2-2'));
});
test('correct guesses remain weak; first attempts, repeat review and imported history are distinguished',()=>{
 const ids=['2026-09-72','2026-01-01'],at=Date.parse('2026-11-18T02:00:00Z');
 const events=[{id:'a',questionId:ids[0],kind:'attempt',payload:{answer:1,confidence:'guess'},at},{id:'b',questionId:ids[0],kind:'attempt',payload:{answer:1,confidence:'unsure'},at:at+1}];
 const answers=new Map(questions.map(q=>[q.id,q.answer])),snapshot=reduceStudyEvents(events,answers),activity=activityForDate(events,new Set(ids),date);
 assert.equal(activity.fresh.size,1);assert.equal(activity.reviewed.size,1);assert.equal(scopeProgress(questions.filter(q=>q.id===ids[0]),snapshot.records).weak,1);assert.equal(scopeProgress(questions.filter(q=>q.id===ids[0]),snapshot.records).confident,0);
 const imported=[{id:'old',questionId:ids[1],kind:'baseline',payload:{},at:at-10},{id:'new',questionId:ids[1],kind:'attempt',payload:{},at}];assert.equal(activityForDate(imported,new Set(ids),date).fresh.size,0);
});
test('round practice chooses intact exam sources and honors the plan chapter scope',()=>{
 const p=make({...newPlan({...context,date,id:'month',template:'month'})}),m=dailyPlan(p,questions,{},chapters,[],'2026-12-12');
 assert.equal(m.phase.type,'round');assert.equal(m.session.questionIds.length,80);assert.notEqual(m.session.month,9);assert.equal(m.reviewDay,false);
 assert.equal(dailyPlan(p,questions,{},chapters,[],'2026-12-13').reviewDay,true);
 const limited=make({...p,chapterIds:['F2-2']});assert.ok(dailyPlan(limited,questions,{},chapters,[],'2026-12-12').session.questionIds.every(id=>questions.find(q=>q.id===id).chapterId==='F2-2'));
});
test('invalid settings are rejected without silently enrolling a user or altering source data',()=>{
 const p=make(),before=JSON.stringify(questions[0]);
 for(const patch of [{title:''},{endDate:'2026-02-30'},{endDate:'2026-11-01'},{endDate:'2028-01-01'},{weekdayMinutes:0,weekendMinutes:0},{weekdayGoal:0},{primaryYear:'2099'},{primaryYear:'',supplementYear:'2025'},{chapterIds:[]},{chapterIds:['F1-1','F1-1']},{chapterIds:['admin']}])assert.throws(()=>validatePlan({...p,...patch},context));
 planTimeline(p);planScope(p,questions,{},chapters);assert.equal(JSON.stringify(questions[0]),before);
});
