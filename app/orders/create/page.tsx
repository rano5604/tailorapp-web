'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useCreateOrder, Gender } from './_store'
import styles from './CreateOrder.module.css'

export default function CreateOrderPage() {
    const router = useRouter()
    const sp = useSearchParams()
    const { state, setState } = useCreateOrder()
    const shopId = sp.get('shopId') ?? undefined

    const [phone, setPhone] = useState(state.phone)
    const [name, setName] = useState(state.name)
    const [gender, setGender] = useState<Gender>(state.gender)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        // hydrate shopId from URL once
        if (shopId && Number(shopId) !== state.shopId) {
            setState(s => ({ ...s, shopId: Number(shopId) }))
        }
    }, [shopId, setState, state.shopId])

    function validate(): string | null {
        if (!phone.trim()) return 'Phone number is required'
        if (!name.trim()) return 'Customer name is required'
        return null
    }

    function onBack() {
        router.back()
    }

    function onNext() {
        const v = validate()
        if (v) return setError(v)
        setError(null)
        // persist to store
        setState(s => ({ ...s, phone, name, gender }))
        // go to step 2 (keep shopId in URL)
        const qs = state.shopId ? `?shopId=${state.shopId}` : ''
        router.push(`/orders/create/items${qs}`)
    }

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <button className={styles.backBtn} onClick={onBack} aria-label="Back">←</button>
                <h1 className={styles.title}>Create New Order</h1>
                <div className={styles.headerRight} />
            </header>

            <section className={styles.formSection}>
                <div className={styles.field}>
                    <label htmlFor="phone" className={styles.label}>Phone Number<span className={styles.req}>*</span></label>
                    <div className={styles.inputWrap}>
                        <input
                            id="phone"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            placeholder="Enter Phone Number"
                            className={styles.input}
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ''))}
                        />
                        <button type="button" className={styles.iconBtn} aria-label="Pick from contacts">📇</button>
                    </div>
                </div>

                <div className={styles.field}>
                    <label htmlFor="name" className={styles.label}>Customer Name<span className={styles.req}>*</span></label>
                    <input
                        id="name"
                        type="text"
                        autoComplete="name"
                        placeholder="Enter Customer Name"
                        className={styles.input}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>

                <div className={styles.field}>
                    <div className={styles.label}>Select Gender<span className={styles.req}>*</span></div>
                    <div className={styles.segment}>
                        {(['MALE','FEMALE','OTHERS'] as Gender[]).map(g => (
                            <button
                                key={g}
                                type="button"
                                onClick={() => setGender(g)}
                                className={`${styles.segBtn} ${gender === g ? styles.segActive : ''}`}
                            >
                                {g.charAt(0) + g.slice(1).toLowerCase()}
                            </button>
                        ))}
                    </div>
                </div>

                {error && <div className={styles.error}>{error}</div>}
            </section>

            <footer className={styles.footer}>
                <button className={styles.secondary} onClick={onBack}>‹ Back</button>
                <button className={styles.primary} onClick={onNext}>Next ›</button>
            </footer>
        </main>
    )
}