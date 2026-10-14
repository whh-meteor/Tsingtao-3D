import {Vector3} from './babylon';
/** Quantize light-space translation to shadow texels, preserving depth. */
export function stableShadowPosition(focus:Vector3,direction:Vector3,size=1300,resolution=2048){
 const d=direction.normalizeToNew(),ref=Math.abs(d.y)>.98?Vector3.Right():Vector3.Up(),right=Vector3.Cross(d,ref).normalize(),up=Vector3.Cross(right,d).normalize(),step=size/resolution;
 const x=Math.round(Vector3.Dot(focus,right)/step)*step,y=Math.round(Vector3.Dot(focus,up)/step)*step,z=Vector3.Dot(focus,d);
 return right.scale(x).add(up.scale(y)).add(d.scale(z+1100));
}
