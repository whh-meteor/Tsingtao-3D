"""Fetch real OSM geometry and prepare metre-scale local city data.
Run: python scripts/fetch-osm.py
OSM coastline direction: land is on the left.
"""
from pathlib import Path
import requests, json, math, time, gzip, re, sys
sys.stdout.reconfigure(encoding='utf-8')
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image
from shapely.geometry import LineString, Polygon, Point, box
from shapely.ops import unary_union, polygonize
from shapely import contains_xy, distance, points
from pyproj import Transformer

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public'/'data'; OUT.mkdir(parents=True,exist_ok=True)
SOURCES=ROOT/'sources';SOURCES.mkdir(exist_ok=True)
ORIGIN=(120.3163,36.0603)
BBOX=(36.045,120.295,36.078,120.345)
R=6378137.0
PROJECTION='+proj=aeqd +lat_0=36.0603 +lon_0=120.3163 +datum=WGS84 +units=m +no_defs'
PROJECT=Transformer.from_crs('EPSG:4326',PROJECTION,always_xy=True)
def local(lon,lat):
    return list(PROJECT.transform(lon,lat))
def coords(geometry): return [local(p['lon'],p['lat']) for p in geometry]
def rounded(a): return [[round(x,3),round(z,3)] for x,z in a]
def clean_ring(a):
    if a and a[0]==a[-1]: a=a[:-1]
    return a

query='''[out:json][timeout:150];(way["natural"="coastline"](%s);way["building"](%s);way["highway"](%s);way["man_made"="pier"](%s);way["natural"="beach"](%s);way["leisure"="park"](%s);way["historic"](%s););out geom;''' % tuple(','.join(map(str,BBOX)) for _ in range(7))
raw_path=SOURCES/'source-osm.json.gz'
if raw_path.exists():
    print('Using cached OSM'); raw=json.loads(gzip.decompress(raw_path.read_bytes()))
else:
    errors=[]
    # Official map API is a reliable small-bbox fallback to Overpass.
    mapfile=ROOT/'sources'/'osm-map.xml'
    mapfile.parent.mkdir(parents=True,exist_ok=True)
    if not mapfile.exists() and (SOURCES/'source-osm.xml.gz').exists():
        mapfile.write_bytes(gzip.decompress((SOURCES/'source-osm.xml.gz').read_bytes()))
    if not mapfile.exists():
        resp=requests.get('https://api.openstreetmap.org/api/0.6/map',params={'bbox':f'{BBOX[1]},{BBOX[0]},{BBOX[3]},{BBOX[2]}'},headers={'Accept-Encoding':'gzip, deflate','User-Agent':'QingdaoDemo/1.0'},timeout=120)
        resp.raise_for_status();mapfile.write_bytes(resp.content)
    tree=ET.fromstring(mapfile.read_bytes())
    (SOURCES/'source-osm.xml.gz').write_bytes(gzip.compress(mapfile.read_bytes()))
    nodes={n.attrib['id']:{'lat':float(n.attrib['lat']),'lon':float(n.attrib['lon'])} for n in tree.findall('node')}
    selected=[]
    for w in tree.findall('way'):
        tags={t.attrib['k']:t.attrib['v'] for t in w.findall('tag')}
        if not (tags.get('natural') in ['coastline','beach'] or any(k in tags for k in ['building','highway','historic']) or tags.get('man_made')=='pier' or tags.get('leisure')=='park'):continue
        refs=[n.attrib['ref'] for n in w.findall('nd')]
        if any(r not in nodes for r in refs):print('Missing node in way',w.attrib['id']);continue
        selected.append({'type':'way','id':int(w.attrib['id']),'tags':tags,'geometry':[nodes[r] for r in refs]})
    raw={'version':0.6,'generator':tree.attrib.get('generator'),'osm3s':{'timestamp_osm_base':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())},'elements':selected,'sourceAPI':'https://api.openstreetmap.org/api/0.6/map'}
    raw_path.write_bytes(gzip.compress(json.dumps(raw,ensure_ascii=False).encode('utf-8')))
    if not raw.get('elements'):raise RuntimeError('No OSM geometry found')

elements=raw['elements'];print('Elements',len(elements),flush=True)
coasts=[]; buildings=[];roads=[];piers=[];areas=[];landmarks=[]
def numeric(value):
    match=re.search(r'[0-9]+(?:\.[0-9]+)?',str(value or ''))
    return float(match.group()) if match else None
widths={'motorway':18,'trunk':16,'primary':14,'secondary':11,'tertiary':9,'residential':7,'unclassified':7,'service':4,'footway':2.3,'pedestrian':5,'path':1.7,'steps':2,'cycleway':2.5,'living_street':5}
for e in elements:
    if 'geometry' not in e:continue
    tags=e.get('tags',{});p=coords(e['geometry']);ident='way/'+str(e['id']);name=tags.get('name','')
    if len(p)<2:continue
    if tags.get('natural')=='coastline':coasts.append({'id':ident,'points':rounded(p)})
    if tags.get('building') and len(p)>=4 and p[0]==p[-1]:
        h=numeric(tags.get('height'));level=numeric(tags.get('building:levels'));estimated=h is None
        if h is None: h=(level*3.2 if level else (16 if tags.get('building') in ['apartments','commercial','office'] else 9))
        buildings.append({'id':ident,'name':name,'polygon':rounded(clean_ring(p)),'height':round(h,2),'estimatedHeight':estimated,'heightSource':'height' if not estimated else ('building:levels × 3.2m' if level else 'typology default'),'tags':tags})
    if 'highway' in tags:roads.append({'id':ident,'name':name,'points':rounded(p),'width':numeric(tags.get('width')) or widths.get(tags['highway'],5),'type':tags['highway']})
    if tags.get('man_made')=='pier':
        pier={'id':ident,'name':name,'tags':tags}
        if p[0]==p[-1]:pier['polygon']=rounded(clean_ring(p));pier['area']=round(Polygon(p).area,2)
        else:pier['points']=rounded(p);pier['length']=round(LineString(p).length,2)
        pier['geoGeometry']=e['geometry'];piers.append(pier)
        if name=='栈桥' and 'polygon' in pier:
            corners=list(Polygon(p).minimum_rotated_rectangle.exterior.coords)
            lengths=[math.dist(a,b) for a,b in zip(corners,corners[1:])]
            pier['overallLength']=round(max(lengths),2)
            pier['maximumWidth']=round(min(lengths),2)
            pier['measurement']='OSM polygon minimum rotated bounding rectangle; excludes undocumented extensions'
        print('PIER',name,ident,json.dumps(pier,ensure_ascii=False),flush=True)
    if tags.get('natural')=='beach' or tags.get('leisure')=='park':
        if p[0]==p[-1]:areas.append({'id':ident,'name':name,'type':tags.get('natural') or tags.get('leisure'),'polygon':rounded(clean_ring(p))})
    if name and any(k in tags for k in ['historic','man_made']):
        c=LineString(p).centroid;landmarks.append({'id':ident,'name':name,'position':[round(c.x,3),round(c.y,3)],'tags':tags})

south,west,north,east=BBOX
minX,minZ=local(west,south);maxX,maxZ=local(east,north)
bounds={'minX':minX,'maxX':maxX,'minZ':minZ,'maxZ':maxZ}
extent=box(minX,minZ,maxX,maxZ)
lines=[LineString(c['points']) for c in coasts]
clipped=[l.intersection(extent) for l in lines]
network=unary_union(clipped+[extent.boundary])
cells=list(polygonize(network))
landcells=[]
for poly in cells:
    # Determine each coast-adjacent face using left-side probes along original directed ways.
    left_votes=right_votes=0
    for line in lines:
        cp=list(line.coords)
        for a,b in zip(cp,cp[1:]):
            dx,dz=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dz)
            if length<1:continue
            mx,mz=(a[0]+b[0])/2,(a[1]+b[1])/2
            d=min(3,length/5)
            if poly.contains(Point(mx-dz/length*d,mz+dx/length*d)):left_votes+=1
            if poly.contains(Point(mx+dz/length*d,mz-dx/length*d)):right_votes+=1
    if left_votes>right_votes:landcells.append(poly)
landgeom=unary_union(landcells)
landpolys=list(landgeom.geoms) if landgeom.geom_type=='MultiPolygon' else [landgeom]
land=[{'id':'land/'+str(i),'polygon':rounded(clean_ring(list(p.exterior.coords))),'holes':[rounded(clean_ring(list(r.coords))) for r in p.interiors]} for i,p in enumerate(landpolys) if not p.is_empty]

resolution=1024
xs=np.linspace(minX,maxX,resolution);zs=np.linspace(maxZ,minZ,resolution)
xx,zz=np.meshgrid(xs,zs)
coastgeom=unary_union(clipped)
dist=np.minimum(distance(points(xx,zz),coastgeom),100)
mask=contains_xy(landgeom,xx,zz)
rgba=np.zeros((resolution,resolution,4),dtype=np.uint8)
rgba[:,:,0]=np.round(dist/100*255).astype(np.uint8)
rgba[:,:,1]=mask.astype(np.uint8)*255
rgba[:,:,3]=255
Image.fromarray(rgba).save(OUT/'shore-distance.png')
scene={'metadata':{'origin':{'longitude':ORIGIN[0],'latitude':ORIGIN[1]},'coordinateSystem':'local tangent equirectangular metres; x east, z north, y up','bbox':{'south':south,'west':west,'north':north,'east':east},'bounds':bounds,'source':'OpenStreetMap contributors','license':'ODbL 1.0','attribution':'© OpenStreetMap contributors','attributionURL':'https://www.openstreetmap.org/copyright','dataTimestamp':raw.get('osm3s',{}).get('timestamp_osm_base'),'fetchedAtUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'limitations':['Building geometry follows OSM; absent buildings are not invented.','Missing explicit building height is estimated from tagged levels or generic building type.','Terrain elevations are not supplied by OSM; ground mesh requires elevation source.','Road widths are estimated by highway type unless explicitly tagged.']},'land':land,'coastlines':coasts,'buildings':buildings,'roads':roads,'piers':piers,'areas':areas,'landmarks':landmarks,'shoreTexture':{'url':'/data/shore-distance.png','bounds':bounds,'width':resolution,'height':resolution,'channels':{'r':'distance to mapped coastline / 100m, capped at 1','g':'land mask: 1 land, 0 sea','b':'unused','a':'1'},'imageRows':'row 0 north (maxZ), row height-1 south (minZ)','uv':'u=(x-minX)/(maxX-minX); v=(z-minZ)/(maxZ-minZ); use texture invertY=true for v=0 south'}}
scene['metadata']['projection']=PROJECTION
scene['metadata']['coordinateSystem']='WGS84 azimuthal equidistant projection in metres; x east, z north, y up'
scene['metadata']['sourceAPI']=raw.get('sourceAPI','Overpass')
scene['metadata']['terrain']='No DEM: terrain elevation must be explicitly presented as visual approximation.'
scene['metadata']['boundsNote']='AEQD projected southwest/northeast bbox corners; local rectangle used for terrain clipping.'
scene['metadata']['limitations'].append('Selected OSM ways only; relation-only multipolygon buildings may be absent. Downloaded official XML preserves all map relations for future processing.')
for name,bid in [('回澜阁','way/131985941')]:
    matches=[b for b in buildings if b['id']==bid]
    if matches:
        center=Polygon(matches[0]['polygon']).centroid
        landmarks.append({'id':bid,'name':name,'position':[round(center.x,3),round(center.y,3)],'tags':matches[0]['tags']})
(OUT/'scene.json').write_text(json.dumps(scene,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print('COUNTS', {k:len(scene[k]) for k in ['land','coastlines','buildings','roads','piers','areas','landmarks']})
print('LAND checks',{'qingdao_station':landgeom.contains(Point(*local(120.3125,36.064))), 'xiaoqingdao':landgeom.contains(Point(*local(120.3187589,36.0533032))), 'open_bay':landgeom.contains(Point(*local(120.313,36.05)))})
