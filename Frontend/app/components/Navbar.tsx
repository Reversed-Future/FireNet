'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function Navbar() {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const isLoggedIn = !!currentUser

  useEffect(() => {
    const updateAuthState = () => {
      const storedUser = sessionStorage.getItem('currentUser')
      if (!storedUser) {
        setCurrentUser(null)
        return
      }

      try {
        setCurrentUser(JSON.parse(storedUser))
      } catch {
        sessionStorage.removeItem('currentUser')
        setCurrentUser(null)
      }
    }

    updateAuthState()
    window.addEventListener('storage', updateAuthState)
    window.addEventListener('focus', updateAuthState)

    return () => {
      window.removeEventListener('storage', updateAuthState)
      window.removeEventListener('focus', updateAuthState)
    }
  }, [])

  const handleAdminClick = () => {
    router.push('/admin')
  }

  const handleAuthClick = () => {
    if (isLoggedIn) {
      sessionStorage.removeItem('currentUser')
      setCurrentUser(null)
      router.push('/')
      return
    }

    router.push('/login')
  }

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-40 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800/50">
        <div className="w-full px-6 lg:px-12 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-gradient-to-r from-orange-500 to-red-600 shadow-xl shadow-orange-500/20 flex items-center justify-center">
              <span className="text-white font-extrabold text-lg tracking-[0.15em]">F</span>
            </div>
            <div className="hidden sm:block">
              <div className="text-white text-lg font-semibold tracking-[0.24em]">FIRENET</div>
            </div>

            <div className="hidden md:flex items-center gap-8 text-slate-300 font-medium ml-8">
              <Link href="/" className="hover:text-white transition-colors">Home</Link>
              <Link href="/map" className="hover:text-white transition-colors">Platform</Link>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {isLoggedIn && (
              <button
                type="button"
                onClick={handleAdminClick}
                className="hidden sm:inline-flex px-6 py-2.5 border border-orange-500/50 bg-slate-900/80 hover:bg-orange-500/10 text-orange-100 font-semibold rounded-full transition-all duration-300 transform hover:-translate-y-0.5 shadow-lg shadow-orange-500/10"
              >
                Admin System
              </button>
            )}
            <button
              onClick={handleAuthClick}
              className="hidden sm:inline-flex px-6 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-semibold rounded-full transition-all duration-300 transform hover:-translate-y-0.5 shadow-lg shadow-orange-500/30"
            >
              {isLoggedIn ? 'Log out' : 'Log in'}
            </button>
            <button
              type="button"
              className="relative z-50 inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-900/90 p-3 text-slate-200 transition hover:bg-slate-800 sm:hidden"
              onClick={() => setMenuOpen(true)}
              onTouchStart={() => setMenuOpen(true)}
              aria-label="Open navigation menu"
              style={{ touchAction: 'manipulation' }}
            >
              <span className="sr-only">Open navigation menu</span>
              <div className="space-y-1">
                <span className="block h-0.5 w-5 bg-white" />
                <span className="block h-0.5 w-5 bg-white" />
                <span className="block h-0.5 w-5 bg-white" />
              </div>
            </button>
          </div>
        </div>
      </nav>

      {menuOpen && (
        <div className="absolute top-[72px] right-6 z-50 sm:hidden">
          <div className="w-[220px] bg-slate-950/95 border border-slate-700/70 rounded-3xl shadow-2xl backdrop-blur-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60">
              <span className="text-slate-300 text-xs uppercase tracking-[0.24em]">Menu</span>
              <button
                type="button"
                className="text-slate-400 hover:text-white transition text-lg"
                onClick={() => setMenuOpen(false)}
                aria-label="Close navigation menu"
              >
                ×
              </button>
            </div>
            <div className="flex flex-col gap-2 px-4 py-3">
              <Link
                href="/"
                className="rounded-2xl bg-slate-900/90 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                onClick={() => setMenuOpen(false)}
              >
                Home
              </Link>
              <Link
                href="/map"
                className="rounded-2xl bg-slate-900/90 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                onClick={() => setMenuOpen(false)}
              >
                Platform
              </Link>
              {isLoggedIn && (
                <Link
                  href="/admin"
                  className="rounded-2xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm font-semibold text-orange-100 transition hover:bg-orange-500/20"
                  onClick={() => setMenuOpen(false)}
                >
                  Admin System
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
