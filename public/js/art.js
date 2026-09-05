/**
 * Ilustracoes de produto em SVG inline.
 *
 * Sao vetores e nao fotos por dois motivos: o mockup usa desenho chapado, e
 * SVG inline nao gera requisicao extra nem depende de CDN de imagem — o que
 * mantem a CSP fechada em img-src 'self'.
 * Quando as fotos reais da roca entrarem, basta trocar por <img> aqui.
 */

const svg = (body, viewBox = '0 0 120 140', fit = 'meet') =>
  `<svg viewBox="${viewBox}" preserveAspectRatio="xMidYMid ${fit}" role="img" ` +
  `aria-hidden="true" focusable="false">${body}</svg>`;

export const ART = {
  /** Saco kraft com rotulo escuro e selo verde — cacau em po, cha, pimenta. */
  pouch: () => svg(`
    <path d="M24 26h72l6 92a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6z" fill="#d9bd94"/>
    <path d="M24 26h72l2 30H22z" fill="#c7a87c"/>
    <rect x="34" y="52" width="52" height="44" rx="3" fill="#2f2015"/>
    <circle cx="60" cy="70" r="11" fill="#d9bd94"/>
    <path d="M54 70c0-4 3-7 6-7s6 3 6 7-3 7-6 7-6-3-6-7z" fill="#2f2015"/>
    <circle cx="84" cy="92" r="9" fill="#2f6b34"/>
    <path d="M80 92l3 3 6-6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M24 20h72v8H24z" fill="#a98a5f"/>
  `),

  /** Amendoa/fruto de cacau — laranja queimado, com nervura central. */
  cacao: () => svg(`
    <ellipse cx="60" cy="70" rx="27" ry="50" fill="#c8551f"/>
    <ellipse cx="60" cy="70" rx="27" ry="50" fill="none" stroke="#a8441a" stroke-width="1.5"/>
    <path d="M60 22c-6 16-6 80 0 96" stroke="#e0703a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M44 40c-4 20-4 44 0 62M76 40c4 20 4 44 0 62" stroke="#a8441a" stroke-width="1.5" fill="none" opacity=".6"/>
  `),

  /** Pote de manteiga — tampa larga, conteudo claro e cremoso. */
  butter: () => svg(`
    <rect x="26" y="52" width="68" height="62" rx="8" fill="#efe3cd"/>
    <rect x="26" y="52" width="68" height="62" rx="8" fill="none" stroke="#d3c1a2" stroke-width="1.5"/>
    <rect x="22" y="34" width="76" height="22" rx="6" fill="#5b4326"/>
    <rect x="22" y="34" width="76" height="8" rx="4" fill="#6d5231"/>
    <ellipse cx="60" cy="82" rx="22" ry="14" fill="#fbf3e3"/>
    <path d="M46 84c5-7 23-7 28 0" stroke="#e0cfae" stroke-width="2" fill="none" stroke-linecap="round"/>
  `),

  /** Pote de compota — vidro com conteudo escuro e tampa verde. */
  jar: () => svg(`
    <rect x="30" y="40" width="60" height="76" rx="7" fill="#e8a54a"/>
    <rect x="30" y="40" width="60" height="76" rx="7" fill="none" stroke="#c9862f" stroke-width="1.5"/>
    <rect x="34" y="24" width="52" height="18" rx="4" fill="#2f5c30"/>
    <rect x="38" y="60" width="44" height="34" rx="3" fill="#f2e6d2"/>
    <circle cx="52" cy="74" r="4.5" fill="#5b2340"/>
    <circle cx="66" cy="80" r="4.5" fill="#5b2340"/>
    <circle cx="60" cy="68" r="3.5" fill="#7a3355"/>
  `),

  /** Cupuacu — fruto marrom e ovalado, com folha. */
  cupuacu: () => svg(`
    <ellipse cx="60" cy="80" rx="34" ry="38" fill="#6b4227"/>
    <ellipse cx="50" cy="70" rx="13" ry="17" fill="#7d4f2f" opacity=".75"/>
    <path d="M60 42c0-12 3-20 3-20s3 8 3 20z" fill="#3f6b32"/>
    <path d="M63 42V24" stroke="#2f5228" stroke-width="1.5"/>
  `),

  /** Fruta desidratada — rodelas empilhadas. */
  dried: () => svg(`
    <ellipse cx="45" cy="86" rx="26" ry="22" fill="#d9a24e"/>
    <ellipse cx="45" cy="86" rx="16" ry="13" fill="#e8bd77"/>
    <ellipse cx="74" cy="66" rx="26" ry="22" fill="#c98f3d"/>
    <ellipse cx="74" cy="66" rx="16" ry="13" fill="#dfae66"/>
    <ellipse cx="58" cy="46" rx="24" ry="20" fill="#e0a955"/>
    <ellipse cx="58" cy="46" rx="14" ry="11" fill="#eec384"/>
  `),

  /** Caixa de kit, com fita atravessando as duas faces. */
  box: () => svg(`
    <path d="M22 52l38-18 38 18v52l-38 18-38-18z" fill="#c7a87c"/>
    <path d="M22 52l38 18v52l-38-18z" fill="#b2946a"/>
    <path d="M98 52l-38 18v52l38-18z" fill="#d3b68c"/>
    <path d="M22 52l38 18 38-18" fill="none" stroke="#a98a5f" stroke-width="1.5"/>
    <path d="M41 43l38 18v52l-6 3V64L35 46z" fill="#2f6b34" opacity=".9"/>
    <path d="M60 70v52" stroke="#a98a5f" stroke-width="1.5"/>
  `),

  /** Folhagem do dossel — fundo das secoes escuras. */
  canopy: () => svg(`
    <rect width="400" height="260" fill="#16240f"/>
    <g fill="#26401b" opacity=".95">
      <ellipse cx="60" cy="40" rx="52" ry="13" transform="rotate(-24 60 40)"/>
      <ellipse cx="190" cy="26" rx="58" ry="12" transform="rotate(16 190 26)"/>
      <ellipse cx="330" cy="58" rx="50" ry="13" transform="rotate(-12 330 58)"/>
      <ellipse cx="110" cy="120" rx="60" ry="14" transform="rotate(10 110 120)"/>
      <ellipse cx="270" cy="140" rx="56" ry="13" transform="rotate(-18 270 140)"/>
      <ellipse cx="40" cy="200" rx="54" ry="12" transform="rotate(22 40 200)"/>
      <ellipse cx="200" cy="216" rx="62" ry="14" transform="rotate(-8 200 216)"/>
      <ellipse cx="350" cy="196" rx="48" ry="12" transform="rotate(14 350 196)"/>
    </g>
    <g fill="#33512a" opacity=".8">
      <ellipse cx="140" cy="70" rx="44" ry="10" transform="rotate(-30 140 70)"/>
      <ellipse cx="300" cy="104" rx="46" ry="11" transform="rotate(20 300 104)"/>
      <ellipse cx="70" cy="158" rx="42" ry="10" transform="rotate(-14 70 158)"/>
      <ellipse cx="240" cy="178" rx="44" ry="10" transform="rotate(26 240 178)"/>
    </g>
  `, '0 0 400 260', 'slice'),

  /** Morro da Mata Atlantica — usado no destaque do almanaque. */
  hills: () => svg(`
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#c8c39a"/>
        <stop offset="100%" stop-color="#8a9a6d"/>
      </linearGradient>
    </defs>
    <rect width="400" height="260" fill="url(#sky)"/>
    <path d="M0 168c60-52 110-30 168 8 52 34 118 10 232-34v118H0z" fill="#3f5d3a"/>
    <path d="M0 210c74-42 138-22 214 14 46 22 118 4 186-26v62H0z" fill="#27401f"/>
  `, '0 0 400 260', 'slice'),
};

export function artFor(kind) {
  return (ART[kind] ?? ART.pouch)();
}
