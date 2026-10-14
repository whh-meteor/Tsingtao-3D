"""Extract mapped Qingdao landmarks and their nearby footprints; no fabricated positions."""
from pathlib import Path
import os,json,math,sys,re
import osmium
from pyproj import Transformer
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parents[1];os.chdir(ROOT)
OUT=ROOT/'public/data'
PROJ='+proj=aeqd +lat_0=36.0603 +lon_0=120.3163 +datum=WGS84 +units=m +no_defs'
project=Transformer.from_crs('EPSG:4326',PROJ,always_xy=True)
local=json.loads((OUT/'scene.json').read_text('utf-8'))
known={f['id']:f for f in local['buildings']}
# Candidate windows only. Final architecture modules choose exact tagged footprints.
windows={'government':[282,475,160],'residence':[1048,491,190],
 'brewery':[2285,2068,350],'campus':[1430,380,450],
 'signal':[960,720,250],'xiaoyu':[1357,-172,200],'redwall':[1110,90,180]}
def group(x,z):return [k for k,(a,b,r) in windows.items() if math.hypot(x-a,z-b)<r]
def coord(loc):return [round(v,3) for v in project.transform(loc.lon,loc.lat)]
def height(tags):
 try:return float(re.search(r'[\d.]+',tags.get('height','')).group())
 except Exception:
  try:return float(tags.get('building:levels',3))*3.4
  except Exception:return 10.2
buildings=[];parks=[];paths=[];nodes=[];named=[]
class Handler(osmium.SimpleHandler):
 def node(self,n):
  if not n.location.valid() or not (120.26<n.location.lon<120.46 and 36.04<n.location.lat<36.13):return
  t=dict(n.tags);name=t.get('name','');p=coord(n.location)
  if any(s in name for s in ['浮山','信号山','小鱼山','览潮','海洋大学','啤酒博物馆','观景','旋转','大学路','鱼山路']) or (t.get('natural')=='peak' and 5000<p[0]<11000) or ('brewery' in group(*p) and t.get('man_made') in ['chimney','tower']):
   nodes.append({'id':f'node/{n.id}','name':name,'position':p,'geo':[n.location.lon,n.location.lat],'tags':t})
 def way(self,w):
  t=dict(w.tags)
  if not any(k in t for k in ['building','building:part','leisure','highway','name','barrier']):return
  if len(w.nodes)<2:return
  first=w.nodes[0].location
  if not first.valid() or not (120.26<first.lon<120.46 and 36.04<first.lat<36.13):return
  try:p=[coord(n.location) for n in w.nodes]
  except Exception:return
  cx=sum(q[0] for q in p)/len(p);cz=sum(q[1] for q in p)/len(p);groups=group(cx,cz)
  closed=p[0]==p[-1];name=t.get('name','');id=f'way/{w.id}'
  if not groups and not any(s in name for s in ['浮山','信号山','小鱼山','啤酒博物馆','中国海洋大学']):return
  f={'id':id,'name':name,'tags':t,'groups':groups}
  if closed and len(p)>3:
   f['polygon']=p[:-1]
   if 'building' in t or 'building:part' in t:
    if id in known:f={**known[id],'groups':groups}
    else:f.update(height=height(t),estimatedHeight='height' not in t)
    buildings.append(f)
   elif t.get('leisure') in ['park','garden'] or t.get('amenity')=='university' or any(s in name for s in ['浮山森林','鱼山校区']):parks.append(f)
  elif t.get('highway') in ['footway','path','steps','pedestrian'] or t.get('barrier') in ['wall','fence']:
   f['points']=p;paths.append(f)
  if name and any(s in name for s in ['浮山','信号山','小鱼山','啤酒','海洋大学']):
   named.append({**f,'position':[cx,cz]})
h=Handler();h.apply_file('sources/shandong-latest.osm.pbf',locations=True,idx='flex_mem')
for f in local.get('areas',[]):
 if f.get('id') in ['way/154259225','way/154258767'] and not any(p['id']==f['id'] for p in parks):parks.append(f)
data={'metadata':{'projection':PROJ,'source':'Geofabrik Shandong 2026-10-11 OSM extract','license':'ODbL 1.0','attribution':'© OpenStreetMap contributors','date':'2026-10-13','note':'Candidate windows only; mapped geometry, not inferred building locations'},'buildings':buildings,'parks':parks,'paths':paths,'nodes':nodes,'namedFeatures':named}
(OUT/'heritage.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print('Buildings',len(buildings),'parks',len(parks),'paths',len(paths),'named nodes',len(nodes))
for n in nodes:print(n['id'],n['name'],n['position'],n['tags'])
for f in named:print(f['id'],f['name'],f['position'])
