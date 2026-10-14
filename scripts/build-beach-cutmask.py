"""Rasterize exact mapped beach footprints into the terrain's RGBA opacity cut mask.
North is image row 0. White RGB; alpha 0 within beaches and 255 elsewhere.
4x coverage sampling with BOX reduction antialiases only boundary pixels, without a blur/expanded beach.
"""
from pathlib import Path
import json,math,sys
import numpy as np
from PIL import Image,ImageDraw
from shapely.geometry import Polygon,Point
from shapely.ops import unary_union
sys.stdout.reconfigure(encoding='utf8')
ROOT=Path(__file__).resolve().parents[1];DATA=ROOT/'public'/'data';JSON=DATA/'beaches.json';PNG=DATA/'beach-cutmask.png'
original=json.loads(JSON.read_text(encoding='utf8'));beaches=original['beaches'];polygons=[]
assert len(beaches)==11,'Review mask coverage if the source beach set changes'
for beach in beaches:
 assert len(beach['polygon'])>=3
 assert all(math.isfinite(v) for p in beach['polygon'] for v in p)
 assert all(math.isfinite(v) for ring in beach.get('holes',[]) for p in ring for v in p)
 p=Polygon(beach['polygon'],beach.get('holes',[]));assert p.is_valid and p.area>0,beach['id'];polygons.append(p)
beachUnion=unary_union(polygons);a,b,c,d=beachUnion.bounds;padding=50
bounds={'minX':a-padding,'maxX':c+padding,'minZ':b-padding,'maxZ':d+padding}
spanX=bounds['maxX']-bounds['minX'];spanZ=bounds['maxZ']-bounds['minZ']
pixelSize=max(3,spanX/8192);width=math.ceil(spanX/pixelSize);height=math.ceil(spanZ/pixelSize)
assert width<=8192 and width>0 and height>0
SS=4;hi=Image.new('L',(width*SS,height*SS),255);draw=ImageDraw.Draw(hi)
def pixels(ring):return [((x-bounds['minX'])/spanX*width*SS,(bounds['maxZ']-z)/spanZ*height*SS) for x,z in ring]
unionPolygons=[beachUnion] if beachUnion.geom_type=='Polygon' else list(beachUnion.geoms)
for p in unionPolygons:
 draw.polygon(pixels(p.exterior.coords),fill=0)
 for hole in p.interiors:draw.polygon(pixels(hole.coords),fill=255)
alpha=hi.resize((width,height),Image.Resampling.BOX);del hi,draw
rgba=Image.new('RGBA',(width,height),(255,255,255,255));rgba.putalpha(alpha);rgba.save(PNG,optimize=True,compress_level=9)
mask={'url':'/data/beach-cutmask.png','bounds':bounds,'width':width,'height':height,'source':'Exact natural=beach polygons and holes from /data/beaches.json; '+original.get('metadata',{}).get('source','OpenStreetMap'),'rowDirection':'north-to-south; image row 0 is maxZ','uv':'u=(x-minX)/(maxX-minX), v=(maxZ-z)/(maxZ-minZ), Texture invertY=false; clamp both axes','encoding':'RGBA white RGB 255; alpha 0 beach / 255 remaining terrain. Read alpha, not RGB.','pixelSizeX':spanX/width,'pixelSizeZ':spanZ/height,'paddingMeters':padding,'antialiasing':'4x supersampled exact polygon coverage, BOX downsampling; boundary pixels only, no Gaussian blur or footprint dilation','beachCount':len(beaches),'attribution':original.get('metadata',{}).get('attribution','© OpenStreetMap contributors'),'license':original.get('metadata',{}).get('license','ODbL 1.0')}
# Re-read before updating so other agents' unrelated metadata changes are retained.
latest=json.loads(JSON.read_text(encoding='utf8'))
assert [(b['id'],b['polygon'],b.get('holes',[])) for b in latest['beaches']]==[(b['id'],b['polygon'],b.get('holes',[])) for b in beaches],'Source geometry changed during generation; rerun'
latest.setdefault('metadata',{})['groundCutMask']=mask
JSON.write_text(json.dumps(latest,ensure_ascii=False,separators=(',',':')),encoding='utf8')
# Verify the real saved image, rather than only trusting the draw operations.
saved=Image.open(PNG);assert saved.mode=='RGBA' and saved.size==(width,height)
array=np.asarray(saved);assert np.all(array[:,:,:3]==255)
assert np.all(array[0,:,3]==255) and np.all(array[-1,:,3]==255)
assert np.all(array[:,0,3]==255) and np.all(array[:,-1,3]==255)
assert np.any(array[:,:,3]==0) and np.any((array[:,:,3]>0)&(array[:,:,3]<255))
tested=0
for p in polygons:
 point=p.representative_point();x=int((point.x-bounds['minX'])/spanX*width);y=int((bounds['maxZ']-point.y)/spanZ*height)
 # Very narrow mapped slivers may not contain a full output pixel; inspect only substantial interiors.
 if p.boundary.distance(point)>max(mask['pixelSizeX'],mask['pixelSizeZ'])*2:assert array[y,x,3]==0;tested+=1
print(json.dumps({'beaches':len(beaches),'width':width,'height':height,'bounds':bounds,'pixelSizeX':mask['pixelSizeX'],'pixelSizeZ':mask['pixelSizeZ'],'transparentPixels':int(np.sum(array[:,:,3]==0)),'antialiasedPixels':int(np.sum((array[:,:,3]>0)&(array[:,:,3]<255))),'interiorChecks':tested,'bytes':PNG.stat().st_size},ensure_ascii=False))
