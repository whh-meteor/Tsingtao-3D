import { Scene, Mesh, VertexData, StandardMaterial, Color3, Texture } from './babylon';

import { sampleGrid, sampleSurface, type Bounds, type HeightGrid } from './height';
export type { Bounds, HeightGrid } from './height';
export interface Region { bounds:Bounds; districts:{id:string;name:string;center:number[];polygons:{polygon:number[][];holes:number[][][]}[]}[];terrain:HeightGrid;detailTerrain:HeightGrid;regionalRoadsFile:string;chunksIndexFile:string;metadata:any }
function contains(b:Bounds,x:number,z:number){return x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ;}
export async function createTerrain(scene:Scene,region:Region,local:any){
 const [macro,detail]=await Promise.all([region.terrain,region.detailTerrain].map(async g=>{const res=await fetch(g.file);if(!res.ok)throw new Error('真实高程文件无法读取');return new Float32Array(await res.arrayBuffer());}));
 const raw=(x:number,z:number)=>contains(region.detailTerrain.bounds,x,z)?sampleGrid(region.detailTerrain,detail,x,z):sampleGrid(region.terrain,macro,x,z);
 const sample=(x:number,z:number)=>contains(region.detailTerrain.bounds,x,z)?sampleSurface(region.detailTerrain,detail,x,z):sampleSurface(region.terrain,macro,x,z);
 const material=new StandardMaterial('mountain-vegetation',scene);material.diffuseColor=Color3.White();material.specularColor=Color3.Black();material.useLogarithmicDepth=true;material.backFaceCulling=false;
 // A raster land mask cuts the genuine height mesh at the geographic coastline.
 // DEM water cells never become invented islands; the local OSM mask has precedence.
 const mask=local.regionalLandMask || region.metadata?.landMask;
 if(mask){const texture=new Texture(mask.url,scene,false,false,Texture.BILINEAR_SAMPLINGMODE);texture.hasAlpha=true;material.diffuseTexture=texture;material.useAlphaFromDiffuseTexture=true;material.transparencyMode=1;material.alphaCutOff=.45;}
 const collisionMeshes:Mesh[]=[];
 const detailMaterial=material.clone('detailed-coastal-ground')!;
 if(region.metadata?.detailLandMask){const t=new Texture(region.metadata.detailLandMask.url,scene,false,false,Texture.BILINEAR_SAMPLINGMODE);t.hasAlpha=true;detailMaterial.diffuseTexture=t;detailMaterial.useAlphaFromDiffuseTexture=true;detailMaterial.transparencyMode=1;detailMaterial.alphaCutOff=.45;}
 function patch(grid:HeightGrid,values:Float32Array,step:number,name:string,skipDetail:boolean){
  const p:number[]=[],idx:number[]=[],colors:number[]=[],uv:number[]=[];const b=grid.bounds;
  for(let r=0;r<grid.height;r+=step)for(let c=0;c<grid.width;c+=step){const x=b.minX+c*grid.spacingX,z=b.maxZ-r*grid.spacingZ,h=values[r*grid.width+c];p.push(x,Math.max(2.4,h),z);
   const n=Math.sin(x*.008)*Math.sin(z*.009)*.022;const rock=Math.max(0,Math.min(1,(h-450)/600));const green=Color3.Lerp(new Color3(.28+n,.43+n,.24+n),new Color3(.48,.50,.43),rock);colors.push(green.r,green.g,green.b,1);
   const texBounds=skipDetail?region.bounds:region.detailTerrain.bounds;
   uv.push((x-texBounds.minX)/(texBounds.maxX-texBounds.minX),(texBounds.maxZ-z)/(texBounds.maxZ-texBounds.minZ));
  }
  const w=Math.ceil(grid.width/step),h=Math.ceil(grid.height/step);
  for(let r=0;r<h-1;r++)for(let c=0;c<w-1;c++){const a=r*w+c;const x=p[a*3]+grid.spacingX*step/2,z=p[a*3+2]-grid.spacingZ*step/2;
   if(skipDetail&&contains(region.detailTerrain.bounds,x,z))continue;
   // Without a mask, water samples are omitted rather than flattened into land.
   if(!mask&&raw(x,z)<=.3)continue;
   idx.push(a,a+w,a+1,a+1,a+w,a+w+1);
  }
  const mesh=new Mesh(name,scene),v=new VertexData();v.positions=p;v.indices=idx;v.colors=colors;v.uvs=uv;const normals:number[]=[];VertexData.ComputeNormals(p,idx,normals);v.normals=normals;v.applyToMesh(mesh);mesh.material=skipDetail?material:detailMaterial;mesh.receiveShadows=true;mesh.isPickable=false;mesh.freezeWorldMatrix();return mesh;
 }
 const regionalMesh=patch(region.terrain,macro,1,'real-regional-relief',true);
 const detailedMesh=patch(region.detailTerrain,detail,1,'real-zhanqiao-relief',false);
 // Alpha-tested sea holes are visual only. Build a separate geographic land
 // collider so walking off the pier falls into water instead of an invisible floor.
 function pointInRing(x:number,z:number,ring:number[][]){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
 const positions=detailedMesh.getVerticesData('position')!,visualIndices=detailedMesh.getIndices()!,solid:number[]=[];
 const lb=local.metadata.bounds;
 for(let i=0;i<visualIndices.length;i+=3){const ids=[visualIndices[i],visualIndices[i+1],visualIndices[i+2]],x=ids.reduce((s,n)=>s+positions[n*3],0)/3,z=ids.reduce((s,n)=>s+positions[n*3+2],0)/3;
  const land=contains(lb,x,z)?local.land.some((p:any)=>pointInRing(x,z,p.polygon)&&!(p.holes||[]).some((h:number[][])=>pointInRing(x,z,h))):raw(x,z)>1;
  if(land)solid.push(...ids);
 }
 const collider=new Mesh('geographic-land-collision',scene);const cv=new VertexData();cv.positions=positions;cv.indices=solid;cv.applyToMesh(collider);collider.isVisible=false;collider.isPickable=false;collisionMeshes.push(collider);
 return {sample,raw,collisionMeshes,regionalMesh,detailedMesh,material,setLandMask(url:string){const texture=new Texture(url,scene,false,false,Texture.BILINEAR_SAMPLINGMODE);texture.hasAlpha=true;material.diffuseTexture=texture;material.useAlphaFromDiffuseTexture=true;material.transparencyMode=1;material.alphaCutOff=.45;}};
}
