import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { scrollToMap } from '../.checks/ui/mapScroll.js';

async function setup({ mobile = true, height = 640, offsetTop = 0 } = {}) {
  const { document, window } = parseHTML(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
  globalThis.document = document;
  globalThis.window = window;
  window.matchMedia = () => ({ matches: mobile });
  window.scrollY = 200;
  window.innerHeight = height;
  window.visualViewport = { height, offsetTop };
  let destination, desktopScroll;
  window.scrollTo = options => { destination = options; };
  const get = id => document.getElementById(id);
  get('map-stage').getBoundingClientRect = () => ({ top: 400 });
  get('map-stage').scrollIntoView = options => { desktopScroll = options; };
  get('step-guide').classList.remove('hidden');
  get('guide-current-text').getBoundingClientRect = () => ({ top: 1020, bottom: 1080 });
  get('btn-reopen-guide').getBoundingClientRect = () => ({ top: 950, bottom: 994 });
  return { get, window, destination: () => destination, desktopScroll: () => desktopScroll };
}

test('mobile map navigation reveals the directions heading and current instruction below the map', async () => {
  const { get, window, destination } = await setup();
  scrollToMap();
  const delta = destination().top - window.scrollY;
  assert.ok(get('guide-current-text').getBoundingClientRect().bottom - delta <= 628);
  assert.ok(900 - delta > 200, 'a useful portion of the map remains above the directions');
  assert.equal(destination().behavior, 'instant');
  get('guide-all-steps').setAttribute('open', '');
  scrollToMap();
  assert.equal(destination().top - window.scrollY, delta, 'expanded lists must not move the map out of view');
});

test('large viewports retain the map header while long instructions only reserve a preview', async () => {
  const { get, window, destination } = await setup({ height: 1000 });
  scrollToMap();
  assert.equal(get('map-stage').getBoundingClientRect().top - (destination().top - window.scrollY), 12);
  get('guide-current-text').getBoundingClientRect = () => ({ top: 1020, bottom: 1800 });
  scrollToMap();
  assert.equal(destination().top, 588, 'the full long instruction must not replace the map');
});

test('collapsed directions expose their reopen button and visual viewport offsets are respected', async () => {
  const { get, window, destination } = await setup({ height: 500, offsetTop: 20 });
  get('step-guide').classList.add('hidden');
  get('btn-reopen-guide').classList.remove('hidden');
  scrollToMap();
  const bottom = 994 - (destination().top - window.scrollY) - 20;
  assert.equal(bottom, 488);
  get('btn-reopen-guide').classList.add('hidden');
  scrollToMap();
  assert.equal(destination().top, 568);
});

test('desktop navigation retains nearest scrolling inside the existing map workspace', async () => {
  const { destination, desktopScroll } = await setup({ mobile: false });
  scrollToMap();
  assert.equal(destination(), undefined);
  assert.deepEqual(desktopScroll(), { block: 'nearest' });
});
