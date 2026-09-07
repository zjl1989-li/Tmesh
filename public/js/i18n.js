// Tiny i18n: zh/en dictionary + t() + DOM application via data-i18n attrs.
// Scope policy: covers ALL static UI chrome (index.html) and high-traffic
// dynamic strings (status labels, capabilities, empty states, placeholders).
// Deep strings (long toasts, wizard hints) can migrate key-by-key later - the
// mechanism is here, t() falls back to zh then to the key itself.
const DICT = {
  // ---- left sidebar ----
  newGroup:        { zh: '+ 新建群', en: '+ New group' },
  searchPh:        { zh: '搜索群…', en: 'Search groups...' },
  libKb:           { zh: '资料库', en: 'Knowledge' },
  libKbTitle:      { zh: '资料库：沉淀的知识与群档（L2 语义记忆）', en: 'Knowledge: distilled notes & group archives (L2 semantic memory)' },
  libSkills:       { zh: '技能库', en: 'Skills' },
  libSkillsTitle:  { zh: '技能库：各 agent 可声明调用的能力清单', en: 'Skills: capabilities agents can declare and invoke' },
  libAcl:          { zh: '权限库', en: 'Permissions' },
  libAclTitle:     { zh: '权限库：按群 × agent × 能力授权（默认拒绝）', en: 'Permissions: per group × agent × capability (deny by default)' },
  secGroups:       { zh: '群聊', en: 'Groups' },
  settings:        { zh: '设置', en: 'Settings' },
  // ---- center / top bar ----
  pickGroup:       { zh: '选择一个群', en: 'Pick a group' },
  delibPause:      { zh: '暂停', en: 'Pause' },
  delibPauseTitle: { zh: '暂停：做完当前步骤后在检查点停下（进度保留）', en: 'Pause: stop at the next checkpoint (progress kept)' },
  delibResume:     { zh: '继续', en: 'Resume' },
  delibResumeTitle:{ zh: '从暂停的检查点继续（中断的轮次会重跑）', en: 'Resume from the paused checkpoint (interrupted turns re-run)' },
  delibStop:       { zh: '中止', en: 'Abort' },
  delibStopTitle:  { zh: '中止：立即掐断在途调用，进度保留，可改议题重开', en: 'Abort: cut in-flight calls now; progress kept, topic can restart' },
  emptyChat:       { zh: '还没有消息，发一条试试', en: 'No messages yet — say something' },
  emptyPick:       { zh: '从左侧选一个群，或直接新建群开始', en: 'Pick a group on the left, or create one to start' },
  jumpDownTitle:   { zh: '回到最新消息', en: 'Jump to latest' },
  resizerTitle:    { zh: '拖动调整宽度', en: 'Drag to resize' },
  inputPh:         { zh: '输入消息，@ 成员问答聊天…（要派单先点右侧派工按钮；Enter 发送，Shift+Enter 换行）', en: 'Type a message, @ a member to chat... (for work orders use the dispatch button; Enter to send, Shift+Enter for newline)' },
  atAll:           { zh: '@ 所有人', en: '@ everyone' },
  taskMode:        { zh: '派工', en: 'Dispatch' },
  taskModeOffTitle:{ zh: '派工开关（当前关闭）：关闭时 @ 可操作成员仅问答聊天，不会执行本地操作；开启后消息变成派工单，独占分派给选中的执行 agent', en: 'Dispatch toggle (off): @ capable members for Q&A only; on, messages become work orders assigned exclusively to the selected executor' },
  usageTitle:      { zh: '消耗统计', en: 'Usage' },
  usageTitleBtn:   { zh: '消耗统计：所有 agent 的 token 与轮次台账', en: 'Usage: token & turn ledger across all agents' },
  usageNote:       { zh: 'tokens 为各 agent 上报的模型消耗；桥接类产品只计轮次（消耗在其产品内结算）。C 类与未上报的 turn 不计入 tokens。', en: 'Tokens are reported by each agent; bridge products count turns only (credit settles inside their own walls). C-class turns without token reports are not counted.' },
  voiceTitle:      { zh: '语音输入（占位：接 Web Speech / 豆包 ASR）', en: 'Voice input (placeholder: Web Speech / Doubao ASR)' },
  uploadFile:      { zh: '文件', en: 'File' },
  uploadImage:     { zh: '图片', en: 'Image' },
  uploadVideo:     { zh: '视频', en: 'Video' },
  uploadAudio:     { zh: '音频', en: 'Audio' },
  uploadArtifact:  { zh: '上传产物', en: 'Upload artifact' },
  // ---- right panel (group space) ----
  spaceHead:       { zh: '群空间 · 产物', en: 'Group space · artifacts' },
  spaceHint:       { zh: '按来源分色', en: 'color-coded by source' },
  tabOverview:     { zh: '概览', en: 'Overview' },
  tabFile:         { zh: '文件', en: 'Files' },
  tabImage:        { zh: '图片', en: 'Images' },
  tabMedia:        { zh: '音视频', en: 'Media' },
  tabTree:         { zh: '代码树', en: 'Code tree' },
  tabBrowser:      { zh: '浏览器', en: 'Browser' },
  tabHistory:      { zh: '上下文', en: 'Context' },
  // ---- status / capability labels (dynamic) ----
  stBusy:          { zh: '执行中', en: 'Busy' },
  stError:         { zh: '上次失败', en: 'Failed' },
  stIdle:          { zh: '空闲', en: 'Idle' },
  stOffline:       { zh: '离线', en: 'Offline' },
  stAsking:        { zh: '等你回答', en: 'Needs you' },
  capLocal:        { zh: '可操作本机', en: 'Local access' },
  capCloud:        { zh: '仅云端', en: 'Cloud only' },
  typeA:           { zh: '本地服务', en: 'Local service' },
  typeW:           { zh: '桌面客户端', en: 'Desktop client' },
  typeE:           { zh: 'MCP 服务', en: 'MCP service' },
  typeG:           { zh: 'CLI 工具', en: 'CLI tool' },
  typeC:           { zh: '文件桥', en: 'File bridge' },
  typeD:           { zh: '桌面转发', en: 'Desktop relay' },
  typeB:           { zh: '模型 API', en: 'Model API' },
  // ---- settings / about ----
  closeTitle:      { zh: '关闭', en: 'Close' },
  pluginsBtn:      { zh: '已装插件', en: 'Plugins' },
  pluginsBtnTitle: { zh: '查看 server/adapters.d/ 下已装的适配器插件', en: 'Adapter plugins installed under server/adapters.d/' },
  checkUpdate:     { zh: '检查更新', en: 'Check updates' },
  back:            { zh: '返回', en: 'Back' },
  wizTitle:        { zh: '接入 agent', en: 'Connect an agent' },
  wizDiscHint:     { zh: '本机检测到以下 agent，勾选要接入的：', en: 'Agents found on this machine — tick the ones to connect:' },
  wizOnboard:      { zh: '接入选中', en: 'Connect selected' },
  wizKindHint:     { zh: '它属于下面哪种？', en: 'Which kind is it?' },
  // ---- today/yesterday + misc ----
  today:           { zh: '今天', en: 'Today' },
  yesterday:       { zh: '昨天', en: 'Yesterday' },
  sysNotice:       { zh: '系统通知', en: 'System' },
  typeOther:       { zh: '其他', en: 'Other' },
  taskOnTitle:     { zh: '派工模式已开启：消息将生成派工单，独占分派（再点一次退出，回到问答聊天）', en: 'Dispatch ON: messages become work orders, exclusive assignment (click again to return to chat)' },
  taskOffTitle:    { zh: '派工开关（当前关闭）：关闭时 @ 可操作成员仅问答聊天，不会执行本地操作；开启后消息变成派工单，独占分派给选中的执行 agent', en: 'Dispatch toggle (off): @ capable members for Q&A only; on, messages become work orders assigned exclusively to the selected executor' },
  taskOnPh:        { zh: '描述要执行的任务（将生成派工单，独占分派）…', en: 'Describe the task to execute (becomes a work order, exclusive assignment)...' },
  taskOffPh:       { zh: '输入消息，@ 成员问答聊天…（要派单先点右侧派工按钮；Enter 发送，Shift+Enter 换行）', en: 'Type a message, @ a member to chat... (for work orders use the dispatch button; Enter to send, Shift+Enter for newline)' },
};

let lang = null;
try {
  lang = localStorage.getItem('zjl_lang')
    || ((navigator.language || 'zh-CN').toLowerCase().startsWith('zh') ? 'zh' : 'en');
} catch { lang = 'zh'; }

export function getLang() { return lang; }

export function t(key) {
  const e = DICT[key];
  if (!e) return key;
  return e[lang] || e.zh;
}

// Apply to the DOM: data-i18n -> textContent, data-i18n-ph -> placeholder,
// data-i18n-title -> title. Call once at boot and after every language switch.
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  document.title = 'Tmesh · ' + (lang === 'zh' ? '多 agent 协作' : 'multi-agent collaboration');
}

export function setLang(l) {
  lang = l === 'en' ? 'en' : 'zh';
  try { localStorage.setItem('zjl_lang', lang); } catch { /* private mode */ }
  applyI18n();
  return lang;
}
