import { Color3, DynamicTexture, Mesh, Scene, ShadowGenerator, StandardMaterial, Texture, Vector3, VertexData } from './babylon';

type Point = [number, number];
type Feature = { id: string; name?: string; polygon: Point[]; groups?: string[]; tags?: Record<string, string> };
type ParkData = {
  buildings: Feature[]; parks: Feature[];
  paths?: { id: string; points: Point[]; groups?: string[]; tags?: Record<string, string> }[];
  nodes?: { name?: string; position: Point; tags?: Record<string, string> }[];
};

/** Survey-controlled locations + photo-informed architectural details.
 * No hill geometry is fabricated here: every base and path samples the DEM.
 * Documented Lanchao Pavilion height = 18m. Other vertical details are estimates.
 * See docs/hill-park-references.md for the published facts and uncertainty.
 */
export function buildHillParks(scene: Scene, data: ParkData, shadows: ShadowGenerator, sampleHeight: (x: number, z: number) => number) {
  const meshes: Mesh[] = [], collisionMeshes: Mesh[] = [], materials: StandardMaterial[] = [], textures: DynamicTexture[] = [];
  const nearMeshes: Mesh[] = [];
  const excludedBuildingIds = new Set<string>();
  const views: { id: string; name: string; position: Vector3; radius: number; alpha?: number; beta?: number }[] = [];
  const material = (name: string, color: string, shine = .03) => {
    const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(color);
    m.specularColor.set(shine, shine, shine); m.useLogarithmicDepth = true;
    materials.push(m); return m;
  };
  const stone = material('Hill parks warm granite ashlar', '#ffffff');
  const cream = material('Hill parks carved pale railings and rafters', '#e6dfce');
  const red = material('Signal Hill red spherical observation rooms', '#be4333', .075);
  const lacquer = material('Xiaoyushan pink red lacquer posts', '#a55046');
  const roof = material('Xiaoyushan GREEN glazed tile roofs', '#ffffff', .16);
  const glass = material('Signal Hill panoramic window glazing', '#6c9598', .16);
  const pavilionGlass = material('Xiaoyushan restrained interior window glazing', '#445953', .08);
  const dark = material('Hill parks dark window framing', '#34332e');
  const paint = material('Xiaoyushan marine ceramic beam patterns', '#ffffff');
  const leaf = material('Hill parks pine and broadleaf canopy', '#ffffff');
  const pathMat = material('Hill parks granite stair paths', '#b7b2a4');
  const label = material('Lanchao Pavilion original typeset plaque', '#ffffff');
  function texture(name: string, width: number, height: number, draw: (c: CanvasRenderingContext2D) => void) {
    const t = new DynamicTexture(name, { width, height }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
    draw(t.getContext() as CanvasRenderingContext2D); t.update(false); t.anisotropicFilteringLevel = 8;
    t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE; textures.push(t); return t;
  }
  stone.diffuseTexture = texture('Original Signal Hill stonework texture', 512, 256, c => {
    c.fillStyle = '#bca57e'; c.fillRect(0, 0, 512, 256);
    for (let y = 0; y < 256; y += 32) for (let x = -64; x < 512; x += 64) {
      const shade = (Math.sin(x * 13.7 + y * 41.1) + 1) * 14;
      c.fillStyle = `rgb(${175 + shade},${153 + shade},${118 + shade})`;
      c.fillRect(x + (y % 64 ? 32 : 0) + 1.5, y + 1.5, 61, 29);
      c.strokeStyle = '#c4b499'; c.lineWidth = 1; c.strokeRect(x + (y % 64 ? 32 : 0) + 2, y + 2, 60, 28);
    }
  });
  stone.bumpTexture=texture('Original Signal Hill shallow stone-joint normal',256,256,c=>{c.fillStyle='#8080ff';c.fillRect(0,0,256,256);for(let y=0;y<256;y+=32)for(let x=-64;x<256;x+=64){const xx=x+(y%64?32:0);c.fillStyle='#9980fc';c.fillRect(xx+1,y+2,2,28);c.fillStyle='#6780fc';c.fillRect(xx+61,y+2,2,28);c.fillStyle='#8099fc';c.fillRect(xx+2,y+1,60,2);c.fillStyle='#8067fc';c.fillRect(xx+2,y+29,60,2);}});stone.bumpTexture.level=.23;
  red.diffuseTexture=texture('Original low contrast weathered red cabin paint',256,256,c=>{c.fillStyle='#ebaa96';c.fillRect(0,0,256,256);for(let i=0;i<180;i++){c.fillStyle=i%2?'rgba(146,72,57,.035)':'rgba(255,224,194,.08)';c.fillRect((i*31)%256,(i*71)%256,6,4);}});
  glass.diffuseColor=Color3.FromHexString('#c1cbc3');glass.specularColor.set(.28,.32,.30);glass.specularPower=90;
  glass.diffuseTexture=texture('Original cabin glazing sky and warm interior reflection',128,256,c=>{const g=c.createLinearGradient(0,0,0,256);g.addColorStop(0,'#718c95');g.addColorStop(.24,'#a6bac0');g.addColorStop(.27,'#d4d8c8');g.addColorStop(1,'#bebfab');c.fillStyle=g;c.fillRect(0,0,128,256);c.fillStyle='rgba(250,247,222,.13)';c.fillRect(17,0,7,256);});
  roof.diffuseTexture = texture('Original green fish-theme glazed tiles', 256, 256, c => {
    c.fillStyle = '#276653'; c.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 24) {
      const g = c.createLinearGradient(x, 0, x + 24, 0);
      g.addColorStop(0, '#214b3e'); g.addColorStop(.45, '#659784'); g.addColorStop(1, '#285c4a');
      c.fillStyle = g; c.fillRect(x, 0, 24, 256);
      for (let y = 0; y < 256; y += 35) { c.strokeStyle = '#163f31'; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 12, y + 6, x + 24, y); c.stroke(); }
    }
  });
  paint.diffuseTexture = texture('Original marine ceramic beam motifs', 512, 128, c => {
    c.fillStyle = '#327077'; c.fillRect(0, 0, 512, 128);
    c.strokeStyle = '#d5bc66'; c.lineWidth = 4; c.strokeRect(2, 4, 508, 120);
    for (let x = 0; x < 512; x += 64) {
      c.fillStyle = x % 128 ? '#347e91' : '#ba5b47'; c.fillRect(x + 9, 20, 45, 88);
      c.strokeStyle = '#ddcea0'; c.beginPath(); c.ellipse(x + 31, 64, 21, 12, 0, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(x + 52, 64); c.lineTo(x + 63, 50); c.lineTo(x + 63, 78); c.closePath(); c.stroke();
    }
  });
  label.diffuseTexture = texture('Original 览潮阁 lettering', 768, 256, c => {
    c.fillStyle = '#243f35'; c.fillRect(0, 0, 768, 256); c.strokeStyle = '#d4bb70'; c.lineWidth = 10; c.strokeRect(12, 12, 744, 232);
    c.font = 'bold 166px "KaiTi","STKaiti",serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#e7d7a1'; c.fillText('閣 潮 覽', 384, 136);
  });

  class Batch {
    p: number[] = []; ix: number[] = []; uv: number[] = []; color: number[] = []; smoothNormals:number[]=[]; tint = Color3.White();
    constructor(public name: string, public mat: StandardMaterial, public park: string, public detail = false) {}
    tri(a: Vector3, b: Vector3, c: Vector3, uv = [[0, 0], [1, 0], [0, 1]]) {
      const n = this.p.length / 3;
      for (const v of [a, b, c]) { this.p.push(v.x, v.y, v.z); this.color.push(this.tint.r, this.tint.g, this.tint.b, 1); }
      // Vertices below are explicitly ordered with outward/upward normals.
      this.ix.push(n, n + 2, n + 1); this.uv.push(...uv.flat());
    }
    quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      this.tri(a, b, c, [uv[0], uv[1], uv[2]]); this.tri(a, c, d, [uv[0], uv[2], uv[3]]);
    }
    box(c: Vector3, w: number, h: number, d: number, angle = 0) {
      const v = (x: number, y: number, z: number) => new Vector3(c.x + x * Math.cos(angle) + z * Math.sin(angle), c.y + y, c.z - x * Math.sin(angle) + z * Math.cos(angle));
      const x = w / 2, y = h / 2, z = d / 2;
      this.quad(v(-x,y,-z),v(-x,y,z),v(x,y,z),v(x,y,-z)); this.quad(v(-x,-y,z),v(-x,-y,-z),v(x,-y,-z),v(x,-y,z));
      this.quad(v(-x,-y,-z),v(-x,y,-z),v(x,y,-z),v(x,-y,-z)); this.quad(v(x,-y,z),v(x,y,z),v(-x,y,z),v(-x,-y,z));
      this.quad(v(-x,-y,z),v(-x,y,z),v(-x,y,-z),v(-x,-y,-z)); this.quad(v(x,-y,-z),v(x,y,-z),v(x,y,z),v(x,-y,z));
    }
    beam(a: Vector3, b: Vector3, width: number, height: number) { this.box(a.add(b).scale(.5), width, height, Vector3.Distance(a, b), Math.atan2(b.x-a.x, b.z-a.z)); }
    cylinder(c: Vector3, r: number, h: number, n = 24) {
      for (let i = 0; i < n; i++) {
        const a = i * Math.PI * 2 / n, b = (i + 1) * Math.PI * 2 / n;
        const p = (angle: number, y: number) => new Vector3(c.x + r * Math.cos(angle), c.y + y, c.z + r * Math.sin(angle));
        this.quad(p(a,-h/2),p(a,h/2),p(b,h/2),p(b,-h/2),[[i/n*6,0],[i/n*6,h/3],[(i+1)/n*6,h/3],[(i+1)/n*6,0]]);
        this.tri(new Vector3(c.x,c.y+h/2,c.z),p(b,h/2),p(a,h/2));
      }
    }
    lathe(c: Vector3, rings: [number, number][], n = 40, smooth=false) {
      for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < n; i++) {
        const p = (j: number, ring: number) => new Vector3(c.x + rings[ring][0] * Math.cos(j * Math.PI * 2/n), c.y + rings[ring][1], c.z + rings[ring][0] * Math.sin(j * Math.PI * 2/n));
        const first=this.p.length;
        this.quad(p(i,k),p(i,k+1),p(i+1,k+1),p(i+1,k),[[i/n,k/(rings.length-1)],[i/n,(k+1)/(rings.length-1)],[(i+1)/n,(k+1)/(rings.length-1)],[(i+1)/n,k/(rings.length-1)]]);
        if(smooth)for(let v=first;v<this.p.length;v+=3){const yy=this.p[v+1]-c.y,index=Math.abs(yy-rings[k][1])<.001?k:k+1,lo=Math.max(0,index-1),hi=Math.min(rings.length-1,index+1),dy=rings[hi][1]-rings[lo][1],dr=rings[hi][0]-rings[lo][0],angle=Math.atan2(this.p[v+2]-c.z,this.p[v]-c.x),normal=new Vector3(dy*Math.cos(angle),-dr,dy*Math.sin(angle)).normalize();this.smoothNormals[v]=normal.x;this.smoothNormals[v+1]=normal.y;this.smoothNormals[v+2]=normal.z;}
      }
    }
    finish(collision = false) {
      if (!this.p.length) return;
      const mesh = new Mesh(this.name, scene), vd = new VertexData(), normals: number[] = [];
      vd.positions = this.p; vd.indices = this.ix; vd.uvs = this.uv; vd.colors = this.color;
      VertexData.ComputeNormals(this.p, this.ix, normals);for(let i=0;i<this.smoothNormals.length;i++)if(Number.isFinite(this.smoothNormals[i]))normals[i]=this.smoothNormals[i];vd.normals = normals; vd.applyToMesh(mesh);
      mesh.material = this.mat; mesh.receiveShadows = true;
      mesh.metadata = { kind: 'hill-park-landmark', name: this.park, source: 'OSM footprint, Qingdao government, Qingdao Daily photographs; architectural detail estimates',nightRole:this.mat===glass||this.mat===pavilionGlass?'warm window glazing':this.mat===label?'lettering':'unlit architecture' };
      shadows.addShadowCaster(mesh); meshes.push(mesh); if (this.detail) nearMeshes.push(mesh); if (collision) collisionMeshes.push(mesh);
    }
  }
  const centroid = (f: Feature): Point => [f.polygon.reduce((s,p)=>s+p[0],0)/f.polygon.length, f.polygon.reduce((s,p)=>s+p[1],0)/f.polygon.length];
  const position = (id: string, fallback: Point) => {
    const f = data.buildings.find(f=>String(f.id)===id); if (f) { excludedBuildingIds.add(id); return centroid(f); } return fallback;
  };
  const point = (c: Vector3, r: number, a: number, y: number) => new Vector3(c.x+r*Math.cos(a),c.y+y,c.z+r*Math.sin(a));
  const inside = (p: Point, polygon: Point[]) => {
    let yes=false; for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) if((polygon[i][1]>p[1])!==(polygon[j][1]>p[1])&&p[0]<(polygon[j][0]-polygon[i][0])*(p[1]-polygon[i][1])/(polygon[j][1]-polygon[i][1])+polygon[i][0])yes=!yes;
    return yes;
  };
  function parkLandscape(group: string, name: string, anchors: Point[]) {
    const park = data.parks.find(p=>p.groups?.includes(group)); if(!park)return;
    const paths = new Batch(name+' DEM-following OSM stair paths',pathMat,name,true), trees=new Batch(name+' pine and broadleaf tree groups',leaf,name,true), trunks=new Batch(name+' tree trunks',stone,name,true);
    for(const path of data.paths??[]) {
      if(!path.groups?.includes(group)||path.tags?.tunnel==='yes'||path.tags?.barrier||!path.tags?.highway)continue;
      for(let i=1;i<path.points.length;i++) {
        const a=path.points[i-1],b=path.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),count=Math.max(1,Math.ceil(len/2));
        for(let j=0;j<count;j++) {
          const p:Point=[a[0]+dx*j/count,a[1]+dz*j/count],q:Point=[a[0]+dx*(j+1)/count,a[1]+dz*(j+1)/count];
          if(!inside([(p[0]+q[0])/2,(p[1]+q[1])/2],park.polygon))continue;
          const y1=sampleHeight(...p)+.28,y2=sampleHeight(...q)+.28,nx=-dz/Math.max(.01,len)*.65,nz=dx/Math.max(.01,len)*.65;
          paths.quad(new Vector3(p[0]-nx,y1,p[1]-nz),new Vector3(p[0]+nx,y1,p[1]+nz),new Vector3(q[0]+nx,y2,q[1]+nz),new Vector3(q[0]-nx,y2,q[1]-nz));
          if(path.tags?.highway==='steps')paths.beam(new Vector3(q[0]-nx,y2+.02,q[1]-nz),new Vector3(q[0]+nx,y2+.02,q[1]+nz),.09,.09);
        }
      }
    }
    const px=park.polygon.map(p=>p[0]),pz=park.polygon.map(p=>p[1]);let n=0;
    for(let x=Math.min(...px)+4;x<Math.max(...px);x+=13)for(let z=Math.min(...pz)+4;z<Math.max(...pz);z+=13) {
      const seed=Math.sin(x*12.98+z*78.23)*43758.54,jitter=seed-Math.floor(seed);
      const p:Point=[x+(jitter-.5)*7,z+(Math.sin(seed)*.5)*7];if(!inside(p,park.polygon)||anchors.some(a=>Math.hypot(a[0]-p[0],a[1]-p[1])<19))continue;
      if(data.buildings.some(b=>Math.hypot(centroid(b)[0]-p[0],centroid(b)[1]-p[1])<10))continue;
      const h=sampleHeight(...p),height=4.5+jitter*4;
      trunks.cylinder(new Vector3(p[0],h+height*.36,p[1]),.15,height*.72,6);
      trees.tint=Color3.FromHexString(n++%3===0?'#3e6842':n%3===1?'#426c35':'#668447');
      if(n%2===0) for(let k=0;k<3;k++)trees.lathe(new Vector3(p[0],h+height*.2+k*height*.22,p[1]),[[2.5-k*.5,0],[0,height*.5]],9);
      else trees.lathe(new Vector3(p[0],h+height*.62,p[1]),[[0,-height*.28],[2.5,-height*.13],[3,0],[2.3,height*.24],[0,height*.4]],10);
    }
    paths.finish();trunks.finish();trees.finish();
  }

  const signalAnchors = [position('way/546085661',[894.76,710.46]),position('way/546085662',[908.13,723.67]),position('way/546085660',[916.25,712.29])];
  const sBase=new Batch('Signal Hill three cylindrical granite tower bases',stone,'信号山'),sPod=new Batch('Signal Hill three spherical red mushroom cabins',red,'信号山'),sGlass=new Batch('Signal Hill panoramic ring windows',glass,'信号山'),sFrames=new Batch('Signal Hill window mullions and arch openings',dark,'信号山',true),sSupport=new Batch('Signal Hill WHITE radial cabin supports',cream,'信号山',true),sDeck=new Batch('Signal Hill viewing terrace and tower stairs',pathMat,'信号山'),sRail=new Batch('Signal Hill summit protective railings',cream,'信号山',true);
  for(let k=0;k<signalAnchors.length;k++) {
    const [x,z]=signalAnchors[k],ground=sampleHeight(x,z),c=new Vector3(x,ground,z),radius=[5.08,5.6,3.58][k],stem=[5.8,7.5,4.5][k],r=radius*.60;
    sBase.cylinder(point(c,0,0,stem/2),r,stem,40);
    sBase.cylinder(point(c,0,0,.25),r+.4,.5,40);
    const bottom=stem+.78,glassBottom=bottom+radius*.45,glassHeight=radius*.36,glassTop=glassBottom+glassHeight;
    // 2022 original photo: a rounded lower bowl, broad two-part glazing belt, shallow upper dome.
    const low:[number,number][]=[[radius*.58,bottom],[radius*.73,bottom+radius*.12],[radius*.89,bottom+radius*.28],[radius*.98,glassBottom-.25],[radius,glassBottom]];
    const upper:[number,number][]=[];for(let j=0;j<=24;j++){const angle=j*Math.PI/48;upper.push([Math.max(.025,Math.cos(angle)*radius*.985),glassTop+Math.sin(angle)*radius*.54]);}
    sPod.lathe(c,low,64,true);sPod.lathe(c,upper,64,true);
    sGlass.lathe(c,[[radius,glassBottom],[radius*.985,glassTop]],64,true);
    for(const yy of [glassBottom,glassBottom+glassHeight*.73,glassTop])sFrames.lathe(c,[[radius*1.008,yy-.055],[radius*1.008,yy+.055]],64,true);
    for(let i=0;i<40;i++) {
      const a=i*Math.PI/20;sFrames.beam(point(c,radius*1.008,a,glassBottom-.05),point(c,radius*.993,a,glassTop+.04),.09,.09);
      // Dense vertical radial plates stay outside the bowl, rather than diagonal bars hidden inside it.
      sSupport.box(point(c,r+.31,a,stem+.40),.11,1.10,.91,Math.PI/2-a);
    }
    for(let level=0;level<2;level++)for(let i=0;i<6;i++) {
      const a=i*Math.PI/3,yy=level*2.6+.6,half=.57;
      const winPoint=(t:number,y:number)=>point(c,r+.012,a+t,yy+y);
      sGlass.quad(winPoint(-half/r,0),winPoint(-half/r,1.35),winPoint(half/r,1.35),winPoint(half/r,0));
      for(let j=0;j<16;j++){const aa=j*Math.PI/16,bb=(j+1)*Math.PI/16;sGlass.tri(winPoint(0,1.35),winPoint(Math.cos(bb)*half/r,1.35+Math.sin(bb)*.50),winPoint(Math.cos(aa)*half/r,1.35+Math.sin(aa)*.50));}
      for(const t of [-.4,0,.4])sFrames.beam(winPoint(t/r,.1),winPoint(t/r,1.36),.045,.045);
      for(const yy of [.48,1.14])sFrames.beam(winPoint(-half/r,yy),winPoint(half/r,yy),.045,.045);
      // Segmental stone arch surround, following the masonry in the reference photo.
      for(let j=0;j<10;j++) {
        const t=j*Math.PI/10,t2=(j+1)*Math.PI/10;
        const p=winPoint(Math.cos(t)*half/r,1.35+Math.sin(t)*.5),q=winPoint(Math.cos(t2)*half/r,1.35+Math.sin(t2)*.5);sSupport.beam(p,q,.14,.16);
      }
    }
    sDeck.cylinder(point(c,0,0,.08),r+1.8,.16,32);
  }
  // Railings around the open summit terrace, without a fake mountain or broad slab.
  for(let i=0;i<30;i++) {
    const a=i*Math.PI/15,x=906+25*Math.cos(a),z=716+23*Math.sin(a),y=sampleHeight(x,z)+.3;
    sRail.cylinder(new Vector3(x,y+.6,z),.085,1.2,8);
    const b=(i+1)*Math.PI/15,xx=906+25*Math.cos(b),zz=716+23*Math.sin(b);sRail.beam(new Vector3(x,y+1.18,z),new Vector3(xx,sampleHeight(xx,zz)+1.48,zz),.08,.08);
  }
  [sBase,sPod,sGlass,sFrames,sSupport,sDeck,sRail].forEach(b=>b.finish(b===sBase||b===sDeck));
  views.push({id:'signal-hill',name:'信号山',position:new Vector3(906,sampleHeight(906,716)+8,716),radius:145,alpha:-2.35,beta:1.0});
  parkLandscape('signal','信号山',signalAnchors);

  const lanchao=position('way/150956910',[1334.56,-154.89]);
  // The neighbouring OSM footprint is the connected pavilion/corridor complex.
  const annex=data.buildings.find(b=>String(b.id)==='way/556464067');if(annex)excludedBuildingIds.add(annex.id);
  const c=new Vector3(lanchao[0],sampleHeight(...lanchao),lanchao[1]);
  const xBase=new Batch('Xiaoyushan Lanchao octagonal platform and white balustrades',cream,'小鱼山'),xWood=new Batch('Xiaoyushan Lanchao red columns and carved lattice',lacquer,'小鱼山'),xRoofs=new Batch('Xiaoyushan Lanchao THREE GREEN octagonal roofs',roof,'小鱼山'),xPaint=new Batch('Xiaoyushan marine ceramic painted beam bands',paint,'小鱼山'),xGlass=new Batch('Xiaoyushan Lanchao hall dark window panels',pavilionGlass,'小鱼山'),xSign=new Batch('Xiaoyushan 览潮阁 traditional plaque',label,'小鱼山'),xDetail=new Batch('Xiaoyushan fish-head eaves and ivory rafters',cream,'小鱼山',true);
  function curvedRoof(center:Vector3,sides:number,radius:number,eave:number,rise:number) {
    const rings:[[number,number],[number,number],[number,number],[number,number],[number,number]]=[[1,0],[.83,-.18],[.60,.17],[.29,rise*.55],[.025,rise]];
    const start=Math.PI/8;
    for(let i=0;i<sides;i++)for(let j=0;j<rings.length-1;j++) {
      const a=start+i*Math.PI*2/sides,b=start+(i+1)*Math.PI*2/sides;
      const p=(ang:number,ring:number)=>point(center,radius*rings[ring][0],ang,eave+rings[ring][1]);
      xRoofs.quad(p(a,j),p(a,j+1),p(b,j+1),p(b,j),[[0,j*.5],[0,(j+1)*.5],[3,(j+1)*.5],[3,j*.5]]);
    }
    for(let i=0;i<sides;i++) {
      const a=start+i*Math.PI*2/sides,b=start+(i+1)*Math.PI*2/sides;
      xDetail.beam(point(center,radius*.29,a,eave+rise*.55),point(center,radius,a,eave),.20,.15);
      // Stylized fish-head corner ornaments: recognizable marine silhouette; estimated fine shape.
      const head=point(center,radius,a,eave+.15);xRoofs.box(head,.34,.42,.7,-a);xRoofs.cylinder(head.add(new Vector3(0,.24,0)),.18,.25,8);
      for(let j=1;j<12;j++) {
        const t=j/12,p=point(center,radius,a,eave).scale(1-t).add(point(center,radius,b,eave).scale(t));
        const inner=point(center,radius*.78,a,eave-.28).scale(1-t).add(point(center,radius*.78,b,eave-.28).scale(t));xDetail.beam(inner,p,.11,.12);
      }
    }
  }
  xBase.cylinder(c.add(new Vector3(0,.25,0)),7.3,.5,8);
  const levels=[{y:.5,r:6.0,eave:5.25,roof:8.8,rise:1.9},{y:6.0,r:4.9,eave:10.3,roof:7.1,rise:1.7},{y:11.05,r:3.6,eave:15.5,roof:5.8,rise:2.1}];
  for(const level of levels) {
    xBase.cylinder(c.add(new Vector3(0,level.y,0)),level.r+.8,.18,8);
    const h=level.eave-level.y-.45;
    for(let i=0;i<8;i++) {
      const a=Math.PI/8+i*Math.PI/4,b=a+Math.PI/4,p=point(c,level.r,a,level.y),q=point(c,level.r,b,level.y);
      xWood.cylinder(point(c,level.r,a,level.y+h/2),.22,h,12);
      xPaint.beam(point(c,level.r,a,level.eave-.42),point(c,level.r,b,level.eave-.42),.28,.55);
      const inner=level.r*.65,ip=point(c,inner,a,level.y),iq=point(c,inner,b,level.y);
      xGlass.quad(ip,ip.add(new Vector3(0,h-.7,0)),iq.add(new Vector3(0,h-.7,0)),iq);
      for(let j=0;j<=5;j++) {
        const t=j/5,post=p.scale(1-t).add(q.scale(t));post.y=level.y+.55;xBase.box(post,.15,1.0,.15);
      }
      xBase.beam(p.add(new Vector3(0,1.08,0)),q.add(new Vector3(0,1.08,0)),.18,.14);
      for(let j=0;j<4;j++) {
        const t=(j+.5)/4,post=ip.scale(1-t).add(iq.scale(t));xWood.box(post.add(new Vector3(0,h*.53,0)),.06,h-.6,.07);
      }
    }
    curvedRoof(c,8,level.roof,level.eave,level.rise);
  }
  // Finial sets the documented total height to exactly 18m above the DEM base.
  xRoofs.cylinder(c.add(new Vector3(0,17.8,0)),.20,.4,12);
  xSign.box(c.add(new Vector3(0,9.6,-4.65)),3.1,.9,.12);
  const west=new Vector3(c.x-21,sampleHeight(c.x-21,c.z-4),c.z-4),east=new Vector3(c.x+26,sampleHeight(c.x+26,c.z+1),c.z+1);
  // Adjacent pavilions: photo/source-informed layout, OSM does not provide separate footprints.
  xBase.cylinder(west.add(new Vector3(0,.2,0)),4.5,.4,6);
  for(let i=0;i<6;i++) {const a=Math.PI/6+i*Math.PI/3;xWood.cylinder(point(west,3.1,a,1.85),.19,3.3,12);}
  curvedRoof(west,6,5,3.7,1.65);
  xBase.box(east.add(new Vector3(0,2.8,0)),10,5.6,8);
  for(const y of [2.3,5.4]) {
    xBase.box(east.add(new Vector3(0,y,0)),12,.2,9.5);
    for(let i=0;i<7;i++)xBase.box(east.add(new Vector3(-5.5+i*11/6,y+.5,-4.5)),.13,1,.13);
    xBase.beam(east.add(new Vector3(-5.5,y+1,-4.5)),east.add(new Vector3(5.5,y+1,-4.5)),.12,.12);
  }
  curvedRoof(east,4,8.0,6.0,2.1);
  // Connected narrow covered corridor on the east; floor follows the slope.
  for(let i=0;i<6;i++) {
    const x=c.x+8+i*3,z=c.z+5,y=sampleHeight(x,z)+.3;
    xWood.cylinder(new Vector3(x,y+1.35,z-1.4),.12,2.7,8);xWood.cylinder(new Vector3(x,y+1.35,z+1.4),.12,2.7,8);
    xPaint.box(new Vector3(x,y+2.6,z),3.1,.25,3);xRoofs.box(new Vector3(x,y+2.9,z),3.2,.25,3.7);
  }
  [xBase,xWood,xRoofs,xPaint,xGlass,xSign,xDetail].forEach(b=>b.finish(b===xBase));
  views.push({id:'xiaoyu-hill',name:'小鱼山公园',position:c.add(new Vector3(0,8,0)),radius:135,alpha:-2.1,beta:1.05});
  parkLandscape('xiaoyu','小鱼山公园',[lanchao,[west.x,west.z],[east.x,east.z]]);
  return {meshes,collisionMeshes,excludedBuildingIds,views,setDetail(distance:number){for(const mesh of nearMeshes)mesh.setEnabled(distance<1600);},setNight(strength:number,_time=0){const s=Math.max(0,Math.min(1,strength));glass.emissiveColor.set(.17*s,.13*s,.065*s);pavilionGlass.emissiveColor.set(.18*s,.12*s,.055*s);label.emissiveColor.set(.08*s,.065*s,.025*s);},dispose(){for(const m of meshes){shadows.removeShadowCaster(m);m.dispose();}for(const m of materials)m.dispose();for(const t of textures)t.dispose();}};
}
