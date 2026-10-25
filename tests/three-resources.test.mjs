import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createServer} from 'vite';
import * as THREE from 'three';
import {readData} from '../scripts/read-data.mjs';
import {compileCampus} from '../.checks/data/compile.js';

async function setup() {
  const {document,window}=parseHTML('<html><body><div id="canvas"></div></body></html>');
  globalThis.document=document;globalThis.window=window;
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  const contexts=new WeakMap();
  window.HTMLCanvasElement.prototype.getContext=function(){
    if(!contexts.has(this))contexts.set(this,{
      clears:0,backgrounds:[],texts:[],beginPath(){},roundRect(){},stroke(){},fillRect(){},
      fill(){this.backgrounds.push(this.fillStyle);},clearRect(){this.clears++;},
      fillText(text){this.texts.push({text,color:this.fillStyle});},
      createLinearGradient(){return{addColorStop(){}};},
    });
    return contexts.get(this);
  };
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},
    optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const source=await readData(),data=compileCampus(source.manifest,source.buildings,source.floors);
  return {document,server,data,contexts};
}

function resources(group) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  group.traverse(object=>{
    if(object.isMesh||object.isLine)geometries.add(object.geometry);
    if(object.material)for(const material of Array.isArray(object.material)?object.material:[object.material]){
      materials.add(material);
      for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
  });
  return {geometries,materials,textures};
}
const textureBytes=group=>[...resources(group).textures]
  .reduce((total,texture)=>total+texture.image.width*texture.image.height*4,0);

test('3D retains only the current scope and releases every discarded building resource',async()=>{
  const {document,server,data}=await setup();
  try {
    const {ThreeView}=await server.ssrLoadModule('/src/scene/ThreeView.ts');
    const host={scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),
      renderer:{domElement:document.createElement('canvas')},controls:{maxDistance:450},
      setActive(){},setDarkTheme(){},resize(){},flyTo(){}};
    const view=new ThreeView(data,document.getElementById('canvas'),host);
    const root=host.scene.children.find(object=>object.type==='Group'&&object.userData.type!=='building-connections');
    const buildingIds=()=>root.children.filter(object=>object.userData.type==='building').map(object=>object.userData.id).sort();
    assert.deepEqual(buildingIds(),[],'creating the view does not generate the whole campus');
    view.setLocation('b3',1,true);
    assert.deepEqual(buildingIds(),['b3']);
    const b3=root.children[0],old=resources(b3),disposed={geometries:0,materials:0,textures:0};
    for(const [kind,items] of Object.entries(old))for(const item of items)item.addEventListener('dispose',()=>disposed[kind]++);
    view.setLocation('b3',2,false);
    assert.equal(root.children[0],b3,'floor changes reuse the loaded building');
    assert.deepEqual(disposed,{geometries:0,materials:0,textures:0});
    view.setLocation('b23',1,true);
    assert.deepEqual(buildingIds(),['b23']);
    for(const [kind,items] of Object.entries(old))assert.equal(disposed[kind],items.size,`${kind} released`);
    assert.ok(textureBytes(root)<32*1024*1024,'the largest building stays below 32 MiB of label image pixels');
    assert.equal(view.getPlaceAnchor('3-101'),null,'discarded meshes cannot anchor selections');
    const group=data.viewGroups.find(group=>group.id==='b7-b10');
    const scope={key:group.id,label:group.name,buildingIds:group.buildingIds,group,
      floors:group.levels[1].floors,levelId:group.levels[1].id};
    view.setLocation('b7',2,true,scope);
    assert.deepEqual(buildingIds(),['b10','b7','b8','b9']);
    view.setLocation('b8',2,false,scope);
    assert.deepEqual(buildingIds(),['b10','b7','b8','b9']);
    for(let i=0;i<3;i++){
      view.setLocation('b23',1,true);
      view.setLocation('b3',1,true);
      assert.deepEqual(buildingIds(),['b3']);
      assert.equal(root.children[0].children.length,6,'revisiting buildings does not accumulate floors');
    }
    view.setLocation(null,null,false);
    assert.deepEqual(buildingIds(),[]);
    assert.equal(textureBytes(root),0);
  }finally{await server.close();}
});

test('3D themes refresh slabs, outlines and label images while preserving geometry and selection',async()=>{
  const {server,data,contexts}=await setup();
  try {
    const {BuildingRenderer}=await server.ssrLoadModule('/src/scene/BuildingRenderer.ts');
    const renderer=new BuildingRenderer(data,[]);
    renderer.setDarkTheme(true);
    renderer.setBuildings(['b3']);
    const floor=renderer.floorGroups.get('b3_f1'),slab=floor.children[0].children[0],edge=floor.children[0].children[1];
    const geometry=slab.geometry,room=renderer.roomMeshRecords.get('3-101');
    const label=room.labelSprite.material.map,badge=floor.children[0].children[2].material.map;
    const context=contexts.get(label.image),badgeContext=contexts.get(badge.image);
    assert.equal(slab.material.color.getHexString(),'1e293b','new scopes honor an already selected dark theme');
    assert.equal(slab.material.opacity,.7);
    assert.equal(context.texts.at(-1).color,'#f8fafc');
    assert.equal(context.backgrounds.at(-1),'rgba(15, 23, 42, 0.85)');
    renderer.highlightPlace('3-101');
    const labelVersion=label.version,badgeVersion=badge.version;
    renderer.setDarkTheme(false);
    assert.equal(slab.geometry,geometry);
    assert.equal(slab.material.color.getHexString(),'e2e8f0');
    assert.equal(slab.material.opacity,.85);
    assert.equal(edge.material.color.getHexString(),'cbd5e1');
    assert.equal(context.texts.at(-1).color,'#0f172a');
    assert.equal(context.backgrounds.at(-1),'rgba(255, 255, 255, 0.9)');
    assert.equal(badgeContext.texts.at(-1).color,'#1d4ed8');
    assert.ok(label.version>labelVersion&&badge.version>badgeVersion);
    assert.equal(room.mesh.material.emissive.getHexString(),'f59e0b');
    assert.equal(room.mesh.material.opacity,1);
    renderer.setDarkTheme(true);
    assert.equal(slab.material.color.getHexString(),'1e293b');
    assert.equal(edge.material.color.getHexString(),'475569');
    assert.equal(badgeContext.texts.at(-1).color,'#38bdf8');
    assert.equal(room.mesh.material.emissive.getHexString(),'38bdf8');
    const clears=context.clears;
    renderer.setDarkTheme(true);
    assert.equal(context.clears,clears,'reapplying the same theme does not redraw labels');
    renderer.setBuildings(['b23']);
    renderer.setDarkTheme(false);
    assert.equal(context.clears,clears,'discarded labels are not retained by theme callbacks');
    assert.equal(renderer.floorGroups.get('b23_f1').children[0].children[0].material.color.getHexString(),'e2e8f0');
  }finally{await server.close();}
});
