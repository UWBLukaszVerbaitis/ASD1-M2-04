/* ASD1-M2-04 — Skrzynka pomysłów studenckich: model danych, walidacja, własne wyszukiwanie liniowe,
 * zliczanie głosów, sortowanie przez wstawianie (ranking), eksport/import JSON i scenariusze.
 * Moduł nie używa DOM — działa w przeglądarce (window.IdeaBox) i w Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IdeaBox = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- Stałe i reguły ---------- */
  const FORMAT = 'asd1-m2-04-skrzynka-pomyslow';
  const VERSION = 1;
  const MAX_RECORDS = 1000;             // limit dla pomysłów i osobno dla głosów
  const ID_RE = /^[A-Z0-9-]{1,20}$/;    // ID: A–Z, cyfry, łącznik; 1…20 znaków
  const TITLE_MAX = 120, DESC_MAX = 2000, CAT_MAX = 40;
  const STATUSES = ['nowy', 'w analizie', 'przyjęty', 'odrzucony'];
  const CATEGORIES = ['dydaktyka', 'infrastruktura', 'wydarzenia', 'samorząd', 'inne'];

  const newCounter = () => ({ checked: 0, comparisons: 0, shifts: 0 });
  const emptyState = () => ({ ideas: [], votes: [] });
  const clone = s => JSON.parse(JSON.stringify(s));
  const ok = (msg, extra) => Object.assign({ ok: true, msg }, extra || {});
  const fail = (error, extra) => Object.assign({ ok: false, error }, extra || {});

  /* ---------- Walidacja (zawsze przed zmianą stanu) ---------- */
  function checkId(id, what) {
    if (typeof id !== 'string' || id.length === 0) return `${what}: ID nie może być puste.`;
    if (!ID_RE.test(id)) return `${what}: ID „${id}” jest niepoprawne — dozwolone tylko wielkie litery A–Z, cyfry i łącznik (1–20 znaków).`;
    return null;
  }

  /* Zwraca listę błędów pól pomysłu (bez ID i unikalności — te sprawdza wywołujący). */
  function checkIdeaFields(d) {
    const e = [];
    const title = typeof d.title === 'string' ? d.title.trim() : '';
    const desc = typeof d.description === 'string' ? d.description : '';
    const cat = typeof d.category === 'string' ? d.category.trim() : '';
    if (!title) e.push('Tytuł nie może być pusty.');
    else if (title.length > TITLE_MAX) e.push(`Tytuł ma ${title.length} znaków (maks. ${TITLE_MAX}).`);
    if (typeof d.description !== 'undefined' && typeof d.description !== 'string') e.push('Opis musi być tekstem.');
    else if (desc.length > DESC_MAX) e.push(`Opis ma ${desc.length} znaków (maks. ${DESC_MAX}).`);
    if (!cat) e.push('Kategoria nie może być pusta.');
    else if (cat.length > CAT_MAX) e.push(`Kategoria ma ${cat.length} znaków (maks. ${CAT_MAX}).`);
    if (STATUSES.indexOf(d.status) < 0) e.push(`Status „${d.status}” jest niepoprawny — dozwolone: ${STATUSES.join(', ')}.`);
    return e;
  }

  /* ---------- Własne wyszukiwanie liniowe ---------- */

  /* Pierwsze dopasowanie pomysłu o danym ID. Licznik: checked = sprawdzone rekordy,
   * comparisons = porównania kluczy (po jednym na rekord). Zwraca indeks albo −1. */
  function findIdea(ideas, id, c) {
    for (let i = 0; i < ideas.length; i++) {
      if (c) { c.checked++; c.comparisons++; }
      if (ideas[i].id === id) return i;
    }
    return -1;
  }

  /* Pierwsze dopasowanie pary (uczestnik, pomysł). Klucz złożony porównywany pole po polu:
   * najpierw uczestnik, a tylko przy zgodności — ID pomysłu (2 porównania). Zwraca indeks albo −1. */
  function findVote(votes, participant, ideaId, c) {
    for (let i = 0; i < votes.length; i++) {
      if (c) { c.checked++; c.comparisons++; }
      if (votes[i].participant !== participant) continue;
      if (c) c.comparisons++;
      if (votes[i].ideaId === ideaId) return i;
    }
    return -1;
  }

  /* WSZYSTKIE głosy na dany pomysł (pełny przegląd listy) — z nich powstaje suma. */
  function votesForIdea(votes, ideaId, c) {
    const out = [];
    for (let i = 0; i < votes.length; i++) {
      if (c) { c.checked++; c.comparisons++; }
      if (votes[i].ideaId === ideaId) out.push({ index: i, participant: votes[i].participant });
    }
    return out;
  }

  /* ---------- Sortowanie przez wstawianie ---------- */

  /* Warunek rankingu: liczba głosów malejąco, przy remisie ID rosnąco (porównanie kodów znaków).
   * Wynik < 0 → a przed b. Jedno wywołanie = jedno porównanie klucza (głosy, ID). */
  function rankCompare(a, b) {
    if (a.votes !== b.votes) return b.votes - a.votes;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  const label = r => `${r.id}(${r.votes})`;

  /* Sortuje kopię tablicy; stabilne. Opcjonalny `trace` zbiera kroki „przed → decyzja → po”. */
  function insertionSort(arr, cmp, c, trace) {
    const a = arr.slice();
    for (let i = 1; i < a.length; i++) {
      const key = a[i];
      const before = trace ? a.map(label) : null;
      const decisions = [];
      let j = i - 1;
      while (j >= 0) {
        if (c) c.comparisons++;
        const r = cmp(a[j], key);
        if (r > 0) {
          if (trace) decisions.push(`${label(a[j])} po ${label(key)} → przesuń ${a[j].id} w prawo`);
          a[j + 1] = a[j];
          if (c) c.shifts++;
          j--;
        } else {
          if (trace) decisions.push(`${label(a[j])} przed ${label(key)}${a[j].votes === key.votes ? ' (remis głosów, mniejsze ID)' : ''} → stop`);
          break;
        }
      }
      if (trace && j < 0) decisions.push('początek listy → stop');
      a[j + 1] = key;
      if (trace) trace.push({ i, key: label(key), before, decisions, after: a.map(label), pos: j + 1 });
    }
    return a;
  }

  /* ---------- Obliczenia aplikacji ---------- */

  /* Liczba różnych głosujących: lista już widzianych + własne wyszukiwanie liniowe. */
  function distinctVoters(votes, c) {
    const seen = [];
    for (const v of votes) {
      let found = false;
      for (let k = 0; k < seen.length; k++) {
        if (c) { c.checked++; c.comparisons++; }
        if (seen[k] === v.participant) { found = true; break; }
      }
      if (!found) seen.push(v.participant);
    }
    return seen;
  }

  /* Pełne przeliczenie: suma głosów każdego pomysłu, ranking, podsumowania. Zawsze z bieżącego stanu. */
  function compute(state, opts) {
    opts = opts || {};
    const count = newCounter(), sort = newCounter(), voters = newCounter();
    const rows = state.ideas.map(idea => {
      const list = votesForIdea(state.votes, idea.id, count);
      return { id: idea.id, title: idea.title, category: idea.category, status: idea.status, votes: list.length, voteList: list };
    });
    const trace = opts.trace ? [] : null;
    const ranking = insertionSort(rows, rankCompare, sort, trace);
    ranking.forEach((r, i) => {
      r.place = i + 1;
      const prev = ranking[i - 1], next = ranking[i + 1];
      r.tieWith = [prev, next].filter(o => o && o.votes === r.votes).map(o => o.id);
    });
    const perCategory = [];
    for (const idea of state.ideas) {
      let k = 0;
      while (k < perCategory.length && perCategory[k].category !== idea.category) k++;
      if (k === perCategory.length) perCategory.push({ category: idea.category, count: 0, votes: 0 });
      perCategory[k].count++;
    }
    for (const r of rows) for (const pc of perCategory) if (pc.category === r.category) pc.votes += r.votes;
    const sortedCats = insertionSort(perCategory, (a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
    const voterList = distinctVoters(state.votes, voters);
    const totalVotes = state.votes.length;
    return {
      ranking, perCategory: sortedCats, voters: voterList, distinctVoters: voterList.length, totalVotes,
      ideaCount: state.ideas.length,
      avgVotesPerVoter: voterList.length ? totalVotes / voterList.length : null, // brak dzielenia przez zero
      counters: { count, sort, voters }, trace
    };
  }

  const orderString = ranking => ranking.map(r => r.id).join(',');
  const countsString = ranking => ranking.map(r => `${r.id}=${r.votes}`).join(', ');

  /* ---------- Operacje na stanie (walidacja → dopiero potem zmiana) ---------- */

  function addIdea(state, d) {
    const id = typeof d.id === 'string' ? d.id.trim() : d.id;
    const rec = { id, title: (d.title || '').trim(), description: d.description || '', category: (d.category || '').trim(), status: d.status || 'nowy' };
    const err = checkId(id, 'Pomysł');
    if (err) return fail(err);
    const fe = checkIdeaFields(rec);
    if (fe.length) return fail(fe.join(' '));
    if (findIdea(state.ideas, id) >= 0) return fail(`Pomysł o ID „${id}” już istnieje — ID musi być unikalne.`);
    if (state.ideas.length >= MAX_RECORDS) return fail(`Osiągnięto limit ${MAX_RECORDS} pomysłów.`);
    rec.history = [{ from: null, to: rec.status, at: d.at || null, note: 'utworzenie' }];
    state.ideas.push(rec);
    return ok(`Dodano pomysł ${id}.`);
  }

  /* Edycja treści; ID jest niezmienne (próba zmiany = błąd). */
  function editIdea(state, id, d) {
    const i = findIdea(state.ideas, id);
    if (i < 0) return fail(`Nie ma pomysłu o ID „${id}”.`);
    if (typeof d.id !== 'undefined' && d.id !== id) return fail('ID pomysłu jest niezmienne — nie można go edytować.');
    const cur = state.ideas[i];
    const next = {
      title: typeof d.title === 'string' ? d.title.trim() : cur.title,
      description: typeof d.description === 'string' ? d.description : cur.description,
      category: typeof d.category === 'string' ? d.category.trim() : cur.category,
      status: cur.status
    };
    const fe = checkIdeaFields(next);
    if (fe.length) return fail(fe.join(' '));
    cur.title = next.title; cur.description = next.description; cur.category = next.category;
    return ok(`Zapisano zmiany pomysłu ${id}.`);
  }

  /* Zmiana statusu przez operatora; historia zmian (rozszerzenie dobrowolne). */
  function setStatus(state, id, status, at) {
    const i = findIdea(state.ideas, id);
    if (i < 0) return fail(`Nie ma pomysłu o ID „${id}”.`);
    if (STATUSES.indexOf(status) < 0) return fail(`Status „${status}” jest niepoprawny — dozwolone: ${STATUSES.join(', ')}.`);
    const cur = state.ideas[i];
    if (cur.status === status) return fail(`Pomysł ${id} ma już status „${status}”.`);
    cur.history = cur.history || [];
    cur.history.push({ from: cur.status, to: status, at: at || null });
    cur.status = status;
    return ok(`Status ${id}: ${status}.`);
  }

  /* Usunięcie: przy istniejących głosach bez `confirmed` nic się nie zmienia (needsConfirm). */
  function deleteIdea(state, id, confirmed) {
    const i = findIdea(state.ideas, id);
    if (i < 0) return fail(`Nie ma pomysłu o ID „${id}”.`);
    const n = votesForIdea(state.votes, id).length;
    if (n > 0 && !confirmed) return fail(`Pomysł ${id} ma ${n} głos(y/ów) — usunięcie wymaga potwierdzenia.`, { needsConfirm: true, votes: n });
    state.ideas.splice(i, 1);
    state.votes = state.votes.filter(v => v.ideaId !== id);
    return ok(`Usunięto pomysł ${id}${n ? ` i ${n} głos(y/ów)` : ''}.`);
  }

  function addVote(state, participant, ideaId, c) {
    const e1 = checkId(participant, 'Uczestnik');
    if (e1) return fail(e1);
    const e2 = checkId(ideaId, 'Pomysł');
    if (e2) return fail(e2);
    if (findIdea(state.ideas, ideaId, c) < 0) return fail(`Głos na nieistniejący pomysł „${ideaId}” — odrzucony.`);
    if (findVote(state.votes, participant, ideaId, c) >= 0) return fail(`${participant} już popiera ${ideaId} — najwyżej jeden głos osoby na pomysł.`);
    if (state.votes.length >= MAX_RECORDS) return fail(`Osiągnięto limit ${MAX_RECORDS} głosów.`);
    state.votes.push({ participant, ideaId });
    return ok(`${participant} → ${ideaId}: głos dodany.`);
  }

  function withdrawVote(state, participant, ideaId, c) {
    const i = findVote(state.votes, participant, ideaId, c);
    if (i < 0) return fail(`${participant} nie popiera ${ideaId} — nie ma czego wycofać (bez zmian).`);
    state.votes.splice(i, 1);
    return ok(`${participant} wycofał(a) głos na ${ideaId}.`);
  }

  /* ---------- Eksport / import JSON ---------- */

  function exportData(state) {
    return JSON.stringify({ format: FORMAT, version: VERSION, ideas: state.ideas, votes: state.votes }, null, 2);
  }

  /* Sprawdza CAŁY plik, buduje nowy stan na boku; bieżący stan nie jest dotykany. */
  function parseImport(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { return { ok: false, errors: ['Plik nie jest poprawnym JSON: ' + e.message] }; }
    const errors = [];
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, errors: ['Oczekiwano obiektu JSON z polami format, version, ideas, votes.'] };
    if (data.format !== FORMAT) errors.push(`Nieznany format „${data.format}” (oczekiwano „${FORMAT}”).`);
    if (data.version !== VERSION) errors.push(`Nieobsługiwana wersja formatu: ${data.version} (obsługiwana: ${VERSION}).`);
    if (!Array.isArray(data.ideas)) errors.push('Pole „ideas” musi być tablicą.');
    if (!Array.isArray(data.votes)) errors.push('Pole „votes” musi być tablicą.');
    if (errors.length) return { ok: false, errors };
    if (data.ideas.length > MAX_RECORDS) errors.push(`Za dużo pomysłów: ${data.ideas.length} (maks. ${MAX_RECORDS}).`);
    if (data.votes.length > MAX_RECORDS) errors.push(`Za dużo głosów: ${data.votes.length} (maks. ${MAX_RECORDS}).`);
    const s = emptyState();
    data.ideas.forEach((d, k) => {
      if (!d || typeof d !== 'object') { errors.push(`ideas[${k}]: oczekiwano obiektu.`); return; }
      const e = checkId(d.id, `ideas[${k}]`);
      if (e) { errors.push(e); return; }
      const fe = checkIdeaFields(d);
      if (fe.length) { errors.push(`ideas[${k}] (${d.id}): ${fe.join(' ')}`); return; }
      if (findIdea(s.ideas, d.id) >= 0) { errors.push(`ideas[${k}]: powtórzone ID „${d.id}”.`); return; }
      const history = Array.isArray(d.history) ? d.history.filter(h => h && typeof h === 'object').map(h => ({ from: h.from === null || STATUSES.indexOf(h.from) >= 0 ? h.from : null, to: STATUSES.indexOf(h.to) >= 0 ? h.to : d.status, at: typeof h.at === 'string' ? h.at : null, note: typeof h.note === 'string' ? h.note : undefined })) : [];
      s.ideas.push({ id: d.id, title: d.title.trim(), description: d.description || '', category: d.category.trim(), status: d.status, history });
    });
    data.votes.forEach((v, k) => {
      if (!v || typeof v !== 'object') { errors.push(`votes[${k}]: oczekiwano obiektu.`); return; }
      const e = checkId(v.participant, `votes[${k}] uczestnik`) || checkId(v.ideaId, `votes[${k}] pomysł`);
      if (e) { errors.push(e); return; }
      if (findIdea(s.ideas, v.ideaId) < 0) { errors.push(`votes[${k}]: głos na nieistniejący pomysł „${v.ideaId}”.`); return; }
      if (findVote(s.votes, v.participant, v.ideaId) >= 0) { errors.push(`votes[${k}]: powtórzony głos ${v.participant} → ${v.ideaId}.`); return; }
      s.votes.push({ participant: v.participant, ideaId: v.ideaId });
    });
    if (errors.length) return { ok: false, errors: errors.slice(0, 20).concat(errors.length > 20 ? [`… i ${errors.length - 20} kolejnych błędów.`] : []) };
    return { ok: true, state: s };
  }

  /* ---------- Generator powtarzalny i scenariusze ---------- */

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pad = (n, w) => String(n).padStart(w, '0');

  function idea(id, title, category, description, status) {
    return { id, title, category, description: description || '', status: status || 'nowy' };
  }
  function build(ideas, votes) {
    const s = emptyState();
    ideas.forEach(d => { const r = addIdea(s, d); if (!r.ok) throw new Error(r.error); });
    votes.forEach(([p, i]) => { const r = addVote(s, p, i); if (!r.ok) throw new Error(r.error); });
    return s;
  }

  /* Przykład kontrolny z karty: pomysły i lista działań do odtworzenia krok po kroku. */
  const CONTROL_IDEAS = [
    idea('A', 'Dłuższe godziny otwarcia czytelni', 'infrastruktura', 'Czytelnia otwarta do 20:00 w sesji.'),
    idea('B', 'Stojaki na rowery przy wejściu', 'infrastruktura', 'Zadaszone stojaki na 10 rowerów.'),
    idea('C', 'Wieczór gier planszowych', 'wydarzenia', 'Raz w miesiącu w auli, gry od samorządu.')
  ];
  const CONTROL_ACTIONS = [
    { op: 'vote', p: 'U1', i: 'A' }, { op: 'vote', p: 'U2', i: 'B' }, { op: 'vote', p: 'U3', i: 'A' },
    { op: 'vote', p: 'U1', i: 'A' }, { op: 'vote', p: 'U1', i: 'B' },
    { op: 'check', name: 'przed wycofaniem' },
    { op: 'withdraw', p: 'U3', i: 'A' },
    { op: 'check', name: 'po wycofaniu' }
  ];

  /* Wykonuje listę działań; po każdym zapisuje wynik i aktualny ranking (wyniki pośrednie). */
  function runActions(state, actions) {
    return actions.map(a => {
      let r;
      if (a.op === 'vote') r = addVote(state, a.p, a.i);
      else if (a.op === 'withdraw') r = withdrawVote(state, a.p, a.i);
      else r = ok(`Punkt kontrolny: ${a.name}`);
      const c = compute(state);
      return { action: a.op === 'vote' ? `${a.p} → ${a.i}` : a.op === 'withdraw' ? `${a.p} wycofuje ${a.i}` : `[${a.name}]`, checkpoint: a.op === 'check', ok: r.ok, message: r.ok ? r.msg : r.error, counts: countsString(c.ranking), order: orderString(c.ranking), voters: c.distinctVoters };
    });
  }


  /* ---------- Edytowalny skrypt działań (zakładka „Przykład kontrolny”) ----------
   * Wiersze:  pomysły: A, B, C   |   U1 -> A   |   U3 wycofuje A   |   ? nazwa punktu kontrolnego */
  const CONTROL_SCRIPT = ['pomysły: A, B, C', 'U1 -> A', 'U2 -> B', 'U3 -> A', 'U1 -> A', 'U1 -> B', '? przed wycofaniem', 'U3 wycofuje A', '? po wycofaniu'].join('\n');

  function parseScript(text) {
    const out = { ideas: null, actions: [] }, errors = [];
    String(text).split(/\r?\n/).forEach((raw, k) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      let m;
      if ((m = line.match(/^pomysły:\s*(.*)$/i))) out.ideas = m[1].split(/[,\s]+/).filter(Boolean);
      else if ((m = line.match(/^(\S+)\s*->\s*(\S+)$/))) out.actions.push({ op: 'vote', p: m[1], i: m[2] });
      else if ((m = line.match(/^(\S+)\s+wycofuje\s+(\S+)$/i))) out.actions.push({ op: 'withdraw', p: m[1], i: m[2] });
      else if ((m = line.match(/^\?\s*(.+)$/))) out.actions.push({ op: 'check', name: m[1] });
      else errors.push(`Wiersz ${k + 1}: nie rozpoznano „${line}” (oczekiwano „U1 -> A”, „U1 wycofuje A”, „? nazwa” lub „pomysły: A, B”).`);
    });
    if (!out.ideas) errors.push('Brak wiersza „pomysły: …”.');
    return errors.length ? { ok: false, errors } : Object.assign({ ok: true }, out);
  }

  /* Buduje stan z pomysłów skryptu (tytuły z przykładu kontrolnego, jeśli ID się zgadza) i odtwarza działania. */
  function runScript(text) {
    const p = parseScript(text);
    if (!p.ok) return p;
    const s = emptyState(), errors = [];
    p.ideas.forEach(id => {
      const known = CONTROL_IDEAS.find(d => d.id === id);
      const r = addIdea(s, known || idea(id, 'Pomysł ' + id, 'inne', 'Dodany ze skryptu działań.'));
      if (!r.ok) errors.push(r.error);
    });
    if (errors.length) return { ok: false, errors };
    return { ok: true, state: s, log: runActions(s, p.actions) };
  }

  const SCENARIOS = {
    kontrolny: { name: 'Przykład kontrolny (A, B, C)', make: () => runScript(CONTROL_SCRIPT) },
    typowy: {
      name: 'Typowy (8 pomysłów, 6 osób)',
      make: () => ({ state: build([
        idea('D-01', 'Nagrania wykładów z ASD', 'dydaktyka', 'Udostępnianie nagrań wykładów na platformie przez 2 tygodnie.', 'w analizie'),
        idea('D-02', 'Konsultacje online w środy', 'dydaktyka', 'Dodatkowy termin konsultacji przez Teams.'),
        idea('I-01', 'Gniazdka w sali 105', 'infrastruktura', 'Listwy zasilające przy ławkach na laptopy.', 'przyjęty'),
        idea('I-02', 'Automat z kawą na parterze', 'infrastruktura', 'Automat z napojami ciepłymi przy szatni.'),
        idea('I-03', 'Szybsze Wi-Fi w auli', 'infrastruktura', 'Drugi punkt dostępowy w auli.', 'w analizie'),
        idea('W-01', 'Dzień otwarty Filii', 'wydarzenia', 'Studenci pokazują projekty kandydatom.'),
        idea('W-02', 'Turniej szachowy', 'wydarzenia', 'Turniej w formule szwajcarskiej, 5 rund.', 'odrzucony'),
        idea('S-01', 'Skrzynka anonimowych uwag', 'samorząd', 'Formularz uwag przekazywany samorządowi co miesiąc.')
      ], [
        ['U1', 'I-01'], ['U2', 'I-01'], ['U3', 'I-01'], ['U4', 'I-01'],
        ['U1', 'D-01'], ['U2', 'D-01'], ['U5', 'D-01'], ['U6', 'D-01'],
        ['U3', 'I-03'], ['U4', 'I-03'], ['U5', 'I-03'],
        ['U1', 'W-01'], ['U6', 'W-01'], ['U2', 'S-01'], ['U6', 'I-02'], ['U5', 'D-02']
      ]) })
    },
    graniczny: {
      name: 'Graniczny (remisy, długie ID, HTML jako tekst)',
      make: () => ({ state: build([
        idea('Z', 'Jednoznakowe ID', 'inne', 'ID o długości 1 znaku.'),
        idea('ABCDEFGHIJ-123456789', 'ID o maksymalnej długości 20 znaków', 'inne', 'Łącznik i cyfry w ID.'),
        idea('0', 'ID złożone z cyfry', 'inne', ''),
        idea('HTML-1', '<b>Pogrubienie?</b> — tytuł z tagami', 'inne', '<script>alert("x")</script> ten opis ma być widoczny jako zwykły tekst.'),
        idea('BEZ-GLOSOW', 'Pomysł bez głosów', 'samorząd', 'Suma 0 — ostatnie miejsce.'),
        idea('DLUGI-TYTUL', ('Tytuł o maksymalnej dozwolonej długości — sto dwadzieścia znaków; ').repeat(2).slice(0, TITLE_MAX), 'dydaktyka', 'Tytuł ma dokładnie 120 znaków (granica walidacji).')
      ], [
        ['U-1', 'Z'], ['U-1', 'ABCDEFGHIJ-123456789'], ['U-1', '0'], ['U-1', 'HTML-1'], ['U-1', 'DLUGI-TYTUL'],
        ['U-2', 'Z'], ['U-2', 'ABCDEFGHIJ-123456789'], ['U-2', '0'], ['U-2', 'HTML-1'], ['U-2', 'DLUGI-TYTUL']
      ]) })
    },
    wiekszy: {
      name: 'Większy (1000 pomysłów, 1000 głosów, ziarno 2026)',
      make: () => {
        const rnd = mulberry32(2026), s = emptyState();
        for (let k = 1; k <= MAX_RECORDS; k++) addIdea(s, idea('P-' + pad(k, 4), `Pomysł nr ${k}`, CATEGORIES[k % CATEGORIES.length], `Wygenerowany rekord ${k}.`, STATUSES[k % 4]));
        while (s.votes.length < MAX_RECORDS) {
          // rozkład skośny: część pomysłów zbiera wiele głosów
          const i = 1 + Math.floor(Math.pow(rnd(), 3) * MAX_RECORDS), p = 1 + Math.floor(rnd() * 300);
          addVote(s, 'U-' + pad(p, 3), 'P-' + pad(i, 4));
        }
        return { state: s };
      }
    },
    pusty: { name: 'Pusty zestaw', make: () => ({ state: emptyState() }) }
  };

  /* ---------- Porównania (dane powtarzalne) ---------- */

  /* Wiersze rankingu o unikalnych ID: `sorted` (już w kolejności rankingu), `reversed`, `random`, `ties` (równe głosy). */
  function benchRows(n, kind, seed) {
    const rnd = mulberry32(seed || 42);
    let rows = [];
    for (let k = 0; k < n; k++) rows.push({ id: 'P-' + pad(k + 1, 4), votes: kind === 'ties' ? 5 : Math.floor(rnd() * 20) });
    if (kind === 'sorted' || kind === 'reversed') {
      rows = rows.slice().sort(rankCompare);        // gotowe sortowanie tylko do PRZYGOTOWANIA danych
      if (kind === 'reversed') rows.reverse();
    }
    if (kind === 'random' || kind === 'ties') {
      for (let k = rows.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); const t = rows[k]; rows[k] = rows[j]; rows[j] = t; }
    }
    return rows;
  }

  function benchSort(n, kind) {
    const rows = benchRows(n, kind);
    const c = newCounter();
    const mine = insertionSort(rows, rankCompare, c);
    const ref = rows.slice().sort(rankCompare);       // niezależny wzorzec: Array.prototype.sort
    let same = mine.length === ref.length;
    for (let k = 0; same && k < mine.length; k++) same = mine[k].id === ref[k].id;
    return { n, kind, comparisons: c.comparisons, shifts: c.shifts, same, best: n - 1, worst: n * (n - 1) / 2 };
  }

  /* Wyszukiwanie pary: trafienie na początku, na końcu i brak wyniku (pierwsze dopasowanie). */
  function benchSearch(n) {
    const votes = [];
    for (let k = 1; k <= n; k++) votes.push({ participant: 'U-' + pad(k, 4), ideaId: 'P-' + pad(((k * 7) % n) + 1, 4) });
    const cases = [
      ['początek', votes[0].participant, votes[0].ideaId],
      ['koniec', votes[n - 1].participant, votes[n - 1].ideaId],
      ['brak', 'U-9999', 'P-0001']
    ];
    return cases.map(([where, p, i]) => {
      const c = newCounter();
      const idx = findVote(votes, p, i, c);
      return { n, where, index: idx, checked: c.checked, comparisons: c.comparisons };
    });
  }

  return {
    FORMAT, VERSION, MAX_RECORDS, ID_RE, TITLE_MAX, DESC_MAX, CAT_MAX, STATUSES, CATEGORIES,
    newCounter, emptyState, clone, checkId, checkIdeaFields,
    findIdea, findVote, votesForIdea, rankCompare, insertionSort, distinctVoters, compute, orderString, countsString,
    addIdea, editIdea, setStatus, deleteIdea, addVote, withdrawVote,
    exportData, parseImport, mulberry32, SCENARIOS, CONTROL_IDEAS, CONTROL_ACTIONS, CONTROL_SCRIPT, parseScript, runScript, runActions, build,
    benchRows, benchSort, benchSearch
  };
});
