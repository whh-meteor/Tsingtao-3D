"""Coast alpha retained; genuine DEM slope/altitude plus observed OSM building density."""
from pathlib import Path
import json,sys
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
sys.stdout.reconfigure(encoding='utf8')
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/data'
region=json.loads((OUT/'region.json').read_text('utf8'));city=json.loads((OUT/'city-overview.json').read_text('utf8'))
grids=[region['terrain'],region['detailTerrain'],*region.get('landmarkTerrain',[])]
arrays=[np.fromfile(OUT/Path(g['file']).name,dtype='<f4').reshape(g['height'],g['width']) for g in grids]
def sample_grid(g,a,x,z):
 c=np.clip((x-g['bounds']['minX'])/g['spacingX'],0,g['width']-1);r=np.clip((g['bounds']['maxZ']-z)/g['spacingZ'],0,g['height']-1)
 ci=np.minimum(c.astype(int),g['width']-2);ri=np.minimum(r.astype(int),g['height']-2);u=c-ci;v=r-ri
 return a[ri,ci]*(1-u)*(1-v)+a[ri,ci+1]*u*(1-v)+a[ri+1,ci]*(1-u)*v+a[ri+1,ci+1]*u*v
def sample(x,z):
 h=sample_grid(grids[0],arrays[0],x,z)
 for g,a in zip(grids[1:],arrays[1:]):
  b=g['bounds'];inside=(x>=b['minX'])&(x<=b['maxX'])&(z>=b['minZ'])&(z<=b['maxZ']);v=sample_grid(g,a,x,z);h=np.where(inside,v,h)
 return h
def palette(key,label):
 source=region['metadata'][key];im=Image.open(OUT/Path(source['url']).name).convert('RGBA');w,h=im.size;b=source['bounds']
 x=np.linspace(b['minX'],b['maxX'],w);z=np.linspace(b['maxZ'],b['minZ'],h);xx,zz=np.meshgrid(x,z)
 height=sample(xx,zz);slope=np.hypot(sample(xx+40,zz)-sample(xx-40,zz),sample(xx,zz+40)-sample(xx,zz-40))/80
 high=np.clip((height-160)/850,0,1);rock=np.clip((slope-.35)/.55,0,1)*.86
 low=np.array([100,139,79]);upland=np.array([143,153,108]);granite=np.array([172,162,144]);rgb=low+(upland-low)*high[:,:,None];rgb=rgb*(1-rock[:,:,None])+granite*rock[:,:,None]
 # A broad, subdued contour modulation makes real ridges legible without moving vertices.
 contour=1-np.exp(-(np.mod(np.maximum(height,0),40)/5)**2)*.055;rgb*=contour[:,:,None]
 density=Image.new('L',(w,h));draw=ImageDraw.Draw(density)
 for cell in city['urbanCells']:
  ix,iz,area,count,minx,minz,maxx,maxz=cell
  if maxx<b['minX'] or minx>b['maxX'] or maxz<b['minZ'] or minz>b['maxZ']:continue
  px=lambda v:(v-b['minX'])/(b['maxX']-b['minX'])*(w-1);py=lambda v:(b['maxZ']-v)/(b['maxZ']-b['minZ'])*(h-1)
  strength=int(min(215,80+min(1,area/18000)*135));draw.rectangle([px(minx),py(maxz),px(maxx),py(minz)],fill=strength)
 blend=np.asarray(density.filter(ImageFilter.GaussianBlur(.55)),dtype=float)/255
 urban=np.array([171,171,153]);rgb=rgb*(1-blend[:,:,None])+urban*blend[:,:,None]
 out=np.asarray(im).copy();out[:,:,:3]=np.clip(rgb,0,255).astype('uint8');filename=label+'-palette.png';Image.fromarray(out).save(OUT/filename,optimize=True)
 region['metadata'][label+'Palette']={**source,'url':'/data/'+filename,'source':'Original rendering palette; unchanged OSM coast alpha, genuine DEM slope/height; urban tone inferred from observed building footprint density, not complete land-use mapping.'}
 print(label,w,h,flush=True)
palette('landMask','terrain');palette('detailLandMask','detailTerrain')
(OUT/'region.json').write_text(json.dumps(region,ensure_ascii=False,separators=(',',':')),encoding='utf8')
