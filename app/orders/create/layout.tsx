'use client'

import { CreateOrderProvider } from './_store'

export default function CreateOrderLayout({ children }: { children: React.ReactNode }) {
    return <CreateOrderProvider>{children}</CreateOrderProvider>
}