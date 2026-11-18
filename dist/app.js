(async()=>{
const {KEY,MEMOS_KEY,due,grade,validateBackup,validateMemos,readBackup,mergeMemos}=await import('./core.mjs');
const {chapterFor,chapterLabel,chapterStats}=await import('./curriculum.mjs');
let chapters=[],topicsSubject='재무회계',topicsYear='';
const main=document.querySelector('#main');
let Q=[],records={},view='home',queue=[],pos=0,selected=0,confidence='sure',submitted=false;
let memos=[],selectedMemoId=null,memoSearch='',memoSaveError=false;
let browserMemos=[],cloud=null,authMode='login',authMessage='',authBusy=false;
let browserRecords={},browserPosition='',lastPosition='',activeAccountId=null,renderedAccountId=null;
let homeYear=2026;
const years=()=>[...new Set(Q.map(q=>q.year))].sort((a,b)=>b-a);
let filters={year:'',subject:'',month:'',topic:'',search:'',mode:'all'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const chapter=q=>chapterFor(q,records[q.id],chapters);
const topic=q=>chapter(q).chapterName;
const chapterOptions=(subject,selected)=>chapters.filter(c=>!subject||c.subject===subject).map(c=>`<option value="${c.id}" ${selected===c.id?'selected':''}>${c.subject} · ${c.part}편 ${c.partName}${c.standalone?'':' / '+chapterLabel(c)}</option>`).join('');
const rec=q=>records[q.id]||{};
const usable=()=>Q.filter(q=>!q.incomplete);
let toastTimer;
function toast(s){const el=document.querySelector('#toast');el.textContent=s;el.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.style.display='none',3000)}
function persistPosition(){if(cloud?.user&&queue[pos])cloud.study.position(queue[pos].id)}
function filtered(){return usable().filter(q=>(!filters.year||q.year===+filters.year)&&(!filters.subject||q.subject===filters.subject)&&(!filters.month||q.month===+filters.month)&&(!filters.topic||chapter(q).id===filters.topic)&&(!filters.search||(q.raw+' '+topic(q)+' '+q.number).includes(filters.search))&&(filters.mode!=='unseen'||!rec(q).attempts)&&(filters.mode!=='review'||rec(q).attempts&&(!rec(q).correct||rec(q).confidence!=='sure'||due(rec(q))))&&(filters.mode!=='saved'||rec(q).bookmarked))}
function setView(v){view=v;document.querySelectorAll('nav button').forEach(b=>{b.classList.toggle('active',b.dataset.view===v);if(b.dataset.view===v)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});document.querySelector('#breadcrumb').textContent=({home:'학습 홈',study:'기출문제',topics:'유형별 학습',review:'오답과 복습',saved:'북마크',memos:'메모장'})[v];render()}
function start(extra={},id){filters={year:'',subject:'',month:'',topic:'',search:'',mode:'all',...extra};queue=filtered();pos=id?Math.max(0,queue.findIndex(q=>q.id===id)):0;reset();setView('study');persistPosition();window.scrollTo(0,0)}
function reset(){selected=0;confidence='sure';submitted=false}
function empty(title,desc){return `<div class="empty"><h2>${title}</h2><p>${desc}</p><button class="secondary" data-action="all">전체 기출 보기</button></div>`}
const chevron='<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m7.5 5 5 5-5 5" stroke="currentColor" stroke-width="1.4"/></svg>';
function home(){
 const all=usable().filter(q=>q.year===homeYear), solved=all.filter(q=>rec(q).attempts), right=solved.filter(q=>rec(q).correct).length;
 const review=all.filter(q=>rec(q).attempts&&(!rec(q).correct||rec(q).confidence!=='sure'||due(rec(q))));
 const last=lastPosition;
 const rate=solved.length?Math.round(right/solved.length*100)+'%':'—';
 const months=[...new Set(Q.filter(q=>q.year===homeYear).map(q=>q.month))].sort((a,b)=>a-b),issues=Q.filter(q=>q.year===homeYear&&q.incomplete);
 const canResume=Q.find(q=>q.id===last)?.year===homeYear;
 main.innerHTML=`<div class="page-heading"><div><h1>${homeYear}년 기출문제</h1><p class="subtitle">2023~2026년 기출을 연도와 회차별로 골라 풀 수 있습니다.</p></div><div class="heading-action"><label class="year-control" for="home-year">연도<select id="home-year">${years().map(y=>`<option value="${y}" ${y===homeYear?'selected':''}>${y}년</option>`).join('')}</select></label><button class="primary" data-action="${canResume?'resume':'home-start'}">${canResume?'이어서 풀기':'학습 시작'}</button></div></div>
 <dl class="summary-strip"><div class="summary-item"><dt>학습한 문제</dt><dd>${solved.length}<span>/ ${all.length}</span></dd></div><div class="summary-item"><dt>최근 답 정답률</dt><dd>${rate}</dd></div><div class="summary-item"><dt>복습할 문제</dt><dd>${review.length}<span>문항</span></dd></div></dl>
 <div class="home-columns"><div><section aria-labelledby="sessions-title"><div class="section-heading"><h2 id="sessions-title">회차별 문제</h2><span class="small">${months.length}개 회차 / 총 ${Q.filter(q=>q.year===homeYear).length}문항</span></div><table class="exam-table"><caption class="visually-hidden">${homeYear}년 회차별 기출문제와 학습 현황</caption><thead><tr><th scope="col">시행 회차</th><th scope="col">학습 가능</th><th scope="col">학습 현황</th><th scope="col"><span class="visually-hidden">문제 풀기</span></th></tr></thead><tbody>${months.map(m=>{const qs=all.filter(q=>q.month===m),done=qs.filter(q=>rec(q).attempts).length;return `<tr><td><button class="exam-name" data-month="${m}" data-year="${homeYear}"><span>${homeYear}년</span>${m}월</button></td><td>${qs.length}문항</td><td><div class="progress-label"><b>${done}</b> / ${qs.length}</div><div class="progress" aria-hidden="true"><i style="width:${done/qs.length*100}%"></i></div></td><td><button class="exam-open" data-month="${m}" data-year="${homeYear}" aria-label="${homeYear}년 ${m}월 기출문제 풀기">풀기 ${chevron}</button></td></tr>`}).join('')}</tbody></table></section>
 <section class="topic-section" aria-labelledby="quick-topic-title"><div class="section-heading"><h2 id="quick-topic-title">유형 골라 풀기</h2><button class="text-btn" data-view="topics">전체 유형</button></div><div class="topic-preview">${['T5-3','T5-2','F2-3','T2-2'].map(id=>chapters.find(c=>c.id===id)).map(c=>`<button class="topic-chip" data-year="${homeYear}" data-topic="${c.id}"><span>${c.chapterName}</span><small>${all.filter(q=>chapter(q).id===c.id).length}문항</small></button>`).join('')}</div></section></div>
 <div class="home-side"><section class="review-summary" aria-labelledby="review-title"><h2 id="review-title">다시 풀 문제</h2><div class="review-number">${review.length}<span>문항</span></div><p>${review.length?'틀렸거나 확신이 부족했던 문제와<br>복습일이 된 문제를 모았습니다.':'아직 복습할 문제가 없습니다.<br>풀이를 시작하면 여기에 모입니다.'}</p><button class="secondary" data-action="review" data-year="${homeYear}">${review.length?'복습 시작':'복습 목록 보기'}</button></section><section class="subject-section" aria-labelledby="subject-title"><h2 id="subject-title">과목별 학습</h2>${['재무회계','세무회계'].map(subject=>{const qs=all.filter(q=>q.subject===subject);return `<button class="subject-row" data-year="${homeYear}" data-subject="${subject}"><span><strong>${subject}</strong><small>${qs.length}문항 / ${qs.filter(q=>rec(q).attempts).length}문항 학습</small></span>${chevron}</button>`}).join('')}</section></div></div>
 <details class="source-notice"><summary>자료 안내${issues.length?` / 보기 누락 ${issues.length}문항`:''}</summary><p>선택한 연도의 문제와 답안 ${months.length*2}개 파일을 연결했습니다. ${issues.length?`보기 누락 ${issues.length}문항은 기본 출제에서 제외했습니다. <button class="text-btn" data-action="issues">누락된 원문 확인</button>`:'보기 누락이 확인된 문항은 없습니다.'} 이전 연도 세법은 출제 당시 조건을 적용합니다.</p></details>`;
}
function filterBar(){const months=[...new Set(Q.filter(q=>!filters.year||q.year===+filters.year).map(q=>q.month))].sort((a,b)=>a-b);return `<div class="filters"><select aria-label="연도" id="f-year"><option value="">전체 연도</option>${years().map(y=>`<option value="${y}" ${+filters.year===y?'selected':''}>${y}년</option>`).join('')}</select><select aria-label="과목" id="f-subject"><option value="">전체 과목</option>${['재무회계','세무회계'].map(s=>`<option ${filters.subject===s?'selected':''}>${s}</option>`).join('')}</select><select aria-label="회차" id="f-month"><option value="">전체 회차</option>${months.map(m=>`<option value="${m}" ${+filters.month===m?'selected':''}>${m}월</option>`).join('')}</select><select aria-label="유형" id="f-topic"><option value="">전체 유형</option>${chapterOptions(filters.subject,filters.topic)}${filters.topic.endsWith("0-0")?`<option value="${filters.topic}" selected>분류 확인 필요</option>`:""}</select><select id="f-mode" aria-label="학습 상태">${[['all','전체 문제'],['unseen','미학습 우선'],['review','오답과 복습'],['saved','북마크']].map(([v,l])=>`<option value="${v}" ${filters.mode===v?'selected':''}>${l}</option>`).join('')}</select><input id="f-search" type="search" placeholder="지문 / 유형 / 문항번호 검색" aria-label="문제 검색" value="${esc(filters.search)}"></div>`}
function study(){main.innerHTML=`<h1>기출문제 풀기</h1><p class="subtitle">정답은 제출 후에만 공개돼요. 확신도도 함께 기록해 보세요.</p>${filterBar()}<div id="question-area"></div>`;question();}
function question(){if(!cloud?.user)return;const area=document.querySelector('#question-area');if(!area)return;const q=queue[pos];if(!q){area.innerHTML=empty('조건에 맞는 문제가 없어요','과목이나 유형을 바꾸어 다시 찾아보세요.');return}
 const r=rec(q);area.innerHTML=`<div class="study-layout"><article class="question"><div class="question-meta"><span class="pill">${q.subject}</span><span>${q.year}년 ${q.month}월 / ${q.number}번</span><span>${q.format}</span><button class="bookmark" data-action="bookmark" aria-label="${r.bookmarked?'북마크 해제':'북마크 추가'}" aria-pressed="${!!r.bookmarked}">${r.bookmarked?'★':'☆'}</button></div><div class="question-body">${q.html}</div><div class="options" role="group" aria-label="정답 선택">${[1,2,3,4].map(a=>`<button class="option ${selected===a?'selected':''} ${submitted&&a===q.answer?'correct':''} ${submitted&&selected===a&&a!==q.answer?'wrong':''}" data-answer="${a}" aria-pressed="${selected===a}" ${submitted?'disabled':''}><span class="num">${a}</span><div>${q.options.length?q.options[a-1]:'표의 '+['①','②','③','④'][a-1]+'번 보기'}</div>${submitted&&a===q.answer?'<span class="answer-label">정답</span>':''}</button>`).join('')}</div><div class="confidence"><span>이 답에 얼마나 확신하나요?</span>${[['sure','확실해요'],['unsure','헷갈려요'],['guess','찍었어요']].map(([v,l])=>`<button data-confidence="${v}" class="${confidence===v?'selected':''}" aria-pressed="${confidence===v}" ${submitted?'disabled':''}>${l}</button>`).join('')}</div><div class="question-actions"><button class="ghost" data-action="prev" ${pos===0?'disabled':''}>이전</button><span class="small muted">${pos+1} / ${queue.length}</span>${submitted?`<button class="primary" data-action="next">${pos===queue.length-1?'학습 마치기':'다음 문제'}</button>`:`<button class="primary" data-action="submit" ${!selected?'disabled':''}>정답 제출하기</button><button class="ghost" data-action="next">건너뛰기</button>`}</div>${submitted?result(q):''}</article><div class="study-side"><div class="panel"><h3>목차 분류</h3><span class="pill">${chapter(q).part}편 ${esc(chapter(q).partName)}</span><p style="color:var(--ink);margin-top:10px">${esc(chapterLabel(chapter(q)))}</p><p>${r.topic?.startsWith('curriculum:')?'직접 지정한 목차':q.classificationStatus==='review'?'분류 확인 필요 · 문제 내용을 확인해 주세요.':'문제 내용에 따른 분류 · 직접 수정 가능'}</p><p class="small">기존 세부 유형: ${esc(q.topic)}</p>${r.topic&&!r.topic.startsWith('curriculum:')?`<p class="small">나의 기존 분류: ${esc(r.topic)}</p>`:''}<details class="type-fields"><summary>목차 수정하기</summary><label for="custom-topic">이 문제의 학습 단원</label><select id="custom-topic">${chapterOptions(q.subject,chapter(q).id)}</select><button class="secondary" data-action="save-topic">분류 저장</button></details></div><div class="panel"><h3>풀이 노트</h3><textarea id="note" aria-label="나의 풀이 노트" maxlength="20000" placeholder="헷갈린 개념, 계산 과정, 나만의 해설을 남겨보세요.">${esc(r.note||'')}</textarea><p style="margin-bottom:0">입력 내용은 자동 저장됩니다.</p></div><div class="panel"><h3>문제 풀이 기준</h3><p style="margin-bottom:0">${q.year}년 출제 문항입니다. 문제에 제시된 연도·세율·회계기준을 적용하세요. 과거 세법은 최근 기준과 다를 수 있습니다. 풀이 기록과 노트는 로그인한 계정에 저장됩니다.</p></div></div></div>`;
}
function result(q){const r=rec(q);return `<section class="result ${r.correct?'':'wrong-result'}" aria-live="polite"><h3>${r.correct?'정답입니다':'오답입니다'}</h3><p>선택한 답 <b>${r.answer}번</b> <span class="slash">/</span> 공식 확정답안 <b>${q.answer}번</b></p><p class="source">채점 출처: ${esc(q.answerSource)} / ${q.number}번</p><p class="small muted">다음 복습: ${new Date(r.dueAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})} / ${r.confidence==='sure'?'확실해요':r.confidence==='unsure'?'헷갈려요':'찍었어요'}</p><div class="concept"><h3>문제 해설</h3><p class="explanation-text">${esc(q.explanation||'이 문항의 개별 해설은 아직 작성되지 않았습니다. 첨부 답안에 따라 채점했으며, 문제에 제시된 출제 연도와 조건을 기준으로 풀이해 주세요.')}</p>${q.explanation?`<p class="source">${esc(q.explanationOrigin)} / 문제에 제시된 회계기준·연도·세율을 적용했습니다. 공식 답안과는 별도로 작성한 해설입니다.</p>`:''}</div><details><summary>문제 출처 확인</summary><p class="source">${esc(q.source)} / ${q.number}번<br>첨부 원문과 확정답안을 연결했습니다.</p></details></section>`}
function topics(){
 const qs=usable().filter(q=>q.subject===topicsSubject&&(!topicsYear||q.year===+topicsYear));
 const source=Q.filter(q=>q.subject===topicsSubject&&(!topicsYear||q.year===+topicsYear));
 const stats=chapterStats(qs,records), groups=new Map();
 for(const c of chapters.filter(c=>c.subject===topicsSubject)){if(!groups.has(c.part))groups.set(c.part,[]);groups.get(c.part).push(c)}
 function card(c){const items=qs.filter(q=>chapter(q).id===c.id),s=chapterStats(items,records);return `<div class="chapter-row"><div class="chapter-title"><strong>${esc(chapterLabel(c))}</strong><span class="small">${s.total}문항 · 풀이 ${s.attempted} · 확실한 정답 ${s.confident}${s.weak?' · 오답/불확실 '+s.weak:''}</span></div><div class="chapter-progress"><div class="progress" role="progressbar" aria-label="${esc(c.chapterName)} 확실한 정답 비율" aria-valuenow="${s.total?Math.round(s.confident/s.total*100):0}" aria-valuemin="0" aria-valuemax="100"><i style="width:${s.total?s.confident/s.total*100:0}%"></i></div><span class="small">${s.total?Math.round(s.confident/s.total*100):0}%</span></div><div class="chapter-actions"><button class="secondary" data-topic="${c.id}" data-year="${topicsYear}" ${s.total?'':'disabled'}>문제 풀기</button><button class="text-btn" data-topic="${c.id}" data-year="${topicsYear}" data-mode="review" ${items.some(q=>rec(q).attempts&&(!rec(q).correct||rec(q).confidence!=='sure'||due(rec(q))))?'':'disabled'}>복습</button></div></div>`}
 const unclassified=qs.filter(q=>chapter(q).part===0);
 main.innerHTML=`<div class="page-heading"><div><h1>유형별 학습</h1><p class="subtitle">교재 목차 순서로 기출을 풀고, 확실히 이해한 범위를 확인하세요.</p></div><label class="year-control" for="topics-year">연도<select id="topics-year"><option value="">전체 연도</option>${years().map(y=>`<option value="${y}" ${+topicsYear===y?'selected':''}>${y}년</option>`).join('')}</select></label></div><div class="curriculum-tabs" role="group" aria-label="학습 과목">${['재무회계','세무회계'].map(s=>`<button data-curriculum-subject="${s}" aria-pressed="${topicsSubject===s}" class="${topicsSubject===s?'active':''}">${s}</button>`).join('')}</div><p class="small muted">전체 보유 ${Q.length.toLocaleString('ko-KR')}문항 · 학습 가능 ${usable().length.toLocaleString('ko-KR')}문항 · 보기 누락으로 출제 제외 ${Q.length-usable().length}문항</p><p class="curriculum-summary">${topicsYear?topicsYear+'년':'전체 연도'} · ${topicsSubject}: 학습 가능 ${stats.total.toLocaleString('ko-KR')}문항</p><p class="small">${stats.attempted}문항 풀이 · 확실한 정답 ${stats.confident}문항${source.length>qs.length?' · 보기 누락 '+(source.length-qs.length)+'문항은 원문 보존 후 출제 제외':''}</p><p class="small muted">진행률은 최근 답이 정답이고 ‘확실해요’로 제출한 문항의 비율입니다. 분류는 규칙 기반 초안이며 문제 화면에서 수정할 수 있습니다.</p>${[...groups].map(([p,cs])=>`<section class="curriculum-part" aria-labelledby="part-${p}"><div class="section-heading"><h2 id="part-${p}">${p}편 ${cs[0].partName}</h2><span class="small">${cs[0].standalone?'단일 학습 단원':cs.length+'개 장'}</span></div>${cs.map(card).join('')}</section>`).join('')}${unclassified.length?`<section class="curriculum-part"><h2>분류 확인 필요</h2>${card(chapter(unclassified[0]))}</section>`:''}`;
}
function list(saved=false){const qs=usable().filter(q=>saved?rec(q).bookmarked:rec(q).attempts&&(!rec(q).correct||rec(q).confidence!=='sure'||due(rec(q))));main.innerHTML=`<h1>${saved?'북마크':'오답과 복습'}</h1><p class="subtitle">${saved?'별표를 눌러 모아둔 문제를 다시 만나보세요.':'오답·불확실한 정답·복습일이 된 문제를 모았어요.'}</p><div class="section-heading"><h2>${qs.length}문항</h2>${qs.length?`<button class="primary" data-action="${saved?'saved-study':'review'}">모아서 풀기</button>`:''}</div>${qs.length?qs.map(q=>`<div class="list-row"><div><h3>${esc(topic(q))}</h3><p>${q.year}년 ${q.month}월 / ${q.subject} ${q.number}번 <span class="slash">/</span> ${!rec(q).attempts?'미학습':!rec(q).correct?'오답':rec(q).confidence!=='sure'?'확신 부족':'복습일 도래'}</p></div><button class="secondary" data-question="${q.id}">풀어보기</button></div>`).join(''):empty(saved?'아직 북마크한 문제가 없어요':'지금은 복습할 문제가 없어요',saved?'문제 오른쪽 위의 ☆를 누르면 여기에 모여요.':'기출을 풀면 복습할 문제를 자동으로 모아드려요.')}`}
function saveMemos(){
 if(!cloud?.user)return false;
 const m=memos.find(item=>item.id===selectedMemoId);if(m)cloud.put(m);memoSaveError=cloud.sync?.cacheError||false;return !memoSaveError;
}
const memoDate=time=>new Date(time).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric'});
function memoStatus(){
 if(!cloud?.user)return memoSaveError?'저장 실패 / 백업해 주세요':'자동 저장됨 · 이 브라우저';
 return ({saved:'계정에 저장됨',pending:'이 기기에 임시 보관 · 저장 대기',syncing:'계정에 저장 중…',offline:'서버 저장 실패 · 이 기기에 보관 중', 'cache-error':'임시 보관 실패 · 기록을 내보내 주세요'})[cloud.status]||'저장 상태 확인 중…';
}
function memoAccount(){
 const area=document.querySelector('#memo-account');if(!area)return;
 if(cloud?.user){area.innerHTML=`<div class="memo-account-line"><div><strong>계정 메모장</strong><span>${esc(cloud.user.email)}</span><p>같은 계정으로 로그인하면 다른 기기에서도 메모를 불러옵니다.</p></div><div class="account-actions"><button class="secondary" data-action="memo-sync">지금 동기화</button><button class="text-btn" data-action="memo-logout">로그아웃</button></div></div>${browserMemos.length?`<div class="memo-migration">이 브라우저에 작성한 메모 ${browserMemos.length}개가 따로 보관되어 있습니다. <button class="text-btn" data-action="memo-migrate">계정으로 복사</button></div>`:''}`;
 }else{area.innerHTML=`<div class="memo-account-line"><div><strong>메모를 계정에 보관하세요</strong><p>로그인하면 서버에 자동 저장됩니다. 로그인 전 메모는 이 브라우저에 보관됩니다.</p></div><button class="secondary" data-action="memo-login" ${!cloud?.configured?'disabled':''}>로그인 / 가입</button></div>${cloud?.status==='unconfigured'?'<p class="small muted">계정 저장 기능을 연결하고 있습니다. 기존 메모는 그대로 보관됩니다.</p>':cloud?.status==='unavailable'?'<p class="small muted">계정 연결을 확인하지 못했습니다. 잠시 후 새로고침해 주세요.</p>':''}`;}
 const status=document.querySelector('#memo-save-status');if(status)status.textContent=memoStatus();
 const help=document.querySelector('#memo-storage-help');if(help)help.textContent=cloud?.user?'입력하면 계정에 자동 저장됩니다.':'입력하면 현재 브라우저에 자동 저장됩니다.';
}
function authDialog(){
 const dialog=document.querySelector('#memo-auth');const recovery=authMode==='password';
 document.querySelector('#memo-auth-title').textContent=({login:'학습 계정 로그인',signup:'학습 계정 만들기',reset:'비밀번호 재설정',password:'새 비밀번호 설정'})[authMode];
 document.querySelector('#memo-auth-fields').innerHTML=`${!recovery?'<label for="memo-email">이메일</label><input id="memo-email" type="email" autocomplete="email" required maxlength="254">':''}${authMode!=='reset'?`<label for="memo-password">${recovery?'새 비밀번호':'비밀번호'}</label><input id="memo-password" type="password" autocomplete="${authMode==='login'?'current-password':'new-password'}" required minlength="${authMode==='login'?1:10}" maxlength="128">`:''}`;
 document.querySelector('#memo-auth-submit').textContent=({login:'로그인',signup:'계정 만들기',reset:'재설정 메일 받기',password:'비밀번호 저장'})[authMode];
 document.querySelector('#memo-auth-links').innerHTML=recovery?'':`<button type="button" class="text-btn" data-auth-mode="${authMode==='signup'?'login':'signup'}">${authMode==='signup'?'기존 계정으로 로그인':'계정 만들기'}</button><button type="button" class="text-btn" data-auth-mode="${authMode==='reset'?'login':'reset'}">${authMode==='reset'?'로그인으로 돌아가기':'비밀번호를 잊었어요'}</button>`;
 document.querySelector('#memo-auth-status').textContent=authMessage;
 if(!dialog.open)dialog.showModal();
}
function refreshMemoScreen(){
 if(view!=='memos')return;
 if(!memos.some(m=>m.id===selectedMemoId)){selectedMemoId=[...memos].sort((a,b)=>b.updatedAt-a.updatedAt)[0]?.id||null;memoEditor();}
 const m=memos.find(m=>m.id===selectedMemoId),title=document.querySelector('#memo-title'),text=document.querySelector('#memo-text');
 if(m&&(!title||title.value!==m.title||text?.value!==m.text))memoEditor();
 memoList();memoAccount();
}
function memoList(){
 const container=document.querySelector('#memo-list');if(!container)return;
 const search=memoSearch.trim().toLocaleLowerCase();
 const items=[...memos].sort((a,b)=>b.updatedAt-a.updatedAt).filter(m=>(m.title+' '+m.text).toLocaleLowerCase().includes(search));
 container.innerHTML=items.length?items.map(m=>`<button class="memo-entry ${selectedMemoId===m.id?'selected':''}" data-memo="${esc(m.id)}" ${selectedMemoId===m.id?'aria-current="true"':''}><strong>${esc(m.title.trim()||'제목 없는 메모')}</strong><span>${esc(m.text.trim().slice(0,75)||'내용을 입력하세요.')}</span><small>${memoDate(m.updatedAt)}</small></button>`).join(''):`<p class="memo-list-empty">${memos.length?'검색 결과가 없습니다.':'저장한 메모가 없습니다.'}</p>`;
 const count=document.querySelector('#memo-count');if(count)count.textContent=memos.length+'개 메모';
}
function memoEditor(){
 const container=document.querySelector('#memo-editor');if(!container)return;
 const m=memos.find(item=>item.id===selectedMemoId);
 if(!m){container.innerHTML='<div class="memo-empty"><h2>시험 전에 기억할 내용을 적어두세요.</h2><p>헷갈리는 개념과 계산식, 자주 틀리는 포인트를 모아보세요.</p><button class="secondary" data-action="memo-new">첫 메모 쓰기</button></div>';return;}
 container.innerHTML=`<div class="memo-editor-toolbar"><span id="memo-save-status" role="status">${memoStatus()}</span><button class="text-btn" data-action="memo-delete">메모 삭제</button></div><label for="memo-title" class="visually-hidden">메모 제목</label><input id="memo-title" class="memo-title" maxlength="120" value="${esc(m.title)}" placeholder="메모 제목" autocomplete="off"><label for="memo-text" class="visually-hidden">암기할 내용</label><textarea id="memo-text" class="memo-text" maxlength="20000" spellcheck="false" placeholder="시험 전 암기할 내용을 적어보세요.

예: 영세율은 매입세액 공제·환급 가능
면세는 관련 매입세액 공제 불가">${esc(m.text)}</textarea><div class="memo-editor-footer"><span>수정 ${memoDate(m.updatedAt)}</span><span id="memo-length">${m.text.length.toLocaleString('ko-KR')} / 20,000자</span></div>`;
}
function notebook(){
 if(!memos.some(m=>m.id===selectedMemoId))selectedMemoId=[...memos].sort((a,b)=>b.updatedAt-a.updatedAt)[0]?.id||null;
 main.innerHTML=`<div class="page-heading"><div><h1>메모장</h1><p class="subtitle">시험 전 암기할 개념과 계산식을 모아두세요.</p></div><button class="primary" data-action="memo-new">새 메모</button></div><section id="memo-account" class="memo-account" aria-label="메모 저장 계정"></section><div class="memo-help"><span id="memo-count">${memos.length}개 메모</span><span id="memo-storage-help"></span></div><div class="notebook-layout"><section class="memo-index" aria-label="메모 목록"><label for="memo-search" class="visually-hidden">메모 검색</label><input id="memo-search" type="search" placeholder="제목이나 내용 검색" value="${esc(memoSearch)}"><div id="memo-list"></div></section><section id="memo-editor" class="memo-editor" aria-label="메모 편집"></section></div>`;
 memoList();memoEditor();memoAccount();
}
function addMemo(){
 if(memos.length>=1000){toast('메모는 최대 1,000개까지 보관할 수 있습니다.');return;}
 const now=Date.now();const m={id:crypto.randomUUID(),title:'',text:'',createdAt:now,updatedAt:now};
 memos.push(m);selectedMemoId=m.id;memoSearch='';saveMemos();setView('memos');document.querySelector('#memo-title').focus();
}
function restoreBackup(parsed){
 if(!cloud?.user||!cloud.study.loaded)throw Error('로그인 후 계정 기록을 불러온 다음 가져와 주세요.');
 const nextMemos=parsed.memos===null?memos:mergeMemos(memos,parsed.memos);
 cloud.study.importRecords(parsed.records,{onlyMissing:false});
 for(const m of nextMemos)cloud.put(m);
 memoSaveError=false;
}
function accountStatus(){
 const states=[cloud?.status,cloud?.studyStatus];
 if(states.includes('cache-error'))return '임시 저장 실패 · 기록을 내보내 주세요';
 if(states.includes('offline'))return '연결 대기 · 이 기기에 임시 저장';
 if(states.some(s=>s==='loading'||s==='syncing'))return '동기화 중…';
 if(cloud?.study?.count||cloud?.sync?.count)return '계정 저장 대기';
 return '계정에 저장됨';
}
function updateAccountUI(){
 const signed=!!cloud?.user;
 document.querySelector('#study-navigation').hidden=!signed;
 document.querySelector('#backup-open').hidden=!signed;
 document.querySelector('#session-panel').hidden=!signed;
 if(signed){
  document.querySelector('#session-email').textContent=cloud.user.email;
  document.querySelector('#session-status').textContent=accountStatus();
 }else{document.querySelector('#session-email').textContent='';document.querySelector('#session-status').textContent='';}
 const banner=document.querySelector('#legacy-import');
 let imported=false;try{imported=localStorage.getItem('accounting-pass-study-imported:'+cloud?.user?.id)==='yes'}catch{}
 banner.hidden=!signed||imported||!Object.keys(browserRecords).length;
 document.querySelector('#legacy-import-button').disabled=!cloud?.study?.loaded||!cloud?.sync?.loaded;
 if(!signed)document.querySelector('#backup').close();
}
function loginPage(){
 renderedAccountId=null;
 if(!cloud?.ready){main.innerHTML='<section class="login-page"><h1>회계관리 1급</h1><p role="status">로그인 상태를 확인하고 있습니다.</p></section>';return;}
 if(document.querySelector('#entry-auth-form'))return;
 main.innerHTML=`<section class="login-page"><p class="login-subject">회계관리 1급 · 기출 학습</p><h1>로그인하고<br>학습을 이어가세요.</h1><p>풀이 기록, 북마크와 노트를 계정에 보관합니다.<br>다른 기기에서도 이어서 공부할 수 있습니다.</p><form id="entry-auth-form" class="memo-auth-form"><label for="entry-email">이메일</label><input id="entry-email" type="email" autocomplete="username" maxlength="254" required><label for="entry-password">비밀번호</label><input id="entry-password" type="password" autocomplete="current-password" maxlength="128" required><button id="entry-auth-submit" type="submit" class="primary" ${!cloud.configured?'disabled':''}>로그인</button><p id="entry-auth-status" role="status">${cloud.configured?'':'계정에 연결하지 못했습니다. 잠시 후 새로고침해 주세요.'}</p></form><div class="auth-links"><button type="button" class="text-btn" data-auth-mode="signup">계정 만들기</button><button type="button" class="text-btn" data-auth-mode="reset">비밀번호를 잊었어요</button></div></section>`;
}
function receiveStudy(snapshot,userId){
 const switched=activeAccountId!==userId;
 if(switched){
  activeAccountId=userId;view='home';homeYear=2026;topicsSubject='재무회계';topicsYear='';queue=[];pos=0;reset();selectedMemoId=null;memoSearch='';clearTimeout(searchTimer);
  filters={year:'',subject:'',month:'',topic:'',search:'',mode:'all'};
  document.querySelector('#backup').close();main.innerHTML='';
 }
 const firstPosition=!lastPosition;
 records=snapshot.records;lastPosition=snapshot.position;
 if((switched||firstPosition)&&lastPosition)homeYear=Q.find(q=>q.id===lastPosition)?.year||2026;
 if(switched||view==='home'||view==='topics')render();
}
async function copyBrowserMemos(account){
 let count=0;const userId=account.user.id;
 for(const m of browserMemos){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(m.id));
  const id='import-'+[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(account!==cloud||account.user?.id!==userId)return count;
  if(!account.sync.items[id]&&memos.length<1000){account.put({...m,id});count++;}
 }
 return count;
}
function render(){
 if(!cloud?.user){loginPage();return;}
 renderedAccountId=cloud.user.id;
 if(view==='home')home();else if(view==='study')study();else if(view==='topics')topics();else if(view==='memos')notebook();else list(view==='saved');
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;
 if(b.dataset.authMode){authMode=b.dataset.authMode;authMessage='';authDialog();return}
 if(b.dataset.action==='memo-login'){authMode='login';authMessage='';authDialog();return}
 if(!cloud?.user)return;
 if(b.dataset.memo){selectedMemoId=b.dataset.memo;memoList();memoEditor();return}
 if(b.dataset.action==='memo-sync'){cloud?.refresh();return}
 if(b.dataset.action==='memo-logout'){
  if((cloud.sync?.count||cloud.study?.count)&&!confirm('아직 계정에 저장 대기 중인 기록이 있습니다. 이 기기에 임시 보관되며 같은 계정으로 다시 로그인하면 저장을 재시도합니다. 로그아웃할까요?'))return;
  try{await cloud.logout();toast('로그아웃했습니다.')}catch{toast('로그아웃하지 못했습니다. 다시 시도해 주세요.')}return;
 }
 if(b.dataset.action==='legacy-import'){
  const account=cloud,userId=account.user.id;
  if(!account.study?.loaded||!account.sync?.loaded){toast('계정 기록을 먼저 불러오고 있습니다.');return;}
  if(!confirm(`이 브라우저의 학습 기록과 메모를 ${account.user.email} 계정으로 가져올까요? 계정에 이미 있는 문제 기록은 유지합니다.`))return;
  b.disabled=true;
  const count=account.study.importRecords(browserRecords,{position:browserPosition});
  await copyBrowserMemos(account);
  if(cloud!==account||account.user?.id!==userId)return;
  if(account.study.cacheError||account.sync.cacheError){toast('임시 저장에 실패했습니다. 기록을 내보내 주세요.');return;}
  try{localStorage.setItem('accounting-pass-study-imported:'+userId,'yes')}catch{}
  await account.refresh();updateAccountUI();render();toast(`${count}문항의 기록을 가져왔습니다. 계정 저장 상태를 확인해 주세요.`);return;
 }
 if(b.dataset.action==='memo-migrate'){
  const current=cloud;if(!current?.user||!browserMemos.length)return;
  if(!confirm(`이 브라우저의 메모 ${browserMemos.length}개를 ${current.user.email} 계정으로 복사할까요? 브라우저 원본도 유지합니다.`))return;
  if(!current.sync?.loaded)return;
  b.disabled=true;const count=await copyBrowserMemos(current);
  await current.refresh();toast(count?`${count}개 메모를 복사했습니다. 저장 상태를 확인해 주세요.`:'이미 복사한 메모는 유지합니다. 최대 1,000개까지 저장할 수 있습니다.');refreshMemoScreen();return;
 }
 if(b.dataset.action==='memo-new'){addMemo();return}
 if(b.dataset.action==='memo-delete'){const m=memos.find(item=>item.id===selectedMemoId);if(m&&confirm('이 메모를 삭제할까요? 삭제한 내용은 복원할 수 없습니다.')){cloud.remove(m.id);selectedMemoId=null;notebook();toast('삭제 내용을 계정에 저장합니다.')}return}
 if(b.dataset.view){if(b.dataset.view==='study'&&!queue.length)start();else setView(b.dataset.view);return}
 if(b.dataset.curriculumSubject){topicsSubject=b.dataset.curriculumSubject;topics();return;}
 if(b.dataset.subject){start({subject:b.dataset.subject,year:b.dataset.year||''});return}if(b.dataset.month){start({month:b.dataset.month,year:b.dataset.year||''});return}if(b.dataset.topic){start({topic:b.dataset.topic,subject:chapters.find(c=>c.id===b.dataset.topic)?.subject||'',year:b.dataset.year||'',mode:b.dataset.mode||'all'});return}if(b.dataset.question){start({},b.dataset.question);return}
 if(b.dataset.answer){selected=+b.dataset.answer;question();return}if(b.dataset.confidence){confidence=b.dataset.confidence;question();return}
 const q=queue[pos],a=b.dataset.action;
 if(a==='home-start')start({year:homeYear});else if(a==='all')start();else if(a==='resume')start({},lastPosition);
 else if(a==='review')start({mode:'review',year:b.dataset.year||''});else if(a==='saved-study')start({mode:'saved'});
 else if(a==='submit'&&q&&selected){cloud.study.attempt(q.id,selected,confidence);submitted=true;question()}
 else if(a==='next'){if(pos<queue.length-1){pos++;reset();question();persistPosition();window.scrollTo(0,0)}else{toast('선택한 문제를 모두 살펴봤어요. 수고하셨습니다!');setView('home')}}
 else if(a==='prev'&&pos>0){pos--;reset();question();persistPosition()}
 else if(a==='bookmark'&&q){cloud.study.field(q.id,'bookmark',!rec(q).bookmarked);question();toast(rec(q).bookmarked?'북마크에 저장했어요.':'북마크를 해제했어요.')}
 else if(a==='save-topic'&&q){const t=document.querySelector('#custom-topic').value.trim();if(t){cloud.study.field(q.id,'topic','curriculum:'+t);question();toast('유형을 저장했어요.')}}
 else if(a==='issues'){main.innerHTML=`<h1>첨부 원문 확인 필요</h1><p class="subtitle">누락된 보기를 임의로 만들지 않았습니다. 이 문항은 기본 출제에서 제외됩니다.</p>${Q.filter(q=>q.incomplete&&q.year===homeYear).map(q=>`<article class="question" style="margin:18px 0"><h2>${q.year}년 ${q.month}월 ${q.number}번</h2><div class="notice">${esc(q.missingChoices?.join(', ')||'일부')} 보기가 첨부 MD에 없습니다.</div><div class="question-body">${q.html}</div><p class="source">${esc(q.source)}</p></article>`).join('')}<button class="secondary" data-view="home">학습 홈으로</button>`}
});
document.addEventListener('input',e=>{
 if(!cloud?.user)return;
 if(e.target.id==='memo-search'){memoSearch=e.target.value;memoList();return;}
 if(e.target.id!=='memo-title'&&e.target.id!=='memo-text')return;
 const m=memos.find(item=>item.id===selectedMemoId);if(!m)return;
 if(e.target.id==='memo-title')m.title=e.target.value;else m.text=e.target.value;
 m.updatedAt=Math.max(Date.now(),m.createdAt);const saved=saveMemos();memoList();
 document.querySelector('#memo-save-status').textContent=memoStatus();
 document.querySelector('#memo-length').textContent=m.text.length.toLocaleString('ko-KR')+' / 20,000자';
});
document.addEventListener('input',e=>{if(cloud?.user&&e.target.id==='note'&&queue[pos])cloud.study.field(queue[pos].id,'note',e.target.value)});
let searchTimer;
document.addEventListener('input',e=>{if(e.target.id==='f-search'){clearTimeout(searchTimer);const value=e.target.value;searchTimer=setTimeout(()=>{filters.search=value;queue=filtered();pos=0;reset();question();persistPosition()},200)}});
document.addEventListener('change',e=>{
 if(!cloud?.user)return;
 if(e.target.id==='topics-year'){topicsYear=e.target.value;topics();return;}
 if(e.target.id==='home-year'){homeYear=+e.target.value;home();return;}
 const k=({'f-year':'year','f-subject':'subject','f-month':'month','f-topic':'topic','f-mode':'mode'})[e.target.id];
 if(k){filters[k]=e.target.value;if(k==='year')filters.month='';if(k==='subject')filters.topic='';queue=filtered();pos=0;reset();if(k==='year'||k==='subject')study();else question();persistPosition()}
});
document.querySelector('.file-label').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();document.querySelector('#import').click()}});
document.querySelector('#backup-open').onclick=()=>{if(cloud?.user)document.querySelector('#backup').showModal()};
document.querySelector('#export').onclick=()=>{if(!cloud?.user)return;const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),records,memos},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='accounting-pass-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);document.querySelector('#backup-status').textContent='백업 파일을 내보냈어요.'};
document.querySelector('#import').onchange=async e=>{
 const f=e.target.files[0];if(!f||!cloud?.user)return;
 try{
  if(f.size>10*1024*1024)throw Error('10MB 이하 파일을 선택해 주세요.');
  const parsed=readBackup(JSON.parse(await f.text()),new Set(Q.map(q=>q.id)));
  for(const [id,r]of Object.entries(parsed.records))if(r.answer)r.correct=r.answer===Q.find(q=>q.id===id).answer;
  restoreBackup(parsed);document.querySelector('#backup-status').textContent='기록과 메모장을 가져왔어요.';render();
 }catch(error){document.querySelector('#backup-status').textContent=error.message}
 e.target.value='';
};
document.addEventListener('submit',async e=>{
 const entry=e.target.id==='entry-auth-form';
 if(!entry&&e.target.id!=='memo-auth-form')return;
 e.preventDefault();if(authBusy||!cloud?.client)return;
 const mode=entry?'login':authMode;
 const email=document.querySelector(entry?'#entry-email':'#memo-email')?.value.trim();
 const password=document.querySelector(entry?'#entry-password':'#memo-password')?.value;
 const status=document.querySelector(entry?'#entry-auth-status':'#memo-auth-status'),button=document.querySelector(entry?'#entry-auth-submit':'#memo-auth-submit');
 authBusy=true;button.disabled=true;status.textContent='처리 중…';
 try{
  if(mode==='login'){await cloud.login(email,password);document.querySelector('#memo-auth').close();setView('home');}
  else if(mode==='signup'){const logged=await cloud.signup(email,password);if(logged){document.querySelector('#memo-auth').close();setView('home');}else status.textContent='확인 메일을 보냈습니다. 메일의 링크를 연 뒤 로그인해 주세요.';}
  else if(mode==='reset'){await cloud.reset(email);status.textContent='재설정 메일을 요청했습니다. 메일의 링크에서 새 비밀번호를 설정해 주세요.';}
  else{await cloud.password(password);document.querySelector('#memo-auth').close();toast('비밀번호를 변경했습니다.');}
 }catch(error){status.textContent=({invalid_credentials:'이메일 또는 비밀번호를 확인해 주세요.',email_not_confirmed:'확인 메일의 링크를 먼저 열어 주세요.',over_email_send_rate_limit:'메일 요청이 많습니다. 잠시 후 다시 시도해 주세요.',email_address_not_authorized:'이메일 발송 설정을 확인해야 합니다. 사이트 관리자에게 알려 주세요.',user_already_exists:'이미 가입된 이메일입니다. 로그인해 주세요.'})[error.code]||'연결 또는 계정 설정을 확인해 주세요. 잠시 후 다시 시도해 주세요.';}
 finally{authBusy=false;button.disabled=false;}
});
try{const storedMemos=localStorage.getItem(MEMOS_KEY);browserMemos=storedMemos?validateMemos(JSON.parse(storedMemos)):[];}catch{toast('기존 브라우저 메모를 읽을 수 없습니다. 백업 파일을 확인해 주세요.')}
try{
 const responses=await Promise.all([fetch('./questions.json'),fetch('./curriculum.json')]);if(responses.some(r=>!r.ok))throw Error('학습 자료를 읽을 수 없습니다.');[Q,chapters]=await Promise.all(responses.map(r=>r.json()));
 try{const stored=JSON.parse(localStorage.getItem(KEY)||'{}');browserRecords=validateBackup({version:1,records:stored},new Set(Q.map(q=>q.id)));browserPosition=localStorage.getItem('hoedok-current')||'';}
 catch{toast('기존 브라우저 기록을 읽을 수 없습니다. 백업 파일을 확인해 주세요.')}
 render();
 const {createMemoAccount}=await import('./memo-account.mjs');
 cloud=await createMemoAccount({storage:localStorage,answers:new Map(Q.map(q=>[q.id,q.answer])),
  onRecords:receiveStudy,
  onMemos:items=>{memos=items||[];refreshMemoScreen();},
  onState:state=>{
   cloud=state;updateAccountUI();memoAccount();
   if(renderedAccountId!==(state.user?.id||null)||(!state.user&&!document.querySelector('#entry-auth-form')))render();
   if(state.recovery){authMode='password';authMessage='새 비밀번호를 입력해 주세요.';if(!document.querySelector('#memo-auth').open)authDialog();}
  },
  onConflict:()=>toast('다른 기기의 수정 내용을 확인했습니다. 편집 내용은 기기 사본으로 따로 보관합니다.')
 });
 updateAccountUI();render();
}catch{cloud={status:'unavailable',configured:false,ready:true,user:null};updateAccountUI();render();}
})();
