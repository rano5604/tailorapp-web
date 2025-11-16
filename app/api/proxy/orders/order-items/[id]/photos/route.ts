// app/api/proxy/order-items/[id]/photos/route.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN || 'http://localhost:8083';

function tryDecode(v?: string | null) { if (!v) return v ?? null; try { return decodeURIComponent(v); } catch { return v; } }
function normalizeBearer(raw?: string | null) {
    if (!raw) return null;
    const val = (tryDecode(raw) || raw).trim();
    return /^Bearer\s/i.test(val) ? val : `Bearer ${val}`;
}

function buildCommonHeaders(req: NextRequest) {
    const incomingCookie = req.headers.get('cookie') || '';
    const headerAuth = req.headers.get('authorization');
    const cookieAuth = req.cookies.get('Authorization')?.value || req.cookies.get('access_token')?.value || null;
    const bearer = normalizeBearer(headerAuth || cookieAuth);

    const csrf =
        req.cookies.get('XSRF-TOKEN')?.value ||
        req.cookies.get('xsrf-token')?.value ||
        req.cookies.get('csrf-token')?.value || null;

    const h = new Headers();
    if (incomingCookie) h.set('Cookie', incomingCookie);
    if (bearer) h.set('Authorization', bearer);
    if (csrf && !req.headers.get('x-xsrf-token') && !req.headers.get('x-csrf-token')) {
        h.set('X-XSRF-TOKEN', csrf);
    } else {
        ['x-xsrf-token', 'x-csrf-token', 'x-xcsrf-token'].forEach((x) => {
            const v = req.headers.get(x);
            if (v) h.set(x, v);
        });
    }
    return h;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'cloth';

    // Forward multipart directly; do not set Content-Type (boundary will be set)
    const upstream = await fetch(
        `${ORIGIN}/api/order-items/${encodeURIComponent(params.id)}/photos?type=${encodeURIComponent(type)}`,
        { method: 'POST', headers: buildCommonHeaders(req), body: req.body as any, cache: 'no-store' }
    );

    return new NextResponse(await upstream.text().catch(() => ''), {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
    });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'cloth';

    const upstream = await fetch(
        `${ORIGIN}/api/order-items/${encodeURIComponent(params.id)}/photos?type=${encodeURIComponent(type)}`,
        { method: 'DELETE', headers: buildCommonHeaders(req), cache: 'no-store' }
    );

    return new NextResponse(await upstream.text().catch(() => ''), {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
    });
}
