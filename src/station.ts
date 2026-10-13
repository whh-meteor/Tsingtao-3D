import { AbstractMesh, Color3, DynamicTexture, Mesh, Scene, ShadowGenerator, StandardMaterial, Texture, Vector3, VertexData } from './babylon';
import earcut from 'earcut';

type P=[number,number];
type StationFeature={id:string;name?:string;polygon:P[];height?:number;tags?:Record<string,string>};
const UP=new Vector3(0,1,0);

/** 2008-era U-shaped Qingdao Station. Plan geometry is OSM, architectural detail is photo-derived. */
export function buildStation(scene:Scene,data:any,shadows:ShadowGenerator,sampleHeight:(x:number,z:number)=>number){
  const features:StationFeature[]=(data.buildings||[]).filter((f:StationFeature)=>['way/1465995439','way/1465995440','way/1465995441'].includes(f.id));
  const excludedIds=new Set<string>(features.map(f=>f.id));
  const mappedCanopy:StationFeature|undefined=(data.buildings||[]).find((f:StationFeature)=>f.id==='way/1530312334');if(mappedCanopy)excludedIds.add(mappedCanopy.id);
  const meshes:AbstractMesh[]=[],collisionMeshes:AbstractMesh[]=[],materials:StandardMaterial[]=[],textures:Texture[]=[];
  if(features.length<2)return {meshes,collisionMeshes,position:new Vector3(-780,15,420),excludedIds,dispose(){}};
  const elevation=(x:number,z:number)=>{const h=sampleHeight(x,z);return Number.isFinite(h)?h:2.4;};
  // The real station sits on a graded platform; keep one level architectural datum above DEM's coarse samples.
  const base=Math.max(...features.flatMap(f=>f.polygon.map(p=>elevation(...p))))+.12;
  const position=new Vector3(-771,base+13,411);
  const mat=(name:string,c:string)=>{const m=new StandardMaterial(`Qingdao Station · ${name}`,scene);m.diffuseColor=Color3.FromHexString(c);m.specularColor=new Color3(.025,.025,.025);m.useLogarithmicDepth=true;materials.push(m);return m;};
  const yellow=mat('ochre plaster','#dfcd93'),lightYellow=mat('light plaster relief','#eaddb5'),granite=mat('grey rough granite','#a19e93'),trim=mat('carved granite trim','#c8c4b5'),darkStone=mat('deep granite joints','#777970');
  const tile=mat('terracotta roofing','#ffffff'),roofEdge=mat('terracotta eaves and ridge','#95503d'),wood=mat('half timber accents','#62594b');
  const glass=mat('dark blue green window glass','#526b67'),windowFrame=mat('sage green window frames','#707e68'),metal=mat('rainwater pipes and iron railings','#59645b'),canopy=mat('modern station platform canopy','#c4d0cd');
  const clockMat=mat('four clock faces','#ffffff'),signMat=mat('station signs','#ffffff'),gold=mat('spire and station star','#bfa272');
  const texture=(name:string,size:number,paint:(c:CanvasRenderingContext2D)=>void)=>{const t=new DynamicTexture(name,{width:size,height:size},scene,true,Texture.TRILINEAR_SAMPLINGMODE);paint(t.getContext() as CanvasRenderingContext2D);t.update(false);t.anisotropicFilteringLevel=8;t.wrapU=t.wrapV=Texture.WRAP_ADDRESSMODE;textures.push(t);return t;};
  tile.diffuseTexture=texture('Original procedural station roof tiles',256,c=>{c.fillStyle='#af6350';c.fillRect(0,0,256,256);for(let row=0;row<16;row++){const offset=row%2?8:0;for(let col=-1;col<17;col++){const x=col*16+offset,y=row*16;c.fillStyle=['#b56852','#ad5d49','#ba7159'][(col+row+30)%3];c.fillRect(x+1,y+1,14,14);c.fillStyle='rgba(68,39,25,.24)';c.fillRect(x,y+14,16,2);c.fillStyle='rgba(255,219,167,.16)';c.fillRect(x+1,y+2,2,11);}}});
  granite.diffuseTexture=texture('Original procedural grey granite masonry',256,c=>{c.fillStyle='#bab8ae';c.fillRect(0,0,256,256);for(let row=0;row<8;row++)for(let col=-1;col<5;col++){const x=col*64+(row%2?32:0),y=row*32;c.fillStyle=['#c1bfb5','#b5b3ab','#bcb9ae'][(row+col+10)%3];c.fillRect(x+1,y+1,62,30);c.fillStyle='rgba(85,84,76,.20)';c.fillRect(x,y+30,64,2);}});
  clockMat.diffuseTexture=texture('Original station Roman numeral clock dial',512,c=>{c.fillStyle='#e8e4d3';c.fillRect(0,0,512,512);c.beginPath();c.arc(256,256,244,0,Math.PI*2);c.fillStyle='#36403b';c.fill();c.beginPath();c.arc(256,256,220,0,Math.PI*2);c.fillStyle='#eee9da';c.fill();c.textAlign='center';c.textBaseline='middle';c.font='bold 43px Georgia';c.fillStyle='#2e3936';const numerals=['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];for(let i=0;i<12;i++){const a=i*Math.PI/6-Math.PI/2;c.fillText(numerals[i],256+Math.cos(a)*177,256+Math.sin(a)*177);}c.strokeStyle='#263632';c.lineWidth=12;c.lineCap='round';c.beginPath();c.moveTo(256,256);c.lineTo(256,116);c.stroke();c.lineWidth=17;c.beginPath();c.moveTo(256,256);c.lineTo(171,198);c.stroke();c.beginPath();c.arc(256,256,17,0,Math.PI*2);c.fill();});
  signMat.diffuseTexture=texture('Original Qingdao Station title sign',512,c=>{c.fillStyle='#40574f';c.fillRect(0,0,512,512);c.strokeStyle='#d5c79c';c.lineWidth=9;c.strokeRect(12,140,488,236);c.fillStyle='#f1e7ca';c.textAlign='center';c.textBaseline='middle';c.font='bold 86px Microsoft YaHei, sans-serif';c.fillText('青 岛 站',256,240);c.font='25px Georgia';c.fillText('QINGDAO RAILWAY STATION',256,318);});
  glass.specularColor=new Color3(.28,.31,.27);glass.specularPower=70;

  class Batch{
    pos:number[]=[];uv:number[]=[];idx:number[]=[];
    constructor(public name:string,public material:StandardMaterial){}
    tri(a:Vector3,b:Vector3,c:Vector3,uv:[number,number][]=[[0,0],[1,0],[0,1]],normal?:Vector3){if(normal&&Vector3.Dot(Vector3.Cross(b.subtract(a),c.subtract(a)),normal)<0){[b,c]=[c,b];[uv[1],uv[2]]=[uv[2],uv[1]];}const i=this.pos.length/3;for(const v of [a,b,c])this.pos.push(v.x,v.y,v.z);for(const u of uv)this.uv.push(...u);this.idx.push(i,i+2,i+1);}
    quad(a:Vector3,b:Vector3,c:Vector3,d:Vector3,normal?:Vector3,uv:[number,number][]=[[0,0],[1,0],[1,1],[0,1]]){this.tri(a,b,c,[uv[0],uv[1],uv[2]],normal);this.tri(a,c,d,[uv[0],uv[2],uv[3]],normal);}
    box(x:number,y:number,z:number,w:number,h:number,d:number){const v=(a:number,b:number,c:number)=>new Vector3(x+a,y+b,z+c),a=w/2,b=h/2,c=d/2;this.quad(v(-a,b,-c),v(-a,b,c),v(a,b,c),v(a,b,-c),UP);this.quad(v(-a,-b,-c),v(-a,b,-c),v(a,b,-c),v(a,-b,-c),new Vector3(0,0,-1));this.quad(v(a,-b,c),v(a,b,c),v(-a,b,c),v(-a,-b,c),new Vector3(0,0,1));this.quad(v(-a,-b,c),v(-a,b,c),v(-a,b,-c),v(-a,-b,-c),new Vector3(-1,0,0));this.quad(v(a,-b,-c),v(a,b,-c),v(a,b,c),v(a,-b,c),new Vector3(1,0,0));}
    finish(kind:string,visible=true,cast=true){if(!this.pos.length)return undefined;const m=new Mesh(`Qingdao Station · ${this.name}`,scene),v=new VertexData();v.positions=this.pos;v.indices=this.idx;v.uvs=this.uv;const n:number[]=[];VertexData.ComputeNormals(this.pos,this.idx,n);v.normals=n;v.applyToMesh(m);m.material=this.material;m.metadata={kind,name:'青岛站',source:'OSM footprints + Qingdao Daily 2016 modern station photograph; architectural details photo-estimated',osmIds:[...excludedIds]};m.receiveShadows=true;m.isVisible=visible;m.freezeWorldMatrix();meshes.push(m);if(cast&&visible)shadows.addShadowCaster(m);return m;}
  }
  const plaster=new Batch('yellow masonry station walls',yellow),relief=new Batch('plaster panels and pediments',lightYellow),stone=new Batch('granite foundation and tower',granite),carved=new Batch('arch frames and stone ornament',trim),joints=new Batch('carved stone shadow lines',darkStone),roof=new Batch('red tiled station roof',tile),ridges=new Batch('roof ridges and eaves',roofEdge),timber=new Batch('historic gable timber accents',wood),panes=new Batch('arched windows and entrances',glass),frames=new Batch('window mullions',windowFrame),iron=new Batch('metal detail',metal),modern=new Batch('platform and concourse canopy',canopy),clocks=new Batch('clock dials',clockMat),signs=new Batch('entrance station plaques',signMat),finial=new Batch('clock tower finial',gold),collision=new Batch('simplified station collision',yellow);
  const ring=(p:P[])=>p.length>2&&Math.hypot(p[0][0]-p.at(-1)![0],p[0][1]-p.at(-1)![1])<.01?p.slice(0,-1):p;
  const polygonTop=(b:Batch,p:P[],y:number)=>{p=ring(p);const coords=p.flat(),ids=earcut(coords,undefined,2);for(let i=0;i<ids.length;i+=3)b.tri(...ids.slice(i,i+3).map(k=>new Vector3(coords[k*2],y,coords[k*2+1])) as [Vector3,Vector3,Vector3],undefined,UP);};
  const extrude=(b:Batch,p:P[],bottom:number,top:number)=>{p=ring(p);let a=0;for(let i=0;i<p.length;i++)a+=p[i][0]*p[(i+1)%p.length][1]-p[(i+1)%p.length][0]*p[i][1];for(let i=0;i<p.length;i++){let v=p[i],w=p[(i+1)%p.length];if(a<0)[v,w]=[w,v];const normal=new Vector3(w[1]-v[1],0,v[0]-w[0]);b.quad(new Vector3(v[0],bottom,v[1]),new Vector3(v[0],top,v[1]),new Vector3(w[0],top,w[1]),new Vector3(w[0],bottom,w[1]),normal,[[v[0]/2+v[1]/2,bottom],[v[0]/2+v[1]/2,top],[w[0]/2+w[1]/2,top],[w[0]/2+w[1]/2,bottom]]);}polygonTop(b,p,top);};
  for(const f of features){const museum=f.id==='way/1465995440',h=museum?10.7:12.5;extrude(stone,f.polygon,Math.min(base-1,...f.polygon.map(p=>elevation(...p)-.3)),base+2.8);extrude(plaster,f.polygon,base+2.8,base+h);extrude(collision,f.polygon,base-1,base+h);}
  // Ridge direction follows the nearly cardinal measured OSM wings, rather than a generic hip roof.
  const gableRoof=(x:number,z:number,w:number,d:number,eave:number,rise:number,alongZ=true)=>{
    const p=(u:number,v:number,h:number)=>new Vector3(x+(alongZ?u:v),base+h,z+(alongZ?v:u));
    roof.quad(p(-w/2,-d/2,eave),p(0,-d/2,eave+rise),p(0,d/2,eave+rise),p(-w/2,d/2,eave),UP,[[0,0],[w/2/.45,rise/.26],[w/2/.45,(d+rise)/.26],[0,d/.26]]);
    roof.quad(p(0,-d/2,eave+rise),p(w/2,-d/2,eave),p(w/2,d/2,eave),p(0,d/2,eave+rise),UP,[[0,0],[w/2/.45,rise/.26],[w/2/.45,(d+rise)/.26],[0,d/.26]]);
    for(const side of [-1,1])relief.tri(p(-w/2,side*d/2,eave),p(w/2,side*d/2,eave),p(0,side*d/2,eave+rise),undefined,new Vector3(alongZ?0:side,0,alongZ?side:0));
    if(alongZ){ridges.box(x,base+eave+rise+.1,z,.38,.35,d+.5);for(const s of [-1,1])ridges.box(x+s*w/2,base+eave,z,.55,.3,d+.8);}else{ridges.box(x,base+eave+rise+.1,z,d+.5,.35,.38);for(const s of [-1,1])ridges.box(x,base+eave,z+s*w/2,d+.8,.3,.55);}
  };
  gableRoof(-710.6,466,28,183,12.5,9.64);gableRoof(-859.7,439,28,228,12.5,9.64);gableRoof(-790,313.2,28,135,12.5,9.64,false);gableRoof(-703,349.8,22,43,10.7,7.2);
  type Face={x:number;z:number;ux:number;uz:number;nx:number;nz:number};
  const east:Face={x:-697.65,z:0,ux:0,uz:1,nx:1,nz:0},west:Face={x:-872.4,z:0,ux:0,uz:-1,nx:-1,nz:0},south:Face={x:0,z:300.8,ux:1,uz:0,nx:0,nz:-1};
  const vertex=(f:Face,u:number,y:number,depth=.1)=>new Vector3(f.x+f.ux*u+f.nx*depth,base+y,f.z+f.uz*u+f.nz*depth);
  const rect=(b:Batch,f:Face,u:number,y:number,w:number,h:number,depth=.16)=>b.quad(vertex(f,u-w/2,y,depth),vertex(f,u+w/2,y,depth),vertex(f,u+w/2,y+h,depth),vertex(f,u-w/2,y+h,depth),new Vector3(f.nx,0,f.nz),b===signs?[[0,1],[1,1],[1,0],[0,0]]:undefined);
  const bar=(b:Batch,f:Face,u:number,y:number,w:number,h:number,depth=.25)=>rect(b,f,u,y,w,h,depth);
  const arch=(f:Face,u:number,y:number,w:number,h:number,entrance=false)=>{
    const r=w/2,spring=y+h-r,n=new Vector3(f.nx,0,f.nz),depth=.18;
    rect(panes,f,u,y,w,h-r,depth);for(let i=0;i<18;i++){const a=i*Math.PI/18,b=(i+1)*Math.PI/18;panes.tri(vertex(f,u,spring,depth),vertex(f,u+Math.cos(a)*r,spring+Math.sin(a)*r,depth),vertex(f,u+Math.cos(b)*r,spring+Math.sin(b)*r,depth),undefined,n);const ro=r+.28;carved.quad(vertex(f,u+Math.cos(a)*r,spring+Math.sin(a)*r,.26),vertex(f,u+Math.cos(a)*ro,spring+Math.sin(a)*ro,.26),vertex(f,u+Math.cos(b)*ro,spring+Math.sin(b)*ro,.26),vertex(f,u+Math.cos(b)*r,spring+Math.sin(b)*r,.26),n);}
    for(const side of [-1,1])bar(carved,f,u+side*(r+.14),y,.28,h-r,.26);bar(frames,f,u,y,.12,h,.29);bar(frames,f,u,spring-.2,w,.12,.29);bar(frames,f,u,y+1.8,w,.11,.29);if(entrance)for(const side of [-1,1])bar(frames,f,u+side*w*.25,y,.09,h-r,.29);
    bar(carved,f,u,y-.22,w+.7,.2,.28);
  };
  const window=(f:Face,u:number,y:number,w=2.3,h=3.1)=>{rect(panes,f,u,y,w,h,.17);for(const s of [-1,1])bar(carved,f,u+s*(w/2+.13),y-.13,.26,h+.26,.26);bar(carved,f,u,y+h,w+.52,.28,.26);bar(carved,f,u,y-.15,w+.75,.26,.32);bar(frames,f,u,y,.12,h,.30);bar(frames,f,u,y+h*.56,w,.1,.30);};
  const wingFacade=(f:Face,start:number,end:number,step:number)=>{for(let u=start;u<end;u+=step){let front=f;if(f===east&&((u>422&&u<441)||(u>494&&u<513)))front={...f,x:-693.96};if(f===west&&((-u>339&&-u<358)||(-u>411&&-u<430)||(-u>482&&-u<501)))front={...f,x:-876.65};if(f===south&&u>-805.4&&u<-783)front={...f,z:296.65};arch(front,u,1.0,4.0,6.4);window(front,u,8.7,2.3,2.65);bar(relief,front,u+step/2,2.8,.48,9.7,.13);}rect(carved,f,(start+end)/2,8.1,end-start+step,.3,.23);rect(carved,f,(start+end)/2,12.35,end-start+step,.38,.34);};
  wingFacade(east,388,550,9.8);wingFacade(west,-542,-333,10);wingFacade(south,-841,-731,9.8);
  // Historical retained clock/museum façade: exactly three portal arches, with a central decorated gable.
  const historic:Face={x:-693.27,z:0,ux:0,uz:1,nx:1,nz:0};for(const u of [339,346.7,354.4])arch(historic,u,.8,4.8,6.3,true);for(const u of [333,340,347,354,361])arch(historic,u,8,2.25,3.0);rect(carved,historic,347,7.7,36,.32,.32);
  const gableFace:Face={...historic,x:-693.10};relief.tri(vertex(gableFace,338,10.7,.16),vertex(gableFace,356,10.7,.16),vertex(gableFace,347,18.3,.16),undefined,new Vector3(1,0,0));
  const diagonal=(b:Batch,f:Face,u1:number,y1:number,u2:number,y2:number,width:number,depth=.31)=>{const du=u2-u1,dy=y2-y1,l=Math.hypot(du,dy),a=-dy/l*width/2,c=du/l*width/2;b.quad(vertex(f,u1+a,y1+c,depth),vertex(f,u1-a,y1-c,depth),vertex(f,u2-a,y2-c,depth),vertex(f,u2+a,y2+c,depth),new Vector3(f.nx,0,f.nz));};
  diagonal(carved,gableFace,338,10.7,347,18.3,.48);diagonal(carved,gableFace,347,18.3,356,10.7,.48);window(gableFace,347,12.2,2.8,3.6);bar(carved,gableFace,347,17.3,2,.45,.37);
  // Restrained historic half-timber subdivisions beneath the entrance gable; the 2016 exterior is mainly stone/plaster.
  bar(timber,gableFace,342,11.2,.18,2.3,.35);bar(timber,gableFace,352,11.2,.18,2.3,.35);diagonal(timber,gableFace,341.8,11.2,345.3,14,.16,.35);diagonal(timber,gableFace,348.7,14,352.2,11.2,.16,.35);
  rect(signs,historic,347,7.1,9,1.4,.48);
  // East and west central entrance pavilions with tall gables and shallow projecting façades.
  for(const spec of [{f:{...east,x:-693.96},u:431.8},{f:{...west,x:-876.65},u:-418.8}]){const {f,u}=spec;rect(relief,f,u,0,18,15,.45);for(const s of [-1,0,1])arch({...f,x:f.x+f.nx*.48},u+s*5.1,.8,4.1,8.8,true);relief.tri(vertex(f,u-9,15,.45),vertex(f,u+9,15,.45),vertex(f,u,22,.45),undefined,new Vector3(f.nx,0,f.nz));diagonal(carved,f,u-9,15,u,22,.55,.54);diagonal(carved,f,u,22,u+9,15,.55,.54);window({...f,x:f.x+f.nx*.45},u,15.8,2.4,3.4);rect(signs,f,u,11.3,10.5,1.7,.57);}
  // Dormer windows, chimneys, gutters: batched details retain the long red-roofed silhouette from above.
  for(let z=389;z<553;z+=19){relief.box(-698.3,base+16.2,z,2.7,2.7,3.6);gableRoof(-698.3,z,4,4.4,17.55,1.55,false);window({...east,x:-696.3},z,15.2,2.25,1.95);}
  for(let x=-840;x<-736;x+=20){relief.box(x,base+16.2,300.6,3.6,2.7,2.7);gableRoof(x,300.6,4,4.4,17.55,1.55);window({...south,z:298.9},x,15.2,2.25,1.95);}
  for(const z of [400,479,543]){stone.box(-713,base+22.6,z,1.8,3.3,1.8);carved.box(-713,base+24.25,z,2.25,.35,2.25);}
  // Iconic southeast clock tower: yellow square shaft, four stone clock gables, red tapered spire.
  const tx=-703.5,tz=322.0,tw=12.2;
  stone.box(tx,base+4.6,tz,tw,9.2,tw);plaster.box(tx,base+15.75,tz,tw,13.1,tw);carved.box(tx,base+22.8,tz,13.4,.75,13.4);plaster.box(tx,base+24.3,tz,12.1,2.2,12.1);
  collision.box(tx,base+12.5,tz,tw,25,tw);
  const towerFaces:Face[]=[{x:tx+tw/2,z:tz,ux:0,uz:1,nx:1,nz:0},{x:tx-tw/2,z:tz,ux:0,uz:-1,nx:-1,nz:0},{x:tx,z:tz-tw/2,ux:1,uz:0,nx:0,nz:-1},{x:tx,z:tz+tw/2,ux:-1,uz:0,nx:0,nz:1}];
  for(const f of towerFaces){for(const u of [-2.8,0,2.8])window(f,u,21.0,.95,1.25);for(const u of [-2.3,1.2])window(f,u,10.3,.9,4.1);window(f,-1.3,17.1,1.4,2.3);
    relief.tri(vertex(f,-6.5,24.8,.24),vertex(f,6.5,24.8,.24),vertex(f,0,31.1,.24),undefined,new Vector3(f.nx,0,f.nz));diagonal(carved,f,-6.5,24.8,0,31.1,.47,.34);diagonal(carved,f,0,31.1,6.5,24.8,.47,.34);
    const center=vertex(f,0,27.0,.40),normal=new Vector3(f.nx,0,f.nz),r=1.95;for(let i=0;i<64;i++){const a=i*Math.PI*2/64,b=(i+1)*Math.PI*2/64;const va=vertex(f,Math.cos(a)*r,27+Math.sin(a)*r,.40),vb=vertex(f,Math.cos(b)*r,27+Math.sin(b)*r,.40);clocks.tri(center,va,vb,[[.5,.5],[.5+Math.cos(a)*.5,.5-Math.sin(a)*.5],[.5+Math.cos(b)*.5,.5-Math.sin(b)*.5]],normal);}
    for(let i=0;i<24;i++){const a=i*Math.PI*2/24,b=(i+1)*Math.PI*2/24;carved.quad(vertex(f,Math.cos(a)*2.0,27+Math.sin(a)*2.0,.44),vertex(f,Math.cos(a)*2.27,27+Math.sin(a)*2.27,.44),vertex(f,Math.cos(b)*2.27,27+Math.sin(b)*2.27,.44),vertex(f,Math.cos(b)*2.0,27+Math.sin(b)*2.0,.44),normal);}
  }
  const pyramid=(half:number,y:number,top:number)=>{const p=[new Vector3(tx-half,base+y,tz-half),new Vector3(tx+half,base+y,tz-half),new Vector3(tx+half,base+y,tz+half),new Vector3(tx-half,base+y,tz+half)],tip=new Vector3(tx,base+top,tz);for(let i=0;i<4;i++)roof.tri(p[i],p[(i+1)%4],tip,[[0,0],[half*2/.45,0],[half/.45,(top-y)/.26]],UP);};
  pyramid(5.4,25.4,32.8);pyramid(2.1,31.6,34.5);finial.box(tx,base+34.64,tz,.12,.58,.12);
  // A five-point red star is visible in the inspected modern reference photo.
  const starFace:Face={x:tx,z:tz,ux:0,uz:1,nx:1,nz:0};for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,b=Math.PI/2+(i+1)*Math.PI/5,ra=i%2?.20:.47,rb=(i+1)%2?.20:.47;ridges.tri(vertex(starFace,0,35,0),vertex(starFace,Math.cos(a)*ra,35+Math.sin(a)*ra,0),vertex(starFace,Math.cos(b)*rb,35+Math.sin(b)*rb,0),undefined,new Vector3(1,0,0));}
  // OSM's actual 467 m platform canopy outline is a roof, not a solid terminal building.
  // Tagged min_height=22, roof:height=4, roof:shape=round constrain the crown profile.
  if(mappedCanopy){const p=ring(mappedCanopy.polygon),coords=p.flat(),ids=earcut(coords,undefined,2),xmin=Math.min(...p.map(q=>q[0])),xmax=Math.max(...p.map(q=>q[0])),xc=(xmin+xmax)/2,half=(xmax-xmin)/2;
    const crown=(x:number)=>base+22+4*Math.sqrt(Math.max(0,1-((x-xc)/half)**2));
    const emit=(a:Vector3,b:Vector3,c:Vector3,depth=0)=>{const edges=[Vector3.DistanceSquared(a,b),Vector3.DistanceSquared(b,c),Vector3.DistanceSquared(c,a)],long=Math.max(...edges);if(long>20*20&&depth<12){const i=edges.indexOf(long),vs=[a,b,c],v=vs[i],w=vs[(i+1)%3],r=vs[(i+2)%3],m=v.add(w).scale(.5);emit(v,m,r,depth+1);emit(m,w,r,depth+1);return;}a.y=crown(a.x);b.y=crown(b.x);c.y=crown(c.x);modern.tri(a,b,c,undefined,UP);};
    for(let i=0;i<ids.length;i+=3)emit(...ids.slice(i,i+3).map(k=>new Vector3(coords[k*2],0,coords[k*2+1])) as [Vector3,Vector3,Vector3]);
    // Only roof-edge strips are shown; platform count and underground layout are not fabricated.
    for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];modern.quad(new Vector3(a[0],crown(a[0])-.3,a[1]),new Vector3(a[0],crown(a[0]),a[1]),new Vector3(b[0],crown(b[0]),b[1]),new Vector3(b[0],crown(b[0])-.3,b[1]),new Vector3(b[1]-a[1],0,a[0]-b[0]));}
  }
  modern.box(-784,base+11.7,431.8,145,.5,13.5);for(const z of [425.1,438.5])iron.box(-784,base+12.1,z,145,.15,.15);
  for(const f of [east,south])for(let u=f===east?385:-850;u<(f===east?551:-728);u+=29){rect(iron,f,u,0,.14,12.4,.44);}
  // Coarse foundation steps around the retained façade, kept within OSM station footprint vicinity.
  for(let i=0;i<4;i++)carved.box(-691.3+i*.4,base+.12+i*.14,346.5,.8,.22,26);
  for(const b of [plaster,relief,stone,carved,joints,roof,ridges,timber,panes,frames,iron,modern,clocks,signs,finial])b.finish('station-landmark');
  const cm=collision.finish('station-collision',false,false);if(cm)collisionMeshes.push(cm);
  return {meshes,collisionMeshes,position,excludedIds,dispose(){for(const m of meshes)m.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();}};
}
