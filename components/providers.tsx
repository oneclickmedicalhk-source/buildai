"use client"

import { ThemeProvider } from "@/components/theme-provider"
import { AiPreferencesProvider } from "@/components/ai-preferences-context"
import { I18nProvider } from "@/components/i18n-context"
import { AuthProvider } from "@/components/auth-context"
import { Toaster } from "@/components/ui/sonner"

export function Providers({
  children,
  buildAiSupabaseEnv,
}: {
  children: React.ReactNode
  buildAiSupabaseEnv: { url: string; anonKey: string } | null
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <I18nProvider>
        <AuthProvider buildAiSupabaseEnv={buildAiSupabaseEnv}>
          <AiPreferencesProvider>{children}</AiPreferencesProvider>
        </AuthProvider>
      </I18nProvider>
      <Toaster richColors position="top-center" />
    </ThemeProvider>
  )
}
