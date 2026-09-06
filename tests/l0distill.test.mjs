// Batch D regression: L0 head auto-distillation.
// buildContext must report what leaves the window; distillHead must format
// the dropped prefix; the marker dedupes repeated trims.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContext } from '../server/bus.mjs';
import { distillHead } from '../server/memory/distill.mjs';

function bigConv() {
  const conv = { id: 'c1', name: '测试群', messages: [] };
  // 6 x 3000-char turns: 18000 chars total, forces a trim at any small budget
  for (let i = 0; i < 6; i++) {
    conv.messages.push({ sender: 'user', text: `问题${i}：${'甲'.repeat(3000)}`, ts: 1000 + i });
    conv.messages.push({ sender: 'agent', agentId: 'a1', text: `回答${i}：${'乙'.repeat(3000)}`, ts: 1001 + i });
  }
  return conv;
}

test('buildContext drops report the trimmed head (with ts, keep last turn)', () => {
  const conv = bigConv();
  const drops = [];
  const ctx = buildContext(conv, 'a1', [{ id: 'a1', name: 'A' }], 7000, drops);
  assert.ok(ctx.length >= 1, 'last turn always kept');
  assert.ok(drops.length >= 1, 'trim recorded');
  // every drop carries the ts of the newest message in its block
  for (const d of drops) assert.ok(d.ts > 0 && typeof d.text === 'string');
  // the dropped prefix is genuinely the oldest content
  assert.ok(drops[0].text.includes('问题0'));
  // without a collector the return shape is unchanged (back-compat)
  const ctx2 = buildContext(conv, 'a1', [{ id: 'a1', name: 'A' }], 7000);
  assert.deepEqual(ctx2.map((m) => m.role), ctx.map((m) => m.role));
});

test('distillHead formats the dropped prefix as a dated KB note', () => {
  const conv = bigConv();
  const agents = [{ id: 'a1', name: '阿甲' }];
  const drops = [];
  buildContext(conv, 'a1', agents, 7000, drops);
  const cutoff = Math.max(...drops.map((d) => d.ts));
  const d = distillHead(conv, agents, cutoff);
  assert.equal(d.title, '群档-测试群-L0头部摘录');
  assert.ok(d.body.includes('自动归档'));
  assert.ok(d.body.includes('用户：'));
  assert.ok(d.body.includes('阿甲：'));
  // only messages up to the cutoff, never the turns still in the window
  assert.ok(!d.body.includes('回答5'));
});

test('distillHead on an empty range degrades gracefully', () => {
  const d = distillHead({ name: 'X', messages: [] }, [], 123);
  assert.ok(d.body.includes('（无内容）'));
});
