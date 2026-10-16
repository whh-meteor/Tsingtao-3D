import {Texture,type Scene} from './babylon';
import type {ImageResources} from './image-resources';
export type TextureFactory=(url:string,scene:Scene,sampling:number)=>Texture;
export function managedTextures(images:ImageResources){
 const pending:Promise<void>[]=[];
 const create:TextureFactory=(url,scene,sampling)=>{
  let resolve!:()=>void,reject!:(error:Error)=>void;
  const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});pending.push(promise);promise.catch(()=>{});
  const timer=setTimeout(()=>reject(new Error('纹理上传超时：'+url)),30000);
  try{return new Texture(url,scene,{buffer:images.get(url),invertY:false,samplingMode:sampling,onLoad:()=>{clearTimeout(timer);resolve();},onError:message=>{clearTimeout(timer);reject(new Error('纹理上传失败：'+url+' · '+message));}});}
  catch(error){clearTimeout(timer);reject(error instanceof Error?error:new Error(String(error)));throw error;}
 };
 return{create,ready:()=>Promise.all(pending)};
}
