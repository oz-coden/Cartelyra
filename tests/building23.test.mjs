import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {readData} from '../scripts/read-data.mjs';
import {compileCampus} from '../.checks/data/compile.js';
import {validateSources} from '../.checks/data/validate.js';
import {auditGeometry,auditConnections} from '../.checks/data/audit.js';
import {buildingCatalog,placeIndex,searchPlaces,placeRouteNotice} from '../.checks/data/places.js';
import {FloorMap} from '../.checks/ui/FloorMap.js';
import {AStarPathfinder} from '../.checks/pathfinding/AStar.js';
const source=await readData(),data=compileCampus(source.manifest,source.buildings,source.floors);
const building=data.buildings.find(b=>b.id==='b23'),floors=source.floors.filter(f=>f.buildingId==='b23');
const places=placeIndex(data).filter(p=>p.buildingId==='b23'),finder=new AStarPathfinder(data);
const levels=[-2,-1,1,2,3,4,5,6,7,8];

test('Building 23 retains ten floor plans, numbered small rooms and only the observed identifiers',()=>{
  assert.deepEqual(validateSources(source.manifest,source.buildings,source.floors,source.sources,source.overview),[]);
  assert.deepEqual(building.floors.map(f=>f.level),levels);
  assert.deepEqual(building.floors.map(f=>f.stackIndex),levels.map((_,i)=>i));
  assert.deepEqual(building.floors.map(f=>f.rooms.length),[16,19,25,26,24,36,38,28,37,37]);
  assert.equal(places.filter(p=>p.kind==='room').length,286);
  assert.equal(places.filter(p=>p.kind==='room'&&p.nodeId&&!p.approachRoomId).length,255);
  assert.equal(places.filter(p=>p.approachRoomId).length,31);
  assert.equal(places.filter(p=>p.kind==='restroom').length,28);
  assert.equal(places.filter(p=>p.restroomType==='multipurpose').length,8);
  assert.equal(places.filter(p=>p.kind==='elevator').length,30);
  assert.equal(places.filter(p=>p.kind==='stairs').length,33);
  for(const id of ['23-B203','23-B214','23-107','23-405-1','23-430-1','23-504-1','23-630','23-711-1','23-822-1'])assert.ok(places.some(p=>p.id===id),id);
  for(const id of ['23-102','23-406','23-421','23-426','23-427','23-610','23-629','23-706'])assert.ok(!places.some(p=>p.id===id),id);
  assert.equal(searchPlaces(places,'23号館 クリーンルーム')[0].id,'23-B204');
  assert.equal(searchPlaces(places,'23号館 給湯 製氷')[0].name,'23-225 給湯・製氷室');
  assert.ok(floors.every(f=>f.voids.length===0));
});

test('all registered Building 23 approaches use the minimum floor changes including B1 to 1F',()=>{
  const entry='b23/f1/entrance-left';
  for(const p of places.filter(p=>p.nodeId))for(const mode of ['shortest','accessible','indoor','stairs']){
    const r=finder.findPath(entry,p.nodeId,mode);assert.ok(r,`${p.id}: ${mode}`);
    assert.ok(r.pathNodes.every(n=>n.buildingId==='b23'));
    assert.equal(r.floorChanges,Math.abs(levels.indexOf(p.floorLevel)-2),`${p.id}: floor order`);
    if(mode==='accessible')assert.ok(r.steps.every(s=>s.edgeType!=='stairs'));
    if(p.nodeId!==entry)assert.equal(finder.findPath(entry,p.nodeId,mode,false),null);
  }
  assert.equal(finder.findPath('b23/b1/ev-1','b23/f1/ev-1','accessible').floorChanges,1);
  assert.ok(finder.findPath(entry,'campus/outdoor/west-gate'));
  assert.equal(finder.findPath(entry,'b19/f1/room-101'),null);
  assert.equal(source.manifest.outdoor.links.filter(e=>e.to.startsWith('b23/')).length,2);
  assert.equal(places.filter(p=>p.kind==='entrance').length,2);
  assert.ok(places.filter(p=>p.kind==='entrance').every(p=>p.floorLevel===1));
});

test('provisional inner approaches preserve basement corridor routes without inventing stair boarding',()=>{
  assert.deepEqual(places.filter(p=>p.kind==='room'&&!p.nodeId).map(p=>p.id).sort(),[]);
  for(const id of ['23-107','23-B203']){
    const p=places.find(p=>p.id===id);assert.match(p.description,/暫定推定/);
    assert.ok(!data.navigation.nodes.some(n=>n.id===`b23/${p.floorLevel===1?'f1':'b2'}/room-${id.slice(3)}`));
  }
  const basement=building.floors.find(f=>f.level===-2),stairs=places.find(p=>p.featureId==='stairs-bottom'&&p.floorLevel===-2);
  assert.equal(stairs.nodeId,undefined);
  assert.match(stairs.description,/倉庫/);
  assert.ok(!source.buildings.find(b=>b.id==='b23').connections.some(e=>e.from==='b23/b2/stairs-bottom'||e.to==='b23/b2/stairs-bottom'));
  assert.ok(basement.rooms.find(r=>r.id==='23-B211').entranceNodeId);
  for(const p of places.filter(p=>p.kind==='room'&&p.nodeId&&p.floorLevel===-2)){
    const r=finder.findPath('b23/b2/room-B201',p.nodeId,'accessible');
    assert.ok(r);assert.equal(r.floorChanges,0);
  }
});

test('inner rooms retain explicit provisional front endpoints instead of traversing occupied rooms',()=>{
  for(const [id,front] of [['23-B203','23-B202'],['23-107','23-105'],['23-B212','23-B211'],['23-B213','23-B211'],['23-B214','23-B211'],['23-110','23-109'],['23-213','23-212'],['23-409-1','23-409'],['23-425-1','23-425'],['23-430-1','23-430'],['23-503-1','23-503'],['23-504-1','23-504'],['23-705-1','23-705'],['23-711-1','23-711'],['23-807-1','23-807'],['23-829-1','23-829']]){
    const p=places.find(p=>p.id===id),a=places.find(p=>p.id===front);
    assert.equal(p.approachRoomId,front);assert.equal(p.nodeId,a.nodeId);
    assert.match(p.description,/暫定/);assert.ok(placeRouteNotice(p).includes(front));
  }
  for(const p of places.filter(p=>p.approachRoomId))assert.ok(!data.navigation.nodes.some(n=>n.id===`b23/${p.floorLevel<0?'b'+(-p.floorLevel):'f'+p.floorLevel}/room-${p.id.slice(3)}`));
  assert.ok(floors.flatMap(f=>f.rooms).every(r=>r.passThrough!==true));
  assert.ok(floors.find(f=>f.level===4).rooms.find(r=>r.id==='23-405').polygon.length>4);
  assert.ok(places.find(p=>p.id==='23-405-1').nodeId!==places.find(p=>p.id==='23-405').nodeId);
});

test('Building 23 has no geometric overlaps, unjoined crossings or same-floor room detours',()=>{
  assert.deepEqual(auditGeometry(floors),[]);
  assert.deepEqual(auditConnections(data).filter(f=>f.buildingId==='b23'),[]);
  for(const floor of building.floors){
    const rooms=places.filter(p=>p.kind==='room'&&p.floorLevel===floor.level&&p.nodeId);
    for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){
      const r=finder.findPath(rooms[i].nodeId,rooms[j].nodeId);assert.ok(r);
      assert.equal(r.floorChanges,0,`${rooms[i].id} -> ${rooms[j].id}`);
    }
  }
});

test('all ten SVG floors expose their places and concave selection remains above neighbouring rooms',async()=>{
  const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  globalThis.document=document;globalThis.window=window;
  const map=new FloorMap(document.getElementById('map-canvas'),data,source.overview),entry=buildingCatalog(data,source.overview).find(b=>b.id==='b23');
  for(const f of building.floors){
    map.setLocation(entry,f);assert.equal(document.querySelectorAll('.map-room').length,f.rooms.length);
    const r=f.rooms.find(r=>r.polygon.length>4)??f.rooms[0];map.selectPlace(r.id);
    assert.equal(document.querySelector('.map-selection-outline').getAttribute('points'),r.polygon.map(p=>p.join(',')).join(' '));
    assert.equal(document.querySelector('#map-canvas svg').lastElementChild.getAttribute('class'),'map-emphasis');
  }
  map.setLocation(entry,building.floors.find(f=>f.level===1));
  assert.equal(document.querySelector('[data-place="23-107"] .map-room-unlinked'),null);
  assert.equal(document.querySelectorAll('.map-feature-entrance').length,2);
  const r=finder.findPath('b23/f1/entrance-left','b23/f1/room-115');map.setRoute(r);
  assert.ok(document.querySelector('.map-route'));
});
