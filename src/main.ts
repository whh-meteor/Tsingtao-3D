import './style.css';
import { Engine, Scene, ArcRotateCamera, FreeCamera, Vector3, Color3, Color4, DirectionalLight, HemisphericLight, ShadowGenerator, HavokPlugin, PhysicsAggregate, PhysicsShapeType, PhysicsCharacterController, CharacterSupportedState, Ray, Mesh, FxaaPostProcess } from './babylon';
import HavokPhysics from '@babylonjs/havok';
import havokWasmUrl from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';
import { buildWorld } from './world';
import { createOcean } from './ocean';
import { createSky } from './sky';
import { solarState, chinaInstant, chinaTime, chinaDateParts } from './solar';
import { nextVerticalVelocity } from './movement';
import { createTerrain, type Region } from './terrain';
import { createRegional } from './regional';
import { attachMapControls } from './map-controls';
import { buildHillParks } from './hill-parks';
import { createHeritageSurface, buildHeritageBuildings } from './heritage-buildings';
import { buildBayBridge } from './bay-bridge';
import { buildFushan } from './fushan';

import {buildBeaches,createBeachSurface} from './beaches';
import {buildCityOverview} from './city-overview';
import {buildMetro} from './metro';
import {createLandmarkLabels} from './landmark-labels';
import {stableShadowPosition} from './render-stability';
import {buildCivicPlazas} from './civic-plazas';
import {buildCivicBuildings} from './civic-buildings';
import {fetchJSON,fetchBuffer,createBackgroundLoader,configureAssetChunks} from './asset-loader';
import assetChunks from 'virtual:asset-chunks';
import {startupStatus,downloadStatus,startupFailure} from './startup-ui';
import {recoverResource} from './resource-recovery';
configureAssetChunks({...assetChunks,[havokWasmUrl]:assetChunks.havok});

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`
<header class="topbar"><div class="brand"><div class="mark">QD</div><div class="brand-text">青岛 · 山海之城<small>QINGDAO / CITY EXPLORER</small></div></div><div class="top-actions"><div class="live-pill"><i class="dot"></i><span id="status">东八区 · 实时光照</span></div><button id="panel-toggle" aria-label="展开或收起海面与光照控制">光与海</button><button id="info">场景说明 ↗</button></div></header>
<div class="title-block"><div class="eyebrow">36°03′ N / 120°19′ E</div><h1>海与城<br>在此相遇。</h1><p>从栈桥出发，越过山海。<br>八个区域，一座立体的城市。</p><div class="title-rule"></div><div class="coordinates">真实地理布局 · 1 单位 = 1 米</div></div>
<nav class="modes" aria-label="探索方式"><button data-mode="orbit" class="active">◎ 观景</button><button data-mode="walk">↟ 步行</button><button data-mode="fly">↗ 飞行</button></nav><div id="guide" class="guide">左键拖拽地图 · 右键旋转 · 滚轮缩放<br>点击建筑可查看信息</div><div id="picked" class="picked"></div>
<aside class="controls"><div class="panel-heading">光与海 <span>LIGHT & WATER</span></div><div class="segmented" aria-label="时间预览"><button data-time="12">日间</button><button data-time="sunset">日落</button><button data-time="21">夜间</button></div><div class="range-row"><label for="wave">波浪起伏 <output id="wave-output">0.65 m</output></label><input id="wave" type="range" min="0.15" max="1.5" value="0.65" step="0.05"></div><div class="range-row"><label for="wind">风浪速度 <output id="wind-output">1.0 ×</output></label><input id="wind" type="range" min="0.3" max="2" value="1" step="0.1"></div><div class="range-row"><label for="foam">沿岸泡沫 <output id="foam-output">适中</output></label><input id="foam" type="range" min="0" max="2" value="1" step="0.1"></div><div class="solar-row"><span>太阳高度角</span><strong id="sun-altitude">—</strong></div><div class="effect-toggles"><button id="labels-toggle" class="active" aria-pressed="true">浮动标签</button><button id="metro-toggle" aria-pressed="false">地铁光带</button><button id="lightshow-toggle" class="active" aria-pressed="true">滨海灯光秀</button></div><div class="view-buttons"><button id="pier-view">回澜阁</button><button id="station-view">青岛站</button><button id="bay-view">青岛湾</button><button id="quality" aria-pressed="false">节能</button><button id="panel-hide">收起面板</button></div></aside>
<section class="timeline" aria-label="东八区时间控制"><div class="time-head"><div class="time-display"><span id="clock">--:--:--</span><small>UTC +08</small></div><button id="realtime" class="active" aria-pressed="true">● 跟随实时</button></div><input id="hours" aria-label="预览时间（北京时间）" type="range" min="0" max="23.99" step="0.01" value="12"><div class="ticks"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div><div class="time-date"><span id="date">—</span><span id="period">太阳位置由青岛经纬度计算</span></div></section>
<nav class="districts" aria-label="区域导航"><button id="region-view">全域</button><button id="mountain-view">崂山山地</button><span id="district-list"></span></nav><aside class="mini"><div class="mini-title"><span id="map-title">青岛湾</span><span>↑ N</span></div><canvas id="minimap" width="348" height="226" aria-label="场景范围与相机位置示意图"></canvas><div class="mini-footer"><span>WGS84 · 米制场景</span><b id="map-scale">500 m ━</b></div></aside>
<footer class="footer"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors · ODbL</a><a class="dem-credit" href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Terrain Tiles / Mapzen · DEM</a><div class="metrics"><span id="physics">Havok 加载中</span><span id="altitude">— m</span><span id="fps">— FPS</span></div></footer><div id="toast" class="toast" role="status"></div><div class="crosshair"></div>
<dialog id="about"><h2>青岛湾 · 栈桥</h2><p>这是一个用于后续游戏扩展的三维场景原型，支持观景、步行与自由飞行。</p><h3>地理比例与模型</h3><p id="data-summary">正在读取数据。</p><p>建筑轮廓、道路走向与海岸线来自 OSM。缺失建筑高度采用估算；地形采用 AWS / Mapzen 真实 DEM，全域网格 400 米，旧城精细网格 32 米，浮山精细网格 40 米、崂山精细网格 80 米。网格间距不代表测绘精度。周边建筑为风格化模型；回澜阁、青岛站、胶州湾大桥和老城重点建筑依据实景及建筑资料单独复原，缺少施工图的细部尺寸仍为估算。海面风浪为视觉模拟，未接入真实潮位或天气。</p><h3>地标复原依据</h3><p>回澜阁采用黄色琉璃瓦、双层八角飞檐、24根亭柱；青岛站还原黄墙红瓦、花岗岩饰面、拱券入口、半木构山墙与35米钟楼。新增信号山三座红色球形观景楼、小鱼山绿瓦三层览潮阁、总督府与迎宾馆、啤酒博物馆、大学路鱼山路红墙、海大鱼山校区代表建筑，以及胶州湾大桥三类航道桥。复原展示外观，室内未完整复原。新增青岛电视塔钢结构、五月的风及市政府与广场。沙滩保留真实 OSM 岸线，湿沙坡面为视觉插值。</p><p><a href="https://www.guanhai.com.cn/p/476619.html" target="_blank" rel="noopener">青岛日报：回澜阁建筑资料</a> · <a href="https://www.dailyqd.com/arc/2016-09/22/content_352743.htm" target="_blank" rel="noopener">青岛日报：青岛站历史与现代实景</a> · <a href="/data/LANDMARKS.md" target="_blank" rel="noopener">尺寸与参考来源记录</a></p><p><a href="/data/CITY-LANDMARKS.md" target="_blank" rel="noopener">新增地标与大桥：资料、比例与估算说明</a></p><h3>光照与海面</h3><p>太阳与月亮位置按青岛经纬度、日期及绝对时间计算，时间显示固定为 Asia/Shanghai（UTC+8）。日落前后的低角度阳光会改变海面反光方向；夜间亮起建筑暖窗与广场灯；滨海高楼交替播放色彩灯光秀，为视觉模拟，未接入实况。地铁光带沿 OSM 独立线路显示，不能作为最新运营范围或列车位置依据。</p><p>海面参考 <a href="https://github.com/mrdoob/three.js/blob/dev/examples/jsm/objects/Water.js" target="_blank" rel="noopener">Three.js 开源 Water 示例</a>的反射与菲涅耳思路，独立实现方向波、细浪、岸线泡沫与栈桥倒影。</p><h3>操作</h3><ul><li>观景：左键拖拽地图，右键旋转视角，滚轮以鼠标位置为中心平滑缩放。</li><li>步行：WASD 移动，Shift 加速，Space 跳跃；拖动视角。桌面可点击画面锁定鼠标，Esc 退出。</li><li>飞行：WASD 移动，E 上升、Q 下降，Shift 加速。属于自由飞行原型。</li></ul><button id="close-about">继续探索</button></dialog>`;
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('scene');
let toastTimer=0;function toast(text:string){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>$('toast').classList.remove('show'),3200);}
$('info').onclick=()=>$<HTMLDialogElement>('about').showModal();$('close-about').onclick=()=>$<HTMLDialogElement>('about').close();$('panel-toggle').onclick=()=>document.querySelector('.controls')!.classList.toggle('collapsed');

async function start(){
 const phase=async(text:string)=>{startupStatus(text);await new Promise<void>(resolve=>setTimeout(resolve,16));};
 const loadJSON=(url:string,label:string)=>recoverResource(label,()=>fetchJSON(url,{onAttempt:(attempt,total)=>startupStatus(`正在下载${label}${attempt>1?` · 重试 ${attempt}/${total}`:''}`),onProgress:progress=>downloadStatus(label,progress)}));
 if(!Engine.IsSupported)throw new Error('此浏览器未启用 WebGL。请使用支持硬件加速的现代浏览器。');
 const engine=new Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true,powerPreference:'high-performance'});
 engine.setHardwareScalingLevel(Math.max(1,window.devicePixelRatio/1.5));
 const scene=new Scene(engine);scene.clearColor=new Color4(.05,.16,.2,1);scene.fogMode=Scene.FOGMODE_EXP2;scene.fogDensity=.000010;
 scene.imageProcessingConfiguration.contrast=1.02;scene.imageProcessingConfiguration.exposure=.95;
 const orbit=new ArcRotateCamera('overview',-Math.PI/2-.52,1.02,560,new Vector3(0,6,-130),scene);
 orbit.minZ=.3;orbit.maxZ=600000;orbit.lowerRadiusLimit=20;orbit.upperRadiusLimit=190000;orbit.upperBetaLimit=1.48;orbit.lowerBetaLimit=.18;orbit.wheelDeltaPercentage=.035;orbit.mapPanning=true;orbit.panningSensibility=80;orbit.inertia=.87;orbit.attachControl(false,false,0);
 const free=new FreeCamera('player',new Vector3(0,6,0),scene);free.minZ=.12;free.maxZ=600000;free.fov=.95;free.inertia=.65;free.inputs.removeByType('FreeCameraKeyboardMoveInput');free.angularSensibility=2500;
 const fxaa=new FxaaPostProcess('smooth-edges',1,orbit);fxaa.samples=1;free.attachPostProcess(fxaa);
 const ambient=new HemisphericLight('sky-fill',Vector3.Up(),scene);ambient.groundColor=new Color3(.17,.20,.18);
 const sun=new DirectionalLight('sun',new Vector3(-.4,-.8,.3),scene);sun.position=new Vector3(500,1100,-500);
 const shadows=new ShadowGenerator(2048,sun);shadows.usePercentageCloserFiltering=true;shadows.filteringQuality=ShadowGenerator.QUALITY_LOW;shadows.bias=.0012;shadows.normalBias=.03;sun.shadowMinZ=1;sun.shadowMaxZ=2200;sun.shadowFrustumSize=1300;sun.autoUpdateExtends=false;
 const data=await loadJSON('/data/scene.json','栈桥与老城区地图');
 const region:Region=await loadJSON('/data/region.json','区域索引');
 const [heritageData,bridgeData,beachData,civicData]=await Promise.all([['/data/heritage.json','历史地标'],['/data/bay-bridge.json','跨海大桥'],['/data/beaches.json','真实沙滩'],['/data/civic-landmarks.json','市政地标']].map(([url,label])=>loadJSON(url,label)));
 let regionalLand={land:data.land};
 let beachSurface:ReturnType<typeof createBeachSurface>;
 const beachBounds=beachData.beaches.map((b:any)=>({minX:Math.min(...b.polygon.map((p:number[])=>p[0])),maxX:Math.max(...b.polygon.map((p:number[])=>p[0])),minZ:Math.min(...b.polygon.map((p:number[])=>p[1])),maxZ:Math.max(...b.polygon.map((p:number[])=>p[1]))}));
 await phase('正在加载真实高程与海岸地形');
 const terrain=await recoverResource('真实高程',()=>createTerrain(scene,region,data,raw=>{beachSurface=createBeachSurface(beachData,raw);const heritageSurface=createHeritageSurface(heritageData,raw);return(x,z)=>beachSurface.sampleSurface(x,z)??heritageSurface.sampleSurface(x,z);},beachBounds,beachData.metadata.groundCutMask,(x,z)=>beachSurface.contains(x,z)));
 await phase('正在生成沙滩与地标模型');
 const beaches=buildBeaches(scene,beachData,terrain.sample);
 const civic=buildCivicBuildings(scene,civicData,shadows,terrain.sample);
 const plazas=buildCivicPlazas(scene,civicData,shadows,terrain.sample);
 const parks=buildHillParks(scene,heritageData,shadows,terrain.sample);
 const heritage=buildHeritageBuildings(scene,heritageData,shadows,terrain.sample);
 const bridge=buildBayBridge(scene,bridgeData,shadows,terrain.sample);
 const fushan=buildFushan(scene,heritageData,terrain.sample);
 const replaced=new Set([...parks.excludedBuildingIds,...heritage.excludedBuildingIds,...civic.excludedBuildingIds,...plazas.excludedBuildingIds]);
 await phase('正在生成老城区建筑与道路');
 const world=buildWorld(scene,data,shadows,terrain.sample,replaced,new Set([...beaches.excludedAreaIds,...plazas.excludedAreaIds]),(x,z)=>beachSurface.contains(x,z));
 let regional:Awaited<ReturnType<typeof createRegional>>|null=null;
 let overview:ReturnType<typeof buildCityOverview>|null=null;
 let metro:ReturnType<typeof buildMetro>|null=null;
 const streamButton=document.createElement('button');streamButton.id='stream-status';streamButton.className='stream-status';streamButton.disabled=true;streamButton.textContent='城市细节将在后台加载';app.append(streamButton);
 const coastalIds=new Set<string>(civicData.coastalBuildings.map((b:any)=>b.id));
 const walkSpawn=world.pierStart.add(new Vector3(0,2.6,0));
 let character:PhysicsCharacterController|null=null;
 const aggregates:PhysicsAggregate[]=[];
 async function preparePhysics(){
  $('physics').textContent='步行物理准备中';
  try{
   const wasmBinary=await fetchBuffer(havokWasmUrl);
   const physics=await HavokPhysics({wasmBinary,locateFile:(file:string)=>file.endsWith('.wasm')?havokWasmUrl:file});
   scene.enablePhysics(new Vector3(0,-9.81,0),new HavokPlugin(true,physics));scene.getPhysicsEngine()?.setTimeStep(1/60);
   for(const m of [...world.collisionMeshes,...terrain.collisionMeshes,...parks.collisionMeshes,...heritage.collisionMeshes,...bridge.collisionMeshes,...civic.collisionMeshes,...plazas.collisionMeshes]){try{aggregates.push(new PhysicsAggregate(m as Mesh,PhysicsShapeType.MESH,{mass:0,friction:.65,restitution:0},scene));}catch(e){console.warn('碰撞体跳过',m.name,e);}if(aggregates.length%20===0)await new Promise(resolve=>setTimeout(resolve,0));}
   character=new PhysicsCharacterController(walkSpawn,{capsuleHeight:1.8,capsuleRadius:.3},scene);$('physics').textContent='Havok · 已启用';
  }catch(error){for(const aggregate of aggregates)aggregate.dispose();aggregates.length=0;scene.disablePhysicsEngine();$('physics').textContent='步行物理待补载';throw error;}
 }
 let backgroundTimer:ReturnType<typeof setTimeout>|undefined,backgroundRound=0;
 const background=createBackgroundLoader([
  {label:'远景建筑',async load(){const d=await fetchJSON('/data/city-overview.json',{timeoutMs:120000});overview=buildCityOverview(scene,d,terrain.sample,new Set([...replaced,...data.buildings.map((b:any)=>String(b.id))]),coastalIds);}},
  {label:'区域道路与建筑',async load(){regional=await createRegional(scene,region,terrain.sample,data.bounds||data.metadata.bounds,replaced,bridge.excludedRoadIds,coastalIds);}},
  {label:'区域海岸',async load(){regionalLand=await fetchJSON('/data/regional-land.json',{timeoutMs:120000});}},
  {label:'地铁线路',async load(){const d=await fetchJSON('/data/metro.json',{timeoutMs:120000});metro=buildMetro(scene,d,terrain.sample);}},
  {label:'步行物理',load:preparePhysics}
 ],state=>{canvas.dataset.background=JSON.stringify(state);streamButton.hidden=!state.running&&state.completed===state.total;streamButton.disabled=state.running;streamButton.textContent=state.running?`城市细节加载中 ${state.completed}/${state.total}`:`${state.failed.join('、')}待加载 · 将自动重试，也可点击重试`;if(!state.running&&state.completed<state.total){clearTimeout(backgroundTimer);backgroundTimer=setTimeout(()=>void background.run(),Math.min(30000,3000*2**Math.min(backgroundRound++,4)));}});
 const retryBackground=()=>{clearTimeout(backgroundTimer);void background.run();};
 streamButton.onclick=retryBackground;window.addEventListener('online',retryBackground);
 let metroEnabled=false,lightShowEnabled=true;
 $('metro-toggle').onclick=()=>{metroEnabled=!metroEnabled;$('metro-toggle').classList.toggle('active',metroEnabled);$('metro-toggle').setAttribute('aria-pressed',String(metroEnabled));toast(metroEnabled?'OSM 地铁线路光效：地下线路的地图展示':'已关闭地铁光带');};
 $('lightshow-toggle').onclick=()=>{lightShowEnabled=!lightShowEnabled;$('lightshow-toggle').classList.toggle('active',lightShowEnabled);$('lightshow-toggle').setAttribute('aria-pressed',String(lightShowEnabled));};

 const sky=createSky(scene);
 const fallbackBounds={minX:-1920,minZ:-1700,maxX:2580,maxZ:1950};
 const shore=data.shoreTexture || data.shoreDistanceTexture || {bounds:fallbackBounds,maxDistance:100};
 const ocean=createOcean(scene,{...shore,regional:(region as any).shoreTexture},[sky.mesh,...world.reflectionMeshes]);
 const details=data.meta || data.metadata || {};const est=data.buildings.filter((b:any)=>b.estimatedHeight).length;
 $('data-summary').textContent=`场景以 120.3163°E、36.0603°N 为原点，采用 WGS84 局部等距米制投影。读取 ${world.stats.buildings} 栋建筑、${world.stats.roads} 条道路，其中 ${est} 栋建筑高度为估算。八个区域合计 23758 栋 OSM 建筑（包含近景部分），区域细节在后台按需加载。地形为真实 DEM；建筑高度大多估算。数据日期：${(details.fetchedAtUTC || details.dataTimestamp || '2026-10-12').slice(0,10)}。`;
 let mode='orbit',realtime=true,hour=chinaDateParts(new Date()).hours,day=chinaDateParts(new Date()).date,qualityHigh=true;
 if(new URLSearchParams(location.search).get('time')==='day'){realtime=false;hour=12;}
 let elapsed=0,lastHUD=0,accumulator=0,solar=solarState(new Date()),top=new Color3(),horizon=new Color3(),sunColor=new Color3();
 const keys=new Set<string>();const up=Vector3.Up(),gravity=new Vector3(0,-9.81,0);let jump=false;
 window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement || $<HTMLDialogElement>('about').open)return;if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','Space','ShiftLeft','ShiftRight'].includes(e.code)){keys.add(e.code);if(mode!=='orbit')e.preventDefault();if(e.code==='Space'&&!e.repeat)jump=true;}});
 window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden)keys.clear();});
 function setMode(next:string){
  if(next==='walk'&&!character){toast('步行碰撞仍在后台准备，可先观景或飞行；准备失败时点击左下角重试。');return;}
  if(document.pointerLockElement)document.exitPointerLock();keys.clear();mapControls?.reset();orbit.detachControl();free.detachControl();mode=next;document.body.classList.toggle('exploring',mode!=='orbit');canvas.classList.toggle('map-navigation',mode==='orbit');
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',(b as HTMLElement).dataset.mode===mode));document.querySelector('.crosshair')!.classList.toggle('visible',mode!=='orbit');
  if(mode==='orbit'){scene.activeCamera=orbit;orbit.attachControl(false,false,0);$('guide').innerHTML='左键拖拽地图 · 右键旋转 · 滚轮缩放<br>点击建筑可查看信息';}
  else{scene.activeCamera=free;free.attachControl(canvas,true);if(mode==='walk'&&character){character.setPosition(walkSpawn);character.setVelocity(Vector3.Zero());free.position.copyFrom(walkSpawn.add(new Vector3(0,.65,0)));free.setTarget(world.pavilionPosition.add(new Vector3(0,4,0)));$('guide').innerHTML='<kbd>W A S D</kbd> 移动 · <kbd>Shift</kbd> 加速<br><kbd>Space</kbd> 跳跃 · 拖动查看';toast('已到栈桥入口，向前走到回澜阁');}
   else{free.position.copyFrom(orbit.position);free.setTarget(orbit.target);$('guide').innerHTML='<kbd>W A S D</kbd> 移动 · <kbd>Shift</kbd> 加速<br><kbd>E</kbd> 上升 · <kbd>Q</kbd> 下降';toast('自由飞行：E 上升，Q 下降');}}
 }
 document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode!));
 canvas.addEventListener('click',()=>{if(mode!=='orbit'&&matchMedia('(pointer:fine)').matches)canvas.requestPointerLock?.();});
 function updateTimeState(){ $('realtime').classList.toggle('active',realtime);$('realtime').setAttribute('aria-pressed',String(realtime));$('status').textContent=realtime?'东八区 · 实时光照':'东八区 · 时间预览';document.querySelectorAll('[data-time]').forEach(b=>b.classList.remove('active')); }
 $('realtime').onclick=()=>{realtime=true;updateTimeState();};
 $<HTMLInputElement>('hours').oninput=e=>{realtime=false;hour=+(e.target as HTMLInputElement).value;updateTimeState();};
 document.querySelectorAll<HTMLButtonElement>('[data-time]').forEach(b=>b.onclick=()=>{realtime=false;day=chinaDateParts(new Date()).date;if(b.dataset.time==='sunset'){let closest=17;for(let h=15;h<20;h+=.05)if(Math.abs(solarState(chinaInstant(day,h)).altitude-3)<Math.abs(solarState(chinaInstant(day,closest)).altitude-3))closest=h;hour=closest;}else hour=+b.dataset.time!;updateTimeState();b.classList.add('active');});
 function range(id:string,output:string,format:(v:number)=>string,setter:(v:number)=>void){$<HTMLInputElement>(id).oninput=e=>{const v=+(e.target as HTMLInputElement).value;$(output).textContent=format(v);setter(v);};}
 range('wave','wave-output',v=>`${v.toFixed(2)} m`,ocean.setWaves);range('wind','wind-output',v=>`${v.toFixed(1)} ×`,ocean.setWind);range('foam','foam-output',v=>v===0?'关闭':v<.7?'轻柔':v<1.4?'适中':'明显',ocean.setFoam);
 $('pier-view').onclick=()=>{$('map-title').textContent='回澜阁';landmarkNav.value='';document.body.classList.add('landmark-focused');flight=null;setMode('orbit');orbit.setTarget(world.pavilionPosition.add(new Vector3(0,6,0)));orbit.alpha=Math.PI/2+.26;orbit.beta=1.44;orbit.radius=44;};
 $('station-view').onclick=()=>{$('map-title').textContent='青岛火车站';landmarkNav.value='';document.body.classList.add('landmark-focused');flight=null;setMode('orbit');orbit.setTarget(world.stationPosition.add(new Vector3(56,1,-63)),false,true,true);orbit.alpha=-.48;orbit.beta=1.36;orbit.radius=130;};
 $('bay-view').onclick=()=>{$('map-title').textContent='青岛湾';landmarkNav.value='';document.body.classList.remove('landmark-focused');flight=null;setMode('orbit');orbit.setTarget(new Vector3(550,0,-420));orbit.alpha=-Math.PI/2-.6;orbit.beta=.78;orbit.radius=2400;};
 let flight:{from:Vector3;to:Vector3;fromRadius:number;toRadius:number;start:number;label:string;alpha:number;beta:number;toBeta:number;toAlpha:number}|null=null;
 function go(x:number,z:number,radius:number,label:string,toBeta=.82,toAlpha=-Math.PI/2-.4,height=terrain.sample(x,z)){landmarkNav.value=views.find(v=>v.name===label)?.id||'';document.body.classList.add('landmark-focused');setMode('orbit');const alpha=orbit.alpha;toAlpha=alpha+Math.atan2(Math.sin(toAlpha-alpha),Math.cos(toAlpha-alpha));flight={from:orbit.target.clone(),to:new Vector3(x,height,z),fromRadius:orbit.radius,toRadius:radius,start:elapsed,label,alpha,beta:orbit.beta,toBeta,toAlpha};orbit.inertialAlphaOffset=0;orbit.inertialBetaOffset=0;orbit.inertialRadiusOffset=0;toast(label);}
 $('region-view').onclick=()=>go(-3200,5000,132000,'青岛八区全域');
 $('mountain-view').onclick=()=>go(27822.451,12722.176,4600,'崂山 · 真实山地',1.28);
 const locations:Record<string,number[]>={'市南区':[3200,500],'市北区':[3700,6000],'李沧区':[7500,14500],'崂山区':[17400,9700],'城阳区':[8500,28000],'黄岛区':[-16000,-12000],'即墨区':[7500,42000],'胶州市':[-26000,24800]};
 for(const district of region.districts){const b=document.createElement('button');b.textContent=district.name.replace(/区|市$/g,'');b.onclick=()=>{const p=locations[district.name]||district.center;go(p[0],p[1],11000,district.name);};$('district-list').append(b);}
 $('quality').onclick=()=>{qualityHigh=!qualityHigh;engine.setHardwareScalingLevel(qualityHigh?Math.max(1,window.devicePixelRatio/1.5):Math.max(1.5,window.devicePixelRatio));shadows.getShadowMap()!.refreshRate=qualityHigh?1:2;ocean.setQuality(qualityHigh);$('quality').classList.toggle('active',!qualityHigh);$('quality').setAttribute('aria-pressed',String(!qualityHigh));toast(qualityHigh?'标准画质':'已降低渲染分辨率和反射更新频率');};
 const mapControls=attachMapControls(canvas,scene,orbit,{enabled:()=>mode==='orbit',onGestureStart:()=>{flight=null;},onPick:(x,y)=>{const pick=scene.pick(x,y,m=>!!m.metadata?.source);if(pick?.hit){const m=pick.pickedMesh!.metadata;$('picked').textContent=m.name||'周边建筑';const s=document.createElement('small');s.textContent=`${m.height?Math.round(m.height)+' m · ':''}${m.estimatedHeight?'高度估算':/landmark|huilan-pavilion|heritage|hill-park|bay-bridge/.test(m.kind||'')?'资料与实景复原 · 细尺寸估算':'OSM 地理轮廓'}`;$('picked').append(s);$('picked').classList.add('visible');}else $('picked').classList.remove('visible');}});
 const landmarkNav=document.createElement('select');landmarkNav.id='landmark-nav';landmarkNav.setAttribute('aria-label','地标导航');landmarkNav.innerHTML='<option value="">选择地标，走近青岛</option>';
 const views:{id:string;name:string;position:Vector3;radius:number;beta?:number;alpha?:number}[]=[...parks.views,...heritage.views,...beaches.views,...civic.views,...plazas.views,...bridge.views.map((v,i)=>({...v,id:'bridge-'+i})),{id:'fushan',name:'浮山 · 山地公园',position:new Vector3(10525.977,terrain.sample(10525.977,3239.23),3239.23),radius:1800,beta:1.35},{id:'laoshan',name:'崂山 · 巨峰',position:new Vector3(27822.451,terrain.sample(27822.451,12722.176)+30,12722.176),radius:4600,beta:1.28}];
 for(const v of views){const o=document.createElement('option');o.value=v.id;o.textContent=v.name;landmarkNav.append(o);}
 landmarkNav.onchange=()=>{const v=views.find(v=>v.id===landmarkNav.value);if(v)go(v.position.x,v.position.z,v.radius,v.name,v.beta??1.16,v.alpha??-Math.PI/2-.4,v.position.y);};
 document.querySelector('.modes')!.after(landmarkNav);
 const labelItems=[{id:'huilan',name:'回澜阁',position:world.pavilionPosition.add(new Vector3(0,18,0)),radius:60,beta:1.35},{id:'qingdao-station',name:'青岛火车站',position:world.stationPosition.add(new Vector3(0,45,0)),radius:220,beta:1.3},...views.map(v=>({...v,position:v.position.add(new Vector3(0,18,0))}))];
 const labels=createLandmarkLabels(scene,canvas,labelItems,v=>go(v.position.x,v.position.z,v.radius,v.name,v.beta??1.16,v.alpha??-Math.PI/2-.4,v.position.y-18));
 let labelsVisible=true;$('labels-toggle').onclick=()=>{labelsVisible=!labelsVisible;labels.setEnabled(labelsVisible);$('labels-toggle').classList.toggle('active',labelsVisible);$('labels-toggle').setAttribute('aria-pressed',String(labelsVisible));};$('panel-hide').onclick=()=>document.querySelector('.controls')!.classList.add('collapsed');
 const shadowCandidates=(shadows.getShadowMap()?.renderList||[]).map(mesh=>{mesh.computeWorldMatrix(true);const b=mesh.getBoundingInfo().boundingBox;return {mesh,minX:b.minimumWorld.x,maxX:b.maximumWorld.x,minZ:b.minimumWorld.z,maxZ:b.maximumWorld.z};});
 let lastShadowCull=-1;
 const map=$<HTMLCanvasElement>('minimap'),ctx=map.getContext('2d')!;let mb={minX:-1400,maxX:2250,minZ:-1400,maxZ:1750};
 function mapPoint(x:number,z:number){return[(x-mb.minX)/(mb.maxX-mb.minX)*map.width,map.height-(z-mb.minZ)/(mb.maxZ-mb.minZ)*map.height];}
 function drawMap(){const focus=mode==='orbit'?orbit.target:free.position;const range=mode==='orbit'?orbit.radius:free.position.y*3;const span=Math.max(3800,Math.min(180000,range*1.65));mb={minX:focus.x-span/2,maxX:focus.x+span/2,minZ:focus.z-span*.325,maxZ:focus.z+span*.325};
  ctx.clearRect(0,0,map.width,map.height);ctx.fillStyle='#254d66';ctx.fillRect(0,0,map.width,map.height);ctx.fillStyle='#758c7a';
  const lb=data.metadata.bounds;const nearOrigin=range<6500&&mb.minX>=lb.minX&&mb.maxX<=lb.maxX&&mb.minZ>=lb.minZ&&mb.maxZ<=lb.maxZ;const land=nearOrigin?data.land:regionalLand.land;for(const l of land){ctx.beginPath();for(const [i,p]of l.polygon.entries()){const v=mapPoint(p[0],p[1]);i?ctx.lineTo(v[0],v[1]):ctx.moveTo(v[0],v[1]);}ctx.closePath();for(const hole of l.holes||[]){for(const [i,p]of hole.entries()){const v=mapPoint(p[0],p[1]);i?ctx.lineTo(v[0],v[1]):ctx.moveTo(v[0],v[1]);}ctx.closePath();}ctx.fill('evenodd');}
  if(nearOrigin){ctx.strokeStyle='#aec6b2';ctx.lineWidth=1;for(const r of data.roads){ctx.beginPath();r.points.forEach((p:number[],i:number)=>{const v=mapPoint(p[0],p[1]);i?ctx.lineTo(v[0],v[1]):ctx.moveTo(v[0],v[1]);});ctx.stroke();}}
  const a=mapPoint(world.pavilionPosition.x,world.pavilionPosition.z);ctx.fillStyle='#f9e6bf';ctx.beginPath();ctx.arc(a[0],a[1],3,0,Math.PI*2);ctx.fill();const c=mapPoint(scene.activeCamera!.position.x,scene.activeCamera!.position.z);ctx.fillStyle='#e1edb6';ctx.beginPath();ctx.arc(c[0],c[1],4.5,0,Math.PI*2);ctx.fill();$('map-scale').textContent=`${span<12000?Math.round(span/6)+' m':(span/6000).toFixed(0)+' km'} ━`;
 }
 function updateSun(date:Date){solar=solarState(date);const d=solar.daylight;top.copyFrom(Color3.Lerp(new Color3(.023,.044,.085),new Color3(.15,.46,.76),d));horizon.copyFrom(Color3.Lerp(new Color3(.065,.105,.15),new Color3(.72,.87,.93),d));
  const golden=Math.max(0,1-Math.abs(solar.altitude-4)/15)*d;horizon=Color3.Lerp(horizon,new Color3(.88,.63,.41),golden*.48);sunColor=Color3.Lerp(new Color3(1,.60,.32),new Color3(1,.97,.88),Math.min(1,Math.max(0,solar.altitude)/28));
  const dir=new Vector3(solar.direction.x,solar.direction.y,solar.direction.z);sun.direction=dir.negate();sun.position=world.pavilionPosition.add(dir.scale(1100));sun.intensity=solar.sunlight>0?Math.max(.12,Math.pow(solar.sunlight,.4))*.9:0;sun.diffuse=sunColor;
  ambient.intensity=.30+d*.26;ambient.diffuse=Color3.Lerp(new Color3(.43,.56,.78),new Color3(.91,.97,1),d);scene.fogColor=horizon;
  sky.update(dir,new Vector3(solar.moonDirection.x,solar.moonDirection.y,solar.moonDirection.z),top,horizon,sunColor,d,solar.moonIllumination);
  $('clock').textContent=chinaTime(date);$('date').textContent=`${chinaDateParts(date).date} · 北京时间`;$('period').textContent=solar.altitude>6?'日间':solar.altitude>-6?'晨昏':'夜间';$('sun-altitude').textContent=`${solar.altitude.toFixed(1)}°`;$<HTMLInputElement>('hours').value=String(chinaDateParts(date).hours);
 }
 updateTimeState();updateSun(realtime?new Date():chinaInstant(day,hour));
 // Preserve the view the visitor explored while resources were arriving.
 try{const saved=JSON.parse(document.getElementById('quick-scene')?.dataset.camera||'null');if(saved&&saved.target?.length===3&&[...saved.target,saved.radius,saved.alpha,saved.beta].every((n:unknown)=>typeof n==='number'&&Number.isFinite(n))){orbit.setTarget(Vector3.FromArray(saved.target));orbit.radius=Math.max(35,Math.min(8000,saved.radius));orbit.alpha=saved.alpha;orbit.beta=Math.max(.2,Math.min(1.45,saved.beta));}}catch{}
 let revealed=false;
 engine.runRenderLoop(()=>{const dt=Math.min(engine.getDeltaTime()/1000,.05);elapsed+=dt;
  mapControls.update(dt);
  orbit.panningSensibility=canvas.clientHeight/(2*Math.max(20,orbit.radius)*Math.tan(orbit.fov/2)*(1-orbit.panningInertia));
  if(flight){const t=Math.min(1,(elapsed-flight.start)/1.8),ease=t*t*(3-2*t);orbit.setTarget(Vector3.Lerp(flight.from,flight.to,ease),false,true,true);orbit.alpha=flight.alpha+(flight.toAlpha-flight.alpha)*ease;orbit.beta=flight.beta+(flight.toBeta-flight.beta)*ease;orbit.radius=flight.fromRadius+(flight.toRadius-flight.fromRadius)*ease;if(t===1){$('map-title').textContent=flight.label;flight=null;}}
  if(mode!=='orbit'&&!$<HTMLDialogElement>('about').open){const forward=free.getDirection(Vector3.Forward());const right=free.getDirection(Vector3.Right());const fast=keys.has('ShiftLeft')||keys.has('ShiftRight');const input=new Vector3();if(keys.has('KeyW'))input.addInPlace(forward);if(keys.has('KeyS'))input.subtractInPlace(forward);if(keys.has('KeyD'))input.addInPlace(right);if(keys.has('KeyA'))input.subtractInPlace(right);
   if(mode==='fly'){if(keys.has('KeyE'))input.y+=1;if(keys.has('KeyQ'))input.y-=1;if(input.lengthSquared()>0)free.position.addInPlace(input.normalize().scale(dt*(fast?Math.max(150,free.position.y*.8):Math.max(45,free.position.y*.22))));free.position.y=Math.max(terrain.sample(free.position.x,free.position.z)+2,Math.min(100000,free.position.y));}
   else if(character){input.y=0;if(input.lengthSquared()>0)input.normalize();accumulator+=dt;let steps=0;while(accumulator>=1/60&&steps++<4){const velocity=character.getVelocity(),support=character.checkSupport(1/60,gravity);const desired=input.scale(fast?6:3.8);desired.y=nextVerticalVelocity(velocity.y,support.supportedState===CharacterSupportedState.SUPPORTED,jump,1/60);
    character.setVelocity(desired);character.integrate(1/60,support,gravity);accumulator-=1/60;jump=false;}
    const p=character.getPosition();if(p.y<-4||Math.abs(p.x)>5000||Math.abs(p.z)>5000){character.setPosition(walkSpawn);character.setVelocity(Vector3.Zero());toast('已返回栈桥入口');}free.position.copyFrom(character.getPosition().add(new Vector3(0,.65,0)));}
  }
  const active=scene.activeCamera!;scene.fogDensity=.000010/(1+Math.max(0,active.position.y)/6000);const viewTarget=mode==='orbit'?orbit.target:free.position;const detailDistance=mode==='orbit'?orbit.radius:free.position.y;world.setDetail(detailDistance);parks.setDetail(detailDistance);heritage.setDetail(detailDistance);bridge.setDetail(detailDistance,viewTarget);fushan.setDetail(detailDistance);regional?.update(elapsed,active.position,viewTarget);overview?.update(regional?.detailReady??(()=>false));terrain.setDetail(detailDistance,viewTarget);beaches.setDetail(detailDistance);civic.setDetail(detailDistance);plazas.setDetail(detailDistance);
  const sunDir=new Vector3(solar.direction.x,solar.direction.y,solar.direction.z),night=1-solar.daylight;regional?.cityMaterials.update(solar.daylight,elapsed,sunDir,horizon,lightShowEnabled);overview?.materials.update(solar.daylight,elapsed,sunDir,horizon,lightShowEnabled);world.setNight(night);parks.setNight(night,elapsed);heritage.setNight(night,elapsed);civic.setNight(night,elapsed);plazas.setNight(night,elapsed);metro?.update(elapsed,mode==='orbit'?orbit.radius:Math.max(800,free.position.y*3),solar.daylight,metroEnabled);
  sun.position=stableShadowPosition(viewTarget,sunDir);sun.shadowEnabled=detailDistance<5600;shadows.setDarkness(.25+.75*Math.max(0,Math.min(1,(detailDistance-3200)/2000)));shadows.getShadowMap()!.refreshRate=detailDistance<5600?(qualityHigh?1:2):0;

  if(elapsed-lastShadowCull>.15){lastShadowCull=elapsed;shadows.getShadowMap()!.renderList=shadowCandidates.filter(b=>b.mesh.isEnabled()&&Math.hypot(Math.max(b.minX-viewTarget.x,0,viewTarget.x-b.maxX),Math.max(b.minZ-viewTarget.z,0,viewTarget.z-b.maxZ))<1300).map(b=>b.mesh);}
  ocean.update(elapsed,new Vector3(solar.direction.x,solar.direction.y,solar.direction.z),sunColor,solar.daylight,top,horizon);scene.render();labels.update(elapsed);
  if(!revealed){revealed=true;window.dispatchEvent(new Event('qingdao-scene-ready'));$('boot-root')?.remove();}
  if(elapsed-lastHUD>.5){lastHUD=elapsed;const now=realtime?new Date():chinaInstant(day,hour);if(realtime){day=chinaDateParts(now).date;hour=chinaDateParts(now).hours;}updateSun(now);$('fps').textContent=`${Math.round(engine.getFps())} FPS`;$('altitude').textContent=`${scene.activeCamera!.position.y.toFixed(1)} m`;canvas.dataset.camera=JSON.stringify({target:orbit.target.asArray(),radius:orbit.radius,alpha:orbit.alpha,beta:orbit.beta,mode});drawMap();}
 });
 window.addEventListener('resize',()=>engine.resize());
 setTimeout(()=>void background.run(),0);
 (window as any).__demo={scene,engine,world,parks,heritage,bridge,get character(){return character;},setMode,solar:()=>solar,data,updateSun,terrain,get regional(){return regional;},region,beaches,civic,plazas,get overview(){return overview;},get metro(){return metro;},version:'0.5.1'};
}
start().catch(startupFailure);
