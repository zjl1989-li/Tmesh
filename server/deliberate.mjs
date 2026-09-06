// Project deliberation engine (batch B): the boss-designed three-round
// negotiation with dissent-driven rework, plus the stage engine and the
// user's master controls (pause / resume / re-topic / force / terminate).
//
// Stages: discuss -> await_confirm -> execute -> review -> retro.
// Rounds:
//   R1  black-box parallel: every participant drafts a plan independently
//       (parallel dispatch means same-round siblings are naturally invisible).
//   R2  serial relay: ordered by R1 completion time (fastest first), member N
//       improves their plan against R1 output + all earlier improved plans.
//   R3  vote: everyone answers with an explicit marker. All agree -> ask the
//       user to confirm. Any dissent -> dissenters MUST provide critique +
//       improved proposal; those proposals rebase round 2 (max 2 cycles,
//       then the user adjudicates).
// User > process: pause at any gate, force-pass, terminate, re-topic.
//
// Resume model: `phase` is persisted AFTER each completed step, so an
// interrupted phase simply re-runs on resume (prior rounds stay in context,
// so nothing is lost - only the interrupted phase re-burns tokens).
//
// Reuses bus.dispatch per participant, so every adapter class works unchanged.
// Pure ESM, zero dependencies, ASCII only (content may be CJK).
import { dispatch } from './bus.mjs';
import { abort as abortAgent } from './runtime.mjs';

const MAX_CYCLES = 2;
const OPPOSE_RE = /【\s*反对\s*】|^\s*反对[:：]/;

// Vote parsing: a reply counts as dissent only when explicitly marked.
// Anything else (missing marker, rambling) reads as consent - the vote
// instruction tells members to start with 【同意】/【反对】.
export function isOppose(text) {
  return OPPOSE_RE.test(String(text || ''));
}

// In-memory controls (one running deliberation per conversation).
const controls = new Map(); // convId -> { paused, stopped }

export function deliberationControl(convId) {
  return controls.get(convId) || { paused: false, stopped: false };
}

function setControl(convId, patch) {
  const c = controls.get(convId) || { paused: false, stopped: false };
  controls.set(convId, { ...c, ...patch });
  return controls.get(convId);
}

const nameOf = (agents, id) => ((agents || []).find((a) => a.id === id) || { name: id }).name;

// Topic frame for R1: the product-development checklist the boss asked the
// deliberation to follow (requirements -> pain points -> divergence ->
// technical risks -> feasibility -> convergence).
function r1Instruction(topic) {
  return [
    `议题：${topic}`,
    '你是本次多 agent 方案协商的参与者之一（第 1 轮：独立提案）。',
    '请独立输出你的完整方案，按产品开发流程组织：',
    '① 需求澄清（这个议题到底要解决什么）；② 痛点与目标；③ 你的方案（主体）；',
    '④ 技术难点与依赖；⑤ 可行性与成本；⑥ 风险与备选。',
    '本轮各自独立发言，看不到其他成员的方案，请充分表达你自己的思路。',
  ].join('\n');
}

function r2Instruction(pos, total, rebased) {
  const seen = pos === 1
    ? '你已能看到第 1 轮全部成员的方案。'
    : `你已能看到第 1 轮全部成员的方案，以及第 2 轮中前 ${pos - 1} 位成员已改善的方案。`;
  return [
    rebased ? `【回炉改善】你是本群第 ${pos}/${total} 位发言。${seen} 请特别参考反对成员的改善方案。`
            : `第 2 轮：轮流改善（你是本群第 ${pos}/${total} 位发言）。${seen}`,
    '请吸收他方优点、修正自己方案的短板，输出一份【完整】的改善方案（不是只写差异）。',
    '直接给方案本身，不要再寒暄或重复流程说明。',
  ].join('\n');
}

function voteInstruction() {
  return [
    '第 3 轮：投票。请基于第 2 轮最后一位成员的方案投票：',
    '① 若你认可它作为最终方案，回复必须以【同意】开头（可附一句理由）；',
    '② 若你反对，回复必须以【反对】开头，并给出：明确的反对意见 + 你的改善方案（可执行的具体修改，不是空泛不满）。',
    '投票是严肃的：不要为了合群而同意，也不要为了刷存在感而反对。',
  ].join('\n');
}

function lastReplyOf(conv, agentId) {
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const m = conv.messages[i];
    if (m.sender === 'agent' && m.agentId === agentId && !m.error) return String(m.text || '');
  }
  return '';
}

// --- stage helpers -----------------------------------------------------------
export function setStage(conv, stage, emit, persist) {
  conv.stage = stage;
  if (persist) persist();
  if (emit) emit('stage', { convId: conv.id, stage });
}

// --- the engine ---------------------------------------------------------------
/**
 * Run the three-round deliberation. Resolves when the plan passes the vote
 * (stage -> await_confirm), when the user pauses/stops (status 'paused'), or
 * when the rework cap is hit (status 'stuck'). Never throws for user actions;
 * throws only on invalid preconditions.
 */
export async function runDeliberation({
  conv, agents, topic, participantIds, emit, persist, recordTool, settings, recall, resume = false,
}) {
  if (!resume && conv.deliberation && conv.deliberation.active) throw new Error('该群已有协商进行中');
  const parts = (participantIds && participantIds.length
    ? participantIds
    : (conv.memberIds || [])).map((id) => agents.find((a) => a.id === id)).filter(Boolean);
  if (parts.length < 2) throw new Error('协商至少需要 2 个参与 agent');

  const ctrl = setControl(conv.id, { paused: false, stopped: false });
  if (!resume) {
    conv.deliberation = {
      active: true, topic, cycle: 0, phase: 'round1', status: 'running',
      participants: parts.map((a) => a.id), order: [], startedAt: Date.now(),
    };
  } else {
    conv.deliberation.active = true;
    conv.deliberation.status = 'running';
  }
  setStage(conv, 'discuss', emit, persist);
  emit('negotiation', { convId: conv.id, negotiation: conv.deliberation });

  const frame = (kind, text, extra = {}) => {
    const msg = { id: mid(), sender: 'system', text, ts: Date.now(), meta: { consensus: true, kind, ...extra } };
    conv.messages.push(msg);
    persist();
    emit('message', { convId: conv.id, message: msg });
    return msg;
  };

  // Gate between phases / relay turns: stop and pause both unwind the loop at
  // the next checkpoint (pause = finish the in-flight step, then stop there;
  // stop = abort in-flight agent calls immediately). An interrupted phase is
  // simply re-run on resume - prior rounds stay in context.
  const gate = async () => {
    if (ctrl.stopped) throw new Error('__deliberation_stopped__');
    if (ctrl.paused) throw new Error('__deliberation_paused__');
  };

  const one = async (agent) => dispatch({
    conv, agents, toAgentId: agent.id, emit, persist, recordTool,
    settings: { ...settings, delegation: false }, recall,
  });

  const runR1 = async () => {
    frame('round', r1Instruction(topic), { deliberation: 'r1' });
    await Promise.all(parts.map(async (a) => {
      try { await one(a); } catch (e) { if (!aborted_(e)) throw e; }
    }));
    // Relay order = R1 completion time, fastest first (boss's rule).
    conv.deliberation.order = parts
      .map((a) => ({ id: a.id, ms: lastMsOf(conv, a.id) }))
      .filter((x) => x.ms > 0)
      .sort((x, y) => x.ms - y.ms)
      .map((x) => x.id);
    for (const p of parts) if (!conv.deliberation.order.includes(p.id)) conv.deliberation.order.push(p.id);
    conv.deliberation.phase = 'round2';
    persist();
  };

  const runR2 = async () => {
    const order = conv.deliberation.order.length ? conv.deliberation.order : parts.map((a) => a.id);
    const rebased = conv.deliberation.rebase;
    if (rebased) {
      frame('round', `第 2 轮（第 ${conv.deliberation.cycle} 次回炉）：上一轮投票有成员反对，请以反对成员的改善方案为基础重新轮流改善。`, { deliberation: 'r2', cycle: conv.deliberation.cycle });
    }
    let pos = 0;
    for (const id of order) {
      const a = parts.find((x) => x.id === id);
      if (!a) continue;
      pos++;
      await gate();
      // Per-member relay frame: lands in context, so every later member sees
      // both the instruction trail and the earlier improved plans.
      frame('round', r2Instruction(pos, order.length, rebased), { deliberation: 'r2', turn: id });
      try { await one(a); } catch (e) { if (!aborted_(e)) throw e; }
    }
    conv.deliberation.phase = 'round3';
    persist();
  };

  const runR3 = async () => {
    frame('round', voteInstruction(), { deliberation: 'r3', cycle: conv.deliberation.cycle });
    await Promise.all(parts.map(async (a) => {
      try { await one(a); } catch (e) { if (!aborted_(e)) throw e; }
    }));
    const votes = parts.map((a) => ({ id: a.id, oppose: OPPOSE_RE.test(lastReplyOf(conv, a.id)) }));
    const opps = votes.filter((v) => v.oppose);
    conv.deliberation.lastVotes = votes.map((v) => ({ agent: v.id, oppose: v.oppose }));
    if (!opps.length) {
      conv.deliberation.phase = 'confirm';
      conv.deliberation.status = 'passed';
      persist();
      return;
    }
    // Dissent: cap the rework loop, then hand the decision back to the user.
    if (conv.deliberation.cycle >= MAX_CYCLES) {
      conv.deliberation.status = 'stuck';
      persist();
      frame('control', [
        `协商已回炉 ${MAX_CYCLES} 次仍有反对票（${opps.map((v) => nameOf(agents, v.id)).join('、')}），按规则交由用户裁决。`,
        '可选：直接拍板采纳当前方案 / 改议题重开 / 终止协商。',
      ].join('\n'), { deliberation: 'stuck' });
      return;
    }
    conv.deliberation.cycle++;
    // Rebase material: the dissenters' explicit improved proposals.
    conv.deliberation.rebase = opps.map((v) => ({ agent: v.id, text: lastReplyOf(conv, v.id).slice(0, 4000) }));
    frame('control', `反对票：${opps.map((v) => nameOf(agents, v.id)).join('、')}。其反对意见与改善方案已列入下一轮改善基础。`, { deliberation: 'rebase' });
    conv.deliberation.phase = 'round2';
    persist();
  };

  try {
    let guard = 0;
    while (guard++ < 20) {
      const d = conv.deliberation;
      if (d.status === 'stuck' || d.status === 'passed' || ctrl.stopped || ctrl.paused) break;
      await gate();
      if (d.phase === 'round1') await runR1();
      else if (d.phase === 'round2') await runR2();
      else if (d.phase === 'round3') await runR3();
      else break; // 'confirm' handled by the HTTP confirm endpoint
    }
  } catch (e) {
    if (!aborted_(e)) throw e;
  } finally {
    if (ctrl.stopped || ctrl.paused) {
      conv.deliberation.status = 'paused';
      // Pause keeps the session resumable (active=true); stop closes it.
      if (ctrl.stopped) conv.deliberation.active = false;
      frame('control', ctrl.stopped
        ? '协商已被用户中止（当前进度已保留，可改议题重开）。'
        : '协商已在检查点暂停（已完成轮次全部保留，可继续/改议题/终止）。', { deliberation: 'paused' });
      emit('negotiation', { convId: conv.id, negotiation: conv.deliberation });
      controls.delete(conv.id);
    } else {
      emit('negotiation', { convId: conv.id, negotiation: conv.deliberation });
      controls.delete(conv.id);
    }
  }

  // Passed: hand the decision to the user (the confirm gate).
  if (conv.deliberation.status === 'passed') {
    const plan = lastReplyOf(conv, conv.deliberation.order[conv.deliberation.order.length - 1] || '');
    frame('confirm', [
      '方案已通过全员投票。最终方案如下：', '',
      plan.slice(0, 6000), '',
      '是否按此方案进入执行阶段？请在下方选择【确认执行】或【打回重议】。',
    ].join('\n'), { deliberation: 'confirm', confirm: true });
    setStage(conv, 'await_confirm', emit, persist);
  }
}

/** User master controls. Each is a small, honest state edit. */
export async function controlDeliberation(conv, agents, action, payload, { emit, persist, recordTool, settings, recall }) {
  const d = conv.deliberation;
  if (!d) throw new Error('该群没有协商记录');
  if (action === 'stop') {
    setControl(conv.id, { paused: false, stopped: true });
    for (const id of d.participants || []) { try { abortAgent(id); } catch { /* not running */ } }
    return { ok: true, note: '已中止' };
  }
  if (action === 'pause') {
    setControl(conv.id, { paused: true });
    return { ok: true, note: '将在当前步骤结束的检查点暂停' };
  }
  if (action === 'resume') {
    if (d.status !== 'paused') return { ok: false, note: '协商不在暂停状态' };
    setControl(conv.id, { paused: false, stopped: false });
    d.status = 'running';
    d.active = true;
    persist();
    emit('negotiation', { convId: conv.id, negotiation: d });
    // Re-enter the loop at the persisted phase (resume=true keeps cycle/order).
    runDeliberation({ conv, agents, topic: d.topic, participantIds: d.participants, emit, persist, recordTool, settings, recall, resume: true })
      .catch((e) => console.error('[deliberation] resume failed:', e.message));
    return { ok: true, note: '已继续' };
  }
  if (action === 'confirm') {
    if (conv.stage !== 'await_confirm') return { ok: false, note: '当前不在待确认阶段' };
    const ok = !!(payload && payload.ok);
    if (ok) {
      setStage(conv, 'execute', emit, persist);
      sysMsg(conv, emit, persist, '用户已确认方案，进入执行阶段。', { deliberation: 'confirmed' });
      conv.deliberation.active = false;
      controls.delete(conv.id);
      persist();
      // Commander kickoff (boss's design): after the user confirms, the
      // commander proposes the first batch of work orders via 【派单】
      // markers; every proposal lands in pending_approval - the user stays
      // the sole approver. Fire-and-forget: the HTTP reply must not block on
      // an agent turn.
      const commander = memberWithRole(conv, agents, 'commander');
      if (commander) {
        sysMsg(conv, emit, persist, [
          `[指挥开工] 指挥 ${commander.name} 请根据最终方案提出第一批派工单提案。`,
          '格式：每条以【派单】开头写明任务，可注明「执行：成员名」。提案须经用户审批后才会执行。',
        ].join('\n'), { deliberation: 'commander-kickoff' });
        (async () => {
          try {
            const ts = Date.now();
            await dispatch({
              conv, agents, toAgentId: commander.id, emit, persist, recordTool,
              settings: { ...settings, delegation: false }, recall,
            });
            proposeFromReply(conv, agents, lastReplyOf(conv, commander.id, ts), commander.id, { emit, persist });
          } catch (e) {
            console.error('[deliberation] commander kickoff failed:', e.message);
          }
        })();
      }
      return { ok: true, note: '已确认，进入执行' };
    }
    setStage(conv, 'discuss', emit, persist);
    sysMsg(conv, emit, persist, '用户打回了方案。' + (payload && payload.note ? `用户意见：${payload.note}` : '请根据用户意见重新商议。'), { deliberation: 'rejected' });
    conv.deliberation.active = false;
    controls.delete(conv.id);
    persist();
    return { ok: true, note: '已打回' };
  }
  if (action === 'adjudicate') {
    if (d.status !== 'stuck') return { ok: false, note: '协商不处于待裁决状态' };
    const choice = payload && payload.choice;
    if (choice === 'force') {
      d.status = 'passed'; d.phase = 'confirm';
      runDeliberation({ conv, agents, topic: d.topic, participantIds: d.participants, emit, persist, recordTool, settings, recall })
        .catch((e) => console.error('[deliberation] adjudicate failed:', e.message));
      return { ok: true, note: '已拍板：按当前方案走确认门' };
    }
    // terminate (default)
    d.status = 'terminated'; d.active = false;
    controls.delete(conv.id);
    setStage(conv, 'idle', emit, persist);
    sysMsg(conv, emit, persist, '协商已由用户终止。', { deliberation: 'terminated' });
    return { ok: true, note: '已终止' };
  }
  return { ok: false, note: '未知操作' };
}

function sysMsg(conv, emit, persist, text, extra = {}) {
  const msg = { id: mid(), sender: 'system', text, ts: Date.now(), meta: { consensus: true, ...extra } };
  conv.messages.push(msg);
  persist();
  emit('message', { convId: conv.id, message: msg });
  return msg;
}

function lastMsOf(conv, agentId) {
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const m = conv.messages[i];
    if (m.sender === 'agent' && m.agentId === agentId && !m.error) return m.ms || 0;
  }
  return 0;
}

function aborted_(e) {
  const s = String((e && e.message) || e);
  return s.includes('__deliberation_stopped__') || s.includes('__deliberation_paused__') || s.includes('abort');
}

// Lazy import hoisted to the top (see imports).

function mid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
