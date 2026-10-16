import {readFileSync} from 'node:fs';
import {buildSync} from 'esbuild';
import {gzipSync} from 'node:zlib';
import earcut from 'earcut';

// Build-time reduction of existing OSM/DEM. No extra request is needed to see land.
export function createQuickGeometry(){
 const data=JSON.parse(readFileSync('public/data/scene.json','utf8')),region=JSON.parse(readFileSync('public/data/region.json','utf8'));
 const grid=region.detailTerrain,heights=readFileSync('public'+grid.file);
 const sample=(x,z)=>{const c=Math.max(0,Math.min(grid.width-1,Math.round((x-grid.bounds.minX)/grid.spacingX))),r=Math.max(0,Math.min(grid.height-1,Math.round((grid.bounds.maxZ-z)/grid.spacingZ)));return Math.max(2.4,heights.readFloatLE((r*grid.width+c)*4));};
 const inside=(x,z,ring)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
 const reduce=ring=>ring.filter((p,i)=>i===0||i===ring.length-1||Math.hypot(p[0]-ring[i-1][0],p[1]-ring[i-1][1])>12||i%8===0);
 const vertices=[],indices=[],colors=[];
 function polygon(ring,y,color,holes=[],simplify=true){const rings=[ring,...holes].map(r=>simplify?reduce(r):r),points=rings.flat(),offset=vertices.length/3,starts=[];let n=rings[0].length;for(const h of rings.slice(1)){starts.push(n);n+=h.length;}for(const p of points){vertices.push(Math.round(p[0]),y,Math.round(p[1]));colors.push(...color);}indices.push(...earcut(points.flat(),starts).map(i=>i+offset));}
 for(const land of data.land)polygon(land.polygon,2.4,[.44,.57,.32],land.holes||[]);
 const tiles=[];
 for(let z=-1000;z<1900;z+=160)for(let x=-1800;x<2500;x+=160){const p=[[x,z],[x+160,z],[x,z+160],[x+160,z+160]];if(!p.every(q=>data.land.some(l=>inside(...q,l.polygon)&&!(l.holes||[]).some(h=>inside(...q,h)))))continue;const hs=p.map(q=>sample(...q));if(Math.max(...hs)<6)continue;tiles.push(...p.flatMap((q,i)=>[q[0],Math.round(hs[i]),q[1]]));}
 const cells=new Map(),buildings=[];
 for(const b of data.buildings){const xs=b.polygon.map(p=>p[0]),zs=b.polygon.map(p=>p[1]),x=(Math.min(...xs)+Math.max(...xs))/2,z=(Math.min(...zs)+Math.max(...zs))/2;if(Math.hypot(x,z-250)>2000)continue;const key=Math.floor(x/220)+','+Math.floor(z/220);if((cells.get(key)||0)>=2)continue;cells.set(key,(cells.get(key)||0)+1);buildings.push([x,sample(x,z),z,Math.max(...xs)-Math.min(...xs),b.height||9,Math.max(...zs)-Math.min(...zs)].map(Math.round));if(buildings.length>=100)break;}
 const pier=data.piers.find(p=>/栈桥|zhanqiao/i.test(p.name||p.tags?.name||''));if(pier?.polygon)polygon(pier.polygon,4.16,[.85,.81,.65],[],false);
 const pavilion=data.landmarks.find(p=>/回澜|huilan/i.test(p.name||''));
 return{vertices,indices,colors,tiles,buildings,pavilion:pavilion?.position||[0,-185],origin:data.metadata.origin};
}

export function quickScenePlugin(){let script;
 return{name:'qingdao-instant-scene',transformIndexHtml:{order:'post',handler(html,context){
  script??=buildSync({entryPoints:['src/quick-scene.ts'],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',minify:true,define:{__QUICK_GEOMETRY__:JSON.stringify(createQuickGeometry())}}).outputFiles[0].text;
  // The complete stylesheet is also inline, so a failed stylesheet request
  // cannot prevent the eventual native module import from being evaluated.
  if(context.bundle)html=html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g,tag=>{const file=tag.match(/href="\/([^"]+)"/)?.[1],asset=context.bundle[file];return asset?.type==='asset'?'<style>'+asset.source+'</style>':tag;});
  html=html.replace('</body>','<script>'+script.replaceAll('</script','<\\/script')+'</script></body>');
  if(gzipSync(html).length>24576)throw new Error('内置首屏超过24 KiB压缩预算');
  return html;
 }}};
}
