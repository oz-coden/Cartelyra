import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {readData} from '../scripts/read-data.mjs';
import {compileCampus} from '../.checks/data/compile.js';
import {AStarPathfinder} from '../.checks/pathfinding/AStar.js';
import {FloorMap} from '../.checks/ui/FloorMap.js';
import {segmentIntersections} from '../.checks/data/geometry.js';

const source=await readData(),data=compileCampus(source.manifest,source.buildings,source.floors);
const finder=new AStarPathfinder(data),out=id=>`campus/outdoor/${id}`;

function assertStraight(points) {
  const a=points[0],b=points.at(-1),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  let last=-1;
  for (const p of points) {
    assert.ok(Math.abs(dx*(p[1]-a[1])-dy*(p[0]-a[0]))/length<1e-5,'no side excursion from the walking axis');
    const progress=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(length*length);
    assert.ok(progress>=last-1e-7&&progress<=1+1e-7,'no backtracking');last=progress;
  }
}

test('the Building 3 to West Gate axis stays straight and never uses the Building 5 stair approach as a through path',()=>{
  for (const [a,b] of [['b3-front','west-gate'],['west-gate','avenue-east']]) for (const mode of ['shortest','accessible','stairs']) for (const [from,to] of [[a,b],[b,a]]) {
    const route=finder.findPath(out(from),out(to),mode);assert.ok(route);
    assert.ok(route.pathNodes.every(n=>!n.buildingId&&n.outdoorLayer==='ground'));
    assert.ok(!route.pathNodes.some(n=>[out('b5-stair-foot'),out('b5-2f-door')].includes(n.id)));
    assert.equal(route.verticalMovements.stairs,0);
    assertStraight(route.pathNodes.map(n=>n.overviewPosition));
  }
  // Indoor preference may enter a building through one door and leave through another.
  for (const [a,b] of [['b3-front','west-gate'],['west-gate','b3-front']]) {
    const route=finder.findPath(out(a),out(b),'indoor');assert.ok(route);
    assert.ok(!route.pathNodes.some(n=>[out('b5-stair-foot'),out('b5-2f-door')].includes(n.id)));
  }
  for (const [to,cost] of [['west-gate',27.060321],['b5-stair-foot',5.966895],['b7-b8-approach',6]])
    assert.ok(Math.abs(finder.findPath(out('b3-front'),out(to)).routingCost-cost)<1e-6,'rearranging reference geometry preserves existing approach costs');
});

test('closing the Building 5 access spur leaves through routes and the courtyard approach available',()=>{
  const closed=structuredClone(data);
  for (const edge of closed.navigation.edges) if ([edge.from,edge.to].includes(out('b5-stair-foot'))) edge.blocked=true;
  const pf=new AStarPathfinder(closed);
  for (const mode of ['shortest','accessible','indoor','stairs']) for (const [a,b] of [['b3/f1/room-103','b20/f1/room-113'],['b7/f2/room-21','b8/f2/room-20']]) for (const [from,to] of [[a,b],[b,a]]) {
    const before=finder.findPath(from,to,mode),after=pf.findPath(from,to,mode);
    assert.equal(!!after,!!before);
    if (before) assert.deepEqual(after.pathNodes.map(n=>n.id),before.pathNodes.map(n=>n.id));
  }
  assert.equal(pf.findPath('b3/f1/room-103','b5/f2/room-201'),null);
  for (const [a,b] of [['b3/f1/room-103','b5/f2/room-201'],['b5/f2/room-201','b3/f1/room-103']]) {
    const r=finder.findPath(a,b);assert.ok(r);
    assert.ok(r.pathNodes.some(n=>n.id===out('b5-path-junction')));
    assert.ok(r.pathNodes.some(n=>n.id===out('b5-stair-foot')));
    assert.equal(r.verticalMovements.stairs,1);
    assert.equal(finder.findPath(a,b,'accessible'),null);
  }
});

test('campus drawing and route overlay use the same straight junction geometry and the separate stair spur',async()=>{
  const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  globalThis.document=document;globalThis.window=window;
  const route=finder.findPath(out('b3-front'),out('west-gate'));
  const map=new FloorMap(document.getElementById('map-canvas'),data,source.overview);map.showOverview(true);map.setRoute(route);
  const points=s=>s.trim().split(/\s+/).map(p=>p.split(',').map(Number));
  const overlay=[...document.querySelectorAll('.map-route')].flatMap(p=>points(p.getAttribute('points')));
  assert.ok(overlay.length>1);assertStraight(overlay);
  const branch=document.querySelector(`[data-from="${out('b5-path-junction')}"][data-to="${out('b5-stair-foot')}"]`);
  assert.ok(branch);assert.equal(branch.getAttribute('data-edge-type'),'outdoor');
  assert.ok(document.querySelector(`[data-from="${out('b5-stair-foot')}"][data-to="${out('b5-2f-door')}"][data-edge-type="stairs"]`));
  assert.ok(route.steps.length<=3,'straight segments do not create a direction card at every junction');
});

test('ground walking segments meet only at explicit shared routing junctions',()=>{
  const outdoor=source.manifest.outdoor,nodes=new Map(outdoor.nodes.map(n=>[n.id,n]));
  const edges=outdoor.edges.filter(e=>!e.blocked&&e.type==='outdoor'&&[e.from,e.to].every(id=>nodes.get(id).layer==='ground'));
  for (let i=0;i<edges.length;i++) for (let j=i+1;j<edges.length;j++) {
    const a=edges[i],b=edges[j];
    if ([a.from,a.to].some(id=>[b.from,b.to].includes(id))) continue;
    assert.deepEqual(segmentIntersections(nodes.get(a.from).position,nodes.get(a.to).position,nodes.get(b.from).position,nodes.get(b.to).position),[],`${a.from}/${a.to} meets ${b.from}/${b.to} without a shared junction`);
  }
});
