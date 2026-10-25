import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {readData} from '../scripts/read-data.mjs';
import {compileCampus} from '../.checks/data/compile.js';
import {validateSources} from '../.checks/data/validate.js';
import {auditGeometry} from '../.checks/data/audit.js';
import {pointInPolygon,pointInInterior,segmentIsWalkable} from '../.checks/data/geometry.js';
import {buildingCatalog,placeIndex,searchPlaces} from '../.checks/data/places.js';
import {LocationState} from '../.checks/ui/LocationState.js';
import {FloorMap} from '../.checks/ui/FloorMap.js';
import {AStarPathfinder} from '../.checks/pathfinding/AStar.js';
const s=await readData(),data=compileCampus(s.manifest,s.buildings,s.floors),building=data.buildings.find(b=>b.id==='b12');
const floors=s.floors.filter(f=>f.buildingId==='b12'),places=placeIndex(data).filter(p=>p.buildingId==='b12');

test('Building 12 preserves all photographed identifiers, WC genders and a limited provisional entrance',()=>{
  assert.deepEqual(validateSources(s.manifest,s.buildings,s.floors,s.sources,s.overview),[]);
  assert.deepEqual(building.floors.map(f=>[f.label,f.rooms.length]),[['1F',8],['2F',11],['3F',11]]);
  assert.deepEqual(floors.map(f=>f.features.find(x=>x.type==='restroom').restroomType),['male','female','male']);
  assert.deepEqual(floors.map(f=>f.voids.length),[0,1,1]);
  assert.deepEqual(auditGeometry(floors),[]);
  const actual=places.filter(p=>p.kind==='room').map(p=>p.id).sort();
  const expected=[...[10,11,12,13,14,15,16,17].map(n=>'12-'+n),...['20A','20B','21','21A','21B','22','23','24','25','26','27'].map(n=>'12-'+n),...[31,32,33,34,35,36,37,38,39,310,311].map(n=>'12-'+n)].sort();
  assert.deepEqual(actual,expected);
  for(const id of actual)assert.equal(searchPlaces(places,id)[0].id,id);
  assert.ok(places.filter(p=>p.kind==='room').every(p=>p.nodeId));
  assert.equal(places.find(p=>p.id==='12-16').nodeId,'b12/f1/room-16');
  assert.ok(data.navigation.nodes.some(n=>n.buildingId==='b12'&&n.floor===3));
  assert.equal(s.buildings.find(b=>b.id==='b12').connections.length,4);
  assert.equal(s.manifest.outdoor.links.filter(e=>e.to.startsWith('b12/')).length,2);
  const finder=new AStarPathfinder(data);
  for(const p of places)if(!p.nodeId)for(const mode of ['shortest','accessible','indoor','stairs'])assert.equal(finder.findPath('campus/outdoor/west-gate',p.id,mode),null);
  assert.ok(finder.findPath('campus/outdoor/west-gate','b12/f1/room-16'));
  assert.equal(finder.findPath('campus/outdoor/west-gate','b12/f1/room-16','accessible'),null);
});

test('all Building 12 rooms and facilities render, remain selectable and share aligned left and right stair positions',async()=>{
  const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));globalThis.document=document;globalThis.window=window;
  const state=new LocationState(buildingCatalog(data,s.overview),data.viewGroups);assert.ok(state.selectBuilding('b12'));
  const map=new FloorMap(document.getElementById('map-canvas'),data,s.overview);
  for(const f of floors){
    assert.ok(state.selectFloor(f.level));map.setLocation(state.building,state.floor,state.scope);
    const shown=places.filter(p=>p.floorLevel===f.level);let selected;
    map.onPlaceSelect=p=>selected=p;
    for(const p of shown){const el=document.querySelector(`[data-place="${p.id}"]`);assert.ok(el,p.id);el.dispatchEvent(new window.Event('click'));assert.equal(selected.id,p.id);}
    assert.equal(document.querySelectorAll('.map-void').length,f.voids.length);
    assert.deepEqual(f.features.find(x=>x.id==='stairs-left').polygon,[[24,6],[36,6],[36,20],[24,20]]);
    assert.deepEqual(f.features.find(x=>x.id==='stairs-right').polygon,[[96,f.level===1?0:4],[108,f.level===1?0:4],[108,14],[96,14]]);
  }
});

test('the lower 12-16 entrance stays on the floor boundary and connects indoor guidance to both existing outdoor approaches',()=>{
  const first=floors.find(f=>f.level===1),room=first.rooms.find(r=>r.id==='12-16');
  const feature=first.features.find(f=>f.id==='entrance-provisional');
  const endpoint=first.navigation.nodes.find(n=>n.id===feature.entrance);
  assert.deepEqual(endpoint.position,[96,78]);
  assert.ok(pointInPolygon(endpoint.position,feature.polygon));
  assert.ok(pointInPolygon(endpoint.position,first.outline)&&!pointInInterior(endpoint.position,first.outline));
  assert.ok(feature.polygon.every(p=>pointInPolygon(p,room.polygon)));
  const finder=new AStarPathfinder(data),door='b12/f1/entrance-provisional';
  const local=node=>[node.position[0]-building.origin[0],node.position[2]-building.origin[2]];
  const inside=finder.findPath('b12/f1/room-16',door);assert.ok(inside);
  assert.deepEqual(local(inside.pathNodes.at(-1)),endpoint.position);
  for(let i=1;i<inside.pathNodes.length;i++)
    assert.ok(segmentIsWalkable(local(inside.pathNodes[i-1]),local(inside.pathNodes[i]),room.polygon,[]),'the approach remains inside 12-16');
  const landing=s.manifest.outdoor.nodes.find(n=>n.id==='b12-entry-landing');
  assert.deepEqual(data.navigation.nodes.find(n=>n.id===door).overviewPosition,landing.position);
  assert.equal(s.manifest.outdoor.links.filter(e=>e.from===landing.id&&e.to===door).length,1);
  for(const approach of ['b12-ground-junction','bridge-b12-entry-stairs']) {
    const outside=`campus/outdoor/${approach}`;
    for(const [a,b]of [[outside,'b12/f1/room-16'],['b12/f1/room-16',outside]]) {
      const route=finder.findPath(a,b);assert.ok(route);
      assert.ok(route.pathNodes.some(n=>n.id===door));
      assert.ok(route.pathNodes.some(n=>n.id==='campus/outdoor/b12-entry-landing'));
      assert.equal(route.verticalMovements.stairs,1);
      assert.equal(finder.findPath(a,b,'accessible'),null);
    }
  }
});
