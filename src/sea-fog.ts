import { Scene, PostProcess, ShaderStore, Matrix, Vector3, Vector4, Texture } from './babylon';
import { nightFogStrength, fogCoastLimits } from './atmosphere';
import type { TextureFactory } from './managed-textures';
import type { Bounds } from './height';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { DepthRenderer } from '@babylonjs/core/Rendering/depthRenderer';

/** Rotation-only rays avoid subtracting near-plane and camera coordinates at
 * 100km scales, which quantized screen rows and produced striped aerial fog. */
export function fogRayBasis(view:Matrix,projection:Matrix){
 const rotation=Matrix.Invert(view),p=projection.m;
 return {right:Vector3.TransformNormal(Vector3.Right(),rotation).scale(1/p[0]),
  up:Vector3.TransformNormal(Vector3.Up(),rotation).scale(1/p[5]),
  forward:Vector3.TransformNormal(Vector3.Forward(),rotation).normalize()};
}

ShaderStore.ShadersStore['coastalSeaFogPixelShader']=`precision highp float;
varying vec2 vUV;
uniform sampler2D depthSampler;uniform sampler2D sceneSampler;
uniform sampler2D coastRegional;uniform sampler2D coastLocal;
uniform vec4 coastRegionalBounds;uniform vec4 coastLocalBounds;uniform float coastDistanceRange;
uniform vec3 eye;uniform vec3 rayRight;uniform vec3 rayUp;uniform vec3 forward;uniform vec4 depthParameters;
uniform float time;uniform float strength;uniform float packedDepth;uniform float samples;
float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.57+noise(p*2.07+17.3)*.28+noise(p*4.13+39.1)*.15;}
float coastline(vec2 point){
 vec2 uv=(point-coastRegionalBounds.xy)/coastRegionalBounds.zw;
 if(min(uv.x,uv.y)<0.||max(uv.x,uv.y)>1.)return 10000.;
 vec2 localUV=(point-coastLocalBounds.xy)/coastLocalBounds.zw;
 float coast=texture2D(coastRegional,vec2(uv.x,1.-uv.y)).r;
 vec2 edge=min(localUV,1.-localUV)*coastLocalBounds.zw;
 float blend=smoothstep(0.,180.,min(edge.x,edge.y));
 if(blend>0.)coast=mix(coast,texture2D(coastLocal,vec2(localUV.x,1.-localUV.y)).r,blend);
 return (coast*2.-1.)*coastDistanceRange;
}
void main(){
 vec3 ray=normalize(forward+rayRight*(vUV.x*2.-1.)+rayUp*(vUV.y*2.-1.));
 vec4 texel=texture2D(depthSampler,vUV);
 float depth=mix(texel.r,dot(texel,vec4(1./16581375.,1./65025.,1./255.,1.)),packedDepth);
 float viewZ=(depth*depthParameters.y-depthParameters.x-depthParameters.w)/depthParameters.z;
 float surface=max(0.,viewZ/max(dot(ray,forward),.001));
 float slope=abs(ray.y)<.00001?(ray.y<0.?-.00001:.00001):ray.y;
 float a=-eye.y/slope,b=(155.-eye.y)/slope;
 float entry=max(0.,min(a,b)),exit=min(min(max(a,b),surface),entry+10000.);
 if(exit<=entry){gl_FragColor=vec4(0.);return;}
 float stepLength=(exit-entry)/samples,optical=0.;
 // Fixed subpixel stratification removes slice alignment without frame flicker.
 float jitter=mix(.25,.75,hash(floor(gl_FragCoord.xy)));
 for(int i=0;i<20;i++){
  if(float(i)>=samples)break;
  vec3 p=eye+ray*(entry+(float(i)+jitter)*stepLength);
  float shore=coastline(p.xz);
  if(shore<${fogCoastLimits.offshoreOuter}.||shore>${fogCoastLimits.inlandOuter}.)continue;
  vec2 q=(p.xz-vec2(time*1.1,time*2.6))*.00125;
  vec2 warp=vec2(noise(q*.62+19.),noise(q*.62+47.))-.5;
  float mass=fbm(q+warp*1.6);
  float curl=noise(q*3.1+warp*2.+vec2(p.y*.014,-p.y*.011));
  // Irregular masses and curls, rather than periodic shoreline ribbons.
  float front=100.+410.*noise(q*.48+71.);
  float coastal=smoothstep(${fogCoastLimits.offshoreOuter}.,-650.,shore)
   *(1.-smoothstep(front-180.,min(${fogCoastLimits.inlandOuter}.,front+140.),shore));
  float ceiling=48.+mass*82.+curl*18.;
  float height=(1.-smoothstep(ceiling*.45,ceiling,p.y))*smoothstep(-3.,6.,p.y);
  float lumps=smoothstep(.23,.69,mass*.72+curl*.28);
  optical+=height*coastal*lumps*stepLength*.026;
 }
 float opacity=min(.94,1.-exp(-optical*strength));
 vec3 nearby=texture2D(sceneSampler,vUV+vec2(.012,0.)).rgb+texture2D(sceneSampler,vUV-vec2(.012,0.)).rgb
  +texture2D(sceneSampler,vUV+vec2(0.,.012)).rgb+texture2D(sceneSampler,vUV-vec2(0.,.012)).rgb;
 vec3 scatter=max(nearby*.25-vec3(.12),vec3(0.));
 vec3 mist=vec3(.28,.35,.45)+scatter*vec3(.72,.56,.45);
 gl_FragColor=vec4(mist,opacity);
}`;

ShaderStore.ShadersStore['coastalCompositePixelShader']=`precision highp float;
varying vec2 vUV;uniform sampler2D textureSampler;uniform sampler2D sceneSampler;
uniform vec2 texel;uniform float night;
vec3 bright(vec2 offset){vec3 c=texture2D(sceneSampler,clamp(vUV+offset,vec2(0.),vec2(1.))).rgb;return max(c-.56,vec3(0.));}
void main(){
 vec3 source=texture2D(sceneSampler,vUV).rgb;
 vec4 mist=texture2D(textureSampler,vUV);
 float lamps=smoothstep(.48,.95,max(source.r,max(source.g,source.b)));
 vec3 color=mix(source,mist.rgb,mist.a*(1.-lamps*.56));
 vec3 glow=bright(texel*vec2(3.,0.))+bright(texel*vec2(-3.,0.))+bright(texel*vec2(0.,3.))+bright(texel*vec2(0.,-3.));
 glow+=.55*(bright(texel*vec2(9.,5.))+bright(texel*vec2(-9.,-5.))+bright(texel*vec2(-5.,9.))+bright(texel*vec2(5.,-9.)));
 color+=glow*.12*night*(1.+mist.a*.65);
 gl_FragColor=vec4(color,1.);
}`;

export type FogCoast={regional:{url:string;bounds:Bounds};local:{url:string;bounds:Bounds};distanceRange:number};
export function createSeaFog(scene:Scene,coast:FogCoast,textureFactory:TextureFactory=(url,s,sampling)=>new Texture(url,s,false,false,sampling)){
 const engine=scene.getEngine();
 const regional=textureFactory(coast.regional.url,scene,Texture.BILINEAR_SAMPLINGMODE);
 const local=textureFactory(coast.local.url,scene,Texture.BILINEAR_SAMPLINGMODE);
 for(const texture of [regional,local])texture.wrapU=texture.wrapV=Texture.CLAMP_ADDRESSMODE;
 const bounds=(b:Bounds)=>new Vector4(b.minX,b.minZ,b.maxX-b.minX,b.maxZ-b.minZ);
 const capture=new PostProcess('weather-source','pass',null,null,1,null,Texture.BILINEAR_SAMPLINGMODE,engine);
 const fog=new PostProcess('night-sea-fog','coastalSeaFog',
  ['eye','rayRight','rayUp','forward','depthParameters','time','strength','packedDepth','samples','coastRegionalBounds','coastLocalBounds','coastDistanceRange'],
  ['depthSampler','coastRegional','coastLocal','sceneSampler'],.5,null,Texture.BILINEAR_SAMPLINGMODE,engine);
 // The next pass owns fog's draw destination. Half size here runs the ray
 // march at 1/4 pixels, while capture retains the sharp full-resolution scene.
 const composite=new PostProcess('weather-composite','coastalComposite',['texel','night'],['sceneSampler'],.5,null,Texture.BILINEAR_SAMPLINGMODE,engine);
 const passes=[capture,fog,composite],renderers=new Map<Camera,DepthRenderer>();
 let attached:Camera|null=null,time=0,strength=0,high=true;
 fog.onApply=effect=>{
  const camera=scene.activeCamera!,renderer=renderers.get(camera)!;
  const basis=fogRayBasis(camera.getViewMatrix(),camera.getProjectionMatrix()),p=camera.getProjectionMatrix().m;
  effect.setVector3('eye',camera.globalPosition);effect.setVector3('rayRight',basis.right);effect.setVector3('rayUp',basis.up);effect.setVector3('forward',basis.forward);
  effect.setFloat4('depthParameters',camera.minZ,camera.minZ+camera.maxZ,p[10],p[14]);
  effect.setTexture('depthSampler',renderer.getDepthMap());effect.setTextureFromPostProcess('sceneSampler',capture);
  effect.setTexture('coastRegional',regional);effect.setTexture('coastLocal',local);
  effect.setVector4('coastRegionalBounds',bounds(coast.regional.bounds));effect.setVector4('coastLocalBounds',bounds(coast.local.bounds));
  effect.setFloat('coastDistanceRange',coast.distanceRange);effect.setFloat('packedDepth',renderer.isPacked?1:0);
  effect.setFloat('time',time);effect.setFloat('strength',strength);effect.setFloat('samples',high?20:12);
 };
 composite.onApply=effect=>{effect.setTextureFromPostProcess('sceneSampler',capture);effect.setFloat2('texel',1/engine.getRenderWidth(),1/engine.getRenderHeight());effect.setFloat('night',strength);};
 return {update(elapsed:number,daylight:number,qualityHigh:boolean){
  time=elapsed;strength=nightFogStrength(daylight);high=qualityHigh;
  const camera=strength>.001?scene.activeCamera:null;
  if(attached!==camera){
   if(attached){for(const pass of passes)attached.detachPostProcess(pass);renderers.get(attached)!.enabled=false;}
   attached=camera;
   if(camera){
    let renderer=renderers.get(camera);
    if(!renderer){renderer=scene.enableDepthRenderer(camera,false,true,Texture.NEAREST_SAMPLINGMODE);renderer.useOnlyInActiveCamera=true;
     renderer.getDepthMap().renderListPredicate=mesh=>!mesh.infiniteDistance&&!mesh.metadata?.nightStreet;
     renderers.set(camera,renderer);}
    renderer.enabled=true;passes.forEach((pass,i)=>camera.attachPostProcess(pass,i));
   }
  }
  if(camera){const map=renderers.get(camera)!.getDepthMap(),size=map.getSize(),width=Math.max(1,Math.round(engine.getRenderWidth()*.5)),height=Math.max(1,Math.round(engine.getRenderHeight()*.5));
   if(size.width!==width||size.height!==height)map.resize({width,height});}
 }};
}
