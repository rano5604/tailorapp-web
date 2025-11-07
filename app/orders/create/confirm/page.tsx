'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import Image from 'next/image'
import { useCreateOrder } from '../_store'
import styles from '../CreateOrder.module.css'

const CURRENCY = '৳'
const fmt = (n: number) => `${CURRENCY}${(Number.isFinite(n) ? n : 0).toLocaleString()}`

function dateLong(iso?: string | null) {
    if (!iso) return '—'
    try {
        const d = new Date(iso + 'T00:00:00')
        return d.toLocaleDateString()
    } catch { return iso || '—' }
}

export default function ConfirmOrderPage() {
    const router = useRouter()
    const { state } = useCreateOrder()
    const sp = useSearchParams()

    // Advance comes from Summary via query param
    const advance = useMemo(() => {
        const a = sp.get('advance')
        return a ? Math.max(0, Number(a)) || 0 : 0
    }, [sp])

    // Build items for display (use committed + working if any)
    const committed = state.orderItems ?? []
    const working = state.itemId
        ? [{
            itemId: state.itemId!,
            itemType: state.itemType,
            makingCharge: typeof state.makingCharge === 'number'
                ? state.makingCharge
                : Number(state.makingCharge) || 0,
            urgentDelivery: state.urgentDelivery,
            deliveryDate: state.deliveryDate ?? null,
            photos: state.photos,
            measurementValues: state.measurementValues,
        }]
        : []
    const items = [...committed, ...working]
    const total = items.reduce((sum, it) => sum + (Number(it.makingCharge) || 0), 0)
    const due = Math.max(total - advance, 0)

    // Guards
    useEffect(() => {
        const qs = state.shopId ? `?shopId=${state.shopId}` : ''
        if (!state.phone || !state.name) {
            router.replace(`/orders/create${qs}`)
            return
        }
        if (items.length === 0) {
            router.replace(`/orders/create/items${qs}`)
        }
    }, [router, state.phone, state.name, state.shopId, items.length])

    const onBack = () => router.back()

    const onConfirm = () => {
        const payload = {
            shopId: state.shopId,
            customer: { name: state.name, phone: state.phone, gender: state.gender },
            items: items.map(it => ({
                itemId: it.itemId,
                itemType: it.itemType,
                makingCharge: Number(it.makingCharge) || 0,
                urgentDelivery: !!it.urgentDelivery,
                deliveryDate: it.urgentDelivery ? (it.deliveryDate ?? null) : (state.remainingDeliveryDate ?? null),
            })),
            totals: { makingCharge: total, advance, due },
            dates: {
                orderDeliveryDate: state.remainingDeliveryDate ?? null,
                urgentItems: items
                    .filter(it => it.urgentDelivery)
                    .map(it => ({ itemType: it.itemType, date: it.deliveryDate ?? null })),
            },
        }
        console.log('Confirm Order -> payload', payload)
        // TODO: submit to API, then navigate to success
        // router.push('/orders/success')
    }

    // Helpers to pick up to 2 thumbs per item
    function pickThumbs(it: any): string[] {
        const p = it.photos || {}
        const candidates = [p.orderCloth, p.designSketch, p.designPhoto, p.patternPhoto, p.measurementCloth]
        return candidates.filter(Boolean).slice(0, 2) as string[]
    }
    const measurementCount = (it: any) => Object.keys(it?.measurementValues ?? {}).length || 0

    return (
        <main className={styles.page}>
            {/* Header */}
            <header className={styles.header}>
                <div className={`${styles.container} ${styles.headerRow}`}>
                    <button className={styles.iconBack} onClick={onBack} aria-label="Back">←</button>
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

                    {items.map((it, idx) => {
                        const thumbs = pickThumbs(it)
                        const mCount = measurementCount(it)

                        return (
                            <div key={`${it.itemId ?? 'w'}-${idx}`} className={styles.itemBlock}>
                                <div className={styles.itemLine}>
                                    <div className={styles.itemLineLeft}>
                                        <div className={styles.itemTitle}>{it.itemType || `Item #${it.itemId}`}</div>
                                        <div className={styles.itemSubline}>
                                            {mCount > 0 ? `${mCount} Measurements` : '— Measurements'}
                                        </div>
                                    </div>
                                    <div className={styles.itemLineRight}>
                                        <div className={styles.itemPrice}>{fmt(Number(it.makingCharge) || 0)}</div>
                                        {it.urgentDelivery && <div className={styles.pillUrgent}>Urgent Delivery</div>}
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
                        )
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

                    {/* Urgent items list with their dates */}
                    <div className={styles.kvRow}>
                        <div className={styles.kvLabel}>Urgent Items</div>
                        <div className={styles.kvValueAccent}>
                            {/* Show first urgent item inline if only one; else render a small list */}
                            {items.filter(it => it.urgentDelivery).length === 1 ? (
                                (() => {
                                    const u = items.find(it => it.urgentDelivery)!
                                    return `${u.itemType || 'Item'}  •  ${dateLong(u.deliveryDate)}`
                                })()
                            ) : (
                                <div className={styles.urgentList}>
                                    {items.filter(it => it.urgentDelivery).map((u, i) => (
                                        <div key={i} className={styles.urgentLine}>
                                            <span className={styles.urgentName}>{u.itemType || 'Item'}</span>
                                            <span className={styles.urgentDate}>{dateLong(u.deliveryDate)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className={`${styles.footer} ${styles.container}`}>
                <button type="button" className={styles.primary} onClick={onConfirm}>Confirm Order</button>
            </footer>
        </main>
    )
}