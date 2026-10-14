import { Color3, DynamicTexture, Mesh, Scene, ShadowGenerator, StandardMaterial, Texture, Vector3, VertexData } from './babylon';

type P = [number, number];
type Road = { id: string; kind: string; name: string; points: P[]; width: number; lanes: number; length: number; tags: Record<string, string> };
type Section = { name: string; kind: string; position: P; axisDistance: number; tangent: P; length: number; mainSpan: number; towerOffsets: number[]; towerHeight: number; towerBaseHeight?:number; deckHeight: number; channelCarriagewayWidth?:number };
export type BayBridgeData = { roads: Road[]; mainAxis: P[]; mainLength: number; sections: Section[]; metadata: { ordinaryDeckHeight: number; ordinarySpanSpacing: number }; excludedRoadIds: string[] };

/** Real OSM plan geometry; explicit approximate vertical profile and structural detail.
 * Two OSM carriageways stay separate. Three channel bridge structural types are distinct.
 */
export function buildBayBridge(scene: Scene, data: BayBridgeData, shadows: ShadowGenerator, sampleHeight: (x: number, z: number) => number) {
  const meshes: Mesh[] = [], collisionMeshes: Mesh[] = [], materials: StandardMaterial[] = [], textures: DynamicTexture[] = [];
  const visibility: {mesh:Mesh;detail:boolean;minX:number;maxX:number;minZ:number;maxZ:number}[] = [];
  const mat = (name: string, hex: string, specular = .025) => {
    const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(hex); m.specularColor = new Color3(specular, specular, specular);
    m.useLogarithmicDepth = true; m.backFaceCulling = false; materials.push(m); return m;
  };
  const concrete = mat('Jiaozhou Bay bridge pale concrete', '#d0d1c8');
  const asphalt = mat('Jiaozhou Bay bridge asphalt deck', '#565b5e');
  const steel = mat('Jiaozhou Bay bridge blue-grey steel', '#66878f', .08);
  const white = mat('Jiaozhou Bay bridge road markings and cables', '#e0dfd3', .06);
  const blue = mat('Jiaozhou Bay bridge sea-blue railings', '#507a91', .07);
  const signMat = mat('Jiaozhou Bay bridge highway directions', '#ffffff');
  const signTexture = new DynamicTexture('Original Jiaozhou Bay direction typography', { width: 1024, height: 256 }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const ctx = signTexture.getContext() as CanvasRenderingContext2D; ctx.fillStyle = '#17654a'; ctx.fillRect(0,0,1024,256);ctx.strokeStyle='#e7eee2';ctx.lineWidth=9;ctx.strokeRect(9,9,1006,238);
  ctx.fillStyle='#f4f2df';ctx.font='bold 68px "Microsoft YaHei", sans-serif';ctx.textAlign='center';ctx.fillText('胶州湾大桥  ·  黄岛 / 红岛',512,100);
  ctx.font='38px sans-serif';ctx.fillText('JIAOZHOU BAY BRIDGE    S85',512,165);ctx.font='46px sans-serif';ctx.fillText('↓                ↓                ↓',512,226);
  signTexture.update(false);textures.push(signTexture);signMat.diffuseTexture=signTexture;
  class Batch {
    positions: number[] = []; indices: number[] = []; uvs: number[] = [];
    constructor(public name: string, public material: StandardMaterial, public detail = false) {}
    tri(a: Vector3, b: Vector3, c: Vector3, uv: number[][] = [[0,0],[1,0],[0,1]]) {
      const n=this.positions.length/3;for(const p of [a,b,c])this.positions.push(p.x,p.y,p.z);this.indices.push(n,n+2,n+1);this.uvs.push(...uv.flat());
    }
    quad(a: Vector3,b: Vector3,c: Vector3,d: Vector3,uv: number[][]=[[0,0],[1,0],[1,1],[0,1]]) { this.tri(a,b,c,[uv[0],uv[1],uv[2]]);this.tri(a,c,d,[uv[0],uv[2],uv[3]]); }
    box(c: Vector3,sx:number,sy:number,sz:number,angle=0) {
      const v=(x:number,y:number,z:number)=>new Vector3(c.x+x*Math.cos(angle)+z*Math.sin(angle),c.y+y,c.z-x*Math.sin(angle)+z*Math.cos(angle));
      const x=sx/2,y=sy/2,z=sz/2;
      this.quad(v(-x,y,-z),v(-x,y,z),v(x,y,z),v(x,y,-z));this.quad(v(-x,-y,z),v(-x,-y,-z),v(x,-y,-z),v(x,-y,z));
      this.quad(v(-x,-y,-z),v(-x,y,-z),v(x,y,-z),v(x,-y,-z));this.quad(v(x,-y,z),v(x,y,z),v(-x,y,z),v(-x,-y,z));
      this.quad(v(-x,-y,z),v(-x,y,z),v(-x,y,-z),v(-x,-y,-z));this.quad(v(x,-y,-z),v(x,y,-z),v(x,y,z),v(x,-y,z));
    }
    tube(a:Vector3,b:Vector3,r:number,sides=6){
      const axis=b.subtract(a).normalize(),ref=Math.abs(axis.y)>.9?new Vector3(1,0,0):new Vector3(0,1,0);
      const u=Vector3.Cross(axis,ref).normalize(),v=Vector3.Cross(u,axis).normalize();
      const offset=(i:number)=>u.scale(Math.cos(i*Math.PI*2/sides)*r).add(v.scale(Math.sin(i*Math.PI*2/sides)*r));
      for(let i=0;i<sides;i++){const p=offset(i),q=offset(i+1);this.quad(a.add(p),b.add(p),b.add(q),a.add(q));}
    }
    finish(collision=false,shadow=true){
      if(!this.positions.length)return;
      const mesh=new Mesh(this.name,scene),vd=new VertexData(),normals:number[]=[];
      vd.positions=this.positions;vd.indices=this.indices;vd.uvs=this.uvs;VertexData.ComputeNormals(this.positions,this.indices,normals);vd.normals=normals;vd.applyToMesh(mesh);
      let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
      for(let i=0;i<this.positions.length;i+=3){minX=Math.min(minX,this.positions[i]);maxX=Math.max(maxX,this.positions[i]);minZ=Math.min(minZ,this.positions[i+2]);maxZ=Math.max(maxZ,this.positions[i+2]);}
      mesh.material=this.material;mesh.receiveShadows=true;mesh.metadata={name:'胶州湾大桥',structure:this.name,kind:'bay-bridge',source:'Real OSM alignment; estimated structural profile; see docs/bay-bridge-references.md'};
      meshes.push(mesh);visibility.push({mesh,detail:this.detail,minX,maxX,minZ,maxZ});if(collision)collisionMeshes.push(mesh);if(shadow)shadows.addShadowCaster(mesh);return mesh;
    }
  }
  const axis=data.mainAxis,axisS=[0];for(let i=1;i<axis.length;i++)axisS.push(axisS[i-1]+Math.hypot(axis[i][0]-axis[i-1][0],axis[i][1]-axis[i-1][1]));
  const along=(s:number):Vector3=>{
    s=Math.max(0,Math.min(axisS[axisS.length-1],s));let i=1;while(i<axisS.length-1&&axisS[i]<s)i++;
    const t=(s-axisS[i-1])/Math.max(.001,axisS[i]-axisS[i-1]);return new Vector3(axis[i-1][0]+(axis[i][0]-axis[i-1][0])*t,0,axis[i-1][1]+(axis[i][1]-axis[i-1][1])*t);
  };
  const station=(p:P)=>{
    let best=Infinity,result=0;
    for(let i=1;i<axis.length;i++){
      const a=axis[i-1],b=axis[i],dx=b[0]-a[0],dz=b[1]-a[1],sq=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/Math.max(.001,sq)));
      const d=(p[0]-a[0]-dx*t)**2+(p[1]-a[1]-dz*t)**2;if(d<best){best=d;result=axisS[i-1]+Math.sqrt(sq)*t;}
    }return result;
  };
  // Preserve the real horizontal alignment. Smooth estimated grades lift channel clearances.
  const deck=(p:P,road?:Road)=>{
    let h=data.metadata.ordinaryDeckHeight||18;const s=station(p);
    for(const section of data.sections){const d=Math.abs(s-section.axisDistance),flat=section.length/2+80,ramp=1100;
      const f=d<=flat?1:d>=flat+ramp?0:(1+Math.cos(Math.PI*(d-flat)/ramp))/2;h=Math.max(h,18+(section.deckHeight-18)*f);
    }
    if(road?.kind==='ramp')h+=Math.max(0,Number(road.tags.layer||1)-1)*4.7;
    const ground=sampleHeight(p[0],p[1]);return Math.max(h,Number.isFinite(ground)?ground+6:0);
  };
  const channels=(p:P)=>data.sections.some(s=>Math.abs(station(p)-s.axisDistance)<s.length/2+30);
  // The published 24m channel steel-box half deck is wider than the ordinary 17.5m carriageway.
  const widthAt=(p:P,road:Road)=>{
    if(road.kind!=='main')return road.width;
    const s=station(p);let width=road.width;
    for(const section of data.sections){const distance=Math.abs(s-section.axisDistance),flat=section.length/2;
      const fade=Math.max(0,Math.min(1,(flat+100-distance)/100));width=Math.max(width,road.width+((section.channelCarriagewayWidth||24)-road.width)*fade);
    }return width;
  };
  const bins=new Map<string,{deck:Batch,sides:Batch,piers:Batch,rails:Batch,mark:Batch}>();
  const bin=(x:number,z:number)=>{
    const key=`${Math.floor(x/2400)}_${Math.floor(z/2400)}`;
    if(!bins.has(key))bins.set(key,{deck:new Batch('Bay bridge deck '+key,asphalt),sides:new Batch('Bay bridge box girders '+key,concrete),piers:new Batch('Bay bridge sea piers '+key,concrete),rails:new Batch('Bay bridge blue rails '+key,blue,true),mark:new Batch('Bay bridge lane markings '+key,white,true)});
    return bins.get(key)!;
  };
  const shift=(p:Vector3,n:Vector3,d:number)=>p.add(n.scale(d));
  for(const road of data.roads){
    // A local mitered strip follows each carriageway separately. Never place a 35m deck twice.
    let travel=0,nextPier=30,nextLight=140;
    for(let k=0;k<road.points.length-1;k++){
      const pa=road.points[k],pb=road.points[k+1],dx=pb[0]-pa[0],dz=pb[1]-pa[1],len=Math.hypot(dx,dz);if(len<.1)continue;
      const dir=new Vector3(dx/len,0,dz/len),normal=new Vector3(-dir.z,0,dir.x),sub=Math.max(1,Math.ceil(len/42));
      for(let j=0;j<sub;j++){
        const aP:P=[pa[0]+dx*j/sub,pa[1]+dz*j/sub],bP:P=[pa[0]+dx*(j+1)/sub,pa[1]+dz*(j+1)/sub];
        const a=new Vector3(aP[0],deck(aP,road),aP[1]),b=new Vector3(bP[0],deck(bP,road),bP[1]),group=bin((a.x+b.x)/2,(a.z+b.z)/2),wa=widthAt(aP,road)/2,wb=widthAt(bP,road)/2,w=(wa+wb)/2;
        const al=shift(a,normal,wa),ar=shift(a,normal,-wa),bl=shift(b,normal,wb),br=shift(b,normal,-wb);
        group.deck.quad(ar,al,bl,br);group.sides.quad(al,al.add(new Vector3(0,-2.1,0)),bl.add(new Vector3(0,-2.1,0)),bl);
        group.sides.quad(br,br.add(new Vector3(0,-2.1,0)),ar.add(new Vector3(0,-2.1,0)),ar);
        group.sides.quad(al.add(new Vector3(0,-2.1,0)),ar.add(new Vector3(0,-2.1,0)),br.add(new Vector3(0,-2.1,0)),bl.add(new Vector3(0,-2.1,0)));
        for(const side of [-1,1]){
          const ra=shift(a,normal,side*(wa-.3)),rb=shift(b,normal,side*(wb-.3));
          group.rails.quad(ra.add(new Vector3(0,.25,0)),ra.add(new Vector3(0,1.15,0)),rb.add(new Vector3(0,1.15,0)),rb.add(new Vector3(0,.25,0)));
          group.rails.tube(ra.add(new Vector3(0,1.18,0)),rb.add(new Vector3(0,1.18,0)),.065,4);
          const edgeA=shift(a,normal,side*(wa-1.0)).add(new Vector3(0,.025,0)),edgeB=shift(b,normal,side*(wb-1.0)).add(new Vector3(0,.025,0));
          group.mark.quad(edgeA.subtract(normal.scale(.075)),edgeA.add(normal.scale(.075)),edgeB.add(normal.scale(.075)),edgeB.subtract(normal.scale(.075)));
        }
        const step=len/sub;
        // Bounded lane markings: 12m periods with a 5m dash.
        for(let d=Math.ceil((travel+j*step)/12)*12;d<travel+(j+1)*step;d+=12){
          const t=(d-travel-j*step)/step,ct=Vector3.Lerp(a,b,Math.min(.99,t)),end=Vector3.Lerp(a,b,Math.min(1,t+5/step));
          for(let lane=1;lane<road.lanes;lane++){const offset=(lane/road.lanes-.5)*(w*2-3),a1=shift(ct,normal,offset).add(new Vector3(0,.03,0)),b1=shift(end,normal,offset).add(new Vector3(0,.03,0));group.mark.quad(a1.subtract(normal.scale(.07)),a1.add(normal.scale(.07)),b1.add(normal.scale(.07)),b1.subtract(normal.scale(.07)));}
        }
      }
      while(nextPier<travel+len){
        const t=(nextPier-travel)/len,p:P=[pa[0]+dx*t,pa[1]+dz*t];nextPier+=data.metadata.ordinarySpanSpacing||60;
        if(channels(p))continue;
        // The terrain sampler floors water at 2.4m for rendering. Sea piers must
        // extend below the ocean rather than treating that floor as a dry footing.
        const top=deck(p,road)-2.1,ground=sampleHeight(...p),bottom=Number.isFinite(ground)&&ground>2.5?ground:-1.7,h=top-bottom;
        if(h<2)continue;const group=bin(...p),angle=Math.atan2(dir.x,dir.z);
        const pierWidth=Math.min(road.width*.62,9.8);
        for(const side of [-1,1]){const c=new Vector3(p[0],bottom+h/2,p[1]).add(normal.scale(side*pierWidth*.29));group.piers.box(c,1.45,h,1.6,angle);}
        group.piers.box(new Vector3(p[0],top-.45,p[1]),pierWidth+2,.9,2.4,angle+Math.PI/2);
        group.piers.box(new Vector3(p[0],bottom+.5,p[1]),pierWidth+3.1,1,3.8,angle+Math.PI/2);
      }
      while(nextLight<travel+len){
        const t=(nextLight-travel)/len,p:P=[pa[0]+dx*t,pa[1]+dz*t],h=deck(p,road),group=bin(...p);nextLight+=180;
        const c=new Vector3(p[0],h,p[1]).add(normal.scale(road.width/2-.65));group.rails.tube(c,c.add(new Vector3(0,9,0)),.13,5);
        group.rails.tube(c.add(new Vector3(0,9,0)),c.add(new Vector3(0,9.4,0)).subtract(normal.scale(2.6)),.12,5);
      }
      travel+=len;
    }
  }
  // Distant repeated piers and box girders do not enter the dynamic shadow render list.
  for(const b of bins.values()){b.deck.finish(true,false);b.sides.finish(false,false);b.piers.finish(false,false);b.rails.finish(false,false);b.mark.finish(false,false);}
  const axisFrame=(s:number)=>{const p=along(s),d=along(s+5).subtract(along(s-5)).normalize();return {p,d,n:new Vector3(-d.z,0,d.x)};};
  // Find the two actual mapped carriageway centres at each channel station.
  const laneAt=(s:number)=>{
    const f=axisFrame(s),values:Vector3[]=[];
    for(const road of data.roads.filter(r=>r.kind==='main'))for(let i=0;i<road.points.length-1;i++){
      const a=road.points[i],b=road.points[i+1],sa=station(a),sb=station(b);if(s<Math.min(sa,sb)-.1||s>Math.max(sa,sb)+.1||Math.abs(sb-sa)<.01)continue;
      const t=(s-sa)/(sb-sa),p=new Vector3(a[0]+(b[0]-a[0])*t,0,a[1]+(b[1]-a[1])*t);
      if(!values.some(v=>Vector3.DistanceSquared(v,p)<4))values.push(p);
    }
    if(values.length>=2)return values.sort((a,b)=>Vector3.Dot(a.subtract(f.p),f.n)-Vector3.Dot(b.subtract(f.p),f.n)).slice(0,2);
    return [f.p.add(f.n.scale(-12)),f.p.add(f.n.scale(12))];
  };
  for(const section of data.sections){
    // Per-channel bounds prevent a whole-bay batch from keeping distant towers and cables enabled.
    const tower=new Batch(section.name+' pylons',concrete),cables=new Batch(section.name+' cables',white),channelSteel=new Batch(section.name+' transverse and anchorage frames',steel);
    const s=section.axisDistance;
    if(section.kind.includes('cable-stayed')){
      // Separate H-pylons on each carriageway; Cangkou has two longitudinal tower stations, Hongdao one.
      for(const offset of section.towerOffsets){const ts=s+offset,f=axisFrame(ts);
        for(const lane of laneAt(ts)){
          const base=section.towerBaseHeight||0,top=base+section.towerHeight,dh=deck([lane.x,lane.z]),half=10.3;
          for(const side of [-1,1]){const c=lane.add(f.n.scale(side*half));tower.box(new Vector3(c.x,base+section.towerHeight/2,c.z),2.05,section.towerHeight,2.6,Math.atan2(f.d.x,f.d.z));}
          tower.box(new Vector3(lane.x,dh-2,lane.z),2.9,3.0,half*2+2.5,Math.atan2(f.n.x,f.n.z));
          tower.box(new Vector3(lane.x,top*.84,lane.z),2.3,1.4,half*2+1.8,Math.atan2(f.n.x,f.n.z));
          // Sparse parallel/harp stays, not a dense generic fan.
          const count=section.kind.startsWith('double')?4:3,reach=section.kind.startsWith('double')?section.mainSpan/2:section.mainSpan;
          for(const sign of [-1,1])for(let j=1;j<=count;j++)for(const side of [-1,1]){
            const ds=sign*reach*j/count,targetFrame=axisFrame(ts+ds),target=laneAt(ts+ds).sort((a,b)=>Vector3.DistanceSquared(a,lane)-Vector3.DistanceSquared(b,lane))[0];
            const low=target.add(targetFrame.n.scale(side*half));low.y=deck([low.x,low.z]);
            const high=lane.add(f.n.scale(side*half));high.y=dh+(top-dh-2)*j/count;cables.tube(low,high,.28,5);
          }
          tower.box(new Vector3(lane.x,2.0,lane.z),7.5,4,22.5,Math.atan2(f.n.x,f.n.z));
        }
      }
    }else{
      // Dagu River: one central single-column pylon, two spatial suspension main cables and vertical hangers.
      const ts=s+(section.towerOffsets[0]||0),f=axisFrame(ts),p=f.p,top=section.towerHeight;
      tower.box(new Vector3(p.x,top/2,p.z),6.1,top,4.7,Math.atan2(f.d.x,f.d.z));
      tower.box(new Vector3(p.x,2,p.z),16,4,18,Math.atan2(f.d.x,f.d.z));
      // Chainage order follows the documented 80+190+260+80m span sequence.
      const left=ts-190,right=ts+260;
      for(let st=left;st<=right;st+=12){const g=axisFrame(st),lanes=laneAt(st),dh=deck([g.p.x,g.p.z]);
        const width=Vector3.Distance(lanes[0],lanes[1])+20;
        channelSteel.box(new Vector3(g.p.x,dh-1.0,g.p.z),3,1.8,width,Math.atan2(g.n.x,g.n.z));
      }
      for(const direction of [-1,1]){
        const endS=direction<0?left:right,span=Math.abs(endS-ts),end=axisFrame(endS),deckY=deck([end.p.x,end.p.z]);
        for(const side of [-1,1]){
          // Central spatial cable planes suspend transverse boxes between the two edge steel boxes.
          // End gaps remain provisional; exact as-built cable saddle measurements are unavailable.
          const anchorOffset=direction<0?3.9:3.25;
          let previous:Vector3|undefined;
          for(let i=0;i<=40;i++){
            const u=i/40,st=ts+(endS-ts)*u,g=axisFrame(st),v=g.p.add(g.n.scale(side*(1.25+u*(anchorOffset-1.25))));
            // Spatial self-anchored cable: tall saddle drops to a deck anchorage, with shallow sag below its chord.
            v.y=top-2+(deckY+2-(top-2))*u-4*(span/12.53)*u*(1-u);
            if(previous)cables.tube(previous,v,.32,6);previous=v;
          }
          for(let distance=12;distance<span;distance+=12){
            const u=distance/span,st=ts+(endS-ts)*u,g=axisFrame(st),v=g.p.add(g.n.scale(side*(1.25+u*(anchorOffset-1.25))));v.y=top-2+(deckY+2-(top-2))*u-4*(span/12.53)*u*(1-u);
            const bottom=v.clone();bottom.y=deck([v.x,v.z]);if(v.y>bottom.y)cables.tube(bottom,v,.105,4);
          }
        }
        channelSteel.box(new Vector3(end.p.x,deckY-1,end.p.z),13,2,7,Math.atan2(end.d.x,end.d.z));
      }
    }
    tower.finish(false,true);cables.finish(false,false);channelSteel.finish(false,false);
  }
  const directions=new Batch('Jiaozhou Bay bridge entrance direction boards',signMat,true),boardPosts=new Batch('Jiaozhou Bay bridge direction board supports',blue,true);
  for(const st of [2200,6400,17500]){
    const f=axisFrame(st),lanes=laneAt(st);
    for(const lane of lanes){const h=deck([lane.x,lane.z])+6.2,c=lane.add(new Vector3(0,h,0)),u=f.n.scale(5.0),up=new Vector3(0,1.25,0);
      directions.quad(c.subtract(u).subtract(up),c.subtract(u).add(up),c.add(u).add(up),c.add(u).subtract(up),[[0,1],[0,0],[1,0],[1,1]]);
      for(const side of [-1,1]){const a=lane.add(f.n.scale(side*8));a.y=h-6.2;boardPosts.tube(a,a.add(new Vector3(0,7.6,0)),.17,5);}
    }
  }
  // The small entrance board supports are created after bulk batches, so finalize their own batch.
  directions.finish(false,false);boardPosts.finish(false,false);
  const views:{name:string;position:Vector3;radius:number;alpha?:number;beta?:number}[]=data.sections.map(s=>{const [dx,dz]=s.tangent,side=dx<0?1:-1,nx=-dz*side,nz=dx*side;return {name:s.name,position:new Vector3(s.position[0],s.deckHeight+24,s.position[1]),radius:s.kind.includes('suspension')?640:520,alpha:Math.atan2(nz*.75+dz*.65,nx*.75+dx*.65),beta:1.28};});
  const hong=data.roads.find(r=>r.kind==='hongdao');if(hong){const p=hong.points[hong.points.length-1];views.push({name:'红岛海上互通',position:new Vector3(p[0],55,p[1]),radius:1900});}
  const position=views[0]?.position.clone()||new Vector3(1500,60,12300);
  return {meshes,collisionMeshes,position,excludedRoadIds:new Set(data.excludedRoadIds),views,
    setDetail(distance:number,focus?:Vector3){
      const reach=Math.max(8000,distance*1.5);
      for(const item of visibility){
        // Distance to the nearest point of the full XZ bbox, rather than its centre.
        // This keeps the near end of long strips visible while culling geographically distant batches.
        const dx=focus?Math.max(item.minX-focus.x,0,focus.x-item.maxX):0,dz=focus?Math.max(item.minZ-focus.z,0,focus.z-item.maxZ):0;
        item.mesh.setEnabled(dx*dx+dz*dz<=reach*reach&&(!item.detail||distance<9000));
      }
    },
    dispose(){for(const mesh of meshes){shadows.removeShadowCaster(mesh);mesh.dispose();}for(const material of materials)material.dispose();for(const texture of textures)texture.dispose();}};
}
