import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold">SaaS Factory</h1>
      <p className="mt-2 text-gray-600">Tu app está lista. Empieza a construir.</p>
      <Link
        href="/dictar"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
      >
        🎤 Abrir dictado
      </Link>
    </main>
  )
}
