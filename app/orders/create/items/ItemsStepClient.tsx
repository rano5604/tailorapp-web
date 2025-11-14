'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCreateOrder, MeasurementOption } from '../_store'
import type { ItemType } from './page'
import styles from '../CreateOrder.module.css'
import { api } from '@/lib/apiBase' // <-- import api helper

function getCookie(name: string) {
    if (typeof document === 'undefined') return null
    const m = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'))
    return m ? decodeURIComponent(m[2]) : null
}
function getAuthToken(): string | null {
    if (typeof window === 'undefined') return null
    return (
        sessionStorage.getItem('auth.accessToken') ||
        localStorage.getItem('auth.accessToken') ||
        sessionStorage.getItem('accessToken') ||
        localStorage.getItem('accessToken') ||
        getCookie('access_token') ||
        getCookie('token') ||
        null
    )
}

type LastMeasurementItem = {
    id: number
    nameEn: string | null
    unit: string | null
    value: number | null
    booleanValue: boolean | null
    textValue: string | null
    type: 'NUMERIC' | 'BOOLEAN' | 'TEXT'
    nsId?: string | null
}
type LastMeasurementResponse = {
    status: string
    message: string
    data?: { itemName?: string; measurements: LastMeasurementItem[] }
    meta?: any
}

export default function ItemsStepClient({ items }: { items: ItemType[] }) {
    const router = useRouter()
    const { state, setState } = useCreateOrder()

    // Guard: require step-1
    useEffect(() => {
        if (!state.phone || !state.name) {
            const qs = state.shopId ? `?shopId=${state.shopId}` : ''
            router.replace(`/orders/create${qs}`)
        }
    }, [router, state.phone, state.name, state.shopId])

    const [loadingLast, setLoadingLast] = useState(false)
    const [error, setError] = useState<string | null>(null)

    function onBackTop() { router.back() }
    function onBackBottom() { router.back() }

    function onNext() {
        if (!state.itemId) return
        const qs = state.shopId ? `?shopId=${state.shopId}` : ''
        router.push(`/orders/create/measurements${qs}`)
    }

    function onSelectItem(idStr: string) {
        const id = Number(idStr)
        const item = items.find(i => i.id === id)
        setError(null)
        setState(s => ({
            ...s,
            itemId: id || undefined,
            itemType: item?.nameEn || undefined,
            itemParameters: item?.parameters || [],
            // reset per-item measurement context on change
            measurementOption: ('NEW' as MeasurementOption),
            measurementValues: {},
        }))
    }

    function setMeasurement(m: MeasurementOption) {
        setError(null)
        setState(s => ({ ...s, measurementOption: m }))
    }

    async function handleUseLast() {
        if (!state.itemId) { setError('Please pick an item first.'); return }
        if (!state.phone) { setError('Customer phone is required.'); return }

        const customerId =
            (state as any).customerId ??
            (state as any).customer?.id ??
            (state as any).customerID
        if (!customerId) { setError('Customer ID is required (select customer in step 1).'); return }

        const token = getAuthToken()
        if (!token) { setError('Your session expired. Please log in again.'); return }

        const url = api(
            `/api/orders/last-measurement?phone=${encodeURIComponent(state.phone)}&itemId=${encodeURIComponent(
                String(state.itemId)
            )}&customerId=${encodeURIComponent(String(customerId))}`
        )

        try {
            setLoadingLast(true)
            setError(null)

            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
            if (!res.ok) {
                const txt = await res.text().catch(() => '')
                throw new Error(txt || `Failed to load last measurement (${res.status})`)
            }
            const json: LastMeasurementResponse = await res.json()
            const list = json?.data?.measurements ?? []
            if (!Array.isArray(list) || list.length === 0) {
                throw new Error('No previous measurement found for this customer and item.')
            }

            // Build lookups by nsId and name
            const byNs = new Map<string, LastMeasurementItem>()
            const byName = new Map<string, LastMeasurementItem>()
            for (const m of list) {
                if (m.nsId) byNs.set(String(m.nsId).toLowerCase(), m)
                if (m.nameEn) byName.set(String(m.nameEn).trim().toLowerCase(), m)
            }

            // Map to current parameter ids
            const paramsNow = (state.itemParameters ?? []) as Array<{
                id: number
                nameEn?: string
                nsId?: string
                type?: string
                unit?: string | null
            }>

            const mapped: Record<string, string | number | boolean> = {}
            for (const p of paramsNow) {
                const keyNs = String((p as any).nsId ?? '').toLowerCase()
                const keyName = String(p.nameEn ?? '').trim().toLowerCase()

                let src = keyNs ? byNs.get(keyNs) : undefined
                if (!src && keyName) src = byName.get(keyName)
                if (!src) continue

                const t = String(p.type ?? src.type ?? 'NUMERIC').toUpperCase()
                if (t === 'BOOLEAN') mapped[String(p.id)] = !!src.booleanValue
                else if (t === 'TEXT') mapped[String(p.id)] = src.textValue ?? ''
                else if (typeof src.value === 'number') mapped[String(p.id)] = src.value
            }

            // Persist values and mark option as LAST
            setState(s => ({
                ...s,
                measurementValues: { ...(s.measurementValues ?? {}), ...mapped },
                measurementOption: ('LAST' as MeasurementOption), // type-safe set
            }))

            // Navigate to measuring page
            const qs = state.shopId ? `?shopId=${state.shopId}` : ''
            router.push(`/orders/create/measurements${qs}`)
        } catch (e: any) {
            setError(e?.message || 'Failed to fetch last measurement.')
            setState(s => ({ ...s, measurementOption: ('NEW' as MeasurementOption) }))
        } finally {
            setLoadingLast(false)
        }
    }

    const canUseLast = !!state.itemId && !loadingLast

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <div className={`${styles.container} ${styles.headerRow}`}>
                    <button type="button" className={styles.iconBack} onClick={onBackTop} aria-label="Back"> ← </button>
                    <h1 className={styles.title}>Create New Order</h1>
                    <div className={styles.headerRight} />
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
                            checked={(state.measurementOption ?? 'NEW') === 'NEW'}
                            onChange={() => setMeasurement('NEW' as MeasurementOption)}
                            disabled={loadingLast}
                        />
                        <span>New measurement</span>
                    </label>

                    <label className={styles.radioRow} style={{ opacity: canUseLast ? 1 : 0.6 }}>
                        <input
                            type="radio"
                            name="measure"
                            checked={state.measurementOption === 'USE_LAST'}
                            onChange={handleUseLast}
                            disabled={!canUseLast}
                        />
                        <span>
              Use last order measurement
                            {loadingLast ? ' (loading…)' : ''}
            </span>
                    </label>

                    <label className={`${styles.radioRow} ${styles.radioDisabled}`}>
                        <input type="radio" name="measure" disabled />
                        <span>Reuse from current order</span>
                    </label>

                    {error && <div className={styles.error} style={{ marginTop: 8 }}>{error}</div>}
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
