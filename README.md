# Morada do Japu — frontend da loja

Reconstrução do frontend de [moradadojapu.com.br](https://www.moradadojapu.com.br/)
a partir da proposta apresentada nos seis slides, com API de loja própria e
camada de segurança preparada para receber pagamento direto.

```bash
npm install
cp .env.example .env        # opcional em dev
npm run dev                 # http://localhost:3000
npm run test:all            # 38 testes de API/segurança + 30 cenários no navegador
```

## Os cinco pontos da proposta, e onde cada um vive

| # | Mudança | Implementação |
|---|---|---|
| 1 | A floresta aparece antes do preço | `public/index.html` — herói escuro "Dossel", faixa de 5 selos, citação |
| 2 | Catálogo organizado por categoria | `public/js/pages/loja.js` — 6 categorias, filtro na URL, contagem ao vivo |
| 3 | Esgotado vira lista de espera | `public/js/ui.js` (`openWaitlist`) + `POST /api/waitlist` — captura e-mail e sugere alternativa |
| 4 | Frete calculado antes do checkout | `public/js/pages/produto.js` + `POST /api/shipping/quote` — CEP fica salvo entre produtos |
| 5 | Compra de um toque no celular | `public/produto.html` — barra fixa com preço, parcelamento e botão |

As duas direções visuais dos slides também estão montadas: **Dossel** (escura,
sombra do cacau cabruca) na home, e **Almanaque da safra** (calendário de 12
meses interativo, prateleira do mês, receita da semana) em `/safra`.

## Rotas

| Página | Rota |
|---|---|
| Home (direção A) | `/` |
| Loja com filtros | `/loja`, `/loja?categoria=cacau` |
| Produto | `/produto/<slug>` |
| Almanaque da safra (direção B) | `/safra` |
| Sacola e fechamento | `/sacola` |
| A proposta (antes e depois) | `/proposta` |

### API

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/config` | Configuração pública (nunca traz segredo) |
| GET | `/api/products` | Catálogo, com `?category=` e `?inStock=` |
| GET | `/api/products/:slug` | Produto + alternativas da mesma categoria |
| GET | `/api/categories` | Categorias com contagem disponível/total |
| GET | `/api/season` | Calendário da safra, com `?month=0..11` |
| GET | `/api/recipe` | Receita da semana com os ingredientes |
| POST | `/api/cart/validate` | Revalida a sacola e devolve os preços reais |
| POST | `/api/shipping/quote` | Cotação de frete por CEP |
| POST | `/api/waitlist` | Entra na lista de espera de um produto |
| POST | `/api/checkout/session` | Monta o pedido e abre a sessão de pagamento |
| POST | `/api/payments/webhook` | Recebe confirmação do gateway (assinatura conferida) |

Toda rota `POST` exige token anti-CSRF e passa por validação de esquema.

## Segurança

Detalhes e o passo a passo para ligar cobrança estão em
[`docs/PAGAMENTO.md`](docs/PAGAMENTO.md) e [`docs/SEGURANCA.md`](docs/SEGURANCA.md).
O resumo:

- **CSP com nonce por requisição**, sem `unsafe-inline` nem `unsafe-eval` — a
  defesa que realmente importa numa página que vai ter formulário de pagamento.
- **Preço sempre recalculado no servidor.** O navegador só manda `sku` e `qty`.
  Há teste que adultera o `localStorage` e confirma que o total não muda.
- **CSRF** por double-submit cookie com comparação em tempo constante.
- **Rate limiting graduado**: leitura 120/min, escrita 20/min, checkout 8/min.
- **Validação de entrada por esquema** (zod) em toda rota de escrita; chave
  extra no corpo é descartada.
- **Segredos só no servidor.** `publicConfig()` é o único caminho de saída de
  configuração, e há teste travando isso.
- **Idempotência** no checkout: duplo clique não vira segundo pedido.
- **Webhook com assinatura verificada** e proteção contra replay.

Estado do pagamento: **desligado** (`PAYMENT_PROVIDER=none`). A loja registra o
pedido, gera um código e manda finalizar pelo WhatsApp — o comportamento de
hoje. Ligar cobrança é preencher credenciais e implementar um método; o
frontend não muda.

## Estrutura

```
server/
  index.js              servidor, injeção de nonce, includes de parciais
  config.js             configuração e segredos (falha em prod sem SESSION_SECRET)
  data/catalog.js       14 produtos, categorias, calendário de safra, receita
  lib/security.js       CSP, CSRF, rate limit, validação
  lib/pricing.js        preço autoritativo, frete, montagem do pedido
  lib/payments.js       adaptador de gateway (esqueleto) e idempotência
  lib/money.js          aritmética em centavos
  routes/api.js         rotas da API
public/
  css/                  tokens, base, componentes
  js/                   api, cart, ui, art + um módulo por página
  partials/             cabeçalho e rodapé (fonte única)
  *.html                páginas
test/
  api.test.mjs          23 testes de catálogo, preço, frete, checkout
  security.test.mjs     15 testes de CSP, CSRF, validação e vazamento
  e2e.mjs               30 cenários em Chromium real, com CSP ligada
  shots.mjs             capturas de tela das páginas (npm run shots)
docs/
  PAGAMENTO.md          passo a passo para ligar cobrança
  SEGURANCA.md          modelo de ameaça e checklist de produção
```

## Ambiente de teste local

```bash
npm run dev        # servidor com recarga automática
npm test           # API + segurança (Node test runner, sem dependência externa)
npm run test:e2e   # Chromium real: menus, filtros, sacola, calendário, checkout
npm run test:all   # tudo
```

O E2E derruba a suíte a qualquer erro de console, falha de requisição ou
**violação de CSP** — ou seja, ele prova que a política restritiva não quebrou
nenhuma funcionalidade. Ele usa o Chromium já instalado em
`/opt/pw-browsers/chromium`; para apontar outro, use `CHROMIUM_PATH=...`.

## O que falta antes de ir ao ar

1. **Persistir pedidos em banco.** Hoje o pedido só existe na resposta HTTP.
   É pré-requisito para ligar pagamento — sem isso o webhook chega e não há o
   que atualizar.
2. **Conferir catálogo real.** Preços, pesos e textos vieram dos slides.
3. **Fotos.** As ilustrações são SVG desenhado; trocar pelas fotos da roça.
4. **Lista de espera em banco.** Hoje é memória — reinicia com o processo.
   O e-mail já é guardado como hash, não em texto puro.
