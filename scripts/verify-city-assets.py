"""Meaningful integrity checks for the metro and real-building far-LOD assets."""
from pathlib import Path
import json,math
from shapely.geometry import Polygon,Point
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'public'/'data'
m=json.loads((D/'metro.json').read_text(encoding='utf8'))
assert {l['ref'] for l in m['lines']}=={'1','2','3','4','6','8','11','13'}
ids=set();segments=0;stations=0
for line in m['lines']:
 assert line['color'].startswith('#') and len(line['color'])==7
 assert len({s['id'] for s in line['segments']})==len(line['segments'])
 for segment in line['segments']:
  assert segment['id'].startswith('way/') and len(segment['points'])>=2
  assert all(math.isfinite(x) for p in segment['points'] for x in p)
  assert segment['length']>0
 for station in line['stations']:
  assert station['id'] in station['memberIds']
  assert any(s['id']==station['id'] and s['position']==station['position'] for s in line['stationMembers'])
 segments+=len(line['segments']);stations+=len(line['stations'])
o=json.loads((D/'city-overview.json').read_text(encoding='utf8'))
assert len(o['buildings'])==23758 and len({r[0] for r in o['buildings']})==23758
assert sum(t['buildingCount'] for t in o['tiles'])==23758
assert len(o['buildings'][0])==len(o['buildingColumns'])==8
for row in o['buildings']:
 assert all(math.isfinite(x) for x in row[1:])
 assert row[3]>=row[4]>0 and row[5]>0 and row[7] in [0,1]
 assert -math.pi/2-.00001<=row[6]<=math.pi/2+.00001
for cell in o['urbanCells']:
 ix,iz,area,count,a,b,c,d=cell
 assert count>0 and area>0
 assert ix*250-.11<=a<c<=(ix+1)*250+.11
 assert iz*250-.11<=b<d<=(iz+1)*250+.11
print({'metroLines':len(m['lines']),'metroSegments':segments,'stationMarkers':stations,'buildings':len(o['buildings']),'urbanCells':len(o['urbanCells'])})
if (D/'civic-landmarks.json').exists():
 c=json.loads((D/'civic-landmarks.json').read_text(encoding='utf8'))
 assert {'tv-tower','may-wind','city-government','may-fourth-square'}.issubset({f['kind'] for f in c['features']})
 for group in ['features','governmentBuildings','governmentAdjacentBuildings','coastalBuildings','plazaAreas']:
  for feature in c.get(group,[]):
   if 'polygon' not in feature:continue
   assert all(math.isfinite(v) for p in feature['polygon'] for v in p)
   assert all(math.isfinite(v) for h in feature.get('holes',[]) for p in h for v in p)
   p=Polygon(feature['polygon'],feature.get('holes',[]));assert p.is_valid and p.area>0,(group,feature['id'])
 gov=next(f for f in c['features'] if f['id']=='node/11432724805')
 main=next(f for f in c['governmentBuildings'] if f['id']=='way/275858482')
 assert Polygon(main['polygon']).covers(Point(gov['position']))
 assert main['tags']['building:levels']=='12' and main['estimatedHeight']
 assert all(b['shoreDistance']<=1500 and b['height']>40 for b in c['coastalBuildings'])
 assert len(c['plazaAreas'])==50 and len(c['plazaPaths'])==37
 for path in c['plazaPaths']:assert all(math.isfinite(v) for p in path['points'] for v in p)
 print({'civicFeatures':len(c['features']),'governmentBuildings':len(c['governmentBuildings']),'coastalCandidates':len(c['coastalBuildings']),'plazaAreas':len(c['plazaAreas']),'plazaPaths':len(c['plazaPaths'])})
