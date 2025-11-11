import { Suspense } from 'react';
import SuccessClient from './SuccessClient';

export default function Page() {
    return (
        <Suspense fallback={<main style={{ padding: 16 }}>Loading…</main>}>
            <SuccessClient />
        </Suspense>
    );
}