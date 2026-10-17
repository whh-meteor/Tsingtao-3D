/** Shared sky / water reflection clouds. Distances are metres; motion uses simulation time. */
export const cloudShader = `
uniform float cloudTime;
float cloudHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float cloudNoise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(cloudHash(i),cloudHash(i+vec2(1.,0.)),f.x),mix(cloudHash(i+vec2(0.,1.)),cloudHash(i+vec2(1.)),f.x),f.y);
}
float cloudFbm(vec2 p){
 float n=0.,a=.55;
 for(int i=0;i<4;i++){n+=cloudNoise(p)*a;p=mat2(.8,.6,-.6,.8)*p*2.03+7.3;a*=.48;}
 return n;
}
vec3 skyClouds(vec3 sky,vec3 direction,vec3 sun,float day){
 vec3 d=normalize(direction);
 float visible=smoothstep(.005,.085,d.y);
 if(visible<.001)return sky;
 // A curved projection keeps clouds finite near the horizon, including aerial views.
 vec2 p=d.xz/(max(d.y,0.)+.24)*2.7+vec2(cloudTime*.008,cloudTime*.003);
 float billow=cloudFbm(p);
 float wisps=cloudFbm(p*vec2(.65,2.8)+vec2(16.,cloudTime*.002));
 float cover=smoothstep(.39,.67,billow*.78+wisps*.22)*visible;
 float twilight=smoothstep(-.15,.015,sun.y)*(1.-smoothstep(.06,.26,sun.y));
 float sunward=pow(clamp(dot(normalize(vec3(d.x,.0,d.z)),normalize(vec3(sun.x,.001,sun.z)))*.5+.5,0.,1.),3.);
 vec3 cloud=mix(vec3(.075,.105,.17),vec3(.94,.965,1.),day);
 float shading=smoothstep(.39,.76,billow);
 cloud*=mix(.77,1.08,shading);
 vec3 fire=mix(vec3(.48,.22,.43),vec3(1.,.32,.12),sunward);
 fire=mix(fire,vec3(1.,.68,.34),sunward*shading*.65);
 cloud=mix(cloud,fire,twilight*(.55+.45*sunward));
 float silver=pow(max(dot(d,sun),0.),18.)*(1.-smoothstep(.43,.63,billow));
 cloud+=vec3(1.,.77,.48)*silver*.25*day;
 return mix(sky,cloud,cover*mix(.66,.91,day));
}
`;

/** Smoothly introduce sea fog after civil twilight, independent of clock / season. */
export function nightFogStrength(daylight:number){
 const x=Math.max(0,Math.min(1,(.32-daylight)/.32));
 return x*x*(3-2*x);
}

export const fogCoastLimits={offshoreOuter:-1800,offshoreInner:-1000,inlandOuter:650};
/** Signed OSM coast distance: negative at sea, positive inland, in metres. */
export function coastalFogEnvelope(distance:number,front:number){
 const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
 const edge=Math.max(90,Math.min(510,front));
 return smooth(fogCoastLimits.offshoreOuter,fogCoastLimits.offshoreInner,distance)*(1-smooth(edge-160,Math.min(fogCoastLimits.inlandOuter,edge+140),distance));
}
