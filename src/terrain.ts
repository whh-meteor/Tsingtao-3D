import { Scene, Mesh, VertexData, StandardMaterial, Color3, Texture } from './babylon';

import {fetchBuffer} from './asset-loader';
import type {TextureFactory} from './managed-textures';
import { sampleGrid, sampleSurface, type Bounds, type HeightGrid } from './height';
export type { Bounds, HeightGrid } from './height';
export interface Region { bounds:Bounds; districts:{id:string;name:string;center:number[];polygons:{polygon:number[][];holes:number[][][]}[]}[];terrain:HeightGrid;detailTerrain:HeightGrid;landmarkTerrain?:HeightGrid[];regionalRoadsFile:string;chunksIndexFile:string;metadata:any }
function contains(b:Bounds,x:number,z:number){return x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ;}
export async function createTerrain(scene:Scene,region:Region,local:any,surfaceFactory?:(raw:(x:number,z:number)=>number)=>((x:number,z:number)=>number|null),coastalBounds:Bounds[]=[],beachMask?:{url:string;bounds:Bounds},beachContains:(x:number,z:number)=>boolean=()=>false,textureFactory:TextureFactory=(url,s,sampling)=>new Texture(url,s,false,false,sampling)){
 const grids=[region.terrain,region.detailTerrain,...region.landmarkTerrain||[]];
 const values=await Promise.all(grids.map(async g=>{const buffer=await fetchBuffer(g.file);if(buffer.byteLength!==g.width*g.height*4)throw new Error('高程文件不完整：'+g.file);return new Float32Array(buffer);}));
 const original=values.map(a=>a.slice());const [macro,detail]=values;
 // Blend only the boundary collar to its actual coarse parent. This removes
 // gaps and changing road elevations at resolution joins without exaggeration.
 for(let i=1;i<grids.length;i++){const g=grids[i],a=values[i];for(let r=0;r<g.height;r++)for(let c=0;c<g.width;c++){const edge=Math.min(c,g.width-1-c,r,g.height-1-r);if(edge>=3)continue;const x=g.bounds.minX+c*g.spacingX,z=g.bounds.maxZ-r*g.spacingZ,t=edge/3,w=t*t*(3-2*t);a[r*g.width+c]=sampleGrid(region.terrain,macro,x,z)*(1-w)+a[r*g.width+c]*w;}}
 const gridIndex=(x:number,z:number)=>{for(let i=grids.length-1;i>0;i--)if(contains(grids[i].bounds,x,z))return i;return 0;};
 const raw=(x:number,z:number)=>{const i=gridIndex(x,z);return sampleGrid(grids[i],original[i],x,z);};
 const surfaceOverride=surfaceFactory?.(raw);
 const sample=(x:number,z:number)=>{const changed=surfaceOverride?.(x,z);if(changed!=null)return changed;const i=gridIndex(x,z);return sampleSurface(grids[i],values[i],x,z);};
 const coastalPatches:Bounds[]=[];
 for(const b of coastalBounds){let v={minX:Math.floor((b.minX-16)/400)*400,maxX:Math.ceil((b.maxX+16)/400)*400,minZ:Math.floor((b.minZ-16)/400)*400,maxZ:Math.ceil((b.maxZ+16)/400)*400};let changed=true;while(changed){changed=false;for(let i=0;i<coastalPatches.length;i++){const q=coastalPatches[i];if(v.minX<=q.maxX&&v.maxX>=q.minX&&v.minZ<=q.maxZ&&v.maxZ>=q.minZ){v={minX:Math.min(v.minX,q.minX),maxX:Math.max(v.maxX,q.maxX),minZ:Math.min(v.minZ,q.minZ),maxZ:Math.max(v.maxZ,q.maxZ)};coastalPatches.splice(i,1);changed=true;break;}}}coastalPatches.push(v);}
 const material=new StandardMaterial('mountain-vegetation',scene);material.diffuseColor=Color3.White();material.specularColor=Color3.Black();material.useLogarithmicDepth=true;material.backFaceCulling=false;
 // A raster land mask cuts the genuine height mesh at the geographic coastline.
 // DEM water cells never become invented islands; the local OSM mask has precedence.
 const mask=region.metadata?.terrainPalette||local.regionalLandMask || region.metadata?.landMask;
 if(mask){const texture=textureFactory(mask.url,scene,Texture.BILINEAR_SAMPLINGMODE);texture.hasAlpha=true;material.diffuseTexture=texture;material.useAlphaFromDiffuseTexture=true;material.transparencyMode=1;material.alphaCutOff=.45;}
 const collisionMeshes:Mesh[]=[];
 const detailMaterial=material.clone('detailed-coastal-ground')!;
 const detailMask=region.metadata?.detailTerrainPalette||region.metadata?.detailLandMask;
 if(detailMask){const t=textureFactory(detailMask.url,scene,Texture.BILINEAR_SAMPLINGMODE);t.hasAlpha=true;t.wrapU=t.wrapV=Texture.CLAMP_ADDRESSMODE;detailMaterial.diffuseTexture=t;detailMaterial.useAlphaFromDiffuseTexture=true;detailMaterial.transparencyMode=1;detailMaterial.alphaCutOff=.45;}
 if(beachMask){for(const [mat,b]of [[material,region.bounds],[detailMaterial,region.metadata?.detailLandMask?.bounds||region.detailTerrain.bounds]]as[StandardMaterial,Bounds][]){const t=textureFactory(beachMask.url,scene,Texture.BILINEAR_SAMPLINGMODE),q=beachMask.bounds;t.hasAlpha=true;t.getAlphaFromRGB=false;t.wrapU=t.wrapV=Texture.CLAMP_ADDRESSMODE;t.uRotationCenter=t.vRotationCenter=0;t.uScale=(b.maxX-b.minX)/(q.maxX-q.minX);t.vScale=(b.maxZ-b.minZ)/(q.maxZ-q.minZ);t.uOffset=(b.minX-q.minX)/(q.maxX-q.minX);t.vOffset=(q.maxZ-b.maxZ)/(q.maxZ-q.minZ);mat.opacityTexture=t;}}
 function patch(grid:HeightGrid,values:Float32Array,step:number,name:string,skipDetail:boolean,localTexture=false,coastal=false){
  const p:number[]=[],idx:number[]=[],colors:number[]=[],uv:number[]=[];const b=grid.bounds;
  for(let r=0;r<grid.height;r+=step)for(let c=0;c<grid.width;c+=step){const x=b.minX+c*grid.spacingX,z=b.maxZ-r*grid.spacingZ,h=values[r*grid.width+c];p.push(x,surfaceOverride?.(x,z)??Math.max(2.4,h),z);
   const n=Math.sin(x*.008)*Math.sin(z*.009)*.022;const rock=Math.max(0,Math.min(1,(h-450)/600));const green=region.metadata?.terrainPalette?Color3.White():Color3.Lerp(new Color3(.28+n,.43+n,.24+n),new Color3(.48,.50,.43),rock);colors.push(green.r,green.g,green.b,1);
   const texBounds=localTexture?(region.metadata?.detailLandMask?.bounds||region.detailTerrain.bounds):region.bounds;
   uv.push((x-texBounds.minX)/(texBounds.maxX-texBounds.minX),(texBounds.maxZ-z)/(texBounds.maxZ-texBounds.minZ));
  }
  const w=Math.ceil(grid.width/step),h=Math.ceil(grid.height/step);
  for(let r=0;r<h-1;r++)for(let c=0;c<w-1;c++){const a=r*w+c;const x=p[a*3]+grid.spacingX*step/2,z=p[a*3+2]-grid.spacingZ*step/2;
   if(skipDetail&&grids.slice(1).some(g=>contains(g.bounds,x,z)))continue;
   if(!coastal&&coastalPatches.some(b=>contains(b,x,z)))continue;
   // Without a mask, water samples are omitted rather than flattened into land.
   if(!mask&&raw(x,z)<=.3)continue;
   idx.push(a,a+w,a+1,a+1,a+w,a+w+1);
  }
  const mesh=new Mesh(name,scene),v=new VertexData();v.positions=p;v.indices=idx;v.colors=colors;v.uvs=uv;const normals:number[]=[];VertexData.ComputeNormals(p,idx,normals);v.normals=normals;v.applyToMesh(mesh);mesh.material=localTexture?detailMaterial:material;mesh.receiveShadows=true;mesh.isPickable=false;mesh.freezeWorldMatrix();return mesh;
 }
 const regionalMesh=patch(region.terrain,macro,1,'real-regional-relief',true);
 const detailedMesh=patch(region.detailTerrain,detail,1,'real-zhanqiao-relief',false,true);
 const landmarkMeshes=grids.slice(2).map((g,i)=>patch(g,values[i+2],1,'real-landmark-relief-'+i,false));
 const coastalMeshes=coastalPatches.map((bounds,i)=>{const width=Math.round((bounds.maxX-bounds.minX)/8)+1,height=Math.round((bounds.maxZ-bounds.minZ)/8)+1,g:HeightGrid={file:'',width,height,bounds,spacingX:8,spacingZ:8},a=new Float32Array(width*height);for(let r=0;r<height;r++)for(let c=0;c<width;c++)a[r*width+c]=sample(bounds.minX+c*8,bounds.maxZ-r*8);const localTexture=contains(region.detailTerrain.bounds,bounds.minX,bounds.minZ)&&contains(region.detailTerrain.bounds,bounds.maxX,bounds.maxZ);return patch(g,a,1,'coastal beach ground '+i,false,localTexture,true);});
 const coastalLow=coastalPatches.map((bounds,i)=>{const width=Math.round((bounds.maxX-bounds.minX)/40)+1,height=Math.round((bounds.maxZ-bounds.minZ)/40)+1,g:HeightGrid={file:'',width,height,bounds,spacingX:40,spacingZ:40},a=new Float32Array(width*height);for(let r=0;r<height;r++)for(let c=0;c<width;c++)a[r*width+c]=sample(bounds.minX+c*40,bounds.maxZ-r*40);const localTexture=contains(region.detailTerrain.bounds,bounds.minX,bounds.minZ)&&contains(region.detailTerrain.bounds,bounds.maxX,bounds.maxZ);const m=patch(g,a,1,'coastal low ground '+i,false,localTexture,true);m.setEnabled(false);return m;});
 // Alpha-tested sea holes are visual only. Build a separate geographic land
 // collider so walking off the pier falls into water instead of an invisible floor.
 function pointInRing(x:number,z:number,ring:number[][]){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
 const lb=local.metadata.bounds;
 for(const ground of [detailedMesh,...coastalMeshes]){
 const positions=ground.getVerticesData('position')!,visualIndices=ground.getIndices()!,solid:number[]=[];
 for(let i=0;i<visualIndices.length;i+=3){const ids=[visualIndices[i],visualIndices[i+1],visualIndices[i+2]],x=ids.reduce((s,n)=>s+positions[n*3],0)/3,z=ids.reduce((s,n)=>s+positions[n*3+2],0)/3;
  const land=beachContains(x,z)|| (contains(lb,x,z)?local.land.some((p:any)=>pointInRing(x,z,p.polygon)&&!(p.holes||[]).some((h:number[][])=>pointInRing(x,z,h))):raw(x,z)>1);
  if(land)solid.push(...ids);
 }
 const collider=new Mesh('geographic-land-collision '+ground.name,scene);const cv=new VertexData();cv.positions=positions;cv.indices=solid;cv.applyToMesh(collider);collider.isVisible=false;collider.isPickable=false;collisionMeshes.push(collider);}
 return {sample,raw,collisionMeshes,regionalMesh,detailedMesh,landmarkMeshes,coastalMeshes,material,setDetail(radius:number,focus:{x:number;z:number}){for(let i=0;i<coastalPatches.length;i++){const b=coastalPatches[i],distance=Math.hypot(Math.max(b.minX-focus.x,0,focus.x-b.maxX),Math.max(b.minZ-focus.z,0,focus.z-b.maxZ)),near=radius<3500&&distance<1800;coastalMeshes[i].setEnabled(near);coastalLow[i].setEnabled(!near);}}};
}
