/**
 * Rotas da API da loja. Toda rota de escrita passa por CSRF + rate limit +
 * validacao de esquema antes de tocar em qualquer regra de negocio.
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import {
  PRODUCTS, CATEGORIES, SEASON_CALENDAR, RECIPE_OF_WEEK, MONTH_LABELS,
  getProductBySlug, countAvailable,
} from '../data/catalog.js';
import { unitPriceCents } from '../lib/money.js';
import {
  resolveCart, serializeCart, quoteShipping, buildOrder, isValidCep, normalizeCep,
} from '../lib/pricing.js';
import { getPaymentAdapter, rememberIdempotencyKey, recallIdempotencyKey } from '../lib/payments.js';
import {
  validate, requireCsrf, readLimiter, writeLimiter, checkoutLimiter,
} from '../lib/security.js';
import { config, publicConfig } from '../config.js';

export const api = Router();

/* --------------------------------------------------------------------------
   Esquemas de entrada
   -------------------------------------------------------------------------- */

const skuSchema = z.string().trim().min(3).max(24).regex(/^[A-Z0-9-]+$/i, 'SKU inválido');

const cartItemsSchema = z.object({
  items: z.array(
    z.object({
      sku: skuSchema,
      qty: z.number().int().min(1).max(config.order.maxLineQty),
    })
  ).max(config.order.maxLines),
});

const cepSchema = z.string().trim().min(8).max(9)
  .refine(isValidCep, 'CEP inválido');

const shippingSchema = z.object({
  cep: cepSchema,
  items: cartItemsSchema.shape.items.optional().default([]),
  weightGrams: z.number().int().min(0).max(60_000).optional(),
});

const waitlistSchema = z.object({
  sku: skuSchema,
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(180),
  // Honeypot: campo invisivel no formulario. Bot preenche, gente nao.
  website: z.string().max(0).optional().default(''),
});

const checkoutSchema = z.object({
  items: cartItemsSchema.shape.items.min(1),
  cep: cepSchema,
  shippingOptionId: z.enum(['economico', 'expresso']).default('economico'),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email('E-mail inválido').max(180),
  }),
});

/* --------------------------------------------------------------------------
   Serializacao
   -------------------------------------------------------------------------- */

function serializeProduct(p, { full = false } = {}) {
  const base = {
    sku: p.sku,
    slug: p.slug,
    name: p.name,
    category: p.category,
    kicker: p.kicker,
    summary: p.summary,
    priceCents: p.priceCents,
    compareAtCents: p.compareAtCents ?? null,
    unitPricePer100gCents: p.weightGrams ? unitPriceCents(p.priceCents, p.weightGrams) : null,
    weightGrams: p.weightGrams ?? null,
    packLabel: p.packLabel ?? null,
    badge: p.badge ?? null,
    art: p.art,
    inStock: p.inStock,
    returnsMonth: p.returnsMonth ?? null,
    returnsMonthLabel: p.returnsMonth != null ? MONTH_LABELS[p.returnsMonth] : null,
    waitlistCount: waitlistCount(p.sku, p.waitlistSeed ?? 0),
    seasonality: p.seasonality,
  };
  if (!full) return base;
  return {
    ...base,
    description: p.description,
    highlights: p.highlights ?? [],
    lot: p.lot ?? null,
    bundleOf: p.bundleOf ?? null,
  };
}

/* --------------------------------------------------------------------------
   Catalogo (leitura)
   -------------------------------------------------------------------------- */

api.get('/config', readLimiter, (req, res) => {
  res.json(publicConfig());
});

api.get('/products', readLimiter, (req, res) => {
  const category = String(req.query.category ?? 'tudo').toLowerCase();
  const inStockOnly = req.query.inStock === 'true';

  let list = PRODUCTS;
  if (category !== 'tudo' && CATEGORIES.some((c) => c.id === category)) {
    list = list.filter((p) => p.category === category);
  }
  if (inStockOnly) list = list.filter((p) => p.inStock);

  res.json({
    products: list.map((p) => serializeProduct(p)),
    total: list.length,
    available: list.filter((p) => p.inStock).length,
    catalogTotal: PRODUCTS.length,
    catalogAvailable: countAvailable(),
  });
});

api.get('/products/:slug', readLimiter, (req, res) => {
  const product = getProductBySlug(req.params.slug);
  if (!product) {
    return res.status(404).json({ error: 'nao_encontrado', message: 'Produto não encontrado.' });
  }

  // Sugere alternativa quando o produto esta fora de safra — o item 3 da
  // proposta: esgotado nunca vira beco sem saida.
  //
  // Preferir a mesma categoria, mas NAO parar nela: categorias inteiras saem
  // de safra juntas (as tres compotas somem no mesmo mes), e e justamente ai
  // que a pessoa mais precisa de uma saida. Quando a categoria nao tem nada
  // disponivel, completa com o resto do catalogo.
  const disponiveis = PRODUCTS.filter((p) => p.inStock && p.sku !== product.sku);
  const mesmaCategoria = disponiveis.filter((p) => p.category === product.category);
  const alternatives = [
    ...mesmaCategoria,
    ...disponiveis.filter((p) => p.category !== product.category),
  ].slice(0, 3).map((p) => serializeProduct(p));

  res.json({ product: serializeProduct(product, { full: true }), alternatives });
});

api.get('/categories', readLimiter, (req, res) => {
  res.json({
    categories: CATEGORIES.map((c) => ({
      ...c,
      count: PRODUCTS.filter((p) => p.category === c.id).length,
      available: PRODUCTS.filter((p) => p.category === c.id && p.inStock).length,
    })),
    total: PRODUCTS.length,
    available: countAvailable(),
  });
});

api.get('/season', readLimiter, (req, res) => {
  const requested = Number.parseInt(req.query.month ?? '', 10);
  const month = Number.isInteger(requested) && requested >= 0 && requested <= 11
    ? requested
    : new Date().getMonth();

  const rows = SEASON_CALENDAR.map((row) => {
    const available = row.months[month] === 1;
    let nextMonth = null;
    if (!available) {
      for (let step = 1; step <= 12; step += 1) {
        const idx = (month + step) % 12;
        if (row.months[idx] === 1) { nextMonth = idx; break; }
      }
    }
    return {
      id: row.id,
      name: row.name,
      months: row.months,
      peak: row.peak,
      available,
      state: available ? (row.months.every((m) => m === 1) ? 'always' : 'available') : 'returning',
      statusLabel: available
        ? (row.months.every((m) => m === 1) ? 'O ano todo' : 'Disponível')
        : `Volta em ${nextMonth != null ? MONTH_LABELS[nextMonth] : '—'}`,
      nextMonth,
      skus: row.skus,
    };
  });

  const featured = PRODUCTS.find((p) => p.featuredMonth === month && p.inStock)
    ?? PRODUCTS.find((p) => p.inStock);

  res.json({
    month,
    monthLabel: MONTH_LABELS[month],
    monthLabels: MONTH_LABELS,
    rows,
    featured: serializeProduct(featured, { full: true }),
    available: countAvailable(),
    total: PRODUCTS.length,
  });
});

api.get('/recipe', readLimiter, (req, res) => {
  res.json({
    ...RECIPE_OF_WEEK,
    ingredients: RECIPE_OF_WEEK.ingredients.map((ing) => {
      const p = PRODUCTS.find((x) => x.sku === ing.sku);
      return { ...ing, product: p ? serializeProduct(p) : null };
    }),
  });
});

/* --------------------------------------------------------------------------
   Carrinho — revalidacao no servidor
   -------------------------------------------------------------------------- */

api.post('/cart/validate', writeLimiter, requireCsrf, validate(cartItemsSchema), (req, res) => {
  const cart = resolveCart(req.body.items);
  res.json(serializeCart(cart));
});

/* --------------------------------------------------------------------------
   Frete — calculado antes do checkout (item 4 da proposta)
   -------------------------------------------------------------------------- */

api.post('/shipping/quote', writeLimiter, requireCsrf, validate(shippingSchema), (req, res) => {
  const { cep, items, weightGrams } = req.body;

  // Se vier carrinho, o peso e o subtotal saem dele; o cliente nao decide
  // o peso faturavel nem o subtotal que libera frete gratis.
  const cart = items.length ? resolveCart(items) : null;
  const quote = quoteShipping({
    cep,
    weightGrams: cart ? cart.weightGrams : Math.max(weightGrams ?? 0, 100) + 120,
    subtotalCents: cart ? cart.subtotalCents : 0,
  });

  if (!quote.ok) return res.status(422).json(quote);
  res.json(quote);
});

/* --------------------------------------------------------------------------
   Lista de espera — o "Avise-me quando chegar" (item 3 da proposta)
   -------------------------------------------------------------------------- */

/**
 * Em memoria por enquanto. Guarda o hash do e-mail, nao o e-mail: a contagem
 * publica ("37 pessoas na fila") nao precisa do endereco, e uma leitura
 * indevida desta estrutura nao entrega uma lista de e-mails.
 * Ao ligar o banco, trocar por tabela com o e-mail cifrado em repouso.
 */
const waitlists = new Map(); // sku -> Set<hash>

function emailHash(email) {
  return crypto.createHmac('sha256', config.sessionSecret).update(email).digest('base64url');
}

function waitlistCount(sku, seed = 0) {
  return seed + (waitlists.get(sku)?.size ?? 0);
}

api.post('/waitlist', writeLimiter, requireCsrf, validate(waitlistSchema), (req, res) => {
  const { sku, email, website } = req.body;

  // Honeypot preenchido: responde 200 para nao ensinar o bot, mas nao grava.
  if (website) {
    return res.json({ ok: true, alreadySubscribed: false, count: 0 });
  }

  const product = PRODUCTS.find((p) => p.sku === sku.toUpperCase());
  if (!product) {
    return res.status(404).json({ error: 'nao_encontrado', message: 'Produto não encontrado.' });
  }
  if (product.inStock) {
    return res.status(409).json({
      error: 'ja_disponivel',
      message: `${product.name} já está disponível — pode adicionar à sacola.`,
    });
  }

  const set = waitlists.get(product.sku) ?? new Set();
  const hash = emailHash(email);
  const alreadySubscribed = set.has(hash);
  set.add(hash);
  waitlists.set(product.sku, set);

  res.json({
    ok: true,
    alreadySubscribed,
    count: waitlistCount(product.sku, product.waitlistSeed ?? 0),
    returnsMonthLabel: product.returnsMonth != null ? MONTH_LABELS[product.returnsMonth] : null,
    message: alreadySubscribed
      ? 'Você já estava na fila deste produto.'
      : 'Pronto. Avisamos assim que a próxima leva sair.',
  });
});

/* --------------------------------------------------------------------------
   Checkout — pedido montado no servidor, pronto para o gateway
   -------------------------------------------------------------------------- */

api.post('/checkout/session', checkoutLimiter, requireCsrf, validate(checkoutSchema), async (req, res, next) => {
  try {
    const { items, cep, shippingOptionId, customer } = req.body;

    // Idempotencia: duplo clique ou retry de rede nao gera segundo pedido.
    const idempotencyKey = req.get('idempotency-key');
    if (idempotencyKey) {
      const cached = recallIdempotencyKey(idempotencyKey);
      if (cached) return res.json({ ...cached, replayed: true });
    }

    const result = buildOrder({ items, cep, shippingOptionId });
    if (!result.ok) return res.status(422).json(result);

    const adapter = getPaymentAdapter();
    const session = await adapter.createSession(result.order, { customer });

    const payload = {
      ok: true,
      order: result.order,
      rejected: result.rejected,
      payment: session,
    };

    if (idempotencyKey) rememberIdempotencyKey(idempotencyKey, payload);
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

/**
 * Webhook do gateway. Recebe corpo cru (montado em index.js) porque a
 * assinatura cobre os bytes exatos — reserializar JSON quebra a verificacao.
 */
api.post('/payments/webhook', (req, res) => {
  const adapter = getPaymentAdapter();
  const verification = adapter.verifyWebhook({
    headers: req.headers,
    rawBody: req.rawBody ?? '',
  });

  if (!verification.ok) {
    // Nao detalha o motivo: a resposta nao deve ajudar quem esta sondando.
    return res.status(400).json({ error: 'webhook_rejeitado' });
  }

  // Aqui entra a atualizacao de estado do pedido quando o provedor for ligado.
  res.json({ ok: true });
});
