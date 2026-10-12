import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {sampleGrid,sampleSurface} from '../src/height.ts';
const root=new URL('../public/',import.meta.url);
const region=JSON.parse(readFileSync(new URL('data/region.json',root)));
const heights=g=>{const bytes=readFileSync(new URL(g.file.slice(1),root));return new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));};
test('eight districts preserve metric coordinates and complete streaming files',()=>{
 assert.deepEqual(region.districts.map(d=>d.name).sort(),['市南区','市北区','李沧区','崂山区','城阳区','黄岛区','即墨区','胶州市'].sort());
 const index=JSON.parse(readFileSync(new URL('data/chunks/index.json',root)));
 assert.equal(index.totals.buildings,23758);
 assert.ok(index.chunks.every(c=>existsSync(new URL(c.file.slice(1),root))));
 assert.ok(region.bounds.maxX-region.bounds.minX>100000);
});
test('genuine DEM preserves Laoshan relief and north-to-south orientation',()=>{
 for(const g of [region.terrain,region.detailTerrain]){const a=heights(g);assert.equal(a.length,g.width*g.height);assert.ok(a.every(Number.isFinite));}
 const a=heights(region.terrain);
 assert.ok(sampleGrid(region.terrain,a,28000,12800)>1000);
 assert.ok(sampleGrid(region.terrain,a,-300,-1150)<2);
 assert.ok(Math.abs(sampleGrid(region.terrain,a,region.terrain.bounds.minX,region.terrain.bounds.maxZ)-a[0])<1e-5);
 assert.ok(Math.abs(sampleGrid(region.terrain,a,region.terrain.bounds.maxX,region.terrain.bounds.minZ)-a[a.length-1])<1e-5);
});
test('roads follow the rendered triangle surface on saddle slopes',()=>{
 const g={width:2,height:2,spacingX:100,spacingZ:100,bounds:{minX:0,maxX:100,minZ:0,maxZ:100}},a=new Float32Array([10,110,110,10]);
 assert.equal(sampleSurface(g,a,50,50),110);
 assert.equal(sampleGrid(g,a,50,50),60);
 assert.equal(sampleSurface(g,a,0,100),10);
});
