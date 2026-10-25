import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {createServer} from 'vite';
import * as THREE from 'three';
import {readData} from '../scripts/read-data.mjs';
import {compileCampus} from '../.checks/data/compile.js';
import {validateSources} from '../.checks/data/validate.js';
import {auditGeometry} from '../.checks/data/audit.js';
import {pointInPolygon} from '../.checks/data/geometry.js';
import {buildingCatalog,placeIndex,searchPlaces} from '../.checks/data/places.js';
import {LocationState} from '../.checks/ui/LocationState.js';
import {FloorMap} from '../.checks/ui/FloorMap.js';
const s=await readData(),data=compileCampus(s.manifest,s.buildings,s.floors),building=data.buildings.find(b=>b.id==='b15');
const floors=s.floors.filter(f=>f.buildingId==='b15'),places=placeIndex(data).filter(p=>p.buildingId==='b15');
const validate=x=>validateSources(x.manifest,x.buildings,x.floors,x.sources,x.overview);
async function dom(){const d=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));globalThis.document=d.document;globalThis.window=d.window;return d;}

test('Building 15 has named rooms, public-facing facilities and floor-specific central openings',()=>{
  assert.deepEqual(validate(s),[]);assert.deepEqual(auditGeometry(floors),[]);
  assert.deepEqual(building.floors.map(f=>[f.label,f.rooms.length]),[['1F',12],['2F',7],['3F',5],['4F',8]]);
  assert.deepEqual(floors.map(f=>f.features.filter(x=>x.type==='restroom').length),[2,5,0,2]);
  assert.deepEqual(floors.map(f=>f.features.filter(x=>x.type==='elevator').length),[1,1,1,1]);
  for(const [level,male,female]of[[1,'wc-male','wc-female'],[2,'wc-east-male','wc-east-female']]){
    const f=floors.find(f=>f.level===level),a=f.features.find(x=>x.id===male),b=f.features.find(x=>x.id===female);
    assert.equal(a.restroomType,'male');assert.equal(b.restroomType,'female');
    assert.ok(Math.max(...a.polygon.map(p=>p[1]))<=Math.min(...b.polygon.map(p=>p[1])));
    assert.equal(a.polygon[0][0],b.polygon[0][0]);
  }
  const westWcs=floors.find(f=>f.level===2).features.filter(x=>x.type==='restroom'&&x.id.startsWith('wc-west-'));
  assert.equal(westWcs.filter(x=>x.restroomType==='all-gender').length,2);
  assert.equal(westWcs.filter(x=>x.restroomType==='multipurpose').length,1);
  assert.equal(searchPlaces(places,'ラーニングHive')[0].id,'15-f1-learning-hive');
  assert.equal(searchPlaces(places,'総合カウンター')[0].id,'15-f2-main-counter');
  assert.equal(searchPlaces(places,'サイレントルーム')[0].id,'15-f4-silent');
  assert.equal(places.filter(p=>p.name.startsWith('グループワークルーム')).length,5);
  assert.ok(places.every(p=>p.nodeId&&!p.approachRoomId));
  assert.deepEqual(floors.map(f=>f.voids.length),[0,0,0,1]);
  assert.ok(pointInPolygon([60,68],floors[1].outline));
  assert.ok(!pointInPolygon([60,68],floors[2].outline));
  assert.ok(pointInPolygon([60,68],floors[3].voids[0]));
  assert.equal(s.manifest.outdoor.links.filter(e=>e.to.startsWith('b15/')).length,2);
});

test('area presentation does not grant passage permissions or relax room crossing validation',()=>{
  assert.ok(building.floors.flatMap(f=>f.rooms).filter(r=>r.spaceType==='area').every(r=>r.box.h===.25));
  assert.ok(building.floors.flatMap(f=>f.rooms).filter(r=>r.spaceType==='room').every(r=>r.box.h===4));
  const invalid=structuredClone(s);invalid.floors.find(f=>f.buildingId==='b15').rooms[0].spaceType='open';
  assert.ok(validate(invalid).some(e=>e.includes('invalid space type')));
  const crossing=structuredClone(s),f=crossing.floors.find(f=>f.buildingId==='b15'&&f.id==='f2');
  delete f.rooms.find(r=>r.id==='15-f2-atrium').passThrough;
  f.navigation.nodes.push({id:'a',name:'A',position:[26,70],type:'corridor'},{id:'b',name:'B',position:[70,70],type:'corridor'});
  f.navigation.edges.push({from:'a',to:'b',type:'walk',verification:'inferred',isIndoor:true,isAccessible:true,routingCost:1,cover:'indoor'});
  assert.ok(validate(crossing).some(e=>e.includes('Edge crosses room, void or service area')));
});

test('library areas, enclosed rooms and facilities are selectable on every floor with distinct area styling',async()=>{
  const {document,window}=await dom(),state=new LocationState(buildingCatalog(data,s.overview),data.viewGroups);state.selectBuilding('b15');
  const map=new FloorMap(document.getElementById('map-canvas'),data,s.overview);
  for(const f of floors){
    state.selectFloor(f.level);map.setLocation(state.building,state.floor,state.scope);
    assert.match(document.getElementById('map-legend').textContent,/利用エリア/);
    assert.equal(document.querySelectorAll('.map-void').length,f.voids.length);
    for(const r of f.rooms){const el=document.querySelector(`[data-place="${r.id}"]`);assert.ok(el);assert.equal(el.classList.contains('map-open-area'),r.spaceType==='area');}
    for(const p of places.filter(p=>p.floorLevel===f.level)){
      let selected;map.onPlaceSelect=p=>selected=p;
      const el=document.querySelector(`[data-place="${p.id}"]`);assert.ok(el,p.id);el.dispatchEvent(new window.Event('click'));assert.equal(selected.id,p.id);
    }
  }
});

test('3D areas stay low while the 2F atrium has a floor and the 3F notch and 4F void have none',async()=>{
  const {window}=await dom();window.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},beginPath(){},roundRect(){},fill(){},stroke(){},fillText(){}});
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  try{
    const {BuildingRenderer}=await server.ssrLoadModule('/src/scene/BuildingRenderer.ts');
    const renderer=new BuildingRenderer({...data,buildings:[building],navigation:{nodes:[],edges:[]}});
    renderer.rootGroup.updateMatrixWorld(true);
    for(const [id,height]of[['15-f1-learning-hive',.25],['15-f1-group-a',4],['15-f4-silent',4]]){
      const mesh=renderer.roomMeshRecords.get(id).mesh;mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;
      assert.ok(Math.abs(b.max.y-b.min.y-height)<1e-6);
    }
    for(const [floor,x,z,present]of[[2,60,68,true],[3,60,68,false],[4,60,68,false],[3,60,96,false],[4,60,96,true]]){
      const slab=renderer.floorGroups.get(`b15_f${floor}`).children[0].children[0];
      const ray=new THREE.Raycaster(new THREE.Vector3(building.origin[0]+x,100,building.origin[2]+z),new THREE.Vector3(0,-1,0));
      assert.equal(ray.intersectObject(slab).length>0,present,`floor ${floor} at ${x},${z}`);
    }
  }finally{await server.close();}
});
