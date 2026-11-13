export const KEY='hoedok-records-v1';
export const MEMOS_KEY='accounting-pass-memos-v1';
export function due(record,now=Date.now()){return !!record?.dueAt&&record.dueAt<=now}
export function grade(previous,answer,correct,confidence,now=Date.now()){
 const ok=answer===correct;
 const streak=ok&&confidence==='sure'?(previous?.streak||0)+1:0;
 const days=streak?[1,3,7,14,30][Math.min(streak-1,4)]:1;
 return {...previous,answer,correct:ok,confidence,streak,attempts:(previous?.attempts||0)+1,lastAt:now,dueAt:now+days*86400000};
}
export function validateBackup(value,ids){
 if(!value||![1,2].includes(value.version)||!value.records||typeof value.records!=='object'||Array.isArray(value.records))throw Error('지원하지 않는 백업 형식입니다.');
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
export function validateMemos(value){
 if(!Array.isArray(value)||value.length>1000)throw Error('메모장 백업 형식을 확인해 주세요.');
 const seen=new Set();
 return value.map(m=>{
  if(!m||typeof m!=='object'||typeof m.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(m.id)||seen.has(m.id))throw Error('메모 ID가 올바르지 않거나 중복됩니다.');
  if(typeof m.title!=='string'||m.title.length>120||typeof m.text!=='string'||m.text.length>20000)throw Error('메모 제목 또는 본문 형식을 확인해 주세요.');
  if(!Number.isFinite(m.createdAt)||m.createdAt<0||!Number.isFinite(m.updatedAt)||m.updatedAt<m.createdAt)throw Error('메모 날짜 형식을 확인해 주세요.');
  seen.add(m.id);
  return {id:m.id,title:m.title,text:m.text,createdAt:m.createdAt,updatedAt:m.updatedAt};
 });
}
export function readBackup(value,ids){
 const records=validateBackup(value,ids);
 const memos=value.version===2?validateMemos(value.memos):null;
 return {records,memos};
}
export function mergeMemos(existing,incoming){
 const merged=new Map(validateMemos(existing).map(m=>[m.id,m]));
 for(const m of validateMemos(incoming)){
  const current=merged.get(m.id);
  if(!current||m.updatedAt>current.updatedAt)merged.set(m.id,m);
 }
 return validateMemos([...merged.values()]);
}
