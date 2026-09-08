// Batch B regression: deliberation vote parsing + stage/role integration
// points that the engine relies on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isOppose, deliberationControl, optimizeInstruction } from '../server/deliberate.mjs';
import { ensureRoles } from '../server/roles.mjs';

test('vote parsing: only explicit markers count as dissent', () => {
  assert.equal(isOppose('【反对】我认为方案X有风险：...'), true);
  assert.equal(isOppose('反对：性能不行'), true);
  assert.equal(isOppose('反对:性能不行'), true);
  assert.equal(isOppose('【同意】方案可行'), false);
  assert.equal(isOppose('我反对的这个说法不对，我同意'), false); // 反对 not at start / not marked
  assert.equal(isOppose(''), false);
  assert.equal(isOppose(undefined), false);
});

test('deliberationControl: per-conversation state, defaults are clean', () => {
  assert.deepEqual(deliberationControl('no-such-conv'), { paused: false, stopped: false });
});

test('engine prerequisites: roles ensure an executor and a commander exist', () => {
  const agents = [
    { id: 'dsh', name: 'DSH', adapterType: 'A' },
    { id: 'inv', name: '投研', adapterType: 'B' },
    { id: 'wb', name: 'WB', adapterType: 'B' },
  ];
  const conv = { memberIds: ['dsh', 'inv', 'wb'] };
  ensureRoles(conv, agents);
  // at least one executor and one advisor after auto-tagging: the minimum
  // configuration for the dispatch engine to work
  assert.ok(Object.values(conv.memberRoles).includes('executor'));
  assert.ok(Object.values(conv.memberRoles).includes('advisor'));
});

test('optimizeInstruction: carries the raw topic and demands prompt-only output', () => {
  const s = optimizeInstruction('hard stop loss execution');
  assert.ok(s.includes('hard stop loss execution'));
  // the optimizer must return ONLY the rewritten brief - runDeliberation
  // takes the whole reply as the refined topic, so chatty output would
  // poison every later round
  assert.ok(s.includes('不要解释'));
  assert.ok(s.includes('背景 / 目标 / 范围边界 / 交付物要求'));
});
