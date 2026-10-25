import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {readData} from '../scripts/read-data.mjs';
import {compileCampus} from '../.checks/data/compile.js';
import {placeIndex,searchPlaces} from '../.checks/data/places.js';
import {StepGuide} from '../.checks/ui/StepGuide.js';

const source=await readData(),data=compileCampus(source.manifest,source.buildings,source.floors),places=placeIndex(data,source.overview);

test('EV labels are consistent across map features, navigation nodes and numbered search aliases',()=>{
  const elevators=places.filter(place=>place.kind==='elevator');
  assert.ok(elevators.length>0);
  assert.ok(elevators.every(place=>place.name.startsWith('EV')));
  assert.ok(data.navigation.nodes.filter(node=>node.type==='elevator').every(node=>node.name.includes('EV')&&!/エレベータ/.test(node.name)));
  for(const query of ['EV','EV1','1号館 8F EV1']){
    const expected=searchPlaces(places,query,'b23',1).map(place=>place.id);
    assert.ok(expected.length>0);
    for(const word of ['エレベーター','エレベータ','ＥＶ'])
      assert.deepEqual(searchPlaces(places,query.replace('EV',word),'b23',1).map(place=>place.id),expected);
  }
});

test('view controls and elevator guide footers use the published UI terminology',async()=>{
  const {document,window}=parseHTML(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  globalThis.document=document;globalThis.window=window;
  assert.equal(document.getElementById('btn-view-floor').textContent,'平面図');
  assert.equal(document.getElementById('btn-view-3d').textContent,'立体図');
  assert.equal(document.getElementById('canvas-container').getAttribute('aria-label'),'建物の立体図');
  const guide=new StepGuide();
  guide.showSteps([
    {stepNumber:1,instruction:'出発',nodeId:'a',distance:0},
    {stepNumber:2,instruction:'EVで2Fへ',nodeId:'ev',edgeType:'elevator',distance:0},
    {stepNumber:3,instruction:'到着',nodeId:'b',distance:0},
  ]);
  assert.equal(document.querySelectorAll('.step-card-footer')[1].textContent,'EV');
  assert.doesNotMatch(document.getElementById('step-guide-list').textContent,/エレベータ/);
});
