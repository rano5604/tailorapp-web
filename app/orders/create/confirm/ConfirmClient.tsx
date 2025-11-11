'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCreateOrder } from '../_store';
import styles from '../CreateOrder.module.css';
import { api } from '@/lib/apiBase'; // <- unified API helper

const CURRENCY = '৳';
const fmt = (n: number) => `${CURRENCY}${(Number.isFinite(n) ? n : 0).toLocaleString()}`;

function dateLong(iso?: string | null) {
    if (!iso) return '—';
    try {
        return new Date(iso + 'T00:00:00').toLocaleDateString();
    } catch {
        return iso || '—';
    }
}

function todayYYYYMMDD() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}${mm}${dd}`;
}
function pad(n: number, len = 4) {
    return String(n).padStart(len, '0');
}

/* Token helpers – use whatever your login saved */
function getCookie(name: string) {
    if (typeof document === 'undefined') return null;
    const m = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[2]) : null;
}
function getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    return (
        sessionStorage.getItem('auth.accessToken') ||
        localStorage.getItem('auth.accessToken') ||
        sessionStorage.getItem('accessToken') ||
        localStorage.getItem('accessToken') ||
        getCookie('access_token') ||
        getCookie('token') ||
        null
    );
}

export default function ConfirmOrderPage() {
    const router = useRouter();
    const sp = useSearchParams();
    const { state } = useCreateOrder();

    // Advance from Summary (?advance=)
    const advance = useMemo(() => {
        const a = sp.get('advance');
        return a ? Math.max(0, Number(a)) || 0 : 0;
    }, [sp]);

    // Display list: committed + working (include photoUrls for working)
    const committed = state.orderItems ?? [];
    const working = state.itemId
        ? [
            {
                itemId: state.itemId!,
                itemType: state.itemType,
                itemParameters: state.itemParameters ?? [],
                measurementOption: state.measurementOption,
                measurementValues: state.measurementValues ?? {},
                makingCharge:
                    typeof state.makingCharge === 'number'
                        ? state.makingCharge
                        : Number(state.makingCharge) || 0,
                urgentDelivery: state.urgentDelivery,
                deliveryDate: state.deliveryDate ?? null,
                photos: state.photos ?? {},
                photoUrls: (state as any).photoUrls ?? {}, // server URLs for working item
            },
        ]
        : [];
    const itemsAll = [...committed, ...working];
    const total = itemsAll.reduce(
        (sum: number, it: any) => sum + (Number(it.makingCharge) || 0),
        0
    );
    const due = Math.max(total - advance, 0);

    // Guards
    useEffect(() => {
        const qs = state.shopId ? `?shopId=${state.shopId}` : '';
        if (!state.phone || !state.name) {
            router.replace(`/orders/create${qs}`);
            return;
        }
        if (itemsAll.length === 0) {
            router.replace(`/orders/create/items${qs}`);
        }
    }, [router, state.phone, state.name, state.shopId, itemsAll.length]);

    const [submitting, setSubmitting] = useState(false);
    const [apiError, setApiError] = useState<string | null>(null);

    // UI helpers
    function pickThumbs(it: any): string[] {
        const p = it.photos || {};
        const candidates = [
            p.orderCloth,
            p.designSketch,
            p.designPhoto,
            p.patternPhoto,
            p.measurementCloth,
        ];
        return candidates.filter(Boolean).slice(0, 2) as string[];
    }
    const measurementCount = (it: any) =>
        Object.keys(it?.measurementValues ?? {}).length || 0;

    // Prefer per-item photoUrls first, then working state's (if present)
    const urlFor = (
        it: any,
        key:
            | 'orderCloth'
            | 'designPhoto'
            | 'patternPhoto'
            | 'measurementCloth'
            | 'designSketch'
    ): string | undefined => it.photoUrls?.[key] ?? (state as any).photoUrls?.[key] ?? undefined;

    // Build payload exactly as your API expects (using server image URLs)
    function buildApiPayload() {
        return {
            shopId: state.shopId ?? 1,
            customerName: state.name,
            customerPhone: state.phone,
            customerGender: state.gender,
            paidAmount: advance,
            deliveryDate: state.remainingDeliveryDate ?? undefined,
            items: itemsAll.map((it: any) => {
                const clothUrl = urlFor(it, 'orderCloth'); // REQUIRED
                const patternUrl = urlFor(it, 'patternPhoto');
                const measureUrl = urlFor(it, 'measurementCloth');
                const designUrl = urlFor(it, 'designSketch') ?? urlFor(it, 'designPhoto');

                return {
                    itemId: it.itemId,
                    measurementGroups: [
                        {
                            clothPhoto: clothUrl,
                            patternClothPhoto: patternUrl || undefined,
                            measurementClothPhoto: measureUrl || undefined,
                            designDrawingPhoto: designUrl || undefined,
                            deliveryDate:
                                (it.urgentDelivery ? it.deliveryDate : state.remainingDeliveryDate) ??
                                undefined,
                            makingCharge: Number(it.makingCharge) || 0,
                            measurements: (it.itemParameters ?? []).map((p: any) => {
                                const mv = it.measurementValues ?? {};
                                const byNs = mv[p.nsId];
                                const byId = mv[p.id];
                                const v = byNs ?? byId ?? '';
                                return {
                                    nameEn: p.nameEn,
                                    nameBn: p.nameBn,
                                    unit: p.unit,
                                    type: p.type,
                                    nsId: p.nsId,
                                    value: String(v),
                                };
                            }),
                        },
                    ],
                };
            }),
        };
    }

    // Validate URLs before posting
    function validateBeforeSend(): string | null {
        for (const it of itemsAll) {
            if (!urlFor(it, 'orderCloth')) {
                return 'Cloth image is required. Please upload it from the Photo step.';
            }
        }
        return null;
    }

    async function onConfirm() {
        setApiError(null);

        const v = validateBeforeSend();
        if (v) {
            setApiError(v);
            return;
        }

        const token = getAuthToken();
        if (!token) {
            const ret = encodeURIComponent(
                window.location.pathname + window.location.search
            );
            setApiError('Your session has expired. Please log in again.');
            setTimeout(() => router.push(`/login?next=${ret}`), 800);
            return;
        }

        try {
            setSubmitting(true);
            const payload = buildApiPayload();

            // unified base via helper
            const res = await fetch(api('/api/orders'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });

            if (res.status === 401) {
                const ret = encodeURIComponent(
                    window.location.pathname + window.location.search
                );
                setApiError('Session expired. Please log in again.');
                setTimeout(() => router.push(`/login?next=${ret}`), 800);
                return;
            }
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || `Request failed with ${res.status}`);
            }

            const body = (await res.json().catch(() => ({} as any))) as any;
            const data = body?.data ?? body ?? {};

            try {
                sessionStorage.setItem('create-order:last', JSON.stringify(data));
            } catch {}

            const returnedOrderId: string | undefined =
                data.orderId || data.code || data.number;
            const returnedDbId: number | string | undefined = data.id;

            // Fallback orderId if not provided
            const shop = state.shopId ?? 1;
            const ymd = todayYYYYMMDD();
            const seqKey = `order-seq:${ymd}`;
            const fallbackSeq = (Number(sessionStorage.getItem(seqKey)) || 0) + 1;
            sessionStorage.setItem(seqKey, String(fallbackSeq));
            const fallbackId = `${shop}-${ymd}-${pad(fallbackSeq, 4)}`;
            const finalOrderId = String(returnedOrderId || fallbackId);

            // Build success URL with orderId & id (and keep shopId if present)
            const qs = new URLSearchParams();
            if (state.shopId) qs.set('shopId', String(state.shopId));
            qs.set('orderId', finalOrderId);
            if (returnedDbId != null) qs.set('id', String(returnedDbId));

            router.replace(`/orders/create/success?${qs.toString()}`);
        } catch (err: any) {
            console.error('Confirm Order -> error', err);
            setApiError(err?.message || 'Failed to place order. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    const onBack = () => router.back();

    return (
        <main className={styles.page}>
            {/* Header */}
            <header className={styles.header}>
                <div className={`${styles.container} ${styles.headerRow}`}>
                    <button className={styles.iconBack} onClick={onBack} aria-label="Back">
                        ←
                    </button>
                    <h1 className={styles.title}>Create New Order</h1>
                    <div className={styles.headerRight} />
                </div>
            </header>

            <section className={`${styles.formSection} ${styles.container}`}>
                {/* Customer Information */}
                <div className={styles.panel}>
                    <div className={styles.panelTitle}>Customer Information</div>
                    <div className={styles.customerLines}>
                        <div className={styles.customerName}>{state.name || '—'}</div>
                        <div className={styles.customerSub}>{state.phone || '—'}</div>
                        <div className={styles.customerSub}>{state.gender || '—'}</div>
                    </div>
                </div>

                {/* Items */}
                <div className={styles.panel}>
                    <div className={styles.panelTitle}>Items</div>
                    {itemsAll.map((it: any, idx: number) => {
                        const thumbs = pickThumbs(it);
                        const mCount = measurementCount(it);
                        return (
                            <div key={`${it.itemId ?? 'w'}-${idx}`} className={styles.itemBlock}>
                                <div className={styles.itemLine}>
                                    <div className={styles.itemLineLeft}>
                                        <div className={styles.itemTitle}>
                                            {it.itemType || `Item #${it.itemId}`}
                                        </div>
                                        <div className={styles.itemSubline}>
                                            {mCount > 0 ? `${mCount} Measurements` : '— Measurements'}
                                        </div>
                                    </div>
                                    <div className={styles.itemLineRight}>
                                        <div className={styles.itemPrice}>
                                            {fmt(Number(it.makingCharge) || 0)}
                                        </div>
                                        {it.urgentDelivery && (
                                            <div className={styles.pillUrgent}>Urgent Delivery</div>
                                        )}
                                    </div>
                                </div>

                                {!!thumbs.length && (
                                    <div className={styles.thumbStrip}>
                                        {thumbs.map((src, i) => (
                                            <div key={i} className={styles.thumb}>
                                                <Image
                                                    src={src}
                                                    alt="thumb"
                                                    fill
                                                    sizes="96px"
                                                    className={styles.thumbImg}
                                                    unoptimized
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Payment Information */}
                <div className={styles.panel}>
                    <div className={styles.panelTitle}>Payment Information</div>
                    <div className={styles.kvRow}>
                        <div className={styles.kvLabel}>Total Making Charge</div>
                        <div className={styles.kvValue}>{fmt(total)}</div>
                    </div>
                    <div className={styles.kvRow}>
                        <div className={styles.kvLabel}>Advance Paid</div>
                        <div className={styles.kvValue}>{fmt(advance)}</div>
                    </div>
                    <div className={styles.kvRow}>
                        <div className={styles.kvLabel}>Total Due Amount</div>
                        <div className={styles.kvValue}>{fmt(due)}</div>
                    </div>
                </div>

                {/* Delivery Information */}
                <div className={styles.panel}>
                    <div className={styles.panelTitle}>Delivery Information</div>
                    <div className={styles.kvRow}>
                        <div className={styles.kvLabel}>Delivery Date</div>
                        <div className={styles.kvValueAccent}>
                            {dateLong(state.remainingDeliveryDate)}
                        </div>
                    </div>

                    <div className={styles.kvRow}>
                        <div className={styles.kvLabel}>Urgent Items</div>
                        <div className={styles.kvValueAccent}>
                            {itemsAll.filter((it: any) => it.urgentDelivery).length === 1 ? (
                                (() => {
                                    const u = itemsAll.find((it: any) => it.urgentDelivery)!;
                                    return `${u.itemType || 'Item'}  •  ${dateLong(u.deliveryDate)}`;
                                })()
                            ) : (
                                <div className={styles.urgentList}>
                                    {itemsAll
                                        .filter((it: any) => it.urgentDelivery)
                                        .map((u: any, i: number) => (
                                            <div key={i} className={styles.urgentLine}>
                        <span className={styles.urgentName}>
                          {u.itemType || 'Item'}
                        </span>
                                                <span className={styles.urgentDate}>
                          {dateLong(u.deliveryDate)}
                        </span>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {apiError && (
                    <div className={styles.error} style={{ marginTop: 10 }}>
                        {apiError}
                    </div>
                )}
            </section>

            {/* Footer */}
            <footer className={`${styles.footer} ${styles.container}`}>
                <button
                    type="button"
                    className={styles.primary}
                    onClick={onConfirm}
                    disabled={submitting}
                >
                    {submitting ? 'Placing...' : 'Confirm Order'}
                </button>
            </footer>
        </main>
    );
}