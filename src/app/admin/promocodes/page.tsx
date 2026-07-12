'use client';
import { useState, useEffect } from 'react';
import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { PromoCode as PromoType } from '@/lib/types';
import { Trash, PlusCircle } from 'lucide-react';

export default function PromoAdmin() {
  const [promos, setPromos] = useState<PromoType[]>([]);
  const [code, setCode] = useState('');
  const [type, setType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [value, setValue] = useState<number>(0);

  const load = () => fetch('/api/admin/promocodes').then(res => res.json()).then(setPromos);
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      const res = await fetch('/api/admin/promocodes', { method: 'POST', body: JSON.stringify({ code, type, value }), headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (res.ok) {
        toast.success('Промокод створено');
        setCode(''); setValue(0);
        load();
      } else {
        toast.error(data.error || 'Помилка при створенні');
      }
    } catch {
      toast.error('Мережева помилка');
    }
  };

  const del = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/promocodes/${id}`, { method: 'DELETE' });
      if (res.status === 204) {
        toast.success('Видалено');
        load();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Помилка при видаленні');
      }
    } catch {
      toast.error('Мережева помилка');
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2"><PlusCircle className="w-6 h-6" /> Промокоди</h1>

      <div className="grid grid-cols-3 gap-2 max-w-lg">
        <Input placeholder="Код" value={code} onChange={e => setCode(e.target.value)} />
        <select className="h-9 rounded-md border px-2" value={type} onChange={e => setType(e.target.value as 'PERCENT' | 'AMOUNT')}>
          <option value="PERCENT">% Знижка</option>
          <option value="AMOUNT">Фіксована</option>
        </select>
        <Input type="number" placeholder="Значення" value={value} onChange={e => setValue(Number(e.target.value))} />
      </div>
      <Button onClick={create}>Додати</Button>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Код</TableHead>
            <TableHead>Тип</TableHead>
            <TableHead>Значення</TableHead>
            <TableHead className="text-right">Дія</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {promos.map(p => (
            <TableRow key={p._id}>
              <TableCell>{p.code}</TableCell>
              <TableCell>{p.type}</TableCell>
              <TableCell>{p.value}</TableCell>
              <TableCell className="text-right"><Button size="sm" variant="destructive" onClick={() => del(p._id)}><Trash className="w-4 h-4 mr-2" /> Видалити</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
