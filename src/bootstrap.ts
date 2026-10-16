import {startupFailure,startupStatus} from './startup-ui';
import {prepareModuleDelivery} from './module-delivery';
startupStatus('启动程序已就绪，正在下载三维引擎与场景程序');
// A stalled native module request does not emit an error immediately.
// Keep this message independent of the engine and do not restart it automatically.
const slow=setTimeout(()=>{startupStatus('启动资源仍在下载，网络响应较慢；可等待或重新加载。');const retry=document.getElementById('boot-retry');if(retry)retry.hidden=false;},20000);
prepareModuleDelivery().then(()=>import('./main')).then(()=>clearTimeout(slow),error=>{clearTimeout(slow);startupFailure(error);});
