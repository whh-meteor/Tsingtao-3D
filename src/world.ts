import { AbstractMesh, Color3, DynamicTexture, Mesh, Scene, ShadowGenerator, StandardMaterial, Texture, Vector3, VertexData } from './babylon';
import earcut from 'earcut';
import { buildStation } from './station';
import { buildPavilion } from './pavilion';

type P = [number, number];
type Feature = {id: string | number; name?: string; polygon?: P[]; holes?: P[][]; points?: P[]; height?: number; estimatedHeight?: boolean; width?: number; type?: string; tags?: Record<string,string>};
const LAND = 2.4;

/** Geographic coordinates are local ENU metres: Babylon X east, Z north. */
export function buildWorld(scene: Scene, data: any, shadows: ShadowGenerator, sampleHeight?: (x:number,z:number)=>number) {
  const owned: AbstractMesh[] = [], materials: StandardMaterial[] = [], textures: Texture[] = [];
  const reflectionMeshes: AbstractMesh[] = [], collisionMeshes: AbstractMesh[] = [];
  const terrain=(x:number,z:number)=>{const h=sampleHeight?.(x,z);return typeof h==='number'&&Number.isFinite(h)?h:LAND;};
  const hash=(id:any)=>String(id).split('').reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,17);
  const details: {mesh:AbstractMesh; maxDistance:number}[]=[];
  const rememberDetail=(mesh:AbstractMesh|undefined,maxDistance:number)=>{if(mesh)details.push({mesh,maxDistance});return mesh;};
  const PIER=sampleHeight?3.84:LAND;
  const makeMat = (name: string, color: string) => {
    const m = new StandardMaterial(name,scene); m.diffuseColor = Color3.FromHexString(color); m.specularColor = new Color3(.015,.015,.015); m.useLogarithmicDepth=true;materials.push(m); return m;
  };
  const stone = makeMat('Local pale granite','#b8b6a5'), pavement = makeMat('Coastal promenades','#d5cdbc');
  const roadMat = makeMat('Warm asphalt','#62686a'), lineMat = makeMat('Road markings','#dbd5bb');
  const landMat = makeMat('Urban ground','#93a584'), sandMat = makeMat('Tidal stone band','#bcb095');
  // Negative slope/depth bias pulls the road surface toward the camera in Babylon.
  roadMat.zOffset=-2;roadMat.zOffsetUnits=-2;pavement.zOffset=-1;lineMat.zOffset=-3;lineMat.zOffsetUnits=-3;
  const railMat = makeMat('Zhanqiao painted metal railing','#426b80');
  const lampMat = makeMat('Zhanqiao dark cast metal lamps','#303d41');
  const globeMat = makeMat('Zhanqiao lotus lamp glass','#fff4ce');
  globeMat.emissiveColor=new Color3(.12,.10,.06);
  const tiled=(name:string,mat:StandardMaterial,size:number,draw:(ctx:CanvasRenderingContext2D)=>void)=>{const t=new DynamicTexture(name,{width:size,height:size},scene,true,Texture.TRILINEAR_SAMPLINGMODE);draw(t.getContext() as unknown as CanvasRenderingContext2D);t.update(false);t.wrapU=t.wrapV=Texture.WRAP_ADDRESSMODE;t.anisotropicFilteringLevel=8;mat.diffuseTexture=t;mat.diffuseColor=Color3.White();textures.push(t);};
  tiled('Granite slab joints',pavement,256,ctx=>{ctx.fillStyle='#d0c8b7';ctx.fillRect(0,0,256,256);let seed=29;for(let i=0;i<5000;i++){seed=(seed*1664525+1013904223)>>>0;const x=seed%256;seed=(seed*1664525+1013904223)>>>0;const y=seed%256;ctx.fillStyle=i%2?'rgba(60,52,45,.08)':'rgba(255,255,245,.22)';ctx.fillRect(x,y,1,1);}ctx.strokeStyle='#ada99b';ctx.lineWidth=2;for(let y=0;y<=256;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();for(let x=(y/64%2)*64;x<256;x+=128){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+64);ctx.stroke();}}});
  tiled('Salt weathered granite blocks',stone,256,ctx=>{ctx.fillStyle='#aaa99e';ctx.fillRect(0,0,256,256);let s=37;for(let i=0;i<7000;i++){s=(s*1664525+1013904223)>>>0;const x=s%256;s=(s*1664525+1013904223)>>>0;ctx.fillStyle=i%3?'rgba(50,56,48,.10)':'rgba(245,240,224,.35)';ctx.fillRect(x,s%256,2,1);}ctx.strokeStyle='#858b81';ctx.lineWidth=3;for(let y=0;y<=256;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();for(let x=(y/64%2)*64;x<256;x+=128){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+64);ctx.stroke();}}});
  const wallMats = ['#eee1c8'].map((c,i)=>{
    const m=makeMat(`Facade palette ${i}`,c);
    const t = new DynamicTexture(`Shared window tile ${i}`,{width:128,height:128},scene,true,Texture.TRILINEAR_SAMPLINGMODE); t.anisotropicFilteringLevel=8;textures.push(t);
    const ctx=t.getContext(); ctx.fillStyle=c; ctx.fillRect(0,0,128,128);
    ctx.fillStyle='rgba(60,75,81,0.10)'; ctx.fillRect(32,30,65,72);
    ctx.fillStyle='#869da0'; ctx.fillRect(36,28,56,66);
    ctx.fillStyle='#adc0be'; ctx.fillRect(39,31,23,28); ctx.fillStyle='#9bafaf'; ctx.fillRect(66,31,23,28);
    ctx.fillStyle=c; ctx.fillRect(62,28,4,66); ctx.fillRect(36,60,56,4);
    ctx.fillStyle='#b5b1a5'; ctx.fillRect(33,94,63,5); ctx.fillStyle='rgba(100,93,78,0.12)'; ctx.fillRect(0,122,128,2);
    t.update(false); t.wrapU=Texture.WRAP_ADDRESSMODE; t.wrapV=Texture.WRAP_ADDRESSMODE; m.diffuseTexture=t; m.diffuseColor=Color3.White();return m;
  });
  // Per-building vertex tints keep the whole city to two shared material batches per chunk.
  const facadeTint=['#ffffff','#e9eced','#e4e9ed','#f2e2d5','#d5e5ef'].map(Color3.FromHexString);
  const cityRoofMaterial=makeMat('Shared city roof material','#ffffff');
  const roofTints=['#ad5039','#b45840','#bf6949','#8d9795','#a5a7a0'].map(Color3.FromHexString);

  class Batch {
    positions:number[]=[]; indices:number[]=[]; uvs:number[]=[];colors:number[]=[];tint=Color3.White();
    constructor(public name:string,public mat:StandardMaterial){}
    tri(a:Vector3,b:Vector3,c:Vector3,uv:[number,number][]=[[0,0],[1,0],[0,1]]) {
      const n=this.positions.length/3; for(const p of [a,b,c]) this.positions.push(p.x,p.y,p.z);
      // Babylon's left-handed default uses clockwise front faces and its normal generator follows that convention.
      this.indices.push(n,n+2,n+1); for(const p of uv)this.uvs.push(...p);for(let i=0;i<3;i++)this.colors.push(this.tint.r,this.tint.g,this.tint.b,1);
    }
    quad(a:Vector3,b:Vector3,c:Vector3,d:Vector3,uv?:[number,number][]) {uv??=this.mat===stone?[[0,0],[0,Vector3.Distance(a,b)/1.6],[Vector3.Distance(b,c)/1.6,Vector3.Distance(a,b)/1.6],[Vector3.Distance(b,c)/1.6,0]]:[[0,0],[1,0],[1,1],[0,1]];this.tri(a,b,c,[uv[0],uv[1],uv[2]]);this.tri(a,c,d,[uv[0],uv[2],uv[3]]);}
    box(center:Vector3,sx:number,sy:number,sz:number,angle=0) {
      const v=(x:number,y:number,z:number)=>new Vector3(center.x+x*Math.cos(angle)+z*Math.sin(angle),center.y+y,center.z-x*Math.sin(angle)+z*Math.cos(angle));
      const a=sx/2,b=sy/2,c=sz/2;
      this.quad(v(-a,b,-c),v(-a,b,c),v(a,b,c),v(a,b,-c));
      this.quad(v(-a,-b,c),v(-a,-b,-c),v(a,-b,-c),v(a,-b,c));
      this.quad(v(-a,-b,-c),v(-a,b,-c),v(a,b,-c),v(a,-b,-c));
      this.quad(v(a,-b,c),v(a,b,c),v(-a,b,c),v(-a,-b,c));
      this.quad(v(-a,-b,c),v(-a,b,c),v(-a,b,-c),v(-a,-b,-c));
      this.quad(v(a,-b,-c),v(a,b,-c),v(a,b,c),v(a,-b,c));
    }
    cylinder(c:Vector3,r:number,h:number,sides=8){for(let i=0;i<sides;i++){
      const a=i/sides*Math.PI*2,b=(i+1)/sides*Math.PI*2;
      this.quad(new Vector3(c.x+Math.cos(a)*r,c.y-h/2,c.z+Math.sin(a)*r),new Vector3(c.x+Math.cos(a)*r,c.y+h/2,c.z+Math.sin(a)*r),new Vector3(c.x+Math.cos(b)*r,c.y+h/2,c.z+Math.sin(b)*r),new Vector3(c.x+Math.cos(b)*r,c.y-h/2,c.z+Math.sin(b)*r));
    }}
    tube(a:Vector3,b:Vector3,r:number,sides=6){const along=b.subtract(a).normalize(),ref=Math.abs(along.y)>.95?Vector3.Right():Vector3.Up(),u=Vector3.Cross(along,ref).normalize().scale(r),v=Vector3.Cross(along,u).normalize().scale(r);const point=(c:Vector3,t:number)=>c.add(u.scale(Math.cos(t))).add(v.scale(Math.sin(t)));for(let i=0;i<sides;i++){const t=i*Math.PI*2/sides,q=(i+1)*Math.PI*2/sides;this.quad(point(a,t),point(b,t),point(b,q),point(a,q));}}
    finish(meta?:any,cast=false){if(!this.positions.length)return undefined;const mesh=new Mesh(this.name,scene);const vd=new VertexData();vd.positions=this.positions;vd.indices=this.indices;vd.uvs=this.uvs;vd.colors=this.colors;const normals:number[]=[];VertexData.ComputeNormals(this.positions,this.indices,normals);vd.normals=normals;vd.applyToMesh(mesh);mesh.material=this.mat;mesh.receiveShadows=true;mesh.metadata=meta;owned.push(mesh);reflectionMeshes.push(mesh);if(cast)shadows.addShadowCaster(mesh);return mesh;}
  }
  const clean=(p:P[])=>{const q=p.slice();if(q.length>2&&Math.hypot(q[0][0]-q[q.length-1][0],q[0][1]-q[q.length-1][1])<.01)q.pop();return q;};
  const flat=(batch:Batch,polygon:P[],y:number|((x:number,z:number)=>number),holes:P[][]=[])=>{
    const ring=clean(polygon);if(ring.length<3)return;const rings=[ring,...holes.map(clean)];const coords=rings.flatMap(r=>r.flat());let total=ring.length;const hi:number[]=[];for(let i=1;i<rings.length;i++){hi.push(total);total+=rings[i].length;}
    const height=(p:Vector3)=>typeof y==='function'?y(p.x,p.z):y;
    const emit=(a:Vector3,b:Vector3,c:Vector3,depth=0)=>{const edges=[Vector3.DistanceSquared(a,b),Vector3.DistanceSquared(b,c),Vector3.DistanceSquared(c,a)];const longest=Math.max(...edges);if(typeof y==='function'&&longest>30*30&&depth<10){const index=edges.indexOf(longest),v=[a,b,c],p=v[index],q=v[(index+1)%3],r=v[(index+2)%3],mid=p.add(q).scale(.5);emit(p,mid,r,depth+1);emit(mid,q,r,depth+1);return;}a.y=height(a);b.y=height(b);c.y=height(c);if(Vector3.Cross(b.subtract(a),c.subtract(a)).y<0)[b,c]=[c,b];batch.tri(a,b,c,[a,b,c].map(p=>[p.x/20,p.z/20]));};
    const idx=earcut(coords,hi,2);for(let i=0;i<idx.length;i+=3){const pts=idx.slice(i,i+3).map(j=>new Vector3(coords[j*2],0,coords[j*2+1]));emit(pts[0],pts[1],pts[2]);}
  };
  const walls=(batch:Batch,polygon:P[],base:number,height:number,tiled=false,bottomHeight?:(x:number,z:number)=>number)=>{
    const ring=clean(polygon);let area=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];area+=a[0]*b[1]-b[0]*a[1];}
    for(let i=0;i<ring.length;i++){let a=ring[i],b=ring[(i+1)%ring.length];if(area<0)[a,b]=[b,a];const len=Math.hypot(a[0]-b[0],a[1]-b[1]);batch.quad(new Vector3(a[0],bottomHeight?.(...a)??base,a[1]),new Vector3(a[0],base+height,a[1]),new Vector3(b[0],base+height,b[1]),new Vector3(b[0],bottomHeight?.(...b)??base,b[1]),[[0,height/3.4],[0,0],[tiled?len/3.6:1,0],[tiled?len/3.6:1,height/3.4]]);}
  };
  const ribbon=(batch:Batch,points:P[],width:number,y:number|((x:number,z:number)=>number))=>{
    const vertex=(x:number,z:number)=>new Vector3(x,typeof y==='function'?y(x,z):y,z);
    for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);if(l<.1)continue;const nx=-dz/l*width/2,nz=dx/l*width/2,n=typeof y==='function'?Math.max(1,Math.ceil(l/12)):1;for(let j=0;j<n;j++){const ax=a[0]+dx*j/n,az=a[1]+dz*j/n,bx=a[0]+dx*(j+1)/n,bz=a[1]+dz*(j+1)/n;batch.quad(vertex(ax-nx,az-nz),vertex(ax+nx,az+nz),vertex(bx+nx,bz+nz),vertex(bx-nx,bz-nz));}}
  };
  const landBatch=new Batch('OSM coastline land',landMat), retaining=new Batch('OSM sea walls',stone), tidal=new Batch('Sea wall foot',sandMat);
  if(!sampleHeight)for(const f of (data.land||[]) as Feature[]){if(!f.polygon)continue;flat(landBatch,f.polygon,LAND,f.holes);walls(landBatch,f.polygon,-3,LAND+3);}
  const ground=landBatch.finish({kind:'land',source:'OSM coastline; flat elevation 2.4 m is a demo assumption'});if(ground)collisionMeshes.push(ground);
  for(const f of (data.coastlines||[]) as Feature[]){if(!f.points)continue;for(let i=0;i<f.points.length-1;i++){const a=f.points[i],b=f.points[i+1];retaining.quad(new Vector3(a[0],-.5,a[1]),new Vector3(a[0],Math.max(.5,terrain(...a)),a[1]),new Vector3(b[0],Math.max(.5,terrain(...b)),b[1]),new Vector3(b[0],-.5,b[1]));}ribbon(tidal,f.points,2.2,-.28);}
  retaining.finish({kind:'coastline',source:'OSM coastline exact plan position; sea-wall elevation and material approximate'});tidal.finish({kind:'tidal-band',source:'Stylized narrow sea-wall foot; not surveyed beach geometry'});

  const grassMat=makeMat('Mapped park ground','#789760'),beachMat=makeMat('Mapped sand beaches','#dfcdaa');grassMat.zOffset=-1;beachMat.zOffset=-1;
  const parkGround=new Batch('OSM mapped parks',grassMat),beachGround=new Batch('OSM mapped beaches',beachMat);
  const trunks=new Batch('Near park tree trunks',makeMat('Tree bark','#7b7562')),canopies=new Batch('Near park low polygon tree canopies',makeMat('Tree leaves','#ffffff'));
  const inside=(x:number,z:number,p:P[])=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
  let treeCount=0;
  for(const area of (data.areas||[]) as Feature[]){if(!area.polygon||area.polygon.length<3)continue;const beach=area.type==='beach';flat(beach?beachGround:parkGround,area.polygon,sampleHeight?((x,z)=>terrain(x,z)+.08):LAND+.022,area.holes);
    if(beach||/广场/.test(area.name||''))continue;
    const xs=area.polygon.map(p=>p[0]),zs=area.polygon.map(p=>p[1]);let seed=String(area.id).split('').reduce((n,c)=>n+c.charCodeAt(0),1);const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let x=Math.max(-620,Math.min(...xs));x<Math.min(620,Math.max(...xs));x+=24)for(let z=Math.max(-620,Math.min(...zs));z<Math.min(620,Math.max(...zs));z+=24){const tx=x+(random()-.5)*12,tz=z+(random()-.5)*12;if(treeCount>=90||Math.hypot(tx,tz)>620||!inside(tx,tz,area.polygon))continue;const h=4.5+random()*2,r=2.6+random(),base=terrain(tx,tz);trunks.cylinder(new Vector3(tx,base+h/2,tz),.23,h,6);canopies.tint=Color3.FromHexString(['#477544','#5b8050','#70925c'][treeCount%3]);
      const top=new Vector3(tx,base+h+2.2,tz),bottom=new Vector3(tx,base+h-2,tz);for(let i=0;i<7;i++){const a=i*Math.PI*2/7,b=(i+1)*Math.PI*2/7;const p=new Vector3(tx+Math.cos(a)*r,base+h,tz+Math.sin(a)*r),q=new Vector3(tx+Math.cos(b)*r,base+h,tz+Math.sin(b)*r);canopies.tri(p,top,q);canopies.tri(p,q,bottom);}treeCount++;
    }
  }
  parkGround.finish({kind:'park',source:sampleHeight?'OSM mapped park polygons draped onto DEM':'OSM mapped park polygons; flat terrain assumption'});beachGround.finish({kind:'beach',source:'OSM beach polygons draped onto available elevation'});rememberDetail(trunks.finish({kind:'trees',source:'Illustrative low-density trees inside mapped near-shore parks'},true),2600);rememberDetail(canopies.finish({kind:'trees',source:'Illustrative trees; individual locations are not surveyed'},true),2600);

  const mappedPier=((data.piers||[]) as Feature[]).find(f=>/栈桥|zhanqiao/i.test(f.name||f.tags?.name||''));
  const roads=new Batch('OSM arterial road network',roadMat),minorRoads=new Batch('OSM local road network',roadMat), paths=new Batch('OSM pedestrian routes',pavement), markings=new Batch('Road centre markings',lineMat);
  const tiers:Record<string,number>={motorway:8,trunk:7,primary:6,secondary:5,tertiary:4,unclassified:3,residential:2,living_street:2,service:1};
  for(const f of (data.roads||[]) as Feature[]){if(!f.points||f.points.length<2)continue;const type=f.type||f.tags?.highway||'',pedestrian=['footway','path','pedestrian','steps','cycleway'].includes(type),width=f.width|| (pedestrian?3:7),tier=tiers[type]||0;
    // Stable category/width/id separation removes coplanar OSM ways at intersections.
    const offset=.16+tier*.028+Math.min(30,width)*.001+(hash(f.id)%1000)*.00002;
    const bridge=f.tags?.bridge&&f.tags.bridge!=='no',layer=Number(f.tags?.layer||0),raised=bridge?Math.max(3,layer*4):Math.max(0,layer*4);
    const surface=(x:number,z:number)=>terrain(x,z)+offset+raised;
    for(let j=0;j<f.points.length-1;j++){const a=f.points[j],b=f.points[j+1];if(pedestrian&&mappedPier?.polygon&&inside((a[0]+b[0])/2,(a[1]+b[1])/2,mappedPier.polygon))continue;ribbon(pedestrian?paths:tier>=4?roads:minorRoads,[a,b],width,sampleHeight?surface:LAND+offset+raised);}
    if(!pedestrian&&width>=7)for(let j=0;j<f.points.length-1;j++){const a=f.points[j],b=f.points[j+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let t=1;t<len;t+=14){const end=Math.min(len,t+4);ribbon(markings,[[a[0]+(b[0]-a[0])*t/len,a[1]+(b[1]-a[1])*t/len],[a[0]+(b[0]-a[0])*end/len,a[1]+(b[1]-a[1])*end/len]],.13,sampleHeight?((x,z)=>surface(x,z)+.045):LAND+offset+raised+.045);}}
  }
  roads.finish({kind:'roads',source:'OSM main road centre lines draped onto DEM; tagged bridge layers approximated'});rememberDetail(minorRoads.finish({kind:'roads',source:'OSM local roads; elevation follows DEM'}),6500);rememberDetail(paths.finish({kind:'paths',source:'OSM paths; pier duplicates excluded'}),4200);rememberDetail(markings.finish({kind:'markings',source:'Procedural approximate markings'}),1200);

  const buildingWalls=new Map<string,Batch>(), buildingRoofs=new Map<string,Batch>(), buildingColliders=new Map<string,Batch>();
  const chunkBatch=(map:Map<string,Batch>,cx:number,cz:number,index:number,m:StandardMaterial,kind:string)=>{
    const gx=Math.floor(cx/500),gz=Math.floor(cz/500),key=`${gx}:${gz}:${index}`;
    if(!map.has(key))map.set(key,new Batch(`${kind} chunk ${gx} ${gz} palette ${index}`,m));return map.get(key)!;
  };
  const station=buildStation(scene,data,shadows,terrain);
  collisionMeshes.push(...station.collisionMeshes);
  let buildingCount=0,colliderCount=0;
  for(const f of (data.buildings||[]) as Feature[]){if(!f.polygon||f.polygon.length<3)continue;const p=clean(f.polygon),h=f.height||12,k=hash(f.id),cx=p.reduce((s,q)=>s+q[0],0)/p.length,cz=p.reduce((s,q)=>s+q[1],0)/p.length;
    // Huilan Pavilion is modeled separately from its surveyed footprint.
    if(/回澜|huilan/i.test(f.name||f.tags?.name||'')||station.excludedIds.has(String(f.id)))continue;
    // Keep a level roof above the highest sampled footprint point; foundation walls reach down into the slope.
    let base=terrain(cx,cz);if(sampleHeight){for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/15));for(let j=0;j<=steps;j++)base=Math.max(base,terrain(a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps));}
      const minX=Math.min(...p.map(v=>v[0])),maxX=Math.max(...p.map(v=>v[0])),minZ=Math.min(...p.map(v=>v[1])),maxZ=Math.max(...p.map(v=>v[1]));for(let x=minX;x<=maxX;x+=Math.max(20,(maxX-minX)/8))for(let z=minZ;z<=maxZ;z+=Math.max(20,(maxZ-minZ)/8))if(inside(x,z,p))base=Math.max(base,terrain(x,z));}
    const foundation=sampleHeight?((x:number,z:number)=>terrain(x,z)-.25):undefined;
    const w=chunkBatch(buildingWalls,cx,cz,0,wallMats[0],'OSM facades');w.tint=facadeTint[k%facadeTint.length];walls(w,p,base,h,true,foundation);
    const roofIndex=h<18?k%3:3+k%2;const roof=chunkBatch(buildingRoofs,cx,cz,0,cityRoofMaterial,'OSM roofs');roof.tint=roofTints[roofIndex];const pitched=h<18&&f.tags?.['roof:shape']!=='flat';
    if(pitched){const apex=new Vector3(cx,base+h+Math.min(3.5,h*.23),cz);for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];let va=new Vector3(a[0],base+h,a[1]),vb=new Vector3(b[0],base+h,b[1]);if(Vector3.Cross(vb.subtract(va),apex.subtract(va)).y<0)[va,vb]=[vb,va];roof.tri(va,vb,apex);}}
    else flat(roof,p,base+h);
    if(Math.hypot(cx,cz)<800){const batch=chunkBatch(buildingColliders,cx,cz,0,stone,'Building collision');walls(batch,p,base,h,false,foundation);flat(batch,p,base+h);colliderCount++;}
    buildingCount++;
  }
  for(const map of [buildingWalls,buildingRoofs])for(const batch of map.values()){
    const mesh=batch.finish({kind:map===buildingWalls?'buildings':'building-roofs',source:'OSM actual footprints; elevations sampled from available DEM; shared procedural facade tiles; missing heights estimated; stylized roof shapes'});
    if(mesh){mesh.refreshBoundingInfo();const center=mesh.getBoundingInfo().boundingSphere.centerWorld;if(Math.hypot(center.x,center.z)<800)shadows.addShadowCaster(mesh);}
  }
  for(const batch of buildingColliders.values()){const mesh=batch.finish({kind:'building-collisions',source:'OSM nearby buildings grouped in 500 m chunks'});if(mesh){mesh.isVisible=false;collisionMeshes.push(mesh);}}

  // Locate the named pier. The data extractor supplies landmark coordinates when available.
  const piers=(data.piers||[]) as Feature[];const pier=piers.find(f=>/栈桥|zhanqiao/i.test(f.name||f.tags?.name||''))||piers.find(f=>f.polygon&&f.polygon.some(p=>Math.hypot(...p)<250));
  let pierStart=new Vector3(0,PIER+.16,175),pavilionPosition=new Vector3(0,PIER,-185);
  let axis:P[]|undefined;
  const landmark=(Array.isArray(data.landmarks)?data.landmarks.find((f:any)=>/回澜|huilan/i.test(f.name||'')):data.landmarks?.huilanPavilion||data.landmarks?.pavilion)||data.pavilion;
  const landmarkPoint:Array<number>|undefined=Array.isArray(landmark)?landmark:landmark?.point||landmark?.position;
  if(landmarkPoint)pavilionPosition=new Vector3(landmarkPoint[0],PIER,landmarkPoint[1]);
  if(pier?.points&&pier.points.length>=2)axis=pier.points;
  else if(pier?.polygon){const p=clean(pier.polygon);const cx=p.reduce((s,q)=>s+q[0],0)/p.length,cz=p.reduce((s,q)=>s+q[1],0)/p.length;let xx=0,zz=0,xz=0;for(const q of p){xx+=(q[0]-cx)**2;zz+=(q[1]-cz)**2;xz+=(q[0]-cx)*(q[1]-cz);}const angle=.5*Math.atan2(2*xz,xx-zz);const dx=Math.cos(angle),dz=Math.sin(angle);const projections=p.map(q=>(q[0]-cx)*dx+(q[1]-cz)*dz);const lo=Math.min(...projections),hi=Math.max(...projections);axis=[[cx+lo*dx,cz+lo*dz],[cx+hi*dx,cz+hi*dz]];}
  if(axis){if(axis[0][1]<axis[axis.length-1][1])axis=axis.slice().reverse();pierStart=new Vector3(axis[0][0],PIER+.16,axis[0][1]);if(!landmarkPoint)pavilionPosition=new Vector3(axis[axis.length-1][0],PIER,axis[axis.length-1][1]);}
  const bridgeDeck=new Batch('Zhanqiao surveyed pier deck',pavement), masonry=new Batch('Zhanqiao stone approach',stone), supports=new Batch('Zhanqiao open sea piers',stone), rails=new Batch('Zhanqiao metal railings',railMat),guardCollider=new Batch('Zhanqiao safety boundary collision',stone),lamps=new Batch('Zhanqiao lotus lamp posts',lampMat),globes=new Batch('Zhanqiao lotus lamp glass',globeMat);
  if(pier?.polygon){flat(bridgeDeck,pier.polygon,PIER+.16);walls(bridgeDeck,pier.polygon,PIER-.24,.4);}
  else if(axis)ribbon(bridgeDeck,axis,8,PIER+.16);
  if(axis){let cumulative=0;const total=axis.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-axis![i][0],p[1]-axis![i][1]),0);
    for(let i=0;i<axis.length-1;i++){const a=axis[i],b=axis[i+1],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<.1)continue;const angle=Math.atan2(dx,dz),nx=-dz/len,nz=dx/len;
      const solidLength=Math.max(0,Math.min(len,total*.58-cumulative));if(solidLength>0)masonry.box(new Vector3(a[0]+dx*solidLength/len/2,(PIER-3)/2,a[1]+dz*solidLength/len/2),7.8,PIER+3,solidLength,angle);
      for(let d=0;d<len;d+=3.8){const x=a[0]+dx*d/len,z=a[1]+dz*d/len;
        if(cumulative+d>total*.58&&Math.round(d/3.8)%3===0)for(const side of [-1,1])supports.cylinder(new Vector3(x+nx*2.65*side,(PIER-.24-3)/2,z+nz*2.65*side),.52,PIER-.24+3,8);
      }
      // The pier outline supplies the actual rail boundary, including the flared breakwater.
      for(let d=18;d<len-30;d+=28)for(const side of [-1,1]){const c=new Vector3(a[0]+dx*d/len+nx*3.6*side,PIER,a[1]+dz*d/len+nz*3.6*side);lamps.cylinder(c.add(new Vector3(0,.25,0)),.20,.5,10);lamps.cylinder(c.add(new Vector3(0,2.2,0)),.065,3.9,8);lamps.cylinder(c.add(new Vector3(0,4.14,0)),.25,.18,12);for(let p=0;p<8;p++){const t=p*Math.PI/4,q=t+Math.PI/4,point=(r:number,y:number,ang:number)=>c.add(new Vector3(Math.cos(ang)*r,y,Math.sin(ang)*r));globes.quad(point(.10,4.17,t),point(.35,4.43,t),point(.35,4.43,q),point(.10,4.17,q));globes.quad(point(.35,4.43,t),point(.12,4.72,t),point(.12,4.72,q),point(.35,4.43,q));}lamps.cylinder(c.add(new Vector3(0,4.78,0)),.045,.15,6);}
      cumulative+=len;
    }
  }
  if(pier?.polygon){const p=clean(pier.polygon);for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];if((a[1]+b[1])/2>142)continue;const len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<.4)continue;const angle=Math.atan2(b[0]-a[0],b[1]-a[1]);guardCollider.box(new Vector3((a[0]+b[0])/2,PIER+.8,(a[1]+b[1])/2),.12,1.3,len,angle);const count=Math.max(1,Math.ceil(len/2.5));for(let k=0;k<=count;k++){const x=a[0]+(b[0]-a[0])*k/count,z=a[1]+(b[1]-a[1])*k/count;rails.cylinder(new Vector3(x,PIER+.76,z),.065,1.18,8);rails.cylinder(new Vector3(x,PIER+1.39,z),.10,.08,8);}for(const y of [.37,1.3])rails.box(new Vector3((a[0]+b[0])/2,PIER+y,(a[1]+b[1])/2),.055,.065,len,angle);for(let k=.35;k<len;k+=.35)rails.box(new Vector3(a[0]+(b[0]-a[0])*k/len,PIER+.84,a[1]+(b[1]-a[1])*k/len),.026,.88,.026);}}
  bridgeDeck.uvs=bridgeDeck.uvs.map(v=>v*20/2.4);
  const deckMesh=bridgeDeck.finish({kind:'zhanqiao',name:'栈桥',source:'OSM pier plan geometry; deck altitude is approximate',osmId:pier?.id},true);if(deckMesh)collisionMeshes.push(deckMesh);
  masonry.finish({kind:'pier-structure',source:'Procedural interpretation of stone approach'},true);supports.finish({kind:'pier-supports',source:'Approximate structural placement'},true);const railMesh=rememberDetail(rails.finish({kind:'pier-railings',source:'Approximate balustrade spacing'},true),2300);const safety=guardCollider.finish({kind:'pier-collider'});if(safety){safety.isVisible=false;collisionMeshes.push(safety);}
  rememberDetail(lamps.finish({kind:'pier-lamps',name:'栈桥莲花路灯',source:'Photo-referenced lotus silhouette; spacing and pole heights estimated'},true),1600);rememberDetail(globes.finish({kind:'pier-lamp-glass'},false),1600);

  const pavilion=buildPavilion(scene,pavilionPosition,shadows);
  reflectionMeshes.push(...pavilion.meshes);collisionMeshes.push(...pavilion.collisionMeshes);
  // Freeze static transforms; all city geometry is grouped by shared material.
  for(const mesh of [...owned,...station.meshes,...pavilion.meshes])mesh.freezeWorldMatrix();
  const reflected=reflectionMeshes.filter(m=>m.isVisible&&(m.name.startsWith('Zhanqiao')||m.name.startsWith('Huilan')));
  return {reflectionMeshes:reflected,collisionMeshes,pierStart,pavilionPosition,stationPosition:station.position,stats:{buildings:buildingCount,roads:(data.roads||[]).length},setDetail(distance:number){for(const item of details)item.mesh.setEnabled(distance<item.maxDistance);},dispose(){station.dispose();pavilion.dispose();for(const m of owned)m.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();}};
}
