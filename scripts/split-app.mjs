// Split public/app.js (single IIFE, ~3000 lines) into ES modules.
// Mechanical approach:
//   1. Cut the file into chunks by a line-range manifest (sections are stable).
//   2. Collect top-level declarations per chunk (2-space indent = module scope).
//   3. Tokenize each chunk; refs that are declared in another chunk -> imports.
//   4. Every top-level declaration gets `export`.
//   5. Report cross-chunk ASSIGNMENTS to imported `let` bindings (illegal in
//      ESM) so they can be hand-converted to setters afterwards.
// Zero dependencies. ASCII only.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SRC = 'D:/Projects/tmesh/public/app.js';
const OUT = 'D:/Projects/tmesh/public/js';
const lines = readFileSync(SRC, 'utf8').split('\n');

// 1-based inclusive line ranges (from the section map of the current file).
// NOTE: wire.js must stay imported by boot.js ONLY. Symbols that other modules
// need (autosizeInput, task-mode/stage UI, detectKind, notify flags) live in
// center/space/flags so no cycle pulls wire's top-level DOM bindings early.
const MANIFEST = [
  ['core.js',     [[27, 224]]],
  ['center.js',   [[225, 294], [646, 1113], [2278, 2290], [2562, 2650]]],
  ['api.js',      [[295, 421]]],
  ['status.js',   [[423, 562]]],
  ['state.js',    [[564, 645]]],
  ['space.js',    [[1114, 1464], [2335, 2346]]],
  ['settings.js', [[1465, 1695]]],
  ['wizard.js',   [[1696, 2063]]],
  ['modals.js',   [[2064, 2238]]],
  ['flags.js',    [[2495, 2508]]],
  ['wire.js',     [[2239, 2277], [2291, 2334], [2347, 2494], [2509, 2561], [2651, 2963]]],
];
const ENTRY = { file: 'app.js', ranges: [[2964, 2996]] };

const chunkText = (ranges) => ranges.map(([a, b]) => lines.slice(a - 1, b).join('\n')).join('\n');

// identifiers that never need an import (JS reserved words + browser/node globals)
const BASE = new Set(('break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,in,instanceof,new,return,super,switch,this,throw,try,typeof,var,void,while,with,yield,let,static,enum,await,async,of,get,set,' +
  'undefined,null,true,false,NaN,Infinity,globalThis,arguments,' +
  'window,document,location,navigator,localStorage,sessionStorage,history,alert,confirm,prompt,' +
  'fetch,EventSource,AbortController,URL,URLSearchParams,Request,Response,Headers,' +
  'Math,Date,JSON,Promise,Array,Object,String,Number,Boolean,Set,Map,WeakMap,WeakSet,Symbol,RegExp,Error,TypeError,RangeError,' +
  'parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,encodeURI,decodeURI,' +
  'setTimeout,setInterval,clearTimeout,clearInterval,requestAnimationFrame,cancelAnimationFrame,queueMicrotask,structuredClone,' +
  'FileReader,Blob,File,FormData,Image,Audio,AudioContext,Notification,CustomEvent,Event,FormDataEvent,' +
  'console,process,Intl,crypto,atob,btoa').split(','));

const modules = new Map(); // file -> { text, decls:Set, }
for (const [file, ranges] of MANIFEST) modules.set(file, { text: chunkText(ranges) });
modules.set(ENTRY.file, { text: chunkText(ENTRY.ranges) });

// collect top-level declarations (2-space indent inside the old IIFE)
for (const m of modules.values()) {
  m.decls = new Set();
  const re = /^ {2}(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^ {2}(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
  let mo;
  while ((mo = re.exec(m.text))) m.decls.add(mo[1] || mo[2]);
}

// all names declared anywhere (top level of the old IIFE -> unique)
const ALL = new Map(); // name -> file
for (const [file, m] of modules) for (const d of m.decls) {
  if (ALL.has(d)) console.error('DUPLICATE top-level name:', d, ALL.get(d), file);
  ALL.set(d, file);
}

// setters for shared mutable state: an imported ESM binding cannot be assigned
// from outside its declaring module, so cross-chunk writers call a setter.
// Read-only imports stay as-is.
const SETTERS = {
  'state.js': {
    curGroupId: 'setCurGroupId', curGroupData: 'setCurGroupData',
    curTab: 'setCurTab', groupSearch: 'setGroupSearch',
  },
  'core.js': { lastMsg: 'setLastMsg', stickBottom: 'setStickBottom' },
  'flags.js': { notifyOn: 'setNotifyOn', soundOn: 'setSoundOn' },
};
for (const [file, setters] of Object.entries(SETTERS)) {
  const m = modules.get(file);
  const defs = Object.entries(setters)
    .map(([name, fn]) => `export function ${fn}(v) { ${name} = v; }`)
    .join('\n');
  m.text += '\n\n// cross-module setters (an imported ESM binding is read-only outside its home module)\n' + defs + '\n';
}

// rewrite cross-module assignment sites to setter calls
const REWRITES = [
  ['center.js',   'curGroupData = null;',  'setCurGroupData(null);'],
  ['center.js',   'curGroupId = id;',      'setCurGroupId(id);'],
  ['center.js',   'curGroupData = g;',     'setCurGroupData(g);'],
  ['center.js',   "lastMsg = { day: '', key: null, ts: 0 }; // fresh grouping state per render", "setLastMsg({ day: '', key: null, ts: 0 }); // fresh grouping state per render"],
  ['center.js',   'stickBottom = jump;',   'setStickBottom(jump);'],
  ['center.js',   'lastMsg = { day, key: null, ts: m.ts || Date.now() };', 'setLastMsg({ day, key: null, ts: m.ts || Date.now() });'],
  ['center.js',   'lastMsg = { day, key, ts: m.ts || Date.now() };', 'setLastMsg({ day, key, ts: m.ts || Date.now() });'],
  // autosizeInput moved from wire to center: decouple it from wire's inputEl
  ['center.js',   "function autosizeInput() {\n    if (!inputEl) return;\n    inputEl.style.height = 'auto';\n    inputEl.style.height = Math.min(inputEl.scrollHeight, 132) + 'px';\n  }",
                  "function autosizeInput() {\n    const el = $('#input');\n    if (!el) return;\n    el.style.height = 'auto';\n    el.style.height = Math.min(el.scrollHeight, 132) + 'px';\n  }"],
  ['settings.js', 'else { curGroupId = null; resetChatPane(); }', 'else { setCurGroupId(null); resetChatPane(); }'],
  ['settings.js', 'notifyOn = false;', 'setNotifyOn(false);'],
  ['settings.js', 'notifyOn = true;',  'setNotifyOn(true);'],
  ['settings.js', 'soundOn = !soundOn;', 'setSoundOn(!soundOn);'],
  ['wire.js',     'groupSearch = e.target.value;', 'setGroupSearch(e.target.value);'],
  ['wire.js',     'stickBottom = true;', 'setStickBottom(true);'],
  ['wire.js',     'curTab = t.dataset.tab;', 'setCurTab(t.dataset.tab);'],
];
for (const [file, from, to] of REWRITES) {
  const m = modules.get(file);
  if (!m.text.includes(from)) { console.error('REWRITE-MISS', file, JSON.stringify(from)); continue; }
  m.text = m.text.split(from).join(to);
}
// the rewrites introduce references to setter names; add them to each chunk's
// decl set so the import step treats them as local (setters live in the same
// chunk for the declaring module) and as needed imports elsewhere
for (const [file, setters] of Object.entries(SETTERS)) {
  for (const fn of Object.values(setters)) modules.get(file).decls.add(fn);
}
// rebuild the global name table: setter names were just added to decls, and
// the rewrite pass introduced references to them from OTHER chunks - without
// this those references resolve to nothing (missing import, runtime crash)
ALL.clear();
for (const [file, m] of modules) for (const d of m.decls) {
  if (ALL.has(d)) console.error('DUPLICATE top-level name:', d, ALL.get(d), file);
  ALL.set(d, file);
}

// tokenize + resolve external refs
const TOKEN = /[A-Za-z_$][\w$]*/g;
// comment-stripped copy for token analysis only (output keeps original text):
// without this, words inside comments create fake imports (e.g. "used to emit
// date separators" pulled `emit` into core.js and broke its zero-dep property)
const stripComments = (s) => s
  // full-line (possibly multi-line) block comments, anchored to line start so
  // a `/*` inside a string like 'image/*' can never start a fake comment
  .replace(/(^|\n)[ \t]*\/\*(?:[^*]|\*(?!\/))*\*\//g, '$1')
  // same-line short catch comments: /* ignore */ /* cross-origin */
  .replace(/\/\*\s*[a-z][^*\n]*\*\//gi, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/\s\/\/\s.*$/gm, ' ');
for (const [file, m] of modules) {
  // names declared at ANY scope in this chunk (function-local const/let/var/
  // function) shadow imports and make them fatal duplicates -> never import
  const localNames = new Set();
  const reLocal = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)|\bfunction\s+([A-Za-z_$][\w$]*)/g;
  let lm;
  while ((lm = reLocal.exec(m.text))) localNames.add(lm[1] || lm[2]);
  const need = new Map(); // sourceFile -> Set(names)
  const dropped = new Set();
  const seen = new Set();
  let t;
  const scanText = stripComments(m.text);
  m.scan = scanText;
  while ((t = TOKEN.exec(scanText))) {
    const name = t[0];
    if (seen.has(name)) continue;
    seen.add(name);
    if (BASE.has(name) || m.decls.has(name)) continue;
    const src = ALL.get(name);
    if (src && src !== file) {
      if (localNames.has(name)) { dropped.add(name); continue; }
      if (!need.has(src)) need.set(src, new Set());
      need.get(src).add(name);
    }
  }
  // cross-chunk assignments to imported bindings (illegal in ESM)
  const illegal = [];
  for (const names of need.values()) for (const n of names) {
    const reAssign = new RegExp('\\b' + n + '\\s*(=[^=>]|\\+\\+|--|\\+=|-=|\\*=|/=|%=)', 'g');
    const reIncDec = new RegExp('(\\+\\+|--)' + n + '\\b', 'g');
    if (reAssign.test(scanText) || reIncDec.test(scanText)) illegal.push(n);
  }
  m.need = need;
  m.illegal = illegal;
  if (dropped.size) console.log('DROPPED-LOCAL-SHADOW', file, '->', [...dropped].join(', '));
}

// emit modules
mkdirSync(OUT, { recursive: true });
for (const [file, m] of modules) {
  const imports = [...m.need.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([src, names]) => `import { ${[...names].sort().join(', ')} } from './${src === 'app.js' ? 'boot.js' : src}';`)
    .join('\n');
  const header = `// split of public/app.js (original section comment preserved below)\n`;
  let body = m.text.replace(/^ {2}/gm, ''); // unindent one level (IIFE gone)
  // export every top-level declaration (after unindent they start at column 0;
  // function-local declarations stay indented and must not be touched)
  body = body.replace(/^(async function|function|const|let|var)\b/gm, 'export $1');
  const text = header + (imports ? imports + '\n\n' : '') + body;
  const outName = file === 'app.js' ? OUT + '/boot.js' : OUT + '/' + file;
  writeFileSync(outName, text);
  if (m.illegal.length) console.log('ILLEGAL-ASSIGN', file, '->', m.illegal.join(', '));
}
console.log('done. modules:', [...modules.keys()].join(', '));
