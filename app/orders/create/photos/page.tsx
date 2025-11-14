'use client';

import React, { useEffect, useMemo, useRef, useState, useId, type ChangeEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCreateOrder } from '../_store';
import styles from '../CreateOrder.module.css';
import { api, API_ORIGIN } from '@/lib/apiBase';

type PhotoKey = 'orderCloth' | 'designPhoto' | 'patternPhoto' | 'measurementCloth' | 'designSketch';

// Android helper (for gallery hint)
const isAndroid = () =>
    typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

// Map photo key -> imageName the upload API expects
const imageNameMap: Record<Exclude<PhotoKey, 'designSketch'> | 'designSketch', string> = {
    orderCloth: 'cloth',
    designPhoto: 'design',
    patternPhoto: 'pattern',
    measurementCloth: 'measurement',
    designSketch: 'design-sketch',
};

/* Token helpers */
function getCookie(name: string) {
    if (typeof document === 'undefined') return null;
    const m = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[2]) : null;
}
function getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    return (
        sessionStorage.getItem('auth.accessToken') ||
        localStorage.getItem('auth.accessToken') ||
        sessionStorage.getItem('accessToken') ||
        localStorage.getItem('accessToken') ||
        getCookie('access_token') ||
        getCookie('token') ||
        null
    );
}

/* Convert file -> data URL (for preview) */
function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/* Extract base64 from data URL */
function dataUrlToBase64(dataUrl: string) {
    const i = dataUrl.indexOf(',');
    return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

/* Upload base64 API -> ABSOLUTE image URL */
async function uploadBase64(photoBase64: string, imageName: string, token: string) {
    const res = await fetch(api('/api/photos/upload-base64'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ photo: photoBase64, imageName }),
    });

    if (res.status === 401) throw new Error('Unauthorized. Please login again.');
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Upload failed (${res.status})`);
    }

    const data = (await res.json().catch(() => ({} as any))) as any;
    const rawUrl =
        data?.data?.url ||
        data?.data?.imageUrl ||
        data?.imageUrl ||
        data?.url ||
        data?.path ||
        data?.fileUrl;

    if (!rawUrl) throw new Error('Upload succeeded but response had no image URL');

    const absolute = String(rawUrl).startsWith('http')
        ? String(rawUrl)
        : new URL(String(rawUrl).startsWith('/') ? String(rawUrl) : `/${String(rawUrl)}`, API_ORIGIN).toString();

    return absolute;
}

export default function PhotoCapturePage() {
    const router = useRouter();
    const { state, setState } = useCreateOrder();

    // Guard: require customer + item
    useEffect(() => {
        const qs = state.shopId ? `?shopId=${state.shopId}` : '';
        if (!state.phone || !state.name) {
            router.replace(`/orders/create${qs}`);
            return;
        }
        if (!state.itemId) {
            router.replace(`/orders/create/items${qs}`);
        }
    }, [router, state.phone, state.name, state.itemId, state.shopId]);

    const qs = useMemo(() => (state.shopId ? `?shopId=${state.shopId}` : ''), [state.shopId]);

    const photos = state.photos ?? {}; // data URLs for quick preview
    const photoUrls = state.photoUrls ?? {}; // server URLs (API response)
    const clothCardRef = useRef<HTMLDivElement | null>(null);

    const [error, setError] = useState<string | null>(null);
    const [busyKey, setBusyKey] = useState<PhotoKey | null>(null); // which key is uploading

    // Force-remount seeds for inputs to allow reselecting same file after remove or after pick
    const [seeds, setSeeds] = useState<Record<PhotoKey, number>>({
        orderCloth: 0,
        designPhoto: 0,
        patternPhoto: 0,
        measurementCloth: 0,
        designSketch: 0,
    });
    const bumpSeed = (key: PhotoKey) => setSeeds((s) => ({ ...s, [key]: (s[key] ?? 0) + 1 }));

    const [showDraw, setShowDraw] = useState(false);

    const onBack = () => router.back();

    const onNext = () => {
        if (!photoUrls.orderCloth) {
            setError('Order Cloth Photo is required');
            clothCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        setError(null);
        router.push(`/orders/create/extras${qs}`);
    };

    function setPreviewAndUrl(key: PhotoKey, previewUrl?: string, serverUrl?: string) {
        setState((s) => ({
            ...s,
            photos: { ...(s.photos ?? {}), [key]: previewUrl },
            photoUrls: { ...(s.photoUrls ?? {}), [key]: serverUrl },
        }));
    }

    function handleClear(key: PhotoKey) {
        setPreviewAndUrl(key, undefined, undefined);
        bumpSeed(key); // force remount file inputs so same file name can be selected again
    }

    async function handlePick(
        key: 'orderCloth' | 'designPhoto' | 'patternPhoto' | 'measurementCloth',
        e: React.ChangeEvent<HTMLInputElement>
    ) {
        const inputEl = e.currentTarget; // cache the element once
        const file = inputEl.files?.[0];
        if (!file) return;

        const token = getAuthToken();
        if (!token) {
            setError('Your session expired. Please log in again.');
            return;
        }

        try {
            setBusyKey(key);

            // 1) show preview
            const dataUrl = await fileToDataUrl(file);
            setPreviewAndUrl(key, dataUrl, photoUrls[key]);

            // 2) upload
            const base64 = dataUrlToBase64(dataUrl);
            const serverUrl = await uploadBase64(base64, imageNameMap[key], token);
            setPreviewAndUrl(key, dataUrl, serverUrl);
            setError(null);
        } catch (err: any) {
            console.error('Upload error', err);
            setError(err?.message || 'Failed to upload image');
            setPreviewAndUrl(key, photos[key], undefined);
        } finally {
            setBusyKey(null);
            bumpSeed(key);              // triggers a clean input remount
            if (inputEl) inputEl.value = ''; // safe: use the cached element
        }
    }


    // Save drawing: upload and set previews
    async function handleSaveSketch(dataUrl: string) {
        const token = getAuthToken();
        if (!token) {
            setError('Your session expired. Please log in again.');
            return;
        }
        try {
            setBusyKey('designSketch');
            const base64 = dataUrlToBase64(dataUrl);
            const serverUrl = await uploadBase64(base64, imageNameMap.designSketch, token);
            setPreviewAndUrl('designSketch', dataUrl, serverUrl);
            setShowDraw(false);
        } catch (e: any) {
            console.error(e);
            setError(e?.message || 'Failed to save sketch');
        } finally {
            setBusyKey(null);
        }
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
                    onClear={() => handleClear('orderCloth')}
                    highlightError={!!error && !photoUrls.orderCloth}
                    uploading={busyKey === 'orderCloth'}
                    serverUrl={photoUrls.orderCloth}
                >
                    <div className={styles.duoRow}>
                        <CaptureMini label="Capture" onPick={(e) => handlePick('orderCloth', e)} seed={seeds.orderCloth} disabled={busyKey !== null} />
                        <UploadMini  label="Upload"  onPick={(e) => handlePick('orderCloth', e)} seed={seeds.orderCloth} disabled={busyKey !== null} />
                    </div>
                    {!!error && !photoUrls.orderCloth && <div className={styles.error} style={{ marginTop: 10 }}>{error}</div>}
                </PhotoCard>

                {/* Design Drawing */}
                <PhotoCard
                    title="Design Drawing"
                    desc="Draw or capture your sketch"
                    preview={photos.designSketch || photos.designPhoto}
                    onClear={() => { handleClear('designSketch'); handleClear('designPhoto'); }}
                    uploading={busyKey === 'designSketch' || busyKey === 'designPhoto'}
                    serverUrl={photoUrls.designSketch || photoUrls.designPhoto}
                >
                    <div className={styles.duoRow}>
                        <CaptureMini label="Capture" onPick={(e) => handlePick('designPhoto', e)} seed={seeds.designPhoto} disabled={busyKey !== null} />
                        <UploadMini  label="Upload"  onPick={(e) => handlePick('designPhoto', e)} seed={seeds.designPhoto} disabled={busyKey !== null} />
                    </div>
                    <div style={{ marginTop: 10 }}>
                        <ActionPill label="Draw Design" onClick={() => setShowDraw(true)} />
                    </div>
                </PhotoCard>

                {/* Pattern Photo */}
                <PhotoCard
                    title="Pattern Photo"
                    desc="Pattern or reference"
                    preview={photos.patternPhoto}
                    onClear={() => handleClear('patternPhoto')}
                    uploading={busyKey === 'patternPhoto'}
                    serverUrl={photoUrls.patternPhoto}
                >
                    <div className={styles.duoRow}>
                        <CaptureMini label="Capture" onPick={(e) => handlePick('patternPhoto', e)} seed={seeds.patternPhoto} disabled={busyKey !== null} />
                        <UploadMini  label="Upload"  onPick={(e) => handlePick('patternPhoto', e)} seed={seeds.patternPhoto} disabled={busyKey !== null} />
                    </div>
                </PhotoCard>

                {/* Measurement Cloth Photo */}
                <PhotoCard
                    title="Measurement Cloth Photo"
                    desc="The cloth use for measurement"
                    preview={photos.measurementCloth}
                    onClear={() => handleClear('measurementCloth')}
                    uploading={busyKey === 'measurementCloth'}
                    serverUrl={photoUrls.measurementCloth}
                >
                    <div className={styles.duoRow}>
                        <CaptureMini label="Capture" onPick={(e) => handlePick('measurementCloth', e)} seed={seeds.measurementCloth} disabled={busyKey !== null} />
                        <UploadMini  label="Upload"  onPick={(e) => handlePick('measurementCloth', e)} seed={seeds.measurementCloth} disabled={busyKey !== null} />
                    </div>
                </PhotoCard>
            </section>

            {/* Footer */}
            <footer className={`${styles.footer} ${styles.container}`}>
                <button type="button" className={styles.secondary} onClick={onBack}>‹ Back</button>
                <button type="button" className={styles.primary} onClick={onNext}>Next ›</button>
            </footer>

            {/* Drawing pane (modal) */}
            <DrawPane
                open={showDraw}
                onClose={() => setShowDraw(false)}
                onSave={handleSaveSketch}
            />
        </main>
    );
}

/* --- Inline styles for DrawPane --- */
const overlay: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(17, 24, 39, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 1000,
};
const panel: React.CSSProperties = {
    width: 'min(720px, 95vw)',
    background: '#F9FAFB',
    borderRadius: 12,
    boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
};
const head: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
};
const toolbar: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '8px 0 12px',
    borderBottom: '1px solid #e5e7eb',
};
const canvasWrap: React.CSSProperties = {
    width: '100%',
    margin: '12px 0',
    userSelect: 'none',
};
const iconBtn: React.CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#111827',
    display: 'grid',
    placeItems: 'center',
};
const ghost: React.CSSProperties = {
    height: 36,
    padding: '0 12px',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#111827',
    fontWeight: 700,
};
const primary: React.CSSProperties = {
    height: 36,
    padding: '0 14px',
    borderRadius: 8,
    border: '1px solid #2563eb',
    background: '#2563eb',
    color: '#fff',
    fontWeight: 800,
};

/* --- Draw Pane (modal with canvas) --- */
function DrawPane({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (dataUrl: string) => void; }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const [color, setColor] = useState<string>('#111827'); // slate-900
    const [size, setSize] = useState<number>(4);
    const [paths, setPaths] = useState<{ color: string; size: number; points: { x: number; y: number }[] }[]>([]);
    const [current, setCurrent] = useState<{ color: string; size: number; points: { x: number; y: number }[] } | null>(null);

    useEffect(() => {
        if (!open) return;
        // Resize canvas to parent, accounting for device pixel ratio
        const resize = () => {
            const canvas = canvasRef.current;
            const wrap = wrapRef.current;
            if (!canvas || !wrap) return;
            const dpr = window.devicePixelRatio || 1;
            const w = wrap.clientWidth;
            const h = Math.max(260, Math.min(520, Math.round(w * 1.1))); // aspect-ish, responsive
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                // redraw existing
                drawAll(ctx, paths);
            }
        };
        resize();
        const obs = new ResizeObserver(resize);
        if (wrapRef.current) obs.observe(wrapRef.current);
        return () => obs.disconnect();
    }, [open, paths]);

    const start = (x: number, y: number) => {
        setCurrent({ color, size, points: [{ x, y }] });
    };
    const move = (x: number, y: number) => {
        setCurrent((c) => {
            if (!c) return c;
            const next = { ...c, points: [...c.points, { x, y }] };
            const canvas = canvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    drawAll(ctx, [...paths, next]);
                }
            }
            return next;
        });
    };
    const end = () => {
        if (!current) return;
        setPaths((p) => [...p, current]);
        setCurrent(null);
    };

    const onPointerDown: React.PointerEventHandler<HTMLCanvasElement> = (e) => {
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
        start(e.clientX - rect.left, e.clientY - rect.top);
    };
    const onPointerMove: React.PointerEventHandler<HTMLCanvasElement> = (e) => {
        if (!current) return;
        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
        move(e.clientX - rect.left, e.clientY - rect.top);
    };
    const onPointerUp: React.PointerEventHandler<HTMLCanvasElement> = () => end();
    const onPointerLeave: React.PointerEventHandler<HTMLCanvasElement> = () => end();

    const handleClear = () => {
        setPaths([]);
        setCurrent(null);
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    };
    const handleUndo = () => {
        setPaths((p) => {
            const next = p.slice(0, -1);
            const canvas = canvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    drawAll(ctx, next);
                }
            }
            return next;
        });
    };

    const handleSave = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        // create a white background so result isn't transparent
        const tmp = document.createElement('canvas');
        tmp.width = canvas.width;
        tmp.height = canvas.height;
        const ctx = tmp.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, tmp.width, tmp.height);
        ctx.drawImage(canvas, 0, 0);
        // toDataURL at 1x since we set transform for DPR; the CSS size matches DPI
        const dataUrl = tmp.toDataURL('image/png');
        onSave(dataUrl);
    };

    if (!open) return null;

    return (
        <div style={overlay} role="dialog" aria-modal="true">
            <div style={panel}>
                <div style={head}>
                    <div style={{ fontWeight: 800, color: '#111827' }}>Draw Design</div>
                    <button type="button" onClick={onClose} style={iconBtn} aria-label="Close">✕</button>
                </div>

                {/* Toolbar */}
                <div style={toolbar}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {['#111827', '#1e3a8a', '#DC2626', '#059669', '#6b7280'].map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setColor(c)}
                                title={c}
                                style={{
                                    width: 24, height: 24, borderRadius: 9999, border: '2px solid #e5e7eb',
                                    background: c, outline: color === c ? '3px solid #93c5fd' : 'none'
                                }}
                            />
                        ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <label style={{ color: '#6b7280', fontWeight: 700 }}>Pen</label>
                        {[2, 4, 6, 8].map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setSize(s)}
                                style={{
                                    height: 28, minWidth: 36, padding: '0 8px',
                                    borderRadius: 8, border: '1px solid #e5e7eb',
                                    background: size === s ? '#eef2f7' : '#fff', fontWeight: 800
                                }}
                            >
                                {s}px
                            </button>
                        ))}
                        <button type="button" onClick={handleUndo} style={ghost}>↶ Undo</button>
                        <button type="button" onClick={handleClear} style={ghost}>Clear</button>
                    </div>
                </div>

                {/* Canvas */}
                <div ref={wrapRef} style={canvasWrap}>
                    <canvas
                        ref={canvasRef}
                        style={{ width: '100%', height: '100%', borderRadius: 12, background: '#fff', border: '1px solid #e5e7eb', touchAction: 'none' }}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerLeave={onPointerLeave}
                    />
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" style={ghost} onClick={onClose}>Cancel</button>
                    <button type="button" style={primary} onClick={handleSave}>Save Sketch</button>
                </div>
            </div>
        </div>
    );
}

/* draw helpers */
function drawAll(ctx: CanvasRenderingContext2D, paths: { color: string; size: number; points: { x: number; y: number }[] }[]) {
    for (const p of paths) {
        if (p.points.length < 1) continue;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(p.points[0].x, p.points[0].y);
        for (let i = 1; i < p.points.length; i++) ctx.lineTo(p.points[i].x, p.points[i].y);
        ctx.stroke();
    }
}

/* --- Reusable blocks --- */

type PhotoCardProps = {
    title: React.ReactNode;
    desc: string;
    preview?: string;
    serverUrl?: string;
    onClear: () => void;
    children: React.ReactNode;
    highlightError?: boolean;
    uploading?: boolean;
};
const PhotoCard = React.forwardRef<HTMLDivElement, PhotoCardProps>(function PhotoCard(
    { title, desc, preview, serverUrl, onClear, children, highlightError, uploading },
    ref
) {
    return (
        <div
            ref={ref}
            className={styles.photoCard}
            style={{ position: 'relative', ...(highlightError ? { borderColor: '#fecaca', background: '#fff7f7' } : undefined) }}
            aria-invalid={highlightError || undefined}
        >
            {uploading && (
                <div
                    style={{
                        position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.6)',
                        display: 'grid', placeItems: 'center', borderRadius: 12, zIndex: 1,
                    }}
                >
                    <Spinner size={28} color="#374151" />
                </div>
            )}

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
    );
});

/* File pick buttons with seed/disabled */

function CaptureMini({
                         label, onPick, seed, disabled,
                     }: { label: string; onPick: (e: ChangeEvent<HTMLInputElement>) => void; seed?: number; disabled?: boolean; }) {
    const inputId = useId();
    return (
        <div className={styles.ctaWrap} style={{ opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' as const : 'auto' }}>
            <label htmlFor={inputId} className={`${styles.ctaBtn} ${styles.ctaPrimary}`}>
                <CameraIcon />
                <span>{label}</span>
            </label>
            <input
                key={`cap-${seed ?? 0}`}
                id={inputId}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPick}
                className={styles.hiddenInput}
                disabled={disabled}
            />
        </div>
    );
}
function UploadMini({
                        label, onPick, seed, disabled,
                    }: { label: string; onPick: (e: ChangeEvent<HTMLInputElement>) => void; seed?: number; disabled?: boolean; }) {
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (isAndroid() && inputRef.current) {
            inputRef.current.setAttribute('capture', 'filesystem');
        }
    }, []);

    return (
        <div className={styles.ctaWrap} style={{ opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' as const : 'auto' }}>
            <label htmlFor={inputId} className={`${styles.ctaBtn} ${styles.ctaOutline}`}>
                <UploadIcon />
                <span>{label}</span>
            </label>
            <input
                key={`upl-${seed ?? 0}`}
                ref={inputRef}
                id={inputId}
                type="file"
                accept="image/*"
                onChange={onPick}
                className={styles.hiddenInput}
                disabled={disabled}
            />
        </div>
    );
}

function ActionPill({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button type="button" className={styles.outlinePill} onClick={onClick}>
            <PencilIcon />
            <span>{label}</span>
        </button>
    );
}

/* Spinner */
function Spinner({ size = 24, color = '#6b7280' }: { size?: number; color?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}>
            <g>
                <circle cx="12" cy="12" r="9" strokeWidth="3" opacity="0.25" />
                <path d="M21 12a9 9 0 0 1-9 9" strokeWidth="3" strokeLinecap="round" />
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
            </g>
        </svg>
    );
}

/* Icons */
function CameraIcon() { return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
);}
function UploadIcon() { return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 16V4m0 0 4 4M12 4 8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
);}
function PencilIcon() { return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M14.06 6.19 16.88 3.37 20.63 7.12 17.81 9.94" stroke="currentColor" strokeWidth="1.6" />
    </svg>
);}
