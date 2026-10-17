import { Scene, ShaderMaterial, StandardMaterial, Color3, Vector3 } from './babylon';
const vertex=`precision highp float;
#include<logDepthDeclaration>
attribute vec3 position;attribute vec3 normal;attribute vec4 color;attribute vec2 uv;
uniform mat4 world;uniform mat4 worldViewProjection;varying vec3 vColor;varying vec3 vNormal;varying vec3 vWorld;varying vec2 vUV;varying float vCoast;
void main(){vWorld=(world*vec4(position,1.)).xyz;vColor=color.rgb;vNormal=normalize(mat3(world)*normal);vUV=uv;vCoast=color.a;gl_Position=worldViewProjection*vec4(position,1.);
#include<logDepthVertex>
}`;
const fragment=`precision highp float;
#include<logDepthDeclaration>
uniform float daylight;uniform float time;uniform float lightShow;uniform vec3 sunDirection;uniform vec3 horizon;uniform vec3 eye;
varying vec3 vColor;varying vec3 vNormal;varying vec3 vWorld;varying vec2 vUV;varying float vCoast;
float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
vec3 showColor(float t){float a=t*.045;return .5+.5*cos(a+vec3(0.,2.09,4.19));}
void main(){vec2 cell=floor(vUV),f=fract(vUV);float window=step(.22,f.x)*step(f.x,.78)*step(.19,f.y)*step(f.y,.83);float random=hash(cell+floor(vWorld.xz/180.)*7.);float lit=step(.58,random);float night=1.-daylight;
 float detail=1.-smoothstep(1800.,6500.,distance(vWorld,eye));window*=detail;float diffuse=.44+max(0.,dot(normalize(vNormal),sunDirection))*.56;vec3 facade=vColor*mix(.038,1.,daylight)*diffuse;facade=mix(facade,vec3(.12,.19,.24)*(.10+daylight*.90),window*.65);
 vec3 warm=mix(vec3(1.,.55,.18),vec3(.64,.8,1.),step(.91,hash(cell+9.)));facade+=warm*(window*lit*(.48+random*.7)+(1.-detail)*.025)*night;
 float coast=vCoast;
 float sweep=.35+.65*smoothstep(-.7,.7,sin(vWorld.y*.11-time*.22+vWorld.x*.0008));facade+=showColor(time+vWorld.x*.001)*(window+(1.-detail)*.09)*night*lightShow*coast*sweep*.66;
 float fog=1.-exp(-distance(vWorld,eye)*.000002);facade=mix(facade,horizon,fog*.12);gl_FragColor=vec4(pow(max(facade,vec3(0.)),vec3(.454545)),1.);
#include<logDepthFragment>
}`;
export function createCityMaterials(scene:Scene){
 const wall=new ShaderMaterial('city facades day and warm night windows',scene,{vertexSource:vertex,fragmentSource:fragment},{attributes:['position','normal','color','uv'],uniforms:['world','worldViewProjection','daylight','time','lightShow','sunDirection','horizon','eye']});wall.useLogarithmicDepth=true;
 const roof=new StandardMaterial('city overview terracotta roof',scene);roof.diffuseColor=Color3.White();roof.specularColor=Color3.Black();roof.useLogarithmicDepth=true;
 const update=(daylight:number,time:number,sun:Vector3,horizon:Color3,lightShow=true)=>{wall.setFloat('daylight',daylight);wall.setFloat('time',time);wall.setFloat('lightShow',lightShow?1:0);wall.setVector3('sunDirection',sun);wall.setColor3('horizon',horizon);wall.setVector3('eye',scene.activeCamera?.position||Vector3.Zero());roof.emissiveColor.set(.008*(1-daylight),.012*(1-daylight),.022*(1-daylight));};
 update(1,0,new Vector3(0,1,0),new Color3(.7,.85,.9));return{wall,roof,update,dispose(){wall.dispose();roof.dispose();}};
}
