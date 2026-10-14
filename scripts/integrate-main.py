from pathlib import Path
p=Path(__file__).resolve().parents[1];f=p/'src/main.ts';s=f.read_text(encoding='utf-8')
s=s.replace("import { buildHeritageBuildings }", "import { createHeritageSurface, buildHeritageBuildings }")
s=s.replace("const app=document", "import {buildBeaches,createBeachSurface} from './beaches';\nimport {buildCityOverview} from './city-overview';\nimport {buildMetro} from './metro';\nimport {createLandmarkLabels} from './landmark-labels';\nimport {stableShadowPosition} from './render-stability';\nimport {buildCivicPlazas} from './civic-plazas';\nimport {buildCivicBuildings} from './civic-buildings';\n\nconst app=document")
s=s.replace('<div class="view-buttons">','<div class="effect-toggles"><button id="metro-toggle" aria-pressed="false">地铁光带</button><button id="lightshow-toggle" class="active" aria-pressed="true">滨海灯光秀</button></div><div class="view-buttons">')
a=s.index(' const terrain=await createTerrain(');b=s.index(' const parks=',a)
s=s[:a]+""" const [heritageData,bridgeData,regionalLand,beachData,overviewData,metroData,civicData]=await Promise.all(['/data/heritage.json','/data/bay-bridge.json','/data/regional-land.json','/data/beaches.json','/data/city-overview.json','/data/metro.json','/data/civic-landmarks.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw new Error('地标数据无法读取');return r.json();}));
 let beachSurface:ReturnType<typeof createBeachSurface>;
 const beachBounds=beachData.beaches.map((b:any)=>({minX:Math.min(...b.polygon.map((p:number[])=>p[0])),maxX:Math.max(...b.polygon.map((p:number[])=>p[0])),minZ:Math.min(...b.polygon.map((p:number[])=>p[1])),maxZ:Math.max(...b.polygon.map((p:number[])=>p[1]))}));
 const terrain=await createTerrain(scene,region,data,raw=>{beachSurface=createBeachSurface(beachData,raw);const heritageSurface=createHeritageSurface(heritageData,raw);return(x,z)=>beachSurface.sampleSurface(x,z)??heritageSurface.sampleSurface(x,z);},beachBounds,beachData.metadata.groundCutMask,(x,z)=>beachSurface.contains(x,z));
 const beaches=buildBeaches(scene,beachData,terrain.sample);
 const civic=buildCivicBuildings(scene,civicData,shadows,terrain.sample);
 const plazas=buildCivicPlazas(scene,civicData,shadows,terrain.sample);
"""+s[b:]
s=s.replace('...heritage.excludedBuildingIds]);','...heritage.excludedBuildingIds,...civic.excludedBuildingIds,...plazas.excludedBuildingIds]);')
s=s.replace('buildWorld(scene,data,shadows,terrain.sample,replaced);','buildWorld(scene,data,shadows,terrain.sample,replaced,new Set([...beaches.excludedAreaIds,...plazas.excludedAreaIds]),(x,z)=>beachSurface.contains(x,z));')
pos=s.index('\n const sky=')
s=s[:pos]+"""
 const overview=buildCityOverview(scene,overviewData,terrain.sample,new Set([...replaced,...data.buildings.map((b:any)=>String(b.id))]));
 const metro=buildMetro(scene,metroData,terrain.sample);
 let metroEnabled=false,lightShowEnabled=true;
 $('metro-toggle').onclick=()=>{metroEnabled=!metroEnabled;$('metro-toggle').classList.toggle('active',metroEnabled);$('metro-toggle').setAttribute('aria-pressed',String(metroEnabled));toast(metroEnabled?'OSM 地铁线路光效：地下线路的地图展示':'已关闭地铁光带');};
 $('lightshow-toggle').onclick=()=>{lightShowEnabled=!lightShowEnabled;$('lightshow-toggle').classList.toggle('active',lightShowEnabled);$('lightshow-toggle').setAttribute('aria-pressed',String(lightShowEnabled));};
"""+s[pos:]
s=s.replace('...bridge.collisionMeshes])','...bridge.collisionMeshes,...civic.collisionMeshes,...plazas.collisionMeshes])')
s=s.replace("go(28000,12800,6200,'崂山 · 真实山地',1.13)","go(27822.451,12722.176,4600,'崂山 · 真实山地',1.28)")
s=s.replace('[...parks.views,...heritage.views,','[...parks.views,...heritage.views,...beaches.views,...civic.views,...plazas.views,')
s=s.replace('radius:2200,beta:1.32}', "radius:1800,beta:1.35},{id:'laoshan',name:'崂山 · 巨峰',position:new Vector3(27822.451,terrain.sample(27822.451,12722.176)+30,12722.176),radius:4600,beta:1.28}")
pos=s.index(' const shadowCandidates=')
s=s[:pos]+""" const labelItems=[{id:'huilan',name:'回澜阁',position:world.pavilionPosition.add(new Vector3(0,18,0)),radius:60,beta:1.35},{id:'qingdao-station',name:'青岛火车站',position:world.stationPosition.add(new Vector3(0,45,0)),radius:220,beta:1.3},...views.map(v=>({...v,position:v.position.add(new Vector3(0,18,0))}))];
 const labels=createLandmarkLabels(scene,canvas,labelItems,v=>go(v.position.x,v.position.z,v.radius,v.name,v.beta??1.16,v.alpha??-Math.PI/2-.4,v.position.y-18));
"""+s[pos:]
s=s.replace('ambient.intensity=.40+d*.16','ambient.intensity=.30+d*.26')
a=s.index('regional.update(elapsed,active.position,viewTarget);');b=s.index('\n  if(elapsed-lastShadowCull',a)
s=s[:a]+"""regional.update(elapsed,active.position,viewTarget);overview.update(regional.detailReady);terrain.setDetail(detailDistance,viewTarget);beaches.setDetail(detailDistance);civic.setDetail(detailDistance);plazas.setDetail(detailDistance);
  const sunDir=new Vector3(solar.direction.x,solar.direction.y,solar.direction.z),night=1-solar.daylight;regional.cityMaterials.update(solar.daylight,elapsed,sunDir,horizon,lightShowEnabled);overview.materials.update(solar.daylight,elapsed,sunDir,horizon,lightShowEnabled);world.setNight(night);parks.setNight(night,elapsed);heritage.setNight(night,elapsed);civic.setNight(night,elapsed);plazas.setNight(night,elapsed);metro.update(elapsed,mode==='orbit'?orbit.radius:Math.max(800,free.position.y*3),solar.daylight,metroEnabled);
  sun.position=stableShadowPosition(viewTarget,sunDir);sun.shadowEnabled=detailDistance<5600;shadows.setDarkness(.25+.75*Math.max(0,Math.min(1,(detailDistance-3200)/2000)));shadows.getShadowMap()!.refreshRate=detailDistance<5600?(qualityHigh?1:2):0;
"""+s[b:]
s=s.replace('scene.render();','scene.render();labels.update(elapsed);')
s=s.replace("version:'0.3.0'", "beaches,civic,plazas,overview,metro,version:'0.4.0'")
s=s.replace('浮山精细网格 40 米。','浮山精细网格 40 米、崂山精细网格 80 米。')
s=s.replace('室内未完整复原。','室内未完整复原。新增青岛电视塔钢结构、五月的风及市政府与广场。沙滩保留真实 OSM 岸线，湿沙坡面为视觉插值。')
s=s.replace('夜间保留柔和的环境光以方便探索。','夜间亮起建筑暖窗与广场灯；滨海高楼交替播放色彩灯光秀，为视觉模拟，未接入实况。地铁光带沿 OSM 独立线路显示，不能作为最新运营范围或列车位置依据。')
f.write_text(s,encoding='utf-8')
