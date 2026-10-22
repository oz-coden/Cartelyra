import test from 'node:test';
import assert from 'node:assert/strict';
import { readData } from '../scripts/read-data.mjs';
import { compileCampus } from '../.checks/data/compile.js';
import { validateSources } from '../.checks/data/validate.js';
import { localToWorld, worldToLocal, pointInPolygon, segmentIsWalkable } from '../.checks/data/geometry.js';
import { AStarPathfinder } from '../.checks/pathfinding/AStar.js';

const source = await readData();
const validate = d => validateSources(d.manifest, d.buildings, d.floors, d.sources, d.overview);
const campus = compileCampus(source.manifest, source.buildings, source.floors);
const finder = new AStarPathfinder(campus);
const fixtures = (nodes, edges) => ({ campusName: 'Test', buildings: [], navigation: { nodes: nodes.map(([id, x]) => ({ id, name: id, position: [x, 0, 0], floor: 1, type: 'corridor' })), edges: edges.map(e => ({ type: 'walk', isIndoor: true, isAccessible: true, verification: 'verified', ...e })) } });

test('six photographed floors, 35 main rooms, 34 routable rooms; authoring data validates', () => {
  assert.deepEqual(validate(source), []);
  assert.deepEqual(campus.buildings[0].floors.map(f => f.label), ['B2', 'B1', '1F', '2F', '3F', '4F']);
  const rooms = campus.buildings[0].floors.flatMap(f => f.rooms);
  assert.equal(rooms.length, 35); assert.equal(rooms.filter(r => r.entranceNodeId).length, 34);
  assert.equal(rooms.find(r => r.id === '3-B202').entranceNodeId, undefined);
  assert.equal(campus.coordinateUnit, 'schematic');
  assert.ok(source.buildings.find(b => b.id === 'b3').connections.every(e => e.verification === 'inferred'));
});

test('missing endpoints, duplicate IDs, missing sources and isolated rooms are reported', () => {
  const bad = structuredClone(source);
  const targetFloors = bad.floors.filter(f => f.buildingId === 'b3');
  targetFloors[0].navigation.edges.push({ ...targetFloors[0].navigation.edges[0], to: 'missing' });
  targetFloors[1].navigation.nodes.push(targetFloors[1].navigation.nodes[0]);
  targetFloors[2].sourceId = 'missing';
  const room = targetFloors[3].rooms[0];
  targetFloors[3].navigation.edges = targetFloors[3].navigation.edges.filter(e => e.from !== room.entrance && e.to !== room.entrance);
  const errors = validate(bad).join('\n');
  for (const expected of ['Missing edge endpoint', 'duplicate navigation node IDs', 'missing source', 'Disconnected navigation node']) assert.ok(errors.includes(expected), expected);
});

test('routes cannot cross a room, an atrium or an equipment area', () => {
  const bad = structuredClone(source), floor = bad.floors.find(f => f.buildingId === 'b3' && f.id === 'f4');
  floor.navigation.edges.push({ ...floor.navigation.edges[0], from: 'n50', to: 's54' });
  assert.ok(validate(bad).some(e => e.includes('Edge crosses room, void or service area')));
  const outline = [[0,0],[10,0],[10,10],[0,10]], narrow = [[4.00001,0],[4.00002,0],[4.00002,10],[4.00001,10]];
  assert.equal(segmentIsWalkable([1,5], [9,5], outline, [narrow]), false);
  assert.equal(segmentIsWalkable([1,1], [1,9], outline, [narrow]), true);
});

test('Building 3 indoor footprints exclude outdoor stair remnants and retain real corridors', () => {
  const floor = id => source.floors.find(f => f.buildingId === 'b3' && f.id === id);
  for (const id of ['f2', 'f3', 'f4']) {
    assert.equal(pointInPolygon([105, 65], floor(id).outline), false);
    assert.equal(pointInPolygon([97, 67], floor(id).outline), true);
  }
  for (const id of ['b1', 'f1'])
    assert.equal(pointInPolygon([24, 46], floor(id).outline), false);
  assert.equal(pointInPolygon([115, 40], floor('f1').outline), false);
  assert.equal(pointInPolygon([103, 45], floor('b1').outline), false);
  assert.equal(pointInPolygon([97, 45], floor('f2').outline), false);
  for (const id of ['f3', 'f4'])
    assert.equal(pointInPolygon([97, 45], floor(id).outline), true);
  const route = finder.findPath('b3/f2/stair1', 'b3/f2/room-205');
  assert.ok(route.pathNodes.some(n => n.id === 'b3/f2/mid'));
  assert.ok(route.pathNodes.every(n => n.floor === 2));
  for (const level of [2, 3, 4]) {
    const across = finder.findPath(`b3/f${level}/room-${level}04`, `b3/f${level}/room-${level}01`);
    const building = campus.buildings.find(b => b.id === 'b3');
    assert.ok(across.pathNodes.every(n => worldToLocal(building, n.position)[0] <= 85));
  }
  for (const f of source.floors.filter(f => f.buildingId === 'b3')) {
    assert.ok(f.features.filter(feature => feature.type === 'stairs')
      .every(feature => ['stairs1', 'stairs2'].includes(feature.id)));
    assert.ok(f.navigation.nodes.every(n => !/stair[345]/.test(n.id)));
  }
});

test('walk edges cannot cross stair or elevator interiors and facility approaches stay on their footprints', () => {
  for (const [id, positions] of [['b2', [[26, 17], [32, 17]]], ['f1', [[95, 1], [95, 22]]]]) {
    const bad = structuredClone(source), floor = bad.floors.find(f => f.buildingId === 'b3' && f.id === id);
    floor.navigation.nodes.push(...positions.map((position, i) => ({ id: `bad-${i}`, name: 'Invalid corridor', position, type: 'corridor' })));
    floor.navigation.edges.push({ from: 'bad-0', to: 'bad-1', type: 'walk', verification: 'inferred', isIndoor: true, isAccessible: true });
    assert.ok(validate(bad).some(e => e.includes('Edge crosses room, void or service area')));
  }
  const bad = structuredClone(source), floor = bad.floors.find(f => f.buildingId === 'b3' && f.id === 'b1');
  floor.navigation.nodes.find(n => n.id === 'stair1').position = [86, 26];
  assert.ok(validate(bad).some(e => e.includes('stairs1: entrance is not on facility')));
});

test('building-local coordinates transform consistently, including rotation', () => {
  const b = { origin: [71, 5, -22], rotation: Math.PI / 3 }, point = [10, 23];
  const world = localToWorld(b, point, 12), local = worldToLocal(b, world);
  assert.ok(Math.abs(local[0] - point[0]) < 1e-8 && Math.abs(local[1] - point[1]) < 1e-8);
  assert.equal(world[1], 17);
});

test('another building can reuse floor IDs without mixing floors or entrances', () => {
  const d = structuredClone(source), second = structuredClone(d.buildings.find(b => b.id === 'b3'));
  second.id = 'b99'; second.code = '99'; second.origin = [200, 0, 10];
  second.connections = second.connections.map(e => ({ ...e, from: e.from.replace('b3/', 'b99/'), to: e.to.replace('b3/', 'b99/') }));
  d.manifest.buildingIds.push('b99'); d.buildings.push(second);
  d.floors.push(...structuredClone(d.floors.filter(f => f.buildingId === 'b3')).map(f => ({ ...f, buildingId: 'b99', rooms: f.rooms.map(r => ({ ...r, id: r.id.replace('3-', '99-') })) })));
  assert.deepEqual(validate(d), []);
  const data = compileCampus(d.manifest, d.buildings, d.floors);
  assert.equal(data.buildings.find(b => b.id === 'b99').floors[0].rooms[0].buildingId, 'b99');
  assert.ok(data.navigation.nodes.some(n => n.id.startsWith('b99/f1/')));
});

test('shortest mode chooses 10m outdoor route over 10.8m indoor route', () => {
  const data = fixtures([['a',0],['b',5],['c',4],['d',10]], [
    { from:'a',to:'b',distance:5,type:'outdoor',isIndoor:false }, { from:'b',to:'d',distance:5,type:'outdoor',isIndoor:false },
    { from:'a',to:'c',distance:5.4 }, { from:'c',to:'d',distance:5.4 }
  ]), f = new AStarPathfinder(data);
  assert.equal(f.findPath('a','d').totalDistance, 10);
  assert.equal(f.findPath('a','d','indoor').totalDistance, 10.8);
});

test('explicit short edge lengths do not invalidate optimality through a heuristic', () => {
  const f = new AStarPathfinder(fixtures([['a',0],['b',1000],['c',1]], [
    {from:'a',to:'c',distance:10}, {from:'a',to:'b',distance:1}, {from:'b',to:'c',distance:1}
  ]));
  assert.deepEqual(f.findPath('a','c').pathNodes.map(n => n.id), ['a','b','c']);
});

test('stair avoidance, verified-only, blocked and one-way constraints apply in both directions', () => {
  const f = new AStarPathfinder(fixtures([['a',0],['b',1],['c',2]], [
    {from:'a',to:'c',type:'stairs',isAccessible:false,distance:1},
    {from:'a',to:'b',type:'elevator',distance:2,verification:'inferred'}, {from:'b',to:'c',distance:2}
  ]));
  assert.equal(f.findPath('a','c','accessible').totalDistance, 4);
  assert.equal(f.findPath('a','c','accessible',false), null);
  assert.equal(f.findPath('a','c','shortest',false).totalDistance, 1);
  assert.equal(f.findPath('c','a','accessible').totalDistance, 4);
  const oneway = new AStarPathfinder(fixtures([['a',0],['b',1],['c',2]], [
    {from:'a',to:'b',bidirectional:false}, {from:'b',to:'c',blocked:true}
  ]));
  assert.ok(oneway.findPath('a','b')); assert.equal(oneway.findPath('b','a'), null); assert.equal(oneway.findPath('a','c'), null);
});

test('B1 to 1F is one floor change, unmeasured distances are not exposed in step text', () => {
  const result = finder.findPath('b3/b1/stair2','b3/f1/stair2');
  assert.equal(result.floorChanges, 1); assert.equal(result.distanceUnit, 'schematic');
  assert.equal(result.estimatedMinutes, 0); assert.ok(result.inferredConnections > 0);
  assert.ok(result.steps.every(s => s.distance === 0 && !s.instruction.includes('-1F')));
  assert.ok(result.steps.some(s => s.instruction.includes('1F')));
  assert.ok(finder.findPath('b3/f1/stair2','b3/b1/stair2').steps.some(s => s.instruction.includes('B1')));
  assert.equal(finder.findPath('b3/f1/stair2','b3/b1/stair2','shortest',false), null);
});

test('unknown endpoints, same-point routes and invalid edge data', () => {
  assert.equal(finder.findPath('missing','b3/f1/stair2'), null);
  const same = finder.findPath('b3/f1/stair2','b3/f1/stair2');
  assert.equal(same.pathNodes.length, 1); assert.equal(same.totalDistance, 0); assert.equal(same.floorChanges, 0);
  assert.throws(() => new AStarPathfinder(fixtures([['a',0]], [{from:'a',to:'missing'}])), /Unknown edge endpoint/);
  assert.throws(() => new AStarPathfinder(fixtures([['a',0],['b',1]], [{from:'a',to:'b',distance:-1}])), /Invalid edge distance/);
});

test('all 34 routable rooms connect in all four modes; costs agree with independent Floyd–Warshall', () => {
  const nodes = campus.navigation.nodes.filter(n => n.buildingId === 'b3'), rooms = campus.buildings[0].floors.flatMap(f => f.rooms).filter(r => r.entranceNodeId);
  const ids = new Map(nodes.map((n,i) => [n.id,i])), count = nodes.length;
  for (const mode of ['shortest','accessible','indoor','stairs']) {
    const matrix = Array.from({length:count},(_,i) => Array.from({length:count},(_,j) => i===j ? 0 : Infinity));
    for (const edge of campus.navigation.edges) {
      if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
      if (edge.blocked || (mode==='accessible' && (!edge.isAccessible || edge.type==='stairs'))) continue;
      const a=ids.get(edge.from),b=ids.get(edge.to);
      let cost=edge.distance ?? Math.hypot(...nodes[a].position.map((v,i) => v-nodes[b].position[i]));
      if (mode==='indoor' && !edge.isIndoor) cost*=4.5;
      if (mode==='stairs' && edge.type==='elevator') cost+=35;
      matrix[a][b]=Math.min(matrix[a][b],cost);
      if(edge.bidirectional!==false)matrix[b][a]=Math.min(matrix[b][a],cost);
    }
    for(let k=0;k<count;k++)for(let i=0;i<count;i++)for(let j=0;j<count;j++)matrix[i][j]=Math.min(matrix[i][j],matrix[i][k]+matrix[k][j]);
    for(const a of rooms)for(const b of rooms){
      const result=finder.findPath(a.entranceNodeId,b.entranceNodeId,mode);
      assert.ok(result,`${mode}: ${a.id} -> ${b.id}`);
      let cost=0;
      for(let i=1;i<result.pathNodes.length;i++){
        const x=result.pathNodes[i-1],y=result.pathNodes[i];
        const edge=campus.navigation.edges.find(e => (e.from===x.id&&e.to===y.id)||(e.bidirectional!==false&&e.from===y.id&&e.to===x.id));
        let distance=edge.distance??Math.hypot(...x.position.map((v,i)=>v-y.position[i]));
        if(mode==='indoor'&&!edge.isIndoor)distance*=4.5;
        if(mode==='stairs'&&edge.type==='elevator')distance+=35;
        cost+=distance;
        if(mode==='accessible')assert.notEqual(edge.type,'stairs');
      }
      assert.ok(Math.abs(cost-matrix[ids.get(a.entranceNodeId)][ids.get(b.entranceNodeId)])<1e-6,`${mode}: ${a.id} -> ${b.id}`);
    }
  }
});
