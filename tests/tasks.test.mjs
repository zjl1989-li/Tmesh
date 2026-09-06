// Batch C regression: work-order state machine + executor resolution.
// No LLM/network: dispatch-dependent paths use an agents array that does not
// contain the executor, so runTask bails with status 'aborted' immediately.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, approveTask, rejectTask, cancelTask, reviewTask, abortTask } from '../server/tasks.mjs';
import { ensureRoles } from '../server/roles.mjs';

const noop = () => {};
const deps = { emit: noop, persist: noop };

function makeGroup() {
  const agents = [
    { id: 'dsh', name: 'DSH', adapterType: 'A' },
    { id: 'inv', name: '投研', adapterType: 'B' },
  ];
  const conv = { id: 'c1', memberIds: ['dsh', 'inv'], messages: [], approval: 'before' };
  ensureRoles(conv, agents);
  return { conv, agents };
}

test('createTask: executor resolution (explicit > role > error)', () => {
  const { conv, agents } = makeGroup();
  // explicit pick wins
  let r = createTask(conv, agents, { text: '改图标', executorId: 'dsh' }, deps);
  assert.equal(r.task.executorId, 'dsh');
  assert.equal(r.task.status, 'pending_approval'); // approval=before
  // explicit pick of a non-member is rejected
  r = createTask(conv, agents, { text: 'x', executorId: 'ghost' }, deps);
  assert.ok(r.error);
  // role fallback: dsh is the executor-kind member
  r = createTask(conv, agents, { text: '跑个脚本' }, deps);
  assert.equal(r.task.executorId, 'dsh');
  // empty text
  r = createTask(conv, agents, { text: '  ' }, deps);
  assert.ok(r.error);
});

test('createTask: approval=after skips the approval gate', () => {
  const { conv, agents } = makeGroup();
  conv.approval = 'after';
  const r = createTask(conv, agents, { text: '任务A' }, deps);
  assert.equal(r.task.status, 'queued');
});

test('state machine: wrong-state actions are rejected', () => {
  const { conv, agents } = makeGroup();
  const t = createTask(conv, agents, { text: '任务' }, deps).task;
  assert.ok(approveTask(conv, agents, 'no-such-id', deps).error);
  assert.ok(reviewTask(conv, agents, t.id, { ok: true }, deps).error); // not in review
  assert.ok(abortTask(conv, agents, t.id, deps).error); // not running
  assert.ok(rejectTask(conv, agents, t.id, deps).task.status, 'rejected');
  // reject twice fails
  assert.ok(rejectTask(conv, agents, t.id, deps).error);
});

test('cancel: queued and pending orders can be cancelled', () => {
  const { conv, agents } = makeGroup();
  const a = createTask(conv, agents, { text: '任务1' }, deps).task; // pending
  const r1 = cancelTask(conv, agents, a.id, deps);
  assert.equal(r1.task.status, 'cancelled');
  conv.approval = 'after';
  const b = createTask(conv, agents, { text: '任务2' }, deps).task; // queued
  assert.equal(cancelTask(conv, agents, b.id, deps).task.status, 'cancelled');
});

test('approve + pump: missing executor agent aborts the order (no network)', async () => {
  const { conv, agents } = makeGroup();
  const t = createTask(conv, agents, { text: '任务' }, deps).task;
  // pass an agents list without the executor: runTask cannot resolve it and
  // must mark the order aborted instead of dispatching anything. runTask runs
  // synchronously up to its first await, so the abort may already be applied
  // when approveTask returns.
  const r = approveTask(conv, [], t.id, deps);
  assert.notEqual(r.task.status, 'running');
  await new Promise((res) => setTimeout(res, 60));
  assert.equal(t.status, 'aborted');
});

test('review: verdict recorded with note', () => {
  const { conv, agents } = makeGroup();
  const t = createTask(conv, agents, { text: '任务' }, deps).task;
  t.status = 'review'; // force into review for the verdict step
  const r = reviewTask(conv, agents, t.id, { ok: true, note: '干得不错' }, deps);
  assert.equal(r.task.status, 'done');
  assert.equal(r.task.verdict.ok, true);
  assert.equal(r.task.verdict.note, '干得不错');
});

// Two-lane feedback split (boss's rule): reviewer audits the deliverable
// (code/security/bugs) BEFORE the commander does process retro; the audit
// verdict is quoted into the retro frame. Dispatch here hits dead localhost
// ports (fast local refusal, no external network), which is exactly what we
// want: the lanes still emit their system frames and run to completion.
test('feedback split: audit lane fires before commander retro lane', async () => {
  const agents = [
    { id: 'dsh', name: 'DSH', adapterType: 'A', config: { adapterType: 'A', ports: [59998, 59999] } },
    { id: 'aud', name: '审核员', adapterType: 'A', config: { adapterType: 'A', ports: [59997] } },
    { id: 'cmd', name: '指挥官', adapterType: 'A', config: { adapterType: 'A', ports: [59996] } },
  ];
  const conv = { id: 'c9', memberIds: ['dsh', 'aud', 'cmd'], messages: [], approval: 'before',
    memberRoles: { dsh: 'executor', aud: 'reviewer', cmd: 'commander' } };
  ensureRoles(conv, agents);
  const t = createTask(conv, agents, { text: '写个模块' }, deps).task;
  assert.equal(t.status, 'pending_approval');
  approveTask(conv, agents, t.id, deps); // -> queued + pump fires
  // Dead-port probes take a moment (per-port timeout); poll instead of a
  // fixed sleep so the test stays fast when refusal is instant.
  for (let i = 0; i < 100 && t.status === 'queued'; i++) {
    await new Promise((res) => setTimeout(res, 100));
  }
  for (let i = 0; i < 100 && conv.messages.every((m) => !(m.text || '').includes('[指挥复盘]')); i++) {
    await new Promise((res) => setTimeout(res, 100));
  }
  assert.equal(t.status, 'review');
  const auditIdx = conv.messages.findIndex((m) => (m.text || '').includes('[阶段审核]'));
  const retroIdx = conv.messages.findIndex((m) => (m.text || '').includes('[指挥复盘]'));
  assert.ok(auditIdx >= 0, 'audit frame missing');
  assert.ok(retroIdx > auditIdx, 'retro must come after audit');
  assert.equal(conv.messages[auditIdx].meta.reviewLane, 'audit');
  assert.equal(conv.messages[retroIdx].meta.reviewLane, 'retro');
  assert.ok(conv.messages[auditIdx].text.includes('代码审核'), 'audit scope must name code review');
  assert.ok(conv.messages[auditIdx].text.includes('安全审核'), 'audit scope must name security review');
});
