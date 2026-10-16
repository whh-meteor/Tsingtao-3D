import {AssetDownloadError} from './asset-loader';
import {startupStatus} from './startup-ui';

/** Keep the independent preview usable while an interrupted resource recovers. */
export async function recoverResource<T>(label:string,load:()=>Promise<T>,options:{wait?:(ms:number)=>Promise<void>;report?:(text:string)=>void}={}){
 const wait=options.wait??retryWait,report=options.report??startupStatus;
 for(let round=0;;round++){
  try{return await load();}
  catch(error){if(!(error instanceof AssetDownloadError)||error.permanent)throw error;
   const seconds=Math.min(30,3*2**Math.min(round,4));
   report(`${label}连接中断，${seconds} 秒后自动重试；可继续探索轻量场景。`);
   await wait(seconds*1000);
  }
 }
}
export function retryWait(ms:number){return new Promise<void>(resolve=>{
 const done=()=>{clearTimeout(timer);window.removeEventListener('online',done);window.removeEventListener('qingdao-retry',done);resolve();};
 const timer=setTimeout(done,ms);window.addEventListener('online',done,{once:true});window.addEventListener('qingdao-retry',done,{once:true});
});}
