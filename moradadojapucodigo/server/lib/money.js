/** Aritmetica de dinheiro em centavos inteiros — nada de ponto flutuante. */

export function formatBRL(cents) {
  const value = (Number(cents) / 100).toFixed(2).replace('.', ',');
  return `R$ ${value.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/** Preco por 100 g, para a comparacao "R$ 32,50 / 100 g" do mockup. */
export function unitPriceCents(priceCents, weightGrams, base = 100) {
  if (!weightGrams || weightGrams <= 0) return null;
  return Math.round((priceCents / weightGrams) * base);
}

export function sumCents(values) {
  return values.reduce((acc, n) => acc + Math.round(n), 0);
}
