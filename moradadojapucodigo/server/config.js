/**
 * Configuracao central. Tudo que e segredo entra por variavel de ambiente e
 * NUNCA e enviado ao navegador. O modulo falha na inicializacao se um segredo
 * obrigatorio estiver faltando em producao — e melhor nao subir do que subir
 * com uma chave de sessao previsivel.
 */
import crypto from 'node:crypto';

const env = process.env;
export const NODE_ENV = env.NODE_ENV || 'development';
export const IS_PROD = NODE_ENV === 'production';

/** Le um segredo obrigatorio em producao; em dev gera um efemero. */
function secret(name, { bytes = 32 } = {}) {
  const value = env[name];
  if (value && value.length >= 32) return value;

  if (IS_PROD) {
    throw new Error(
      `[config] ${name} ausente ou curto demais. Gere um com:\n` +
      `  node -e "console.log(require('crypto').randomBytes(${bytes}).toString('base64url'))"\n` +
      `e defina no ambiente antes de subir em producao.`
    );
  }
  // Em desenvolvimento um valor efemero por processo basta e evita que
  // alguem comite uma chave "de teste" que acabe em producao.
  return crypto.randomBytes(bytes).toString('base64url');
}

function int(name, fallback) {
  const n = Number.parseInt(env[name] ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: int('PORT', 3000),
  host: env.HOST || '0.0.0.0',

  /** Origem publica do site — usada em CORS, cookies e links de retorno. */
  publicOrigin: env.PUBLIC_ORIGIN || `http://localhost:${int('PORT', 3000)}`,

  /** Assina o cookie de sessao/carrinho e o token anti-CSRF. */
  sessionSecret: secret('SESSION_SECRET'),

  /** Confia no X-Forwarded-* apenas quando ha proxy reverso declarado. */
  trustProxy: env.TRUST_PROXY === 'true',

  rateLimit: {
    apiWindowMs: int('RATE_LIMIT_WINDOW_MS', 60_000),
    apiMax: int('RATE_LIMIT_MAX', 120),
    writeMax: int('RATE_LIMIT_WRITE_MAX', 20),
    checkoutMax: int('RATE_LIMIT_CHECKOUT_MAX', 8),
  },

  /**
   * Pagamento. Ainda desligado: o adaptador existe e valida, mas so entra em
   * modo real quando PAYMENT_PROVIDER e as chaves forem definidos.
   * A chave privada e o segredo de webhook ficam SO no servidor.
   */
  payments: {
    provider: env.PAYMENT_PROVIDER || 'none', // none | mercadopago | stripe | pagarme
    publicKey: env.PAYMENT_PUBLIC_KEY || '',  // unico valor que pode ir ao cliente
    secretKey: env.PAYMENT_SECRET_KEY || '',
    webhookSecret: env.PAYMENT_WEBHOOK_SECRET || '',
    currency: 'BRL',
  },

  shipping: {
    originCep: env.SHIPPING_ORIGIN_CEP || '45650000', // Ilheus - BA
    freeAboveCents: int('SHIPPING_FREE_ABOVE_CENTS', 25000),
  },

  /** Limites de sanidade do pedido — barram carrinho absurdo antes do gateway. */
  order: {
    maxLineQty: int('ORDER_MAX_LINE_QTY', 20),
    maxLines: int('ORDER_MAX_LINES', 30),
    maxTotalCents: int('ORDER_MAX_TOTAL_CENTS', 500_000),
  },
};

/**
 * Recorte da configuracao que pode ser exposto ao navegador. Manter esta
 * funcao como unico caminho de saida evita o vazamento acidental de um
 * segredo dentro de um objeto de config despejado num template.
 */
export function publicConfig() {
  return {
    currency: config.payments.currency,
    paymentProvider: config.payments.provider,
    paymentPublicKey: config.payments.publicKey, // chave publicavel por design
    paymentEnabled: config.payments.provider !== 'none',
    freeShippingAboveCents: config.shipping.freeAboveCents,
    maxLineQty: config.order.maxLineQty,
  };
}
