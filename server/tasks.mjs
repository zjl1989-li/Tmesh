// Task dispatch engine (batch C): explicit work orders with an exclusive
// execution lock per group.
//
// The boss's rule: a local-operation job must have exactly ONE executor.
// "帮我改图标" dispatched to both DSH and WorkBuddy means one overwrites the
// other - pure waste. So tasks are explicit (the user names the executor or
// the group's default one is used), gated by the group's approval switch,
// run under a per-conv lock, and queued FIFO while the lock is held.
//
// Feedback loop: when the executor finishes, the result is announced to the
// group and the commander role gets an automatic review turn so it can plan
// the next step. The user then accepts (done) or asks for rework (a new task).
//
// Pure ESM, zero dependencies, ASCII only (content may be CJK).
import { dispatch } from './bus.mjs';
import { isRunning, abort as abortAgent } from './runtime.mjs';
import { memberWithRole } from './roles.mjs';

// convId -> boolean: re-entrancy guard for the queue pump.
const pumping = new Map();

export const TASK_STATUS = {
  pending_approval: '待审批',
  queued: '排队中',
  running: '执行中',
  review: '待验收',
  done: '已完成',
  rejected: '已拒绝',
  cancelled: '已取消',
  aborted: '已中断',
};

function sysMsg(conv, emit, persist, text, meta = {}) {
  const msg = { id: mid(), sender: 'system', text, ts: Date.now(), meta: { task: true, ...meta } };
  conv.messages.push(msg);
  persist();
  emit('message', { convId: conv.id, message: msg });
  return msg;
}

const nameOf = (agents, id) => ((agents || []).find((a) => a.id === id) || { name: id }).name;

function findTask(conv, tid) {
  return (conv.tasks || []).find((t) => t.id === tid) || null;
}

/** Create a work order. Returns { task, error }. */
export function createTask(conv, agents, { text, executorId }, { emit, persist }) {
  if (!String(text || '').trim()) return { error: '任务内容不能为空' };
  // Resolve the executor: explicit pick wins, else the group's executor role,
  // else any executor-kind member (roles.mjs fallback).
  let exec = null;
  if (executorId) {
    if (!(conv.memberIds || []).includes(executorId)) return { error: '执行 agent 不在群里' };
    exec = agents.find((a) => a.id === executorId);
  } else {
    exec = memberWithRole(conv, agents, 'executor');
  }
  if (!exec) return { error: '群里没有可执行本地操作的 agent（先在群设置里把角色设为「执行」）' };

  conv.tasks = conv.tasks || [];
  const task = {
    id: mid(),
    text: String(text).trim(),
    executorId: exec.id,
    status: conv.approval === 'after' ? 'queued' : 'pending_approval',
    createdAt: Date.now(),
    seq: conv.tasks.length + 1,
  };
  conv.tasks.push(task);
  persist();
  sysMsg(conv, emit, persist, [
    `派工单 #${task.seq}：${task.text}`,
    `执行：${exec.name} · 状态：${TASK_STATUS[task.status]}`,
    conv.approval === 'before' ? '等待用户审批（本群设置为执行前审批）。' : '本群设置为执行后验收，已进入队列。',
  ].join('\n'), { taskCard: task.id, taskStatus: task.status });
  return { task };
}

/** Approve a pending work order -> queued -> pump. */
export function approveTask(conv, agents, tid, { emit, persist }) {
  const t = findTask(conv, tid);
  if (!t) return { error: '派工单不存在' };
  if (t.status !== 'pending_approval') return { error: `当前状态（${TASK_STATUS[t.status]}）不可审批` };
  t.status = 'queued';
  t.approvedAt = Date.now();
  persist();
  sysMsg(conv, emit, persist, `派工单 #${t.seq} 已批准，进入执行队列。`, { taskCard: t.id, taskStatus: t.status });
  pump(conv, agents, depsOf(conv));
  return { task: t };
}

/** Reject a pending order. */
export function rejectTask(conv, agents, tid, { emit, persist }) {
  const t = findTask(conv, tid);
  if (!t) return { error: '派工单不存在' };
  if (t.status !== 'pending_approval') return { error: `当前状态（${TASK_STATUS[t.status]}）不可拒绝` };
  t.status = 'rejected';
  persist();
  sysMsg(conv, emit, persist, `派工单 #${t.seq} 已被用户拒绝。`, { taskCard: t.id, taskStatus: t.status });
  return { task: t };
}

/** Cancel a queued order (running ones must be aborted instead). */
export function cancelTask(conv, agents, tid, { emit, persist }) {
  const t = findTask(conv, tid);
  if (!t) return { error: '派工单不存在' };
  if (t.status !== 'queued' && t.status !== 'pending_approval') return { error: `当前状态（${TASK_STATUS[t.status]}）不可取消` };
  t.status = 'cancelled';
  persist();
  sysMsg(conv, emit, persist, `派工单 #${t.seq} 已取消。`, { taskCard: t.id, taskStatus: t.status });
  return { task: t };
}

/** User verdict after execution: done (with optional note) or rework note. */
export function reviewTask(conv, agents, tid, { ok, note }, { emit, persist }) {
  const t = findTask(conv, tid);
  if (!t) return { error: '派工单不存在' };
  if (t.status !== 'review') return { error: `当前状态（${TASK_STATUS[t.status]}）不可验收` };
  t.status = 'done';
  t.verdict = { ok: !!ok, note: String(note || '').slice(0, 2000), at: Date.now() };
  persist();
  sysMsg(conv, emit, persist, [
    `派工单 #${t.seq} 验收${ok ? '通过' : '未通过'}。`,
    note ? `用户意见：${note}` : '',
    ok ? '' : '需要重做的部分请重新派工（可引用用户意见）。',
  ].filter(Boolean).join('\n'), { taskCard: t.id, taskStatus: t.status });
  return { task: t };
}

/** User hard-interrupt: abort the executor's in-flight turn, release the lock. */
export function abortTask(conv, agents, tid, { emit, persist }) {
  const t = findTask(conv, tid);
  if (!t) return { error: '派工单不存在' };
  if (t.status !== 'running') return { error: `当前状态（${TASK_STATUS[t.status]}）不可中断` };
  try { abortAgent(t.executorId); } catch { /* not running */ }
  t.status = 'aborted';
  t.finishedAt = Date.now();
  persist();
  sysMsg(conv, emit, persist, `派工单 #${t.seq} 已被用户中断，执行锁已释放（已完成部分保留在群里）。`, { taskCard: t.id, taskStatus: t.status });
  pump(conv, agents, depsOf(conv));
  return { task: t };
}

// Deps cache: pump needs the same callbacks across calls; store per conv so
// callers only pass them once at create/approve time.
const deps = new Map();
function depsOf(conv) { return deps.get(conv.id) || {}; }
export function setDeps(convId, d) { deps.set(convId, d); }

/**
 * Queue pump: start the next queued task if the lock is free and the executor
 * is idle. Fire-and-forget by design - callers never await it.
 */
export function pump(conv, agents, depsIn = {}) {
  if (pumping.get(conv.id)) return;
  const lockHeld = (conv.tasks || []).some((t) => t.status === 'running');
  if (lockHeld) return;
  const next = (conv.tasks || []).find((t) => t.status === 'queued');
  if (!next) return;
  if (isRunning(next.executorId)) return; // executor busy with a chat turn: wait for the next pump
  pumping.set(conv.id, true);
  runTask(conv, agents, next, depsIn).finally(() => {
    pumping.delete(conv.id);
    // chain: start the next queued order, if any
    pump(conv, agents, depsIn);
  });
}

async function runTask(conv, agents, task, depsIn) {
  const { emit = () => {}, persist = () => {}, recordTool, settings = {}, recall } = depsIn;
  const exec = agents.find((a) => a.id === task.executorId);
  if (!exec) { task.status = 'aborted'; return; }
  task.status = 'running';
  task.startedAt = Date.now();
  persist();
  sysMsg(conv, emit, persist, `派工单 #${task.seq} 开始执行（执行锁已持有，后续派工自动排队）。`, { taskCard: task.id, taskStatus: 'running' });

  const started = Date.now();
  try {
    await dispatch({
      conv, agents, toAgentId: task.executorId, emit, persist, recordTool,
      settings: { ...settings, delegation: false }, recall,
    });
  } catch (e) {
    console.error('[tasks] dispatch failed:', e.message);
  }
  // The user may have aborted (or otherwise moved) the task mid-flight - an
  // interrupted order must NOT be forced into review.
  if (task.status !== 'running') return;
  const reply = lastReplyOf(conv, task.executorId, started);
  task.finishedAt = Date.now();
  task.status = 'review';
  task.result = (reply || '').slice(0, 4000);
  persist();
  sysMsg(conv, emit, persist, [
    `派工单 #${task.seq} 执行完成，等待用户验收。`,
    reply ? `执行结果摘要：${reply.replace(/\s+/g, ' ').slice(0, 300)}` : '（执行 agent 没有返回有效内容）',
  ].join('\n'), { taskCard: task.id, taskStatus: 'review' });

  // Feedback loop, two SEPARATE lanes (boss's rule: audit quality is not the
  // commander's job, scheduling is not the reviewer's):
  //   Lane 1 (reviewer): stage quality gate - code review, security review,
  //     bug hunting on the actual deliverable.
  //   Lane 2 (commander): process retro - reads the executor's result AND the
  //     reviewer's verdict if present, then plans the next move. Never asked
  //     to audit code itself.
  const reviewer = memberWithRole(conv, agents, 'reviewer');
  let verdict = '';
  if (reviewer && reviewer.id !== task.executorId) {
    sysMsg(conv, emit, persist, [
      `[阶段审核] 派工单 #${task.seq}（${task.text}）执行完成，请审核 agent ${nameOf(agents, task.executorId)} 的产出：`,
      '',
      (reply || '（无返回内容）').slice(0, 6000),
      '',
      [
        '审核范围（按优先级）：',
        '1. 代码审核：逻辑正确性、边界条件、异常处理、可维护性；',
        '2. 安全审核：注入/越权/敏感信息泄露/依赖风险等；',
        '3. Bug 排查：能否复现、根因、修复建议；',
        '4. 与派工单要求的符合度。',
      ].join('\n'),
      '输出格式：【通过】或【不通过】+ 问题清单（每条：位置/严重度/建议）。不评审流程与调度，那是指挥的职责。',
    ].join('\n'), { taskReview: task.id, taskStatus: 'review', reviewLane: 'audit' });
    try {
      await dispatch({
        conv, agents, toAgentId: reviewer.id, emit, persist, recordTool,
        settings: { ...settings, delegation: false }, recall,
      });
      // Pick up the reviewer's latest reply so the commander retro can quote it.
      verdict = lastReplyOf(conv, reviewer.id, task.finishedAt) || '';
    } catch (e) {
      console.error('[tasks] reviewer audit failed:', e.message);
    }
  }

  const commander = memberWithRole(conv, agents, 'commander');
  if (commander && commander.id !== task.executorId) {
    sysMsg(conv, emit, persist, [
      `[指挥复盘] 执行 agent ${nameOf(agents, task.executorId)} 已完成派工单 #${task.seq}（${task.text}）。`,
      verdict ? `审核结论（供参考，调度时请考虑是否需返工）：${verdict.replace(/\s+/g, ' ').slice(0, 800)}` : '',
      '',
      '请复盘流程与进度：目标是否达成、下一步安排建议（派新单 / 退回重做 / 交付用户验收）。用户拥有最终审批权；代码与安全质量以审核 lane 的结论为准，你不需要自行审查代码。',
    ].filter(Boolean).join('\n'), { taskReview: task.id, taskStatus: 'review', reviewLane: 'retro' });
    try {
      await dispatch({
        conv, agents, toAgentId: commander.id, emit, persist, recordTool,
        settings: { ...settings, delegation: false }, recall,
      });
    } catch (e) {
      console.error('[tasks] commander review failed:', e.message);
    }
  }
}

function lastReplyOf(conv, agentId, sinceTs) {
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const m = conv.messages[i];
    if (m.sender === 'agent' && m.agentId === agentId && !m.error && m.ts >= (sinceTs || 0)) {
      return String(m.text || '');
    }
  }
  return '';
}

function mid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
