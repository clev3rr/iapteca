import { PromoCode } from './types';

export function calculateDiscount(promo: Partial<PromoCode>, total: number) {
  if (!promo || typeof total !== 'number') return { discount: 0, newTotal: total };
  let discount = 0;
  if (promo.type === 'PERCENT') {
    discount = Math.round((total * ((promo.value || 0) / 100)) * 100) / 100;
  } else {
    discount = Math.round(Math.min(promo.value || 0, total) * 100) / 100;
  }
  const newTotal = Math.max(0, Math.round((total - discount) * 100) / 100);
  return { discount, newTotal };
}
