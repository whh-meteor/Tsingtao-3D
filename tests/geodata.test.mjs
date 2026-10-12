import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../public/data/scene.json',import.meta.url),'utf8'));
function inside([x,z],polygon){let result=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const [xi,zi]=polygon[i],[xj,zj]=polygon[j];if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)result=!result;}return result;}
const onLand=p=>data.land.some(l=>inside(p,l.polygon)&&!(l.holes||[]).some(h=>inside(p,h)));
test('coastline polygonization preserves land, island and open bay',()=>{
 assert.ok(onLand([-343,410]),'Qingdao station area must be land');
 assert.ok(onLand([221.55,-776.36]),'Xiaoqingdao lighthouse must lie on land');
 assert.equal(onLand([-300,-1150]),false,'open bay must remain sea');
});
test('Zhanqiao and Huilan pavilion use preserved source geometry',()=>{
 const p=data.piers.find(p=>p.name==='栈桥');assert.ok(p?.polygon.length>10);
 const pavilion=data.landmarks.find(p=>p.name==='回澜阁');
 assert.ok(Math.abs(pavilion.position[0]+81.69)<.1);assert.ok(Math.abs(pavilion.position[1]+223.40)<.1);
 assert.ok(inside(pavilion.position,p.polygon));
 const extent=Math.max(...p.polygon.map(p=>p[1]))-Math.min(...p.polygon.map(p=>p[1]));assert.ok(extent>380&&extent<430);
});
test('height estimates and metric projection are explicitly represented',()=>{
 assert.match(data.metadata.projection,/proj=aeqd/);
 assert.ok(data.buildings.length>1000);
 assert.ok(data.buildings.every(b=>Number.isFinite(b.height)&&b.height>0&&typeof b.estimatedHeight==='boolean'));
 assert.equal(data.metadata.license,'ODbL 1.0');
});
