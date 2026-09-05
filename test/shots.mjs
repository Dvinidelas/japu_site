/**
 * Gera capturas de tela das páginas, para conferir o resultado visual sem
 * precisar abrir o navegador na mão.
 *
 *   npm run shots            # salva em ./capturas
 *   npm run shots -- /tmp/x  # salva em outro diretório
 */
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

process.env.RATE_LIMIT_MAX = '100000';
process.env.RATE_LIMIT_WRITE_MAX = '100000';
const { createApp } = await import('../server/index.js');

const OUT = process.argv[2] || 'capturas';
mkdirSync(OUT, { recursive: true });

const app = createApp();
const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const BASE = `http://127.0.0.1:${server.address().port}`;

const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});

async function captura(nome, rota, { width = 1280, height = 900, full = true, antes } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  // Sem rede no ambiente de teste; as fontes têm pilha de fallback no CSS.
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  await page.goto(`${BASE}${rota}`, { waitUntil: 'networkidle' });
  if (antes) await antes(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${nome}.png`, fullPage: full });
  console.log(`  ${nome}.png`);
  await ctx.close();
}

console.log(`\nCapturas em ${OUT}/\n`);

await captura('01-home', '/');
await captura('02-loja', '/loja');
await captura('03-safra', '/safra');
await captura('04-produto-com-frete', '/produto/manteiga-de-cupuacu-200g', {
  antes: async (p) => {
    await p.fill('.freight-form input', '20031170');
    await p.click('.freight-form button');
    await p.waitForSelector('.freight-option');
  },
});
await captura('05-celular-barra-de-compra', '/produto/nibs-de-cacau-150g',
  { width: 390, height: 844, full: false });
await captura('06-fora-de-safra', '/produto/compota-de-jabuticaba-280g');
await captura('07-lista-de-espera', '/produto/compota-de-jabuticaba-280g', {
  full: false,
  antes: async (p) => {
    await p.click('button:has-text("Avise-me quando chegar")');
    await p.waitForSelector('.modal[data-open="true"]');
    await p.waitForTimeout(500);
  },
});
await captura('08-proposta', '/proposta');
await captura('09-sacola', '/sacola', {
  antes: async (p) => {
    await p.evaluate(() => localStorage.setItem('japu.cart.v1',
      JSON.stringify([{ sku: 'CAC-PO-150', qty: 2 }, { sku: 'CUP-MTG-200', qty: 1 }])));
    await p.reload({ waitUntil: 'networkidle' });
    await p.fill('#cep', '20031170');
    await p.waitForSelector('.ship-option');
  },
});
await captura('10-celular-loja', '/loja', { width: 390, height: 844, full: false });

await browser.close();
await new Promise((r) => server.close(r));
console.log('\npronto\n');
