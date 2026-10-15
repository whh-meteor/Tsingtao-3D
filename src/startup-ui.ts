import type {Progress} from './asset-loader';
export function startupStatus(message:string){
 const status=document.getElementById('load-status');if(status)status.textContent=message;
 const log=document.getElementById('load-log');if(log&&log.lastElementChild?.textContent!==message){const item=document.createElement('li');item.textContent=message;log.append(item);while(log.children.length>12)log.firstElementChild?.remove();}
}
export function downloadStatus(label:string,progress:Progress){
 const size=(progress.loaded/1024).toFixed(0),total=progress.total?` / ${(progress.total/1024).toFixed(0)} KiB`:' KiB';
 const status=document.getElementById('load-status');if(status)status.textContent=`正在下载${label} · ${size}${total}${progress.parts?` · ${progress.completed}/${progress.parts} 块`:''}`;
}
export function startupFailure(error:unknown){
 console.error(error);startupStatus(error instanceof Error?error.message:String(error));
 document.querySelector('#boot-root .spinner')?.remove();const retry=document.getElementById('boot-retry');if(retry)retry.hidden=false;
 const details=document.querySelector<HTMLDetailsElement>('#boot-root details');if(details)details.open=true;
}
