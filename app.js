(() => {
'use strict';
// 캐시된 옛 index.html 과 새 app.js 가 섞인 경우(필수 요소 없음) 자동으로 새로 불러온다.
if (['view-detail', 'view-stats', 'view-cards', 'view-judge', 'view-settings', 'orig', 'qr', 'impbar', 'back', 'navpos', 'gateBack'].some(i => !document.getElementById(i))) {
  if (!/[?&]_r=/.test(location.search)) location.replace(location.pathname + '?_r=' + Date.now() + location.hash);
  else document.body.textContent = '페이지가 최신 상태가 아닙니다. Ctrl+F5 로 새로고침해 주세요.';
  return;
}
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'value') n.value = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
};
const mem = new Map(); // 접근코드·토큰은 메모리에만 보관(새로고침·탭 닫기 시 사라짐)
const store = { get: k => mem.has(k) ? mem.get(k) : null, set: (k, v) => { mem.set(k, v); }, del: k => { mem.delete(k); } };
const sum = a => a.reduce((s, x) => s + Number(x), 0);
const mean = a => a.length ? sum(a) / a.length : null;
const sd = a => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(sum(a.map(x => (x - m) ** 2)) / (a.length - 1)); };
const f1 = x => x == null ? '–' : (Math.round(x * 10) / 10).toString();
const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '–';
const CL = {
  '청년·사회초년생 정책상품': '청년미래적금, 학자금대출, 버팀목, 청약통장, 주택드림',
  '불규칙소득·현금흐름 모형': '월말 지급일, 견적·잔금, 충격 시나리오, 비상금·준비금',
  '신혼·출산·내집마련': '육아휴직, LTV·DSR, 생애최초, 취득세, 정기보험',
  '은퇴·상속·퇴직': '주택연금, 퇴직소득세, 상속세, 재취업, 소득 크레바스',
  '목표자금 배분(주거·결혼·은퇴)': '주거·결혼·은퇴자금 구분, 잉여자금, 신용대출 상환',
  '투자·자산배분': '포트폴리오, 중개형 ISA, 리밸런싱, 연금저축펀드',
  '일반 서술형(주제 미분화)': '뚜렷한 주제어 없이 일반적 서술 위주(경계 사례 포함)',
  '프리랜서·자영업 세무': '노란우산, 종합소득세, 경비율, 사업소득, 사회보험'
};
const AGE_ORDER = ['20대', '30대', '40대', '50대', '60대 이상', '연령미상'];
const PAGE = 12;
const S = { code: null, role: null, judge: null, settings: null };
let DATA = [], ITEM = {}, ASSIGN = [], ADMIN = null, PUB = null, SEPX = {}, MANIP = {}, LINKS = {}; // PUB: 접근코드 없이 받는 공개 집계(통계 탭 전용)
let view = [], page = 1, navIds = [], curIdx = -1;

// ---------- API ----------
async function rpc(fn, body) {
  const r = await fetch(CFG.SUPABASE_URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: CFG.SUPABASE_KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  if (!r.ok) {
    const m = (j && j.message) || ('HTTP ' + r.status);
    const e = new Error(m === 'forbidden' ? '접근코드가 올바르지 않습니다.' : m === 'admin only' ? '관리자 권한이 필요합니다.' : m); e.status = r.status; throw e;
  }
  return j;
}
const call = (fn, body = {}) => rpc(fn, { code: S.code, ...body });

// ---------- 필터 공통 ----------
function mkFilter(groups, textOf) {
  return { groups, sel: {}, q: '', textOf,
    match(row, skip) {
      if (this.q && !this.textOf(row).toLowerCase().includes(this.q.toLowerCase())) return false;
      for (const g of this.groups) { if (g.key === skip) continue; const s = this.sel[g.key]; if (s && s.size && !g.get(row).some(x => s.has(x))) return false; }
      return true;
    },
    reset() { this.sel = {}; this.q = ''; },
    toggle(key, label) { const s = this.sel[key] || (this.sel[key] = new Set()); s.has(label) ? s.delete(label) : s.add(label); }
  };
}
const countOf = arr => { const m = new Map(); for (const v of arr) m.set(v, (m.get(v) || 0) + 1); return m; };
function renderFacets(f, rows, root, activeRoot, onChange) {
  root.replaceChildren();
  for (const g of f.groups) {
    const m = countOf(rows.filter(r => f.match(r, g.key)).flatMap(g.get));
    let labels = [...new Set(rows.flatMap(g.get))];
    if (g.order) labels.sort((a, b) => g.order.indexOf(a) - g.order.indexOf(b)); else labels.sort((a, b) => (m.get(b) || 0) - (m.get(a) || 0));
    const sel = f.sel[g.key] || new Set();
    root.append(el('div', { class: 'fg' }, el('div', { class: 'fg-l' }, g.label),
      el('div', { class: 'fg-c' }, labels.map(l => el('button', { class: 'chip' + ((m.get(l) || 0) === 0 && !sel.has(l) ? ' zero' : ''), 'aria-pressed': String(sel.has(l)), onclick: () => { f.toggle(g.key, l); onChange(); } }, l, el('small', {}, m.get(l) || 0))))));
  }
  activeRoot.replaceChildren();
  for (const g of f.groups) for (const l of (f.sel[g.key] || [])) activeRoot.append(el('button', { class: 'chip', 'aria-pressed': 'true', onclick: () => { f.toggle(g.key, l); onChange(); } }, g.label + ': ' + l + ' ✕'));
}
function renderPager(root, pg, pages, go) {
  root.replaceChildren(); if (pages <= 1) return;
  const btn = (label, n, cur, dis) => el('button', { class: 'btn small', 'aria-current': cur ? 'page' : null, disabled: dis, onclick: () => { go(n); window.scrollTo(0, 0); } }, label);
  root.append(btn('«', 1, false, pg === 1), btn('‹', pg - 1, false, pg === 1));
  const win = new Set([1, pages]); for (let i = pg - 2; i <= pg + 2; i++) if (i > 0 && i <= pages) win.add(i);
  let last = 0; for (const i of [...win].sort((a, b) => a - b)) { if (i - last > 1) root.append(el('span', { class: 'muted' }, '…')); root.append(btn(String(i), i, i === pg, false)); last = i; }
  root.append(btn('›', pg + 1, false, pg === pages), btn('»', pages, false, pg === pages));
}

// ---------- 로그인 ----------
async function unlock(code, opts = {}) {
  S.code = code;
  const who = await rpc('ypc_whoami', { code });
  S.role = who.role; S.judge = who.judge; S.settings = who.settings;
  if (!PUB) { try { PUB = await rpc('ypc_public_stats', {}); } catch {} }
  $('#logout').textContent = '잠그기';
  const [data, asg] = await Promise.all([call('ypc_list'), call('ypc_assignments')]);
  DATA = data; ASSIGN = asg;
  for (const d of DATA) {
    if (/해 주세요|제시해|^null$|^None$|출처는/.test(d.headline || '')) d.headline = '';
    d.summary = (d.summary || '').replace(/^[\s·•※■□○●▶\-–]+/, ''); d.headline = d.headline || '';
  }
  ITEM = Object.fromEntries(DATA.map(d => [d.id, d]));
  try { MANIP = (await call('ypc_manip')) || {}; } catch { MANIP = {}; } // 평가 유도·단정 표현 점검(관리자 전용)
  try { LINKS = (await call('ypc_links')) || {}; } catch { LINKS = {}; } // 링크로 제출한 별도 제출물 안내
  try { SEPX = (await call('ypc_sepx')) || {}; } catch { SEPX = {}; } // 별도자료 실행 점검(관리자: 전체·점수 포함 / 심사위원: 배정 사례의 설명만)
  if (S.role === 'admin') ADMIN = await call('ypc_admin_state');
  try { const tk = await call('ypc_orig_token'); if (tk) store.set('ypc_gh', tk); } catch {} // 관리자가 등록한 공용 읽기 토큰 자동 적용
  if (!opts.keepImp || S.role !== 'judge') store.del('ypc_admin');
  store.set('ypc_code', code);
  $('#qr').hidden = true; if (!$('#orig').hidden) origClose();
  $('#gate').hidden = true; $('#app').hidden = false;
  $('#total').textContent = S.role === 'admin' ? '관리자 · ' + DATA.length + '건' : '심사위원 ' + S.judge.name;
  buildTabs(); initCards(); initJudge(); renderImpBar();
  route();
  if (PENDING) { const f = PENDING; PENDING = null; setTimeout(f, 50); }
}
$('#gateForm').addEventListener('submit', async e => {
  e.preventDefault(); const btn = $('#gateForm button'); btn.disabled = true; $('#gateMsg').textContent = '';
  try { await unlock($('#code').value.trim()); } catch (err) { $('#gateMsg').textContent = err.message; }
  btn.disabled = false;
});
// 공개 모드: 통계·군집 탭만 접근코드 없이 열람. 나머지 탭은 잠금 표시 후 접근코드 입력 화면으로 이동.
function openGate(msg) { $('#app').hidden = true; $('#gate').hidden = false; $('#gateMsg').textContent = msg || ''; $('#code').focus(); }
$('#gateBack').addEventListener('click', () => { if (PUB && !S.code) { $('#gate').hidden = true; $('#app').hidden = false; $('#gateMsg').textContent = ''; } });
async function enterPublic() {
  try { PUB = await rpc('ypc_public_stats', {}); } catch { return; } // 실패하면 접근코드 입력 화면 유지
  $('#gate').hidden = true; $('#app').hidden = false;
  $('#total').textContent = '공개 통계 · ' + PUB.N + '건'; $('#logout').textContent = '접근코드 입력';
  buildTabs(); route();
}
$('#logout').addEventListener('click', () => { if (!S.code) return openGate(); store.del('ypc_code'); store.del('ypc_gh'); store.del('ypc_admin'); history.replaceState(null, '', location.pathname); location.reload(); });
(function autoLogin() {
  const m = /[#&]c=([^&]+)/.exec(location.hash); if (!m) { enterPublic(); return; }
  const code = decodeURIComponent(m[1]); history.replaceState(null, '', location.pathname + location.search);
  unlock(code).catch(e => { $('#gateMsg').textContent = e.message; });
})();

// ---------- 관리자 대리 접속(심사위원으로 보기) ----------
function renderImpBar() {
  const bar = $('#impbar'); const imp = S.role === 'judge' && store.get('ypc_admin');
  bar.hidden = !imp; bar.replaceChildren(); if (!imp) return;
  bar.append(el('span', {}, '관리자 대리 접속 중: ', el('b', {}, S.judge.name), ' 심사위원 화면입니다. 여기서 저장하는 평가는 해당 심사위원 이름으로 기록됩니다.'),
    el('button', { class: 'btn small primary', onclick: backToAdmin }, '관리자로 돌아가기'));
  document.documentElement.style.setProperty('--impH', bar.offsetHeight + 'px');
}
async function impersonate(j) {
  if (!j.code) return; store.set('ypc_admin', S.code);
  try { await unlock(j.code, { keepImp: true }); } catch (e) { store.del('ypc_admin'); alert('심사위원 로그인 실패: ' + e.message); }
}
async function backToAdmin() {
  const a = store.get('ypc_admin'); if (!a) return;
  try { await unlock(a); } catch (e) { store.del('ypc_admin'); store.del('ypc_code'); alert('관리자 복귀 실패(코드가 변경되었을 수 있습니다): ' + e.message); location.reload(); }
}

// ---------- 탭 ----------
const TABS = { stats: '통계·군집', cards: '사례 목록', judge: '심사위원', settings: '설정' };
function buildTabs() {
  if (!S.code) {
    $('#tabs').replaceChildren(el('button', { class: 'tab', role: 'tab', 'data-tab': 'stats', onclick: () => go('stats') }, TABS.stats),
      ...['cards', 'judge', 'settings'].map(n => el('button', { class: 'tab', role: 'tab', title: '접근코드가 필요합니다', onclick: () => openGate('이 탭은 접근코드가 필요합니다.') }, TABS[n] + ' 🔒')));
    return;
  }
  const names = S.role === 'admin' ? ['stats', 'cards', 'judge', 'settings'] : ['judge'];
  $('#tabs').replaceChildren(...names.map(n => el('button', { class: 'tab', role: 'tab', 'data-tab': n, onclick: () => go(n) }, n === 'judge' && S.role === 'admin' ? '심사현황' : TABS[n])));
}
async function refreshAdmin() {
  if (S.role !== 'admin') return;
  try { [ASSIGN, ADMIN] = await Promise.all([call('ypc_assignments'), call('ypc_admin_state')]); S.settings = ADMIN.settings; } catch {}
}
let lastTab = null, detailPushed = false; const scrollPos = {};
const TABKEYS = () => S.role === 'admin' ? ['stats', 'cards', 'judge', 'settings'] : ['judge'];
function go(tab) { scrollPos[tab] = 0; location.hash = '#/' + tab; if (location.hash === '#/' + tab) route(); }
function route() {
  if (!S.code) {
    if (!PUB) return;
    if (/^#\/(cards|judge|settings|case)/.test(location.hash)) { history.replaceState(null, '', location.pathname + location.search + '#/stats'); openGate('이 화면은 접근코드가 필요합니다.'); return; }
    show('stats'); return;
  }
  const m = /^#\/case\/([^/?#]+)/.exec(location.hash);
  if (m) { const id = decodeURIComponent(m[1]); if (ITEM[id]) return showDetail(id); }
  const t = /^#\/(stats|cards|judge|settings)/.exec(location.hash); const ok = t && TABKEYS().includes(t[1]);
  const tab = ok ? t[1] : TABKEYS()[0];
  if (!ok) history.replaceState(null, '', location.pathname + location.search + '#/' + tab);
  show(tab);
}
window.addEventListener('hashchange', route);
async function show(tab) {
  lastTab = tab;
  for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const k of Object.keys(TABS)) $('#view-' + k).hidden = k !== tab;
  $('#view-detail').hidden = true;
  if (tab !== 'cards' && S.role === 'admin') await refreshAdmin();
  if (tab === 'stats') renderStats(); if (tab === 'judge') renderJudge(); if (tab === 'settings') renderSettings();
  window.scrollTo(0, scrollPos[tab] || 0);
}

// ---------- 통계 ----------
function bars(entries, total, onclick) {
  const max = Math.max(1, ...entries.map(e => e[1]));
  return entries.map(([label, n]) => { const on = onclick && label !== XL; return el(on ? 'button' : 'div', { class: 'bar', title: on ? '사례 목록에서 보기' : null, style: on ? null : 'cursor:default', onclick: on ? () => onclick(label) : null },
    el('span', { class: 'lb' }, label), el('span', { class: 'tr' }, el('span', { class: 'fl', style: 'width:' + (n / max * 100) + '%' })),
    el('span', { class: 'nv' }, n + ' (' + Math.round(n / total * 100) + '%)')); });
}
let PENDING = null; // 접근코드 입력 전에 누른 통계 항목: 로그인 직후 같은 필터 목록으로 이동
function jumpMany(obj) {
  if (!S.code) { PENDING = () => jumpMany(obj); openGate('접근코드를 입력하면 선택한 항목의 사례 목록으로 이동합니다.'); return; }
  const o = typeof obj === 'function' ? obj() : obj;
  CF.reset(); $('#q').value = ''; for (const [k, v] of Object.entries(o)) CF.sel[k] = new Set(v); page = 1; applyCards(); go('cards');
}
function jump(key, label) { jumpMany({ [key]: [label] }); }
const kpi = (b, s, on) => el(on ? 'button' : 'div', { class: 'kpi', onclick: on || null, title: on ? '사례 목록에서 보기' : null }, el('b', {}, b), el('span', {}, s));
const panel = (title, nodes, wide) => el('div', { class: 'panel' + (wide ? ' wide' : '') }, el('h3', {}, title), nodes);
// 통계·군집 탭: 공개 집계(PUB)만 사용한다. 관리자는 항목 클릭으로 사례 목록 이동 + 평가 통계가 추가된다.
// ---------- 통계·군집 탭 ----------
// 모든 막대 합계의 기준은 현재 폴더의 심사 대상 N(이전 폴더의 누락 기록은 집계하지 않음). 한 사례가 하나에만 속하는 항목은 합계가 N과 같고,
// 한 사례가 여러 항목에 속할 수 있는 항목(가구·주제·AI·기술)은 "해당 없음" 행을 더해 사례 수 기준 합계를 안내한다.
const XL = '누락(작업 폴더 제외)';
function statSets() {
  const P = PUB, N = P.N, X = 0, T = N; // 누락(이전 폴더 02_제외)은 현재 폴더에 없으므로 집계하지 않는다
  const withX = (e, none) => [...e, ...(none != null ? [['해당 없음', none]] : [])];
  const byAge = [...P.age].sort((a, b) => AGE_ORDER.indexOf(a[0]) - AGE_ORDER.indexOf(b[0]));
  const bins = P.bins.map(([b, n]) => [b >= 7 ? '35,000자 이상' : (b * 5000).toLocaleString() + '–' + ((b + 1) * 5000).toLocaleString() + '자', n]);
  const hhNone = (P.hh.find(r => r[0] === '미분류') || [0, 0])[1];
  const note = (none, has) => '복수 해당 가능 — 막대 합계는 사례 수와 다릅니다. 사례 수 기준: 해당 있음 ' + has + ' + 해당 없음 ' + none + ' = ' + N;
  return { N, X, T,
    type: { rows: withX([['B안', P.nB], ['A안', P.nA]]) },
    age: { rows: withX(byAge) }, bins: { rows: withX(bins) }, vis: { rows: withX(P.vis) },
    hh: { rows: withX(P.hh), note: note(hhNone, N - hhNone) },
    topic: { rows: withX(P.topic, P.nTopicNone), note: note(P.nTopicNone, N - P.nTopicNone) },
    ai: { rows: withX(P.ai, P.nAiNone), note: note(P.nAiNone, N - P.nAiNone) },
    tech: { rows: withX(P.tech, N - P.nTech), note: note(N - P.nTech, P.nTech) },
    cluster: P.cluster, gaps: P.gaps };
}
const cellCA = (c, a) => (PUB.clusterAge.find(x => x[0] === c && x[1] === a) || [0, 0, 0])[2] || 0;

const localDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
// 통계·군집 탭 마크다운 내려받기(공개 집계만 포함)
function statsMarkdown() {
  const P = PUB, S3 = statSets(), N = S3.N, T = S3.T, X = P.sep, NL = '\n';
  const tbl = (head, rows) => '| ' + head.join(' | ') + ' |' + NL + '|' + head.map(() => '---').join('|') + '|' + NL + rows.map(r => '| ' + r.join(' | ') + ' |').join(NL) + NL;
  const dist = (e, tot) => tbl(['항목', '건수', '비율'], e.map(([l, n]) => [l, n, Math.round(n / tot * 100) + '%']));
  const H = t => NL + t + NL + NL;
  const sumRow = rows => '합계(단일 소속 항목) ' + rows.reduce((s, r) => s + r[1], 0) + NL;
  let m = '# YPC2026 1차 스크리닝 — 통계·군집' + NL + NL + '작성일 ' + localDate() + ' · 심사 대상 ' + N + '건 (집계만 포함, 사례별 내용 없음)' + NL;
  m += H('## 1. 개요') + tbl(['지표', '값'], [['심사 대상', N], ['B안 / A안(심사 대상)', P.nB + ' / ' + P.nA], ['별도자료 첨부(심사 대상)', P.nSep], ['평균 본문 글자수', Number(P.avgChars).toLocaleString()], ['기술(Python·웹앱 등) 언급', P.nTech], ['docx 외 형식', P.nNonDocx]]);
  m += H('## 2. 유형 (A/B안)') + dist(S3.type.rows, T) + sumRow(S3.type.rows);
  m += H('## 3. 주제 군집 (TF-IDF + KMeans)') + dist(S3.cluster, T) + sumRow(S3.cluster);
  m += NL + '> 군집 간 어휘 중복이 커서 경계 사례가 많습니다(실루엣 약 0.08). 대표 어휘는 앱 화면의 군집 설명을 참고하세요.' + NL;
  m += H('## 4. 연령대 (본문 첫 언급 기준)') + dist(S3.age.rows, T) + sumRow(S3.age.rows);
  for (const [t, k, lab] of [['## 5. 가구 유형', 'hh'], ['## 6. 다룬 주제 (3회 이상 언급)', 'topic'], ['## 7. AI 도구 언급', 'ai'], ['## 8. 기술·분석 기법', 'tech']])
    m += H(t) + dist(S3[k].rows, T) + NL + '> ' + S3[k].note + NL;
  m += H('## 9. 본문 분량 분포') + dist(S3.bins.rows, T) + sumRow(S3.bins.rows);
  m += H('## 10. 도식·표 비중 (본문 docx 기준)') + dist(S3.vis.rows, T) + sumRow(S3.vis.rows);
  m += H('## 11. 미상·미분류·결측 현황') + dist(S3.gaps, T) + NL + '> 항목별 독립 집계이므로 합계는 의미가 없습니다.' + NL;
  const names = S3.cluster.map(c => c[0]);
  const colSum = a => names.reduce((s, n) => s + cellCA(n, a), 0);
  m += H('## 12. 군집 × 연령대') + tbl(['군집', ...AGE_ORDER, '합계'], [...names.map(n => [n, ...AGE_ORDER.map(a => cellCA(n, a)), AGE_ORDER.reduce((s, a) => s + cellCA(n, a), 0)]),
    ['심사 대상 합계', ...AGE_ORDER.map(colSum), N]]);
  if (X) {
    m += H('## 13. 별도자료(_별도.zip) 통계 — 심사 대상 ' + N + '건 중 ' + X.zips + '건') + '> ' + X.note + NL + NL + tbl(['지표', '값'], [['별도자료 첨부 사례', X.zips], ['압축 안 전체 파일', X.files.toLocaleString()], ['압축 용량 합계', X.mb + 'MB'], ['심사 대상 대비 첨부율', Math.round(X.zips / N * 100) + '%']]);
    m += H('### 13-1. 추정 용도') + dist(X.domain, X.zips) + sumRow(X.domain) + H('### 13-2. 포함된 기능·특징 (중복 가능)') + dist(X.flags, X.zips)
      + H('### 13-3. 실행 방식(파일 구성 기준)') + dist(X.run, X.zips) + sumRow(X.run) + H('### 13-4. 파일 구성') + dist(X.kind, X.zips) + sumRow(X.kind)
      + H('### 13-5. 압축 안 파일 수') + dist(X.size, X.zips) + sumRow(X.size) + H('### 13-6. 필요한 외부 패키지(Python import, 중복 가능)') + dist(X.pkgs, X.zips)
      + H('### 13-7. 군집별 별도자료 첨부 건수') + dist(P.clusterSep, X.zips) + sumRow(P.clusterSep);
  }
  return m;
}
function downloadStatsMd() {
  const blob = new Blob(['﻿' + statsMarkdown()], { type: 'text/markdown;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'YPC2026_통계_군집_' + localDate() + '.md' });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function renderStats() {
  const v = $('#view-stats'); v.replaceChildren(); if (!PUB) return;
  const isAdm = S.role === 'admin', adm = isAdm || !S.code, S3 = statSets(), N = S3.N, T = S3.T, X = S3.X; // adm: 눌러서 이동 가능(로그인 전에는 접근코드 창으로 연결)
  const J = key => adm ? l => { if (l !== XL) jump(key, l); } : null;
  const withNote = (title, set, onc) => panel(title, [...bars(set.rows, T, onc), set.note ? el('p', { class: 'hint' }, set.note) : null]);
  v.append(el('div', { class: 'openrow', style: 'margin-bottom:12px' }, el('button', { class: 'btn small', onclick: downloadStatsMd }, '마크다운(.md) 다운로드')));
  v.append(el('div', { class: 'kpis' },
    kpi(N, '심사 대상', adm ? () => jumpMany({}) : null), kpi(PUB.nB + ' / ' + PUB.nA, 'B안 / A안(심사 대상)'), kpi(PUB.nSep, '별도자료 첨부', adm ? () => jump('sep', '있음') : null),
    kpi(Number(PUB.avgChars).toLocaleString(), '평균 본문 글자수'), kpi(PUB.nTech, '기술(Python·웹앱 등) 언급', adm ? () => jumpMany(() => ({ tech: [...new Set(DATA.flatMap(d => d.tech))] })) : null), kpi(PUB.nNonDocx, 'docx 외 형식', adm ? () => jumpMany(() => ({ fmt: [...new Set(DATA.map(d => d.fmt).filter(f => f && f !== 'docx'))] })) : null)));
  v.append(el('p', { class: 'hint', style: 'margin:-4px 0 14px' }, '심사 대상 ' + N + '건 기준입니다. 단일 소속 항목의 막대 합계는 ' + N + '이며, 비율도 ' + N + '건 기준입니다.'));
  v.append(el('div', { class: 'panel wide', style: 'margin-bottom:16px' }, el('h3', {}, '주제 군집 (TF-IDF + KMeans' + (adm ? ', 클릭하면 해당 사례 목록)' : ')')),
    el('div', { class: 'cl' }, [...PUB.cluster.map(([name, n]) => el(adm ? 'button' : 'div', { class: 'cl-item', style: adm ? null : 'cursor:default', onclick: adm ? () => jump('cluster', name) : null },
      el('span', { class: 'cl-n' }, n), el('b', {}, name), el('span', { class: 'muted' }, Math.round(n / T * 100) + '%'), el('div', { class: 'kw' }, CL[name] || '')))]),
    el('p', { class: 'hint' }, '군집 간 어휘 중복이 커서 경계 사례가 많습니다(실루엣 약 0.08). 비중은 경향 파악용으로 보세요. 군집 합계 ' + N + ' = 심사 대상 ' + N + '.')));
  const P = el('div', { class: 'panels' });
  P.append(panel('유형 (A/B안)', bars(S3.type.rows, T, J('type'))));
  P.append(panel('연령대 (본문 첫 언급 기준)', bars(S3.age.rows, T, J('age'))));
  P.append(withNote('가구 유형', S3.hh, J('hh')));
  P.append(withNote('다룬 주제 (3회 이상 언급)', S3.topic, J('topic')));
  P.append(withNote('AI 도구 언급', S3.ai, J('ai')));
  P.append(withNote('기술·분석 기법', S3.tech, J('tech')));
  P.append(panel('도식·표 비중 (본문 docx 기준)', bars(S3.vis.rows, T, J('vis'))));
  P.append(panel('본문 분량 분포', bars(S3.bins.rows, T, J('chars'))));
  P.append(panel('미상·미분류·결측 현황 (항목별 독립 집계)', [...bars(PUB.gaps, T, J('gap')), el('p', { class: 'hint' }, '서로 겹칠 수 있어 합계는 의미가 없습니다.')]));
  const names = PUB.cluster.map(c => c[0]); const tbl = el('table', { class: 'tbl' });
  tbl.append(el('tr', {}, el('th', {}, '군집'), AGE_ORDER.map(a => el('th', { class: 'n' }, a)), el('th', { class: 'n' }, '합계')));
  const cellBtn = (n, f) => adm && n ? el('button', { class: 'linkbtn', title: '사례 목록에서 보기', onclick: () => jumpMany(f) }, n) : (n || '·');
  for (const nm of names) tbl.append(el('tr', {}, el('td', {}, nm), AGE_ORDER.map(a => el('td', { class: 'n' }, cellBtn(cellCA(nm, a), { cluster: [nm], age: [a] }))), el('td', { class: 'n' }, cellBtn(AGE_ORDER.reduce((s, a) => s + cellCA(nm, a), 0), { cluster: [nm] }))));
  tbl.append(el('tr', { style: 'font-weight:600' }, el('td', {}, '심사 대상 합계'), AGE_ORDER.map(a => el('td', { class: 'n' }, cellBtn(names.reduce((s, n) => s + cellCA(n, a), 0), { age: [a] }))), el('td', { class: 'n' }, cellBtn(N, {}))));
  P.append(el('div', { class: 'panel wide scroll' }, el('h3', {}, '군집 × 연령대'), tbl));
  v.append(P);
  const XS = PUB.sep;
  if (XS) {
    const Z = XS.zips, Q = el('div', { class: 'panels' });
    Q.append(panel('코드를 읽어 본 추정 용도', bars(XS.domain, Z, adm ? l => jump('sepdom', l) : null)));
    Q.append(panel('포함된 기능·특징 (중복 가능)', bars(XS.flags, Z, adm ? l => jump('sepfl', l) : null)));
    Q.append(panel('실행 방식(파일 구성 기준)', bars(XS.run, Z, adm ? l => jump('seprun', l) : null)));
    Q.append(panel('파일 구성', bars(XS.kind, Z, adm ? l => jump('sepkind', l) : null)));
    Q.append(panel('압축 안 파일 수', bars(XS.size, Z, adm ? l => jump('sepsize', l) : null)));
    Q.append(panel('필요한 외부 패키지(Python import, 중복 가능)', bars(XS.pkgs, Z, adm ? l => jump('seppkg', l) : null)));
    Q.append(panel('군집별 별도자료 첨부 건수', bars(PUB.clusterSep, Z, adm ? l => jumpMany({ cluster: [l], sep: ['있음'] }) : null)));
    v.append(el('div', { class: 'sect' }, el('h3', {}, '별도자료(_별도.zip) 통계 — 심사 대상 ' + N + '건 중 ' + Z + '건'),
      el('p', { class: 'sub' }, XS.note + ' 이 섹션의 막대는 별도자료가 있는 ' + Z + '건 기준입니다.'), el('div', { class: 'kpis' }, kpi(Z, '별도자료 첨부 사례', adm ? () => jump('sep', '있음') : null), kpi(XS.files.toLocaleString(), '압축 안 전체 파일'), kpi(XS.mb + 'MB', '압축 용량 합계'), kpi(pct(Z, N), '심사 대상 대비 첨부율', adm ? () => jump('sep', '있음') : null)), Q));
  }
  if (isAdm) { manipStats(v); sepxStats(v); }
}

// 평가 유도·단정 표현 통계(관리자): 숫자를 누르면 해당 사례만 필터된 목록으로 이동
function manipStats(v) {
  if (!DATA.length) return;
  const N = DATA.length, nA = DATA.filter(d => d.type === 'A').length, nB = N - nA;
  const ids = Object.keys(MANIP).filter(i => ITEM[i]);
  const row = lab => { const ds = ids.filter(i => MANIP[i].types[lab]); return { lab, docs: ds.length, sent: ds.reduce((s, i) => s + MANIP[i].types[lab].n, 0), A: ds.filter(i => ITEM[i].type === 'A').length, B: ds.filter(i => ITEM[i].type === 'B').length }; };
  const rows = MANIP_ORDER.map(row);
  const cell = (n, lab) => n && lab ? el('button', { class: 'linkbtn', title: '사례 목록에서 보기', onclick: () => jump('manip', lab) }, n) : (n || '0');
  const tbl = el('table', { class: 'tbl' }, el('tr', {}, el('th', {}, '유형'), el('th', { class: 'n' }, '사례 수'), el('th', { class: 'n' }, '문장 수'), el('th', { class: 'n' }, 'A안 (' + nA + ')'), el('th', { class: 'n' }, 'B안 (' + nB + ')'), el('th', { class: 'n' }, '비율')),
    rows.map((r, i) => el('tr', i === 3 ? { style: 'border-top:2px solid var(--bd)' } : i === 6 ? { style: 'border-top:2px solid var(--bd)' } : {}, el('td', {}, r.lab), el('td', { class: 'n' }, cell(r.docs, r.lab)), el('td', { class: 'n' }, r.sent), el('td', { class: 'n' }, r.A), el('td', { class: 'n' }, r.B), el('td', { class: 'n' }, pct(r.docs, N)))));
  v.append(el('div', { class: 'sect' }, el('h3', {}, '본문 평가 유도·단정 표현 점검 — 심사 대상 ' + N + '건'),
    el('p', { class: 'sub' }, '위 3개 유형(평가자 직접 지시·점수 요구·독창성 강요)은 본문 전체를 정규식으로 훑고 후보 문장을 직접 읽어 확인했으며 해당 문장은 없었습니다. (참고) 3개 유형은 위반이 아닌 정상 범위의 기록입니다. 단정 4개 유형은 실험·결과물·검증 결과를 긍정적·절대적으로 단정한 문장으로, 근거가 있는 경우도 포함합니다. 사례 수를 누르면 해당 사례 목록으로 이동합니다.'),
    el('div', { class: 'scroll' }, tbl)));
}

// 별도자료 실행 점검 통계(관리자): 숫자를 누르면 해당 사례만 필터된 목록으로 이동
function sepxStats(v) {
  const ids = Object.keys(SEPX).filter(i => SEPX[i].gl); if (!ids.length) return;
  const rows = ids.map(i => SEPX[i]); const n = rows.length;
  const cnt = (f, vals) => vals.map(g => [g, rows.filter(r => r[f] === g).length]);
  const Q = el('div', { class: 'panels' });
  Q.append(panel('연계성(본문과의 연결)', bars(cnt('gl', ['상', '중', '하']), n, l => jump('sepl', l))));
  Q.append(panel('완성도', bars(cnt('gc', ['상', '중', '하']), n, l => jump('sepc', l))));
  Q.append(panel('사용성', bars(cnt('gu', ['상', '중', '하']), n, l => jump('sepu', l))));
  Q.append(panel('종합(세 항목 평균)', bars(cnt('go', ['상', '중', '하']), n, l => jump('sepo', l))));
  const ft = new Map(); for (const r of rows) for (const t of new Set((r.flags || []).map(f => f.t))) ft.set(t, (ft.get(t) || 0) + 1);
  const fl = [...ft.entries()].sort((a, b) => b[1] - a[1]);
  Q.append(panel('확인 필요 구분(건)', bars(fl, n, l => jump('sepf', l))));
  v.append(el('div', { class: 'sect' }, el('h3', {}, '별도자료 실행 점검(AI 점검 보조) — ' + n + '건'),
    el('p', { class: 'sub' }, '파일을 풀어 열고 HTML은 브라우저에서 입력·클릭해 확인한 결과입니다. 막대를 누르면 해당 사례 목록으로 이동합니다. 점수는 평가 점수가 아닌 확인 순서용 참고값입니다.'), Q));
}

// 평가 점수 통계 (관리자)
function renderEvalStats(v) {
  const crit = S.settings.criteria, maxT = sum(crit.map(c => c.max));
  const N = ASSIGN.length, done = ASSIGN.filter(a => a.status === 'done'), totals = done.map(a => Number(a.total));
  const wrap = el('div', { class: 'sect' }, el('h3', {}, '평가 점수 통계'), el('p', { class: 'sub' }, '평가 완료(점수 전 항목 + 의견 ' + S.settings.min_comment + '자 이상) 건만 집계합니다. 만점 ' + maxT + '점.'));
  if (!N) { wrap.append(el('p', { class: 'muted' }, '아직 배정된 평가가 없습니다. 설정 탭에서 심사위원을 추가하고 랜덤 할당을 실행하세요.')); v.append(wrap); return; }
  wrap.append(el('div', { class: 'kpis' }, kpi(N, '전체 배정'), kpi(done.length + ' (' + pct(done.length, N) + ')', '평가 완료'), kpi(N - done.length, '평가 대기'),
    kpi(f1(mean(totals)), '평균 총점'), kpi(f1(sd(totals)), '표준편차'), kpi(f1(totals.length ? Math.max(...totals) : null) + ' / ' + f1(totals.length ? Math.min(...totals) : null), '최고 / 최저')));
  const P = el('div', { class: 'panels' });
  // 기준별
  const ct = el('table', { class: 'tbl' }, el('tr', {}, ['평가 기준', '만점', '평균', '표준편차', '득점률'].map((h, i) => el('th', { class: i ? 'n' : '' }, h))));
  for (const c of crit) { const vs = done.map(a => a.scores[c.id]).filter(x => x != null).map(Number); ct.append(el('tr', {}, el('td', {}, c.name), el('td', { class: 'n' }, c.max), el('td', { class: 'n' }, f1(mean(vs))), el('td', { class: 'n' }, f1(sd(vs))), el('td', { class: 'n' }, vs.length ? Math.round(mean(vs) / c.max * 100) + '%' : '–'))); }
  P.append(el('div', { class: 'panel scroll' }, el('h3', {}, '기준별 점수'), ct));
  // 심사위원별
  const jt = el('table', { class: 'tbl' }, el('tr', {}, ['심사위원', '배정', '완료', '완료율', '평균 총점', '표준편차', '평균 의견(자)'].map((h, i) => el('th', { class: i ? 'n' : '' }, h))));
  const byJ = new Map(); for (const a of ASSIGN) { if (!byJ.has(a.judge)) byJ.set(a.judge, []); byJ.get(a.judge).push(a); }
  for (const [j, rows] of [...byJ].sort((a, b) => a[0].localeCompare(b[0]))) { const dn = rows.filter(r => r.status === 'done'), t = dn.map(r => Number(r.total));
    jt.append(el('tr', {}, el('td', {}, j), el('td', { class: 'n' }, rows.length), el('td', { class: 'n' }, dn.length), el('td', { class: 'n' }, pct(dn.length, rows.length)), el('td', { class: 'n' }, f1(mean(t))), el('td', { class: 'n' }, f1(sd(t))), el('td', { class: 'n' }, dn.length ? Math.round(mean(dn.map(r => r.comment.trim().length))) : '–'))); }
  P.append(el('div', { class: 'panel scroll' }, el('h3', {}, '심사위원별 (채점 성향 비교)'), jt));
  // 분포
  const step = Math.max(1, Math.round(maxT / 10)), nb = Math.ceil(maxT / step); const hist = Array(nb + 1).fill(0);
  for (const t of totals) hist[Math.min(nb, Math.floor(t / step))]++;
  const hm = Math.max(1, ...hist);
  P.append(panel('총점 분포', hist.map((n, i) => el('div', { class: 'bar', style: 'cursor:default' }, el('span', { class: 'lb' }, i * step + '–' + Math.min(maxT, (i + 1) * step - (i === nb ? 0 : 0.5)) + '점'), el('span', { class: 'tr' }, el('span', { class: 'fl', style: 'width:' + n / hm * 100 + '%' })), el('span', { class: 'nv' }, n)))));
  // 군집별
  const ctab = el('table', { class: 'tbl' }, el('tr', {}, ['군집', '평가 건수', '평균 총점'].map((h, i) => el('th', { class: i ? 'n' : '' }, h))));
  const byC = new Map(); for (const a of done) { const c = ITEM[a.item_id]?.cluster_name; if (!c) continue; if (!byC.has(c)) byC.set(c, []); byC.get(c).push(Number(a.total)); }
  for (const [c, t] of [...byC].sort((a, b) => mean(b[1]) - mean(a[1]))) ctab.append(el('tr', {}, el('td', {}, c), el('td', { class: 'n' }, t.length), el('td', { class: 'n' }, f1(mean(t)))));
  P.append(el('div', { class: 'panel scroll' }, el('h3', {}, '군집별 평균 점수'), byC.size ? ctab : el('p', { class: 'muted' }, '완료된 평가가 없습니다.')));
  // 사례 순위
  const byI = new Map(); for (const a of done) { if (!byI.has(a.item_id)) byI.set(a.item_id, []); byI.get(a.item_id).push(Number(a.total)); }
  const rank = [...byI].map(([id, t]) => ({ id, n: t.length, avg: mean(t), gap: t.length > 1 ? Math.max(...t) - Math.min(...t) : null })).sort((a, b) => b.avg - a.avg);
  const rt = el('table', { class: 'tbl' }, el('tr', {}, ['순위', '사례', '평균 총점', '평가자', '평가자 간 편차'].map((h, i) => el('th', { class: i > 1 ? 'n' : '' }, h))));
  rank.slice(0, 20).forEach((r, i) => rt.append(el('tr', { style: 'cursor:pointer', onclick: () => openDetail(r.id, rank.map(x => x.id)) }, el('td', {}, i + 1), el('td', {}, r.id + ' · ' + (ITEM[r.id]?.title || '')), el('td', { class: 'n' }, f1(r.avg)), el('td', { class: 'n' }, r.n), el('td', { class: 'n' }, f1(r.gap)))));
  P.append(el('div', { class: 'panel wide scroll' }, el('h3', {}, '사례별 평균 점수 상위 20 (편차가 크면 추가 검토 권장)'), rank.length ? rt : el('p', { class: 'muted' }, '완료된 평가가 없습니다.')));
  wrap.append(P); v.append(wrap);
}

// ---------- 사례 목록 ----------
// 도식·표 비중: 본문 docx에서 표 안 글자 + 텍스트상자·도형 글자 + 그림 면적(쪽 면적=1,800자로 환산)이 전체에서 차지하는 비율(%)
const VIS_ORDER = ['40% 이상', '80% 이상', '40~79%', '40% 미만', '측정 불가(docx 외)'];
const visBands = d => d.vis_pct == null ? ['측정 불가(docx 외)'] : d.vis_pct < 40 ? ['40% 미만'] : d.vis_pct >= 80 ? ['40% 이상', '80% 이상'] : ['40% 이상', '40~79%'];
const charBinLabel = c => { const b = Math.min(7, Math.floor((c || 0) / 5000)); return b >= 7 ? '35,000자 이상' : (b * 5000).toLocaleString() + '–' + ((b + 1) * 5000).toLocaleString() + '자'; };
const CHAR_BINS = [0, 1, 2, 3, 4, 5, 6, 7].map(b => charBinLabel(b * 5000));
const SEP_SIZES = ['1–5개', '6–20개', '21–100개', '101개 이상'];
const sepSizeLabel = n => n <= 5 ? SEP_SIZES[0] : n <= 20 ? SEP_SIZES[1] : n <= 100 ? SEP_SIZES[2] : SEP_SIZES[3];
const GAP_LABELS = ['연령 미상', '가구 유형 미분류', '주제 미분류(다룬 주제 없음)', '군집: 일반 서술형(주제 미분화)', '요약문 없음', '본문 변환 이상(단순 텍스트 복구본)', '도식·표 비중 측정 불가(docx 외)', 'AI 도구 언급 없음'];
const gapLabels = d => [!d.age_band && GAP_LABELS[0], !(d.household || []).length && GAP_LABELS[1], !(d.topics || []).length && GAP_LABELS[2], d.cluster_name === '일반 서술형(주제 미분화)' && GAP_LABELS[3],
  !String(d.summary || '').trim() && GAP_LABELS[4], d.note && GAP_LABELS[5], d.vis_pct == null && GAP_LABELS[6], !(d.ai || []).length && GAP_LABELS[7]].filter(Boolean);
const MANIP_ORDER = ['평가자(심사위원·AI)에게 직접 지시', '점수·긍정 평가 요구', '독창성·우월성 강요', '채점 기준·가점을 노린 작성 기록(참고)', '모의 채점·자체 평가 기록(참고)', '숨김·보이지 않는 글자(참고)', '단정① 완전·무오류', '단정② 전수 통과·문제 없음', '단정③ 입증·검증 완료', '단정④ 효과·성과'];
const CGROUPS = [
  { key: 'type', label: '유형', get: d => [d.type ? d.type + '안' : '미상'] },
  { key: 'cluster', label: '군집', get: d => [d.cluster_name] },
  { key: 'age', label: '연령대', get: d => [d.age_band || '연령미상'], order: AGE_ORDER },
  { key: 'hh', label: '가구', get: d => d.household.length ? d.household : ['미분류'] },
  { key: 'topic', label: '주제', get: d => d.topics.length ? d.topics : ['해당 없음'] },
  { key: 'ai', label: 'AI 도구', get: d => d.ai.length ? d.ai : ['해당 없음'] },
  { key: 'tech', label: '기술', get: d => d.tech.length ? d.tech : ['해당 없음'] },
  { key: 'vis', label: '도식·표 비중', get: d => visBands(d), order: VIS_ORDER },
  { key: 'sep', label: '별도자료', get: d => [d.sep ? '있음' : '없음'] },
  { key: 'sepdom', label: '별도 추정 용도', get: d => d.sep && d.sep.domain ? [d.sep.domain] : [] },
  { key: 'sepfl', label: '별도 포함 기능', get: d => d.sep && d.sep.flags ? d.sep.flags : [] },
  { key: 'seprun', label: '별도 실행 방식', get: d => d.sep && d.sep.run ? [d.sep.run] : [] },
  { key: 'sepkind', label: '별도 파일 구성', get: d => d.sep && d.sep.kind ? [d.sep.kind] : [] },
  { key: 'seppkg', label: '별도 외부 패키지', get: d => d.sep && d.sep.pkgs ? d.sep.pkgs : [] },
  { key: 'manip', label: '평가 유도·단정 표현(AI 점검)', get: d => MANIP[d.id] ? Object.keys(MANIP[d.id].types) : [], order: MANIP_ORDER },
  { key: 'sepsize', label: '별도자료 파일 수', get: d => d.sep ? [sepSizeLabel(d.sep.files)] : [], order: SEP_SIZES },
  { key: 'chars', label: '본문 분량', get: d => [charBinLabel(d.chars)], order: CHAR_BINS },
  { key: 'gap', label: '미상·결측', get: d => gapLabels(d), order: GAP_LABELS },
  { key: 'sepl', label: '별도 연계성(AI 점검)', get: d => SEPX[d.id] && SEPX[d.id].gl ? [SEPX[d.id].gl] : [], order: ['상', '중', '하'] },
  { key: 'sepc', label: '별도 완성도(AI 점검)', get: d => SEPX[d.id] && SEPX[d.id].gc ? [SEPX[d.id].gc] : [], order: ['상', '중', '하'] },
  { key: 'sepu', label: '별도 사용성(AI 점검)', get: d => SEPX[d.id] && SEPX[d.id].gu ? [SEPX[d.id].gu] : [], order: ['상', '중', '하'] },
  { key: 'sepo', label: '별도 종합(AI 점검)', get: d => SEPX[d.id] && SEPX[d.id].go ? [SEPX[d.id].go] : [], order: ['상', '중', '하'] },
  { key: 'sepf', label: '별도 확인 필요(AI 점검)', get: d => SEPX[d.id] && SEPX[d.id].flags ? SEPX[d.id].flags.map(f => f.t) : [] },
  { key: 'fmt', label: '형식', get: d => [d.fmt || '?'] }
];
let CF = mkFilter(CGROUPS, d => d.id + ' ' + d.title + ' ' + d.headline + ' ' + d.summary);
let cardSort = 'id';
function makeCard(d, onclick, badge, extraTags = []) {
  const tags = [...d.topics.slice(0, 3).map(t => el('span', { class: 'tag' }, t)), ...d.ai.map(t => el('span', { class: 'tag g' }, t)), ...d.tech.slice(0, 2).map(t => el('span', { class: 'tag g' }, t))];
  if (d.sep) tags.push(el('span', { class: 'tag ok' }, '별도자료 ' + d.sep.files));
  return el('button', { class: 'card', onclick },
    el('div', { class: 'id' }, d.id, el('span', { class: 'badge' }, (d.type || '?') + '안'), el('span', { class: 'badge' }, d.fmt), el('span', {}, d.chars.toLocaleString() + '자'), badge || null),
    el('h4', {}, d.title), d.headline ? el('div', { class: 'hl' }, d.headline) : null, el('p', {}, d.summary),
    el('div', { class: 'tags' }, tags, el('span', { class: 'tag g' }, d.cluster_name), extraTags));
}
function initCards() {
  CF.reset(); page = 1; cardSort = 'id'; $('#q').value = ''; $('#sort').value = 'id'; applyCards();
}
function applyCards() {
  view = DATA.filter(d => CF.match(d));
  const [k, dir] = cardSort.split('-'); const sgn = dir === 'd' ? -1 : 1;
  view.sort((a, b) => k === 'id' ? a.id.localeCompare(b.id) : k === 'chars' ? (a.chars - b.chars) * sgn : ((a.age ?? (sgn > 0 ? 999 : -1)) - (b.age ?? (sgn > 0 ? 999 : -1))) * sgn);
  renderFacets(CF, DATA, $('#filters'), $('#active'), () => { page = 1; applyCards(); });
  renderGrid();
}
function renderGrid() {
  const pages = Math.max(1, Math.ceil(view.length / PAGE)); page = Math.min(page, pages);
  $('#count').textContent = view.length + '건 / 전체 ' + DATA.length + '건 · ' + page + '/' + pages + ' 페이지';
  const g = $('#grid'); g.replaceChildren();
  const ids = view.map(d => d.id);
  view.slice((page - 1) * PAGE, page * PAGE).forEach(d => g.append(makeCard(d, () => openDetail(d.id, ids))));
  renderPager($('#pager'), page, pages, n => { page = n; renderGrid(); });
}
$('#q').addEventListener('input', e => { CF.q = e.target.value.trim(); page = 1; applyCards(); });
$('#sort').addEventListener('change', e => { cardSort = e.target.value; page = 1; applyCards(); });
$('#reset').addEventListener('click', () => { CF.reset(); $('#q').value = ''; page = 1; applyCards(); });


// ---------- 심사위원 탭 ----------
const stText = r => r.status === 'done' ? '평가 완료' : '평가 대기';
const stBadge = r => el('span', { class: 'st ' + (r.status === 'done' ? 'done' : r.started ? 'prog' : 'wait') }, r.status === 'done' ? '평가 완료 · ' + f1(Number(r.total)) + '점' : r.started ? '평가 대기 · 작성중' : '평가 대기');
let JF = null, jpage = 1;
function initJudge() {
  const groups = [{ key: 'st', label: '상태', get: r => [stText(r)] }];
  if (S.role === 'admin') groups.push({ key: 'j', label: '심사위원', get: r => [r.judge] });
  const maxT = sum(S.settings.criteria.map(c => c.max));
  groups.push({ key: 'sc', label: '점수대', order: ['90% 이상', '80~89%', '70~79%', '70% 미만'], get: r => { if (r.status !== 'done') return []; const p = Number(r.total) / maxT * 100; return [p >= 90 ? '90% 이상' : p >= 80 ? '80~89%' : p >= 70 ? '70~79%' : '70% 미만']; } });
  for (const g of CGROUPS) groups.push({ key: 'i_' + g.key, label: g.label, order: g.order, get: r => g.get(r.item) });
  JF = mkFilter(groups, r => r.id + ' ' + r.item.title + ' ' + r.item.headline + ' ' + r.item.summary + ' ' + r.judge);
  if (S.role === 'judge') JF.sel.st = new Set(['평가 대기']);
  jpage = 1;
}
const evalRows = () => ASSIGN.filter(a => ITEM[a.item_id]).map(a => ({ ...a, id: a.item_id, item: ITEM[a.item_id] }));
function renderJudge() {
  const rows = evalRows(), done = rows.filter(r => r.status === 'done').length;
  const head = $('#jhead'); head.replaceChildren(el('div', { class: 'jhead' },
    el('b', {}, S.role === 'admin' ? '전체 심사 진행' : S.judge.name + ' 심사위원 님의 평가'), ' ',
    el('span', { class: 'muted' }, '평가 완료 ' + done + ' / 배정 ' + rows.length + ' (' + pct(done, rows.length) + ') · 평가 대기 ' + (rows.length - done)),
    el('div', { class: 'prog' }, el('span', { style: 'width:' + (rows.length ? done / rows.length * 100 : 0) + '%' })),
    el('div', { class: 'openrow' }, el('button', { class: 'btn small', onclick: zipFromTab }, S.role === 'admin' ? '현재 목록 원본 zip 다운로드' : '내 담당 원본 전체 zip 다운로드')),
    el('div', { class: 'hint' }, '완료 기준: 모든 평가 항목 점수 입력(범위 내) + 의견 ' + S.settings.min_comment + '자 이상. 기준에 못 미치면 저장은 되지만 "평가 대기(작성중)"으로 남습니다.')));
  if (S.role === 'admin') renderEvalStats(head); // 평가 점수 통계는 심사현황 탭에 표시
  if (!rows.length) { $('#jfilters').replaceChildren(); $('#jactive').replaceChildren(); $('#jcount').textContent = ''; $('#jpager').replaceChildren();
    $('#jgrid').replaceChildren(el('p', { class: 'muted' }, S.role === 'admin' ? '배정된 평가가 없습니다. 설정 탭에서 심사위원을 추가하고 랜덤 할당을 실행하세요.' : '배정된 평가가 없습니다. 관리자에게 문의하세요.')); return; }
  const list = rows.filter(r => JF.match(r)).sort((a, b) => (a.status === 'done') - (b.status === 'done') || a.id.localeCompare(b.id) || a.judge.localeCompare(b.judge));
  renderFacets(JF, rows, $('#jfilters'), $('#jactive'), () => { jpage = 1; renderJudge(); });
  const pages = Math.max(1, Math.ceil(list.length / PAGE)); jpage = Math.min(jpage, pages);
  $('#jcount').textContent = list.length + '건 · ' + jpage + '/' + pages + ' 페이지';
  const g = $('#jgrid'); g.replaceChildren(); const ids = list.map(r => r.id);
  list.slice((jpage - 1) * PAGE, jpage * PAGE).forEach(r => g.append(makeCard(r.item, () => openDetail(r.id, ids, r.judge_id), stBadge(r), S.role === 'admin' ? [el('span', { class: 'tag' }, '심사 ' + r.judge)] : [])));
  renderPager($('#jpager'), jpage, pages, n => { jpage = n; renderJudge(); });
}
$('#jq').addEventListener('input', e => { JF.q = e.target.value.trim(); jpage = 1; renderJudge(); });
$('#jreset').addEventListener('click', () => { JF.reset(); $('#jq').value = ''; jpage = 1; renderJudge(); });

// ---------- 상세 페이지 + 평가 ----------
function openDetail(id, ids) {
  navIds = ids && ids.length ? ids : view.map(d => d.id);
  if (lastTab) scrollPos[lastTab] = window.scrollY;
  detailPushed = true; location.hash = '#/case/' + encodeURIComponent(id);
}
function navStep(delta) { const nid = navIds[curIdx + delta]; if (!nid) return; history.replaceState(null, '', location.pathname + location.search + '#/case/' + encodeURIComponent(nid)); showDetail(nid); }
function showDetail(id) {
  if (!navIds.includes(id)) navIds = [id]; curIdx = navIds.indexOf(id);
  const d = ITEM[id]; if (!d) return;
  for (const k of Object.keys(TABS)) $('#view-' + k).hidden = true; $('#view-detail').hidden = false;
  if (!lastTab) lastTab = TABKEYS()[0];
  for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.tab === lastTab));
  const sepTxt = d.sep ? d.sep.files + '개 파일 · ' + d.sep.mb + 'MB (' + Object.entries(d.sep.ext).map(([e, n]) => e + ' ' + n).join(', ') + ')' : (SEPX[d.id] ? '단일 파일로 제출(압축 아님) — 아래 점검 결과 참고' : '없음');
  const kv = (k, v) => [el('dt', {}, k), el('dd', {}, v)];
  const dt = $('#detail'); const info = el('div', {},
    el('div', { class: 'id muted' }, d.id + ' · ' + (d.type || '?') + '안 · ' + d.fmt),
    el('h2', {}, d.title), d.headline ? el('div', { class: 'hl', style: 'color:var(--pr)' }, d.headline) : null,
    cardBox(d),
    el('div', { class: 'sum' }, el('div', { class: 'sep-h' }, '작성자 서두(원문 발췌)'), d.summary || '(요약 없음)'),
    el('div', { class: 'tags' }, d.topics.map(t => el('span', { class: 'tag' }, t)), d.ai.map(t => el('span', { class: 'tag g' }, t)), d.tech.map(t => el('span', { class: 'tag g' }, t))),
    el('dl', { class: 'kv' }, kv('군집', d.cluster_name), kv('연령(추정)', d.age ? d.age + '세 (' + d.age_band + ')' : '확인 불가'), kv('가구', d.household.join(', ') || '미분류'), kv('본문 분량', d.chars.toLocaleString() + '자'), kv('도식·표 비중', d.vis_pct == null ? '측정 불가(docx 외 형식)' : d.vis_pct + '%'), kv('별도자료', sepTxt), d.note ? kv('비고', d.note) : []),
    el('div', { class: 'openrow' }, el('button', { class: 'btn primary', onclick: () => openOriginal(d) }, '원본 보기'),
      el('button', { class: 'btn', onclick: () => navigator.clipboard && navigator.clipboard.writeText(d.id) }, '번호 복사')),
    manipBox(d),
    sepSection(d),
    el('p', { class: 'hint' }, '원본 보기: 비공개 레포(' + CFG.ORIG_REPO + ')에서 읽기 전용 토큰으로 직접 불러옵니다.'));
  dt.replaceChildren(el('div', { class: 'dgrid' }, info, S.role === 'judge' ? evalForm(d) : adminEvals(d)));
  $('#prev').disabled = curIdx <= 0; $('#next').disabled = curIdx < 0 || curIdx >= navIds.length - 1;
  $('#navpos').textContent = navIds.length > 1 ? (curIdx + 1) + ' / ' + navIds.length : '';
  window.scrollTo(0, 0);
}
// 링크로 제출한 별도 제출물: 참가자가 적은 원문과 운영팀 확인 메모. 주소는 http(s)만 새 탭 링크로 연다.
function linksBox(d) {
  const x = LINKS[d.id]; if (!x) return null;
  const kv = (k, v) => v ? [el('dt', {}, k), el('dd', {}, v)] : [];
  const lin = (txt) => { const out = []; let i = 0; const re = /https?:\/\/[^\s)>\]"',，]+/g; let m;
    while ((m = re.exec(txt))) { if (m.index > i) out.push(txt.slice(i, m.index)); const u = m[0].replace(/[.;]+$/, ''); out.push(el('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, u)); i = m.index + u.length; re.lastIndex = i; }
    if (i < txt.length) out.push(txt.slice(i)); return out; };
  return dsub('링크로 제출한 내용', x.t ? el('div', { class: 'cmd' }, ...lin(x.t)) : null,
    kvr(['여는 방법', x.h], ['운영팀 확인', (x.n || []).join(' / ')]),
    el('p', { class: 'hint' }, '참가자가 신청서 링크 칸에 적은 원문입니다. 외부 사이트이므로 입력칸에 개인정보를 넣지 마세요. 무료 호스팅 앱은 처음 열 때 깨어나는 데 시간이 걸릴 수 있습니다.'));
}
// 별도 제출물 섹션: 제출 현황 → 링크 → 설명·확인 → AI 점검(관리자) → 파일 구성 상세 순서로 고정
function sepSection(d) {
  const subs = [sepSummary(d), linksBox(d), ...sepxBoxes(d), d.sep ? sepBox(d) : null].filter(Boolean);
  return subs.length ? el('div', { class: 'sepbox' }, el('h3', {}, '별도 제출물'), ...subs) : null;
}
// 본문 평가 유도·단정 표현 점검(관리자 전용): 정규식 후보를 읽고 가려낸 문장. 위반 판정이 아니라 확인용 표시.
function manipBox(d) {
  const m = MANIP[d.id]; if (!m || S.role !== 'admin') return null;
  const labs = MANIP_ORDER.filter(l => m.types[l]);
  return el('div', { class: 'sepbox' }, el('h3', {}, '본문 점검 · 평가 유도·단정 표현 (관리자 전용)'),
    labs.map(l => el('div', {}, el('div', { class: 'sep-h' }, l + ' · ' + m.types[l].n + '곳'),
      m.types[l].sn.map(x => el('div', { class: 'cmd' }, (x.p != null ? '[본문 ' + x.p + '% 지점] ' : '') + x.t)))),
    el('p', { class: 'hint' }, '정규식으로 뽑은 후보를 읽고 가려낸 문장으로, 위반 판정이 아니라 위원이 확인할 단서입니다. (참고) 표시는 부록의 AI 프롬프트 기록 등 정상 범위입니다. 사례당 유형별 최대 2문장만 보여 줍니다.'));
}
// 본문 요약 카드: 모든 사례를 같은 5개 항목으로 정리(고객 상황·핵심 과제·제안 방안·근거·AI 활용). 항목마다 본문 원문 인용을 함께 보관한다.
const CARD_F = [['who', '고객 상황'], ['issue', '핵심 과제'], ['plan', '제안 방안'], ['evid', '근거·산출물'], ['ai', 'AI 활용']];
function cardBox(d) {
  const c = d.card; if (!c) return null;
  return el('div', { class: 'cardbox' }, el('div', { class: 'sep-h' }, '본문 요약 카드'),
    el('dl', { class: 'kv' }, CARD_F.flatMap(([k, lab]) => [el('dt', {}, lab), el('dd', { title: c.q && c.q[k] ? '본문: ' + c.q[k] : '' }, c[k])])),
    el('p', { class: 'hint' }, 'AI가 본문을 읽고 같은 형식으로 정리한 요약입니다(평가 아님). 항목에 마우스를 올리면 근거가 된 본문 문장이 보입니다.'));
}
// 상세 화면 표준 구조: 섹션(h3) 안에 소제목(h4) 블록. 항목은 "라벨 / 값" 표(dl.kv)로 통일한다.
const dsub = (title, ...kids) => el('div', { class: 'dsub' }, el('h4', {}, title), ...kids);
const kvr = (...pairs) => el('dl', { class: 'kv' }, pairs.filter(Boolean).flatMap(([k, v]) => v ? [el('dt', {}, k), el('dd', {}, v)] : []));
// 별도 제출물 현황: 어떤 형태로 냈는지(압축·단일 파일·링크)와 구성을 한곳에 모은다.
function sepSummary(d) {
  const forms = [];
  if (d.sep) forms.push('압축(zip) · 파일 ' + d.sep.files + '개 · ' + d.sep.mb + 'MB');
  else if (SEPX[d.id]) forms.push('단일 파일(압축 아님)');
  if (LINKS[d.id]) forms.push('링크 제출');
  if (!forms.length) return null;
  const s = d.sep;
  return dsub('제출 현황', kvr(['제출 형태', forms.join(' + ')], s ? ['용도 분류', s.domain] : null, s ? ['구성', s.kind] : null, s ? ['실행 방식', s.run] : null,
    s && s.pkgs && s.pkgs.length ? ['외부 패키지', s.pkgs.join(', ')] : null, s ? ['주요 확장자', Object.entries(s.ext).map(([e, n]) => e + ' ' + n).join(', ')] : null));
}
// 별도자료 실행 점검: 파일을 열고(HTML은 브라우저에서 입력·클릭) 확인한 내용. 점수·확인 필요 표시는 관리자에게만 내려옴.
function sepxBoxes(d) {
  const x = SEPX[d.id]; if (!x) return [];
  const adm = S.role === 'admin';
  const gr = (lab, g, sc) => g ? el('span', { class: 'tag ' + (g === '상' ? 'ok' : 'g'), title: sc + '점' }, lab + ' ' + g + ' (' + sc + ')') : null;
  const out = [dsub('설명 · 실제로 열어 확인한 내용', el('p', { class: 'about' }, x.about), kvr(['확인한 것', x.check], ['한계·주의', x.limit], ['구성', x.kind]))];
  if (adm) out.push(dsub('AI 점검 결과 (관리자 전용)',
    el('div', { class: 'tags' }, gr('연계성', x.gl, x.link), gr('완성도', x.gc, x.comp), gr('사용성', x.gu, x.use)),
    x.flags && x.flags.length ? el('div', {}, el('div', { class: 'sep-h' }, '확인 필요'), x.flags.map(f => el('div', { class: 'cmd' }, '[' + f.t + '] ' + f.m))) : null,
    kvr(['본문 부록 기재', x.decl], ['연계성 근거', x.lb], ['완성도 근거', x.cb], ['사용성 근거', x.ub], ['보강 의견', x.rec]),
    el('p', { class: 'hint' }, 'HTML은 외부 네트워크를 막은 브라우저에서 열어 입력칸·버튼을 눌러 보았고, 코드·APK는 실행하지 않았습니다. 점수는 AI 점검 보조값이며 평가 점수가 아닙니다.')));
  return out;
}
// 별도자료 상세: 비공개 레포의 sep_info.json(파일 구성·README를 읽어 만든 정적 설명, 코드는 실행하지 않음)
let SEPINFO = null, sepPromise = null;
function loadSepInfo() {
  if (SEPINFO) return Promise.resolve(SEPINFO);
  if (!store.get('ypc_gh')) return Promise.reject(new Error('notoken'));
  return sepPromise || (sepPromise = fetch(`https://api.github.com/repos/${CFG.ORIG_REPO}/contents/sep_info.json`, { headers: ghHeaders(true) })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(j => (SEPINFO = j)).catch(e => { sepPromise = null; throw e; }));
}
const fmtSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : n >= 1024 ? Math.round(n / 1024) + 'KB' : n + 'B';
function sepBox(d) {
  const box = el('div', { class: 'dsub' }, el('h4', {}, '파일 구성 상세'), el('p', { class: 'muted' }, '별도자료 설명을 불러오는 중…'));
  loadSepInfo().then(all => {
    const s = all[d.id]; if (!s) { box.replaceChildren(el('h4', {}, '파일 구성 상세'), el('p', { class: 'muted' }, '이 사례의 별도자료 설명이 없습니다.')); return; }
    const kv = (k, v) => v ? [el('dt', {}, k), el('dd', {}, v)] : [];
    box.replaceChildren(...[el('h4', {}, '파일 구성 상세'),
      el('p', { class: 'about' }, s.about),
      el('dl', { class: 'kv' }, kv('압축 파일', s.nfiles + '개 · ' + (d.sep ? d.sep.mb + 'MB' : '') + (s.hidden ? ' (캐시·git 등 부수 파일 ' + s.hidden + '개 포함)' : '')),
        kv('추정 용도 근거', s.basis), kv('구성', s.kind), kv('실행 방식', s.run), kv('외부 패키지', s.pkgs.join(', ')),
        kv('폴더 구성', s.dirs.map(([n, c]) => n + ' ' + c).join(' · ')), kv('확장자', s.ext.map(([n, c]) => n + ' ' + c).join(', '))),
      s.readme ? el('div', {}, el('div', { class: 'sep-h' }, '제출자 README 발췌'), el('p', { class: 'readme' }, s.readme + (s.readme.length >= 400 ? '…' : ''))) : null,
      s.cmds.length ? el('div', {}, el('div', { class: 'sep-h' }, 'README의 실행 안내'), s.cmds.map(c => el('div', { class: 'cmd' }, c))) : null,
      el('div', { class: 'sep-h' }, '주요 파일'),
      el('div', { class: 'scroll' }, el('table', { class: 'tbl' }, el('tr', {}, el('th', {}, '파일'), el('th', { class: 'n' }, '크기'), el('th', {}, '추정 역할')),
        s.key.map(([n, z, r]) => el('tr', {}, el('td', {}, n), el('td', { class: 'n' }, fmtSize(z)), el('td', {}, r))))),
      el('p', { class: 'hint' }, '파일 이름·README·코드 식별자를 읽어 만든 정적 설명입니다. 코드는 실행하지 않았으므로 실제 동작과 다를 수 있습니다. 전체 파일은 "원본 보기"에서 확인하세요.')].filter(Boolean));
  }).catch(e => box.replaceChildren(el('h4', {}, '파일 구성 상세'), el('p', { class: 'muted' }, e.message === 'notoken' ? '원본 열람 토큰이 없어 별도자료 설명을 불러오지 못했습니다(설정 탭에서 공용 토큰을 등록하세요).' : '별도자료 설명을 불러오지 못했습니다(' + e.message + ').')));
  return box;
}
function adminEvals(d) {
  const rows = ASSIGN.filter(a => a.item_id === d.id); const crit = S.settings.criteria;
  const box = el('div', { class: 'evalbox' }, el('h3', {}, '심사 결과 (' + rows.length + '명 배정)'));
  if (!rows.length) box.append(el('p', { class: 'muted' }, '배정된 심사위원이 없습니다.'));
  for (const r of rows) box.append(el('div', { class: 'judgeev' }, el('b', {}, r.judge), ' ', stBadge(r),
    r.started ? el('div', { class: 'hint' }, crit.map(c => c.name + ' ' + (r.scores[c.id] ?? '–') + '/' + c.max).join(' · ')) : null,
    r.comment ? el('p', {}, r.comment) : el('p', { class: 'muted' }, '(의견 없음)')));
  return box;
}
function evalForm(d) {
  const row = ASSIGN.find(a => a.item_id === d.id); const crit = S.settings.criteria, min = S.settings.min_comment, maxT = sum(crit.map(c => c.max));
  const box = el('div', { class: 'evalbox' }); if (!row) return box;
  const stEl = el('span'), total = el('b'), msg = el('div', { class: 'msg' }), ins = {};
  const setSt = () => stEl.replaceChildren(stBadge(row));
  const calc = () => { let t = 0; for (const c of crit) { const v = ins[c.id].value.trim(); const bad = v !== '' && (isNaN(v) || Number(v) < 0 || Number(v) > Number(c.max)); ins[c.id].classList.toggle('bad', bad); if (v !== '' && !bad) t += Number(v); } total.textContent = f1(t) + ' / ' + maxT + '점'; };
  box.append(el('h3', {}, '평가 ', stEl));
  for (const c of crit) {
    const inp = el('input', { type: 'number', min: 0, max: c.max, step: 0.5, inputmode: 'decimal', value: row.scores[c.id] ?? '', 'aria-label': c.name + ' 점수' });
    inp.addEventListener('input', calc); ins[c.id] = inp;
    box.append(el('div', { class: 'crit' }, el('div', {}, el('b', {}, c.name), ' ', el('span', { class: 'muted' }, '(0~' + c.max + ')')), inp, el('div', { class: 'd' }, c.desc || '')));
  }
  const ta = el('textarea', { placeholder: '평가 의견 (강점·보완점·근거를 구체적으로, ' + min + '자 이상)', maxlength: 5000 }); ta.value = row.comment || '';
  const cnt = el('div', { class: 'hint' }); const cc = () => { const n = ta.value.trim().length; cnt.textContent = n + '자 / 최소 ' + min + '자' + (n >= min ? ' ✓' : ''); }; ta.addEventListener('input', cc);
  const save = el('button', { class: 'btn primary', onclick: async () => {
    const scores = {};
    for (const c of crit) { const v = ins[c.id].value.trim(); if (v === '') continue; const n = Number(v); if (isNaN(n) || n < 0 || n > Number(c.max)) { msg.className = 'msg no'; msg.textContent = c.name + ' 점수는 0~' + c.max + ' 범위여야 합니다.'; return; } scores[c.id] = n; }
    save.disabled = true; msg.className = 'msg'; msg.textContent = '저장 중…';
    try {
      const res = await call('ypc_save_eval', { p_item: d.id, p_scores: scores, p_comment: ta.value });
      Object.assign(row, { scores, comment: ta.value, status: res.status, total: res.total, started: true, updated_at: new Date().toISOString() }); setSt();
      const why = []; if (!res.complete_scores) why.push('점수 미입력 항목이 있습니다'); if (res.comment_len < res.min_comment) why.push('의견이 ' + res.min_comment + '자 미만입니다(현재 ' + res.comment_len + '자)');
      msg.className = 'msg ' + (res.status === 'done' ? 'ok' : 'no'); msg.textContent = res.status === 'done' ? '저장되었습니다 · 평가 완료' : '저장되었습니다 · 평가 대기 (' + why.join(', ') + ')';
      renderJudge();
    } catch (e) { msg.className = 'msg no'; msg.textContent = '저장 실패: ' + e.message; }
    save.disabled = false;
  } }, '저장');
  box.append(el('div', { class: 'totrow' }, el('span', {}, '합계'), total), ta, cnt, msg, el('div', { class: 'openrow' }, save,
    el('button', { class: 'btn', onclick: () => navStep(1) }, '다음 사례 →')));
  setSt(); calc(); cc(); return box;
}
$('#prev').addEventListener('click', () => navStep(-1));
$('#next').addEventListener('click', () => navStep(1));
$('#back').addEventListener('click', () => { if (detailPushed) { detailPushed = false; history.back(); } else go(lastTab || TABKEYS()[0]); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#qr').hidden) $('#qr').hidden = true; else if (!$('#orig').hidden) origClose(); else if (!$('#view-detail').hidden) $('#back').click(); return; }
  if ($('#view-detail').hidden || !$('#orig').hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (e.key === 'ArrowLeft') $('#prev').click(); if (e.key === 'ArrowRight') $('#next').click();
});

// ---------- 설정 탭 (관리자) ----------
let flash = null;
const slug = () => 'c' + Math.random().toString(36).slice(2, 7);
async function act(fn, okMsg) { try { const r = await fn(); if (okMsg) flash = { ok: true, msg: okMsg }; return r; } catch (e) { flash = { ok: false, msg: e.message }; } }
async function renderSettings() {
  const v = $('#view-settings'); v.replaceChildren();
  const st = ADMIN.settings; const sections = [];
  if (flash) { v.append(el('div', { class: 'msg ' + (flash.ok ? 'ok' : 'no') }, flash.msg)); flash = null; }
  const redo = async () => { await refreshAdmin(); renderSettings(); };
  // 1) 심사위원
  const jt = el('table', { class: 'tbl' }, el('tr', {}, ['이름', '활성', '배정', '완료', '접근코드', '작업'].map((h, i) => el('th', { class: i === 2 || i === 3 ? 'n' : '' }, h))));
  for (const j of ADMIN.judges) {
    const nm = el('input', { type: 'text', value: j.name, 'aria-label': '이름' }); const ac = el('input', { type: 'checkbox', 'aria-label': '활성' }); ac.checked = j.active;
    const codeEl = el('span', { class: 'codefont', style: 'font-size:14px' }, '••••••••••'); let shown = false;
    jt.append(el('tr', {}, el('td', {}, nm), el('td', {}, ac), el('td', { class: 'n' }, j.assigned), el('td', { class: 'n' }, j.done),
      el('td', {}, codeEl, ' ', j.code ? el('button', { class: 'btn ghost small', onclick: () => { shown = !shown; codeEl.textContent = shown ? j.code : '••••••••••'; } }, '보기') : el('span', { class: 'muted' }, '(미저장)')),
      el('td', {}, el('div', { class: 'row-actions' },
        el('button', { class: 'btn small', onclick: async () => { await act(() => call('ypc_admin_judge_save', { p_id: j.id, p_name: nm.value, p_active: ac.checked }), j.name + ' 저장됨'); redo(); } }, '저장'),
        j.code ? el('button', { class: 'btn small', onclick: () => showQR(j.name, j.code) }, 'QR') : null,
        j.code && j.active ? el('button', { class: 'btn small', title: '이 심사위원 화면으로 전환(관리자로 돌아올 수 있음)', onclick: () => impersonate(j) }, '심사위원으로 로그인') : null,
        el('button', { class: 'btn small', onclick: async () => { if (!confirm(j.name + ' 의 접근코드를 새로 생성합니다. 기존 코드는 즉시 무효가 됩니다.')) return; await act(() => call('ypc_admin_judge_code', { p_id: j.id, p_new: '' }), j.name + ' 코드 재생성됨'); redo(); } }, '재생성'),
        el('button', { class: 'btn small', onclick: async () => { const c = prompt(j.name + ' 새 접근코드 직접 입력 (6자 이상)'); if (!c) return; await act(() => call('ypc_admin_judge_code', { p_id: j.id, p_new: c }), j.name + ' 코드 변경됨'); redo(); } }, '직접 설정'),
        el('button', { class: 'btn small', onclick: async () => { if (!confirm(j.name + ' 삭제: 배정과 평가 기록이 함께 삭제됩니다. 계속할까요?')) return; await act(() => call('ypc_admin_judge_delete', { p_id: j.id }), j.name + ' 삭제됨'); redo(); } }, '삭제')))));
  }
  const newName = el('input', { type: 'text', placeholder: '새 심사위원 이름' });
  sections.push(el('div', { class: 'sect' }, el('h3', {}, '심사위원'), el('p', { class: 'sub' }, '비활성화하면 로그인이 막힙니다(기존 평가 기록은 유지). QR은 접근코드가 담긴 로그인 링크입니다.'),
    el('div', { class: 'scroll' }, ADMIN.judges.length ? jt : el('p', { class: 'muted' }, '등록된 심사위원이 없습니다.')),
    el('div', { class: 'toolbar', style: 'margin-top:12px' }, newName, el('button', { class: 'btn primary', onclick: async () => {
      if (!newName.value.trim()) return; const r = await act(() => call('ypc_admin_judge_save', { p_id: null, p_name: newName.value, p_active: true }), '추가됨');
      await refreshAdmin(); await renderSettings(); if (r && r.code) showQR(newName.value.trim(), r.code); } }, '심사위원 추가'))));
  // 2) 할당
  const per = el('input', { type: 'number', min: 1, max: 10, value: st.per_item, style: 'width:80px' }); const res = el('div', { class: 'msg' });
  const total = ADMIN.judges.filter(j => j.active).length;
  sections.push(el('div', { class: 'sect' }, el('h3', {}, '평가 할당'), el('p', { class: 'sub' }, '활성 심사위원에게 사례를 무작위로 균등(±1건) 배정합니다. 이미 평가 기록(저장)이 있는 배정은 유지되고, 기록 없는 배정은 초기화 후 다시 배정됩니다. 현재 활성 ' + total + '명 / 전체 ' + ADMIN.items + '건.'),
    el('div', { class: 'toolbar' }, el('label', {}, '사례당 심사위원 수 ', per), el('button', { class: 'btn primary', onclick: async () => {
      if (!total) { res.className = 'msg no'; res.textContent = '활성 심사위원이 없습니다.'; return; }
      if (!confirm('랜덤 균등 할당을 실행합니다. 평가 기록이 없는 기존 배정은 다시 배정됩니다.')) return;
      res.className = 'msg'; res.textContent = '할당 중…';
      try { const r = await call('ypc_admin_assign', { p_per: Number(per.value) }); await refreshAdmin(); await renderSettings(); flash = null; const t = $('#view-settings'); t.prepend(el('div', { class: 'msg ok' }, '할당 완료: ' + r.map(x => x.judge + ' ' + x.assigned + '건').join(' · '))); }
      catch (e) { res.className = 'msg no'; res.textContent = e.message; } } }, '랜덤 균등 할당 실행')), res));
  // 3) 평가 기준
  const crit = st.criteria.map(c => ({ ...c })); const ct = el('div'); const sumEl = el('b');
  const drawCrit = () => { ct.replaceChildren(); sumEl.textContent = sum(crit.map(c => c.max || 0)) + '점';
    const t = el('table', { class: 'tbl' }, el('tr', {}, ['평가 기준명', '설명', '만점', ''].map(h => el('th', {}, h))));
    crit.forEach((c, i) => { const n = el('input', { type: 'text', value: c.name }), d = el('input', { type: 'text', value: c.desc || '' }), m = el('input', { type: 'number', min: 1, value: c.max, style: 'width:80px' });
      n.addEventListener('input', () => c.name = n.value); d.addEventListener('input', () => c.desc = d.value); m.addEventListener('input', () => { c.max = Number(m.value); sumEl.textContent = sum(crit.map(x => x.max || 0)) + '점'; });
      t.append(el('tr', {}, el('td', {}, n), el('td', {}, d), el('td', {}, m), el('td', {}, el('div', { class: 'row-actions' }, el('button', { class: 'btn small', disabled: i === 0, onclick: () => { [crit[i - 1], crit[i]] = [crit[i], crit[i - 1]]; drawCrit(); } }, '↑'), el('button', { class: 'btn small', onclick: () => { crit.splice(i, 1); drawCrit(); } }, '삭제')))));
    }); ct.append(el('div', { class: 'scroll' }, t)); };
  drawCrit();
  sections.push(el('div', { class: 'sect' }, el('h3', {}, '평가 기준'), el('p', { class: 'sub' }, '심사위원 입력 화면의 채점 항목입니다. 평가가 시작된 뒤 기준을 바꾸면 기존 점수는 기준 ID 기준으로 유지되며, 삭제된 기준의 점수는 집계에서 빠집니다.'),
    ct, el('div', { class: 'toolbar', style: 'margin-top:10px' }, el('button', { class: 'btn', onclick: () => { crit.push({ id: slug(), name: '새 기준', desc: '', max: 10 }); drawCrit(); } }, '+ 기준 추가'), el('span', {}, '만점 합계 ', sumEl),
      el('button', { class: 'btn primary', onclick: async () => { await act(() => call('ypc_admin_settings', { s: { criteria: crit.map(c => ({ id: c.id, name: c.name.trim(), desc: (c.desc || '').trim(), max: Number(c.max) })) } }), '평가 기준 저장됨'); redo(); } }, '평가 기준 저장'))));
  // 4) 완료 규칙
  const mc = el('input', { type: 'number', min: 0, max: 2000, value: st.min_comment, style: 'width:90px' });
  sections.push(el('div', { class: 'sect' }, el('h3', {}, '평가 완료 규칙'), el('p', { class: 'sub' }, '평가 완료 = 모든 기준 점수가 범위 내로 입력됨 + 의견이 최소 글자수 이상. 변경은 이후 저장하는 평가부터 적용됩니다.'),
    el('div', { class: 'toolbar' }, el('label', {}, '의견 최소 글자수 ', mc), el('button', { class: 'btn primary', onclick: async () => { await act(() => call('ypc_admin_settings', { s: { min_comment: Number(mc.value) } }), '저장됨'); redo(); } }, '저장'))));
  // 4-1) 원본 열람 토큰(공용)
  const tkIn = el('input', { type: 'password', placeholder: 'github_pat_… (ypc-originals 읽기 전용)', autocomplete: 'off', style: 'min-width:260px;flex:1' }); const tkMsg = el('div', { class: 'msg' });
  sections.push(el('div', { class: 'sect' }, el('h3', {}, '원본 열람 토큰 (공용)'),
    el('p', { class: 'sub' }, '등록하면 로그인한 관리자·심사위원이 별도 입력 없이 원본 보기·다운로드·zip을 쓸 수 있습니다. fine-grained 토큰(Repository: ' + CFG.ORIG_REPO + ' 만, Contents: Read-only)을 권장합니다. 토큰은 Supabase에만 저장되고 공개 코드에는 들어가지 않으며, 로그인한 사용자의 브라우저로만 전달됩니다. 상태: ' + (ADMIN.token_hint ? '등록됨 (끝 4자리 ' + ADMIN.token_hint + ')' : '미등록')),
    el('div', { class: 'toolbar' }, tkIn,
      el('button', { class: 'btn primary', onclick: async () => {
        const t = tkIn.value.trim(); if (!t) return; tkMsg.className = 'msg'; tkMsg.textContent = '토큰 검증 중…';
        try { const r = await fetch(`https://api.github.com/repos/${CFG.ORIG_REPO}/contents/${apiPath(CFG.ORIG_DIR + '/YPC2026-001')}`, { headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' } });
          if (!r.ok) throw new Error('이 토큰으로 원본 레포를 읽을 수 없습니다 (' + r.status + '). 레포 선택·Contents 읽기 권한을 확인하세요.');
          await call('ypc_admin_settings', { s: { orig_token: t } }); store.set('ypc_gh', t); flash = { ok: true, msg: '공용 토큰이 검증되어 저장되었습니다.' }; redo();
        } catch (e) { tkMsg.className = 'msg no'; tkMsg.textContent = e.message; } } }, '검증 후 저장'),
      ADMIN.token_hint ? el('button', { class: 'btn', onclick: async () => { if (!confirm('공용 토큰을 삭제합니다. 이후 심사위원은 개별 토큰을 입력해야 원본을 볼 수 있습니다.')) return; await act(() => call('ypc_admin_settings', { s: { orig_token: '' } }), '공용 토큰 삭제됨'); store.del('ypc_gh'); redo(); } }, '삭제') : null), tkMsg));
  // 5) 관리자 코드
  const ac = el('input', { type: 'password', placeholder: '새 관리자 코드 (8자 이상)', autocomplete: 'off' });
  sections.push(el('div', { class: 'sect' }, el('h3', {}, '관리자 접근코드 변경'), el('p', { class: 'sub' }, '변경 즉시 현재 코드는 무효가 되며 이 브라우저는 새 코드로 유지됩니다.'),
    el('div', { class: 'toolbar' }, ac, el('button', { class: 'btn', onclick: async () => { if (ac.value.length < 8) { flash = { ok: false, msg: '8자 이상 입력하세요.' }; return renderSettings(); }
      if (!confirm('관리자 코드를 변경합니다. 새 코드를 꼭 기록하세요.')) return;
      const nc = ac.value; await act(async () => { await call('ypc_admin_admin_code', { p_new: nc }); S.code = nc; store.set('ypc_code', nc); }, '관리자 코드 변경됨'); redo(); } }, '변경'))));
  v.append(...sections);
}

// ---------- QR ----------
async function showQR(name, code) {
  await loadLib('qr', 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js');
  const link = location.origin + location.pathname + '#c=' + encodeURIComponent(code);
  const q = window.qrcode(0, 'M'); q.addData(link); q.make();
  $('#qrName').textContent = name + ' 심사위원'; $('#qrImg').src = q.createDataURL(8, 4); $('#qrCode').textContent = code;
  $('#qrCopy').onclick = () => navigator.clipboard && navigator.clipboard.writeText(link).then(() => { $('#qrCopy').textContent = '복사됨'; setTimeout(() => $('#qrCopy').textContent = '링크 복사', 1500); });
  $('#qrPrint').onclick = () => window.print(); $('#qr').hidden = false;
}
$('#qrClose').addEventListener('click', () => { $('#qr').hidden = true; });

// ---------- 담당 원본 전체 zip ----------
function zipFromTab() {
  const rows = evalRows();
  if (S.role === 'judge') return zipOriginals([...new Set(rows.map(r => r.id))], 'YPC_' + S.judge.name + '_담당원본');
  const ids = [...new Set(rows.filter(r => JF.match(r)).map(r => r.id))];
  if (!ids.length) return alert('다운로드할 사례가 없습니다.');
  zipOriginals(ids, 'YPC_원본_' + ids.length + '건');
}
async function zipOriginals(ids, name) {
  $('#origTitle').textContent = '원본 zip 만들기'; $('#origTitle').dataset.id = ''; $('#origFiles').replaceChildren(); $('#orig').hidden = false; setCur(null);
  if (!store.get('ypc_gh')) return tokenForm(null, () => zipOriginals(ids, name));
  const info = el('p'), bar = el('span', { style: 'width:0%' }), log = el('div', { class: 'hint' }); let cancel = false;
  const stop = el('button', { class: 'btn', onclick: () => { cancel = true; stop.disabled = true; } }, '취소');
  const body = $('#origBody'); body.replaceChildren(el('div', { class: 'tokbox' }, el('b', {}, '원본 zip 만들기 (' + ids.length + '건)'), info, el('div', { class: 'prog' }, bar), log, stop,
    el('p', { class: 'hint' }, '브라우저에서 파일을 모아 압축합니다. 용량이 크면 시간이 걸리니 이 창을 닫지 마세요.')));
  const fail = msg => { body.replaceChildren(el('div', { class: 'tokbox' }, el('p', { class: 'err' }, msg), el('button', { class: 'btn', onclick: origClose }, '닫기'))); };
  const mb = n => (n / 1048576).toFixed(1) + 'MB';
  try {
    await loadLib('jszip', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    info.textContent = '파일 목록 조회 중…';
    const tr = await fetch(`https://api.github.com/repos/${CFG.ORIG_REPO}/git/trees/main?recursive=1`, { headers: ghHeaders(false) });
    if ([401, 403, 404].includes(tr.status)) { store.del('ypc_gh'); tokenForm(null, () => zipOriginals(ids, name)); $('#origBody .err').textContent = '토큰이 올바르지 않거나 권한이 부족합니다(' + tr.status + ').'; return; }
    if (!tr.ok) throw new Error('목록 조회 실패 (' + tr.status + ')');
    const tree = await tr.json(); if (tree.truncated) throw new Error('파일 목록이 너무 커서 일부만 조회되었습니다.');
    const want = new Set(ids), pre = CFG.ORIG_DIR + '/';
    const files = tree.tree.filter(t => t.type === 'blob' && t.path.startsWith(pre) && want.has(t.path.split('/')[1]));
    if (!files.length) throw new Error('해당 사례의 원본 파일을 찾지 못했습니다.');
    const totalB = files.reduce((s, f) => s + f.size, 0); const zip = new window.JSZip(); const fails = []; let idx = 0, done = 0, got = 0;
    const upd = () => { info.textContent = done + ' / ' + files.length + ' 파일 · ' + mb(got) + ' / ' + mb(totalB); bar.style.width = (done / files.length * 100) + '%'; };
    upd();
    const worker = async () => { while (!cancel) { const i = idx++; if (i >= files.length) return; const f = files[i];
      try { const r = await fetch(`https://api.github.com/repos/${CFG.ORIG_REPO}/contents/${apiPath(f.path)}`, { headers: ghHeaders(true) }); if (!r.ok) throw new Error(r.status);
        zip.file(f.path.slice(pre.length), await r.arrayBuffer(), { compression: 'STORE' }); } catch (e) { fails.push(f.path.slice(pre.length) + ' (' + e.message + ')'); }
      done++; got += f.size; upd(); } };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (cancel) { fail('취소되었습니다.'); return; }
    info.textContent = 'zip 생성 중…'; bar.style.width = '0%';
    const blob = await zip.generateAsync({ type: 'blob', streamFiles: true, compression: 'STORE' }, m => { bar.style.width = m.percent + '%'; });
    const u = URL.createObjectURL(blob); const a = el('a', { href: u, download: name + '.zip' }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 10000);
    body.replaceChildren(el('div', { class: 'tokbox' }, el('b', {}, '다운로드를 시작했습니다'), el('p', {}, name + '.zip · ' + (files.length - fails.length) + '개 파일 · ' + mb(blob.size)),
      fails.length ? el('p', { class: 'err' }, '실패 ' + fails.length + '개: ' + fails.slice(0, 5).join(', ')) : null, el('button', { class: 'btn primary', onclick: origClose }, '닫기')));
  } catch (e) { fail(e.message); }
}

// ---------- 원본 뷰어 (비공개 GitHub 레포, 읽기 전용 토큰) ----------
const libs = {};
const loadLib = (name, src) => libs[name] || (libs[name] = new Promise((ok, no) => { const s = el('script', { src }); s.onload = ok; s.onerror = () => { delete libs[name]; no(new Error(name + ' 로드 실패')); }; document.head.append(s); }));
const ghHeaders = raw => ({ Authorization: 'Bearer ' + store.get('ypc_gh'), Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json' });
const apiPath = p => p.split('/').map(encodeURIComponent).join('/');
let origUrl = null;
let origCur = null;
const MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pdf: 'application/pdf', zip: 'application/zip', doc: 'application/msword' };
function setCur(c) { origCur = c; $('#origDl').disabled = !c; $('#origPrint').disabled = !c || !['docx', 'pdf'].includes(c.ext); }
$('#origDl').addEventListener('click', () => {
  if (!origCur) return; const u = URL.createObjectURL(new Blob([origCur.buf], { type: MIME[origCur.ext] || 'application/octet-stream' }));
  const a = el('a', { href: u, download: origCur.name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
});
$('#origPrint').addEventListener('click', () => {
  if (!origCur) return;
  if (origCur.ext === 'pdf') { const fr = $('#origBody iframe'); if (fr && fr.contentWindow) { fr.contentWindow.focus(); fr.contentWindow.print(); } else window.open(origUrl, '_blank'); }
  else { document.body.classList.add('printing-orig'); const done = () => { document.body.classList.remove('printing-orig'); window.removeEventListener('afterprint', done); }; window.addEventListener('afterprint', done); window.print(); }
});
function origClose() { setCur(null); $('#orig').hidden = true; if (origUrl) { URL.revokeObjectURL(origUrl); origUrl = null; } $('#origBody').replaceChildren(); }
$('#origClose').addEventListener('click', origClose);
$('#origToken').addEventListener('click', () => { store.del('ypc_gh'); const t = $('#origTitle').dataset.id; origClose(); const d = ITEM[t]; if (d) openOriginal(d); });
function tokenForm(d, after) {
  const inp = el('input', { type: 'password', placeholder: 'github_pat_…', autocomplete: 'off' });
  $('#origBody').replaceChildren(el('form', { class: 'tokbox', onsubmit: e => { e.preventDefault(); if (!inp.value.trim()) return; store.set('ypc_gh', inp.value.trim()); after ? after() : listOriginal(d); } },
    el('b', {}, '비공개 레포 읽기 토큰이 필요합니다'),
    el('ol', {}, el('li', {}, 'GitHub → Settings → Developer settings → Fine-grained tokens'), el('li', {}, 'Repository access: ' + CFG.ORIG_REPO + ' 만 선택'), el('li', {}, 'Permissions: Contents → Read-only 로 생성')),
    inp, el('button', { class: 'btn primary', type: 'submit' }, '저장하고 열기'), el('p', { class: 'err' }),
    el('p', { class: 'hint' }, '토큰은 이 브라우저 화면의 메모리에만 보관되며 서버로 전송되지 않습니다. 새로고침하거나 탭을 닫으면 사라집니다.')));
}
async function openOriginal(d) {
  $('#origTitle').textContent = d.id + ' 원본'; $('#origTitle').dataset.id = d.id; $('#origFiles').replaceChildren(); $('#orig').hidden = false;
  if (!store.get('ypc_gh')) return tokenForm(d);
  listOriginal(d);
}
async function listOriginal(d) {
  const body = $('#origBody'); body.replaceChildren(el('p', { class: 'muted' }, '파일 목록을 불러오는 중…'));
  try {
    const r = await fetch(`https://api.github.com/repos/${CFG.ORIG_REPO}/contents/${apiPath(CFG.ORIG_DIR + '/' + d.id)}`, { headers: ghHeaders(false) });
    if ([401, 403, 404].includes(r.status)) { store.del('ypc_gh'); tokenForm(d); $('#origBody .err').textContent = r.status === 404 ? '레포·경로를 찾을 수 없거나 토큰 권한이 부족합니다(' + r.status + ').' : '토큰이 올바르지 않습니다(' + r.status + ').'; return; }
    if (!r.ok) throw new Error('목록 조회 실패 (' + r.status + ')');
    const files = (await r.json()).filter(f => f.type === 'file');
    const bar = $('#origFiles'); bar.replaceChildren();
    const btns = files.map(f => el('button', { class: 'filebtn', 'aria-pressed': 'false', onclick: () => showFile(f, btns) }, f.name + ' · ' + (f.size / 1024 < 1024 ? Math.round(f.size / 1024) + 'KB' : (f.size / 1048576).toFixed(1) + 'MB')));
    bar.append(...btns);
    const main = files.findIndex(f => /_(A|B)안\./.test(f.name) && !/_별도/.test(f.name));
    if (btns.length) showFile(files[main >= 0 ? main : 0], btns); else body.replaceChildren(el('p', {}, '파일이 없습니다.'));
  } catch (e) { body.replaceChildren(el('p', { class: 'err' }, e.message)); }
}
async function showFile(f, btns) {
  btns.forEach(b => b.setAttribute('aria-pressed', String(b.textContent.startsWith(f.name + ' ·'))));
  const body = $('#origBody'); body.replaceChildren(el('p', { class: 'muted' }, '불러오는 중…')); setCur(null);
  if (origUrl) { URL.revokeObjectURL(origUrl); origUrl = null; }
  try {
    const r = await fetch(f.url, { headers: ghHeaders(true) }); if (!r.ok) throw new Error('파일 조회 실패 (' + r.status + ')');
    const buf = await r.arrayBuffer(); const ext = f.name.split('.').pop().toLowerCase(); setCur({ name: f.name, ext, buf });
    if (ext === 'docx') {
      await Promise.all([loadLib('mammoth', 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'), loadLib('purify', 'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js')]);
      const res = await window.mammoth.convertToHtml({ arrayBuffer: buf });
      const div = el('div', { class: 'docx' }); div.innerHTML = window.DOMPurify.sanitize(res.value); body.replaceChildren(div);
    } else if (ext === 'pdf') {
      origUrl = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' })); body.replaceChildren(el('iframe', { src: origUrl, title: f.name }));
    } else {
      origUrl = URL.createObjectURL(new Blob([buf])); body.replaceChildren(el('p', {}, '이 형식은 미리보기를 지원하지 않습니다. '), el('a', { class: 'btn primary', href: origUrl, download: f.name }, f.name + ' 다운로드'));
    }
  } catch (e) { body.replaceChildren(el('p', { class: 'err' }, e.message)); }
}
})();
