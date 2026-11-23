/* ASD1-M2-04 — interfejs. Cała logika (walidacja, wyszukiwanie, sortowanie) jest w core.js;
 * tutaj tylko formularze, rysowanie i potwierdzenia. Teksty użytkownika zawsze przez textContent. */
(function () {
  'use strict';
  const C = window.IdeaBox, T = window.IdeaTests;
  const $ = id => document.getElementById(id);
  const LS_KEY = 'asd1-m2-04-stan';
  const PAGE = 50;

  let state = C.emptyState();
  let calc = null;          // wynik C.compute(state) — liczony po KAŻDEJ zmianie
  let revision = 0;         // numer stanu, pokazywany przy rankingu
  let selected = null;      // ID wybranego pomysłu
  let editing = null;       // ID edytowanego pomysłu
  let shown = PAGE, rankShown = PAGE;
  let lastLog = null;
  let pendingImport = null;

  /* ---------- pomocnicze ---------- */
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return e;
  }
  const clear = e => { while (e.firstChild) e.removeChild(e.firstChild); return e; };
  const statusBadge = s => el('span', { class: 'badge st-' + s.replace(/ /g, '-'), text: s });
  const glosy = n => n === 1 ? 'głos' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'głosy' : 'głosów';
  const fmt = n => n.toLocaleString('pl-PL');
  const isOp = () => $('operator').checked;
  const me = () => $('me').value.trim();

  function say(r) {
    const m = $('msg');
    m.className = 'msg ' + (r.ok ? 'ok' : 'err');
    m.textContent = r.ok ? '✓ ' + r.msg : '✗ Odrzucono: ' + r.error;
  }

  function ask(title, text, okLabel) {
    const d = $('dlg');
    $('dlgTitle').textContent = title;
    $('dlgText').textContent = text;
    $('dlgOk').textContent = okLabel || 'Potwierdź';
    return new Promise(res => {
      d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true });
      d.returnValue = 'cancel';
      d.showModal();
      $('dlgCancel').focus();
    });
  }

  /* ---------- zmiana stanu: zawsze przez tę funkcję → pełne przeliczenie ---------- */
  function commit(r) {
    if (r) say(r);
    if (!r || r.ok) {
      revision++;
      try { localStorage.setItem(LS_KEY, C.exportData(state)); } catch (e) { /* zapis lokalny to tylko dodatek */ }
    }
    render();
  }

  function replaceState(s, msg) {
    state = s;
    selected = null; editing = null; shown = PAGE; rankShown = PAGE;
    resetForm();
    commit({ ok: true, msg });
  }

  /* ---------- rysowanie ---------- */
  function render() {
    calc = C.compute(state, { trace: state.ideas.length <= 12 });
    if (selected && C.findIdea(state.ideas, selected) < 0) selected = null;
    document.body.classList.toggle('op', isOp());
    renderStats(); renderFilters(); renderList(); renderDetail();
    renderRanking(); renderSummaries(); renderTrace(); renderCounters(); renderLocalInfo();
  }

  function renderStats() {
    const box = clear($('stats'));
    const avg = calc.avgVotesPerVoter === null ? '—' : calc.avgVotesPerVoter.toFixed(2).replace('.', ',');
    [[fmt(calc.ideaCount), 'pomysłów'], [fmt(calc.totalVotes), 'głosów (par uczestnik–pomysł)'], [fmt(calc.distinctVoters), 'różnych głosujących'], [avg, 'średnio głosów na osobę'],
     [calc.ranking.length ? calc.ranking[0].id : '—', 'prowadzi w rankingu']]
      .forEach(([v, l]) => box.append(el('div', { class: 'stat' }, el('b', { text: v }), el('span', { text: l }))));
  }

  function fillSelect(sel, values, allLabel) {
    const cur = sel.value;
    clear(sel).append(el('option', { value: '', text: allLabel }));
    values.forEach(v => sel.append(el('option', { value: v, text: v })));
    sel.value = values.indexOf(cur) >= 0 ? cur : '';
  }

  function renderFilters() {
    const cats = calc.perCategory.map(p => p.category);
    fillSelect($('fCat'), cats, 'wszystkie');
    fillSelect($('fStatus'), C.STATUSES, 'wszystkie');
    const dl = clear($('catList'));
    const all = C.CATEGORIES.slice();
    cats.forEach(c => { if (all.indexOf(c) < 0) all.push(c); });
    all.forEach(c => dl.append(el('option', { value: c })));
  }

  function filtered() {
    const cat = $('fCat').value, st = $('fStatus').value;
    const base = $('fOrder').value === 'rank' ? calc.ranking : state.ideas.map(i => calc.ranking.find(r => r.id === i.id));
    return base.filter(r => (!cat || r.category === cat) && (!st || r.status === st));
  }

  function renderList() {
    const list = clear($('ideaList')), more = clear($('moreBox'));
    const rows = filtered();
    $('fInfo').textContent = `Widoczne: ${rows.length} z ${calc.ideaCount}`;
    if (!calc.ideaCount) { list.append(el('li', { class: 'empty', text: 'Brak pomysłów. Dodaj pierwszy w formularzu obok albo wczytaj scenariusz w zakładce „Dane JSON”.' })); return; }
    if (!rows.length) { list.append(el('li', { class: 'empty', text: 'Żaden pomysł nie pasuje do filtrów.' })); return; }
    const who = me(), whoOk = !C.checkId(who, 'x');
    rows.slice(0, shown).forEach(r => {
      const supports = whoOk && C.findVote(state.votes, who, r.id) >= 0;
      list.append(el('li', { class: 'idea' + (r.id === selected ? ' sel' : '') },
        el('div', { class: 'place' }, 'miejsce', el('b', { text: r.place })),
        el('div', { class: 'main' },
          el('button', { class: 'ttl', type: 'button', text: r.title, title: 'Pokaż pełną kartę', onclick: () => select(r.id) }),
          el('div', { class: 'meta' }, el('span', { class: 'id', text: r.id }), el('span', { text: r.category }), statusBadge(r.status),
            r.tieWith.length ? el('span', { class: 'tie', text: `remis z ${r.tieWith.join(', ')}` }) : null)),
        el('div', { class: 'side' },
          el('span', { class: 'votes', text: `${r.votes} ${glosy(r.votes)}` }),
          el('button', { type: 'button', 'aria-pressed': supports ? 'true' : 'false', disabled: !whoOk, title: whoOk ? '' : 'Podaj poprawne ID uczestnika u góry',
            text: supports ? '✓ Popierasz — wycofaj' : 'Popieram',
            onclick: () => commit(supports ? C.withdrawVote(state, who, r.id) : C.addVote(state, who, r.id)) }))));
    });
    if (rows.length > shown) more.append(el('button', { type: 'button', text: `Pokaż kolejne (${rows.length - shown} ukrytych)`, onclick: () => { shown += PAGE; renderList(); } }));
  }

  function select(id) { selected = id; render(); $('detail').focus(); }

  function renderDetail() {
    const box = clear($('detail'));
    if (!selected) return;
    const idea = state.ideas[C.findIdea(state.ideas, selected)];
    const row = calc.ranking.find(r => r.id === selected);
    const c = C.newCounter();
    const list = C.votesForIdea(state.votes, selected, c);   // te same głosy, z których powstała suma
    box.append(
      el('h2', { text: idea.title }),
      el('dl', { class: 'kv' },
        el('dt', { text: 'ID' }), el('dd', {}, el('span', { class: 'id', text: idea.id })),
        el('dt', { text: 'Kategoria' }), el('dd', { text: idea.category }),
        el('dt', { text: 'Status' }), el('dd', {}, statusBadge(idea.status)),
        el('dt', { text: 'Ranking' }), el('dd', { text: `miejsce ${row.place} z ${calc.ranking.length}, ${row.votes} ${glosy(row.votes)}` + (row.tieWith.length ? ` (remis z ${row.tieWith.join(', ')} — rozstrzyga ID)` : '') })),
      el('h3', { text: 'Pełny opis' }),
      el('div', { class: 'desc', text: idea.description || '(brak opisu)' }),
      el('h3', { text: `Suma ${list.length} = głosy z listy` }),
      el('p', { class: 'muted', text: `Wyszukiwanie liniowe wszystkich dopasowań: sprawdzono ${c.checked} rekordów głosów, ${c.comparisons} porównań klucza ideaId.` }),
      list.length
        ? el('table', { class: 't small' }, el('tr', {}, el('th', { text: 'lp.' }), el('th', { text: 'pozycja w liście głosów' }), el('th', { text: 'uczestnik' })),
            list.map((v, k) => el('tr', {}, el('td', { class: 'n', text: k + 1 }), el('td', { class: 'n', text: v.index }), el('td', {}, el('span', { class: 'id', text: v.participant })))))
        : el('p', { class: 'muted', text: 'Nikt jeszcze nie poparł tego pomysłu.' }),
      el('h3', { text: 'Historia statusu' }),
      el('ol', { class: 'muted' }, (idea.history || []).map(h => el('li', { text: (h.from ? `${h.from} → ${h.to}` : `${h.to} (utworzenie)`) + (h.at ? ` · ${new Date(h.at).toLocaleString('pl-PL')}` : '') }))));
    if (isOp()) {
      const sel = el('select', { 'aria-label': 'Nowy status' }, C.STATUSES.map(s => el('option', { value: s, text: s, selected: s === idea.status })));
      box.append(el('div', { class: 'oprow' },
        el('span', { class: 'switch', text: 'Operator:' }), sel,
        el('button', { type: 'button', text: 'Zmień status', onclick: () => commit(C.setStatus(state, idea.id, sel.value, new Date().toISOString())) }),
        el('button', { type: 'button', text: 'Edytuj', onclick: () => startEdit(idea.id) }),
        el('button', { type: 'button', class: 'danger', text: 'Usuń…', onclick: () => removeIdea(idea.id) })));
    } else {
      box.append(el('p', { class: 'muted', text: 'Edycja, zmiana statusu i usuwanie: włącz „Tryb operatora” u góry.' }));
    }
  }

  async function removeIdea(id) {
    const r = C.deleteIdea(state, id, false);               // bez potwierdzenia: nic się nie zmienia, jeśli są głosy
    if (r.ok) { commit(r); return; }
    if (!r.needsConfirm) { say(r); return; }
    const yes = await ask('Usunąć pomysł?', `Pomysł ${id} ma ${r.votes} ${glosy(r.votes)}. Usunięcie skasuje także te głosy. Do chwili potwierdzenia dane pozostają bez zmian.`, `Usuń pomysł i ${r.votes} ${glosy(r.votes)}`);
    if (yes) commit(C.deleteIdea(state, id, true));
    else say({ ok: true, msg: `Anulowano — pomysł ${id} i jego głosy pozostają bez zmian.` });
  }

  /* ---------- formularz pomysłu ---------- */
  function resetForm() {
    editing = null;
    $('ideaForm').reset();
    $('iId').readOnly = false;
    $('formTitle').textContent = 'Dodaj pomysł';
    $('iSave').textContent = 'Dodaj';
    $('iCancel').hidden = true;
    $('iStatus').value = 'nowy';
  }
  function startEdit(id) {
    const d = state.ideas[C.findIdea(state.ideas, id)];
    editing = id;
    $('iId').value = d.id; $('iId').readOnly = true;
    $('iTitle').value = d.title; $('iCat').value = d.category; $('iDesc').value = d.description; $('iStatus').value = d.status;
    $('formTitle').textContent = `Edytuj pomysł ${id}`;
    $('iSave').textContent = 'Zapisz zmiany';
    $('iCancel').hidden = false;
    $('iTitle').focus();
  }
  $('ideaForm').addEventListener('submit', e => {
    e.preventDefault();
    const d = { title: $('iTitle').value, category: $('iCat').value, description: $('iDesc').value };
    let r;
    if (editing) {
      r = C.editIdea(state, editing, d);
      if (r.ok && isOp() && $('iStatus').value !== state.ideas[C.findIdea(state.ideas, editing)].status) {
        const r2 = C.setStatus(state, editing, $('iStatus').value, new Date().toISOString());
        r = r2.ok ? { ok: true, msg: r.msg + ' ' + r2.msg } : r2;
      }
    } else {
      d.id = $('iId').value.trim();
      d.status = isOp() ? $('iStatus').value : 'nowy';
      d.at = new Date().toISOString();
      r = C.addIdea(state, d);
      if (r.ok) selected = d.id;
    }
    if (r.ok) resetForm();
    commit(r);
  });
  $('iCancel').addEventListener('click', () => { resetForm(); say({ ok: true, msg: 'Anulowano edycję.' }); });

  $('voteForm').addEventListener('submit', e => { e.preventDefault(); commit(C.addVote(state, $('vP').value.trim(), $('vI').value.trim())); });
  $('vWithdraw').addEventListener('click', () => commit(C.withdrawVote(state, $('vP').value.trim(), $('vI').value.trim())));

  /* ---------- ranking i podsumowania ---------- */
  function renderRanking() {
    $('rankStamp').textContent = `przeliczono dla stanu nr ${revision} · ${calc.ideaCount} pomysłów, ${calc.totalVotes} głosów`;
    const t = clear($('rankTable')), more = clear($('rankMore'));
    if (!calc.ranking.length) { t.append(el('tr', {}, el('td', { class: 'empty', text: 'Ranking jest pusty — brak pomysłów.' }))); return; }
    t.append(el('tr', {}, ['miejsce', 'ID', 'tytuł', 'kategoria', 'status', 'głosy', 'remis / rozstrzygnięcie'].map((h, k) => el('th', { class: k === 0 || k === 5 ? 'n' : null, text: h }))));
    calc.ranking.slice(0, rankShown).forEach(r => t.append(el('tr', {},
      el('td', { class: 'n', text: r.place }), el('td', {}, el('span', { class: 'id', text: r.id })), el('td', { class: 'ttlcell', text: r.title }),
      el('td', { text: r.category }), el('td', {}, statusBadge(r.status)), el('td', { class: 'n' }, el('b', { text: r.votes })),
      el('td', { class: 'tie', text: r.tieWith.length ? `remis (${r.votes}) z ${r.tieWith.join(', ')} → wg ID` : '' }))));
    if (calc.ranking.length > rankShown) more.append(el('button', { type: 'button', text: `Pokaż wszystkie (${calc.ranking.length})`, onclick: () => { rankShown = Infinity; renderRanking(); } }));
  }

  function renderSummaries() {
    const cs = clear($('catSummary'));
    if (!calc.perCategory.length) cs.append(el('p', { class: 'empty', text: 'Brak pomysłów — brak kategorii.' }));
    const maxC = Math.max(1, ...calc.perCategory.map(p => p.count));
    calc.perCategory.forEach(p => cs.append(el('div', { class: 'bar' },
      el('span', { class: 'lbl', text: p.category }),
      el('span', { class: 'track', 'aria-hidden': 'true' }, el('span', { class: 'fill', style: `width:${(100 * p.count / maxC).toFixed(1)}%;display:block` })),
      el('span', { text: `${p.count} pomysł${p.count === 1 ? '' : 'ów'} · ${p.votes} ${glosy(p.votes)}` }))));
    const vs = clear($('voterSummary'));
    const avg = calc.avgVotesPerVoter === null ? '— (brak głosujących, nie dzielimy przez zero)' : calc.avgVotesPerVoter.toFixed(2).replace('.', ',');
    vs.append(el('dl', { class: 'kv' },
      el('dt', { text: 'Głosy (pary)' }), el('dd', {}, el('b', { text: calc.totalVotes })),
      el('dt', { text: 'Różni głosujący' }), el('dd', {}, el('b', { text: calc.distinctVoters })),
      el('dt', { text: 'Głosów na osobę' }), el('dd', { text: avg })),
      el('p', { class: 'rule', text: 'Dlaczego głosów może być więcej niż głosujących? Jedna osoba może poprzeć kilka RÓŻNYCH pomysłów (ale każdy najwyżej raz). Liczba głosów = liczba par (uczestnik, pomysł), a liczba głosujących = liczba różnych uczestników w tych parach.' }),
      el('p', { class: 'muted', text: calc.voters.length ? 'Głosujący: ' + calc.voters.slice(0, 60).join(', ') + (calc.voters.length > 60 ? ` … (+${calc.voters.length - 60})` : '') : 'Brak głosujących.' }));
  }

  function renderTrace() {
    const t = clear($('traceTable'));
    let trace = calc.trace, note = 'bieżące dane';
    if (!trace) {
      const r = C.compute(C.SCENARIOS.kontrolny.make().state, { trace: true });
      trace = r.trace; note = `bieżący zestaw ma ${calc.ideaCount} pomysłów (> 12) — pokazano przykład kontrolny`;
    }
    $('traceNote').textContent = `(${note})`;
    if (!trace.length) { t.append(el('tr', {}, el('td', { text: 'Za mało rekordów do sortowania (0 lub 1) — lista jest już uporządkowana.' }))); return; }
    t.append(el('tr', {}, ['krok i', 'wstawiany klucz', 'przed', 'decyzje (porównania)', 'po'].map(h => el('th', { text: h }))));
    trace.forEach(s => t.append(el('tr', {},
      el('td', { class: 'n', text: s.i }), el('td', {}, el('b', { text: s.key })), el('td', { text: s.before.join(' ') }),
      el('td', {}, el('ol', {}, s.decisions.map(d => el('li', { text: d })))), el('td', { text: s.after.join(' ') }))));
  }

  function renderCounters() {
    const k = calc.counters, n = calc.ideaCount, m = calc.totalVotes;
    clear($('counterBox')).append(el('table', { class: 't small' },
      el('tr', {}, ['obliczenie', 'sprawdzone rekordy', 'porównania kluczy', 'przesunięcia', 'oczekiwanie'].map(h => el('th', { text: h }))),
      el('tr', {}, el('td', { text: 'zliczanie głosów (votesForIdea dla każdego pomysłu)' }), el('td', { class: 'n', text: fmt(k.count.checked) }), el('td', { class: 'n', text: fmt(k.count.comparisons) }), el('td', { text: '—' }), el('td', { text: `n·m = ${n}·${m} = ${fmt(n * m)}` })),
      el('tr', {}, el('td', { text: 'ranking (sortowanie przez wstawianie)' }), el('td', { text: '—' }), el('td', { class: 'n', text: fmt(k.sort.comparisons) }), el('td', { class: 'n', text: fmt(k.sort.shifts) }), el('td', { text: n > 1 ? `od n−1 = ${n - 1} do n(n−1)/2 = ${fmt(n * (n - 1) / 2)}` : '0' })),
      el('tr', {}, el('td', { text: 'różni głosujący (lista widzianych)' }), el('td', { class: 'n', text: fmt(k.voters.checked) }), el('td', { class: 'n', text: fmt(k.voters.comparisons) }), el('td', { text: '—' }), el('td', { text: `≤ m·d = ${m}·${calc.distinctVoters}` }))));
  }

  /* ---------- przykład kontrolny ---------- */
  function renderLog() {
    const t = clear($('logTable')), box = clear($('expectBox'));
    if (!lastLog) { t.append(el('tr', {}, el('td', { text: 'Kliknij „Odtwórz i wczytaj wynik”, aby wykonać scenariusz.' }))); return; }
    t.append(el('tr', {}, ['#', 'działanie', 'wynik', 'głosy po działaniu', 'kolejność', 'głosujący'].map(h => el('th', { text: h }))));
    lastLog.forEach((r, k) => t.append(el('tr', { class: r.checkpoint ? 'check' : r.ok ? null : 'bad' },
      el('td', { class: 'n', text: k + 1 }), el('td', { text: r.action }),
      el('td', { text: (r.checkpoint ? '' : r.ok ? '✓ ' : '✗ odrzucone: ') + (r.checkpoint ? 'punkt kontrolny' : r.message) }),
      el('td', { text: r.counts || '(pusto)' }), el('td', { text: r.order || '—' }), el('td', { class: 'n', text: r.voters }))));
    if ($('script').value.trim() === C.CONTROL_SCRIPT) {
      const before = lastLog[5], after = lastLog[7];
      const okAll = !lastLog[3].ok && before.counts === 'A=2, B=2, C=0' && before.order === 'A,B,C' && after.counts === 'B=2, A=1, C=0' && after.order === 'B,A,C' && after.voters === 2;
      box.append(el('div', { class: 'rule expect' },
        el('b', { text: okAll ? '✓ Zgodne z kartą: ' : '✗ Niezgodne z kartą: ' }),
        'oczekiwano: powtórny U1→A odrzucony; przed wycofaniem A=2, B=2, C=0 (A,B,C); po wycofaniu B=2, A=1, C=0 (B,A,C); 2 różne osoby. ',
        'Wynik pośredni: przed wycofaniem A i B mają remis 2:2 — rozstrzyga ID, więc A przed B.'));
    }
  }
  $('scriptForm').addEventListener('submit', async e => {
    e.preventDefault();
    const r = C.runScript($('script').value);
    if (!r.ok) { say({ ok: false, error: r.errors.join(' ') }); return; }
    if (state.ideas.length && !(await ask('Zastąpić bieżące dane?', `Scenariusz zastąpi ${state.ideas.length} pomysłów i ${state.votes.length} głosów. Wyeksportuj je wcześniej, jeśli są potrzebne.`, 'Zastąp'))) { say({ ok: true, msg: 'Anulowano — dane bez zmian.' }); return; }
    lastLog = r.log;
    replaceState(r.state, `Odtworzono scenariusz: ${r.log.length} działań; ranking ${C.orderString(C.compute(r.state).ranking)}.`);
    renderLog();
  });
  $('scriptReset').addEventListener('click', () => { $('script').value = C.CONTROL_SCRIPT; });

  /* ---------- porównania ---------- */
  $('benchSortBtn').addEventListener('click', () => {
    const t = clear($('benchSortTable'));
    const names = { sorted: 'uporządkowane', reversed: 'odwrócone', random: 'losowe', ties: 'remis (równe głosy)' };
    t.append(el('tr', {}, ['n', 'dane', 'porównania', 'przesunięcia', 'min n−1', 'maks n(n−1)/2', 'zgodne ze wzorcem'].map(h => el('th', { text: h }))));
    for (const n of [10, 100, 1000]) for (const k of Object.keys(names)) {
      const b = C.benchSort(n, k);
      t.append(el('tr', {}, el('td', { class: 'n', text: n }), el('td', { text: names[k] }), el('td', { class: 'n' }, el('b', { text: fmt(b.comparisons) })), el('td', { class: 'n', text: fmt(b.shifts) }),
        el('td', { class: 'n', text: fmt(b.best) }), el('td', { class: 'n', text: fmt(b.worst) }), el('td', { class: b.same ? 'pass' : 'failt', text: b.same ? '✓ tak' : '✗ nie' })));
    }
  });
  $('benchSearchBtn').addEventListener('click', () => {
    const t = clear($('benchSearchTable'));
    t.append(el('tr', {}, ['n', 'szukana para', 'wynik (indeks)', 'sprawdzone rekordy', 'porównania pól'].map(h => el('th', { text: h }))));
    for (const n of [10, 100, 1000]) C.benchSearch(n).forEach(b => t.append(el('tr', {},
      el('td', { class: 'n', text: n }), el('td', { text: b.where }), el('td', { class: 'n', text: b.index }), el('td', { class: 'n' }, el('b', { text: fmt(b.checked) })), el('td', { class: 'n', text: fmt(b.comparisons) }))));
  });

  /* ---------- dane: scenariusze, eksport, import ---------- */
  function initScenarios() {
    const box = $('scenarioBtns');
    Object.keys(C.SCENARIOS).forEach(k => box.append(el('button', { type: 'button', text: 'Wczytaj: ' + C.SCENARIOS[k].name, onclick: async () => {
      if (state.ideas.length && !(await ask('Zastąpić bieżące dane?', `Wczytanie scenariusza zastąpi ${state.ideas.length} pomysłów i ${state.votes.length} głosów.`, 'Zastąp'))) { say({ ok: true, msg: 'Anulowano — dane bez zmian.' }); return; }
      const r = C.SCENARIOS[k].make();
      if (r.log) { lastLog = r.log; $('script').value = C.CONTROL_SCRIPT; renderLog(); }
      replaceState(r.state, `Wczytano scenariusz „${C.SCENARIOS[k].name}”.`);
    } })));
  }
  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([C.exportData(state)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'skrzynka-pomyslow.json' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    say({ ok: true, msg: `Wyeksportowano ${state.ideas.length} pomysłów i ${state.votes.length} głosów (format v${C.VERSION}).` });
  });
  $('importFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const box = clear($('importBox'));
    const r = C.parseImport(await f.text());              // najpierw sprawdzamy CAŁY plik
    if (!r.ok) {
      say({ ok: false, error: `plik „${f.name}” zawiera błędy — bieżące dane nie zostały zmienione.` });
      box.append(el('ul', { class: 'errlist' }, r.errors.map(x => el('li', { text: x }))));
      return;
    }
    pendingImport = r.state;
    const c = C.compute(r.state);
    box.append(el('div', { class: 'rule' },
      el('p', { text: `Plik „${f.name}” jest poprawny: ${c.ideaCount} pomysłów, ${c.totalVotes} głosów, ${c.distinctVoters} głosujących. Na pierwszym miejscu: ${c.ranking[0] ? c.ranking[0].id : '—'}.` }),
      el('div', { class: 'btns' },
        el('button', { type: 'button', class: 'danger', text: 'Zastąp bieżące dane', onclick: () => { const s = pendingImport; pendingImport = null; clear(box); replaceState(s, `Zaimportowano „${f.name}”.`); } }),
        el('button', { type: 'button', text: 'Anuluj', onclick: () => { pendingImport = null; clear(box); say({ ok: true, msg: 'Import anulowany — dane bez zmian.' }); } }))));
  });
  function renderLocalInfo() {
    let has = false;
    try { has = !!localStorage.getItem(LS_KEY); } catch (e) { /* brak dostępu */ }
    $('localInfo').textContent = has ? 'Bieżący stan jest też zapisywany w tej przeglądarce i wraca po odświeżeniu strony. To nie zastępuje eksportu.' : 'Brak zapisu w przeglądarce.';
  }
  $('clearLocal').addEventListener('click', () => { try { localStorage.removeItem(LS_KEY); } catch (e) { /* brak dostępu */ } renderLocalInfo(); say({ ok: true, msg: 'Usunięto zapis z przeglądarki (dane na ekranie bez zmian).' }); });

  /* ---------- testy ---------- */
  $('runTests').addEventListener('click', () => {
    const res = T.run(), t = clear($('testTable'));
    const okN = res.filter(r => r.pass).length;
    $('testSummary').textContent = `${okN}/${res.length} zaliczonych`;
    $('testSummary').className = okN === res.length ? 'pass' : 'failt';
    t.append(el('tr', {}, ['#', 'test', 'wejście', 'oczekiwano', 'uzyskano', 'wynik'].map(h => el('th', { text: h }))));
    res.forEach(r => t.append(el('tr', {}, el('td', { class: 'n', text: r.id }), el('td', { text: r.name }), el('td', { text: r.input }), el('td', { text: r.expected }), el('td', { text: r.actual }),
      el('td', { class: r.pass ? 'pass' : 'failt', text: r.pass ? '✓ OK' : '✗ BŁĄD' }))));
  });

  /* ---------- zakładki (klawiatura: strzałki, Home, End) ---------- */
  const tabs = Array.from(document.querySelectorAll('[role=tab]'));
  function showTab(tab, focus) {
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
    try { localStorage.setItem(LS_KEY + '-tab', tab.id); } catch (e) { /* brak dostępu */ }
  }
  tabs.forEach((t, k) => {
    t.addEventListener('click', () => showTab(t));
    t.addEventListener('keydown', e => {
      const map = { ArrowRight: k + 1, ArrowLeft: k - 1, Home: 0, End: tabs.length - 1 };
      if (e.key in map) { e.preventDefault(); showTab(tabs[(map[e.key] + tabs.length) % tabs.length], true); }
    });
  });

  ['fCat', 'fStatus', 'fOrder'].forEach(id => $(id).addEventListener('change', () => { shown = PAGE; renderList(); }));
  $('me').addEventListener('input', renderList);
  $('operator').addEventListener('change', () => { if (!isOp() && editing) resetForm(); render(); });

  /* ---------- start ---------- */
  C.STATUSES.forEach(s => $('iStatus').append(el('option', { value: s, text: s })));
  $('fmtName').textContent = C.FORMAT; $('fmtVer').textContent = C.VERSION;
  $('script').value = C.CONTROL_SCRIPT;
  initScenarios();
  let restored = false;
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) { const r = C.parseImport(saved); if (r.ok) { state = r.state; restored = true; } }
    const tab = localStorage.getItem(LS_KEY + '-tab');
    if (tab && $(tab)) showTab($(tab)); else showTab(tabs[0]);
  } catch (e) { showTab(tabs[0]); }
  if (!restored) state = C.SCENARIOS.typowy.make().state;
  render(); renderLog();
  say({ ok: true, msg: restored ? 'Przywrócono dane zapisane w tej przeglądarce.' : 'Wczytano scenariusz „typowy”. Przykład kontrolny: zakładka „Przykład kontrolny” albo „Dane JSON”.' });
})();
