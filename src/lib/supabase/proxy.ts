import { createServerClient, type CookieMethodsServer } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { destinoSeguro, esApiProtegida, esRutaDeCuentas, esRutaProtegida } from '@/features/auth/services/destino';

/**
 * Refresca la sesión y protege SOLO las rutas del reel (`/reel`, `/cuenta`, `/api/reel`). El matcher
 * de `src/proxy.ts` ya acota por dónde pasa; esto decide qué hacer. Sin sesión, una página redirige a
 * `/login?siguiente=…` y una API responde 401 (nunca una redirección que un fetch seguiría a ciegas).
 */
export async function actualizaSesion(peticion: NextRequest) {
  let respuesta = NextResponse.next({ request: peticion });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !llave) {
    // Sin Supabase configurado, las rutas protegidas no se abren: fallar cerrado, no abierto.
    return esApiProtegida(peticion.nextUrl.pathname)
      ? NextResponse.json({ error: 'cuentas sin configurar' }, { status: 503 })
      : esRutaProtegida(peticion.nextUrl.pathname) ? new NextResponse('Cuentas sin configurar', { status: 503 }) : respuesta;
  }
  // Anotado como CookieMethodsServer para que `setAll` tenga tipos (igual que en server.ts).
  const galletas: CookieMethodsServer = {
    getAll: () => peticion.cookies.getAll(),
    setAll(porPoner) {
      porPoner.forEach(({ name, value }) => peticion.cookies.set(name, value));
      respuesta = NextResponse.next({ request: peticion });
      porPoner.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
    },
  };
  const supabase = createServerClient(url, llave, { cookies: galletas });
  const { data: { user } } = await supabase.auth.getUser();
  const ruta = peticion.nextUrl.pathname;

  if (!user && esApiProtegida(ruta)) return NextResponse.json({ error: 'sin sesión' }, { status: 401 });
  if (!user && esRutaProtegida(ruta)) {
    const destino = new URL('/login', peticion.url);
    destino.searchParams.set('siguiente', destinoSeguro(ruta + peticion.nextUrl.search));
    return NextResponse.redirect(destino);
  }
  if (user && esRutaDeCuentas(ruta)) {
    return NextResponse.redirect(new URL(destinoSeguro(peticion.nextUrl.searchParams.get('siguiente')), peticion.url));
  }
  return respuesta;
}
