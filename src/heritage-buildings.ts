import { AbstractMesh, Color3, DynamicTexture, Mesh, Scene, ShadowGenerator, StandardMaterial, Texture, Vector3, VertexData } from './babylon';
import earcut from 'earcut';

type P=[number,number];
type Feature={id:string;polygon:P[];name?:string;tags?:Record<string,string>;height?:number};
type Face={x:number;z:number;ux:number;uz:number;nx:number;nz:number;base:number};
const UP=new Vector3(0,1,0);
const ring=(p:P[])=>p.length>2&&Math.hypot(p[0][0]-p.at(-1)![0],p[0][1]-p.at(-1)![1])<.01?p.slice(0,-1):p;
const average=(p:P[]):P=>[p.reduce((a,b)=>a+b[0],0)/p.length,p.reduce((a,b)=>a+b[1],0)/p.length];

/** Source-footprint heritage assets. Surveyed plan dimensions and photo-estimated detail remain distinct. */
export function buildHeritageBuildings(scene:Scene,data:any,shadows:ShadowGenerator,sampleHeight:(x:number,z:number)=>number){
  const meshes:AbstractMesh[]=[],collisionMeshes:AbstractMesh[]=[],materials:StandardMaterial[]=[],textures:Texture[]=[],details:AbstractMesh[]=[];
  const excludedBuildingIds=new Set<string>();
  const views:{id:string;name:string;position:Vector3;radius:number;alpha?:number;beta?:number}[]=[];
  const features:Feature[]=data.buildings||[];
  const height=(x:number,z:number)=>{const h=sampleHeight(x,z);return Number.isFinite(h)?h:2.4;};
  const material=(key:string,color:string)=>{const m=new StandardMaterial(`Heritage · ${key}`,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor=new Color3(.025,.025,.025);m.useLogarithmicDepth=true;materials.push(m);return m;};
  const paint=(name:string,size:number,draw:(c:CanvasRenderingContext2D)=>void)=>{const t=new DynamicTexture(name,{width:size,height:size},scene,true,Texture.TRILINEAR_SAMPLINGMODE);draw(t.getContext() as CanvasRenderingContext2D);t.update(false);t.wrapU=t.wrapV=Texture.WRAP_ADDRESSMODE;t.anisotropicFilteringLevel=8;textures.push(t);return t;};
  const ochre=material('pale ochre plaster','#e3ce92'),white=material('warm rough white render','#ece5cf'),stone=material('mushroom dressed granite','#a5a79b'),pale=material('cut pale sandstone','#d1cbb2'),deep=material('stone shadow courses','#777a70'),brick=material('1903 brewery red brick','#ffffff'),roof=material('terracotta tiles','#ffffff'),edge=material('terracotta ridge','#a75c43'),greenRoof=material('historic grey green roof','#657568'),timber=material('dark red half timber','#714534'),glass=material('muted green window glass','#415851'),frame=material('white and sage window frames','#c8d2bd'),iron=material('dark wrought iron','#445044'),gold=material('glazed golden wall tile','#d7ad38'),wallRed=material('university road red wall','#b73326');
  glass.specularColor=new Color3(.18,.25,.21);glass.specularPower=60;
  roof.diffuseTexture=paint('Original heritage terracotta tile texture',256,c=>{c.fillStyle='#b76545';c.fillRect(0,0,256,256);for(let r=0;r<16;r++)for(let k=-1;k<17;k++){const x=k*16+(r%2?8:0);c.fillStyle=['#bd6c4b','#ae583e','#bb6949'][(r+k+20)%3];c.fillRect(x+1,r*16+1,14,14);c.fillStyle='rgba(77,40,28,.25)';c.fillRect(x,r*16+14,16,2);c.fillStyle='rgba(255,229,181,.14)';c.fillRect(x+1,r*16+2,2,10);}});
  brick.diffuseTexture=paint('Original brewery brick bond',256,c=>{c.fillStyle='#ac624b';c.fillRect(0,0,256,256);for(let r=0;r<16;r++)for(let k=-1;k<9;k++){const x=k*32+(r%2?16:0);c.fillStyle=['#ac5741','#b4634b','#a9533d','#bd6b4f'][(r+k+24)%4];c.fillRect(x+1,r*16+1,30,14);}});
  stone.diffuseTexture=paint('Original heritage rough granite masonry',256,c=>{c.fillStyle='#cbcbbf';c.fillRect(0,0,256,256);for(let r=0;r<8;r++)for(let k=-1;k<5;k++){const x=k*64+(r%2?32:0);c.fillStyle=['#d1d1c6','#bbbfb4','#c7c9bd'][(r+k+14)%3];c.fillRect(x+2,r*32+1,60,29);for(let j=0;j<10;j++){c.fillStyle=j%2?'rgba(70,75,65,.09)':'rgba(255,255,244,.16)';c.fillRect(x+(j*13+r*9)%57+3,r*32+3+(j*7)%24,3,2);}}});
  // White render's low contrast speckle keeps the photographed rough finish without noisy screen-space grain.
  white.diffuseTexture=paint('Original rough lime render',128,c=>{c.fillStyle='#fffdf3';c.fillRect(0,0,128,128);for(let i=0;i<350;i++){c.fillStyle=i%2?'#f3f1e6':'#eae9dd';c.fillRect((i*37)%128,(i*59)%128,2,2);}});
  class Batch{
    pos:number[]=[];uv:number[]=[];idx:number[]=[];
    constructor(public material:StandardMaterial,public label:string,public detail=false){}
    tri(a:Vector3,b:Vector3,c:Vector3,normal?:Vector3,uv:[number,number][]=[[0,0],[1,0],[0,1]]){if(normal&&Vector3.Dot(Vector3.Cross(b.subtract(a),c.subtract(a)),normal)<0){[b,c]=[c,b];[uv[1],uv[2]]=[uv[2],uv[1]];}const n=this.pos.length/3;for(const p of [a,b,c])this.pos.push(p.x,p.y,p.z);for(const q of uv)this.uv.push(...q);this.idx.push(n,n+2,n+1);}
    quad(a:Vector3,b:Vector3,c:Vector3,d:Vector3,normal?:Vector3,uv:[number,number][]=[[0,0],[1,0],[1,1],[0,1]]){this.tri(a,b,c,normal,[uv[0],uv[1],uv[2]]);this.tri(a,c,d,normal,[uv[0],uv[2],uv[3]]);}
    box(x:number,y:number,z:number,w:number,h:number,d:number,angle=0){const s=Math.sin(angle),c=Math.cos(angle),v=(u:number,j:number,k:number)=>new Vector3(x+u*c-k*s,y+j,z+u*s+k*c),a=w/2,b=h/2,e=d/2;this.quad(v(-a,b,-e),v(-a,b,e),v(a,b,e),v(a,b,-e),UP);for(const [u,k,nx,nz] of [[-a,-e,0,-1],[a,-e,1,0],[a,e,0,1],[-a,e,-1,0]]){const [uu,kk]=nx===0?[-u,k]:[u,-k];this.quad(v(u,-b,k),v(u,b,k),v(uu,b,kk),v(uu,-b,kk),new Vector3(nx*c-nz*s,0,nx*s+nz*c));}}
  }
  class Asset{
    batches=new Map<StandardMaterial,Batch>();collision=new Batch(stone,'collision');ids:string[]=[];
    constructor(public id:string,public name:string,public source:string){}
    b(m:StandardMaterial,detail=false){let b=this.batches.get(m);if(!b){b=new Batch(m,m.name,detail);this.batches.set(m,b);}return b;}
    finish(){const items:[Batch,boolean][]=[...this.batches.values()].map(b=>[b,true]);items.push([this.collision,false]);for(const [b,visible] of items){if(!b.pos.length)continue;const m=new Mesh(`${this.name} · ${b.label}`,scene),v=new VertexData();v.positions=b.pos;v.indices=b.idx;v.uvs=b.uv;const normals:number[]=[];VertexData.ComputeNormals(b.pos,b.idx,normals);v.normals=normals;v.applyToMesh(m);m.material=b.material;m.metadata={kind:visible?'heritage-landmark':'heritage-collision',landmarkId:this.id,name:this.name,source:this.source,osmIds:this.ids,detailSource:'Architectural relief and non-tagged heights estimated from documented exterior photographs'};m.receiveShadows=true;m.isVisible=visible;m.freezeWorldMatrix();meshes.push(m);if(!visible)collisionMeshes.push(m);else if(b.detail)details.push(m);else shadows.addShadowCaster(m);}}
  }
  const top=(b:Batch,p:P[],y:number)=>{p=ring(p);const ids=earcut(p.flat(),undefined,2);for(let i=0;i<ids.length;i+=3)b.tri(...ids.slice(i,i+3).map(k=>new Vector3(p[k][0],y,p[k][1])) as [Vector3,Vector3,Vector3],UP);};
  const faces=(p:P[],base:number):{f:Face;length:number}[]=>{p=ring(p);const area=p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0);return p.map((a,i)=>{let b=p[(i+1)%p.length];if(area<0)[a,b]=[b,a];const len=Math.hypot(b[0]-a[0],b[1]-a[1]),ux=(b[0]-a[0])/len,uz=(b[1]-a[1])/len;return {f:{x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,ux,uz,nx:uz,nz:-ux,base},length:len};});};
  const vertex=(f:Face,u:number,y:number,depth=.08)=>new Vector3(f.x+f.ux*u+f.nx*depth,f.base+y,f.z+f.uz*u+f.nz*depth);
  const rect=(b:Batch,f:Face,u:number,y:number,w:number,h:number,depth=.12)=>b.quad(vertex(f,u-w/2,y,depth),vertex(f,u+w/2,y,depth),vertex(f,u+w/2,y+h,depth),vertex(f,u-w/2,y+h,depth),new Vector3(f.nx,0,f.nz),[[0,1],[1,1],[1,0],[0,0]]);
  const line=(b:Batch,f:Face,u:number,y:number,v:number,yy:number,width:number,depth=.22)=>{const dx=v-u,dy=yy-y,l=Math.hypot(dx,dy)||1,a=-dy/l*width/2,c=dx/l*width/2;b.quad(vertex(f,u+a,y+c,depth),vertex(f,u-a,y-c,depth),vertex(f,v-a,yy-c,depth),vertex(f,v+a,yy+c,depth),new Vector3(f.nx,0,f.nz));};
  const extrude=(b:Batch,p:P[],bottom:number,y:number)=>{for(const {f,length} of faces(p,0))b.quad(vertex(f,-length/2,bottom,0),vertex(f,-length/2,y,0),vertex(f,length/2,y,0),vertex(f,length/2,bottom,0),new Vector3(f.nx,0,f.nz),[[0,bottom/1.8],[0,y/1.8],[length/1.8,y/1.8],[length/1.8,bottom/1.8]]);top(b,p,y);};
  const nearestDistance=(p:P[],x:number,z:number)=>{let best=Infinity;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));best=Math.min(best,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));}return best;};
  // A distance-field hip/mansard roof stays inside concave OSM outlines, including U-shaped courtyards.
  const footprintRoof=(b:Batch,p:P[],eave:number,rise:number,mansard=false)=>{p=ring(p);const ids=earcut(p.flat(),undefined,2),roofY=(v:Vector3)=>eave+Math.min(rise,mansard?Math.min(nearestDistance(p,v.x,v.z)*1.15,4.0)+Math.max(0,nearestDistance(p,v.x,v.z)-3.48)*.32:nearestDistance(p,v.x,v.z)*.80);const emit=(a:Vector3,c:Vector3,d:Vector3,iteration=0)=>{const v=[a,c,d],l=v.map((q,i)=>(q.x-v[(i+1)%3].x)**2+(q.z-v[(i+1)%3].z)**2),max=Math.max(...l);if(max>4.2**2&&iteration<14){const k=l.indexOf(max),aa=v[k],bb=v[(k+1)%3],cc=v[(k+2)%3],mid=aa.add(bb).scale(.5);emit(aa,mid,cc,iteration+1);emit(mid,bb,cc,iteration+1);return;}for(const q of v)q.y=roofY(q);b.tri(a,c,d,UP,v.map(q=>[q.x/.7,q.z/.7]) as [number,number][]);};for(let i=0;i<ids.length;i+=3)emit(...ids.slice(i,i+3).map(k=>new Vector3(p[k][0],0,p[k][1])) as [Vector3,Vector3,Vector3]);};
  const arch=(a:Asset,f:Face,u:number,y:number,w:number,h:number,fill=glass,trim=pale,thickness=.23)=>{const r=w/2,spring=y+h-r,n=new Vector3(f.nx,0,f.nz),pane=a.b(fill,true),band=a.b(trim,true);rect(pane,f,u,y,w,h-r,.16);for(let i=0;i<18;i++){const aa=i*Math.PI/18,bb=(i+1)*Math.PI/18,point=(angle:number,rr:number,dep:number)=>vertex(f,u+Math.cos(angle)*rr,spring+Math.sin(angle)*rr,dep);pane.tri(vertex(f,u,spring,.16),point(aa,r,.16),point(bb,r,.16),n);band.quad(point(aa,r,.24),point(aa,r+thickness,.24),point(bb,r+thickness,.24),point(bb,r,.24),n);}for(const s of [-1,1])rect(band,f,u+s*(r+thickness/2),y,thickness,h-r,.24);rect(a.b(frame,true),f,u,y,.11,h,.28);rect(a.b(frame,true),f,u,y+(h-r)*.52,w,.10,.28);rect(band,f,u,y-.18,w+.65,.2,.28);};
  const window=(a:Asset,f:Face,u:number,y:number,w:number,h:number,trim=pale)=>{rect(a.b(glass,true),f,u,y,w,h,.14);const b=a.b(trim,true);for(const s of [-1,1])rect(b,f,u+s*(w/2+.1),y-.1,.2,h+.2,.23);rect(b,f,u,y+h,w+.4,.25,.23);rect(b,f,u,y-.2,w+.65,.25,.27);rect(a.b(frame,true),f,u,y,.10,h,.28);rect(a.b(frame,true),f,u,y+h*.55,w,.10,.28);};
  const gable=(a:Asset,f:Face,u:number,y:number,w:number,h:number,fill:StandardMaterial,curved=false)=>{const pts:P[]=curved?[[-w/2,0],[-w*.45,h*.28],[-w*.35,h*.37],[-w*.30,h*.63],[-w*.17,h*.72],[-w*.12,h*.94],[0,h],[w*.12,h*.94],[w*.17,h*.72],[w*.30,h*.63],[w*.35,h*.37],[w*.45,h*.28],[w/2,0]]:[[-w/2,0],[0,h],[w/2,0]];const ids=earcut(pts.flat());for(let i=0;i<ids.length;i+=3)a.b(fill).tri(...ids.slice(i,i+3).map(k=>vertex(f,u+pts[k][0],y+pts[k][1],.33)) as [Vector3,Vector3,Vector3],new Vector3(f.nx,0,f.nz));for(let i=0;i<pts.length-1;i++)line(a.b(pale),f,u+pts[i][0],y+pts[i][1],u+pts[i+1][0],y+pts[i+1][1],.4,.38);};
  const sign=(a:Asset,f:Face,label:string,sub:string,u:number,y:number,w:number,h:number,dark=true)=>{const m=material(`${label} own typography`,'#ffffff');m.diffuseTexture=paint(`Original lettering ${label}`,512,c=>{c.fillStyle=dark?'#314f43':'#efeee3';c.fillRect(0,0,512,512);c.strokeStyle=dark?'#d8c397':'#b5b6a5';c.lineWidth=8;c.strokeRect(8,130,496,252);c.textAlign='center';c.textBaseline='middle';c.fillStyle=dark?'#f1e6bd':'#242923';c.font=`bold ${Math.min(68,400/label.length)}px Microsoft YaHei, serif`;c.fillText(label,256,235);c.font='22px Georgia';c.fillText(sub,256,313);});rect(a.b(m),f,u,y,w,h,.49);};
  const mainFace=(f:Feature,base:number,nx:number,nz:number)=>faces(f.polygon,base).filter(q=>q.length>5).sort((a,b)=>b.length*Math.max(0,b.f.nx*nx+b.f.nz*nz)**4-a.length*Math.max(0,a.f.nx*nx+a.f.nz*nz)**4)[0];
  // The government office has two long wing segments and three short central projection segments.
  // Establish its axis from the complete front row, then intersect that axis with the surveyed projection.
  const governmentFront=(feature:Feature,base:number)=>{
    const reference=mainFace(feature,base,-.24,-.97).f;
    const matching=faces(feature.polygon,base).filter(q=>q.f.nx*reference.nx+q.f.nz*reference.nz>.98);
    const depth=(f:Face)=>f.x*reference.nx+f.z*reference.nz;
    const frontDepth=Math.max(...matching.map(q=>depth(q.f)));
    const front=matching.filter(q=>frontDepth-depth(q.f)<4.6);
    const u=(f:Face)=>f.x*reference.ux+f.z*reference.uz;
    const extent=(q:{f:Face;length:number})=>{const c=u(q.f),s=(q.f.ux*reference.ux+q.f.uz*reference.uz)*q.length/2;return [c-s,c+s];};
    const min=Math.min(...front.map(q=>extent(q)[0])),max=Math.max(...front.map(q=>extent(q)[1])),axis=(min+max)/2;
    const projection=front.filter(q=>frontDepth-depth(q.f)<.6);
    const owner=projection.find(q=>{const e=extent(q);return axis>=e[0]&&axis<=e[1];})||projection[0];
    const offset=(axis-u(owner.f))/(owner.f.ux*reference.ux+owner.f.uz*reference.uz);
    const f={...owner.f,x:owner.f.x+owner.f.ux*offset,z:owner.f.z+owner.f.uz*offset};
    const width=Math.max(...projection.map(q=>extent(q)[1]))-Math.min(...projection.map(q=>extent(q)[0]));
    return {f,width};
  };
  const foundation=(a:Asset,f:Feature,eave:number,wall:StandardMaterial)=>{const p=ring(f.polygon),base=Math.max(...p.map(v=>height(...v)))+.08,min=Math.min(...p.map(v=>height(...v)))-.5;extrude(a.b(stone),p,min,base+1.8);extrude(a.b(wall),p,base+1.8,base+eave);extrude(a.collision,p,min,base+eave);a.ids.push(f.id);excludedBuildingIds.add(f.id);return base;};
  const cornices=(a:Asset,f:Feature,base:number,eave:number,mid:number)=>{for(const q of faces(f.polygon,base)){rect(a.b(pale),q.f,0,mid,q.length,.26,.18);rect(a.b(pale),q.f,0,eave-.18,q.length,.38,.28);rect(a.b(deep),q.f,0,1.62,q.length,.18,.14);}};
  const addView=(a:Asset,p:P[],base:number,radius:number,alpha=-1.15)=>{const c=average(p);views.push({id:a.id,name:a.name,position:new Vector3(c[0],base+9,c[1]),radius,alpha,beta:1.12});};

  const office=features.find(f=>f.id==='way/403383420');
  if(office){const a=new Asset('government','德国总督府旧址','https://www.qingdao.gov.cn/lslm/zt/whyc/wwzl/202112/t20211201_3895714.shtml'),base=foundation(a,office,14,stone);footprintRoof(a.b(roof),office.polygon,base+14,6,true);cornices(a,office,base,14,8.6);
    const front=governmentFront(office,base),f=front.f;
    for(const q of faces(office.polygon,base)){if(q.length<5)continue;const inCenter=Math.abs((q.f.x-f.x)*f.ux+(q.f.z-f.z)*f.uz)<front.width/2&&q.f.nx*f.nx+q.f.nz*f.nz>.98&&Math.abs((q.f.x-f.x)*f.nx+(q.f.z-f.z)*f.nz)<.6;if(inCenter)continue;const count=Math.max(1,Math.floor(q.length/4.8)),step=q.length/count;for(let k=0;k<count;k++){const u=(k+.5)*step-q.length/2;window(a,q.f,u,2.25,1.4,2.8);arch(a,q.f,u,6.0,1.7,4.0,glass,pale,.32);window(a,q.f,u,11.2,1.25,2.05);}for(let k=1;k<count;k++)rect(a.b(pale),q.f,k*step-q.length/2,5.3,.35,8.5,.22);}
    // Stone pavilion width is measured from the OSM projection, rather than pasted onto a wing's midpoint.
    rect(a.b(stone),f,0,1.8,front.width,12.2,.20);
    const pf={...f,x:f.x+f.nx*.20,z:f.z+f.nz*.20};
    arch(a,pf,0,1.8,4.6,5.3,glass,pale,.42);
    for(const u of [-2.3,0,2.3])window(a,pf,u,8.9,1.2,4.0,pale);
    for(const u of [-front.width/2+.5,front.width/2-.5])rect(a.b(pale),pf,u,2.1,.38,11.5,.25);
    // The inspected central roof has a small pediment, not the broad curvilinear gable used on the residence.
    gable(a,pf,0,14,6.4,2.15,stone);arch(a,pf,0,14.15,1.05,1.35,white,pale,.16);
    sign(a,pf,'德国总督府旧址','FORMER GOVERNMENT OFFICE',0,7.35,5.7,1.05);
    // Eyebrow dormers and iron crest rails are visible in the official description and exterior photograph.
    for(const q of faces(office.polygon,base).filter(q=>q.length>16)){for(let u=-q.length/2+5;u<q.length/2-3;u+=12){const df={...q.f,x:q.f.x-q.f.nx*2.6,z:q.f.z-q.f.nz*2.6};arch(a,df,u,15.1,2.25,1.8,glass,pale,.20);gable(a,df,u,15.1,3,2,stone,true);}rect(a.b(iron,true),{...q.f,x:q.f.x-q.f.nx*4.8,z:q.f.z-q.f.nz*4.8},0,18.65,q.length-6,.09,.16);for(let u=-q.length/2+4;u<q.length/2-3;u+=2.4)rect(a.b(iron,true),{...q.f,x:q.f.x-q.f.nx*4.8,z:q.f.z-q.f.nz*4.8},u,18.1,.055,.65,.16);}
    addView(a,office.polygon,base,133,-1.65);a.finish();}

  const residence=features.find(f=>f.id==='way/412996775');
  if(residence){const a=new Asset('residence','德国总督官邸 · 迎宾馆','https://www.qingdao.gov.cn/lslm/zt/whyc/wwzl/202111/t20211126_3877126.shtml'),base=foundation(a,residence,13.2,ochre);footprintRoof(a.b(roof),residence.polygon,base+13.2,10.4);cornices(a,residence,base,13.2,7.2);
    for(const q of faces(residence.polygon,base)){if(q.length<3)continue;const count=Math.max(1,Math.floor(q.length/4.0)),step=q.length/count;for(let k=0;k<count;k++){const u=(k+.5)*step-q.length/2;if(q.length>4)arch(a,q.f,u,2.4,1.45,3.15,glass,stone,.34);window(a,q.f,u,8.2,1.55,2.65,stone);}for(const side of [-1,1])for(let y=2.1;y<13;y+=.72)rect(a.b(stone),q.f,side*(q.length/2-.35),y,.7,.53,.21);}
    const f=mainFace(residence,base,0,-1).f;gable(a,f,-1.7,11.6,10.4,9.1,stone,true);for(const u of [-3.2,0])arch(a,f,u,12.5,1.35,3.5,glass,stone,.28);window(a,f,-1.7,17.0,1.6,2.2,stone);arch(a,f,1.9,1.8,2.5,4.8,glass,stone,.38);sign(a,f,'迎宾馆','FORMER GOVERNOR RESIDENCE',1.9,6.8,4.3,1.2);
    // The small mapped northeast projection carries a steep red tower roof; top height is photo-estimated.
    const tx=1061.0,tz=493.4,tw=7.0;a.b(stone).box(tx,base+10.8,tz,tw,5.8,tw);a.b(ochre).box(tx,base+19.2,tz,tw,11.0,tw);a.b(white).box(tx,base+24.4,tz,tw+.15,1.25,tw+.15);const tower:P[]=[[tx-tw/2,tz-tw/2],[tx+tw/2,tz-tw/2],[tx+tw/2,tz+tw/2],[tx-tw/2,tz+tw/2]];const tip=new Vector3(tx,base+31,tz);for(let i=0;i<4;i++)a.b(roof).tri(new Vector3(...[tower[i][0],base+25,tower[i][1]] as [number,number,number]),new Vector3(tower[(i+1)%4][0],base+25,tower[(i+1)%4][1]),tip,UP);for(const q of faces(tower,base)){arch(a,q.f,0,20.2,1.5,2.8);for(const u of [-2.5,0,2.5])rect(a.b(timber,true),q.f,u,23.7,.15,1.3,.22);line(a.b(timber,true),q.f,-2.5,23.7,0,25,.15);line(a.b(timber,true),q.f,0,25,2.5,23.7,.15);}
    // Green metal porch canopy and its stone arcade reproduce the inspected entrance detail.
    const cf={...f,x:f.x+f.nx*1.4,z:f.z+f.nz*1.4};for(const u of [-.3,4.1])rect(a.b(stone),cf,u,1.1,.65,4.8,.1);const av=vertex(cf,-.7,6.25,-.7),bv=vertex(cf,4.6,6.25,-.7),cv=vertex(cf,4.6,5.75,1.7),dv=vertex(cf,-.7,5.75,1.7);a.b(greenRoof).quad(av,bv,cv,dv,UP);addView(a,residence.polygon,base,94,-1.75);a.finish();}

  const breweryIds=['way/554250269','way/554250271','way/554250273','way/554250279'];
  const brewery=features.filter(f=>breweryIds.includes(f.id));
  if(brewery.length){const a=new Asset('brewery','青岛啤酒博物馆 · 登州路56号','https://www.tsingtaomuseum.com/category/1773555496326803458');let maxbase=0;for(const f of brewery){const base=foundation(a,f,9.8,brick);maxbase=Math.max(maxbase,base);footprintRoof(a.b(greenRoof),f.polygon,base+9.8,4.6);cornices(a,f,base,9.8,5.25);for(const q of faces(f.polygon,base)){if(q.length<5)continue;const count=Math.max(1,Math.floor(q.length/4.8)),step=q.length/count;for(let k=0;k<count;k++){const u=(k+.5)*step-q.length/2;window(a,q.f,u,1.8,2.2,2.6,white);arch(a,q.f,u,6.1,1.7,2.85,glass,white,.22);}}if(f.id==='way/554250271'){const q=mainFace(f,base,.22,-.98);gable(a,q.f,-q.length*.24,9.6,8.5,3.5,white,true);sign(a,q.f,'青岛啤酒博物馆','TSINGTAO BEER MUSEUM',0,4.3,18,1.5);}}
    // Add a chimney only if a surveyed OSM chimney node is actually available; never invent a factory location.
    for(const n of data.nodes||[]){const p:P=n.point||n.position;if(!p||n.tags?.man_made!=='chimney'||Math.hypot(p[0]-2285,p[1]-2068)>250)continue;const base=height(...p),segments=16;for(let i=0;i<segments;i++){const aa=i*Math.PI*2/segments,bb=(i+1)*Math.PI*2/segments;a.b(brick).quad(new Vector3(p[0]+Math.cos(aa)*2.2,base,p[1]+Math.sin(aa)*2.2),new Vector3(p[0]+Math.cos(aa)*1.3,base+30,p[1]+Math.sin(aa)*1.3),new Vector3(p[0]+Math.cos(bb)*1.3,base+30,p[1]+Math.sin(bb)*1.3),new Vector3(p[0]+Math.cos(bb)*2.2,base,p[1]+Math.sin(bb)*2.2),new Vector3(Math.cos((aa+bb)/2),0,Math.sin((aa+bb)/2)));}}
    addView(a,brewery.flatMap(f=>f.polygon),maxbase,162,-1.5);a.finish();}

  const campusIds=['way/403383413','way/556464162','way/541881283'];
  const campus=features.filter(f=>campusIds.includes(f.id));
  if(campus.length){const a=new Asset('campus','中国海洋大学鱼山校区 · 历史楼群','https://news.ouc.edu.cn/2009/0424/c90a71904/page.htm');let basecampus=0;for(const f of campus){const military=f.id==='way/541881283',eave=military?7.8:10.8,base=foundation(a,f,eave,military?stone:white);basecampus=Math.max(basecampus,base);footprintRoof(a.b(roof),f.polygon,base+eave,military?5.8:6);cornices(a,f,base,eave,military?4.1:5.6);for(const q of faces(f.polygon,base)){if(q.length<5)continue;const count=Math.max(1,Math.floor(q.length/(military?3.3:4.5))),step=q.length/count;for(let k=0;k<count;k++){const u=(k+.5)*step-q.length/2;window(a,q.f,u,1.7,military?1.0:1.7,military?1.6:2.4);if(!military)arch(a,q.f,u,6.4,1.75,3.3,glass,pale,.24);else window(a,q.f,u,5.0,1,1.65);}}
      const q=mainFace(f,base,-.90,-.44),fac=q.f;if(!military&&q.length>15){const gw=Math.min(16,q.length*.60);gable(a,fac,0,10.6,gw,5.4,white,true);for(const u of [-gw*.25,0,gw*.25]){arch(a,fac,u,5.6,Math.min(2.4,gw*.14),5.35,white,pale,.32);window(a,fac,u,6.3,1.3,2.1);}for(const u of [-gw/2,gw/2])rect(a.b(pale),fac,u,1.8,.55,9.1,.3);window(a,fac,0,11.5,1.5,2.8);}
      const label=military?'闻一多故居':f.id==='way/403383413'?'六二楼':'胜利楼';sign(a,fac,label,'OCEAN UNIVERSITY OF CHINA',0,military?3.7:4.9,military?3:4.6,.9);}
    const main=campus.find(f=>f.id==='way/403383413')!;if(main)addView(a,main.polygon,Math.max(...main.polygon.map(p=>height(...p))),236,-2.28);else addView(a,campus[0].polygon,basecampus,160);a.finish();}

  const mappedWall=(data.paths||[]).find((f:any)=>f.id==='way/556455087');
  if(mappedWall?.points?.length){const a=new Asset('redwall','大学路 · 鱼山路红墙','https://www.qingdaonews.com/app/content/2023-06/16/content_23456273.htm'),pts:P[]=mappedWall.points;a.ids.push(mappedWall.id);
    for(let j=0;j<pts.length-1;j++){const start=pts[j],end=pts[j+1],length=Math.hypot(end[0]-start[0],end[1]-start[1]),ux=(end[0]-start[0])/length,uz=(end[1]-start[1])/length,steps=Math.ceil(length/5);for(let k=0;k<steps;k++){const t0=k/steps,t1=(k+1)/steps,p0:P=[start[0]+(end[0]-start[0])*t0,start[1]+(end[1]-start[1])*t0],p1:P=[start[0]+(end[0]-start[0])*t1,start[1]+(end[1]-start[1])*t1],h0=height(...p0),h1=height(...p1);for(const side of [-1,1]){const f:Face={x:(p0[0]+p1[0])/2,z:(p0[1]+p1[1])/2,ux,uz,nx:uz*side,nz:-ux*side,base:0},v=(p:P,y:number,d:number)=>new Vector3(p[0]+f.nx*d,y,p[1]+f.nz*d),normal=new Vector3(f.nx,0,f.nz);for(const [m,y0,y1] of [[stone,0,.55],[wallRed,.55,2.65],[white,2.65,2.83]] as [StandardMaterial,number,number][])a.b(m).quad(v(p0,h0+y0,.24),v(p0,h0+y1,.24),v(p1,h1+y1,.24),v(p1,h1+y0,.24),normal);a.b(gold).quad(v(p0,h0+2.83,.45),v(p0,h0+3.15,0),v(p1,h1+3.15,0),v(p1,h1+2.83,.45),UP,[[0,0],[0,1],[length/steps/.28,1],[length/steps/.28,0]]);a.collision.quad(v(p0,h0,.25),v(p0,h0+3,.25),v(p1,h1+3,.25),v(p1,h1,.25),normal);}
        const count=Math.ceil(length/steps/.32);for(let n=0;n<count;n++){const t=(k+(n+.5)/count)/steps,x=start[0]+(end[0]-start[0])*t,z=start[1]+(end[1]-start[1])*t,y=height(x,z);for(const s of [-1,1]){const cx=x+uz*s*.39,cz=z-ux*s*.39,normal=new Vector3(uz*s,0,-ux*s);for(let q=0;q<8;q++){const aa=q*Math.PI/4,bb=(q+1)*Math.PI/4;a.b(gold,true).tri(new Vector3(cx,y+2.83,cz),new Vector3(cx+ux*Math.cos(aa)*.12,y+2.83+Math.sin(aa)*.12,cz+uz*Math.cos(aa)*.12),new Vector3(cx+ux*Math.cos(bb)*.12,y+2.83+Math.sin(bb)*.12,cz+uz*Math.cos(bb)*.12),normal);}}}}
    }
    // The photographed street junction is at the western endpoint, beside OSM road node [898.426,96.371].
    // The surveyed wall is open: add only a 4 m photographed return, not an invented closed 44 m wall.
    const corner=pts[0],returnEnd=pts.at(-1)!,returnLength=Math.hypot(returnEnd[0]-corner[0],returnEnd[1]-corner[1]),rx=(returnEnd[0]-corner[0])/returnLength,rz=(returnEnd[1]-corner[1])/returnLength,base=height(...corner),cx=corner[0]+rx*2,cz=corner[1]+rz*2,returnPlan:P[]=[[corner[0]+rz*.24,corner[1]-rx*.24],[corner[0]-rz*.24,corner[1]+rx*.24],[corner[0]+rx*4-rz*.24,corner[1]+rz*4+rx*.24],[corner[0]+rx*4+rz*.24,corner[1]+rz*4-rx*.24]];
    extrude(a.b(stone),returnPlan,base,base+.55);extrude(a.b(wallRed),returnPlan,base+.55,base+2.65);extrude(a.b(white),returnPlan,base+2.65,base+2.83);a.b(gold).box(cx,base+2.97,cz,4,.30,.75,Math.atan2(rz,rx));extrude(a.collision,returnPlan,base,base+3);a.b(gold).box(corner[0],base+3.16,corner[1],.50,.30,.50);
    for(const [end,name,english] of [[pts[1],'大学路','DAXUE ROAD'],[returnEnd,'鱼山路','YUSHAN ROAD']] as [P,string,string][]){const l=Math.hypot(end[0]-corner[0],end[1]-corner[1]),ux=(end[0]-corner[0])/l,uz=(end[1]-corner[1])/l,x=corner[0]+ux*2.1,z=corner[1]+uz*2.1;for(const s of [-1,1])sign(a,{x,z,ux,uz,nx:uz*s,nz:-ux*s,base:height(x,z)},name,english,0,1.18,1.55,.72,false);}
    views.push({id:a.id,name:a.name,position:new Vector3(corner[0],height(...corner)+1.8,corner[1]),radius:35,alpha:-1.8,beta:1.25});a.finish();}
  return {meshes,collisionMeshes,excludedBuildingIds,views,setDetail(distance:number){for(const m of details)m.setEnabled(distance<2600);},dispose(){for(const m of meshes)m.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();}};
}
