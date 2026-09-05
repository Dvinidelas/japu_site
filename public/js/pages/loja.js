/**
 * Loja — grade de produtos com filtro por categoria.
 *
 * O filtro escolhido vai para a URL (?categoria=cacau). Isso deixa a
 * categoria compartilhavel, funcional no botao voltar do navegador e util
 * para o trafego que vem do Instagram apontando direto para uma delas.
 */
import { api } from '../api.js';
import { boot, productCard, $, el, toast } from '../ui.js';

boot();

const grade = $('#grade');
const filtros = $('#filtros');
const status = $('#status-filtro');

let categorias = [];
let atual = new URLSearchParams(location.search).get('categoria') ?? 'tudo';

async function carregarCategorias() {
  try {
    const dados = await api.categories();
    categorias = dados.categories;
  } catch {
    categorias = [];
  }

  // Categoria vinda da URL que nao existe volta para "tudo" em vez de
  // mostrar grade vazia sem explicacao.
  if (atual !== 'tudo' && !categorias.some((c) => c.id === atual)) atual = 'tudo';

  filtros.replaceChildren(
    criarChip('tudo', 'Tudo'),
    ...categorias.map((c) => criarChip(c.id, c.name)),
    el('span', { class: 'filter-count', id: 'contagem' })
  );
  marcarAtivo();
}

function criarChip(id, rotulo) {
  return el('button', {
    class: 'chip', type: 'button', 'data-categoria': id,
    'aria-pressed': String(id === atual), text: rotulo,
    onClick: () => selecionar(id),
  });
}

function marcarAtivo() {
  for (const chip of filtros.querySelectorAll('.chip')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.categoria === atual));
  }
}

function selecionar(id) {
  if (id === atual) return;
  atual = id;
  marcarAtivo();

  // Atualiza a URL sem recarregar; o botao voltar continua funcionando.
  const url = new URL(location.href);
  if (id === 'tudo') url.searchParams.delete('categoria');
  else url.searchParams.set('categoria', id);
  history.pushState({ categoria: id }, '', url);

  carregarProdutos();
}

async function carregarProdutos() {
  grade.setAttribute('aria-busy', 'true');
  try {
    const dados = await api.products(atual === 'tudo' ? {} : { category: atual });

    if (dados.products.length === 0) {
      grade.replaceChildren(el('div', { class: 'empty-state' }, [
        el('p', { text: 'Nada nesta categoria por enquanto.' }),
        el('button', { class: 'btn btn--outline', type: 'button', text: 'Ver tudo',
                       onClick: () => selecionar('tudo') }),
      ]));
    } else {
      grade.replaceChildren(...dados.products.map((p) => productCard(p)));
    }

    const contagem = $('#contagem');
    const texto = `${dados.total} ${dados.total === 1 ? 'produto' : 'produtos'} · ${dados.available} disponíveis`;
    if (contagem) contagem.textContent = texto;
    if (status) status.textContent = texto;
  } catch {
    grade.replaceChildren(el('p', { class: 'card-desc',
      text: 'Não foi possível carregar o catálogo. Recarregue a página.' }));
    toast('Falha ao carregar o catálogo.', 'error');
  } finally {
    grade.setAttribute('aria-busy', 'false');
  }
}

// Botao voltar/avancar do navegador respeita o filtro.
window.addEventListener('popstate', () => {
  atual = new URLSearchParams(location.search).get('categoria') ?? 'tudo';
  marcarAtivo();
  carregarProdutos();
});

await carregarCategorias();
await carregarProdutos();
