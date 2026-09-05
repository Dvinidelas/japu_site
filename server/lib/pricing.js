/**
 * Motor de preco, frete e montagem de pedido.
 *
 * Regra central: o navegador manda apenas `sku` e `qty`. Preco, subtotal,
 * desconto, frete e total sao SEMPRE recalculados aqui a partir do catalogo.
 * Quando o pagamento direto entrar, e este total — e nao o que a pagina
 * mostrou — que vai para o gateway.
 */
import crypto from 'node:crypto';
import { config } from '../config.js';
import { getProductBySku } from '../data/catalog.js';
import { unitPriceCents } from './money.js';

/** Peso da embalagem (caixa + proteção) somado a todo pedido. */
const PACKAGING_GRAMS = 120;

/**
 * Zonas de frete a partir de Ilheus - BA, pelo primeiro digito do CEP.
 * Valores de tabela propria; quando integrar Correios/transportadora, esta
 * funcao passa a consultar a API e o resto do fluxo nao muda.
 */
const SHIPPING_ZONES = {
  '4': { name: 'Bahia e Sergipe',       baseCents: 1490, perKgCents:  800, days: 3 },
  '2': { name: 'Rio de Janeiro e ES',   baseCents: 1990, perKgCents: 1000, days: 5 },
  '3': { name: 'Minas Gerais',          baseCents: 1990, perKgCents: 1000, days: 5 },
  '5': { name: 'Nordeste',              baseCents: 1990, perKgCents: 1000, days: 5 },
  '0': { name: 'São Paulo',             baseCents: 2390, perKgCents: 1300, days: 7 },
  '1': { name: 'Interior de São Paulo', baseCents: 2390, perKgCents: 1300, days: 7 },
  '6': { name: 'Norte',                 baseCents: 2390, perKgCents: 1300, days: 7 },
  '7': { name: 'Centro-Oeste',          baseCents: 2790, perKgCents: 1600, days: 9 },
  '8': { name: 'Paraná e Santa Catarina', baseCents: 2790, perKgCents: 1600, days: 9 },
  '9': { name: 'Rio Grande do Sul',     baseCents: 2790, perKgCents: 1600, days: 9 },
};

export function normalizeCep(raw) {
  return String(raw ?? '').replace(/\D/g, '');
}

export function isValidCep(cep) {
  const digits = normalizeCep(cep);
  // 8 digitos e nao pode ser tudo o mesmo numero (00000000, 11111111...).
  return /^\d{8}$/.test(digits) && !/^(\d)\1{7}$/.test(digits);
}

/**
 * Peso faturavel do carrinho. Kits somam o peso dos itens que embalam.
 */
export function cartWeightGrams(lines) {
  const items = lines.reduce((total, line) => {
    const p = line.product;
    let grams = p.weightGrams ?? 0;
    if (!grams && Array.isArray(p.bundleOf)) {
      grams = p.bundleOf.reduce((sum, sku) => sum + (getProductBySku(sku)?.weightGrams ?? 0), 0);
    }
    return total + grams * line.qty;
  }, 0);
  return items + PACKAGING_GRAMS;
}

/**
 * Cotacao de frete. Devolve duas opcoes (economico e expresso) e marca
 * frete gratis acima do piso configurado — a informacao que o item 4 da
 * proposta pede que apareca ANTES do checkout, nao na ultima tela.
 */
export function quoteShipping({ cep, weightGrams, subtotalCents = 0 }) {
  const digits = normalizeCep(cep);
  if (!isValidCep(digits)) {
    return { ok: false, error: 'cep_invalido', message: 'CEP inválido. Use 8 dígitos.' };
  }

  const zone = SHIPPING_ZONES[digits[0]];
  if (!zone) {
    return { ok: false, error: 'cep_nao_atendido', message: 'Ainda não entregamos nesse CEP.' };
  }

  const kg = Math.max(weightGrams, 100) / 1000;
  const economyCents = Math.round(zone.baseCents + zone.perKgCents * kg);
  const expressCents = Math.round(economyCents * 1.75);

  const freeShipping = subtotalCents >= config.shipping.freeAboveCents;

  return {
    ok: true,
    cep: `${digits.slice(0, 5)}-${digits.slice(5)}`,
    zone: zone.name,
    weightGrams,
    freeShipping,
    freeShippingAboveCents: config.shipping.freeAboveCents,
    options: [
      {
        id: 'economico',
        label: 'Envio econômico',
        priceCents: freeShipping ? 0 : economyCents,
        originalPriceCents: economyCents,
        businessDays: zone.days,
      },
      {
        id: 'expresso',
        label: 'Envio expresso',
        priceCents: expressCents,
        originalPriceCents: expressCents,
        businessDays: Math.max(1, Math.ceil(zone.days / 2)),
      },
    ],
  };
}

/* --------------------------------------------------------------------------
   Carrinho
   -------------------------------------------------------------------------- */

/**
 * Resolve as linhas informadas pelo cliente contra o catalogo.
 *
 * Devolve tambem `rejected`: itens que o cliente tinha na sacola mas que nao
 * podem ser vendidos (sku inexistente, produto fora de safra). Eles nao entram
 * no total, e a interface avisa em vez de falhar no pagamento.
 */
export function resolveCart(rawItems = []) {
  const lines = [];
  const rejected = [];
  const seen = new Set();

  for (const item of rawItems.slice(0, config.order.maxLines)) {
    const sku = String(item?.sku ?? '').toUpperCase();
    const product = getProductBySku(sku);

    if (!product) {
      rejected.push({ sku, reason: 'inexistente', message: 'Produto não encontrado.' });
      continue;
    }
    if (seen.has(sku)) continue; // linha duplicada: mantem a primeira
    seen.add(sku);

    if (!product.inStock) {
      rejected.push({
        sku,
        name: product.name,
        reason: 'fora_de_safra',
        message: `${product.name} está fora de safra. Entre na lista de espera.`,
      });
      continue;
    }

    // Quantidade sempre normalizada para inteiro dentro do limite.
    const qty = Math.min(
      Math.max(Math.trunc(Number(item?.qty) || 0), 1),
      config.order.maxLineQty
    );

    const lineTotalCents = product.priceCents * qty;
    lines.push({
      sku: product.sku,
      slug: product.slug,
      name: product.name,
      art: product.art,
      qty,
      unitPriceCents: product.priceCents,
      compareAtCents: product.compareAtCents ?? null,
      lineTotalCents,
      product,
    });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const savingsCents = lines.reduce(
    (sum, l) => sum + (l.compareAtCents ? (l.compareAtCents - l.unitPriceCents) * l.qty : 0),
    0
  );

  return {
    lines,
    rejected,
    itemCount: lines.reduce((sum, l) => sum + l.qty, 0),
    subtotalCents,
    savingsCents,
    weightGrams: cartWeightGrams(lines),
  };
}

/** Remove o campo `product` antes de responder — nao vaza dado interno. */
export function serializeCart(cart) {
  return {
    ...cart,
    lines: cart.lines.map(({ product, ...line }) => ({
      ...line,
      unitPricePer100gCents: product.weightGrams
        ? unitPriceCents(product.priceCents, product.weightGrams)
        : null,
    })),
  };
}

/* --------------------------------------------------------------------------
   Pedido
   -------------------------------------------------------------------------- */

/**
 * Monta o pedido definitivo: recalcula tudo e devolve os valores que serao
 * cobrados. Falha em vez de "consertar" silenciosamente quando o carrinho
 * estoura os limites de sanidade.
 */
export function buildOrder({ items, cep, shippingOptionId = 'economico' }) {
  const cart = resolveCart(items);

  if (cart.lines.length === 0) {
    return { ok: false, error: 'carrinho_vazio', message: 'Não há itens disponíveis na sacola.', cart };
  }

  const shipping = quoteShipping({
    cep,
    weightGrams: cart.weightGrams,
    subtotalCents: cart.subtotalCents,
  });
  if (!shipping.ok) return { ok: false, ...shipping, cart };

  const option = shipping.options.find((o) => o.id === shippingOptionId);
  if (!option) {
    return { ok: false, error: 'frete_invalido', message: 'Opção de envio inválida.', cart };
  }

  const totalCents = cart.subtotalCents + option.priceCents;

  if (totalCents > config.order.maxTotalCents) {
    return {
      ok: false,
      error: 'pedido_acima_do_limite',
      message: 'Pedido acima do limite da loja online. Fale com a gente pelo WhatsApp.',
      cart,
    };
  }

  return {
    ok: true,
    order: {
      // Referencia legivel para o cliente e para a conciliacao.
      reference: `MJ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      currency: config.payments.currency,
      lines: cart.lines.map(({ product, ...l }) => l),
      itemCount: cart.itemCount,
      subtotalCents: cart.subtotalCents,
      savingsCents: cart.savingsCents,
      shipping: {
        cep: shipping.cep,
        zone: shipping.zone,
        optionId: option.id,
        label: option.label,
        priceCents: option.priceCents,
        businessDays: option.businessDays,
        free: option.priceCents === 0,
      },
      weightGrams: cart.weightGrams,
      totalCents,
    },
    rejected: cart.rejected,
  };
}
