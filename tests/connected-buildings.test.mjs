import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {createServer} from 'vite';
import * as THREE from 'three';
import {connectedCampus} from './fixtures/connected-campus.mjs';
import {compileCampus} from '../.checks/data/compile.js';
import {validateSources} from '../.checks/data/validate.js';
import {auditConnections} from '../.checks/data/audit.js';
import {buildingCatalog} from '../.checks/data/places.js';
import {LocationState} from '../.checks/ui/LocationState.js';
import {FloorMap} from '../.checks/ui/FloorMap.js';
import {AStarPathfinder} from '../.checks/pathfinding/AStar.js';
const compile=s=>compileCampus(s.manifest,s.buildings,s.floors);
const validate=s=>validateSources(s.manifest,s.buildings,s.floors,s.sources,s.overview);

async function dom(){
  const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  globalThis.document=document;globalThis.window=window;globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,
    get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},
    set(value){for(const o of this.options)o.toggleAttribute('selected',o.value===value);}});
  window.HTMLCanvasElement.prototype.getContext=()=>({beginPath(){},roundRect(){},fill(){},stroke(){},fillText(){},fillRect(){},createLinearGradient(){return{addColorStop(){}};}});
  document.getElementById('allow-inferred').checked=true;
  return{document,window};
}

test('connected display levels retain distinct building floor numbers and permit individual building views',()=>{
  const s=connectedCampus();assert.deepEqual(validate(s),[]);
  const data=compile(s),state=new LocationState(buildingCatalog(data,s.overview),data.viewGroups);
  assert.equal(state.scope.key,'connected');assert.equal(state.floorLevel,2);assert.equal(state.scope.floors.length,3);
  state.selectBuilding('b');assert.equal(state.floorLevel,1);assert.equal(state.groupLevel.id,'lower');
  state.selectGroupLevel('upper');assert.equal(state.floorLevel,2);assert.equal(state.scope.levelId,'upper');
  state.selectBuilding('c');state.selectFloor(-1);assert.equal(state.scope.levelId,'lower');
  state.grouped=false;assert.equal(state.scope.key,'c');assert.equal(state.scope.floors.length,1);
  state.grouped=true;assert.equal(state.scope.key,'connected');
  const r=new AStarPathfinder(data).findPath('a/lower/room','c/lower/room');
  assert.ok(r);assert.equal(r.floorChanges,0);assert.equal(r.verticalMovements.unmeasured,0);
  assert.ok(r.steps.some(s=>s.instruction.includes('屋根付き連絡通路')));
  assert.ok(r.steps.some(s=>s.instruction.includes('B1')));
  assert.ok(!r.steps.some(s=>/undefined|NaN/.test(s.instruction)));
});

test('group membership cannot invent a route, and incomplete mappings or ambiguous groups are rejected',()=>{
  const original=connectedCampus();
  const check=(change,pattern)=>{const s=structuredClone(original);change(s);const errors=validate(s);assert.ok(errors.some(e=>pattern.test(e)),errors.join('\n'));};
  check(s=>s.manifest.viewGroups[0].levels[0].floors.push({buildingId:'a',floorId:'lower'}),/Duplicate.*floor assignment/);
  check(s=>s.manifest.viewGroups[0].levels.pop(),/missing floor assignment/);
  check(s=>s.manifest.viewGroups[0].levels[0].floors[0].floorId='missing',/Unknown.*floor/);
  check(s=>s.manifest.viewGroups.push({...s.manifest.viewGroups[0],id:'other'}),/multiple view groups/);
  const closed=structuredClone(original);closed.manifest.connections=closed.manifest.connections.filter(e=>!e.from.startsWith('b/'));
  const data=compile(closed);
  assert.equal(new AStarPathfinder(data).findPath('a/lower/room','c/lower/room'),null);
  assert.ok(auditConnections(data).some(f=>f.code==='view-group-disconnected'));
  const heights=structuredClone(original);heights.buildings[1].origin[1]=4;
  assert.ok(auditConnections(compile(heights)).some(f=>f.code==='view-level-height'));
});

test('group SVG composes floor transforms, connected route segments and foreground shape outlines',async()=>{
  const {document,window}=await dom(),s=connectedCampus();
  // A nonzero rotation verifies that both the shapes and their separate outlines use the same transform.
  s.buildings[0].rotation=.25;
  const data=compile(s);
  const state=new LocationState(buildingCatalog(data,s.overview),data.viewGroups);
  const map=new FloorMap(document.getElementById('map-canvas'),data,s.overview);
  map.setLocation(state.building,state.floor,state.scope);
  assert.equal(document.querySelectorAll('.map-floor').length,3);
  assert.equal(document.querySelectorAll('.map-connection').length,2);
  map.selectPlace('a-0');
  const source=document.querySelector('[data-place="a-0"] polygon');
  const outline=document.querySelector('.map-selection-outline');
  assert.equal(outline.getAttribute('points'),source.getAttribute('points'));
  assert.equal(outline.parentElement.getAttribute('transform'),source.closest('.map-floor').getAttribute('transform'));
  assert.equal(document.querySelector('#map-canvas svg').lastElementChild.getAttribute('class'),'map-emphasis');
  const second=document.querySelector('[data-place="b-0"]');second.dispatchEvent(new window.Event('focus'));
  assert.ok(document.querySelector('.map-focus-outline'));assert.ok(document.querySelector('.map-selection-outline'));
  second.dispatchEvent(new window.Event('blur'));assert.equal(document.querySelector('.map-focus-outline'),null);
  map.setRoute(new AStarPathfinder(data).findPath('a/lower/room','c/lower/room'));
  assert.ok(document.querySelectorAll('.map-route').length>=2);
  map.selectPlace(null);assert.equal(document.querySelector('.map-selection-outline'),null);
});

test('the application keeps grouped floors, endpoints, camera and exploded connectors coherent',async()=>{
  const {document,window}=await dom(),s=connectedCampus(),data=compile(s);
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  try{
    const [{UniviewApp},{ThreeView}]=await Promise.all([server.ssrLoadModule('/src/main.ts'),server.ssrLoadModule('/src/scene/ThreeView.ts')]);
    const canvas=document.createElement('canvas');canvas.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:700});
    const host={scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(45,1000/700,.1,1500),renderer:{domElement:canvas},controls:{maxDistance:450},moves:0,
      setActive(){},setDarkTheme(){},resize(){},flyTo(target,position){this.moves++;this.camera.position.copy(position);this.camera.lookAt(target);this.camera.updateMatrixWorld(true);}};
    let view;new UniviewApp(async(data,container)=>{container.append(canvas);view=new ThreeView(data,container,host);return view;},data,s.overview);
    assert.equal(document.querySelectorAll('.map-floor').length,3);
    assert.ok(!document.getElementById('group-display-option').classList.contains('hidden'));
    const select=id=>document.querySelector(`[data-place="${id}"]`).dispatchEvent(new window.Event('click',{bubbles:true}));
    select('a-0');document.getElementById('btn-tooltip-set-start').click();select('c-0');document.getElementById('btn-tooltip-set-dest').click();
    assert.equal(document.getElementById('building-select').value,'c');
    assert.equal(document.getElementById('summary-vertical').textContent,'階移動なし');
    const endpoint=document.getElementById('input-start').value;
    const svg=document.querySelector('#map-canvas svg');document.getElementById('map-zoom-in').click();const box=svg.getAttribute('viewBox');
    select('b-0');assert.equal(svg.getAttribute('viewBox'),box,'selection within the group retains the map view');
    const grouped=document.getElementById('show-connected');grouped.checked=false;grouped.dispatchEvent(new window.Event('change'));
    assert.equal(document.querySelectorAll('.map-floor').length,1);assert.equal(document.getElementById('input-start').value,endpoint);
    grouped.checked=true;grouped.dispatchEvent(new window.Event('change'));
    document.getElementById('btn-view-3d').click();await new Promise(r=>setImmediate(r));assert.ok(view);
    const floorGroups=()=>{const a=[];host.scene.traverse(o=>{if(o.userData.type==='floor')a.push(o);});return a;};
    assert.equal(floorGroups().filter(g=>g.visible).length,6);
    const connections=host.scene.children.find(o=>o.userData.type==='building-connections');assert.equal(connections.children.length,4);
    const search=(query)=>{const input=document.getElementById('input-dest');input.value=query;input.dispatchEvent(new window.Event('input'));document.querySelector('#suggestions-dest button').click();};
    const before=host.moves;search('a-0');assert.equal(host.moves,before,'search inside the group retains the camera');
    const gap=document.getElementById('explode-slider');gap.value='80';gap.dispatchEvent(new window.Event('input'));
    for(const id of ['a','b','c']){
      const upper=floorGroups().find(g=>g.userData.buildingId===id&&g.userData.stackIndex===1);
      assert.ok(Math.abs(upper.position.y-15.2)<1e-8,'group members use a common explode index');
    }
    assert.equal(connections.children.length,4);
    const all=document.getElementById('show-all-floors');all.checked=false;all.dispatchEvent(new window.Event('change'));
    assert.equal(floorGroups().filter(g=>g.visible).length,3);assert.equal(connections.children.length,2);
    assert.ok(view.getPlaceAnchor('a-0'));
    assert.equal(view.getPlaceAnchor('a-1'),null,'hidden group levels cannot anchor a selection bubble');
    const upper=document.querySelector('[data-group-level="upper"]');upper.click();
    assert.equal(document.getElementById('building-select').value,'a');
    assert.equal(document.getElementById('input-start').value,endpoint);
    assert.equal(floorGroups().filter(g=>g.visible).length,3);
    assert.equal(view.getPlaceAnchor('a-0'),null);
    assert.ok(view.getPlaceAnchor('a-1'));
  }finally{await server.close();}
});

test('a connection to another display level has a transfer marker even at a corridor node',async()=>{
  const {document}=await dom(),s=connectedCampus();
  s.manifest.connections=[{from:'a/lower/right',to:'b/upper/left',type:'bridge',cover:'covered',isIndoor:false,
    isAccessible:false,verification:'inferred',routingCost:2,floorChanges:1}];
  const data=compile(s),state=new LocationState(buildingCatalog(data,s.overview),data.viewGroups);
  const map=new FloorMap(document.getElementById('map-canvas'),data,s.overview);
  map.setLocation(state.building,state.floor,state.scope);
  const route=new AStarPathfinder(data).findPath('a/lower/room','b/upper/room');assert.ok(route);
  map.setRoute(route);
  let transfer=document.querySelector('.map-route-marker.transfer');assert.ok(transfer);
  assert.equal(transfer.getAttribute('cx'),'20');assert.equal(transfer.getAttribute('cy'),'10');
  state.selectGroupLevel('upper');map.setLocation(state.building,state.floor,state.scope);
  transfer=document.querySelector('.map-route-marker.transfer');assert.ok(transfer);
  assert.equal(transfer.getAttribute('cx'),'28');assert.equal(transfer.getAttribute('cy'),'10');
});
