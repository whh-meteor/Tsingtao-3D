"""Extract Qingdao subway route relations, original ways and stations from the local PBF.
Missing ways stay missing: never connect stations or disconnected OSM ways with invented lines.
"""
from pathlib import Path
import os,json,math,sys,re,datetime
import osmium
from pyproj import Transformer
sys.stdout.reconfigure(encoding='utf8')
ROOT=Path(__file__).resolve().parents[1];os.chdir(ROOT)
OUT=ROOT/'public'/'data';SOURCE=ROOT/'sources'
PROJ='+proj=aeqd +lat_0=36.0603 +lon_0=120.3163 +datum=WGS84 +units=m +no_defs'
T=Transformer.from_crs('EPSG:4326',PROJ,always_xy=True)
KNOWN={'Q15907883','Q15936318','Q15937512','Q15944362','Q15935678','Q22100048','Q15947246','Q15951864'}
NAMES={'1':'1号线','2':'2号线','3':'3号线','4':'4号线','6':'6号线','8':'8号线','11':'蓝谷快线','13':'西海岸快线'}
relations=[]
class Relations(osmium.SimpleHandler):
 def relation(self,r):
  t=dict(r.tags)
  if t.get('type')!='route' or t.get('route')!='subway':return
  if t.get('wikidata') not in KNOWN and '青岛' not in t.get('network','') and 'Qingdao' not in t.get('network:en',''):return
  matched=re.match(r'\d+',t.get('ref',''))
  relations.append({'id':'relation/'+str(r.id),'lineRef':matched.group(0) if matched else t.get('ref',''),'tags':t,'members':[{'id':m.ref,'type':m.type,'role':m.role} for m in r.members]})
Relations().apply_file('sources/shandong-latest.osm.pbf')
with osmium.io.Reader('sources/shandong-latest.osm.pbf') as reader:timestamp=reader.header().get('osmosis_replication_timestamp')
wantWays={m['id'] for r in relations for m in r['members'] if m['type']=='w'}
wantNodes={m['id'] for r in relations for m in r['members'] if m['type']=='n'}
ways={};nodes={}
class Geometry(osmium.SimpleHandler):
 def node(self,n):
  if n.id not in wantNodes:return
  t=dict(n.tags)
  if not n.location.valid():return
  x,z=T.transform(n.location.lon,n.location.lat)
  nodes[n.id]={'id':'node/'+str(n.id),'name':t.get('name:zh',t.get('name','')),'position':[round(x,2),round(z,2)],'longitudeLatitude':[n.location.lon,n.location.lat],'tags':t}
 def way(self,w):
  if w.id not in wantWays:return
  try:coords=[(n.lon,n.lat) for n in w.nodes]
  except osmium.InvalidLocationError:return
  if len(coords)<2:return
  points=[[round(x,2),round(z,2)] for x,z in [T.transform(*p) for p in coords]]
  t=dict(w.tags);status='construction' if t.get('railway')=='construction' or t.get('construction')=='subway' else ('disused' if t.get('railway') in ['disused','abandoned'] else 'osm-route')
  ways[w.id]={'id':'way/'+str(w.id),'points':points,'nodeIds':[n.ref for n in w.nodes],'tags':t,'status':status,'length':round(sum(math.dist(a,b) for a,b in zip(points,points[1:])),2)}
Geometry().apply_file('sources/shandong-latest.osm.pbf',locations=True,idx='flex_mem')
lines=[]
for ref in sorted({r['lineRef'] for r in relations},key=lambda n:int(n) if n.isdigit() else 999):
 rr=[r for r in relations if r['lineRef']==ref];segments={};stations={};missing=[];platforms=[]
 for r in rr:
  for member in r['members']:
   ident=member['id'];role=member['role']
   if member['type']=='w':
    way=ways.get(ident)
    if not way:missing.append({'id':'way/'+str(ident),'relationId':r['id'],'role':role});continue
    if 'platform' in role or way['tags'].get('public_transport')=='platform':platforms.append(way['id']);continue
    if way['tags'].get('railway') not in ['subway','light_rail','rail','construction']:
     # Keep irregularly tagged rail route member ways explicitly, rather than silently fabricating a replacement.
     if way['tags'].get('highway') or way['tags'].get('building'):continue
    if ident not in segments:segments[ident]={k:v for k,v in way.items() if k!='nodeIds'}
   elif member['type']=='n' and ident in nodes:
    station=nodes[ident]
    if station['tags'].get('railway')=='subway_entrance':continue
    if station['tags'].get('public_transport')=='platform' and not station['name']:continue
    if ident not in stations:stations[ident]={**station,'roles':set(),'relationIds':set()}
    stations[ident]['roles'].add(role);stations[ident]['relationIds'].add(r['id'])
 for station in stations.values():station['roles']=sorted(station['roles']);station['relationIds']=sorted(station['relationIds'])
 stationMembers=list(stations.values());glyphs=[]
 for station in stationMembers:
  match=next((s for s in glyphs if station['name'] and s['name']==station['name'] and math.dist(s['position'],station['position'])<=220),None)
  if match:match['memberIds'].append(station['id'])
  else:glyphs.append({**station,'memberIds':[station['id']]})
 colors=[r['tags'].get('colour') for r in rr if r['tags'].get('colour')]
 lines.append({'id':'line/'+ref,'ref':ref,'name':NAMES.get(ref,rr[0]['tags'].get('name','')),'color':colors[0] if colors else '#FFFFFF','osmNames':sorted({r['tags'].get('name','') for r in rr}),'relationIds':[r['id'] for r in rr],'segments':list(segments.values()),'stations':glyphs,'stationMembers':stationMembers,'stationGlyphPolicy':'Same-name route stop nodes within 220m share one optical station marker. Position is the first actual OSM stop coordinate, not an invented midpoint. Original nodes are preserved in stationMembers.','missingMembers':missing,'platformWayIds':sorted(set(platforms)),'operatingStatus':'OSM route geometry only; construction tags are preserved; not a verified opening/timetable list'})
points=[p for line in lines for s in line['segments'] for p in s['points']]
assert points and all(math.isfinite(v) for p in points for v in p)
assert len(lines)==8
data={'metadata':{'name':'青岛地铁真实线路几何','source':'https://download.geofabrik.de/asia/china/shandong.html','sourceTimestamp':timestamp,'attribution':'© OpenStreetMap contributors','license':'ODbL 1.0','projection':PROJ,'origin':{'longitude':120.3163,'latitude':36.0603},'generatedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'officialNamesSource':'https://www.qd-metro.com/','officialCheckedDate':'2026-10-14','officialNames':NAMES,'operatingStatusNote':'Official homepage confirms the eight line names; exact route endpoints/opening status follow OSM and may include planned or stale members. Official homepage currently describes Line 8 south construction; do not present every OSM relation endpoint as operating.','geometryPolicy':'Each segment is an original route-member OSM way. Shared ways are deduplicated within a line. Disconnected/missing members are not joined with straight lines. Underground tracks are projected horizontally to the ground for the optical overlay; actual tunnel elevation is unavailable.'},'bounds':{'minX':min(p[0] for p in points),'maxX':max(p[0] for p in points),'minZ':min(p[1] for p in points),'maxZ':max(p[1] for p in points)},'lines':lines,'relations':relations}
(OUT/'metro.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
(SOURCE/'metro-route-members.json').write_text(json.dumps({'relations':relations,'ways':list(ways.values()),'nodes':list(nodes.values())},ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('LINES',[(l['ref'],l['name'],len(l['segments']),len(l['stations']),sum(s['status']=='construction' for s in l['segments']),len(l['missingMembers'])) for l in lines]);print('BYTES',(OUT/'metro.json').stat().st_size)
