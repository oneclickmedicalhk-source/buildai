"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { Session, User, SupabaseClient } from "@supabase/supabase-js"
import {
  createBuildAiSupabaseBrowserExplicit,
  getBuildAiSupabaseBrowser,
  isBuildAiSupabaseBrowserConfigured,
} from "@/lib/auth/buildai-supabase-browser"

type AuthValue = {
  user: User | null
  session: Session | null
  accessToken: string | null
  loading: boolean
  /** True when deployment has BuildAI Supabase URL + anon (from server layout when possible). */
  authConfigured: boolean
  /** False until layout props or bootstrap fetch has finished (avoid false "not configured"). */
  authEnvReady: boolean
  /** Cached USD credit balance for the signed-in user (null if unknown / not signed in). */
  balanceUsd: number | null
  /** Refresh credit balance from server (no-op if not signed in). */
  refreshBalance: () => Promise<void>
  supabase: SupabaseClient
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({
  children,
  buildAiSupabaseEnv,
}: {
  children: React.ReactNode
  /** From root layout: runtime env; avoids stale client bundle `NEXT_PUBLIC_*` in production. */
  buildAiSupabaseEnv: { url: string; anonKey: string } | null
}) {
  /**
   * When layout props are null (prerender/cache) or stale bundles lack inlined env, fetch the same
   * values from a no-store API route so login always matches server diagnostics.
   */
  const [fetchedPair, setFetchedPair] = useState<{ url: string; anonKey: string } | null>(null)

  const hasServerPropPair =
    Boolean(buildAiSupabaseEnv?.url?.trim()) && Boolean(buildAiSupabaseEnv?.anonKey?.trim())

  const [bootstrapResolved, setBootstrapResolved] = useState<boolean>(hasServerPropPair)

  useEffect(() => {
    if (hasServerPropPair) {
      setBootstrapResolved(true)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/auth/public-supabase-bootstrap", { cache: "no-store" })
        const data = (await res.json()) as {
          configured?: boolean
          url?: string
          anonKey?: string
        }
        if (cancelled) return
        if (data?.configured && data.url?.trim() && data.anonKey?.trim()) {
          setFetchedPair({ url: data.url.trim(), anonKey: data.anonKey.trim() })
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setBootstrapResolved(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hasServerPropPair])

  const effectivePair = useMemo(() => {
    if (buildAiSupabaseEnv?.url?.trim() && buildAiSupabaseEnv?.anonKey?.trim()) {
      return { url: buildAiSupabaseEnv.url.trim(), anonKey: buildAiSupabaseEnv.anonKey.trim() }
    }
    if (fetchedPair?.url?.trim() && fetchedPair?.anonKey?.trim()) return fetchedPair
    return null
  }, [
    buildAiSupabaseEnv?.url,
    buildAiSupabaseEnv?.anonKey,
    fetchedPair?.url,
    fetchedPair?.anonKey,
  ])

  const supabase = useMemo(() => {
    if (effectivePair) {
      return createBuildAiSupabaseBrowserExplicit(effectivePair.url, effectivePair.anonKey)
    }
    return getBuildAiSupabaseBrowser()
  }, [effectivePair?.url, effectivePair?.anonKey])

  const authConfigured = useMemo(() => {
    if (effectivePair) return true
    return isBuildAiSupabaseBrowserConfigured()
  }, [effectivePair])
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null)

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

  const refreshBalance = useMemo(() => {
    return async () => {
      const token = session?.access_token ?? null
      if (!token) {
        setBalanceUsd(null)
        return
      }
      try {
        const res = await fetch("/api/billing/balance", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        const data = (await res.json()) as { balanceUsd?: number; error?: string }
        if (!res.ok) throw new Error(data.error ?? "Failed to fetch balance")
        if (typeof data.balanceUsd === "number") setBalanceUsd(data.balanceUsd)
      } catch {
        // Keep existing value; avoid noisy UI.
      }
    }
  }, [session?.access_token])

  useEffect(() => {
    // Best-effort: keep cached balance fresh after sign-in / session refresh.
    if (!session?.access_token) {
      setBalanceUsd(null)
      return
    }
    void refreshBalance()
  }, [session?.access_token, refreshBalance])

  const value = useMemo<AuthValue>(
    () => ({
      user: session?.user ?? null,
      session,
      accessToken: session?.access_token ?? null,
      loading,
      authConfigured,
      authEnvReady: bootstrapResolved,
      balanceUsd,
      refreshBalance,
      supabase,
      signOut: async () => {
        await supabase.auth.signOut()
        setBalanceUsd(null)
      },
    }),
    [session, loading, supabase, authConfigured, bootstrapResolved, balanceUsd, refreshBalance],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

