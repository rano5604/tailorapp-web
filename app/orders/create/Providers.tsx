'use client';
import { CreateOrderProvider } from './_store';

export default function CreateProviders({ children }: { children: React.ReactNode }) {
    return <CreateOrderProvider>{children}</CreateOrderProvider>;
}