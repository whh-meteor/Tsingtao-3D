import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectStartupGraph} from '../scripts/startup-graph.mjs';
function chunk(fileName,{imports=[],modules=['src/bootstrap.ts'],isEntry=false,code='ready()'}={}){return{type:'chunk',fileName,isEntry,imports,code,modules:Object.fromEntries(modules.map(id=>[id,{}]))};}

test('production startup rejects a small entry whose shared helper hides in the engine',()=>{
 const bundle={'entry.js':chunk('entry.js',{isEntry:true,imports:['helper.js']}),'helper.js':chunk('helper.js',{imports:['engine.js']}),'engine.js':chunk('engine.js',{modules:['node_modules/@babylonjs/core/scene.js','\0vite/preload-helper.js']})};
 assert.throws(()=>inspectStartupGraph(bundle),/静态依赖三维引擎/);
});
test('the independent startup may load the engine dynamically without waiting for it',()=>{
 const entry=chunk('entry.js',{isEntry:true,code:'import("./engine.js")'});entry.dynamicImports=['engine.js'];
 assert.deepEqual(inspectStartupGraph({'entry.js':entry,'engine.js':chunk('engine.js',{modules:['node_modules/@babylonjs/core/scene.js']})}),{files:['entry.js'],bytes:Buffer.byteLength(entry.code)});
});
test('startup budget counts every transitive static dependency',()=>{
 assert.throws(()=>inspectStartupGraph({'entry.js':chunk('entry.js',{isEntry:true,imports:['shared.js'],code:'a'.repeat(13000)}),'shared.js':chunk('shared.js',{code:'b'.repeat(13000)})}),/超过24 KiB/);
});
