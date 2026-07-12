import { NextResponse } from 'next/server';
import { connectDB, PromoModel } from '@/lib/db';
import { metrics } from '@/lib/metrics';
import { logger } from '@/lib/logger';
import { calculateDiscount } from '@/lib/promo';

export async function POST(req: Request) {
  const startTime = Date.now();
  metrics.incrementCounter('http_requests_total', { method: 'POST', path: '/api/promos/validate' });

  try {
    const { code, total } = await req.json();
    if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

    await connectDB();
    const promo = await PromoModel.findOne({ code: code.trim().toUpperCase() });
    if (!promo || !promo.active) return NextResponse.json({ valid: false, reason: 'Not found or inactive' });

    const now = new Date();
    if (promo.expiresAt && promo.expiresAt < now) return NextResponse.json({ valid: false, reason: 'Expired' });
    if (promo.maxUses && promo.timesUsed && promo.timesUsed >= promo.maxUses) return NextResponse.json({ valid: false, reason: 'Usage limit' });
    if (promo.minTotal && typeof total === 'number' && total < promo.minTotal) return NextResponse.json({ valid: false, reason: 'Minimum total not met' });

    const { discount, newTotal } = calculateDiscount(promo, total);

    metrics.observeHistogram('http_request_duration_ms', Date.now() - startTime, { path: '/api/promos/validate' });
    return NextResponse.json({ valid: true, discount, newTotal, promoId: promo._id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed';
    logger.error('promos.validate_failed', { error_message: message });
    metrics.observeHistogram('http_request_duration_ms', Date.now() - startTime, { path: '/api/promos/validate' });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
