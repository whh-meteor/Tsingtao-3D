import { Scene, MeshBuilder, ShaderMaterial, Vector3, Color3 } from './babylon';
const vertex=`precision highp float;attribute vec3 position;
#include<logDepthDeclaration>
uniform mat4 world;uniform mat4 worldViewProjection;varying vec3 vDir;void main(){vDir=position;gl_Position=worldViewProjection*vec4(position,1.);
#include<logDepthVertex>
}`;
const fragment=`precision highp float;
#include<logDepthDeclaration>
uniform vec3 sunDirection;uniform vec3 moonDirection;uniform vec3 topColor;uniform vec3 horizonColor;uniform vec3 sunColor;uniform float daylight;uniform float moonLight;varying vec3 vDir;
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453123);}
void main(){vec3 d=normalize(vDir);float h=clamp(d.y,0.,1.);vec3 color=mix(horizonColor,topColor,pow(h,.45));
 float s=max(dot(d,sunDirection),0.);color+=sunColor*pow(s,220.)*.22;
 float sun=smoothstep(.999945,.999985,s)*step(0.,sunDirection.y);color=mix(color,vec3(1.,.91,.69),sun);
 float moon=smoothstep(.99992,.999965,dot(d,moonDirection))*step(0.,moonDirection.y);color+=vec3(.68,.77,.85)*moon*(.35+moonLight*.6)*(1.-daylight);
 vec3 cell=floor(d*900.);float star=step(.9985,hash(cell));float pin=pow(max(0.,1.-length(fract(d*900.)-.5)*2.),3.);color+=vec3(.62,.73,.9)*star*pin*(1.-daylight)*smoothstep(0.,.15,d.y);
 gl_FragColor=vec4(color,1.);
#include<logDepthFragment>
}`;
export function createSky(scene:Scene){
 const mesh=MeshBuilder.CreateSphere('atmosphere',{diameter:800000,segments:24},scene);
 const mat=new ShaderMaterial('atmosphere',scene,{vertexSource:vertex,fragmentSource:fragment},{attributes:['position'],uniforms:['world','worldViewProjection','sunDirection','moonDirection','topColor','horizonColor','sunColor','daylight','moonLight']});
 mat.backFaceCulling=false;mat.useLogarithmicDepth=true;mat.disableDepthWrite=true;mesh.material=mat;mesh.isPickable=false;mesh.infiniteDistance=true;mesh.applyFog=false;mesh.renderingGroupId=0;
 return {mesh,update(sun:Vector3,moon:Vector3,top:Color3,horizon:Color3,sunColor:Color3,daylight:number,moonLight:number){mat.setVector3('sunDirection',sun);mat.setVector3('moonDirection',moon);mat.setColor3('topColor',top);mat.setColor3('horizonColor',horizon);mat.setColor3('sunColor',sunColor);mat.setFloat('daylight',daylight);mat.setFloat('moonLight',moonLight);}};
}
