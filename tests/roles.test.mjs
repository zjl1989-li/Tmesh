// Batch A regression: role tagging (kind guess, per-group roles, fallbacks).
import test from 'node:test';
import assert from 'node:assert/strict';
import { guessKind, guessRole, ensureRoles, memberWithRole, membersWithRole, ROLES } from '../server/roles.mjs';

test('guessKind follows adapter class: A/C executor, B advisor', () => {
  assert.equal(guessKind({ adapterType: 'A' }), 'executor');
  assert.equal(guessKind({ adapterType: 'C' }), 'executor');
  assert.equal(guessKind({ adapterType: 'B' }), 'advisor');
  assert.equal(guessKind({}), 'advisor');
  // config wins over the legacy top-level field
  assert.equal(guessKind({ adapterType: 'B', config: { adapterType: 'A' } }), 'executor');
});

test('guessRole: executors execute, others deliberate', () => {
  assert.equal(guessRole({ adapterType: 'A' }), 'executor');
  assert.equal(guessRole({ adapterType: 'B' }), 'advisor');
});

test('ensureRoles fills newcomers without touching manual assignments', () => {
  const agents = [
    { id: 'dsh', name: 'DSH', adapterType: 'A' },
    { id: 'inv', name: '投研', adapterType: 'B' },
  ];
  const conv = { memberIds: ['dsh', 'inv'], memberRoles: { inv: 'commander' } };
  const roles = ensureRoles(conv, agents);
  assert.equal(roles.dsh, 'executor');   // auto-tagged by kind
  assert.equal(roles.inv, 'commander');  // manual assignment preserved
});

test('ensureRoles drops roles of members that left and handles legacy groups', () => {
  const agents = [{ id: 'a', name: 'A', adapterType: 'B' }];
  const conv = { memberIds: ['a'], memberRoles: { gone: 'executor' } };
  const roles = ensureRoles(conv, agents);
  assert.deepEqual(Object.keys(roles), ['a']);
  assert.equal(roles.a, 'advisor');
  // legacy group without memberRoles at all
  const conv2 = { memberIds: ['a'] };
  assert.equal(ensureRoles(conv2, agents).a, 'advisor');
});

test('memberWithRole falls back to kind when no explicit commander exists', () => {
  const agents = [
    { id: 'dsh', name: 'DSH', adapterType: 'A' },
    { id: 'inv', name: '投研', adapterType: 'B' },
  ];
  const conv = { memberIds: ['dsh', 'inv'], memberRoles: {} };
  ensureRoles(conv, agents);
  assert.equal(memberWithRole(conv, agents, 'executor').id, 'dsh');        // explicit role
  assert.equal(memberWithRole(conv, agents, 'commander').id, 'inv');       // kind fallback
  assert.equal(membersWithRole(conv, agents, 'executor').length, 1);
  assert.ok(ROLES.length === 4);
});
