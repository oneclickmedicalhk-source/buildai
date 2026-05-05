"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { en } from "@/lib/i18n/en"
import { zhHK } from "@/lib/i18n/zh-HK"

export type LangId = "en" | "zh-HK"

const STORAGE_LANG = "buildai-lang"

const dicts: Record<LangId, Record<string, string>> = {
  en: en,
  "zh-HK": zhHK,
}

type I18nContextValue = {
  lang: LangId
  setLang: (lang: LangId) => void
  t: (key: keyof typeof en | keyof typeof zhHK) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function readStoredLang(): LangId {
  if (typeof window === "undefined") return "en"
  try {
    const raw = localStorage.getItem(STORAGE_LANG)
    if (raw === "en" || raw === "zh-HK") return raw
  } catch {
    /* ignore */
  }
  return "en"
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangId>("en")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setLangState(readStoredLang())
    setMounted(true)
  }, [])

  const setLang = useCallback((next: LangId) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_LANG, next)
    } catch {
      /* ignore */
    }
  }, [])

  const t = useCallback(
    (key: keyof typeof en | keyof typeof zhHK) => {
      const cur = dicts[mounted ? lang : "en"]
      return cur[String(key)] ?? String(key)
    },
    [lang, mounted],
  )

  const value = useMemo(() => ({ lang: mounted ? lang : "en", setLang, t }), [lang, setLang, t, mounted])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used within I18nProvider")
  return ctx
}

