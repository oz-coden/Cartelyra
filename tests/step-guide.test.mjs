import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { StepGuide } from '../.checks/ui/StepGuide.js';

async function setup() {
  const { document, window } = parseHTML(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
  globalThis.document = document;
  globalThis.window = window;
  const guide = new StepGuide(), chosen = [];
  guide.onStepClick = step => chosen.push(step.nodeId);
  return { document, guide, chosen, get: id => document.getElementById(id) };
}
const steps = [
  { stepNumber: 1, instruction: '部屋から出発', nodeId: 'a', distance: 0, buildingId: 'b3', floor: 1 },
  { stepNumber: 2, instruction: 'EVで2Fへ', nodeId: 'b', distance: 0, edgeType: 'elevator', buildingId: 'b3', floor: 2 },
  { stepNumber: 3, instruction: '目的地に到着', nodeId: 'c', distance: 0, buildingId: 'b3', floor: 2 },
];

test('directions track the chosen section through next, previous, list selection and reopening', async () => {
  const { document, guide, chosen, get } = await setup();
  guide.showSteps(steps);
  assert.deepEqual(chosen, [], 'route computation must not focus the first section');
  assert.equal(get('guide-step-count').textContent, '1 / 3 区間');
  assert.equal(get('btn-guide-prev').disabled, true);
  assert.equal(get('btn-guide-next').disabled, false);
  assert.equal(get('guide-all-steps').hasAttribute('open'), false);
  get('btn-guide-next').click();
  assert.equal(get('guide-current-text').textContent, 'EVで2Fへ');
  assert.equal(get('guide-current-footer').textContent, 'EV');
  assert.equal(document.querySelector('[aria-current="step"] .step-card-text').textContent, 'EVで2Fへ');
  get('btn-close-guide').click();
  assert.ok(get('step-guide').classList.contains('hidden'));
  assert.ok(!get('btn-reopen-guide').classList.contains('hidden'));
  get('btn-reopen-guide').click();
  assert.equal(get('guide-step-count').textContent, '2 / 3 区間');
  assert.ok(!get('step-guide').classList.contains('hidden'));
  assert.deepEqual(chosen, ['b'], 'reopening retains the current map and section');
  get('btn-guide-focus').click();
  assert.deepEqual(chosen, ['b', 'b']);
  document.querySelectorAll('.step-card')[2].click();
  assert.equal(get('guide-step-count').textContent, '3 / 3 区間');
  assert.equal(get('btn-guide-next').disabled, true);
  get('btn-guide-prev').click();
  assert.equal(get('guide-step-count').textContent, '2 / 3 区間');
  assert.deepEqual(chosen, ['b', 'b', 'c', 'b']);
});

test('clearing or replacing a route cannot reopen stale directions and single-section routes have no navigation', async () => {
  const { guide, chosen, get } = await setup();
  guide.showSteps(steps);
  get('btn-guide-next').click();
  guide.hide();
  guide.clear();
  assert.ok(get('btn-reopen-guide').classList.contains('hidden'));
  assert.equal(get('step-guide-list').childElementCount, 0);
  get('btn-reopen-guide').click();
  assert.ok(get('step-guide').classList.contains('hidden'));
  guide.showSteps([steps[2]]);
  assert.equal(get('guide-step-count').textContent, '1 / 1 区間');
  assert.equal(get('btn-guide-prev').disabled, true);
  assert.equal(get('btn-guide-next').disabled, true);
  assert.equal(get('guide-current-text').textContent, steps[2].instruction);
  assert.deepEqual(chosen, ['b']);
  guide.showSteps([]);
  assert.ok(get('btn-reopen-guide').classList.contains('hidden'));
  assert.ok(get('step-guide').classList.contains('hidden'));
});
