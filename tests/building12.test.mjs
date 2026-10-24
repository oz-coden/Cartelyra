import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {readData} from '../scripts/read-data.mjs';
import {compileCampus} from '../.checks/data/compile.js';
import {validateSources} from '../.checks/data/validate.js';
import {auditGeometry} from '../.checks/data/audit.js';
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
