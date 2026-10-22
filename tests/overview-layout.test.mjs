import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {readData} from '../scripts/read-data.mjs';
import {compileCampus} from '../.checks/data/compile.js';
import {validateSources} from '../.checks/data/validate.js';
import {segmentPolygonClearance,pointInInterior} from '../.checks/data/geometry.js';
import {OVERVIEW_ROAD_WIDTH,OVERVIEW_ROAD_GAP,overviewBuildingLabel,overviewPoints} from '../.checks/data/overview-layout.js';
import {FloorMap} from '../.checks/ui/FloorMap.js';
const source=await readData(),data=compileCampus(source.manifest,source.buildings,source.floors);
const validate=s=>validateSources(s.manifest,s.buildings,s.floors,s.sources,s.overview);
const rect=[[0,0],[4,0],[4,3],[0,3]];

test('road clearance catches crossing, containment, contact and narrow gaps without relying on sampled endpoints',()=>{
  for(const [a,b]of[[[-1,1],[5,1]],[[1,1],[2,2]],[[-1,0],[5,0]],[[4,3],[5,4]]])assert.equal(segmentPolygonClearance(a,b,rect),0);
  assert.equal(segmentPolygonClearance([-1,-1],[5,-1],rect),1);
  assert.equal(segmentPolygonClearance([5,4],[6,5],rect),Math.SQRT2);
  assert.equal(segmentPolygonClearance([6,5],[5,4],rect),Math.SQRT2);
  assert.equal(segmentPolygonClearance([2,-.25],[2,-.25],rect),.25);
});

test('all campus road strokes leave visible space around every building, including Buildings 5, 11 and 14',()=>{
  assert.deepEqual(validate(source),[]);
  for(const road of source.overview.contextRoads)for(let i=1;i<road.points.length;i++)for(const b of source.overview.buildings){
    const gap=segmentPolygonClearance(road.points[i-1],road.points[i],b.polygon);
    assert.ok(gap+1e-7>=OVERVIEW_ROAD_WIDTH/2+OVERVIEW_ROAD_GAP,`${road.id}: ${b.id} segment ${i}`);
  }
  const bad=structuredClone(source),road=bad.overview.contextRoads.find(r=>r.id==='east-perimeter');
  road.points=[[83.125,67.5],[75.625,73]];
  assert.ok(validate(bad).some(e=>e.includes('east-perimeter -> b14')));
  road.points=[[50,7.8],[80,15.3]];
  assert.ok(validate(bad).some(e=>e.includes('east-perimeter -> b5')));
});

test('clearance validation includes the visible stroke width and does not just reject actual intersections',()=>{
  const changed=structuredClone(source);
  changed.overview.contextRoads=[{id:'near-building',name:'Fixture',sourceId:'gsi-campus-aerial',points:[[-1,-.8],[5,-.8]]}];
  changed.overview.buildings=[{id:'fixture',name:'Fixture',polygon:rect}];
  assert.ok(validate(changed).some(e=>e.includes('lacks drawing clearance near-building -> fixture')));
  changed.overview.contextRoads[0].points=[[-1,-2],[5,-2]];
  assert.ok(!validate(changed).some(e=>e.includes('Context road overlaps')));
});

test('the central road follows each named building gap and joins the north and south roads at explicit visual junctions',()=>{
  const roads=source.overview.contextRoads,road=roads.find(r=>r.id==='central-campus');assert.ok(road);
  const xAt=y=>{const i=road.points.findIndex((p,i)=>i&&p[1]>=y&&road.points[i-1][1]<=y);assert.ok(i>0);const a=road.points[i-1],b=road.points[i];return a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]);};
  for(const [y,min,max]of[[14,43.75,48],[23,50.5,54.25],[30,50.5,55],[42,50.625,54.625]])assert.ok(xAt(y)>min&&xAt(y)<max,`gap at ${y}`);
  for(const [p,id]of[[road.points[0],'north-campus'],[road.points.at(-1),'south-campus']])assert.ok(roads.find(r=>r.id===id).points.some(q=>q[0]===p[0]&&q[1]===p[1]));
});

test('overview labels follow slender diagonal footprints, wrap narrow vertical footprints, and stay inside concave footprints',()=>{
  for(const b of source.overview.buildings){const label=overviewBuildingLabel(b.polygon,b.name);assert.ok(pointInInterior(label.position,b.polygon));assert.ok(label.fontSize>0&&label.fontSize<=2.1);assert.ok(Math.abs(label.angle)<=50);}
  for(const id of ['b5','b7','b9','b11','b14','b28']){const b=source.overview.buildings.find(b=>b.id===id);assert.ok(Math.abs(overviewBuildingLabel(b.polygon,b.name).angle)>1,id);}
  for(const id of ['b8','b20']){const b=source.overview.buildings.find(b=>b.id===id);const label=overviewBuildingLabel(b.polygon,b.name);assert.equal(label.angle,0,id);assert.deepEqual(label.lines,[id.slice(1),'号館']);}
});

test('campus fit includes road extents and SVG uses the same road width as the clearance validator',async()=>{
  const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  globalThis.document=document;globalThis.window=window;
  const map=new FloorMap(document.getElementById('map-canvas'),data,source.overview);map.showOverview(true);map.resetView();
  const [x,y,w,h]=document.querySelector('#map-canvas svg').getAttribute('viewBox').split(' ').map(Number);
  for(const [px,py]of overviewPoints(source.overview))assert.ok(px>=x&&px<=x+w&&py>=y&&py<=y+h);
  for(const el of document.querySelectorAll('.map-context-road'))assert.equal(Number(el.getAttribute('stroke-width')),OVERVIEW_ROAD_WIDTH);
  const labels=[...document.querySelectorAll('.map-campus-building text')],label=labels.find(e=>e.textContent==='5号館');assert.match(label.getAttribute('transform'),/^rotate\((?!0 )/);
  assert.equal(labels.find(e=>e.textContent==='8号館').querySelectorAll('tspan').length,2);
});
