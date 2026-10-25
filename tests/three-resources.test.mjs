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
  window.HTMLCanvasElement.prototype.getContext=()=>({
    beginPath(){},roundRect(){},fill(){},stroke(){},fillText(){},fillRect(){},clearRect(){},
    createLinearGradient(){return{addColorStop(){}};},
  });
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},
    optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const source=await readData(),data=compileCampus(source.manifest,source.buildings,source.floors);
  return {document,server,data};
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
