import {execFileSync} from 'node:child_process';
let cached;
export function sourceCommit(){
 if(cached!==undefined)return cached;
 try{const rev=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();return cached=/^[a-f0-9]{40}$/.test(rev)?rev:'';}catch{return cached='';}
}
