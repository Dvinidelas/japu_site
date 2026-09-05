/**
 * Pagina da proposta: os cinco pontos e a comparacao lado a lado.
 *
 * A grade "hoje" e uma reconstrucao fiel do card atual — imagem solta, nome
 * corrido, preco em vermelho e botao cinza quando esgota. Serve de referencia
 * visual; nenhum dos dois lados inventa preco, ambos leem a mesma API.
 */
import { api, brl } from '../api.js';
import { boot, productCard, $, el } from '../ui.js';
import { artFor } from '../art.js';

boot();

/** Nome longo, como aparece hoje no catalogo. */
function nomeLegado(produto) {
  const sufixos = {
    'CAC-PO-150':  'Cacau em Pó - 100% cacau -150g',
    'CAC-NIB-150': 'Nibs de Cacau Agroflorestal - Morada do Japu',
    'COM-JAB-280': 'Compota de Jabuticaba',
    'CUP-MTG-200': 'Manteiga de Cupuaçu - Agroflorestal - Morada do Japu',
  };
  return sufixos[produto.sku] ?? produto.name;
}

function cardLegado(produto) {
  return el('div', { class: 'legacy-card' }, [
    el('div', { class: 'legacy-media', html: artFor(produto.art) }),
    el('p', { class: 'legacy-name', text: nomeLegado(produto) }),
    el('span', { class: 'legacy-price', text: brl(produto.priceCents) }),
    produto.inStock
      ? el('button', { class: 'legacy-btn', type: 'button', text: 'Comprar Agora', disabled: true })
      : el('button', { class: 'legacy-btn', type: 'button', text: 'Esgotado', disabled: true }),
  ]);
}

async function montar() {
  try {
    const { products } = await api.products();
    // Os quatro do mockup comparativo.
    const alvo = ['CAC-PO-150', 'CAC-NIB-150', 'COM-JAB-280', 'CUP-MTG-200'];
    const selecao = alvo.map((sku) => products.find((p) => p.sku === sku)).filter(Boolean);

    $('#grade-antiga').replaceChildren(...selecao.map(cardLegado));
    $('#grade-nova').replaceChildren(...selecao.map((p) => productCard(p)));

    // Faixa de filtros só para ilustrar a organização por categoria.
    const { categories, total, available } = await api.categories();
    $('#filtros-demo').replaceChildren(
      el('button', { class: 'chip', type: 'button', 'aria-pressed': 'true', tabindex: '-1', text: 'Tudo' }),
      ...categories.map((c) => el('button', { class: 'chip', type: 'button', tabindex: '-1', text: c.name })),
      el('span', { class: 'filter-count', text: `${total} produtos · ${available} disponíveis` })
    );
  } catch {
    $('#grade-nova').replaceChildren(el('p', { class: 'card-desc', text: 'Falha ao carregar a comparação.' }));
  }
}

montar();
