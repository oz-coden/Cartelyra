import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {readData} from '../scripts/read-data.mjs';
import {compileCampus} from '../.checks/data/compile.js';
import {validateSources} from '../.checks/data/validate.js';
import {placeIndex} from '../.checks/data/places.js';
import {AStarPathfinder} from '../.checks/pathfinding/AStar.js';
import {FloorMap} from '../.checks/ui/FloorMap.js';
import {LocationState} from '../.checks/ui/LocationState.js';
import {buildingCatalog} from '../.checks/data/places.js';
import {connectedCampus} from './fixtures/connected-campus.mjs';
import {surveyNotes} from './fixtures/survey-notes.mjs';
const s=await readData(),data=compileCampus(s.manifest,s.buildings,s.floors),finder=new AStarPathfinder(data);

function minimumStairs(graph,start,allowInferred=true){
  const edges=graph.navigation.edges.filter(e=>!e.blocked&&e.access!=='staff'&&(allowInferred||e.verification==='verified'));
  const distance=new Map([[start,0]]),queue=[start],adj=new Map();
  for(const e of edges){for(const [a,b]of [[e.from,e.to],...(e.bidirectional===false?[]:[[e.to,e.from]])]){
    if(!adj.has(a))adj.set(a,[]);adj.get(a).push([b,Number(e.type==='stairs')]);
  }}
  for(let i=0;i<queue.length;i++)for(const [b,cost]of adj.get(queue[i])??[]){const next=distance.get(queue[i])+cost;
    if(next<(distance.get(b)??Infinity)){distance.set(b,next);queue.push(b);}}
  return distance;
}

test('fewest-stair alternatives minimize stair segments independently of distance and remain subject to closures and verification',()=>{
  const rooms=placeIndex(data).filter(p=>p.kind==='room'&&p.nodeId);
  for(const start of ['b5/f2/room-201','b7/f2/room-21','b23/f1/room-101','b19/f1/room-101']){
    const minimum=minimumStairs(data,start);
    for(const goal of rooms.filter((_,i)=>i%31===0)){
      const route=finder.findPath(start,goal.nodeId,'shortest',true,'fewest-stairs');
      assert.equal(!!route,minimum.has(goal.nodeId));
      if(route)assert.equal(route.verticalMovements.stairs,minimum.get(goal.nodeId),`${start} -> ${goal.id}`);
    }
    assert.deepEqual(finder.findPath(start,'b23/f1/room-101','shortest',false,'fewest-stairs'),start==='b23/f1/room-101'?finder.findPath(start,start,'shortest',false):null);
  }
  const blocked=structuredClone(data);blocked.navigation.edges.filter(e=>e.to==='b5/f2/entrance-side').forEach(e=>e.blocked=true);
  assert.equal(new AStarPathfinder(blocked).findPath('b5/f2/room-201','b23/f1/room-101','shortest',true,'fewest-stairs'),null);
});

test('different floor labels and stack origins share routing levels while physical floor counts remain unchanged',()=>{
  const source=connectedCampus();for(const f of source.floors.filter(f=>f.buildingId==='a'))f.stackIndex++;
  assert.deepEqual(validateSources(source.manifest,source.buildings,source.floors,source.sources,source.overview),[]);
  const graph=compileCampus(source.manifest,source.buildings,source.floors);
  graph.navigation.nodes.push({id:'outside',name:'Outside',type:'outdoor',position:[0,0,0]});
  for(const [from,to]of [['a/lower/room','outside'],['outside','b/upper/room']])graph.navigation.edges.push({from,to,type:'stairs',isIndoor:false,isAccessible:false,routingCost:100,verification:'verified'});
  const pf=new AStarPathfinder(graph);
  for(const [a,b]of [['a/lower/room','b/upper/room'],['b/upper/room','a/lower/room']]){
    const route=pf.findPath(a,b);assert.ok(route.pathNodes.every(n=>n.id!=='outside'));
    assert.equal(route.floorChanges,1);assert.equal(route.verticalMovements.unmeasured,0);
  }
  const bad=structuredClone(source);bad.manifest.viewGroups[0].levels.reverse();
  assert.ok(validateSources(bad.manifest,bad.buildings,bad.floors,bad.sources,bad.overview).some(x=>x.includes('floor order')));
});

test('concise directions preserve geometry, transitions and endpoints without exposing routing junctions',()=>{
  for(const [a,b]of [['b7/f2/room-21','b8/f2/room-20'],['b8/f2/room-20','b7/f2/room-21']]){
    const route=finder.findPath(a,b);assert.ok(route.steps.length<15);
    assert.ok(route.steps.every(x=>!x.instruction.includes('通路の分岐')));
    assert.equal(route.steps[0].nodeId,a);assert.equal(route.steps.at(-1).nodeId,b);
    assert.ok(route.pathNodes.length>route.steps.length);
    assert.equal(route.steps.filter(x=>x.edgeType==='stairs').length,route.verticalMovements.stairs);
    assert.ok(route.steps.some(x=>x.buildingId===undefined));
    assert.deepEqual(route.steps.map(x=>x.stepNumber),route.steps.map((_,i)=>i+1));
  }
});

test('outdoor compaction retains authored courtyard directions in both travel directions',()=>{
  for(const [a,b,instruction] of [
    ['b7/f2/room-21','b8/f2/room-20','7・8号館間の通路から中庭側へ'],
    ['b8/f2/room-20','b7/f2/room-21','中庭から8号館沿いの通路を北へ'],
  ]) {
    const route=finder.findPath(a,b);
    assert.ok(route.steps.some(step=>step.instruction===instruction),instruction);
    for(let i=1;i<route.pathNodes.length;i++) {
      const from=route.pathNodes[i-1].id,to=route.pathNodes[i].id;
      const edge=data.navigation.edges.find(e=>e.from===from&&e.to===to||e.to===from&&e.from===to);
      const authored=edge.from===from?edge.instruction:edge.reverseInstruction;
      if(authored)assert.ok(route.steps.some(step=>step.instruction===authored),authored);
    }
  }
});

test('straight outdoor runs compact only across edges without authored instructions',()=>{
  const graph={campusName:'Outdoor',coordinateUnit:'meters',buildings:[],navigation:{
    nodes:['a','b','c','d','e'].map((id,i)=>({id,name:id,type:'outdoor',outdoorLayer:'ground',position:[i*10,0,0]})),
    edges:[['a','b'],['b','c'],['c','d'],['d','e']].map(([from,to])=>({from,to,type:'outdoor',distance:10,isIndoor:false,isAccessible:true,verification:'verified'})),
  }};
  for(const direction of [['a','e'],['e','a']]) {
    const route=new AStarPathfinder(graph).findPath(...direction);
    assert.equal(route.steps.length,2);
    assert.equal(route.steps.at(-1).distance,40);
  }
  graph.navigation.edges[1].instruction='Keep to the north path';
  graph.navigation.edges[1].reverseInstruction='Return along the north path';
  for(const [a,b,instruction] of [['a','e','Keep to the north path'],['e','a','Return along the north path']]) {
    const route=new AStarPathfinder(graph).findPath(a,b);
    const authored=route.steps.find(step=>step.instruction===instruction);
    assert.ok(authored);
    assert.equal(authored.distance,10,'the instruction retains its own segment distance');
    assert.equal(route.steps.reduce((total,step)=>total+step.distance,0),40);
    assert.equal(route.pathNodes.length,5);
  }
});

test('product descriptions stay short and survey assumptions remain in documentation',async()=>{
  for(const f of s.floors){assert.equal(f.notes.length,0);for(const x of [...f.rooms,...f.features]){
    assert.ok((x.description?.length??0)<=30,x.id);
    assert.doesNotMatch(x.description??'',/暫定|現地|推定|原図|代表点|描画|登録/);
  }}
  for(const fact of ['5-312','5-313','1-B108','1-308-1','23-B203','階内段差','左側通路の屋外出入口','2023年','2024年','6-308'])assert.ok(surveyNotes.includes(fact),fact);
  const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));globalThis.document=document;globalThis.window=window;
  const state=new LocationState(buildingCatalog(data,s.overview),data.viewGroups);state.selectBuilding('b7');state.selectGroupLevel('f2');
  const map=new FloorMap(document.getElementById('map-canvas'),data,s.overview);map.setLocation(state.building,state.floor,state.scope);
  assert.ok(document.getElementById('map-caption').textContent.length<40);
  assert.equal(document.querySelector('.data-notice a').getAttribute('href'),'https://github.com/oz-coden/Cartelyra/blob/main/docs/survey-notes.md');
});

test('measured corridor distances remain separate from stairs when instructions are condensed',()=>{
  const graph={campusName:'Measured',coordinateUnit:'meters',buildings:[{id:'test',floors:[{level:1,stackIndex:0,label:'1F'},{level:2,stackIndex:1,label:'2F'}]}],navigation:{
    nodes:[['a','A',1],['junction','通路の分岐',1],['stair','階段',2],['b','B',2]].map(([id,name,floor])=>({id,name,floor,buildingId:'test',type:'corridor',position:[0,0,0]})),
    edges:[['a','junction','walk',10],['junction','stair','stairs',3],['stair','b','walk',2]].map(([from,to,type,distance])=>({from,to,type,distance,isIndoor:true,isAccessible:type!=='stairs',verification:'verified'}))}};
  const route=new AStarPathfinder(graph).findPath('a','b');
  assert.equal(route.steps.find(s=>s.edgeType==='stairs').distance,3);
  assert.equal(route.steps.reduce((n,s)=>n+s.distance,0),15);
});
