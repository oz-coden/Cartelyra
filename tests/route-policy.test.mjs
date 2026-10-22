import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {readData} from '../scripts/read-data.mjs';
import {compileCampus} from '../.checks/data/compile.js';
import {AStarPathfinder} from '../.checks/pathfinding/AStar.js';
import {SearchPanel} from '../.checks/ui/SearchPanel.js';
import {validateSources} from '../.checks/data/validate.js';
import {minimumFloorChanges, auditConnections} from '../.checks/data/audit.js';
import {placeIndex} from '../.checks/data/places.js';
const s=await readData(), compile=s=>compileCampus(s.manifest,s.buildings,s.floors),data=compile(s);

test('reference routes are invariant under independent drawing scales, translations and rotations',()=>{
  const changed=structuredClone(s);
  for(const [i,b]of changed.buildings.entries()){
    const scale=(i+1)*.037;
    b.origin=[8000+i*200,70,-6000+i*100];b.rotation=i*.73;
    for(const f of changed.floors.filter(f=>f.buildingId===b.id)){
      const point=p=>p.map(v=>v*scale);
      f.outline=f.outline.map(point);f.voids=f.voids.map(p=>p.map(point));f.elevation*=scale;
      for(const item of [...f.rooms,...f.features])item.polygon=item.polygon.map(point);
      for(const n of f.navigation.nodes)n.position=point(n.position);
    }
  }
  const original=new AStarPathfinder(data),transformed=new AStarPathfinder(compile(changed));
  const destinations=['b1/f8/room-804','b3/f4/room-401','b5/f1/room-106','b20/f4/room-420'];
  for(const gate of ['east-gate','new-east-gate','west-gate'])for(const dest of destinations)for(const mode of ['shortest','accessible','indoor','stairs']){
    const a=original.findPath(`campus/outdoor/${gate}`,dest,mode),b=transformed.findPath(`campus/outdoor/${gate}`,dest,mode);
    assert.equal(!!a,!!b);if(!a)continue;
    assert.deepEqual(a.pathNodes.map(n=>n.id),b.pathNodes.map(n=>n.id));assert.equal(a.routingCost,b.routingCost);
  }
});

test('external stairs are visible in both directions without fabricating outdoor floor numbers',async()=>{
  const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  globalThis.document=document;globalThis.window=window;
  const panel=new SearchPanel([]),finder=new AStarPathfinder(data);
  for(const [a,b]of [['campus/outdoor/new-east-gate','b5/f2/entrance-side'],['b5/f2/entrance-side','campus/outdoor/new-east-gate']]){
    const r=finder.findPath(a,b);assert.ok(r);assert.equal(r.floorChanges,0);
    assert.deepEqual(r.verticalMovements,{stairs:1,ramps:0,elevators:0,unmeasured:1});
    panel.updateSummary(r);assert.match(document.getElementById('summary-vertical').textContent,/階段あり.*昇降量未確認/);
    assert.equal(minimumFloorChanges(data,a).get(b),1);
    assert.ok(r.pathNodes.filter(n=>!n.buildingId).every(n=>n.floor===undefined));
    assert.equal(finder.findPath(a,b,'accessible'),null);
  }
  assert.ok(auditConnections(data).some(f=>f.code==='unmeasured-vertical'));
});

test('indoor preference distinguishes roofed passages from exposed and unknown paths',()=>{
  const nodes=['s','covered','open','unknown','t'].map(id=>({id,name:id,type:'outdoor',position:[0,0,0]}));
  const make=(via,cover,cost)=>[['s',via],[via,'t']].map(([from,to])=>({from,to,type:'bridge',isIndoor:false,isAccessible:true,verification:'verified',routingCost:cost,cover}));
  const graph={campusName:'Test',coordinateUnit:'schematic',buildings:[],navigation:{nodes,edges:[...make('open','open',1),...make('covered','covered',2),...make('unknown','unknown',1.5)]}};
  const finder=new AStarPathfinder(graph);
  assert.deepEqual(finder.findPath('s','t').pathNodes.map(n=>n.id),['s','open','t']);
  const inside=finder.findPath('s','t','indoor');assert.deepEqual(inside.pathNodes.map(n=>n.id),['s','covered','t']);
  assert.ok(inside.steps.slice(1).every(s=>s.cover==='covered'));
});

test('all registered gates reach every connected place under each mode exactly when the independent graph permits it',()=>{
  const places=placeIndex(data,s.overview).filter(p=>p.nodeId),finder=new AStarPathfinder(data);
  for(const gate of places.filter(p=>p.kind==='gate'))for(const mode of ['shortest','accessible','indoor','stairs']){
    const minimum=minimumFloorChanges(data,gate.nodeId,mode);
    for(const place of places){
      const r=finder.findPath(gate.nodeId,place.nodeId,mode);
      assert.equal(!!r,minimum.has(place.nodeId),`${gate.id} -> ${place.id} (${mode})`);
      if(r){assert.equal(r.floorChanges+r.verticalMovements.unmeasured,minimum.get(place.nodeId));if(mode==='accessible')assert.ok(r.steps.every(s=>s.edgeType!=='stairs'));}
    }
  }
});

test('authoring rejects missing or invalid costs, cover contradictions and invalid floor counts',()=>{
  const check=(change,pattern)=>{
    const c=structuredClone(s);change(c);
    const errors=validateSources(c.manifest,c.buildings,c.floors,c.sources,c.overview);
    assert.ok(errors.some(e=>pattern.test(e)),errors.join('\n'));
  };
  check(c=>delete c.floors[0].navigation.edges[0].routingCost,/reference routing cost/);
  check(c=>c.manifest.outdoor.edges[0].routingCost=-1,/reference routing cost/);
  check(c=>c.floors[0].navigation.edges[0].cover='open',/cover conflicts/);
  check(c=>c.manifest.outdoor.edges[0].floorChanges=-1,/explicit floor changes/);
  check(c=>c.buildings[0].connections[0].floorChanges=0,/conflict with floor order/);
});
