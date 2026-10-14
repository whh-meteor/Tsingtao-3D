from pathlib import Path
import os,json,sys,osmium
sys.stdout.reconfigure(encoding='utf8')
ROOT=Path(__file__).resolve().parents[1];os.chdir(ROOT)
ways=[];nodes=[];relations=[]
def relevant(lon,lat):return 120.02<lon<120.42 and 36.09<lat<36.34
class H(osmium.SimpleHandler):
 def node(self,n):
  t=dict(n.tags)
  if relevant(n.location.lon,n.location.lat) and (t.get('man_made') in ['bridge_pier','tower'] or '航道' in t.get('name','') or t.get('seamark:type') in ['bridge','fairway']):nodes.append({'id':n.id,'lon':n.location.lon,'lat':n.location.lat,'tags':t})
 def way(self,w):
  t=dict(w.tags)
  if not ((t.get('bridge') and t['bridge']!='no' and t.get('highway')) or '航道' in t.get('name','') or '胶州湾大桥' in t.get('name','') or t.get('waterway') or t.get('man_made')=='bridge_pier'):return
  try:c=[(n.lon,n.lat) for n in w.nodes]
  except osmium.InvalidLocationError:return
  if len(c)<2 or not any(relevant(*p) for p in c):return
  ways.append({'id':w.id,'coordinates':c,'tags':t,'nodes':[n.ref for n in w.nodes]})
 def relation(self,r):
  t=dict(r.tags)
  if '胶州湾' in t.get('name','') or '红岛' in t.get('name','') or ('G22' in t.get('ref','') and t.get('type')=='route'):relations.append({'id':r.id,'tags':t,'members':[{'id':m.ref,'type':m.type,'role':m.role} for m in r.members]})
H().apply_file('sources/shandong-latest.osm.pbf',locations=True,idx='flex_mem')
Path('sources/bay-bridge-probe.json').write_text(json.dumps({'ways':ways,'nodes':nodes,'relations':relations},ensure_ascii=False),encoding='utf8')
print('WAYS',len(ways),'NODES',len(nodes),'RELATIONS',len(relations))
for w in ways:
 if w['tags'].get('highway') in ['motorway','motorway_link','trunk','trunk_link']:print(w['id'],w['tags'],w['coordinates'][0],w['coordinates'][-1])
print('FEATURE NODES',nodes)
print('RELATIONS',[(r['id'],r['tags'],len(r['members'])) for r in relations])
