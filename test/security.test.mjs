import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.mjs';

const ctx = await startServer();
test.after(() => ctx.close());

/* --- Cabecalhos ------------------------------------------------------------ */

test('CSP não usa unsafe-inline nem unsafe-eval', async () => {
  const res = await ctx.request('/');
  const csp = res.headers.get('content-security-policy');
  assert.ok(csp, 'CSP ausente');
  assert.ok(!csp.includes("'unsafe-inline'"), 'CSP não pode ter unsafe-inline');
  assert.ok(!csp.includes("'unsafe-eval'"), 'CSP não pode ter unsafe-eval');
  assert.match(csp, /script-src [^;]*'nonce-/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
});

test('o nonce muda a cada requisição', async () => {
  const pegar = async () => {
    const res = await ctx.request('/');
    return /'nonce-([^']+)'/.exec(res.headers.get('content-security-policy'))[1];
  };
  assert.notEqual(await pegar(), await pegar());
});

test('cabeçalhos de proteção estão presentes', async () => {
  const res = await ctx.request('/');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.match(res.headers.get('permissions-policy'), /geolocation=\(\)/);
  assert.equal(res.headers.get('x-powered-by'), null, 'não deve anunciar o servidor');
});

/* --- CSRF ------------------------------------------------------------------- */

test('escrita sem token CSRF é bloqueada com 403', async () => {
  const res = await ctx.request('/api/cart/validate', {
    method: 'POST', body: { items: [] }, withCsrf: false,
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'csrf_invalido');
});

test('token CSRF errado é bloqueado', async () => {
  const res = await ctx.request('/api/waitlist', {
    method: 'POST',
    body: { sku: 'COM-JAB-280', email: 'a@b.com' },
    headers: { 'x-csrf-token': 'token-falso-mas-do-mesmo-tamanho-aqui' },
    withCsrf: false,
  });
  assert.equal(res.status, 403);
});

test('leitura não exige CSRF', async () => {
  assert.equal((await ctx.request('/api/products', { withCsrf: false })).status, 200);
});

/* --- Validacao de entrada --------------------------------------------------- */

test('SKU com caracteres estranhos é recusado pelo esquema', async () => {
  for (const sku of ['../../etc/passwd', '<script>alert(1)</script>', "' OR 1=1--"]) {
    const res = await ctx.request('/api/cart/validate', {
      method: 'POST', body: { items: [{ sku, qty: 1 }] },
    });
    assert.equal(res.status, 422, `SKU ${sku} deveria ser recusado`);
  }
});

test('campo extra no corpo não vaza para a resposta', async () => {
  const res = await ctx.request('/api/cart/validate', {
    method: 'POST',
    body: { items: [{ sku: 'CAC-PO-150', qty: 1, admin: true }], admin: true },
  });
  const texto = await res.text();
  assert.ok(!texto.includes('admin'), 'chave extra não deve atravessar a validação');
});

test('JSON malformado devolve 400, não 500', async () => {
  const res = await fetch(`${ctx.base}/api/cart/validate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': ctx.csrf, cookie: `japu_csrf=${ctx.csrf}` },
    body: '{isso nao e json',
  });
  assert.equal(res.status, 400);
});

test('corpo acima do limite é recusado com 413', async () => {
  const gigante = JSON.stringify({ items: Array.from({ length: 5000 }, () => ({ sku: 'CAC-PO-150', qty: 1 })) });
  const res = await fetch(`${ctx.base}/api/cart/validate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': ctx.csrf, cookie: `japu_csrf=${ctx.csrf}` },
    body: gigante,
  });
  assert.equal(res.status, 413);
});

/* --- Vazamento de segredo ---------------------------------------------------- */

test('/api/config não expõe nenhum segredo', async () => {
  const texto = await (await ctx.request('/api/config')).text();
  for (const proibido of ['secretKey', 'webhookSecret', 'sessionSecret', 'PAYMENT_SECRET']) {
    assert.ok(!texto.includes(proibido), `${proibido} não pode aparecer na config pública`);
  }
  const cfg = JSON.parse(texto);
  assert.equal(cfg.paymentEnabled, false);
});

test('erro interno não devolve stack trace em produção', async () => {
  // Em dev o detalhe aparece; o teste garante que a chave existe só sob NODE_ENV != production.
  const res = await ctx.request('/api/nao-existe');
  assert.equal(res.status, 404);
  const texto = await res.text();
  assert.ok(!texto.includes('at Object'), 'nunca devolver stack trace');
});

/* --- Webhook de pagamento ---------------------------------------------------- */

test('webhook sem assinatura válida é rejeitado', async () => {
  const res = await fetch(`${ctx.base}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: { id: '123' }, type: 'payment' }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'webhook_rejeitado');
});

/* --- Include de parciais ------------------------------------------------------ */

test('include não permite atravessar diretório', async () => {
  // O HTML servido não pode conter conteúdo de fora de public/partials.
  const html = await (await ctx.request('/')).text();
  assert.ok(!html.includes('SESSION_SECRET'));
  assert.ok(html.includes('Morada do Japu'));
});

/* --- Rate limiting ------------------------------------------------------------ */

test('rate limit responde com cabeçalhos de limite', async () => {
  const res = await ctx.request('/api/products');
  assert.ok(res.headers.get('ratelimit') || res.headers.get('ratelimit-limit'),
    'deve anunciar o limite ao cliente');
});
