import { ArcRotateCamera, Matrix, Scene, Vector3 } from './babylon';

/** Intersect the map's horizontal focus plane, keeping drag speed in real metres. */
export function intersectMapPlane(origin:{x:number;y:number;z:number},direction:{x:number;y:number;z:number},height:number){
 if(direction.y>=-1e-6)return null;
 const t=(height-origin.y)/direction.y;
 return t>0&&Number.isFinite(t)?{x:origin.x+direction.x*t,z:origin.z+direction.z*t}:null;
}
export function zoomRadius(radius:number,pixels:number,min:number,max:number){return Math.max(min,Math.min(max,radius*Math.exp(Math.max(-500,Math.min(500,pixels))*.0018)));}

export function attachMapControls(canvas:HTMLCanvasElement,scene:Scene,camera:ArcRotateCamera,options:{enabled:()=>boolean;onGestureStart:()=>void;onPick:(x:number,y:number)=>void}){
 let drag:{id:number;startX:number;startY:number;lastX:number;lastY:number;height:number;anchor:{x:number;z:number}|null;moved:boolean}|null=null;
 let zoom:{radius:number;x:number;y:number;height:number;anchor:{x:number;z:number}|null}|null=null;
 const point=(x:number,y:number,height:number)=>{camera.getViewMatrix(true);const r=scene.createPickingRay(x,y,Matrix.Identity(),camera);return intersectMapPlane(r.origin,r.direction,height);};
 const local=(e:{clientX:number;clientY:number})=>{const b=canvas.getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top};};
 const flush=()=>{camera.inertialAlphaOffset=0;camera.inertialBetaOffset=0;camera.inertialRadiusOffset=0;camera.inertialPanningX=0;camera.inertialPanningY=0;};
 const anchorAt=(anchor:{x:number;z:number}|null,x:number,y:number,height:number)=>{if(!anchor)return;const q=point(x,y,height);if(q)camera.setTarget(camera.target.add(new Vector3(anchor.x-q.x,0,anchor.z-q.z)),false,true,true);};
 const down=(e:PointerEvent)=>{
  if(!options.enabled())return;
  options.onGestureStart();zoom=null;
  if(e.pointerType==='touch'||e.button!==0)return;
  e.preventDefault();e.stopImmediatePropagation();flush();
  const p=local(e);drag={id:e.pointerId,startX:p.x,startY:p.y,lastX:p.x,lastY:p.y,height:camera.target.y,anchor:point(p.x,p.y,camera.target.y),moved:false};
  canvas.setPointerCapture(e.pointerId);canvas.classList.add('map-dragging');
 };
 const move=(e:PointerEvent)=>{
  if(!drag||drag.id!==e.pointerId)return;
  e.preventDefault();e.stopImmediatePropagation();const p=local(e);
  drag.moved ||= Math.hypot(p.x-drag.startX,p.y-drag.startY)>5;
  if(drag.anchor)anchorAt(drag.anchor,p.x,p.y,drag.height);
  else{const scale=2*camera.radius*Math.tan(camera.fov/2)/canvas.clientHeight,dx=(p.x-drag.lastX)*scale,dy=(p.y-drag.lastY)*scale/Math.max(.25,Math.cos(camera.beta));camera.setTarget(camera.target.add(new Vector3(-Math.sin(camera.alpha)*dx-Math.cos(camera.alpha)*dy,0,Math.cos(camera.alpha)*dx-Math.sin(camera.alpha)*dy)),false,true,true);}
  drag.lastX=p.x;drag.lastY=p.y;
 };
 const reset=()=>{if(drag&&canvas.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);drag=null;zoom=null;canvas.classList.remove('map-dragging');};
 const up=(e:PointerEvent)=>{
  if(!drag||drag.id!==e.pointerId)return;
  e.preventDefault();e.stopImmediatePropagation();const p=local(e),pick=!drag.moved&&e.type==='pointerup';
  reset();if(pick)options.onPick(p.x,p.y);
 };
 const wheel=(e:WheelEvent)=>{
  if(!options.enabled())return;
  e.preventDefault();e.stopImmediatePropagation();options.onGestureStart();flush();
  const p=local(e),pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1),height=camera.target.y;
  zoom={radius:zoomRadius(zoom?.radius??camera.radius,pixels,camera.lowerRadiusLimit??20,camera.upperRadiusLimit??190000),...p,height,anchor:point(p.x,p.y,height)};
 };
 const context=(e:Event)=>e.preventDefault();
 canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);canvas.addEventListener('pointerup',up,true);canvas.addEventListener('pointercancel',up,true);canvas.addEventListener('wheel',wheel,{capture:true,passive:false});canvas.addEventListener('contextmenu',context);
 return {reset,update(dt:number){
  if(!options.enabled()){if(drag||zoom)reset();return;}
  canvas.classList.add('map-navigation');
  if(zoom){camera.radius+=(zoom.radius-camera.radius)*(1-Math.exp(-18*dt));anchorAt(zoom.anchor,zoom.x,zoom.y,zoom.height);if(Math.abs(camera.radius-zoom.radius)<Math.max(.01,zoom.radius*1e-5)){camera.radius=zoom.radius;anchorAt(zoom.anchor,zoom.x,zoom.y,zoom.height);zoom=null;}}
 },dispose(){reset();canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',move,true);canvas.removeEventListener('pointerup',up,true);canvas.removeEventListener('pointercancel',up,true);canvas.removeEventListener('wheel',wheel,true);canvas.removeEventListener('contextmenu',context);}};
}
