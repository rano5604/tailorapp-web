// app/orders/create/confirm/page.tsx
import { Suspense } from 'react';
import ConfirmClient from './ConfirmClient';

export default function Page() {
    return (
        <Suspense fallback={<main style={{ padding: 16 }}><p>Loading confirmation…</p></main>}>
            <ConfirmClient />
        </Suspense>
    );
}