import { Color3, DynamicTexture, Mesh, Scene, StandardMaterial, Texture, Vector3, VertexData } from './babylon';

type Point = [number, number];
export interface BeachFeature {
  id: string; name?: string; polygon: Point[]; holes?: Point[][]; shorelines: Point[][];
  position: Point; area?: number; mesh: { spacing: number; vertices: Point[]; indices: number[] };
}
export interface BeachData { metadata?: Record<string, unknown>; beaches: BeachFeature[]; rocks?: {id:string;polygon:Point[];tags?:Record<string,string>}[] }
function inRing(x: number, z: number, ring: Point[]) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function segmentDistance(x:number,z:number,a:Point,b:Point) {
  const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
}
function inOrOnRing(x:number,z:number,ring:Point[]) {
  return inRing(x,z,ring)||ring.some((a,i)=>segmentDistance(x,z,a,ring[(i+1)%ring.length])<.006);
}
function beachRecords(data:BeachData) {
  return data.beaches.map(feature=>({feature,minX:Math.min(...feature.polygon.map(p=>p[0])),maxX:Math.max(...feature.polygon.map(p=>p[0])),minZ:Math.min(...feature.polygon.map(p=>p[1])),maxZ:Math.max(...feature.polygon.map(p=>p[1])),segments:feature.shorelines.flatMap(line=>line.slice(1).map((b,i)=>[line[i],b]as[Point,Point]))}));
}
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

/** Pure surface profile for terrain/collision integration, before GPU assets exist.
 * The OSM coastline controls the wet edge. The small foreshore slope is a visual
 * interpolation, not bathymetry or a tidal survey. rawSampler must sample the
 * ORIGINAL source DEM, not terrain.sample after this profile has been applied.
 */
export function createBeachSurface(data:BeachData,rawSampler:(x:number,z:number)=>number=()=>2.4) {
  const records=beachRecords(data);
  function find(x:number,z:number) {
    return records.find(r=>x>=r.minX-.006&&x<=r.maxX+.006&&z>=r.minZ-.006&&z<=r.maxZ+.006&&inOrOnRing(x,z,r.feature.polygon)&&!(r.feature.holes??[]).some(h=>inRing(x,z,h)));
  }
  return { contains(x:number,z:number){return !!find(x,z);},sampleSurface(x:number,z:number):number|null {
    const r=find(x,z);if(!r)return null;
    const dryHeight=Math.max(2.4,rawSampler(x,z));
    if(!r.segments.length)return dryHeight;
    const d=Math.min(...r.segments.map(([a,b])=>segmentDistance(x,z,a,b)));
    // 0.12m at the mean coastline, smoothly merging with original ground inland.
    // No ocean-facing rectangle or invented extension beyond the beach polygon.
    return .12+(dryHeight-.12)*smooth(0,24,d);
  } };
}

/** Warm dry sand + dark damp shoreline, entirely source-bounded metre geometry.
 * StandardMaterial receives the existing scene lights; no emissive shader or
 * frozen noon illumination. Mipmapped procedural textures prevent distant
 * grain shimmer, while world metre UVs avoid stretching across large beaches.
 */
export function buildBeaches(scene:Scene,data:BeachData,sampleHeight:(x:number,z:number)=>number) {
  const meshes:Mesh[]=[],textures:DynamicTexture[]=[],rockMeshes:Mesh[]=[];
  const sand=new StandardMaterial('Qingdao real mapped beaches sand',scene);
  sand.diffuseColor=Color3.White();sand.specularColor=new Color3(.025,.025,.022);sand.specularPower=64;
  sand.emissiveColor=Color3.Black();sand.useLogarithmicDepth=true;
  const texture=(name:string,draw:(c:CanvasRenderingContext2D)=>void)=>{
    const t=new DynamicTexture(name,{width:1024,height:1024},scene,true,Texture.TRILINEAR_SAMPLINGMODE);
    draw(t.getContext()as CanvasRenderingContext2D);t.update(false);t.wrapU=t.wrapV=Texture.WRAP_ADDRESSMODE;t.anisotropicFilteringLevel=8;textures.push(t);return t;
  };
  let seed=91023;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  sand.diffuseTexture=texture('Original Qingdao fine quartz sand albedo',c=>{
    c.fillStyle='#d8c8a8';c.fillRect(0,0,1024,1024);
    // Subtle physically small grains; colour contrast stays low enough to mip cleanly.
    for(let i=0;i<62000;i++) {
      const x=random()*1024,y=random()*1024,r=.25+random()*.85,shade=170+Math.floor(random()*56);
      c.fillStyle=`rgba(${shade+25},${shade+14},${shade-13},${.17+random()*.27})`;c.fillRect(x,y,r,r);
    }
    c.lineWidth=1.2;
    for(let y=0;y<1024;y+=47) {
      c.strokeStyle='rgba(160,137,104,.035)';c.beginPath();
      for(let x=0;x<=1024;x+=8){const yy=y+Math.sin(x*Math.PI*2/1024)*7+Math.sin(x*Math.PI*4/1024+y*.02)*3;if(x)c.lineTo(x,yy);else c.moveTo(x,yy);}c.stroke();
    }
  });
  sand.bumpTexture=texture('Original sand grain and shallow ripple microrelief',c=>{
    c.fillStyle='#808080';c.fillRect(0,0,1024,1024);
    for(let y=0;y<1024;y+=39) {
      c.lineWidth=2;c.strokeStyle='rgba(184,184,184,.18)';c.beginPath();
      for(let x=0;x<=1024;x+=8){const yy=y+Math.sin(x*Math.PI*2/1024)*8;if(x)c.lineTo(x,yy);else c.moveTo(x,yy);}c.stroke();
    }
    for(let i=0;i<30000;i++){const x=random()*1024,y=random()*1024;c.fillStyle=random()>.5?'rgba(170,170,170,.18)':'rgba(90,90,90,.18)';c.fillRect(x,y,.6,.6);}
  });
  sand.bumpTexture.level=.11;
  const records=beachRecords(data),excludedAreaIds=new Set<string>();
  let triangles=0;
  for(const r of records) {
    const f=r.feature,p:number[]=[],uv:number[]=[],colors:number[]=[],indices=f.mesh.indices.slice();
    excludedAreaIds.add(f.id);
    for(const [x,z]of f.mesh.vertices) {
      const h=sampleHeight(x,z)+.035;
      p.push(x,h,z);uv.push(x/7.5,z/7.5);
      const d=r.segments.length?Math.min(...r.segments.map(([a,b])=>segmentDistance(x,z,a,b))):100;
      const dry=smooth(1.5,21,d),variation=Math.sin(x*.021+z*.037)*.012+Math.sin(x*.063-z*.016)*.008;
      // Damp sand is deeper and less saturated. No independent coloured strips.
      colors.push(.69+dry*.31+variation,.66+dry*.34+variation,.59+dry*.41+variation,1);
    }
    // Enforce upward normals regardless of Shapely's ring direction.
    for(let i=0;i<indices.length;i+=3) {
      const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
      const conventionalY=(p[b+2]-p[a+2])*(p[c]-p[a])-(p[b]-p[a])*(p[c+2]-p[a+2]);
      // Babylon LH ComputeNormals is the negative conventional cross product.
      if(conventionalY>0)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
    }
    const mesh=new Mesh('Mapped sandy beach '+(f.name||f.id),scene),v=new VertexData(),normals:number[]=[];
    v.positions=p;v.indices=indices;v.uvs=uv;v.colors=colors;VertexData.ComputeNormals(p,indices,normals);v.normals=normals;v.applyToMesh(mesh);
    mesh.material=sand;mesh.receiveShadows=true;mesh.isPickable=false;mesh.freezeWorldMatrix();
    mesh.metadata={kind:'geographic-beach',name:f.name||'OSM沙滩',sourceId:f.id,source:'OSM natural=beach; 5m conforming clipped mesh; original sand textures',estimatedDetail:'Visual foreshore grading and wet-sand width, not measured tide/bathymetry'};
    meshes.push(mesh);triangles+=indices.length/3;
  }
  // Small partly exposed forms only inside OSM-mapped reef/bare-rock regions.
  // Reef outlines are data; individual boulder positions, sizes and exposure are estimates.
  const rock=new StandardMaterial('Qingdao mapped shoreline granite outcrops',scene);
  rock.diffuseColor=Color3.FromHexString('#a18b70');rock.specularColor=new Color3(.035,.035,.03);rock.useLogarithmicDepth=true;
  const rp:number[]=[],ri:number[]=[],ruv:number[]=[],rc:number[]=[];let rockCount=0;
  const triangle=(a:number[],b:number[],c:number[],shade:number)=>{const n=rp.length/3;rp.push(...a,...b,...c);ri.push(n,n+2,n+1);ruv.push(0,0,0,1,1,1);for(let i=0;i<3;i++)rc.push(shade,shade*.98,shade*.94,1);};
  for(const feature of data.rocks??[]) {
    const x=feature.polygon.map(p=>p[0]),z=feature.polygon.map(p=>p[1]);
    for(let xx=Math.min(...x)+2;xx<Math.max(...x)&&rockCount<42;xx+=9)for(let zz=Math.min(...z)+2;zz<Math.max(...z)&&rockCount<42;zz+=9) {
      if(!inRing(xx,zz,feature.polygon))continue;
      const shift=random(),radius=.6+shift*1.1,height=.25+shift*.4,cy=Math.min(sampleHeight(xx,zz),.22)-.12;
      const rings=[[.62,-.2],[1,0],[.72,height*.66],[.16,height]];
      const v=(j:number,k:number)=>{const a=j*Math.PI/4;return[xx+Math.cos(a)*radius*rings[k][0],cy+rings[k][1],zz+Math.sin(a)*radius*.72*rings[k][0]];};
      for(let k=0;k<3;k++)for(let j=0;j<8;j++){const a=v(j,k),b=v(j,k+1),c=v(j+1,k+1),d=v(j+1,k),shade=.8+random()*.24;triangle(a,b,c,shade);triangle(a,c,d,shade);}
      rockCount++;
    }
  }
  if(rp.length) {
    const mesh=new Mesh('Source-bounded Qingdao shoreline rock groups',scene),v=new VertexData(),normals:number[]=[];
    v.positions=rp;v.indices=ri;v.uvs=ruv;v.colors=rc;VertexData.ComputeNormals(rp,ri,normals);v.normals=normals;v.applyToMesh(mesh);mesh.material=rock;mesh.receiveShadows=true;mesh.isPickable=false;mesh.freezeWorldMatrix();
    mesh.metadata={kind:'shoreline-rocks',sourceIds:(data.rocks??[]).map(f=>f.id),estimatedDetail:'Individual boulder forms and exposure estimated inside mapped reef / bare-rock extents'};meshes.push(mesh);rockMeshes.push(mesh);
  }
  const views=data.beaches.filter(f=>f.name?.includes('第六')||f.name?.includes('第一')).map(f=>({id:'beach-'+f.id.split('/')[1],name:f.name!,position:new Vector3(f.position[0],sampleHeight(...f.position)+1,f.position[1]),radius:f.name?.includes('第六')?200:450,alpha:-2.1,beta:1.05}));
  return {meshes,excludedAreaIds,views,stats:{beaches:records.length,triangles,rocks:rockCount},setDetail(distance:number){sand.bumpTexture!.level=distance>2200?0:distance>600?.04:.11;for(const m of rockMeshes)m.setEnabled(distance<1800);},dispose(){for(const m of meshes)m.dispose();sand.dispose();rock.dispose();for(const t of textures)t.dispose();}};
}
