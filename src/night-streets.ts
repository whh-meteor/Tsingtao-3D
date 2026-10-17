import {Scene,Mesh,VertexData,ShaderMaterial,Vector3} from './babylon';
import type {Bounds} from './height';
type Road={points:number[][];width?:number;type?:string;tags?:Record<string,string>};
const vertex=`precision highp float;
#include<logDepthDeclaration>
attribute vec3 position;attribute vec2 uv;attribute vec4 color;
uniform mat4 worldViewProjection;varying vec2 vUV;varying vec3 vColor;varying vec3 vWorld;
void main(){vUV=uv;vColor=color.rgb;vWorld=position;gl_Position=worldViewProjection*vec4(position,1.);
#include<logDepthVertex>
}`;
const fragment=`precision highp float;
#include<logDepthDeclaration>
varying vec2 vUV;varying vec3 vColor;varying vec3 vWorld;uniform float night;uniform vec3 eye;
void main(){
 float across=abs(vUV.x),pool=.68+.32*pow(.5+.5*cos(vUV.y*.16),4.);
 float edge=1.-smoothstep(.35,1.,across);
 float alpha=edge*pool*night*.72;
 if(alpha<.015)discard;
 gl_FragColor=vec4(vColor*(.72+pool*.32),alpha);
#include<logDepthFragment>
}`;

/** Batched light pools follow existing road geometry, without thousands of lights. */
export function buildNightStreets(scene:Scene,roads:Road[],height:(x:number,z:number)=>number,skip?:Bounds){
 const mat=new ShaderMaterial('warm street lighting',scene,{vertexSource:vertex,fragmentSource:fragment},
  {attributes:['position','uv','color'],uniforms:['worldViewProjection','night','eye'],needAlphaBlending:true});
 mat.useLogarithmicDepth=true;mat.disableDepthWrite=true;mat.backFaceCulling=false;mat.zOffset=-4;mat.zOffsetUnits=-4;
 const groups=new Map<string,{p:number[];uv:number[];c:number[];ix:number[]}>(),meshes:Mesh[]=[];
 const strengths:Record<string,number>={motorway:.65,trunk:.9,primary:1,secondary:.95,tertiary:.8,residential:.5,unclassified:.5,living_street:.35};
 for(const road of roads){const kind=road.type||road.tags?.highway||'',strength=strengths[kind];if(!strength||road.points.length<2||road.tags?.tunnel==='yes')continue;
  let along=0;
  for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<1)continue;
   const mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
   if(skip&&mx>skip.minX&&mx<skip.maxX&&mz>skip.minZ&&mz<skip.maxZ)continue;
   const key=Math.floor(mx/4000)+'_'+Math.floor(mz/4000);let batch=groups.get(key);if(!batch)groups.set(key,batch={p:[],uv:[],c:[],ix:[]});
   const half=Math.max(4,(road.width||8)*.7+2),nx=-dz/length*half,nz=dx/length*half,n=Math.ceil(length/65);
   for(let j=0;j<n;j++){const t=j/n,u=(j+1)/n,x=a[0]+dx*t,z=a[1]+dz*t,qx=a[0]+dx*u,qz=a[1]+dz*u;
    const y=height(x,z)+.24,yy=height(qx,qz)+.24,index=batch.p.length/3;
    batch.p.push(x-nx,y,z-nz,x+nx,y,z+nz,qx+nx,yy,qz+nz,qx-nx,yy,qz-nz);
    batch.uv.push(-1,along+length*t,1,along+length*t,1,along+length*u,-1,along+length*u);
    for(let k=0;k<4;k++)batch.c.push(1*strength,.48*strength,.13*strength,1);
    batch.ix.push(index,index+2,index+1,index,index+3,index+2);
   }along+=length;
  }
 }
 for(const [key,batch]of groups){const mesh=new Mesh('night streets '+key,scene),data=new VertexData();data.positions=batch.p;data.uvs=batch.uv;data.colors=batch.c;data.indices=batch.ix;data.applyToMesh(mesh);mesh.material=mat;mesh.hasVertexAlpha=false;mesh.isPickable=false;mesh.metadata={nightStreet:true};mesh.freezeWorldMatrix();mesh.setEnabled(false);meshes.push(mesh);}
 return {meshes,update(daylight:number,eye:Vector3){const night=1-daylight;mat.setFloat('night',night);mat.setVector3('eye',eye);
  for(const mesh of meshes){const box=mesh.getBoundingInfo().boundingBox,range=Math.max(18000,eye.y*4);const distance=Math.hypot(Math.max(box.minimumWorld.x-eye.x,0,eye.x-box.maximumWorld.x),Math.max(box.minimumWorld.z-eye.z,0,eye.z-box.maximumWorld.z));mesh.setEnabled(night>.02&&distance<range);}},
  dispose(){meshes.forEach(mesh=>mesh.dispose());mat.dispose();}};
}
