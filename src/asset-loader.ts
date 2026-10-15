type Options={attempts?:number;timeoutMs?:number;retryDelayMs?:number;onAttempt?:(attempt:number,total:number)=>void};
class HttpError extends Error{constructor(public status:number){super(`HTTP ${status}`);}}
/** The deadline covers response headers AND decoding the complete body. */
async function load<T>(url:string,decode:(response:Response)=>Promise<T>,options:Options={}):Promise<T>{
 const attempts=options.attempts??2,timeoutMs=options.timeoutMs??90000;let cause:unknown;
 for(let attempt=1;attempt<=attempts;attempt++){
  options.onAttempt?.(attempt,attempts);const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const request=(async()=>{const response=await fetch(url,{signal:controller.signal,cache:attempt===1?'default':'reload'});if(!response.ok)throw new HttpError(response.status);return decode(response);})();
   const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('下载超时'));},timeoutMs);});
   return await Promise.race([request,deadline]);
  }catch(error){cause=error;if(error instanceof HttpError&&error.status>=400&&error.status<500&&![408,429].includes(error.status))break;}
  finally{clearTimeout(timer);}
  if(attempt<attempts)await new Promise(resolve=>setTimeout(resolve,(options.retryDelayMs??750)*attempt));
 }
 throw new Error(`无法完整下载 ${url}。请检查网络后重试。`,{cause});
}
export function fetchJSON<T=any>(url:string,options?:Options){return load<T>(url,response=>response.json(),options);}
export function fetchBuffer(url:string,options?:Options){return load(url,response=>response.arrayBuffer(),options);}

/** Optional downloads never reject the startup path; failed items stay retryable. */
export function createBackgroundLoader(tasks:{label:string;load:()=>Promise<void>}[],changed:(state:{running:boolean;completed:number;total:number;failed:string[]})=>void){
 const complete=new Set<string>(),failed=new Set<string>();let running=false;
 const emit=()=>changed({running,completed:complete.size,total:tasks.length,failed:[...failed]});
 return{async run(){if(running)return;running=true;emit();await Promise.all(tasks.filter(task=>!complete.has(task.label)).map(async task=>{try{await task.load();complete.add(task.label);failed.delete(task.label);}catch(error){failed.add(task.label);console.warn(`${task.label}暂未加载，基础场景继续运行`,error);}emit();}));running=false;emit();}};
}
