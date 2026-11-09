import { getStaffRole, canManageSystem } from '@/lib/security/roles'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const AUTH_TIMEOUT_MS = 9_000

const fetchWithAuthTimeout: typeof fetch = (input, init) => {
  const timeoutSignal = AbortSignal.timeout(AUTH_TIMEOUT_MS)
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal

  return fetch(input, { ...init, signal })
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithAuthTimeout },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set({ name, value, ...options })
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let user
  let authError
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
    authError = result.error
  } catch (error) {
    console.error('[auth] Supabase verification failed:', error)
    return NextResponse.json(
      { error: 'Servizio di autenticazione temporaneamente non disponibile. Riprova tra qualche secondo.' },
      { status: 503, headers: { 'Retry-After': '10' } }
    )
  }

  if (authError) {
    console.error('[auth] Supabase verification returned an error:', authError)
    return NextResponse.json(
      { error: 'Servizio di autenticazione temporaneamente non disponibile. Riprova tra qualche secondo.' },
      { status: 503, headers: { 'Retry-After': '10' } }
    )
  }

  const role = user ? getStaffRole(user, process.env.ADMIN_EMAILS || '') : null
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login')

  if ((!user || !role) && !isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && role && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  if (user && role && request.nextUrl.pathname.startsWith('/impostazioni') && !canManageSystem(role)) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
