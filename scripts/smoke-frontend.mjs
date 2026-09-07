// Smoke-import every frontend module in Node with browser stubs.
// Catches the three fatal split errors deterministically:
//   1. duplicate declaration (import name collides with a local const/let)
//   2. missing import (module-eval ReferenceError)
//   3. broken cycle top-level evaluation
// DOM-dependent behavior at event time is NOT covered here (see e2e/browser).
const stubEl = () => ({
  querySelector: () => stubEl(),
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  dataset: {}, style: {},
  innerHTML: '', textContent: '', value: '', title: '',
  appendChild: () => {}, removeChild: () => {}, remove: () => {}, insertAdjacentHTML: () => {},
  closest: () => null, getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
  focus() {}, select() {}, click() {}, blur() {}, setAttribute() {}, getAttribute() { return null; },
  offsetHeight: 0, offsetWidth: 0, scrollHeight: 0, scrollTop: 0, clientHeight: 0,
  options: [], files: [], checked: false, disabled: false, hidden: false, src: '', href: '',
});
globalThis.document = {
  querySelector: () => stubEl(),
  querySelectorAll: () => [],
  getElementById: () => stubEl(),
  createElement: () => stubEl(),
  addEventListener: () => {},
  removeEventListener: () => {},
  body: stubEl(),
  documentElement: stubEl(),
  title: '',
};
globalThis.window = globalThis;
globalThis.location = { reload() {}, href: '' };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async () => {} } }, configurable: true });
globalThis.Notification = { requestPermission: async () => 'granted', permission: 'granted' };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.EventSource = class { addEventListener() {} close() {} };
globalThis.AudioContext = class { createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { value: 0, exponentialRampToValueAtTime() {} }, type: '' }; } createGain() { return { connect() {}, gain: { value: 0, exponentialRampToValueAtTime() {}, setValueAtTime() {} } }; } get destination() { return {}; } get currentTime() { return 0; } close() {} };

const MODS = ['core.js', 'api.js', 'status.js', 'state.js', 'center.js', 'space.js', 'settings.js', 'wizard.js', 'modals.js', 'wire.js', 'boot.js'];
let failed = 0;
for (const f of MODS) {
  try {
    await import('file:///D:/Projects/tmesh/public/js/' + f);
    console.log('ok  ' + f);
  } catch (e) {
    failed++;
    console.error('FAIL ' + f + ': ' + e.message);
  }
}
if (failed) { console.error(failed + ' module(s) failed'); process.exit(1); }
console.log('SMOKE-OK: all frontend modules import and evaluate');
process.exit(0);
