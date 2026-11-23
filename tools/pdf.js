// node tools/pdf.js — eksport slajdów i dokumentacji do PDF (wymaga Playwright) + kontrola przepełnienia stron
const { chromium } = require('playwright');
const path = require('path');
const R = f => path.join(__dirname, '..', f);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const [html, pdf, sel, opts] of [
    ['slides/prezentacja.html', 'slides/prezentacja.pdf', '.slide', { width: '1280px', height: '720px' }],
    ['docs/dokumentacja.html', 'docs/dokumentacja.pdf', '.page', { format: 'A4' }]
  ]) {
    await p.goto('file://' + R(html));
    const over = await p.$$eval(sel, els => els.map((e, i) => {
      const box = e.getBoundingClientRect(), foot = e.querySelector('.foot, .no');
      const limit = foot ? foot.getBoundingClientRect().top : box.bottom;
      let max = 0;
      for (const c of e.children) if (c !== foot && !c.classList.contains('src') && !c.classList.contains('hdr')) max = Math.max(max, c.getBoundingClientRect().bottom);
      return max > limit - 2 ? `${i + 1} (+${Math.round(max - limit)}px)` : null;
    }).filter(Boolean));
    console.log(`${pdf}: ${over.length ? 'PRZEPEŁNIONE: ' + over.join(', ') : 'bez przepełnień'}`);
    await p.pdf(Object.assign({ path: R(pdf), printBackground: true, preferCSSPageSize: true }, opts));
  }
  await b.close();
})();
