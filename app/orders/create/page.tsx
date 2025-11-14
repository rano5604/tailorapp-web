'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { useCreateOrder, Gender } from './_store'
import styles from './CreateOrder.module.css'
import { api } from '@/lib/apiBase'

type CustomerLite = {
    id: number
    name: string
    phone: string
    gender?: string | null
    photo?: string | null
}

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
function normalizePhone(raw: string) {
    const digits = (raw || '').replace(/\D/g, '')
    if (digits.startsWith('00880')) return '0' + digits.slice(5)
    if (digits.startsWith('880')) return '0' + digits.slice(3)
    if (digits.startsWith('0')) return digits
    return digits
}
function mapGender(g?: string | null): Gender {
    const up = String(g || '').toUpperCase()
    if (up === 'FEMALE') return 'FEMALE'
    if (up === 'OTHERS') return 'OTHERS'
    return 'MALE'
}

export default function CreateOrderPage() {
    const router = useRouter()
    const sp = useSearchParams()
    const { state, setState } = useCreateOrder()
    const shopId = sp.get('shopId') ?? undefined

    const [phone, setPhone] = useState(state.phone ?? '')
    const [name, setName] = useState(state.name ?? '')
    const [gender, setGender] = useState<Gender>(state.gender ?? 'MALE')
    const [error, setError] = useState<string | null>(null)

    // Auto-lookup UI state
    const [loadingLookup, setLoadingLookup] = useState(false)
    const [lookupMsg, setLookupMsg] = useState<string | null>(null)
    const [showPicker, setShowPicker] = useState(false)
    const [matches, setMatches] = useState<CustomerLite[]>([])

    // Avoid duplicate calls for the same normalized phone
    const lastFetchedRef = useRef<string>('')

    useEffect(() => {
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
        setState(s => ({ ...s, phone, name, gender }))
        const qs = state.shopId ? `?shopId=${state.shopId}` : ''
        router.push(`/orders/create/items${qs}`)
    }

    function applyCustomer(c: CustomerLite) {
        const g = mapGender(c.gender)
        // Persist to store
        setState(s => ({
            ...s,
            customerId: c.id,
            phone: c.phone || s.phone,
            name: c.name || s.name,
            gender: g,
        }))
        // Reflect in local inputs (don’t override if user already typed a different name)
        setPhone(c.phone || phone)
        if (!name) setName(c.name || name)
        setGender(g)
        setLookupMsg(null)
    }

    // Auto-lookup effect: debounced call as user types phone
    useEffect(() => {
        const token = getAuthToken()
        const normalized = normalizePhone(phone)

        // Conditions to trigger lookup:
        // - Have token
        // - Normalized looks like a BD number (11 digits starting with 0)
        // - Not the same as last fetched
        const looksComplete = normalized.length >= 11 && normalized.startsWith('0')
        if (!token || !looksComplete || normalized === lastFetchedRef.current) {
            if (!looksComplete) {
                setLookupMsg(null)
                setMatches([])
                setShowPicker(false)
                // Clear previous selection if phone is being changed to something else
                if (state.customerId) setState(s => ({ ...s, customerId: undefined }))
            }
            return
        }

        const controller = new AbortController()
        const timer = setTimeout(async () => {
            try {
                setLoadingLookup(true)
                setLookupMsg('Looking up customer…')
                const res = await fetch(api(`/api/customers/by-phone?phone=${encodeURIComponent(normalized)}`), {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                })
                if (!res.ok) {
                    const txt = await res.text().catch(() => '')
                    throw new Error(txt || `Lookup failed (${res.status})`)
                }
                const json = await res.json()
                const list: CustomerLite[] = Array.isArray(json?.data) ? json.data : []
                lastFetchedRef.current = normalized

                if (list.length === 0) {
                    // No match: clear any previous selection but keep user inputs
                    if (state.customerId) setState(s => ({ ...s, customerId: undefined }))
                    setMatches([])
                    setShowPicker(false)
                    setLookupMsg('No existing customer found for this phone.')
                    return
                }

                if (list.length === 1) {
                    applyCustomer(list[0])
                    setShowPicker(false)
                    return
                }

                // Multiple matches → let user pick; open dialog automatically
                setMatches(list)
                setShowPicker(true)
                setLookupMsg(null)
            } catch (e: any) {
                if (e?.name === 'AbortError') return
                setLookupMsg(e?.message || 'Failed to lookup customers.')
            } finally {
                setLoadingLookup(false)
            }
        }, 500) // debounce 500ms

        return () => {
            clearTimeout(timer)
            controller.abort()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phone]) // re-run when user types

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <button className={styles.backBtn} onClick={onBack} aria-label="Back">←</button>
                <h1 className={styles.title}>Create New Order</h1>
                <div className={styles.headerRight} />
            </header>

            <section className={styles.formSection}>
                {/* Phone */}
                <div className={styles.field}>
                    <label htmlFor="phone" className={styles.label}>
                        Phone Number<span className={styles.req}>*</span>
                    </label>
                    <div className={styles.inputWrap}>
                        <input
                            id="phone"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            placeholder="Enter Phone Number"
                            className={styles.input}
                            value={phone}
                            onChange={(e) => {
                                setPhone(e.target.value.replace(/[^\d+]/g, ''))
                                // When phone changes, clear selected customerId so we don’t accidentally reuse it
                                if (state.customerId) setState(s => ({ ...s, customerId: undefined }))
                            }}
                        />
                        {/* Keep the icon if you like; not required anymore since lookup is automatic */}
                        <button type="button" className={styles.iconBtn} aria-label="Contacts" title="Contacts">📇</button>
                    </div>
                    {loadingLookup && <div className={styles.muted} style={{ marginTop: 6 }}>Looking up…</div>}
                    {lookupMsg && !loadingLookup && <div className={styles.muted} style={{ marginTop: 6 }}>{lookupMsg}</div>}
                </div>

                {/* Name */}
                <div className={styles.field}>
                    <label htmlFor="name" className={styles.label}>
                        Customer Name<span className={styles.req}>*</span>
                    </label>
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

                {/* Gender */}
                <div className={styles.field}>
                    <div className={styles.label}>
                        Select Gender<span className={styles.req}>*</span>
                    </div>
                    <div className={styles.segment}>
                        {(['MALE', 'FEMALE', 'OTHERS'] as Gender[]).map((g) => (
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

            {/* Customer picker dialog for multiple matches */}
            {showPicker && (
                <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Select customer">
                    <div style={dialogStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <strong style={{ fontSize: 16 }}>Select a customer</strong>
                            <button type="button" onClick={() => setShowPicker(false)} style={smallIconBtn}>✕</button>
                        </div>

                        <div style={{ maxHeight: 360, overflow: 'auto', display: 'grid', gap: 8 }}>
                            {matches.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => { applyCustomer(c); setShowPicker(false) }}
                                    style={pickerRow}
                                >
                                    <div style={{ fontWeight: 700 }}>{c.name}</div>
                                    <div style={{ color: '#6b7280', fontSize: 12 }}>
                                        {c.phone} • {String(c.gender ?? '').toLowerCase() || '—'}
                                    </div>
                                </button>
                            ))}
                        </div>

                        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button type="button" style={btnGhost} onClick={() => setShowPicker(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    )
}

/* Small inline styles for the dialog */
const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.35)',
    display: 'grid',
    placeItems: 'center',
    zIndex: 1000,
}
const dialogStyle: React.CSSProperties = {
    width: 'min(520px, 94vw)',
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #e5e7eb',
    padding: 16,
    boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
}
const smallIconBtn: React.CSSProperties = {
    height: 28,
    minWidth: 28,
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    background: '#fff',
    cursor: 'pointer',
}
const pickerRow: React.CSSProperties = {
    textAlign: 'left' as const,
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#f9fafb',
}
const btnGhost: React.CSSProperties = {
    height: 36,
    padding: '0 12px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#111827',
    fontWeight: 700,
}
