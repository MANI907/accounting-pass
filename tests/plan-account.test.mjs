import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AccountPlan} from '../dist/plan-account.mjs';
import {PLAN_KEY,newPlan} from '../dist/plan.mjs';
const context={chapters:[{id:'F1-1'}],years:[2026,2025]},draft=newPlan({...context,id:'plan',date:'2026-11-18'});
function service(){
 const profiles=new Map([['A',{id:'A',user_metadata:{full_name:'A'}}],['B',{id:'B',user_metadata:{}}]]);let current='A',fail=false,delay=null,writes=0;
 const client={auth:{getSession:async()=>({data:{session:{user:{id:current}}},error:null}),getUser:async()=>({data:{user:structuredClone(profiles.get(current))},error:null}),updateUser:async({data})=>{
  writes++;const id=current;if(delay)await delay();if(fail)return {data:{},error:Error('network')};
  const profile=profiles.get(id);profile.user_metadata={...profile.user_metadata,...data};return {data:{user:structuredClone(profile)},error:null};
 }}};
 return {client,profiles,login:id=>current=id,fail:value=>fail=value,delay:value=>delay=value,writes:()=>writes};
}
const make=(server,userId='A',onChange=()=>{})=>new AccountPlan({client:server.client,userId,context,onChange});
test('account metadata is empty by default and only the chosen account opts in',async()=>{
 const server=service(),a=make(server);await a.refresh();assert.equal(a.value,null);assert.equal(server.writes(),0);
 await a.save(draft);assert.equal(a.value.title,draft.title);assert.equal(server.profiles.get('A').user_metadata.full_name,'A');
 server.login('B');const b=make(server,'B');await b.refresh();assert.equal(b.value,null);assert.equal(server.profiles.get('B').user_metadata[PLAN_KEY],undefined);
 server.login('A');const fresh=make(server);await fresh.refresh();assert.deepEqual(fresh.value,draft);
});
test('pause, resume and delete change preferences without touching any study records',async()=>{
 const server=service(),a=make(server);await a.save(draft);await a.save({...draft,enabled:false});assert.equal(a.value.enabled,false);
 await a.save({...draft,enabled:true});await a.save(null);assert.equal(a.value,null);assert.equal(server.profiles.get('A').user_metadata.full_name,'A');
});
test('failed saves keep the previous plan and serial saves preserve the final requested state',async()=>{
 const server=service(),a=make(server);await a.save(draft);server.fail(true);await assert.rejects(a.save({...draft,title:'실패한 수정'}));assert.equal(a.value.title,draft.title);assert.equal(a.status,'error');
 server.fail(false);await Promise.all([a.save({...draft,title:'첫 수정'}),a.save({...draft,title:'마지막 수정'})]);assert.equal(a.value.title,'마지막 수정');
});
test('another account and late responses after logout cannot update visible plan state',async()=>{
 const server=service(),a=make(server);server.login('B');await assert.rejects(a.save(draft));assert.equal(server.writes(),0);
 server.login('A');let release,changes=0;server.delay(()=>new Promise(resolve=>release=resolve));const closing=make(server,'A',()=>changes++),pending=closing.save(draft);
 while(!release)await new Promise(setImmediate);const before=changes;closing.close();release();await assert.rejects(pending);assert.equal(changes,before);assert.equal(closing.value,null);assert.equal(server.profiles.get('B').user_metadata[PLAN_KEY],undefined);
});
test('malformed profile settings do not enroll a user and invalid form settings never reach Auth',async()=>{
 const server=service(),a=make(server);a.accept({id:'A',user_metadata:{[PLAN_KEY]:{version:99}}});assert.equal(a.value,null);assert.equal(a.status,'error');
 assert.throws(()=>a.save({...draft,chapterIds:[]}));assert.equal(server.writes(),0);
});
