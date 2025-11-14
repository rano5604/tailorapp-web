'use client';

import OrdersList from '@/components/OrdersList';
import type { MapFns } from '@/components/OrdersList';

// Client-side mapping fns (safe to create here)
const nameOf: MapFns['nameOf'] = (o: any) =>
    o.customerName || o.customer?.name || o.name || `Order #${o.id ?? ''}`;

const descOf: MapFns['descOf'] = (o: any) =>
    o.itemTitle ||
    o.items?.[0]?.itemType?.nameEn ||
    o.orderItems?.[0]?.itemType?.nameEn ||
    o.items?.[0]?.nameEn ||
    o.orderItems?.[0]?.nameEn ||
    'Item';

const countOf: MapFns['countOf'] = (o: any) =>
    o.itemsCount ??
    (Array.isArray(o.items) ? o.items.length
        : Array.isArray(o.orderItems) ? o.orderItems.length
            : 0);

const dueOf: MapFns['dueOf'] = (o: any) =>
    o.deliveryDate || o.expectedDelivery || o.dueDate || o.remainingDeliveryDate || '';

const amountOf: MapFns['amountOf'] = (o: any) =>
    (Number(o.total ?? o.makingChargeTotal ?? o.grandTotal ?? o.amount ?? 0)).toLocaleString();

const photoOf: MapFns['photoOf'] = (o: any) => o.customer?.photoUrl || o.photoUrl || null;

export default function OrdersAllList({
                                          title = 'All Orders',
                                          items,
                                      }: {
    title?: string;
    items: any[];
}) {
    return (
        <OrdersList
            title={title}
            items={items}
            mapFns={{ nameOf, photoOf, descOf, countOf, dueOf, amountOf }}
        />
    );
}
