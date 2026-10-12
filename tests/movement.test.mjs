import test from 'node:test';
import assert from 'node:assert/strict';
import { nextVerticalVelocity } from '../src/movement.ts';
test('unsupported stationary character accelerates downward instead of hovering',()=>{
 let v=0;for(let i=0;i<60;i++)v=nextVerticalVelocity(v,false,false,1/60);
 assert.ok(Math.abs(v+9.81)<1e-10);
});
test('landing settles and jump momentum is retained while leaving support',()=>{
 assert.equal(nextVerticalVelocity(-3,true,false,1/60),-.3);
 assert.equal(nextVerticalVelocity(0,true,true,1/60),5);
 assert.ok(nextVerticalVelocity(5,true,false,1/60)>4.8);
 assert.ok(nextVerticalVelocity(1,false,true,1/60)<1,'no mid-air jump');
});
