"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { Session, User } from "@supabase/supabase-js"
import {
  getBuildAiSupabaseBrowser,
  isBuildAiSupabaseBrowserConfigured,
} from "@/lib/auth/buildai-supabase-browser"

type AuthValue = {
  user: User | null
  session: Session | null
  accessToken: string | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => getBuildAiSupabaseBrowser(), [])
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session ?? null)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_evt, next) => {
      setSession(next ?? null)
      setLoading(false)
    })
    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [supabase])

  const value = useMemo<AuthValue>(
    () => ({
      user: session?.user ?? null,
      session,
      accessToken: session?.access_token ?? null,
      loading,
      signOut: async () => {
        if (supabase) await supabase.auth.signOut()
      },
    }),
    [session, loading, supabase],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

