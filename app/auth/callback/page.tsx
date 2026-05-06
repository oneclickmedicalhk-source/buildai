"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  getBuildAiSupabaseBrowser,
  isBuildAiSupabaseBrowserConfigured,
} from "@/lib/auth/buildai-supabase-browser"
import { useI18n } from "@/components/i18n-context"

export default function AuthCallbackPage() {
  const router = useRouter()
  const configured = useMemo(() => isBuildAiSupabaseBrowserConfigured(), [])
  const supabase = useMemo(() => (configured ? getBuildAiSupabaseBrowser() : null), [configured])
  const [error, setError] = useState<string | null>(null)
  const { t } = useI18n()

  useEffect(() => {
    if (!supabase) {
      setError("Sign-in is not configured on this deployment.")
      return
    }
    // Supabase-js will detect session in URL and persist it.
    // We just wait a tick and return to the app.
    const t = window.setTimeout(async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        setError(error.message)
        return
      }
      if (data.session) {
        router.replace("/")
      } else {
        setError(t("auth_no_session"))
      }
    }, 150)
    return () => window.clearTimeout(t)
  }, [router, supabase])

  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-sm text-muted-foreground">
      {error ? <span className="text-destructive">{error}</span> : <span>{t("auth_signing_in")}</span>}
    </div>
  )
}

