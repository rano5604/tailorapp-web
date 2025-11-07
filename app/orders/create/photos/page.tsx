'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId } from 'react'
import type { ChangeEvent } from 'react'
import Image from 'next/image'
import { useCreateOrder } from '../_store'
import styles from '../CreateOrder.module.css'

type PhotoKey = 'orderCloth' | 'designPhoto' | 'patternPhoto' | 'measurementCloth' | 'designSketch'

export default function PhotoCapturePage() {
    const router = useRouter()
    const { state, setState } = useCreateOrder()

    // guard: must have step-1 and step-2 done
    useEffect(() => {
        if (!state.phone || !state.name) {
            router.replace(`/orders/create${state.shopId ? `?shopId=${state.shopId}` : ''}`)
            return
        }
        if (!state.itemId) {
            router.replace(`/orders/create/items${state.shopId ? `?shopId=${state.shopId}` : ''}`)
        }
    }, [router, state.phone, state.name, state.itemId, state.shopId])

    const photos = state.photos ?? {}

    const onBackTop = () => router.back()
    const onBackBottom = () => router.back()
    const onNext = () => {
        const qs = state.shopId ? `?shopId=${state.shopId}` : ''
        router.push(`/orders/create/extras${qs}`) // go to Step 4
    }

    function setPhoto(key: PhotoKey, dataUrl?: string) {
        setState(s => ({ ...s, photos: { ...(s.photos ?? {}), [key]: dataUrl } }))
    }

    async function handleCapture(
        key: Extract<PhotoKey, 'orderCloth' | 'designPhoto' | 'patternPhoto' | 'measurementCloth'>,
        e: ChangeEvent<HTMLInputElement>
    ) {
        const file = e.target.files?.[0]
        if (!file) return
        const dataUrl = await fileToDataUrl(file)
        setPhoto(key, dataUrl)
        e.currentTarget.value = '' // allow re-selection of same file
    }

    // navigate to drawing canvas
    const goDraw = () => {
        const qs = state.shopId ? `?shopId=${state.shopId}` : ''
        router.push(`/orders/create/photos/draw${qs}`)
    }

    return (
        <main className={styles.page}>
            {/* Header */}
            <header className={styles.header}>
                <div className={`${styles.container} ${styles.headerRow}`}>
                    <button type="button" className={styles.iconBack} onClick={onBackTop} aria-label="Back">←</button>
                    <h1 className={styles.title}>Create New Order</h1>
                    <div className={styles.headerRight} />
                </div>
            </header>

            {/* Step bar (3/4) */}
            <div className={styles.stepBarWrap}>
                <div className={`${styles.container} ${styles.stepBar}`}>
                    <div className={styles.stepBarLeft}>
                        PHOTO CAPTURE
                        {state.itemType && (
                            <span className={styles.itemTag}> - {state.itemType.toUpperCase()}</span>
                        )}
                    </div>
                    <div className={styles.stepBarRight}>3/4 STEPS</div>
                </div>
                <div className={styles.container}>
                    <div className={styles.stepProgressThree} aria-hidden="true" />
                </div>
            </div>

            {/* Content — starts immediately with cards (no blank gap) */}
            <section className={`${styles.formSection} ${styles.container}`}>
                {/* Order Cloth Photo */}
                <PhotoCard
                    title="Order Cloth Photo"
                    desc="Capture the cloth that will be used for this order."
                    preview={photos.orderCloth}
                    onClear={() => setPhoto('orderCloth', undefined)}
                >
                    <CaptureButton
                        label="Capture Photo"
                        variant="primary"
                        onPick={(e) => handleCapture('orderCloth', e)}
                    />
                </PhotoCard>

                {/* Design Drawing — two stacked outline buttons */}
                <PhotoCard
                    title="Design Drawing"
                    desc="Draw or capture your sketch"
                    // Prefer to preview the drawn sketch; else show captured photo
                    preview={photos.designSketch || photos.designPhoto}
                    onClear={() => setPhoto(photos.designSketch ? 'designSketch' : 'designPhoto', undefined)}
                >
                    <div className={styles.btnStack}>
                        <CaptureButton
                            label="Capture Photo"
                            variant="outline"
                            onPick={(e) => handleCapture('designPhoto', e)}
                        />
                        <ActionPill label="Draw Design" onClick={goDraw} />
                    </div>
                </PhotoCard>

                {/* Pattern Photo */}
                <PhotoCard
                    title="Pattern Photo"
                    desc="Pattern or reference"
                    preview={photos.patternPhoto}
                    onClear={() => setPhoto('patternPhoto', undefined)}
                >
                    <CaptureButton
                        label="Capture Photo"
                        variant="outline"
                        onPick={(e) => handleCapture('patternPhoto', e)}
                    />
                </PhotoCard>

                {/* Measurement Cloth Photo */}
                <PhotoCard
                    title="Measurement Cloth Photo"
                    desc="The cloth use for measurement"
                    preview={photos.measurementCloth}
                    onClear={() => setPhoto('measurementCloth', undefined)}
                >
                    <CaptureButton
                        label="Capture Photo"
                        variant="outline"
                        onPick={(e) => handleCapture('measurementCloth', e)}
                    />
                </PhotoCard>
            </section>

            {/* Footer */}
            <footer className={`${styles.footer} ${styles.container}`}>
                <button type="button" className={styles.secondary} onClick={onBackBottom}>‹ Back</button>
                <button type="button" className={styles.primary} onClick={onNext}>Next ›</button>
            </footer>
        </main>
    )
}

/* --- Reusable blocks --- */

function PhotoCard({
                       title, desc, preview, onClear, children,
                   }: {
    title: string
    desc: string
    preview?: string
    onClear: () => void
    children: React.ReactNode
}) {
    return (
        <div className={styles.photoCard}>
            <div className={styles.photoHead}>
                <div className={styles.photoTitle}>{title}</div>
                <div className={styles.photoDesc}>{desc}</div>
            </div>

            {/* Only render preview when present – so no big blank area */}
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
}

function CaptureButton({
                           label,
                           onPick,
                           variant = 'outline',
                       }: {
    label: string
    onPick: (e: ChangeEvent<HTMLInputElement>) => void
    variant?: 'primary' | 'outline'
}) {
    const inputId = useId()
    return (
        <div className={styles.captureWrap}>
            <label
                htmlFor={inputId}
                className={`${styles.captureBtn} ${variant === 'primary' ? styles.captureBtnPrimary : styles.captureBtnOutline}`}
            >
                <CameraIcon />
                <span>{label}</span>
            </label>
            <input
                id={inputId}
                type="file"
                accept="image/*"
                capture="environment"
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
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.6"/>
            <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.6"/>
        </svg>
    )
}

function PencilIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Z" stroke="currentColor" strokeWidth="1.6"/>
            <path d="M14.06 6.19 16.88 3.37 20.63 7.12 17.81 9.94" stroke="currentColor" strokeWidth="1.6"/>
        </svg>
    )
}

function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = reject
        reader.readAsDataURL(file)
    })
}