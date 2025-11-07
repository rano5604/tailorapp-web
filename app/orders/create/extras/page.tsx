'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useCreateOrder } from '../_store'
import styles from '../CreateOrder.module.css'

function todayISO() {
    const d = new Date()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${mm}-${dd}`
}

function formatDate(iso?: string | null) {
    if (!iso) return ''
    try {
        const d = new Date(iso + 'T00:00:00')
        return new Intl.DateTimeFormat(undefined, {
            weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
        }).format(d)
    } catch {
        return iso ?? ''
    }
}

export default function ExtrasPage() {
    const router = useRouter()
    const { state, setState } = useCreateOrder()

    // guards: require step-1 & step-2 complete
    useEffect(() => {
        const qs = state.shopId ? `?shopId=${state.shopId}` : ''
        if (!state.phone || !state.name) {
            router.replace(`/orders/create${qs}`)
            return
        }
        if (!state.itemId) {
            router.replace(`/orders/create/items${qs}`)
        }
    }, [router, state.phone, state.name, state.itemId, state.shopId])

    const [makingChargeText, setMakingChargeText] = useState(
        state.makingCharge === '' || state.makingCharge == null ? '' : String(state.makingCharge)
    )
    const urgent = !!state.urgentDelivery
    const [error, setError] = useState<string | null>(null)

    function onBack() {
        router.back()
    }

    function onNext() {
        const qs = state.shopId ? `?shopId=${state.shopId}` : ''
        const trimmed = makingChargeText.trim()
        if (!trimmed) return setError('Making charge is required')
        if (urgent && !state.deliveryDate) return setError('Please select a delivery date')
        setError(null)
        router.push(`/orders/create/summary${qs}`)
    }

    // Keep store in sync; convert to number | ''
    function handleMakingChargeChange(v: string) {
        setMakingChargeText(v)
        setError(null)
        const t = v.trim()
        const parsed: number | '' = t === '' ? '' : Number(t)
        if (parsed === '' || Number.isFinite(parsed)) {
            setState(s => ({ ...s, makingCharge: parsed }))
        }
    }

    // Urgent toggle — clear date when turning off
    function handleUrgentToggle(next: boolean) {
        setError(null)
        setState(s => ({ ...s, urgentDelivery: next, deliveryDate: next ? s.deliveryDate : null }))
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

            {/* Step bar (4/4) */}
            <div className={styles.stepBarWrap}>
                <div className={`${styles.container} ${styles.stepBar}`}>
                    <div className={styles.stepBarLeft}>
                        ITEM INFORMATION
                        {state.itemType && (
                            <span className={styles.itemTag}> • {String(state.itemType).toUpperCase()}</span>
                        )}
                    </div>
                    <div className={styles.stepBarRight}>4/4 STEPS</div>
                </div>
                <div className={styles.container}>
                    <div className={styles.stepProgressFull} aria-hidden="true" />
                </div>
            </div>

            {/* Content */}
            <section className={`${styles.formSection} ${styles.container}`}>
                {/* Making Charge */}
                <div className={styles.field}>
                    <label className={styles.label} htmlFor="makingCharge">
                        Making Charge<span className={styles.req}>*</span>
                    </label>
                    <div className={styles.inputWrap}>
                        <input
                            id="makingCharge"
                            className={styles.input}
                            placeholder="Enter Amount"
                            inputMode="decimal"
                            value={makingChargeText}
                            onChange={(e) => handleMakingChargeChange(e.target.value)}
                        />
                    </div>
                </div>

                {/* Urgent Delivery toggle */}
                <div className={styles.boolCard}>
                    <div className={styles.boolLabel}>Urgent Delivery</div>
                    <label className={styles.toggle}>
                        <input
                            className={styles.toggleInput}
                            type="checkbox"
                            checked={urgent}
                            onChange={(e) => handleUrgentToggle(e.target.checked)}
                        />
                        <span className={styles.toggleTrack}><span className={styles.toggleKnob} /></span>
                    </label>
                </div>

                {/* Delivery Date (only when urgent is ON) */}
                {urgent && (
                    <div className={styles.dateField}>
                        <label className={styles.label} htmlFor="deliveryDate">Delivery Date</label>

                        {/* Whole row is clickable via transparent input overlay */}
                        <div className={styles.dateRow}>
              <span className={styles.dateIcon} aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v3H3V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1zM3 10h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8zm4 3a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2H7z" />
                </svg>
              </span>

                            <span className={`${styles.dateText} ${state.deliveryDate ? '' : styles.muted}`}>
                {state.deliveryDate ? formatDate(state.deliveryDate) : 'Pick Delivery Date'}
              </span>

                            <input
                                id="deliveryDate"
                                type="date"
                                className={styles.dateInputOverlay}
                                min={todayISO()}
                                value={state.deliveryDate ?? ''}
                                onChange={(e) =>
                                    setState(s => ({ ...s, deliveryDate: e.target.value || null }))
                                }
                                aria-label="Delivery Date"
                            />
                        </div>
                    </div>
                )}

                {error && <div className={styles.error}>{error}</div>}
            </section>

            {/* Footer */}
            <footer className={`${styles.footer} ${styles.container}`}>
                <button type="button" className={styles.secondary} onClick={onBack}>‹ Back</button>
                <button type="button" className={styles.primary} onClick={onNext}>Next ›</button>
            </footer>
        </main>
    )
}