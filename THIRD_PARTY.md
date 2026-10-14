# 来源与第三方许可

- OpenStreetMap contributors：地理数据，ODbL 1.0。归属：https://www.openstreetmap.org/copyright 。原始官方地图API https://api.openstreetmap.org/api/0.6/map 。派生scene.json与岸线纹理沿用ODbL数据许可。
- Babylon.js / @babylonjs/core：Apache-2.0，引擎、几何、材质、反射、物理接口。https://github.com/BabylonJS/Babylon.js
- @babylonjs/havok：MIT，浏览器WASM物理。https://github.com/BabylonJS/havok
- Earcut：ISC，多边形三角化。https://github.com/mapbox/earcut
- SunCalc：BSD-2-Clause，太阳/月亮天文计算。https://github.com/mourner/suncalc
- TypeScript：Apache-2.0；Vite：MIT，开发与构建工具。
- Mapzen / AWS Terrain Tiles：真实高程，2026-10-12访问；上游归属与许可见 https://github.com/tilezen/joerd/blob/master/docs/attribution.md ，包括SRTM等。https://registry.opendata.aws/terrain-tiles/
- DataV GeoAtlas：八区市概化导航边界；GCJ-02转换见 public/data/SOURCES.md 。https://geo.datav.aliyun.com/areas_v3/bound/370200_full.json

海面shader是本项目独立实现，不复制外部shader源码；参考three.js MIT许可的Water.js关于平面反射与菲涅耳组合的设计，以及公开的深水方向波关系ω²=gk。

参考：https://github.com/mrdoob/three.js/blob/dev/examples/jsm/objects/Water.js

未嵌入Google、高德、百度的地图瓦片、街景或卫星影像。所有运行资源随静态包提供，浏览器无需在线地图API密钥。

## 地标建筑参考

回澜阁/栈桥/青岛站的报刊实景与建筑文字资料仅作模型参考，未将报刊或旅游网站照片作为运行贴图。模型几何及黄色瓦面、红瓦、窗格、钟盘、牌匾、石材等程序纹理为原创。参考链接及已知/估算尺寸见 public/data/LANDMARKS.md，详细方法见 docs/pavilion-references.md 和 docs/station-references.md。地理基底依然遵循 OSM / ODbL。

胶州湾大桥、信号山、小鱼山、总督府/官邸、青啤博物馆、海大鱼山校区和大学路红墙的资料与照片也仅用作外观研究。派生地理数据见 heritage.json / bay-bridge.json，复原依据见 public/data/CITY-LANDMARKS.md 及 docs/。新增窗、瓦、石材、牌匾均采用原创程序纹理，研究照片不进入发布包。
