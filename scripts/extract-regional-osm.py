"""Extract real OSM city assets from Geofabrik Shandong, in metre-scale AEQD.

python scripts/extract-regional-osm.py
Dependencies: pip install osmium requests shapely pyproj
Boundary: public/data/districts.geojson (WGS84). No fictional infill is generated.
"""
from pathlib import Path
import json, math, re, time, sys, os
import requests, osmium
from shapely.geometry import shape, Polygon, MultiPolygon, LineString, Point, box
from shapely.ops import transform, unary_union, polygonize
from shapely.prepared import prep
from shapely import wkb, STRtree
from pyproj import Transformer

sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parents[1]
os.chdir(ROOT)  # libosmium Windows file loader needs ASCII relative paths.
OUT=ROOT/'public'/'data'; SOURCES=ROOT/'sources'
CHUNKS=OUT/'chunks'; CHUNKS.mkdir(parents=True,exist_ok=True)
URL='https://download.geofabrik.de/asia/china/shandong-latest.osm.pbf'
PBF=SOURCES/'shandong-latest.osm.pbf'
PROJECTION='+proj=aeqd +lat_0=36.0603 +lon_0=120.3163 +datum=WGS84 +units=m +no_defs'
PROJECT=Transformer.from_crs('EPSG:4326',PROJECTION,always_xy=True)
BOUNDARIES=json.loads((OUT/'districts.geojson').read_text(encoding='utf-8'))
WGS=unary_union([shape(f['geometry']) for f in BOUNDARIES['features']])
REGION=transform(PROJECT.transform,WGS); MASK=prep(REGION)
EXTENT=box(-73200,-53600,66800,63600)
WGSEXTENT=WGS.envelope.buffer(.1)
SIZE=2000
WIDTHS={'motorway':18,'motorway_link':7,'trunk':16,'trunk_link':7,'primary':14,'primary_link':6,'secondary':11,'secondary_link':6,'tertiary':9,'tertiary_link':5,'residential':7,'unclassified':7,'service':4,'footway':2.3,'pedestrian':5,'path':1.7,'steps':2,'cycleway':2.5,'living_street':5,'track':3}
MACRO={'motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary'}
def save(path,data):
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8');tmp.replace(path)
def rounded(coords):return [[round(x,2),round(z,2)] for x,z in coords]
def number(v):
    m=re.search(r'[0-9]+(?:\.[0-9]+)?',str(v or ''));return float(m.group()) if m else None
def polys(g):
    if g.geom_type=='Polygon':return [g]
    return [p for p in getattr(g,'geoms',[]) if p.geom_type=='Polygon']
def lines(g):
    if g.geom_type=='LineString':return [g]
    return [p for p in getattr(g,'geoms',[]) if p.geom_type=='LineString']
def bounds(b):return {'minX':round(b[0],2),'minZ':round(b[1],2),'maxX':round(b[2],2),'maxZ':round(b[3],2)}

if not PBF.exists():
    SOURCES.mkdir(exist_ok=True)
    r=requests.get(URL,stream=True,timeout=120);r.raise_for_status()
    with PBF.open('wb') as f:
        for c in r.iter_content(1024*1024):f.write(c)
with osmium.io.Reader('sources/shandong-latest.osm.pbf') as reader:
    TIMESTAMP=reader.header().get('osmosis_replication_timestamp')
SOURCE={'provider':'Geofabrik Shandong extract','url':URL,'attribution':'© OpenStreetMap contributors','license':'ODbL 1.0','attributionURL':'https://www.openstreetmap.org/copyright','timestamp':TIMESTAMP,'projection':PROJECTION,'origin':{'longitude':120.3163,'latitude':36.0603},'fetchedAtUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'limitations':['Only OSM-mapped buildings are present; missing geometry is not fabricated.','Building heights and road widths without explicit tags are estimates.','District boundaries determine the extraction mask; coastline is OSM geometry.']}

chunks={};macro=[];coasts=[];seen=set();counts={'roads':0,'buildings':0,'coastlines':0,'ways':0}
def chunk(ix,iz):
    key=f'{ix}_{iz}'
    if key not in chunks:
        chunks[key]={'id':key,'bounds':bounds((ix*SIZE,iz*SIZE,(ix+1)*SIZE,(iz+1)*SIZE)),'buildings':[],'roads':[]}
    return chunks[key]

class Extractor(osmium.SimpleHandler):
    def __init__(self):super().__init__();self.factory=osmium.geom.WKBFactory()
    def way(self,w):
        counts['ways']+=1
        if counts['ways']%200000==0:print('Ways',counts,flush=True)
        t=dict(w.tags);coast=t.get('natural')=='coastline';h=t.get('highway')
        if not coast and not h:return
        try:coords=[(n.lon,n.lat) for n in w.nodes]
        except osmium.InvalidLocationError:return
        if len(coords)<2:return
        west,south,east,north=WGSEXTENT.bounds
        if max(c[0] for c in coords)<west or min(c[0] for c in coords)>east or max(c[1] for c in coords)<south or min(c[1] for c in coords)>north:return
        p=transform(PROJECT.transform,LineString(coords));ident=f'way/{w.id}'
        if coast:
            for i,l in enumerate(lines(p.intersection(EXTENT))):
                if l.length>1:coasts.append({'id':ident+(f'/{i}' if i else ''),'points':rounded(l.simplify(2).coords)})
            counts['coastlines']+=1
        if h and MASK.intersects(p):
            width=number(t.get('width')) or WIDTHS.get(h,5)
            clipped=p.intersection(REGION)
            for part,l in enumerate(lines(clipped)):
                if l.length<2:continue
                base={'id':ident+(f'/{part}' if part else ''),'type':h,'name':t.get('name',''),'width':width}
                if h in MACRO:macro.append({**base,'points':rounded(l.simplify(50).coords)})
                a,b,c,d=l.bounds
                for ix in range(math.floor(a/SIZE),math.floor(c/SIZE)+1):
                    for iz in range(math.floor(b/SIZE),math.floor(d/SIZE)+1):
                        cell=box(ix*SIZE,iz*SIZE,(ix+1)*SIZE,(iz+1)*SIZE)
                        for n,segment in enumerate(lines(l.intersection(cell))):
                            if segment.length>1:chunk(ix,iz)['roads'].append({**base,'id':base['id']+f'/{ix}_{iz}_{n}','points':rounded(segment.simplify(1).coords)})
            counts['roads']+=1
    def area(self,a):
        t=dict(a.tags)
        if not t.get('building') or t.get('building')=='no':return
        try:g=wkb.loads(self.factory.create_multipolygon(a),hex=True)
        except Exception:return
        if not WGS.intersects(g):return
        g=transform(PROJECT.transform,g)
        ident=('way/' if a.from_way() else 'relation/')+str(a.orig_id())
        if ident in seen:return
        seen.add(ident)
        h=number(t.get('height'));levels=number(t.get('building:levels'));estimated=h is None
        if h is None:h=levels*3.2 if levels else (16 if t.get('building') in ['apartments','commercial','office'] else 9)
        for i,poly in enumerate(polys(g)):
            if poly.area<4 or not MASK.intersects(poly):continue
            center=poly.representative_point();ix=math.floor(center.x/SIZE);iz=math.floor(center.y/SIZE)
            asset={'id':ident+(f'/{i}' if i else ''),'polygon':rounded(list(poly.exterior.coords)[:-1]),'height':round(h,2),'estimatedHeight':estimated,'heightSource':'height' if not estimated else ('building:levels × 3.2m' if levels else 'typology default'),'name':t.get('name',''),'tags':{k:v for k,v in t.items() if k in ['building','building:levels','height','roof:shape','roof:height','name','building:material']}}
            if poly.interiors:asset['holes']=[rounded(list(r.coords)[:-1]) for r in poly.interiors]
            chunk(ix,iz)['buildings'].append(asset);counts['buildings']+=1

print('Extracting',PBF.stat().st_size,'bytes',TIMESTAMP,flush=True)
Extractor().apply_file('sources/shandong-latest.osm.pbf',locations=True,idx='flex_mem')
save(OUT/'regional-roads.json',{'roads':macro,'coastlines':coasts,'source':SOURCE,'bounds':bounds(EXTENT.bounds)})
print('REGIONAL READY',len(macro),len(coasts),flush=True)
index=[]
for key,c in sorted(chunks.items()):
    save(CHUNKS/(key+'.json'),c)
    index.append({'id':key,'file':'/data/chunks/'+key+'.json','bounds':c['bounds'],'buildingCount':len(c['buildings']),'roadCount':len(c['roads'])})
save(CHUNKS/'index.json',{'bounds':bounds(EXTENT.bounds),'chunkSize':SIZE,'chunks':index,'source':SOURCE,'totals':counts})
print('CHUNKS READY',len(index),counts,flush=True)

# Polygonize directed coastline. OSM land is on the left of each coast way.
coastlines=[LineString(c['points']) for c in coasts]
network=unary_union(coastlines+[EXTENT.boundary]);faces=list(polygonize(network))
tree=STRtree(faces);votes=[[0,0] for _ in faces]
for line in coastlines:
    cp=list(line.coords)
    for p,q in zip(cp,cp[1:]):
        dx,dz=q[0]-p[0],q[1]-p[1];length=math.hypot(dx,dz)
        if length<.1:continue
        mx,mz=(p[0]+q[0])/2,(p[1]+q[1])/2;offset=min(2,length/4)
        for side,sign in [(0,1),(1,-1)]:
            point=Point(mx-sign*dz/length*offset,mz+sign*dx/length*offset)
            for f in tree.query(point):
                if faces[f].contains(point):votes[f][side]+=1
land=[p for p,v in zip(faces,votes) if v[0]>v[1]]
landgeom=unary_union(land)
save(OUT/'regional-land.json',{'land':[{'id':f'land/{i}','polygon':rounded(list(p.exterior.coords)[:-1]),'holes':[rounded(list(r.coords)[:-1]) for r in p.interiors]} for i,p in enumerate(polys(landgeom))],'source':SOURCE,'bounds':bounds(EXTENT.bounds),'method':'Polygonized OSM coastline, land-left direction votes; clipped at regional rectangle.'})
print('LAND READY',len(land),landgeom.area,flush=True)
