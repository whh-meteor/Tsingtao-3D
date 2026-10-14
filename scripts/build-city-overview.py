"""Real OSM building far-LOD rectangles and observed-footprint statistics.
Every row corresponds to one source building; no random density-based infill is added.
"""
from pathlib import Path
from collections import defaultdict
import json,math,sys,datetime
from shapely.geometry import Polygon,box
sys.stdout.reconfigure(encoding='utf8')
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public'/'data';CHUNKS=OUT/'chunks'
index=json.loads((CHUNKS/'index.json').read_text(encoding='utf8'))
rows=[];seen=set();tileStats=[];cells={};heightSources=defaultdict(int);areaRatios=[]
CELL=250
def finitePolygon(points):return len(points)>=3 and all(math.isfinite(v) for p in points for v in p)
def cell(ix,iz):
 key=f'{ix}_{iz}'
 if key not in cells:cells[key]={'ix':ix,'iz':iz,'area':0,'buildings':set(),'minX':math.inf,'minZ':math.inf,'maxX':-math.inf,'maxZ':-math.inf}
 return cells[key]
for item in index['chunks']:
 p=ROOT/'public'/item['file'].lstrip('/');chunk=json.loads(p.read_text(encoding='utf8'));count=0;area=0;heights=[];xx=[];zz=[]
 for building in chunk['buildings']:
  ident=building['id']
  if ident in seen:continue
  seen.add(ident);points=building['polygon'];assert finitePolygon(points),ident
  poly=Polygon(points)
  if not poly.is_valid:poly=poly.buffer(0)
  if poly.is_empty or poly.area<.01:continue
  rect=poly.minimum_rotated_rectangle;corners=list(rect.exterior.coords);cx=rect.centroid.x;cz=rect.centroid.y
  edges=[(corners[1][0]-corners[0][0],corners[1][1]-corners[0][1]),(corners[2][0]-corners[1][0],corners[2][1]-corners[1][1])]
  lengths=[math.hypot(*e) for e in edges]
  longest=0 if lengths[0]>=lengths[1] else 1;dx,dz=edges[longest];width=lengths[longest];depth=lengths[1-longest]
  angle=math.atan2(-dz,dx)
  while angle>math.pi/2:angle-=math.pi
  while angle<=-math.pi/2:angle+=math.pi
  height=building['height'];assert math.isfinite(height) and height>0
  rows.append([ident,round(cx,1),round(cz,1),round(width,1),round(depth,1),height,round(angle,5),int(building.get('estimatedHeight',True))])
  heightSources[building.get('heightSource','unknown')]+=1;areaRatios.append(rect.area/poly.area);count+=1;area+=poly.area;heights.append(height)
  a,b,c,d=poly.bounds;xx.extend([a,c]);zz.extend([b,d])
  # Intersections restrict the statistics to real observed building footprints, including boundary-crossing buildings.
  for ix in range(math.floor(a/CELL),math.floor(c/CELL)+1):
   for iz in range(math.floor(b/CELL),math.floor(d/CELL)+1):
    cut=poly.intersection(box(ix*CELL,iz*CELL,(ix+1)*CELL,(iz+1)*CELL))
    if cut.is_empty or cut.area<.01:continue
    ca,cb,cc,cd=cut.bounds;v=cell(ix,iz);v['area']+=cut.area;v['buildings'].add(ident)
    v['minX']=min(v['minX'],ca);v['minZ']=min(v['minZ'],cb);v['maxX']=max(v['maxX'],cc);v['maxZ']=max(v['maxZ'],cd)
 if count:tileStats.append({'id':item['id'],'bounds':item['bounds'],'buildingCount':count,'footprintArea':round(area,1),'footprintCoverage':round(area/4000000,5),'observedBounds':{'minX':round(min(xx),1),'maxX':round(max(xx),1),'minZ':round(min(zz),1),'maxZ':round(max(zz),1)},'meanHeight':round(sum(heights)/len(heights),1)})
urbanCells=[[c['ix'],c['iz'],round(c['area'],2),len(c['buildings']),round(c['minX'],3),round(c['minZ'],3),round(c['maxX'],3),round(c['maxZ'],3)] for c in sorted(cells.values(),key=lambda x:(x['ix'],x['iz']))]
ratios=sorted(areaRatios)
data={'metadata':{'name':'真实OSM建筑远景LOD','source':'Derived exclusively from public/data/chunks/*.json','sourceTimestamp':'2026-10-11T20:21:06Z','attribution':'© OpenStreetMap contributors','license':'ODbL 1.0','projection':'+proj=aeqd +lat_0=36.0603 +lon_0=120.3163 +datum=WGS84 +units=m +no_defs','origin':{'longitude':120.3163,'latitude':36.0603},'generatedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'coverage':'OSM-mapped buildings within Shinan, Shibei, Licang, Laoshan, Chengyang, Huangdao, Jimo and Jiaozhou. Missing buildings are not invented. This is an observed-footprint proxy, not a full urban land-use survey.','lodPolicy':'All source buildings retained one-to-one, represented by their actual minimum rotated enclosing rectangle. Original detailed footprints, names and height-source tags remain in chunks. Rectangle corners may overfill concave roofs; positions/dimensions are rounded to 0.1m and rotation to 1e-5rad.','rotationConvention':'rotationY in radians: local width axis maps to world (cos(angle), -sin(angle)) in XZ, matching Babylon rotation.y. Width is the longest rectangle edge.','buildingCount':len(rows),'estimatedHeightCount':sum(r[7] for r in rows),'heightSourceCounts':dict(heightSources),'rectangleAreaRatioMedian':round(ratios[len(ratios)//2],4),'rectangleAreaRatioP95':round(ratios[int(len(ratios)*.95)],4),'urbanCellNote':'250m cells contain only intersections of actual source building footprints. Sum area is not a union and overlapping parts can double-count. Observed bounds are footprint envelopes within each cell, never whole administrative polygons. Use area/count as a coverage proxy; do not label cells as surveyed urban landcover.'},'bounds':index['bounds'],'buildingColumns':['id','x','z','width','depth','height','rotationY','estimatedHeightFlag'],'buildings':rows,'tiles':tileStats,'urbanCellSize':CELL,'urbanCellColumns':['ix','iz','footprintArea','buildingCount','minX','minZ','maxX','maxZ'],'urbanCells':urbanCells}
assert len(rows)==len(seen),'Unexpected invalid/empty source footprint'
assert len(rows)==23758,'Source building count changed; review coverage documentation'
assert all(all(math.isfinite(x) for x in r[1:]) for r in rows)
(OUT/'city-overview.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('BUILDINGS',len(rows),'TILES',len(tileStats),'URBAN CELLS',len(urbanCells),'HEIGHT SOURCES',dict(heightSources),'AREA RATIO median/p95',data['metadata']['rectangleAreaRatioMedian'],data['metadata']['rectangleAreaRatioP95'],'BYTES',(OUT/'city-overview.json').stat().st_size)
