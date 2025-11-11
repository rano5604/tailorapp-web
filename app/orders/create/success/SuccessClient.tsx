'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useCreateOrder } from '../_store';
import styles from '../CreateOrder.module.css';
import { api, API_ORIGIN } from '@/lib/apiBase';

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
function ensureImgSrc(s?: string | null) {
    if (!s) return '';
    if (s.startsWith('data:image')) return s;
    if (s.startsWith('http')) return s;
    return new URL(s.startsWith('/') ? s : `/${s}`, API_ORIGIN).toString();
}

export default function SuccessClient() {
    const router = useRouter();
    const sp = useSearchParams();
    const { reset: resetCreateOrder } = useCreateOrder();

    // Params
    const shopIdParam = sp.get('shopId') || '';
    const orderDbId = sp.get('id') || '';
    const orderIdQuery = sp.get('orderId') || '';

    // Display orderId
    const orderId = useMemo(() => {
        if (orderIdQuery) return orderIdQuery;
        const shop = Number(shopIdParam) || 1;
        const ymd = todayYYYYMMDD();
        const key = `order-seq:${ymd}`;
        const nextSeq = (Number(sessionStorage.getItem(key)) || 0) + 1;
        sessionStorage.setItem(key, String(nextSeq));
        return `${shop}-${ymd}-${pad(nextSeq, 4)}`;
    }, [orderIdQuery, shopIdParam]);

    // Data from confirm
    const orderData: OrderSuccessData | null = useMemo(() => {
        try {
            const raw = sessionStorage.getItem('create-order:last');
            return raw ? (JSON.parse(raw) as OrderSuccessData) : null;
        } catch { return null; }
    }, []);

    // QR with retry
    const [qrSrc, setQrSrc]   = useState<string | null>(null);
    const [qrErr, setQrErr]   = useState<string | null>(null);
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
            const src = ensureImgSrc(raw || '');
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
        const res = await fetch(api(`/api/orders/${orderDbId}/qrcode`), init);
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

        let delay = 500;
        const maxAttempts = 4;

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

    // Print handlers
    const onPrintQR = () => {
        document.body.classList.add('print-qr');
        const after = () => {
            document.body.classList.remove('print-qr');
            window.removeEventListener('afterprint', after);
        };
        window.addEventListener('afterprint', after);
        window.print();
    };

    // Receipt prints by default
    const onPrintReceipt = () => {
        window.print();
    };

    // Clear caches
    const purgeCreateOrderCache = () => {
        try {
            for (let i = sessionStorage.length - 1; i >= 0; i--) {
                const k = sessionStorage.key(i); if (!k) continue;
                if (k.startsWith('create-order:') || k === 'create-order' || k === 'create-order:last') {
                    sessionStorage.removeItem(k);
                }
            }
        } catch {}
        try { resetCreateOrder(); } catch {}
    };
    const onBackHome = () => { purgeCreateOrderCache(); router.push('/'); };

    // Derived fields
    const shopName        = orderData?.shopName || 'shop-02';
    const orderDateIso    = normalizeIso(orderData?.orderDate) || `${todayYYYYMMDD().slice(0,4)}-${todayYYYYMMDD().slice(4,6)}-${todayYYYYMMDD().slice(6,8)}`;
    const deliveryDateIso = normalizeIso(orderData?.deliveryDate) || '—';
    const customerName    = orderData?.customerName || '—';
    const totalAmount     = orderData?.totalAmount ?? 0;
    const paidAmount      = orderData?.paidAmount ?? 0;
    const dueAmount       = orderData?.dueAmount ?? Math.max(totalAmount - paidAmount, 0);
    const items           = (orderData?.items && orderData.items.length > 0) ? orderData.items : [{ itemName: 'Item', count: 1 }];
    const totalUnits      = items.reduce((s, it) => s + (Number(it.count) || 0), 0) || 1;

    return (
        <main className={styles.page}>
            {/* Screen + Print CSS */}
            <style jsx global>{`
                .print-only { display: none; }
                .screen-only { display: block; }
                @media print {
                    /* Use full page; disable browser headers/footers in print dialog to remove date/URL */
                    @page { size: A4; margin: 0; }
                    html, body, #__next { margin: 0 !important; padding: 0 !important; }
                    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

                    /* Hide screen-only UI, allow print-only blocks */
                    .screen-only { display: none !important; }
                    .print-only  { display: block !important; }

                    /* Print ONLY the receipt by default */
                    body:not(.print-qr) * { visibility: hidden !important; }
                    body:not(.print-qr) #receiptPrintArea,
                    body:not(.print-qr) #receiptPrintArea * { visibility: visible !important; }

                    /* Top aligned: 10mm from top of the page */
                    body:not(.print-qr) #receiptPrintArea {
                        position: fixed !important;   /* lock position relative to page, not flow */
                        top: 10mm;                    /* <- exactly 10mm from top */
                        left: 0;
                        right: 0;
                        width: 210mm;                 /* A4 width */
                        max-width: 210mm;
                        margin: 0 auto !important;
                        padding: 0 8mm 10mm !important; /* no extra top padding, keep sides/bottom */
                        box-sizing: border-box;
                        font-size: 93%;                 /* small scale to help fit single page */
                        overflow: hidden;               /* avoid first-child margin collapse */
                    }
                    /* Ensure first child doesn't push down */
                    body:not(.print-qr) #receiptPrintArea > *:first-child {
                        margin-top: 0 !important;
                        padding-top: 0 !important;
                    }
                    body:not(.print-qr) #receiptPrintArea .receipt-header {
                        margin-top: 0 !important;
                        padding-top: 0 !important;
                    }

                    /* Avoid page breaks inside critical sections */
                    #receiptPrintArea,
                    #receiptPrintArea .receipt-header,
                    #receiptPrintArea .meta-row,
                    #receiptPrintArea .table,
                    #receiptPrintArea .table-head,
                    #receiptPrintArea .table-row,
                    #receiptPrintArea .totals,
                    #receiptPrintArea .thanks,
                    #receiptPrintArea .notes {
                        break-inside: avoid !important;
                        page-break-inside: avoid !important;
                    }

                    /* Hide the on-screen QR preview in print */
                    #screenQR { display: none !important; }

                    /* If you had a centered print QR block, hide it now (we use top-right mini QR) */
                    #receiptPrintArea .receipt-qr-print-only { display: none !important; }

                    /* Top-right mini QR next to Order # (print-only) */
                    #receiptPrintArea .meta-right {
                        display: flex !important;
                        flex-direction: column;
                        align-items: flex-end;
                        gap: 3mm;
                    }
                    #receiptPrintArea .meta-right .order-line { white-space: nowrap; }
                    #receiptPrintArea .meta-right .qr-mini {
                        display: block;
                        width: 28mm;
                        height: 28mm;
                        object-fit: contain;
                        border: 1px solid #e5e7eb;
                        border-radius: 4px;
                    }

                    /* QR-only mode (Print QR button) */
                    body.print-qr * { visibility: hidden !important; }
                    body.print-qr #qrPrintCard,
                    body.print-qr #qrPrintCard * { visibility: visible !important; }
                    body.print-qr #qrPrintCard {
                        position: fixed;
                        inset: 0;
                        display: grid !important;
                        place-items: center;
                        background: #fff;
                        margin: 0;
                        padding: 0;
                    }
                }
                /* Receipt layout */
                #receiptPrintArea .receipt-header { text-align: center; margin-bottom: 10px; }
                #receiptPrintArea .receipt-header .copy { font-weight: 800; color: #111827; }
                #receiptPrintArea .receipt-header .shop { font-weight: 700; color: #111827; }

                #receiptPrintArea .meta-row {
                    display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 12px;
                    margin: 12px 0; color: #111827; font-weight: 700;
                }
                #receiptPrintArea .meta-left div { margin-bottom: 4px; }
                #receiptPrintArea .meta-right { text-align: right; white-space: nowrap; }

                #receiptPrintArea .table { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-top: 8px; }
                #receiptPrintArea .table-head {
                    display: grid; grid-template-columns: 40px 1fr 160px 100px;
                    background: #f3f4f6; padding: 8px 10px; font-weight: 800; color: #374151;
                }
                #receiptPrintArea .table-row {
                    display: grid; grid-template-columns: 40px 1fr 160px 100px;
                    padding: 8px 10px; border-top: 1px solid #e5e7eb;
                }
                #receiptPrintArea .totals { margin-top: 12px; display: grid; gap: 6px; color: #111827; }
                #receiptPrintArea .totals .row { display: flex; justify-content: space-between; font-weight: 800; }

                /* PRINT-ONLY QR inside receipt (no dark band) */
                #receiptPrintArea .receipt-qr-print-only {
                    text-align: center;
                    margin: 12px 0;
                }
                #receiptPrintArea .receipt-qr-print-only img {
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                }

                #receiptPrintArea .divider { border-top: 1px solid #e5e7eb; margin: 10px 0; }
                #receiptPrintArea .thanks { text-align: center; font-weight: 800; margin-top: 6px; }
                #receiptPrintArea .notes { margin-top: 6px; padding-left: 16px; color: #6b7280; font-size: 12px; line-height: 1.5; }

                /* QR print card (for Print QR) */
                #qrPrintCard { display: none; } /* hidden on screen */
                #qrPrintCard .card {
                    background: #fff;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    box-shadow: 0 0 0 3px #0f172a; /* dark outline */
                    padding: 12px;
                    display: grid;
                    place-items: center;
                    width: 260px;
                }
                #qrPrintCard .qr-img {
                    border-radius: 8px;
                    border: 1px solid #e5e7eb;
                    width: 200px;
                    height: 200px;
                    object-fit: contain;
                    background: #fff;
                }
                #qrPrintCard .caption {
                    margin-top: 10px;
                    font-weight: 800;
                    color: #0f172a;
                    text-align: center;
                }
                #qrPrintCard .caption .id {
                    color: #1e3a8a;
                    font-weight: 800;
                }
            `}</style>

            {/* Screen header */}
            <header className={styles.header}>
                <div className={`${styles.container} ${styles.headerRow}`} style={{ justifyContent: 'center' }}>
                    <h1 className={styles.title} style={{ margin: 0, textAlign: 'center' }}>Create New Order</h1>
                </div>
            </header>

            {/* Screen content (web view) */}
            <section className={`${styles.container} ${styles.formSection}`} style={{ textAlign: 'center', maxWidth: 520, marginInline: 'auto' }}>
                <div style={{ marginTop: 12, marginBottom: 6, fontWeight: 800, color: '#111827' }}>Success!</div>
                <div style={{ color: '#6b7280', marginBottom: 12 }}>Thank you! Your order has been successfully placed.</div>

                {/* Order ID pill */}
                <div
                    style={{
                        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8,
                        padding: '10px 14px', border: '1px solid #E5E7EB', borderRadius: 12, background: '#fff',
                        marginBottom: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', width: '100%', maxWidth: 520
                    }}
                >
                    <span style={{ fontWeight: 800, color: '#111827' }}>Order ID:</span>
                    <span style={{ color: '#2563EB', textDecoration: 'underline', fontWeight: 800 }}>{orderId}</span>
                </div>

                {/* On-screen QR preview (never printed) */}
                <div id="screenQR" className="screen-only" style={{
                    width: 260, margin: '0 auto 12px', padding: 12, borderRadius: 12,
                    border: '1px solid #e5e7eb', background: '#f9fafb', boxShadow: '0 1px 2px rgba(0,0,0,.06)'
                }}>
                    <div style={{ background: '#fff', borderRadius: 8, display: 'grid', placeItems: 'center', padding: 10 }}>
                        {!loading && <img src={qrSrc || fallbackQrUrl} alt="Order QR" width={200} height={200} style={{ borderRadius: 6, border: '1px solid #e5e7eb' }} />}
                        {loading && <div style={{ color: '#6b7280' }}>Generating QR… {attempt ? `(attempt ${attempt})` : ''}</div>}
                    </div>
                </div>

                {/* QR print card (used ONLY when clicking Print QR) */}
                <div id="qrPrintCard" aria-hidden="true">
                    <div className="qr-card">
                        {!loading && (
                            <img
                                className="qr-img"
                                src={qrSrc || fallbackQrUrl}
                                alt="Order QR"
                            />
                        )}
                        {loading && <div style={{ color: '#6b7280' }}>Generating QR…</div>}

                        {/* Caption under QR */}
                        {!loading && (
                            <div className="caption">
                                Order ID: <span className="id">{orderId}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Receipt (second design) — prints by default */}
                <div id="receiptPrintArea" style={{ textAlign: 'left', maxWidth: 520, margin: '0 auto', background: '#fff' }}>
                    <div className="receipt-header">
                        <div className="copy">Customer Copy</div>
                        <div className="shop">{shopName}</div>
                    </div>

                    <div className="meta-row">
                        {/* LEFT */}
                        <div className="meta-left">
                            {/* Order chip */}
                            <div className="chip chip-order">
                                <strong>Order ID:</strong> {orderId}
                            </div>

                            {/* Date chip */}
                            <div className="chip chip-date">
                                <strong>Date:</strong>{' '}
                                {(() => {
                                    try {
                                        return new Date(
                                            (normalizeIso(orderData?.orderDate) || orderDateIso) + 'T00:00:00'
                                        ).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
                                    } catch {
                                        return '—';
                                    }
                                })()}
                            </div>

                            {/* Labeled Name and Phone, one per line */}
                            {orderData?.customerName && (
                                <div className="meta-line"><strong>Customer Name:</strong> {orderData.customerName}</div>
                            )}
                            {orderData?.customerPhone && (
                                <div className="meta-line"><strong>Phone:</strong> {orderData.customerPhone}</div>
                            )}
                        </div>

                        {/* RIGHT */}
                        <div className="meta-right">
                            {/* Print-only mini QR with slim dark bars above & below */}
                            {!loading && (
                                <div className="qr-mini-wrap print-only">
                                    <div className="qr-band" />
                                    <img className="qr-mini" src={qrSrc || fallbackQrUrl} alt="Order QR" width={96} height={96} />
                                    <div className="qr-band" />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="table">
                        <div className="table-head">
                            <div>#</div>
                            <div style={{ fontSize: 13 }}>Item</div>
                            <div style={{ fontSize: 13 }}>Exp. Delivery Dt</div>
                            <div style={{ textAlign: 'right' }}>Price</div>
                        </div>
                        {items.map((it, idx) => {
                            const count = Number(it.count) || 1;
                            const itemPrice = (totalAmount / (totalUnits || 1)) * count;
                            return (
                                <div key={idx} className="table-row">
                                    <div>{idx + 1}</div>
                                    <div style={{ fontSize: 13 }}>{it.itemName || 'Item'}{count > 1 ? ` x${count}` : ''}</div>
                                    <div style={{ fontSize: 13 }}>{deliveryDateIso}</div>
                                    <div style={{ textAlign: 'right' }}>{fMoney(itemPrice)}</div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="totals">
                        <div className="row"><div>Total Amount:</div><div>{fMoney(totalAmount)}</div></div>
                        <div className="row"><div>Amount Paid:</div><div>{fMoney(paidAmount)}</div></div>
                        <div className="row"><div>Balance Due:</div><div>{fMoney(dueAmount)}</div></div>
                    </div>

                    {/* PRINT-ONLY QR (no dark background) */}
                    <div className="receipt-qr-print-only print-only">
                        {!loading && <img src={qrSrc || fallbackQrUrl} alt="Order QR" width={160} height={160} />}
                    </div>

                    <div className="divider" />
                    <div className="thanks">Thank you for your business!</div>
                    <ul className="notes">
                        <li>Once confirmed, any advance amount paid towards the order cannot be refunded.</li>
                        <li>Goods once sold will not be taken back.</li>
                        <li>We do not give guarantee for colors. We advise you do Dry Cleaning only.</li>
                        <li>This is a computer generated bill.</li>
                        <li>Powered by TailorMateApp.com</li>
                    </ul>
                </div>

                {/* Buttons */}
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