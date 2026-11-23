// Uruchomienie: node tests/run.js   (albo: npm test)
const T = require('../src/tests.js');
const res = T.run();
let ok = 0;
for (const r of res) {
  if (r.pass) ok++;
  console.log(`${String(r.id).padStart(2)}. [${r.pass ? 'OK ' : 'BŁĄD'}] ${r.name}\n     wejście:    ${r.input}\n     oczekiwano: ${r.expected}\n     uzyskano:   ${r.actual}`);
}
console.log(`\nWynik: ${ok}/${res.length} testów zaliczonych`);
process.exit(ok === res.length ? 0 : 1);
