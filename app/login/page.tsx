"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import {
  getBuildAiSupabaseBrowser,
  isBuildAiSupabaseBrowserConfigured,
} from "@/lib/auth/buildai-supabase-browser"
import { useAuth } from "@/components/auth-context"
import { useI18n } from "@/components/i18n-context"
import { toast } from "sonner"

export default function LoginPage() {
  const router = useRouter()
  const supabaseConfigured = useMemo(() => isBuildAiSupabaseBrowserConfigured(), [])
  const supabase = useMemo(() => (supabaseConfigured ? getBuildAiSupabaseBrowser() : null), [supabaseConfigured])
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)

  if (!loading && user) {
    // If already logged in, return to builder.
    router.replace("/")
  }

  const handleGoogle = async () => {
    if (!supabase) {
      toast.error("Sign-in is not configured. Add Supabase URL + anon key in Vercel (see .env.example).")
      return
    }
    try {
      setBusy(true)
      const origin = window.location.origin
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback`,
        },
      })
      if (error) throw error
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 max-w-lg mx-auto px-4 py-14 w-full">
        <div className="rounded-2xl border border-border bg-card/30 p-6">
          <h1 className="text-2xl font-semibold">{t("login_title")}</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {t("login_desc")}
          </p>
          <Button className="mt-6 w-full" onClick={() => void handleGoogle()} disabled={busy}>
            {t("login_google")}
          </Button>
        </div>
      </main>
    </div>
  )
}

