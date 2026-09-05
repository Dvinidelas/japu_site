/** Home — destaques da semana e prévia do calendário da safra. */
import { api, brl } from '../api.js';
import { boot, productCard, $, el } from '../ui.js';
import { artFor } from '../art.js';

boot();

// Folhagem do dossel atrás do herói.
const heroArt = $('[data-art="canopy"]');
if (heroArt) heroArt.innerHTML = artFor('canopy');

async function loadDestaques() {
  const grid = $('#destaques');
  try {
    const { products } = await api.products({ inStock: 'true' });
    // Os quatro primeiros disponíveis, como no mockup da direção A.
    grid.replaceChildren(...products.slice(0, 4).map((p) => productCard(p)));
  } catch {
    grid.replaceChildren(el('p', { class: 'card-desc',
      text: 'Não foi possível carregar os produtos agora. Recarregue a página.' }));
  } finally {
    grid.setAttribute('aria-busy', 'false');
  }
}

async function loadTeaser() {
  const list = $('#teaser-safra');
  if (!list) return;
  try {
    const { rows } = await api.season();
    list.replaceChildren(...rows.slice(0, 6).map((row) =>
      el('li', {}, [
        el('span', { text: row.name }),
        el('span', { class: 'season-status', 'data-state': row.state, text: row.statusLabel }),
      ])
    ));
  } catch { /* prévia é opcional */ }
}

loadDestaques();
loadTeaser();
