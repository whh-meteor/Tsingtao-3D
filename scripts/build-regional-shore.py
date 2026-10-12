"""Rasterize genuine OSM coast polygons, plus raster distance field for sea shader."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely import contains_xy
from scipy.ndimage import distance_transform_edt
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public'/'data'
region=json.loads((OUT/'region.json').read_text(encoding='utf8'))
source=json.loads((OUT/'regional-land.json').read_text(encoding='utf8'))
b=region['bounds'];N=2048
land=unary_union([Polygon(p['polygon'],p.get('holes',[])) for p in source['land']])
local=json.loads((OUT/'scene.json').read_text(encoding='utf8'))
localLand=unary_union([Polygon(p['polygon'],p.get('holes',[])) for p in local['land']])
localBounds=local['metadata']['bounds']
def land_mask(xx,zz):
 m=contains_xy(land,xx,zz)
 within=(xx>=localBounds['minX'])&(xx<=localBounds['maxX'])&(zz>=localBounds['minZ'])&(zz<=localBounds['maxZ'])
 m[within]=contains_xy(localLand,xx[within],zz[within])
 return m
x=np.linspace(b['minX'],b['maxX'],N);z=np.linspace(b['maxZ'],b['minZ'],N)
xx,zz=np.meshgrid(x,z);mask=land_mask(xx,zz)
sx=(b['maxX']-b['minX'])/(N-1);sz=(b['maxZ']-b['minZ'])/(N-1)
inner=distance_transform_edt(mask,sampling=(sz,sx));outer=distance_transform_edt(~mask,sampling=(sz,sx))
dist=np.maximum(np.where(mask,inner,outer)-min(sx,sz)/2,0)
rgba=np.zeros((N,N,4),dtype=np.uint8)
rgba[:,:,0]=np.round(np.minimum(dist/100,1)*255).astype(np.uint8)
rgba[:,:,1]=mask.astype(np.uint8)*255;rgba[:,:,3]=255
Image.fromarray(rgba).save(OUT/'regional-shore.png')
meta={'url':'/data/regional-shore.png','width':N,'height':N,'bounds':b,'channels':{'r':'approximate distance to rasterized OSM shoreline / 100m, capped at 1','g':'OSM coastline land mask: 1 land, 0 water','b':'unused','a':'1'},'imageRows':'row 0 north (maxZ), row height-1 south (minZ)','uv':'u=(x-minX)/(maxX-minX); v=(z-minZ)/(maxZ-minZ); texture invertY=true for v=0 south','source':'/data/regional-land.json; genuine OSM coastline polygons','maskPixelMetres':[sx,sz],'distanceAccuracy':'Distance-transform approximation at approximately 68x57m regional pixels; use local shore-distance.png for fine Zhanqiao shoreline.'}
region['shoreTexture']=meta
alpha=np.full((N,N,4),255,dtype=np.uint8);alpha[:,:,3]=mask.astype(np.uint8)*255
Image.fromarray(alpha).save(OUT/'regional-land-mask.png')
region['metadata']['landMask']={'url':'/data/regional-land-mask.png','bounds':b,'width':N,'height':N,'imageRows':'north row0','uv':'u=(x-minX)/(maxX-minX); v=(maxZ-z)/(maxZ-minZ); Babylon Texture invertY=false','source':'OSM regional coastline polygons; local scene land overrides inside local scene bounds','channels':'RGB=white; alpha=255 land,0 water'}
db=region['detailTerrain']['bounds'];DN=1024
dx=np.linspace(db['minX'],db['maxX'],DN);dz=np.linspace(db['maxZ'],db['minZ'],DN)
dxx,dzz=np.meshgrid(dx,dz);dm=land_mask(dxx,dzz)
da=np.full((DN,DN,4),255,dtype=np.uint8);da[:,:,3]=dm.astype(np.uint8)*255
Image.fromarray(da).save(OUT/'detail-land-mask.png')
region['metadata']['detailLandMask']={'url':'/data/detail-land-mask.png','bounds':db,'width':DN,'height':DN,'imageRows':'north row0','uv':'u=(x-minX)/(maxX-minX); v=(maxZ-z)/(maxZ-minZ); Babylon Texture invertY=false','source':'Local scene land inside its bbox, regional OSM coastline outside','channels':'RGB=white; alpha=255 land,0 water'}
(OUT/'regional-shore.json').write_text(json.dumps(meta,ensure_ascii=False,separators=(',',':')),encoding='utf8')
(OUT/'region.json').write_text(json.dumps(region,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('mask complete',N,'land pixels',int(mask.sum()),'land fraction',float(mask.mean()))
