import {startupFailure,startupStatus} from './startup-ui';
import {prepareModuleDelivery,preparePrograms} from './module-delivery';
async function boot(){
 // async modules must not hold DOMContentLoaded hostage to a slow transfer.
 // A warm cached entry can arrive before the HTML's canvas has been parsed.
 if(document.readyState==='loading')await new Promise<void>(resolve=>document.addEventListener('DOMContentLoaded',()=>resolve(),{once:true}));
document.documentElement.dataset.bootStarted='true';
startupStatus('启动程序已就绪，正在下载三维引擎与场景程序');
// A stalled native module request does not emit an error immediately.
// Keep this message independent of the engine and do not restart it automatically.
const slow=setTimeout(()=>{startupStatus('启动资源仍在下载，网络响应较慢；可等待或重新加载。');const retry=document.getElementById('boot-retry');if(retry)retry.hidden=false;},20000);
prepareModuleDelivery().then(async chunked=>{if(chunked)await preparePrograms();return import('./main');}).then(()=>clearTimeout(slow),error=>{clearTimeout(slow);startupFailure(error);});
}
void boot();
