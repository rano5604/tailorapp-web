// app/orders/create/items/page.tsx (adjust path if different)
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import ItemsStepClient from './ItemsStepClient';
import { api } from '@/lib/apiBase'; // adjust import if you don't use the @ alias

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ItemParam = {
    id: number;
    nameEn: string;
    nameBn: string;
    unit: string | null;
    type: string | null;
    nsId: string;
    suggestiveValues: string[] | null;
};

export type ItemType = {
    id: number;
    nameEn: string;
    nameBn: string;
    status: string;
    parameters: ItemParam[];
};

export default async function Page() {
    const c = await cookies();
    const accessToken = c.get('access_token')?.value;
    const jSessionId = c.get('JSESSIONID')?.value;
    const tbAuth = c.get('tb_auth')?.value;

    const headers = new Headers({ Accept: 'application/json' });
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    const cookieHeader = [
        jSessionId ? `JSESSIONID=${jSessionId}` : undefined,
        tbAuth ? `tb_auth=${tbAuth}` : undefined,
    ]
        .filter(Boolean)
        .join('; ');
    if (cookieHeader) headers.set('Cookie', cookieHeader);

    // GET /api/items using unified base
    let items: ItemType[] = [];
    try {
        const res = await fetch(api('/api/items'), { headers, cache: 'no-store' });
        if (res.ok) {
            const payload = await res.json().catch(() => null as any);
            const data = payload?.data;
            items = Array.isArray(data) ? (data as ItemType[]) : (data?.content ?? []);
        }
    } catch {
        // keep items as []
    }

    // Wrap client component in Suspense (needed if it uses useSearchParams/usePathname)
    return (
        <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
            <ItemsStepClient items={items} />
        </Suspense>
    );
}