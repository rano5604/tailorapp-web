// app/login/page.tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import LoginForm from './LoginForm'

export default async function Page() {
    const c = await cookies()
    const isLoggedIn = Boolean(
        c.get('tb_auth') || c.get('JSESSIONID') || c.get('access_token')
    )
    if (isLoggedIn) redirect('/dashboard')
    return <LoginForm />
}