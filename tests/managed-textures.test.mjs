import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/managed-textures.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'gpu',setup(build){build.onResolve({filter:/^\.\/babylon$/},()=>({path:'gpu',namespace:'test'}));build.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`export class Texture{constructor(url,scene,options){this.url=url;this.options=options;scene.textures.push(this);queueMicrotask(()=>scene.fail?options.onError('GPU upload failed'):options.onLoad());}}`}));}}]});
const {managedTextures}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
test('decoded source pixels upload independently for different UV transforms; GPU failure rejects readiness',async()=>{
 const image={decoding:'auto'},images={get:()=>image},bank=managedTextures(images),scene={textures:[]};
 const a=bank.create('/mask.png',scene,1),b=bank.create('/mask.png',scene,1);a.uOffset=1;b.uOffset=2;
 await bank.ready();assert.equal(a.options.buffer,image);assert.notEqual(a,b);assert.equal(b.uOffset,2);
 const bad=managedTextures(images);bad.create('/bad.png',{textures:[],fail:true},1);await assert.rejects(bad.ready(),/bad.png.*GPU/);
});
