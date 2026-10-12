import test from 'node:test';
import assert from 'node:assert/strict';
import { chinaInstant, chinaDateParts, solarState } from '../src/solar.ts';

test('UTC+8 midnight rollover is independent of host timezone',()=>{
 assert.equal(chinaInstant('2026-10-12',0).toISOString(),'2026-10-11T16:00:00.000Z');
 assert.equal(chinaInstant('2026-10-12',12).toISOString(),'2026-10-12T04:00:00.000Z');
 assert.deepEqual(chinaDateParts(new Date('2026-10-11T16:30:00Z')),{date:'2026-10-12',hours:.5});
});
test('Qingdao noon is south and above the horizon; midnight has no sunlight',()=>{
 const noon=solarState(chinaInstant('2026-10-12',12));
 assert.ok(noon.altitude>40 && noon.altitude<55);
 assert.ok(noon.direction.z<0);
 assert.ok(solarState(chinaInstant('2026-10-12',0)).sunlight===0);
 assert.ok(Math.abs(Math.hypot(...Object.values(noon.direction))-1)<1e-12);
});
test('morning sunlight comes from east, afternoon from west',()=>{
 assert.ok(solarState(chinaInstant('2026-10-12',8)).direction.x>0);
 assert.ok(solarState(chinaInstant('2026-10-12',16)).direction.x<0);
});
