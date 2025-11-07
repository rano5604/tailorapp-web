'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import { useCreateOrder, ItemParam } from '../_store'
import styles from '../CreateOrder.module.css'

type Val = string | number | boolean

export default function MeasurementsPage() {
    const router = useRouter()
    const { state, setMeasurementValues } = useCreateOrder()

    // Guard: require step-1 and item selection
    useEffect(() => {
        if (!state.phone || !state.name) {
            router.replace(`/orders/create-order${state.shopId ? `?shopId=${state.shopId}` : ''}`)
            return
        }
        if (!state.itemId || !state.itemParameters || state.itemParameters.length === 0) {
            router.replace(`/orders/create-order/items${state.shopId ? `?shopId=${state.shopId}` : ''}`)
        }
    }, [router, state.phone, state.name, state.itemId, state.itemParameters, state.shopId])

    const params: ItemParam[] = useMemo(
        () => (state.itemParameters ?? []) as ItemParam[],
        [state.itemParameters]
    )

    // Nav
    const onBackTop = () => router.back()
    const onBackBottom = () => router.back()
    const onNext = () => {
        // Values are already persisted into state.measurementValues via setMeasurementValues calls
        router.push(`/orders/create/photos${state.shopId ? `?shopId=${state.shopId}` : ''}`)
    }

    // Value helpers
    const getVal = (pid: number): Val | undefined =>
        state.measurementValues?.[String(pid)]

    const setVal = (pid: number, v: Val) =>
        setMeasurementValues({ [String(pid)]: v })

    const addFraction = (pid: number, frac: number) => {
        const cur = Number(getVal(pid) ?? 0)
        const next = Math.round((cur + frac) * 100) / 100
        setVal(pid, next)
    }

    // Suggestion fallbacks when API doesn't provide suggestiveValues
    const SIZES_STD = ['28','30','32','34','36','38','40','42','44']
    const LENGTH_STD = ['38','40','42','44']
    const CHEST_STD  = ['32','34','36','38','40','42','44']

    function suggestionsForParam(p: ItemParam): string[] {
        if (Array.isArray(p.suggestiveValues) && p.suggestiveValues.length > 0) {
            return p.suggestiveValues
        }
        const name = (p.nameEn ?? '').toLowerCase()
        const unit = (p.unit ?? '').toLowerCase()
        const t = (p.type ?? 'NUMERIC').toUpperCase()

        if (t !== 'NUMERIC') return []
        if (unit === 'inch') {
            if (name.includes('waist') || name.includes('hip') || name.includes('thigh') || name.includes('knee')) {
                return SIZES_STD
            }
            if (name.includes('length')) return LENGTH_STD
            if (name.includes('chest') || name.includes('bust')) return CHEST_STD
            if (name.includes('neck')) return ['14','14.5','15','15.5','16','16.5','17']
            if (name.includes('sleeve') || name.includes('arm')) return ['24','25','26','27','28','29']
            if (name.includes('shoulder')) return ['16','17','18','19','20']
            if (name.includes('cuff')) return ['7','7.5','8','8.5','9']
        }
        return SIZES_STD
    }

    function renderNumeric(p: ItemParam) {
        const v = getVal(p.id)
        const sugg: string[] = suggestionsForParam(p)
        const hasSuggest = sugg.length > 0
        const isInch = (p.unit ?? '').toLowerCase() === 'inch'

        const nv: string | number | undefined =
            typeof v === 'number' ? v :
                (typeof v === 'string' ? v : undefined)

        return (
            <div className={styles.paramCard}>
                <div className={styles.paramName} style={{ marginBottom: 6 }}>{p.nameEn}</div>

                <div className={styles.numStack}>
                    {/* Input group line: input + fraction buttons + unit */}
                    <div className={styles.numLine}>
                        <div className={styles.numGroup}>
                            <input
                                className={styles.groupInput}
                                type="number"
                                step="0.25"
                                inputMode="decimal"
                                placeholder={p.unit ? `Enter (${p.unit})` : 'Enter value'}
                                value={nv}
                                onChange={(e) => {
                                    const s = e.target.value
                                    if (s === '') setVal(p.id, '')
                                    else {
                                        const num = Number(s)
                                        setVal(p.id, Number.isFinite(num) ? num : '')
                                    }
                                }}
                            />
                            <button type="button" className={styles.groupBtn} onClick={() => addFraction(p.id, 0.25)}>+1/4</button>
                            <button type="button" className={styles.groupBtn} onClick={() => addFraction(p.id, 0.5)}>+1/2</button>
                            <button type="button" className={styles.groupBtn} onClick={() => addFraction(p.id, 0.75)}>+3/4</button>
                        </div>

                        {p.unit && <span className={styles.unitRight}>{p.unit}</span>}
                    </div>

                    {/* Suggestion chips */}
                    {hasSuggest && (
                        <div className={styles.chips}>
                            {sugg.map((s) => {
                                const label = isInch ? `${s}″` : s
                                const isActive = String(v ?? '') === s
                                return (
                                    <button
                                        key={`${p.id}-${s}`}
                                        type="button"
                                        className={`${styles.chip} ${isActive ? styles.chipActive : ''}`}
                                        onClick={() => {
                                            const num = Number(s)
                                            setVal(p.id, Number.isFinite(num) ? num : s)
                                        }}
                                    >
                                        {label}
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    function renderBoolean(p: ItemParam) {
        const v = Boolean(getVal(p.id))
        return (
            <div className={styles.boolCard}>
                <span className={styles.boolLabel}>{p.nameEn}</span>

                <label className={styles.toggle} aria-label={p.nameEn}>
                    <input
                        className={styles.toggleInput}
                        type="checkbox"
                        checked={v}
                        onChange={(e) => setVal(p.id, e.target.checked)}
                    />
                    <span className={styles.toggleTrack}>
            <span className={styles.toggleKnob} />
          </span>
                </label>
            </div>
        )
    }

    function renderText(p: ItemParam) {
        const raw = getVal(p.id)
        const tv: string = typeof raw === 'string' ? raw : ''
        const sugg: string[] = Array.isArray(p.suggestiveValues) ? p.suggestiveValues : []
        const hasSuggest = sugg.length > 0

        return (
            <div className={`${styles.paramCard} ${styles.textCard}`}>
                <input
                    className={styles.textInputBig}
                    type="text"
                    placeholder={p.nameEn || 'Enter'}
                    value={tv}
                    onChange={(e) => setVal(p.id, e.target.value)}
                />

                {hasSuggest && (
                    <div className={styles.chipsText}>
                        {sugg.map((s) => (
                            <button
                                key={`${p.id}-${s}`}
                                type="button"
                                className={`${styles.chipText} ${tv === s ? styles.chipTextActive : ''}`}
                                onClick={() => setVal(p.id, s)}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    return (
        <main className={styles.page}>
            {/* Header */}
            <header className={styles.header}>
                <div className={`${styles.container} ${styles.headerRow}`}>
                    <button type="button" className={styles.iconBack} onClick={onBackTop} aria-label="Back" > ← </button>
                    <h1 className={styles.title}>Create New Order</h1> <div className={styles.headerRight} />
                </div>
            </header>

            {/* Step bar */}
            <div className={styles.stepBarWrap}>
                <div className={`${styles.container} ${styles.stepBar}`}>
                    <div className={styles.stepBarLeft}>
                        MEASURING PARAMETER
                        {state.itemType && (
                            <span className={styles.itemTag}> - {state.itemType.toUpperCase()}</span>
                        )}
                    </div>
                    <div className={styles.stepBarRight}>2/4 STEPS</div>
                </div>
                <div className={styles.container}>
                    <div className={styles.stepProgressTwo} aria-hidden="true" />
                </div>
            </div>

            {/* Dynamic fields */}
            <section className={`${styles.formSection} ${styles.container}`}>
                {params.length === 0 ? (
                    <div className={styles.empty}>No parameters available for this item.</div>
                ) : (
                    params.map((p: ItemParam) => {
                        const t = (p.type ?? 'NUMERIC').toUpperCase()
                        if (t === 'BOOLEAN') return <div key={p.id}>{renderBoolean(p)}</div>
                        if (t === 'TEXT')    return <div key={p.id}>{renderText(p)}</div>
                        return <div key={p.id}>{renderNumeric(p)}</div>
                    })
                )}

                {/* Special Request (new design) */}
                <div className={`${styles.specialSection}`}>
                    <label htmlFor="specialRequest" className={styles.specialLabel}>Special Request</label>
                    <textarea
                        id="specialRequest"
                        className={styles.specialArea}
                        placeholder="Enter Request here"
                        value={String(state.measurementValues?.specialRequest ?? '')}
                        onChange={(e) => setMeasurementValues({ specialRequest: e.target.value })}
                    />
                </div>
            </section>

            {/* Footer */}
            <footer className={`${styles.footer} ${styles.container}`}>
                <button type="button" className={styles.secondary} onClick={onBackBottom}>‹ Back</button>
                <button
                    type="button"
                    className={styles.primary}
                    onClick={onNext}
                    disabled={!state.itemId}
                >
                    Next ›
                </button>
            </footer>
        </main>
    )
}