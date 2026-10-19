// Money is written the way the casino writes it: euro Dutch style, tokens rounded down.

function groupThousands(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 123456 -> "€ 1.234,56". */
export function formatEuro(cents: number): string {
  const c = Math.round(cents);
  const sign = c < 0 ? '-' : '';
  const abs = Math.abs(c);
  const whole = groupThousands(String(Math.floor(abs / 100)));
  return `${sign}€ ${whole},${String(abs % 100).padStart(2, '0')}`;
}

/** A balance: whole tokens, fraction dropped. 12_999_900 -> "12 tok". */
export function formatTokenBalance(micro: number): string {
  return `${groupThousands(String(Math.floor(Math.max(0, micro) / 1e6)))} tok`;
}

/** A bet or win: below one token up to four decimals, always rounded down. */
export function formatTokenAmount(micro: number): string {
  const m = Math.max(0, Math.floor(micro));
  if (m >= 1e6) return formatTokenBalance(m);
  const tenThousandths = Math.floor(m / 100);
  const frac = String(tenThousandths).padStart(4, '0').replace(/0+$/, '');
  return `0${frac ? ',' + frac : ''} tok`;
}

/** Euro cents a token amount is worth at a rate (micro-euro per token). */
export function tokensValueCents(micro: number, rateMicro: number): number {
  return Math.floor((micro * rateMicro) / 1e10);
}
