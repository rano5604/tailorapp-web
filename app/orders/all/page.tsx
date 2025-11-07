// app/orders/all/page.tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Avatar from '@/components/Avatar' // if no alias, use: ../../../components/Avatar
import styles from '../Orders.module.css'

type Paged<T> = {
    content: T[]
    last: boolean
    totalPages: number
    totalElements: number
    size: number
    number: number
    first: boolean
    numberOfElements: number
    empty: boolean
}

type OrdersResponse = {
    status?: string
    message?: string
    data?: any // could be Paged<any> or array
    meta?: any
}

const API_BASE =
    (process.env.API_BASE || process.env.NEXT_PUBLIC_TAILORAPP_API || 'http://localhost:8083')
        .replace(/\/$/, '')

function shopIdFromJwt(token?: string): number | undefined {
    if (!token) return undefined
    try {
        const [, b64] = token.split('.')
        const json = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
        const p = JSON.parse(json)
        return p.shopID ?? p.shopId ?? p.shop_id
    } catch { return undefined }
}

// field helpers
const nameOf   = (o: any) => o.customerName || o.name || o.title || `Order #${o.id ?? ''}`
const countOf  = (o: any) => o.itemCount ?? o.items?.length ?? o.quantity ?? 1
const amountOf = (o: any) => o.totalAmount ?? o.amount ?? o.total ?? 0
const statusOf = (o: any) => o.status ?? o.orderStatus ?? o.stage ?? '—'
const dueOf    = (o: any) => o.dueOn ?? o.dueDate ?? o.deliveryDate ?? o.eta ?? ''
const descOf   = (o: any) => o.itemNames?.join(', ') || o.productNames || o.itemType || 'Pant'
const photoOf  = (o: any): string | null => {
    const raw =
        o.customerPhotoUrl || o.customer?.photoUrl || o.photoUrl ||
        o.customer?.avatarUrl || o.customer?.imageUrl || o.imageUrl || o.photo || null
    if (!raw || typeof raw !== 'string') return null
    return raw.startsWith('http') ? raw : `${API_BASE}${raw.startsWith('/') ? '' : '/'}${raw}`
}


export default async function AllOrdersPage({
                                                // Next 16: searchParams is a Promise in server components
                                                searchParams,
                                            }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const sp = await searchParams
    const c = await cookies()

    // auth
    const accessToken = c.get('access_token')?.value
    const jSessionId  = c.get('JSESSIONID')?.value
    const tbAuth      = c.get('tb_auth')?.value
    if (!accessToken && !jSessionId && !tbAuth) {
        redirect('/login?redirect=/orders/all')
    }

    // shopId: URL > cookie > JWT > default
    const spShopRaw = sp?.shopId
    const spShopStr = Array.isArray(spShopRaw) ? spShopRaw[0] : spShopRaw
    const qShop       = typeof spShopStr === 'string' && spShopStr !== '' ? Number(spShopStr) : undefined
    const cookieShop  = c.get('shop_id')?.value ? Number(c.get('shop_id')!.value) : undefined
    const jwtShop     = shopIdFromJwt(accessToken)
    const shopId      = qShop ?? cookieShop ?? jwtShop ?? Number(process.env.NEXT_PUBLIC_DEFAULT_SHOP_ID ?? 1)

    // paging
    const page  = Number(sp.page ?? 0)
    const limit = Number(sp.limit ?? 100) // default to 100 as requested

    // headers
    const headers = new Headers({ Accept: 'application/json' })
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    const cookieHeader = [
        jSessionId ? `JSESSIONID=${jSessionId}` : undefined,
        tbAuth     ? `tb_auth=${tbAuth}`        : undefined,
    ].filter(Boolean).join('; ')
    if (cookieHeader) headers.set('Cookie', cookieHeader)

    // API call: /api/orders/shop/{shopId}?limit=&page=
    const url = `${API_BASE}/api/orders/shop/${shopId}?limit=${limit}&page=${page}`
    const res = await fetch(url, { headers, cache: 'no-store' })
    if (res.status === 401 || res.status === 403) {
        redirect(`/login?redirect=${encodeURIComponent(`/orders/all?shopId=${shopId}`)}`)
    }
    if (!res.ok) throw new Error(`Failed to load shop orders (${res.status})`)

    const payload = (await res.json().catch(() => null)) as OrdersResponse | null
    const data = payload?.data
    const items: any[] = Array.isArray(data) ? data : (data?.content ?? [])

    return (
        <main className={styles.page}>
            <div className={styles.topBar} />
            <header className={styles.header}>
                <Link href={`/dashboard?shopId=${shopId}`} className={styles.backBtn} aria-label="Back">←</Link>
                <h1 className={styles.brand}>TailorBook.</h1>
                <button className={styles.searchBtn} aria-label="Search">🔍</button>
            </header>

            <section className={styles.titleSection}><h2 className={styles.pageTitle}>All Orders</h2></section>

            <section className={styles.list}>
                {items.length === 0 ? (
                    <div className={styles.empty}>No Order Found</div>
                ) : (
                    items.map((o, i) => {
                        const name  = nameOf(o)
                        const photo = photoOf(o)
                        return (
                            <article key={o.id ?? i} className={styles.card}>
                                <div className={styles.thumb}>
                                    <Avatar name={name} photoUrl={photo} size={64} rounding={12} />
                                </div>
                                <div className={styles.cardBody}>
                                    <div className={styles.title}>{name}</div>
                                    <div className={styles.subtitle}>{descOf(o)}, {countOf(o)} item{countOf(o) > 1 ? 's' : ''}</div>
                                    <div className={styles.meta}>৳ {amountOf(o)}</div>
                                    {dueOf(o) && <div className={styles.meta}>Due On {String(dueOf(o)).slice(0,10)}</div>}
                                </div>
                                <button className={styles.viewBtn}>View</button>
                            </article>
                        )
                    })
                )}
            </section>
        </main>
    )
}