import type { Metadata, Viewport } from 'next'
import { PwaRegister } from '@/shared/components/pwa-register'
import './globals.css'

export const metadata: Metadata = {
  title: 'SaaS Factory App',
  description: 'Built with SaaS Factory',
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
  themeColor: '#1e1e22',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  )
}
