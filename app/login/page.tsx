// app/login/page.tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import LoginForm from './LoginForm'

function isSafeInternalPath(p?: string | null) {
    if (!p) return false
    // allow only same-origin absolute paths; block protocol-relative and external
    return p.startsWith('/') && !p.startsWith('//')
}

export default async function Page({
                                       searchParams,
                                   }: {
    searchParams?: { [key: string]: string | string[] | undefined }
}) {
    const c = await cookies()
    const isLoggedIn = Boolean(
        c.get('tb_auth') || c.get('JSESSIONID') || c.get('access_token') || c.get('Authorization')
    )

    const redirectParam = (searchParams?.redirect &&
        (Array.isArray(searchParams.redirect) ? searchParams.redirect[0] : searchParams.redirect)) || null

    if (isLoggedIn) {
        const target = isSafeInternalPath(redirectParam) ? (redirectParam as string) : '/dashboard'
        redirect(target)
    }

    return <LoginForm />
}
