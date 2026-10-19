import { describe, expect, it } from 'vitest';
import { formatEuro, formatTokenAmount, formatTokenBalance, tokensValueCents } from '../src/index.ts';

describe('money on screen (section 7)', () => {
  it('writes euro Dutch style', () => {
    expect(formatEuro(1250)).toBe('€ 12,50');
    expect(formatEuro(123456)).toBe('€ 1.234,56');
    expect(formatEuro(5)).toBe('€ 0,05');
    expect(formatEuro(100000000)).toBe('€ 1.000.000,00');
  });

  it('shows a token balance as whole tokens, rounded down', () => {
    expect(formatTokenBalance(12_999_900)).toBe('12 tok');
    expect(formatTokenBalance(999_999)).toBe('0 tok');
    expect(formatTokenBalance(1_234_000_000)).toBe('1.234 tok');
  });

  it('shows small amounts with four decimals at most, rounded down', () => {
    expect(formatTokenAmount(51_990)).toBe('0,0519 tok');
    expect(formatTokenAmount(500_000)).toBe('0,5 tok');
    expect(formatTokenAmount(2_500_000)).toBe('2 tok');
  });

  it('values tokens at the rate', () => {
    // 50 tokens at € 1,0664 per token
    expect(tokensValueCents(50_000_000, 1_066_400)).toBe(5332);
  });
});
