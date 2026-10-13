# 地理数据与高程来源

所有本地场景数据使用 WGS84 的局部 AEQD 米制投影：
`+proj=aeqd +lat_0=36.0603 +lon_0=120.3163 +datum=WGS84 +units=m +no_defs`。
轴为 x 向东、z 向北、y 向上。渲染坐标与距离为真实米制。

## 栈桥详细场景

- 来源：[OpenStreetMap 官方 map API](https://api.openstreetmap.org/api/0.6/map?bbox=120.295,36.045,120.345,36.078)。
- `sources/source-osm.xml.gz` 保存原始 XML，包含关系数据；`sources/source-osm.json.gz` 保存用于首版场景的选中 way 几何。
- `scene.json` 包含 4251 个 OSM 建筑、2339 条道路、14 条海岸线、28 处码头、2 个陆地区域。
- 栈桥：`way/1474305748`；回澜阁：`way/131985941`。栈桥多边形主轴包围矩形长约 405.55 米。该值是 OSM 映射多边形的测量，和介绍资料中的 440 米定义可能不同。
- 建筑高度：明确 `height` 标签为已提供高度；`building:levels × 3.2m` 和类型缺省高度均为估计，以 `estimatedHeight=true`、`heightSource` 显式标记。共有 4200 个建筑没有明确 height 标签。
- 道路宽度：有 width 标签时按标签，否则按道路类型估计。
- 首版只提取 way 建筑，relation-only 多重多边形建筑可能缺失。原始 XML 留存供进一步处理。
- 海岸方向按 OSM 定义陆地在左侧，利用边界多边形化建立陆地与小青岛岛屿面。青岛站为陆地、湾中央为海、小青岛灯塔为陆地已经验证。
- `shore-distance.png` 为 1024×1024 非颜色纹理。R=海岸距离/100 米，G=陆地 mask。图片第一行北、最后一行南；`scene.json.shoreTexture` 含投影边界和 UV 约定。
- 归属：[© OpenStreetMap contributors，ODbL 1.0](https://www.openstreetmap.org/copyright)。

## 八区市边界

- 来源：[DataV GeoAtlas 青岛全市行政区](https://geo.datav.aliyun.com/areas_v3/bound/370200_full.json)。保存原始 `sources/qingdao-boundaries-source.json`。
- 选择市南、市北、李沧、崂山、城阳、黄岛、即墨、胶州；排除平度、莱西。
- [DataV 官方坐标说明](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/map-data-format-1) 为 GCJ-02，代码先做迭代逆变换得到近似 WGS84，再投影 AEQD。`districts.geojson` 为转后的经纬度边界。
- 行政区形状为概化边界，不能替代详细海岸线、地籍或法定行政边界。

## 真实地形

- 来源：[AWS 开放数据 Terrain Tiles / Mapzen](https://registry.opendata.aws/terrain-tiles/)。
- 原始下载：[elevation-tiles-prod Terrarium](https://s3.amazonaws.com/elevation-tiles-prod/terrarium/)。
- 编码：[Terrarium 官方格式说明](https://github.com/tilezen/joerd/blob/master/docs/formats.md)：高度米 = R×256 + G + B/256 − 32768。
- [数据源及归属要求](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)。地区数据由 SRTM 等真实公开高程数据构成。
- `sources/dem-source/*.png` 保存全部源瓦片；`region.json` 保存各瓦片 z/x/y 与来源。原始瓦片不发布到站点，仅发布采样后的运行文件。
- 全域原始 z11 约 62 米像元；应用采样为 400 米规则网格（351×294=103194 点），`regional-height.f32`。
- 栈桥 6×6 公里使用 z12 源瓦片采样 60 米网格（101×101），`zhanqiao-height.f32`。
- 二进制高度为 **little-endian float32、行优先、首行北=maxZ、末行南=minZ**。读取宽高、bounds、spacing 时以 `region.json` 为准；使用双线性采样，避免生成无依据的山形。
- 区域 DEM 最大采样高程 1031.47 米；400 米网格会削弱细小山脊或山顶，后续可用原始瓦片继续细化。
- 源数据海水位置多为 0，少量像元出现异常深负高程（区域 30 点小于 −100 米）。原始值未改写。海面保持独立 0 米水层，陆地/水域使用真实海岸线 mask；海上相机和游戏物理不要直接追随海域 DEM 深度。
- DEM 为地形数据，不能当作经过测量的路面高程；建筑与桥梁须另设地面/桥面高度。

## 重建

在项目根目录：

```powershell
python scripts/fetch-osm.py
python scripts/fetch-region.py
```

需要 requests、numpy、Pillow、shapely、pyproj，区域海岸纹理需要 scipy。脚本优先使用本地缓存，不重复大范围请求。

## 八区市道路、建筑和海岸

- [Geofabrik 山东 OpenStreetMap PBF](https://download.geofabrik.de/asia/china/shandong-latest.osm.pbf)，原始文件位于 sources，约 71.6 MB，不发布到站点。
- 数据时间为 2026-10-11T20:21:06Z；归属和许可仍为 © OpenStreetMap contributors、ODbL 1.0。
- 区域提取结果：23758 个建筑、50748 条原道路、1762 个 2 公里分块；分块道路可能因跨格而出现多个片段，总分块道路片段 65628。总 JSON 约 18.36 MB，按需加载。
- 建筑高度：321 栋提供明确 height，5084 栋按楼层推算，18353 栋使用类型默认值。无明确高度的建筑均标记 estimatedHeight。
- `regional-roads.json` 保存 17130 个简化主道路片段、287 个海岸线片段，服务高空视角。
- `regional-land.json` 保存 107 个真实海岸拼接陆地多边形，可保留岛屿和海湾。
- `regional-land-mask.png` 为全域 2048 的 RGBA 白色 alpha 陆海裁切；`detail-land-mask.png` 为栈桥 6 公里范围 1024 的细裁切。alpha=255 陆、0 海。栈桥源 bbox 内以 scene.json.land 优先，外圈用区域 OSM 陆地。
- 两张 mask 图片首行北，Babylon `invertY=false`、UV `u=(x-minX)/widthMetres; v=(maxZ-z)/heightMetres`。
- `regional-shore.png` R 为栅格化海岸距离/100 米、G 为陆海 mask；全域像素约68×57米，距离是栅格近似。栈桥使用 `shore-distance.png` 精确局部距离。
- 重建区域 OSM：`python scripts/extract-regional-osm.py`；更新区域裁切纹理：`python scripts/build-regional-shore.py`。

## 单独复原的地标

2026-10-13更新：回澜阁、栈桥和青岛站使用建筑资料与实景参考独立复原。黄色琉璃瓦、24亭柱、151㎡占地及历史钟楼35m等已知值，与按照片估算的细部区别列于 [LANDMARKS.md](LANDMARKS.md)。真实OSM坐标和平面保留，不因文献栈桥440m而拉伸405.55m源多边形。青岛站 way/1465995439、way/1465995441、way/1465995440 的普通楼模型由地标模块替换。
