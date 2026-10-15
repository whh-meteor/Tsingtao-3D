import { Scene, Mesh, VertexData, StandardMaterial, Color3, Vector3 } from './babylon';
import earcut from 'earcut';
import {fetchJSON} from './asset-loader';
import type { Region, Bounds } from './terrain';
import {createCityMaterials} from './city-lighting';
import type { Material } from '@babylonjs/core/Materials/material';
type Road={points:number[][];width:number;type:string;id:string};
type Chunk={id:string;file:string;bounds:Bounds;buildingCount:number;roadCount:number};
class Batch {
 coast=0;p:number[]=[];indices:number[]=[];color:number[]=[];uv:number[]=[];
 tri(a:number[],b:number[],c:number[],t:Color3){const n=this.p.length/3;this.p.push(...a,...b,...c);this.indices.push(n,n+2,n+1);for(const p of [a,b,c]){this.color.push(t.r,t.g,t.b,this.coast);this.uv.push((p[0]+p[2])*.25,p[1]/3.4);}}
 quad(a:number[],b:number[],c:number[],d:number[],t:Color3){this.tri(a,b,c,t);this.tri(a,c,d,t);}
 finish(name:string,scene:Scene,material:Material){if(!this.indices.length)return null;const m=new Mesh(name,scene),v=new VertexData();v.positions=this.p;v.indices=this.indices;v.colors=this.color;v.uvs=this.uv;const normals:number[]=[];VertexData.ComputeNormals(this.p,this.indices,normals);v.normals=normals;v.applyToMesh(m);m.material=material;m.hasVertexAlpha=false;m.isPickable=false;m.freezeWorldMatrix();return m;}
}
const distance=(b:Bounds,x:number,z:number)=>Math.hypot(Math.max(b.minX-x,0,x-b.maxX),Math.max(b.minZ-z,0,z-b.maxZ));
export async function createRegional(scene:Scene,region:Region,sample:(x:number,z:number)=>number,localBounds:Bounds,excludedBuildingIds=new Set<string>(),excludedRoadIds=new Set<string>(),coastalIds=new Set<string>()){
 const [index,roadsData]=await Promise.all([fetchJSON(region.chunksIndexFile,{timeoutMs:120000}),fetchJSON(region.regionalRoadsFile,{timeoutMs:120000})]);
 const asphalt=new StandardMaterial('regional-road',scene);asphalt.diffuseColor=Color3.White();asphalt.specularColor=Color3.Black();asphalt.useLogarithmicDepth=true;asphalt.zOffset=-3;asphalt.zOffsetUnits=-3;
 const cityMaterials=createCityMaterials(scene),wall=cityMaterials.wall,roof=cityMaterials.roof;
 function road(batch:Batch,r:Road){const color=Color3.FromHexString('#667271');let half=Math.max(2,r.width/2);for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<.2)continue;
  if(a[0]>=localBounds.minX&&a[0]<=localBounds.maxX&&a[1]>=localBounds.minZ&&a[1]<=localBounds.maxZ&&b[0]>=localBounds.minX&&b[0]<=localBounds.maxX&&b[1]>=localBounds.minZ&&b[1]<=localBounds.maxZ)continue;
  const n=Math.max(1,Math.ceil(len/60)),nx=-(b[1]-a[1])/len*half,nz=(b[0]-a[0])/len*half;
  for(let k=0;k<n;k++){const p=[a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n],q=[a[0]+(b[0]-a[0])*(k+1)/n,a[1]+(b[1]-a[1])*(k+1)/n];
   const y=sample(p[0],p[1])+.7,y2=sample(q[0],q[1])+.7;
   batch.quad([p[0]-nx,y,p[1]-nz],[p[0]+nx,y,p[1]+nz],[q[0]+nx,y2,q[1]+nz],[q[0]-nx,y2,q[1]-nz],color);
  }
 }}
 const roads:Mesh[]=[];
 const roadGroups=new Map<string,Batch>();for(const r of roadsData.roads as Road[]){if(excludedRoadIds.has(String(r.id)))continue;const p=r.points[Math.floor(r.points.length/2)];if(!p)continue;
  const key=`${Math.floor(p[0]/8000)}_${Math.floor(p[1]/8000)}`;let batch=roadGroups.get(key);if(!batch)roadGroups.set(key,batch=new Batch());road(batch,r);}
 for(const [key,b]of roadGroups){const m=b.finish('regional-road-'+key,scene,asphalt);if(m)roads.push(m);}
 const groupKey=(c:Chunk)=>Math.floor(c.bounds.minX/8000)+'_'+Math.floor(c.bounds.minZ/8000);const groupChunks=new Map<string,Chunk[]>();for(const c of index.chunks as Chunk[]){if(!c.buildingCount)continue;const k=groupKey(c);if(!groupChunks.has(k))groupChunks.set(k,[]);groupChunks.get(k)!.push(c);}let detailLOD=true;const displayedGroups=new Set<string>();
 const loaded=new Map<string,Mesh[]>(),pending=new Set<string>();let totalBuildings=0;let lastUpdate=-10;
 function insideLocal(x:number,z:number){return x>=localBounds.minX&&x<=localBounds.maxX&&z>=localBounds.minZ&&z<=localBounds.maxZ;}
 async function load(c:Chunk){pending.add(c.id);try{const data=await fetchJSON(c.file,{attempts:2,timeoutMs:30000});const walls=new Batch(),roofs=new Batch();
  let processed=0;for(const b of data.buildings){if(excludedBuildingIds.has(String(b.id)))continue;if(processed++%150===149)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));const poly=b.polygon as number[][];if(poly.length<3)continue;const cx=poly.reduce((s,p)=>s+p[0],0)/poly.length,cz=poly.reduce((s,p)=>s+p[1],0)/poly.length;if(insideLocal(cx,cz))continue;
   walls.coast=coastalIds.has(String(b.id))?1:0;const base=Math.max(...poly.map(p=>sample(p[0],p[1]))),height=b.height||9;const top=base+height;const hash=String(b.id).split('').reduce((s,c)=>s+c.charCodeAt(0),0);
   const wt=Color3.FromHexString(['#eadcc4','#e6e5d6','#d6e1d6'][hash%3]),rt=Color3.FromHexString(height<22?['#bd6449','#af5038','#c37a57'][hash%3]:'#929d98');
   for(let i=0;i<poly.length;i++){const a=poly[i],q=poly[(i+1)%poly.length];walls.quad([a[0],sample(a[0],a[1])-.3,a[1]],[a[0],top,a[1]],[q[0],top,q[1]],[q[0],sample(q[0],q[1])-.3,q[1]],wt);}
   const points=poly.flat(),tri=earcut(points);for(let i=0;i<tri.length;i+=3){const a=poly[tri[i]],q=poly[tri[i+1]],c=poly[tri[i+2]];roofs.tri([a[0],top,a[1]],[c[0],top,c[1]],[q[0],top,q[1]],rt);}
  }
  const meshes=[walls.finish('district-wall-'+c.id,scene,wall),roofs.finish('district-roof-'+c.id,scene,roof)].filter(Boolean) as Mesh[];
  meshes.forEach(m=>m.setEnabled(false));loaded.set(c.id,meshes);totalBuildings+=c.buildingCount;
 }catch(e){console.warn('区域分块加载失败',c.id,e);}finally{pending.delete(c.id);}}
 return {index,roadsData,cityMaterials,detailReady:(key:string)=>displayedGroups.has(key),stats:()=>({loaded:loaded.size,pending:pending.size,buildings:totalBuildings,total:index.totals}),
  update(time:number,camera:Vector3,target:Vector3){if(time-lastUpdate<.6)return;lastUpdate=time;const altitude=camera.y;
   if(detailLOD&&altitude>11000)detailLOD=false;else if(!detailLOD&&altitude<8000)detailLOD=true;
   const visibleRange=Math.max(5000,Math.min(18000,altitude*3));
   const nearest=(index.chunks as Chunk[]).filter(c=>c.buildingCount>0&&distance(c.bounds,target.x,target.z)<visibleRange).sort((a,b)=>distance(a.bounds,target.x,target.z)-distance(b.bounds,target.x,target.z));
   const groups=detailLOD?[...new Set(nearest.map(groupKey))].slice(0,3):[];
   const candidates=groups.flatMap(k=>groupChunks.get(k)!).sort((a,b)=>distance(a.bounds,target.x,target.z)-distance(b.bounds,target.x,target.z));
   displayedGroups.clear();for(const k of groups)if(groupChunks.get(k)!.every(c=>loaded.has(c.id)))displayedGroups.add(k);
   const visible=new Set(candidates.map(c=>c.id));for(const [id,meshes]of loaded){const c=(index.chunks as Chunk[]).find(c=>c.id===id)!;for(const mesh of meshes)mesh.setEnabled(displayedGroups.has(groupKey(c)));}
   for(const c of candidates){if(pending.size>=2)break;if(!loaded.has(c.id)&&!pending.has(c.id))void load(c);}
   // Keep only a bounded working set when moving between distant districts.
   if(loaded.size>72)for(const [id,meshes]of loaded){if(loaded.size<=60)break;if(!visible.has(id)){meshes.forEach(m=>m.dispose());loaded.delete(id);}}
   roads.forEach(m=>{const b=m.getBoundingInfo().boundingBox;const nearest=distance({minX:b.minimumWorld.x,maxX:b.maximumWorld.x,minZ:b.minimumWorld.z,maxZ:b.maximumWorld.z},camera.x,camera.z);m.setEnabled(altitude<32000&&nearest<Math.max(25000,altitude*5));});
  }};
}
