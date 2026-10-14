# 青岛 · 山海之城 Demo

Babylon.js + TypeScript + Havok 的浏览器游戏场景原型。覆盖市南、市北、李沧、崂山、城阳、黄岛、即墨、胶州，保留栈桥与青岛湾近景。真实 OSM 轮廓和 DEM 地形，1 单位 = 1 米。

## 启动

Node.js 22.12+，本机以 Node.js 24 验证。

```powershell
npm install
npm run dev
```

打开 http://127.0.0.1:5173/ 。也可双击 start-demo.cmd。默认跟随当前北京时间；/?time=day 以明确标示的日间预览打开，可随时点“跟随实时”。

npm run build 执行 TypeScript 检查并构建，npm run preview 预览生产包，npm test 检查地理、高程、太阳与角色重力。

## 已实现

- 八个区市的行政导航、真实山地与海湾，镜头在目标间平滑过渡。
- 回澜阁和青岛站依据实景、建筑资料及 OSM 单独复原：黄色双层八角飞檐、24柱与窗格彩绘；现代青岛站黄墙红瓦、花岗岩饰面、拱门、半木构山墙、钟楼与翼楼。新增“青岛站”近景导航。资料、已知尺度与照片估算见 [public/data/LANDMARKS.md](public/data/LANDMARKS.md)。
- 新增胶州湾大桥真实双幅线路、海上互通和三种航道桥；信号山三座红球观景楼、小鱼山三层绿瓦览潮阁、总督府与迎宾馆、登州路啤酒博物馆、海大鱼山校区历史楼群、大学路鱼山路红墙。地标导航包含12个目标，米制地理坐标保留。参考与估算界限见 [public/data/CITY-LANDMARKS.md](public/data/CITY-LANDMARKS.md)。
- 全域400米DEM网格，旧城6.4×6.4公里使用32米网格，浮山4.8×4.4公里使用40米网格；崂山最高采样点1031.47米，地形没有垂直夸张。
- 栈桥附近约4250栋建筑、2339条道路，500米街区合批。全域23758栋建筑组织为1762个2公里分块，按镜头位置逐步加载，并保留有限缓存。旧城区使用赤瓦、柔和立面和绿树。
- 远景使用简化主道路，细节道路贴地分层；对数深度、深度偏移、mipmap、FXAA降低缩放闪烁。近景仅提交当前焦点附近的阴影，大桥按地理范围裁剪，远海细浪及栈桥反射随距离简化。远处关闭标线、细栏杆和小路，高空不加载细建筑。
- 独立GLSL波浪、细浪法线、菲涅耳反射、栈桥倒影、区域/近岸泡沫。真实OSM陆海mask保留海湾和岛屿。
- UTC+8实时太阳/月亮位置、晨昏、夜空，全天预览、海面参数和节能画质。

观景：左键拖拽地图、右键旋转、滚轮围绕鼠标位置平滑缩放。步行：WASD、Shift、Space；飞行：WASD、Q下降、E上升、Shift加速，速度随高度提高。桌面点击画面锁定鼠标，Esc退出。

步行Havok碰撞覆盖栈桥与周边详细区域；全域目前使用自由飞行/观景。没有飞机动力学或全域动态碰撞流送。手机可触摸平移、双指缩放观景，键盘步行/飞行以桌面为目标。

## 数据与精度

原点120.3163°E、36.0603°N，WGS84 AEQD投影；X东、Z北、Y上。DataV边界GCJ-02先逆变换再投影；行政边界概化，陆海裁切采用OSM海岸。

```text
+proj=aeqd +lat_0=36.0603 +lon_0=120.3163 +datum=WGS84 +units=m +no_defs
```

区域运行范围约140×117公里。地形取真实DEM，陆地最低渲染高程2.4米是与波浪分离的视觉处理。400米网格会丢失小山脊；DEM不能视为测绘路面。后续应增加更细地形LOD、地理分块碰撞和浮动原点。

栈桥OSM外轮廓主轴约405.55米，主体约8米宽，保留源几何；介绍资料常见440米的定义不同。桥面海拔约4米；回澜阁与青岛站为资料及实景驱动的参数化复原，未取得施工图的细尺寸仍为估算。区域321栋建筑具有height，5084栋按楼层估计，18353栋按类型估计；无OSM轮廓处不虚构建筑。部分仅由relation表达的建筑可能缺失。

局部OSM下载于2026-10-12，区域Geofabrik山东PBF日期2026-10-11。完整来源、估计标记、许可、DEM编码与schema见 [public/data/SOURCES.md](public/data/SOURCES.md)。原始PBF、DEM瓦片、OSM缓存保存在本地sources/，不进入发布资源或Git；站点提供派生运行数据和来源记录。

数据脚本（按需执行，优先本地缓存）：

```powershell
python scripts/fetch-osm.py
python scripts/fetch-region.py
python scripts/extract-regional-osm.py
python scripts/build-regional-shore.py
python scripts/extract-heritage.py
python scripts/extract-bay-bridge.py
python scripts/refine-landmark-terrain.py
```

Python需requests、numpy、Pillow、shapely、pyproj、scipy、osmium，OSM依赖见scripts/regional-osm-requirements.txt；重新获取前备份对应sources/缓存。

## 扩展入口

- src/world.ts：栈桥、局部建筑/道路、公园、地标集成、近景LOD与碰撞。
- src/pavilion.ts、src/station.ts：回澜阁和青岛站独立建筑几何、纹理、坐标与碰撞；模型参考见 docs/ 与 public/data/LANDMARKS.md。
- src/map-controls.ts：按地理平面拖拽、鼠标锚点平滑缩放与防误点击。
- src/bay-bridge.ts、src/heritage-buildings.ts、src/hill-parks.ts、src/fushan.ts：独立米制地标和距离裁剪。
- src/terrain.ts、src/height.ts：真实高程、米制采样、宏观/精细地形和陆海裁切。
- src/regional.ts：主道路、地理建筑分块加载和缓存。
- src/ocean.ts：海面shader、反射与海岸距离。
- src/solar.ts：绝对时间和UTC+8太阳/月亮计算。
- src/main.ts：相机、物理、导航、光照与界面。

本版无需Blender，模型由参数化几何生成。后续可用米制glTF/GLB替换地标，保留同一地理锚点。海浪、潮位、天气、补光是视觉表现，未接实测海况；未含车辆、人物AI、室内和交通。

## 验证与许可

19项测试覆盖左右键交互、拖动后防误点击、三种航道桥及桥面法线、地标入口位置、八区范围、全部分块完整性、海陆样点、崂山真实高程、格网南北方向、栈桥/回澜阁位置、地标米制包围盒/索引/法线/站房替换与地理对齐、UTC+8跨日、太阳方向和角色自由落体。浏览器检查近景、山地、八区导航、时间、步行/飞行、海面和画质切换。FPS依赖设备及硬件加速，界面实时显示。

地图数据 © OpenStreetMap contributors，ODbL1.0。DEM为AWS/Mapzen Terrain Tiles，上游归属见来源文档。依赖和海面参考见THIRD_PARTY.md。静态包包含运行资源，无地图API密钥。
