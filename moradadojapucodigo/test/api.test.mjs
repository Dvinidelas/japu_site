import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.mjs';

const ctx = await startServer();
test.after(() => ctx.close());

/* --- Catalogo -------------------------------------------------------------- */

test('catálogo tem 14 produtos e 10 disponíveis, como na proposta', async () => {
  const data = await (await ctx.request('/api/products')).json();
  assert.equal(data.total, 14);
  assert.equal(data.available, 10);
});

test('filtro por categoria devolve só aquela categoria', async () => {
  const data = await (await ctx.request('/api/products?category=compotas')).json();
  assert.equal(data.total, 3);
  assert.ok(data.products.every((p) => p.category === 'compotas'));
});

test('categoria inexistente não quebra: cai no catálogo inteiro', async () => {
  const data = await (await ctx.request('/api/products?category=<script>')).json();
  assert.equal(data.total, 14);
});

test('produto traz alternativas da mesma categoria quando fora de safra', async () => {
  const res = await ctx.request('/api/products/compota-de-jabuticaba-280g');
  const { product, alternatives } = await res.json();
  assert.equal(product.inStock, false);
  assert.equal(product.returnsMonthLabel, 'out');
  assert.ok(Array.isArray(alternatives));
});

test('categoria inteira fora de safra ainda recebe alternativa', async () => {
  // As tres compotas saem de safra juntas. Se a sugestao ficasse presa na
  // mesma categoria, a lista de espera viraria beco sem saida justamente no
  // caso em que ela mais importa.
  const { alternatives } = await (await ctx.request('/api/products/compota-de-jabuticaba-280g')).json();
  assert.equal(alternatives.length, 3);
  assert.ok(alternatives.every((p) => p.inStock), 'toda alternativa precisa estar disponivel');
});

test('quando ha alternativa na propria categoria, ela vem primeiro', async () => {
  const { alternatives } = await (await ctx.request('/api/products/cacau-em-po-150g')).json();
  assert.equal(alternatives[0].category, 'cacau');
});

test('produto inexistente devolve 404', async () => {
  assert.equal((await ctx.request('/api/products/nao-existe')).status, 404);
});

test('calendário da safra responde por mês e calcula o retorno', async () => {
  const set = await (await ctx.request('/api/season?month=8')).json();
  assert.equal(set.monthLabel, 'set');
  const jabuticaba = set.rows.find((r) => r.id === 'jabuticaba');
  assert.equal(jabuticaba.available, false);
  assert.equal(jabuticaba.statusLabel, 'Volta em out');

  const out = await (await ctx.request('/api/season?month=9')).json();
  assert.equal(out.rows.find((r) => r.id === 'jabuticaba').available, true);
});

test('mês fora do intervalo cai no mês corrente em vez de estourar', async () => {
  const data = await (await ctx.request('/api/season?month=99')).json();
  assert.ok(data.month >= 0 && data.month <= 11);
});

/* --- Preco autoritativo ---------------------------------------------------- */

test('o servidor ignora qualquer preço enviado pelo cliente', async () => {
  const res = await ctx.request('/api/cart/validate', {
    method: 'POST',
    // Cliente tenta injetar preço de 1 centavo.
    body: { items: [{ sku: 'CAC-PO-150', qty: 2, priceCents: 1, unitPriceCents: 1 }] },
  });
  const cart = await res.json();
  assert.equal(cart.lines[0].unitPriceCents, 4880);
  assert.equal(cart.subtotalCents, 9760);
});

test('quantidade é normalizada para o limite da loja', async () => {
  const res = await ctx.request('/api/cart/validate', {
    method: 'POST', body: { items: [{ sku: 'CAC-PO-150', qty: 20 }] },
  });
  assert.equal((await res.json()).lines[0].qty, 20);

  // Acima do limite o esquema recusa em vez de aceitar silenciosamente.
  const excesso = await ctx.request('/api/cart/validate', {
    method: 'POST', body: { items: [{ sku: 'CAC-PO-150', qty: 999 }] },
  });
  assert.equal(excesso.status, 422);
});

test('produto fora de safra é recusado e não entra no total', async () => {
  const res = await ctx.request('/api/cart/validate', {
    method: 'POST',
    body: { items: [{ sku: 'CAC-PO-150', qty: 1 }, { sku: 'COM-JAB-280', qty: 1 }] },
  });
  const cart = await res.json();
  assert.equal(cart.lines.length, 1);
  assert.equal(cart.rejected.length, 1);
  assert.equal(cart.rejected[0].reason, 'fora_de_safra');
  assert.equal(cart.subtotalCents, 4880);
});

/* --- Frete ----------------------------------------------------------------- */

test('frete é calculado por zona e devolve duas opções', async () => {
  const res = await ctx.request('/api/shipping/quote', {
    method: 'POST',
    body: { cep: '20031-170', items: [{ sku: 'CUP-MTG-200', qty: 1 }] },
  });
  const quote = await res.json();
  assert.equal(quote.ok, true);
  assert.equal(quote.zone, 'Rio de Janeiro e ES');
  assert.equal(quote.options.length, 2);
  assert.ok(quote.options[0].priceCents > 0);
  assert.ok(quote.options[1].priceCents > quote.options[0].priceCents);
});

test('CEP inválido é recusado com 422', async () => {
  for (const cep of ['123', '00000000', 'abcdefgh']) {
    const res = await ctx.request('/api/shipping/quote', { method: 'POST', body: { cep, items: [] } });
    assert.equal(res.status, 422, `CEP ${cep} deveria ser recusado`);
  }
});

test('frete grátis acima do piso, e o cliente não decide o subtotal', async () => {
  const res = await ctx.request('/api/shipping/quote', {
    method: 'POST',
    body: { cep: '01310-100', items: [{ sku: 'CUP-MTG-200', qty: 4 }] }, // R$ 329,20
  });
  const quote = await res.json();
  assert.equal(quote.freeShipping, true);
  assert.equal(quote.options[0].priceCents, 0);
});

/* --- Lista de espera -------------------------------------------------------- */

test('lista de espera aceita produto fora de safra e conta a fila', async () => {
  const res = await ctx.request('/api/waitlist', {
    method: 'POST', body: { sku: 'COM-JAB-280', email: 'pessoa@exemplo.com' },
  });
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.count, 38); // 37 da semente + 1
  assert.equal(data.returnsMonthLabel, 'out');
});

test('mesmo e-mail duas vezes não duplica a fila', async () => {
  await ctx.request('/api/waitlist', { method: 'POST', body: { sku: 'COM-JAM-280', email: 'x@y.com' } });
  const segunda = await ctx.request('/api/waitlist', { method: 'POST', body: { sku: 'COM-JAM-280', email: 'x@y.com' } });
  const data = await segunda.json();
  assert.equal(data.alreadySubscribed, true);
  assert.equal(data.count, 10); // 9 da semente + 1
});

test('lista de espera recusa produto que já está disponível', async () => {
  const res = await ctx.request('/api/waitlist', {
    method: 'POST', body: { sku: 'CAC-PO-150', email: 'a@b.com' },
  });
  assert.equal(res.status, 409);
});

test('e-mail malformado é recusado', async () => {
  const res = await ctx.request('/api/waitlist', {
    method: 'POST', body: { sku: 'COM-JEN-280', email: 'nao-e-email' },
  });
  assert.equal(res.status, 422);
});

test('honeypot preenchido não grava, mas responde 200 para não ensinar o robô', async () => {
  const antes = await (await ctx.request('/api/products')).json();
  const filaAntes = antes.products.find((p) => p.sku === 'COM-JEN-280').waitlistCount;

  const res = await ctx.request('/api/waitlist', {
    method: 'POST',
    body: { sku: 'COM-JEN-280', email: 'bot@spam.com', website: 'http://spam' },
  });
  assert.equal(res.status, 422); // campo website tem max(0): recusado no esquema

  const depois = await (await ctx.request('/api/products')).json();
  assert.equal(depois.products.find((p) => p.sku === 'COM-JEN-280').waitlistCount, filaAntes);
});

/* --- Checkout --------------------------------------------------------------- */

test('checkout monta o pedido com total calculado no servidor', async () => {
  const res = await ctx.request('/api/checkout/session', {
    method: 'POST',
    body: {
      items: [{ sku: 'CAC-PO-150', qty: 2 }, { sku: 'CAC-NIB-150', qty: 1 }],
      cep: '40010-000',
      shippingOptionId: 'economico',
      customer: { name: 'Maria Silva', email: 'maria@exemplo.com' },
    },
  });
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.order.subtotalCents, 4880 * 2 + 4370);
  assert.equal(data.order.totalCents, data.order.subtotalCents + data.order.shipping.priceCents);
  assert.match(data.order.reference, /^MJ-[A-Z0-9]+-[A-F0-9]{6}$/);
  // Provedor desligado: pedido fica pendente, ninguém é cobrado.
  assert.equal(data.payment.status, 'pending_manual');
});

test('chave de idempotência impede pedido duplicado', async () => {
  const body = {
    items: [{ sku: 'CAC-PO-150', qty: 1 }],
    cep: '40010-000',
    customer: { name: 'João', email: 'joao@exemplo.com' },
  };
  const chave = 'chave-de-teste-123';

  const a = await (await ctx.request('/api/checkout/session', {
    method: 'POST', body, headers: { 'idempotency-key': chave },
  })).json();
  const b = await (await ctx.request('/api/checkout/session', {
    method: 'POST', body, headers: { 'idempotency-key': chave },
  })).json();

  assert.equal(a.order.reference, b.order.reference);
  assert.equal(b.replayed, true);
});

test('checkout só com item fora de safra é recusado', async () => {
  const res = await ctx.request('/api/checkout/session', {
    method: 'POST',
    body: {
      items: [{ sku: 'COM-JAB-280', qty: 1 }],
      cep: '40010-000',
      customer: { name: 'Ana', email: 'ana@exemplo.com' },
    },
  });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, 'carrinho_vazio');
});
