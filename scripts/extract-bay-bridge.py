"""Reproducible real OSM Jiaozhou Bay bridge alignment and documented channel structures.
Uses sources/bay-bridge-probe.json produced by probe-bay-bridge.py.
Coordinates are WGS84 AEQD metres, X east / Z north. Structural elevation is estimated.
"""
from pathlib import Path
import json,math,sys
from shapely.geometry import LineString,Point
from shapely.ops import transform,linemerge,unary_union
from pyproj import Transformer
sys.stdout.reconfigure(encoding='utf8')
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public'/'data'
PROJ='+proj=aeqd +lat_0=36.0603 +lon_0=120.3163 +datum=WGS84 +units=m +no_defs'
T=Transformer.from_crs('EPSG:4326',PROJ,always_xy=True);INV=Transformer.from_crs(PROJ,'EPSG:4326',always_xy=True)
raw=json.loads((ROOT/'sources'/'bay-bridge-probe.json').read_text(encoding='utf8'))
main=[w for w in raw['ways'] if w['tags'].get('ref')=='S85' and w['tags'].get('bridge') and w['tags'].get('highway')=='motorway']
merged=linemerge([transform(T.transform,LineString(w['coordinates'])) for w in main])
lanes=list(merged.geoms)
assert len(lanes)==2,'Expected two separate carriageway chains'
for i,line in enumerate(lanes):
 if line.coords[0][0]<line.coords[-1][0]:lanes[i]=LineString(list(line.coords)[::-1])
length=sum(l.length for l in lanes)/2
def at(s):
 p=[l.interpolate(max(0,min(s,l.length))) for l in lanes]
 return [(p[0].x+p[1].x)/2,(p[0].y+p[1].y)/2]
axis=LineString([at(s) for s in [i*20 for i in range(math.ceil(length/20))]+[length]])
anchorA=Point(*T.transform(120+20.07/60,36+10.26/60));anchorB=Point(*T.transform(120+19.89/60,36+10.26/60))
anchorS=(axis.project(anchorA)+axis.project(anchorB))/2
selected={w['id']:w for w in raw['ways'] if w in main or w['tags'].get('ref') in ['S8511','S8512']}
linebuffer=unary_union([transform(T.transform,LineString(w['coordinates'])) for w in selected.values()]).buffer(1600)
candidates=[w for w in raw['ways'] if w['tags'].get('highway')=='motorway_link' and w['tags'].get('bridge') and min(p[1] for p in w['coordinates'])<36.195 and max(p[0] for p in w['coordinates'])<120.367 and linebuffer.intersects(transform(T.transform,LineString(w['coordinates'])))]
while True:
 nodes=set(n for w in selected.values() for n in w['nodes']);extra=[w for w in candidates if w['id'] not in selected and nodes.intersection(w['nodes'])]
 if not extra:break
 for w in extra:selected[w['id']]=w
roads=[]
for w in selected.values():
 t=w['tags'];l=transform(T.transform,LineString(w['coordinates']));ref=t.get('ref','')
 kind='main' if ref=='S85' else ('hongdao' if ref=='S8511' else ('jiaozhou' if ref=='S8512' else 'ramp'))
 lanesCount=int(t.get('lanes','2' if kind=='ramp' else '3'))
 width=17.5 if kind=='main' else (9.25 if kind=='jiaozhou' else 12 if kind=='hongdao' else 3.5*lanesCount+2)
 roads.append({'id':'way/'+str(w['id']),'kind':kind,'name':t.get('name',''),'type':t['highway'],'points':[[round(x,3),round(z,3)] for x,z in l.coords],'length':round(l.length,3),'width':width,'estimatedWidth':True,'lanes':lanesCount,'tags':t})
sections=[]
for name,kind,kcenter,size,height,deck,span,towers in [('沧口航道桥','double-tower-cable-stayed',37230,600,105,46,260,[-130,130]),('红岛航道桥','single-tower-cable-stayed',47610,240,65,31,120,[0]),('大沽河航道桥','single-pylon-self-anchored-suspension',51995,610,148.7,53,260,[-35])]:
 s=anchorS+(kcenter-37230);p=axis.interpolate(s);before=axis.interpolate(s-10);after=axis.interpolate(s+10);dx,dz=after.x-before.x,after.y-before.y;n=math.hypot(dx,dz)
 sections.append({'name':name,'kind':kind,'position':[round(p.x,3),round(p.y,3)],'longitudeLatitude':list(INV.transform(p.x,p.y)),'axisDistance':round(s,3),'tangent':[dx/n,dz/n],'length':size,'mainSpan':span,'towerOffsets':towers,'towerHeight':height,'deckHeight':deck,'towerPositionSource':'沧口: official MSA channel pier light coordinates projected onto OSM. Other channels: relative chainage from 2025 operator procurement, aligned to that anchor.','estimatedTowerPositions':True,'estimatedDeckHeight':True,'heightReference':'tower height from source foundation/pile cap; rendered at source height above sea datum as a visual approximation','source':'https://www.sdhsg.com/article/67308'})
points=[p for r in roads for p in r['points']];bounds={'minX':min(p[0] for p in points),'maxX':max(p[0] for p in points),'minZ':min(p[1] for p in points),'maxZ':max(p[1] for p in points)}
for section in sections:
 section['estimatedTowerHeight']=section['name']=='红岛航道桥'
 section['towerBaseHeight']=5 if section['kind'].endswith('cable-stayed') else 0
 section['estimatedTowerBaseHeight']=section['name']!='沧口航道桥'
 section['towerHeightSource']='https://www.qingdao.gov.cn/ywdt/tpxw/202010/t20201012_290464.shtml' if section['name']=='大沽河航道桥' else ('https://www.sdhsg.com/article/766' if section['name']=='沧口航道桥' else 'Provisional visual scale; authoritative exact height has not been confirmed.')
 section['channelCarriagewayWidth']=20 if section['name']=='大沽河航道桥' else 24
 section['estimatedChannelWidth']=section['name']=='大沽河航道桥'
data={'metadata':{'name':'胶州湾大桥','projection':PROJ,'origin':{'longitude':120.3163,'latitude':36.0603},'source':'OpenStreetMap / Geofabrik Shandong, 2026-10-11T20:21:06Z','attribution':'© OpenStreetMap contributors','license':'ODbL 1.0','osmRouteRelation':'relation/13933875','osmBridgeOutlineRelation':'relation/7326314','operatorFactsSource':'https://www.sdhsg.com/article/67308','cangkouAnchorSource':'https://pnp.chart.msa.gov.cn/CorrectionPdf/Download/bf0d499e-5e6d-4219-b811-4a62f0f3c62c?y=2026','standardMainBridgeWidth':35,'ordinaryDeckHeight':18,'estimatedOrdinaryDeckHeight':True,'ordinarySpanSpacing':60,'heightNote':'Horizontal geometry is real OSM. No surveyed roadway vertical profile was available; deck elevation and grades are explicit visual estimates.','limitations':['A carriageway uses 17.5m inferred half of 35m standard width; actual channel steel-box decks can be wider.','Tower plan positions are channel-location estimates derived from official pier lights and route chainage, not surveyed tower coordinates.','Only the bridge-tagged OSM main line and connected Hongdao/Jiaozhou ramps are included; ordinary inland motorway is excluded.']},'bounds':bounds,'roads':roads,'mainAxis':[[round(x,3),round(z,3)] for x,z in axis.simplify(5).coords],'mainLength':round(length,3),'carriagewayLengths':[round(l.length,3) for l in lanes],'sections':sections,'excludedRoadIds':[r['id'] for r in roads]}
assert all(math.isfinite(v) for r in roads for p in r['points'] for v in p)
assert 25000<length<27000
assert all(r['length']>0 for r in roads)
(OUT/'bay-bridge.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('ROADS',len(roads),'by kind',{k:sum(r['kind']==k for r in roads) for k in ['main','ramp','hongdao','jiaozhou']},'main length',length)
print('CHANNELS',[(s['name'],s['position'],s['longitudeLatitude'],s['axisDistance']) for s in sections])
