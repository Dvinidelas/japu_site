# Segurança — modelo de ameaça e decisões

Documento de referência da camada de segurança. O contexto que define o nível
de exigência: a loja vai receber **pagamento direto**. A partir do momento em
que existe cobrança na página, o custo de uma falha deixa de ser uma página
feia e passa a ser dinheiro e dado de cliente.

## As ameaças que orientaram o desenho

### 1. Adulteração de preço no cliente

**A ameaça.** Abrir o console, mudar o preço no `localStorage` ou no corpo da
requisição, e fechar o pedido pagando um centavo. É o ataque mais comum contra
loja pequena, e não exige nenhuma habilidade especial.

**A defesa.** O navegador manda **apenas `sku` e `qty`**. Preço, subtotal,
desconto, frete e total são recalculados em `server/lib/pricing.js` a partir de
`server/data/catalog.js`. Nenhuma rota lê preço vindo do cliente.

Coberto por `test/api.test.mjs` ("o servidor ignora qualquer preço enviado pelo
cliente") e por um cenário E2E que adultera o `localStorage` com
`{qty: 999, priceCents: 1}` e confirma que o total sai correto e limitado.

Valores ficam em **centavos inteiros** o tempo todo. `0.1 + 0.2 !== 0.3` em
ponto flutuante, e a divergência de centavo entre o que a loja mostra, o que o
gateway cobra e o que a conciliação espera é um problema clássico.

### 2. XSS numa página com pagamento

**A ameaça.** Qualquer script injetado na página de checkout consegue ler o que
a pessoa digita, inclusive dado de cartão, e mandar para fora.

**A defesa.** CSP com **nonce por requisição**, sem `unsafe-inline` e sem
`unsafe-eval`. Script sem o nonce daquela requisição não executa — o que
neutraliza a maior parte do XSS refletido e armazenado. `script-src-attr 'none'`
bloqueia `onclick="..."` no HTML. `object-src` e `base-uri` em `'none'`.

No código da interface, nada vindo da API é concatenado em `innerHTML`: o
helper `el()` em `public/js/ui.js` usa `textContent`, que não interpreta
marcação. `innerHTML` só é usado para SVG do próprio repositório.

A CSP é conferida por teste, e o E2E derruba a suíte a qualquer violação — ou
seja, a política é validada contra a aplicação real, não só contra o cabeçalho.

### 3. Clickjacking sobre o botão de pagar

**A ameaça.** Embutir a loja num iframe transparente sobre outra página, para
que o clique da vítima caia no botão de confirmar pedido.

**A defesa.** `frame-ancestors 'none'` na CSP e `X-Frame-Options: DENY`.

### 4. CSRF

**A ameaça.** Um site qualquer dispara requisição autenticada para a loja
usando o cookie da vítima.

**A defesa.** Double-submit cookie: o token vai num cookie legível pela própria
origem e precisa ser reenviado no cabeçalho `X-CSRF-Token`. Um site terceiro
consegue disparar a requisição, mas **não consegue ler** o cookie para
preencher o cabeçalho. A comparação usa `crypto.timingSafeEqual`, para não
vazar o token por diferença de tempo. Em produção há conferência adicional de
`Origin`.

### 5. Abuso automatizado

**A ameaça.** Varredura de catálogo, spam na lista de espera, e — o mais caro —
disparo repetido de checkout, que vira custo por transação no gateway.

**A defesa.** Rate limiting graduado por rota: leitura 120/min, escrita 20/min,
checkout 8/min. A lista de espera tem **honeypot** (campo invisível que só robô
preenche). Corpo de requisição limitado a 32 KB.

`TRUST_PROXY` é `false` por padrão de propósito: ligado sem proxy reverso na
frente, qualquer visitante forja o próprio IP no `X-Forwarded-For` e esgota o
limite de todos os outros.

### 6. Vazamento de segredo

**A ameaça.** Chave secreta do gateway acabar num objeto de configuração que o
frontend lê.

**A defesa.** `publicConfig()` em `server/config.js` é o **único** caminho por
onde configuração chega ao cliente, e ele lista explicitamente o que sai. Há
teste conferindo que `secretKey`, `webhookSecret` e `sessionSecret` não
aparecem em `/api/config`.

Em produção o servidor **se recusa a subir** sem `SESSION_SECRET` forte. Em
desenvolvimento gera um efêmero por processo — assim ninguém comita uma chave
"de teste" que acabe valendo em produção.

Resposta de erro nunca traz stack trace: o log completo fica no servidor, a
resposta é enxuta.

### 7. Cobrança duplicada

**A ameaça.** Duplo clique no botão de pagar, ou retry de rede, gerando dois
pedidos e duas cobranças.

**A defesa.** Chave de idempotência gerada no cliente (`crypto.randomUUID()`) e
enviada em `Idempotency-Key`. O servidor guarda a resposta por 15 minutos e
devolve a mesma, marcada com `replayed: true`, em vez de criar outro pedido.

### 8. Webhook forjado

**A ameaça.** Alguém descobre a URL do webhook e manda "pagamento aprovado".

**A defesa.** Toda notificação passa por verificação de assinatura HMAC antes
de mudar qualquer estado, com comparação em tempo constante e rejeição de
assinatura com mais de 5 minutos (proteção contra replay). O corpo cru é
preservado, porque reserializar o JSON quebra a assinatura. A resposta de
rejeição não detalha o motivo — não ajuda quem está sondando.

## Dado pessoal

A lista de espera guarda o **hash HMAC** do e-mail, não o e-mail. A contagem
pública ("37 pessoas na fila") não precisa do endereço, e uma leitura indevida
dessa estrutura não entrega uma lista de e-mails para spam.

Ao migrar para banco, manter a mesma postura: e-mail cifrado em repouso, e
nunca em log.

## O que ainda NÃO está resolvido

Honestidade sobre o estado atual:

1. **Não há persistência.** Pedidos e lista de espera vivem em memória e somem
   quando o processo reinicia. É o bloqueio número um para ligar pagamento.
2. **Rate limit é por processo.** Com mais de uma instância, o limite efetivo
   multiplica. Precisa de Redis quando escalar.
3. **Não há autenticação de cliente.** Não é necessário para o fluxo atual
   (pedido por e-mail), mas se surgir "minha conta", é projeto próprio.
4. **Não há registro de auditoria.** Quando houver dinheiro envolvido, é
   preciso log estruturado e imutável de mudança de estado de pedido.
5. **Estoque não é reservado.** Dois pedidos simultâneos do último item passam
   os dois. Precisa de controle transacional no banco.

## Checklist antes de produção

- [ ] `SESSION_SECRET` forte, único, fora do Git
- [ ] HTTPS com certificado válido (HSTS já liga sozinho em produção)
- [ ] `PUBLIC_ORIGIN` apontando para o domínio real
- [ ] `TRUST_PROXY=true` **somente** se houver proxy reverso
- [ ] Pedidos em banco, com o valor conferido contra o webhook
- [ ] `npm run test:all` verde
- [ ] Backup automatizado do banco
- [ ] Dependências auditadas (`npm audit`) e atualizadas
