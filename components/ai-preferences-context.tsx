"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { AiProviderChoice } from "@/lib/ai-provider"
import type { UiStyleKitId } from "@/lib/ui-style-kit"
import type { ThemeId } from "@/lib/theme/theme-types"

const STORAGE_AI = "buildai-ai-provider"
const STORAGE_UI = "buildai-ui-style-kit"
const STORAGE_THEME = "buildai-theme-id"
const STORAGE_THEME_VARIANT = "buildai-theme-variant"

export type AiPreferencesContextValue = {
  aiProvider: AiProviderChoice
  setAiProvider: (v: AiProviderChoice) => void
  uiStyleKit: UiStyleKitId
  setUiStyleKit: (v: UiStyleKitId) => void
  themeId: ThemeId
  setThemeId: (v: ThemeId) => void
  themeVariantId: string
  setThemeVariantId: (v: string) => void
}

const AiPreferencesContext = createContext<AiPreferencesContextValue | null>(null)

function readStoredAi(): AiProviderChoice {
  if (typeof window === "undefined") return "auto"
  try {
    const raw = localStorage.getItem(STORAGE_AI)
    if (
      raw === "auto" ||
      raw === "openai" ||
      raw === "vertex_claude" ||
      raw === "vertex_gemini"
    ) {
      return raw
    }
  } catch {
    /* ignore */
  }
  return "auto"
}

function readStoredUi(): UiStyleKitId {
  if (typeof window === "undefined") return "default"
  try {
    const raw = localStorage.getItem(STORAGE_UI)
    if (
      raw === "default" ||
      raw === "admin_shell" ||
      raw === "storefront" ||
      raw === "storefront_admin" ||
      raw === "saas_marketing" ||
      raw === "dashboard_analytics"
    ) {
      return raw
    }
  } catch {
    /* ignore */
  }
  return "default"
}

function readStoredTheme(): ThemeId {
  if (typeof window === "undefined") return "auto"
  try {
    const raw = localStorage.getItem(STORAGE_THEME)
    if (
      raw === "auto" ||
      raw === "neon_dark" ||
      raw === "natural_light" ||
      raw === "minimal_light" ||
      raw === "studio_dark"
    ) {
      return raw
    }
  } catch {
    /* ignore */
  }
  return "auto"
}

function readStoredThemeVariant(): string {
  if (typeof window === "undefined") return "auto"
  try {
    const raw = localStorage.getItem(STORAGE_THEME_VARIANT)
    if (raw && raw.trim()) return raw
  } catch {
    /* ignore */
  }
  return "auto"
}

export function AiPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [aiProvider, setAiProviderState] = useState<AiProviderChoice>("auto")
  const [uiStyleKit, setUiStyleKitState] = useState<UiStyleKitId>("default")
  const [themeId, setThemeIdState] = useState<ThemeId>("auto")
  const [themeVariantId, setThemeVariantIdState] = useState<string>("auto")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setAiProviderState(readStoredAi())
    setUiStyleKitState(readStoredUi())
    setThemeIdState(readStoredTheme())
    setThemeVariantIdState(readStoredThemeVariant())
    setMounted(true)
  }, [])

  const setAiProvider = useCallback((v: AiProviderChoice) => {
    setAiProviderState(v)
    try {
      localStorage.setItem(STORAGE_AI, v)
    } catch {
      /* ignore */
    }
  }, [])

  const setUiStyleKit = useCallback((v: UiStyleKitId) => {
    setUiStyleKitState(v)
    try {
      localStorage.setItem(STORAGE_UI, v)
    } catch {
      /* ignore */
    }
  }, [])

  const setThemeId = useCallback((v: ThemeId) => {
    setThemeIdState(v)
    try {
      localStorage.setItem(STORAGE_THEME, v)
    } catch {
      /* ignore */
    }
  }, [])

  const setThemeVariantId = useCallback((v: string) => {
    setThemeVariantIdState(v)
    try {
      localStorage.setItem(STORAGE_THEME_VARIANT, v)
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo(
    () =>
      ({
        aiProvider: mounted ? aiProvider : "auto",
        setAiProvider,
        uiStyleKit: mounted ? uiStyleKit : "default",
        setUiStyleKit,
        themeId: mounted ? themeId : "auto",
        setThemeId,
        themeVariantId: mounted ? themeVariantId : "auto",
        setThemeVariantId,
      }) satisfies AiPreferencesContextValue,
    [
      aiProvider,
      setAiProvider,
      uiStyleKit,
      setUiStyleKit,
      themeId,
      setThemeId,
      themeVariantId,
      setThemeVariantId,
      mounted,
    ],
  )

  return (
    <AiPreferencesContext.Provider value={value}>{children}</AiPreferencesContext.Provider>
  )
}

export function useAiPreferences(): AiPreferencesContextValue {
  const ctx = useContext(AiPreferencesContext)
  if (!ctx) {
    throw new Error("useAiPreferences must be used within AiPreferencesProvider")
  }
  return ctx
}
