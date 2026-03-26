'use client'

import { supabase } from '@/lib/supabaseClient'
import { useEffect, useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
  const loadSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    setUserEmail(session?.user?.email ?? null)
  }

  loadSession()

  const { data: authListener } = supabase.auth.onAuthStateChange(
    async (_event, session) => {
      setUserEmail(session?.user?.email ?? null)
    }
  )

  return () => {
    authListener.subscription.unsubscribe()
  }
}, [])

  const handleOtpLogin = async () => {
    const { error } = await supabase.auth.signInWithOtp({
  email,
  options: {
    emailRedirectTo: `${window.location.origin}/login`,
  },
})

    if (error) {
      setMessage(`Error login: ${error.message}`)
    } else {
      setMessage('Te enviamos un enlace de acceso a tu correo.')
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setMessage('Sesión cerrada.')
    setUserEmail(null)
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-md px-6 py-12">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
            LoboDeals
          </p>
          <h1 className="mt-2 text-3xl font-bold">Login</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Inicia sesión con tu correo para guardar tu wishlist y tus alertas.
          </p>

          {userEmail ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
                Sesión activa: {userEmail}
              </div>

              <button
                onClick={handleSignOut}
                className="w-full rounded-2xl border border-zinc-700 px-4 py-3 font-medium"
              >
                Cerrar sesión
              </button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <input
                type="email"
                placeholder="Correo"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none placeholder:text-zinc-500"
              />

              <button
                onClick={handleOtpLogin}
                className="w-full rounded-2xl bg-white px-4 py-3 font-semibold text-black"
              >
                Enviar enlace de acceso
              </button>
            </div>
          )}

          {message && (
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
              {message}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}