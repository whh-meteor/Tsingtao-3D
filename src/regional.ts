import { Scene, Mesh, VertexData, StandardMaterial, Color3, Vector3 } from './babylon';
import earcut from 'earcut';
import type { Region, Bounds } from './terrain';
type Road={points:number[][];width:number;type:string;id:string};
type Chunk={id:string;file:string;bounds:Bounds;buildingCount:number;roadCount:number};
class Batch {
 p:number[]=[];indices:number[]=[];color:number[]=[];
 tri(a:number[],b:number[],c:number[],t:Color3){const n=this.p.length/3;this.p.push(...a,...b,...c);this.indices.push(n,n+2,n+1);for(let k=0;k<3;k++)this.color.push(t.r,t.g,t.b,1);}
 quad(a:number[],b:number[],c:number[],d:number[],t:Color3){this.tri(a,b,c,t);this.tri(a,c,d,t);}
 finish(name:string,scene:Scene,material:StandardMaterial){if(!this.indices.length)return null;const m=new Mesh(name,scene),v=new VertexData();v.positions=this.p;v.indices=this.indices;v.colors=this.color;const normals:number[]=[];VertexData.ComputeNormals(this.p,this.indices,normals);v.normals=normals;v.applyToMesh(m);m.material=material;m.isPickable=false;m.freezeWorldMatrix();return m;}
}
const distance=(b:Bounds,x:number,z:number)=>Math.hypot(Math.max(b.minX-x,0,x-b.maxX),Math.max(b.minZ-z,0,z-b.maxZ));
export async function createRegional(scene:Scene,region:Region,sample:(x:number,z:number)=>number,localBounds:Bounds,excludedBuildingIds=new Set<string>(),excludedRoadIds=new Set<string>()){
 const response=await fetch(region.chunksIndexFile);if(!response.ok)throw new Error('区域分块索引无法加载');const index=await response.json();
 const asphalt=new StandardMaterial('regional-road',scene);asphalt.diffuseColor=Color3.White();asphalt.specularColor=Color3.Black();asphalt.useLogarithmicDepth=true;asphalt.zOffset=-3;asphalt.zOffsetUnits=-3;
 const wall=new StandardMaterial('regional-wall',scene);wall.diffuseColor=Color3.White();wall.specularColor=Color3.Black();wall.useLogarithmicDepth=true;
 const roof=new StandardMaterial('regional-red-roof',scene);roof.diffuseColor=Color3.White();roof.specularColor=Color3.Black();roof.useLogarithmicDepth=true;
 function road(batch:Batch,r:Road){const color=Color3.FromHexString('#667271');let half=Math.max(2,r.width/2);for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<.2)continue;
  const n=Math.max(1,Math.ceil(len/60)),nx=-(b[1]-a[1])/len*half,nz=(b[0]-a[0])/len*half;
  for(let k=0;k<n;k++){const p=[a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n],q=[a[0]+(b[0]-a[0])*(k+1)/n,a[1]+(b[1]-a[1])*(k+1)/n];
   const y=sample(p[0],p[1])+.7,y2=sample(q[0],q[1])+.7;
   batch.quad([p[0]-nx,y,p[1]-nz],[p[0]+nx,y,p[1]+nz],[q[0]+nx,y2,q[1]+nz],[q[0]-nx,y2,q[1]-nz],color);
  }
 }}
 const roadsRes=await fetch(region.regionalRoadsFile);const roadsData=await roadsRes.json();const roads:Mesh[]=[];
 const roadGroups=new Map<string,Batch>();for(const r of roadsData.roads as Road[]){if(excludedRoadIds.has(String(r.id)))continue;const p=r.points[Math.floor(r.points.length/2)];if(!p)continue;
  const key=`${Math.floor(p[0]/8000)}_${Math.floor(p[1]/8000)}`;let batch=roadGroups.get(key);if(!batch)roadGroups.set(key,batch=new Batch());road(batch,r);}
 for(const [key,b]of roadGroups){const m=b.finish('regional-road-'+key,scene,asphalt);if(m)roads.push(m);}
 const loaded=new Map<string,Mesh[]>(),pending=new Set<string>();let totalBuildings=0;let lastUpdate=-10;
 function insideLocal(x:number,z:number){return x>=localBounds.minX&&x<=localBounds.maxX&&z>=localBounds.minZ&&z<=localBounds.maxZ;}
 async function load(c:Chunk){pending.add(c.id);try{const res=await fetch(c.file);if(!res.ok)throw new Error(c.file);const data=await res.json();const walls=new Batch(),roofs=new Batch();
  let processed=0;for(const b of data.buildings){if(excludedBuildingIds.has(String(b.id)))continue;if(processed++%150===149)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));const poly=b.polygon as number[][];if(poly.length<3)continue;const cx=poly.reduce((s,p)=>s+p[0],0)/poly.length,cz=poly.reduce((s,p)=>s+p[1],0)/poly.length;if(insideLocal(cx,cz))continue;
   const base=Math.max(...poly.map(p=>sample(p[0],p[1]))),height=b.height||9;const top=base+height;const hash=String(b.id).split('').reduce((s,c)=>s+c.charCodeAt(0),0);
   const wt=Color3.FromHexString(['#eadcc4','#e6e5d6','#d6e1d6'][hash%3]),rt=Color3.FromHexString(height<22?['#bd6449','#af5038','#c37a57'][hash%3]:'#929d98');
   for(let i=0;i<poly.length;i++){const a=poly[i],q=poly[(i+1)%poly.length];walls.quad([a[0],sample(a[0],a[1])-.3,a[1]],[a[0],top,a[1]],[q[0],top,q[1]],[q[0],sample(q[0],q[1])-.3,q[1]],wt);}
   const points=poly.flat(),tri=earcut(points);for(let i=0;i<tri.length;i+=3){const a=poly[tri[i]],q=poly[tri[i+1]],c=poly[tri[i+2]];roofs.tri([a[0],top,a[1]],[c[0],top,c[1]],[q[0],top,q[1]],rt);}
  }
  const meshes=[walls.finish('district-wall-'+c.id,scene,wall),roofs.finish('district-roof-'+c.id,scene,roof)].filter(Boolean) as Mesh[];
  loaded.set(c.id,meshes);totalBuildings+=c.buildingCount;
 }catch(e){console.warn('区域分块加载失败',c.id,e);}finally{pending.delete(c.id);}}
 return {index,roadsData,stats:()=>({loaded:loaded.size,pending:pending.size,buildings:totalBuildings,total:index.totals}),
  update(time:number,camera:Vector3,target:Vector3){if(time-lastUpdate<.6)return;lastUpdate=time;const altitude=camera.y;
   const visibleRange=altitude<12000?Math.max(5000,Math.min(18000,altitude*3)):0;
   const candidates=(index.chunks as Chunk[]).filter(c=>c.buildingCount>0&&distance(c.bounds,target.x,target.z)<visibleRange).sort((a,b)=>distance(a.bounds,target.x,target.z)-distance(b.bounds,target.x,target.z)).slice(0,48);
   const visible=new Set(candidates.map(c=>c.id));for(const [id,meshes]of loaded)for(const mesh of meshes)mesh.setEnabled(visible.has(id));
   for(const c of candidates){if(pending.size>=2)break;if(!loaded.has(c.id)&&!pending.has(c.id))void load(c);}
   // Keep only a bounded working set when moving between distant districts.
   if(loaded.size>72)for(const [id,meshes]of loaded){if(loaded.size<=60)break;if(!visible.has(id)){meshes.forEach(m=>m.dispose());loaded.delete(id);}}
   roads.forEach(m=>{const b=m.getBoundingInfo().boundingBox;const nearest=distance({minX:b.minimumWorld.x,maxX:b.maximumWorld.x,minZ:b.minimumWorld.z,maxZ:b.maximumWorld.z},camera.x,camera.z);m.setEnabled(altitude<32000&&nearest<Math.max(25000,altitude*5));});
  }};
}
