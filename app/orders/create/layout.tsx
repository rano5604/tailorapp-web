import { Suspense } from 'react';
import CreateProviders from './Providers';
export default function CreateOrderLayout({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={<main style={{ padding: 16 }}>Loading…</main>}>
            <CreateProviders>{children}</CreateProviders>
        </Suspense>
    );
}