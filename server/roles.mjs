// Group-member role tagging (batch A).
// Two layers, both cheap and explicit:
//   1. GLOBAL kind on the agent record: 'advisor' (no local ops; analyses,
//      advises, commands) vs 'executor' (has tool-chain / local reach).
//      Guessed from the adapter class, editable in the UI, never sacred.
//   2. PER-GROUP role in conv.memberRoles: { agentId: role }. The same agent
//      can command group A and execute in group B; swapping a role mid-flight
//      is a group-setting edit, not a global change.
// Roles: commander (process retro + dispatch, never audits code),
//        executor (does local work),
//        reviewer (stage quality gate: code review, security review, bug
//          hunting on the deliverable - NOT process/scheduling),
//        advisor (analyses / deliberates).
// Commander-retro and reviewer-audit are separate lanes on task completion
// (tasks.mjs): audit first, its verdict feeds the commander's scheduling.
// Pure ESM, zero dependencies, ASCII only (labels may be CJK).

export const ROLES = ['commander', 'executor', 'reviewer', 'advisor'];
export const ROLE_LABEL = {
  commander: '指挥',
  executor: '执行',
  reviewer: '审核',
  advisor: '参谋',
};
export const KINDS = ['advisor', 'executor'];
export const KIND_LABEL = { advisor: '参谋（无本地操作）', executor: '执行（可操作本地）' };

// Auto-guess the global kind from the adapter class. 'A' = DSH (tool chain,
// local cwd), 'C' = bridge adapter (drives a local product). Both can reach
// the machine; 'B' (plain model API) cannot.
export function guessKind(agent) {
  const t = agent && (agent.config && agent.config.adapterType || agent.adapterType);
  return (t === 'A' || t === 'C') ? 'executor' : 'advisor';
}

// Auto role for a member joining a group: executors execute, everything else
// deliberates. Commander/reviewer are judgement calls the user (or habit)
// assigns - we never guess authority.
export function guessRole(agent) {
  return guessKind(agent) === 'executor' ? 'executor' : 'advisor';
}

// Fill in memberRoles for members that lack an entry (new join, or a legacy
// group predating roles). Manual assignments are NEVER overwritten. Mutates
// conv.memberRoles in place and returns it.
export function ensureRoles(conv, agents) {
  if (!conv.memberRoles || typeof conv.memberRoles !== 'object') conv.memberRoles = {};
  for (const id of conv.memberIds || []) {
    if (conv.memberRoles[id]) continue;
    const a = (agents || []).find((x) => x.id === id);
    conv.memberRoles[id] = a ? guessRole(a) : 'advisor';
  }
  // Drop roles of members that left.
  for (const id of Object.keys(conv.memberRoles)) {
    if (!(conv.memberIds || []).includes(id)) delete conv.memberRoles[id];
  }
  return conv.memberRoles;
}

// First member holding a role (or falling back to kind / any member).
export function memberWithRole(conv, agents, role) {
  const ids = conv.memberIds || [];
  const roles = conv.memberRoles || {};
  const byRole = ids.filter((id) => roles[id] === role);
  if (byRole.length) return agents.find((a) => a.id === byRole[0]) || null;
  // Fallbacks: a commander may be any advisor-kind member; an executor any
  // executor-kind member. Without a fallback a group with no explicit role
  // could never dispatch, which would make the whole engine decorative.
  if (role === 'commander') return agents.find((a) => ids.includes(a.id) && guessKind(a) === 'advisor') || null;
  if (role === 'executor') return agents.find((a) => ids.includes(a.id) && guessKind(a) === 'executor') || null;
  return null;
}

// All members holding a role (order follows the member list).
export function membersWithRole(conv, agents, role) {
  const roles = conv.memberRoles || {};
  return (conv.memberIds || [])
    .filter((id) => roles[id] === role)
    .map((id) => agents.find((a) => a.id === id))
    .filter(Boolean);
}
