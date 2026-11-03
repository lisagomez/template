import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { PwaRegister } from '@/shared/components/pwa-register'
import { MARCA } from '@/shared/marca/tokens.generado'
import './marca.generada.css'
import './globals.css'
import '@/shared/capa/marca-laboratorio.css'

/*
 * Tipografía de Turno 25, AUTOALOJADA: los .woff2 viajan en el repo (subconjunto latin, licencia OFL al
 * lado) y no se pide nada a Google ni en build ni en ejecución. Source Sans 3 es variable (400-800 en un
 * solo archivo); IBM Plex Mono va en sus tres pesos, para cifras y código.
 */
const sans = localFont({
  src: './fuentes/source-sans-3-latin-variable.woff2',
  weight: '400 800',
  variable: '--font-sans',
  display: 'swap',
})
const mono = localFont({
  src: [
    { path: './fuentes/ibm-plex-mono-latin-400.woff2', weight: '400' },
    { path: './fuentes/ibm-plex-mono-latin-500.woff2', weight: '500' },
    { path: './fuentes/ibm-plex-mono-latin-600.woff2', weight: '600' },
  ],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Turno 25',
  description: 'Procesos que trabajan solos.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Dictado',
  },
  icons: {
    apple: '/icons/dictado-180.png',
  },
}

export const viewport: Viewport = {
  themeColor: MARCA.paleta.gris['950'],
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  )
}
