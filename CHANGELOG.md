# Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/); versioning is [SemVer](https://semver.org/).

## [1.2.0] - 2026-09-07

### Added

- **Per-turn cost footer**: every agent reply now carries its own usage — a compact "⚡ 4.2k tokens" line under the bubble, fed straight from the adapter's usage report (G-class CLI grand totals included; bridge agents whose credit meter lives inside their own product show nothing rather than a lie).
- **Global usage ledger**: new usage button next to the dispatch toggle opens a modal with today/month tokens & turns for every agent — sorted by burn, grand-total row, and an over-threshold highlight driven by `warnTokensDay`.
- **UI i18n**: zh/en runtime toggle (~55 keys, `data-i18n` attribute driven), persisted in `localStorage` with `navigator.language` fallback; stable channel keys keep sort order translation-independent.
- **Mobile tier (≤480px)**: off-canvas group drawer with backdrop, 34px touch targets, 16px input font (iOS zoom guard), safe-area composer padding.
- **Bilingual README**: English main entry + zh-CN edition, cross-linked; documents the local CLI agent surface, usage ledger and `/clear`.
- **G-class deep probe** (`/api/agents/probe` with `deep:true`): runs one real CLI round (30s cap) to catch the "process alive, model path dead" blind spot that a cheap ping cannot see. Heartbeats stay cheap; deep checks cost tokens only on demand.
- **`/clear`**: resets a group's model context — history stays visible, agents start from the marker.

### Fixed

- **npm test repaired**: the script still pointed at seven `scripts/` helpers deleted in the frontend split, so `npm test` died with MODULE_NOT_FOUND; replaced with bare `node --test` (auto-discovers `tests/*.test.mjs`). Four `usage.test.mjs` assertions reconciled with the G-class ledger semantics (`normalizeUsage` always returns `total`; the store persists it only when non-zero) — 76/76 green.
- **codex CLI "vanished" after a Temp cleanup**: a missing agent `cwd` makes Windows `spawn` fail with ENOENT *pointing at the exe*, which read like the binary was gone. The cwd is now recreated before spawn (CLI scratch dirs are disposable by design).

### Changed

- **Frontend split**: the 2,996-line `app.js` monolith became 13 ES modules (`core/api/status/state/center/space/settings/wizard/modals/flags/i18n/wire/boot`) with a loop-safe dependency graph — `core` is zero-dep and `wire` is imported only by `boot`, so DOM binding happens after every module is live. Cross-module mutable state goes through setters (ESM import bindings are read-only). Verified with `node --check` → module-import smoke → CDP headless (desktop + 390×844).

## [1.1.0] - 2026-09-06

### Added

- **Roles + commander dispatch channel**: role tags (指挥/执行/审核/参谋), `【派单】` parsing into work-order proposals that always pass user approval, execution lock so exec-class jobs are exclusive, and a hard gate that refuses dispatch creation during `discuss`/`await_confirm` stages.
- **Three-round deliberation engine**: independent proposals → rotating improvement passes → voting, with stuck-state detection.
- **Usage ledger v1**: per-agent daily buckets (tokens + turns, the boss's two gauges), 60-day retention, threshold warnings (yellow badge + once-a-day toast), adapter-visible token splits for A/B class and turn counts as the honest floor for C-class bridges.
- **L0 head auto-distill**: conversation heads are sunk into the knowledge base before budget trimming drops them.
- **Collapsible vertical space-tab rail** (knowledge / skills / ACL / monitoring).

[Unreleased]: https://github.com/zjl1989-li/Tmesh/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/zjl1989-li/Tmesh/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/zjl1989-li/Tmesh/compare/v1.0.1...v1.1.0

### Added

- **In-app updates** (Settings → About bar): one-click "check update" compares the running build against the latest GitHub release; "apply" runs a safety-railed git fast-forward (refuses dirty working trees and diverged history, never overwrites local changes) and restarts the server from the UI. Zero dependencies; poll-until-back reload in the frontend.

## [1.0.0] - 2026-09-05

First tagged release. Local-first, zero-dependency multi-agent group chat hub — one `node server/server.mjs`, no npm install.

### Added

- **Plugin adapters** (`server/adapters.d/`): drop one folder with a `plugin.json` manifest (id + `match.configKey` + module) and a default-exported adapter class to onboard any new agent — no core code changes. Manifest match outranks built-in type probing; broken plugins log and are skipped at boot, never fatal. A runnable example ships in `adapters.d/example/`; `GET /api/adapters/plugins` lists what is loaded.
- **Three-library UI** (left sidebar): Knowledge (search / preview / delete distilled notes), Skills (declarative JSON registration from the UI), ACL (grant / revoke / audit trail per group × agent × capability). Plus a one-click distill button (funnel icon) in the chat header that sinks the current group into the knowledge base.
- **Conversation-scoped adapters** — adapter instances are cached per `(agentId, convId)`: any native session state (DSH mirror session, MCP transport, bridge workspace) is isolated per group. One group = one project; context can no longer bleed across groups. Control-plane probes use their own instance.
- **Memory layer** (`server/memory/`, zero dependencies):
  - Knowledge base (L2): Obsidian-vault backend — distill-then-store writes append dated sections under the same title (distill, not stack, not delete); keyword search; traversal-safe paths. An ima cloud backend can plug into the same interface later.
  - Skills registry: declarative `skills.json` (each skill must carry a prompt or tools) — adding a skill is editing JSON, not code.
  - ACL: fail-closed, conversation-scoped grants with an audit trail (`grantedBy` + timestamp on every grant).
- **Memory engine pipes**:
  - L0 working-memory budget: context assembly trims oldest turns beyond `ctxBudgetChars` (default 12000), always keeping the turn being answered.
  - Distill pipe (L1 → L2): consensus conclusions are auto-written to the KB via the conclusion hook; whole-group digests or pinned messages via `POST /api/memory/distill`.
  - Retrieval pipe (L2 → L0): up to 3 KB hits for the turn prompt are injected as `recall` into every adapter class. A recall failure never fails a turn.
- **REST**: `/api/kb/*`, `/api/skills`, `/api/acl/*`, `/api/memory/distill`.
- **CI**: GitHub Actions matrix (Node 18/20/22 × Ubuntu/Windows), zero-install `npm test`.
- **Single-instance lock**: pid lockfile with liveness check, stale-lock takeover, and exit cleanup — tray + manual launch can no longer race on `data.json`.

### Fixed

- `/files` endpoint rejected POSIX absolute paths (`/tmp/...`); the guard only recognized Windows drive letters and UNC shares — caught by CI on Linux runners.
- MCP stdio client: a timed-out request now kills the child process tree (Windows `taskkill /T /F`, POSIX process group) with a hard 3s cap on the kill call, instead of leaving an orphaned server buffering stdout forever. A dead-pipe write can no longer hang a turn forever.
- MCP stdio timeouts never actually rejected the caller: the rejection referenced the promise executor's scoped `reject` from the timer callback (a `ReferenceError`), so a slow server only failed via the later close path. Rejections now resolve the same promise the caller awaits.
- An `unhandledRejection` (process-fatal on modern Node) fired on every MCP timeout because the `p.finally(clearTimeout)` derived promise re-raised the rejection unhandled; replaced with a settled two-branch `then`.
- Cross-platform listening-port enumeration (netstat / ss / lsof) replaces the Windows-only `netstat -ano` call in WorkBuddy ACP discovery; a configured port skips the scan entirely.
- DSH adapter keys its mirror-session state by conversation as defense-in-depth under the bus-level isolation.

### Changed

- Repository: dev probe scripts (`scripts/archive/`, 40 files) untracked and gitignored; runtime app data (`kb/`, `skills.json`, `acl.json`) gitignored.
- Model API agents accept per-agent `maxTokens` config; the field is only sent when configured (some providers reject explicit nulls).
- UI: all remaining emoji / text glyphs (✕ ✓ ⚠ ↓ ↻ ↗ ↳ ▾ ▴ ▸) replaced with inline SVG icons; the icon set gained x / chevup / arrowl / arrowr / ext / deleg / funnel / shield / book.

### Notes

- `scripts/archive/` files were present in early public history; they contain no secrets (`.env`/runtime data were ignored from the start) and history was not rewritten.
