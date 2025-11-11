// app/(protected)/dashboard/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import styles from './Dashboard.module.css';
import { api, API_ORIGIN } from '@/lib/apiBase';

export const runtime = 'nodejs';         // Buffer, server fetch, etc.
export const dynamic = 'force-dynamic';  // depends on request cookies

type Summary = {
    deliveryToday: number;
    deliveryTomorrow: number;
    newOrder: number;
    newOrderEarning: number;
    deliveryOverdue: number;
    dueCollection: number;
    monthlyOrder: number;
    monthlyEarning: number;
};

type Card = {
    label: string;
    value: number | string | null | undefined;
    color?: string;
    href?: string;
};

type OrdersResponse = {
    status?: string;
    message?: string;
    data?: any;
    meta?: any;
};

function shopIdFromJwt(token?: string): number | undefined {
    if (!token) return undefined;
    try {
        const [, b64] = token.split('.');
        const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
        const json = Buffer.from(norm, 'base64').toString('utf8');
        const payload = JSON.parse(json);
        const sid = payload.shopID ?? payload.shopId ?? payload.shop_id;
        return sid != null ? Number(sid) : undefined;
    } catch {
        return undefined;
    }
}

// ===== Helpers for the “Recent Orders” list =====
const nameOf = (o: any) =>
    o.customerName || o.name || o.title || `Order #${o.id ?? ''}`;
const countOf = (o: any) => o.itemCount ?? o.items?.length ?? o.quantity ?? 1;
const amountOf = (o: any) => o.totalAmount ?? o.amount ?? o.total ?? 0;
const dueOf = (o: any) =>
    o.dueOn ?? o.dueDate ?? o.deliveryDate ?? o.eta ?? '';
const descOf = (o: any) =>
    o.itemNames?.join(', ') || o.productNames || o.itemType || 'Pant';

const toAbsolute = (p: string) =>
    new URL(p.startsWith('/') ? p : `/${p}`, API_ORIGIN).toString();

const photoOf = (o: any): string | null => {
    const raw =
        o.customerPhotoUrl ||
        o.customer?.photoUrl ||
        o.photoUrl ||
        o.customer?.avatarUrl ||
        o.customer?.imageUrl ||
        o.imageUrl ||
        o.photo ||
        null;
    if (!raw || typeof raw !== 'string') return null;
    return raw.startsWith('http') ? raw : toAbsolute(raw);
};

// stable key per order
const orderKey = (o: any) =>
    o.orderId ?? o.id ?? o.code ?? `${o.customerId ?? ''}-${o.createdAt ?? o.updatedAt ?? ''}`;

function uniqueBy<T>(arr: T[], keyOf: (x: T) => string | number) {
    const seen = new Set<string | number>();
    const out: T[] = [];
    for (const it of arr) {
        const k = keyOf(it);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(it);
    }
    return out;
}

const timeOf = (o: any) => {
    const t = o.createdAt ?? o.updatedAt ?? o.deliveryDate ?? o.dueOn ?? 0;
    const ms = Number.isFinite(t) ? Number(t) : Date.parse(String(t));
    return Number.isFinite(ms) ? ms : 0;
};

export default async function Dashboard({
                                            // Next 16: searchParams is a Promise in server components
                                            searchParams,
                                        }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = await searchParams;
    const c = await cookies();

    // Auth
    const accessToken = c.get('access_token')?.value;
    const jSessionId = c.get('JSESSIONID')?.value;
    const tbAuth = c.get('tb_auth')?.value;
    if (!accessToken && !jSessionId && !tbAuth) {
        redirect('/login?redirect=/dashboard');
    }

    // Shop ID: URL (?shopId) > cookie > JWT > default
    const spShopRaw = sp?.shopId;
    const spShopStr = Array.isArray(spShopRaw) ? spShopRaw[0] : spShopRaw;
    const qShop =
        typeof spShopStr === 'string' && spShopStr !== ''
            ? Number(spShopStr)
            : undefined;
    const cookieShop = c.get('shop_id')?.value
        ? Number(c.get('shop_id')!.value)
        : undefined;
    const jwtShop = shopIdFromJwt(accessToken);
    const shopId =
        qShop ??
        cookieShop ??
        jwtShop ??
        Number(process.env.NEXT_PUBLIC_DEFAULT_SHOP_ID ?? 1);

    // Build headers for server-to-server fetch
    const headers = new Headers({ Accept: 'application/json' });
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    const cookieHeader = [
        jSessionId ? `JSESSIONID=${jSessionId}` : undefined,
        tbAuth ? `tb_auth=${tbAuth}` : undefined,
    ]
        .filter(Boolean)
        .join('; ');
    if (cookieHeader) headers.set('Cookie', cookieHeader);

    // 1) Summary
    const summaryUrl = api('/api/dashboard/summary');
    const summaryRes = await fetch(summaryUrl, { headers, cache: 'no-store' });
    if (summaryRes.status === 401 || summaryRes.status === 403)
        redirect('/login?redirect=/dashboard');
    if (!summaryRes.ok)
        throw new Error(`Failed to load summary (${summaryRes.status})`);
    const summaryJson = await summaryRes.json().catch(() => null);
    const summary: Summary = summaryJson?.data ?? {
        deliveryToday: 0,
        deliveryTomorrow: 0,
        newOrder: 0,
        newOrderEarning: 0,
        deliveryOverdue: 0,
        dueCollection: 0,
        monthlyOrder: 0,
        monthlyEarning: 0,
    };

    // 2) Top 5 orders for this shop (dedupe + newest first)
    const recentUrl = api(`/api/orders/shop/${shopId}?limit=5&page=0`);
    const recentRes = await fetch(recentUrl, { headers, cache: 'no-store' });
    const recentJson = recentRes.ok ? await recentRes.json().catch(() => null) : null;
    const recentData = recentJson?.data;
    const recentRaw: any[] = Array.isArray(recentData)
        ? recentData
        : recentData?.content ?? [];

    const recentItems = uniqueBy(
        recentRaw.sort((a, b) => timeOf(b) - timeOf(a)), // newest first
        orderKey
    ).slice(0, 5);

    // Links that carry shopId
    const withShop = (path: string) => `${path}?shopId=${shopId}`;

    // Tiles
    const cards: Card[] = [
        { label: 'Delivery Today', value: summary.deliveryToday, href: withShop('/orders/delivery-today') },
        { label: 'Delivery Tomorrow', value: summary.deliveryTomorrow, href: withShop('/orders/delivery-tomorrow') },
        { label: 'New Order', value: summary.newOrder, href: withShop('/orders/new-order') },
        { label: 'Delivery Overdue', value: summary.deliveryOverdue, color: '#ef4444', href: withShop('/orders/delivery-overdue') },
        { label: 'New Order Earning', value: `৳${summary.newOrderEarning}` },
        { label: 'Due Collection', value: `৳${summary.dueCollection}`, color: '#10b981' },
        { label: 'Monthly Order', value: summary.monthlyOrder },
        { label: 'Monthly Earning', value: `৳${summary.monthlyEarning}` },
    ];

    return (
        <main className={styles.page}>
            <div className={styles.topBar} />
            <header className={styles.header}>
                <button aria-label="Menu" className={styles.iconBtn}>☰</button>
                <h1 className={styles.brand}>TailorBook</h1>
                <div className={styles.rightActions}>
                    <span>🌐 English</span>
                    <span>🔔</span>
                </div>
            </header>

            {/* Tiles */}
            <section className={styles.grid}>
                {cards.map((c, i) => {
                    const inner = (
                        <>
                            <div className={styles.cardValue} style={{ color: c.color ?? '#111827' }}>
                                {c.value ?? <span style={{ opacity: 0.3 }}>—</span>}
                            </div>
                            <div className={styles.cardLabel}>{c.label}</div>
                        </>
                    );
                    return c.href ? (
                        <Link key={i} href={c.href} className={`${styles.card} ${styles.cardLink}`}>
                            {inner}
                        </Link>
                    ) : (
                        <div key={i} className={styles.card}>
                            {inner}
                        </div>
                    );
                })}
            </section>

            {/* Scan QR */}
            <button className={styles.scanBtn}>▦ SCAN QR CODE</button>

            {/* Recent Orders (top 5) — no "View All" link */}
            <section className={styles.section}>
                <div className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle}>Recent Orders</h2>
                </div>

                <ul className={styles.recentList}>
                    {recentItems.length === 0 ? (
                        <li className={styles.emptyRow}>No Order Found</li>
                    ) : (
                        recentItems.map((o, i) => {
                            const name = nameOf(o);
                            const photo = photoOf(o);
                            return (
                                <li key={o.id ?? o.orderId ?? i} className={styles.recentItem}>
                                    <div className={styles.recentThumb}>
                                        <Avatar name={name} photoUrl={photo} size={44} rounding={10} />
                                    </div>
                                    <div className={styles.recentBody}>
                                        <div className={styles.recentTitle}>{name}</div>
                                        <div className={styles.recentSub}>
                                            {descOf(o)}, {countOf(o)} item{countOf(o) > 1 ? 's' : ''}
                                        </div>
                                        {dueOf(o) && (
                                            <div className={styles.recentMeta}>
                                                Delivery {String(dueOf(o)).slice(0, 10)}
                                            </div>
                                        )}
                                    </div>
                                    <div className={styles.recentAmount}>৳{amountOf(o)}</div>
                                </li>
                            );
                        })
                    )}
                </ul>
            </section>

            <nav className={styles.bottomBar} aria-label="Primary">
                <Link href={withShop('/orders/all')} className={`${styles.navItem} ${styles.navActive}`}>
                    Orders
                </Link>
                <Link href={withShop('/customers/all')} className={styles.navItem}>
                    Customers
                </Link>
            </nav>

            {/* keep the centered FAB outside the bar */}
            <Link href="/orders/create" className={styles.fab} aria-label="Create Order">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
            </Link>
        </main>
    );
}