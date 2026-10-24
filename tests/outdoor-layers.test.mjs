import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {readData} from '../scripts/read-data.mjs';
import {compileCampus} from '../.checks/data/compile.js';
import {validateSources} from '../.checks/data/validate.js';
import {minimumFloorChanges,auditConnections} from '../.checks/data/audit.js';
import {AStarPathfinder} from '../.checks/pathfinding/AStar.js';
import {FloorMap} from '../.checks/ui/FloorMap.js';
import {SearchPanel} from '../.checks/ui/SearchPanel.js';
import {StepGuide} from '../.checks/ui/StepGuide.js';
const source=await readData(),compile=s=>compileCampus(s.manifest,s.buildings,s.floors),data=compile(source);
const id=s=>`campus/outdoor/${s}`;
const route=(a,b,mode='shortest',d=data)=>new AStarPathfinder(d).findPath(id(a),b.startsWith('b23/')?b:id(b),mode);
const disable=(d,a,b)=>{const e=d.navigation.edges.find(e=>e.from===id(a)&&e.to===id(b));assert.ok(e);e.blocked=true;};

test('Building 23 has two ground approaches with stair-free gate alternatives and no inferred shortcuts through buildings',()=>{
  assert.deepEqual(validateSources(source.manifest,source.buildings,source.floors,source.sources,source.overview),[]);
  for(const entrance of ['entrance-left','entrance-right'])for(const gate of ['east-gate','new-east-gate','west-gate'])for(const mode of ['shortest','accessible','indoor','stairs']){
    const a=id(gate),b=`b23/f1/${entrance}`,finder=new AStarPathfinder(data);
    for(const [from,to]of[[a,b],[b,a]]){
      const r=finder.findPath(from,to,mode);assert.ok(r,`${from} -> ${to} ${mode}`);
      if(mode==='accessible'){
        assert.equal(r.floorChanges+r.verticalMovements.unmeasured,0);
        assert.ok(r.pathNodes.filter(n=>!n.buildingId).every(n=>n.outdoorLayer==='ground'));
      }
      assert.equal(finder.findPath(from,to,mode,false),null);
    }
  }
  assert.equal(data.navigation.edges.filter(e=>e.to.startsWith('b23/')&&!e.from.startsWith('b23/')).length,2);
});

test('coincident bridge and ground nodes do not imply a transfer, including when stair and ramp accesses are closed',()=>{
  const bridge=data.navigation.nodes.find(n=>n.id===id('bridge-west-gate')),ground=data.navigation.nodes.find(n=>n.id===id('west-gate'));
  assert.deepEqual(bridge.overviewPosition,ground.overviewPosition);assert.notEqual(bridge.outdoorLayer,ground.outdoorLayer);
  assert.ok(!data.navigation.edges.some(e=>[e.from,e.to].includes(bridge.id)&&[e.from,e.to].includes(ground.id)));
  const closed=structuredClone(data);
  for(const e of closed.navigation.edges)if(['stairs','ramp'].includes(e.type)&&!e.from.startsWith('b'))e.blocked=true;
  assert.equal(route('west-gate','bridge-west-gate','shortest',closed),null);
});

test('6-side ramp transfers layers explicitly and remains counted as unmeasured vertical travel',async()=>{
  const a='bridge-b6-foot',b='bridge-b6-landing';
  for(const [from,to]of[[a,b],[b,a]]){
    const r=route(from,to,'accessible');assert.ok(r);
    assert.ok(r.steps.some(s=>s.edgeType==='ramp'&&s.instruction.includes('スロープ')));
    assert.ok(r.steps.every(s=>s.edgeType!=='stairs'));
    assert.deepEqual(r.verticalMovements,{stairs:0,ramps:1,elevators:0,unmeasured:1});
    assert.equal(minimumFloorChanges(data,id(from),'accessible').get(id(to)),1);
    assert.equal(r.floorChanges,0);assert.ok(r.pathNodes.every(n=>n.floor===undefined));
  }
  const closed=structuredClone(data);disable(closed,'bridge-ramp-foot','bridge-b6-landing');
  assert.equal(route(a,b,'accessible',closed),null);
  assert.ok(route(a,b,'shortest',closed).steps.some(s=>s.edgeType==='stairs'));
  assert.ok(auditConnections(data).some(f=>f.code==='unmeasured-vertical'&&f.nodeIds.includes(id('bridge-ramp-foot'))));
  const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  globalThis.document=document;globalThis.window=window;
  const r=route(a,'bridge-west-gate','accessible');new SearchPanel([]).updateSummary(r);
  assert.match(document.getElementById('summary-vertical').textContent,/スロープあり.*昇降量未確認/);
  new StepGuide().showSteps(r.steps);
  assert.ok([...document.querySelectorAll('.step-card-footer')].some(e=>e.textContent==='スロープ'));
});

test('the 12/17-side stairs prevent treating the whole bridge route as stair-free',()=>{
  const d=structuredClone(data);disable(d,'avenue-turn','b23-north-west');disable(d,'b15-south-junction','b15-southwest');
  const r=route('bridge-b6-foot','b23/f1/entrance-left','shortest',d);assert.ok(r);
  assert.ok(r.pathNodes.some(n=>n.outdoorLayer==='bridge'));
  assert.ok(r.steps.some(s=>s.edgeType==='stairs'&&s.instruction.includes('12号館・17号館間')));
  assert.equal(route('bridge-b6-foot','b23/f1/entrance-left','accessible',d),null);
  const ordinary=route('bridge-b6-foot','b23/f1/entrance-left','accessible');assert.ok(ordinary);
  assert.ok(ordinary.steps.every(s=>s.edgeType!=='stairs'));
  assert.equal(ordinary.verticalMovements.unmeasured,0);
});

test('East Gate reaches Building 3 along the east side of Building 2 in both directions',()=>{
  const finder=new AStarPathfinder(data);
  for(const mode of ['shortest','accessible','indoor','stairs'])for(const [a,b]of[[id('east-gate'),'b3/f1/entrance-south'],['b3/f1/entrance-south',id('east-gate')]]){
    const r=finder.findPath(a,b,mode);assert.ok(r);
    assert.ok(r.pathNodes.some(n=>n.id===id('b2-east-path')));
    assert.ok(!r.pathNodes.some(n=>n.id===id('b2-west-turn')));
    assert.equal(r.floorChanges+r.verticalMovements.unmeasured,0);
  }
});

test('context roads are landmarks only and cannot create walkable graph connections',async()=>{
  const changed=structuredClone(source);changed.overview.contextRoads.push({id:'visual-only',name:'Reference road',sourceId:'gsi-campus-aerial',points:[[0,0],[100,100]]});
  assert.deepEqual(compile(changed).navigation,data.navigation);
  const bad=structuredClone(source);bad.overview.contextRoads[0].sourceId='unknown';
  assert.ok(validateSources(bad.manifest,bad.buildings,bad.floors,bad.sources,bad.overview).some(e=>e.includes('Unknown context road source')));
  const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  globalThis.document=document;globalThis.window=window;
  const map=new FloorMap(document.getElementById('map-canvas'),data,source.overview);map.showOverview(true);
  assert.equal(document.querySelectorAll('.map-context-road').length,source.overview.contextRoads.length);
  assert.equal(document.querySelectorAll('.map-outdoor-bridge').length,source.manifest.outdoor.edges.filter(e=>e.type==='bridge').length);
  assert.equal(document.querySelectorAll('.map-outdoor-transition[data-edge-type="ramp"]').length,1);
  assert.match(document.getElementById('map-legend').textContent,/細線：道路.*青：橋/);
  assert.ok(document.querySelector('.map-context-roads').compareDocumentPosition(document.querySelector('.map-outdoor-path'))&4);
});

test('the Building 19 shop approach reaches the 17/12 bridge corner by explicit stairs, with a ramp detour for stair avoidance',()=>{
  const start='b19/f1/entrance-shop',end=id('bridge-b12-corner'),foot=id('b19-bridge-stair-foot'),finder=new AStarPathfinder(data);
  for(const mode of ['shortest','indoor','stairs'])for(const [a,b]of[[start,end],[end,start]]){
    const r=finder.findPath(a,b,mode);assert.ok(r);
    assert.ok(r.pathNodes.some(n=>n.id===foot));
    assert.deepEqual(r.verticalMovements,{stairs:1,ramps:0,elevators:0,unmeasured:1});
    assert.equal(r.floorChanges,0);
    assert.match(r.steps.find(s=>s.edgeType==='stairs').instruction,/19号館側.*階段|階段.*19号館側/);
    assert.ok(!r.pathNodes.some(n=>n.id===id('bridge-b6-landing')));
    assert.equal(finder.findPath(a,b,mode,false),null);
  }
  const accessible=finder.findPath(start,end,'accessible');assert.ok(accessible);
  assert.ok(accessible.steps.every(s=>s.edgeType!=='stairs'));
  assert.ok(accessible.pathNodes.some(n=>n.id===id('bridge-ramp-foot')));
  assert.ok(!accessible.pathNodes.some(n=>n.id===foot));
  assert.equal(accessible.verticalMovements.ramps,1);
  const closed=structuredClone(data);disable(closed,'bridge-ramp-foot','bridge-b6-landing');
  assert.equal(new AStarPathfinder(closed).findPath(start,end,'accessible'),null);
  assert.ok(new AStarPathfinder(closed).findPath(start,end).pathNodes.some(n=>n.id===foot));
  const stair=source.manifest.outdoor.edges.find(e=>e.from==='b19-bridge-stair-foot'&&e.to==='bridge-b12-corner');
  assert.equal(stair.type,'stairs');assert.equal(stair.isAccessible,false);assert.equal(stair.verification,'inferred');assert.equal(stair.floorChanges,undefined);
});
