/**
 * Interface compartilhada: navegacao, sacola, avisos, lista de espera e o
 * card de produto usado por todas as paginas.
 *
 * Nenhuma string vinda da API e concatenada como HTML sem escapar. Onde o
 * conteudo e texto puro, o codigo usa textContent, que nao interpreta marcacao.
 */
import { api, brl } from './api.js';
import { cart } from './cart.js';
import { artFor } from './art.js';

/* --------------------------------------------------------------------------
   Utilitarios
   -------------------------------------------------------------------------- */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Troca os filhos de um no ignorando nulos.
 *
 * `Node.replaceChildren` e API do DOM: um `null` na lista vira o texto
 * "null" na tela, em vez de sumir. Como os blocos condicionais aqui devolvem
 * `null` quando nao ha o que mostrar, toda troca de filhos passa por esta
 * funcao.
 */
export function setChildren(node, ...children) {
  node.replaceChildren(...children.flat().filter((c) => c != null));
}

/** Cria elemento com atributos e filhos, sem passar por innerHTML. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value; // so para SVG proprio
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/* --------------------------------------------------------------------------
   Avisos temporarios
   -------------------------------------------------------------------------- */

let toastStack;

export function toast(message, tone = 'ok') {
  if (!toastStack) {
    toastStack = el('div', { class: 'toast-stack', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastStack);
  }
  const node = el('div', { class: 'toast', 'data-tone': tone, text: message });
  toastStack.append(node);
  setTimeout(() => node.remove(), 3600);
}

/* --------------------------------------------------------------------------
   Navegacao
   -------------------------------------------------------------------------- */

/**
 * Liga o cabecalho: hamburger, submenu de categorias e botao da sacola.
 * O submenu responde a clique e a teclado; Esc fecha e devolve o foco ao
 * gatilho, e clique fora fecha o que estiver aberto.
 */
export function initNav() {
  const burger = $('.nav-burger');
  const nav = $('.nav');

  if (burger && nav) {
    burger.addEventListener('click', () => {
      const open = nav.dataset.open === 'true';
      nav.dataset.open = String(!open);
      burger.setAttribute('aria-expanded', String(!open));
    });
  }

  for (const toggle of $$('.nav-toggle')) {
    const menu = document.getElementById(toggle.getAttribute('aria-controls'));
    if (!menu) continue;

    const setOpen = (open) => {
      menu.dataset.open = String(open);
      toggle.setAttribute('aria-expanded', String(open));
    };

    // Só clique, sem abrir no hover. Combinar os dois faz o menu que o
    // ponteiro acabou de abrir fechar no clique seguinte — e no toque e no
    // teclado o hover não existe. Clique se comporta igual nos três.
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    // Esc fecha e devolve o foco ao gatilho. O ouvinte fica no documento, e
    // nao no menu: depois de abrir com Enter o foco continua no botao, entao
    // um ouvinte preso ao menu nunca receberia a tecla.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (toggle.getAttribute('aria-expanded') !== 'true') return;
      setOpen(false);
      toggle.focus();
    });
  }

  // Clique fora fecha qualquer submenu aberto.
  document.addEventListener('click', (event) => {
    for (const menu of $$('.submenu[data-open="true"]')) {
      if (!menu.closest('.nav-item')?.contains(event.target)) {
        menu.dataset.open = 'false';
        menu.closest('.nav-item')?.querySelector('.nav-toggle')
          ?.setAttribute('aria-expanded', 'false');
      }
    }
  });

  // Marca o item da navegacao correspondente a pagina atual.
  const here = window.location.pathname.replace(/\/$/, '') || '/';
  for (const link of $$('.nav-link')) {
    const href = link.getAttribute('href')?.replace(/\/$/, '') || '/';
    if (href === here) link.setAttribute('aria-current', 'page');
  }
}

/** Preenche o submenu de categorias com a contagem real de cada uma. */
export async function fillCategoryMenu() {
  const menus = $$('[data-category-menu]');
  if (menus.length === 0) return;

  try {
    const { categories } = await api.categories();
    for (const menu of menus) {
      menu.replaceChildren(
        el('li', {}, [
          el('a', { href: '/loja' }, [
            el('span', { text: 'Ver tudo' }),
            el('span', { class: 'submenu-count', text: String(categories.reduce((s, c) => s + c.count, 0)) }),
          ]),
        ]),
        ...categories.map((c) =>
          el('li', {}, [
            el('a', { href: `/loja?categoria=${encodeURIComponent(c.id)}` }, [
              el('span', { text: c.name }),
              el('span', { class: 'submenu-count', text: `${c.available}/${c.count}` }),
            ]),
          ])
        )
      );
    }
  } catch {
    // Menu de categorias e melhoria progressiva: se a API falhar, o link
    // direto para /loja no HTML continua funcionando.
  }
}

/* --------------------------------------------------------------------------
   Card de produto
   -------------------------------------------------------------------------- */

/**
 * Constroi o card da grade. Fora de safra ele NAO vira botao cinza: mostra
 * quando volta, quantas pessoas estao na fila e um botao de aviso — o item 3
 * da proposta.
 */
export function productCard(product, { onAdd, onWaitlist } = {}) {
  const media = el('div', { class: 'card-media' }, [
    el('div', { html: artFor(product.art) }),
  ]);

  if (product.badge) {
    media.append(el('span', {
      class: `badge badge--${product.badge.kind}`,
      text: product.badge.label,
    }));
  }

  const prices = el('div', { class: 'card-prices' }, [
    el('span', { class: 'price price--lg', text: brl(product.priceCents) }),
    // Quando o produto tem rotulo de embalagem (o pote de 280 g), ele diz
    // mais que o preco por 100 g — comparar compota por grama nao ajuda
    // ninguem a decidir.
    product.compareAtCents
      ? el('span', { class: 'price price--was', text: brl(product.compareAtCents) })
      : product.packLabel
        ? el('span', { class: 'price-unit', text: product.packLabel })
        : product.unitPricePer100gCents
          ? el('span', { class: 'price-unit', text: `${brl(product.unitPricePer100gCents)} / 100 g` })
          : null,
  ]);

  let actions;
  if (product.inStock) {
    let qty = 1;
    const input = el('input', {
      type: 'number', min: '1', max: '20', value: '1',
      'aria-label': `Quantidade de ${product.name}`,
    });
    const dec = el('button', { type: 'button', 'aria-label': 'Diminuir', text: '−' });
    const inc = el('button', { type: 'button', 'aria-label': 'Aumentar', text: '+' });

    const setQty = (next) => {
      qty = Math.min(Math.max(next, 1), 20);
      input.value = String(qty);
      dec.disabled = qty <= 1;
      inc.disabled = qty >= 20;
    };
    dec.addEventListener('click', () => setQty(qty - 1));
    inc.addEventListener('click', () => setQty(qty + 1));
    input.addEventListener('change', () => setQty(parseInt(input.value, 10) || 1));
    setQty(1);

    actions = el('div', { class: 'card-actions' }, [
      el('div', { class: 'qty' }, [dec, input, inc]),
      el('button', {
        type: 'button', class: 'btn btn--primary', text: 'Adicionar',
        onClick: async (event) => {
          const btn = event.currentTarget;
          btn.disabled = true;
          await cart.add(product.sku, qty);
          toast(`${product.name} na sacola.`);
          onAdd?.(product, qty);
          btn.disabled = false;
          setQty(1);
        },
      }),
    ]);
  } else {
    const fila = product.waitlistCount
      ? el('p', { class: 'card-kicker', text: `${product.waitlistCount} pessoas na fila` })
      : null;
    actions = el('div', { class: 'stack' }, [
      fila,
      el('button', {
        type: 'button', class: 'btn btn--outline btn--block',
        text: 'Avise-me quando chegar',
        onClick: () => (onWaitlist ?? openWaitlist)(product),
      }),
    ]);
  }

  return el('article', { class: 'card', 'data-sku': product.sku }, [
    el('a', { href: `/produto/${product.slug}`, 'aria-label': product.name }, [media]),
    el('div', { class: 'card-body' }, [
      el('p', { class: 'card-kicker', text: product.kicker }),
      el('h3', { class: 'card-title' }, [
        el('a', { href: `/produto/${product.slug}`, text: product.name }),
      ]),
      el('p', { class: 'card-desc', text: product.summary }),
      prices,
      actions,
    ]),
  ]);
}

/* --------------------------------------------------------------------------
   Lista de espera
   -------------------------------------------------------------------------- */

let waitlistModal;

/** Abre o formulario de aviso para um produto fora de safra. */
export function openWaitlist(product) {
  if (!waitlistModal) waitlistModal = buildWaitlistModal();

  const { root, title, hint, form, email, error, alternatives } = waitlistModal;
  title.textContent = product.name;
  hint.textContent = product.returnsMonthLabel
    ? `A próxima leva sai em ${product.returnsMonthLabel}. Avisamos você primeiro.`
    : 'Avisamos assim que a próxima leva sair.';
  error.textContent = '';
  form.reset();
  form.dataset.sku = product.sku;

  // Sugere alternativa disponivel — "esgotado" nunca vira beco sem saida.
  alternatives.replaceChildren();
  api.product(product.slug)
    .then(({ alternatives: alts }) => {
      if (!alts?.length) return;
      alternatives.append(
        // Rotulo neutro de proposito: a alternativa vem da mesma categoria
        // quando existe, mas pode vir de outra quando a categoria inteira
        // saiu de safra.
        el('p', { class: 'field-hint', text: 'Enquanto isso, disponível agora:' }),
        el('div', { class: 'stack' }, alts.slice(0, 2).map((alt) =>
          el('a', { class: 'btn btn--ghost btn--sm btn--block', href: `/produto/${alt.slug}`,
                    text: `${alt.name} · ${brl(alt.priceCents)}` })
        ))
      );
    })
    .catch(() => { /* alternativa e opcional */ });

  root.dataset.open = 'true';
  setTimeout(() => email.focus(), 50);
}

function buildWaitlistModal() {
  const email = el('input', {
    type: 'email', name: 'email', required: true, placeholder: 'voce@email.com',
    autocomplete: 'email', maxlength: '180', id: 'wl-email',
  });
  // Honeypot: invisivel para gente, atraente para robo de formulario.
  const honey = el('input', {
    type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off',
    'aria-hidden': 'true', class: 'sr-only',
  });
  const error = el('p', { class: 'field-error', role: 'alert' });
  const title = el('h2');
  const hint = el('p');
  const alternatives = el('div', { class: 'stack' });
  const submit = el('button', { type: 'submit', class: 'btn btn--primary btn--block', text: 'Entrar na lista' });

  const form = el('form', { novalidate: true }, [
    el('div', { class: 'field' }, [
      el('label', { for: 'wl-email', text: 'Seu e-mail' }),
      email, honey, error,
      el('p', { class: 'field-hint', text: 'Usamos só para avisar desta leva. Sem newsletter.' }),
    ]),
    submit,
  ]);

  const close = el('button', {
    type: 'button', class: 'drawer-close', 'aria-label': 'Fechar', text: '✕',
  });

  const root = el('div', {
    class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'wl-title',
  }, [
    el('div', { class: 'modal-card' }, [
      el('div', { class: 'drawer-head' }, [
        el('div', {}, [el('p', { class: 'eyebrow', text: 'Lista de espera' }), title]),
        close,
      ]),
      hint, form, alternatives,
    ]),
  ]);

  title.id = 'wl-title';
  document.body.append(root);

  const dismiss = () => { root.dataset.open = 'false'; };
  close.addEventListener('click', dismiss);
  root.addEventListener('click', (e) => { if (e.target === root) dismiss(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.dataset.open === 'true') dismiss();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';

    if (!email.checkValidity()) {
      error.textContent = 'Confira o e-mail digitado.';
      email.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Enviando…';
    try {
      const result = await api.joinWaitlist({
        sku: form.dataset.sku,
        email: email.value.trim(),
        website: honey.value,
      });
      toast(result.message);
      dismiss();
    } catch (err) {
      error.textContent = err.message || 'Não foi possível registrar agora.';
    } finally {
      submit.disabled = false;
      submit.textContent = 'Entrar na lista';
    }
  });

  return { root, title, hint, form, email, error, alternatives };
}

/* --------------------------------------------------------------------------
   Sacola (gaveta lateral)
   -------------------------------------------------------------------------- */

let drawer;

export function initCart() {
  drawer = buildDrawer();

  // Todo botao com [data-open-cart] abre a gaveta, em qualquer pagina.
  for (const btn of $$('[data-open-cart]')) {
    btn.addEventListener('click', () => openCart());
  }

  // Contador do cabecalho segue a sacola.
  cart.subscribe((snapshot) => {
    const count = snapshot.itemCount ?? 0;
    for (const badge of $$('[data-cart-count]')) {
      badge.textContent = String(count);
      badge.dataset.empty = String(count === 0);
    }
    renderDrawer(snapshot);
  });

  cart.sync();
}

export function openCart() {
  drawer.backdrop.dataset.open = 'true';
  drawer.root.dataset.open = 'true';
  document.body.style.overflow = 'hidden';
  drawer.closeBtn.focus();
}

export function closeCart() {
  drawer.backdrop.dataset.open = 'false';
  drawer.root.dataset.open = 'false';
  document.body.style.overflow = '';
}

function buildDrawer() {
  const body = el('div', { class: 'drawer-body' });
  const foot = el('div', { class: 'drawer-foot' });
  const closeBtn = el('button', { class: 'drawer-close', 'aria-label': 'Fechar sacola', text: '✕' });

  const root = el('aside', {
    class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Sua sacola',
  }, [
    el('div', { class: 'drawer-head' }, [el('h2', { text: 'Sua sacola' }), closeBtn]),
    body, foot,
  ]);

  const backdrop = el('div', { class: 'drawer-backdrop' });
  document.body.append(backdrop, root);

  closeBtn.addEventListener('click', closeCart);
  backdrop.addEventListener('click', closeCart);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.dataset.open === 'true') closeCart();
  });

  return { root, backdrop, body, foot, closeBtn };
}

function renderDrawer(snapshot) {
  if (!drawer) return;
  const { body, foot } = drawer;

  if (!snapshot.lines?.length) {
    body.replaceChildren(el('div', { class: 'empty-state' }, [
      el('p', { text: 'Sua sacola está vazia.' }),
      el('a', { class: 'btn btn--primary', href: '/loja', text: 'Ver a loja' }),
    ]));
    foot.replaceChildren();
    return;
  }

  body.replaceChildren(...snapshot.lines.map((line) =>
    el('div', { class: 'line-item' }, [
      el('div', { class: 'line-item-media', html: artFor(line.art) }),
      el('div', {}, [
        el('h3', {}, [el('a', { href: `/produto/${line.slug}`, text: line.name })]),
        el('span', { class: 'price', text: brl(line.unitPriceCents) }),
        el('div', { class: 'line-item-foot' }, [
          buildQtyStepper(line),
          el('button', { class: 'line-remove', type: 'button', text: 'Remover',
                         onClick: () => cart.remove(line.sku) }),
        ]),
      ]),
    ])
  ));

  // Itens que o servidor recusou aparecem como aviso, nao somem em silencio.
  for (const rejected of snapshot.rejected ?? []) {
    body.append(el('p', { class: 'field-hint', text: rejected.message }));
  }

  foot.replaceChildren(
    el('div', { class: 'totals' }, [
      el('div', { class: 'totals-row' }, [
        el('span', { text: `Subtotal (${snapshot.itemCount} ${snapshot.itemCount === 1 ? 'item' : 'itens'})` }),
        el('span', { class: 'price', text: brl(snapshot.subtotalCents) }),
      ]),
      snapshot.savingsCents
        ? el('div', { class: 'totals-row' }, [
            el('span', { text: 'Você economiza' }),
            el('span', { class: 'price', text: `− ${brl(snapshot.savingsCents)}` }),
          ])
        : null,
      el('div', { class: 'totals-row' }, [
        el('span', { text: 'Frete' }),
        el('span', { class: 'price-unit', text: 'calculado na próxima etapa' }),
      ]),
    ]),
    el('a', { class: 'btn btn--primary btn--block', href: '/sacola', text: 'Fechar pedido' })
  );
}

function buildQtyStepper(line) {
  const input = el('input', {
    type: 'number', min: '1', max: '20', value: String(line.qty),
    'aria-label': `Quantidade de ${line.name}`,
  });
  const dec = el('button', { type: 'button', 'aria-label': 'Diminuir', text: '−',
                             onClick: () => cart.setQty(line.sku, line.qty - 1) });
  const inc = el('button', { type: 'button', 'aria-label': 'Aumentar', text: '+',
                             onClick: () => cart.setQty(line.sku, line.qty + 1) });
  input.addEventListener('change', () => cart.setQty(line.sku, parseInt(input.value, 10) || 1));
  dec.disabled = line.qty <= 1;
  inc.disabled = line.qty >= 20;
  return el('div', { class: 'qty' }, [dec, input, inc]);
}

/** Arranque comum a todas as paginas. */
export function boot() {
  initNav();
  initCart();
  fillCategoryMenu();
}
