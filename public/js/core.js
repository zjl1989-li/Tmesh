// split of public/app.js (original section comment preserved below)
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const uid = () => Math.random().toString(36).slice(2, 9);
export const USER = { id: 'user', name: '我', color: '#3b6fd4' };

// ---------- thin-line SVG icons ----------
// All UI chrome uses these line icons (16x16 viewBox, currentColor) instead of
// emoji, so buttons/badges/menus look crisp and consistent across OSes.
export const ICON = {
  gear: '<path d="M2.5 4h6.2M12 4h1.5"/><path d="M2.5 8h1.8M7.3 8h6.2"/><path d="M2.5 12h4.8M10.5 12h3"/><circle cx="10.7" cy="4" r="1.4"/><circle cx="5.2" cy="8" r="1.4"/><circle cx="8.3" cy="12" r="1.4"/>',
  users: '<circle cx="5.6" cy="5.4" r="2.2"/><circle cx="11.4" cy="6" r="1.8"/><path d="M2 13.4c0-2.1 1.6-3.6 3.6-3.6s3.6 1.5 3.6 3.6"/><path d="M10.6 10c1.6 0 3.4 1.3 3.4 3.2"/>',
  bell: '<path d="M8 2.3a4.3 4.3 0 0 1 4.3 4.3c0 3 .9 3.8.9 3.8H2.8s.9-.8.9-3.8A4.3 4.3 0 0 1 8 2.3z"/><path d="M6.7 13.1a1.4 1.4 0 0 0 2.6 0"/>',
  clipboard: '<rect x="3.5" y="3.6" width="9" height="10.8" rx="1.5"/><path d="M6.3 3.6V2.6h3.4v1"/><path d="M6 7.4h4M6 9.8h4"/>',
  flag: '<path d="M4 14.6V2.6"/><path d="M4 3h7.8l-1.9 3 1.9 3H4"/>',
  cpu: '<rect x="4.6" y="4.6" width="6.8" height="6.8" rx="1.2"/><path d="M8 6.6v2.8M6.6 8h2.8"/><path d="M6.6 1.8v1.4M9.4 1.8v1.4M6.6 12.8v1.4M9.4 12.8v1.4M1.8 6.6h1.4M1.8 9.4h1.4M12.8 6.6h1.4M12.8 9.4h1.4"/>',
  file: '<path d="M4 1.8h5.1l2.9 2.9v9.5H4z"/><path d="M9.1 1.8v2.9H12"/>',
  image: '<rect x="2.2" y="3" width="11.6" height="10" rx="1.5"/><circle cx="5.7" cy="6.5" r="1.1"/><path d="M2.2 11.4l3.5-3.5 2.7 2.7 2.1-2.1 3 2.9"/>',
  video: '<rect x="2.2" y="4" width="9.4" height="8" rx="1.5"/><path d="M11.6 6.7l2.2-1.5v5.6l-2.2-1.5z"/>',
  audio: '<path d="M6 13V3.6l5.4-1.2V11"/><circle cx="4.2" cy="13" r="1.8"/><circle cx="9.6" cy="11.1" r="1.8"/>',
  folder: '<path d="M1.8 3.8h4.2L8 5.5h6.2v7.7H1.8z"/>',
  eye: '<path d="M1.6 8S4 3.7 8 3.7 14.4 8 14.4 8 12 12.3 8 12.3 1.6 8 1.6 8z"/><circle cx="8" cy="8" r="2"/>',
  pencil: '<path d="M10.8 2.6l2.6 2.6L5.4 13.2l-2.8.2.2-2.8z"/>',
  link: '<path d="M6.4 9.6 9.6 6.4"/><path d="M5.5 10.5 4 12a2 2 0 0 0 2.8 2.8l1.5-1.5"/><path d="M10.5 5.5 12 4A2 2 0 0 0 9.2 1.2L7.7 2.7"/>',
  plane: '<path d="M14 2 2.6 7.7l4.5 1.6L8.7 14z"/><path d="M7.1 9.3 14 2"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V2.8h3v1.7"/><path d="M4.6 4.5l.7 9h5.4l.7-9"/><path d="M6.6 7.5v3.5M9.4 7.5v3.5"/>',
  archive: '<path d="M2.5 4.5h11V6.8H2.5z"/><path d="M3.5 6.8v6.7h9V6.8"/><path d="M8 6.8v3.2"/>',
  chat: '<path d="M2.5 3.5h11v8H6.5L4 14.5V11.5H2.5z"/>',
  play: '<path d="M5.5 3.5l7 4.5-7 4.5z"/>',
  pause: '<path d="M5.5 3.5h2v9h-2zM8.5 3.5h2v9h-2z"/>',
  upload: '<path d="M8 10.5V3.2M4.8 6.4 8 3.2l3.2 3.2"/><path d="M2.5 12.5v1.2h11v-1.2"/>',
  menu: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>',
  plus: '<path d="M8 2.5v11M2.5 8h11"/>',
  warn: '<path d="M8 2.8l6 10.4H2z"/><path d="M8 6.5v3M8 11.4v.01"/>',
  check: '<path d="M3 8.5l3.2 3.2L13 5"/>',
  tree: '<path d="M2.6 2.6h5l1.4 1.8h4.4v4.6l-2-2.6H5.4L3.4 11.4V2.6z"/><path d="M4 6.2h6l1.4 1.8H13v4.8H6.4L4.9 11"/>',
  search: '<circle cx="7.2" cy="7.2" r="4.4"/><path d="M10.6 10.6 14 14"/>',
  cloud: '<path d="M4.6 12.5h7.1a3.4 3.4 0 0 0 .3-6.8A4.6 4.6 0 0 0 3.1 6.7a3.4 3.4 0 0 0 1.5 5.8z"/>',
  plug: '<path d="M6 2.4v3.6M10 2.4v3.6"/><path d="M4.4 6h7.2v2.3a3.6 3.6 0 0 1-3.6 3.6 3.6 3.6 0 0 1-3.6-3.6z"/><path d="M8 11.9V14"/>',
  term: '<path d="M2.4 3.4h11.2v9.2H2.4z"/><path d="M5 6.4 7 8l-2 1.6"/><path d="M8.6 9.6h2.4"/>',
  box: '<path d="M2.8 5.2 8 2.6l5.2 2.6v5.6L8 13.4l-5.2-2.6z"/><path d="M2.8 5.2 8 7.8l5.2-2.6M8 7.8v5.6"/>',
  chevdown: '<path d="M4 6l4 4 4-4"/>',
  download: '<path d="M8 2.5v8M4.8 7.2 8 10.4l3.2-3.2"/><path d="M2.5 12.5v1.2h11v-1.2"/>',
  refresh: '<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.5 2.4v3.4h-3.4"/>',
  x: '<path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6"/>',
  chevup: '<path d="M4 10l4-4 4 4"/>',
  arrowl: '<path d="M10.5 3 5.5 8l5 5"/>',
  arrowr: '<path d="M5.5 3l5 5-5 5"/>',
  ext: '<path d="M6.5 3.5H3.2v9.3h9.3V9.5"/><path d="M9.5 2.5h4v4"/><path d="M13.5 2.5 8 8"/>',
  deleg: '<path d="M5 3v5.5A2.5 2.5 0 0 0 7.5 11H12"/><path d="M9.5 8.5 12 11l-2.5 2.5"/>',
  funnel: '<path d="M2.4 3h11.2l-4.2 5.1v4.7L6.6 12V8.1z"/>',
  shield: '<path d="M8 1.8 13.4 4v4.2c0 3.2-2.3 5.3-5.4 6-3.1-.7-5.4-2.8-5.4-6V4z"/>',
  book: '<path d="M2.6 3.2h4.2c.8 0 1.2.5 1.2 1.2v8.6c0-.7-.4-1.2-1.2-1.2H2.6z"/><path d="M13.4 3.2H9.2c-.8 0-1.2.5-1.2 1.2v8.6c0-.7.4-1.2 1.2-1.2h4.2z"/>',
};
// render an icon: ic('gear') -> inline <svg> sized 14x14 (override with w/h)
export const ic = (name, w, h) => {
  const W = w || 14, H = h || w || 14;
  return `<svg viewBox="0 0 16 16" width="${W}" height="${H}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`;
};

// ================= message info hierarchy helpers =================
// Scope: main-chat information hierarchy + message interaction only. No theme
// overhaul, no backend contract changes. Everything below is pure frontend.

// ---- lightweight, XSS-safe Markdown for message bubbles ----
// Headings / lists / code / emphasis / links make long agent replies
// scannable instead of one wall of text. HTML is escaped FIRST, so no message
// content can inject markup or scripts regardless of what an agent writes.
export const mdEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// inline transforms. IMPORTANT: the input is RAW text; escape first so no
// message content can ever inject markup (code spans are protected after
// escaping and restored as safe <code>).
export function inlineMd(t) {
  if (!t) return '';
  let s = mdEsc(t);
  const codes = [];
  // 1) protect inline code spans so nothing inside them gets reformatted
  s = s.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  // 2) windows / relative file paths -> monospace chip keeping the full path.
  //    The (^|[^\w]) guard stops "s://..." inside an "https://" URL from
  //    matching a drive letter.
  //    Image paths are the exception: they render as a real <img> through the
  //    server's /files proxy (http pages cannot load file://), so an agent
  //    replying with a screenshot path — markdown syntax or bare — shows
  //    the picture inline instead of a dead chip. This MUST run before any
  //    other transform, otherwise the path inside ![alt](D:\x.png) gets
  //    chip-wrapped first and the image never renders.
  s = s.replace(/(^|[^\w])((?:[A-Za-z]:[\\/]|\.{1,2}[\\/])[\w@.\-\\/ ]*\.\w{1,8})(?![\w.])/g, (m, pre, p) => {
    const t = p.trim();
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(t))
      return pre + `<img class="md-img" src="/files?path=${encodeURIComponent(t)}" alt="" loading="lazy" />`;
    return pre + `<span class="path-chip">${p}</span>`;
  });
  // 3) markdown images -> inline lazy thumbnail
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, alt, url) => {
    url = (url || '').trim();
    return /^(https?:|\.{0,2}[\\/]|[\\/])/i.test(url)
      ? `<img class="md-img" src="${mdEsc(url)}" alt="${mdEsc(alt || '')}" loading="lazy" />`
      : m;
  });
  // 4) markdown links -> safe target=_blank anchors
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, label, url) => {
    url = (url || '').trim();
    return /^(https?:|\.{0,2}[\\/]|[\\/])/i.test(url)
      ? `<a href="${mdEsc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : m;
  });
  // 5) emphasis
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');
  // 6) bare urls -> auto-link (trailing CJK / full-width punctuation excluded)
  s = s.replace(/(^|[\s(>])(https?:\/\/[^\s<)>」】》〕〉,，。;；:：!！?？]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  // 7) soft line breaks + restore protected code spans
  s = s.replace(/\n/g, '<br/>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

// block-level markdown: code fences / headings / hr / blockquote / lists / p
export function renderMd(src) {
  const lines = String(src ?? '').replace(/\r\n/g, '\n').split('\n');
  let out = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = line.match(/^```([\w+#.-]*)\s*$/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out += `<pre><code>${mdEsc(buf.join('\n'))}</code></pre>`;
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { out += `<h${h[1].length}>${inlineMd(h[2])}</h${h[1].length}>`; i++; continue; }
    if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(line)) { out += '<hr/>'; i++; continue; }
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      out += `<blockquote>${renderMd(buf.join('\n'))}</blockquote>`;
      continue;
    }
    const lm = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (lm) {
      const ordered = /\d/.test(lm[1]);
      const items = [];
      while (i < lines.length) {
        const m2 = lines[i].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
        if (m2) {
          if ((/\d/.test(m2[1])) !== ordered) break;
          items.push(inlineMd(m2[2])); i++;
        } else if (!lines[i].trim()) { i++; break; }
        else if (/^\s*>|^```|^#{1,4}\s/.test(lines[i])) break; // quote/fence/heading ends the list
        else { items[items.length - 1] = (items[items.length - 1] || '') + '<br/>' + inlineMd(lines[i].trim()); i++; }
      }
      out += `<${ordered ? 'ol' : 'ul'}>` + items.map((it) => `<li>${it}</li>`).join('') + `</${ordered ? 'ol' : 'ul'}>`;
      continue;
    }
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^```/.test(lines[i]) && !/^#{1,4}\s/.test(lines[i]) && !/^\s*>\s?/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s/.test(lines[i])) { buf.push(lines[i]); i++; }
    out += `<p>${inlineMd(buf.join('\n'))}</p>`;
  }
  return out;
}

// ---- time / date separators + sender grouping ----
export const pad2 = (n) => String(n).padStart(2, '0');
export const fmtTime = (ts) => { const d = new Date(ts || Date.now()); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
export const dayLabel = (ts) => {
  const d = new Date(ts || Date.now());
  const now = new Date();
  const sod = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((sod(now) - sod(d)) / 86400000);
  if (diff <= 0) return '今天';
  if (diff === 1) return '昨天';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
export const senderKey = (m) => m.sender === 'user' ? 'user' : m.sender === 'system' ? 'sys' : ('agent:' + (m.agentId || ''));
// last real message appended, used to emit date separators + grouping rhythm
export let lastMsg = { day: '', key: null, ts: 0 };
// scroll policy: only auto-stick to bottom while the user is already at the
// bottom; reading history up top must not be yanked down by new messages.
export let stickBottom = true;
export const SCROLL_NEAR = 48;
export function syncStick() {
  const box = $('#messages'); if (!box) return;
  const near = box.scrollTop + box.clientHeight >= box.scrollHeight - SCROLL_NEAR;
  stickBottom = near;
  $('#jumpDown') && $('#jumpDown').classList.toggle('hidden', near);
}

// 产物 kind -> 右栏分标签映射
export const KIND_TAB = { image: 'image', video: 'media', audio: 'media', doc: 'file', code: 'file', file: 'file' };


// cross-module setters (an imported ESM binding is read-only outside its home module)
export function setLastMsg(v) { lastMsg = v; }
export function setStickBottom(v) { stickBottom = v; }
