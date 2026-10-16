export type Progress={loaded:number;total?:number;completed?:number;parts?:number};
type Options={attempts?:number;timeoutMs?:number;retryDelayMs?:number;onAttempt?:(attempt:number,total:number)=>void;onProgress?:(progress:Progress)=>void};
export type ChunkedAsset={encoding:'gzip';byteLength:number;parts:{url:string;bytes:number}[]};
export type PartCache={get:(url:string)=>Promise<ArrayBuffer|undefined>;put:(url:string,bytes:ArrayBuffer)=>Promise<void>;delete:(url:string)=>Promise<void>};
let chunks:Record<string,ChunkedAsset>={};
let partCache:PartCache|undefined;
export function configureAssetChunks(manifest:Record<string,ChunkedAsset>,cache?:PartCache){chunks=manifest;partCache=cache;}
export async function forgetAssetChunks(url:string){await Promise.all((chunks[url]?.parts??[]).map(async part=>{cachedParts.delete(part.url);await partCache?.delete(part.url);}));}
const cachedParts=new Map<string,Promise<ArrayBuffer>>();
let active=0;const waiting:(()=>void)[]=[];
async function limited<T>(work:()=>Promise<T>){if(active>=4)await new Promise<void>(resolve=>waiting.push(resolve));else active++;try{return await work();}finally{const next=waiting.shift();if(next)next();else active--;}}
class HttpError extends Error{constructor(public status:number){super(`HTTP ${status}`);}}
export class AssetDownloadError extends Error{constructor(message:string,public permanent=false,cause?:unknown){super(message,{cause});}}
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
 throw new AssetDownloadError(`无法完整下载 ${url}。请检查网络后重试。`,cause instanceof HttpError&&cause.status>=400&&cause.status<500&&![408,429].includes(cause.status),cause);
}
async function readBuffer(response:Response,onProgress?:Options['onProgress']){
 if(!response.body)return response.arrayBuffer();
 const reader=response.body.getReader(),pieces:Uint8Array[]=[];let loaded=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;pieces.push(value);loaded+=value.byteLength;onProgress?.({loaded});}}finally{reader.releaseLock();}
 const joined=new Uint8Array(loaded);let offset=0;for(const piece of pieces){joined.set(piece,offset);offset+=piece.byteLength;}return joined.buffer;
}
async function readChunks(url:string,asset:ChunkedAsset,options:Options={}){
 const total=asset.parts.reduce((sum,p)=>sum+p.bytes,0),received=new Map<string,number>();let completed=0;
 const progress=()=>options.onProgress?.({loaded:[...received.values()].reduce((a,b)=>a+b,0),total,completed,parts:asset.parts.length});
 try{
  const pieces=await Promise.all(asset.parts.map(async part=>{
   let pending=cachedParts.get(part.url);
   if(!pending){pending=limited(async()=>{const saved=await partCache?.get(part.url);if(saved?.byteLength===part.bytes)return saved;const result=await load(part.url,async response=>{const bytes=await readBuffer(response,p=>{received.set(part.url,p.loaded);progress();});if(bytes.byteLength!==part.bytes)throw new Error('分块长度不完整');return bytes;},{...options,timeoutMs:Math.min(options.timeoutMs??30000,30000)});await partCache?.put(part.url,result);return result;});cachedParts.set(part.url,pending);pending.catch(()=>{if(cachedParts.get(part.url)===pending)cachedParts.delete(part.url);});}
   const bytes=await pending;received.set(part.url,bytes.byteLength);completed++;progress();return bytes;
  }));
  const zipped=new Uint8Array(total);let offset=0;for(const part of pieces){zipped.set(new Uint8Array(part),offset);offset+=part.byteLength;}
  let decoded:ArrayBuffer;
  try{decoded=await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();if(decoded.byteLength!==asset.byteLength)throw new Error('解压后的资源长度不完整');}
  catch(error){await forgetAssetChunks(url);throw error;}
  // Retain a bounded set of completed pieces for retries, not every regional tile.
  while(cachedParts.size>512)cachedParts.delete(cachedParts.keys().next().value!);
  return decoded;
 }catch(cause){throw new AssetDownloadError(`无法完整下载 ${url}。已下载的分块会保留，请点击重试。`,cause instanceof AssetDownloadError&&cause.permanent,cause);}
}
export async function fetchJSON<T=any>(url:string,options?:Options):Promise<T>{
 const asset=chunks[url];if(asset&&typeof DecompressionStream!=='undefined')return JSON.parse(new TextDecoder().decode(await readChunks(url,asset,options)));
 return load<T>(url,async response=>JSON.parse(new TextDecoder().decode(await readBuffer(response,options?.onProgress))),options);
}
export function fetchBuffer(url:string,options?:Options){const asset=chunks[url];return asset&&typeof DecompressionStream!=='undefined'?readChunks(url,asset,options):load(url,response=>readBuffer(response,options?.onProgress),options);}

/** Optional downloads never reject the startup path; failed items stay retryable. */
export function createBackgroundLoader(tasks:{label:string;load:()=>Promise<void>}[],changed:(state:{running:boolean;completed:number;total:number;failed:string[]})=>void){
 const complete=new Set<string>(),failed=new Set<string>();let running=false;
 const emit=()=>changed({running,completed:complete.size,total:tasks.length,failed:[...failed]});
 return{async run(){if(running)return;running=true;emit();const pending=tasks.filter(task=>!complete.has(task.label));let next=0;await Promise.all(Array.from({length:Math.min(2,pending.length)},async()=>{while(next<pending.length){const task=pending[next++];try{await task.load();complete.add(task.label);failed.delete(task.label);}catch(error){failed.add(task.label);console.warn(`${task.label}暂未加载，基础场景继续运行`,error);}emit();}}));running=false;emit();}};
}
