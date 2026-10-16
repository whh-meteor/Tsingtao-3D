import {fetchBuffer,forgetAssetChunks,AssetDownloadError} from './asset-loader';

export type DecodedImage={image:HTMLImageElement;release:()=>void;source?:string};
export async function verifyPNG(bytes:ArrayBuffer,sha256:string){
 const a=new Uint8Array(bytes),signature=[137,80,78,71,13,10,26,10];
 if(a.length<33||!signature.every((n,i)=>a[i]===n))throw new AssetDownloadError('图片不是完整的 PNG 数据');
 const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
 if(actual!==sha256)throw new AssetDownloadError('PNG 完整性校验失败');
}
export function decodePNG(bytes:ArrayBuffer):Promise<DecodedImage>{return new Promise((resolve,reject)=>{
 const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'})),image=new Image();
 let timer:ReturnType<typeof setTimeout>;
 const clean=()=>{clearTimeout(timer);image.onload=null;image.onerror=null;};
 const fail=()=>{clean();URL.revokeObjectURL(url);reject(new AssetDownloadError('已校验 PNG 无法解码',true));};
 image.onload=()=>{clean();if(!image.naturalWidth||!image.naturalHeight){fail();return;}resolve({image,release:()=>URL.revokeObjectURL(url)});};
 image.onerror=fail;timer=setTimeout(fail,15000);image.src=url;
});}
/** Share decoded source pixels, but keep per-material UV transforms independent. */
export class ImageResources{
 private pending=new Map<string,Promise<DecodedImage>>();
 private decoded=new Map<string,DecodedImage>();
 constructor(private fetchBytes=fetchBuffer,private decode=decodePNG,private usingBackup:(url:string)=>void=()=>{}){}
 async load(url:string,sha256:string,backupURL?:string){
  if(!/^[a-f0-9]{64}$/.test(sha256))throw new Error('缺少纹理构建摘要：'+url);
  let pending=this.pending.get(url);
  if(!pending){pending=(async()=>{let bytes:ArrayBuffer,source=url;
   try{bytes=await this.fetchBytes(url);try{await verifyPNG(bytes,sha256);}catch(error){await forgetAssetChunks(url);throw error;}}
   catch(primaryError){
    if(!backupURL||!/^https:\/\/raw\.githubusercontent\.com\/whh-meteor\/Tsingtao-3D\/[a-f0-9]{40}\/public\/data\/[\w-]+\.png$/.test(backupURL))throw primaryError;
    source=backupURL;this.usingBackup(url);
    try{bytes=await this.fetchBytes(backupURL);await verifyPNG(bytes,sha256);}
    catch(backupError){throw new AssetDownloadError('主线路与备用源均未完整取得纹理：'+url,primaryError instanceof AssetDownloadError&&primaryError.permanent&&backupError instanceof AssetDownloadError&&backupError.permanent,{primaryError,backupError});}
   }
   const decoded=await this.decode(bytes);decoded.source=source;this.decoded.set(url,decoded);return decoded;
  })();this.pending.set(url,pending);pending.catch(()=>{if(this.pending.get(url)===pending)this.pending.delete(url);});}
  return pending;
 }
 get(url:string){const decoded=this.decoded.get(url);if(!decoded)throw new Error('关键纹理尚未准备好：'+url);return decoded.image;}
 dispose(){for(const item of this.decoded.values())item.release();this.decoded.clear();this.pending.clear();}
}
export function criticalImageURLs(local:any,region:any,beaches:any){
 const mask=region.metadata?.terrainPalette||local.regionalLandMask||region.metadata?.landMask;
 const detail=region.metadata?.detailTerrainPalette||region.metadata?.detailLandMask;
 return[...new Set<string>([mask?.url,detail?.url,beaches.metadata?.groundCutMask?.url,local.shoreTexture?.url||local.shoreDistanceTexture?.url||'/data/shore-distance.png',region.shoreTexture?.url||local.shoreTexture?.url||'/data/shore-distance.png'].filter(Boolean))];
}
