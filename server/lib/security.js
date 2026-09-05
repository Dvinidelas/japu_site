/**
 * Camada de seguranca.
 *
 * O objetivo declarado do projeto e receber pagamento direto no site mais a
 * frente. Isso muda o nivel de exigencia: a partir do momento em que existe
 * um formulario de cartao (ou um redirect para o gateway) na pagina, qualquer
 * script injetado nela e capaz de ler dados de pagamento. Por isso a defesa
 * principal aqui e uma CSP restritiva com nonce por requisicao — sem
 * 'unsafe-inline', que e o que anula a CSP na pratica.
 *
 * O que esta implementado:
 *   - CSP com nonce por requisicao, sem unsafe-inline/unsafe-eval
 *   - HSTS, no-sniff, anti-clickjacking, Referrer-Policy, Permissions-Policy
 *   - CSRF por double-submit cookie com comparacao em tempo constante
 *   - Rate limiting graduado (leitura < escrita < checkout)
 *   - Validacao de entrada com esquemas explicitos (zod) e corpo limitado
 *   - Cookies HttpOnly + SameSite=Lax + Secure em producao
 */
import crypto from 'node:crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config, IS_PROD } from '../config.js';

const CSRF_COOKIE = 'japu_csrf';
const CSRF_HEADER = 'x-csrf-token';

/** Gera um nonce por requisicao e o deixa em res.locals para os templates. */
export function cspNonce(req, res, next) {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
}

/**
 * Cabecalhos de seguranca.
 *
 * connect-src e form-action ficam restritos a propria origem; quando um
 * gateway for plugado, o host dele entra aqui de forma explicita e em nenhum
 * outro lugar — a lista abaixo e o unico ponto a mudar.
 */
export function securityHeaders() {
  const self = ["'self'"];

  // Hosts do gateway de pagamento, liberados so quando o provedor esta ativo.
  const gatewayHosts = {
    none: { script: [], connect: [], frame: [], form: [] },
    mercadopago: {
      script: ['https://sdk.mercadopago.com'],
      connect: ['https://api.mercadopago.com', 'https://api.mercadolibre.com'],
      frame: ['https://www.mercadopago.com.br'],
      form: ['https://www.mercadopago.com.br'],
    },
    stripe: {
      script: ['https://js.stripe.com'],
      connect: ['https://api.stripe.com'],
      frame: ['https://js.stripe.com', 'https://hooks.stripe.com'],
      form: [],
    },
    pagarme: {
      script: ['https://checkout.pagar.me'],
      connect: ['https://api.pagar.me'],
      frame: ['https://checkout.pagar.me'],
      form: [],
    },
  }[config.payments.provider] ?? { script: [], connect: [], frame: [], form: [] };

  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': self,
        'base-uri': ["'none'"],
        'object-src': ["'none'"],
        // Nonce por requisicao: nenhum script inline sem o nonce roda, o que
        // neutraliza a maior parte do XSS refletido/armazenado.
        'script-src': [...self, (req, res) => `'nonce-${res.locals.nonce}'`, ...gatewayHosts.script],
        'script-src-attr': ["'none'"],   // barra onclick="..." no HTML
        'style-src': [...self, 'https://fonts.googleapis.com'],
        'font-src': [...self, 'https://fonts.gstatic.com', 'data:'],
        'img-src': [...self, 'data:', 'blob:'],
        'connect-src': [...self, ...gatewayHosts.connect],
        'frame-src': gatewayHosts.frame.length ? gatewayHosts.frame : ["'none'"],
        // Impede que o site seja embutido em iframe alheio (clickjacking
        // sobre o botao de pagar).
        'frame-ancestors': ["'none'"],
        // Nenhum formulario pode postar para fora, exceto o gateway.
        'form-action': [...self, ...gatewayHosts.form],
        'upgrade-insecure-requests': IS_PROD ? [] : null,
      },
    },
    // HSTS so faz sentido sob HTTPS; em dev local ficaria preso no navegador.
    strictTransportSecurity: IS_PROD
      ? { maxAge: 63_072_000, includeSubDomains: true, preload: true }
      : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    xFrameOptions: { action: 'deny' },
    xContentTypeOptions: true,
    xPoweredBy: false,
    // Evita que o navegador exponha timing entre origens.
    originAgentCluster: true,
  });
}

/** Desliga APIs de navegador que a loja nao usa. */
export function permissionsPolicy(req, res, next) {
  res.setHeader(
    'Permissions-Policy',
    [
      'accelerometer=()', 'camera=()', 'geolocation=()', 'gyroscope=()',
      'magnetometer=()', 'microphone=()', 'usb=()', 'interest-cohort=()',
      // payment=(self) fica pronto para a Payment Request API do gateway.
      'payment=(self)',
    ].join(', ')
  );
  next();
}

/* --------------------------------------------------------------------------
   CSRF — double submit cookie
   -------------------------------------------------------------------------- */

const cookieBase = {
  sameSite: 'lax',
  secure: IS_PROD,
  path: '/',
};

/**
 * Emite o token anti-CSRF. O cookie e legivel pelo JS de propria origem
 * (precisa ser, para o cliente reenviar no cabecalho), mas isso e seguro no
 * modelo double-submit: um site terceiro consegue disparar a requisicao, mas
 * nao consegue LER o cookie para preencher o cabecalho.
 */
export function issueCsrfToken(req, res, next) {
  let token = req.cookies?.[CSRF_COOKIE];
  if (!token || !/^[A-Za-z0-9_-]{32,}$/.test(token)) {
    token = crypto.randomBytes(32).toString('base64url');
    res.cookie(CSRF_COOKIE, token, { ...cookieBase, httpOnly: false });
  }
  res.locals.csrfToken = token;
  next();
}

/** Comparacao em tempo constante — evita descobrir o token por timing. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Exige o token nas requisicoes que mudam estado. */
export function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const sentToken = req.get(CSRF_HEADER) || req.body?._csrf;

  if (!cookieToken || !safeEqual(cookieToken, sentToken)) {
    return res.status(403).json({
      error: 'csrf_invalido',
      message: 'Token de verificação ausente ou inválido. Recarregue a página.',
    });
  }

  // Defesa em profundidade: alem do token, confere a origem declarada.
  const origin = req.get('origin');
  if (origin && origin !== config.publicOrigin && IS_PROD) {
    return res.status(403).json({ error: 'origem_invalida', message: 'Origem não permitida.' });
  }
  next();
}

/* --------------------------------------------------------------------------
   Rate limiting
   -------------------------------------------------------------------------- */

const limiterBase = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'muitas_requisicoes', message: 'Muitas requisições. Tente de novo em instantes.' },
};

/** Leitura de catalogo: generoso, so barra varredura automatizada. */
export const readLimiter = rateLimit({
  ...limiterBase,
  windowMs: config.rateLimit.apiWindowMs,
  max: config.rateLimit.apiMax,
});

/** Escrita (lista de espera, frete): mais apertado, e onde entra spam. */
export const writeLimiter = rateLimit({
  ...limiterBase,
  windowMs: config.rateLimit.apiWindowMs,
  max: config.rateLimit.writeMax,
});

/** Checkout: o mais apertado — cada tentativa vira custo no gateway. */
export const checkoutLimiter = rateLimit({
  ...limiterBase,
  windowMs: config.rateLimit.apiWindowMs,
  max: config.rateLimit.checkoutMax,
});

/* --------------------------------------------------------------------------
   Validacao de entrada
   -------------------------------------------------------------------------- */

/**
 * Valida o corpo contra um esquema zod e devolve 422 com os campos que
 * falharam. Nenhuma rota le req.body cru.
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return res.status(422).json({
        error: 'entrada_invalida',
        message: 'Alguns campos não passaram na verificação.',
        fields: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    // Substitui pelo objeto ja validado e sem chaves extras.
    req[source] = result.data;
    next();
  };
}

/** Escapa texto que sera devolvido dentro de HTML. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"'`=/]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
    "'": '&#39;', '`': '&#96;', '=': '&#61;', '/': '&#47;',
  })[ch]);
}

export const CSRF_COOKIE_NAME = CSRF_COOKIE;
export const CSRF_HEADER_NAME = CSRF_HEADER;
