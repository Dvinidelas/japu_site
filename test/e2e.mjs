/**
 * Ambiente de teste local com navegador real.
 *
 * Valida o que os testes de API nao alcancam: os menus interativos, o filtro
 * de categoria, a sacola, o calendario da safra e a barra fixa de compra —
 * e, principalmente, se a CSP restritiva quebra alguma funcionalidade. Toda
 * violacao de CSP e todo erro de console derruba a suite.
 */
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createApp } from '../server/index.js';

const app = createApp();
const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const BASE = `http://127.0.0.1:${server.address().port}`;

// O ambiente traz um Chromium pre-instalado; usa-lo evita baixar navegador
// a cada execucao e mantem o teste funcionando sem rede.
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const browser = await chromium.launch(
  existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {}
);
let passou = 0;
const falhas = [];

async function cenario(nome, fn, viewport = { width: 1280, height: 900 }) {
  const contexto = await browser.newContext({ viewport });
  const page = await contexto.newPage();

  // O ambiente de teste nao alcanca a internet. As fontes do Google sao
  // melhoria progressiva (o CSS tem pilha de fallback), entao aqui elas sao
  // curto-circuitadas: sem isso cada `networkidle` espera o timeout da rede.
  await contexto.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' })
  );

  const problemas = [];
  page.on('console', (msg) => {
    const texto = msg.text();
    const respostaHttpEsperada = /Failed to load resource/i.test(texto);
    if (msg.type() === 'error' && !respostaHttpEsperada) problemas.push(`console: ${texto}`);
    // Uma violacao de CSP aparece no console como "Refused to ...".
    if (/Refused to (load|execute|apply)/i.test(texto)) problemas.push(`CSP: ${texto}`);
  });
  page.on('pageerror', (err) => problemas.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => {
    if (!req.url().includes('fonts.g')) problemas.push(`request falhou: ${req.url()}`);
  });

  try {
    await fn(page);
    if (problemas.length) throw new Error(problemas.join('\n      '));
    console.log(`  ok   ${nome}`);
    passou += 1;
  } catch (err) {
    console.log(`  FALHA ${nome}\n      ${err.message}`);
    falhas.push(nome);
  } finally {
    await contexto.close();
  }
}

const esperar = async (page, seletor, timeout = 8000) =>
  page.waitForSelector(seletor, { timeout, state: 'visible' });

console.log('\nE2E — navegador real, CSP ligada\n');

/* --- Home ------------------------------------------------------------------ */

await cenario('home carrega os destaques da semana', async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await esperar(page, '#destaques .card');
  const cards = await page.locator('#destaques .card').count();
  if (cards !== 4) throw new Error(`esperava 4 destaques, veio ${cards}`);
  const h1 = await page.locator('h1').first().innerText();
  if (!h1.includes('sombra da mata')) throw new Error(`título inesperado: ${h1}`);
});

await cenario('prévia do calendário aparece na home', async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await esperar(page, '#teaser-safra li');
  const linhas = await page.locator('#teaser-safra li').count();
  if (linhas < 5) throw new Error(`esperava 6 espécies, veio ${linhas}`);
});

/* --- Menus ------------------------------------------------------------------ */

await cenario('submenu de categorias abre e traz a contagem real', async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.click('.nav-toggle');
  await esperar(page, '.submenu[data-open="true"]');
  const itens = await page.locator('#menu-categorias li').count();
  if (itens !== 7) throw new Error(`esperava 6 categorias + "ver tudo", veio ${itens}`);
  const texto = await page.locator('#menu-categorias').innerText();
  if (!texto.includes('Cacau')) throw new Error('categoria Cacau ausente no submenu');
  if (!/\d\/\d/.test(texto)) throw new Error('contagem disponível/total ausente');
});

await cenario('submenu leva para a loja já filtrada', async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.click('.nav-toggle');
  await esperar(page, '.submenu[data-open="true"]');
  await page.click('#menu-categorias a[href*="categoria=compotas"]');
  await page.waitForURL('**/loja?categoria=compotas');
  await esperar(page, '#grade .card');
  const cards = await page.locator('#grade .card').count();
  if (cards !== 3) throw new Error(`compotas deveriam ser 3, vieram ${cards}`);
});

await cenario('hambúrguer abre a navegação no celular', async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const navVisivel = async () => (await page.locator('.nav').boundingBox())?.height ?? 0;
  if (await navVisivel() > 10) throw new Error('nav deveria começar fechada no celular');
  await page.click('.nav-burger');
  await page.waitForTimeout(350);
  if (await navVisivel() < 50) throw new Error('nav não abriu ao tocar no hambúrguer');
}, { width: 390, height: 844 });

/* --- Loja -------------------------------------------------------------------- */

await cenario('filtro por categoria funciona e reflete na URL', async (page) => {
  await page.goto(`${BASE}/loja`, { waitUntil: 'networkidle' });
  await esperar(page, '#grade .card');
  if (await page.locator('#grade .card').count() !== 14) throw new Error('deveria listar 14 produtos');

  await page.click('.chip[data-categoria="cacau"]');
  await page.waitForFunction(() => document.querySelectorAll('#grade .card').length === 4);
  if (!page.url().includes('categoria=cacau')) throw new Error('URL não recebeu o filtro');

  const contagem = await page.locator('#contagem').innerText();
  if (!contagem.includes('4 produtos')) throw new Error(`contagem errada: ${contagem}`);
});

await cenario('botão voltar do navegador desfaz o filtro', async (page) => {
  await page.goto(`${BASE}/loja`, { waitUntil: 'networkidle' });
  await esperar(page, '#grade .card');
  await page.click('.chip[data-categoria="compotas"]');
  await page.waitForFunction(() => document.querySelectorAll('#grade .card').length === 3);
  await page.goBack();
  await page.waitForFunction(() => document.querySelectorAll('#grade .card').length === 14);
});

await cenario('contagem geral bate com a proposta: 14 produtos, 10 disponíveis', async (page) => {
  await page.goto(`${BASE}/loja`, { waitUntil: 'networkidle' });
  await esperar(page, '#contagem');
  const texto = await page.locator('#contagem').innerText();
  if (!texto.includes('14 produtos') || !texto.includes('10 disponíveis')) {
    throw new Error(`contagem inesperada: ${texto}`);
  }
});

/* --- Esgotado vira lista de espera (item 3) ---------------------------------- */

await cenario('produto fora de safra mostra fila, não botão cinza', async (page) => {
  await page.goto(`${BASE}/loja?categoria=compotas`, { waitUntil: 'networkidle' });
  await esperar(page, '#grade .card');
  const card = page.locator('.card[data-sku="COM-JAB-280"]');
  // innerText vem transformado pelo CSS (o selo e uppercase), dai o /i.
  const texto = await card.innerText();
  if (!/volta em outubro/i.test(texto)) throw new Error('selo de retorno ausente');
  if (!/pessoas na fila/i.test(texto)) throw new Error('contagem da fila ausente');
  if (!/avise-me quando chegar/i.test(texto)) throw new Error('botão de aviso ausente');
});

await cenario('lista de espera registra e-mail e sugere alternativa', async (page) => {
  await page.goto(`${BASE}/produto/compota-de-jabuticaba-280g`, { waitUntil: 'networkidle' });
  await esperar(page, '#produto .product-panel');
  await page.click('button:has-text("Avise-me quando chegar")');
  await esperar(page, '.modal[data-open="true"]');

  // A alternativa da mesma categoria aparece dentro do modal.
  await page.waitForFunction(
    () => /dispon\u00edvel agora/i.test(document.querySelector('.modal[data-open="true"]')?.innerText ?? ''),
    { timeout: 5000 }
  );

  await page.fill('#wl-email', 'teste@exemplo.com');
  await page.click('.modal button[type="submit"]');
  await esperar(page, '.toast');
  const aviso = await page.locator('.toast').innerText();
  if (!/avisamos|fila/i.test(aviso)) throw new Error(`aviso inesperado: ${aviso}`);
});

await cenario('e-mail inválido não é enviado', async (page) => {
  await page.goto(`${BASE}/produto/compota-de-jambo-280g`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Avise-me quando chegar")');
  await esperar(page, '.modal[data-open="true"]');
  await page.fill('#wl-email', 'nao-e-email');
  await page.click('.modal button[type="submit"]');
  await page.waitForFunction(
    () => document.querySelector('.field-error')?.textContent.includes('Confira'),
    { timeout: 3000 }
  );
});

/* --- Frete antes do checkout (item 4) ----------------------------------------- */

await cenario('frete é calculado na página do produto', async (page) => {
  await page.goto(`${BASE}/produto/manteiga-de-cupuacu-200g`, { waitUntil: 'networkidle' });
  await esperar(page, '.freight-form input');
  await page.fill('.freight-form input', '20031170');
  await page.click('.freight-form button');
  await page.waitForFunction(
    () => document.querySelectorAll('.freight-option').length === 2, { timeout: 5000 }
  );
  const texto = await page.locator('.freight-result').innerText();
  if (!texto.includes('dias úteis')) throw new Error('prazo ausente na cotação');
  if (!/R\$/.test(texto)) throw new Error('valor do frete ausente');
});

await cenario('CEP inválido mostra erro em vez de valor errado', async (page) => {
  await page.goto(`${BASE}/produto/cacau-em-po-150g`, { waitUntil: 'networkidle' });
  await esperar(page, '.freight-form input');
  await page.fill('.freight-form input', '00000000');
  await page.click('.freight-form button');
  await page.waitForFunction(
    () => document.querySelector('.freight-result .field-error'), { timeout: 5000 }
  );
});

/* --- Barra fixa de compra (item 5) --------------------------------------------- */

await cenario('barra fixa aparece no celular com preço e botão', async (page) => {
  await page.goto(`${BASE}/produto/nibs-de-cacau-150g`, { waitUntil: 'networkidle' });
  await esperar(page, '#barra-compra');
  const caixa = await page.locator('#barra-compra').boundingBox();
  const alturaJanela = page.viewportSize().height;
  if (caixa.y + caixa.height > alturaJanela + 2) throw new Error('barra não está ancorada embaixo');
  const preco = await page.locator('#barra-preco').innerText();
  if (!preco.includes('43,70')) throw new Error(`preço na barra errado: ${preco}`);
  const parcela = await page.locator('#barra-parcela').innerText();
  if (!parcela.includes('2×')) throw new Error('parcelamento ausente');
}, { width: 390, height: 844 });

await cenario('barra fixa some em produto fora de safra', async (page) => {
  await page.goto(`${BASE}/produto/compota-de-jabuticaba-280g`, { waitUntil: 'networkidle' });
  await esperar(page, '#produto .product-panel');
  await page.waitForTimeout(300);
  if (await page.locator('#barra-compra').isVisible()) {
    throw new Error('barra de compra não deveria aparecer sem estoque');
  }
}, { width: 390, height: 844 });

/* --- Sacola ---------------------------------------------------------------------- */

await cenario('adicionar produto atualiza o contador e abre a gaveta', async (page) => {
  await page.goto(`${BASE}/loja`, { waitUntil: 'networkidle' });
  await esperar(page, '#grade .card');
  await page.locator('.card[data-sku="CAC-PO-150"] button:has-text("Adicionar")').click();
  await page.waitForFunction(
    () => document.querySelector('[data-cart-count]')?.textContent === '1', { timeout: 5000 }
  );
  await page.click('[data-open-cart]');
  await esperar(page, '.drawer[data-open="true"]');
  const texto = await page.locator('.drawer-body').innerText();
  if (!texto.includes('Cacau em pó')) throw new Error('item não apareceu na gaveta');
  if (!texto.includes('48,80')) throw new Error('preço do servidor não apareceu');
});

await cenario('quantidade e remoção funcionam na gaveta', async (page) => {
  await page.goto(`${BASE}/loja`, { waitUntil: 'networkidle' });
  await esperar(page, '#grade .card');
  await page.locator('.card[data-sku="CAC-NIB-150"] button:has-text("Adicionar")').click();
  await page.waitForFunction(() => document.querySelector('[data-cart-count]')?.textContent === '1');

  await page.click('[data-open-cart]');
  await esperar(page, '.drawer[data-open="true"]');
  await page.locator('.drawer .qty button[aria-label="Aumentar"]').click();
  await page.waitForFunction(() => document.querySelector('[data-cart-count]')?.textContent === '2');

  const total = await page.locator('.drawer-foot .price').first().innerText();
  if (!total.includes('87,40')) throw new Error(`subtotal errado: ${total}`); // 43,70 × 2

  await page.locator('.drawer .line-remove').click();
  await page.waitForFunction(() => document.querySelector('[data-cart-count]')?.textContent === '0');
});

await cenario('sacola sobrevive ao recarregamento da página', async (page) => {
  await page.goto(`${BASE}/loja`, { waitUntil: 'networkidle' });
  await esperar(page, '#grade .card');
  await page.locator('.card[data-sku="CAC-MTG-200"] button:has-text("Adicionar")').click();
  await page.waitForFunction(() => document.querySelector('[data-cart-count]')?.textContent === '1');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => document.querySelector('[data-cart-count]')?.textContent === '1', { timeout: 5000 }
  );
});

await cenario('preço adulterado no armazenamento não altera o total', async (page) => {
  await page.goto(`${BASE}/loja`, { waitUntil: 'networkidle' });
  // Simula um cliente esperto injetando preço e quantidade fora do limite.
  await page.evaluate(() => localStorage.setItem('japu.cart.v1',
    JSON.stringify([{ sku: 'CUP-MTG-200', qty: 999, priceCents: 1 }])));
  await page.goto(`${BASE}/sacola`, { waitUntil: 'networkidle' });
  await esperar(page, '#itens .line-item');
  const texto = await page.locator('#itens').innerText();
  if (!texto.includes('82,30')) throw new Error('o servidor deveria impor o preço de catálogo');
  const totais = await page.locator('#totais').innerText();
  // 999 é normalizado para 20 → 20 × 82,30 = 1.646,00
  if (!totais.includes('1.646,00')) throw new Error(`total inesperado: ${totais}`);
});

/* --- Fechamento de pedido --------------------------------------------------------- */

await cenario('pedido é fechado com total do servidor e código gerado', async (page) => {
  await page.goto(`${BASE}/loja`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('japu.cart.v1',
    JSON.stringify([{ sku: 'CAC-PO-150', qty: 2 }])));
  await page.goto(`${BASE}/sacola`, { waitUntil: 'networkidle' });
  await esperar(page, '#itens .line-item');

  await page.fill('#cep', '40010000');
  await page.waitForFunction(
    () => document.querySelectorAll('.ship-option').length === 2, { timeout: 5000 }
  );
  await page.fill('#nome', 'Maria Silva');
  await page.fill('#email', 'maria@exemplo.com');
  await page.click('#botao-pagar');

  await esperar(page, '.order-done');
  const ref = await page.locator('.order-ref').innerText();
  if (!/^MJ-/.test(ref)) throw new Error(`código do pedido inesperado: ${ref}`);
  const texto = await page.locator('.order-done').innerText();
  if (!texto.includes('97,60')) throw new Error('subtotal do pedido errado'); // 48,80 × 2
  // Sacola esvazia depois do pedido.
  await page.waitForFunction(() => document.querySelector('[data-cart-count]')?.textContent === '0');
});

await cenario('pedido sem CEP não avança', async (page) => {
  await page.goto(`${BASE}/loja`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('japu.cart.v1',
    JSON.stringify([{ sku: 'CAC-PO-150', qty: 1 }])));
  await page.goto(`${BASE}/sacola`, { waitUntil: 'networkidle' });
  await esperar(page, '#itens .line-item');
  await page.fill('#nome', 'Ana');
  await page.fill('#email', 'ana@exemplo.com');
  await page.click('#botao-pagar');
  await page.waitForFunction(
    () => document.querySelector('#erro-cep')?.textContent.includes('CEP'), { timeout: 3000 }
  );
});

/* --- Almanaque da safra ------------------------------------------------------------ */

await cenario('calendário da safra troca de mês e atualiza os estados', async (page) => {
  await page.goto(`${BASE}/safra`, { waitUntil: 'networkidle' });
  await esperar(page, '.season-row');
  if (await page.locator('.month-tab').count() !== 12) throw new Error('deveria ter 12 meses');

  const linhaJabuticaba = page.locator('.season-row', { hasText: 'Jabuticaba' });
  if (!/volta em out/i.test(await linhaJabuticaba.innerText())) {
    throw new Error('jabuticaba deveria estar fora de safra em setembro');
  }

  await page.locator('.month-tab', { hasText: 'OUT' }).click();
  await page.waitForFunction(() => {
    const linha = [...document.querySelectorAll('.season-row')]
      .find((r) => r.textContent.includes('Jabuticaba'));
    return /dispon\u00edvel/i.test(linha?.textContent ?? '');
  }, { timeout: 5000 });
});

await cenario('barras do calendário são desenhadas a partir dos meses', async (page) => {
  await page.goto(`${BASE}/safra`, { waitUntil: 'networkidle' });
  await esperar(page, '.season-bar span');
  const larguras = await page.locator('.season-bar span').evaluateAll(
    (nodes) => nodes.map((n) => n.style.width)
  );
  if (larguras.length < 7) throw new Error('faltam faixas no calendário');
  if (!larguras.every((w) => w.endsWith('%'))) throw new Error('faixa sem largura calculada');
  // Cacau é o ano todo: precisa existir uma faixa de 100%.
  if (!larguras.includes('100%')) throw new Error('espécie do ano todo deveria ocupar a barra inteira');
});

await cenario('receita da semana soma os itens marcados', async (page) => {
  await page.goto(`${BASE}/safra`, { waitUntil: 'networkidle' });
  await esperar(page, '.ingredient');
  const botao = page.locator('.recipe-body button');
  const inicial = await botao.innerText();
  if (!inicial.includes('2 itens') || !inicial.includes('92,50')) {
    throw new Error(`soma inicial errada: ${inicial}`); // 48,80 + 43,70
  }

  await page.locator('.ingredient input').nth(2).check();
  await page.waitForFunction(
    () => document.querySelector('.recipe-body button')?.textContent.includes('3 itens'),
    { timeout: 3000 }
  );
  const comTres = await botao.innerText();
  if (!comTres.includes('174,80')) throw new Error(`soma com 3 itens errada: ${comTres}`);

  await botao.click();
  await page.waitForFunction(
    () => document.querySelector('[data-cart-count]')?.textContent === '3', { timeout: 5000 }
  );
});

await cenario('destaque do mês permite comprar direto', async (page) => {
  await page.goto(`${BASE}/safra`, { waitUntil: 'networkidle' });
  await esperar(page, '#destaque-mes .btn');
  await page.click('#destaque-mes .btn');
  await page.waitForFunction(
    () => document.querySelector('[data-cart-count]')?.textContent === '1', { timeout: 5000 }
  );
});

/* --- Proposta ------------------------------------------------------------------------ */

await cenario('página da proposta monta o antes e o depois', async (page) => {
  await page.goto(`${BASE}/proposta`, { waitUntil: 'networkidle' });
  await esperar(page, '.legacy-card');
  if (await page.locator('.legacy-card').count() !== 4) throw new Error('faltam cards do "hoje"');
  if (await page.locator('#grade-nova .card').count() !== 4) throw new Error('faltam cards da proposta');
  const antigo = await page.locator('.product-grid--legacy').innerText();
  if (!antigo.includes('Esgotado')) throw new Error('estado esgotado do card atual ausente');
});

/* --- Acessibilidade basica ------------------------------------------------------------ */

await cenario('navegação por teclado alcança o submenu e a sacola', async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab'); // skip link
  const primeiro = await page.evaluate(() => document.activeElement?.className);
  if (!primeiro?.includes('skip-link')) throw new Error('o primeiro foco deveria ser o skip link');

  await page.locator('.nav-toggle').focus();
  await page.keyboard.press('Enter');
  await esperar(page, '.submenu[data-open="true"]');
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => document.querySelector('.submenu')?.dataset.open === 'false', { timeout: 3000 }
  );
});

await cenario('404 responde com página tratada', async (page) => {
  const res = await page.goto(`${BASE}/pagina-que-nao-existe`, { waitUntil: 'networkidle' });
  if (res.status() !== 404) throw new Error(`status ${res.status()}`);
  const texto = await page.locator('h1').innerText();
  if (!texto.includes('safra')) throw new Error(`título inesperado: ${texto}`);
});

/* --- Encerramento ---------------------------------------------------------------------- */

await browser.close();
await new Promise((r) => server.close(r));

console.log(`\n  ${passou} cenários passaram, ${falhas.length} falharam`);
if (falhas.length) {
  console.log(`  falhas: ${falhas.join(', ')}\n`);
  process.exit(1);
}
console.log('');
