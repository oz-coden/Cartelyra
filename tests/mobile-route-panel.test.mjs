import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {SearchPanel} from '../.checks/ui/SearchPanel.js';
import {MobileRoutePanel} from '../.checks/ui/MobileRoutePanel.js';

async function setup(mobile=true){
  const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  globalThis.document=document;globalThis.window=window;
  const callbacks=new Map(),viewportCallbacks=new Map();
  const media={matches:mobile,addEventListener:(name,callback)=>callbacks.set(name,callback)};
  window.matchMedia=()=>media;
  window.innerHeight=844;
  window.visualViewport={height:844,offsetTop:0,addEventListener:(name,callback)=>viewportCallbacks.set(name,callback)};
  let focused=null;
  Object.defineProperty(document,'activeElement',{get:()=>focused,configurable:true});
  window.HTMLElement.prototype.focus=function(){focused=this;};
  window.HTMLElement.prototype.blur=function(){if(focused===this)focused=null;};
  const get=id=>document.getElementById(id),dialog=get('mobile-route-dialog');
  dialog.showModal=()=>dialog.setAttribute('open','');
  dialog.close=()=>{dialog.removeAttribute('open');dialog.dispatchEvent(new window.Event('close'));};
  dialog.getBoundingClientRect=()=>({left:0,top:200,right:390,bottom:844});
  get('allow-inferred').checked=true;
  const search=new SearchPanel([]),panel=new MobileRoutePanel(search);
  return {document,window,media,callbacks,viewportCallbacks,get,dialog,search,panel,focused:()=>focused};
}

test('the mobile editor opens with native modal behavior, retains drafts and confirmed endpoints, and returns focus to the map bar',async()=>{
  const {document,window,get,dialog,search,focused}=await setup();
  const input=get('input-dest');
  assert.ok(dialog.contains(get('route-editor')));
  assert.equal(get('sidebar-panel').contains(input),false);
  get('btn-edit-route').click();
  assert.ok(dialog.hasAttribute('open'));
  assert.equal(focused(),input);
  assert.ok(document.documentElement.classList.contains('route-editor-open'));
  input.value='3-20';input.dispatchEvent(new window.Event('input'));
  assert.match(get('mobile-route-dest').textContent,/3-20.*未確定/);
  get('btn-route-show-map').click();
  assert.equal(dialog.hasAttribute('open'),false);
  assert.equal(focused(),get('btn-edit-route'));
  assert.equal(input.value,'3-20');
  assert.equal(document.documentElement.classList.contains('route-editor-open'),false);
  search.setDest('dest','3-201（3号館 2F）');
  get('btn-edit-route').click();
  assert.equal(focused(),get('input-start'));
  assert.equal(get('input-dest'),input,'moving the editor must not recreate inputs');
  assert.match(get('mobile-route-dest').textContent,/3-201/);
  assert.doesNotMatch(get('mobile-route-dest').textContent,/未確定/);
  const cancel=new window.Event('cancel',{cancelable:true});dialog.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented,true);
  assert.equal(dialog.hasAttribute('open'),false);
});

test('desktop layout is preserved and breakpoint changes keep one editor, route conditions and values',async()=>{
  const {document,media,callbacks,get,dialog,search}=await setup(false);
  const editor=get('route-editor');
  assert.ok(get('sidebar-panel').contains(editor));
  get('btn-edit-route').click();assert.equal(dialog.hasAttribute('open'),false);
  search.setStart('start','正門');search.setDest('dest','3-201');
  document.querySelector('[data-filter="indoor"]').click();
  media.matches=true;callbacks.get('change')();
  assert.ok(dialog.contains(editor));get('btn-edit-route').click();
  media.matches=false;callbacks.get('change')();
  assert.equal(dialog.hasAttribute('open'),false);
  assert.ok(get('sidebar-panel').contains(editor));
  assert.equal(document.querySelectorAll('#input-start').length,1);
  assert.equal(get('input-start').value,'正門');
  assert.equal(get('input-dest').value,'3-201');
  assert.equal(search.getState().filter,'indoor');
  assert.equal(document.documentElement.classList.contains('route-editor-open'),false);
  media.matches=true;callbacks.get('change')();get('btn-edit-route').click();
  assert.equal(get('input-dest').value,'3-201');
});

test('the map bar follows route conditions, warnings, failures, point swapping and draft edits',async()=>{
  const {document,window,get,search}=await setup();
  search.setStart('a','正門');search.setDest('b','3-201');
  document.querySelector('[data-filter="accessible"]').click();
  search.setStatus('階段なしの経路はありません。代替経路を表示中。','warning');
  assert.match(get('mobile-route-conditions').textContent,/階段を避ける.*参考ルートを含む/);
  assert.equal(get('mobile-route-status').dataset.kind,'warning');
  assert.ok(!get('mobile-route-status').classList.contains('hidden'));
  get('allow-inferred').checked=false;get('allow-inferred').dispatchEvent(new window.Event('change'));
  assert.match(get('mobile-route-conditions').textContent,/確認済みの接続のみ/);
  search.setStatus('この条件でつながる経路は未登録です。');
  assert.equal(get('mobile-route-status').dataset.kind,'error');
  assert.match(get('mobile-route-status').textContent,/未登録/);
  get('btn-swap-points').click();
  assert.equal(get('mobile-route-start').textContent,'3-201');
  assert.equal(get('mobile-route-dest').textContent,'正門');
  search.setStatus();
  assert.ok(get('mobile-route-status').classList.contains('hidden'));
  get('input-dest').value='西門';get('input-dest').dispatchEvent(new window.Event('input'));
  assert.equal(get('mobile-route-dest').textContent,'西門（未確定）');
});

test('map picking closes the modal before map navigation without losing entered points',async()=>{
  const {document,get,dialog,search,panel}=await setup();
  search.setDest('b','3-201');
  let target;
  search.onPickModeToggle=value=>{target=value;if(value!=='none')panel.close(false);};
  get('btn-edit-route').click();get('btn-pick-start').click();
  assert.equal(target,'start');
  assert.equal(dialog.hasAttribute('open'),false);
  assert.equal(document.documentElement.classList.contains('route-editor-open'),false);
  assert.equal(get('input-dest').value,'3-201');
  get('btn-edit-route').click();
  assert.equal(target,'none','reopening the editor cancels pending map picking');
});

test('the panel follows the keyboard viewport, closes only on backdrop clicks and ignores a stale close event after reopening',async()=>{
  const {document,window,viewportCallbacks,get,dialog}=await setup();
  get('btn-edit-route').click();
  window.visualViewport.height=500;window.visualViewport.offsetTop=12;viewportCallbacks.get('resize')();
  assert.equal(dialog.style.getPropertyValue('--route-viewport-height'),'500px');
  assert.equal(dialog.style.getPropertyValue('--route-viewport-bottom'),'332px');
  const click=(x,y)=>{const event=new window.Event('click');Object.assign(event,{clientX:x,clientY:y});dialog.dispatchEvent(event);};
  click(100,400);assert.ok(dialog.hasAttribute('open'));
  click(100,100);assert.equal(dialog.hasAttribute('open'),false);
  get('btn-edit-route').click();dialog.dispatchEvent(new window.Event('close'));
  assert.ok(document.documentElement.classList.contains('route-editor-open'));
  assert.equal(get('btn-edit-route').getAttribute('aria-expanded'),'true');
});
