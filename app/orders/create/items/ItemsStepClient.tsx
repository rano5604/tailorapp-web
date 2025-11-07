'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCreateOrder, MeasurementOption } from '../_store'
import type { ItemType } from './page'
import styles from '../CreateOrder.module.css'

export default function ItemsStepClient({ items }: { items: ItemType[] }) {
    const router = useRouter()
    const { state, setState } = useCreateOrder()

    // If step-1 missing, send back
    useEffect(() => {
        if (!state.phone || !state.name) {
            const qs = state.shopId ? `?shopId=${state.shopId}` : ''
            router.replace(`/orders/create${qs}`)
        }
    }, [router, state.phone, state.name, state.shopId])

    function onBackTop()    { router.back() }
    function onBackBottom() { router.back() }
    function onNext() {
        if (!state.itemId) return
        // Go to measurement step (you can change this route)
        const qs = state.shopId ? `?shopId=${state.shopId}` : ''
        router.push(`/orders/create/measurements${qs}`)
    }

    function onSelectItem(idStr: string) {
        const id = Number(idStr)
        const item = items.find(i => i.id === id)
        setState(s => ({
            ...s,
            itemId: id || undefined,
            itemType: item?.nameEn || undefined,
            itemParameters: item?.parameters || [],
        }))
    }

    function setMeasurement(m: MeasurementOption) {
        setState(s => ({ ...s, measurementOption: m }))
    }

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <div className={`${styles.container} ${styles.headerRow}`}>
                    <button type="button" className={styles.iconBack} onClick={onBackTop} aria-label="Back" > ← </button>
                    <h1 className={styles.title}>Create New Order</h1> <div className={styles.headerRight} />
                </div>
            </header>
            {/* Step bar */}
            <div className={styles.stepBarWrap}>
                <div className={`${styles.container} ${styles.stepBar}`}>
                    <div className={styles.stepBarLeft}>ITEM INFORMATION</div>
                    <div className={styles.stepBarRight}>1/4 STEPS</div>
                </div>
                <div className={styles.container}>
                    <div className={styles.stepProgress} aria-hidden="true" />
                </div>
            </div>

            {/* Content */}
            <section className={`${styles.formSection} ${styles.container}`}>
                <div className={styles.field}>
                    <div className={styles.selectWrap}>
                        <select
                            className={styles.select}
                            value={state.itemId ?? ''}
                            onChange={(e) => onSelectItem(e.target.value)}
                        >
                            <option value="" disabled>Select Item Type</option>
                            {items.map((it) => (
                                <option key={it.id} value={it.id}>
                                    {it.nameEn}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className={styles.field}>
                    <div className={styles.label}>Measurement Options<span className={styles.req}>*</span></div>

                    <label className={styles.radioRow}>
                        <input
                            type="radio"
                            name="measure"
                            checked={state.measurementOption === 'NEW'}
                            onChange={() => setMeasurement('NEW')}
                        />
                        <span>New measurement</span>
                    </label>

                    <label className={`${styles.radioRow} ${styles.radioDisabled}`}>
                        <input type="radio" name="measure" disabled />
                        <span>Use last order measurement</span>
                    </label>

                    <label className={`${styles.radioRow} ${styles.radioDisabled}`}>
                        <input type="radio" name="measure" disabled />
                        <span>Reuse from current order</span>
                    </label>
                </div>
            </section>

            {/* Footer */}
            <footer className={`${styles.footer} ${styles.container}`}>
                <button className={styles.secondary} onClick={onBackBottom}>‹ Back</button>
                <button className={styles.primary} onClick={onNext} disabled={!state.itemId}>
                    Next ›
                </button>
            </footer>
        </main>
    )
}