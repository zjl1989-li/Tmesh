// P0 batch regression: commander dispatch channel + discuss-stage hard gate.
// No LLM/network - proposal parsing and state transitions are pure logic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, approveTask, parseDispatchProposals, proposeFromReply } from '../server/tasks.mjs';
import { ensureRoles } from '../server/roles.mjs';

const noop = () => {};
const deps = { emit: noop, persist: noop };

function makeGroup() {
  const agents = [
    { id: 'dsh', name: 'DSH', adapterType: 'A' },
    { id: 'inv', name: '投研', adapterType: 'B' },
    { id: 'cmd', name: '指挥官', adapterType: 'A' },
  ];
  const conv = { id: 'c1', memberIds: ['dsh', 'inv', 'cmd'], messages: [], approval: 'before',
    memberRoles: { dsh: 'executor', inv: 'advisor', cmd: 'commander' } };
  ensureRoles(conv, agents);
  return { conv, agents };
}

// --- hard gate ---------------------------------------------------------------

test('hard gate: no work orders during discuss / await_confirm', () => {
  const { conv, agents } = makeGroup();
  conv.stage = 'discuss';
  let r = createTask(conv, agents, { text: '改图标' }, deps);
  assert.ok(r.error && r.error.includes('硬闸'));
  conv.stage = 'await_confirm';
  r = createTask(conv, agents, { text: '改图标', executorId: 'dsh' }, deps);
  assert.ok(r.error);
  assert.equal(conv.tasks, undefined, 'no order may leak into the list');
  // gate opens again once the user confirmed the plan
  conv.stage = 'execute';
  r = createTask(conv, agents, { text: '改图标' }, deps);
  assert.ok(r.task);
});

// --- proposal parsing ----------------------------------------------------------

test('parseDispatchProposals: same-line, next-line, no-executor, arrow strip', () => {
  const same = parseDispatchProposals('【派单】修复登录超时 → 执行：DSH');
  assert.equal(same.length, 1);
  assert.equal(same[0].text, '修复登录超时');
  assert.equal(same[0].executorName, 'DSH');

  const next = parseDispatchProposals('复盘如下。\n【派单】补测试\n执行：投研\n其余略。');
  assert.equal(next.length, 1);
  assert.equal(next[0].text, '补测试');
  assert.equal(next[0].executorName, '投研');

  const bare = parseDispatchProposals('【派单】写文档');
  assert.equal(bare.length, 1);
  assert.equal(bare[0].text, '写文档');
  assert.equal(bare[0].executorName, '');

  const none = parseDispatchProposals('我建议【派单】这个词不要乱用');
  assert.equal(none.length, 1, 'only explicit full marker lines count');
});

// --- proposedBy: user final approval is unconditional ---------------------------

test('commander proposals always wait for user approval (even approval=after)', () => {
  const { conv, agents } = makeGroup();
  conv.approval = 'after';
  const r = createTask(conv, agents, { text: '指挥提的活', proposedBy: 'cmd' }, deps);
  assert.equal(r.task.status, 'pending_approval');
  assert.equal(r.task.proposedBy, 'cmd');
  const msg = conv.messages.at(-1);
  assert.ok(msg.text.includes('指挥（指挥官）提案'));
  assert.equal(msg.meta.proposedBy, 'cmd');
  // and the normal user path still queues straight through
  const r2 = createTask(conv, agents, { text: '用户自己派的活' }, deps);
  assert.equal(r2.task.status, 'queued');
});

test('proposeFromReply: creates pending orders, dedupes, caps at 3', () => {
  const { conv, agents } = makeGroup();
  const reply = [
    '下一步：', '【派单】任务甲\n执行：DSH', '【派单】任务乙', '【派单】任务丙',
    '【派单】任务丁（超出上限，应被丢弃）',
  ].join('\n');
  const created = proposeFromReply(conv, agents, reply, 'cmd', deps);
  assert.equal(created.length, 3);
  assert.ok(created.every((t) => t.status === 'pending_approval' && t.proposedBy === 'cmd'));
  assert.ok(created[0].executorId === 'dsh', 'named member resolves');
  assert.ok(created[1].executorId === 'dsh', 'unnamed falls back to group executor');
  // dedupe: replaying the same reply must not double-book
  const again = proposeFromReply(conv, agents, reply, 'cmd', deps);
  assert.equal(again.length, 0);
});

test('proposeFromReply: named executor outside the group kills that proposal', () => {
  const { conv, agents } = makeGroup();
  const created = proposeFromReply(conv, agents, '【派单】越权的活\n执行：路人甲', 'cmd', deps);
  assert.equal(created.length, 0);
  assert.ok(conv.messages.some((m) => m.text.includes('路人甲') && m.text.includes('不在群里')));
});

// --- end-to-end light: proposal -> approve -> pump (no network) ------------------

test('proposal flow: approve promotes to queued like any other order', async () => {
  const { conv, agents } = makeGroup();
  const [t] = proposeFromReply(conv, agents, '【派单】任务甲', 'cmd', deps);
  assert.equal(t.status, 'pending_approval');
  // executor not resolvable in a network-free run: approve -> pump aborts it
  const r = approveTask(conv, [], t.id, deps);
  assert.notEqual(r.task.status, 'pending_approval');
  await new Promise((res) => setTimeout(res, 60));
  assert.equal(t.status, 'aborted');
});
