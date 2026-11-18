import {PLAN_KEY,validatePlan} from './plan.mjs';

// User-editable preferences only. Authorization continues to use Auth UID/RLS.
export class AccountPlan {
 constructor({client,userId,context,onChange=()=>{}}){
  Object.assign(this,{client,userId,context,onChange});this.value=null;this.error='';this.status='loading';this.closed=false;this.queue=Promise.resolve();
 }
 accept(user){
  if(this.closed||user?.id!==this.userId)return;
  try{this.value=validatePlan(user.user_metadata?.[PLAN_KEY],this.context);this.error='';this.status='saved';}
  catch(error){this.error=error.message;this.status='error';}
  this.onChange();
 }
 close(){this.closed=true}
 async refresh(){
  if(this.closed||this.status==='saving')return;
  try{const {data,error}=await this.client.auth.getUser();if(error)throw error;this.accept(data.user);}
  catch{if(!this.closed){this.error='계획 설정을 확인하지 못했습니다. 다시 동기화해 주세요.';this.status='error';this.onChange();}}
 }
 save(value){
  const clean=validatePlan(value,this.context);
  const operation=this.queue.catch(()=>{}).then(async()=>{
   if(this.closed)throw Error('로그인한 계정이 바뀌었습니다.');
   this.status='saving';this.error='';this.onChange();
   try{
    const {data:session,error:sessionError}=await this.client.auth.getSession();
    if(sessionError||this.closed||session.session?.user.id!==this.userId)throw Error('로그인 상태를 확인해 주세요.');
    const {data,error}=await this.client.auth.updateUser({data:{[PLAN_KEY]:clean}});if(error)throw error;
    if(this.closed||data.user?.id!==this.userId)throw Error('로그인한 계정이 바뀌었습니다.');
    this.accept(data.user);return this.value;
   }catch(error){if(!this.closed){this.status='error';this.error='계획을 저장하지 못했습니다. 입력 내용을 유지하고 있으니 연결 후 다시 저장해 주세요.';this.onChange();}throw error;}
  });
  this.queue=operation;return operation;
 }
}
