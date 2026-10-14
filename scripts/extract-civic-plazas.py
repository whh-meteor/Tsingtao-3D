"""Real OSM small-area landscape detail for May Fourth Square and government forecourt.
Official OSM map API snapshot; cached XML makes subsequent runs deterministic.
"""
from pathlib import Path
import json,sys,math,datetime,re
import xml.etree.ElementTree as ET
import requests
from shapely.geometry import Polygon,LineString,Point,box
from shapely.ops import unary_union,polygonize
from pyproj import Transformer
ROOT=Path(__file__).resolve().parents[1];SOURCE=ROOT/'sources'/'civic-plazas.osm.xml';OUT=ROOT/'public'/'data'/'civic-landmarks.json'
sys.stdout.reconfigure(encoding='utf8')
URL='https://api.openstreetmap.org/api/0.6/map?bbox=120.374,36.060,120.383,36.069'
if not SOURCE.exists() or '--refresh' in sys.argv:
 r=requests.get(URL,timeout=45);r.raise_for_status();SOURCE.write_bytes(r.content)
xml=ET.parse(SOURCE).getroot();T=Transformer.from_crs('EPSG:4326','+proj=aeqd +lat_0=36.0603 +lon_0=120.3163 +datum=WGS84 +units=m',always_xy=True)
nodes={int(n.attrib['id']):{'p':T.transform(float(n.attrib['lon']),float(n.attrib['lat'])),'tags':{t.attrib['k']:t.attrib['v'] for t in n.findall('tag')}} for n in xml.findall('node')}
ways={int(w.attrib['id']):{'refs':[int(n.attrib['ref']) for n in w.findall('nd')],'tags':{t.attrib['k']:t.attrib['v'] for t in w.findall('tag')}} for w in xml.findall('way')}
areas=[];paths=[];points=[];missing=[]
def category(t):
 if t.get('landuse')=='grass' or t.get('leisure')=='garden':return 'planting'
 if t.get('amenity')=='fountain':return 'fountain'
 if t.get('natural')=='water' or t.get('water'):return 'water'
 if t.get('highway')=='pedestrian' and t.get('area')=='yes':return 'paved-plaza'
 if t.get('leisure')=='park':return 'park-outline'
 return None
def line(w):
 try:return LineString([nodes[n]['p'] for n in w['refs']])
 except KeyError:return None
def entry(ident,tags,p,kind):return {'id':ident,'name':tags.get('name',''),'kind':kind,'tags':tags,'polygon':[[round(x,2),round(z,2)] for x,z in list(p.exterior.coords)[:-1]],'holes':[[[round(x,2),round(z,2)] for x,z in list(r.coords)[:-1]] for r in p.interiors],'position':[round(p.centroid.x,2),round(p.centroid.y,2)]}
region=Polygon([T.transform(120.374,36.060),T.transform(120.383,36.060),T.transform(120.383,36.069),T.transform(120.374,36.069)])
for ident,w in ways.items():
 tags=w['tags'];kind=category(tags);l=line(w)
 if l is None or not l.intersects(region):continue
 closed=len(w['refs'])>3 and w['refs'][0]==w['refs'][-1]
 if kind and closed:
  p=Polygon(l.coords)
  if not p.is_valid:p=p.buffer(0)
  if p.geom_type=='Polygon' and not p.is_empty:areas.append(entry('way/'+str(ident),tags,p,kind))
 if tags.get('highway') in ['footway','path','steps','pedestrian'] and tags.get('area')!='yes':
  width=re.search(r'\d+(?:\.\d+)?',tags.get('width',''));paths.append({'id':'way/'+str(ident),'type':tags['highway'],'name':tags.get('name',''),'points':[[round(x,2),round(z,2)] for x,z in l.coords],'width':float(width.group()) if width else 2,'estimatedWidth':not bool(width),'tags':tags})
for r in xml.findall('relation'):
 tags={t.attrib['k']:t.attrib['v'] for t in r.findall('tag')};kind=category(tags)
 if tags.get('type')!='multipolygon' or not kind:continue
 outer=[];inner=[]
 for m in r.findall('member'):
  if m.attrib.get('type')!='way':continue
  way=ways.get(int(m.attrib['ref']))
  if way is None:missing.append('way/'+m.attrib['ref']);continue
  l=line(way)
  if l is None:continue
  (inner if m.attrib.get('role')=='inner' else outer).append(l)
 outerPoly=unary_union(list(polygonize(unary_union(outer)))) if outer else Polygon()
 innerPoly=unary_union(list(polygonize(unary_union(inner)))) if inner else Polygon()
 shape=outerPoly.difference(innerPoly)
 polygons=[shape] if shape.geom_type=='Polygon' else [p for p in getattr(shape,'geoms',[]) if p.geom_type=='Polygon']
 for i,p in enumerate(polygons):
  if p.intersects(region) and not p.is_empty:areas.append(entry('relation/'+r.attrib['id']+(f'/{i}' if i else ''),tags,p,kind))
for ident,node in nodes.items():
 if node['tags'].get('amenity')=='fountain' and region.covers(Point(node['p'])):points.append({'id':'node/'+str(ident),'kind':'fountain','position':[round(x,2) for x in node['p']],'tags':node['tags'],'geometryType':'Point','estimatedFootprint':True})
data=json.loads(OUT.read_text(encoding='utf8'));data['plazaAreas']=areas;data['plazaPaths']=paths;data['plazaNodes']=points
data['metadata']['plazaDetail']={'source':URL,'snapshotDate':'2026-10-14','attribution':'© OpenStreetMap contributors','license':'ODbL 1.0','bboxWGS84':[120.374,36.060,120.383,36.069],'policy':'True mapped grass/garden/pedestrian/water polygons and paths; relation holes retained. Park outline is not synonymous with grass. Node-only fountain footprint has no surveyed radius. Paths without width tag use a 2m visualization estimate.','missingMemberWays':sorted(set(missing))}
assert all(math.isfinite(x) for p in areas for v in p['polygon'] for x in v)
OUT.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('PLAZA AREAS',len(areas),{k:sum(a['kind']==k for a in areas) for k in {a['kind'] for a in areas}},'PATHS',len(paths),'FOUNTAIN POINTS',len(points),'MISSING',len(missing))
