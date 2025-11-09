'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useCreateOrder } from '../_store';
import styles from '../CreateOrder.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8083';

type OrderSuccessData = {
    orderId: string;
    id: number;
    shopName?: string;
    totalAmount?: number;
    paidAmount?: number;
    dueAmount?: number;
    orderDate?: string;     // 'YYYY-MM-DD' or 'YYYYMMDD'
    trialDate?: string;
    deliveryDate?: string;
    customerName?: string;
    customerPhone?: string;
    items?: { itemName: string; count: number }[];
    status?: string;
};

function pad(n: number, len = 4) { return String(n).padStart(len, '0'); }
function todayYYYYMMDD() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}${mm}${dd}`;
}
// Accept 'YYYY-MM-DD' or 'YYYYMMDD'
function normalizeIso(s?: string | null) {
    if (!s) return '';
    if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    return s;
}
function fMoney(n?: number | null) {
    const v = Number(n ?? 0);
    try { return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    catch { return String(v.toFixed(2)); }
}
/* Token helper */
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
function ensureDataUrl(s?: string | null) {
    if (!s) return '';
    if (s.startsWith('http') || s.startsWith('data:image')) return s;
    return `data:image/png;base64,${s}`;
}

export default function SuccessPage() {
    const router = useRouter();
    const sp = useSearchParams();
    const { reset } = useCreateOrder();

    // Read params
    const shopIdParam = sp.get('shopId') || '';
    const orderDbId = sp.get('id') || '';
    const orderIdQuery = sp.get('orderId') || '';

    // Order ID for display
    const orderId = useMemo(() => {
        if (orderIdQuery) return orderIdQuery;
        const shop = Number(shopIdParam) || 1;
        const ymd = todayYYYYMMDD();
        const key = `order-seq:${ymd}`;
        const nextSeq = (Number(sessionStorage.getItem(key)) || 0) + 1;
        sessionStorage.setItem(key, String(nextSeq));
        return `${shop}-${ymd}-${pad(nextSeq, 4)}`;
    }, [orderIdQuery, shopIdParam]);

    // Load last order payload saved by Confirm
    const orderData: OrderSuccessData | null = useMemo(() => {
        try {
            const raw = sessionStorage.getItem('create-order:last');
            return raw ? (JSON.parse(raw) as OrderSuccessData) : null;
        } catch { return null; }
    }, []);

    // ===== QR handling (with retry) =====
    const [qrSrc, setQrSrc] = useState<string | null>(null);
    const [qrErr, setQrErr] = useState<string | null>(null);
    const [attempt, setAttempt] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(false);
    const blobUrlRef = useRef<string | null>(null);

    const fallbackQrUrl = useMemo(
        () => `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(orderId)}`,
        [orderId]
    );

    const clearBlob = () => {
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }
    };

    const decodeResponse = async (res: Response) => {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            const json = await res.json();
            const raw = json?.qrCode || json?.data?.qrCode || json?.imageUrl || json?.url || json?.base64;
            const src = ensureDataUrl(raw || '');
            if (!src) throw new Error('QR response missing qrCode');
            return src;
        }
        if (ct.includes('image/')) {
            const blob = await res.blob();
            const objUrl = URL.createObjectURL(blob);
            clearBlob();
            blobUrlRef.current = objUrl;
            return objUrl;
        }
        throw new Error('Unsupported QR response type');
    };

    const tryOnce = async (method: 'GET' | 'POST', token: string) => {
        const init: RequestInit = {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json,image/*',
            },
        };
        if (method === 'POST') init.body = '';
        const res = await fetch(`${API_BASE}/api/orders/${orderDbId}/qrcode`, init);
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(text || `QR request failed (${res.status})`);
        }
        return decodeResponse(res);
    };

    const fetchQrWithRetry = useCallback(async () => {
        if (!orderDbId) return;
        const token = getAuthToken();
        if (!token) { setQrErr('Session expired. Please log in again.'); return; }
        setLoading(true); setQrErr(null); setQrSrc(null);
        let delay = 500, maxAttempts = 4;
        for (let i = 1; i <= maxAttempts; i++) {
            setAttempt(i);
            try {
                const method: 'GET' | 'POST' = i % 2 === 1 ? 'GET' : 'POST';
                const src = await tryOnce(method, token);
                setQrSrc(src); setLoading(false); setQrErr(null); return;
            } catch (e: any) {
                if (i < maxAttempts) { await new Promise(r => setTimeout(r, delay)); delay *= 2; continue; }
                setQrErr(e?.message || 'Failed to load QR'); setLoading(false);
            }
        }
    }, [orderDbId]);

    useEffect(() => { fetchQrWithRetry(); return () => clearBlob(); }, [fetchQrWithRetry]);

    // ===== Print handlers (uses print-only CSS) =====
    const onPrintQR = () => {
        document.body.classList.add('print-qr');
        const after = () => { document.body.classList.remove('print-qr'); window.removeEventListener('afterprint', after); };
        window.addEventListener('afterprint', after); window.print();
    };
    const onPrintReceipt = () => {
        document.body.classList.add('print-receipt');
        const after = () => { document.body.classList.remove('print-receipt'); window.removeEventListener('afterprint', after); };
        window.addEventListener('afterprint', after); window.print();
    };

    // Clear create-order caches + context when going home
    const purgeCreateOrderCache = () => {
        try {
            for (let i = sessionStorage.length - 1; i >= 0; i--) {
                const k = sessionStorage.key(i); if (!k) continue;
                if (k.startsWith('create-order:') || k === 'create-order' || k === 'create-order:last') {
                    sessionStorage.removeItem(k);
                }
            }
        } catch {}
        try { reset(); } catch {}
    };
    const onBackHome = () => { purgeCreateOrderCache(); router.push('/'); };

    // ===== Receipt derived fields =====
    const shopName = orderData?.shopName || 'Shop Name';
    const orderDateIso = normalizeIso(orderData?.orderDate) || `${todayYYYYMMDD().slice(0,4)}-${todayYYYYMMDD().slice(4,6)}-${todayYYYYMMDD().slice(6,8)}`;
    const deliveryDateIso = normalizeIso(orderData?.deliveryDate) || '—';
    const customerName = orderData?.customerName || '—';
    const totalAmount = orderData?.totalAmount ?? 0;
    const paidAmount = orderData?.paidAmount ?? 0;
    const dueAmount = orderData?.dueAmount ?? Math.max(totalAmount - paidAmount, 0);
    const items = (orderData?.items && orderData.items.length > 0) ? orderData.items : [{ itemName: 'Item', count: 1 }];
    const totalUnits = items.reduce((s, it) => s + (Number(it.count) || 0), 0) || 1;

    // Copy order id
    const [copied, setCopied] = useState(false);
    const onCopyOrderId = async () => {
        try {
            await navigator.clipboard.writeText(orderId);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        } catch {}
    };

    return (
        <main className={styles.page}>
            {/* Print CSS */}
            <style jsx global>{`
                @media print {
                    /* QR-only print mode */
                    body.print-qr * { visibility: hidden !important; }
                    body.print-qr #qrPrintArea, body.print-qr #qrPrintArea * { visibility: visible !important; }
                    body.print-qr #qrPrintArea {
                        position: fixed; inset: 0; display: grid; place-items: center; background: #fff; padding: 24px; gap: 10px;
                    }
                    body.print-qr #qrPrintArea .no-qr-print { display: none !important; }
                    body.print-qr #qrPrintArea .qr-only { display: block !important; width: 220px; height: 220px; object-fit: contain; }

                    /* Receipt print mode */
                    body.print-receipt * { visibility: hidden !important; }
                    body.print-receipt #receiptPrintArea, body.print-receipt #receiptPrintArea * { visibility: visible !important; }
                    body.print-receipt #receiptPrintArea {
                        position: fixed; inset: 0; overflow: auto; background: #fff; padding: 24px;
                    }
                    body.print-receipt .print-only { display: block !important; }

                    /* Hide helpers when printing unless made visible above */
                    .no-print { display: none !important; }
                }
                /* Screen helpers */
                .print-only { display: none; }
                #qrPrintArea .qr-only { display: none; } /* only show in QR print */
            `}</style>

            <header className={styles.header}>
                <div className={`${styles.container} ${styles.headerRow}`} style={{ justifyContent: 'center' }}>
                    <h1 className={styles.title} style={{ margin: 0, textAlign: 'center' }}>Create New Order</h1>
                </div>
            </header>

            <section className={`${styles.container} ${styles.formSection}`} style={{ textAlign: 'center', maxWidth: 520, marginInline: 'auto' }}>
                <div style={{ marginTop: 12, marginBottom: 6, fontWeight: 800, color: '#111827' }}>Success!</div>
                <div style={{ color: '#6b7280', marginBottom: 12 }}>Thank you! Your order has been successfully placed.</div>

                {/* Order ID pill (center) */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 14px',
                        border: '1px solid #E5E7EB',
                        borderRadius: 12,
                        background: '#fff',
                        marginBottom: 12,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        width: '100%',
                        maxWidth: 520,
                        marginInline: 'auto',
                        textAlign: 'center',
                    }}
                    className="no-qr-print"
                >
                    <span style={{ fontWeight: 800, color: '#111827' }}>Order ID:</span>
                    <button
                        type="button"
                        onClick={onCopyOrderId}
                        title="Click to copy"
                        style={{
                            appearance: 'none',
                            border: 0,
                            background: 'transparent',
                            color: '#2563EB',
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            fontWeight: 800
                        }}
                    >
                        {orderId}
                    </button>
                    {copied && <span style={{ color: '#10B981', fontWeight: 700, fontSize: 12 }}>Copied!</span>}
                </div>

                {/* QR print area */}
                <div id="qrPrintArea" style={{ display: 'grid', placeItems: 'center', gap: 10, marginBottom: 14 }}>
                    {/* Screen-only + general view */}
                    <div className="no-qr-print" style={{
                        width: 216,
                        height: 216,
                        display: 'grid',
                        placeItems: 'center',
                        borderRadius: 12,
                        border: '1px solid #E5E7EB',
                        background: '#F9FAFB',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ minHeight: 128 }}>
                            {loading && <div style={{ color: '#6b7280' }}>Generating QR… {attempt ? `(attempt ${attempt})` : ''}</div>}
                            {!loading && (
                                <img
                                    src={qrSrc || fallbackQrUrl}
                                    alt="Order QR"
                                    width={180}
                                    height={180}
                                    style={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                                />
                            )}
                            {!loading && !qrSrc && (
                                <div style={{ color: '#b45309', fontWeight: 700, marginTop: 6 }}>{qrErr || 'Failed to load QR'} • showing fallback QR</div>
                            )}
                        </div>
                    </div>

                    {/* Labels under QR (screen) */}
                    <div className="no-qr-print" style={{ fontWeight: 800, color: '#111827', marginTop: 6 }}>Customer Copy</div>
                    <div className="no-qr-print" style={{ color: '#111827', fontWeight: 700 }}>{shopName}</div>

                    {/* QR-only element for printing the QR image alone */}
                    {!loading && (
                        <img
                            className="qr-only"
                            src={qrSrc || fallbackQrUrl}
                            alt="Order QR"
                        />
                    )}
                </div>

                {/* Receipt print area */}
                <div id="receiptPrintArea" style={{ textAlign: 'left', maxWidth: 520, margin: '0 auto', background: '#fff' }}>
                    {/* Print-only top labels (so they appear on RECEIPT print) */}
                    <div className="print-only" style={{ textAlign: 'center', fontWeight: 800, marginBottom: 4 }}>
                        Customer Copy
                    </div>
                    <div className="print-only" style={{ textAlign: 'center', fontWeight: 700, marginBottom: 10 }}>
                        {shopName}
                    </div>

                    {/* Meta */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-end',
                        marginBottom: 10,
                        color: '#111827',
                        fontWeight: 700
                    }}>
                        <div>
                            <div>
                                <strong>Date:</strong>{' '}
                                {(() => {
                                    try {
                                        return new Date(orderDateIso + 'T00:00:00').toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
                                    } catch { return '—'; }
                                })()}
                            </div>
                            <div><strong>Cust. Name:</strong> {customerName}</div>
                            {orderData?.customerPhone && <div><strong>Phone:</strong> {orderData.customerPhone}</div>}
                        </div>
                        <div style={{ whiteSpace: 'nowrap' }}>
                            <div><strong>Order #:</strong> {orderId}</div>
                        </div>
                    </div>

                    {/* Items table */}
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginTop: 8 }}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '40px 1fr 160px 100px',
                            background: '#f3f4f6',
                            padding: '8px 10px',
                            fontWeight: 800,
                            color: '#374151'
                        }}>
                            <div>#</div>
                            <div style={{ fontSize: 13 }}>Item</div>
                            <div style={{ fontSize: 13 }}>Exp. Delivery Dt</div>
                            <div style={{ textAlign: 'right' }}>Price</div>
                        </div>
                        {items.map((it, idx) => {
                            const count = Number(it.count) || 1;
                            const itemPrice = (totalAmount / (totalUnits || 1)) * count;
                            return (
                                <div key={idx} style={{
                                    display: 'grid',
                                    gridTemplateColumns: '40px 1fr 160px 100px',
                                    padding: '8px 10px',
                                    borderTop: '1px solid #e5e7eb'
                                }}>
                                    <div>{idx + 1}</div>
                                    <div style={{ fontSize: 13 }}>
                                        {it.itemName || 'Item'}{count > 1 ? ` x${count}` : ''}
                                    </div>
                                    <div style={{ fontSize: 13 }}>{deliveryDateIso}</div>
                                    <div style={{ textAlign: 'right' }}>{fMoney(itemPrice)}</div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Totals */}
                    <div style={{ marginTop: 12, display: 'grid', gap: 6, color: '#111827' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div style={{ fontWeight: 800 }}>Total Amount:</div>
                            <div style={{ fontWeight: 800 }}>{fMoney(totalAmount)}</div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div style={{ fontWeight: 800 }}>Amount Paid:</div>
                            <div style={{ fontWeight: 800 }}>{fMoney(paidAmount)}</div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div style={{ fontWeight: 800 }}>Balance Due:</div>
                            <div style={{ fontWeight: 800 }}>{fMoney(dueAmount)}</div>
                        </div>
                    </div>

                    {/* Footer note */}
                    <div style={{ marginTop: 16, borderTop: '1px solid #e5e7eb', paddingTop: 10, textAlign: 'center', fontWeight: 800 }}>
                        Thank you for your business!
                    </div>
                    <ul style={{ marginTop: 8, paddingLeft: 16, color: '#6b7280', fontSize: 12, lineHeight: 1.5 }}>
                        <li>Once confirmed, any advance amount paid towards the order cannot be refunded.</li>
                        <li>Goods once sold will not be taken back.</li>
                        <li>We do not give guarantee for colors. We advise you do Dry Cleaning only.</li>
                        <li>This is a computer generated bill.</li>
                        <li>Powered by TailorMateApp.com</li>
                    </ul>
                </div>

                {/* Buttons (pill style) */}
                <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                    <button
                        type="button"
                        className={styles.primary}
                        onClick={onPrintReceipt}
                        style={{
                            background: 'linear-gradient(180deg, #3B82F6 0%, #2563EB 100%)',
                            color: '#fff',
                            borderRadius: 9999,
                            height: 48,
                            fontWeight: 800,
                            boxShadow: '0 6px 14px rgba(37,99,235,0.25)',
                            border: 'none'
                        }}
                    >
                        🧾 Print Order Receipt
                    </button>
                    <button
                        type="button"
                        className={styles.secondary}
                        onClick={onPrintQR}
                        style={{
                            background: '#fff',
                            color: '#111827',
                            borderRadius: 9999,
                            height: 44,
                            border: '1px solid #E5E7EB',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
                        }}
                    >
                        ▦ Print QR
                    </button>
                    <button
                        type="button"
                        className={styles.secondary}
                        onClick={onBackHome}
                        style={{
                            background: '#fff',
                            color: '#111827',
                            borderRadius: 9999,
                            height: 44,
                            border: '1px solid #E5E7EB',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
                        }}
                    >
                        Back to Home
                    </button>
                </div>
            </section>
        </main>
    );
}