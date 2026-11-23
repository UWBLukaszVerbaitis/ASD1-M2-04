// Zapisuje scenariusze do data/*.json (format importu aplikacji). Użycie: node tools/gen-data.js
const fs = require('fs'), path = require('path');
const C = require('../src/core.js');
const dir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });
for (const k of Object.keys(C.SCENARIOS)) {
  if (k === 'pusty') continue;
  const { state } = C.SCENARIOS[k].make();
  fs.writeFileSync(path.join(dir, `scenariusz-${k}.json`), C.exportData(state) + '\n');
  console.log(`data/scenariusz-${k}.json: ${state.ideas.length} pomysłów, ${state.votes.length} głosów`);
}
fs.writeFileSync(path.join(dir, 'przyklad-kontrolny.txt'), C.CONTROL_SCRIPT + '\n');
fs.writeFileSync(path.join(dir, 'bledny-plik.json'), JSON.stringify({ format: C.FORMAT, version: C.VERSION,
  ideas: [{ id: 'A', title: 'Pomysł A', category: 'inne', status: 'nowy' }, { id: 'a-2', title: '', category: 'inne', status: 'gotowy' }],
  votes: [{ participant: 'U1', ideaId: 'X' }] }, null, 2) + '\n');
console.log('data/przyklad-kontrolny.txt, data/bledny-plik.json');
