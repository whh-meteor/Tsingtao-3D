"""Real OSM civic features and nearby coastal high-rise candidate footprints.
Candidates are a geographic height filter, not a verified light-show participant list.
"""
from pathlib import Path
import os,sys,json,re,math,datetime
import osmium
from shapely import wkb
from shapely.geometry import Polygon,LineString,Point
from shapely.ops import transform,unary_union
from pyproj import Transformer
sys.stdout.reconfigure(encoding='utf8')
ROOT=Path(__file__).resolve().parents[1];os.chdir(ROOT);OUT=ROOT/'public'/'data'
PROJ='+proj=aeqd +lat_0=36.0603 +lon_0=120.3163 +datum=WGS84 +units=m +no_defs';T=Transformer.from_crs('EPSG:4326',PROJ,always_xy=True)
coasts=json.loads((OUT/'regional-roads.json').read_text(encoding='utf8'))
coast=unary_union([LineString(c['points']) for c in coasts['coastlines']])
land=json.loads((OUT/'regional-land.json').read_text(encoding='utf8'))
landGeometry=unary_union([Polygon(l['polygon'],l.get('holes',[])) for l in land['land']])
features=[];candidates=[];buildings=[];seen=set()
def within(lon,lat):return 120.33<=lon<=120.42 and 36.04<=lat<=36.09
def kind(tags):
 name=tags.get('name:zh',tags.get('name',''))
 if '五月的风' in name or '五月之风' in name:return 'may-wind'
 if name=='五四广场' and tags.get('railway') not in ['subway','station','stop'] and tags.get('public_transport') not in ['stop_position','platform'] and tags.get('highway') not in ['bus_stop']:return 'may-fourth-square'
 if '电视塔' in name:return 'tv-tower'
 if name in ['青岛市人民政府','青岛市政府','青岛市政府办公楼','青岛市人民政府办公楼']:return 'city-government'
 return None
def height(tags):
 def num(v):
  match=re.search(r'\d+(?:\.\d+)?',str(v or ''));return float(match.group()) if match else None
 h=num(tags.get('height'));levels=num(tags.get('building:levels'))
 return h or (levels*3.2 if levels else None),h is None,levels
class Extract(osmium.SimpleHandler):
 def __init__(self):super().__init__();self.factory=osmium.geom.WKBFactory()
 def node(self,n):
  t=dict(n.tags);k=kind(t)
  if not k or not n.location.valid() or not within(n.location.lon,n.location.lat):return
  x,z=T.transform(n.location.lon,n.location.lat);features.append({'id':'node/'+str(n.id),'kind':k,'name':t.get('name:zh',t.get('name','')),'position':[round(x,2),round(z,2)],'longitudeLatitude':[n.location.lon,n.location.lat],'tags':t,'geometryType':'Point'})
 def way(self,w):
  t=dict(w.tags);k=kind(t)
  if not k:return
  try:coords=[(n.lon,n.lat) for n in w.nodes]
  except osmium.InvalidLocationError:return
  if not coords or not any(within(*p) for p in coords):return
  points=[[round(x,2),round(z,2)] for x,z in [T.transform(*p) for p in coords]]
  if len(points)>3 and w.is_closed():return # Area callback will retain exact polygon.
  features.append({'id':'way/'+str(w.id),'kind':k,'name':t.get('name:zh',t.get('name','')),'points':points,'tags':t,'geometryType':'LineString'})
 def area(self,a):
  t=dict(a.tags);k=kind(t)
  if not k and not t.get('building'):return
  try:geo=wkb.loads(self.factory.create_multipolygon(a),hex=True)
  except Exception:return
  lon,lat=geo.centroid.x,geo.centroid.y
  if not within(lon,lat):return
  g=transform(T.transform,geo);ident=('way/' if a.from_way() else 'relation/')+str(a.orig_id())
  polys=[g] if g.geom_type=='Polygon' else list(g.geoms)
  for i,p in enumerate(polys):
   if p.is_empty:continue
   identPart=ident+(f'/{i}' if i else '')
   entry={'id':identPart,'name':t.get('name:zh',t.get('name','')),'polygon':[[round(x,2),round(z,2)] for x,z in list(p.exterior.coords)[:-1]],'holes':[[[round(x,2),round(z,2)] for x,z in list(r.coords)[:-1]] for r in p.interiors],'position':[round(p.centroid.x,2),round(p.centroid.y,2)],'longitudeLatitude':[lon,lat],'tags':t,'geometryType':'Polygon'}
   if k:features.append({**entry,'kind':k})
   if t.get('building') and t.get('building')!='no':
    h,estimated,levels=height(t);entry={**entry,'height':h,'estimatedHeight':estimated,'levels':levels,'heightSource':'height' if not estimated else ('building:levels × 3.2m' if levels else 'missing')};buildings.append(entry)
    if h and (h>40 or (levels and levels>12)) and landGeometry.covers(p.representative_point()):
     distance=coast.distance(p)
     if distance<=1500:candidates.append({**entry,'kind':'coastal-highrise-candidate','shoreDistance':round(distance,1)})
cache=ROOT/'sources'/'civic-osm-selection.json'
if '--cached' in sys.argv and cache.exists():
 selected=json.loads(cache.read_text(encoding='utf8'));features=selected['features'];candidates=selected['coastalBuildings']
else:
 Extract().apply_file('sources/shandong-latest.osm.pbf',locations=True,idx='flex_mem')
 cache.write_text(json.dumps({'features':features,'coastalBuildings':candidates},ensure_ascii=False,separators=(',',':')),encoding='utf8')
features=[f for f in features if f['kind']!='may-fourth-square' or f['name']=='五四广场']
# Preserve real building footprints within the actual mapped government campus if it exists.
campuses=[Polygon(f['polygon'],f.get('holes',[])) for f in features if f['kind']=='city-government' and f.get('polygon') and not f['tags'].get('building')]
governmentBuildings=[];governmentAdjacentBuildings=[]
governmentNodes=[f for f in features if f['kind']=='city-government' and f['geometryType']=='Point']
for path in (OUT/'chunks').glob('*.json'):
 if path.name=='index.json':continue
 chunk=json.loads(path.read_text(encoding='utf8'));bounds=chunk['bounds']
 if not any(bounds['minX']-300<=node['position'][0]<=bounds['maxX']+300 and bounds['minZ']-300<=node['position'][1]<=bounds['maxZ']+300 for node in governmentNodes):continue
 for b in chunk['buildings']:
  p=Polygon(b['polygon'],b.get('holes',[]))
  containing=next((node for node in governmentNodes if p.covers(Point(node['position']))),None)
  if containing:
   governmentBuildings.append({**b,'kind':'government-main-building','position':[round(p.centroid.x,2),round(p.centroid.y,2)],'geometryType':'Polygon','identification':'Real OSM building polygon contains named city-government node '+containing['id'],'governmentNodeId':containing['id']})
  elif any(c.covers(p.representative_point()) for c in campuses):governmentBuildings.append({**b,'kind':'government-campus-building','identification':'Real mapped government campus contains building'})
  elif b.get('name','') in ['青岛市市级机关会议中心','青岛市信访接待中心'] and any(p.distance(Point(node['position']))<250 for node in governmentNodes):governmentAdjacentBuildings.append({**b,'kind':'government-adjacent-building','position':[round(p.centroid.x,2),round(p.centroid.y,2)]})
data={'metadata':{'source':'Geofabrik Shandong OSM PBF, 2026-10-11T20:21:06Z','attribution':'© OpenStreetMap contributors','license':'ODbL 1.0','projection':PROJ,'origin':{'longitude':120.3163,'latitude':36.0603},'generatedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'selectionWGS84':{'minLongitude':120.33,'maxLongitude':120.42,'minLatitude':36.04,'maxLatitude':36.09},'coastalSelection':'Real mapped building height >40m or building:levels>12, within 1500m of OSM coast and on OSM land, in the selection bbox. Missing-height buildings are omitted; candidates are not confirmed light-show participants.','governmentPolicy':'Main office identified by real building polygon containing the named city-government OSM node; adjacent named municipal offices kept separately. No commercial-map coordinate offset guesses.','limitations':['OSM names and polygons may be incomplete. Geographic light-show candidate filtering is an estimate of the coastal cluster, not a surveyed performance roster.','Polygon positions are geometric centroids; point landmark positions are exact mapped OSM nodes.','May Wind is mapped as an artwork polygon, not a standalone point node. Its derived centroid is marked as a polygon-derived position.']},'features':features,'governmentBuildings':governmentBuildings,'governmentAdjacentBuildings':governmentAdjacentBuildings,'coastalBuildings':candidates}
assert all(math.isfinite(x) for f in features+governmentBuildings+candidates for x in f.get('position',[]))
data['metadata']['officialLocationChecks']={
 'cityGovernment':{'url':'http://www.qingdao.gov.cn/zwgk/xxgk/bgt/gkzn/','checkedDate':'2026-10-14','support':'Official address is Hong Kong Middle Road 11, municipal phase-one office building; matches node/11432724805 address tags. Official page does not publish surveyed WGS84 coordinates.'},
 'mayFourthSquare':{'url':'http://www.qingdao.gov.cn/yfqd/qdwl/cjfw/wyqgy/202009/t20200903_520360.shtml','checkedDate':'2026-10-14','support':'Officially south of municipal office building, north/south areas divided by Donghai Road; May Wind sculpture on sea-view platform. OSM geometry matches this arrangement. Official page does not publish surveyed WGS84 coordinates.'},
 'tvTower':{'url':'https://www.openstreetmap.org/way/179057050','support':'Mapped named television communications tower polygon with explicit 232m OSM height tag. Exact official surveyed coordinates and height reference datum have not been independently confirmed.'}}
(OUT/'civic-landmarks.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('FEATURES',[(f['id'],f['kind'],f['name'],f['position'] if 'position' in f else len(f['points'])) for f in features]);print('GOVERNMENT BUILDINGS',[(b['id'],b['name'],b['height'],b['position']) for b in governmentBuildings]);print('COASTAL CANDIDATES',len(candidates),'BYTES',(OUT/'civic-landmarks.json').stat().st_size)
