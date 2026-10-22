import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {readData} from '../scripts/read-data.mjs';
import {compileCampus} from '../.checks/data/compile.js';
import {validateSources} from '../.checks/data/validate.js';
import {auditGeometry,auditConnections} from '../.checks/data/audit.js';
import {buildingCatalog,placeIndex,searchPlaces} from '../.checks/data/places.js';
import {FloorMap} from '../.checks/ui/FloorMap.js';
import {AStarPathfinder} from '../.checks/pathfinding/AStar.js';
const source=await readData(), data=compileCampus(source.manifest,source.buildings,source.floors);
const floors=source.floors.filter(f=>f.buildingId==='b17'),building=data.buildings.find(b=>b.id==='b17');
const places=placeIndex(data).filter(p=>p.buildingId==='b17'),finder=new AStarPathfinder(data);
const validate=(s=source)=>validateSources(s.manifest,s.buildings,s.floors,s.sources,s.overview);

test('Building 17 preserves all five floors, 154 areas and the lettered pool facilities',()=>{
  assert.deepEqual(validate(),[]);
  assert.deepEqual(building.floors.map(f=>[f.level,f.rooms.length]),[[1,7],[2,26],[3,33],[4,38],[5,50]]);
  assert.equal(places.filter(p=>p.kind==='room').length,154);
  assert.equal(places.filter(p=>p.kind==='room'&&p.nodeId).length,154);
  assert.equal(places.filter(p=>p.kind==='restroom').length,16);
  assert.deepEqual(building.floors.map(f=>f.features.filter(p=>p.type==='restroom').length),[4,3,3,3,3]);
  assert.equal(places.filter(p=>p.kind==='elevator').length,9);
  assert.equal(places.filter(p=>p.kind==='stairs').length,22);
  assert.equal(places.filter(p=>p.kind==='entrance').length,4);
  for(const id of ['17-107A','17-107B','17-108A','17-108B','17-109','17-114','17-401','17-550'])assert.ok(places.some(p=>p.id===id),id);
  for(const id of ['17-101','17-110','17-551'])assert.ok(!places.some(p=>p.id===id),id);
  assert.equal(searchPlaces(places,'17-108A')[0].id,'17-108A');
  assert.equal(searchPlaces(places,'レスリング')[0].id,'17-114');
  assert.ok(places.filter(p=>p.name.endsWith('研究室')&&p.kind==='room'&&p.name.includes('17-5')).length>20);
});

test('every registered place is reached within its documented routing section and stair avoidance respects missing 1F links',()=>{
  for(const p of places){
    assert.ok(p.nodeId,p.id);
    const start=p.floorLevel===1?'b17/f1/entrance-upper':'b17/f2/ev-east';
    for(const mode of ['shortest','accessible','indoor','stairs']){
      const r=finder.findPath(start,p.nodeId,mode);assert.ok(r,`${p.id}: ${mode}`);
      assert.ok(r.pathNodes.every(n=>n.buildingId==='b17'));
      assert.equal(r.floorChanges,p.floorLevel===1?0:p.floorLevel-2);
      if(mode==='accessible')assert.ok(r.steps.every(s=>s.edgeType!=='stairs'));
      if(start!==p.nodeId)assert.equal(finder.findPath(start,p.nodeId,mode,false),null);
    }
    const other=p.floorLevel===1?'b17/f2/ev-east':'b17/f1/entrance-upper';
    assert.equal(finder.findPath(other,p.nodeId),null,'1F and 2–5F must not acquire a guessed connection');
  }
  assert.ok(source.buildings.find(b=>b.id==='b17').connections.every(e=>!e.from.startsWith('b17/f1/')&&!e.to.startsWith('b17/f1/')));
  assert.equal(finder.findPath('b17/f3/entrance-west','campus/outdoor/west-gate'),null);
  assert.ok(!source.manifest.outdoor.links.some(l=>l.to.startsWith('b17/')));
});

test('all same-floor room pairs avoid floor detours and geometry audits find no overlaps or missing junctions',()=>{
  for(const floor of building.floors){
    const rooms=places.filter(p=>p.floorLevel===floor.level&&p.kind==='room');
    for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){
      const r=finder.findPath(rooms[i].nodeId,rooms[j].nodeId,'accessible');
      assert.ok(r,`${rooms[i].id} -> ${rooms[j].id}`);assert.equal(r.floorChanges,0);
      assert.ok(r.pathNodes.every(n=>n.floor===floor.level));
    }
  }
  assert.deepEqual(auditGeometry(floors),[]);
  const findings=auditConnections(data).filter(f=>f.buildingId==='b17');
  assert.deepEqual(findings.map(f=>f.code),['building-components']);
  assert.equal(findings[0].nodeIds.length,2);
  assert.ok(floors.filter(f=>f.level>1).every(f=>f.voids.length===0&&f.features.some(p=>p.id==='central-area')));
});

test('pool showers and the recessed 5F room stop at explicit provisional front rooms',()=>{
  for(const [id,front] of [['17-108A','17-107A'],['17-108B','17-107B'],['17-540','17-539']]){
    const p=places.find(p=>p.id===id),a=places.find(p=>p.id===front);
    assert.equal(p.approachRoomId,front);assert.equal(p.nodeId,a.nodeId);
    assert.match(p.description,/暫定/);
    assert.ok(!data.navigation.nodes.some(n=>n.id===`b17/f${p.floorLevel}/room-${id.slice(3)}`));
  }
  assert.equal(places.filter(p=>p.approachRoomId).length,3);
  const f=floors.find(f=>f.level===5);
  for(const id of [541,542,543,544,545,546,547]){
    const r=finder.findPath('b17/f5/room-537',`b17/f5/room-${id}`);
    assert.ok(r.pathNodes.some(n=>Math.abs(n.position[0]-building.origin[0]-14)<1e-6),'recessed-room approaches use the spur');
  }
});

test('declared disconnected sections are complete, justified and never conceal a new routing island',()=>{
  const s=structuredClone(source),b=s.buildings.find(b=>b.id==='b17'),original=structuredClone(b.navigationComponents);
  delete b.navigationComponents;assert.ok(validate(s).some(e=>e.includes('Disconnected navigation node')));
  b.navigationComponents=structuredClone(original);b.navigationComponents[1].nodeId=b.navigationComponents[0].nodeId;
  assert.ok(validate(s).some(e=>e.includes('invalid or duplicate navigation component')));
  b.navigationComponents=structuredClone(original);b.navigationComponents[0].description=' ';
  assert.ok(validate(s).some(e=>e.includes('invalid or duplicate navigation component')));
  b.navigationComponents=structuredClone(original);b.navigationComponents[0].nodeId='b17/f1/missing';
  assert.ok(validate(s).some(e=>e.includes('invalid or duplicate navigation component')));
  b.navigationComponents=structuredClone(original);
  const f=s.floors.find(f=>f.buildingId==='b17'&&f.id==='f5'),edges=f.navigation.edges;
  f.navigation.edges=edges.filter(e=>e.from!=='room-550'&&e.to!=='room-550');
  assert.ok(validate(s).some(e=>e.includes('navigationComponents must describe every separate component')));
  f.navigation.edges=edges;
  b.connections.push({from:'b17/f1/stairs-upper',to:'b17/f2/stairs-northwest',type:'stairs',verification:'inferred',isIndoor:true,isAccessible:false,cover:'indoor',routingCost:1});
  assert.ok(validate(s).some(e=>e.includes('navigationComponents must describe every separate component')),'stale separation declarations must be removed when links are confirmed');
  delete b.navigationComponents;assert.deepEqual(validate(s),[]);
});

test('Building 17 floor maps preserve all places, source polygons and foreground selection',async()=>{
  const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  globalThis.document=document;globalThis.window=window;
  const map=new FloorMap(document.getElementById('map-canvas'),data,source.overview),entry=buildingCatalog(data,source.overview).find(b=>b.id==='b17');
  for(const floor of building.floors){
    map.setLocation(entry,floor);assert.equal(document.querySelectorAll('.map-room').length,floor.rooms.length);
    const room=floor.rooms.at(-1);map.selectPlace(room.id);
    assert.equal(document.querySelector('.map-selection-outline').getAttribute('points'),room.polygon.map(p=>p.join(',')).join(' '));
    assert.equal(document.querySelector('#map-canvas svg').lastElementChild.getAttribute('class'),'map-emphasis');
  }
  map.setLocation(entry,building.floors[4]);map.selectPlace('17-540');
  assert.equal(document.querySelector('[data-place="17-540"] .map-room-unlinked'),null);
});
