import { NextResponse } from 'next/server';
import { connectDB, OrderModel, MedicationModel } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import mongoose from 'mongoose';
import { logger } from '@/lib/logger';
import { metrics } from '@/lib/metrics';

export async function GET(req: Request) {
  const startTime = Date.now();
  metrics.incrementCounter('http_requests_total', { method: 'GET', path: '/api/orders' });

  const user = await getAuthUser();
  if (!user) {
    metrics.observeHistogram('http_request_duration_ms', Date.now() - startTime, { path: '/api/orders' });
    return NextResponse.json({ error: 'Auth' }, { status: 401 });
  }
  await connectDB();
  const { searchParams } = new URL(req.url);
  const filter = user.role === 'ADMIN' && searchParams.get('admin') ? {} : { user: user._id };
  const orders = await OrderModel.find(filter).sort({ createdAt: -1 });

  metrics.observeHistogram('http_request_duration_ms', Date.now() - startTime, { path: '/api/orders' });
  return NextResponse.json(orders);
}

export async function POST(req: Request) {
  const startTime = Date.now();
  metrics.incrementCounter('http_requests_total', { method: 'POST', path: '/api/orders' });

  const user = await getAuthUser();
  if (!user) {
    metrics.observeHistogram('http_request_duration_ms', Date.now() - startTime, { path: '/api/orders' });
    return NextResponse.json({ error: 'Auth' }, { status: 401 });
  }

  await connectDB();

  const { items, total, promocode } = await req.json();
  let appliedDiscount = 0;
  let appliedPromoId: string | undefined;
  let finalTotal = total;

  if (promocode) {
    try {
      const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
      const res = await fetch(`${base}/api/promos/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promocode, total })
      });
      const data = await res.json();
      if (res.ok && data && data.valid) {
        appliedDiscount = data.discount || 0;
        appliedPromoId = data.promoId;
        finalTotal = Math.max(0, Math.round((total - appliedDiscount) * 100) / 100);
      } else {
        const reason = data?.reason || data?.error || 'Invalid promocode';
        return NextResponse.json({ error: reason }, { status: 400 });
      }
    } catch (err) {
      logger.warn('promo.validation_error', { error: err instanceof Error ? err.message : String(err) });
      return NextResponse.json({ error: 'Promo validation failed' }, { status: 400 });
    }
  }
  const MAX_RETRIES = 50;
  let retryCount = 0;

  if (items && items.length === 1) {
    while (retryCount < MAX_RETRIES) {
      try {
        const item = items[0];
        const med = await MedicationModel.findOneAndUpdate(
          { _id: item.medication, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { new: true }
        );

        if (!med) throw new Error('Недостатньо товару');

        const order = await OrderModel.create({
          user: user._id,
          items,
          total: finalTotal,
          status: 'PENDING'
        });

        if (appliedPromoId) {
          try {
            await (await import('@/lib/db')).PromoModel.findByIdAndUpdate(appliedPromoId, { $inc: { timesUsed: 1 } });
          } catch {}
        }

        logger.info('order.created', { user_id: user._id.toString(), order_id: order._id.toString(), total });
        metrics.observeHistogram('http_request_duration_ms', Date.now() - startTime, { path: '/api/orders' });
        return NextResponse.json(order);
      } catch (error: unknown) {
        let isRetryable = false;
        if (error && typeof error === 'object') {
          const errCode = (error as Record<string, unknown>).code;
          const errMsg = (error as Error).message;
          isRetryable = errCode === 112 || errMsg?.includes('Write conflict') || errCode === 11000;
        }

        if (isRetryable && retryCount < MAX_RETRIES - 1) {
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, Math.random() * 100 * retryCount));
          continue;
        }
        const message = error instanceof Error ? error.message : 'Failed';
        logger.error('order.creation_failed', { user_id: user._id.toString(), error_message: message });
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }
  }

  while (retryCount < MAX_RETRIES) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      if (!items || items.length === 0) {
        throw new Error('Кошик порожній');
      }

      for (const item of items) {
        const med = await MedicationModel.findOneAndUpdate(
          { _id: item.medication, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { session, new: true }
        );

        if (!med) throw new Error('Недостатньо товару');
      }

        const order = await OrderModel.create([{
        user: user._id,
        items,
        total: finalTotal,
        status: 'PENDING'
      }], { session });

      if (appliedPromoId) {
        try {
          await (await import('@/lib/db')).PromoModel.findByIdAndUpdate(appliedPromoId, { $inc: { timesUsed: 1 } }, { session });
        } catch {}
      }

      await session.commitTransaction();
      session.endSession();

      logger.info('order.created', { user_id: user._id.toString(), order_id: order[0]._id.toString(), total });
      metrics.observeHistogram('http_request_duration_ms', Date.now() - startTime, { path: '/api/orders' });
      return NextResponse.json(order[0]);
    } catch (error: unknown) {
      await session.abortTransaction();
      session.endSession();

      let isWriteConflict = false;
      if (error && typeof error === 'object') {
        const errCode = (error as Record<string, unknown>).code;
        const errMsg = (error as Error).message;

        interface MongoError extends Error {
          hasErrorLabel?: (label: string) => boolean;
        }
        const mongoErr = error as MongoError;
        const isTransient = typeof mongoErr.hasErrorLabel === 'function' ? mongoErr.hasErrorLabel('TransientTransactionError') : false;

        isWriteConflict = errCode === 112 || errMsg?.includes('Write conflict') || isTransient;
      }

      if (isWriteConflict && retryCount < MAX_RETRIES - 1) {
        retryCount++;
        const delay = Math.min(1000, Math.pow(1.5, retryCount) * 20 + Math.random() * 100);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      const message = error instanceof Error ? error.message : 'Failed';
      logger.error('order.creation_failed', { user_id: user._id.toString(), error_message: message });
      metrics.observeHistogram('http_request_duration_ms', Date.now() - startTime, { path: '/api/orders' });
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
  return NextResponse.json({ error: 'System busy' }, { status: 429 });
}

export async function DELETE() {
  const startTime = Date.now();
  metrics.incrementCounter('http_requests_total', { method: 'DELETE', path: '/api/orders' });

  const user = await getAuthUser();
  if (!user) {
    metrics.observeHistogram('http_request_duration_ms', Date.now() - startTime, { path: '/api/orders' });
    return NextResponse.json({ error: 'Auth' }, { status: 401 });
  }

  await connectDB();
  await OrderModel.deleteMany({ user: user._id });

  metrics.observeHistogram('http_request_duration_ms', Date.now() - startTime, { path: '/api/orders' });
  return new NextResponse(null, { status: 204 });
}
