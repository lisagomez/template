import { createServerClient, type CookieMethodsServer } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  // Anotar el objeto como CookieMethodsServer da tipado contextual a setAll.
  // Sin esto, TS infiere `any` implicito en cookiesToSet y el build falla
  // con noImplicitAny (regla del proyecto: nunca `any`).
  const cookieMethods: CookieMethodsServer = {
    getAll() {
      return cookieStore.getAll()
    },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        )
      } catch {
        // Ignore en Server Components: solo Server Actions y Route Handlers
        // pueden escribir cookies. El middleware refresca la sesion.
      }
    },
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieMethods }
  )
}
