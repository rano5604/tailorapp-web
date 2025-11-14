'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { useCreateOrder } from '../_store';
import styles from '../CreateOrder.module.css';

const CURRENCY = '৳';
const fmt = (n: number) => `${CURRENCY}${(Number.isFinite(n) ? n : 0).toLocaleString()}`;

type ConfirmState = { open: boolean; idx: number; label: string };

function toISODate(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}
function parseISODate(s?: string | null) {
    if (!s) return undefined;
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return undefined;
    return new Date(y, m - 1, d);
}
function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

export default function SummaryPage() {
    const router = useRouter();
    const { state, setState, addCurrentItem } = useCreateOrder();

    const qs = useMemo(() => (state.shopId ? `?shopId=${state.shopId}` : ''), [state.shopId]);

    // Items: committed + working (uncommitted)
    const committed = state.orderItems ?? [];
    const hasWorking = !!state.itemId;
    const working = hasWorking
        ? [
            {
                itemId: state.itemId!,
                itemType: state.itemType,
                makingCharge:
                    typeof state.makingCharge === 'number'
                        ? state.makingCharge
                        : Number(state.makingCharge) || 0,
                urgentDelivery: state.urgentDelivery,
                deliveryDate: state.deliveryDate ?? null,
                photos: state.photos ?? {},
                photoUrls: state.photoUrls ?? {},
            },
        ]
        : [];
    const items = [...committed, ...working];

    const total = items.reduce((sum, it) => sum + (Number(it.makingCharge) || 0), 0);
    const nonUrgentCount = items.filter((it) => !it.urgentDelivery).length;

    // Guards
    useEffect(() => {
        if (!state.phone || !state.name) {
            router.replace(`/orders/create${qs}`);
            return;
        }
        if (items.length === 0) {
            router.replace(`/orders/create/items${qs}`);
        }
    }, [router, state.phone, state.name, items.length, qs]);

    const [advanceText, setAdvanceText] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Confirm delete
    const [confirm, setConfirm] = useState<ConfirmState>({ open: false, idx: -1, label: '' });

    const onBack = () => router.back();

    // Commit working item (if any)
    function commitWorkingIfAny(): { ok: true } | { ok: false; reason: string } {
        if (!state.itemId) return { ok: true };
        const res = addCurrentItem();
        if (!res.ok) return { ok: false, reason: res.reason };
        return { ok: true };
    }

    // Add Item
    function onAddItem() {
        setError(null);
        const res = commitWorkingIfAny();
        if (!res.ok) return setError(res.reason);
        setState((s) => ({ ...s, photos: {}, photoUrls: {} as any }));
        router.push(`/orders/create/items${qs}`);
    }

    // Edit item -> load back to working, preserve photos/photoUrls, go to Measurements
    function onEditItem(index: number) {
        const inCommitted = index < committed.length;
        if (inCommitted) {
            const item = committed[index] as any;
            setState((s) => ({
                ...s,
                itemId: item.itemId,
                itemType: item.itemType,
                itemParameters: item.itemParameters ?? [],
                measurementOption: item.measurementOption,
                measurementValues: item.measurementValues ?? {},
                makingCharge: Number(item.makingCharge) || 0,
                urgentDelivery: !!item.urgentDelivery,
                deliveryDate: item.deliveryDate ?? null,
                photos: item.photos ?? s.photos ?? {},
                photoUrls: item.photoUrls ?? s.photoUrls ?? {},
                orderItems: (s.orderItems ?? []).filter((_, i) => i !== index),
            }));
        }
        router.push(`/orders/create/measurements${qs}`);
    }

    // Delete ask/confirm
    function onAskDelete(index: number, label: string) {
        setConfirm({ open: true, idx: index, label });
    }

    function revokeBlobUrlsFromPhotos(photos?: Record<string, any>) {
        if (!photos) return;
        try {
            Object.values(photos).forEach((v) => {
                if (typeof v === 'string' && v.startsWith('blob:')) {
                    URL.revokeObjectURL(v);
                }
            });
        } catch {}
    }

    // Remove cached keys that might keep photos alive across pages
    function purgePhotoKeys(storage: Storage, itemId?: number | string) {
        try {
            for (let i = storage.length - 1; i >= 0; i--) {
                const k = storage.key(i);
                if (!k) continue;
                if (!k.startsWith('create-order:')) continue;

                if (k.includes(':working') || k.includes(':current') || k.includes(':temp')) {
                    storage.removeItem(k);
                    continue;
                }
                if (k.includes(':photos') || k.includes(':photoUrls')) {
                    if (itemId == null) {
                        storage.removeItem(k);
                    } else if (k.includes(`:${itemId}:`) || k.endsWith(`:${itemId}`)) {
                        storage.removeItem(k);
                    }
                }
            }
        } catch {}
    }

    function onConfirmDelete() {
        const idx = confirm.idx;
        const target = items[idx];
        const committedLen = committed.length;
        const isCommitted = idx >= 0 && idx < committedLen;

        revokeBlobUrlsFromPhotos((target as any)?.photos);
        purgePhotoKeys(sessionStorage, (target as any)?.itemId);
        purgePhotoKeys(localStorage, (target as any)?.itemId);

        setState((s) => {
            const base = { ...s, photos: {}, photoUrls: {} as any };

            if (isCommitted) {
                const next = [...(s.orderItems ?? [])];
                next.splice(idx, 1);
                return { ...base, orderItems: next };
            }

            return {
                ...base,
                itemId: undefined,
                itemType: undefined as any,
                itemParameters: [],
                measurementOption: undefined as any,
                measurementValues: {},
                makingCharge: 0,
                urgentDelivery: false,
                deliveryDate: null,
                photos: {},
            };
        });

        setConfirm({ open: false, idx: -1, label: '' });
    }

    function onEditCustomer() {
        router.push(`/orders/create${qs}`);
    }

    function onContinue() {
        setError(null);

        if (nonUrgentCount > 0 && !state.remainingDeliveryDate) {
            return setError('Please pick a delivery date for non-urgent items');
        }
        if (!advanceText.trim()) {
            return setError('Advance payment is required');
        }

        const res = commitWorkingIfAny();
        if (!res.ok) return setError(res.reason);

        const sep = qs ? '&' : '?';
        router.push(`/orders/create/confirm${qs}${sep}advance=${encodeURIComponent(advanceText)}`);
    }

    // Inline pill button styles
    const rowBtnStyle: React.CSSProperties = {
        appearance: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        whiteSpace: 'nowrap',
        lineHeight: 1,
        height: 36,
        padding: '0 12px',
        borderRadius: 12,
        border: '1px solid #e5e7eb',
        background: '#fff',
        color: '#111827',
        fontWeight: 800,
        boxShadow: '0 1px 2px rgba(0,0,0,.06)',
    };
    const rowBtnDanger: React.CSSProperties = {
        ...rowBtnStyle,
        border: 'none',
        background: '#ef4444',
        color: '#fff',
        boxShadow: '0 4px 10px rgba(239,68,68,.3)',
    };
    const iconBubble: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        borderRadius: 9999,
        background: '#f3f4f6',
    };
    const iconBubbleDanger: React.CSSProperties = { ...iconBubble, background: '#fff', color: '#ef4444' };

    return (
        <main className={styles.page}>
            {/* Header */}
            <header className={styles.header}>
                <div className={`${styles.container} ${styles.headerRow}`}>
                    <button type="button" className={styles.iconBack} onClick={onBack} aria-label="Back">←</button>
                    <h1 className={styles.title}>Create New Order</h1>
                    <div className={styles.headerRight} />
                </div>
            </header>

            {/* Content */}
            <section className={`${styles.formSection} ${styles.container}`}>
                {/* Customer */}
                <div className={styles.reviewCard}>
                    <div className={styles.reviewRowTop}>
                        <div className={styles.customerLines}>
                            <div className={styles.customerName}>{state.name || '—'}</div>
                            <div className={styles.customerSub}>{state.phone || '—'}</div>
                            <div className={styles.customerSub}>{state.gender || '—'}</div>
                        </div>
                        <button type="button" className={styles.editBtn} onClick={onEditCustomer}>
                            ✏️ Edit
                        </button>
                    </div>
                </div>

                {/* Items */}
                <div className={styles.itemListCard} style={{ marginTop: 12 }}>
                    {items.map((it, idx) => (
                        <div className={styles.itemRow} key={`${it.itemId ?? 'w'}-${idx}`}>
                            <div className={styles.itemLeft}>
                                <div className={styles.itemTitle}>{it.itemType || `Item #${it.itemId ?? idx + 1}`}</div>
                                <div className={styles.itemSubline}>
                                    <span>Making Charge: {fmt(Number(it.makingCharge) || 0)}</span>
                                    {it.urgentDelivery && (
                                        <>
                                            <span className={styles.urgentTag}> • Urgent</span>
                                            {it.deliveryDate && <span> • {new Date(it.deliveryDate + 'T00:00:00').toLocaleDateString()}</span>}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Actions (Edit + Delete) */}
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button type="button" style={rowBtnStyle} onClick={() => onEditItem(idx)} aria-label="Edit item">
                                    <span style={iconBubble}><PenIcon /></span>
                                    <span>Edit</span>
                                </button>
                                <button
                                    type="button"
                                    style={rowBtnDanger}
                                    onClick={() => onAskDelete(idx, it.itemType || `Item #${it.itemId ?? idx + 1}`)}
                                    aria-label="Delete item"
                                >
                                    <span style={iconBubbleDanger}><TrashIcon /></span>
                                    <span>Delete</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Add Item */}
                <button type="button" className={styles.addItemBtn} onClick={onAddItem} style={{ marginTop: 10 }}>
                    <span className={styles.addIcon}>＋</span>
                    <span>Add Item</span>
                </button>

                {/* Order Delivery Date (inline calendar) */}
                <div className={styles.field} style={{ marginTop: 12 }}>
                    <label className={styles.label}>
                        Delivery Date{nonUrgentCount > 0 && <span className={styles.req}>*<div style={{ marginTop: 6, color: '#374151', fontWeight: 700 }}>
                        {state.remainingDeliveryDate
                            ? new Date(state.remainingDeliveryDate + 'T00:00:00').toLocaleDateString()
                            : 'No date selected'}
                    </div></span>}
                    </label>

                    <div
                        style={{
                            border: '1px solid #e5e7eb',
                            borderRadius: 12,
                            padding: 8,
                            background: '#fff',
                        }}
                    >
                        <DayPicker
                            mode="single"
                            selected={parseISODate(state.remainingDeliveryDate)}
                            onSelect={(day) => {
                                const iso = day ? toISODate(day) : '';
                                setState((s) => ({ ...s, remainingDeliveryDate: iso || null }));
                            }}
                            disabled={{ before: startOfToday() }}
                            showOutsideDays
                            captionLayout="dropdown"      // or "dropdown-months" | "dropdown-years"
                            startMonth={new Date(2000, 0)} // optional bounds
                            endMonth={new Date(2100, 11)}
                        />

                    </div>


                </div>

                {/* Totals + Advance */}
                <div className={styles.totalCard} style={{ marginTop: 12 }}>
                    <div className={styles.totalHeader}>
                        <div className={styles.totalLabel}>Total Making Charge</div>
                        <div className={styles.totalAmount}>{fmt(total)}</div>
                    </div>

                    <div className={styles.field} style={{ marginTop: 10 }}>
                        <label className={styles.label} htmlFor="advance">
                            Advance Payment<span className={styles.req}>*</span>
                        </label>
                        <div className={styles.inputWrap}>
                            <input
                                id="advance"
                                className={styles.input}
                                placeholder="Enter Amount"
                                inputMode="decimal"
                                value={advanceText}
                                onChange={(e) => {
                                    setError(null);
                                    setAdvanceText(e.target.value);
                                }}
                            />
                        </div>
                    </div>
                </div>

                {error && <div className={styles.error} style={{ marginTop: 10 }}>{error}</div>}
            </section>

            {/* Footer */}
            <footer className={`${styles.footer} ${styles.container}`}>
                <button type="button" className={styles.primary} onClick={onContinue}>Continue</button>
            </footer>

            {/* Confirm delete dialog */}
            <ConfirmDialog
                open={confirm.open}
                title="Remove item?"
                message={`Are you sure you want to remove "${confirm.label}" from this order?`}
                confirmLabel="Delete"
                onCancel={() => setConfirm({ open: false, idx: -1, label: '' })}
                onConfirm={onConfirmDelete}
            />
        </main>
    );
}

/* Icons */
function PenIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Z" stroke="currentColor" strokeWidth="1.8" />
            <path d="M14.06 6.19 16.88 3.37 20.63 7.12 17.81 9.94" stroke="currentColor" strokeWidth="1.8" />
        </svg>
    );
}
function TrashIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

/* Confirm dialog */
function ConfirmDialog({
                           open,
                           title,
                           message,
                           confirmLabel = 'OK',
                           onCancel,
                           onConfirm,
                       }: {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    if (!open) return null;
    return (
        <div style={overlayStyle} role="dialog" aria-modal="true">
            <div style={dialogStyle}>
                <h3 style={{ margin: 0, fontWeight: 800, color: '#111827' }}>{title}</h3>
                <p style={{ margin: '8px 0 16px', color: '#374151' }}>{message}</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={onCancel} style={btnGhost}>Cancel</button>
                    <button type="button" onClick={onConfirm} style={btnDanger}>{confirmLabel}</button>
                </div>
            </div>
        </div>
    );
}

const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.35)',
    display: 'grid',
    placeItems: 'center',
    zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
    width: 'min(440px, 92vw)',
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #e5e7eb',
    padding: 16,
    boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
};

const btnGhost: React.CSSProperties = {
    height: 40,
    padding: '0 14px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#111827',
    fontWeight: 700,
};

const btnDanger: React.CSSProperties = {
    height: 40,
    padding: '0 14px',
    borderRadius: 10,
    border: 'none',
    background: '#ef4444',
    color: '#fff',
    fontWeight: 800,
    boxShadow: '0 4px 10px rgba(239,68,68,0.3)',
};
