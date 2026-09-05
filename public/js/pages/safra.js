/**
 * Almanaque da safra (direcao B).
 *
 * O calendario e o centro da pagina: as abas de mes trocam o estado de cada
 * especie e o destaque, sem recarregar. A receita da semana soma os itens
 * marcados e manda tudo para a sacola de uma vez.
 */
import { api, brl } from '../api.js';
import { boot, productCard, $, el, toast } from '../ui.js';
import { artFor } from '../art.js';
import { cart } from '../cart.js';

boot();

const abas = $('#abas-mes');
const linhas = $('#linhas-safra');
const destaque = $('#destaque-mes');

let mesAtual = new Date().getMonth();
let rotulos = [];

async function carregarSafra(mes) {
  try {
    const dados = await api.season(mes);
    mesAtual = dados.month;
    rotulos = dados.monthLabels;

    renderAbas(dados);
    renderLinhas(dados.rows);
    renderDestaque(dados.featured, dados.monthLabel);

    $('#contagem-prateleira').textContent =
      `${dados.monthLabel.toUpperCase()} · ${dados.available} de ${dados.total} disponíveis`;
  } catch {
    linhas.replaceChildren(el('p', { class: 'card-desc', text: 'Falha ao carregar o calendário.' }));
  } finally {
    $('#calendario').setAttribute('aria-busy', 'false');
  }
}

function renderAbas(dados) {
  abas.replaceChildren(...rotulos.map((rotulo, indice) => {
    // Um mes fica marcado como "de retorno" quando alguma especie volta
    // exatamente nele — e a dica visual do mockup, o mes em ambar.
    const retorna = dados.rows.some((r) => r.nextMonth === indice);
    return el('button', {
      class: 'month-tab', type: 'button', role: 'tab',
      'aria-selected': String(indice === mesAtual),
      'data-returning': String(retorna && indice !== mesAtual),
      text: rotulo.toUpperCase(),
      onClick: () => carregarSafra(indice),
    });
  }));
}

function renderLinhas(rows) {
  linhas.replaceChildren(...rows.map((row) => {
    const barra = el('div', { class: 'season-bar' });

    // Cada trecho contiguo de meses vira uma faixa na barra de 12 posicoes.
    let inicio = null;
    for (let m = 0; m <= 12; m += 1) {
      const ativo = row.months[m] === 1;
      if (ativo && inicio === null) inicio = m;
      if ((!ativo || m === 12) && inicio !== null) {
        const faixa = el('span');
        // Estilo via CSSOM, nao por atributo style no HTML — a CSP fecha
        // style-src sem 'unsafe-inline', e CSSOM continua permitido.
        faixa.style.left = `${(inicio / 12) * 100}%`;
        faixa.style.width = `${((m - inicio) / 12) * 100}%`;
        // Verde para o que está dando agora, âmbar para o que ainda vai
        // voltar. Colorir pelo pico deixava quase toda barra âmbar e a
        // leitura de relance — "o que dá para comprar hoje?" — se perdia.
        faixa.dataset.state = row.available ? 'available' : 'returning';
        // O pico ganha um tom mais fechado dentro do próprio verde.
        if (row.available && row.peak.some((p) => p >= inicio && p < m)) {
          faixa.dataset.peak = 'true';
        }
        barra.append(faixa);
        inicio = null;
      }
    }

    return el('div', { class: 'season-row' }, [
      el('span', { class: 'season-row-name', text: row.name }),
      barra,
      el('span', { class: 'season-status', 'data-state': row.state, text: row.statusLabel }),
    ]);
  }));
}

function renderDestaque(produto, rotuloMes) {
  if (!produto) { destaque.replaceChildren(); return; }

  const arte = el('div', { class: 'season-feature-art', html: artFor('hills') });

  destaque.replaceChildren(
    arte,
    el('p', { class: 'eyebrow', text: `Destaque de ${rotuloMes}` }),
    el('h3', { text: produto.name }),
    el('p', { text: produto.summary }),
    el('div', { class: 'season-feature-buy' }, [
      el('span', { class: 'price', text: brl(produto.priceCents) }),
      el('button', {
        class: 'btn btn--gold', type: 'button', text: 'Adicionar à sacola',
        onClick: async () => {
          await cart.add(produto.sku, 1);
          toast(`${produto.name} na sacola.`);
        },
      }),
    ])
  );
}

async function carregarPrateleira() {
  const grade = $('#prateleira');
  try {
    const { products } = await api.products();
    grade.replaceChildren(...products.slice(0, 8).map((p) => productCard(p)));
  } catch {
    grade.replaceChildren(el('p', { class: 'card-desc', text: 'Falha ao carregar a prateleira.' }));
  } finally {
    grade.setAttribute('aria-busy', 'false');
  }
}

/** Receita da semana: caixas marcadas somam e vao juntas para a sacola. */
async function carregarReceita() {
  const bloco = $('#bloco-receita');
  try {
    const receita = await api.recipe();
    const disponiveis = receita.ingredients.filter((i) => i.product);
    const marcados = new Map(disponiveis.map((i) => [i.sku, i.defaultChecked && i.product.inStock]));

    const botao = el('button', { class: 'btn btn--primary', type: 'button' });

    const atualizar = () => {
      const selecionados = disponiveis.filter((i) => marcados.get(i.sku));
      const total = selecionados.reduce((s, i) => s + i.product.priceCents, 0);
      botao.disabled = selecionados.length === 0;
      botao.textContent = selecionados.length
        ? `Adicionar ${selecionados.length} ${selecionados.length === 1 ? 'item' : 'itens'} · ${brl(total)}`
        : 'Marque ao menos um item';
    };

    const lista = el('div', { class: 'ingredient-list' }, disponiveis.map((ing) => {
      const disponivel = ing.product.inStock;
      const caixa = el('input', {
        type: 'checkbox', checked: marcados.get(ing.sku), disabled: !disponivel,
      });
      caixa.addEventListener('change', () => {
        marcados.set(ing.sku, caixa.checked);
        atualizar();
      });
      return el('label', { class: `ingredient${disponivel ? '' : ' ingredient--out'}` }, [
        caixa,
        el('span', { text: ing.product.name }),
        el('span', { class: 'price', text: disponivel ? brl(ing.product.priceCents) : 'fora de safra' }),
      ]);
    }));

    botao.addEventListener('click', async () => {
      const selecionados = disponiveis.filter((i) => marcados.get(i.sku));
      botao.disabled = true;
      for (const ing of selecionados) await cart.add(ing.sku, 1);
      toast(`${selecionados.length} ${selecionados.length === 1 ? 'item foi' : 'itens foram'} para a sacola.`);
      atualizar();
    });

    atualizar();

    bloco.replaceChildren(
      el('div', { class: 'recipe-art', html: artFor('canopy') }),
      el('div', { class: 'recipe-body' }, [
        el('p', { class: 'eyebrow eyebrow--mute', text: 'Receita da semana' }),
        el('h3', { text: receita.title }),
        el('p', { text: receita.intro }),
        lista,
        botao,
      ])
    );
  } catch {
    bloco.replaceChildren(el('p', { class: 'card-desc', text: 'Falha ao carregar a receita.' }));
  } finally {
    bloco.setAttribute('aria-busy', 'false');
  }
}

carregarSafra(mesAtual);
carregarPrateleira();
carregarReceita();
