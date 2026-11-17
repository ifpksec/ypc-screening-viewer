(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
};
const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); } catch {} }
};
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
let DATA = [], view = [], page = 1, curIdx = -1;
const F = { q: '', sort: 'id', sel: {} };
const GROUPS = [
  { key: 'type', label: '유형', get: d => [d.type ? d.type + '안' : '미상'] },
  { key: 'cluster', label: '군집', get: d => [d.cluster_name] },
  { key: 'age', label: '연령대', get: d => [d.age_band || '연령미상'], order: AGE_ORDER },
  { key: 'hh', label: '가구', get: d => d.household.length ? d.household : ['미분류'] },
  { key: 'topic', label: '주제', get: d => d.topics },
  { key: 'ai', label: 'AI 도구', get: d => d.ai },
  { key: 'tech', label: '기술', get: d => d.tech },
  { key: 'sep', label: '별도자료', get: d => [d.sep ? '있음' : '없음'] },
  { key: 'fmt', label: '형식', get: d => [d.fmt || '?'] }
];

// ---------- 로그인 / 데이터 ----------
async function fetchData(code) {
  const r = await fetch(CFG.SUPABASE_URL + '/rest/v1/rpc/ypc_list', {
    method: 'POST',
    headers: { apikey: CFG.SUPABASE_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ code })
  });
  if (r.status === 403) throw new Error('접근코드가 올바르지 않습니다.');
  if (!r.ok) throw new Error('데이터를 불러오지 못했습니다 (' + r.status + ').');
  return r.json();
}
async function unlock(code) {
  DATA = await fetchData(code);
  for (const d of DATA) { // 양식 안내문·'null' 등 잡음 제거
    if (/해 주세요|제시해|^null$|^None$|출처는/.test(d.headline || '')) d.headline = '';
    d.summary = (d.summary || '').replace(/^[\s·•※■□○●▶\-–]+/, '');
    d.headline = d.headline || '';
  }
  store.set('ypc_code', code);
  $('#gate').hidden = true; $('#app').hidden = false;
  $('#total').textContent = DATA.length + '건';
  renderStats(); applyFilters(); show('stats');
}
$('#gateForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#gateForm button'); btn.disabled = true; $('#gateMsg').textContent = '';
  try { await unlock($('#code').value.trim()); } catch (err) { $('#gateMsg').textContent = err.message; }
  btn.disabled = false;
});
$('#logout').addEventListener('click', () => { store.del('ypc_code'); location.reload(); });
const saved = store.get('ypc_code');
if (saved) unlock(saved).catch(() => store.del('ypc_code'));

// ---------- 탭 ----------
function show(tab) {
  for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  $('#view-stats').hidden = tab !== 'stats'; $('#view-cards').hidden = tab !== 'cards';
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));

// ---------- 통계 ----------
const count = (arr) => { const m = new Map(); for (const v of arr) m.set(v, (m.get(v) || 0) + 1); return m; };
function bars(entries, total, groupKey) {
  const max = Math.max(1, ...entries.map(e => e[1]));
  return entries.map(([label, n]) => el('button', { class: 'bar', title: '사례 목록에서 보기', onclick: () => jump(groupKey, label) },
    el('span', { class: 'lb' }, label),
    el('span', { class: 'tr' }, el('span', { class: 'fl', style: 'width:' + (n / max * 100) + '%' })),
    el('span', { class: 'nv' }, n + ' (' + Math.round(n / total * 100) + '%)')));
}
function jump(key, label) { F.sel = {}; F.q = ''; $('#q').value = ''; F.sel[key] = new Set([label]); page = 1; applyFilters(); show('cards'); }
function groupCounts(g) {
  const m = count(DATA.flatMap(g.get));
  let e = [...m.entries()];
  if (g.order) e.sort((a, b) => g.order.indexOf(a[0]) - g.order.indexOf(b[0])); else e.sort((a, b) => b[1] - a[1]);
  return e;
}
function renderStats() {
  const v = $('#view-stats'); v.replaceChildren();
  const N = DATA.length, avg = Math.round(DATA.reduce((s, d) => s + d.chars, 0) / N);
  const kpi = (b, s) => el('div', { class: 'kpi' }, el('b', {}, b), el('span', {}, s));
  v.append(el('div', { class: 'kpis' },
    kpi(N, '전체 제출'),
    kpi(DATA.filter(d => d.type === 'B').length + ' / ' + DATA.filter(d => d.type === 'A').length, 'B안 / A안'),
    kpi(DATA.filter(d => d.sep).length, '별도자료 첨부'),
    kpi(avg.toLocaleString(), '평균 본문 글자수'),
    kpi(DATA.filter(d => d.tech.length).length, '기술(Python·웹앱 등) 언급'),
    kpi(DATA.filter(d => d.fmt !== 'docx').length, 'docx 외 형식')));
  // 군집
  const cl = groupCounts(GROUPS[1]);
  v.append(el('div', { class: 'panel wide' }, el('h3', {}, '주제 군집 (TF-IDF + KMeans, 클릭하면 해당 사례 목록)'),
    el('div', { class: 'cl' }, cl.map(([name, n]) => el('button', { class: 'cl-item', onclick: () => jump('cluster', name) },
      el('span', { class: 'cl-n' }, n), el('b', {}, name), el('span', { class: 'muted' }, Math.round(n / N * 100) + '%'), el('div', { class: 'kw' }, CL[name] || ''))))),
    el('p', { class: 'hint' }, '군집 간 어휘 중복이 커서 경계 사례가 많습니다(실루엣 약 0.08). 비중은 경향 파악용으로 보세요.'));
  const panel = (title, nodes, wide) => el('div', { class: 'panel' + (wide ? ' wide' : '') }, el('h3', {}, title), nodes);
  const P = el('div', { class: 'panels' });
  P.append(panel('연령대 (본문 첫 언급 기준)', bars(groupCounts(GROUPS[2]), N, 'age')));
  P.append(panel('가구 유형', bars(groupCounts(GROUPS[3]), N, 'hh')));
  P.append(panel('다룬 주제 (3회 이상 언급)', bars(groupCounts(GROUPS[4]), N, 'topic')));
  P.append(panel('AI 도구 언급', bars(groupCounts(GROUPS[5]), N, 'ai')));
  P.append(panel('기술·분석 기법', bars(groupCounts(GROUPS[6]), N, 'tech')));
  // 분량 히스토그램
  const bins = new Map(); for (const d of DATA) { const b = Math.min(7, Math.floor(d.chars / 5000)); bins.set(b, (bins.get(b) || 0) + 1); }
  const be = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([b, n]) => [b === 7 ? '35,000자 이상' : (b * 5000).toLocaleString() + '–' + ((b + 1) * 5000).toLocaleString() + '자', n]);
  const max = Math.max(...be.map(e => e[1]));
  P.append(panel('본문 분량 분포', be.map(([l, n]) => el('div', { class: 'bar', style: 'cursor:default' }, el('span', { class: 'lb' }, l), el('span', { class: 'tr' }, el('span', { class: 'fl', style: 'width:' + n / max * 100 + '%' })), el('span', { class: 'nv' }, n)))));
  // 군집 × 연령
  const names = cl.map(c => c[0]); const tbl = el('table', { class: 'xt' });
  tbl.append(el('tr', {}, el('th', {}, '군집'), AGE_ORDER.map(a => el('th', {}, a))));
  for (const nm of names) tbl.append(el('tr', {}, el('td', {}, nm), AGE_ORDER.map(a => el('td', {}, DATA.filter(d => d.cluster_name === nm && (d.age_band || '연령미상') === a).length || '·'))));
  P.append(el('div', { class: 'panel wide', style: 'overflow:auto' }, el('h3', {}, '군집 × 연령대'), tbl));
  v.append(P);
}

// ---------- 필터 ----------
function matches(d, skipKey) {
  if (F.q) { const q = F.q.toLowerCase(); if (!(d.id + ' ' + d.title + ' ' + d.headline + ' ' + d.summary).toLowerCase().includes(q)) return false; }
  for (const g of GROUPS) {
    if (g.key === skipKey) continue;
    const s = F.sel[g.key]; if (!s || !s.size) continue;
    if (!g.get(d).some(x => s.has(x))) return false;
  }
  return true;
}
function applyFilters() {
  view = DATA.filter(d => matches(d));
  const [k, dir] = F.sort.split('-'); const sgn = dir === 'd' ? -1 : 1;
  view.sort((a, b) => k === 'id' ? a.id.localeCompare(b.id)
    : k === 'chars' ? (a.chars - b.chars) * sgn
    : ((a.age ?? (sgn > 0 ? 999 : -1)) - (b.age ?? (sgn > 0 ? 999 : -1))) * sgn);
  renderFilters(); renderActive(); renderGrid();
}
function renderFilters() {
  const root = $('#filters'); root.replaceChildren();
  for (const g of GROUPS) {
    const base = DATA.filter(d => matches(d, g.key)); const m = count(base.flatMap(g.get));
    let labels = [...new Set(DATA.flatMap(g.get))];
    if (g.order) labels.sort((a, b) => g.order.indexOf(a) - g.order.indexOf(b)); else labels.sort((a, b) => (m.get(b) || 0) - (m.get(a) || 0));
    const sel = F.sel[g.key] || new Set();
    root.append(el('div', { class: 'fg' }, el('div', { class: 'fg-l' }, g.label),
      el('div', { class: 'fg-c' }, labels.map(l => el('button', { class: 'chip' + ((m.get(l) || 0) === 0 && !sel.has(l) ? ' zero' : ''), 'aria-pressed': String(sel.has(l)), onclick: () => toggle(g.key, l) }, l, el('small', {}, m.get(l) || 0))))));
  }
}
function toggle(key, label) {
  const s = F.sel[key] || (F.sel[key] = new Set());
  s.has(label) ? s.delete(label) : s.add(label); page = 1; applyFilters();
}
function renderActive() {
  const a = $('#active'); a.replaceChildren();
  for (const g of GROUPS) for (const l of (F.sel[g.key] || [])) a.append(el('button', { class: 'chip', 'aria-pressed': 'true', onclick: () => toggle(g.key, l) }, g.label + ': ' + l + ' ✕'));
}
$('#q').addEventListener('input', e => { F.q = e.target.value.trim(); page = 1; applyFilters(); });
$('#sort').addEventListener('change', e => { F.sort = e.target.value; page = 1; applyFilters(); });
$('#reset').addEventListener('click', () => { F.sel = {}; F.q = ''; $('#q').value = ''; page = 1; applyFilters(); });

// ---------- 카드 + 페이징 ----------
function renderGrid() {
  const pages = Math.max(1, Math.ceil(view.length / PAGE)); page = Math.min(page, pages);
  $('#count').textContent = view.length + '건 / 전체 ' + DATA.length + '건 · ' + page + '/' + pages + ' 페이지';
  const g = $('#grid'); g.replaceChildren();
  view.slice((page - 1) * PAGE, page * PAGE).forEach(d => {
    const tags = [...d.topics.slice(0, 3).map(t => el('span', { class: 'tag' }, t)), ...d.ai.map(t => el('span', { class: 'tag g' }, t)), ...d.tech.slice(0, 2).map(t => el('span', { class: 'tag g' }, t))];
    if (d.sep) tags.push(el('span', { class: 'tag ok' }, '별도자료 ' + d.sep.files));
    g.append(el('button', { class: 'card', onclick: () => openDetail(d.id) },
      el('div', { class: 'id' }, d.id, el('span', { class: 'badge' }, (d.type || '?') + '안'), el('span', { class: 'badge' }, d.fmt), el('span', {}, d.chars.toLocaleString() + '자')),
      el('h4', {}, d.title), d.headline ? el('div', { class: 'hl' }, d.headline) : null,
      el('p', {}, d.summary), el('div', { class: 'tags' }, tags, el('span', { class: 'tag g' }, d.cluster_name))));
  });
  const p = $('#pager'); p.replaceChildren();
  if (pages > 1) {
    const btn = (label, n, cur, dis) => el('button', { class: 'btn small', 'aria-current': cur ? 'page' : null, disabled: dis, onclick: () => { page = n; renderGrid(); window.scrollTo(0, 0); } }, label);
    p.append(btn('«', 1, false, page === 1), btn('‹', page - 1, false, page === 1));
    const win = new Set([1, pages]); for (let i = page - 2; i <= page + 2; i++) if (i > 0 && i <= pages) win.add(i);
    let last = 0; for (const i of [...win].sort((a, b) => a - b)) { if (i - last > 1) p.append(el('span', { class: 'muted' }, '…')); p.append(btn(String(i), i, i === page, false)); last = i; }
    p.append(btn('›', page + 1, false, page === pages), btn('»', pages, false, page === pages));
  }
}

// ---------- 개별 상세(뷰어) ----------
function openDetail(id) {
  curIdx = view.findIndex(d => d.id === id); const d = view[curIdx] || DATA.find(x => x.id === id); if (!d) return;
  const sepTxt = d.sep ? d.sep.files + '개 파일 · ' + d.sep.mb + 'MB (' + Object.entries(d.sep.ext).map(([e, n]) => e + ' ' + n).join(', ') + ')' : '없음';
  const kv = (k, v) => [el('dt', {}, k), el('dd', {}, v)];
  const url = CFG.LOCAL_VIEWER + d.id + '.html';
  const dt = $('#detail'); dt.replaceChildren(
    el('div', { class: 'id muted' }, d.id + ' · ' + (d.type || '?') + '안 · ' + d.fmt),
    el('h2', {}, d.title), d.headline ? el('div', { class: 'hl', style: 'color:var(--pr)' }, d.headline) : null,
    el('div', { class: 'sum' }, d.summary || '(요약 없음)'),
    el('div', { class: 'tags' }, d.topics.map(t => el('span', { class: 'tag' }, t)), d.ai.map(t => el('span', { class: 'tag g' }, t)), d.tech.map(t => el('span', { class: 'tag g' }, t))),
    el('dl', { class: 'kv' }, kv('군집', d.cluster_name), kv('연령(추정)', d.age ? d.age + '세 (' + d.age_band + ')' : '확인 불가'), kv('가구', d.household.join(', ') || '미분류'), kv('본문 분량', d.chars.toLocaleString() + '자'), kv('별도자료', sepTxt), d.note ? kv('비고', d.note) : []),
    el('div', { class: 'openrow' },
      el('a', { class: 'btn primary', href: url, target: '_blank', rel: 'noopener' }, '원문 열기 (로컬)'),
      el('button', { class: 'btn', onclick: () => navigator.clipboard && navigator.clipboard.writeText(d.id) }, '번호 복사')),
    el('p', { class: 'hint' }, '원문은 심사 PC에서 로컬 뷰어(serve_local)를 실행했을 때만 열립니다. 원문·원본 파일은 이 사이트와 Supabase에 저장되지 않습니다.'));
  $('#prev').disabled = curIdx <= 0; $('#next').disabled = curIdx < 0 || curIdx >= view.length - 1;
  $('#drawer').hidden = false; $('#drawer').scrollTop = 0;
}
$('#prev').addEventListener('click', () => curIdx > 0 && openDetail(view[curIdx - 1].id));
$('#next').addEventListener('click', () => curIdx < view.length - 1 && openDetail(view[curIdx + 1].id));
$('#close').addEventListener('click', () => { $('#drawer').hidden = true; });
document.addEventListener('keydown', e => {
  if ($('#drawer').hidden) return;
  if (e.key === 'Escape') $('#drawer').hidden = true;
  if (e.key === 'ArrowLeft') $('#prev').click(); if (e.key === 'ArrowRight') $('#next').click();
});
})();
