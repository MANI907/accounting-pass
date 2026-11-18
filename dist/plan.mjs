import {chapterFor} from './curriculum.mjs';

export const PLAN_KEY='accounting_study_plan_v1';
const DAY=86400000;
export function todayKey(now=Date.now()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const read=type=>parts.find(p=>p.type===type).value;return `${read('year')}-${read('month')}-${read('day')}`;
}
export function dateNumber(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('시작일과 종료일을 확인해 주세요.');
 const time=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)throw Error('올바른 날짜를 선택해 주세요.');
 return time;
}
export const addDays=(date,days)=>new Date(dateNumber(date)+days*DAY).toISOString().slice(0,10);
export const dayCount=(start,end)=>Math.round((dateNumber(end)-dateNumber(start))/DAY)+1;
export function validatePlan(value,{chapters,years}){
 if(value===null||value===undefined)return null;
 if(typeof value!=='object'||Array.isArray(value)||value.version!==1)throw Error('지원하지 않는 학습 계획입니다.');
 if(typeof value.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(value.id)||typeof value.title!=='string'||!value.title.trim()||value.title.length>80||typeof value.enabled!=='boolean')throw Error('계획 이름과 상태를 확인해 주세요.');
 const days=dayCount(value.startDate,value.endDate);if(days<1||days>366)throw Error('계획 기간은 1일부터 366일까지 설정할 수 있습니다.');
 if(!['custom','month'].includes(value.template))throw Error('계획 템플릿을 확인해 주세요.');
 for(const key of ['weekdayMinutes','weekendMinutes'])if(!Number.isInteger(value[key])||value[key]<0||value[key]>1440)throw Error('하루 공부 시간은 0~1,440분으로 입력해 주세요.');
 if(value.weekdayMinutes+value.weekendMinutes===0)throw Error('평일 또는 주말에 공부할 시간을 입력해 주세요.');
 for(const key of ['weekdayGoal','weekendGoal'])if(!Number.isInteger(value[key])||value[key]<1||value[key]>200)throw Error('새 문제 목표는 1~200문항으로 입력해 주세요.');
 const yearSet=new Set(years.map(String));
 if(value.primaryYear!==''&&!yearSet.has(value.primaryYear))throw Error('보유한 기출 연도를 선택해 주세요.');
 if(value.supplementYear!==''&&(!yearSet.has(value.supplementYear)||value.primaryYear===value.supplementYear||value.primaryYear===''))throw Error('보충 연도는 주 학습 연도와 다르게 선택해 주세요.');
 const known=new Set(chapters.map(c=>c.id));
 if(!Array.isArray(value.chapterIds)||!value.chapterIds.length||value.chapterIds.length>chapters.length||new Set(value.chapterIds).size!==value.chapterIds.length||value.chapterIds.some(id=>!known.has(id)))throw Error('공부할 단원을 한 개 이상 선택해 주세요.');
 const chapterIds=chapters.filter(c=>value.chapterIds.includes(c.id)).map(c=>c.id);
 return {version:1,id:value.id,title:value.title.trim(),enabled:value.enabled,template:value.template,startDate:value.startDate,endDate:value.endDate,weekdayMinutes:value.weekdayMinutes,weekendMinutes:value.weekendMinutes,weekdayGoal:value.weekdayGoal,weekendGoal:value.weekendGoal,primaryYear:value.primaryYear,supplementYear:value.supplementYear,chapterIds};
}
export function newPlan({chapters,years,date=todayKey(),template='custom',id=crypto.randomUUID()}){
 const ordered=[...years].sort((a,b)=>b-a),year=String(ordered[0]||'');
 return {version:1,id,title:template==='month'?'한 달 기출 학습':'나의 학습 계획',enabled:true,template,startDate:date,endDate:addDays(date,30),weekdayMinutes:120,weekendMinutes:240,weekdayGoal:18,weekendGoal:32,primaryYear:template==='month'?year:'',supplementYear:template==='month'&&ordered.length>1?String(ordered[1]):'',chapterIds:chapters.map(c=>c.id)};
}

const MONTH_WEEKS=[
 ['F1-1','F1-2','F2-1','F2-2','F2-3','T1-1','T1-2','T2-1','T2-2'],
 ['F2-4','F2-5','F2-6','F2-7','F2-8','T2-2','T3-1','T3-2'],
 ['F2-9','F2-10','F2-11','F3-1','F3-2','F3-3','F3-4','F4-1','T4-1','T5-1','T5-2','T5-3','T5-4','T5-5','T6-1','T6-2']
];
export function planTimeline(plan){
 const days=dayCount(plan.startDate,plan.endDate),monthly=plan.template==='month'&&days===31;
 const learnDays=monthly?21:Math.max(1,Math.ceil(days*.7));
 const weakDays=monthly?3:Math.min(days-learnDays,Math.max(1,Math.floor(days*.1)));
 const remaining=days-learnDays-weakDays,finalDays=remaining>0?1:0,roundDays=remaining-finalDays;
 const weekCount=Math.ceil(learnDays/7),timeline=[];
 const part=(offset,length,type,label,chapterIds)=>{if(length>0)timeline.push({start:addDays(plan.startDate,offset),end:addDays(plan.startDate,offset+length-1),type,label,chapterIds})};
 for(let week=0;week<weekCount;week++){
  let ids;
  if(monthly)ids=MONTH_WEEKS[week].filter(id=>plan.chapterIds.includes(id));
  else{
   ids=[];
   for(const prefix of ['F','T']){
    const selected=plan.chapterIds.filter(id=>id.startsWith(prefix)),size=Math.ceil(selected.length/weekCount);
    ids.push(...selected.slice(week*size,(week+1)*size));
   }
  }
  part(week*7,Math.min(7,learnDays-week*7),'learn',`${week+1}주차 · 목차별 기출`,ids.length?ids:plan.chapterIds);
 }
 part(learnDays,weakDays,'weak','취약 단원·밀린 단원 보완',plan.chapterIds);
 part(learnDays+weakDays,roundDays,'round','회차별 풀이와 오답 복습',plan.chapterIds);
 part(days-finalDays,finalDays,'final','핵심 메모·판단 기준 확인',plan.chapterIds);
 return timeline;
}
export function planScope(plan,questions,records,chapters,year=plan.primaryYear){
 return questions.filter(q=>!q.incomplete&&(!year||q.year===+year)&&plan.chapterIds.includes(chapterFor(q,records[q.id],chapters).id));
}
export function scopeProgress(questions,records){
 return {total:questions.length,attempted:questions.filter(q=>records[q.id]?.attempts).length,confident:questions.filter(q=>records[q.id]?.attempts&&records[q.id].correct&&records[q.id].confidence==='sure').length,weak:questions.filter(q=>records[q.id]?.attempts&&(!records[q.id].correct||records[q.id].confidence!=='sure')).length};
}
export function activityForDate(events,allowedIds,date){
 const list=[...events].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id)),seen=new Set(list.filter(e=>e.kind==='baseline').map(e=>e.questionId));
 const fresh=new Set(),reviewed=new Set(),attempted=new Set();
 for(const event of list){
  if(event.kind!=='attempt'||!allowedIds.has(event.questionId))continue;
  if(todayKey(event.at)===date){attempted.add(event.questionId);(seen.has(event.questionId)?reviewed:fresh).add(event.questionId);}
  seen.add(event.questionId);
 }
 return {fresh,reviewed,attempted};
}
export function dailyPlan(plan,questions,records,chapters,events=[],date=todayKey(),now=Date.now()){
 const scope=planScope(plan,questions,records,chapters),timeline=planTimeline(plan),phase=timeline.find(p=>p.start<=date&&p.end>=date)||null;
 const weekend=[0,6].includes(new Date(dateNumber(date)).getUTCDay()),budget=weekend?plan.weekendMinutes:plan.weekdayMinutes;
 const goal=weekend?plan.weekendGoal:plan.weekdayGoal;
 const activity=activityForDate(events,new Set(scope.map(q=>q.id)),date);
 const review=scope.filter(q=>records[q.id]?.attempts&&(!records[q.id].correct||records[q.id].confidence!=='sure'||records[q.id].dueAt<=now));
 const recommendations=[];
 const preferred=phase?.chapterIds||plan.chapterIds;
 for(const subject of ['재무회계','세무회계']){
  const unseen=scope.filter(q=>q.subject===subject&&!records[q.id]?.attempts);
  const ids=[...preferred,...plan.chapterIds.filter(id=>!preferred.includes(id))];
  const chapterId=ids.find(id=>unseen.some(q=>chapterFor(q,records[q.id],chapters).id===id));
  if(chapterId)recommendations.push({subject,chapterId,questionIds:unseen.filter(q=>chapterFor(q,records[q.id],chapters).id===chapterId).map(q=>q.id),done:[...activity.fresh].filter(id=>scope.find(q=>q.id===id)?.subject===subject).length});
 }
 const reviewMinutes=Math.min(budget,Math.round(budget*(budget>=240?.125:1/6)));
 const memoMinutes=Math.min(budget-reviewMinutes,Math.round(budget/12));
 const newMinutes=budget-reviewMinutes-memoMinutes;
 for(let index=0;index<recommendations.length;index++){
  recommendations[index].minutes=Math.floor(newMinutes/recommendations.length)+(index<newMinutes%recommendations.length?1:0);
  recommendations[index].goal=Math.floor(goal/recommendations.length)+(index<goal%recommendations.length?1:0);
 }
 // Complete 80-question sources only; selected chapters still constrain the queue.
 const sessions=new Map();for(const q of questions){const key=`${q.year}-${q.month}`;if(!sessions.has(key))sessions.set(key,[]);sessions.get(key).push(q);}
 const availableSessions=[...sessions.values()].filter(qs=>qs.length===80&&qs.every(q=>!q.incomplete)&&(!plan.primaryYear||qs[0].year===+plan.primaryYear))
  .sort((a,b)=>b[0].year-a[0].year||b[0].month-a[0].month)
  .map(qs=>({year:qs[0].year,month:qs[0].month,questionIds:qs.filter(q=>scope.some(item=>item.id===q.id)).map(q=>q.id)})).filter(s=>s.questionIds.length);
 const roundOffset=phase?.type==='round'?Math.round((dateNumber(date)-dateNumber(phase.start))/DAY):0;
 const session=availableSessions.length?availableSessions[Math.floor(roundOffset/2)%availableSessions.length]:null;
 return {date,phase,timeline,scope,progress:scopeProgress(scope,records),budget,goal,activity,review,recommendations,reviewMinutes,memoMinutes,session,reviewDay:phase?.type==='round'&&roundOffset%2===1};
}
