"""Extract mapped sandy beaches and their actual coastline, never classify rocky shore as sand."""
from pathlib import Path
import json, math, sys, os
import xml.etree.ElementTree as ET
import osmium
from pyproj import Transformer
from shapely.geometry import Polygon, LineString, box
from shapely import constrained_delaunay_triangles
from shapely.ops import unary_union
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)
PROJ='+proj=aeqd +lat_0=36.0603 +lon_0=120.3163 +datum=WGS84 +units=m +no_defs'
project=Transformer.from_crs('EPSG:4326',PROJ,always_xy=True)
beaches=[]; coast=[]; named=[]
class Handler(osmium.SimpleHandler):
 def node(self,n):
  if not n.location.valid():return
  lon,lat=n.location.lon,n.location.lat
  if not (120.28<lon<120.46 and 36.04<lat<36.10):return
  t=dict(n.tags)
  if '海水浴场' in t.get('name','') or t.get('natural')=='beach':
   named.append({'id':f'node/{n.id}','name':t.get('name',''),'position':[round(x,3)for x in project.transform(lon,lat)],'tags':t})
 def way(self,w):
  t=dict(w.tags)
  if t.get('natural')not in['beach','coastline']:return
  if len(w.nodes)<2:return
  p0=w.nodes[0].location
  if not p0.valid()or not(120.28<p0.lon<120.46 and 36.04<p0.lat<36.10):return
  try:p=[[round(x,3)for x in project.transform(n.location.lon,n.location.lat)]for n in w.nodes]
  except Exception:return
  f={'id':f'way/{w.id}','name':t.get('name',''),'tags':t}
  if t.get('natural')=='coastline':coast.append({**f,'points':p});return
  if p[0]==p[-1] and len(p)>3:
   poly=Polygon(p)
   if not poly.is_valid:poly=poly.buffer(0)
   if poly.geom_type!='Polygon':return
   f.update(polygon=[list(v)for v in poly.exterior.coords][:-1],holes=[[list(v)for v in h.coords][:-1]for h in poly.interiors],area=round(poly.area,1),position=[round(v,3)for v in poly.centroid.coords[0]])
   beaches.append(f)
h=Handler();h.apply_file('sources/shandong-latest.osm.pbf',locations=True,idx='flex_mem')
coastGeom=unary_union([LineString(c['points'])for c in coast])
for b in beaches:
 poly=Polygon(b['polygon'],b['holes']);near=coastGeom.intersection(poly.buffer(28))
 lines=list(near.geoms)if near.geom_type in['MultiLineString','GeometryCollection']else[near]
 b['shorelines']=[[[round(x,3),round(z,3)]for x,z in g.coords]for g in lines if g.geom_type=='LineString'and g.length>2]
 closest=sorted(named,key=lambda n:math.dist(n['position'],b['position']))
 if not b['name']and closest and math.dist(closest[0]['position'],b['position'])<220:b['name']=closest[0]['name'];b['nameSource']=closest[0]['id']
 # Clip a regular 5m mesh against the true polygon. This is an offline operation:
 # browsers load a ready conforming mesh rather than tessellating large beaches.
 vertices=[];triangles=[];cache={};step=5.;xmin,zmin,xmax,zmax=poly.bounds
 def vertex(p):
  k=tuple(round(v,3)for v in p[:2])
  if k not in cache:cache[k]=len(vertices);vertices.append(list(k))
  return cache[k]
 for ix in range(math.floor(xmin/step),math.ceil(xmax/step)):
  for iz in range(math.floor(zmin/step),math.ceil(zmax/step)):
   cell=poly.intersection(box(ix*step,iz*step,(ix+1)*step,(iz+1)*step))
   if cell.is_empty:continue
   parts=list(cell.geoms)if cell.geom_type in['MultiPolygon','GeometryCollection']else[cell]
   for part in parts:
    if part.geom_type!='Polygon'or part.area<.001:continue
    for tri in constrained_delaunay_triangles(part).geoms:
     pts=list(tri.exterior.coords)[:3];triangles.extend(vertex(p)for p in pts)
 b['mesh']={'spacing':step,'vertices':vertices,'indices':triangles}
# The high-resolution local OSM XML also maps actual reef / bare-rock extents.
# Keep only rocky areas adjacent to a beach; individual exposed rock forms remain estimates.
rocks=[]
xml=ET.parse(ROOT/'sources/osm-map.xml').getroot();xmlNodes={n.attrib['id']:n.attrib for n in xml.findall('node')}
beachUnion=unary_union([Polygon(b['polygon'],b['holes'])for b in beaches])
for w in xml.findall('way'):
 tags={t.attrib['k']:t.attrib['v']for t in w.findall('tag')}
 if tags.get('natural')not in['reef','bare_rock']:continue
 try:points=[[round(x,3)for x in project.transform(float(xmlNodes[n.attrib['ref']]['lon']),float(xmlNodes[n.attrib['ref']]['lat']))]for n in w.findall('nd')]
 except KeyError:continue
 if points[0]!=points[-1]or len(points)<4:continue
 p=Polygon(points).buffer(0)
 if p.distance(beachUnion)>18:continue
 clipped=p.intersection(beachUnion.buffer(18));parts=list(clipped.geoms)if clipped.geom_type=='MultiPolygon'else[clipped]
 for part in parts:
  if part.geom_type=='Polygon'and part.area>1:rocks.append({'id':f"way/{w.attrib['id']}",'tags':tags,'polygon':[[round(x,3),round(z,3)]for x,z in part.exterior.coords][:-1]})
out={'metadata':{'projection':PROJ,'source':'Geofabrik Shandong OSM extract 2026-10-11; local OSM XML reef outlines','date':'2026-10-14','license':'ODbL 1.0','attribution':'© OpenStreetMap contributors','note':'Only closed natural=beach polygons. Coastline intersection is used to identify the wet edge; no hand-drawn shore extensions.'},'beaches':beaches,'rocks':rocks,'namedNodes':named}
target=ROOT/'public/data/beaches.json';target.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print('Extracted',len(beaches),'mapped beaches')
for b in beaches:print(b['id'],b['name'],b['area'],b['position'],'shorelines',len(b['shorelines']))
