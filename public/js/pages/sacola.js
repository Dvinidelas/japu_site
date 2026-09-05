/**
 * Fechamento de pedido.
 *
 * O total mostrado aqui e sempre o que voltou do servidor. O cliente escolhe
 * CEP, opcao de envio e informa nome e e-mail; preco, frete e total sao
 * recalculados em /api/checkout/session antes de qualquer cobranca.
 */
import { api, brl } from '../api.js';
import { boot, $, el, toast } from '../ui.js';
import { artFor } from '../art.js';
import { cart } from '../cart.js';

boot();

const itens = $('#itens');
const opcoesFrete = $('#opcoes-frete');
const totais = $('#totais');
const form = $('#form-pedido');
const botao = $('#botao-pagar');
const erroCep = $('#erro-cep');
const erroForm = $('#erro-form');
const campoCep = $('#cep');

let cotacao = null;
let opcaoEscolhida = 'economico';
let configPublica = { paymentEnabled: false };

/* --- Configuracao publica (nunca traz segredo) ---------------------------- */
api.config()
  .then((cfg) => {
    configPublica = cfg;
    $('#aviso-pagamento').textContent = cfg.paymentEnabled
      ? 'Pagamento processado pelo gateway. Seus dados de cartão não passam por este site.'
      : 'O pagamento direto no site ainda não está ativo — você recebe um código para finalizar pelo WhatsApp.';
    if (!cfg.paymentEnabled) botao.textContent = 'Gerar código do pedido';
  })
  .catch(() => { /* segue com o padrao conservador */ });

/* --- Itens ----------------------------------------------------------------- */

// Depois que o pedido fecha a sacola esvazia — mas o "sua sacola está vazia"
// não deve cobrir a confirmação que a pessoa acabou de receber.
let pedidoFechado = false;

cart.subscribe((snapshot) => {
  if (pedidoFechado) return;

  if (!snapshot.lines?.length) {
    itens.replaceChildren(el('div', { class: 'empty-state' }, [
      el('p', { text: 'Sua sacola está vazia.' }),
      el('a', { class: 'btn btn--primary', href: '/loja', text: 'Ver a loja' }),
    ]));
    form.hidden = true;
    totais.replaceChildren();
    return;
  }

  form.hidden = false;
  itens.replaceChildren(...snapshot.lines.map((linha) =>
    el('div', { class: 'line-item' }, [
      el('div', { class: 'line-item-media', html: artFor(linha.art) }),
      el('div', {}, [
        el('h3', {}, [el('a', { href: `/produto/${linha.slug}`, text: linha.name })]),
        el('span', { class: 'price', text: `${brl(linha.unitPriceCents)} × ${linha.qty}` }),
        el('div', { class: 'line-item-foot' }, [
          el('span', { class: 'price', text: brl(linha.lineTotalCents) }),
          el('button', { class: 'line-remove', type: 'button', text: 'Remover',
                         onClick: () => cart.remove(linha.sku) }),
        ]),
      ]),
    ])
  ));

  for (const recusado of snapshot.rejected ?? []) {
    itens.append(el('p', { class: 'field-hint', text: recusado.message }));
  }

  itens.setAttribute('aria-busy', 'false');
  renderTotais(snapshot);
  // Se o CEP ja estava salvo, recotar com o novo peso da sacola.
  if (campoCep.value) cotarFrete();
});

/* --- Frete ----------------------------------------------------------------- */

campoCep.addEventListener('input', () => {
  const d = campoCep.value.replace(/\D/g, '').slice(0, 8);
  campoCep.value = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  if (d.length === 8) cotarFrete();
});

try {
  const salvo = localStorage.getItem('japu.cep');
  if (salvo) { campoCep.value = salvo; cotarFrete(); }
} catch { /* modo privado */ }

async function cotarFrete() {
  const cep = campoCep.value;
  if (cep.replace(/\D/g, '').length !== 8) return;
  if (!cart.items.length) return;

  erroCep.textContent = '';
  try {
    cotacao = await api.quoteShipping({ cep, items: cart.items });
    try { localStorage.setItem('japu.cep', cep); } catch { /* modo privado */ }

    opcoesFrete.replaceChildren(...cotacao.options.map((op) => {
      const radio = el('input', {
        type: 'radio', name: 'frete', value: op.id,
        checked: op.id === opcaoEscolhida,
      });
      radio.addEventListener('change', () => {
        opcaoEscolhida = op.id;
        renderTotais(cart.snapshot);
      });
      return el('label', { class: 'ship-option' }, [
        radio,
        el('span', { text: `${op.label} · ${op.businessDays} dias úteis` }),
        el('span', { class: 'price', text: op.priceCents === 0 ? 'grátis' : brl(op.priceCents) }),
      ]);
    }));
    renderTotais(cart.snapshot);
  } catch (err) {
    cotacao = null;
    opcoesFrete.replaceChildren();
    erroCep.textContent = err.message;
    renderTotais(cart.snapshot);
  }
}

function renderTotais(snapshot) {
  const frete = cotacao?.options.find((o) => o.id === opcaoEscolhida) ?? null;
  const subtotal = snapshot.subtotalCents ?? 0;

  totais.replaceChildren(
    el('div', { class: 'totals-row' }, [
      el('span', { text: `Subtotal (${snapshot.itemCount ?? 0} ${snapshot.itemCount === 1 ? 'item' : 'itens'})` }),
      el('span', { class: 'price', text: brl(subtotal) }),
    ]),
    snapshot.savingsCents
      ? el('div', { class: 'totals-row' }, [
          el('span', { text: 'Você economiza' }),
          el('span', { class: 'price', text: `− ${brl(snapshot.savingsCents)}` }),
        ])
      : null,
    el('div', { class: 'totals-row' }, [
      el('span', { text: 'Frete' }),
      frete
        ? el('span', { class: 'price', text: frete.priceCents === 0 ? 'grátis' : brl(frete.priceCents) })
        : el('span', { class: 'price-unit', text: 'informe o CEP' }),
    ]),
    el('div', { class: 'totals-row totals-row--grand' }, [
      el('span', { text: 'Total' }),
      el('span', { class: 'price', text: brl(subtotal + (frete?.priceCents ?? 0)) }),
    ])
  );
}

/* --- Envio do pedido -------------------------------------------------------- */

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  erroForm.textContent = '';

  const nome = $('#nome').value.trim();
  const email = $('#email').value.trim();

  if (!cotacao) { erroCep.textContent = 'Informe um CEP válido para calcular o frete.'; campoCep.focus(); return; }
  if (nome.length < 2) { erroForm.textContent = 'Informe seu nome.'; $('#nome').focus(); return; }
  if (!$('#email').checkValidity()) { erroForm.textContent = 'Confira o e-mail digitado.'; $('#email').focus(); return; }

  botao.disabled = true;
  const rotuloOriginal = botao.textContent;
  botao.textContent = 'Processando…';

  try {
    // Chave de idempotencia: duplo clique ou retry de rede nao gera
    // segundo pedido nem, mais adiante, segunda cobranca.
    const chave = crypto.randomUUID();
    const resposta = await api.checkout({
      items: cart.items,
      cep: campoCep.value,
      shippingOptionId: opcaoEscolhida,
      customer: { name: nome, email },
    }, chave);

    mostrarConfirmacao(resposta);
    await cart.clear();
  } catch (err) {
    erroForm.textContent = err.message;
    toast(err.message, 'error');
  } finally {
    botao.disabled = false;
    botao.textContent = rotuloOriginal;
  }
});

function mostrarConfirmacao({ order, payment }) {
  pedidoFechado = true;
  const bloco = $('#pedido-confirmado');
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(
    `Olá! Quero finalizar o pedido ${order.reference} (${brl(order.totalCents)}) da Morada do Japu.`
  )}`;

  bloco.replaceChildren(el('div', { class: 'order-done' }, [
    el('p', { class: 'eyebrow eyebrow--mute', text: 'Pedido registrado' }),
    el('h2', { text: 'Tudo certo com a sua sacola' }),
    el('p', { class: 'order-ref', text: order.reference }),
    el('p', { text: payment.message }),
    el('div', { class: 'totals' }, [
      el('div', { class: 'totals-row' }, [
        el('span', { text: 'Itens' }), el('span', { class: 'price', text: brl(order.subtotalCents) })]),
      el('div', { class: 'totals-row' }, [
        el('span', { text: `${order.shipping.label} · ${order.shipping.businessDays} dias úteis` }),
        el('span', { class: 'price', text: order.shipping.free ? 'grátis' : brl(order.shipping.priceCents) })]),
      el('div', { class: 'totals-row totals-row--grand' }, [
        el('span', { text: 'Total' }), el('span', { class: 'price', text: brl(order.totalCents) })]),
    ]),
    payment.redirectUrl
      ? el('a', { class: 'btn btn--primary btn--block', href: payment.redirectUrl, text: 'Ir para o pagamento' })
      : el('a', { class: 'btn btn--primary btn--block', href: whatsapp, rel: 'noopener noreferrer',
                  target: '_blank', text: 'Finalizar pelo WhatsApp' }),
  ]));

  bloco.hidden = false;
  form.hidden = true;
  itens.replaceChildren();
  bloco.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
