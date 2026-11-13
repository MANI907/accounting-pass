export const KEY='hoedok-records-v1';
export function due(record,now=Date.now()){return !!record?.dueAt&&record.dueAt<=now}
export function grade(previous,answer,correct,confidence,now=Date.now()){
 const ok=answer===correct;
 const streak=ok&&confidence==='sure'?(previous?.streak||0)+1:0;
 const days=streak?[1,3,7,14,30][Math.min(streak-1,4)]:1;
 return {...previous,answer,correct:ok,confidence,streak,attempts:(previous?.attempts||0)+1,lastAt:now,dueAt:now+days*86400000};
}
export function validateBackup(value,ids){
 if(!value||value.version!==1||!value.records||typeof value.records!=='object'||Array.isArray(value.records))throw Error('지원하지 않는 백업 형식입니다.');
 const output={};
 for(const [id,r] of Object.entries(value.records)){
  if(!ids.has(id)||!r||typeof r!=='object'||Array.isArray(r))throw Error('유효하지 않은 문제 기록입니다.');
  const clean={};
  for(const k of ['note','topic'])if(k in r){if(typeof r[k]!=='string'||r[k].length>20000)throw Error('메모 형식을 확인해 주세요.');clean[k]=r[k]}
  if('bookmarked'in r){if(typeof r.bookmarked!=='boolean')throw Error('북마크 형식 오류');clean.bookmarked=r.bookmarked}
  if('answer'in r){
   if(!Number.isInteger(r.answer)||r.answer<1||r.answer>4||typeof r.correct!=='boolean'||!['sure','unsure','guess'].includes(r.confidence))throw Error('풀이 기록 형식 오류');
   for(const k of ['attempts','lastAt','dueAt','streak'])if(!Number.isFinite(r[k])||r[k]<0)throw Error('복습 기록 형식 오류');
   for(const k of ['answer','correct','confidence','attempts','lastAt','dueAt','streak'])clean[k]=r[k];
  }
  output[id]=clean;
 }
 return output;
}
