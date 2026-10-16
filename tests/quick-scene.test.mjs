import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createQuickGeometry,quickScenePlugin} from '../scripts/quick-scene.mjs';

test('the independent preview embeds real metre coordinates, pier outline and landmark position',()=>{
 const data=JSON.parse(readFileSync('public/data/scene.json','utf8')),quick=createQuickGeometry();
 assert.equal(quick.vertices.length,quick.colors.length);assert.ok(quick.indices.length>0);assert.ok(quick.indices.every(i=>i>=0&&i<quick.vertices.length/3));
 assert.ok(quick.vertices.every(Number.isFinite));assert.ok(quick.buildings.length>30&&quick.buildings.length<=100);
 const pavilion=data.landmarks.find(p=>p.name==='回澜阁');assert.deepEqual(quick.pavilion,pavilion.position);
 const pier=data.piers.find(p=>p.name==='栈桥');
 for(const [x,z]of pier.polygon)assert.ok(quick.vertices.some((v,i)=>i%3===0&&v===Math.round(x)&&quick.vertices[i+1]===4.16&&quick.vertices[i+2]===Math.round(z)));
});
test('first view and stylesheet are inline and run with every external program unavailable',()=>{
 const css='body{background:#123}',html=quickScenePlugin().transformIndexHtml.handler('<html><head><link rel="stylesheet" href="/assets/style.css"></head><body></body></html>',{bundle:{'assets/style.css':{type:'asset',source:css}}});
 assert.ok(html.includes('<style>'+css+'</style>'));assert.ok(!html.includes('rel="stylesheet"'));assert.ok(html.includes('quick-scene'));assert.ok(html.includes('requestAnimationFrame'));
 assert.ok(!html.includes('src="'));assert.ok(gzipSync(html).length<24576);
});
