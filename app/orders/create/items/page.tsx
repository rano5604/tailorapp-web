import { cookies } from 'next/headers'
import ItemsStepClient from './ItemsStepClient'

type ItemParam = {
    id: number
    nameEn: string
    nameBn: string
    unit: string | null
    type: string | null
    nsId: string
    suggestiveValues: string[] | null
}
export type ItemType = {
    id: number
    nameEn: string
    nameBn: string
    status: string
    parameters: ItemParam[]
}

const API_BASE =
    (process.env.API_BASE || process.env.NEXT_PUBLIC_TAILORAPP_API || 'http://localhost:8083').replace(/\/$/, '')

export default async function Page() {
    const c = await cookies()
    const accessToken = c.get('access_token')?.value
    const jSessionId = c.get('JSESSIONID')?.value
    const tbAuth = c.get('tb_auth')?.value

    const headers = new Headers({ Accept: 'application/json' })
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    const cookieHeader = [
        jSessionId ? `JSESSIONID=${jSessionId}` : undefined,
        tbAuth ? `tb_auth=${tbAuth}` : undefined,
    ].filter(Boolean).join('; ')
    if (cookieHeader) headers.set('Cookie', cookieHeader)

    // GET /api/items
    const res = await fetch(`${API_BASE}/api/items`, { headers, cache: 'no-store' })
    let items: ItemType[] = []
    if (res.ok) {
        const payload = await res.json().catch(() => null)
        const data = payload?.data
        items = Array.isArray(data) ? data : (data?.content ?? [])
    }

    // Pass to client component
    return <ItemsStepClient items={items} />
}