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
