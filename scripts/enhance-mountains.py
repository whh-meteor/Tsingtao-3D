"""Finer genuine Laoshan elevations and mapped peak anchors; no vertical exaggeration."""
from pathlib import Path
import ast,json,math,time,sys,os,requests,concurrent.futures
import numpy as np
from PIL import Image
from pyproj import Transformer
import osmium
sys.stdout.reconfigure(encoding='utf8')
ROOT=Path(__file__).resolve().parents[1];os.chdir(ROOT);OUT=ROOT/'public/data';DEM=ROOT/'sources/dem-source'
PROJ='+proj=aeqd +lat_0=36.0603 +lon_0=120.3163 +datum=WGS84 +units=m +no_defs'
inverse=Transformer.from_crs(PROJ,'EPSG:4326',always_xy=True);project=Transformer.from_crs('EPSG:4326',PROJ,always_xy=True);tilecache={}
tree=ast.parse((ROOT/'scripts/fetch-region.py').read_text('utf8'))
for node in tree.body:
 if isinstance(node,ast.FunctionDef) and node.name in ['get_tile','build_grid']:exec(compile(ast.Module(body=[node],type_ignores=[]),'fetch-region.py','exec'))
region=json.loads((OUT/'region.json').read_text('utf8'))
grids=[g for g in region.get('landmarkTerrain',[]) if 'laoshan' not in g['file']]
grids.append(build_grid('laoshan',{'minX':21200.,'maxX':38800.,'minZ':5600.,'maxZ':26800.},80,12))
region['landmarkTerrain']=grids
region['metadata']['mountainRendering']='Actual elevations with metre scale; finer 80m Laoshan surface, slope/height palette and mapped peak labels. No vertical exaggeration.'
(OUT/'region.json').write_text(json.dumps(region,ensure_ascii=False,separators=(',',':')),encoding='utf8')
peaks=[]
class Peaks(osmium.SimpleHandler):
 def node(self,n):
  t=dict(n.tags)
  if t.get('natural')!='peak' or not t.get('name') or not n.location.valid():return
  x,z=project.transform(n.location.lon,n.location.lat)
  if (20000<x<41000 and 4000<z<29000) or (7600<x<12400 and 1200<z<5600) or (t.get('name') in ['信号山','小鱼山'] and abs(x)<3000 and abs(z)<3000):
   peaks.append({'id':f'node/{n.id}','name':t['name'],'position':[round(x,3),round(z,3)],'geo':[n.location.lon,n.location.lat],'elevation':t.get('ele'),'tags':t})
Peaks().apply_file('sources/shandong-latest.osm.pbf')
(OUT/'mountain-peaks.json').write_text(json.dumps({'metadata':{'source':'OSM Geofabrik Shandong 2026-10-11','license':'ODbL','projection':PROJ,'heightNote':'OSM reported peak elevation retained separately from rendered DEM elevation.'},'peaks':peaks},ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('Mapped peaks',json.dumps(peaks,ensure_ascii=False),flush=True)
