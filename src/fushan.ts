import { Color3, Mesh, Scene, StandardMaterial, VertexData } from './babylon';
/** Mapped Fushan walking routes, with approximate woodland planted on genuine DEM. */
export function buildFushan(scene:Scene,data:any,sample:(x:number,z:number)=>number){
 const meshes:Mesh[]=[],materials:StandardMaterial[]=[];
 class Batch{
  p:number[]=[];ix:number[]=[];colors:number[]=[];
  tri(a:number[],b:number[],c:number[],color:Color3){const n=this.p.length/3;this.p.push(...a,...b,...c);this.ix.push(n,n+2,n+1);for(let i=0;i<3;i++)this.colors.push(color.r,color.g,color.b,1);}
  finish(name:string){if(!this.ix.length)return;const m=new Mesh(name,scene),v=new VertexData();v.positions=this.p;v.indices=this.ix;v.colors=this.colors;const normal:number[]=[];VertexData.ComputeNormals(this.p,this.ix,normal);v.normals=normal;v.applyToMesh(m);const mat=new StandardMaterial(name+' material',scene);mat.diffuseColor=Color3.White();mat.specularColor=Color3.Black();mat.useLogarithmicDepth=true;m.material=mat;materials.push(mat);m.isPickable=false;m.freezeWorldMatrix();meshes.push(m);}
 }
 const paths=new Batch();const routeIds=new Set<string>();
 for(const f of data.namedFeatures||[]){if(!f.name?.includes('浮山绿道')||!f.points||routeIds.has(f.id))continue;routeIds.add(f.id);
  for(let i=1;i<f.points.length;i++){const a=f.points[i-1],b=f.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.1)continue;const nx=-(b[1]-a[1])/length*1.8,nz=(b[0]-a[0])/length*1.8,n=Math.ceil(length/12);
   for(let k=0;k<n;k++){const x=a[0]+(b[0]-a[0])*k/n,z=a[1]+(b[1]-a[1])*k/n,qx=a[0]+(b[0]-a[0])*(k+1)/n,qz=a[1]+(b[1]-a[1])*(k+1)/n;const p=[x-nx,sample(x-nx,z-nz)+.22,z-nz],q=[x+nx,sample(x+nx,z+nz)+.22,z+nz],r=[qx+nx,sample(qx+nx,qz+nz)+.22,qz+nz],s=[qx-nx,sample(qx-nx,qz-nz)+.22,qz-nz];paths.tri(p,q,r,Color3.FromHexString('#a9a193'));paths.tri(p,r,s,Color3.FromHexString('#a9a193'));}
  }
 }
 paths.finish('Fushan genuine OSM greenways');
 const woods=new Batch(),trunks=new Batch();let seed=74119;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const forest=data.parks?.find((f:any)=>f.id==='way/241489132')?.polygon;
 const inForest=(x:number,z:number)=>{if(!forest)return false;let hit=false;for(let i=0,j=forest.length-1;i<forest.length;j=i++){const a=forest[i],b=forest[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
 for(let i=0;i<1500;i++){const x=8000+random()*4000,z=1500+random()*3500,h=sample(x,z);if(h<45||h>280||!inForest(x,z))continue;const slope=Math.hypot(sample(x+30,z)-sample(x-30,z),sample(x,z+30)-sample(x,z-30))/60;if(slope>.9)continue;const height=5+random()*6,c=Color3.FromHexString(i%3===0?'#3b6542':i%3===1?'#51783c':'#5b7f42');
  for(let tier=0;tier<3;tier++){const r=(2.6-tier*.6),base=h+1.8+tier*height*.22,top=base+height*.65;for(let j=0;j<7;j++){const a=j*Math.PI*2/7,b=(j+1)*Math.PI*2/7;woods.tri([x+r*Math.cos(a),base,z+r*Math.sin(a)],[x,top,z],[x+r*Math.cos(b),base,z+r*Math.sin(b)],c);}}
  const bark=Color3.FromHexString('#70624e');for(let j=0;j<4;j++){const a=j*Math.PI/2,b=(j+1)*Math.PI/2,p=[x+.2*Math.cos(a),h,z+.2*Math.sin(a)],q=[x+.2*Math.cos(a),h+height*.4,z+.2*Math.sin(a)],r=[x+.2*Math.cos(b),h+height*.4,z+.2*Math.sin(b)],s=[x+.2*Math.cos(b),h,z+.2*Math.sin(b)];trunks.tri(p,q,r,bark);trunks.tri(p,r,s,bark);}
 }
 woods.finish('Fushan approximate woodland canopies');trunks.finish('Fushan woodland trunks');
 return {meshes,routeIds,setDetail(distance:number){for(const m of meshes)m.setEnabled(distance<9000);},dispose(){for(const m of meshes)m.dispose();for(const m of materials)m.dispose();}};
}
