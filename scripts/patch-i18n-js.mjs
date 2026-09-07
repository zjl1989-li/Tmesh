// One-off i18n wiring pass over the split modules. Exact literal replacements.
import { readFileSync, writeFileSync } from 'node:fs';
const D = 'D:/Projects/tmesh/public/js/';

const EDITS = {
  'status.js': [
    ["import { scheduleRegRefresh } from './settings.js';", "import { scheduleRegRefresh } from './settings.js';\nimport { t } from './i18n.js';"],
    ["const ST_LABEL = { busy: '执行中', error: '上次失败', idle: '空闲', offline: '离线', asking: '等你回答' };",
     "const ST_LABEL = () => ({ busy: t('stBusy'), error: t('stError'), idle: t('stIdle'), offline: t('stOffline'), asking: t('stAsking') });"],
    ['ST_LABEL[s]', 'ST_LABEL()[s]'],
  ],
  'settings.js': [
    ["import { API, api } from './api.js';", "import { API, api } from './api.js';\nimport { t } from './i18n.js';"],
    ["export const capabilityOf = (type) => (LOCAL_CAPABLE.has(type) ? '可操作本机' : '仅云端');",
     "export const capabilityOf = (type) => (LOCAL_CAPABLE.has(type) ? t('capLocal') : t('capCloud'));"],
    ["export const TYPE_LABELS = { A: '本地服务', W: '桌面客户端', E: 'MCP 服务', G: 'CLI 工具', C: '文件桥', D: '桌面转发', B: '模型 API' };",
     "export const TYPE_LABELS = { A: 'typeA', W: 'typeW', E: 'typeE', G: 'typeG', C: 'typeC', D: 'typeD', B: 'typeB' };"],
    ["export const typeLabelOf = (t) => TYPE_LABELS[t] || '其他';",
     "export const typeLabelOf = (ty) => { const k = TYPE_LABELS[ty]; return k ? t(k) : t('typeOther'); };"],
    ["  if (c.cliCmd || c.cliPath) return 'CLI 工具';", "  if (c.cliCmd || c.cliPath) return 'typeG';"],
    ["  if (c.mcpServer) return 'MCP 服务';", "  if (c.mcpServer) return 'typeE';"],
    ["  if (c.bridge) return '桌面转发';", "  if (c.bridge) return 'typeD';"],
    ["  if (c.ports && c.ports.length) return '本地服务';", "  if (c.ports && c.ports.length) return 'typeA';"],
    ["  if (c.localDir) return '文件桥';", "  if (c.localDir) return 'typeC';"],
    ["  if (c.baseURL || c.apiBaseUrl) return '模型 API';", "  if (c.baseURL || c.apiBaseUrl) return 'typeB';"],
    ["  return typeLabelOf(a.adapterType);", "  return TYPE_LABELS[a.adapterType] || 'typeOther';"],
    ["export const CAP_ORDER = { '本地服务': 6, 'CLI 工具': 5, '桌面客户端': 5, '桌面转发': 4, 'MCP 服务': 3, '模型 API': 2, '文件桥': 1 };",
     "export const CAP_ORDER = { typeA: 6, typeG: 5, typeW: 5, typeD: 4, typeE: 3, typeB: 2, typeC: 1 };"],
    ['>${channelOf(a)}</span>', '>${t(channelOf(a))}</span>'],
  ],
  'core.js': [
    ["if (diff <= 0) return '今天';", "if (diff <= 0) return t('today');"],
    ["if (diff === 1) return '昨天';", "if (diff === 1) return t('yesterday');"],
  ],
  'center.js': [
    ["import { capabilityOf, renderRegistry } from './settings.js';", "import { capabilityOf, renderRegistry } from './settings.js';\nimport { t } from './i18n.js';"],
    ["box.innerHTML = '<div class=\"empty\">还没有消息，发一条试试</div>';", "box.innerHTML = `<div class=\"empty\">${t('emptyChat')}</div>`;"],
    ["${ic('bell', 10, 10)} 系统通知", "${ic('bell', 10, 10)} ${t('sysNotice')}"],
  ],
};

let totalMiss = 0;
for (const [file, pairs] of Object.entries(EDITS)) {
  const p = D + file;
  let s = readFileSync(p, 'utf8');
  for (const [from, to] of pairs) {
    if (!s.includes(from)) { console.error('MISS', file, JSON.stringify(from.slice(0, 70))); totalMiss++; continue; }
    s = s.split(from).join(to);
  }
  writeFileSync(p, s);
}
console.log('done, missed:', totalMiss);
