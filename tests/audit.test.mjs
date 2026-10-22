import test from 'node:test';
import assert from 'node:assert/strict';
import { readData } from '../scripts/read-data.mjs';
import { auditGeometry, auditRoutes } from '../.checks/data/audit.js';
import { compileCampus } from '../.checks/data/compile.js';
import { validateSources } from '../.checks/data/validate.js';
import { interiorPoint, pointInInterior, polygonOverlapArea } from '../.checks/data/geometry.js';
import { placeIndex } from '../.checks/data/places.js';

const rect = (x, y, w, h) => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const room = (id, polygon) => ({ id, name:id, aliases:[], category:'unknown', polygon });
const floor = (rooms = []) => ({ id:'f1', buildingId:'b-test', level:1, label:'1F', stackIndex:0,
  elevation:0, sourceId:'test', notes:[], outline:rect(0,0,20,20), voids:[], features:[], rooms,
  navigation:{nodes:[], edges:[]} });
const walk = (from, to, flags = {}) => ({from,to,type:'walk',verification:'inferred',isIndoor:true,isAccessible:true,...flags});

test('nested rooms are review findings and do not invalidate otherwise valid authoring data', () => {
  const f = floor([room('outer',rect(1,1,18,18)),room('inner',rect(4,4,2,3))]);
  const manifest = {schemaVersion:1,campusName:'Test',coordinateUnit:'schematic',buildingIds:['b-test']};
  const buildings = [{id:'b-test',name:'Test',code:'T',color:'#fff',origin:[0,0,0],rotation:0,floorIds:['f1'],connections:[]}];
  assert.deepEqual(validateSources(manifest,buildings,[f],[{id:'test',filename:'test',description:'Fixture'}],{sourceId:'test',buildings:[],gates:[]}),[]);
  const findings = auditGeometry([f]);
  assert.equal(findings.length,1);
  assert.equal(findings[0].code,'room-contained');
  assert.match(findings[0].detail,/inner is contained in outer/);
  assert.equal(f.rooms[1].approachRoomId,undefined,'reporting must not infer an access relationship');
  assert.equal(f.navigation.nodes.length,0,'reporting must not invent routing nodes');
});

test('room diagnostics distinguish partial overlap, coincidence, containment and shared walls', () => {
  const a = room('A',rect(1,1,6,6));
  for (const [b, expected] of [
    [room('B',rect(5,5,5,5)),'room-overlap'],
    [room('B',[...a.polygon].reverse()),'room-coincident'],
    [room('B',rect(1,2,2,2)),'room-contained'],
    [room('B',rect(7,1,3,6)),undefined],
    [room('B',rect(7,7,3,3)),undefined],
  ]) assert.equal(auditGeometry([floor([a,b])])[0]?.code,expected);
});

test('polygon overlap handles sloping edges, thin overlaps and concave notches', () => {
  assert.equal(polygonOverlapArea([[0,0],[4,0],[0,4]],[[0,0],[4,4],[4,0]]),4);
  assert.ok(Math.abs(polygonOverlapArea(rect(0,0,2,2),rect(1.99999,0,2,2))-.00002)<1e-9);
  const u = [[0,0],[6,0],[6,6],[4,6],[4,2],[2,2],[2,6],[0,6]];
  const bridge = rect(1,3,4,1);
  assert.equal(polygonOverlapArea(u,bridge),2,'vertices in two arms do not imply containment across the notch');
  assert.equal(auditGeometry([floor([room('U',u),room('bridge',bridge)])])[0].code,'room-overlap');
});

test('junction diagnostics detect crossings, unsplit T junctions and collinear branches', () => {
  const fixtures = [
    {positions:[[1,5],[9,5],[5,1],[5,9]],edges:[walk('n0','n1'),walk('n2','n3')]},
    {positions:[[1,5],[9,5],[5,5],[5,9]],edges:[walk('n0','n1'),walk('n2','n3')]},
    {positions:[[1,5],[9,5],[5,5]],edges:[walk('n0','n1'),walk('n2','n1')]},
  ];
  for (const {positions,edges} of fixtures) {
    const f = floor();f.navigation={nodes:positions.map((position,i)=>({id:`n${i}`,name:'Hall',position,type:'corridor'})),edges};
    assert.ok(auditGeometry([f]).some(f=>f.code==='unjoined-junction'));
  }
  const f = floor();
  f.navigation.nodes = [[1,5],[5,5],[9,5],[5,9],[5,5]].map((position,i)=>({id:`n${i}`,name:'Hall',position,type:'corridor'}));
  f.navigation.edges = [walk('n0','n1'),walk('n1','n2'),walk('n4','n3'),walk('n1','n4')];
  assert.deepEqual(auditGeometry([f]),[],'an explicit coincident-node link is a valid shared junction');
});

test('concave label anchors stay inside rooms and preserve existing rectangular centers', () => {
  assert.deepEqual(interiorPoint(rect(2,3,6,8)),[5,7]);
  for (const p of [
    [[0,0],[2,0],[2,8],[8,8],[8,10],[0,10]],
    [[0,0],[6,0],[6,6],[4,6],[4,2],[2,2],[2,6],[0,6]],
    [[0,0],[4,0],[0,4]],
  ]) assert.ok(pointInInterior(interiorPoint(p),p));
});

test('reviewed campus junctions remain joined and the known 3F split stays visible in reports', async () => {
  const source = await readData(), findings = auditGeometry(source.floors);
  assert.deepEqual(findings.filter(f=>f.code==='unjoined-junction'),[]);
  assert.ok(findings.some(f=>f.code==='floor-components'&&f.buildingId==='b6'&&f.floorId==='f3'));
  const data = compileCampus(source.manifest,source.buildings,source.floors);
  for (const p of placeIndex(data).filter(p=>p.kind==='room'&&p.polygon))
    assert.ok(pointInInterior(p.position,p.polygon),`${p.id}: label/selection anchor must be inside its own polygon`);
});

test('route auditing checks both directions when the graph contains one-way connections', () => {
  const f=floor([room('A',rect(1,1,2,2)),room('B',rect(8,1,2,2))]);
  f.rooms[0].entrance='a';f.rooms[1].entrance='b';
  f.navigation.nodes=[{id:'a',name:'A',position:[3,2],type:'room_entrance'},{id:'b',name:'B',position:[8,2],type:'room_entrance'}];
  f.navigation.edges=[walk('a','b',{bidirectional:false})];
  const data=compileCampus({campusName:'Test',coordinateUnit:'schematic',buildingIds:['b-test']},[{id:'b-test',name:'Test',origin:[0,0,0],rotation:0,floorIds:['f1'],connections:[]}],[f]);
  const report=auditRoutes(data);
  assert.equal(report.checkedPairs,2);
  assert.deepEqual(report.findings.map(f=>[f.code,f.roomIds]),[['route-unreachable',['B','A']]]);
});
