import { NextResponse } from 'next/server';
import { connectDB, PromoModel } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { metrics } from '@/lib/metrics';

export async function GET() {
  const startTime = Date.now();
  metrics.incrementCounter('http_requests_total', { method: 'GET', path: '/api/admin/promocodes' });

  try {
    const user = await getAuthUser();
    if (user?.role !== 'ADMIN') throw new Error('Unauthorized');

    await connectDB();
    const promos = await PromoModel.find().sort({ createdAt: -1 });

    metrics.observeHistogram('http_request_duration_ms', Date.now() - startTime, { path: '/api/admin/promocodes' });
    return NextResponse.json(promos);
  } catch (error) {
    logger.warn('admin.promocodes_access_denied', { error: error instanceof Error ? error.message : String(error) });
    metrics.observeHistogram('http_request_duration_ms', Date.now() - startTime, { path: '/api/admin/promocodes' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
}

export async function POST(req: Request) {
  const startTime = Date.now();
  metrics.incrementCounter('http_requests_total', { method: 'POST', path: '/api/admin/promocodes' });

  const user = await getAuthUser();
  if (user?.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  try {
    const body = await req.json();
    if (!body.code || !body.type || typeof body.value !== 'number') return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

    await connectDB();
    const promo = await PromoModel.create({
      code: String(body.code).trim().toUpperCase(),
      type: body.type,
      value: body.value,
      minTotal: body.minTotal,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      maxUses: body.maxUses,
      active: body.active !== false,
    });

    metrics.observeHistogram('http_request_duration_ms', Date.now() - startTime, { path: '/api/admin/promocodes' });
    return NextResponse.json(promo);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed';
    logger.error('admin.promocodes_create_failed', { error_message: message });
    metrics.observeHistogram('http_request_duration_ms', Date.now() - startTime, { path: '/api/admin/promocodes' });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
