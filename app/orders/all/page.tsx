'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OrdersList from '@/components/OrdersList';

const ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN || 'http://localhost:8083';
const api = (p: string) => (p.startsWith('http') ? p : `${ORIGIN}${p}`);

type OrderLite = Record<string, any>;

function getCookie(name: string) {
    if (typeof document === 'undefined') return null;
    const m = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[2]) : null;
}
function normalizeBearer(t?: string | null) {
    if (!t) return null;
    return t.trim().replace(/^Bearer\s+/i, '').replace(/^"+|"+$/g, '');
}
function getAuthToken(sp?: URLSearchParams): string | null {
    // URL overrides for local testing
    const fromUrl = normalizeBearer(sp?.get('bearer') || sp?.get('token'));
    if (fromUrl) return fromUrl;

    // Dev env override
    const fromEnv = normalizeBearer(process.env.NEXT_PUBLIC_DEBUG_BEARER || '');
    if (fromEnv) return fromEnv;

    if (typeof window === 'undefined') return null;
    return (
        normalizeBearer(sessionStorage.getItem('auth.accessToken')) ||
        normalizeBearer(localStorage.getItem('auth.accessToken')) ||
        normalizeBearer(sessionStorage.getItem('accessToken')) ||
        normalizeBearer(localStorage.getItem('accessToken')) ||
        normalizeBearer(localStorage.getItem('jwt')) ||
        normalizeBearer(getCookie('access_token')) ||
        normalizeBearer(getCookie('token')) ||
        normalizeBearer(getCookie('Authorization')) ||
        null
    );
}

export default function AllOrdersPage() {
    const router = useRouter();
    const sp = useSearchParams();

    const [orders, setOrders] = useState<OrderLite[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    const shopId = sp.get('shopId') ?? '1';
    const [limit, setLimit] = useState<number>(Number(sp.get('limit') ?? 10) || 10);
    const [page, setPage] = useState<number>(Number(sp.get('page') ?? 0) || 0);

    const qs = useMemo(() => {
        const p = new URLSearchParams();
        p.set('limit', String(limit));
        p.set('page', String(page));
        return p.toString();
    }, [limit, page]);

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                setLoading(true);
                setErr(null);

                const token = getAuthToken(sp);
                if (!token) {
                    setErr('Login required: no token found. Add ?bearer=YOUR_JWT or set localStorage.accessToken.');
                    setOrders([]);
                    return;
                }

                const url = api(`/api/orders/shop/${encodeURIComponent(shopId)}?${qs}`);
                const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                });

                if (!res.ok) {
                    const t = await res.text().catch(() => '');
                    throw new Error(t || `Failed to load orders (${res.status})`);
                }

                const json = await res.json();

                // Accept common shapes: data, data.content, content, orders, items
                const arr: any[] =
                    Array.isArray(json) ? json :
                        Array.isArray(json?.data) ? json.data :
                            Array.isArray(json?.data?.content) ? json.data.content :
                                Array.isArray(json?.content) ? json.content :
                                    Array.isArray(json?.orders) ? json.orders :
                                        Array.isArray(json?.items) ? json.items :
                                            [];

                setOrders(arr);
            } catch (e: any) {
                if (e?.name !== 'AbortError') setErr(e?.message || 'Failed to load orders');
            } finally {
                setLoading(false);
            }
        }
        load();
        return () => controller.abort();
    }, [shopId, qs, sp]);

    // keep URL in sync when user changes page/limit (optional)
    useEffect(() => {
        const p = new URLSearchParams();
        p.set('shopId', shopId);
        p.set('limit', String(limit));
        p.set('page', String(page));
        const href = `/orders/all?${p.toString()}`;
        window.history.replaceState(null, '', href);
    }, [shopId, limit, page]);

    const onBack = () => router.back();

    return (
        <main style={pageWrap}>
            {/* Header exactly like your screenshot */}
            <div style={topBar} />
            <div style={appBar}>
                <button type="button" onClick={onBack} aria-label="Back" style={iconBtn}>←</button>
                <div style={brand}>TailorBook</div>
                <div style={{ width: 36 }} /> {/* spacer to keep title centered */}
            </div>

            {loading ? (
                <div style={{ display: 'grid', gap: 10 }}>
                    {Array.from({ length: limit }).map((_, i) => (
                        <div key={i} style={rowSkeleton}>
                            <div style={skelAvatar} />
                            <div style={{ flex: 1 }}>
                                <div style={skel(14, 180)} />
                                <div style={{ height: 6 }} />
                                <div style={skel(12, 220)} />
                            </div>
                            <div style={skel(14, 80)} />
                        </div>
                    ))}
                </div>
            ) : err ? (
                <div style={errorBox}>{err}</div>
            ) : (
                // Same design as dashboard's "Recent Orders"
                <OrdersList title="All Orders" items={orders} />
            )}

            {/* Pagination */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                    type="button"
                    style={ghostBtn}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0 || loading}
                >
                    ‹ Prev
                </button>
                <button
                    type="button"
                    style={ghostBtn}
                    onClick={() => setPage((p) => p + 1)}
                    disabled={loading || orders.length < limit}
                >
                    Next ›
                </button>
                <select
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    style={limitSel}
                    disabled={loading}
                >
                    {[5, 10, 20].map((n) => (
                        <option key={n} value={n}>{n}/page</option>
                    ))}
                </select>
            </div>
        </main>
    );
}

/* Inline styles to match your header screenshot and keep layout simple */
const pageWrap: React.CSSProperties = { maxWidth: 900, margin: '0 auto', padding: '0 14px 20px' };
const topBar: React.CSSProperties = { height: 18, background: '#5b21b6', position: 'sticky', top: 0, zIndex: 50 };
const appBar: React.CSSProperties = {
    position: 'sticky',
    top: 18,
    zIndex: 49,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '12px 0',
    background: '#fff',
    borderBottom: '1px solid #f1f5f9',
};
const iconBtn: React.CSSProperties = {
    height: 36,
    width: 36,
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#fff',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 800,
    cursor: 'pointer',
};
const brand: React.CSSProperties = { fontSize: 28, fontWeight: 900, letterSpacing: 0.5, color: '#0f172a' };
const sectionTitle: React.CSSProperties = { fontSize: 20, fontWeight: 900, color: '#111827', margin: '12px 0 12px' };

const ghostBtn: React.CSSProperties = { height: 36, padding: '0 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontWeight: 800, cursor: 'pointer' };
const limitSel: React.CSSProperties = { height: 36, padding: '0 10px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#111827', fontWeight: 700 };

const errorBox: React.CSSProperties = { border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 12, padding: 12, color: '#991B1B', fontWeight: 700 };

const rowSkeleton: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    background: '#fff',
};
const skel = (h: number, w: number): React.CSSProperties => ({
    height: h,
    width: w,
    borderRadius: 6,
    background: 'linear-gradient(90deg,#f3f4f6,#eee,#f3f4f6)',
    animation: 'pulse 1.3s infinite',
});
const skelAvatar: React.CSSProperties = { ...skel(36, 36) };
