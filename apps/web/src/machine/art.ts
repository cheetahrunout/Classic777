// The reel symbols, drawn as SVG on the shared gradients in index.html.
import type { Sym } from '@classic777/shared';

function barsSvg(n: number): string {
  const h = n === 1 ? 30 : n === 2 ? 25 : 20;
  const gap = 5;
  const total = n * h + (n - 1) * gap;
  let y = (80 - total) / 2;
  let out = '';
  for (let i = 0; i < n; i++, y += h + gap) {
    out += `<rect x="9" y="${y}" width="82" height="${h}" rx="4" fill="#141113" stroke="url(#g-gold)" stroke-width="2"/>` +
      `<text x="50" y="${y + h * 0.79}" text-anchor="middle" font-family="'Alfa Slab One', Georgia, serif" font-size="${h * 0.82}" letter-spacing="2" fill="#f7f1e1">BAR</text>`;
  }
  return out;
}

const ART: Record<Sym, string> = {
  SEVEN:
    `<text x="50" y="74" text-anchor="middle" font-family="'Alfa Slab One', Georgia, serif" font-size="86" fill="none" stroke="url(#g-gold)" stroke-width="9" stroke-linejoin="round">7</text>` +
    `<text x="50" y="74" text-anchor="middle" font-family="'Alfa Slab One', Georgia, serif" font-size="86" fill="url(#g-seven)" stroke="#4d0308" stroke-width="2.5" stroke-linejoin="round">7</text>`,
  BAR3: barsSvg(3),
  BAR2: barsSvg(2),
  BAR1: barsSvg(1),
  BELL:
    `<path d="M50 8 C33 8 28 26 28 42 C28 50 24 55 19 60 L81 60 C76 55 72 50 72 42 C72 26 67 8 50 8 Z" fill="url(#g-gold)" stroke="#6b4206" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<path d="M38 20 C34 28 34 38 34 46" fill="none" stroke="#fffbe0" stroke-width="4" stroke-linecap="round" opacity=".7"/>` +
    `<rect x="16" y="58" width="68" height="7" rx="3.5" fill="url(#g-gold)" stroke="#6b4206" stroke-width="2"/>` +
    `<circle cx="50" cy="71" r="7" fill="url(#g-gold)" stroke="#6b4206" stroke-width="2"/>` +
    `<circle cx="50" cy="7" r="4.5" fill="url(#g-gold)" stroke="#6b4206" stroke-width="2"/>`,
  CHERRY:
    `<path d="M36 50 C40 32 50 18 62 10 M66 48 C64 32 63 20 62 10" fill="none" stroke="#2f6b1c" stroke-width="3.5" stroke-linecap="round"/>` +
    `<path d="M62 10 C70 2 84 4 88 12 C78 16 68 16 62 10 Z" fill="#3f9a2a" stroke="#1f4d12" stroke-width="1.5"/>` +
    `<circle cx="35" cy="59" r="16" fill="url(#g-cherry)" stroke="#4d0308" stroke-width="2"/>` +
    `<circle cx="66" cy="57" r="16" fill="url(#g-cherry)" stroke="#4d0308" stroke-width="2"/>` +
    `<ellipse cx="29" cy="53" rx="4" ry="2.6" fill="#fff" opacity=".75"/>` +
    `<ellipse cx="60" cy="51" rx="4" ry="2.6" fill="#fff" opacity=".75"/>`,
  BLANK: '',
};

export const svgFor = (id: Sym) => `<svg viewBox="0 0 100 80" aria-hidden="true">${ART[id]}</svg>`;
