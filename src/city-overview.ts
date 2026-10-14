import { Scene, Mesh, VertexData, Color3, Vector3 } from './babylon';

import { createCityMaterials } from './city-lighting';
type Row=[string,number,number,number,number,number,number,number];
export function buildCityOverview(scene:Scene,data:{buildings:Row[]},sample:(x:number,z:number)=>number,excluded:Set<string>,coastalIds=new Set<string>()){
 const materials=createCityMaterials(scene),groups=new Map<string,{p:number[];ix:number[];colors:number[];uv:number[];roof:boolean;coast:number}>();const meshes:Mesh[]=[];
 const group=(key:string,roof:boolean)=>{let b=groups.get(key);if(!b)groups.set(key,b={p:[],ix:[],colors:[],uv:[],roof,coast:0});return b;};
 const tri=(b:ReturnType<typeof group>,a:number[],c:number[],d:number[],t:Color3)=>{const n=b.p.length/3;b.p.push(...a,...c,...d);b.ix.push(n,n+2,n+1);for(const v of [a,c,d]){b.colors.push(t.r,t.g,t.b,b.coast);b.uv.push((v[0]+v[2])*.25,v[1]/3.4);}};
 for(const [id,x,z,width,depth,height,angle]of data.buildings){if(excluded.has(id))continue;const key=Math.floor(x/8000)+'_'+Math.floor(z/8000),wall=group(key+' wall',false),roof=group(key+' roof',true),base=sample(x,z)-.12,top=base+height;
  const cs=Math.cos(angle),sn=Math.sin(angle),v=(dx:number,dz:number,y:number)=>[x+dx*cs+dz*sn,y,z-dx*sn+dz*cs];const bottom=[v(-width/2,-depth/2,base),v(width/2,-depth/2,base),v(width/2,depth/2,base),v(-width/2,depth/2,base)],upper=bottom.map(p=>[p[0],top,p[2]]);
  const tint=Color3.FromHexString(height>40?'#d2d9d3':'#e4d9bf'),rt=Color3.FromHexString(height>28?'#999f9a':'#b66047');
  wall.coast=coastalIds.has(id)?1:0;for(let i=0;i<4;i++){const j=(i+1)%4;tri(wall,bottom[i],upper[i],upper[j],tint);tri(wall,bottom[i],upper[j],bottom[j],tint);}tri(roof,upper[0],upper[3],upper[2],rt);tri(roof,upper[0],upper[2],upper[1],rt);
 }
 for(const [name,b]of groups){const m=new Mesh('continuous city overview '+name,scene),v=new VertexData(),normals:number[]=[];v.positions=b.p;v.indices=b.ix;v.colors=b.colors;v.uvs=b.uv;VertexData.ComputeNormals(b.p,b.ix,normals);v.normals=normals;v.applyToMesh(m);m.material=b.roof?materials.roof:materials.wall;m.metadata={groupKey:name.split(' ')[0]};m.hasVertexAlpha=false;m.isPickable=false;m.freezeWorldMatrix();meshes.push(m);}
 return{meshes,materials,count:data.buildings.length,update(detailReady:(key:string)=>boolean){for(const m of meshes)m.setEnabled(!detailReady(m.metadata.groupKey));},dispose(){for(const m of meshes)m.dispose();materials.dispose();}};
}
