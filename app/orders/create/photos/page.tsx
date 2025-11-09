'use client'

import React, { useEffect, useMemo, useRef, useState, useId, type ChangeEvent } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCreateOrder } from '../_store'
import styles from '../CreateOrder.module.css'

type PhotoKey = 'orderCloth' | 'designPhoto' | 'patternPhoto' | 'measurementCloth' | 'designSketch'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8083'

// Android helper (for gallery hint)
const isAndroid = () =>
    typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

// Map photo key -> imageName the upload API expects
const imageNameMap: Record<Exclude<PhotoKey, 'designSketch'> | 'designSketch', string> = {
    orderCloth: 'cloth',
    designPhoto: 'design',
    patternPhoto: 'pattern',
    measurementCloth: 'measurement',
    designSketch: 'design-sketch',
}

/* Token helpers */
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

/* Convert file -> data URL (for preview) */
function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = reject
        reader.readAsDataURL(file)
    })
}

/* Extract base64 from data URL */
function dataUrlToBase64(dataUrl: string) {
    const i = dataUrl.indexOf(',')
    return i >= 0 ? dataUrl.slice(i + 1) : dataUrl
}

/* Call your upload-base64 API, return server image URL */
async function uploadBase64(photoBase64: string, imageName: string, token: string) {
    const res = await fetch(`${API_BASE}/api/photos/upload-base64`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ photo: photoBase64, imageName }),
    })
    if (res.status === 401) throw new Error('Unauthorized. Please login again.')
    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `Upload failed (${res.status})`)
    }
    const data = await res.json().catch(() => ({} as any))
    // Try common keys for image URL
    const url =
        data?.data?.url ||
        data?.data?.imageUrl ||
        data?.imageUrl ||
        data?.url ||
        data?.path ||
        data?.fileUrl
    if (!url) throw new Error('Upload succeeded but response had no image URL')
    return String(url)
}

export default function PhotoCapturePage() {
    const router = useRouter()
    const { state, setState } = useCreateOrder()

    // Guard: require customer + item
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

    const qs = useMemo(() => (state.shopId ? `?shopId=${state.shopId}` : ''), [state.shopId])

    const photos = state.photos ?? {}                  // data URLs for quick preview
    const photoUrls = state.photoUrls ?? {}            // server URLs (API response)
    const clothCardRef = useRef<HTMLDivElement | null>(null)

    const [error, setError] = useState<string | null>(null)
    const [busyKey, setBusyKey] = useState<PhotoKey | null>(null)  // show uploading state per card

    const onBack = () => router.back()

    const onNext = () => {
        // Require server URL for cloth photo
        if (!photoUrls.orderCloth) {
            setError('Order Cloth Photo is required')
            clothCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            return
        }
        setError(null)
        router.push(`/orders/create/extras${qs}`)
    }

    function setPreviewAndUrl(key: PhotoKey, previewUrl?: string, serverUrl?: string) {
        setState(s => ({
            ...s,
            photos: { ...(s.photos ?? {}), [key]: previewUrl },
            photoUrls: { ...(s.photoUrls ?? {}), [key]: serverUrl },
        }))
    }

    async function handlePick(
        key: Extract<PhotoKey, 'orderCloth' | 'designPhoto' | 'patternPhoto' | 'measurementCloth'>,
        e: ChangeEvent<HTMLInputElement>
    ) {
        const file = e.target.files?.[0]
        if (!file) return
        const token = getAuthToken()
        if (!token) {
            setError('Your session expired. Please log in again.')
            return
        }

        try {
            setBusyKey(key)
            // 1) show preview immediately
            const dataUrl = await fileToDataUrl(file)
            setPreviewAndUrl(key, dataUrl, photoUrls[key])

            // 2) upload base64 to API and persist returned URL
            const base64 = dataUrlToBase64(dataUrl)
            const serverUrl = await uploadBase64(base64, imageNameMap[key], token)
            setPreviewAndUrl(key, dataUrl, serverUrl)
            setError(null)
        } catch (err: any) {
            console.error('Upload error', err)
            setError(err?.message || 'Failed to upload image')
            // if failed, keep preview but remove server URL for this key
            setPreviewAndUrl(key, photos[key], undefined)
        } finally {
            setBusyKey(null)
            e.currentTarget.value = '' // allow re-selection of same file
        }
    }

    const goDraw = () => {
        router.push(`/orders/create/photos/draw${qs}`)
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

            {/* Step bar */}
            <div className={styles.stepBarWrap}>
                <div className={`${styles.container} ${styles.stepBar}`}>
                    <div className={styles.stepBarLeft}>
                        PHOTO CAPTURE
                        {state.itemType && <span className={styles.itemTag}> - {String(state.itemType).toUpperCase()}</span>}
                    </div>
                    <div className={styles.stepBarRight}>3/4 STEPS</div>
                </div>
                <div className={styles.container}>
                    <div className={styles.stepProgressThree} aria-hidden="true" />
                </div>
            </div>

            {/* Content */}
            <section className={`${styles.formSection} ${styles.container}`}>
                {/* Order Cloth Photo (REQUIRED) */}
                <PhotoCard
                    ref={clothCardRef}
                    title={<>Order Cloth Photo <span className={styles.req}>*</span></>}
                    desc="Capture the cloth that will be used for this order."
                    preview={photos.orderCloth}
                    onClear={() => setPreviewAndUrl('orderCloth', undefined, undefined)}
                    highlightError={!!error && !photoUrls.orderCloth}
                    uploading={busyKey === 'orderCloth'}
                    serverUrl={photoUrls.orderCloth}
                >
                    <div className={styles.duoRow}>
                        <CaptureMini label="Capture" onPick={(e) => handlePick('orderCloth', e)} />
                        <UploadMini label="Upload" onPick={(e) => handlePick('orderCloth', e)} />
                    </div>
                    {!!error && !photoUrls.orderCloth && (
                        <div className={styles.error} style={{ marginTop: 10 }}>{error}</div>
                    )}
                </PhotoCard>

                {/* Design Drawing */}
                <PhotoCard
                    title="Design Drawing"
                    desc="Draw or capture your sketch"
                    preview={photos.designSketch || photos.designPhoto}
                    onClear={() => {
                        setPreviewAndUrl('designSketch', undefined, undefined)
                        setPreviewAndUrl('designPhoto', undefined, undefined)
                    }}
                    uploading={busyKey === 'designPhoto'}
                    serverUrl={photoUrls.designSketch || photoUrls.designPhoto}
                >
                    <div className={styles.duoRow}>
                        <CaptureMini label="Capture" onPick={(e) => handlePick('designPhoto', e)} />
                        <UploadMini label="Upload" onPick={(e) => handlePick('designPhoto', e)} />
                    </div>
                    <div style={{ marginTop: 10 }}>
                        <ActionPill label="Draw Design" onClick={goDraw} />
                    </div>
                </PhotoCard>

                {/* Pattern Photo */}
                <PhotoCard
                    title="Pattern Photo"
                    desc="Pattern or reference"
                    preview={photos.patternPhoto}
                    onClear={() => setPreviewAndUrl('patternPhoto', undefined, undefined)}
                    uploading={busyKey === 'patternPhoto'}
                    serverUrl={photoUrls.patternPhoto}
                >
                    <div className={styles.duoRow}>
                        <CaptureMini label="Capture" onPick={(e) => handlePick('patternPhoto', e)} />
                        <UploadMini label="Upload" onPick={(e) => handlePick('patternPhoto', e)} />
                    </div>
                </PhotoCard>

                {/* Measurement Cloth Photo */}
                <PhotoCard
                    title="Measurement Cloth Photo"
                    desc="The cloth use for measurement"
                    preview={photos.measurementCloth}
                    onClear={() => setPreviewAndUrl('measurementCloth', undefined, undefined)}
                    uploading={busyKey === 'measurementCloth'}
                    serverUrl={photoUrls.measurementCloth}
                >
                    <div className={styles.duoRow}>
                        <CaptureMini label="Capture" onPick={(e) => handlePick('measurementCloth', e)} />
                        <UploadMini label="Upload" onPick={(e) => handlePick('measurementCloth', e)} />
                    </div>
                </PhotoCard>
            </section>

            {/* Footer */}
            <footer className={`${styles.footer} ${styles.container}`}>
                <button type="button" className={styles.secondary} onClick={onBack}>‹ Back</button>
                <button type="button" className={styles.primary} onClick={onNext}>Next ›</button>
            </footer>
        </main>
    )
}

/* --- Reusable blocks --- */

type PhotoCardProps = {
    title: React.ReactNode
    desc: string
    preview?: string
    serverUrl?: string
    onClear: () => void
    children: React.ReactNode
    highlightError?: boolean
    uploading?: boolean
}
const PhotoCard = React.forwardRef<HTMLDivElement, PhotoCardProps>(function PhotoCard(
    { title, desc, preview, serverUrl, onClear, children, highlightError, uploading },
    ref
) {
    return (
        <div
            ref={ref}
            className={styles.photoCard}
            style={highlightError ? { borderColor: '#fecaca', background: '#fff7f7' } : undefined}
            aria-invalid={highlightError || undefined}
        >
            <div className={styles.photoHead}>
                <div className={styles.photoTitle}>{title}</div>
                <div className={styles.photoDesc}>
                    {desc} {serverUrl && <span style={{ color: '#059669', fontWeight: 700 }}>• Uploaded</span>}
                    {uploading && <span style={{ color: '#6b7280', fontWeight: 700 }}> • Uploading…</span>}
                </div>
            </div>

            {preview && (
                <div className={styles.previewBox}>
                    <Image
                        src={preview}
                        alt="Preview"
                        fill
                        sizes="(max-width: 480px) 100vw, 420px"
                        className={styles.previewImg}
                        unoptimized
                    />
                    <button type="button" className={styles.clearBtn} onClick={onClear}>Remove</button>
                </div>
            )}

            {children}
        </div>
    )
})

function CaptureMini({
                         label,
                         onPick,
                     }: {
    label: string
    onPick: (e: ChangeEvent<HTMLInputElement>) => void
}) {
    const inputId = useId()
    return (
        <div className={styles.ctaWrap}>
            <label htmlFor={inputId} className={`${styles.ctaBtn} ${styles.ctaPrimary}`}>
                <CameraIcon />
                <span>{label}</span>
            </label>
            <input
                id={inputId}
                type="file"
                accept="image/*"
                capture="environment"   // opens camera
                onChange={onPick}
                className={styles.hiddenInput}
            />
        </div>
    )
}

function UploadMini({
                        label,
                        onPick,
                    }: {
    label: string
    onPick: (e: ChangeEvent<HTMLInputElement>) => void
}) {
    const inputId = useId()
    const inputRef = useRef<HTMLInputElement | null>(null)

    // Android hint for gallery-only (non-standard; helps many browsers)
    useEffect(() => {
        if (isAndroid() && inputRef.current) {
            inputRef.current.setAttribute('capture', 'filesystem')
        }
    }, [])

    return (
        <div className={styles.ctaWrap}>
            <label htmlFor={inputId} className={`${styles.ctaBtn} ${styles.ctaOutline}`}>
                <UploadIcon />
                <span>{label}</span>
            </label>
            <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept="image/*"        // no capture -> gallery/file picker
                onChange={onPick}
                className={styles.hiddenInput}
            />
        </div>
    )
}

function ActionPill({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button type="button" className={styles.outlinePill} onClick={onClick}>
            <PencilIcon />
            <span>{label}</span>
        </button>
    )
}

function CameraIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.6"/>
            <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.6"/>
        </svg>
    )
}
function UploadIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 16V4m0 0 4 4M12 4 8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
    )
}
function PencilIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Z" stroke="currentColor" strokeWidth="1.6"/>
            <path d="M14.06 6.19 16.88 3.37 20.63 7.12 17.81 9.94" stroke="currentColor" strokeWidth="1.6"/>
        </svg>
    )
}