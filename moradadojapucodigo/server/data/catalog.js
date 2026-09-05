/**
 * Catalogo da Morada do Japu.
 *
 * Todos os valores monetarios ficam em CENTAVOS e como inteiros. Preco em
 * ponto flutuante e a origem classica de divergencia de centavo entre o que a
 * loja mostra, o que o gateway cobra e o que a conciliacao espera; quando o
 * pagamento direto entrar, o total precisa fechar exatamente.
 *
 * Esta e a fonte da verdade do preco. O navegador nunca informa quanto custa
 * um item — ele manda apenas `sku` e `qty`, e o servidor recalcula.
 */

export const CATEGORIES = [
  { id: 'cacau',        name: 'Cacau',              order: 1 },
  { id: 'cupuacu',      name: 'Cupuaçu',            order: 2 },
  { id: 'desidratados', name: 'Frutas desidratadas', order: 3 },
  { id: 'compotas',     name: 'Compotas',           order: 4 },
  { id: 'temperos',     name: 'Temperos',           order: 5 },
  { id: 'kits',         name: 'Kits',               order: 6 },
];

const MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

export const PRODUCTS = [
  {
    sku: 'CAC-PO-150',
    slug: 'cacau-em-po-150g',
    name: 'Cacau em pó, 150 g',
    category: 'cacau',
    kicker: 'Cacau · 100% puro',
    summary: 'Torra média, amargor limpo. Rende cerca de 30 xícaras de chocolate quente.',
    description:
      'Amêndoas de cacau cabruca colhidas na sombra da Mata Atlântica sul-baiana, ' +
      'fermentadas em caixa de madeira, secas ao sol e torradas em lote pequeno. ' +
      'Sem açúcar, sem lecitina, sem gordura adicional — só cacau moído fino.',
    priceCents: 4880,
    weightGrams: 150,
    unitBase: 100,
    badge: { kind: 'safra', label: 'Safra 2025' },
    art: 'pouch',
    lot: 'CJ-25/04',
    inStock: true,
    seasonality: 'ano-todo',
    highlights: ['Torra média', 'Moagem fina', 'Sem açúcar'],
  },
  {
    sku: 'CAC-NIB-150',
    slug: 'nibs-de-cacau-150g',
    name: 'Nibs de cacau, 150 g',
    category: 'cacau',
    kicker: 'Cacau · fermentado e seco ao sol',
    summary: 'Crocante, para iogurte, granola e massa de bolo. Sem açúcar.',
    description:
      'A amêndoa quebrada em pedaços depois da torra. Crocante e amarga na medida, ' +
      'é o jeito mais direto de sentir o cacau que sai da roça aqui do lado.',
    priceCents: 4370,
    weightGrams: 150,
    unitBase: 100,
    badge: { kind: 'top', label: 'Mais vendido' },
    art: 'cacao',
    lot: 'NB-25/06',
    inStock: true,
    seasonality: 'ano-todo',
    highlights: ['Crocante', 'Sem açúcar', 'Seco ao sol'],
  },
  {
    sku: 'CAC-MTG-200',
    slug: 'manteiga-de-cacau-200g',
    name: 'Manteiga de cacau, 200 g',
    category: 'cacau',
    kicker: 'Cacau · prensada a frio',
    summary: 'Gordura pura da amêndoa, para chocolate caseiro e para a pele.',
    description:
      'Prensada a frio, sem refino e sem desodorização — por isso mantém o cheiro ' +
      'de cacau. Serve para temperar chocolate em casa e como base de cosmético.',
    priceCents: 8230,
    weightGrams: 200,
    unitBase: 100,
    art: 'butter',
    lot: 'MC-25/02',
    inStock: true,
    seasonality: 'ano-todo',
    highlights: ['Prensada a frio', 'Sem refino'],
  },
  {
    sku: 'CAC-CHA-100',
    slug: 'cha-de-casca-de-cacau-100g',
    name: 'Chá de casca de cacau, 100 g',
    category: 'cacau',
    kicker: 'Infusão · doce natural, sem cafeína',
    summary: 'A casca que sobra da torra vira chá adocicado. Sem cafeína.',
    description:
      'Aproveitamento integral: a casca separada na torra é seca e quebrada para ' +
      'infusão. Doce sozinha, lembra chocolate sem ser amarga.',
    priceCents: 2280,
    compareAtCents: 2720,
    weightGrams: 100,
    unitBase: 100,
    badge: { kind: 'promo', label: 'Promo' },
    art: 'pouch',
    lot: 'CH-25/07',
    inStock: true,
    seasonality: 'ano-todo',
    highlights: ['Sem cafeína', 'Aproveitamento integral'],
  },
  {
    sku: 'CUP-MTG-200',
    slug: 'manteiga-de-cupuacu-200g',
    name: 'Manteiga de cupuaçu, 200 g',
    category: 'cupuacu',
    kicker: 'Cupuaçu · prensada a frio',
    summary: 'Para a pele ou para a cozinha. Um pote dura cerca de 4 meses de uso diário.',
    description:
      'Prensada a frio do fruto que caiu maduro. Segura água na pele melhor que ' +
      'a maioria das manteigas vegetais e derrete na temperatura do corpo.',
    priceCents: 8230,
    weightGrams: 200,
    unitBase: 100,
    art: 'cupuacu',
    lot: 'MU-25/03',
    inStock: true,
    seasonality: 'disponivel',
    featuredMonth: 8, // setembro — destaque do almanaque
    highlights: ['Prensada a frio', 'Rende ~4 meses', 'Pele e cozinha'],
  },
  {
    sku: 'CUP-NIB-150',
    slug: 'nibs-de-cupuacu-150g',
    name: 'Nibs de cupuaçu, 150 g',
    category: 'cupuacu',
    kicker: 'Cupuaçu · torra leve',
    summary: 'Torra leve e moagem grossa, com acidez de fruta.',
    description:
      'A amêndoa de cupuaçu tratada como a de cacau: fermentada, seca e quebrada. ' +
      'Mais ácida e mais floral que o nib de cacau.',
    priceCents: 4590,
    weightGrams: 150,
    unitBase: 100,
    art: 'cupuacu',
    lot: 'NU-25/05',
    inStock: true,
    seasonality: 'disponivel',
    highlights: ['Torra leve', 'Acidez de fruta'],
  },
  {
    sku: 'DES-CUP-150',
    slug: 'cupuacu-desidratado-150g',
    name: 'Cupuaçu desidratado, 150 g',
    category: 'desidratados',
    kicker: 'Desidratado · sem açúcar',
    summary: 'Fruta desidratada em secador solar, sem açúcar e sem conservante.',
    description:
      'Polpa cortada e seca devagar, no secador solar da propriedade. Concentra o ' +
      'ácido do cupuaçu — quem gosta do fruto in natura reconhece na hora.',
    priceCents: 3890,
    weightGrams: 150,
    unitBase: 100,
    art: 'dried',
    lot: 'DC-25/08',
    inStock: true,
    seasonality: 'disponivel',
    highlights: ['Secador solar', 'Sem conservante'],
  },
  {
    sku: 'DES-BAN-150',
    slug: 'banana-desidratada-150g',
    name: 'Banana desidratada, 150 g',
    category: 'desidratados',
    kicker: 'Desidratado · doce sem açúcar',
    summary: 'Doce sem açúcar. Banana da roça, seca inteira.',
    description:
      'Banana-da-terra colhida madura e seca inteira, até virar doce por conta ' +
      'própria. Nada além da fruta.',
    priceCents: 2920,
    weightGrams: 150,
    unitBase: 100,
    art: 'dried',
    lot: 'DB-25/09',
    inStock: true,
    seasonality: 'ano-todo',
    highlights: ['Sem açúcar', 'Fruta inteira'],
  },
  {
    sku: 'DES-JAC-120',
    slug: 'jaca-desidratada-120g',
    name: 'Jaca desidratada, 120 g',
    category: 'desidratados',
    kicker: 'Desidratado · safra de verão',
    summary: 'Só sai enquanto a jaqueira está carregada. Volta em dezembro.',
    description:
      'Bagos separados um a um e secos sem açúcar. A jaqueira dá de dezembro a ' +
      'março, então esta é uma leva curta todo ano.',
    priceCents: 3350,
    weightGrams: 120,
    unitBase: 100,
    badge: { kind: 'soon', label: 'Volta em dezembro' },
    art: 'dried',
    inStock: false,
    returnsMonth: 11, // dezembro
    waitlistSeed: 12,
    seasonality: 'sazonal',
    highlights: ['Safra de verão'],
  },
  {
    sku: 'COM-JAB-280',
    slug: 'compota-de-jabuticaba-280g',
    name: 'Compota de jabuticaba',
    category: 'compotas',
    kicker: 'Compota · produção sazonal',
    summary: 'Feita só na safra, com fruta colhida no dia. Última leva saiu em 6 dias.',
    description:
      'A jabuticaba não espera: cai do pé e fermenta em dois dias. Por isso a ' +
      'compota é feita no mesmo dia da colheita, em panela aberta, e acaba rápido.',
    priceCents: 3220,
    weightGrams: 280,
    packLabel: 'pote 280 g',
    badge: { kind: 'soon', label: 'Volta em outubro' },
    art: 'jar',
    inStock: false,
    returnsMonth: 9, // outubro
    waitlistSeed: 37,
    seasonality: 'sazonal',
    highlights: ['Fruta colhida no dia', 'Panela aberta'],
  },
  {
    sku: 'COM-JAM-280',
    slug: 'compota-de-jambo-280g',
    name: 'Compota de jambo',
    category: 'compotas',
    kicker: 'Compota · produção sazonal',
    summary: 'Perfumada e leve. O jambeiro carrega de outubro a dezembro.',
    description:
      'Jambo-rosa em calda rala, para não cobrir o perfume da fruta. Fica bom com ' +
      'queijo curado tanto quanto com iogurte.',
    priceCents: 3450,
    weightGrams: 280,
    packLabel: 'pote 280 g',
    badge: { kind: 'soon', label: 'Volta em outubro' },
    art: 'jar',
    inStock: false,
    returnsMonth: 9,
    waitlistSeed: 9,
    seasonality: 'sazonal',
    highlights: ['Calda rala', 'Perfume de jambo'],
  },
  {
    sku: 'COM-JEN-280',
    slug: 'geleia-de-jenipapo-280g',
    name: 'Geleia de jenipapo',
    category: 'compotas',
    kicker: 'Geleia · produção sazonal',
    summary: 'Amarga e doce ao mesmo tempo. Volta em fevereiro.',
    description:
      'Fruta de gosto forte, difícil de achar fora da região. Cozida devagar até ' +
      'perder a adstringência sem perder o amargo.',
    priceCents: 3680,
    weightGrams: 280,
    packLabel: 'pote 280 g',
    badge: { kind: 'soon', label: 'Volta em fevereiro' },
    art: 'jar',
    inStock: false,
    returnsMonth: 1, // fevereiro
    waitlistSeed: 21,
    seasonality: 'sazonal',
    highlights: ['Sabor regional', 'Cozimento lento'],
  },
  {
    sku: 'TEM-PIM-60',
    slug: 'pimenta-agroflorestal-60g',
    name: 'Pimenta agroflorestal em pó, 60 g',
    category: 'temperos',
    kicker: 'Tempero · seca e moída na roça',
    summary: 'Ardida e defumada, seca no mesmo forno do cacau.',
    description:
      'Pimenta plantada no meio do cacaual, seca no forno depois da torra — pega ' +
      'um defumado leve que não existe na pimenta comprada pronta.',
    priceCents: 2450,
    weightGrams: 60,
    unitBase: 100,
    art: 'pouch',
    lot: 'PM-25/01',
    inStock: true,
    seasonality: 'ano-todo',
    highlights: ['Defumada', 'Moída na roça'],
  },
  {
    sku: 'KIT-CAC-3',
    slug: 'kit-cacau-da-mata',
    name: 'Kit cacau da mata (3 itens)',
    category: 'kits',
    kicker: 'Kit · cacau em pó, nibs e chá',
    summary: 'Os três cacaus da casa numa caixa só, com desconto de kit.',
    description:
      'Cacau em pó 150 g, nibs 150 g e chá de casca 100 g. Sai por menos que os ' +
      'três avulsos e vai numa caixa que aguenta o correio.',
    priceCents: 10900,
    compareAtCents: 11530,
    bundleOf: ['CAC-PO-150', 'CAC-NIB-150', 'CAC-CHA-100'],
    art: 'box',
    inStock: true,
    seasonality: 'ano-todo',
    highlights: ['3 produtos', 'Embalagem reforçada'],
  },
];

/**
 * Calendario da safra da direcao B. Cada linha marca em quais meses a
 * especie esta dando, e qual e o pico. `MONTHS` da os rotulos das abas.
 */
export const SEASON_CALENDAR = [
  { id: 'cacau',   name: 'Cacau e derivados', months: [1,1,1,1,1,1,1,1,1,1,1,1], peak: [4,5,6], skus: ['CAC-PO-150','CAC-NIB-150','CAC-MTG-200','CAC-CHA-100'] },
  { id: 'cupuacu', name: 'Cupuaçu',           months: [1,1,1,0,0,0,0,1,1,1,1,1], peak: [1,2],   skus: ['CUP-MTG-200','CUP-NIB-150','DES-CUP-150'] },
  { id: 'banana',  name: 'Banana desidratada',months: [1,1,1,1,1,1,1,1,1,1,1,1], peak: [6,7],   skus: ['DES-BAN-150'] },
  { id: 'jaca',    name: 'Jaca',              months: [1,1,1,0,0,0,0,0,0,0,0,1], peak: [0,1],   skus: ['DES-JAC-120'] },
  { id: 'jabuticaba', name: 'Jabuticaba',     months: [0,0,0,0,0,0,0,0,0,1,1,0], peak: [9,10],  skus: ['COM-JAB-280'] },
  { id: 'jambo',   name: 'Jambo',             months: [0,0,0,0,0,0,0,0,0,1,1,1], peak: [10],    skus: ['COM-JAM-280'] },
  { id: 'jenipapo',name: 'Jenipapo',          months: [0,1,1,1,0,0,0,0,0,0,0,0], peak: [2],     skus: ['COM-JEN-280'] },
];

/** Receita da semana — o bloco com caixas de selecao da direcao B. */
export const RECIPE_OF_WEEK = {
  slug: 'chocolate-quente-de-cacau-puro',
  title: 'Chocolate quente de cacau puro',
  intro:
    'Três ingredientes que já estão na loja. Marque o que falta na sua despensa ' +
    'e mande tudo para a sacola de uma vez.',
  ingredients: [
    { sku: 'CAC-PO-150',  defaultChecked: true },
    { sku: 'CAC-NIB-150', defaultChecked: true },
    { sku: 'CAC-MTG-200', defaultChecked: false },
  ],
};

export const MONTH_LABELS = MONTHS;

/* --- Indices ------------------------------------------------------------- */

const bySku = new Map(PRODUCTS.map((p) => [p.sku, p]));
const bySlug = new Map(PRODUCTS.map((p) => [p.slug, p]));

export function getProductBySku(sku) {
  return bySku.get(String(sku ?? '').toUpperCase()) ?? null;
}

export function getProductBySlug(slug) {
  return bySlug.get(String(slug ?? '').toLowerCase()) ?? null;
}

export function countAvailable() {
  return PRODUCTS.filter((p) => p.inStock).length;
}
