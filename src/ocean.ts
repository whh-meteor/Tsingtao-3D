import { Scene, ShaderMaterial, MeshBuilder, Vector3, Vector4, Color3, Color4, Texture, MirrorTexture, Plane, Matrix, AbstractMesh } from './babylon';

// Original GLSL implementation: directional wave synthesis, Fresnel and planar reflection.
// Architectural reference: three.js examples/jsm/objects/Water.js (MIT), see THIRD_PARTY.md.
const vertex = `precision highp float;
#include<logDepthDeclaration>
attribute vec3 position; attribute vec2 uv;
uniform mat4 world; uniform mat4 worldViewProjection; uniform mat4 reflectionVP;
uniform float time; uniform float waveHeight; uniform float wind;
varying vec3 vWorld; varying vec3 vNormal; varying vec4 vMirror;
void wave(in vec2 dir,in float wavelength,in float amplitude,inout vec3 p,inout vec2 slope){
 amplitude*=1.-smoothstep(2600.,12000.,length((world*vec4(position,1.)).xz));float k=6.2831853/wavelength;float phase=k*dot(position.xz,dir)-sqrt(9.81*k)*time*wind;
 p.y+=amplitude*sin(phase);slope+=dir*amplitude*k*cos(phase);
}
void main(){vec3 p=position;vec2 slope=vec2(0.);
 wave(normalize(vec2(.9,.4)),32.,waveHeight*.45,p,slope);
 wave(normalize(vec2(.3,.95)),17.,waveHeight*.28,p,slope);
 wave(normalize(vec2(-.65,.6)),8.,waveHeight*.13,p,slope);
 wave(normalize(vec2(.8,-.2)),4.3,waveHeight*.06,p,slope);
 vWorld=(world*vec4(p,1.)).xyz;vNormal=normalize(vec3(-slope.x,1.,-slope.y));
 vMirror=reflectionVP*vec4(vWorld,1.);gl_Position=worldViewProjection*vec4(p,1.);
#include<logDepthVertex>
}`;
const fragment = `precision highp float;
#include<logDepthDeclaration>
uniform float time;uniform float wind;uniform float waveHeight;uniform float daylight;uniform float foamStrength;
uniform vec3 eye;uniform vec3 sunDirection;uniform vec3 sunColor;uniform vec3 skyTop;uniform vec3 skyHorizon;
uniform sampler2D shoreMap;uniform sampler2D regionalShoreMap;uniform vec4 regionalShoreBounds;uniform sampler2D mirrorMap;uniform vec4 shoreBounds;uniform float shoreMaxDistance;
varying vec3 vWorld;varying vec3 vNormal;varying vec4 vMirror;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float ripples(vec2 p){return noise(p*1.7+vec2(time*.42,-time*.16)*wind)*.65+noise(p*3.9+vec2(-time*.18,time*.32)*wind)*.35;}
void main(){
 vec2 suv=(vWorld.xz-shoreBounds.xy)/shoreBounds.zw;
 vec4 shore=texture2D(shoreMap,vec2(suv.x,1.-suv.y));
 float inBounds=step(0.,suv.x)*step(suv.x,1.)*step(0.,suv.y)*step(suv.y,1.);
 vec2 ruv=(vWorld.xz-regionalShoreBounds.xy)/regionalShoreBounds.zw;float regionalDistance=texture2D(regionalShoreMap,vec2(ruv.x,1.-ruv.y)).r*shoreMaxDistance;float distanceToShore=mix(regionalDistance,shore.r*shoreMaxDistance,inBounds);
 vec3 view=normalize(eye-vWorld);float cameraDistance=length(eye-vWorld);
 float scale=mix(.22,.055,smoothstep(50.,1500.,cameraDistance));vec2 q=vWorld.xz*scale;
 float microFade=1.-smoothstep(400.,2200.,cameraDistance);vec2 micro=vec2(0.);
 if(microFade>.02){float eps=.11;float r=ripples(q);micro=vec2(ripples(q+vec2(eps,0.))-r,ripples(q+vec2(0.,eps))-r)/eps;}
 vec3 n=normalize(vNormal+vec3(-micro.x,0.,-micro.y)*(.075+.12*waveHeight)*microFade);
 float facing=max(dot(n,view),0.);float fresnel=.035+.965*pow(1.-facing,5.);
 float shallow=1.-smoothstep(0.,75.,distanceToShore);
 vec3 deep=vec3(.012,.20,.34);vec3 near=vec3(.045,.43,.46);
 vec3 body=mix(deep,near,shallow)*mix(.20,1.,daylight);
 vec3 reflectionDirection=reflect(-view,n);
 vec3 sky=mix(skyHorizon,skyTop,pow(clamp(reflectionDirection.y,0.,1.),.55));
 vec2 mirrorUV=vMirror.xy/max(vMirror.w,.001)*.5+.5;
 mirrorUV+=n.xz*.012*clamp(180./max(cameraDistance,1.),.2,2.);
 float valid=step(0.,mirrorUV.x)*step(mirrorUV.x,1.)*step(0.,mirrorUV.y)*step(mirrorUV.y,1.)*step(.01,vMirror.w);
 vec4 reflected=texture2D(mirrorMap,clamp(mirrorUV,vec2(.002),vec2(.998)));
 sky=mix(sky,reflected.rgb,valid*reflected.a*.40);
 vec3 halfVector=normalize(sunDirection+view);float spec=pow(max(dot(n,halfVector),0.),120.);
 float broad=pow(max(dot(reflectionDirection,sunDirection),0.),55.);
 float sparkle=spec*1.1+broad*.20;
 vec3 color=mix(body,sky,fresnel*.58)+sunColor*sparkle*max(sunDirection.y,0.);
 float wash=sin(distanceToShore*.83-time*1.65*wind+noise(vWorld.xz*.07)*3.);
 float coastal=(1.-smoothstep(2.,16.+waveHeight*7.,distanceToShore))*smoothstep(.12,.85,wash);
 float grain=smoothstep(.3,.66,noise(vWorld.xz*.8+time*.18));
 float crest=smoothstep(waveHeight*.52,waveHeight*.88,vWorld.y)*.14;
 float foam=clamp((coastal*grain+crest)*foamStrength,0.,.8);
 color=mix(color,vec3(.82,.91,.88)*mix(.24,1.,daylight),foam);
 float haze=1.-exp(-cameraDistance*.000006);color=mix(color,skyHorizon,haze*.35);
 color=color/(color+vec3(.7));color=pow(color,vec3(.82));gl_FragColor=vec4(color,1.);
#include<logDepthFragment>
}`;

export function createOcean(scene: Scene, shore: {url?:string,bounds:{minX:number,minZ:number,maxX:number,maxZ:number},maxDistance?:number,regional?:{url:string,bounds:{minX:number,minZ:number,maxX:number,maxZ:number}}}, reflectionMeshes: AbstractMesh[]) {
  const mirror = new MirrorTexture('bay-reflection', 768, scene, false);
  mirror.mirrorPlane = new Plane(0,-1,0,0.03);
  mirror.clearColor = new Color4(0,0,0,0);
  mirror.renderList = reflectionMeshes;
  mirror.refreshRate = 2;
  let reflectionVP = Matrix.Identity();
  mirror.onBeforeRenderObservable.add(() => { reflectionVP = scene.getTransformMatrix().clone(); });
  const mat = new ShaderMaterial('qingdao-ocean',scene,{vertexSource:vertex,fragmentSource:fragment},{attributes:['position','uv'],uniforms:['world','worldViewProjection','reflectionVP','time','wind','waveHeight','daylight','foamStrength','eye','sunDirection','sunColor','skyTop','skyHorizon','shoreBounds','regionalShoreBounds','shoreMaxDistance'],samplers:['shoreMap','regionalShoreMap','mirrorMap']});
  mat.backFaceCulling = false;mat.useLogarithmicDepth=true;
  mat.setTexture('shoreMap',new Texture(shore.url || '/data/shore-distance.png',scene,false,false,Texture.BILINEAR_SAMPLINGMODE));
  mat.setTexture('mirrorMap',mirror);
  const region=shore.regional;mat.setTexture('regionalShoreMap',new Texture(region?.url || shore.url || '/data/shore-distance.png',scene,false,false,Texture.BILINEAR_SAMPLINGMODE));const rb=region?.bounds || shore.bounds;mat.setVector4('regionalShoreBounds',new Vector4(rb.minX,rb.minZ,rb.maxX-rb.minX,rb.maxZ-rb.minZ));
  const b=shore.bounds;mat.setVector4('shoreBounds',new Vector4(b.minX,b.minZ,b.maxX-b.minX,b.maxZ-b.minZ));
  mat.setFloat('shoreMaxDistance',shore.maxDistance || 100);
  const ocean = MeshBuilder.CreateGround('bay-near',{width:6000,height:6000,subdivisions:220},scene);
  ocean.material=mat;ocean.isPickable=false;
  const far=MeshBuilder.CreateGround('bay-horizon',{width:400000,height:400000,subdivisions:48},scene);
  far.position.y=-1.15;far.material=mat;far.isPickable=false;far.alwaysSelectAsActiveMesh=true;
  let waveHeight=.65,wind=1,foam=1,qualityHigh=true;
  return { mirror, setWaves(value:number){waveHeight=value;},setWind(value:number){wind=value;},setFoam(value:number){foam=value;},setQuality(high:boolean){qualityHigh=high;mirror.refreshRate=high?2:4;},
    update(time:number,sun:Vector3,sunColor:Color3,daylight:number,top:Color3,horizon:Color3){
      const eye=scene.activeCamera!.globalPosition;mirror.refreshRate=Math.hypot(eye.x,eye.z)<9000?(qualityHigh?2:4):0;
      mat.setFloat('time',time);mat.setFloat('wind',wind);mat.setFloat('waveHeight',waveHeight);mat.setFloat('foamStrength',foam);mat.setFloat('daylight',daylight);
      mat.setVector3('eye',scene.activeCamera!.globalPosition);mat.setVector3('sunDirection',sun);mat.setColor3('sunColor',sunColor);mat.setColor3('skyTop',top);mat.setColor3('skyHorizon',horizon);mat.setMatrix('reflectionVP',reflectionVP);
    }};
}
