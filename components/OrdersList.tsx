'use client';

import React from 'react';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import styles from './OrderList.module.css';

export type OrderLike = Record<string, any>;

export type MapFns = {
    nameOf?: (o: any) => string;
    photoOf?: (o: any) => string | null | undefined; // fallback avatar
    descOf?: (o: any) => string; // not used in this design
    countOf?: (o: any) => number; // optional custom counter
    dueOf?: (o: any) => string | null | undefined;
    amountOf?: (o: any) => string | number;
};

function firstNonEmpty(...vals: Array<unknown>): string | undefined {
    for (const v of vals) {
        if (v === undefined || v === null) continue;
        const s = String(v).trim();
        if (!s || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null') continue;
        return s;
    }
    return undefined;
}

// Prefer orderId (e.g., "1-20251113-0007"), then code-like, then id
function slugOf(o: any): string | undefined {
    return firstNonEmpty(o.orderId, o.code, o.orderCode, o.order_no, o.orderNo, o.order_id, o.id);
}

// Build proxied image URL so auth headers/cookies are attached by the server
function proxied(src?: string | null) {
    if (!src) return null;
    return `/api/proxy/image?src=${encodeURIComponent(src)}`;
}

// Try to pick a cloth photo for the thumbnail
function clothPhotoOf(o: any): string | null {
    // from first item’s first measurement group
    const it = Array.isArray(o.items) && o.items.length ? o.items[0] : Array.isArray(o.orderItems) && o.orderItems.length ? o.orderItems[0] : null;
    const mg = it && Array.isArray(it.measurementGroups) && it.measurementGroups.length ? it.measurementGroups[0] : null;
    const raw =
        mg?.clothPhoto ||
        it?.clothPhoto ||
        o.clothPhoto ||
        o.thumbnail ||
        o.photoUrl ||
        null;
    const absOrRel = raw && /^https?:\/\//i.test(raw) ? raw : raw; // allow absolute or relative
    const px = proxied(absOrRel || undefined);
    return px || null;
}

function itemNamesOf(o: any): string {
    // collect item display names from items/orderItems
    const items: any[] = Array.isArray(o.items)
        ? o.items
        : Array.isArray(o.orderItems)
            ? o.orderItems
            : [];

    const names = items
        .map((it) =>
            firstNonEmpty(
                it.itemName,
                it.title,
                it.itemType?.nameEn,
                it.nameEn,
                it.type?.nameEn,
                it.type
            )
        )
        .filter(Boolean) as string[];

    // If none found, fallback to singular title on root
    if (names.length === 0) {
        const root = firstNonEmpty(
            o.itemTitle,
            o.title,
            o.items?.[0]?.itemType?.nameEn,
            o.orderItems?.[0]?.itemType?.nameEn,
            o.items?.[0]?.nameEn,
            o.orderItems?.[0]?.nameEn
        );
        return root || 'Item';
    }

    // Deduplicate and join first two (match “Salwar, Kameez” feel)
    const uniq: string[] = [];
    for (const n of names) if (!uniq.includes(n)) uniq.push(n);
    return uniq.slice(0, 2).join(', ');
}

function defaultNameOf(o: any) {
    return o.customerName || o.customer?.name || o.name || '—';
}
function defaultPhotoOf(o: any) {
    return o.customer?.photoUrl || o.photoUrl || null;
}
function defaultDueOf(o: any) {
    return o.deliveryDate || o.expectedDelivery || o.dueDate || o.remainingDeliveryDate || null;
}
function defaultAmountOf(o: any) {
    const n = Number(o.total ?? o.makingChargeTotal ?? o.grandTotal ?? o.amount ?? 0);
    return n;
}
function formatBDT(n: number) {
    return `৳${(Number.isFinite(n) ? n : 0).toLocaleString('en-BD')}`;
}

export type OrdersListProps = {
    title?: string;
    items: OrderLike[];
    emptyText?: string;
    mapFns?: MapFns;
    getHref?: (o: any) => string | undefined; // optional override
    openInNewTab?: boolean;
};

export default function OrdersList({
                                       title = 'Recent Orders',
                                       items,
                                       emptyText = 'No Order Found',
                                       mapFns = {},
                                       getHref,
                                       openInNewTab,
                                   }: OrdersListProps) {
    const nameOf = mapFns.nameOf ?? defaultNameOf;
    const photoOf = mapFns.photoOf ?? defaultPhotoOf;
    const dueOf = mapFns.dueOf ?? defaultDueOf;
    const amountOf = mapFns.amountOf ?? defaultAmountOf;

    const buildHref = (o: any): string | undefined => {
        if (getHref) return getHref(o);
        const slug = slugOf(o);
        return slug ? `/orders/${encodeURIComponent(slug)}` : undefined;
    };

    const formatDelivery = (d: string | null | undefined) => {
        if (!d) return null;
        try {
            const dt = new Date(d);
            if (Number.isNaN(+dt)) return null;
            return dt.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' });
        } catch {
            return null;
        }
    };

    return (
        <section className={styles.section}>
            <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>{title}</h2>
            </div>

            <ul className={styles.cardList}>
                {items.length === 0 ? (
                    <li className={styles.emptyRow}>{emptyText}</li>
                ) : (
                    items.map((o, i) => {
                        const href = buildHref(o);
                        const key = o.orderId ?? o.code ?? o.id ?? i;

                        const name = nameOf(o);
                        const amount = Number(amountOf(o));
                        const delivery = formatDelivery(dueOf(o));
                        const itemsText = itemNamesOf(o);

                        // Prefer cloth photo; fallback to avatar if photo is missing/broken
                        const cloth = clothPhotoOf(o);
                        const customerAvatar = photoOf(o) || undefined;

                        return (
                            <li key={key} className={styles.cardItem}>
                                {href ? (
                                    <Link
                                        href={href}
                                        prefetch={false}
                                        aria-label={`Open order ${String(slugOf(o) ?? '')}`}
                                        className={styles.cardLink}
                                        target={openInNewTab ? '_blank' : undefined}
                                        rel={openInNewTab ? 'noopener noreferrer' : undefined}
                                    >
                                        <div className={styles.thumbWrap}>
                                            {cloth ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img className={styles.thumb} src={cloth} alt="Cloth" />
                                            ) : (
                                                <Avatar name={name} photoUrl={customerAvatar} size={48} rounding={10} />
                                            )}
                                        </div>

                                        <div className={styles.body}>
                                            <div className={styles.titleRow}>
                                                <div className={styles.name}>{name}</div>
                                                <div className={styles.amount}>{formatBDT(amount)}</div>
                                            </div>

                                            <div className={styles.sub}>{itemsText}</div>

                                            {delivery ? (
                                                <div className={styles.meta}>Delivery {delivery}</div>
                                            ) : null}
                                        </div>
                                    </Link>
                                ) : (
                                    <div className={styles.cardDisabled}>
                                        <div className={styles.thumbWrap}>
                                            {cloth ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img className={styles.thumb} src={cloth} alt="Cloth" />
                                            ) : (
                                                <Avatar name={name} photoUrl={customerAvatar} size={48} rounding={10} />
                                            )}
                                        </div>
                                        <div className={styles.body}>
                                            <div className={styles.titleRow}>
                                                <div className={styles.name}>{name}</div>
                                                <div className={styles.amount}>{formatBDT(amount)}</div>
                                            </div>
                                            <div className={styles.sub}>{itemsText}</div>
                                            {delivery ? <div className={styles.meta}>Delivery {delivery}</div> : null}
                                        </div>
                                    </div>
                                )}
                            </li>
                        );
                    })
                )}
            </ul>
        </section>
    );
}
