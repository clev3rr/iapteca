import { describe, it, expect } from 'vitest';
import { calculateDiscount } from '@/lib/promo';
import type { PromoCode } from '@/lib/types';

describe('calculateDiscount', () => {
  it('calculates percent discount correctly', () => {
    const promo = { type: 'PERCENT', value: 10 } as Partial<PromoCode>;
    const { discount, newTotal } = calculateDiscount(promo, 200);
    expect(discount).toBe(20);
    expect(newTotal).toBe(180);
  });

  it('calculates fixed amount discount correctly', () => {
    const promo = { type: 'AMOUNT', value: 15 } as Partial<PromoCode>;
    const { discount, newTotal } = calculateDiscount(promo, 50);
    expect(discount).toBe(15);
    expect(newTotal).toBe(35);
  });

  it('caps fixed discount at total', () => {
    const promo = { type: 'AMOUNT', value: 100 } as Partial<PromoCode>;
    const { discount, newTotal } = calculateDiscount(promo, 40);
    expect(discount).toBe(40);
    expect(newTotal).toBe(0);
  });

  it('returns zero for missing promo', () => {
    const { discount, newTotal } = calculateDiscount(undefined as unknown as Partial<PromoCode>, 80);
    expect(discount).toBe(0);
    expect(newTotal).toBe(80);
  });
});
