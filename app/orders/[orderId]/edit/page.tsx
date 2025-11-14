// app/orders/[orderId]/edit/page.tsx
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Editor from './Editor.client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AnyObj = Record<string, any>;
const ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN || 'http://localhost:8083';

function isValidSlug(x?: string | null) {
    if (!x) return false;
    const s = String(x).trim();
    return !!s && s.toLowerCase() !== 'undefined' && s.toLowerCase() !== 'null';
}

function toDateInput(v?: string | null) {
    if (!v) return '';
    try {
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
        const dt = new Date(v);
        return Number.isNaN(+dt) ? '' : new Intl.DateTimeFormat('en-CA').format(dt);
    } catch {
        return '';
    }
}

function buildVm(d: AnyObj, groupId: string | number) {
    const items: AnyObj[] = Array.isArray(d.items) ? d.items : [];
    let foundGroup: AnyObj | null = null;
    let parentItem: AnyObj | null = null;

    for (const it of items) {
        const groups: AnyObj[] = Array.isArray(it.measurementGroups) ? it.measurementGroups : [];
        foundGroup = groups.find((g) => String(g.id) === String(groupId)) ?? null;
        if (foundGroup) { parentItem = it; break; }
    }
    if (!foundGroup) return null;

    const measurements = Array.isArray(foundGroup.measurements)
        ? foundGroup.measurements.map((m: AnyObj) => ({
            id: m.id,
            name: m.nameEn ?? m.name ?? 'Measurement',
            unit: m.unit ?? null,
            type: m.type ?? 'NUMERIC',
            value: typeof m.value === 'number' ? m.value : (m.value != null && m.value !== '' ? Number(m.value) : ''),
            booleanValue:
                typeof m.booleanValue === 'boolean' ? m.booleanValue :
                    (typeof m.value === 'boolean' ? m.value : null),
            textValue: m.textValue ?? (typeof m.value === 'string' ? m.value : ''),
        }))
        : [];

    return {
        orderId: d.orderId ?? d.id,
        groupId: foundGroup.id,
        itemId: parentItem?.id ?? parentItem?.itemId ?? null,
        title: parentItem?.itemName ?? parentItem?.title ?? 'Item',
        // keep these in case your backend requires them in PATCH
        makingCharge: Number(foundGroup.makingCharge ?? parentItem?.makingCharge ?? 0) || 0,
        deliveryDate: toDateInput(foundGroup.deliveryDate || d.deliveryDate || ''),
        specialInstruction: foundGroup.specialInstruction ?? null,
        measurements,
        status: d.status ?? '',
    };
}

export default async function EditOrderItemPage({
                                                    params,
                                                    searchParams,
                                                }: {
    params: Promise<{ orderId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { orderId } = await params;
    const sp = await searchParams;

    const groupId =
        (Array.isArray(sp.groupId) ? sp.groupId[0] : sp.groupId) ??
        (Array.isArray(sp.gid) ? sp.gid[0] : sp.gid) ??
        '';
    if (!groupId) notFound();

    let slug = orderId;
    if (!isValidSlug(slug)) {
        const fallback =
            (Array.isArray(sp.orderId) ? sp.orderId[0] : sp.orderId) ||
            (Array.isArray(sp.code) ? sp.code[0] : sp.code) ||
            (Array.isArray(sp.id) ? sp.id[0] : sp.id) ||
            '';
        if (isValidSlug(fallback)) slug = String(fallback);
    }
    if (!isValidSlug(slug)) notFound();

    // Auth (same as your detail page)
    const c = await cookies();
    const accessTokenRaw = c.get('access_token')?.value || c.get('Authorization')?.value || null;
    const jSessionId = c.get('JSESSIONID')?.value;
    const tbAuth = c.get('tb_auth')?.value;

    if (!accessTokenRaw && !jSessionId && !tbAuth) {
        redirect(`/login?redirect=${encodeURIComponent(`/orders/${slug}/edit?groupId=${groupId}`)}`);
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

    // Fetch order detail
    const url = `${ORIGIN}/api/orders/${encodeURIComponent(String(slug))}`;
    const res = await fetch(url, { headers, cache: 'no-store' });

    if (res.status === 401 || res.status === 403) {
        redirect(`/login?redirect=${encodeURIComponent(`/orders/${slug}/edit?groupId=${groupId}`)}`);
    }
    if (!res.ok) notFound();

    const json = (await res.json().catch(() => null)) as AnyObj | null;
    const d = json?.data ?? json;
    if (!d) notFound();

    // Enforce: only editable in MEASUREMENT_DONE
    const status = String(d.status || '').toUpperCase();
    if (status !== 'MEASUREMENT_DONE') {
        redirect(`/orders/${encodeURIComponent(slug)}?edit=blocked`);
    }

    const vm = buildVm(d, groupId);
    if (!vm) notFound();

    // Render client editor (creation-like design)
    return (
        <main style={{ maxWidth: 900, margin: '0 auto', padding: 14 }}>
            <Editor initial={vm} />
        </main>
    );
}
