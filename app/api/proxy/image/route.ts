// app/api/proxy/image/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_BASE =
    (process.env.API_BASE || process.env.NEXT_PUBLIC_TAILORAPP_API || 'http://localhost:8083')
        .replace(/\/$/, '')

export const runtime = 'nodejs' // stream from Node runtime

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const src = searchParams.get('src')
    if (!src) return new NextResponse('Missing src', { status: 400 })

    // Absolute or relative → build absolute
    const upstreamUrl = /^https?:\/\//i.test(src)
        ? src
        : `${API_BASE}${src.startsWith('/') ? '' : '/'}${src}`

    // Read token from cookie (set at login)
    const token = (await cookies()).get('access_token')?.value
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    try {
        const up = await fetch(upstreamUrl, {
            headers,
            // Do not cache on server unless you want to; you can tune this
            cache: 'no-store',
        })

        if (!up.ok) {
            // Forward upstream status so you can see if it’s 401/404/etc.
            return new NextResponse(await up.text().catch(() => 'Upstream error'), {
                status: up.status,
            })
        }

        const ct = up.headers.get('content-type') ?? 'image/jpeg'
        const cl = up.headers.get('content-length') ?? undefined

        return new NextResponse(up.body, {
            status: 200,
            headers: {
                'Content-Type': ct,
                ...(cl ? { 'Content-Length': cl } : {}),
                // Client-side cache; adjust as needed
                'Cache-Control': 'public, max-age=300',
            },
        })
    } catch (e) {
        return new NextResponse('Failed to fetch image', { status: 502 })
    }
}