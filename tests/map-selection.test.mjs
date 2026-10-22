import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {readData} from '../scripts/read-data.mjs';
import {compileCampus} from '../.checks/data/compile.js';
import {buildingCatalog} from '../.checks/data/places.js';
import {FloorMap} from '../.checks/ui/FloorMap.js';
import {AStarPathfinder} from '../.checks/pathfinding/AStar.js';
const source=await readData(),data=compileCampus(source.manifest,source.buildings,source.floors);
async function setup(){
 const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
 globalThis.document=document;globalThis.window=window;
 const map=new FloorMap(document.getElementById('map-canvas'),data,source.overview);
 const building=buildingCatalog(data,source.overview).find(b=>b.id==='b6');
 map.setLocation(building,building.data.floors.find(f=>f.level===1));
 return{document,window,map};
}

test('a concave room outline follows its polygon and remains in front of later rooms and route overlays',async()=>{
 const {document,map}=await setup();
 const room=source.floors.find(f=>f.buildingId==='b6'&&f.id==='f1').rooms.find(r=>r.id==='6-111');
 assert.ok(room.polygon.length>4);
 map.selectPlace(room.id);
 const outline=document.querySelector('.map-selection-outline');
 assert.equal(outline.getAttribute('points'),room.polygon.map(p=>p.join(',')).join(' '));
 const foreground=document.querySelector('.map-emphasis'),svg=document.querySelector('#map-canvas svg');
 assert.equal(svg.lastElementChild,foreground);assert.equal(foreground.getAttribute('pointer-events'),'none');
 assert.equal(foreground.getAttribute('aria-hidden'),'true');
 map.setRoute(new AStarPathfinder(data).findPath('b6/f1/room-111','b6/f1/room-112'));
 assert.equal(svg.lastElementChild,foreground);assert.ok(document.querySelectorAll('.map-route').length>0);
 map.showOverview(true);assert.equal(document.querySelector('.map-selection-outline'),null);
 map.showOverview(false);assert.equal(document.querySelectorAll('.map-selection-outline').length,1);
 map.selectPlace(null);assert.equal(document.querySelector('.map-selection-outline'),null);
});

test('keyboard focus has its own shape outline without changing selection or obscuring hit targets',async()=>{
 const {document,window,map}=await setup();map.selectPlace('6-111');
 const other=document.querySelector('[data-place="6-112"]');
 other.dispatchEvent(new window.Event('focus'));
 const focus=document.querySelector('.map-focus-outline');
 assert.equal(focus.getAttribute('points'),other.querySelector('polygon').getAttribute('points'));
 assert.equal(document.querySelector('[data-place="6-111"]').getAttribute('aria-pressed'),'true');
 assert.equal(other.getAttribute('aria-pressed'),'false');
 let selected;map.onPlaceSelect=p=>selected=p.id;
 other.dispatchEvent(new window.Event('click',{bubbles:true}));assert.equal(selected,'6-112');
 other.dispatchEvent(new window.Event('blur'));assert.equal(document.querySelector('.map-focus-outline'),null);
 assert.ok(document.querySelector('.map-selection-outline'));
});
