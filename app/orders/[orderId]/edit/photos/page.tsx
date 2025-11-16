// app/orders/[orderId]/edit/photos/page.tsx
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import PhotoCaptureEditor from './Photos.client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AnyObj = Record<string, any>;
const ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN || 'http://localhost:8083';

function firstOf<T>(v?: T | T[]) { return Array.isArray(v) ? v.find(Boolean) : v; }
function pickGroupId(sp: Record<string, string | string[] | undefined>) {
    return (firstOf(sp.groupId) || firstOf(sp.gid) || '') as string;
}
function isValidSlug(x?: string | null) {
    if (!x) return false;
    const s = String(x).trim().toLowerCase();
    return s && s !== 'undefined' && s !== 'null';
}
function proxied(src?: string | null, bearer?: string | null) {
    if (!src) return null;
    const base = `/api/proxy/image?src=${encodeURIComponent(src)}`;
    return bearer ? `${base}&b=${encodeURIComponent(bearer)}` : base;
}

export default async function Page({
                                       params, searchParams,
                                   }: {
    params: Promise<{ orderId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { orderId } = await params;
    const sp = await searchParams;

    const groupId = pickGroupId(sp);
    if (!groupId) notFound();

    let slug = orderId;
    if (!isValidSlug(slug)) notFound();

    const c = await cookies();
    const accessTokenRaw = c.get('access_token')?.value || c.get('Authorization')?.value || null;
    const jSessionId = c.get('JSESSIONID')?.value;
    const tbAuth = c.get('tb_auth')?.value;

    if (!accessTokenRaw && !jSessionId && !tbAuth) {
        redirect(`/login?redirect=${encodeURIComponent(`/orders/${slug}/edit/photos?groupId=${groupId}`)}`);
    }

    const bearer = accessTokenRaw
        ? (accessTokenRaw.startsWith('Bearer ') ? accessTokenRaw : `Bearer ${accessTokenRaw}`)
        : null;

    const apiHeaders = new Headers({ Accept: 'application/json' });
    if (bearer) apiHeaders.set('Authorization', bearer);
    const cookieHeader = [
        jSessionId ? `JSESSIONID=${jSessionId}` : undefined,
        tbAuth ? `tb_auth=${tbAuth}` : undefined,
    ].filter(Boolean).join('; ');
    if (cookieHeader) apiHeaders.set('Cookie', cookieHeader);

    const res = await fetch(`${ORIGIN}/api/orders/${encodeURIComponent(String(slug))}`, {
        headers: apiHeaders, cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) {
        redirect(`/login?redirect=${encodeURIComponent(`/orders/${slug}/edit/photos?groupId=${groupId}`)}`);
    }
    if (!res.ok) notFound();

    const json = await res.json().catch(() => null) as AnyObj | null;
    const data = json?.data ?? json;
    if (!data) notFound();

    // locate the measurement group
    const items: AnyObj[] = Array.isArray(data.items) ? data.items : [];
    let group: AnyObj | null = null, parentItem: AnyObj | null = null;
    for (const it of items) {
        const gs: AnyObj[] = Array.isArray(it.measurementGroups) ? it.measurementGroups : [];
        const g = gs.find((x) => String(x.id) === String(groupId)) ?? null;
        if (g) { group = g; parentItem = it; break; }
    }
    if (!group) notFound();

    const title = parentItem?.itemName ?? parentItem?.title ?? 'Item';

    // Existing persisted photos from backend
    const cloth = group.clothPhoto || null;
    const design = group.designDrawingPhoto || null;
    const pattern = group.patternClothPhoto || null;
    const measurement = group.measurementClothPhoto || null;

    const vm = {
        orderId: data.orderId ?? data.id,
        groupId: group.id,
        itemId: parentItem?.id ?? parentItem?.itemId ?? null,
        title,
        photos: {
            cloth: proxied(cloth, bearer),
            design: proxied(design, bearer),
            pattern: proxied(pattern, bearer),
            measurement: proxied(measurement, bearer),
        },
    };

    return (
        <main style={{ maxWidth: 900, margin: '0 auto', padding: 14 }}>
            <PhotoCaptureEditor initial={vm} />
        </main>
    );
}
