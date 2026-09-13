import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {transform} from 'esbuild';
const source=(await readFile('supabase/functions/invite-password-auth/index.ts','utf8')).replace(/^import .*\r?\n/,'');
const {code}=await transform(source,{loader:'ts'});
function handler({allowed=true,quotaError=null,aliasError=null,loginError=true}={}){
 let handle,attempts=0,logins=0;
 const admin={rpc:async()=>{attempts++;return{data:allowed,error:quotaError};},from:()=>({select(){return this;},ilike(){return this;},maybeSingle:async()=>({data:null,error:aliasError}),delete(){return this;},eq:async()=>({error:null})})};
 const auth={auth:{signInWithPassword:async()=>{logins++;return loginError?{data:{},error:{message:'internal detail'}}:{data:{session:{access_token:'mock-access',refresh_token:'mock-refresh',expires_in:3600}},error:null};}}};
 vm.runInNewContext(code,{Deno:{env:{get:()=> 'configured'},serve:h=>handle=h},createClient:(_url,key)=>key==='configured'?(handler.clientCalls++%2===0?admin:auth):auth,Request,Response,TextEncoder,TextDecoder,Uint8Array,crypto});
 return {call:body=>handle(new Request('https://local.test',{method:'POST',body:typeof body==='string'?body:JSON.stringify(body)})),stats:()=>({attempts,logins})};
}
test.beforeEach(()=>{handler.clientCalls=0;});
const login={action:'login',email:'test@example.test',password:'123456'};
test('edge rejects malformed and oversized requests before accessing auth',async()=>{
 const h=handler();for(const body of ['null','[]','{','x'.repeat(9000)])assert.ok([400,413].includes((await h.call(body)).status));assert.equal(h.stats().attempts,0);
});
test('edge fails closed on quota failures and exhausted attempts',async()=>{
 for(const options of [{allowed:false},{quotaError:{message:'private'}}]){handler.clientCalls=0;const h=handler(options),r=await h.call(login);assert.ok([429,503].includes(r.status));assert.equal(h.stats().logins,0);assert.doesNotMatch(await r.text(),/private/);}
});
test('edge admits quota before login and hides provider errors',async()=>{
 const h=handler(),r=await h.call(login);assert.equal(r.status,401);assert.deepEqual(h.stats(),{attempts:1,logins:1});assert.doesNotMatch(await r.text(),/internal detail/);
});
test('edge returns a valid session only after successful credential verification',async()=>{
 const h=handler({loginError:false}),r=await h.call(login);assert.equal(r.status,200);assert.equal((await r.json()).accessToken,'mock-access');
});
test('alias lookup failure cannot bypass alias authentication',async()=>{
 const h=handler({aliasError:{message:'private'}}),r=await h.call(login);assert.equal(r.status,503);assert.equal(h.stats().logins,0);
});
