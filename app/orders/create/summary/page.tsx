'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useCreateOrder } from '../_store'
import styles from '../CreateOrder.module.css'

const CURRENCY = '৳'
const fmt = (n: number) => `${CURRENCY}${(Number.isFinite(n) ? n : 0).toLocaleString()}`

function todayISO() {
    const d = new Date()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${mm}-${dd}`
}

export default function SummaryPage() {
    const router = useRouter()
    const { state, setState, addCurrentItem } = useCreateOrder()

    const qs = useMemo(() => (state.shopId ? `?shopId=${state.shopId}` : ''), [state.shopId])

    // Items: committed + working (uncommitted)
    const committed = state.orderItems ?? []
    const hasWorking = !!state.itemId
    const working = hasWorking
        ? [{
            itemId: state.itemId!,
            itemType: state.itemType,
            makingCharge: typeof state.makingCharge === 'number'
                ? state.makingCharge
                : Number(state.makingCharge) || 0,
            urgentDelivery: state.urgentDelivery,
            deliveryDate: state.deliveryDate ?? null,
        }]
        : []
    const items = [...committed, ...working]
    const total = items.reduce((sum, it) => sum + (Number(it.makingCharge) || 0), 0)
    const nonUrgentCount = items.filter(it => !it.urgentDelivery).length

    // Guards
    useEffect(() => {
        if (!state.phone || !state.name) {
            router.replace(`/orders/create${qs}`)
            return
        }
        if (items.length === 0) {
            router.replace(`/orders/create/items${qs}`)
        }
    }, [router, state.phone, state.name, items.length, qs])

    const [advanceText, setAdvanceText] = useState('')
    const [error, setError] = useState<string | null>(null)

    const onBack = () => router.back()

    // Commit working item (if any)
    function commitWorkingIfAny(): { ok: true } | { ok: false; reason: string } {
        if (!state.itemId) return { ok: true }
        const res = addCurrentItem()
        if (!res.ok) return { ok: false, reason: res.reason }
        return { ok: true }
    }

    // Add Item: persist current and go to Items
    function onAddItem() {
        setError(null)
        const res = commitWorkingIfAny()
        if (!res.ok) return setError(res.reason)
        router.push(`/orders/create/items${qs}`)
    }

    // Edit: load committed item back to editor, remove it from list, go to Extras
    function onEditItem(index: number) {
        const inCommitted = index < committed.length
        if (inCommitted) {
            const item = committed[index]
            setState(s => ({
                ...s,
                itemId: item.itemId,
                itemType: item.itemType,
                itemParameters: item.itemParameters ?? [],
                measurementOption: item.measurementOption,
                measurementValues: item.measurementValues ?? {},
                makingCharge: Number(item.makingCharge) || 0,
                urgentDelivery: !!item.urgentDelivery,
                deliveryDate: item.deliveryDate ?? null,
                photos: item.photos ?? {},
                orderItems: (s.orderItems ?? []).filter((_, i) => i !== index),
            }))
        }
        router.push(`/orders/create/extras${qs}`)
    }

    function onEditCustomer() {
        router.push(`/orders/create${qs}`)
    }

    function onContinue() {
        setError(null)

        // Validate non-urgent date and advance
        if (nonUrgentCount > 0 && !state.remainingDeliveryDate) {
            return setError('Please pick a delivery date for non-urgent items')
        }
        if (!advanceText.trim()) {
            return setError('Advance payment is required')
        }

        // Commit working item so Confirm sees everything in orderItems
        const res = commitWorkingIfAny()
        if (!res.ok) return setError(res.reason)

        // Navigate to Confirm and pass advance as query param
        const sep = qs ? '&' : '?'
        router.push(`/orders/create/confirm${qs}${sep}advance=${encodeURIComponent(advanceText)}`)
    }

    const handleRemainingDateChange = (e: ChangeEvent<HTMLInputElement>) => {
        setError(null)
        const v = e.currentTarget.value
        setState(s => ({ ...s, remainingDeliveryDate: v || null }))
    }

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
                            ✎ Edit
                        </button>
                    </div>
                </div>

                {/* Items */}
                <div className={styles.itemListCard} style={{ marginTop: 12 }}>
                    {items.map((it, idx) => (
                        <div className={styles.itemRow} key={`${it.itemId ?? 'w'}-${idx}`}>
                            <div className={styles.itemLeft}>
                                <div className={styles.itemTitle}>{it.itemType || `Item #${it.itemId}`}</div>
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
                            <button
                                type="button"
                                className={styles.smallEditBtn}
                                onClick={() => onEditItem(idx)}
                                aria-label="Edit item"
                            >
                                ✎ Edit
                            </button>
                        </div>
                    ))}
                </div>

                {/* Add Item */}
                <button type="button" className={styles.addItemBtn} onClick={onAddItem} style={{ marginTop: 10 }}>
                    <span className={styles.addIcon}>＋</span>
                    <span>Add Item</span>
                </button>

                {/* Order Delivery Date (for non-urgent items) */}
                <div className={styles.field} style={{ marginTop: 12 }}>
                    <label className={styles.label} htmlFor="orderDeliveryDate">
                        Delivery Date{nonUrgentCount > 0 && <span className={styles.req}>*</span>}
                    </label>
                    <div className={styles.dateRow}>
                        <span className={styles.dateIcon} aria-hidden="true">📅</span>
                        <span className={`${styles.dateText} ${state.remainingDeliveryDate ? '' : styles.muted}`}>
              {state.remainingDeliveryDate
                  ? new Date(state.remainingDeliveryDate + 'T00:00:00').toLocaleDateString()
                  : 'Pick Delivery Date'}
            </span>
                        {/* Transparent overlay input triggers the native picker */}
                        <input
                            id="orderDeliveryDate"
                            type="date"
                            className={styles.dateInputOverlay}
                            min={todayISO()}
                            value={state.remainingDeliveryDate ?? ''}
                            onChange={handleRemainingDateChange}
                            aria-label="Order Delivery Date"
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
                        <label className={styles.label} htmlFor="advance">Advance Payment<span className={styles.req}>*</span></label>
                        <div className={styles.inputWrap}>
                            <input
                                id="advance"
                                className={styles.input}
                                placeholder="Enter Amount"
                                inputMode="decimal"
                                value={advanceText}
                                onChange={(e) => { setError(null); setAdvanceText(e.target.value) }}
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
        </main>
    )
}