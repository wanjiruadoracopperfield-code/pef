'use strict';
const VERSION = '1.0';
const LF = String.fromCharCode(10);
const KINDS = {
  am: { name: '早上吸药前', short: '早前', color: '#2563eb', hint: '起床后，吸药之前' },
  pm: { name: '晚上吸药前', short: '晚前', color: '#4338ca', hint: '刷牙后，吸药之前' },
  bowel: { name: '大便后', short: '便后', color: '#b45309', hint: '解完 5 分钟内' },
  shower: { name: '洗澡后', short: '澡后', color: '#7c3aed', hint: '洗完 5 分钟内' },
  relief: { name: '缓解后', short: '缓解', color: '#059669', hint: '觉得好了再测' },
  calm: { name: '平时', short: '平时', color: '#0891b2', hint: '中午或下午没事时' },
  other: { name: '突然不舒服', short: '其他', color: '#64748b', hint: '其他时候难受' },
  shot: { name: '打针', short: '打针', color: '#db2777', hint: '打针当天记一下' }
};
const ORDER = ['am', 'pm', 'bowel', 'shower', 'relief', 'calm', 'other', 'shot'];
const READ_KINDS = ORDER.filter(k => k !== 'shot');
const TRIGGERS = ['bowel', 'shower', 'other'];
const WHERE = [['胸', '胸口闷/紧'], ['喉', '喉咙紧/有东西'], ['吸不满', '吸不满'], ['咳', '咳嗽']];
const PAIRS = { '热水': '温水', '温水': '热水', '顺畅': '要使劲', '要使劲': '顺畅' };
const BATH = { direct: '吸完药直接洗', wait: '吸药后等 30 分钟再洗' };
const BATH_SHORT = { direct: '直接洗', wait: '等30' };
const TITLES = { today: '今天', history: '历史记录', stats: '统计', more: '导出和设置' };
const WEEK = '日一二三四五六';
const KEY = 'pef.records.v1', SKEY = 'pef.settings.v1';
const DEF = { best: null, shotEvery: 28, oddDirect: true, hideInstall: false, shotName: '' };

function loadJSON(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
let recs = loadJSON(KEY, []);
let cfg = Object.assign({}, DEF, loadJSON(SKEY, {}));
function applyCfg() { KINDS.shot.name = cfg.shotName ? '打' + cfg.shotName : '打针'; }
applyCfg();
let draft = null, view = 'today', range = 14, toastTimer = 0;

function persist() { try { localStorage.setItem(KEY, JSON.stringify(recs)); } catch (e) { alert('保存失败，手机存储可能满了，请先备份。'); } }
function saveCfg() { localStorage.setItem(SKEY, JSON.stringify(cfg)); }

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const pad = n => String(n).padStart(2, '0');
const dayKey = t => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const keyDate = k => { const a = k.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); };
const daysBetween = (a, b) => Math.round((keyDate(b) - keyDate(a)) / 86400000);
const addDays = (k, n) => { const d = keyDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
const hm = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const md = k => Number(k.slice(5, 7)) + '/' + Number(k.slice(8, 10));
const dayLabel = k => { const d = keyDate(k); return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + WEEK[d.getDay()]; };
const toInput = t => dayKey(t) + 'T' + hm(t);
const fromInput = v => { const p = v.split('T'), a = p[0].split('-').map(Number), b = (p[1] || '0:0').split(':').map(Number); return new Date(a[0], a[1] - 1, a[2], b[0], b[1]).getTime(); };
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const r0 = v => Math.round(v);
const maxOf = a => Math.max.apply(null, a);
const minOf = a => Math.min.apply(null, a);
const f1 = v => v == null ? '—' : v.toFixed(1);
const fmtDrop = v => v == null ? '—' : (v >= 0 ? '低 ' + r0(v) + '%' : '高 ' + r0(-v) + '%');
const signPct = v => v == null ? '—' : (v >= 0 ? '+' : '') + r0(v) + '%';
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const isStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
const byTime = (a, b) => a.t - b.t;

function groupByDay(list) { const g = {}; list.slice().sort(byTime).forEach(r => { const k = dayKey(r.t); (g[k] = g[k] || []).push(r); }); return g; }
function bestPEF() { if (cfg.best) return { v: cfg.best, manual: true }; let m = 0; recs.forEach(r => { if (r.pef > m) m = r.pef; }); return m ? { v: m, manual: false } : null; }
function pctOf(v) { const b = bestPEF(); return b && v ? r0(v / b.v * 100) : null; }
function shotDays() { return Array.from(new Set(recs.filter(r => r.kind === 'shot').map(r => dayKey(r.t)))).sort(); }
function shotInfo(k) { const s = shotDays().filter(d => d <= k); if (!s.length) return null; const day = s[s.length - 1], n = daysBetween(day, k); return { n, day, label: n === 0 ? '打针当天' : '打针后第 ' + n + ' 天' }; }
function bathFor(k) { return (Number(k.slice(8, 10)) % 2 === 1) === cfg.oddDirect ? 'direct' : 'wait'; }
function dayVar(vals) { if (vals.length < 2) return null; const hi = maxOf(vals), lo = minOf(vals); return (hi - lo) / ((hi + lo) / 2) * 100; }
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2000); }

function nextShotLine(k) {
  const si = shotInfo(k);
  if (!si) return `<div class='muted' style='margin-top:6px'>点下面的“${KINDS.shot.name}”，把上一次打针的日期记上（时间可以改成那天），就会显示打针后第几天。</div>`;
  const next = addDays(si.day, cfg.shotEvery), left = daysBetween(k, next);
  const tail = left > 0 ? '（还有 ' + left + ' 天）' : left === 0 ? '（就是今天）' : '（已过 ' + (-left) + ' 天，打了记得记一下）';
  return `<div class='muted' style='margin-top:6px'>按每 ${cfg.shotEvery} 天一次算，下次大约 ${md(next)}${tail}</div>`;
}
function recBits(r) {
  const p = [];
  if (r.score != null) p.push('难受 ' + r.score);
  if (r.where && r.where.length) p.push(r.where.join('、'));
  if (r.dizzy) p.push('头晕/心慌');
  if (r.bath) p.push(BATH_SHORT[r.bath]);
  if (r.gap != null) p.push('隔 ' + r.gap + ' 分钟洗');
  if (r.mins != null) p.push(r.kind === 'relief' ? r.mins + ' 分钟缓解' : '持续 ' + r.mins + ' 分钟');
  if (r.tags && r.tags.length) p.push(r.tags.join('、'));
  if (r.med) p.push('额外用了药');
  if (r.note) p.push(r.note);
  return p.join(' · ');
}
function recRow(r) {
  const K = KINDS[r.kind] || KINDS.other, pct = pctOf(r.pef);
  return `<div class='rec' data-edit='${esc(r.id)}'><span class='dot' style='background:${K.color}'></span><span class='time'>${hm(r.t)}</span><div class='what'><b>${K.name}</b><div>${esc(recBits(r)) || '&nbsp;'}</div></div><div class='val'>${r.pef || (r.kind === 'shot' ? '' : '—')}${pct ? `<small>${pct}%</small>` : ''}</div></div>`;
}
function orderCard() {
  return `<details class='card'><summary>每天的顺序</summary><ol class='list'><li>早上起床，吸药前测一次（早上吸药前）</li><li>吸药，照常大便，解完 5 分钟内测（大便后）</li><li>不舒服的话，觉得好了再测一次（缓解后）</li><li>中午或下午没事的时候测一次（平时）</li><li>晚上刷牙后、吸药前测一次（晚上吸药前）</li><li>吸药，按上面“今晚”那条的方式洗澡，洗完 5 分钟内测（洗澡后）；先大便的就记“大便后”</li><li>不舒服的话，好了再测一次（缓解后）</li></ol><p class='muted'>只要难受，随时可以记“突然不舒服”。打针那天点“${KINDS.shot.name}”记一下。</p></details>`;
}
function howToCard() {
  return `<details class='card'><summary>怎么吹才准</summary><ol class='list'><li>站着吹，指针先拨回 0</li><li>深吸一口气，吸到最满</li><li>嘴唇含紧吹口，舌头别挡住</li><li>用最快、最猛的一口气吹出去，1 秒左右就够，不用吹很久</li><li>连吹 3 次，3 个数都填上，自动取最高的；3 次差得很多就再吹一次</li><li>一直用同一个峰流速仪</li></ol></details>`;
}
function renderToday() {
  const k = dayKey(Date.now()), si = shotInfo(k), b = bestPEF();
  const today = recs.filter(r => dayKey(r.t) === k).sort(byTime);
  let h = '';
  if (!isStandalone() && !cfg.hideInstall) h += `<div class='card note install'><div style='flex:1'><b>先加到桌面，再开始记</b><div class='muted' style='margin-top:4px'>在 Safari 里点底部的分享按钮，选“添加到主屏幕”，以后都从桌面图标打开。桌面图标和 Safari 里的记录是分开存的。</div></div><button type='button' class='btn ghost small' data-act='hideInstall'>知道了</button></div>`;
  h += `<div class='card'><div class='day-h'><b>${dayLabel(k)}</b><span class='muted'>${b ? '个人最好 ' + b.v : '还没有个人最好值'}</span></div><div style='margin-top:8px'>${si ? `<span class='pill shot'>${si.label}</span>` : `<span class='pill warn'>还没记打针日期</span>`}<span class='pill'>今晚：${BATH[bathFor(k)]}</span></div>${nextShotLine(k)}</div>`;
  h += `<div class='grid'>${ORDER.map(kind => `<button type='button' class='kbtn' style='background:${KINDS[kind].color}' data-add='${kind}'>${KINDS[kind].name}<small>${KINDS[kind].hint}</small></button>`).join('')}</div>`;
  h += `<div class='card'><h3>今天的记录</h3>${today.length ? `<div class='recs'>${today.map(recRow).join('')}</div>` : `<div class='empty'>今天还没有记录，点上面的按钮开始</div>`}</div>`;
  h += orderCard() + howToCard();
  $('#view-today').innerHTML = h;
}

const chip = (g, v, label, on) => `<button type='button' class='chip${on ? ' on' : ''}' data-chip='${g}' data-v='${esc(v)}'>${esc(label)}</button>`;
function numInput(id, label, val) { return `<div class='field'><label for='${id}'>${label}</label><input type='number' inputmode='numeric' pattern='[0-9]*' id='${id}' value='${val != null ? val : ''}'></div>`; }
function openSheet(kind, id) {
  const old = id ? recs.find(r => r.id === id) : null;
  draft = old ? JSON.parse(JSON.stringify(old)) : { id: newId(), t: Date.now(), kind, pef: null, tries: [], score: null, where: [], dizzy: false, med: false, mins: null, bath: null, gap: null, tags: [], note: '' };
  ['where', 'tags', 'tries'].forEach(f => { if (!Array.isArray(draft[f])) draft[f] = []; });
  if (!old && kind === 'shower') draft.bath = bathFor(dayKey(draft.t));
  if (!old && kind === 'relief') {
    const prev = recs.slice().sort(byTime).reverse().find(r => TRIGGERS.includes(r.kind) && r.t <= draft.t && draft.t - r.t < 4 * 3600000);
    if (prev) draft.mins = Math.max(1, r0((draft.t - prev.t) / 60000));
  }
  renderSheet(!!old);
  $('#sheetWrap').hidden = false;
  document.body.classList.add('noscroll');
}
function closeSheet() { $('#sheetWrap').hidden = true; document.body.classList.remove('noscroll'); draft = null; }
function renderSheet(isEdit) {
  const d = draft, K = KINDS[d.kind] || KINDS.other, shot = d.kind === 'shot';
  let h = `<div class='day-h'><h2 style='color:${K.color}'>${K.name}</h2><button type='button' class='btn ghost small' data-close='1'>取消</button></div>`;
  h += `<div class='field'><label for='fTime'>时间</label><input type='datetime-local' id='fTime' value='${toInput(d.t)}'></div>`;
  if (!shot) {
    h += `<div class='field'><span class='flabel'>峰流速（吹 3 次，每次填一个，自动取最高）</span><div class='tries'>${[0, 1, 2].map(i => `<input type='number' inputmode='numeric' pattern='[0-9]*' placeholder='第 ${i + 1} 次' data-try='${i}' value='${d.tries[i] != null ? esc(d.tries[i]) : ''}'>`).join('')}</div><div class='best' id='fBest'></div></div>`;
    h += `<div class='field'><span class='flabel'>现在有多难受（0 = 完全没事，10 = 最难受）</span><div class='scores'>${Array.from({ length: 11 }, (_, i) => `<button type='button' class='sbtn${d.score === i ? ' on' : ''}' data-score='${i}'>${i}</button>`).join('')}</div></div>`;
    h += `<div class='field'><span class='flabel'>哪里不舒服（可多选）</span><div class='chips'>${WHERE.map(w => chip('where', w[0], w[1], d.where.includes(w[0]))).join('')}${chip('dizzy', '1', '头晕或心慌', d.dizzy)}</div></div>`;
    if (d.kind === 'shower') {
      h += `<div class='field'><span class='flabel'>这次怎么洗的</span><div class='seg'>${chip('bath', 'direct', '吸完药直接洗', d.bath === 'direct')}${chip('bath', 'wait', '等 30 分钟再洗', d.bath === 'wait')}</div></div>`;
      h += numInput('fGap', '吸完药隔了几分钟才洗（可不填）', d.gap);
      h += `<div class='field'><span class='flabel'>洗澡情况（可多选）</span><div class='chips'>${['热水', '温水', '洗头', '开门或开排气扇'].map(v => chip('tag', v, v, d.tags.includes(v))).join('')}</div></div>`;
    }
    if (d.kind === 'bowel') h += `<div class='field'><span class='flabel'>大便情况</span><div class='chips'>${['顺畅', '要使劲'].map(v => chip('tag', v, v, d.tags.includes(v))).join('')}</div></div>`;
    if (d.kind === 'relief') h += numInput('fMins', '从开始难受到缓解，大概几分钟', d.mins);
    if (d.kind === 'other') h += numInput('fMins', '难受了几分钟（可不填）', d.mins);
    h += `<div class='field'><div class='chips'>${chip('med', '1', '这次额外用了药', d.med)}</div></div>`;
  }
  h += `<div class='field'><label for='fNote'>备注（可不填）</label><textarea id='fNote' placeholder='${shot ? '比如：第 4 针' : '比如：洗了 15 分钟，水很热'}'>${esc(d.note)}</textarea></div><div id='fAlert'></div>`;
  h += `<div class='actions'>${isEdit ? `<button type='button' class='btn danger small' data-del='1'>删除</button>` : ''}<button type='button' class='btn' data-save='1'>保存</button></div>`;
  $('#sheetBody').innerHTML = h;
  $('.sheet').scrollTop = 0;
  updateBest();
}
function readTries() { return $$('[data-try]').map(i => i.value.trim()).filter(v => v !== ''); }
function updateBest() {
  const el = $('#fBest'), al = $('#fAlert');
  if (!el) return;
  const nums = readTries().map(Number).filter(n => n > 0);
  if (!nums.length) { el.textContent = '只吹了一次也行，填一个就可以'; al.innerHTML = ''; return; }
  const v = maxOf(nums), b = bestPEF(), pct = b ? r0(v / b.v * 100) : null;
  el.innerHTML = `这次记 <b>${v}</b> L/min${pct ? '，是个人最好值的 ' + pct + '%' : ''}`;
  let w = '';
  if (v < 60 || v > 900) w = '这个数看着不太对，看看是不是输错了。';
  else if (pct && pct < 50 && recs.filter(r => r.pef).length >= 5) w = '这次不到个人最好值的一半。如果同时喘得厉害、说话费劲或嘴唇发紫，请按医生给的应急办法处理，必要时马上去医院或打 120。';
  al.innerHTML = w ? `<div class='alert'>${w}</div>` : '';
}
function saveDraft() {
  const d = draft, tv = $('#fTime').value;
  if (tv) d.t = fromInput(tv);
  if (d.kind !== 'shot') {
    d.tries = readTries();
    const nums = d.tries.map(Number).filter(n => n > 0);
    d.pef = nums.length ? maxOf(nums) : null;
    const num = id => { const el = $('#' + id); return el && el.value !== '' && !isNaN(Number(el.value)) ? Number(el.value) : null; };
    d.gap = num('fGap'); d.mins = num('fMins');
  }
  d.note = $('#fNote').value.trim();
  if (d.kind !== 'shot' && !d.pef && d.score == null && !d.where.length && !d.note && !confirm('没填峰流速，也没填难受程度，还要保存吗？')) return;
  const i = recs.findIndex(r => r.id === d.id);
  if (i >= 0) recs[i] = d; else recs.push(d);
  persist(); closeSheet(); toast('已保存'); render();
}
function delDraft() {
  if (!confirm('删除这条记录？')) return;
  const id = draft.id;
  recs = recs.filter(r => r.id !== id);
  persist(); closeSheet(); toast('已删除'); render();
}
function onSheetClick(e) {
  const b = e.target.closest('[data-close],[data-score],[data-chip],[data-save],[data-del]');
  if (!b || !draft) return;
  if (b.hasAttribute('data-close')) return closeSheet();
  if (b.hasAttribute('data-save')) return saveDraft();
  if (b.hasAttribute('data-del')) return delDraft();
  if (b.dataset.score != null) { const v = Number(b.dataset.score); draft.score = draft.score === v ? null : v; $$('[data-score]').forEach(x => x.classList.toggle('on', Number(x.dataset.score) === draft.score)); return; }
  const g = b.dataset.chip, v = b.dataset.v;
  if (g === 'where' || g === 'tag') {
    const arr = g === 'where' ? draft.where : draft.tags, i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1); else { arr.push(v); const o = PAIRS[v]; if (o && arr.includes(o)) arr.splice(arr.indexOf(o), 1); }
    $$(`#sheetBody [data-chip='${g}']`).forEach(x => x.classList.toggle('on', arr.includes(x.dataset.v)));
  } else if (g === 'dizzy' || g === 'med') { draft[g] = !draft[g]; b.classList.toggle('on', draft[g]); }
  else if (g === 'bath') { draft.bath = v; $$(`#sheetBody [data-chip='bath']`).forEach(x => x.classList.toggle('on', x.dataset.v === v)); }
}
function renderHistory() {
  const el = $('#view-history');
  if (!recs.length) { el.innerHTML = `<div class='card empty'>还没有记录</div>`; return; }
  const g = groupByDay(recs), keys = Object.keys(g).sort();
  const first = keys.find(k => g[k].some(r => r.kind !== 'shot'));
  el.innerHTML = keys.slice().reverse().map(k => {
    const list = g[k], vals = list.filter(r => r.pef).map(r => r.pef), si = shotInfo(k), v = dayVar(vals), sh = list.find(r => r.kind === 'shower' && r.bath);
    let pills = '';
    if (si) pills += `<span class='pill shot'>${si.label}</span>`;
    if (sh) pills += `<span class='pill'>${BATH_SHORT[sh.bath]}</span>`;
    if (vals.length) pills += `<span class='pill gray'>最高 ${maxOf(vals)} · 最低 ${minOf(vals)}${v != null ? ' · 差 ' + r0(v) + '%' : ''}</span>`;
    const dn = first && k >= first ? '第 ' + (daysBetween(first, k) + 1) + ' 天' : '';
    return `<div class='card'><div class='day-h'><b>${dayLabel(k)}</b><span class='muted'>${dn}</span></div><div style='margin:6px 0 2px'>${pills}</div><div class='recs'>${list.map(recRow).join('')}</div></div>`;
  }).join('') + `<p class='muted' style='text-align:center'>点任意一条可以修改或删除</p>`;
}

function refOf(list) {
  const calm = list.filter(r => r.kind === 'calm' && r.pef).map(r => r.pef);
  if (calm.length) return maxOf(calm);
  const base = list.filter(r => r.pef && ['am', 'pm', 'relief'].includes(r.kind)).map(r => r.pef);
  return base.length ? maxOf(base) : null;
}
function drops(list) {
  const out = [], g = groupByDay(list);
  Object.keys(g).forEach(k => { const ref = refOf(g[k]); if (!ref) return; g[k].forEach(r => { if (r.pef && TRIGGERS.includes(r.kind)) out.push({ r, d: (ref - r.pef) / ref * 100 }); }); });
  return out;
}
function calcStats(list) {
  const D = drops(list), g = groupByDay(list);
  const kinds = READ_KINDS.map(k => { const L = list.filter(r => r.kind === k), P = L.filter(r => r.pef).map(r => r.pef), S = L.filter(r => r.score != null).map(r => r.score); return { k, n: P.length, v: avg(P), s: avg(S) }; }).filter(x => x.n);
  const trig = TRIGGERS.map(k => { const L = D.filter(x => x.r.kind === k); return { k, n: L.length, d: avg(L.map(x => x.d)), big: L.filter(x => x.d >= 20).length }; }).filter(x => x.n);
  const bath = ['direct', 'wait'].map(m => { const L = list.filter(r => r.kind === 'shower' && r.bath === m), P = L.filter(r => r.pef).map(r => r.pef), S = L.filter(r => r.score != null).map(r => r.score); return { m, n: L.length, v: avg(P), d: avg(D.filter(x => x.r.kind === 'shower' && x.r.bath === m).map(x => x.d)), s: avg(S), dizzy: L.filter(r => r.dizzy).length }; });
  const vs = Object.keys(g).map(k => dayVar(g[k].filter(r => r.pef).map(r => r.pef))).filter(v => v != null);
  return { kinds, trig, bath, vs };
}
function shotRows() {
  const base = recs.filter(r => r.pef && ['am', 'pm', 'calm'].includes(r.kind));
  const pick = (a, c) => avg(base.filter(r => { const k = dayKey(r.t); return k >= a && k <= c; }).map(r => r.pef));
  return shotDays().map(s => { const pre = pick(addDays(s, -3), addDays(s, -1)), post = pick(addDays(s, 1), addDays(s, 3)); return { s, pre, post, ch: pre && post ? (post - pre) / pre * 100 : null }; });
}
function chartSVG(R, b) {
  const P = R.filter(r => r.pef).sort(byTime), SH = R.filter(r => r.kind === 'shot');
  if (P.length < 2) return `<div class='empty'>这段时间读数太少</div>`;
  const W = 340, H = 200, L = 34, RT = 10, T = 10, B = 22;
  const ts = P.map(r => r.t).concat(SH.map(r => r.t)), t0 = minOf(ts), t1 = maxOf(ts), vals = P.map(r => r.pef);
  let lo = Math.floor(minOf(vals) * 0.9 / 50) * 50, hi = Math.ceil(Math.max(maxOf(vals), b ? b.v : 0) * 1.03 / 50) * 50;
  if (hi - lo < 100) hi = lo + 100;
  const step = hi - lo <= 250 ? 50 : hi - lo <= 600 ? 100 : 200;
  const x = t => (L + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (W - L - RT)).toFixed(1);
  const y = v => (T + (1 - (v - lo) / (hi - lo)) * (H - T - B)).toFixed(1);
  let s = `<svg viewBox='0 0 ${W} ${H}' xmlns='http://www.w3.org/2000/svg' font-size='10'>`;
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) s += `<line x1='${L}' x2='${W - RT}' y1='${y(v)}' y2='${y(v)}' style='stroke:var(--line)'/><text x='${L - 4}' y='${(Number(y(v)) + 3).toFixed(1)}' text-anchor='end' style='fill:var(--sub)'>${v}</text>`;
  const ticks = [], d = new Date(t0);
  d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1);
  for (; d.getTime() <= t1; d.setDate(d.getDate() + 1)) ticks.push(d.getTime());
  const every = Math.max(1, Math.ceil(ticks.length / 6));
  ticks.forEach((t, i) => { s += `<line x1='${x(t)}' x2='${x(t)}' y1='${T}' y2='${H - B}' style='stroke:var(--line)' stroke-dasharray='2 3'/>`; if (i % every === 0) s += `<text x='${x(t)}' y='${H - 6}' text-anchor='middle' style='fill:var(--sub)'>${md(dayKey(t))}</text>`; });
  if (!ticks.length) s += `<text x='${L}' y='${H - 6}' style='fill:var(--sub)'>${md(dayKey(t0))} ${hm(t0)}</text><text x='${W - RT}' y='${H - 6}' text-anchor='end' style='fill:var(--sub)'>${hm(t1)}</text>`;
  if (b) { const v8 = b.v * 0.8; if (v8 > lo && v8 < hi) s += `<line x1='${L}' x2='${W - RT}' y1='${y(v8)}' y2='${y(v8)}' stroke='#059669' stroke-width='1.2' stroke-dasharray='5 4'/>`; }
  SH.forEach(r => { s += `<line x1='${x(r.t)}' x2='${x(r.t)}' y1='${T}' y2='${H - B}' stroke='${KINDS.shot.color}' stroke-width='2'/>`; });
  s += `<polyline fill='none' style='stroke:var(--sub)' stroke-opacity='0.35' stroke-width='1.5' points='${P.map(r => x(r.t) + ',' + y(r.pef)).join(' ')}'/>`;
  P.forEach(r => { s += `<circle cx='${x(r.t)}' cy='${y(r.pef)}' r='3.8' fill='${(KINDS[r.kind] || KINDS.other).color}' style='stroke:var(--card)' stroke-width='1'/>`; });
  return s + '</svg>';
}
function renderStats() {
  const el = $('#view-stats'), b = bestPEF();
  if (recs.filter(r => r.pef).length < 2) { el.innerHTML = `<div class='card empty'>记满几次峰流速以后，这里会出趋势图和对比</div>`; return; }
  const since = range ? Date.now() - range * 86400000 : 0, R = recs.filter(r => r.t >= since), S = calcStats(R);
  const barMax = b ? b.v : (S.kinds.length ? maxOf(S.kinds.map(x => x.v)) : 1);
  let h = `<div class='card'><div class='range'>${[7, 14, 0].map(n => `<button type='button' class='sbtn${range === n ? ' on' : ''}' data-range='${n}'>${n ? '最近 ' + n + ' 天' : '全部'}</button>`).join('')}</div><div class='chart'>${chartSVG(R, b)}</div><div class='legend'>${READ_KINDS.map(k => `<span><i style='background:${KINDS[k].color}'></i>${KINDS[k].short}</span>`).join('')}<span><i class='bar-i' style='background:${KINDS.shot.color}'></i>打针</span>${b ? `<span><i class='bar-i' style='background:#059669'></i>个人最好的 80%</span>` : ''}</div></div>`;
  if (S.kinds.length) h += `<div class='card'><h3>各时间点平均</h3>${S.kinds.map(x => `<div class='krow'><div class='kv0'><span>${KINDS[x.k].name}<span class='muted'> ${x.n} 次${x.s != null ? ' · 难受 ' + f1(x.s) : ''}</span></span><b>${r0(x.v)}</b></div><div class='bar'><i style='width:${Math.min(100, r0(x.v / barMax * 100))}%;background:${KINDS[x.k].color}'></i></div></div>`).join('')}</div>`;
  if (S.trig.length) h += `<div class='card'><h3>便后、澡后掉了多少</h3><table class='cmp'><thead><tr><th></th><th>次数</th><th>平均比参考</th><th>低 20% 以上</th></tr></thead><tbody>${S.trig.map(x => `<tr><td>${KINDS[x.k].short}</td><td>${x.n}</td><td>${fmtDrop(x.d)}</td><td>${x.big} 次</td></tr>`).join('')}</tbody></table><p class='muted'>参考值是当天“平时”的读数；那天没测平时，就用当天吸药前或缓解后的最高值。</p></div>`;
  if (S.bath.some(x => x.n)) h += `<div class='card'><h3>直接洗 和 等 30 分钟 对比</h3><table class='cmp'><thead><tr><th></th><th>次数</th><th>澡后平均</th><th>比参考</th><th>难受</th><th>头晕</th></tr></thead><tbody>${S.bath.map(x => `<tr><td>${BATH_SHORT[x.m]}</td><td>${x.n}</td><td>${x.v != null ? r0(x.v) : '—'}</td><td>${fmtDrop(x.d)}</td><td>${f1(x.s)}</td><td>${x.dizzy} 次</td></tr>`).join('')}</tbody></table><p class='muted'>两种各有 5 次以上，对比才比较靠谱。</p></div>`;
  const SR = shotRows();
  if (SR.length) h += `<div class='card'><h3>打针前 3 天 和 打针后 3 天</h3><table class='cmp'><thead><tr><th>打针日</th><th>前 3 天</th><th>后 3 天</th><th>变化</th></tr></thead><tbody>${SR.map(x => `<tr><td>${md(x.s)}</td><td>${x.pre != null ? r0(x.pre) : '—'}</td><td>${x.post != null ? r0(x.post) : '—'}</td><td>${signPct(x.ch)}</td></tr>`).join('')}</tbody></table><p class='muted'>只算早上吸药前、晚上吸药前和平时的读数，不受上面时间范围影响。</p></div>`;
  if (S.vs.length) h += `<div class='card'><h3>一天里的波动</h3><div class='kv'><span>当天最高和最低平均差</span><span>${r0(avg(S.vs))}%</span></div><div class='kv'><span>差得最多的一天</span><span>${r0(maxOf(S.vs))}%</span></div><p class='muted'>按（最高 - 最低）÷ 两者平均 算，共 ${S.vs.length} 天，医生会参考这个数。</p></div>`;
  h += `<p class='muted' style='padding:0 4px 8px'>这些数字是帮医生看规律用的，怎么用药请听医生的。</p>`;
  el.innerHTML = h;
}

function shortLine(r) {
  const K = KINDS[r.kind] || KINDS.other, p = [K.short];
  if (r.pef) p.push(String(r.pef));
  if (r.tries && r.tries.length > 1) p.push('(' + r.tries.join('/') + ')');
  if (r.where && r.where.length) p.push(r.where.join('') + (r.score != null ? r.score : ''));
  else if (r.score != null) p.push('难受' + r.score);
  if (r.dizzy) p.push('晕');
  if (r.bath) p.push(BATH_SHORT[r.bath]);
  if (r.gap != null) p.push('隔' + r.gap + '分钟洗');
  if (r.mins != null) p.push(r.mins + '分钟');
  if (r.tags && r.tags.length) p.push(r.tags.join('/'));
  if (r.med) p.push('额外用药');
  if (r.note) p.push('备注:' + r.note);
  return p.join(' ');
}
function exportText() {
  const b = bestPEF(), g = groupByDay(recs), now = Date.now(), S = calcStats(recs), L = [];
  L.push('峰流速记录（' + dayKey(now) + ' ' + hm(now) + ' 导出，共 ' + recs.length + ' 条）');
  if (b) L.push('个人最好值：' + b.v + (b.manual ? '（手动设置）' : '（记录里最高）'));
  L.push('记法：早前/晚前=吸药前，便后/澡后=5分钟内，胸/喉/吸不满/咳+数字=部位和难受程度(0-10)，晕=头晕或心慌，括号里是3次读数');
  Object.keys(g).sort().forEach(k => { const si = shotInfo(k); L.push(''); L.push(md(k) + ' 周' + WEEK[keyDate(k).getDay()] + (si ? ' ' + si.label : '')); g[k].forEach(r => L.push('  ' + hm(r.t) + ' ' + shortLine(r))); });
  L.push(''); L.push('== 汇总（全部记录）==');
  S.kinds.forEach(x => L.push(KINDS[x.k].name + '：平均 ' + r0(x.v) + '，' + x.n + ' 次' + (x.s != null ? '，难受平均 ' + f1(x.s) : '')));
  S.trig.forEach(x => L.push(KINDS[x.k].short + '比参考值平均' + fmtDrop(x.d) + '，低 20% 以上 ' + x.big + '/' + x.n + ' 次'));
  S.bath.filter(x => x.n).forEach(x => L.push(BATH_SHORT[x.m] + '：' + x.n + ' 次，澡后平均 ' + (x.v != null ? r0(x.v) : '—') + '，比参考' + fmtDrop(x.d) + '，难受 ' + f1(x.s) + '，头晕 ' + x.dizzy + ' 次'));
  shotRows().forEach(x => L.push('打针 ' + md(x.s) + '：前3天平均 ' + (x.pre != null ? r0(x.pre) : '—') + '，后3天平均 ' + (x.post != null ? r0(x.post) : '—') + '，变化 ' + signPct(x.ch)));
  if (S.vs.length) L.push('一天里最高和最低平均差 ' + r0(avg(S.vs)) + '%（' + S.vs.length + ' 天）');
  return L.join(LF);
}
function exportCSV() {
  const head = ['日期', '时间', '时间点', '峰流速', '三次读数', '占个人最好%', '难受0-10', '部位', '头晕心慌', '洗澡方式', '吸药后隔几分钟洗', '持续或缓解分钟', '情况', '额外用药', '打针后第几天', '备注'];
  const rows = recs.slice().sort(byTime).map(r => { const k = dayKey(r.t), si = shotInfo(k); return [k, hm(r.t), (KINDS[r.kind] || KINDS.other).name, r.pef || '', (r.tries || []).join('/'), pctOf(r.pef) || '', r.score != null ? r.score : '', (r.where || []).join('/'), r.dizzy ? '是' : '', r.bath ? BATH_SHORT[r.bath] : '', r.gap != null ? r.gap : '', r.mins != null ? r.mins : '', (r.tags || []).join('/'), r.med ? '是' : '', si ? si.n : '', r.note || '']; });
  const q = c => '"' + String(c).split('"').join('""') + '"';
  return String.fromCharCode(0xFEFF) + [head].concat(rows).map(row => row.map(q).join(',')).join(String.fromCharCode(13, 10));
}
async function shareFile(name, text, type) {
  const blob = new Blob([text], { type });
  try {
    const f = new File([blob], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f] }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function onRestoreFile(e) {
  const input = e.target, f = input.files && input.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const data = JSON.parse(rd.result), list = Array.isArray(data) ? data : data.recs;
      if (!Array.isArray(list)) throw new Error('bad');
      const have = new Set(recs.map(r => r.id));
      let n = 0;
      list.forEach(r => { if (r && r.id && r.t && KINDS[r.kind] && !have.has(r.id)) { recs.push(r); have.add(r.id); n++; } });
      if (!cfg.best && data.cfg && data.cfg.best) { cfg.best = data.cfg.best; saveCfg(); }
      if (!cfg.shotName && data.cfg && data.cfg.shotName) { cfg.shotName = data.cfg.shotName; applyCfg(); saveCfg(); }
      persist(); toast('恢复了 ' + n + ' 条记录'); render();
    } catch (err) { alert('这个文件读不出来，请确认是这个应用导出的备份文件。'); }
    input.value = '';
  };
  rd.readAsText(f);
}

function safetyCard() {
  return `<div class='card'><h3>这些情况别等，马上去医院</h3><ul class='list'><li>喘得说话说不成句、走不动路</li><li>嘴唇或指甲发紫</li><li>用了急救药还是不缓解，或者越来越重</li><li>峰流速掉到个人最好值的一半以下，同时很难受</li></ul><p class='muted'>先按医生给的应急办法处理，同时去医院或打 120。</p></div>`;
}
function renderMore() {
  const b = bestPEF();
  $('#view-more').innerHTML = `<div class='card'><h3>发给医生或助手</h3><p class='muted'>把全部记录整理成文字，复制以后粘到微信里发出去。</p><div class='actions'><button type='button' class='btn' data-act='copy'>复制全部文字</button></div><div class='actions'><button type='button' class='btn ghost' data-act='csv'>导出表格（Excel 能打开）</button></div><pre class='out' id='outText' hidden></pre></div>`
    + `<div class='card'><h3>备份和恢复</h3><p class='muted'>记录只存在这台手机的这个桌面图标里，不会上传到任何地方。删掉图标或清除 Safari 网站数据会丢失，建议每周备份一次，存到“文件”或发给自己。</p><div class='actions'><button type='button' class='btn ghost' data-act='backup'>备份</button><button type='button' class='btn ghost' data-act='restore'>从备份恢复</button></div><input type='file' id='fileIn' accept='.json,application/json' hidden></div>`
    + `<div class='card'><h3>设置</h3><div class='field'><label for='sBest'>个人最好值（L/min）</label><input type='number' inputmode='numeric' pattern='[0-9]*' id='sBest' value='${cfg.best || ''}' placeholder='${b && !b.manual ? '不填就自动用记录里最高的：' + b.v : '不填就自动用记录里最高的'}'></div><div class='field'><label for='sShot'>打的针叫什么（可不填，只存在这台手机里）</label><input type='text' id='sShot' maxlength='12' value='${esc(cfg.shotName || '')}' placeholder='不填就显示“打针”'></div>${numInput('sEvery', '多少天打一次针', cfg.shotEvery)}<div class='field'><span class='flabel'>洗澡轮换</span><div class='seg'>${chip('odd', '1', '单号日直接洗', cfg.oddDirect)}${chip('odd', '0', '双号日直接洗', !cfg.oddDirect)}</div><p class='muted'>另一种日子吸药后等 30 分钟再洗。</p></div><div class='actions'><button type='button' class='btn' data-act='saveCfg'>保存设置</button></div></div>`
    + safetyCard() + howToCard()
    + `<div class='card'><h3>清空记录</h3><p class='muted'>会删掉这台手机上的全部记录，删之前先备份。</p><div class='actions'><button type='button' class='btn danger' data-act='wipe'>清空全部记录</button></div></div><p class='muted' style='text-align:center;padding-bottom:12px'>峰流速记录 ${VERSION} · 共 ${recs.length} 条 · 数据只存在本机</p>`;
  $('#fileIn').addEventListener('change', onRestoreFile);
}
async function act(a) {
  if (a === 'hideInstall') { cfg.hideInstall = true; saveCfg(); render(); }
  else if (a === 'copy') {
    const text = exportText(), pre = $('#outText');
    pre.textContent = text; pre.hidden = false;
    try { await navigator.clipboard.writeText(text); toast('已复制，去微信里粘贴'); } catch (e) { toast('没能自动复制，请长按下面的文字复制'); }
  }
  else if (a === 'csv') shareFile('峰流速记录_' + dayKey(Date.now()) + '.csv', exportCSV(), 'text/csv');
  else if (a === 'backup') shareFile('峰流速备份_' + dayKey(Date.now()) + '.json', JSON.stringify({ app: 'pef-diary', v: 1, at: new Date().toISOString(), cfg, recs }), 'application/json');
  else if (a === 'restore') $('#fileIn').click();
  else if (a === 'saveCfg') {
    const bv = Number($('#sBest').value), ev = Number($('#sEvery').value), odd = $(`#view-more [data-chip='odd'].on`);
    cfg.best = bv >= 60 && bv <= 900 ? r0(bv) : null;
    cfg.shotEvery = ev >= 7 && ev <= 120 ? r0(ev) : 28;
    cfg.oddDirect = odd ? odd.dataset.v === '1' : true;
    cfg.shotName = $('#sShot').value.trim().slice(0, 12);
    applyCfg();
    saveCfg(); toast('设置已保存'); render();
  }
  else if (a === 'wipe') { if (confirm('确定清空全部记录？这一步不能撤回。') && confirm('再确认一次：真的全部删掉？')) { recs = []; persist(); toast('已清空'); render(); } }
}

function render() { ({ today: renderToday, history: renderHistory, stats: renderStats, more: renderMore })[view](); }
function show(v) {
  view = v;
  $$('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v));
  $$('.tabs button').forEach(x => x.classList.toggle('active', x.dataset.view === v));
  $('#topTitle').textContent = TITLES[v];
  render();
  window.scrollTo(0, 0);
}
$('.tabs').addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (b) show(b.dataset.view); });
$('main').addEventListener('click', e => {
  const t = e.target.closest('[data-add],[data-edit],[data-act],[data-range],[data-chip]');
  if (!t) return;
  if (t.dataset.add) openSheet(t.dataset.add);
  else if (t.dataset.edit) { const r = recs.find(x => x.id === t.dataset.edit); if (r) openSheet(r.kind, r.id); }
  else if (t.dataset.range != null) { range = Number(t.dataset.range); renderStats(); }
  else if (t.dataset.chip === 'odd') $$(`#view-more [data-chip='odd']`).forEach(x => x.classList.toggle('on', x === t));
  else if (t.dataset.act) act(t.dataset.act);
});
$('#sheetWrap').addEventListener('click', onSheetClick);
$('#sheetWrap').addEventListener('input', e => { if (e.target.dataset && e.target.dataset.try != null) updateBest(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !draft) render(); });
window.addEventListener('storage', e => { if (e.key === KEY) { recs = loadJSON(KEY, []); if (!draft) render(); } });
show('today');
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });