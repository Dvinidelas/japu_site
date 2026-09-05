/**
 * Cliente da API. Todo pedido de escrita carrega o token anti-CSRF lido do
 * cookie de propria origem. Nenhum preco sai daqui — o servidor recalcula.
 */

const CSRF_COOKIE = 'japu_csrf';

function readCookie(name) {
  return document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
    ?.split('=')[1] ?? '';
}

async function request(pathname, { method = 'GET', body, headers = {} } = {}) {
  const options = {
    method,
    headers: { Accept: 'application/json', ...headers },
    // Mesma origem: o cookie de CSRF precisa acompanhar a requisicao.
    credentials: 'same-origin',
  };

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.headers['X-CSRF-Token'] = readCookie(CSRF_COOKIE);
    options.body = JSON.stringify(body);
  }

  const res = await fetch(pathname, options);
  const contentType = res.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const error = new Error(payload?.message ?? `Falha na requisição (${res.status})`);
    error.status = res.status;
    error.code = payload?.error;
    error.fields = payload?.fields;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export const api = {
  config:      ()                 => request('/api/config'),
  products:    (params = {})      => request(`/api/products?${new URLSearchParams(params)}`),
  product:     (slug)             => request(`/api/products/${encodeURIComponent(slug)}`),
  categories:  ()                 => request('/api/categories'),
  season:      (month)            => request(`/api/season${month != null ? `?month=${month}` : ''}`),
  recipe:      ()                 => request('/api/recipe'),

  validateCart: (items)           => request('/api/cart/validate', { method: 'POST', body: { items } }),
  quoteShipping: (payload)        => request('/api/shipping/quote', { method: 'POST', body: payload }),
  joinWaitlist: (payload)         => request('/api/waitlist', { method: 'POST', body: payload }),

  checkout: (payload, idempotencyKey) => request('/api/checkout/session', {
    method: 'POST',
    body: payload,
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
  }),
};

/** Formata centavos como moeda brasileira. */
export const brl = (cents) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format((Number(cents) || 0) / 100);
