'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type PhotoKind = 'cloth' | 'design' | 'pattern' | 'measurement';

type Vm = {
    orderId: string | number;
    groupId: string | number;
    itemId?: string | number | null;
    title: string;
    photos: Partial<Record<PhotoKind, string | null>>;
};

type Props = { initial: Vm };

function safeDecode(v?: string | null) { if (!v) return ''; try { return decodeURIComponent(v); } catch { return v || ''; } }
function normalizeBearer(t?: string | null) {
    if (!t) return null;
    const d = safeDecode(t.trim().replace(/^"+|"+$/g, ''));
    return /^Bearer\s/i.test(d) ? d : `Bearer ${d}`;
}
function getBearer() {
    const cookieAuth = document.cookie.match(/(?:^|; )Authorization=([^;]+)/)?.[1] || '';
    return (
        normalizeBearer(localStorage.getItem('accessToken')) ||
        normalizeBearer(localStorage.getItem('auth.accessToken')) ||
        normalizeBearer(sessionStorage.getItem('accessToken')) ||
        normalizeBearer(cookieAuth) ||
        null
    );
}
function getCsrf() {
    const m =
        document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/) ||
        document.cookie.match(/(?:^|; )xsrf-token=([^;]+)/) ||
        document.cookie.match(/(?:^|; )csrf-token=([^;]+)/);
    return m ? safeDecode(m[1]) : null;
}

export default function PhotoCaptureEditor({ initial }: Props) {
    const router = useRouter();
    const search = useSearchParams();
    const [vm, setVm] = useState<Vm>(initial);
    const [busy, setBusy] = useState<PhotoKind | null>(null);
    const [error, setError] = useState<string | null>(null);

    const bearer = useMemo(() => getBearer(), []);
    const csrf = useMemo(() => getCsrf(), []);

    // hidden inputs (one per kind) for Upload/Capture
    const inputRefs = {
        cloth: useRef<HTMLInputElement>(null),
        design: useRef<HTMLInputElement>(null),
        pattern: useRef<HTMLInputElement>(null),
        measurement: useRef<HTMLInputElement>(null),
    } as const;

    async function uploadFile(kind: PhotoKind, file: File) {
        setError(null);
        setBusy(kind);
        try {
            const fd = new FormData();
            fd.append('file', file);
            // kind informs backend which slot to replace
            const query = `?type=${encodeURIComponent(kind)}`;

            // Prefer item-scoped endpoint if possible
            const endpoints: string[] = [];
            if (vm.itemId != null && String(vm.itemId) !== '') {
                endpoints.push(`/api/proxy/orders/${encodeURIComponent(String(vm.orderId))}/items/${encodeURIComponent(String(vm.itemId!))}/photos${query}`);
            }
            endpoints.push(`/api/proxy/order-items/${encodeURIComponent(String(vm.groupId))}/photos${query}`);

            const headers: HeadersInit = {
                ...(bearer ? { Authorization: bearer } : {}),
                ...(csrf ? { 'X-XSRF-TOKEN': csrf } : {}),
            };

            let ok = false, lastText = '', lastStatus = 0, lastUrl = '';
            for (const url of endpoints) {
                const res = await fetch(url, {
                    method: 'POST',
                    headers, // do NOT set Content-Type; browser will set multipart boundary
                    body: fd,
                    credentials: 'include',
                    cache: 'no-store',
                });
                if (res.ok) {
                    // Expect JSON containing updated url or the whole group; support both
                    const ct = res.headers.get('content-type') || '';
                    if (ct.includes('application/json')) {
                        const j = await res.json().catch(() => null) as any;
                        // try common shapes
                        const newUrl =
                            j?.data?.url || j?.url ||
                            j?.data?.[`${kind}Photo`] || j?.[`${kind}Photo`] || null;
                        if (newUrl) {
                            setVm((prev) => ({ ...prev, photos: { ...prev.photos, [kind]: `/api/proxy/image?src=${encodeURIComponent(newUrl)}` } }));
                        } else {
                            // fallback: force reload the page to re-fetch persisted photos
                            router.refresh();
                        }
                    } else {
                        router.refresh();
                    }
                    ok = true;
                    break;
                } else {
                    lastText = await res.text().catch(() => '');
                    lastStatus = res.status; lastUrl = url;
                    if (res.status === 401 || res.status === 403) {
                        const redirectTo = `/orders/${encodeURIComponent(String(vm.orderId))}/edit/photos?groupId=${encodeURIComponent(String(vm.groupId))}`;
                        router.replace(`/login?redirect=${encodeURIComponent(redirectTo)}`);
                        return;
                    }
                }
            }
            if (!ok) throw new Error(lastText || `Upload failed (${lastStatus}) at ${lastUrl}`);
        } catch (e: any) {
            setError(e?.message || 'Upload failed');
        } finally {
            setBusy(null);
        }
    }

    async function deletePhoto(kind: PhotoKind) {
        setError(null);
        setBusy(kind);
        try {
            const query = `?type=${encodeURIComponent(kind)}`;
            const endpoints: string[] = [];
            if (vm.itemId != null && String(vm.itemId) !== '') {
                endpoints.push(`/api/proxy/orders/${encodeURIComponent(String(vm.orderId))}/items/${encodeURIComponent(String(vm.itemId!))}/photos${query}`);
            }
            endpoints.push(`/api/proxy/order-items/${encodeURIComponent(String(vm.groupId))}/photos${query}`);

            const headers: HeadersInit = {
                ...(bearer ? { Authorization: bearer } : {}),
                ...(csrf ? { 'X-XSRF-TOKEN': csrf } : {}),
            };

            let ok = false, lastText = '', lastStatus = 0;
            for (const url of endpoints) {
                const res = await fetch(url, {
                    method: 'DELETE',
                    headers,
                    credentials: 'include',
                    cache: 'no-store',
                });
                if (res.ok) {
                    setVm((prev) => ({ ...prev, photos: { ...prev.photos, [kind]: null } }));
                    ok = true; break;
                } else {
                    lastText = await res.text().catch(() => '');
                    lastStatus = res.status;
                    if (res.status === 401 || res.status === 403) {
                        const redirectTo = `/orders/${encodeURIComponent(String(vm.orderId))}/edit/photos?groupId=${encodeURIComponent(String(vm.groupId))}`;
                        router.replace(`/login?redirect=${encodeURIComponent(redirectTo)}`);
                        return;
                    }
                }
            }
            if (!ok) throw new Error(lastText || `Delete failed (${lastStatus})`);
        } catch (e: any) {
            setError(e?.message || 'Delete failed');
        } finally {
            setBusy(null);
        }
    }

    function onPick(kind: PhotoKind) {
        inputRefs[kind].current?.click();
    }
    function onFile(kind: PhotoKind, e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0];
        if (!f) return;
        uploadFile(kind, f);
        e.currentTarget.value = ''; // reset input
    }

    function onNext() {
        // No pending work; go to last step or summary
        const nextUrl = `/orders/${encodeURIComponent(String(vm.orderId))}`;
        router.push(nextUrl);
    }
    function onBack() {
        router.push(`/orders/${encodeURIComponent(String(vm.orderId))}/edit?groupId=${encodeURIComponent(String(vm.groupId))}`);
    }

    return (
        <div>
            <Header title={`PHOTO CAPTURE — ${String(vm.title).toUpperCase()}`} step="3/4 STEPS" onBack={onBack} />
            {error ? <div style={errorBox}>{error}</div> : null}

            <PhotoCard
                title="Order Cloth Photo"
                required
                preview={vm.photos.cloth || null}
                busy={busy === 'cloth'}
                onCapture={() => onPick('cloth')}
                onUpload={() => onPick('cloth')}
                onDelete={() => deletePhoto('cloth')}
                hint="Capture the cloth that will be used for this order."
            />
            <input
                type="file" accept="image/*" capture="environment" hidden
                ref={inputRefs.cloth} onChange={(e) => onFile('cloth', e)}
            />

            <PhotoCard
                title="Design Drawing"
                preview={vm.photos.design || null}
                busy={busy === 'design'}
                onCapture={() => onPick('design')}
                onUpload={() => onPick('design')}
                onDelete={() => deletePhoto('design')}
                hint="Draw or capture your sketch"
                extraActionLabel="Draw Design"
                onExtraAction={() => onPick('design')} // swap with a real canvas drawer if needed
            />
            <input
                type="file" accept="image/*" capture="environment" hidden
                ref={inputRefs.design} onChange={(e) => onFile('design', e)}
            />

            <PhotoCard
                title="Pattern Photo"
                preview={vm.photos.pattern || null}
                busy={busy === 'pattern'}
                onCapture={() => onPick('pattern')}
                onUpload={() => onPick('pattern')}
                onDelete={() => deletePhoto('pattern')}
                hint="Pattern or reference"
            />
            <input
                type="file" accept="image/*" capture="environment" hidden
                ref={inputRefs.pattern} onChange={(e) => onFile('pattern', e)}
            />

            <PhotoCard
                title="Measurement Cloth Photo"
                preview={vm.photos.measurement || null}
                busy={busy === 'measurement'}
                onCapture={() => onPick('measurement')}
                onUpload={() => onPick('measurement')}
                onDelete={() => deletePhoto('measurement')}
                hint="The cloth used for measurement"
            />
            <input
                type="file" accept="image/*" capture="environment" hidden
                ref={inputRefs.measurement} onChange={(e) => onFile('measurement', e)}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                <button onClick={onBack} style={btnGhost}>‹ Back</button>
                <button onClick={onNext} style={btnPrimary}>Next ›</button>
            </div>
        </div>
    );
}

/* Presentational subcomponents */

function Header({ title, step, onBack }: { title: string; step: string; onBack: () => void }) {
    return (
        <header style={hdr}>
            <button type="button" onClick={onBack} aria-label="Back" style={iconBtn}>←</button>
            <h1 style={brand}>
                {title} <span style={{ color: '#6b7280', fontWeight: 700 }}>{step}</span>
            </h1>
            <div style={{ width: 36 }} />
        </header>
    );
}

function PhotoCard(props: {
    title: string;
    hint?: string;
    required?: boolean;
    preview: string | null;
    busy?: boolean;
    onCapture: () => void;
    onUpload: () => void;
    onDelete: () => void;
    extraActionLabel?: string;
    onExtraAction?: () => void;
}) {
    const {
        title, hint, required, preview, busy,
        onCapture, onUpload, onDelete, extraActionLabel, onExtraAction,
    } = props;

    return (
        <section style={card}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={cardTitle}>{title}</div>
                {required ? <span style={{ color: '#ef4444', fontWeight: 900 }}>*</span> : null}
            </div>
            {hint ? <div style={{ color: '#6b7280', marginBottom: 10 }}>{hint}</div> : null}

            {preview ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                    <img
                        src={preview}
                        alt={title}
                        style={{ width: 180, height: 120, objectFit: 'cover', borderRadius: 10, border: '1px solid #e5e7eb' }}
                    />
                    <button type="button" onClick={onDelete} disabled={busy} style={btnDanger}>
                        {busy ? 'Removing…' : 'Remove'}
                    </button>
                </div>
            ) : null}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button type="button" onClick={onCapture} disabled={busy} style={btnPrimary}>
                    {busy ? 'Working…' : '📷 Capture'}
                </button>
                <button type="button" onClick={onUpload} disabled={busy} style={btnPrimaryAlt}>
                    {busy ? 'Working…' : '⤴ Upload'}
                </button>
                {extraActionLabel && onExtraAction ? (
                    <button type="button" onClick={onExtraAction} disabled={busy} style={btnLink}>
                        {extraActionLabel}
                    </button>
                ) : null}
            </div>
        </section>
    );
}

/* Styles */
const hdr: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0 14px' };
const brand: React.CSSProperties = { fontSize: 20, fontWeight: 900, margin: 0 };
const iconBtn: React.CSSProperties = { height: 36, width: 36, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, cursor: 'pointer' };

const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 16, padding: 18, background: '#fff', marginTop: 16 };
const cardTitle: React.CSSProperties = { color: '#1d4ed8', fontWeight: 800, marginBottom: 8, fontSize: 16 };

const btnPrimary: React.CSSProperties = { height: 44, padding: '0 18px', borderRadius: 10, border: '1px solid #1d4ed8', background: '#2563eb', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const btnPrimaryAlt: React.CSSProperties = { ...btnPrimary, background: '#1d4ed8' };
const btnDanger: React.CSSProperties = { height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid #b91c1c', background: '#ef4444', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { height: 44, padding: '0 18px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontWeight: 800, cursor: 'pointer' };
const btnLink: React.CSSProperties = { height: 36, padding: '0 10px', border: 'none', background: 'transparent', color: '#1d4ed8', fontWeight: 800, cursor: 'pointer' };
const errorBox: React.CSSProperties = { border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 12, padding: 12, color: '#991B1B', fontWeight: 700, marginBottom: 12 };
