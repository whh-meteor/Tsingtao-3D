"""Qingdao eight-district real elevation data. No synthetic terrain.
Inputs: DataV district outlines (GCJ-02, inverted to WGS84), AWS Terrarium.
Outputs: metre AEQD bounds and row-major Float32 elevation grid.
"""
from pathlib import Path
import json,math,time,sys,requests,concurrent.futures
import numpy as np
from PIL import Image
from pyproj import Transformer
from shapely.geometry import shape
sys.stdout.reconfigure(encoding='utf8')
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public'/'data';OUT.mkdir(parents=True,exist_ok=True)
SOURCES=ROOT/'sources';SOURCES.mkdir(exist_ok=True)
DEM=SOURCES/'dem-source';DEM.mkdir(exist_ok=True)
PROJ='+proj=aeqd +lat_0=36.0603 +lon_0=120.3163 +datum=WGS84 +units=m +no_defs'
project=Transformer.from_crs('EPSG:4326',PROJ,always_xy=True)
inverse=Transformer.from_crs(PROJ,'EPSG:4326',always_xy=True)
SOURCE_URL='https://geo.datav.aliyun.com/areas_v3/bound/370200_full.json'
source_path=SOURCES/'qingdao-boundaries-source.json'
if not source_path.exists():
 r=requests.get(SOURCE_URL,headers={'Accept-Encoding':'gzip, deflate'},timeout=60);r.raise_for_status();source_path.write_bytes(r.content)

def offset(lon,lat):
 x,y=lon-105,lat-35
 dl=-100+2*x+3*y+.2*y*y+.1*x*y+.2*math.sqrt(abs(x))
 dl+=(20*math.sin(6*x*math.pi)+20*math.sin(2*x*math.pi))*2/3
 dl+=(20*math.sin(y*math.pi)+40*math.sin(y/3*math.pi))*2/3
 dl+=(160*math.sin(y/12*math.pi)+320*math.sin(y*math.pi/30))*2/3
 dn=300+x+2*y+.1*x*x+.1*x*y+.1*math.sqrt(abs(x))
 dn+=(20*math.sin(6*x*math.pi)+20*math.sin(2*x*math.pi))*2/3
 dn+=(20*math.sin(x*math.pi)+40*math.sin(x/3*math.pi))*2/3
 dn+=(150*math.sin(x/12*math.pi)+300*math.sin(x/30*math.pi))*2/3
 rad=lat/180*math.pi;magic=1-.006693421622965943*math.sin(rad)**2;s=math.sqrt(magic)
 return dn*180/(6378245/s*math.cos(rad)*math.pi),dl*180/(6378245*(1-.006693421622965943)/(magic*s)*math.pi)
def wgs(lon,lat):
 a,b=lon,lat
 for _ in range(6):
  dx,dy=offset(a,b);a-=a+dx-lon;b-=b+dy-lat
 return [a,b]
src=json.loads(source_path.read_text(encoding='utf8'));districts=[];features=[];allcoords=[]
for f in src['features']:
 if f['properties']['adcode'] in [370283,370285]:continue
 geo=f['geometry'];mp=geo['coordinates'] if geo['type']=='MultiPolygon' else [geo['coordinates']]
 corrected=[[[wgs(*p) for p in ring] for ring in poly] for poly in mp]
 polys=[]
 for poly in corrected:
  p=[]
  for ring in poly:
   lng,lat=np.array(ring).T;x,z=project.transform(lng,lat);loc=np.stack([x,z],axis=1)
   p.append(np.round(loc,3).tolist());allcoords.extend(loc)
  polys.append({'polygon':p[0][:-1],'holes':[r[:-1] for r in p[1:]]})
 cp=wgs(*f['properties'].get('center',f['properties'].get('centroid')))
 districts.append({'id':str(f['properties']['adcode']),'name':f['properties']['name'],'polygons':polys,'center':list(project.transform(*cp))})
 features.append({'type':'Feature','properties':f['properties'],'geometry':{'type':'MultiPolygon','coordinates':corrected}})
(OUT/'districts.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':')),encoding='utf8')
arr=np.array(allcoords);lo=arr.min(axis=0);hi=arr.max(axis=0)
bounds={'minX':float(math.floor(lo[0]/400)*400),'maxX':float(math.ceil(hi[0]/400)*400),'minZ':float(math.floor(lo[1]/400)*400),'maxZ':float(math.ceil(hi[1]/400)*400)}
print('BOUNDS',bounds,'districts',len(districts),flush=True)

tilecache={}
def get_tile(key):
 zoom,tx,ty=key;path=DEM/f'{zoom}-{tx}-{ty}.png'
 if not path.exists():
  url=f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{zoom}/{tx}/{ty}.png'
  for attempt in range(4):
   try:
    r=requests.get(url,headers={'Accept-Encoding':'gzip, deflate'},timeout=60);r.raise_for_status()
    path.write_bytes(r.content);Image.open(path).verify();break
   except Exception:
    if path.exists():path.unlink()
    if attempt==3:raise
    time.sleep(1+attempt)
 a=np.asarray(Image.open(path),dtype=np.float32)
 return key,a[:,:,0]*256+a[:,:,1]+a[:,:,2]/256-32768

def build_grid(label,bounds,spacing,zoom):
 cols=round((bounds['maxX']-bounds['minX'])/spacing)+1;rows=round((bounds['maxZ']-bounds['minZ'])/spacing)+1
 xs=np.linspace(bounds['minX'],bounds['maxX'],cols);zs=np.linspace(bounds['maxZ'],bounds['minZ'],rows)
 xx,zz=np.meshgrid(xs,zs);lon,lat=inverse.transform(xx,zz)
 n=2**zoom;tx=(lon+180)/360*n;ty=(1-np.arcsinh(np.tan(np.radians(lat)))/np.pi)/2*n
 ix=np.floor(tx).astype(int);iy=np.floor(ty).astype(int)
 keys=sorted(set((zoom,int(a),int(b)) for a,b in zip(ix.ravel(),iy.ravel())))
 missing=[k for k in keys if k not in tilecache]
 print(label,cols,rows,'tiles',len(keys),'fetch',len(missing),flush=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for key,values in pool.map(get_tile,missing):tilecache[key]=values
 heights=np.empty((rows,cols),dtype='<f4')
 for key in keys:
  _,a,b=key;mask=(ix==a)&(iy==b)
  px=np.minimum((tx[mask]-a)*256,255);py=np.minimum((ty[mask]-b)*256,255)
  x0=np.floor(px).astype(int);y0=np.floor(py).astype(int);x1=np.minimum(x0+1,255);y1=np.minimum(y0+1,255)
  fx=px-x0;fy=py-y0;t=tilecache[key]
  heights[mask]=(t[y0,x0]*(1-fx)*(1-fy)+t[y0,x1]*fx*(1-fy)+t[y1,x0]*(1-fx)*fy+t[y1,x1]*fx*fy)
 file=f'{label}-height.f32';heights.tofile(OUT/file)
 # Real bathymetric/negative values are retained; no sine terrain or fabricated hills.
 meta={'file':'/data/'+file,'width':cols,'height':rows,'bounds':bounds,'heightEncoding':'float32-le','layout':'row-major; row 0=maxZ north; last row=minZ south','spacingX':(bounds['maxX']-bounds['minX'])/(cols-1),'spacingZ':(bounds['maxZ']-bounds['minZ'])/(rows-1),'minHeight':float(heights.min()),'maxHeight':float(heights.max()),'sourceZoom':zoom,'sourcePixelMetresAtQingdao':40075016.69*math.cos(math.radians(36.06))/(2**zoom*256),'sourceTiles':[{'file':f'sources/dem-source/{k[0]}-{k[1]}-{k[2]}.png','z':k[0],'x':k[1],'y':k[2]} for k in keys],'source':'AWS Open Data / Mapzen Terrain Tiles (Terrarium)','heightUnits':'metres; source vertical datum depends on upstream DEM','sampling':'bilinear interpolation of genuine Terrarium DEM; no synthetic relief','seaNote':'Source terrain includes water cells often zero/negative; use coastline land mask and ocean surface separately.'}
 print(label,'height',meta['minHeight'],meta['maxHeight'],flush=True)
 return meta

terrain=build_grid('regional',bounds,400,11)
detailbounds={'minX':-3000.,'maxX':3000.,'minZ':-3000.,'maxZ':3000.}
detail=build_grid('zhanqiao',detailbounds,60,12)
region={'metadata':{'origin':{'longitude':120.3163,'latitude':36.0603},'projection':PROJ,'coordinateSystem':'WGS84 AEQD metres; x east, z north, y up','boundarySource':SOURCE_URL,'boundarySourceCRS':'GCJ-02; iterative inverse conversion applied to WGS84 before AEQD','boundaryAccuracy':'Generalized district outline from DataV; administrative and coastal detail approximate. Use OSM coastline for game land/ocean mask.','boundaryDocumentation':'https://help.aliyun.com/zh/datav/datav-7-0/user-guide/map-data-format-1','demSource':'https://registry.opendata.aws/terrain-tiles/','demEncoding':'https://github.com/tilezen/joerd/blob/master/docs/formats.md','demAttribution':'Terrain Tiles / Mapzen / AWS Open Data; upstream sources include SRTM, GMTED and others. See source record.','fetchedAtUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'scope':'市南、市北、李沧、崂山、城阳、黄岛、即墨、胶州；不含平度、莱西','limitations':['Actual DEM terrain only; buildings have separate estimated heights.','400m regional mesh loses small ridges; 60m grid covers the Zhanqiao demo.','DEM heights are not a surveyed street surface.','DataV administrative geometry is simplified and does not replace detailed OSM coastline.']},'bounds':bounds,'districts':districts,'terrain':terrain,'detailTerrain':detail,'regionalRoadsFile':'/data/regional-roads.json','chunksIndexFile':'/data/chunks/index.json'}
(OUT/'region.json').write_text(json.dumps(region,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('REGION DONE',flush=True)
