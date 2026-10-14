# 城市地标与五四广场地理资产

核验日期 2026-10-14；PBF 数据时刻 2026-10-11T20:21:06Z。`public/data/civic-landmarks.json` 仅包含真实 OSM 节点/轮廓和明确说明的派生位置、筛选结果，没有按商业地图截图手动加坐标偏移。

投影仍为 WGS84 AEQD：原点经度 120.3163、纬度 36.0603，X 向东、Z 向北，单位米。节点坐标直接来自 OSM；polygon 的 `position` 是实际几何质心，属于派生坐标，不能称为官方测绘控制点。

## 核心地标

| 对象 | OSM ID | AEQD X / Z | WGS84 经度 / 纬度 | 几何依据 |
| --- | --- | --- | --- | --- |
| 青岛电视塔 | way/179057050 | 3058.17 / 950.44 | 120.3502475 / 36.0688608 | 命名 communications tower 的实际圆形外轮廓；OSM height=232 |
| 五月的风 | way/539970693 | 5752.32 / 103.15 | 120.3801480 / 36.0612126 | 实际 `tourism=artwork, artwork_type=sculpture` 轮廓质心 |
| 市政府位置标记 | node/11432724805 | 5515.44 / 732.54 | 120.3775232 / 36.0668862 | 真实 named city townhall 节点，香港中路11号 |
| 市政府主楼 | way/275858482 | 5516.08 / 728.44 | 派生质心 | 包含上述真实市府节点的弧形 office polygon，building:levels=12 |

OSM 将五月的风映射为圆形 sculpture **way**，本范围没有独立雕塑中心 node。本版保留这条真实轮廓，并使用它的质心作为模型锚点，没有凭空生成“OSM 中心节点”。轮廓约 27m 直径，不等同于雕塑各层金属卷曲表面。

电视塔的 232m 为实际 OSM `height` 标签，尚未独立核对官方竣工高程基准；不能把它宣称为最新官方测量。市府主楼有实际 12 层标签，38.4m 是 12×3.2m 的视觉高度估算，`estimatedHeight=true`。原弧形 polygon 和层数完整保留，不采用长方盒替换地理数据。

五四广场保留 way/241481796 和 relation/7929937、7929938、14357232。这些分别代表公园/步行广场的不同北南范围，部分重叠；真实 inner holes 保留，不能把所有面再累加当作面积，也不能把 park-outline 自动视为全草坪。剔除了名字包含五四广场的商店、社区、码头、地铁站等错误命中。

`governmentBuildings` 仅以“真实 named 市府节点落在真实 building polygon 内”确定主楼；`governmentAdjacentBuildings` 单独保留实际命名的市级机关会议中心与信访接待中心。没有把其他无关 `amenity=townhall` 街道办建筑当成市政府，也未自造政府院落边界。

## 官方位置核对

- [青岛市政府办公厅政府信息公开指南](http://www.qingdao.gov.cn/zwgk/xxgk/bgt/gkzn/)：地址为香港中路11号市级机关一期办公大楼，与 OSM 市府节点的 `addr:street`、`addr:housenumber` 一致。官方页面支持地址身份，未提供 WGS84 测绘坐标。
- [青岛市政府五四广场介绍](http://www.qingdao.gov.cn/yfqd/qdwl/cjfw/wyqgy/202009/t20200903_520360.shtml)：广场位于市级机关办公楼南面，东海路分隔南北区，五月的风位于观海迎月台；南北真实 OSM 几何与此空间关系相符。页面并未提供可据以校正经纬度的测绘点。
- [OpenStreetMap 青岛电视塔](https://www.openstreetmap.org/way/179057050)：实际身份标签为电视 communications tower，本文坐标及 height 来源于这条原始数据；未取得独立官方坐标，不补造测绘精度声明。

官网公开 HTTP 页面可以读取，HTTPS 在本环境出现连接异常；正文留存在 `sources/civic-government-guide.html`、`sources/civic-detail-0.txt`。这些是参考副本，不作为运行贴图发布。

## 沿海楼群筛选

`coastalBuildings` 保留 139 个实际 building footprint，范围为经度 120.33–120.42、纬度 36.04–36.09；限定在 OSM 陆地、距真实 OSM coastline 不超过 1500m，且高度标签>40m 或层数>12。30 栋有实际 height 标签，其余 109 栋由层数×3.2m估算。无高度/层数的楼体被遗漏，未按密度造楼。

每楼 `{id,name,polygon,holes,position,longitudeLatitude,tags,height,estimatedHeight,levels,heightSource,shoreDistance}`。这是**灯光效果的地理候选楼群**，不是经过管理方核对的灯光秀参演名单、真实灯幕尺寸或灯光节目；筛选策略与误差在 metadata 中说明。

## 广场真实地景补充

`scripts/extract-civic-plazas.py` 使用 [官方 OSM map API 小范围快照](https://api.openstreetmap.org/api/0.6/map?bbox=120.374,36.060,120.383,36.069)，下载日期 2026-10-14，原 XML 保存在 `sources/civic-plazas.osm.xml`。该快照比主 PBF 晚约3天，单独记录来源时间。

新增 50 个实际 landscape 面：32 planting（`landuse=grass` / `leisure=garden`）、10 paved-plaza（`area=yes, highway=pedestrian`）、1 fountain polygon、7 park-outline。另有 37 条实际 footway/path/steps/pedestrian 步道，multipolygon 洞完整保留，缺失 member ways 为0。

```text
features[] = {id,kind,name,tags,geometryType,position,
  polygon?,holes?,points?,longitudeLatitude?}
governmentBuildings[] / governmentAdjacentBuildings[] = 实际楼体与辨识说明
coastalBuildings[] = 实际高楼及筛选依据
plazaAreas[] = {id,name,kind,tags,polygon,holes,position}
plazaPaths[] = {id,type,name,points,width,estimatedWidth,tags}
plazaNodes[] = 仅节点标记的喷泉（本次为0）
```

没有自绘草坪矩形或虚构铺装范围。park-outline 是公园边界，不能直接涂成草。缺少宽度的步道默认 2m 用于视觉显示，`estimatedWidth=true`；节点喷泉若未来存在，仅有点位，不含测绘半径。

重建：

```powershell
python scripts/extract-civic.py
python scripts/extract-civic-plazas.py
python scripts/verify-city-assets.py
```

首轮 PBF 提取较慢；已留存 `sources/civic-osm-selection.json`，可使用 `python scripts/extract-civic.py --cached` 重建地标和沿海楼群，再运行 plaza 脚本追加景观。OSM 数据归属为 © OpenStreetMap contributors / ODbL 1.0，许可见 [OpenStreetMap copyright](https://www.openstreetmap.org/copyright)。
