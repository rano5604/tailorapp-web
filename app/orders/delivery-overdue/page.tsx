import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Avatar from '@/components/Avatar' // if no alias, use: ../../../components/Avatar
import styles from '../Orders.module.css'

type OrdersResponse = {
    status: string
    message: string
    data?: {
        content: any[]
        last: boolean
        totalPages: number
        totalElements: number
        size: number
        number: number
        first: boolean
        numberOfElements: number
        empty: boolean
    }
    meta?: any
}

const API_BASE =
    (process.env.API_BASE || process.env.NEXT_PUBLIC_TAILORAPP_API || 'http://localhost:8083').replace(/\/$/, '')

function shopIdFromJwt(token?: string): number | undefined {
    if (!token) return undefined
    try {
        const [, b64] = token.split('.')
        const json = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
        const p = JSON.parse(json)
        return p.shopID ?? p.shopId ?? p.shop_id
    } catch { return undefined }
}

const nameOf = (o: any) => o.customerName || o.name || o.title || `Order #${o.id ?? ''}`
const countOf = (o: any) => o.itemCount ?? o.items?.length ?? o.quantity ?? 1
const amountOf = (o: any) => o.totalAmount ?? o.amount ?? o.total ?? 0
const statusOf = (o: any) => o.status ?? o.orderStatus ?? o.stage ?? '—'
const dueOf = (o: any) => o.dueOn ?? o.dueDate ?? o.deliveryDate ?? o.eta ?? ''
const photoOf = (o: any): string | null => {
    const raw =
        o.customerPhotoUrl || o.customer?.photoUrl || o.photoUrl ||
        o.customer?.avatarUrl || o.customer?.imageUrl || o.imageUrl || o.photo || null
    if (!raw || typeof raw !== 'string') return null
    return raw.startsWith('http') ? raw : `${API_BASE}${raw.startsWith('/') ? '' : '/'}${raw}`
}

export default async function Page({
                                       searchParams,
                                   }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const sp = await searchParams
    const c = await cookies()
    const accessToken = c.get('access_token')?.value
    const jSessionId  = c.get('JSESSIONID')?.value
    const tbAuth      = c.get('tb_auth')?.value
    if (!accessToken && !jSessionId && !tbAuth) redirect('/login?redirect=/orders/delivery-overdue')

    const qShop = typeof sp.shopId === 'string' ? Number(sp.shopId) : undefined
    const cookieShop = c.get('shop_id')?.value ? Number(c.get('shop_id')!.value) : undefined
    const jwtShop = shopIdFromJwt(accessToken)
    const shopId = qShop ?? cookieShop ?? jwtShop ?? Number(process.env.NEXT_PUBLIC_DEFAULT_SHOP_ID ?? 1)

    const page = Number(sp.page ?? 0)
    const limit = Number(sp.limit ?? 10)

    const headers = new Headers({ Accept: 'application/json' })
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    const cookieHeader = [jSessionId ? `JSESSIONID=${jSessionId}` : undefined, tbAuth ? `tb_auth=${tbAuth}` : undefined]
        .filter(Boolean).join('; ')
    if (cookieHeader) headers.set('Cookie', cookieHeader)

    const url = `${API_BASE}/api/dashboard/orders/overdue?shopId=${shopId}&page=${page}&limit=${limit}`
    const res = await fetch(url, { headers, cache: 'no-store' })
    if (res.status === 401 || res.status === 403) redirect(`/login?redirect=${encodeURIComponent(`/orders/delivery-overdue?shopId=${shopId}`)}`)
    if (!res.ok) throw new Error(`Failed to load overdue orders (${res.status})`)

    const payload = (await res.json().catch(() => null)) as OrdersResponse | null
    const items: any[] = payload?.data?.content ?? []

    return (
        <main className={styles.page}>
            <div className={styles.topBar} />
            <header className={styles.header}>
                <Link href={`/dashboard?shopId=${shopId}`} className={styles.backBtn} aria-label="Back">←</Link>
                <h1 className={styles.brand}>TailorBook</h1>
                <button className={styles.searchBtn} aria-label="Search">🔍</button>
            </header>

            <section className={styles.titleSection}><h2 className={styles.pageTitle}>Delivery Overdue</h2></section>

            <section className={styles.list}>
                {items.length === 0 ? (
                    <div className={styles.empty}>No Order Found</div>
                ) : (
                    items.map((o, i) => {
                        const name = nameOf(o)
                        const photo = photoOf(o) // can be relative or absolute; Avatar normalizes and falls back to human avatar
                        return (
                            <article key={o.id ?? i} className={styles.card}>
                                <div className={styles.thumb}>
                                    <Avatar name={name} photoUrl={photo} size={64} rounding={12} />
                                </div>
                                <div className={styles.cardBody}>
                                    <div className={styles.title}>{name}</div>
                                    <div className={styles.subtitle}>Pant ({countOf(o)})</div>
                                    <div className={styles.row}><span className={styles.statusDot} /> {statusOf(o)}</div>
                                    <div className={styles.meta}>৳ {amountOf(o)} ({countOf(o)} items)</div>
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