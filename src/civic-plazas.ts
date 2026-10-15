import earcut from 'earcut';
import { SpotLight } from '@babylonjs/core/Lights/spotLight';
import { Color3, DynamicTexture, Mesh, Scene, ShadowGenerator, StandardMaterial, Texture, Vector3, VertexData } from './babylon';

type Point=[number,number];
type Area={id:string;name?:string;kind?:string;polygon:Point[];holes?:Point[][];position?:Point;tags?:Record<string,string>};
type Path={id:string;type?:string;points:Point[];width?:number;tags?:Record<string,string>};
type CivicData={features:Area[];plazaAreas?:Area[];plazaPaths?:Path[];governmentBuildings?:Area[]};
function inside(p:Point,poly:Point[]) {let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++)if((poly[i][1]>p[1])!==(poly[j][1]>p[1])&&p[0]<(poly[j][0]-poly[i][0])*(p[1]-poly[i][1])/(poly[j][1]-poly[i][1])+poly[i][0])yes=!yes;return yes;}

/** Photo-informed civic landmarks, bounded by actual OSM areas, not a square slab.
 * May Wind uses a continuous thick spiral steel ribbon and a twisted central
 * blade, constrained to the published 30m height / 27m diameter. Exact steel
 * fabrication geometry was not available. See docs/civic-plaza-references.md.
 */
export function buildCivicPlazas(scene:Scene,data:CivicData,shadows:ShadowGenerator,sampleHeight:(x:number,z:number)=>number) {
  const meshes:Mesh[]=[],collisionMeshes:Mesh[]=[],nearMeshes:Mesh[]=[],materials:StandardMaterial[]=[],textures:DynamicTexture[]=[],lights:SpotLight[]=[];
  const excludedBuildingIds=new Set<string>(),excludedAreaIds=new Set<string>();
  const mat=(name:string,color:string,shine=.02)=>{const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor.set(shine,shine,shine);m.useLogarithmicDepth=true;materials.push(m);return m;};
  const paving=mat('May Fourth and government plazas pale granite pavers','#ffffff'),trim=mat('Civic plazas dark radial granite inlays','#66716e'),grass=mat('Civic plazas mapped lawn beds','#759254'),hedge=mat('Civic plazas clipped hedges and trees','#ffffff'),trunk=mat('Civic plazas tree trunks','#887867'),steel=mat('May Wind red painted STEEL spiral','#cf2f20',.12),base=mat('May Wind dark polished stone plinth','#414e48',.07),water=mat('Civic mapped fountain water jets','#a9d2d6',.18),lamps=mat('Civic small warm ground luminaires','#ddd1b4',.05);
  steel.specularPower=72;steel.backFaceCulling=false;steel.twoSidedLighting=true;steel.maxSimultaneousLights=5;steel.emissiveColor=Color3.Black();
  water.alpha=.62;
  const pavingTex=new DynamicTexture('Original diagonal granite brick pavement',{width:1024,height:1024},scene,true,Texture.TRILINEAR_SAMPLINGMODE),c=pavingTex.getContext()as CanvasRenderingContext2D;
  c.fillStyle='#c5c7bc';c.fillRect(0,0,1024,1024);
  for(let y=0;y<1024;y+=128)for(let x=-128;x<1024;x+=128) {
    const offset=(y/128)%2?64:0,shade=(Math.sin(x*12.3+y*37.1)+1)*9;
    c.fillStyle=`rgb(${192+shade},${195+shade},${181+shade})`;c.fillRect(x+offset+1.5,y+1.5,125,125);
    c.strokeStyle='rgba(146,154,142,.22)';c.lineWidth=1;c.strokeRect(x+offset+3,y+3,122,122);
  }
  pavingTex.update(false);pavingTex.wrapU=pavingTex.wrapV=Texture.WRAP_ADDRESSMODE;pavingTex.anisotropicFilteringLevel=8;paving.diffuseTexture=pavingTex;textures.push(pavingTex);
  class Batch {
    p:number[]=[];ix:number[]=[];uv:number[]=[];colors:number[]=[];tint=Color3.White();
    constructor(public name:string,public material:StandardMaterial,public near=false){}
    tri(a:Vector3,b:Vector3,c:Vector3) {const n=this.p.length/3;for(const v of[a,b,c]){this.p.push(v.x,v.y,v.z);this.uv.push((v.x*.707+v.z*.707)/6.4,(v.z*.707-v.x*.707)/6.4);this.colors.push(this.tint.r,this.tint.g,this.tint.b,1);}this.ix.push(n,n+2,n+1);}
    quad(a:Vector3,b:Vector3,c:Vector3,d:Vector3){this.tri(a,b,c);this.tri(a,c,d);}
    box(c:Vector3,w:number,h:number,d:number,angle=0){
      const v=(x:number,y:number,z:number)=>new Vector3(c.x+x*Math.cos(angle)+z*Math.sin(angle),c.y+y,c.z-x*Math.sin(angle)+z*Math.cos(angle));const x=w/2,y=h/2,z=d/2;
      this.quad(v(-x,y,-z),v(-x,y,z),v(x,y,z),v(x,y,-z));this.quad(v(-x,-y,z),v(-x,-y,-z),v(x,-y,-z),v(x,-y,z));
      this.quad(v(-x,-y,-z),v(-x,y,-z),v(x,y,-z),v(x,-y,-z));this.quad(v(x,-y,z),v(x,y,z),v(-x,y,z),v(-x,-y,z));
      this.quad(v(-x,-y,z),v(-x,y,z),v(-x,y,-z),v(-x,-y,-z));this.quad(v(x,-y,-z),v(x,y,-z),v(x,y,z),v(x,-y,z));
    }
    beam(a:Vector3,b:Vector3,w:number,h:number){this.box(a.add(b).scale(.5),w,h,Vector3.Distance(a,b),Math.atan2(b.x-a.x,b.z-a.z));}
    cylinder(c:Vector3,r:number,h:number,n=20){for(let i=0;i<n;i++){const a=i*Math.PI*2/n,b=(i+1)*Math.PI*2/n,p=(t:number,y:number)=>new Vector3(c.x+r*Math.cos(t),c.y+y,c.z+r*Math.sin(t));this.quad(p(a,-h/2),p(a,h/2),p(b,h/2),p(b,-h/2));this.tri(new Vector3(c.x,c.y+h/2,c.z),p(b,h/2),p(a,h/2));}}
    finish(kind:string,cast=true,collision=false){if(!this.p.length)return undefined;const mesh=new Mesh(this.name,scene),v=new VertexData(),normal:number[]=[];v.positions=this.p;v.indices=this.ix;v.uvs=this.uv;v.colors=this.colors;VertexData.ComputeNormals(this.p,this.ix,normal);v.normals=normal;v.applyToMesh(mesh);mesh.material=this.material;mesh.receiveShadows=true;mesh.metadata={kind,name:kind==='may-wind'?'五月的风':'五四广场 / 市府前场',source:'OSM civic landmark geometry; Qingdao government and newspaper photographic references'};mesh.freezeWorldMatrix();if(cast)shadows.addShadowCaster(mesh);if(collision)collisionMeshes.push(mesh);if(this.near)nearMeshes.push(mesh);meshes.push(mesh);return mesh;}
  }
  const paved=new Batch('Civic plazas actual pedestrian polygons and holes',paving),lawns=new Batch('Civic plazas actual mapped planting polygons',grass),inlays=new Batch('Civic plazas circular and axis granite inlays',trim),plants=new Batch('Civic plazas planting-bed tree canopy groups',hedge,true),stems=new Batch('Civic plazas tree trunks',trunk,true),fixtures=new Batch('Civic plazas SMALL in-ground light fixtures',lamps,true),fountains=new Batch('Civic mapped fountain basin',base),jets=new Batch('Civic mapped fountain small water jets',water,true);
  function flat(area:Area,batch:Batch,offset:number){
    const rings=[area.polygon,...area.holes||[]],coords=rings.flatMap(r=>r.flat()),holes:number[]=[];let count=area.polygon.length;
    for(const r of area.holes??[]){holes.push(count);count+=r.length;}
    const points=rings.flat(),ix=earcut(coords,holes,2),point=(p:Point)=>new Vector3(p[0],sampleHeight(...p)+offset,p[1]);
    function triangle(a:Point,b:Point,c:Point,depth=0){
      const ab=Math.hypot(a[0]-b[0],a[1]-b[1]),bc=Math.hypot(b[0]-c[0],b[1]-c[1]),ca=Math.hypot(c[0]-a[0],c[1]-a[1]);
      if(Math.max(ab,bc,ca)>11&&depth<12){const mid=(p:Point,q:Point):Point=>[(p[0]+q[0])/2,(p[1]+q[1])/2];if(ab>=bc&&ab>=ca){const m=mid(a,b);triangle(a,m,c,depth+1);triangle(m,b,c,depth+1);}else if(bc>=ca){const m=mid(b,c);triangle(a,b,m,depth+1);triangle(a,m,c,depth+1);}else{const m=mid(c,a);triangle(a,b,m,depth+1);triangle(m,b,c,depth+1);}return;}
      const pa=point(a),pb=point(b),pc=point(c);const normal=(pb.z-pa.z)*(pc.x-pa.x)-(pb.x-pa.x)*(pc.z-pa.z);if(normal<0)batch.tri(pa,pc,pb);else batch.tri(pa,pb,pc);
    }
    for(let i=0;i<ix.length;i+=3)triangle(points[ix[i]],points[ix[i+1]],points[ix[i+2]]);
  }
  const areas=data.plazaAreas??[];
  const mappedPaving=areas.filter(a=>a.kind==='paved-plaza'||a.tags?.area==='yes'&&a.tags?.highway==='pedestrian');
  const selectedPaving=mappedPaving.length?mappedPaving:data.features.filter(a=>a.tags?.area==='yes'&&a.tags?.highway==='pedestrian');
  for(const area of selectedPaving){flat(area,paved,.13);excludedAreaIds.add(area.id);}
  let treeCount=0;
  for(const area of areas.filter(a=>a.kind==='planting'||a.tags?.landuse==='grass'||a.tags?.leisure==='garden')){
    flat(area,lawns,.16);excludedAreaIds.add(area.id);
    const x=area.polygon.map(p=>p[0]),z=area.polygon.map(p=>p[1]);
    for(let xx=Math.min(...x)+7;xx<Math.max(...x)&&treeCount<170;xx+=18)for(let zz=Math.min(...z)+7;zz<Math.max(...z)&&treeCount<170;zz+=18){
      if(!inside([xx,zz],area.polygon)||(area.holes??[]).some(h=>inside([xx,zz],h)))continue;
      const h=sampleHeight(xx,zz),seed=(Math.sin(xx*14.38+zz*71.23)+1)*.5,height=4.2+seed*2;
      stems.cylinder(new Vector3(xx,h+height*.38,zz),.12,height*.76,6);
      plants.tint=Color3.FromHexString(treeCount++%2?'#5c8150':'#3e6c47');
      const rings=[[0,0],[1.8,1],[2.4,2.7],[1.6,4.3],[0,5.0]],center=new Vector3(xx,h+height*.35,zz);
      for(let k=0;k<4;k++)for(let i=0;i<10;i++){const p=(j:number,n:number)=>new Vector3(center.x+rings[n][0]*Math.cos(j*Math.PI/5),center.y+rings[n][1],center.z+rings[n][0]*Math.sin(j*Math.PI/5));plants.quad(p(i,k),p(i,k+1),p(i+1,k+1),p(i+1,k));}
    }
  }
  for(const f of areas.filter(a=>a.kind==='fountain'||a.tags?.amenity==='fountain')){
    flat(f,fountains,.19);excludedAreaIds.add(f.id);const p=f.position??[f.polygon.reduce((s,p)=>s+p[0],0)/f.polygon.length,f.polygon.reduce((s,p)=>s+p[1],0)/f.polygon.length]as Point;
    for(let i=0;i<12;i++){const a=i*Math.PI/6,x=p[0]+3.5*Math.cos(a),z=p[1]+3.5*Math.sin(a);if(inside([x,z],f.polygon))jets.cylinder(new Vector3(x,sampleHeight(x,z)+1.2,z),.045,2,6);}
  }
  // Limited small fixtures follow real mapped paths; never light an entire grass/paving plane.
  for(const path of data.plazaPaths??[])for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<4)continue;
    const n=Math.min(8,Math.floor(length/12));for(let j=0;j<n;j++){const t=(j+.5)/n,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;fixtures.box(new Vector3(x,sampleHeight(x,z)+.19,z),.28,.035,.12,Math.atan2(b[0]-a[0],b[1]-a[1]));}
  }
  const source=data.features.find(f=>f.kind==='may-wind'||String(f.id)==='way/539970693');
  const [sx,sz]=source?.position??[5752.32,103.15],sy=sampleHeight(sx,sz),center=new Vector3(sx,sy,sz);
  const sculpture=new Batch('May Wind continuous red spiral STEEL ribbon and central wind blade',steel),pedestal=new Batch('May Wind black stone compact pedestal',base);
  pedestal.cylinder(center.add(new Vector3(0,.35,0)),4.3,.7,48);
  const turns=4.85,segments=560;
  // A closed rounded wedge section gives each broad steel blade real thickness.
  const section=[[-1.25,-1.12],[.8,-1.12],[1.72,-.52],[1.82,.36],[.85,1.22],[-1.25,.88]];
  const radius=(t:number)=>3.2+8.25*Math.sin(Math.PI*Math.pow(t,.90))**.74;
  const p=(i:number,k:number)=>{
    const t=i/segments,angle=t*Math.PI*2*turns-.7,r=radius(t),end=Math.min(1,.35+t*9,.35+(1-t)*9),radial=section[k][0]*end,vertical=section[k][1]*end;
    return new Vector3(sx+(r+radial)*Math.cos(angle),sy+1.0+t*27.7+vertical,sz+(r+radial)*Math.sin(angle));
  };
  // The section runs counterclockwise in radial/up coordinates. Advance around
  // the section before advancing along the helix so the closed shell normals
  // face OUT, including the broad upper steel face that receives midday sun.
  for(let i=0;i<segments;i++)for(let k=0;k<section.length;k++)sculpture.quad(p(i,k),p(i,(k+1)%section.length),p(i+1,(k+1)%section.length),p(i+1,k));
  for(const i of[0,segments]){const avg=section.reduce((v,_,k)=>v.add(p(i,k)),Vector3.Zero()).scale(1/section.length);for(let k=0;k<section.length;k++)if(i===0)sculpture.tri(avg,p(i,(k+1)%section.length),p(i,k));else sculpture.tri(avg,p(i,k),p(i,(k+1)%section.length));}
  // The visible central wind curls upward and leans at its tip; it is a swept steel
  // blade rather than a red ball or cone filling the spaces between the ribbons.
  const core=(j:number,side:number)=>{const t=j/110,a=t*5.6+.3,w=(1-t)*1.9+.15,offset=Math.sin(t*Math.PI)*2.1;return new Vector3(sx+offset*Math.cos(a)+Math.cos(a+side*Math.PI)*w,sy+.75+t*29.25,sz+offset*Math.sin(a)+Math.sin(a+side*Math.PI)*w);};
  for(let j=0;j<110;j++){sculpture.quad(core(j,0),core(j+1,0),core(j+1,1),core(j,1));}
  // Match the published maximum horizontal span without altering the OSM anchor.
  const xx=sculpture.p.filter((_,i)=>i%3===0),zz=sculpture.p.filter((_,i)=>i%3===2),horizontalScale=27/Math.max(Math.max(...xx)-Math.min(...xx),Math.max(...zz)-Math.min(...zz));
  for(let i=0;i<sculpture.p.length;i+=3){sculpture.p[i]=sx+(sculpture.p[i]-sx)*horizontalScale;sculpture.p[i+2]=sz+(sculpture.p[i+2]-sz)*horizontalScale;}
  // Ring inlays fit the source paved surface; positions are photo-informed detailing.
  for(const r of[22.2,28.3])for(let i=0;i<128;i++){
    const a=i*Math.PI/64,b=(i+1)*Math.PI/64,x=sx+r*Math.cos(a),z=sz+r*Math.sin(a),xx=sx+r*Math.cos(b),zz=sz+r*Math.sin(b);
    if(!selectedPaving.some(f=>inside([x,z],f.polygon)&&!(f.holes??[]).some(h=>inside([x,z],h))))continue;
    inlays.beam(new Vector3(x,sampleHeight(x,z)+.17,z),new Vector3(xx,sampleHeight(xx,zz)+.17,zz),.32,.04);
  }
  const sculptureMesh=sculpture.finish('may-wind',true,true)!;sculptureMesh.metadata={...sculptureMesh.metadata,height:30,maximumDiameter:27,sourceId:source?.id??'way/539970693',estimatedDetail:'Continuous thick spiral ribbon and central wind blade approximate photographed steel geometry, not fabrication drawings'};
  pedestal.finish('may-wind-base',true,true);paved.finish('civic-paving',false,true);lawns.finish('civic-lawns',false);inlays.finish('civic-granite-inlays',false);plants.finish('civic-trees');stems.finish('civic-trees');fixtures.finish('civic-ground-luminaires',false);fountains.finish('civic-fountain',false);jets.finish('civic-fountain-jets',false);
  if(source){excludedAreaIds.add(source.id);excludedBuildingIds.add(source.id);excludedBuildingIds.add('relation/20812582');}
  for(let i=0;i<3;i++){
    const a=-Math.PI/2+i*Math.PI*2/3,pos=center.add(new Vector3(Math.cos(a)*19,1.5,Math.sin(a)*19)),target=center.add(new Vector3(0,15,0));
    const light=new SpotLight('May Wind architectural uplight '+i,pos,target.subtract(pos).normalize(),Math.PI/3,1.2,scene);light.diffuse=new Color3(1,.78,.60);light.specular=new Color3(.4,.2,.1);light.intensity=0;light.range=65;light.includedOnlyMeshes=[sculptureMesh];lights.push(light);
  }
  const views=[{id:'may-fourth-square',name:'五四广场',position:center.add(new Vector3(0,10,0)),radius:220,alpha:-2.1,beta:1.04}];
  const gov=data.features.find(f=>f.kind==='city-government');if(gov?.position)views.push({id:'city-government-plaza',name:'市政府广场',position:new Vector3(gov.position[0],sampleHeight(...gov.position)+8,gov.position[1]-70),radius:230,alpha:-1.9,beta:1.0});
  return {meshes,collisionMeshes,excludedBuildingIds,excludedAreaIds,views,stats:{meshes:meshes.length,trees:treeCount,steelSegments:segments},setDetail(distance:number){for(const m of nearMeshes)m.setEnabled(distance<2300);},setNight(strength:number,time=0){const s=Math.max(0,Math.min(1,strength));for(let i=0;i<lights.length;i++)lights[i].intensity=s*(3.8+Math.sin(time*.06+i)*.12);lamps.emissiveColor=new Color3(1,.70,.34).scale(s*1.1);},dispose(){for(const m of meshes){shadows.removeShadowCaster(m);m.dispose();}for(const l of lights)l.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();}};
}
