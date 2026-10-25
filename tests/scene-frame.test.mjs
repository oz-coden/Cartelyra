import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createServer} from 'vite';
import * as THREE from 'three';
import {readData} from '../scripts/read-data.mjs';
import {compileCampus} from '../.checks/data/compile.js';

async function setup() {
  const {document,window}=parseHTML('<html><body><div id="host"></div></body></html>');
  globalThis.document=document;globalThis.window=window;
  globalThis.ResizeObserver=class {observe(){}};
  const frames=new Map();let id=0;
  globalThis.requestAnimationFrame=callback=>{frames.set(++id,callback);return id;};
  globalThis.cancelAnimationFrame=key=>frames.delete(key);
  const frame=time=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(time));};
  window.HTMLCanvasElement.prototype.getContext=()=>({
    clearRect(){},beginPath(){},roundRect(){},fill(){},stroke(){},fillText(){},fillRect(){},
    createLinearGradient(){return{addColorStop(){}};},
  });
  const container=document.getElementById('host'),canvas=document.createElement('canvas');
  for(const element of [container,canvas]){
    Object.defineProperty(element,'clientWidth',{value:1000});
    Object.defineProperty(element,'clientHeight',{value:700});
    element.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:700});
  }
  const renderer={domElement:canvas,shadowMap:{},setSize(){},setPixelRatio(){},render(){}};
  const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},
    optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  const {SceneManager}=await server.ssrLoadModule('/src/scene/SceneManager.ts');
  const manager=new SceneManager(container,renderer);
  return {server,container,manager,frame};
}

const near=(actual,expected,message)=>assert.ok(actual.distanceTo(expected)<1e-6,message);

test('reference grid, shadow floor and light bounds follow distant buildings and survive theme changes',async()=>{
  const {server,manager}=await setup();
  try {
    for(const center of [new THREE.Vector3(1260,35,50),new THREE.Vector3(-20,20,-130),new THREE.Vector3(1650,10,0)]){
      const box=new THREE.Box3().setFromCenterAndSize(center,new THREE.Vector3(180,70,200));
      manager.setSceneBounds(box);manager.scene.updateMatrixWorld(true);
      const grid=manager.gridHelper,gridBox=new THREE.Box3().setFromObject(grid);
      near(grid.position,new THREE.Vector3(center.x,box.min.y-.05,center.z));
      assert.ok(gridBox.min.x<box.min.x&&gridBox.max.x>box.max.x);
      assert.ok(gridBox.min.z<box.min.z&&gridBox.max.z>box.max.z);
      const ground=manager.scene.children.find(object=>object.userData.type==='reference-ground');
      assert.equal(ground.position.x,center.x);assert.equal(ground.position.z,center.z);
      assert.ok(ground.position.y<box.min.y);
      const light=manager.scene.children.find(object=>object.isDirectionalLight);
      near(light.target.position,center);assert.ok(manager.scene.children.includes(light.target));
      assert.ok(light.shadow.camera.far>box.getSize(new THREE.Vector3()).length());
      let disposed=false;grid.geometry.addEventListener('dispose',()=>{disposed=true;});
      manager.setDarkTheme(true);
      assert.ok(disposed);near(manager.gridHelper.position,grid.position);
      assert.equal(manager.gridHelper.geometry.attributes.position.count,grid.geometry.attributes.position.count);
      manager.setSceneBounds(box);
      const unchanged=manager.gridHelper;
      manager.setSceneBounds(box);assert.equal(manager.gridHelper,unchanged,'unchanged bounds reuse the grid');
      manager.setDarkTheme(false);near(manager.gridHelper.position,grid.position);
    }
  }finally{manager.setActive(false);await server.close();}
});

test('camera fits can be immediate and pending flights stop on user input, replacement and hidden views',async()=>{
  const {server,manager,frame}=await setup();
  try {
    const first=new THREE.Vector3(1260,30,40),offset=new THREE.Vector3(30,40,50);
    manager.flyTo(first,first.clone().add(offset),0);
    near(manager.controls.target,first);near(manager.camera.position,first.clone().add(offset));
    const second=new THREE.Vector3(-20,15,-120),start=performance.now();
    manager.flyTo(second,second.clone().add(offset),500);frame(start+100);
    assert.ok(manager.controls.target.distanceTo(second)<first.distanceTo(second));
    manager.controls.dispatchEvent({type:'start'});
    const stoppedTarget=manager.controls.target.clone(),stoppedPosition=manager.camera.position.clone();
    frame(start+1000);near(manager.controls.target,stoppedTarget);near(manager.camera.position,stoppedPosition);
    manager.flyTo(second,second.clone().add(offset),500);
    manager.flyTo(first,first.clone().add(offset),0);
    frame(performance.now()+1000);near(manager.controls.target,first);near(manager.camera.position,first.clone().add(offset));
    manager.flyTo(second,second.clone().add(offset),500);
    manager.setActive(false);manager.setActive(true);frame(performance.now()+1000);
    near(manager.controls.target,first,'returning to the view does not resume a stale flight');
  }finally{manager.setActive(false);await server.close();}
});

test('every building frames immediately at its own grid and rapid switches cannot pull the camera to an old scope',async()=>{
  const {server,container,manager,frame}=await setup();
  try {
    const {ThreeView}=await server.ssrLoadModule('/src/scene/ThreeView.ts');
    const source=await readData(),data=compileCampus(source.manifest,source.buildings,source.floors);
    const view=new ThreeView(data,container,manager);
    for(const building of data.buildings){
      view.setLocation(building.id,building.floors[0].level,true);view.reset();
      const box=new THREE.Box3();manager.scene.traverse(object=>{
        if(object.userData.type==='floor'&&object.visible&&object.parent.visible)box.union(new THREE.Box3().setFromObject(object));
      });
      const center=box.getCenter(new THREE.Vector3());
      near(manager.controls.target,center,building.id);
      assert.equal(manager.gridHelper.position.x,center.x,building.id);
      assert.equal(manager.gridHelper.position.z,center.z,building.id);
      const position=manager.camera.position.clone();frame(performance.now()+1000);
      near(manager.camera.position,position,'no delayed movement after '+building.id);
    }
    view.setLocation('b23',1,true);
    const node=data.navigation.nodes.find(node=>node.buildingId==='b23'&&node.floor===1&&node.type==='room_entrance');
    view.focusStep({nodeId:node.id});
    near(manager.controls.target,new THREE.Vector3(...node.position),'cross-building guide steps focus immediately');
    const focused=manager.camera.position.clone();frame(performance.now()+1000);
    near(manager.camera.position,focused);
    view.setLocation('b23',8,false);
    assert.ok(manager.gridHelper.position.y>50,'single-floor reference plane follows the selected upper floor');
    const group=data.viewGroups.find(group=>group.id==='b7-b10');
    const scope={key:group.id,label:group.name,buildingIds:group.buildingIds,group,
      floors:group.levels[1].floors,levelId:group.levels[1].id};
    view.setLocation('b7',2,true,scope);view.reset();
    const position=manager.camera.position.clone(),target=manager.controls.target.clone(),grid=manager.gridHelper.position.clone();
    view.setLocation('b8',2,true,scope);frame(performance.now()+1000);
    near(manager.camera.position,position);near(manager.controls.target,target);near(manager.gridHelper.position,grid);
  }finally{manager.setActive(false);await server.close();}
});
