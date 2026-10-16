import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import {runInNewContext} from 'node:vm';

const source=readFileSync('src/module-delivery.ts','utf8').replace("import workerURL from 'virtual:module-worker-url';","const workerURL='/module-worker.js?v=test';");
const code=buildSync({stdin:{contents:source,resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},bundle:true,platform:'browser',format:'cjs',write:false,define:{'import.meta.env.DEV':'false'}}).outputFiles[0].text;
function runtime(navigator,timers={setTimeout,clearTimeout}){const module={exports:{}},dataset={},status={textContent:''};runInNewContext(code,{module,exports:module.exports,navigator,DecompressionStream,URL,location:{origin:'https://qingdao.test'},...timers,console,document:{documentElement:{dataset},getElementById:id=>id==='load-status'?status:null}});return{prepare:module.exports.prepareModuleDelivery,dataset,status};}

test('a new build worker must control the page before importing programs, even with an old active registration',async()=>{
 const old=new EventTarget();old.state='activated';old.scriptURL='https://qingdao.test/module-worker.js?v=test&rev=previous';const updating=new EventTarget();updating.state='installing';updating.scriptURL='https://qingdao.test/module-worker.js?v=test';
 const registration=new EventTarget();registration.installing=undefined;registration.active=old;
 const container=new EventTarget();container.controller=old;container.register=async()=>registration;
 const app=runtime({serviceWorker:container});let ready=false;const pending=app.prepare().then(value=>{ready=true;return value;});await new Promise(setImmediate);assert.equal(ready,false);
 registration.installing=updating;registration.dispatchEvent(new Event('updatefound'));await new Promise(setImmediate);assert.equal(ready,false);
 updating.state='activated';updating.dispatchEvent(new Event('statechange'));await new Promise(setImmediate);assert.equal(ready,false);
 container.controller=updating;container.dispatchEvent(new Event('controllerchange'));assert.equal(await pending,true);assert.equal(app.dataset.programDelivery,'chunks');
});
test('registration denial has a visible standard-loading fallback instead of leaving startup pending',async()=>{
 const container=new EventTarget();container.register=async()=>{throw new Error('registration denied');};const app=runtime({serviceWorker:container});
 assert.equal(await app.prepare(),false);assert.equal(app.dataset.programDelivery,'native');assert.match(app.status.textContent,/标准加载/);
});
test('a downloader taking longer than 20 seconds still gains control before program loading',async()=>{
 let now=0,deadline=0,onTimeout,registerDone;
 const container=new EventTarget();container.register=()=>new Promise(resolve=>{registerDone=resolve;});
 const worker=new EventTarget();worker.state='activated';worker.scriptURL='https://qingdao.test/module-worker.js?v=test';
 const registration=new EventTarget();registration.active=worker;
 const app=runtime({serviceWorker:container},{setTimeout:(fn,delay)=>{onTimeout=fn;deadline=now+delay;return 1;},clearTimeout:()=>{onTimeout=undefined;}});
 let finished=false;const pending=app.prepare().then(result=>{finished=true;return result;});
 now=26000;if(now>=deadline)onTimeout();await new Promise(setImmediate);
 assert.equal(finished,false);assert.equal(app.dataset.programDelivery,undefined);
 container.controller=worker;registerDone(registration);
 assert.equal(await pending,true);assert.equal(app.dataset.programDelivery,'chunks');assert.equal(onTimeout,undefined);
});
