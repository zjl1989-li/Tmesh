// Built-in agent registry. Adapter selection lives in adapters.mjs.
// Pure ESM, no dependencies. ASCII only.
//
// EMPTY by boss's order (2026-09-06): the previous 4 seeded agents were never
// wanted - "invest" was a persona, not an agent, and deleted ones kept coming
// back via this seed. The agent list is 100% user-added from the UI now.
//
// `skills` is a DECLARATION typed by hand, not verified fact. DSH exposes no
// capability-listing RPC, so the only honest source is what the agent is
// observed doing: store.toolStats counts real tool/call events (see bus.mjs).
// Both are shown in the settings card, labelled 已装技能 vs 实测能力.
//
// `kind`: advisor = no local reach (analyses, advises, commands);
//         executor = can operate the local machine (DSH tool chain, bridges).
// `notes`: free-text capability dossier (manual observations feed role advice).
//
// config.adapterType: 'A' = DSH Typert RPC, 'B' = OpenAI model API,
//                    'C' = Bridge Adapter (file-bridge, closed-source product).
//
// Shape reference for user-added agents (kept so the settings UI and future
// onboarding keep a contract to build against):
// {
//   id, name, role, color, system, model, adapterType, status, guiPath,
//   skills: [], kind: 'advisor' | 'executor', notes: '',
//   config: { adapterType, model, apiKeyEnv }          // B type
//   config: { adapterType: 'A', cwd, ports }           // A type
//   config: { adapterType: 'C', localDir, pollMs, maxWaitMs, launcher } // C type
// }
const DEFAULT_AGENTS = [];

export { DEFAULT_AGENTS };
