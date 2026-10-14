from pathlib import Path
p=Path(__file__).resolve().parents[1]
def edit(file,fn):
 f=p/file;f.write_text(fn(f.read_text(encoding='utf-8')),encoding='utf-8')
def controls(s):
 s=s.replace("return intersectMapPlane(r.origin,r.direction,height);", "const q=intersectMapPlane(r.origin,r.direction,height);return q&&Math.hypot(q.x-camera.target.x,q.z-camera.target.z)<camera.radius*4?q:null;")
 s=s.replace("zoom={radius:zoomRadius(zoom?.radius??camera.radius,pixels,camera.lowerRadiusLimit??20,camera.upperRadiusLimit??190000),...p,height,anchor:point(p.x,p.y,height)};", "const retained=zoom&&Math.hypot(zoom.x-p.x,zoom.y-p.y)<2?zoom:null;zoom={radius:zoomRadius(zoom?.radius??camera.radius,pixels,camera.lowerRadiusLimit??20,camera.upperRadiusLimit??190000),...p,height:retained?.height??height,anchor:retained?retained.anchor:point(p.x,p.y,height)};")
 return s
edit('src/map-controls.ts',controls)
def lighting(s):
 s=s.replace('varying vec3 vColor;', 'varying vec3 vColor;')
 s=s.replace('uniform vec3 horizon;', 'uniform vec3 horizon;uniform vec3 eye;')
 s=s.replace("float diffuse=.44", "float detail=1.-smoothstep(1500.,4500.,distance(vWorld,eye));window*=detail;float diffuse=.44")
 s=s.replace('warm*window*lit*night*.88','warm*(window*lit*.88+(1.-detail)*.07)*night')
 s=s.replace('showColor(time+vWorld.x*.001)*window*night','showColor(time+vWorld.x*.001)*(window+(1.-detail)*.12)*night')
 s=s.replace("length(vWorld)*.000002", "distance(vWorld,eye)*.000002")
 s=s.replace("'sunDirection','horizon'", "'sunDirection','horizon','eye'")
 s=s.replace("wall.setColor3('horizon',horizon);", "wall.setColor3('horizon',horizon);wall.setVector3('eye',scene.activeCamera?.position||Vector3.Zero());")
 return s
edit('src/city-lighting.ts',lighting)
def overview(s):
 s=s.replace("import type {Bounds} from './height';",'')
 s=s.replace("m.hasVertexAlpha=false;", "m.metadata={groupKey:name.split(' ')[0]};m.hasVertexAlpha=false;")
 start=s.index('update(camera:Vector3,localBounds:Bounds,detailReady:')
 end=s.index(',dispose()',start)
 s=s[:start]+"update(detailReady:(key:string)=>boolean){for(const m of meshes)m.setEnabled(!detailReady(m.metadata.groupKey));}"+s[end:]
 return s
edit('src/city-overview.ts',overview)
def regional(s):
 s=s.replace("const loaded=new Map", "const groupKey=(c:Chunk)=>Math.floor(c.bounds.minX/8000)+'_'+Math.floor(c.bounds.minZ/8000);const groupChunks=new Map<string,Chunk[]>();for(const c of index.chunks as Chunk[]){if(!c.buildingCount)continue;const k=groupKey(c);if(!groupChunks.has(k))groupChunks.set(k,[]);groupChunks.get(k)!.push(c);}let detailLOD=true;const displayedGroups=new Set<string>();\n const loaded=new Map")
 s=s.replace("loaded.set(c.id,meshes);", "meshes.forEach(m=>m.setEnabled(false));loaded.set(c.id,meshes);")
 a=s.index('detailReady:(bounds:Bounds)=>');b=s.index(',stats:',a)
 s=s[:a]+"detailReady:(key:string)=>displayedGroups.has(key)"+s[b:]
 a=s.index('const visibleRange=');b=s.index('   for(const c of candidates)',a)
 s=s[:a]+"""if(detailLOD&&altitude>11000)detailLOD=false;else if(!detailLOD&&altitude<8000)detailLOD=true;
   const visibleRange=Math.max(5000,Math.min(18000,altitude*3));
   const nearest=(index.chunks as Chunk[]).filter(c=>c.buildingCount>0&&distance(c.bounds,target.x,target.z)<visibleRange).sort((a,b)=>distance(a.bounds,target.x,target.z)-distance(b.bounds,target.x,target.z));
   const groups=detailLOD?[...new Set(nearest.map(groupKey))].slice(0,3):[];
   const candidates=groups.flatMap(k=>groupChunks.get(k)!).sort((a,b)=>distance(a.bounds,target.x,target.z)-distance(b.bounds,target.x,target.z));
   displayedGroups.clear();for(const k of groups)if(groupChunks.get(k)!.every(c=>loaded.has(c.id)))displayedGroups.add(k);
   const visible=new Set(candidates.map(c=>c.id));for(const [id,meshes]of loaded){const c=(index.chunks as Chunk[]).find(c=>c.id===id)!;for(const mesh of meshes)mesh.setEnabled(displayedGroups.has(groupKey(c)));}
"""+s[b:]
 return s
edit('src/regional.ts',regional)
def world(s):
 s=s.replace("excludedBuildingIds=new Set<string>())", "excludedBuildingIds=new Set<string>(),excludedAreaIds=new Set<string>(),beachContains:(x:number,z:number)=>boolean=()=>false)")
 s=s.replace("const a=f.points[i],b=f.points[i+1];retaining.quad", "const a=f.points[i],b=f.points[i+1];if(beachContains((a[0]+b[0])/2,(a[1]+b[1])/2))continue;retaining.quad")
 s=s.replace("if(!area.polygon||area.polygon.length<3)continue;const beach", "if(excludedAreaIds.has(String(area.id))||!area.polygon||area.polygon.length<3)continue;const beach")
 s=s.replace("t.update(false); t.wrapU=Texture.WRAP_ADDRESSMODE;", "const e=new DynamicTexture(`Night window mask ${i}`,{width:128,height:128},scene,true,Texture.TRILINEAR_SAMPLINGMODE);const ec=e.getContext();ec.fillStyle='#000';ec.fillRect(0,0,128,128);ec.fillStyle='#ffe8b0';ec.fillRect(39,31,23,28);ec.fillRect(66,31,23,28);ec.fillRect(39,64,23,27);ec.fillRect(66,64,23,27);e.update(false);e.wrapU=e.wrapV=Texture.WRAP_ADDRESSMODE;textures.push(e);m.emissiveTexture=e;m.emissiveColor=Color3.Black();t.update(false); t.wrapU=Texture.WRAP_ADDRESSMODE;")
 s=s.replace("setDetail(distance:number){for(const item", "setNight(strength:number){for(const m of wallMats)m.emissiveColor=new Color3(1,.76,.42).scale(strength*.8);globeMat.emissiveColor=new Color3(1,.75,.35).scale(strength);},setDetail(distance:number){for(const item")
 return s
edit('src/world.ts',world)
