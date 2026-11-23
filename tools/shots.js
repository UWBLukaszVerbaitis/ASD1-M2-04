// Przechodzi przez aplikację w Chromium (Playwright), sprawdza kluczowe zachowania i zapisuje zrzuty do docs/img.
// Użycie: node tools/shots.js   (wymaga: npm install)
const { chromium } = require('playwright');
const path = require('path');
const R = p => path.join(__dirname, '..', p);
const shot = (page, name, opts) => page.screenshot(Object.assign({ path: R('docs/img/' + name) }, opts || {}));

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1.5, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => { errors.push('natywne okno: ' + d.message()); d.dismiss(); });
  await page.goto('file://' + R('index.html'));
  const msg = () => page.textContent('#msg');
  const check = (cond, what) => { console.log((cond ? 'OK   ' : 'BŁĄD ') + what); if (!cond) process.exitCode = 1; };

  // 1. Pomysły + karta + tryb operatora
  await page.check('#operator');
  await page.click('.idea >> nth=0 >> .ttl');
  check((await page.textContent('#detail')).includes('Suma 4'), 'karta D-01 pokazuje sumę 4 i listę głosów');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'ui_ideas.png', { fullPage: false });

  // 2. Błąd: głos na nieistniejący pomysł
  await page.fill('#vP', 'U1'); await page.fill('#vI', 'X-99');
  await page.click('#voteForm button[type=submit]');
  check((await msg()).includes('nieistniejący'), 'głos na nieistniejący pomysł odrzucony z powodem');
  await page.fill('#vI', 'D-01'); await page.click('#voteForm button[type=submit]');
  check((await msg()).includes('już popiera'), 'powtórny głos U1→D-01 odrzucony');
  await shot(page, 'ui_error.png', { clip: { x: 0, y: 0, width: 1360, height: 330 } });

  // 3. Usuwanie z potwierdzeniem: anuluj → głosy zostają
  await page.click('#detail button.danger');
  await page.waitForSelector('dialog[open]');
  await shot(page, 'ui_delete.png');
  await page.click('#dlgCancel');
  check((await page.textContent('#detail')).includes('Suma 4'), 'po anulowaniu usunięcia D-01 nadal ma 4 głosy');

  // 4. Ranking
  await page.click('#t-rank');
  check((await page.textContent('#rankTable')).includes('remis'), 'ranking oznacza remisy');
  await shot(page, 'ui_ranking.png', { fullPage: true });

  // 5. Przykład kontrolny
  await page.click('#t-control');
  await page.click('#scriptForm button[type=submit]');
  await page.waitForSelector('dialog[open]'); await page.click('#dlgOk');
  check((await page.textContent('#expectBox')).includes('Zgodne z kartą'), 'przykład kontrolny zgodny z kartą');
  await shot(page, 'ui_control.png', { fullPage: true });

  // 6. Zmiana danych na żywo: U4 popiera A → A i B remis 2:2 → A,B,C
  await page.click('#t-ideas');
  await page.fill('#me', 'U4');
  await page.click('.idea:has(.id:text-is("A")) button[aria-pressed]');
  const order = await page.$$eval('.idea .id', e => e.map(x => x.textContent).join(','));
  check(order === 'A,B,C', 'po głosie U4→A kolejność A,B,C (jest: ' + order + ')');

  // 7. Algorytmy + porównania
  await page.click('#t-algo');
  await page.click('#benchSortBtn'); await page.click('#benchSearchBtn');
  check(!(await page.textContent('#benchSortTable')).includes('✗'), 'sortowanie zgodne ze wzorcem dla 10/100/1000');
  await shot(page, 'ui_algo.png', { fullPage: true });

  // 8. Import błędnego pliku nie zmienia danych
  await page.click('#t-data');
  const before = await page.evaluate(() => localStorage.getItem('asd1-m2-04-stan'));
  await page.setInputFiles('#importFile', R('data/bledny-plik.json'));
  await page.waitForSelector('#importBox .errlist');
  const after = await page.evaluate(() => localStorage.getItem('asd1-m2-04-stan'));
  check(before === after && (await msg()).includes('nie zostały zmienione'), 'błędny plik odrzucony, dane bez zmian');
  await shot(page, 'ui_import.png', { fullPage: true });

  // 9. Scenariusz graniczny: HTML jako tekst
  await page.click('#scenarioBtns button:has-text("Graniczny")');
  await page.waitForSelector('dialog[open]'); await page.click('#dlgOk');
  await page.click('#t-ideas');
  check((await page.$$('.idea b:not(.place b)')).length === 0 && (await page.textContent('#ideaList')).includes('<b>Pogrubienie?</b>'), 'tytuł z <b> wyświetlony jako tekst');
  await page.click('.idea:has(.id:text-is("HTML-1")) .ttl');
  await shot(page, 'ui_boundary.png');

  // 10. Większy: 1000/1000
  await page.click('#t-data');
  await page.click('#scenarioBtns button:has-text("Większy")');
  await page.waitForSelector('dialog[open]'); await page.click('#dlgOk');
  check((await page.textContent('#stats')).includes('1000') || (await page.textContent('#stats')).includes('1 000'), 'scenariusz większy wczytany');

  // 11. Pusty
  await page.click('#scenarioBtns button:has-text("Pusty")');
  await page.waitForSelector('dialog[open]'); await page.click('#dlgOk');
  await page.click('#t-rank');
  check((await page.textContent('#voterSummary')).includes('nie dzielimy przez zero'), 'pusty zestaw: brak dzielenia przez zero');
  await shot(page, 'ui_empty.png', { clip: { x: 0, y: 0, width: 1360, height: 640 } });

  // 12. Testy w przeglądarce
  await page.click('#t-tests'); await page.click('#runTests');
  const sum = await page.textContent('#testSummary');
  check(/^(\d+)\/\1 /.test(sum), 'testy w przeglądarce: ' + sum);
  await shot(page, 'ui_tests.png', { fullPage: true });

  check(errors.length === 0, 'brak błędów konsoli' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await b.close();
})();
