# 青岛地铁真实数据与建筑远景 LOD

核验日期：2026-10-14。地理数据从现有 Geofabrik 山东 OSM PBF 提取，数据时刻 2026-10-11T20:21:06Z；© OpenStreetMap contributors，ODbL 1.0。

## 地铁

`public/data/metro.json` 采用与城市场景一致的 WGS84 AEQD 投影：原点经度 120.3163、纬度 36.0603，X 向东 / Z 向北，单位米。`scripts/extract-metro.py` 筛选 `type=route, route=subway`，依据青岛网络标签和八条线路的 Wikidata 标识排除济南关系，解析原 relation 成员，不将车站连接成虚构直线。

[青岛地铁官方网站](https://www.qd-metro.com/)于核验日成功读取并留存 `sources/metro-official-home.html`，首页列明 1、2、3、4、6、8 号线、蓝谷快线、西海岸快线。后两条在 OSM 对应 ref 11、13。本版 display name 按官网命名，原关系名称、ref、颜色、OSM ID 与 tags 保留。首页还展示地铁建设内容，**本数据不是经过运营方核对的实时开通区间、运营站点或时刻表**；OSM 可提前绘制隧道、未开通区段或保留旧端点。不能仅据 relation 的 from/to 判断线路全段已运营。

schema：

```text
lines[] = {id, ref, name, color, osmNames, relationIds,
  segments:[{id,points:[[x,z]],tags,status,length}],
  stations:[{id,name,position:[x,z],longitudeLatitude,tags,memberIds,...}],
  stationMembers:[原始全部OSM stop节点], missingMembers, platformWayIds,
  operatingStatus, stationGlyphPolicy}
relations[] = {id,lineRef,tags,members:[{id,type,role}]}
```

`8快速` 属于 8 号线服务分支，按数字 ref 聚合到 8 号线光效，关系原始 ref 不改。双向共享同一 way 时在该线路内去重；两条真实平行轨道依然保留，因此 `segments.length` 求和通常接近双向轨道长度，不能当作线路营业里程。平台 way 不作为轨道线显示。

每段 `points` 均来自原始 member way，并投影至米制空间；缺失成员记录在 `missingMembers`，不跨缺口补直线。`status=construction` 仅在原 way 有明确 construction 标签时产生，否则写 `osm-route`，**不是已运营断言**。本次提取没有缺失 way；现有 route member way 均未带 construction 标签，但这不证明官网建设区间已经开通。

站点 marker 将同名且相距不超过 220m 的双向停靠点合并显示，仍选择其中第一条真实 OSM 坐标，不人为造中心点。对应全部原节点 ID 位于 `memberIds`，原始成员保存在 `stationMembers`。跨线路换乘站可能分别出现，应由显示层根据实际位置处理。地下线路光效使用真实水平投影贴近地面，不代表实际隧道深度；没有可核实的纵断面数据。

最终八条线的轨道 way 数依次为 21、8、11、4、6、19、26、10，共 105；同名站点 marker 数依次为 41、25、22、25、21、17、21、23，共 195（含跨线重复站名）。这是 **OSM 所映射范围**。

## 全域建筑 overview

`public/data/city-overview.json` 从既有 2km chunks 聚合，保留 23,758 个真实建筑 ID，一楼对应一条远景记录，没有虚构房屋补密度。文件约 1.86MB。真实轮廓、名字和高度依据保存在原 chunk 文件。

```text
buildingColumns = [id,x,z,width,depth,height,rotationY,estimatedHeightFlag]
buildings = tuple[]
tiles[] = {id,bounds,buildingCount,footprintArea,footprintCoverage,
  observedBounds,meanHeight}
urbanCellColumns = [ix,iz,footprintArea,buildingCount,minX,minZ,maxX,maxZ]
urbanCellSize = 250
urbanCells = tuple[]
```

每楼由真实 polygon 的最小面积旋转外接矩形表示；width 为长边，depth 为另一边，x/z 是此矩形实际中心。`rotationY` 可直接用于 Babylon：本地宽度 X 轴旋转后在世界 XZ 的方向为 `(cos(angle), -sin(angle))`。尺寸/位置保留 0.1m，角度保留 1e-5 rad。外接矩形可能填平凹屋面，本版矩形面积与原轮廓面积比中位数 1.0018、95 百分位 1.7105，已记录元数据；它是远景 LOD，不是详细楼体测绘。

高度继续采用原数据：321 栋有 OSM `height` 标签，5,084 栋由楼层数×3.2m 估算，18,353 栋采用类型默认估算；后两类 `estimatedHeightFlag=1`。没有把估算高度宣传为测量值。

659 个有观测建筑的 2km tiles 和 6,548 个 250m cells 提供**真实建筑 footprint 相交统计**，用于生成城市覆盖度色彩。observedBounds 是建筑实际范围，不是行政区范围或整格自动城市化；`footprintArea` 为原 footprint 面积累加，建筑重叠/部件可能重复计数，不能当作完整城市建设用地调查。缺少 OSM 建筑的地方保留空缺。

生成与验证：

```powershell
python scripts/extract-metro.py
python scripts/build-city-overview.py
python scripts/verify-city-assets.py
```

原始 PBF 和网络页面保留在 `sources/`；浏览器仅加载派生 JSON。OSM 许可与归属见 [OpenStreetMap copyright](https://www.openstreetmap.org/copyright)，原下载来源见 [Geofabrik 山东](https://download.geofabrik.de/asia/china/shandong.html)。
