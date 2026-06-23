"use client";
import { useState } from 'react';
import { useCartStore } from '@/lib/store/cartStore';
import { useAuthStore } from '@/lib/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CreditCard, CheckCircle2 } from 'lucide-react';

export default function CheckoutPage() {
  const { items, clearCart } = useCartStore();
  const { user } = useAuthStore();
  const router = useRouter();
  const total = items.reduce((a, i) => a + i.price * i.quantity, 0);
  const [promoCode, setPromoCode] = useState('');
  const [applied, setApplied] = useState<{ code: string; promoId?: string; discount: number; newTotal: number } | null>(null);
  const [validating, setValidating] = useState(false);

  const handleOrder = async () => {
    if (!user) return router.push('/login');
    try {
      type OrderPayload = { items: { medication: string; quantity: number; price: number }[]; total: number; user: string; promocode?: string };
      const payload: OrderPayload = {
        items: items.map(i => ({ medication: i._id, quantity: i.quantity, price: i.price })),
        total: applied ? applied.newTotal : total,
        user: user._id,
      };
      if (applied?.code) payload.promocode = applied.code;

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Замовлення успішно створено');
        clearCart();
        router.push('/profile');
      } else {
        toast.error(data.error || 'Помилка при створенні замовлення');
      }
    } catch {
      toast.error('Сталася мережева помилка');
    }
  };

  if (items.length === 0) return <div className="p-20 text-center opacity-50 font-sans">Кошик порожній</div>;

  return (
    <div className="container mx-auto py-8 px-4 max-w-lg space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><CreditCard className="w-6 h-6" /> Оформлення замовлення</h1>
      <div className="border rounded-xl p-6 space-y-4 shadow-sm bg-card">
        <div className="space-y-2">
          {items.map(i => (
            <div key={i._id} className="flex justify-between text-sm">
              <span className="opacity-80">{i.name} x{i.quantity}</span>
              <span className="font-medium">{i.price * i.quantity} ₴</span>
            </div>
          ))}
        </div>
        <div className="pt-4 space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Промокод (за бажанням)" value={promoCode} onChange={e => setPromoCode(e.target.value)} />
            {!applied ? (
              <Button onClick={async () => {
                if (!promoCode) return toast.error('Введіть код');
                setValidating(true);
                try {
                  const res = await fetch('/api/promos/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: promoCode, total }) });
                  const data = await res.json();
                  if (res.ok && data.valid) {
                    setApplied({ code: promoCode.trim().toUpperCase(), promoId: data.promoId, discount: data.discount, newTotal: data.newTotal });
                    toast.success('Промокод застосовано');
                  } else {
                    toast.error(data.reason || data.error || 'Невірний код');
                  }
                } catch {
                  toast.error('Мережева помилка');
                } finally { setValidating(false); }
              }} disabled={validating}>Застосувати</Button>
            ) : (
              <Button variant="outline" onClick={() => { setApplied(null); setPromoCode(''); }}>Видалити</Button>
            )}
          </div>

          <div className="border-t pt-2 font-bold flex justify-between text-lg">
            <span>Разом:</span>
            <span className="text-primary">{applied ? `${applied.newTotal} ₴` : `${total} ₴`}</span>
          </div>

          {applied && (
            <div className="text-sm text-green-700">Знижка: -{applied.discount} ₴</div>
          )}
        </div>
      </div>
      <Button className="w-full h-12 text-lg font-bold shadow-lg" onClick={handleOrder}>
        <CheckCircle2 className="w-5 h-5 mr-2" /> Підтвердити замовлення
      </Button>
    </div>
  );
}
