import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { readData } from '../scripts/read-data.mjs';
import { compileCampus } from '../.checks/data/compile.js';
import { validateSources } from '../.checks/data/validate.js';
import { auditGeometry } from '../.checks/data/audit.js';
import { placeIndex, searchPlaces, buildingCatalog } from '../.checks/data/places.js';
import { FloorMap } from '../.checks/ui/FloorMap.js';
import { AStarPathfinder } from '../.checks/pathfinding/AStar.js';

const source=await readData(), data=compileCampus(source.manifest,source.buildings,source.floors);
const floors=source.floors.filter(f=>f.buildingId==='b19');
const building=data.buildings.find(b=>b.id==='b19');
const places=placeIndex(data).filter(p=>p.buildingId==='b19');
const finder=new AStarPathfinder(data);
const validate=(s=source)=>validateSources(s.manifest,s.buildings,s.floors,s.sources,s.overview);

test('Building 19 registers four floors, 48 areas and ten WCs without filling absent room numbers',()=>{
  assert.deepEqual(validate(),[]);
  assert.deepEqual(building.floors.map(f=>[f.label,f.rooms.length]),[['B1',6],['1F',4],['2F',13],['3F',25]]);
  assert.equal(places.filter(p=>p.kind==='room').length,48);
  assert.equal(places.filter(p=>p.kind==='room'&&p.nodeId).length,48);
  assert.equal(places.filter(p=>p.kind==='restroom').length,10);
  assert.deepEqual(building.floors.map(f=>f.features.filter(p=>p.type==='restroom').length),[3,0,5,2]);
  for(const id of ['19-301','19-307','19-211']) assert.ok(!places.some(p=>p.id===id));
  assert.equal(searchPlaces(places,'保健管理センター')[0].id,'19-health-center');
  assert.equal(searchPlaces(places,'ラックス')[0].id,'19-B20');
  assert.equal(places.find(p=>p.id==='19-107').nodeId,'b19/f1/room-107');
  assert.match(places.find(p=>p.id==='19-107').description,/左側の通路/);
  assert.ok(places.filter(p=>p.name.endsWith('研究室')).every(p=>/^19-\d+ 研究室$/.test(p.name)));
});

test('Building 19 reaches every registered place via inferred stairs while preserving honest elevator limits',()=>{
  const start='b19/b1/stairs-left';
  for(const p of places.filter(p=>p.nodeId)) for(const mode of ['shortest','indoor','stairs']){
    const r=finder.findPath(start,p.nodeId,mode);
    assert.ok(r,`${p.id}: ${mode}`);
    assert.ok(r.pathNodes.every(n=>n.buildingId==='b19'));
    if(p.nodeId!==start) assert.equal(finder.findPath(start,p.nodeId,mode,false),null);
  }
  const evEdges=data.navigation.edges.filter(e=>e.type==='elevator'&&e.from.startsWith('b19/'));
  assert.deepEqual(evEdges.map(e=>[e.from,e.to]),[['b19/f2/ev-left','b19/f3/ev-left'],['b19/b1/ev-left','b19/f2/ev-left']]);
  assert.deepEqual(places.filter(p=>p.kind==='elevator').map(p=>p.floorLevel).sort((a,b)=>a-b),[-1,2,3]);
  for(const [from,to,label] of [['b19/b1/ev-left','b19/f2/ev-left','2F'],['b19/f2/ev-left','b19/b1/ev-left','B1']]){
    const r=finder.findPath(from,to,'accessible');assert.ok(r);assert.equal(r.floorChanges,2);
    assert.ok(!r.pathNodes.some(n=>n.floor===1));
    assert.match(r.steps.find(s=>s.edgeType==='elevator').instruction,new RegExp(`1Fを通過.*${label}`));
  }
  const upper=finder.findPath('b19/b1/room-B20','b19/f3/room-305','accessible');
  assert.ok(upper);assert.equal(upper.floorChanges,3);assert.ok(upper.steps.every(s=>s.edgeType!=='stairs'));
  for(const start of places.filter(p=>p.nodeId&&p.floorLevel!==1))
    for(const end of places.filter(p=>p.nodeId&&p.floorLevel===1))
      assert.equal(finder.findPath(start.nodeId,end.nodeId,'accessible'),null,`${start.id} -> ${end.id}: no public EV landing on 1F`);
  assert.equal(finder.findPath('b19/f1/room-101','b19/f2/room-216','accessible'),null);
  assert.ok(finder.findPath('b19/f2/room-216','b19/f3/room-305','accessible'));
  assert.equal(finder.findPath('b19/f1/room-104','b19/f1/room-101').floorChanges,2);
  assert.equal(finder.findPath('b19/f1/room-104','b19/f1/room-101','accessible'),null);
  assert.ok(finder.findPath('b19/f1/room-101','b3/f1/entrance-north'));
  assert.equal(places.filter(p=>p.kind==='entrance').length,1);
  assert.equal(source.manifest.outdoor.links.filter(l=>l.to.startsWith('b19/')).length,1);
});

test('Building 19 left-side rooms share a corridor and the shop entrance stays on the separate lower corridor',()=>{
  const f=floors.find(f=>f.id==='f1'),node=id=>f.navigation.nodes.find(n=>n.id===id);
  const r=finder.findPath('b19/f1/room-104','b19/f1/room-107','accessible');
  assert.ok(r);assert.equal(r.floorChanges,0);assert.ok(r.pathNodes.every(n=>n.floor===1));
  assert.equal(node('room-107').position[0],Math.min(...f.rooms.find(r=>r.id==='19-107').polygon.map(p=>p[0])));
  const entrance=places.find(p=>p.kind==='entrance');
  assert.equal(entrance.nodeId,'b19/f1/entrance-shop');
  assert.ok(node('entrance-shop').position[1]>node('room-101').position[1]);
  assert.equal(node('entrance-shop').position[0],node('room-101').position[0]);
  assert.ok(finder.findPath(entrance.nodeId,'b19/f1/room-101','accessible'));
  assert.equal(finder.findPath(entrance.nodeId,'b19/f1/room-107','accessible'),null);
  assert.match(f.notes.join(' '),/左側通路の屋外出入口.*現地確認待ち/);
});

test('non-adjacent EV stops require an explicit floor count; stairs still cannot skip levels',()=>{
  const s=structuredClone(source),connections=s.buildings.find(b=>b.id==='b19').connections;
  const gap=connections.find(e=>e.type==='elevator'&&e.from==='b19/b1/ev-left');
  delete gap.floorChanges;assert.ok(validate(s).some(e=>e.includes('Vertical edge skips a floor')));
  gap.floorChanges=1;assert.ok(validate(s).some(e=>e.includes('Explicit floor changes conflict')));
  gap.floorChanges=2;assert.deepEqual(validate(s),[]);
  gap.from='b19/b1/stairs-left';gap.to='b19/f2/stairs-left';gap.type='stairs';gap.isAccessible=false;
  assert.ok(validate(s).some(e=>e.includes('Vertical edge skips a floor')));
});

test('Building 19 shared public areas and connected corridors stay on the same floor',()=>{
  for(const level of [-1,2,3]){
    const local=places.filter(p=>p.floorLevel===level&&p.nodeId);
    for(let i=0;i<local.length;i++)for(let j=i+1;j<local.length;j++){
      const r=finder.findPath(local[i].nodeId,local[j].nodeId,'accessible');
      assert.ok(r,`${local[i].id} -> ${local[j].id}`);
      assert.equal(r.floorChanges,0);assert.ok(r.pathNodes.every(n=>n.floor===level));
    }
  }
  assert.deepEqual(auditGeometry(floors).map(f=>[f.code,f.floorId]),[['floor-components','f1']]);
  assert.equal(floors.find(f=>f.id==='f3').voids.length,1);
});

test('public circulation is explicit and never exempts kitchens, toilets or unrelated rooms from geometry checks',()=>{
  const s=structuredClone(source), basement=s.floors.find(f=>f.buildingId==='b19'&&f.id==='b1');
  assert.deepEqual(basement.rooms.filter(r=>r.passThrough).map(r=>r.id).sort(),['19-B16','19-B18','19-B20']);
  for(const id of ['19-B16','19-B18','19-B20']){
    const room=basement.rooms.find(r=>r.id===id);delete room.passThrough;
    assert.ok(validate(s).some(e=>e.includes('Edge crosses room')));
    room.passThrough=true;assert.deepEqual(validate(s),[]);
  }
  const dining=basement.rooms.find(r=>r.id==='19-B20');
  dining.passThrough='true';assert.ok(validate(s).some(e=>e.includes('passThrough must be a boolean')));dining.passThrough=true;
  const nodes=basement.navigation.nodes, edges=basement.navigation.edges;
  nodes.push({id:'invalid-kitchen',name:'Invalid',position:[40,14],type:'corridor'});
  edges.push({from:'room-B20',to:'invalid-kitchen',type:'walk',verification:'inferred',isIndoor:true,isAccessible:true,cover:'indoor',routingCost:1});
  assert.ok(validate(s).some(e=>e.includes('Edge crosses room')),'public dining must not permit a shortcut through the kitchen');
  nodes.at(-1).position=[116,15];
  assert.ok(validate(s).some(e=>e.includes('Edge crosses room')),'public halls must not permit crossing WC interiors');
  for(const f of building.floors)for(const room of f.rooms)assert.equal(room.box.h,room.passThrough?0.25:4);
});

test('Building 19 concave and public room selection uses the shared shape in the SVG foreground',async()=>{
  const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  globalThis.document=document;globalThis.window=window;
  const map=new FloorMap(document.getElementById('map-canvas'),data,source.overview);
  const entry=buildingCatalog(data,source.overview).find(b=>b.id==='b19');
  for(const [floorId,id] of [['f1','19-101'],['b1','19-B16'],['f2','19-health-center']]){
    const f=building.floors.find(f=>f.id===floorId);map.setLocation(entry,f);map.selectPlace(id);
    const room=f.rooms.find(r=>r.id===id),shape=document.querySelector(`[data-place="${id}"] polygon`);
    assert.equal(shape.getAttribute('points'),room.polygon.map(p=>p.join(',')).join(' '));
    assert.equal(document.querySelector('.map-selection-outline').getAttribute('points'),shape.getAttribute('points'));
    assert.equal(document.querySelector('#map-canvas svg').lastElementChild.getAttribute('class'),'map-emphasis');
    assert.equal(document.querySelector(`[data-place="${id}"]`).classList.contains('map-public-area'),room.passThrough===true);
    assert.equal(document.getElementById('map-legend').textContent.includes('通行区画'),f.rooms.some(r=>r.passThrough===true));
  }
  map.setLocation(entry,building.floors.find(f=>f.id==='f1'));
  assert.equal(document.querySelector('[data-place="19-107"] .map-room-unlinked'),null);
  assert.ok(document.querySelector('[data-place="b19/f1/feature/entrance-shop"]'));
  const basement=building.floors.find(f=>f.id==='b1');map.setLocation(entry,basement);
  const obstacle=basement.features.find(f=>f.id==='service-bottom');
  const children=[...document.querySelector('.map-floor').children];
  const service=children.find(el=>el.getAttribute('points')===obstacle.polygon.map(p=>p.join(',')).join(' '));
  assert.ok(children.indexOf(service)>children.indexOf(document.querySelector('[data-place="19-B18"]')),
    'a public zone must not paint over its non-selectable service obstacle');
});


test('the south-side shop entrance connects to the ground path between Buildings 17 and 12 without exposing a 1F EV stop',()=>{
  const o=source.manifest.outdoor,door=o.nodes.find(n=>n.id==='b19-shop-door'),approach=o.nodes.find(n=>n.id==='b19-shop-approach');
  assert.equal(door.layer,'ground');assert.equal(approach.layer,'ground');
  assert.ok(door.position[0]>38.75&&door.position[0]<42.375);
  assert.ok(door.position[1]<approach.position[1]);
  const linked=o.links.filter(l=>l.to.startsWith('b19/'));assert.equal(linked.length,1);assert.equal(linked[0].to,'b19/f1/entrance-shop');
  const split=o.edges.filter(e=>e.from==='b12-east'&&e.to==='b19-shop-approach'||e.from==='b19-shop-approach'&&e.to==='b17-entrance-3-approach');
  assert.equal(split.length,2);assert.ok(Math.abs(split.reduce((n,e)=>n+e.routingCost,0)-10.753359)<1e-9);
  for(const gate of ['east-gate','new-east-gate','west-gate'])for(const mode of ['shortest','accessible','indoor','stairs'])for(const [a,b]of[[`campus/outdoor/${gate}`,'b19/f1/room-101'],['b19/f1/room-101',`campus/outdoor/${gate}`]]){
    const r=finder.findPath(a,b,mode);assert.ok(r,`${a} -> ${b} ${mode}`);
    assert.equal(r.floorChanges+r.verticalMovements.unmeasured,0);
    assert.ok(r.pathNodes.some(n=>n.id==='b19/f1/entrance-shop'));
    assert.ok(r.pathNodes.filter(n=>!n.buildingId).every(n=>n.outdoorLayer==='ground'));
    assert.equal(finder.findPath(a,b,mode,false),null);
  }
  for(const dest of ['b19/f1/room-104','b19/f1/room-107','b19/b1/room-B20','b19/f2/room-216','b19/f3/room-305'])assert.equal(finder.findPath('campus/outdoor/west-gate',dest,'accessible'),null,dest);
});
