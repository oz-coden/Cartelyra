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
  assert.equal(places.filter(p=>p.kind==='room'&&p.nodeId).length,47);
  assert.equal(places.filter(p=>p.kind==='restroom').length,10);
  assert.deepEqual(building.floors.map(f=>f.features.filter(p=>p.type==='restroom').length),[3,0,5,2]);
  for(const id of ['19-301','19-307','19-211']) assert.ok(!places.some(p=>p.id===id));
  assert.equal(searchPlaces(places,'保健管理センター')[0].id,'19-health-center');
  assert.equal(searchPlaces(places,'ラックス')[0].id,'19-B20');
  assert.equal(places.find(p=>p.id==='19-107').nodeId,undefined);
  assert.match(places.find(p=>p.id==='19-107').description,/入口.*特定できない/);
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
  assert.deepEqual(evEdges.map(e=>[e.from,e.to]),[['b19/f2/ev-left','b19/f3/ev-left']]);
  assert.deepEqual(places.filter(p=>p.kind==='elevator').map(p=>p.floorLevel).sort((a,b)=>a-b),[-1,2,3]);
  assert.equal(finder.findPath('b19/b1/ev-left','b19/f2/ev-left','accessible'),null);
  assert.equal(finder.findPath('b19/f1/room-101','b19/f2/room-216','accessible'),null);
  assert.ok(finder.findPath('b19/f2/room-216','b19/f3/room-305','accessible'));
  assert.equal(finder.findPath('b19/f1/room-104','b19/f1/room-101').floorChanges,2);
  assert.equal(finder.findPath('b19/f1/room-104','b19/f1/room-101','accessible'),null);
  assert.equal(finder.findPath('b19/f1/room-101','b3/f1/entrance-north'),null);
  assert.equal(places.filter(p=>p.kind==='entrance').length,0);
  assert.ok(!source.manifest.outdoor.links.some(l=>l.to.startsWith('b19/')));
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
  assert.ok(document.querySelector('[data-place="19-107"] .map-room-unlinked'));
  const basement=building.floors.find(f=>f.id==='b1');map.setLocation(entry,basement);
  const obstacle=basement.features.find(f=>f.id==='service-bottom');
  const children=[...document.querySelector('.map-floor').children];
  const service=children.find(el=>el.getAttribute('points')===obstacle.polygon.map(p=>p.join(',')).join(' '));
  assert.ok(children.indexOf(service)>children.indexOf(document.querySelector('[data-place="19-B18"]')),
    'a public zone must not paint over its non-selectable service obstacle');
});
