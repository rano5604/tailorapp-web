// app/customers/all/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import styles from '../../orders/Orders.module.css';
import { api, API_ORIGIN } from '@/lib/apiBase';

export const runtime = 'nodejs';          // needed for Buffer & server-only features
export const dynamic = 'force-dynamic';   // this page depends on cookies/auth

type Paged<T> = {
    content: T[];
    last: boolean;
    totalPages: number;
    totalElements: number;
    size: number;
    number: number;
    first: boolean;
    numberOfElements: number;
    empty: boolean;
};

type ApiResponse<T = any> = {
    status?: string;
    message?: string;
    data?: Paged<T> | T[] | null;
    meta?: any;
};

type Customer = {
    id: number;
    name: string;
    phone?: string;
    gender?: string;
    photo?: string | null;
};

function shopIdFromJwt(token?: string): number | undefined {
    if (!token) return undefined;
    try {
        const [, b64] = token.split('.');
        const json = Buffer.from(
            b64.replace(/-/g, '+').replace(/_/g, '/'),
            'base64'
        ).toString('utf8');
        const p = JSON.parse(json);
        return p.shopID ?? p.shopId ?? p.shop_id;
    } catch {
        return undefined;
    }
}

const displayPhone = (c: Customer) => (c.phone ? c.phone : '');
const displayGender = (c: Customer) =>
    c.gender ? String(c.gender).toUpperCase() : '';

const toAbsolute = (p: string) =>
    new URL(p.startsWith('/') ? p : `/${p}`, API_ORIGIN).toString();

const photoOf = (c: Customer): string | null => {
    if (!c.photo || typeof c.photo !== 'string') return null;
    return c.photo.startsWith('http') ? c.photo : toAbsolute(c.photo);
};

export default async function CustomersAllPage({
                                                   // Next 16: searchParams is a Promise
                                                   searchParams,
                                               }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = await searchParams;
    const c = await cookies();

    // auth
    const accessToken = c.get('access_token')?.value;
    const jSessionId = c.get('JSESSIONID')?.value;
    const tbAuth = c.get('tb_auth')?.value;
    if (!accessToken && !jSessionId && !tbAuth) {
        redirect('/login?redirect=/customers/all');
    }

    // resolve shopId: URL > cookie > JWT > default
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
        qShop ?? cookieShop ?? jwtShop ?? Number(process.env.NEXT_PUBLIC_DEFAULT_SHOP_ID ?? 1);

    // paging (optional)
    const page = Number(sp.page ?? 0);
    const limit = Number(sp.limit ?? 50);

    // headers
    const hdrs = new Headers({ Accept: 'application/json' });
    if (accessToken) hdrs.set('Authorization', `Bearer ${accessToken}`);
    const cookieHeader = [
        jSessionId ? `JSESSIONID=${jSessionId}` : undefined,
        tbAuth ? `tb_auth=${tbAuth}` : undefined,
    ]
        .filter(Boolean)
        .join('; ');
    if (cookieHeader) hdrs.set('Cookie', cookieHeader);

    // API: /api/customers/by-shop/{shopId}?page&limit
    const params = new URLSearchParams();
    if (!Number.isNaN(page)) params.set('page', String(page));
    if (!Number.isNaN(limit)) params.set('limit', String(limit));
    const qs = params.toString() ? `?${params.toString()}` : '';

    const url = api(`/api/customers/by-shop/${shopId}${qs}`);

    const res = await fetch(url, { headers: hdrs, cache: 'no-store' });
    if (res.status === 401 || res.status === 403) {
        redirect(
            `/login?redirect=${encodeURIComponent(`/customers/all?shopId=${shopId}`)}`
        );
    }
    if (!res.ok) throw new Error(`Failed to load customers (${res.status})`);

    const payload = (await res.json().catch(() => null)) as
        | ApiResponse<Customer>
        | null;
    const data = payload?.data;
    const customers: Customer[] = Array.isArray(data)
        ? (data as Customer[])
        : ((data as Paged<Customer> | undefined)?.content ?? []);

    return (
        <main className={styles.page}>
            <div className={styles.topBar} />
            <header className={styles.header}>
                <Link
                    href={`/dashboard?shopId=${shopId}`}
                    className={styles.backBtn}
                    aria-label="Back"
                >
                    ←
                </Link>
                <h1 className={styles.brand}>TailorBook</h1>
                <button className={styles.searchBtn} aria-label="Search">
                    🔍
                </button>
            </header>

            <section className={styles.titleSection}>
                <h2 className={styles.pageTitle}>Customers</h2>
            </section>

            <section className={styles.list}>
                {customers.length === 0 ? (
                    <div className={styles.empty}>No Customer Found</div>
                ) : (
                    customers.map((cu) => {
                        const name = cu.name ?? `Customer #${cu.id}`;
                        const photo = photoOf(cu);
                        return (
                            <article key={cu.id} className={styles.card}>
                                <div className={styles.thumb}>
                                    <Avatar name={name} photoUrl={photo} size={64} rounding={12} />
                                </div>
                                <div className={styles.cardBody}>
                                    <div className={styles.title}>{name}</div>
                                    <div className={styles.subtitle}>{displayPhone(cu)}</div>
                                    <div className={styles.meta}>{displayGender(cu)}</div>
                                </div>
                                <button className={styles.viewBtn}>View</button>
                            </article>
                        );
                    })
                )}
            </section>
        </main>
    );
}