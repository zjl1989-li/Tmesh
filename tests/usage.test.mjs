// Usage ledger tests (tokens + turns, boss's two gauges).
//   - normalizeUsage: OpenAI / camelCase / CLI dialects -> {prompt, completion, total}
//     (total is always present: CLI agents report only a grand total, and a
//     stable shape keeps the ledger simple; 0 means "no total in this dialect")
//   - store.recordUsage: per-day buckets accumulate (total persisted only when
//     non-zero), 60-day cap, deleteAgent cleans up
// Uses the same sandbox trick as scripts/test-store.mjs: copy store.mjs into a
// throwaway temp dir so the real data.json is never touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { normalizeUsage } from '../server/adapters.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'server');
const dirs = [];
function sandbox(seed) {
  const dir = mkdtempSync(join(tmpdir(), 'tmesh-usage-'));
  dirs.push(dir);
  copyFileSync(join(SRC, 'store.mjs'), join(dir, 'store.mjs'));
  copyFileSync(join(SRC, 'agents.mjs'), join(dir, 'agents.mjs'));
  if (seed !== undefined) writeFileSync(join(dir, 'data.json'), seed, 'utf8');
  return import(pathToFileURL(join(dir, 'store.mjs')).href);
}

test('normalizeUsage: OpenAI snake_case dialect', () => {
  assert.deepEqual(normalizeUsage({ prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }), { prompt: 100, completion: 20, total: 120 });
});
test('normalizeUsage: camelCase (ACP usage_update) dialect', () => {
  // total is always present (0 when the dialect carries none) - keeps the
  // ledger shape stable across A/B/G classes.
  assert.deepEqual(normalizeUsage({ inputTokens: 7, outputTokens: 3 }), { prompt: 7, completion: 3, total: 0 });
});
test('normalizeUsage: null/empty/garbage -> null (turns still counted upstream)', () => {
  assert.equal(normalizeUsage(null), null);
  assert.equal(normalizeUsage({}), null);
  assert.equal(normalizeUsage({ model: 'x' }), null);
});
test('normalizeUsage: negative numbers are ignored, not trusted', () => {
  assert.deepEqual(normalizeUsage({ prompt_tokens: -5, completion_tokens: 9 }), { prompt: 0, completion: 9, total: 0 });
});

test('recordUsage: day bucket accumulates turns and tokens', async () => {
  const { store } = await sandbox();
  store.upsertAgent({ id: 'a', name: 'A' });
  store.recordUsage('a', { prompt: 100, completion: 10 }, 1);
  store.recordUsage('a', { prompt: 50, completion: 5 }, 1);
  store.recordUsage('a', null, 1); // bridge turn: no usage visible
  const day = new Date().toISOString().slice(0, 10);
  assert.deepEqual(store.usageOf('a')[day], { turns: 3, prompt: 150, completion: 15 });
});
test('recordUsage: agents without usage still get turn counts', async () => {
  const { store } = await sandbox();
  store.recordUsage('solo', null, 1);
  const day = new Date().toISOString().slice(0, 10);
  assert.equal(store.usageOf('solo')[day].turns, 1);
});
test('recordUsage: 60-day cap prunes oldest buckets', async () => {
  const { store } = await sandbox();
  store.upsertAgent({ id: 'a', name: 'A' });
  // First live write so usageOf returns the REAL bucket map (not the || {}
  // fallback copy), then backdate 61 buckets, then one more write -> 62 keys
  // must prune down to 60, dropping the two oldest.
  store.recordUsage('a', null, 1);
  const by = store.usageOf('a');
  for (let i = 61; i >= 1; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    by[d] = { turns: 1, prompt: 1, completion: 1 };
  }
  store.recordUsage('a', null, 1);
  const days = Object.keys(store.usageOf('a')).sort();
  assert.equal(days.length, 60);
  assert.equal(days[0], new Date(Date.now() - 59 * 86400000).toISOString().slice(0, 10));
});
test('deleteAgent: token ledger dies with the agent', async () => {
  const { store } = await sandbox();
  store.recordUsage('gone', { prompt: 1, completion: 1 }, 1);
  store.deleteAgent('gone');
  assert.deepEqual(store.usageOf('gone'), {});
  assert.deepEqual(store.allUsage(), {});
});
