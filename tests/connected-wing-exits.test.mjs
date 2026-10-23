import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {readData} from '../scripts/read-data.mjs';
import {compileCampus} from '../.checks/data/compile.js';
import {validateSources} from '../.checks/data/validate.js';
import {AStarPathfinder} from '../.checks/pathfinding/AStar.js';
import {FloorMap} from '../.checks/ui/FloorMap.js';
import {LocationState} from '../.checks/ui/LocationState.js';
import {buildingCatalog} from '../.checks/data/places.js';
const source=await readData(),compile=s=>compileCampus(s.manifest,s.buildings,s.floors),data=compile(source);
const finder=new AStarPathfinder(data),out=id=>`campus/outdoor/${id}`;
const validate=s=>validateSources(s.manifest,s.buildings,s.floors,s.sources,s.overview);

test('the missing 2F 7/8 connection is an outdoor stair rather than an implicit roofed bridge',async()=>{
  assert.deepEqual(validate(source),[]);
  assert.ok(!source.manifest.connections.some(e=>e.from==='b7/f2/port-eight'||e.to==='b7/f2/port-eight'));
  for(const [a,b] of [['b7/f2/room-21','b8/f2/room-20'],['b8/f2/room-20','b7/f2/room-21']]){
    const r=finder.findPath(a,b);assert.ok(r);assert.ok(r.steps.some(s=>s.edgeType==='stairs'));
    assert.equal(r.floorChanges,0);assert.equal(finder.findPath(a,b,'accessible'),null);
  }
  const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));globalThis.document=document;globalThis.window=window;
  const state=new LocationState(buildingCatalog(data,source.overview),data.viewGroups);state.selectBuilding('b7');
  const map=new FloorMap(document.getElementById('map-canvas'),data,source.overview);
  for(const level of ['f2','f3']){
    state.selectGroupLevel(level);map.setLocation(state.building,state.floor,state.scope);
    if(level==='f2'){const entry=document.querySelector('[data-place="b8/f2/feature/entrance-map-hall"]');assert.equal(entry.querySelector('text').textContent,'出入口');assert.match(entry.querySelector('title').textContent,/マップホール/);}
    assert.equal(document.querySelectorAll('.map-passage[data-edge-type="bridge"]').length,level==='f2'?0:1);
  }
});

test('both lower floors use the same unnumbered intermediate landing with opposite stair directions',()=>{
  const landing=out('b8-south-landing');
  assert.ok(data.buildings.flatMap(b=>b.floors).every(f=>Number.isInteger(f.level)&&!f.id.includes('1.5')));
  assert.equal(data.navigation.nodes.find(n=>n.id===landing).floor,undefined);
  const approaches=[['b8/f1/stairs-west-exit',/上って/,/下りて/],['b8/f2/stairs-south',/下りて/,/上って/]];
  for(const [inside,goingOut,goingIn] of approaches){
    const r=finder.findPath(inside,landing),back=finder.findPath(landing,inside);
    assert.deepEqual(r.pathNodes.map(n=>n.id),[inside,landing]);
    assert.equal(r.floorChanges,0);assert.deepEqual(r.verticalMovements,{stairs:1,ramps:0,elevators:0,unmeasured:1});
    assert.match(r.steps.at(-1).instruction,goingOut);assert.match(back.steps.at(-1).instruction,goingIn);
    assert.equal(finder.findPath(inside,landing,'accessible'),null);
    const closed=structuredClone(data);closed.navigation.edges.find(e=>e.to===inside&&e.from===landing).blocked=true;
    assert.ok(new AStarPathfinder(closed).findPath(inside,landing),'the other floor remains an explicit alternative');
  }
  for(let level=2;level<=6;level++){
    const b8=source.floors.find(f=>f.buildingId==='b8'&&f.level===level),b9=source.floors.find(f=>f.buildingId==='b9'&&f.level===level);
    const n=b8.navigation.nodes.find(n=>n.id==='stairs-south');assert.deepEqual(n.position,[4,170]);
    assert.ok(b8.navigation.edges.some(e=>e.to===n.id&&b8.navigation.nodes.find(x=>x.id===e.from).position[0]===4));
    assert.ok(!b9.features.some(f=>f.id==='stairs-southeast'));
  }
});

test('Map Hall reaches Building 2 by a covered external stair, and all group outdoor approaches require stairs',()=>{
  const hall='b8/f2/room-20',street=out('b3-b2-west');
  for(const [a,b]of [[hall,street],[street,hall]]){
    const r=finder.findPath(a,b);assert.ok(r);
    assert.ok(r.steps.some(s=>s.edgeType==='stairs'&&s.cover==='covered'&&s.instruction.includes('屋根付き外階段')));
    assert.equal(finder.findPath(a,b,'accessible'),null);
    assert.equal(finder.findPath(a,b,'shortest',false),null);
  }
  for(const room of ['b7/f2/room-21','b8/f1/room-11','b9/f3/room-31','b10/f2/room-201']){
    assert.ok(finder.findPath(out('main-gate'),room));
    assert.equal(finder.findPath(out('main-gate'),room,'accessible'),null);
  }
});

test('the Main Gate route uses the Building 1/31 gap and the tunnel never joins the road by a crossing',()=>{
  const r=finder.findPath(out('b8-south-landing'),out('main-gate'));assert.ok(r);
  for(const id of ['b1-b31-west','b1-b31-path'])assert.ok(r.pathNodes.some(n=>n.id===out(id)));
  assert.ok(r.pathNodes.every(n=>n.outdoorLayer!=='underground'));
  const tunnel=source.manifest.outdoor.nodes.filter(n=>n.layer==='underground');assert.equal(tunnel.length,2);
  const mouth=finder.findPath(out('b8-south-path'),out('b8-tunnel-mouth'));assert.equal(mouth.verticalMovements.unmeasured,0);
  const closed=structuredClone(data);closed.navigation.edges.find(e=>e.from===out('b8-south-path')&&e.to===out('b8-tunnel-mouth')).blocked=true;
  assert.equal(new AStarPathfinder(closed).findPath(out('b8-tunnel-b11-side'),out('main-gate')),null);
  assert.ok(!source.manifest.outdoor.links.some(l=>l.to.startsWith('b11/')||l.to.startsWith('b31/')));
});

test('authoring rejects false stair accessibility, interior walking exits and noncoincident tunnel mouths',()=>{
  for(const mutate of [
    s=>{s.manifest.outdoor.links.find(l=>l.type==='stairs').isAccessible=true;},
    s=>{s.manifest.outdoor.links.find(l=>l.to==='b8/f2/stairs-south').type='outdoor';},
    s=>{s.manifest.outdoor.nodes.find(n=>n.id==='b8-tunnel-mouth').position[0]+=.5;},
    s=>{s.manifest.outdoor.nodes.find(n=>n.id==='b8-tunnel-mouth').layer='bridge';},
  ]){const bad=structuredClone(source);mutate(bad);assert.ok(validate(bad).length);}
});


test('EV-side stairs retain their constraints when the courtyard gains an explicit northern outdoor approach',()=>{
  const court=out('b7-b10-courtyard');
  for(const start of ['b8/f1/stairs-ev-west','b8/f2/stairs-courtyard']){
    const r=finder.findPath(start,court);assert.ok(r);assert.equal(r.verticalMovements.stairs,1);
    assert.ok(r.steps.some(s=>s.instruction.includes('中庭へ出る')));
    assert.equal(finder.findPath(start,court,'accessible'),null);
  }
  const closed=structuredClone(data);
  for(const e of closed.navigation.edges)if(e.from===out('b8-courtyard-door')&&e.to.startsWith('b8/'))e.blocked=true;
  const outside=new AStarPathfinder(closed).findPath(court,out('main-gate'));assert.ok(outside);
  assert.ok(outside.pathNodes.every(n=>!n.buildingId));
  closed.navigation.edges.find(e=>e.from===court&&e.to===out('b8-courtyard-north')).blocked=true;
  assert.equal(new AStarPathfinder(closed).findPath(court,out('main-gate')),null);
  const missing=structuredClone(source);missing.manifest.outdoor.links=missing.manifest.outdoor.links.filter(l=>l.from!=='b8-courtyard-door');
  assert.deepEqual(validate(missing),[],'the explicit north path keeps the courtyard connected without indoor links');
  missing.manifest.outdoor.edges=missing.manifest.outdoor.edges.filter(e=>e.from!=='b7-b10-courtyard');
  assert.ok(validate(missing).some(e=>e.includes('Disconnected outdoor node b7-b10-courtyard')));
});


test('the courtyard north path reaches the 7/8 outdoor approach in both directions without entering a building or using stairs',()=>{
  for(const mode of ['shortest','accessible','indoor','stairs'])for(const [a,b] of [
    [out('b7-b10-courtyard'),out('b7-2f-stair-foot')],
    [out('b7-2f-stair-foot'),out('b7-b10-courtyard')],
  ]){
    const r=finder.findPath(a,b,mode);assert.ok(r);
    assert.ok(r.pathNodes.every(n=>!n.buildingId&&n.outdoorLayer==='ground'));
    for(const id of ['b8-courtyard-north','b7-b8-courtyard-turn'])assert.ok(r.pathNodes.some(n=>n.id===out(id)));
    assert.equal(r.floorChanges,0);assert.equal(r.verticalMovements.unmeasured,0);
    assert.ok(r.steps.every(s=>s.edgeType!=='stairs'));
    assert.equal(finder.findPath(a,b,mode,false),null);
  }
  for(const start of ['b8/f1/stairs-ev-west','b8/f2/stairs-courtyard']){
    const r=finder.findPath(start,out('b7-2f-stair-foot'));assert.ok(r);
    assert.ok(r.pathNodes.some(n=>n.id===out('b7-b10-courtyard')));
    assert.equal(r.verticalMovements.stairs,1);
    assert.equal(finder.findPath(start,out('b7-2f-stair-foot'),'accessible'),null);
  }
});


test('the Building 7 external stair belongs to the outdoor approach above the courtyard junction',()=>{
  const f=source.floors.find(f=>f.buildingId==='b7'&&f.id==='f2');
  assert.ok(!f.features.some(f=>f.id==='stairs-outside'));
  const link=source.manifest.outdoor.links.find(l=>l.to==='b7/f2/entrance-outside');
  assert.equal(link.type,'outdoor');assert.equal(link.isAccessible,true);
  const edge=source.manifest.outdoor.edges.find(e=>e.from==='b7-2f-stair-foot'&&e.to==='b7-2f-door');
  assert.equal(edge.type,'stairs');assert.equal(edge.isAccessible,false);
  for(const [a,b,instruction]of[
    [out('b7-2f-stair-foot'),'b7/f2/entrance-outside',/上って/],
    ['b7/f2/entrance-outside',out('b7-2f-stair-foot'),/下りて/],
  ]){
    const r=finder.findPath(a,b);assert.ok(r);assert.equal(r.verticalMovements.stairs,1);
    assert.equal(r.verticalMovements.unmeasured,1);assert.equal(r.floorChanges,0);
    assert.match(r.steps.find(s=>s.edgeType==='stairs').instruction,instruction);
    assert.equal(finder.findPath(a,b,'accessible'),null);
  }
});
