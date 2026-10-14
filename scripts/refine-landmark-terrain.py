"""Resample actual Terrain Tiles for old-town hills and Fushan; never invent heights."""
from pathlib import Path
import ast,json,math,time,sys,requests,concurrent.futures
import numpy as np
from PIL import Image
from pyproj import Transformer
sys.stdout.reconfigure(encoding='utf8')
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/data';DEM=ROOT/'sources/dem-source'
PROJ='+proj=aeqd +lat_0=36.0603 +lon_0=120.3163 +datum=WGS84 +units=m +no_defs'
inverse=Transformer.from_crs(PROJ,'EPSG:4326',always_xy=True);tilecache={}
# Reuse the reproducible sampler without executing the base-region acquisition.
tree=ast.parse((ROOT/'scripts/fetch-region.py').read_text('utf8'))
for node in tree.body:
 if isinstance(node,ast.FunctionDef) and node.name in ['get_tile','build_grid']:
  exec(compile(ast.Module(body=[node],type_ignores=[]),'fetch-region.py','exec'))
region=json.loads((OUT/'region.json').read_text('utf8'))
region['detailTerrain']=build_grid('zhanqiao',{'minX':-3200.,'maxX':3200.,'minZ':-3200.,'maxZ':3200.},32,12)
region['landmarkTerrain']=[build_grid('fushan',{'minX':7600.,'maxX':12400.,'minZ':1200.,'maxZ':5600.},40,12)]
region['metadata']['landmarkTerrainNote']='Old-town 32m grid and Fushan 40m grid sample genuine zoom-12 Terrarium (~31m pixels). Patch boundaries align with the 400m grid. Grid spacing is not survey accuracy; published peak elevations are not imposed on the DEM.'
region['metadata']['limitations']=[s.replace('60m grid covers the Zhanqiao demo.','32m grid covers old-town hills; a 40m Fushan patch covers its ridges.').replace('30m grid covers old-town hills','32m grid covers old-town hills') for s in region['metadata']['limitations']]
(OUT/'region.json').write_text(json.dumps(region,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('Landmark terrain saved',flush=True)
