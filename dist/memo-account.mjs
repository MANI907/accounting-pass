import {MemoSync,supabaseMemoAdapter} from './memo-sync.mjs';

export async function createMemoAccount({storage,onMemos,onState,onConflict}){
 const account={client:null,user:null,sync:null,status:'loading',configured:false,recovery:false,ready:false};
 const emit=()=>onState(account);
 account.put=m=>account.sync?.put(m);
 account.remove=id=>account.sync?.remove(id);
 account.refresh=()=>account.sync?.sync();
 account.login=async(email,password)=>{
  const {error}=await account.client.auth.signInWithPassword({email,password});if(error)throw error;
 };
 account.signup=async(email,password)=>{
  const {data,error}=await account.client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+'/'}});if(error)throw error;return !!data.session;
 };
 account.reset=async email=>{
  const {error}=await account.client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/'});if(error)throw error;
 };
 account.password=async password=>{
  const {error}=await account.client.auth.updateUser({password});if(error)throw error;account.recovery=false;emit();
 };
 account.logout=async()=>{
  const {error}=await account.client.auth.signOut({scope:'local'});if(error)throw error;
  attach(null);
 };
 function attach(session){
  const user=session?.user||null;
  if(account.user?.id===user?.id&&account.ready)return;
  account.sync?.close();account.sync=null;account.user=user;account.ready=true;
  if(user){
   const sync=new MemoSync({userId:user.id,adapter:supabaseMemoAdapter(account.client,user.id),storage,
    onChange:memos=>{if(account.sync===sync)onMemos(memos)},
    onStatus:status=>{if(account.sync===sync){account.status=status;emit()}},onConflict});
   account.sync=sync;account.status=sync.status();onMemos(sync.memos);emit();sync.sync();
  }else{account.status='local';onMemos(null);emit();}
 }
 try{
  const response=await fetch('./cloud-config.json');if(!response.ok)throw Error('설정을 읽지 못했습니다.');
  const config=await response.json();
  if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url)||!config.publishableKey){account.status='unconfigured';account.ready=true;emit();return account;}
  const {createClient}=await import('./cloud-client.mjs');
  account.client=createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}});
  account.configured=true;
  account.client.auth.onAuthStateChange((event,session)=>{
   // Do not await further auth calls inside the client's auth lock.
   setTimeout(()=>{if(event==='PASSWORD_RECOVERY'){account.recovery=true;emit();}attach(session);},0);
  });
  const {data,error}=await account.client.auth.getSession();if(error)throw error;attach(data.session);
  window.addEventListener('online',()=>account.refresh());
  window.addEventListener('focus',()=>account.refresh());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)account.refresh()});
  setInterval(()=>{if(!document.hidden)account.refresh()},30000);
 }catch{account.status='unavailable';account.ready=true;emit();}
 return account;
}
