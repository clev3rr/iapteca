import { NextResponse } from 'next/server';
import { connectDB, PromoModel } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (user?.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const id = (await params).id;
  await connectDB();
  await PromoModel.findByIdAndDelete(id);
  return new NextResponse(null, { status: 204 });
}
