'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import styles from './Login.module.css'

export default function LoginForm() {
    const router = useRouter()
    const search = useSearchParams()
    const redirectTo = search.get('redirect') ?? '/dashboard'

    // Your API expects "username" and "pin"
    const [username, setUsername] = useState('')
    const [pin, setPin] = useState('')
    const [remember, setRemember] = useState(false)

    const [showPin, setShowPin] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const validate = () => {
        if (!/^\S+@\S+\.\S+$/.test(username)) return 'Please enter a valid email address.'
        if (!/^\d{4,6}$/.test(pin)) return 'PIN must be 4–6 digits.'
        return null
    }

    function setCookie(name: string, value: string, maxAgeSeconds: number) {
        // Add ; Secure when you deploy under HTTPS
        document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`
    }

    function readTokenFromHeaders(res: Response): string | null {
        let token =
            res.headers.get('Authorization') ||
            res.headers.get('authorization') ||
            res.headers.get('X-Auth-Token') ||
            res.headers.get('x-auth-token') ||
            null

        if (token && token.toLowerCase().startsWith('bearer ')) {
            token = token.slice(7)
        }
        return token
    }

    function shopIdFromJwt(token?: string | null): string | undefined {
        if (!token) return undefined
        try {
            const parts = token.split('.')
            if (parts.length < 2) return undefined
            // base64url → base64
            const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
            const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
            const json = atob(padded)
            const payload = JSON.parse(json)
            const sid = payload.shopID ?? payload.shopId ?? payload.shop_id ?? payload['shop-id']
            return sid != null ? String(sid) : undefined
        } catch {
            return undefined
        }
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        const v = validate()
        if (v) return setError(v)

        setError(null)
        setLoading(true)

        try {
            const LOGIN_URL = '/api/auth/login' // Next.js rewrite should proxy this to your backend
            const res = await fetch(LOGIN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include', // keep for server cookies (e.g., JSESSIONID)
                body: JSON.stringify({ username, pin }),
            })

            const isJson = (res.headers.get('content-type') || '').includes('application/json')
            const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => '')

            if (!res.ok) {
                const msg =
                    (typeof body === 'string' && body) ||
                    (body && (body.message || body.error || body.detail)) ||
                    `Login failed (${res.status})`
                throw new Error(msg)
            }

            // 1) Token from headers or JSON
            let token = readTokenFromHeaders(res)
            if (!token && typeof body === 'object' && body) {
                token = body?.data?.token || body?.token || null
            }

            // 2) ShopId from body, or decode from JWT claims
            let shopId: string | undefined =
                typeof body === 'object' && body
                    ? body?.data?.shopID ?? body?.data?.shopId ?? body?.data?.shop_id
                    : undefined
            if (shopId == null) {
                shopId = shopIdFromJwt(token)
            }

            // 3) Persist cookies for server guards and links
            const maxAge = remember ? 60 * 60 * 24 * 7 : 60 * 60 // 7d or 1h
            if (token) setCookie('access_token', token, maxAge)
            if (shopId != null) setCookie('shop_id', String(shopId), maxAge)
            if (!token && shopId == null) {
                // last resort so guards let you in if backend uses only httpOnly cookies
                setCookie('session_ok', '1', maxAge)
            }

            // 4) Go to dashboard
            router.replace(redirectTo)
        } catch (err: any) {
            setError(err.message ?? 'Login failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className={styles.loginPage}>
            <header className={styles.loginHeader}>
                <BookIcon className={styles.appIcon} />
                <h1 className={styles.title}>Log in to your Account</h1>
                <p className={styles.subtitle}>Welcome back, please enter your details.</p>
            </header>

            <form className={styles.card} onSubmit={handleSubmit} noValidate>
                <div className={styles.field}>
                    <label htmlFor="username" className={styles.label}>Email Address</label>
                    <input
                        id="username"
                        type="email"
                        className={styles.input}
                        placeholder="you@example.com"
                        autoComplete="email"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                </div>

                <div className={styles.field}>
                    <label htmlFor="pin" className={styles.label}>PIN</label>
                    <div className={styles.inputWrap}>
                        <input
                            id="pin"
                            type={showPin ? 'text' : 'password'}
                            className={`${styles.input} ${styles.inputHasButton}`}
                            placeholder="••••"
                            inputMode="numeric"
                            pattern="\d{4,6}"
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                        />
                        <button
                            type="button"
                            className={styles.iconBtn}
                            aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                            onClick={() => setShowPin((s) => !s)}
                        >
                            {showPin ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                    </div>
                </div>

                <div className={`${styles.row} ${styles.between}`}>
                    <label className={styles.checkbox}>
                        <input
                            type="checkbox"
                            checked={remember}
                            onChange={(e) => setRemember(e.target.checked)}
                        />
                        <span>Remember me</span>
                    </label>
                    <a className={styles.link} href="/forgot-pin">Forgot PIN?</a>
                </div>

                {error && <div className={styles.error}>{error}</div>}

                <button className={styles.primaryBtn} type="submit" disabled={loading}>
                    {loading ? 'Logging in…' : 'Login'}
                </button>

                <div className={styles.divider}>
                    <span className={styles.line} />
                    <span className={styles.dividerText}>OR</span>
                    <span className={styles.line} />
                </div>
            </form>

            <footer className={styles.footer}>
                <span>Don't have an account? </span>
                <a className={styles.link} href="/signup">Signup</a>
            </footer>
        </div>
    )
}

/* Simple inline icons so you don't need an icon library */
function BookIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17.5a2.5 2.5 0 0 1-2.5 2.5H6.5A2.5 2.5 0 0 1 4 19.5V4.5z" opacity=".2"/>
            <path d="M6.5 3A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21H18a1 1 0 0 0 1-1V3H6.5zM8 6h8v1.5H8V6zm0 3h8v1.5H8V9zm0 3h6v1.5H8V12z"/>
        </svg>
    )
}
function EyeIcon() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    )
}
function EyeOffIcon() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.3 20.3 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a20.3 20.3 0 0 1-4.96 5.89" />
            <path d="m1 1 22 22" />
        </svg>
    )
}