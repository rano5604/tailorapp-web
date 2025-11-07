// app/page.tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function Home() {
    const c = await cookies()
    const isLoggedIn = Boolean(
        c.get('tb_auth') || c.get('JSESSIONID') || c.get('access_token')
    )
    redirect(isLoggedIn ? '/dashboard' : '/login')
}