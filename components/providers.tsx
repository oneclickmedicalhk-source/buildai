"use client"

import { ThemeProvider } from "@/components/theme-provider"
import { AiPreferencesProvider } from "@/components/ai-preferences-context"
import { I18nProvider } from "@/components/i18n-context"
import { AuthProvider } from "@/components/auth-context"
import { Toaster } from "@/components/ui/sonner"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <I18nProvider>
        <AuthProvider>
          <AiPreferencesProvider>{children}</AiPreferencesProvider>
        </AuthProvider>
      </I18nProvider>
      <Toaster richColors position="top-center" />
    </ThemeProvider>
  )
}
