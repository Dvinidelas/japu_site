/** Sobe o app numa porta efemera e devolve um cliente com CSRF ja resolvido. */
import { createApp } from '../server/index.js';

export async function startServer() {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  // Uma visita a home entrega o cookie anti-CSRF.
  const res = await fetch(`${base}/`);
  const cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');
  const csrf = /japu_csrf=([^;]+)/.exec(cookie)?.[1] ?? '';

  const request = (path, { method = 'GET', body, headers = {}, withCsrf = true } = {}) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        cookie,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(withCsrf && body !== undefined ? { 'x-csrf-token': csrf } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  return { base, server, request, csrf, close: () => new Promise((r) => server.close(r)) };
}
