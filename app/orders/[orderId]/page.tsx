// app/orders/[orderId]/page.tsx
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import EditButton from './EditButton.client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AnyObj = Record<string, any>;
const ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN || 'http://localhost:8083';

function isValidSlug(x?: string | null) {
    if (!x) return false;
    const s = String(x).trim();
    return !!s && s.toLowerCase() !== 'undefined' && s.toLowerCase() !== 'null';
}
function formatBDT(n?: number) {
    const v = typeof n === 'number' && !Number.isNaN(n) ? n : 0;
    return `৳${v.toLocaleString('en-BD')}`;
}

// Use the proxy for protected images (passes auth)
function proxied(src?: string | null, bearer?: string | null) {
    if (!src) return null;
    const base = `/api/proxy/image?src=${encodeURIComponent(src)}`;
    return bearer ? `${base}&b=${encodeURIComponent(bearer)}` : base;
}

// Map API → view model (keeps orderId)
function mapFromApi(raw: AnyObj, bearer?: string | null) {
    const d = raw?.data ?? raw;
    if (!d) return null;

    const customer = {
        name: d.customerName ?? '—',
        phone: d.customerPhone ?? '',
        gender: d.customerGender ?? '',
        photo: proxied(d.customerPhoto ?? null, bearer),
    };

    const items: {
        title: string;
        amount: number;
        measurements: number;
        photoUrl: string | null;
        deliveryDate: string | null;
        groupId?: string | number | null;
    }[] = [];

    const itemsSrc: AnyObj[] = Array.isArray(d.items) ? d.items : [];
    for (const it of itemsSrc) {
        const title = it.itemName ?? it.title ?? 'Item';
        const groups: AnyObj[] = Array.isArray(it.measurementGroups) ? it.measurementGroups : [];
        if (groups.length === 0) {
            items.push({
                title,
                amount: Number(it.makingCharge ?? 0),
                measurements: 0,
                photoUrl: null,
                deliveryDate: null,
                groupId: it.id ?? null,
            });
        } else {
            for (const mg of groups) {
                items.push({
                    title,
                    amount: Number(mg?.makingCharge ?? it.makingCharge ?? 0),
                    measurements: Array.isArray(mg?.measurements) ? mg.measurements.length : 0,
                    photoUrl: proxied(mg?.clothPhoto ?? null, bearer),
                    deliveryDate: mg?.deliveryDate ?? null,
                    groupId: mg?.id ?? it.id ?? null,
                });
            }
        }
    }

    const payment = {
        making: Number(d.totalAmount ?? 0),
        advance: Number(d.paidAmount ?? 0),
        due: Number(d.dueAmount ?? Math.max(0, Number(d.totalAmount ?? 0) - Number(d.paidAmount ?? 0))),
    };

    const allDates = items.map(x => x.deliveryDate).filter(Boolean) as string[];
    const earliest = allDates.length ? allDates.reduce((min, cur) => (cur < min ? cur : min)) : null;

    return {
        orderId: d.orderId ?? d.id, // ← keep the real order ID here
        customer,
        items,
        payment,
        delivery: { date: earliest },
    };
}

export default async function OrderDetailPage({
                                                  params,
                                                  searchParams,
                                              }: {
    // In your app these are Promises — unwrap them.
    params: Promise<{ orderId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { orderId } = await params;
    const sp = await searchParams;

    // Validate slug, fallback to query params if needed
    let slug = orderId;
    if (!isValidSlug(slug)) {
        const fromQuery =
            (Array.isArray(sp.orderId) ? sp.orderId[0] : sp.orderId) ||
            (Array.isArray(sp.code) ? sp.code[0] : sp.code) ||
            (Array.isArray(sp.id) ? sp.id[0] : sp.id) ||
            '';
        if (isValidSlug(fromQuery)) slug = String(fromQuery);
    }
    if (!isValidSlug(slug)) notFound();

    // Auth
    const c = await cookies();
    const accessTokenRaw = c.get('access_token')?.value || c.get('Authorization')?.value || null;
    const jSessionId = c.get('JSESSIONID')?.value;
    const tbAuth = c.get('tb_auth')?.value;

    if (!accessTokenRaw && !jSessionId && !tbAuth) {
        redirect(`/login?redirect=${encodeURIComponent(`/orders/${slug}`)}`);
    }

    const bearer = accessTokenRaw
        ? (accessTokenRaw.startsWith('Bearer ') ? accessTokenRaw : `Bearer ${accessTokenRaw}`)
        : null;

    const headers = new Headers({ Accept: 'application/json' });
    if (bearer) headers.set('Authorization', bearer);

    const cookieHeader = [
        jSessionId ? `JSESSIONID=${jSessionId}` : undefined,
        tbAuth ? `tb_auth=${tbAuth}` : undefined,
    ].filter(Boolean).join('; ');
    if (cookieHeader) headers.set('Cookie', cookieHeader);

    // Fetch detail
    const url = `${ORIGIN}/api/orders/${encodeURIComponent(String(slug))}`;
    const res = await fetch(url, { headers, cache: 'no-store' });

    if (res.status === 401 || res.status === 403) {
        redirect(`/login?redirect=${encodeURIComponent(`/orders/${slug}`)}`);
    }
    if (!res.ok) notFound();

    const json = (await res.json().catch(() => null)) as AnyObj | null;
    const vm = mapFromApi(json || {}, bearer);
    if (!vm) notFound();

    return (
        <main style={pageWrap}>
            <div style={topBar} />
            <header style={appBar}>
                <Link href="/dashboard" aria-label="Back" style={iconBtn}>←</Link>
                {/* CHANGED: show the actual Order ID here */}
                <h1 style={brand}>Order {String(vm.orderId || slug)}</h1>
                <EditButton orderId={String(vm.orderId)} />
            </header>

            {/* Customer Information */}
            <section style={card}>
                <div style={cardTitle}>Customer Information</div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>{vm.customer.name}</div>
                {vm.customer.phone ? <div style={{ color: '#111827', marginTop: 4 }}>{vm.customer.phone}</div> : null}
                {vm.customer.gender ? <div style={{ color: '#6b7280', marginTop: 2 }}>{String(vm.customer.gender).toUpperCase()}</div> : null}
            </section>

            {/* Items */}
            <section style={card}>
                <div style={cardTitle}>Items</div>
                {vm.items.length === 0 ? (
                    <div style={{ color: '#6b7280' }}>No items</div>
                ) : (
                    <div style={{ display: 'grid', gap: 18 }}>
                        {vm.items.map((it, i) => (
                            <div key={`${it.title}-${i}`} style={{ paddingBottom: 6 }}>
                                <div style={itemRow}>
                                    <div style={{ fontWeight: 800, color: '#0f172a' }}>{it.title}</div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <div style={{ fontWeight: 800, color: '#0f172a' }}>{formatBDT(it.amount)}</div>
                                        {/* optional per-item edit button */}
                                        <Link
                                            href={`/orders/${encodeURIComponent(String(vm.orderId))}/edit?groupId=${encodeURIComponent(String(it.groupId ?? ''))}`}
                                            style={itemEditBtn}
                                        >
                                            Edit
                                        </Link>
                                    </div>
                                </div>
                                <div style={{ color: '#6b7280' }}>
                                    {it.measurements} Measurement{it.measurements === 1 ? '' : 's'}
                                </div>
                                {it.photoUrl ? (
                                    <div style={{ marginTop: 10 }}>
                                        <img
                                            src={it.photoUrl}
                                            alt={`${it.title} cloth`}
                                            width={86}
                                            height={64}
                                            style={{
                                                width: 86, height: 64, objectFit: 'cover',
                                                border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff',
                                            }}
                                        />
                                    </div>
                                ) : null}
                                {i < vm.items.length - 1 ? <div style={itemSeparator} /> : null}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Payment Information */}
            <section style={card}>
                <div style={cardTitle}>Payment Information</div>
                <Row label="Total Making Charge" value={formatBDT(vm.payment.making)} />
                <Divider />
                <Row label="Advance Paid" value={formatBDT(vm.payment.advance)} />
                <Divider />
                <Row label="Total Due Amount" value={formatBDT(vm.payment.due)} strong />
            </section>

            {/* Delivery Information */}
            <section style={card}>
                <div style={cardTitle}>Delivery Information</div>
                <Row
                    label="Delivery Date"
                    value={vm.delivery.date ? new Date(vm.delivery.date).toLocaleDateString('en-US') : '—'}
                />
            </section>
        </main>
    );
}

/* Presentational bits */
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
            <div style={{ color: '#111827', fontWeight: 700 }}>{label}</div>
            <div style={{ color: '#0f172a', fontWeight: strong ? 800 : 700 }}>{value}</div>
        </div>
    );
}
function Divider() { return <div style={{ borderTop: '1px dashed #e5e7eb', margin: '6px 0' }} />; }

const pageWrap: CSSProperties = { maxWidth: 900, margin: '0 auto', padding: '0 14px 20px' };
const topBar: CSSProperties = { height: 18, background: '#5b21b6', position: 'sticky', top: 0, zIndex: 50 };
const appBar: CSSProperties = {
    position: 'sticky', top: 18, zIndex: 49, display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', gap: 10, padding: '12px 0', background: '#fff', borderBottom: '1px solid #f1f5f9',
};
const iconBtn: CSSProperties = {
    height: 36, width: 36, borderRadius: 10, border: '1px solid #e5e7eb',
    background: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800,
};
const brand: CSSProperties = { fontSize: 20, fontWeight: 900, margin: 0 };
const card: CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, background: '#fff', marginTop: 14 };
const cardTitle: CSSProperties = { color: '#1d4ed8', fontWeight: 800, marginBottom: 8, fontSize: 14 };
const itemRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const itemSeparator: CSSProperties = { borderTop: '1px solid #e5e7eb', margin: '12px -14px 0' };
const itemEditBtn: CSSProperties = {
    height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid #e5e7eb',
    background: '#fff', color: '#0f172a', fontWeight: 800, textDecoration: 'none',
};
