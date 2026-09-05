/**
 * Servidor da Morada do Japu.
 *
 * Serve o frontend estatico e a API da loja. As paginas HTML passam por uma
 * injecao de nonce: cada `<script>`/`<style>` inline recebe o nonce da
 * requisicao, o que permite manter a CSP sem 'unsafe-inline'.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';

import { config, IS_PROD, NODE_ENV } from './config.js';
import {
  cspNonce, securityHeaders, permissionsPolicy, issueCsrfToken, readLimiter,
} from './lib/security.js';
import { api } from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

export function createApp() {
  const app = express();

  // Sem isso o rate limit conta o IP do proxy, e um visitante consegue
  // esgotar o limite de todo mundo.
  app.set('trust proxy', config.trustProxy ? 1 : false);
  app.disable('x-powered-by');
  app.set('etag', 'strong');

  /* --- Ordem importa: cabecalhos e nonce antes de qualquer resposta ------ */
  app.use(cspNonce);
  app.use(securityHeaders());
  app.use(permissionsPolicy);

  /* --- Corpo da requisicao ---------------------------------------------- */
  // Limite baixo de propósito: nenhum endpoint legitimo desta loja precisa de
  // mais que isso, e corpo grande e vetor barato de negacao de servico.
  app.use(express.json({
    limit: '32kb',
    // Guarda os bytes crus so para o webhook, onde a assinatura cobre o corpo.
    verify: (req, res, buf) => {
      if (req.originalUrl === '/api/payments/webhook') req.rawBody = buf.toString('utf8');
    },
  }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  app.use(cookieParser(config.sessionSecret));
  app.use(issueCsrfToken);

  /* --- API --------------------------------------------------------------- */
  app.use('/api', api);

  /* --- Paginas HTML com nonce ------------------------------------------- */
  const pages = {
    '/':          'index.html',
    '/loja':      'loja.html',
    '/safra':     'safra.html',
    '/produto':   'produto.html',
    '/sacola':    'sacola.html',
    '/proposta':  'proposta.html',
  };

  for (const [route, file] of Object.entries(pages)) {
    app.get(route, readLimiter, (req, res, next) => {
      sendHtml(res, path.join(PUBLIC_DIR, file), next);
    });
  }

  // URL de produto no formato /produto/<slug>, legivel e indexavel.
  app.get('/produto/:slug', readLimiter, (req, res, next) => {
    sendHtml(res, path.join(PUBLIC_DIR, 'produto.html'), next);
  });

  /* --- Estaticos --------------------------------------------------------- */
  app.use(express.static(PUBLIC_DIR, {
    // Em dev nada e cacheado, para o recarregamento refletir a edicao na hora.
    maxAge: IS_PROD ? '7d' : 0,
    etag: true,
    index: false,
    // Nao serve .html direto: as paginas devem passar pela injecao de nonce.
    extensions: [],
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
    },
  }));

  /* --- 404 --------------------------------------------------------------- */
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'nao_encontrado', message: 'Rota inexistente.' });
    }
    res.status(404);
    sendHtml(res, path.join(PUBLIC_DIR, '404.html'), () => {
      res.type('text/plain').send('404 — página não encontrada');
    });
  });

  /* --- Erros ------------------------------------------------------------- */
  app.use((err, req, res, _next) => {
    // Log completo no servidor; resposta enxuta para fora. Detalhe de stack
    // em resposta HTTP e reconhecimento gratuito para quem esta sondando.
    console.error('[erro]', req.method, req.originalUrl, err);

    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'corpo_muito_grande', message: 'Requisição grande demais.' });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'json_invalido', message: 'Corpo da requisição inválido.' });
    }

    res.status(500).json({
      error: 'erro_interno',
      message: 'Algo saiu errado do nosso lado.',
      ...(IS_PROD ? {} : { detail: String(err?.message ?? err) }),
    });
  });

  return app;
}

/**
 * Resolve `<!--#include cabecalho -->` a partir de public/partials/.
 * Mantem cabecalho e rodape num arquivo so, sem introduzir etapa de build.
 * O nome do parcial e restrito a [a-z-]: nada de caminho relativo vindo do
 * documento, para que um include nunca vire leitura arbitraria de disco.
 */
const PARTIALS_DIR = path.join(PUBLIC_DIR, 'partials');
const partialCache = new Map();

function readPartial(name) {
  if (!/^[a-z-]{1,32}$/.test(name)) return '';
  if (!IS_PROD || !partialCache.has(name)) {
    const file = path.join(PARTIALS_DIR, `${name}.html`);
    // Confirma que o caminho resolvido continua dentro de partials/.
    if (!file.startsWith(PARTIALS_DIR + path.sep)) return '';
    try { partialCache.set(name, fs.readFileSync(file, 'utf8')); }
    catch { partialCache.set(name, ''); }
  }
  return partialCache.get(name) ?? '';
}

/** Le o HTML, resolve includes, injeta o nonce nas tags inline e responde. */
function sendHtml(res, filePath, next) {
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return next(err);
    const rendered = html
      .replace(/<!--#include\s+([a-z-]+)\s*-->/g, (_, name) => readPartial(name))
      .replaceAll('<script>', `<script nonce="${res.locals.nonce}">`)
      .replaceAll('<style>', `<style nonce="${res.locals.nonce}">`)
      .replaceAll('__CSRF_TOKEN__', res.locals.csrfToken);
    res.type('html').set('Cache-Control', 'no-store').send(rendered);
  });
}

/* --- Inicializacao --------------------------------------------------------- */

const isMain = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isMain) {
  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    console.log(`\n  Morada do Japu — ${NODE_ENV}`);
    console.log(`  http://localhost:${config.port}\n`);
    console.log(`  pagamento: ${config.payments.provider}`);
    console.log(`  origem publica: ${config.publicOrigin}\n`);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
