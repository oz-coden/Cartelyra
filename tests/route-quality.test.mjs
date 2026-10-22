import test from 'node:test';
import assert from 'node:assert/strict';
import { readData } from '../scripts/read-data.mjs';
import { compileCampus } from '../.checks/data/compile.js';
import { minimumFloorChanges } from '../.checks/data/audit.js';
import { placeIndex } from '../.checks/data/places.js';
import { AStarPathfinder } from '../.checks/pathfinding/AStar.js';

const source=await readData(),data=compileCampus(source.manifest,source.buildings,source.floors),places=placeIndex(data),finder=new AStarPathfinder(data);

test('all registered room pairs obey filters and minimize schematic floor changes in all four modes', () => {
  let pairs=0;
  for(const mode of ['shortest','accessible','indoor','stairs']) for(const building of data.buildings){
    const rooms=places.filter(p=>p.buildingId===building.id&&p.kind==='room'&&p.nodeId);
    for(let i=0;i<rooms.length;i++){
      const a=rooms[i],reference=minimumFloorChanges(data,a.nodeId,mode);
      for(let j=i+1;j<rooms.length;j++){
        const b=rooms[j],route=finder.findPath(a.nodeId,b.nodeId,mode),expected=reference.get(b.nodeId);
        pairs++;
        assert.equal(!!route,expected!==undefined,`${mode}: ${a.id} -> ${b.id} reachability`);
        if(!route)continue;
        assert.equal(route.floorChanges,expected,`${mode}: ${a.id} -> ${b.id} unnecessary floor changes`);
        assert.equal(route.pathNodes[0].id,a.nodeId);assert.equal(route.pathNodes.at(-1).id,b.nodeId);
        if(mode==='accessible')assert.ok(route.steps.every(s=>s.edgeType!=='stairs'));
      }
    }
  }
  assert.equal(pairs,290452);
});

test('known stair detours stay on 2F, and 1-B114 to 1-722 no longer overshoots 7F', () => {
  for(const id of ['206A','207','208-1']) for(const [a,b] of [['204',id],[id,'204']]){
    const r=finder.findPath(`b6/f2/room-${a}`,`b6/f2/room-${b}`);
    assert.equal(r.floorChanges,0);assert.ok(r.pathNodes.every(n=>n.floor===2));
  }
  const r=finder.findPath('b1/b1/room-B114','b1/f7/room-722');
  assert.equal(r.floorChanges,7);assert.ok(r.pathNodes.every(n=>n.floor<=7));
  const required=finder.findPath('b6/f3/room-303','b6/f3/room-308');
  assert.equal(required.floorChanges,2,'disconnected same-floor areas still permit a necessary off-floor route');
});

test('reviewed crossings allow direct turns without passing and retracing the junction', () => {
  const required=[
    ['b1/b1/room-B115','b1/b1/room-B110','b1/b1/hall-junction-53'],
    ['b1/f1/room-104','b1/f1/room-106-1','b1/f1/hall-junction-46'],
    ['b3/f1/room-101','b3/f1/room-103','b3/f1/west-south'],
    ['b3/f2/room-201','b3/f2/room-209','b3/f2/west-209'],
  ];
  for(const [a,b,junction] of required){
    const r=finder.findPath(a,b);assert.ok(r.pathNodes.some(n=>n.id===junction));
    if(b==='b3/f2/room-209')assert.ok(!r.pathNodes.some(n=>n.id==='b3/f2/west'));
    if(a==='b1/f1/room-104')assert.ok(!r.pathNodes.some(n=>n.id==='b1/f1/hall-8'));
  }
});

test('schematic floor preference preserves constraints, required transfers and measured shortest behavior', () => {
  const floors=[{level:1,stackIndex:0,label:'1F'},{level:2,stackIndex:1,label:'2F'}];
  const nodes=[['a',2],['b',2],['down-a',1],['down-b',1]].map(([id,floor])=>({id,name:id,type:'corridor',floor,buildingId:'test',position:[0,0,0]}));
  const edge=(from,to,distance,type='walk',extra={})=>({from,to,distance,type,isIndoor:true,isAccessible:type!=='stairs',verification:'verified',...extra});
  const graph={campusName:'Test',coordinateUnit:'schematic',buildings:[{id:'test',floors}],navigation:{nodes,edges:[edge('a','b',100),edge('a','down-a',1,'stairs'),edge('down-a','down-b',1),edge('down-b','b',1,'stairs')]}};
  const f=new AStarPathfinder(graph);
  assert.equal(f.findPath('a','b').totalDistance,100);
  assert.equal(f.findPath('a','b','accessible').totalDistance,100);
  assert.equal(new AStarPathfinder({...graph,coordinateUnit:'meters'}).findPath('a','b').totalDistance,3);
  graph.navigation.edges[0].blocked=true;
  assert.equal(new AStarPathfinder(graph).findPath('a','b').floorChanges,2);
  assert.equal(new AStarPathfinder(graph).findPath('a','b','accessible'),null);
  graph.navigation.edges[0].blocked=false;graph.navigation.edges[0].verification='inferred';
  assert.equal(new AStarPathfinder(graph).findPath('a','b','shortest',false).floorChanges,2);
});

test('same-building schematic guidance avoids scale-driven outdoor shortcuts but permits necessary outdoor paths and passageways', () => {
  const graph={campusName:'Test',coordinateUnit:'schematic',buildings:[{id:'test',floors:[{level:1,stackIndex:0,label:'1F'}]}],navigation:{
    nodes:[{id:'a',name:'A',type:'corridor',buildingId:'test',floor:1,position:[0,0,0]},
      {id:'b',name:'B',type:'corridor',buildingId:'test',floor:1,position:[0,0,0]},
      ...['x','y'].map(id=>({id,name:id,type:'outdoor',position:[0,0,0]}))],
    edges:[['a','b',100,true],['a','x',1,false],['x','y',200,false],['y','b',1,false]].map(([from,to,distance,isIndoor])=>
      ({from,to,distance,isIndoor,type:isIndoor?'walk':'outdoor',isAccessible:true,verification:'verified'}))}};
  const outdoors=graph.navigation.edges.find(e=>e.from==='x');outdoors.distance=1;
  assert.equal(new AStarPathfinder(graph).findPath('a','b').totalDistance,100);
  assert.equal(new AStarPathfinder({...graph,coordinateUnit:'meters'}).findPath('a','b').totalDistance,3);
  graph.navigation.edges[0].blocked=true;
  assert.equal(new AStarPathfinder(graph).findPath('a','b').totalDistance,3,'outdoor-only connections remain usable');
  graph.navigation.edges[0].blocked=false;outdoors.distance=200;
  const passage=new AStarPathfinder(graph).findPath('x','y');
  assert.deepEqual(passage.pathNodes.map(n=>n.id),['x','a','b','y'],'gate-to-gate travel may use a registered building passageway');
});
