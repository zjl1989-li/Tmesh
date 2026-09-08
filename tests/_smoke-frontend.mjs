// Frontend module smoke: import every module under a permissive stub env.
// Catches duplicate declarations / missing imports / top-level eval errors
// without a browser.
const stubObj = new Proxy(function () {}, {
  get: (t, p) => (p === Symbol.toPrimitive ? () => '' : p === 'then' ? undefined : stubObj),
  apply: () => stubObj,
  construct: () => stubObj,
});
globalThis.document = stubObj;
globalThis.window = stubObj;
globalThis.localStorage = stubObj;
Object.defineProperty(globalThis, 'navigator', { value: stubObj, configurable: true });
globalThis.location = stubObj;
globalThis.history = stubObj;
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
globalThis.CustomEvent = class {};
globalThis.EventSource = stubObj;
globalThis.addEventListener = () => {};
globalThis.AudioContext = stubObj;

const mods = ['i18n', 'api', 'core', 'status', 'state', 'settings', 'space', 'wizard', 'modals', 'center', 'flags'];
for (const m of mods) {
  await import(new URL('../public/js/' + m + '.js', import.meta.url));
  console.log(m);
}
console.log('SMOKE PASS');
// The permissive Proxy stub leaves something the event loop won't drain;
// all modules have imported by this point, so a hard exit is honest here.
process.exit(0);
