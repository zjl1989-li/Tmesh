# Tmesh

[![CI](https://github.com/zjl1989-li/Tmesh/actions/workflows/ci.yml/badge.svg)](https://github.com/zjl1989-li/Tmesh/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Put every AI agent you own into one group chat.** DSH, DeepSeek, WorkBuddy/CodeBuddy, MCP servers, desktop apps, local CLIs — whether or not they expose an API, they can join a group, get @-mentioned, take tasks, and ship artifacts back.

> One group = multiple agents + you. One group = one project: session memory is isolated per group and never bleeds.

[English](README.md) | [简体中文](README.zh-CN.md)

## What makes it different

Tools that assemble agents almost always only accept "official-API" ones. Tmesh's core is a **closed-source agent bridging layer**:

| Surface | Mechanism | Example |
|---|---|---|
| Self-hosted RPC | Native session API with live event streams | [DSH](https://github.com/zjl1989-li/dsh-harness-zh) joins a group headlessly |
| Model API | OpenAI-compatible endpoints | DeepSeek / any compatible gateway |
| Closed-source desktop ACP | Drives desktop apps via ACP remote control | WorkBuddy (Tencent CodeBuddy) |
| Closed-source CLI | Official API key + CLI headless mode | CodeBuddy CLI |
| **Local CLI agent** | Spawns a local CLI per turn (probe incl. one real roundtrip) | `codex exec` through a local relay |
| File bridge | Pure file drop/pickup — zero intrusion, most reliable | Any product that can read/write a local folder |
| MCP / A2A / AG-UI | Standard protocol adapters | MCP servers, open-protocol agents |
| Desktop GUI | Auto-launch + file-bridge artifact return | Local desktop apps |
| Plugins | Drop a folder into `adapters.d/` to add a new agent | [Example plugin](server/adapters.d/example/) |

Plus a **memory engine** — it's not just message forwarding:

```
Conversation stream (L1, isolated per group) --distill--> Knowledge base (L2, local Obsidian .md)
Knowledge base (L2) --recall-inject--> Per-turn context (L0, char budget)
```

- **L0 working memory**: context is trimmed to a `ctxBudgetChars` budget; old turns are folded away before tokens run wild. `/clear` in a group resets the model context instantly (the transcript stays visible — only what agents see is cut).
- **L1 episodic memory**: adapter instances are keyed by `(agent, group)` — one group, one project, no cross-talk.
- **L2 semantic memory**: one-click distillation (funnel icon in the top bar) settles group conclusions into Obsidian notes, appending dated sections by title — accumulate, don't stack, never hard-delete. Consensus conclusions auto-archive.
- **Skills / Permissions**: skills register declaratively as JSON; permissions are granted per (group × agent × capability), deny-by-default, fully audited.
- **Usage ledger**: per-agent tokens + turns per day/month — API adapters report prompt/completion splits, CLI agents report their grand total, and each agent card shows today/month at a glance with threshold warnings.

## Quick start

Requires Node.js ≥ 18. No `npm install`, no database, no Docker.

```bash
git clone https://github.com/zjl1989-li/Tmesh.git
cd tmesh
cp .env.example .env   # fill in DEEPSEEK_API_KEY / CODEBUDDY_API_KEY as needed
node server/server.mjs
# open http://127.0.0.1:8787
```

System-tray resident mode (optional, Windows + PowerShell 5.1): run `desktop/tray.ps1`. Right-click the tray icon to open/exit; a 30s watchdog restarts the service automatically.

**In-app updates**: check the latest GitHub release from the settings dialog; if a new version exists you can update safely inside the UI (rejects dirty worktrees / forked history, fast-forward-only + self-restart — local changes are never overwritten).

## The three libraries (left sidebar)

- **Knowledge base**: search / preview / delete distilled notes (local Obsidian `.md` repo under `server/kb/` — open that folder in Obsidian and it *is* your knowledge base)
- **Skills**: declarative skill manifests agents can invoke per task; adding a skill = editing JSON, not code
- **Permissions**: who can use what, in which group. Deny by default; grant / revoke / audit trails at a glance

## Architecture at a glance

```
server/              zero-dependency Node ESM backend
  server.mjs           HTTP service (REST + SSE + static files + image proxy + hardening)
  store.mjs            JSON store (in-memory + snapshot + corruption guard + avatar offload)
  bus.mjs              message bus (@-mention routing, per-group adapters, L0 budget, recall)
  adapters.mjs         eight built-in adapter classes + plugin loader (adapters.d/)
  memory/
    knowledge.mjs        knowledge base (Obsidian .md, sediment-style writes + search)
    skills.mjs           skills (declarative skills.json)
    acl.mjs              permissions (fail-closed + audit trail)
    distill.mjs          distiller (L1→L2: group digests / pinned messages → KB notes)
  adapters.d/            plugin adapter dir (plugin.json manifest + module, see example/)
public/              pure static frontend (vanilla JS, no framework; SVG icons, no emoji)
desktop/             tray manager (PowerShell WinForms)
tests/               node:test unit tests (isolation / libraries / plugins / memory engine)
```

- The server binds `127.0.0.1` only, with Host-header checks (DNS-rebinding), SSRF interception, and static path-traversal protection
- All runtime data lives in `server/data.json` (auto-created on first boot); runtime data never leaves the machine

## Write a plugin adapter

Plug in any new agent without touching core code:

```
server/adapters.d/my-agent/
  plugin.json   → { "id": "my-agent", "match": { "configKey": "myAgent" }, "module": "./adapter.mjs" }
  adapter.mjs   → export default class { constructor(agent) meta() ping() send() }
```

Any agent with `config: { "myAgent": {...} }` then routes through your adapter. See the fully working reference at [`server/adapters.d/example/`](server/adapters.d/example/).

## Tests

```bash
npm test           # full regression (scripts + unit tests, 40+ cases; CI matrix Node 18/20/22 × Ubuntu/Windows)
npm run test:unit  # node:test unit tests
```

## Security notes

- Do not expose the server port to the public internet; for LAN access, add a reverse proxy and auth yourself
- Agent API keys are injected via `.env` or agent config — never commit them
- The knowledge base lands in local `server/kb/` by default; if you wire in a cloud backend yourself, keep sensitive memories off-cloud

## License

[MIT](LICENSE)
