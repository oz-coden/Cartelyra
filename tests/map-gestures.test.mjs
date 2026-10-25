import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {readData} from '../scripts/read-data.mjs';
import {compileCampus} from '../.checks/data/compile.js';
import {buildingCatalog} from '../.checks/data/places.js';
import {FloorMap} from '../.checks/ui/FloorMap.js';

const source=await readData(),data=compileCampus(source.manifest,source.buildings,source.floors);
async function setup(){
  const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  globalThis.document=document;globalThis.window=window;
  const map=new FloorMap(document.getElementById('map-canvas'),data,source.overview);
  const building=buildingCatalog(data,source.overview).find(b=>b.id==='b3');
  map.setLocation(building,building.data.floors.find(f=>f.level===1));
  const svg=document.querySelector('#map-canvas svg'),captured=new Set();
  svg.getBoundingClientRect=()=>({left:20,top:30,width:360,height:500});
  svg.setPointerCapture=id=>captured.add(id);svg.hasPointerCapture=id=>captured.has(id);svg.releasePointerCapture=id=>captured.delete(id);
  const point=(type,id,x,y,target=svg)=>{
    const event=new window.Event(type,{bubbles:true,cancelable:true});
    Object.assign(event,{pointerId:id,pointerType:'touch',button:0,clientX:x,clientY:y});
    target.dispatchEvent(event);
    if(type==='pointerup'||type==='pointercancel')captured.delete(id);
  };
  const box=()=>svg.getAttribute('viewBox').split(' ').map(Number);
  const mapPoint=(x,y)=>{
    const [left,top,w,h]=box(),rect=svg.getBoundingClientRect(),scale=Math.min(rect.width/w,rect.height/h);
    return [left+(x-rect.left-(rect.width-w*scale)/2)/scale,top+(y-rect.top-(rect.height-h*scale)/2)/scale];
  };
  const click=(target,detail=1)=>{const event=new window.Event('click',{bubbles:true});Object.assign(event,{detail});target.dispatchEvent(event);};
  return {document,window,map,svg,point,box,mapPoint,click,captured};
}
const near=(a,b)=>assert.ok(Math.hypot(...a.map((value,i)=>value-b[i]))<1e-7,`${a} != ${b}`);

test('pinching zooms around the fingers midpoint and includes two-finger panning with SVG letterboxing',async()=>{
  const {point,box,mapPoint}=await setup(),initial=box(),anchor=mapPoint(150,200);
  point('pointerdown',1,100,200);point('pointerdown',2,200,200);
  point('pointermove',1,80,200);point('pointermove',2,280,200);
  assert.ok(Math.abs(box()[2]-initial[2]/2)<1e-7);
  near(mapPoint(180,200),anchor);
  point('pointermove',1,110,240);point('pointermove',2,310,240);
  near(mapPoint(210,240),anchor);
  near(box().slice(2),initial.slice(2).map(value=>value/2));
});

test('lifting a finger rebases panning and pinch or drag gestures cannot select rooms',async()=>{
  const {document,map,point,box,mapPoint,click}=await setup();
  let selected=0,background=0;map.onPlaceSelect=()=>selected++;map.onBackgroundClick=()=>background++;
  const room=document.querySelector('[data-place="3-101"]');
  point('pointerdown',1,100,200,room);point('pointerdown',2,200,200,room);
  point('pointermove',1,80,200);point('pointermove',2,280,200);
  point('pointerup',2,280,200);
  const anchor=mapPoint(80,200),before=box();
  point('pointermove',1,100,230);
  near(mapPoint(100,230),anchor);near(box().slice(2),before.slice(2));
  point('pointerup',1,100,230);click(room);click(room);
  assert.equal(selected,0);assert.equal(background,0);
  point('pointerdown',3,100,200,room);point('pointerup',3,100,200,room);click(room);
  assert.equal(selected,1,'a fresh tap still selects the place');
  point('pointerdown',4,100,200);point('pointermove',4,130,200);point('pointermove',4,100,200);point('pointerup',4,100,200);click(room);
  assert.equal(selected,1,'moving back to the start does not turn a drag into a click');
  click(room,0);assert.equal(selected,2,'keyboard and programmatic selection remain available');
});

test('cancelled pointers, lost capture, third fingers and resets cannot leave a stale gesture',async()=>{
  const {window,map,svg,point,box,captured}=await setup();
  point('pointerdown',1,100,200);point('pointerdown',2,200,200);point('pointerdown',3,240,250);
  point('pointermove',1,80,200);point('pointercancel',2,200,200);
  point('pointermove',3,260,250);assert.ok(box().every(Number.isFinite));
  captured.delete(1);point('lostpointercapture',1,80,200);
  point('pointerup',3,260,250,window);
  const ended=box();point('pointermove',1,0,0);point('pointermove',3,0,0);near(box(),ended);
  point('pointerdown',4,100,200);point('pointerdown',5,200,200);
  map.resetView();const reset=box();
  point('pointermove',4,50,200);point('pointermove',5,250,200);near(box(),reset);
  assert.equal(captured.size,0);
  point('pointerdown',6,100,200);point('pointerdown',7,200,200);
  window.dispatchEvent(new window.Event('blur'));const blurred=box();
  point('pointermove',6,40,200);near(box(),blurred);
  assert.equal(captured.size,0);assert.ok(svg);
});

test('pinch zoom obeys button zoom limits in floor and campus views',async()=>{
  const {map,point,box}=await setup();
  for(const overview of [false,true]){
    map.showOverview(overview);
    point('pointerdown',1,100,200);point('pointerdown',2,200,200);
    point('pointermove',2,100000,200);assert.equal(box()[2],8);
    point('pointermove',2,101,200);assert.equal(box()[2],2000);
    assert.ok(box().every(Number.isFinite));
    point('pointerup',1,100,200);point('pointerup',2,101,200);
  }
});
