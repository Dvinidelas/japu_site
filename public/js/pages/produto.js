/**
 * Pagina de produto.
 *
 * Junta tres itens da proposta: frete calculado ANTES do checkout (item 4),
 * barra fixa de compra no celular (item 5) e, quando o produto esta fora de
 * safra, lista de espera com alternativa em vez de botao cinza (item 3).
 */
import { api, brl } from '../api.js';
import { boot, productCard, openWaitlist, openCart, toast, $, el } from '../ui.js';
import { artFor } from '../art.js';
import { cart } from '../cart.js';

boot();

const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() ?? '');
const painel = $('#produto');
const barra = $('#barra-compra');

let produto = null;
let quantidade = 1;

async function carregar() {
  try {
    const dados = await api.product(slug);
    produto = dados.product;
    render(dados.alternatives);
  } catch (err) {
    painel.replaceChildren(el('div', { class: 'empty-state' }, [
      el('p', { text: err.status === 404 ? 'Produto não encontrado.' : 'Falha ao carregar o produto.' }),
      el('a', { class: 'btn btn--primary', href: '/loja', text: 'Ver a loja' }),
    ]));
  } finally {
    painel.setAttribute('aria-busy', 'false');
  }
}

function render(alternativas) {
  document.title = `${produto.name} — Morada do Japu`;
  $('#bc-atual').textContent = produto.name;

  const galeria = el('div', { class: 'product-gallery', html: artFor(produto.art) });
  if (produto.badge) {
    galeria.append(el('span', { class: `badge badge--${produto.badge.kind}`, text: produto.badge.label }));
  }

  painel.replaceChildren(galeria, el('div', { class: 'product-panel' }, [
    el('p', { class: 'card-kicker', text: produto.kicker }),
    el('h1', { text: produto.name }),
    el('p', { text: produto.description }),

    produto.highlights?.length
      ? el('ul', { class: 'highlight-list' }, produto.highlights.map((h) => el('li', { text: h })))
      : null,

    el('div', { class: 'card-prices' }, [
      el('span', { class: 'price price--lg', text: brl(produto.priceCents) }),
      produto.compareAtCents ? el('span', { class: 'price price--was', text: brl(produto.compareAtCents) }) : null,
      produto.packLabel
        ? el('span', { class: 'price-unit', text: produto.packLabel })
        : produto.unitPricePer100gCents
          ? el('span', { class: 'price-unit', text: `${brl(produto.unitPricePer100gCents)} / 100 g` })
          : null,
    ]),

    produto.inStock ? blocoCompra() : blocoForaDeSafra(),
    blocoFrete(),
    produto.lot ? el('p', { class: 'card-kicker', text: `Lote ${produto.lot}` }) : null,
  ]));

  if (alternativas?.length) {
    $('#alternativas').replaceChildren(...alternativas.map((p) => productCard(p)));
    $('#alternativas-bloco').hidden = false;
  }

  montarBarraFixa();
}

function blocoCompra() {
  const input = el('input', { type: 'number', min: '1', max: '20', value: '1',
                              'aria-label': 'Quantidade' });
  const dec = el('button', { type: 'button', 'aria-label': 'Diminuir', text: '−' });
  const inc = el('button', { type: 'button', 'aria-label': 'Aumentar', text: '+' });

  const setQtd = (n) => {
    quantidade = Math.min(Math.max(n, 1), 20);
    input.value = String(quantidade);
    dec.disabled = quantidade <= 1;
    inc.disabled = quantidade >= 20;
    atualizarBarra();
  };
  dec.addEventListener('click', () => setQtd(quantidade - 1));
  inc.addEventListener('click', () => setQtd(quantidade + 1));
  input.addEventListener('change', () => setQtd(parseInt(input.value, 10) || 1));
  setQtd(1);

  return el('div', { class: 'product-buy' }, [
    el('div', { class: 'qty' }, [dec, input, inc]),
    el('button', { class: 'btn btn--primary', type: 'button', text: 'Adicionar à sacola',
                   onClick: adicionar }),
  ]);
}

function blocoForaDeSafra() {
  return el('div', { class: 'stack' }, [
    el('div', { class: 'out-of-stock-note' }, [
      el('strong', { text: produto.returnsMonthLabel
        ? `Volta em ${produto.returnsMonthLabel}.`
        : 'Fora de safra no momento.' }),
      el('span', { text: produto.waitlistCount
        ? ` ${produto.waitlistCount} pessoas já estão na fila.`
        : ' Entre na fila para ser avisado primeiro.' }),
    ]),
    el('button', { class: 'btn btn--primary btn--block', type: 'button',
                   text: 'Avise-me quando chegar',
                   onClick: () => openWaitlist(produto) }),
  ]);
}

/**
 * Item 4 da proposta: o frete deixa de ser surpresa na ultima tela.
 * O CEP fica guardado no navegador para nao pedir de novo a cada produto.
 */
function blocoFrete() {
  const CEP_KEY = 'japu.cep';
  const input = el('input', {
    type: 'text', inputmode: 'numeric', maxlength: '9', placeholder: '00000-000',
    'aria-label': 'Seu CEP', autocomplete: 'postal-code',
  });
  const resultado = el('div', { class: 'freight-result', role: 'status', 'aria-live': 'polite' });
  const botao = el('button', { class: 'btn btn--outline btn--sm', type: 'submit', text: 'Calcular' });

  // Mascara leve: so digitos, com hifen depois do quinto.
  input.addEventListener('input', () => {
    const d = input.value.replace(/\D/g, '').slice(0, 8);
    input.value = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  });

  const consultar = async (cep) => {
    resultado.replaceChildren(el('p', { class: 'field-hint', text: 'Calculando…' }));
    try {
      const cotacao = await api.quoteShipping({
        cep,
        items: [{ sku: produto.sku, qty: quantidade }],
      });
      try { localStorage.setItem(CEP_KEY, cep); } catch { /* modo privado */ }

      resultado.replaceChildren(
        ...cotacao.options.map((op) =>
          el('div', { class: 'freight-option' }, [
            el('span', { text: `${op.label} · ${op.businessDays} dias úteis` }),
            el('strong', { text: op.priceCents === 0 ? 'grátis' : brl(op.priceCents) }),
          ])
        ),
        el('p', { class: 'field-hint', text: cotacao.freeShipping
          ? 'Frete econômico grátis neste pedido.'
          : `Frete grátis acima de ${brl(cotacao.freeShippingAboveCents)}.` })
      );
    } catch (err) {
      resultado.replaceChildren(el('p', { class: 'field-error', text: err.message }));
    }
  };

  const form = el('form', { class: 'freight-form',
    onSubmit: (e) => { e.preventDefault(); consultar(input.value); } }, [input, botao]);

  // CEP ja informado antes: calcula sozinho ao abrir a pagina.
  let salvo = '';
  try { salvo = localStorage.getItem(CEP_KEY) ?? ''; } catch { /* sem acesso */ }
  if (salvo) { input.value = salvo; consultar(salvo); }

  return el('div', { class: 'freight' }, [
    el('strong', { text: 'Frete e prazo' }),
    el('span', { text: ' — calculado aqui, antes do checkout.' }),
    form, resultado,
  ]);
}

async function adicionar() {
  await cart.add(produto.sku, quantidade);
  toast(`${produto.name} na sacola.`);
  openCart();
}

/** Barra fixa no celular: preco e botao sempre visiveis durante a leitura. */
function montarBarraFixa() {
  if (!produto.inStock) {
    barra.hidden = true;
    document.body.dataset.buybar = 'false';
    return;
  }
  barra.hidden = false;
  $('#barra-botao').addEventListener('click', adicionar);
  atualizarBarra();
}

function atualizarBarra() {
  if (!produto?.inStock) return;
  const total = produto.priceCents * quantidade;
  $('#barra-preco').textContent = brl(total);
  // Parcelamento em 2x sem juros, como no mockup.
  $('#barra-parcela').textContent = `2× de ${brl(Math.round(total / 2))} sem juros`;
}

carregar();
