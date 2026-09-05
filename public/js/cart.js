/**
 * Sacola do cliente.
 *
 * O navegador guarda somente `sku` e `qty` — nunca preco. Os valores exibidos
 * vem de /api/cart/validate, ou seja, do catalogo no servidor. Assim a sacola
 * nao pode ser adulterada pelo console para alterar o que sera cobrado, e um
 * produto que saiu de safra enquanto a aba ficou aberta e sinalizado em vez
 * de quebrar no pagamento.
 */
import { api } from './api.js';

const STORAGE_KEY = 'japu.cart.v1';
const listeners = new Set();

/** @type {{sku: string, qty: number}[]} */
let items = load();
/** Ultimo retorno do servidor: precos, totais e itens recusados. */
let snapshot = { lines: [], rejected: [], itemCount: 0, subtotalCents: 0, savingsCents: 0, weightGrams: 0 };

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    // Higieniza o que veio do armazenamento: nada entra sem passar por aqui.
    return parsed
      .filter((i) => typeof i?.sku === 'string' && /^[A-Z0-9-]{3,24}$/i.test(i.sku))
      .map((i) => ({ sku: i.sku.toUpperCase(), qty: Math.min(Math.max(parseInt(i.qty, 10) || 1, 1), 20) }))
      .slice(0, 30);
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Modo privado ou armazenamento cheio: a sacola vira apenas de sessao.
  }
}

function emit() {
  for (const fn of listeners) fn(snapshot, items);
}

/** Revalida no servidor e avisa os assinantes. */
async function sync() {
  if (items.length === 0) {
    snapshot = { lines: [], rejected: [], itemCount: 0, subtotalCents: 0, savingsCents: 0, weightGrams: 0 };
    emit();
    return snapshot;
  }
  try {
    snapshot = await api.validateCart(items);
    // Remove do armazenamento o que o servidor recusou, para nao ficar
    // tentando revender um produto fora de safra a cada carregamento.
    if (snapshot.rejected?.length) {
      const bad = new Set(snapshot.rejected.map((r) => r.sku));
      items = items.filter((i) => !bad.has(i.sku));
      persist();
    }
  } catch (err) {
    console.warn('[sacola] falha ao revalidar', err);
  }
  emit();
  return snapshot;
}

export const cart = {
  get items() { return [...items]; },
  get snapshot() { return snapshot; },
  get count() { return items.reduce((sum, i) => sum + i.qty, 0); },

  subscribe(fn) {
    listeners.add(fn);
    fn(snapshot, items);
    return () => listeners.delete(fn);
  },

  async add(sku, qty = 1) {
    const key = String(sku).toUpperCase();
    const existing = items.find((i) => i.sku === key);
    if (existing) existing.qty = Math.min(existing.qty + qty, 20);
    else items.push({ sku: key, qty: Math.min(Math.max(qty, 1), 20) });
    persist();
    return sync();
  },

  async setQty(sku, qty) {
    const key = String(sku).toUpperCase();
    const next = Math.min(Math.max(parseInt(qty, 10) || 0, 0), 20);
    if (next === 0) return cart.remove(key);
    const existing = items.find((i) => i.sku === key);
    if (existing) existing.qty = next;
    persist();
    return sync();
  },

  async remove(sku) {
    const key = String(sku).toUpperCase();
    items = items.filter((i) => i.sku !== key);
    persist();
    return sync();
  },

  async clear() {
    items = [];
    persist();
    return sync();
  },

  sync,
};

// Mantem abas abertas em sincronia — carrinho divergente entre abas gera
// o classico "adicionei e sumiu".
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) { items = load(); sync(); }
});
