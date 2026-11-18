import {newPlan,validatePlan,planTimeline,planScope,scopeProgress,dailyPlan,todayKey,dayCount,addDays} from './plan.mjs';
import {chapterFor,chapterLabel} from './curriculum.mjs';

export function createPlanUI({main,getState,navigate,startStudy,toast,now=()=>Date.now()}){
 let editing=false,draft=null,busy=false,error='',epoch=0;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const state=()=>getState(),context=()=>({chapters:state().chapters,years:[...new Set(state().questions.map(q=>q.year))]});
 const plan=()=>state().account?.planner?.value||null;
 const model=()=>dailyPlan(plan(),state().questions,state().records,state().chapters,state().events,todayKey(now()),now());
 const dateLabel=date=>date.replaceAll('-','.');
 const chapterName=id=>{const c=state().chapters.find(c=>c.id===id);return c?chapterLabel(c):id};
 function task(title,detail,minutes,action,done=false,disabled=false){
  return `<div class="plan-task"><div><strong>${done?'<span class="plan-check" aria-label="완료">✓</span> ':''}${esc(title)}</strong><p>${esc(detail)}</p></div><span class="plan-minutes">${minutes?minutes+'분 권장':''}</span><button class="secondary" data-plan-action="${action}" ${disabled?'disabled':''}>${action==='memo'?'메모장 열기':done?'더 공부하기':'시작'}</button></div>`;
 }
 function todayHTML(compact=false){
  const p=plan(),s=state(),m=model(),ready=s.account?.study?.loaded||s.account?.study?.events?.size>0;
  if(!p.enabled)return '<p class="muted">계획을 일시정지했습니다. 자유롭게 기출을 풀고, 필요할 때 다시 시작하세요.</p>';
  if(m.date<p.startDate)return `<p class="muted">${dateLabel(p.startDate)}부터 시작합니다. 그전에도 자유롭게 공부할 수 있습니다.</p>`;
  if(m.date>p.endDate)return '<p class="muted">계획 기간이 끝났습니다. 기록을 확인하거나 기간을 수정할 수 있습니다.</p>';
  if(!m.budget)return '<p class="muted">오늘은 계획상 공부 시간을 배정하지 않은 날입니다. 자유 학습은 계속 이용할 수 있습니다.</p>';
  if(!ready)return '<p class="muted" role="status">계정의 학습 기록을 불러오고 있습니다.</p>';
  const events=m.activity,rows=[],memoDone=s.memos.some(item=>todayKey(item.updatedAt)===m.date);
  const reviewTarget=Math.min(m.review.length,Math.max(1,Math.round(m.reviewMinutes/4)));
  if(m.phase?.type==='final')rows.push(task('핵심 메모 확인','자주 틀린 계산식·분개·판단 기준을 가볍게 확인하세요.',Math.min(30,m.budget),'memo',memoDone));
  else{
   rows.push(task('오답·불확실한 문제 복습',`오늘 복습 ${events.reviewed.size}문항 · 남은 복습 대상 ${m.review.length}문항`,m.reviewMinutes,'review',!m.review.length||events.reviewed.size>=reviewTarget,!m.review.length));
   if(m.phase?.type==='round'&&!m.reviewDay){
    const session=m.session;rows.push(task('회차별 연습',session?`${session.year}년 ${session.month}월 · 계획 범위 ${session.questionIds.length}문항 · 문제마다 채점합니다.`:'선택 범위에 온전한 회차가 없습니다. 단원별 복습을 이용하세요.',Math.max(0,m.budget-m.reviewMinutes-m.memoMinutes),'session',session?.questionIds.every(id=>events.attempted.has(id)),!session));
   }else if(m.phase?.type!=='round'){
    for(const rec of m.recommendations.filter(item=>item.goal>0))rows.push(task(`${rec.subject} · ${m.phase?.type==='weak'?'밀린 단원 보완':'새 문제'}`,`${chapterName(rec.chapterId)} · 오늘 ${rec.done}/${rec.goal}문항 · 이 단원 미학습 ${rec.questionIds.length}문항`,rec.minutes,rec.subject==='재무회계'?'financial':'tax',rec.done>=rec.goal));
    if(!m.recommendations.length)rows.push(`<p class="plan-complete">${m.scope.length?'선택 범위의 모든 문항을 한 번 이상 풀었습니다. 설명이 어려운 문제는 복습으로 이어가세요.':'선택한 단원·연도에 풀이 가능한 문항이 없습니다. 계획 범위를 수정해 주세요.'}</p>`);
   }
   rows.push(task('핵심 메모',memoDone?'오늘 작성하거나 수정한 메모가 있습니다.':'헷갈린 기준이나 계산식을 한 줄로 정리하세요.',m.memoMinutes,'memo',memoDone));
  }
  return `<p class="plan-today-context">${dateLabel(m.date)} · ${esc(m.phase?.label||'계획 학습')} · 오늘 최대 ${m.budget}분</p><div class="plan-tasks">${rows.join('')}</div>${compact?'':`<p class="small muted">시간과 문항 수는 권장량입니다. 맞혔어도 혼자 설명하기 어렵다면 ‘헷갈려요’ 또는 ‘찍었어요’로 남겨 주세요. 남은 단원은 아래 주간 일정에서 확인할 수 있습니다.</p>`}`;
 }
 function homeWidget(){
  const p=plan();
  if(!p)return `<section class="home-plan optional-plan" id="home-plan"><div><h2>내 학습 계획</h2><p>필요할 때 기간과 공부량을 정해 보세요. 계획 없이 자유롭게 공부해도 됩니다.</p></div><button class="secondary" data-plan-action="create">계획 만들기</button></section>`;
  return `<section class="home-plan" id="home-plan"><div class="section-heading"><div><h2>${p.enabled?'오늘의 학습':'내 학습 계획 · 일시정지'}</h2><p class="small muted">${esc(p.title)} · ${dateLabel(p.startDate)}~${dateLabel(p.endDate)}</p></div><button class="text-btn" data-view="plan">계획 보기</button></div>${todayHTML(true)}</section>`;
 }
 function yearOptions(selected,allLabel='전체 연도'){
  return `<option value="" ${selected===''?'selected':''}>${allLabel}</option>${[...context().years].sort((a,b)=>b-a).map(y=>`<option value="${y}" ${selected===String(y)?'selected':''}>${y}년</option>`).join('')}`;
 }
 function editPage(){
  if(!draft)draft=newPlan({...context(),date:todayKey(now())});
  const d=draft;
  const field=(name,label,type='number',min=0,max=1440)=>`<label>${label}<input name="${name}" type="${type}" value="${esc(d[name])}" ${type==='number'?`min="${min}" max="${max}" step="1"`:''} required></label>`;
  main.innerHTML=`<div class="page-heading"><div><h1>${plan()?'학습 계획 수정':'내 학습 계획 만들기'}</h1><p class="subtitle">기간과 공부량은 직접 정합니다. 한 달 예시는 원하는 경우에만 적용하세요.</p></div><button class="text-btn" data-plan-action="cancel">취소</button></div><form id="plan-form" class="plan-form"><div class="plan-template"><button type="button" class="secondary" data-plan-action="template-month">한 달 학습 예시 적용</button><span class="small muted">목차별 기출 3주 → 취약 단원 → 회차별 연습</span></div><label>계획 이름<input name="title" value="${esc(d.title)}" maxlength="80" required></label><div class="plan-form-grid">${field('startDate','시작일','date')}${field('endDate','종료일','date')}${field('weekdayMinutes','평일 하루 가능 시간 (분)')}${field('weekendMinutes','주말 하루 가능 시간 (분)')}${field('weekdayGoal','평일 새 문제 목표 (문항)','number',1,200)}${field('weekendGoal','주말 새 문제 목표 (문항)','number',1,200)}<label>주 학습 연도<select name="primaryYear">${yearOptions(d.primaryYear)}</select></label><label>취약 단원 보충 연도<select name="supplementYear" ${!d.primaryYear?'disabled':''}>${yearOptions(d.supplementYear,'보충 문제 사용 안 함')}</select></label></div><p class="small muted">공부 시간이 0분인 날은 휴식일로 표시합니다. 보충 연도는 주 학습 연도를 고른 경우 선택할 수 있습니다.</p><fieldset class="plan-chapters"><legend>공부할 단원</legend><div class="plan-scope-actions"><button type="button" class="text-btn" data-plan-action="select-all">전체 선택</button><button type="button" class="text-btn" data-plan-action="select-none">전체 해제</button></div>${['재무회계','세무회계'].map(subject=>`<div class="plan-chapter-subject"><h2>${subject}</h2><div class="plan-chapter-options">${context().chapters.filter(c=>c.subject===subject).map(c=>`<label><input type="checkbox" name="chapter" value="${c.id}" ${d.chapterIds.includes(c.id)?'checked':''}><span>${c.part}편 · ${esc(chapterLabel(c))}</span></label>`).join('')}</div></div>`).join('')}</fieldset><label class="plan-enabled"><input type="checkbox" name="enabled" ${d.enabled?'checked':''}>홈에 오늘의 학습 표시</label><p id="plan-form-status" role="alert">${esc(error)}</p><button class="primary" type="submit" ${busy?'disabled':''}>${busy?'계정에 저장 중…':'계정에 계획 저장'}</button></form>`;
 }
 function page(){
  if(editing){const form=main.querySelector('#plan-form');if(form&&!busy)draft=readForm(form);editPage();return;}
  const p=plan(),s=state();
  if(!p){main.innerHTML=`<div class="page-heading"><div><h1>내 학습 계획</h1><p class="subtitle">목차별 자유 학습을 계속하거나, 원하는 기간의 계획을 만들어 보세요.</p></div></div><section class="plan-empty"><h2>나에게 필요한 경우에만 계획을 만듭니다.</h2><p>기간, 하루 공부 시간과 단원을 직접 고를 수 있습니다. 계획을 만들지 않아도 기출 풀이와 기록 관리는 그대로 이용할 수 있습니다.</p><button class="primary" data-plan-action="create">계획 만들기</button></section>${s.account?.planner?.error?`<p class="notice">${esc(s.account.planner.error)}</p>`:''}`;return;}
  const m=model(),scope=m.scope,records=s.records;
  const units=p.chapterIds.map(id=>{const questions=scope.filter(q=>chapterFor(q,records[q.id],s.chapters).id===id);return {id,questions,...scopeProgress(questions,records)}});
  const timeline=planTimeline(p);
  main.innerHTML=`<div class="page-heading"><div><h1>${esc(p.title)}</h1><p class="subtitle">${dateLabel(p.startDate)}~${dateLabel(p.endDate)} · ${p.primaryYear?p.primaryYear+'년':'전체 연도'} · ${p.enabled?'계획 사용 중':'일시정지'}</p></div><div class="heading-action"><button class="secondary" data-plan-action="edit" ${busy?'disabled':''}>계획 수정</button><button class="text-btn" data-plan-action="toggle" ${busy?'disabled':''}>${p.enabled?'일시정지':'다시 시작'}</button><button class="text-btn" data-plan-action="delete" ${busy?'disabled':''}>계획 삭제</button></div></div><dl class="summary-strip"><div class="summary-item"><dt>풀어본 문항</dt><dd>${m.progress.attempted}<span>/ ${m.progress.total}</span></dd></div><div class="summary-item"><dt>확실한 정답</dt><dd>${m.progress.confident}<span>문항</span></dd></div><div class="summary-item"><dt>오답·불확실</dt><dd>${m.progress.weak}<span>문항</span></dd></div></dl><section class="plan-today"><h2>오늘의 학습</h2>${todayHTML()}</section><section class="plan-timeline"><h2>주간 일정과 단원 진도</h2>${timeline.map(phase=>`<section class="plan-phase ${phase.start<=m.date&&phase.end>=m.date?'current':''}"><div class="section-heading"><h3>${esc(phase.label)}</h3><span class="small muted">${dateLabel(phase.start)}~${dateLabel(phase.end)}</span></div>${phase.type==='learn'?phase.chapterIds.map(id=>{const unit=units.find(u=>u.id===id);if(!unit)return '';return `<div class="plan-unit"><div><strong>${unit.total&&unit.attempted===unit.total?'✓ ':''}${esc(chapterName(id))}</strong><p>풀이 ${unit.attempted}/${unit.total} · 확실한 정답 ${unit.confident}${unit.weak?' · 오답/불확실 '+unit.weak:''}</p></div><button class="text-btn" data-plan-action="chapter" data-plan-chapter="${id}" ${unit.total?'':'disabled'}>단원 학습</button>${p.supplementYear&&unit.weak?`<button class="text-btn" data-plan-action="supplement" data-plan-chapter="${id}">${p.supplementYear}년 보충</button>`:''}</div>`}).join(''):`<p class="small muted">${phase.type==='weak'?'오답·불확실한 문제와 아직 풀지 못한 단원을 보완합니다.':phase.type==='round'?'보기 누락이 없는 회차를 연습하고 회차 사이에 오답을 복습합니다.':'메모장에서 자주 틀린 계산식과 판단 기준을 확인합니다.'}</p>`}</section>`).join('')}</section>${s.account?.planner?.error?`<p class="notice">${esc(s.account.planner.error)}</p>`:''}`;
 }
 function readForm(form){
  const read=name=>form.querySelector(`[name="${name}"]`).value;
  return {...draft,title:read('title'),startDate:read('startDate'),endDate:read('endDate'),weekdayMinutes:+read('weekdayMinutes'),weekendMinutes:+read('weekendMinutes'),weekdayGoal:+read('weekdayGoal'),weekendGoal:+read('weekendGoal'),primaryYear:read('primaryYear'),supplementYear:read('supplementYear'),enabled:form.querySelector('[name="enabled"]').checked,chapterIds:[...form.querySelectorAll('[name="chapter"]')].filter(el=>el.checked).map(el=>el.value)};
 }
 async function saveForm(form){
  if(busy)return;const userId=state().account?.user?.id,currentEpoch=epoch;draft=readForm(form);
  try{
   if(draft.template==='month'&&dayCount(draft.startDate,draft.endDate)!==31)draft.template='custom';
   const clean=validatePlan(draft,context());
   if(!planScope(clean,state().questions,state().records,state().chapters).length)throw Error('선택한 단원·연도에 풀이 가능한 문항이 없습니다. 범위를 바꾸어 주세요.');
   busy=true;error='';editPage();await state().account.savePlan(clean);
   if(epoch!==currentEpoch||state().account?.user?.id!==userId)return;
   editing=false;draft=null;busy=false;if(state().view==='plan')page();else refresh();toast('학습 계획을 계정에 저장했습니다.');
  }catch(e){if(epoch===currentEpoch){error=busy&&state().account?.planner?.error||e.message;editing=true;busy=false;if(state().view==='plan')editPage();else toast('계획을 저장하지 못했습니다. 작성 내용은 유지됩니다.');}}
  finally{if(epoch===currentEpoch)busy=false;}
 }
 async function handleClick(button){
  const action=button.dataset.planAction;if(!action)return;
  if(busy&&['create','edit','cancel','template-month','select-all','select-none','toggle','delete'].includes(action))return;
  const s=state(),p=plan();
  if(action==='create'){draft=newPlan({...context(),date:todayKey(now())});editing=true;error='';navigate('plan');return;}
  if(action==='edit'){draft=structuredClone(p);editing=true;error='';page();return;}
  if(action==='cancel'){editing=false;draft=null;error='';page();return;}
  if(action==='template-month'){
   draft=readForm(main.querySelector('#plan-form'));
   try{draft=newPlan({...context(),date:draft.startDate,template:'month',id:draft.id});error='';}catch(e){error=e.message;}
   editPage();return;
  }
  if(action==='select-all'||action==='select-none'){draft=readForm(main.querySelector('#plan-form'));draft.chapterIds=action==='select-all'?context().chapters.map(c=>c.id):[];editPage();return;}
  if(action==='toggle'||action==='delete'){
   if(busy||!p)return;if(action==='delete'&&!confirm('학습 계획을 삭제할까요? 풀이 기록과 노트는 계속 보관합니다.'))return;
   const currentEpoch=epoch;busy=true;page();
   try{await s.account.savePlan(action==='delete'?null:{...p,enabled:!p.enabled});if(epoch===currentEpoch){busy=false;if(state().view==='plan')page();toast(action==='delete'?'계획을 삭제했습니다. 학습 기록은 유지됩니다.':'계획 상태를 저장했습니다.');}}
   catch{if(epoch===currentEpoch){busy=false;toast('계획 설정을 저장하지 못했습니다. 다시 시도해 주세요.');if(state().view==='plan')page();}}return;
  }
  if(action==='memo'){navigate('memos');return;}
  if(!p||!s.account?.study)return;
  const m=model();let ids=[],options={year:p.primaryYear,planIds:[]};
  if(action==='review')ids=m.review.sort((a,b)=>(s.records[a.id].dueAt||0)-(s.records[b.id].dueAt||0)).slice(0,Math.max(1,Math.round(m.reviewMinutes/4))).map(q=>q.id);
  if(action==='financial'||action==='tax'){
   const rec=m.recommendations.find(item=>item.subject===(action==='financial'?'재무회계':'세무회계'));if(rec){ids=rec.questionIds.slice(0,Math.max(1,rec.goal-rec.done));options={...options,subject:rec.subject,topic:rec.chapterId,mode:'unseen'};}
  }
  if(action==='chapter'||action==='supplement'){
   const id=button.dataset.planChapter,year=action==='supplement'?p.supplementYear:p.primaryYear;
   ids=planScope(p,s.questions,s.records,s.chapters,year).filter(q=>chapterFor(q,s.records[q.id],s.chapters).id===id).map(q=>q.id);options={...options,year,topic:id};
  }
  if(action==='session'&&m.session){ids=m.session.questionIds;options={...options,year:m.session.year,month:m.session.month};}
  if(!ids.length){toast('현재 조건에 맞는 문제가 없습니다.');return;}
  startStudy({...options,planIds:ids});
 }
 function handleChange(event){
  const form=event.target.closest?.('#plan-form');if(!form)return;
  if(event.target.name==='startDate'&&draft.template==='month'){
   try{form.querySelector('[name="endDate"]').value=addDays(event.target.value,30);}catch{}
  }
  if(event.target.name==='primaryYear'){const extra=form.querySelector('[name="supplementYear"]');extra.disabled=event.target.value==='';if(extra.disabled)extra.value='';}
 }
 function refresh(){
  if(state().view==='plan'&&!editing)page();
  const widget=main.querySelector('#home-plan');if(widget)widget.outerHTML=homeWidget();
 }
 return {page,homeWidget,handleClick,handleChange,saveForm,refresh,get editing(){return editing},reset(){editing=false;draft=null;busy=false;error='';epoch++;}};
}
