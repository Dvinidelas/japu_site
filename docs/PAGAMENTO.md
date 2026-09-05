# Ligando o pagamento direto no site

Este documento é o passo a passo para sair de `PAYMENT_PROVIDER=none` (estado
atual: o pedido é registrado e finalizado pelo WhatsApp) para cobrança direta
na loja. A estrutura já está montada — o que falta é decisão comercial,
credenciais e a implementação de um método.

## O princípio que não muda

**Dado de cartão nunca toca este servidor.**

O fluxo é sempre um destes dois:

1. **Checkout hospedado** — a pessoa é redirecionada para a página do gateway,
   paga lá e volta. Mais simples, menos controle visual.
2. **Tokenização no navegador** — o SDK do gateway captura o cartão dentro de
   um iframe do próprio gateway e devolve um *token*. O site manda o token, não
   o número do cartão.

Os dois mantêm a loja no escopo **SAQ-A** ou **SAQ-A-EP** do PCI DSS, que é um
questionário de autoavaliação. Se o número do cartão passar pelo servidor, o
escopo vira **SAQ-D**, com auditoria anual e varredura trimestral — inviável
para uma operação deste porte.

## O que já está pronto

| Peça | Onde | Estado |
|---|---|---|
| Preço autoritativo no servidor | `server/lib/pricing.js` | pronto |
| Montagem e conferência do pedido | `buildOrder()` | pronto |
| Limites de sanidade (qtd., linhas, teto) | `server/config.js` | pronto |
| Chave de idempotência | `server/lib/payments.js` | pronto |
| Verificação de assinatura de webhook | `mercadoPagoAdapter.verifyWebhook` | pronto |
| Hosts do gateway na CSP | `server/lib/security.js` | pronto |
| Rota do webhook com corpo cru | `server/index.js` | pronto |
| Chamada real à API do gateway | `createSession()` | **falta** |
| Persistência do pedido | — | **falta (hoje é memória)** |

## Passo a passo

### 1. Escolher o provedor

Para o Brasil, com Pix e cartão:

- **Mercado Pago** — maior alcance, Pix nativo, taxa alta. Adaptador já
  esboçado em `server/lib/payments.js`.
- **Pagar.me / Stripe** — taxas melhores em volume, integração mais técnica.

A CSP já tem a lista de hosts liberados de cada um. Trocar de provedor é mudar
`PAYMENT_PROVIDER` e implementar um adaptador.

### 2. Preencher as credenciais

No `.env` (que **não** vai para o Git):

```
PAYMENT_PROVIDER=mercadopago
PAYMENT_PUBLIC_KEY=APP_USR-...      # pode ir ao navegador
PAYMENT_SECRET_KEY=APP_USR-...      # NUNCA sai do servidor
PAYMENT_WEBHOOK_SECRET=...          # NUNCA sai do servidor
```

`publicConfig()` em `server/config.js` é o único caminho por onde configuração
chega ao cliente, e ele só deixa passar `PAYMENT_PUBLIC_KEY`. O teste
`/api/config não expõe nenhum segredo` trava isso.

### 3. Implementar `createSession()`

No adaptador, montar a preferência de pagamento **a partir do objeto `order`**
que veio de `buildOrder()` — nunca de valores enviados pelo cliente:

```js
async createSession(order, { customer }) {
  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.payments.secretKey}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': order.reference,
    },
    body: JSON.stringify({
      items: order.lines.map((l) => ({
        title: l.name,
        quantity: l.qty,
        unit_price: l.unitPriceCents / 100,  // valor do servidor
        currency_id: 'BRL',
      })),
      shipments: { cost: order.shipping.priceCents / 100, mode: 'not_specified' },
      payer: { name: customer.name, email: customer.email },
      external_reference: order.reference,
      notification_url: `${config.publicOrigin}/api/payments/webhook`,
      back_urls: {
        success: `${config.publicOrigin}/sacola?pedido=${order.reference}`,
        failure: `${config.publicOrigin}/sacola?erro=1`,
      },
    }),
  });
  const pref = await res.json();
  return { status: 'redirect', reference: order.reference,
           totalCents: order.totalCents, redirectUrl: pref.init_point };
}
```

A interface em `public/js/pages/sacola.js` já trata `redirectUrl`: se vier
preenchido, o botão vira "Ir para o pagamento"; se vier `null`, cai no
WhatsApp. Nada muda no frontend.

### 4. Persistir o pedido antes de cobrar

Este é o item que **falta e é obrigatório**. Hoje o pedido existe só na
resposta HTTP. Antes de ligar cobrança, é preciso uma tabela `orders` com, no
mínimo:

```
reference (único)  status  total_cents  lines(jsonb)  shipping(jsonb)
customer_email     provider_payment_id  created_at    updated_at
```

Sem isso, o webhook de confirmação chega e não há o que atualizar — o dinheiro
entra e o pedido não existe.

Recomendado: SQLite com `node:sqlite` (já vem no Node 22) para começar, ou
Postgres se houver mais de um processo.

### 5. Tratar o webhook

A rota `/api/payments/webhook` já recebe o corpo cru e valida a assinatura
antes de qualquer coisa. Ao implementar, respeitar:

- **Confira o valor.** O webhook informa quanto foi pago. Compare com
  `order.total_cents` do banco. Divergência = não libere o pedido.
- **Seja idempotente.** O gateway reenvia o mesmo evento várias vezes. Guarde
  o id do evento e ignore repetidos.
- **Responda 200 rápido.** Processamento pesado vai para fila; gateway que
  recebe timeout reenvia.
- **Nunca confie no retorno do navegador.** `back_urls` é conveniência visual.
  Só o webhook, com assinatura conferida, muda o status para pago.

### 6. Antes de abrir para o público

- [ ] HTTPS com certificado válido (HSTS já está ligado em produção)
- [ ] `SESSION_SECRET` forte e único, fora do Git
- [ ] `TRUST_PROXY=true` **apenas** se houver proxy reverso na frente
- [ ] Pedido persistido em banco, não em memória
- [ ] Webhook conferindo valor e sendo idempotente
- [ ] Rodar `npm run test:all` e ver tudo verde
- [ ] Testar no *sandbox* do gateway: pagamento aprovado, recusado, e
      abandonado no meio
- [ ] Backup do banco de pedidos
- [ ] Política de privacidade e trocas publicadas (exigência do CDC para
      e-commerce, e a maioria dos gateways cobra na aprovação do cadastro)

## O que NÃO fazer

- Não guardar número de cartão, CVV ou validade — em lugar nenhum, nem
  "temporariamente", nem em log.
- Não confiar em preço, frete ou total vindos do navegador. `buildOrder()`
  existe exatamente para isso e há teste cobrindo.
- Não liberar pedido pelo retorno do `back_urls` — é trivial de forjar.
- Não pôr `PAYMENT_SECRET_KEY` em variável que o frontend leia.
- Não afrouxar a CSP para "resolver rápido" um script do gateway que não
  carrega. Adicione o host específico na lista de `gatewayHosts`.
