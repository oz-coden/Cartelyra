import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {readData} from '../scripts/read-data.mjs';
import {compileCampus} from '../.checks/data/compile.js';
import {validateSources} from '../.checks/data/validate.js';
import {auditGeometry,auditConnections,minimumFloorChanges} from '../.checks/data/audit.js';
import {buildingCatalog,placeIndex,searchPlaces} from '../.checks/data/places.js';
import {polygonOverlapArea,localToWorld,segmentIsWalkable} from '../.checks/data/geometry.js';
import {LocationState} from '../.checks/ui/LocationState.js';
import {FloorMap} from '../.checks/ui/FloorMap.js';
import {AStarPathfinder} from '../.checks/pathfinding/AStar.js';
const s=await readData(),data=compileCampus(s.manifest,s.buildings,s.floors),ids=['b7','b8','b9','b10'];
const floors=s.floors.filter(f=>ids.includes(f.buildingId)),places=placeIndex(data).filter(p=>ids.includes(p.buildingId));
const finder=new AStarPathfinder(data),group=data.viewGroups.find(g=>g.id==='b7-b10');
const validate=s=>validateSources(s.manifest,s.buildings,s.floors,s.sources,s.overview);

test('Buildings 7–10 preserve observed floor numbers and room identifiers with photo-priority identifiers and historical general-use labels',()=>{
  assert.deepEqual(validate(s),[]);assert.equal(group.status,'ready');assert.equal(floors.length,22);
  assert.deepEqual(group.levels.map(l=>l.label),['1F','2F','3F','4F','5F','6F']);
  assert.equal(group.levels.find(l=>l.id==='f5').floors.length,3);
  assert.deepEqual(data.buildings.find(b=>b.id==='b10').floors.map(f=>f.level),[1,2,3,4]);
  assert.deepEqual(ids.map(id=>places.filter(p=>p.buildingId===id&&p.kind==='room').length),[25,50,71,24]);
  for(const f of floors){assert.equal(f.stackIndex,f.level-1);assert.ok(f.rooms.every(r=>r.name.startsWith(r.id)));
    assert.equal(f.voids.length,['b8','b10'].includes(f.buildingId)&&f.level===3?1:0);}
  for(const id of ['7-62A','7-61A','8-42-A','8-51C','8-66A','8-68A','9-16B','9-314A','9-310','9-60','10-114'])
    assert.ok(places.find(p=>p.id===id),id);
  for(const id of ['9-48','9-55','9-57','8-55'])assert.ok(!places.some(p=>p.id===id),id);
  const duplicate=searchPlaces(places,'8-54').filter(p=>p.kind==='room');assert.equal(duplicate.length,1);
  assert.equal(duplicate[0].id,'8-54');
  assert.deepEqual(auditGeometry(floors).map(f=>[f.code,f.buildingId,f.floorId]),[['floor-components','b9','f1']]);
  for(const level of group.levels){
    const members=level.floors.map(ref=>{const b=data.buildings.find(b=>b.id===ref.buildingId),f=b.floors.find(f=>f.id===ref.floorId);
      return f.outline.map(p=>{const w=localToWorld(b,p,0);return[w[0],w[2]];});});
    for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++)assert.equal(polygonOverlapArea(members[i],members[j]),0,`${level.id}: distinct wings must not overlap`);
  }
});

test('every group place connects to the Building 8 elevator reference point while remaining inferred',()=>{
  for(const p of places){assert.ok(p.nodeId,p.id);
    for(const mode of ['shortest','accessible','indoor','stairs']){
      const r=finder.findPath('b8/f1/ev-west',p.nodeId,mode);
      if(mode==='accessible'&&p.buildingId==='b7'&&p.floorLevel===2){assert.equal(r,null,p.id);continue;}
      assert.ok(r,`${p.id}: ${mode}`);
      assert.ok(r.pathNodes.every(n=>ids.includes(n.buildingId)));
      assert.equal(r.floorChanges,p.floorLevel-1,`${p.id}: floor count`);
      if(mode==='accessible')assert.ok(r.steps.every(s=>s.edgeType!=='stairs'));
    }
    if(p.nodeId!=='b8/f1/ev-west')assert.equal(finder.findPath('b8/f1/ev-west',p.nodeId,'shortest',false),null);
  }
  assert.ok(finder.findPath('b7/f1/room-14','campus/outdoor/west-gate'));
  assert.equal(finder.findPath('b7/f1/room-14','campus/outdoor/west-gate','accessible'),null);
  assert.equal(s.manifest.outdoor.links.filter(l=>ids.includes(l.to.split('/')[0])).length,6);
  assert.ok(!auditConnections(data).some(f=>f.code==='view-group-disconnected'&&f.buildingId==='b7'));
});

test('same-floor room pairs across all four wings avoid unnecessary stairs or floor transfers',()=>{
  let checked=0;
  for(const level of [1,2,3,4,5,6]){
    const rooms=places.filter(p=>p.kind==='room'&&p.floorLevel===level);
    for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){
      const r=finder.findPath(rooms[i].nodeId,rooms[j].nodeId,'accessible');
      if(level===2&&(rooms[i].buildingId==='b7')!==(rooms[j].buildingId==='b7')){assert.equal(r,null);continue;}
      assert.ok(r,`${rooms[i].id} -> ${rooms[j].id}`);
      assert.equal(r.floorChanges,0);assert.equal(r.verticalMovements.unmeasured,0);checked++;
    }
  }
  assert.equal(checked,2322);
});

test('the provisional 2F supplies adjacent EV and common stair stops without a direct 1F–3F stair shortcut',()=>{
  const r=finder.findPath('b8/f1/ev-west','b8/f3/ev-west','accessible');assert.ok(r);assert.equal(r.floorChanges,2);
  assert.equal(minimumFloorChanges(data,'b8/f1/ev-west').get('b8/f3/ev-west'),2);
  assert.ok(data.navigation.nodes.some(n=>n.buildingId==='b8'&&n.floor===2&&n.type==='elevator'));
  assert.ok(r.pathNodes.some(n=>n.id==='b8/f2/ev-west'));
  assert.ok(s.buildings.find(b=>b.id==='b8').connections.some(e=>e.from==='b8/f1/stairs-center'&&e.to==='b8/f2/stairs-center'));
  for(const b of s.buildings.filter(b=>['b7','b9','b10'].includes(b.id)))for(const e of b.connections.filter(e=>e.type==='stairs'))
    assert.ok(!e.from.includes('/f1/')&&!e.to.includes('/f1/'));
  const bad=structuredClone(s),ev=bad.buildings.find(b=>b.id==='b8').connections.find(e=>e.from==='b8/f1/ev-west');
  ev.floorChanges=2;assert.ok(validate(bad).some(e=>e.includes('conflict with floor order')));
  const stair=structuredClone(s);stair.buildings.find(b=>b.id==='b7').connections.push({
    from:'b7/f1/stairs-center',to:'b7/f3/stairs-west',type:'stairs',verification:'inferred',isIndoor:true,isAccessible:false,routingCost:1,cover:'indoor'});
  assert.ok(validate(stair).some(e=>e.includes('Vertical edge skips a floor')));
  const reversed=structuredClone(s);reversed.floors.find(f=>f.buildingId==='b8'&&f.id==='f3').stackIndex=0;
  assert.ok(validate(reversed).some(e=>e.includes('increasing stackIndex')));
});

test('same-level stairs between Buildings 7 and 10 remain explicit, directional and excluded by stair avoidance',()=>{
  for(const level of [2,3,4]){
    const a=`b7/f${level}/stairs-ten`,b=`b10/f${level}/stairs-seven`;
    const blocked=structuredClone(data);
    const bridge=blocked.navigation.edges.find(e=>e.from===`b7/f${level}/port-eight`);if(bridge)bridge.blocked=true;
    const direct=new AStarPathfinder(blocked);
    const r=direct.findPath(a,b);assert.ok(r);assert.equal(r.floorChanges,0);assert.equal(r.verticalMovements.stairs,1);
    assert.equal(r.verticalMovements.unmeasured,1);assert.match(r.steps.at(-1).instruction,/10号館側へ/);
    assert.match(direct.findPath(b,a).steps.at(-1).instruction,/7号館側へ/);
    const around=finder.findPath(a,b,'accessible');if(level===2){assert.equal(around,null);continue;}assert.ok(around);assert.equal(around.verticalMovements.stairs,0);
    assert.ok(around.pathNodes.some(n=>n.buildingId==='b8'));assert.ok(around.pathNodes.some(n=>n.buildingId==='b9'));
  }
  const bad=structuredClone(s),edge=bad.manifest.connections.find(e=>e.type==='stairs');edge.isAccessible=true;
  assert.ok(validate(bad).some(e=>e.includes('Campus stairs marked accessible')));
  edge.isAccessible=false;edge.to='b10/f3/room-31';assert.ok(validate(bad).some(e=>e.includes('Campus vertical facility mismatch')));
});

test('provisional inner rooms retain front endpoints and the numbered circulation area does not expose its service zone',()=>{
  for(const [id,front]of[['7-61A','7-61'],['8-61A','8-61'],['8-66A','8-66'],['8-67A','8-67']]){
    const p=places.find(p=>p.id===id),q=places.find(p=>p.id===front);
    assert.equal(p.approachRoomId,front);assert.equal(p.nodeId,q.nodeId);assert.match(p.description,/暫定/);
  }
  const f=floors.find(f=>f.buildingId==='b10'&&f.id==='f3');assert.equal(f.rooms.find(r=>r.id==='10-33').passThrough,true);
  assert.equal(f.voids.length,1);
  assert.ok(!f.features.some(f=>f.id==='unlabelled-center'));
  const bad=structuredClone(s),bf=bad.floors.find(f=>f.buildingId==='b10'&&f.id==='f3');
  bf.navigation.nodes.push({id:'bad-top',name:'Bad',type:'corridor',position:[30,20]},
    {id:'bad-bottom',name:'Bad',type:'corridor',position:[30,80]});
  bf.navigation.edges.push({...bf.navigation.edges[0],from:'bad-top',to:'bad-bottom'});
  assert.ok(validate(bad).some(e=>e.includes('Edge crosses room, void or service area')));
});

test('group SVG exposes six available levels, cross-wing routes and room-shaped foreground selection',async()=>{
  const{document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));globalThis.document=document;globalThis.window=window;
  const state=new LocationState(buildingCatalog(data,s.overview),data.viewGroups);state.selectBuilding('b7');
  const map=new FloorMap(document.getElementById('map-canvas'),data,s.overview);
  for(const level of group.levels){state.selectGroupLevel(level.id);map.setLocation(state.building,state.floor,state.scope);
    assert.equal(document.querySelectorAll('.map-floor').length,level.floors.length);
    const expected=places.filter(p=>p.kind==='room'&&p.floorLevel===Number(level.id.slice(1))).length;
    assert.equal(document.querySelectorAll('.map-room').length,expected);
  }
  state.selectGroupLevel('f4');map.setLocation(state.building,state.floor,state.scope);
  assert.equal(document.querySelectorAll('.map-passage[data-edge-type="stairs"]').length,1);
  const r=finder.findPath('b7/f4/room-41','b9/f4/room-411');map.setRoute(r);assert.ok(document.querySelector('.map-route'));
  map.selectPlace('10-41');const room=floors.find(f=>f.buildingId==='b10'&&f.id==='f4').rooms.find(r=>r.id==='10-41');
  assert.equal(document.querySelector('.map-selection-outline').getAttribute('points'),room.polygon.map(p=>p.join(',')).join(' '));
  assert.equal(document.querySelector('#map-canvas svg').lastElementChild.getAttribute('class'),'map-emphasis');
  state.grouped=false;map.setLocation(state.building,state.floor,state.scope);assert.equal(document.querySelectorAll('.map-floor').length,1);
});


test('1F preserves the photo order and all observed stair/WC locations under one rotation',()=>{
  const f=b=>floors.find(f=>f.buildingId===`b${b}`&&f.id==='f1');
  const center=r=>r.polygon.reduce((a,p)=>[a[0]+p[0]/r.polygon.length,a[1]+p[1]/r.polygon.length],[0,0]);
  const order=(b,ids,axis)=>{const values=ids.map(id=>center(f(b).rooms.find(r=>r.id===id))[axis]);
    assert.ok(values.every((v,i)=>i===0||v>values[i-1]),ids.join(' -> '));};
  order(9,['9-16B','9-16A','9-15','9-14','9-13','9-12','9-11'],0);
  order(10,['10-14','10-15','10-16','10-17','10-18','10-19','10-110','10-111','10-112','10-113','10-114'],1);
  order(10,['10-11','10-12','10-13'],1);order(8,['8-11','8-13','8-14','8-15'],1);
  order(7,['7-12','7-11'],1);order(7,['7-16','7-17'],1);
  assert.deepEqual([7,8,9,10].map(b=>f(b).features.filter(x=>x.type==='stairs').length),[3,4,0,3]);
  assert.deepEqual([7,8,9,10].map(b=>f(b).features.filter(x=>x.type==='restroom').length),[2,1,0,1]);
  for(const b of [7,8,9,10])for(const x of f(b).features.filter(x=>x.entrance))
    assert.ok(finder.findPath('b8/f1/ev-west',`b${b}/f1/${x.entrance}`),x.id);
});

test('9–10 share real corridor boundaries and every 7–8 upper bridge has drawing width',()=>{
  const nodes=new Map(data.navigation.nodes.map(n=>[n.id,n]));
  for(const l of [1,2,3,4]){
    const edges=data.navigation.edges.filter(e=>e.type==='bridge'&&e.from.startsWith(`b10/f${l}/port-nine`));assert.ok(edges.length);
    for(const e of edges)assert.deepEqual(nodes.get(e.from).position,nodes.get(e.to).position);
  }
  for(const l of [3,4,5,6]){
    const e=data.navigation.edges.find(e=>e.type==='bridge'&&e.from===`b7/f${l}/port-eight`);
    assert.equal(e.cover,'covered');assert.equal(e.passageWidth,6);
  }
  const bad=structuredClone(s);bad.manifest.connections.find(e=>e.passageWidth).passageWidth=0;
  assert.ok(validate(bad).some(e=>e.includes('Invalid passage drawing width')));
});


test('decimal shared-wall endpoints remain walkable after roundoff without admitting a crossing',()=>{
  const outline=[[0,1.8],[102,1.8],[102,35],[0,35]];
  assert.equal(segmentIsWalkable([2,4.6],[2,1.8],outline,[]),true);
  assert.equal(segmentIsWalkable([2,4.6],[2,1.7],outline,[]),false);
});


test('7-16 uses the corridor and 7-17 approaches through the provisional plaza without entering 7-14',()=>{
  const floor=floors.find(f=>f.buildingId==='b7'&&f.id==='f1');
  assert.ok(!floor.features.some(f=>f.id==='unlabelled-northwest'));
  assert.ok(floor.navigation.edges.filter(e=>[e.from,e.to].includes('plaza-approach')).every(e=>e.cover==='covered'&&!e.isIndoor));
  assert.ok(floor.notes.some(n=>n.includes('広場')&&n.includes('現地確認待ち')));
  for(const id of ['7-16','7-17']){
    const p=places.find(p=>p.id===id);assert.equal(p.approachRoomId,undefined);
    assert.notEqual(p.nodeId,places.find(p=>p.id==='7-14').nodeId);
    const r=finder.findPath('b10/f1/room-11',p.nodeId,'accessible');assert.ok(r);
    assert.ok(!r.pathNodes.some(n=>n.id==='b7/f1/room-14'));
    assert.equal(r.pathNodes.some(n=>n.id==='b7/f1/plaza-approach'),id==='7-17');
  }
});


test('2023 use labels remain historical and generalized while 2024 room boundaries take priority',()=>{
  assert.equal(floors.reduce((n,f)=>n+f.rooms.filter(r=>r.name!==r.id).length,0),156);
  for(const [id,name]of [['7-21','講義室'],['7-22','パソコン演習室'],['8-20','マップホール'],['10-201','学生食堂'],['10-13','卓球場'],['9-214','図書室']]){
    const p=places.find(p=>p.id===id);assert.ok(p.name.includes(name),id);assert.match(p.description,/2023.*現地確認待ち/);
  }
  for(const id of ['8-55','8-31','8-46-1','9-61','7-62-1','10-41A'])assert.ok(!places.some(p=>p.id===id),id);
  for(const id of ['8-54','8-32','8-51A','8-51C','9-60','9-313A','9-313B','7-61A'])assert.ok(places.some(p=>p.id===id),id);
  const text=JSON.stringify(floors.flatMap(f=>f.rooms));assert.ok(!/細谷浩史|松隈洋|安室知|丸山泰明|曽我部昌史|4020|4030/.test(text));
  assert.match(places.find(p=>p.id==='10-33').name,/食堂.*飲食スペース/);
  assert.equal(searchPlaces(places,'10号館 3F 食堂')[0].id,'10-33');
  assert.match(places.find(p=>p.id==='10-201').description,/2Fに食堂があることは現地情報/);
  assert.equal(searchPlaces(places,'8号館 マップホール')[0].id,'8-20');
  assert.ok(floors.filter(f=>f.level===2).every(f=>f.sourceId==='b7-b10-reference-2023'));
});
