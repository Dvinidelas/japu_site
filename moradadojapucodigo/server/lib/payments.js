/**
 * Adaptador de pagamento.
 *
 * Ainda NAO cobra ninguem. O provedor padrao e `none`, que devolve um pedido
 * pendente e manda finalizar por WhatsApp — o comportamento de hoje. A
 * estrutura ja esta montada para que ligar Mercado Pago, Stripe ou Pagar.me
 * seja preencher as variaveis de ambiente e implementar `createSession` do
 * adaptador correspondente, sem tocar em rota, carrinho ou interface.
 *
 * Regras que valem para qualquer provedor que entre aqui:
 *
 *  1. Dado de cartao NUNCA passa por este servidor. O fluxo e sempre
 *     tokenizacao no cliente (SDK do gateway) ou checkout hospedado. Isso
 *     mantem o site no escopo SAQ-A / SAQ-A-EP do PCI DSS em vez do SAQ-D,
 *     que exigiria auditoria anual.
 *  2. O valor cobrado vem de buildOrder(), no servidor. O cliente nao informa
 *     preco em momento algum.
 *  3. Todo webhook e verificado por assinatura antes de mudar o estado do
 *     pedido. Webhook sem assinatura valida e descartado.
 *  4. Chave secreta e segredo de webhook so existem em process.env.
 */
import crypto from 'node:crypto';
import { config } from '../config.js';

/** Provedor desligado — registra a intencao e devolve instrucao manual. */
const noneAdapter = {
  id: 'none',
  async createSession(order) {
    return {
      status: 'pending_manual',
      reference: order.reference,
      totalCents: order.totalCents,
      message:
        'Pedido registrado. O pagamento direto no site ainda não está ativo — ' +
        'finalize pelo WhatsApp com o código do pedido.',
      // Sem redirect: a interface mostra o codigo e o botao de WhatsApp.
      redirectUrl: null,
    };
  },
  verifyWebhook() {
    return { ok: false, error: 'provedor_desativado' };
  },
};

/**
 * Esqueleto do Mercado Pago (o mais usado no Brasil para este porte de loja).
 * Deixa explicito onde cada segredo entra quando o provedor for ativado.
 */
const mercadoPagoAdapter = {
  id: 'mercadopago',
  async createSession(order) {
    if (!config.payments.secretKey) {
      throw new Error('[payments] PAYMENT_SECRET_KEY ausente para mercadopago.');
    }
    // Implementacao real: POST /checkout/preferences com os itens vindos de
    // `order` (valores do servidor), notification_url apontando para
    // /api/payments/webhook e external_reference = order.reference.
    throw new Error('[payments] Adaptador mercadopago ainda não implementado.');
  },

  /**
   * Verificacao de assinatura do webhook, em tempo constante.
   * O Mercado Pago assina como `ts=<epoch>,v1=<hmac>`; o HMAC cobre
   * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
   */
  verifyWebhook({ headers, rawBody }) {
    const signature = headers['x-signature'];
    const requestId = headers['x-request-id'];
    if (!signature || !config.payments.webhookSecret) {
      return { ok: false, error: 'assinatura_ausente' };
    }

    const parts = Object.fromEntries(
      String(signature).split(',').map((p) => p.split('=').map((s) => s.trim()))
    );
    if (!parts.ts || !parts.v1) return { ok: false, error: 'assinatura_malformada' };

    // Rejeita replay: assinatura com mais de 5 minutos nao vale mais.
    const ageMs = Date.now() - Number(parts.ts) * 1000;
    if (!Number.isFinite(ageMs) || Math.abs(ageMs) > 5 * 60_000) {
      return { ok: false, error: 'assinatura_expirada' };
    }

    let dataId = '';
    try { dataId = JSON.parse(rawBody)?.data?.id ?? ''; } catch { /* corpo invalido */ }

    const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
    const expected = crypto
      .createHmac('sha256', config.payments.webhookSecret)
      .update(manifest)
      .digest('hex');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(String(parts.v1), 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, error: 'assinatura_invalida' };
    }
    return { ok: true, eventId: dataId };
  },
};

const adapters = {
  none: noneAdapter,
  mercadopago: mercadoPagoAdapter,
};

export function getPaymentAdapter() {
  const adapter = adapters[config.payments.provider];
  if (!adapter) {
    throw new Error(`[payments] Provedor desconhecido: ${config.payments.provider}`);
  }
  return adapter;
}

/**
 * Chaves de idempotencia ja vistas. Impede que um duplo clique — ou um retry
 * de rede — vire duas cobrancas. Em producao isso migra para Redis/banco;
 * em memoria basta para um processo unico.
 */
const seenKeys = new Map();
const IDEMPOTENCY_TTL_MS = 15 * 60_000;

export function rememberIdempotencyKey(key, value) {
  seenKeys.set(key, { value, at: Date.now() });
  // Limpeza preguicosa, evita crescer sem limite.
  if (seenKeys.size > 500) {
    const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
    for (const [k, v] of seenKeys) if (v.at < cutoff) seenKeys.delete(k);
  }
}

export function recallIdempotencyKey(key) {
  const hit = seenKeys.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > IDEMPOTENCY_TTL_MS) { seenKeys.delete(key); return null; }
  return hit.value;
}
