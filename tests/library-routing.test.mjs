import test from 'node:test';
import assert from 'node:assert/strict';
import {readData} from '../scripts/read-data.mjs';
import {compileCampus} from '../.checks/data/compile.js';
import {validateSources} from '../.checks/data/validate.js';
import {minimumFloorChanges} from '../.checks/data/audit.js';
import {pointInInterior} from '../.checks/data/geometry.js';
import {placeIndex,searchPlaces} from '../.checks/data/places.js';
import {AStarPathfinder} from '../.checks/pathfinding/AStar.js';
const s=await readData(),data=compileCampus(s.manifest,s.buildings,s.floors),finder=new AStarPathfinder(data),places=placeIndex(data),out=id=>'campus/outdoor/'+id;
const b15=s.buildings.find(b=>b.id==='b15'),floors=s.floors.filter(f=>f.buildingId==='b15');
const modes=['shortest','accessible','indoor','stairs'];

test('library stair cores are connected by adjacent floors, the southeast flight stops at 2F, and EV2 becomes the single 2F EV',()=>{
  const southeast=b15.connections.filter(e=>e.from.includes('stairs-southeast')||e.to.includes('stairs-southeast'));
  assert.equal(southeast.length,1);assert.equal(southeast[0].from,'b15/f1/stairs-southeast');assert.equal(southeast[0].to,'b15/f2/stairs-southeast');
  for(const core of ['stairs-east','stairs-west','stairs-north','ev'])for(let level=1;level<4;level++)assert.ok(b15.connections.some(e=>e.from===`b15/f${level}/${core}`&&e.to===`b15/f${level+1}/${core}`));
  const ev=floors.find(f=>f.level===2).features.filter(f=>f.type==='elevator');assert.equal(ev.length,1);assert.equal(ev[0].label,'EV');assert.equal(ev[0].id,'ev');
  assert.deepEqual(ev[0].polygon,[[68,6],[76,6],[76,18],[68,18]]);
  const r=finder.findPath('b15/f1/room-learning-hive','b15/f4/room-booths','accessible');assert.ok(r);
  assert.equal(r.verticalMovements.stairs,0);assert.equal(r.verticalMovements.elevators,3);assert.equal(r.floorChanges,3);
  assert.ok(r.pathNodes.every(n=>n.buildingId==='b15'));
});

test('staff stairs remain authored but cannot be used as a shortcut or a public endpoint in any mode',()=>{
  const links=data.navigation.edges.filter(e=>e.from.startsWith('b15/')&&e.access==='staff');assert.equal(links.length,7);
  for(const mode of modes)for(let level=1;level<=4;level++)for(const [a,b]of[['b15/f1/room-learning-hive',`b15/f${level}/stairs-north`],[`b15/f${level}/stairs-north`,'b15/f1/room-learning-hive']]){
    assert.equal(finder.findPath(a,b,mode),null);assert.equal(finder.findPath(a,b,mode,true,'fewest-stairs'),null);
    assert.ok(!minimumFloorChanges(data,a,mode).has(b));
  }
  const invalid=structuredClone(s);invalid.buildings.find(b=>b.id==='b15').connections[0].access='unrecognized';
  assert.ok(validateSources(invalid.manifest,invalid.buildings,invalid.floors,invalid.sources,invalid.overview).some(e=>e.includes('Invalid access restriction')));
});

test('every lower-floor WC requires its own unmeasured stair approach while its same-floor corridor remains reachable',()=>{
  for(const f of floors.filter(f=>f.level<=2))for(const wc of f.features.filter(x=>x.type==='restroom')){
    const inside=`b15/${f.id}/`,start=inside+(f.level===1?'room-learning-hive':'room-atrium'),end=inside+wc.entrance;
    for(const [a,b]of [[start,end],[end,start]]){
      const r=finder.findPath(a,b);assert.ok(r);
      assert.deepEqual(r.verticalMovements,{stairs:1,ramps:0,elevators:0,unmeasured:1});assert.equal(r.floorChanges,0);
      assert.ok(r.pathNodes.every(n=>n.buildingId==='b15'&&n.floor===f.level));
      assert.equal(finder.findPath(a,b,'accessible'),null);
      const fallback=finder.findPath(a,b,'shortest',true,'fewest-stairs');assert.equal(fallback.verticalMovements.stairs,1);
    }
  }
});

test('library room-to-room guidance stays indoors, avoids lounge and office interiors, and retains a southern loop around the 4F void',()=>{
  assert.ok(!floors[0].rooms.find(r=>r.id==='15-f1-lounge').passThrough);
  assert.ok(floors.every(f=>f.rooms.filter(r=>r.category==='office').every(r=>!r.passThrough)));
  for(const mode of modes)for(const [a,b]of[['b15/f1/room-learning-hive','b15/f2/room-reading'],['b15/f1/room-group-a','b15/f1/entrance'],['b15/f1/room-media','b15/f4/room-reading-south']]){
    const r=finder.findPath(a,b,mode);assert.ok(r);assert.ok(r.pathNodes.every(n=>n.buildingId==='b15'));
    for(let i=1;i<r.pathNodes.length;i++){
      const a=r.pathNodes[i-1],b=r.pathNodes[i];if(a.floor!==b.floor)continue;
      const f=floors.find(f=>f.level===a.floor),building=data.buildings.find(b=>b.id==='b15');
      for(const room of f.rooms.filter(r=>r.category==='office'||r.id==='15-f1-lounge'))for(const t of [.25,.5,.75]){
        const point=[a.position[0]+t*(b.position[0]-a.position[0])-building.origin[0],a.position[2]+t*(b.position[2]-a.position[2])-building.origin[2]];
        assert.ok(!pointInInterior(point,room.polygon),room.id);
      }
    }
  }
  const loop=finder.findPath('b15/f4/room-reading-west','b15/f4/room-stacks-east');assert.ok(loop.pathNodes.some(n=>n.position[2]>90));
});

test('the red ground spine connects West Gate, both library entrances, the Building 23 side and the Building 8 south path',()=>{
  for(const [door,target]of[['b15-east-door','b15/f1/entrance'],['b15-south-door','b15/f2/entrance']]){
    assert.equal(s.manifest.outdoor.links.find(l=>l.from===door).to,target);
    for(const [a,b]of[[out('west-gate'),target],[target,out('west-gate')]]){
      const r=finder.findPath(a,b,'accessible');assert.ok(r);assert.equal(r.verticalMovements.stairs,0);
      assert.ok(r.pathNodes.some(n=>n.id===out(door)));assert.ok(!r.pathNodes.some(n=>n.id===out('b12-entry-landing')));
    }
  }
  for(const target of ['b23-east-turn','b8-south-path']){
    const r=finder.findPath(out('west-gate'),out(target),'accessible');assert.ok(r);
    assert.ok(r.pathNodes.every(n=>!n.buildingId&&n.outdoorLayer==='ground'));assert.equal(r.verticalMovements.unmeasured,0);
  }
});

test('Building 12 has two stair approaches to the same provisional landing without assigning a second indoor floor',()=>{
  const entry='b12/f1/room-16';assert.equal(searchPlaces(places,'12-16')[0].nodeId,entry);
  for(const start of ['b12-ground-junction','bridge-b12-entry-stairs'])for(const [a,b]of[[out(start),entry],[entry,out(start)]]){
    const r=finder.findPath(a,b);assert.ok(r);assert.equal(r.verticalMovements.stairs,1);assert.equal(r.verticalMovements.unmeasured,1);assert.equal(r.floorChanges,0);
    assert.ok(r.pathNodes.some(n=>n.id===out('b12-entry-landing')));assert.equal(finder.findPath(a,b,'accessible'),null);
  }
  const cross=finder.findPath(out('b12-ground-junction'),out('bridge-b12-entry-stairs'));assert.ok(cross);
  const isolated=structuredClone(data);for(const e of isolated.navigation.edges)if(['stairs','ramp','elevator'].includes(e.type)&&!e.from.startsWith('b')&&![e.from,e.to].includes(out('b12-entry-landing')))e.blocked=true;
  assert.equal(new AStarPathfinder(isolated).findPath(out('b12-ground-junction'),out('bridge-b12-entry-stairs')).verticalMovements.stairs,2);
  const closed=structuredClone(data);for(const e of closed.navigation.edges)if(e.type==='stairs'&&[e.from,e.to].includes(out('b12-entry-landing')))e.blocked=true;
  closed.navigation.edges.find(e=>e.from===out('b12-west-door')&&e.to==='b12/f1/entrance-west').blocked=true;
  const pf=new AStarPathfinder(closed);assert.equal(pf.findPath(out('west-gate'),entry),null);
  for(const mode of modes){
    const before=finder.findPath(out('west-gate'),'b15/f2/entrance',mode),after=pf.findPath(out('west-gate'),'b15/f2/entrance',mode);assert.ok(after);
    assert.deepEqual(after.pathNodes.map(n=>n.id),before.pathNodes.map(n=>n.id));
  }
  const normal=finder.findPath(out('bridge-b12-east-junction'),'b15/f2/entrance');assert.ok(!normal.pathNodes.some(n=>n.id===out('b12-entry-landing')));
  const fallback=structuredClone(data);fallback.navigation.edges.find(e=>e.from===out('bridge-b12-top')&&e.to===out('bridge-b12-foot')).blocked=true;
  // The tentative two-stair landing remains usable when its approach is explicitly requested.
  assert.ok(new AStarPathfinder(fallback).findPath(out('bridge-b12-entry-stairs'),out('b12-ground-junction')));
});

test('Building 12 uses its two large 1F areas for circulation and a stair-backed west entrance near Building 19',()=>{
  const floors=s.floors.filter(f=>f.buildingId==='b12'),first=floors.find(f=>f.level===1);
  for(const id of ['12-11','12-16'])assert.equal(first.rooms.find(r=>r.id===id).passThrough,true);
  const r=finder.findPath('b12/f1/entrance-provisional','b12/f1/room-14');assert.ok(r);
  const building=data.buildings.find(b=>b.id==='b12');
  for(const id of ['12-11','12-16'])assert.ok(r.pathNodes.some(n=>pointInInterior([n.position[0]-building.origin[0],n.position[2]-building.origin[2]],first.rooms.find(r=>r.id===id).polygon)),id);
  const west=s.manifest.outdoor.links.find(l=>l.to==='b12/f1/entrance-west');assert.equal(west.from,'b12-west-door');
  const entered=finder.findPath(out('b12-west-junction'),'b12/f1/room-16');assert.ok(entered);
  assert.equal(entered.verticalMovements.stairs,1);assert.equal(entered.verticalMovements.unmeasured,1);
  assert.ok(entered.pathNodes.some(n=>n.id==='b12/f1/stairs-right'));
  for(const floor of floors){
    const wc=finder.findPath(`b12/${floor.id}/stairs-left`,`b12/${floor.id}/wc`);assert.ok(wc);
    assert.equal(wc.verticalMovements.stairs,1);assert.equal(finder.findPath(`b12/${floor.id}/stairs-left`,`b12/${floor.id}/wc`,'accessible'),null);
  }
  const upper=finder.findPath('b12/f1/room-10','b12/f3/room-311');assert.ok(upper);assert.equal(upper.floorChanges,2);
  assert.ok(upper.pathNodes.every(n=>n.buildingId==='b12'));assert.equal(finder.findPath('b12/f1/room-10','b12/f3/room-311','accessible'),null);
  for(const id of ['12-20A','12-20B','12-21A','12-21B'])assert.equal(places.find(p=>p.id===id).approachRoomId,'12-21');
});

test('access spurs retain ordinary destination costs and penalize only unrelated through journeys',async()=>{
  const {RoutePolicy}=await import('../.checks/pathfinding/RoutePolicy.js'),policy=new RoutePolicy(data);
  const edge=data.navigation.edges.find(e=>e.accessFor==='b12'),nodes=new Map(data.navigation.nodes.map(n=>[n.id,n]));
  const traversal=policy.traversal(edge,nodes.get(edge.from),nodes.get(edge.to)),room=nodes.get('b12/f1/room-16'),other=nodes.get('b15/f1/entrance'),gate=nodes.get(out('west-gate'));
  assert.equal(policy.cost(traversal,'shortest',gate,room),edge.routingCost);
  assert.equal(policy.cost(traversal,'shortest',room,gate),edge.routingCost);
  assert.equal(policy.cost(traversal,'shortest',gate,other),edge.routingCost+edge.throughPenalty);
  for(const mutation of [e=>e.accessFor='missing',e=>delete e.accessFor,e=>e.throughPenalty=-1,e=>e.throughPenalty=Infinity]){
    const invalid=structuredClone(s),e=invalid.manifest.outdoor.edges.find(e=>e.accessFor==='b12');mutation(e);
    assert.ok(validateSources(invalid.manifest,invalid.buildings,invalid.floors,invalid.sources,invalid.overview).some(e=>/Invalid access spur|Invalid through penalty/.test(e)));
  }
});
