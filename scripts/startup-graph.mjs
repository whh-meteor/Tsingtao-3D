/** Inspect the emitted graph, not just the apparent size of the entry file. */
export function inspectStartupGraph(bundle){
 const entries=Object.values(bundle).filter(item=>item.type==='chunk'&&item.isEntry),visited=new Set();
 function visit(file){if(visited.has(file))return;visited.add(file);const item=bundle[file];if(!item||item.type!=='chunk')throw new Error(`启动程序包含无法检查的静态依赖：${file}`);
  if(Object.keys(item.modules).some(id=>id.includes('/@babylonjs/')))throw new Error(`启动入口静态依赖三维引擎：${file}`);
  for(const child of item.imports)visit(child);
 }
 for(const entry of entries)visit(entry.fileName);
 const bytes=[...visited].reduce((total,file)=>total+Buffer.byteLength(bundle[file].code),0);
 if(bytes>24576)throw new Error(`启动程序静态依赖合计${bytes}字节，超过24 KiB预算`);
 return{files:[...visited],bytes};
}
export function startupGraphGuard(){return{name:'qingdao-startup-budget',generateBundle:{order:'post',handler(_options,bundle){const result=inspectStartupGraph(bundle);this.info(`启动入口及全部静态依赖：${result.bytes}字节 / ${result.files.length}个文件，未依赖三维引擎`);}}};}
