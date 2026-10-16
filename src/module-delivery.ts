import workerURL from 'virtual:module-worker-url';
import {startupStatus,downloadStatus} from './startup-ui';

/** Wait for control before import(); registration alone does not protect first load. */
export async function prepareModuleDelivery(){
 if(import.meta.env.DEV||!('serviceWorker'in navigator)||typeof DecompressionStream==='undefined')return false;
 startupStatus('正在准备三维程序分块下载');
 const container=navigator.serviceWorker,expected=new URL(workerURL,location.origin).href;
 const receive=(event:MessageEvent)=>{
  if(event.source!==container.controller||event.data?.channel!=='qingdao-program')return;
  const data=event.data;if(data.type==='progress')downloadStatus(/\/babylon-/.test(data.file)?'三维引擎':'场景程序',data);
  if(data.type==='error')startupStatus(`${data.message} · ${data.file}`);
 };
 container.addEventListener('message',receive);
 let timer:ReturnType<typeof setTimeout>|undefined,expired=false,cancelWait:(()=>void)|undefined;
 try{
  await Promise.race([
   (async()=>{
    const registration=await container.register(workerURL,{scope:'/',updateViaCache:'none'});
    if(expired)return;
    await new Promise<void>((resolve,reject)=>{
     let watched:ServiceWorker|undefined;
     const done=()=>{
      const worker=[registration.installing,registration.waiting,registration.active].find(item=>item?.scriptURL===expected);
      if(worker&&worker!==watched){watched?.removeEventListener('statechange',done);watched=worker;watched.addEventListener('statechange',done);}
      if(watched?.state==='activated'&&container.controller===watched){clean();resolve();}
      else if(watched?.state==='redundant'){clean();reject(new Error('程序下载器更新失败'));}
     };
     const clean=()=>{container.removeEventListener('controllerchange',done);registration.removeEventListener('updatefound',done);watched?.removeEventListener('statechange',done);};
     cancelWait=clean;
     container.addEventListener('controllerchange',done);registration.addEventListener('updatefound',done);done();
    });
   })(),
   // A cold CDN request for this small script can itself exceed 20 seconds.
   // Keep waiting for control rather than prematurely requesting the large modules.
   new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('程序分块下载器连接超时'));},60000);})
  ]);
  document.documentElement.dataset.programDelivery='chunks';startupStatus('三维程序分块下载已就绪');return true;
 }catch(error){container.removeEventListener('message',receive);document.documentElement.dataset.programDelivery='native';startupStatus(`${error instanceof Error?error.message:String(error)}，正在尝试标准加载`);return false;}
 finally{clearTimeout(timer);cancelWait?.();}
}
