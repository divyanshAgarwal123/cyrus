// Local validation transport only. Production code and session validation are unchanged.
const nativeFetch = globalThis.fetch;
const owner = '10101010-1010-4010-8010-101010101010';
const unlinked = '20202020-2020-4020-8020-202020202020';
const users = {
 [owner]: {id:owner,provider:'github',provider_id:'pdf-fixture',login:'pdf-fixture',name:'Synthetic PDF Tester',email:null,picture:null,created_at:'2026-11-20T12:00:00Z'},
 [unlinked]: {id:unlinked,provider:'email',provider_id:'fixture@example.invalid',login:null,name:'Synthetic Email Tester',email:'fixture@example.invalid',picture:null,created_at:'2026-11-20T12:00:00Z'},
};
const saved = ['affaan-m/ECC','NousResearch/hermes-agent'].map((item_id,i)=>({id:`30303030-3030-4030-8030-30303030303${i}`,user_id:owner,item_type:'repo',item_id,title:item_id,meta:null,created_at:'2026-11-20T12:00:00Z'}));
const events = Array.from({length:4},(_,i)=>({id:`pdf-event-${i}`,type:i%2?'PushEvent':'PullRequestEvent',actor:{login:'pdf-fixture'},repo:{name:'fixture/project'},created_at:`2026-11-${20-i}T12:00:00Z`,payload:i%2?{commits:[{message:'Synthetic commit'}]}:{action:'opened',pull_request:{number:i+1,title:`Synthetic PR ${i+1}`,html_url:`https://github.com/fixture/project/pull/${i+1}`,state:'open'}}}));
globalThis.fetch = async function(input, init) {
 const target=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(target.hostname==='pdf-fixture.test' || target.hostname==='api.pdf-fixture.test' || target.hostname==='api.test') {
  const body=JSON.parse(typeof init?.body==='string'?init.body:await new Response(init?.body).text());
  if(body.queries) throw Error('Unexpected batch query in PDF fixture');
  const q=body.query,params=body.params||[];
  let rows=[];
  if(/from "users"/i.test(q)) rows=users[params[0]]?[users[params[0]]]:[];
  else if(/from "saved_items"/i.test(q)) rows=params[0]===owner?saved:[];
  else if(!/from "applications"/i.test(q)) throw Error('Unexpected SQL in PDF fixture: '+q);
  const selection=q.match(/^select (.+?) from /i)?.[1];
  if(!selection) throw Error('Unexpected select in PDF fixture');
  const fields=selection.split(',').map((part)=>({name:[...part.matchAll(/"([^"]+)"/g)].at(-1)?.[1],dataTypeID:25}));
  if(fields.some(f=>!f.name)) throw Error('Unrecognized field in PDF fixture');
  return Response.json({fields,rows:rows.map(row=>fields.map(f=>row[f.name]??null)),rowCount:rows.length,command:'SELECT',rowAsArray:true});
 }
 if(target.hostname==='api.github.com' && target.pathname==='/users/pdf-fixture/events/public') {
  return Response.json(events);
 }
 return nativeFetch.call(this,input,init);
};
