/* Automatyczne testy ASD1-M2-04 — działają w Node (tests/run.js) i w przeglądarce (zakładka „Testy”).
 * Każdy test: wejście, oczekiwany wynik (wpisany ręcznie albo z niezależnego wzorca) i asercja. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.IdeaTests = factory(root.IdeaBox);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  const abc = () => C.build(C.CONTROL_IDEAS, []);
  const snap = s => JSON.stringify(s);

  const TESTS = [
    {
      name: 'Przykład kontrolny z karty',
      input: 'A,B,C; U1→A, U2→B, U3→A, U1→A, U1→B; potem U3 wycofuje A',
      expected: 'powtórny U1→A odrzucony; przed: A=2, B=2, C=0 / A,B,C; po: B=2, A=1, C=0 / B,A,C; głosujących 2',
      run() {
        const s = abc();
        const log = C.runActions(s, C.CONTROL_ACTIONS);
        const before = log[5], after = log[7];
        const pass = log[3].ok === false && before.counts === 'A=2, B=2, C=0' && before.order === 'A,B,C' &&
          after.counts === 'B=2, A=1, C=0' && after.order === 'B,A,C' && after.voters === 2;
        return { pass, actual: `U1→A drugi raz: ${log[3].ok ? 'przyjęty' : 'odrzucony'}; przed: ${before.counts} / ${before.order}; po: ${after.counts} / ${after.order}; głosujących ${after.voters}` };
      }
    },
    {
      name: 'Powtórzona para uczestnik–pomysł jest odrzucana bez zmiany stanu',
      input: 'U1→A, potem znowu U1→A',
      expected: 'drugi głos: ok = false; liczba głosów nadal 1',
      run() {
        const s = abc(); C.addVote(s, 'U1', 'A');
        const r = C.addVote(s, 'U1', 'A');
        return { pass: !r.ok && s.votes.length === 1, actual: `ok = ${r.ok}; głosów: ${s.votes.length}; powód: ${r.error}` };
      }
    },
    {
      name: 'Ta sama osoba może zagłosować na inny pomysł',
      input: 'U1→A, U1→B',
      expected: 'oba przyjęte; A=1, B=1; głosujących 1, głosów 2',
      run() {
        const s = abc();
        const r1 = C.addVote(s, 'U1', 'A'), r2 = C.addVote(s, 'U1', 'B');
        const c = C.compute(s);
        const pass = r1.ok && r2.ok && C.countsString(c.ranking) === 'A=1, B=1, C=0' && c.distinctVoters === 1 && c.totalVotes === 2;
        return { pass, actual: `${r1.ok}/${r2.ok}; ${C.countsString(c.ranking)}; głosujących ${c.distinctVoters}, głosów ${c.totalVotes}` };
      }
    },
    {
      name: 'Wycofanie nieistniejącego głosu nie daje ujemnego wyniku',
      input: 'pusta lista głosów; U9 wycofuje A',
      expected: 'ok = false; A=0 (nie −1); głosów 0',
      run() {
        const s = abc();
        const r = C.withdrawVote(s, 'U9', 'A');
        const a = C.compute(s).ranking.find(x => x.id === 'A');
        return { pass: !r.ok && a.votes === 0 && s.votes.length === 0, actual: `ok = ${r.ok}; A=${a.votes}; głosów ${s.votes.length}` };
      }
    },
    {
      name: 'Anulowanie usunięcia pomysłu zachowuje jego głosy',
      input: 'U1→A, U2→A; usuń A bez potwierdzenia, potem z potwierdzeniem',
      expected: 'bez potwierdzenia: needsConfirm, stan bez zmian (3 pomysły, 2 głosy); z potwierdzeniem: 2 pomysły, 0 głosów',
      run() {
        const s = abc(); C.addVote(s, 'U1', 'A'); C.addVote(s, 'U2', 'A');
        const before = snap(s);
        const r1 = C.deleteIdea(s, 'A', false);
        const unchanged = snap(s) === before;
        const r2 = C.deleteIdea(s, 'A', true);
        const pass = !r1.ok && r1.needsConfirm && unchanged && r2.ok && s.ideas.length === 2 && s.votes.length === 0;
        return { pass, actual: `needsConfirm = ${!!r1.needsConfirm}, stan bez zmian: ${unchanged}; po potwierdzeniu: ${s.ideas.length} pomysły, ${s.votes.length} głosów` };
      }
    },
    {
      name: 'Pusta lista: czytelny stan, brak dzielenia przez zero',
      input: 'stan bez pomysłów i głosów',
      expected: 'ranking pusty, pomysłów 0, głosujących 0, średnia = null (nie NaN/Infinity), brak wyjątku',
      run() {
        let c, thrown = null;
        try { c = C.compute(C.emptyState()); } catch (e) { thrown = e.message; }
        const pass = !thrown && c.ranking.length === 0 && c.ideaCount === 0 && c.distinctVoters === 0 && c.avgVotesPerVoter === null && c.perCategory.length === 0;
        return { pass, actual: thrown ? 'wyjątek: ' + thrown : `ranking ${c.ranking.length}, pomysłów ${c.ideaCount}, głosujących ${c.distinctVoters}, średnia ${c.avgVotesPerVoter}` };
      }
    },
    {
      name: 'Eksport i ponowny import JSON odtwarzają dane i ten sam ranking',
      input: 'scenariusz „typowy” → exportData → parseImport',
      expected: 'te same pomysły i głosy; ranking D-01,I-01,I-03,W-01,D-02,I-02,S-01,W-02',
      run() {
        const s = C.SCENARIOS.typowy.make().state;
        const r = C.parseImport(C.exportData(s));
        const order = r.ok ? C.orderString(C.compute(r.state).ranking) : '—';
        const pass = r.ok && snap(r.state.ideas) === snap(s.ideas) && snap(r.state.votes) === snap(s.votes) && order === 'D-01,I-01,I-03,W-01,D-02,I-02,S-01,W-02';
        return { pass, actual: `import ok = ${r.ok}; dane identyczne: ${r.ok && snap(r.state) === snap(s)}; ranking ${order}` };
      }
    },
    {
      name: 'Błędny plik nie nadpisuje zapisanych danych',
      input: '5 plików: zły JSON, zła wersja, powtórzone ID, głos na brak pomysłu, powtórzony głos',
      expected: 'każdy odrzucony z powodem; bieżący stan bez zmian',
      run() {
        const cur = abc(); C.addVote(cur, 'U1', 'A');
        const before = snap(cur);
        const head = { format: C.FORMAT, version: C.VERSION };
        const I = { id: 'A', title: 'x', category: 'inne', status: 'nowy' };
        const files = [
          '{"format": ',
          JSON.stringify({ format: C.FORMAT, version: 99, ideas: [], votes: [] }),
          JSON.stringify(Object.assign({}, head, { ideas: [I, I], votes: [] })),
          JSON.stringify(Object.assign({}, head, { ideas: [I], votes: [{ participant: 'U1', ideaId: 'Q' }] })),
          JSON.stringify(Object.assign({}, head, { ideas: [I], votes: [{ participant: 'U1', ideaId: 'A' }, { participant: 'U1', ideaId: 'A' }] }))
        ];
        const res = files.map(f => C.parseImport(f));
        // aplikacja zastępuje stan tylko przy ok === true
        res.forEach(r => { if (r.ok) { cur.ideas = r.state.ideas; cur.votes = r.state.votes; } });
        const pass = res.every(r => !r.ok && r.errors.length > 0) && snap(cur) === before;
        return { pass, actual: res.map((r, k) => `${k + 1}: ${r.ok ? 'PRZYJĘTY' : r.errors[0]}`).join(' | ') + `; stan bez zmian: ${snap(cur) === before}` };
      }
    },
    {
      name: 'Sortowanie: dane uporządkowane, odwrócone i remis zgodne ze wzorcem',
      input: 'n = 10, 100, 1000; rodzaje sorted / reversed / ties; wzorzec Array.prototype.sort',
      expected: 'zawsze zgodne; uporządkowane: n−1 porównań; odwrócone: n(n−1)/2',
      run() {
        const out = [];
        let pass = true;
        for (const n of [10, 100, 1000]) for (const k of ['sorted', 'reversed', 'ties']) {
          const b = C.benchSort(n, k);
          pass = pass && b.same && (k !== 'sorted' || b.comparisons === n - 1) && (k !== 'reversed' || b.comparisons === n * (n - 1) / 2);
          out.push(`${n}/${k}: ${b.comparisons}${b.same ? '' : ' NIEZGODNE'}`);
        }
        return { pass, actual: out.join(', ') };
      }
    },
    {
      name: 'Remis: kolejność według ID rosnąco',
      input: 'pomysły C, A, B (dodane w tej kolejności), każdy 1 głos',
      expected: 'A,B,C; przy każdym zaznaczony remis',
      run() {
        const s = C.build([CI('C'), CI('A'), CI('B')], [['U1', 'C'], ['U2', 'A'], ['U3', 'B']]);
        const c = C.compute(s);
        return { pass: C.orderString(c.ranking) === 'A,B,C' && c.ranking.every(r => r.tieWith.length > 0), actual: `${C.orderString(c.ranking)}; remisy: ${c.ranking.map(r => r.id + ':' + r.tieWith.join('/')).join(' ')}` };
      }
    },
    {
      name: 'Głos na nieistniejący pomysł jest błędem',
      input: 'pomysły A,B,C; U1→X',
      expected: 'ok = false; głosów 0',
      run() {
        const s = abc(); const r = C.addVote(s, 'U1', 'X');
        return { pass: !r.ok && s.votes.length === 0, actual: `ok = ${r.ok}; głosów ${s.votes.length}; ${r.error}` };
      }
    },
    {
      name: 'Walidacja pomysłu: złe dane odrzucone bez częściowego zapisu',
      input: 'ID „a1”, ID „A B”, puste ID, powtórzone „A”, pusty tytuł, zły status, edycja ID',
      expected: 'wszystkie ok = false; stan identyczny jak przed',
      run() {
        const s = abc(); const before = snap(s);
        const rs = [
          C.addIdea(s, { id: 'a1', title: 't', category: 'inne' }),
          C.addIdea(s, { id: 'A B', title: 't', category: 'inne' }),
          C.addIdea(s, { id: '', title: 't', category: 'inne' }),
          C.addIdea(s, { id: 'A', title: 't', category: 'inne' }),
          C.addIdea(s, { id: 'D', title: '   ', category: 'inne' }),
          C.addIdea(s, { id: 'E', title: 't', category: 'inne', status: 'gotowy' }),
          C.editIdea(s, 'A', { id: 'A2', title: 'nowy tytuł' }),
          C.editIdea(s, 'A', { title: '' })
        ];
        return { pass: rs.every(r => !r.ok) && snap(s) === before, actual: `odrzucone ${rs.filter(r => !r.ok).length}/${rs.length}; stan bez zmian: ${snap(s) === before}` };
      }
    },
    {
      name: 'Licznik wyszukiwania liniowego odpowiada pętli (pierwsze dopasowanie)',
      input: 'n = 1000 głosów: para na początku, na końcu, brak',
      expected: 'sprawdzone rekordy: 1 / 1000 / 1000; indeks 0 / 999 / −1',
      run() {
        const b = C.benchSearch(1000);
        const pass = b[0].checked === 1 && b[0].index === 0 && b[1].checked === 1000 && b[1].index === 999 && b[2].checked === 1000 && b[2].index === -1;
        return { pass, actual: b.map(x => `${x.where}: idx ${x.index}, rekordów ${x.checked}, porównań ${x.comparisons}`).join('; ') };
      }
    },
    {
      name: 'Limit 1000 rekordów',
      input: 'scenariusz „większy” (1000 pomysłów, 1000 głosów) + 1 pomysł + 1 głos',
      expected: 'oba odrzucone; nadal 1000 / 1000',
      run() {
        const s = C.SCENARIOS.wiekszy.make().state;
        const r1 = C.addIdea(s, { id: 'NADMIAR', title: 't', category: 'inne' });
        const r2 = C.addVote(s, 'U-NOWY', 'P-0001');
        return { pass: !r1.ok && !r2.ok && s.ideas.length === 1000 && s.votes.length === 1000, actual: `${r1.ok}/${r2.ok}; ${s.ideas.length} / ${s.votes.length}` };
      }
    },
    {
      name: 'Zmiana statusu z historią; zły status odrzucony',
      input: 'A: nowy → w analizie → przyjęty; potem status „gotowy”',
      expected: 'status przyjęty; historia 3 wpisy; „gotowy” odrzucony',
      run() {
        const s = abc();
        C.setStatus(s, 'A', 'w analizie'); C.setStatus(s, 'A', 'przyjęty');
        const bad = C.setStatus(s, 'A', 'gotowy');
        const a = s.ideas[0];
        const h = a.history.map(x => x.to).join(' → ');
        return { pass: a.status === 'przyjęty' && a.history.length === 3 && !bad.ok, actual: `status ${a.status}; historia: ${h}; „gotowy”: ok = ${bad.ok}` };
      }
    },
    {
      name: 'Tekst z HTML przechowywany jako zwykły tekst',
      input: 'tytuł „<b>x</b>”, opis „<script>…</script>”',
      expected: 'zapis bez zmian znak po znaku (wyświetlanie przez textContent)',
      run() {
        const s = C.emptyState();
        C.addIdea(s, { id: 'H', title: '<b>x</b>', description: '<script>alert(1)</script>', category: 'inne' });
        const r = C.parseImport(C.exportData(s));
        const pass = s.ideas[0].title === '<b>x</b>' && r.ok && r.state.ideas[0].description === '<script>alert(1)</script>';
        return { pass, actual: `tytuł: ${s.ideas[0].title}; opis po imporcie: ${r.ok ? r.state.ideas[0].description : '—'}` };
      }
    },
    {
      name: 'Tabela „przed → decyzja → po” dla przykładu kontrolnego po wycofaniu',
      input: 'A=1, B=2, C=0 (kolejność dodania A,B,C)',
      expected: 'krok 1: B(2) przesunięte przed A(1); krok 2: C(0) zostaje; wynik B,A,C; 2 porównania (B dochodzi do początku listy, C zatrzymuje się na A)',
      run() {
        const s = C.build(C.CONTROL_IDEAS, [['U1', 'A'], ['U2', 'B'], ['U1', 'B']]);
        const c = C.compute(s, { trace: true });
        const t = c.trace;
        const pass = t.length === 2 && t[0].after.join(',') === 'B(2),A(1),C(0)' && t[0].pos === 0 && t[1].pos === 2 && c.counters.sort.comparisons === 2;
        return { pass, actual: t.map(x => `${x.before.join(',')} → ${x.decisions.join('; ')} → ${x.after.join(',')}`).join(' | ') + `; porównań ${c.counters.sort.comparisons}` };
      }
    }
  ];

  function CI(id) { return { id, title: 'Pomysł ' + id, category: 'inne' }; }

  function run() {
    return TESTS.map((t, k) => {
      let r;
      try { r = t.run(); } catch (e) { r = { pass: false, actual: 'wyjątek: ' + e.message }; }
      return { id: k + 1, name: t.name, input: t.input, expected: t.expected, actual: r.actual, pass: !!r.pass };
    });
  }

  return { run, count: TESTS.length };
});
