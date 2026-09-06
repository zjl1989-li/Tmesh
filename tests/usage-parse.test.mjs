// Unit tests for usage normalizing / CLI usage parsing (pure functions).
// node:test + node:assert only. ASCII only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsage, parseCliUsage, CliAdapter } from '../server/adapters.mjs';

test('normalizeUsage: openai dialect maps to prompt/completion', () => {
  assert.deepEqual(normalizeUsage({ prompt_tokens: 10, completion_tokens: 3 }), { prompt: 10, completion: 3, total: 0 });
});

test('normalizeUsage: camelCase dialect maps too', () => {
  assert.deepEqual(normalizeUsage({ inputTokens: 7, outputTokens: 2 }), { prompt: 7, completion: 2, total: 0 });
});

test('normalizeUsage: total-only (CLI) survives with zero split', () => {
  assert.deepEqual(normalizeUsage({ total_tokens: 13 }), { prompt: 0, completion: 0, total: 13 });
  assert.deepEqual(normalizeUsage({ total: 5 }), { prompt: 0, completion: 0, total: 5 });
});

test('normalizeUsage: nothing numeric -> null (turns still counted)', () => {
  assert.equal(normalizeUsage(null), null);
  assert.equal(normalizeUsage('nonsense'), null);
  assert.equal(normalizeUsage({}), null);
});

test('parseCliUsage: codex exec "tokens used" tail is parsed', () => {
  const out = 'OpenAI Codex v0.153.0-alpha.5\n--------\ncodex\nOK\ntokens used\n13\n';
  assert.deepEqual(parseCliUsage(out), { total_tokens: 13 });
});

test('parseCliUsage: handles thousands separators and CRLF', () => {
  assert.deepEqual(parseCliUsage('tokens used\r\n1,234\r\n'), { total_tokens: 1234 });
});

test('parseCliUsage: no marker or zero -> null', () => {
  assert.equal(parseCliUsage('no usage here'), null);
  assert.equal(parseCliUsage('tokens used\n0\n'), null);
  assert.equal(parseCliUsage(''), null);
});

test('deepPing: real CLI roundtrip detects a live and a broken command', async () => {
  const mk = (cliArgs) => new CliAdapter({ id: 't', name: 't', config: { cliCmd: 'node', cliArgs } });
  const good = await mk(['-e', 'console.log("OK")']).deepPing();
  assert.equal(good.ok, true, JSON.stringify(good));
  const bad = await mk(['-e', 'console.error("502 upstream dead"); process.exit(1)']).deepPing();
  assert.equal(bad.ok, false);
  assert.ok(/502/.test(bad.note), 'note should carry the CLI error tail, got: ' + bad.note);
});
