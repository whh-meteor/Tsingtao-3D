import {mkdir,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

const origin=new URL(process.argv[2]||'https://tsingtao.cupgis.cn/');
const report={origin:origin.origin,checkedAtUTC:new Date().toISOString(),resources:[],errors:[]};
async function download(path,expectedBytes){
 const url=new URL(path,origin);if(url.origin!==origin.origin)throw new Error('检查清单包含其他域名：'+url.origin);
 const started=performance.now();let cause;
 for(let attempt=1;attempt<=2;attempt++){
  let status=0;
  try{const response=await fetch(url,{signal:AbortSignal.timeout(30000),cache:'no-store'});status=response.status;if(!response.ok)throw new Error(`HTTP ${response.status}`);const bytes=Buffer.from(await response.arrayBuffer());if(expectedBytes!==undefined&&bytes.length!==expectedBytes)throw new Error(`长度不符：${bytes.length}/${expectedBytes}`);report.resources.push({path:url.pathname,bytes:bytes.length,attempt,milliseconds:Math.round(performance.now()-started)});return bytes;}
  catch(error){cause=error;if(status>=400&&status<500&&![408,429].includes(status))break;}
 }
 const message=`${url.pathname}: ${cause.message}`;report.errors.push(message);throw new Error(message);
}
async function parallel(items,fn){let next=0;const results=new Array(items.length);await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{while(next<items.length){const index=next++;results[index]=await fn(items[index]);}}));return results;}
try{
 const html=(await download('/')).toString('utf8');report.version=html.match(/加载详情[^<]*v([\d.]+)/)?.[1]??'unknown';
 console.log(`线上版本：${report.version}`);
 const entries=[...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="(\/assets\/[^"\s]+)"/g)].map(m=>m[1]);const bootFiles=await parallel([...new Set(entries)],path=>download(path));
 const delivery=JSON.parse((await download('/module-delivery.json')).toString('utf8'));
 if(delivery.version!==report.version)throw new Error(`HTML与交付清单版本不同：${report.version}/${delivery.version}`);
 if(delivery.revision&&!bootFiles.some(bytes=>bytes.toString('utf8').includes('&rev='+delivery.revision)))throw new Error('入口与交付清单的构建指纹不同');
 const worker=(await download('/module-worker.js')).toString('utf8');
 const declaredPrograms=new Set(bootFiles.flatMap(bytes=>[...bytes.toString('utf8').matchAll(/(?:assets\/|\.\/)((?:main|babylon)-[\w-]+\.js)/g)].map(m=>'/assets/'+m[1])));
 for(const path of declaredPrograms)if(!delivery.modules[path])throw new Error('入口引用的程序未包含在分块清单中：'+path);
 for(const[path,spec]of Object.entries(delivery.modules)){
  if(!path.startsWith('/assets/')||!spec.parts?.length||spec.parts.length>128)throw new Error('无效的程序交付清单');
  if(!worker.includes(path)||!worker.includes(spec.sha256))throw new Error('下载器与交付清单内容不同：'+path);
  console.log(`校验 ${path}：${spec.parts.length} 个分块`);
  const pieces=await parallel(spec.parts,part=>{if(!/^\/data\/segments\/[a-f0-9]+-\d+\.bin$/.test(part.url)||part.bytes>32768)throw new Error('无效的分块路径/尺寸');return download(part.url,part.bytes);});
  const source=gunzipSync(Buffer.concat(pieces),{maxOutputLength:spec.byteLength});
  if(source.length!==spec.byteLength||createHash('sha256').update(source).digest('hex')!==spec.sha256)throw new Error('程序完整性校验失败：'+path);
 }
 console.log('入口、下载器及全部大型程序分块校验通过。此检查不替代浏览器渲染验收。');
}catch(error){if(!report.errors.includes(error.message))report.errors.push(error.message);console.error('部署检查失败：'+error.message);process.exitCode=1;}
finally{await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});await writeFile(new URL('../artifacts/deployment-check.json',import.meta.url),JSON.stringify(report,null,2)+'\n');}
