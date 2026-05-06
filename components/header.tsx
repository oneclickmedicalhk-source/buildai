"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAiPreferences } from "@/components/ai-preferences-context"
import { useI18n } from "@/components/i18n-context"
import { useAuth } from "@/components/auth-context"
import { Sparkles, ChevronDown, Settings, CreditCard, LogOut, User } from "lucide-react"
import { useTheme } from "next-themes"

export function Header() {
  const { aiProvider, setAiProvider } = useAiPreferences()
  const { lang, setLang, t } = useI18n()
  const { signOut } = useAuth()
  const { theme, setTheme } = useTheme()

  return (
    <header className="h-14 border-b border-border flex items-center justify-between gap-2 px-3 sm:px-4 bg-background/80 backdrop-blur-sm sticky top-0 z-50 min-w-0">
      <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="size-8 rounded-lg bg-accent flex items-center justify-center">
            <Sparkles className="size-4 text-accent-foreground" />
          </div>
          <span className="font-semibold text-lg">BuildAI</span>
        </Link>
        <nav className="flex items-center gap-0 min-w-0 overflow-x-auto shrink text-xs sm:text-sm">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground px-2 shrink-0" asChild>
            <Link href="/">{t("nav_builder")}</Link>
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground px-2 shrink-0" asChild>
            <Link href="/templates">{t("nav_templates")}</Link>
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground px-2 shrink-0" asChild>
            <Link href="/docs">{t("nav_docs")}</Link>
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground px-2 shrink-0" asChild>
            <Link href="/pricing">{t("nav_pricing")}</Link>
          </Button>
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap hidden lg:inline">
            {lang === "zh-HK" ? "主題" : "Theme"}
          </span>
          <Select value={theme === "dark" ? "dark" : "light"} onValueChange={(v) => setTheme(v)}>
            <SelectTrigger size="sm" className="h-8 w-[6.5rem] text-xs" aria-label="Theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="light" className="text-xs">
                {lang === "zh-HK" ? "淺色" : "Light"}
              </SelectItem>
              <SelectItem value="dark" className="text-xs">
                {lang === "zh-HK" ? "深色" : "Dark"}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="hidden sm:flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap hidden lg:inline">{t("header_language")}</span>
          <Select value={lang} onValueChange={(v) => setLang(v as typeof lang)}>
            <SelectTrigger size="sm" className="h-8 w-[9.5rem] text-xs" aria-label="Language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="en" className="text-xs">
                {t("language_en")}
              </SelectItem>
              <SelectItem value="zh-HK" className="text-xs">
                {t("language_zhhk")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="hidden sm:flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap hidden lg:inline">{t("header_model")}</span>
          <Select
            value={aiProvider}
            onValueChange={(v) => setAiProvider(v as typeof aiProvider)}
          >
            <SelectTrigger
              size="sm"
              className="h-8 w-[7.5rem] lg:w-[8.5rem] text-xs"
              aria-label="AI model"
            >
              <SelectValue placeholder="Auto" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="auto" className="text-xs">
                {t("header_auto")}
              </SelectItem>
              <SelectItem value="vertex_gemini" className="text-xs">
                Gemini
              </SelectItem>
              <SelectItem value="vertex_claude" className="text-xs">
                Claude (Vertex)
              </SelectItem>
              <SelectItem value="openai" className="text-xs">
                OpenAI
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button variant="outline" size="sm" className="hidden sm:flex">
          {t("header_feedback")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 shrink-0">
              <div className="size-7 rounded-full bg-accent flex items-center justify-center">
                <User className="size-4 text-accent-foreground" />
              </div>
              <ChevronDown className="size-4 text-muted-foreground hidden sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="size-4 mr-2" />
                {t("header_settings")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings?tab=billing">
                <CreditCard className="size-4 mr-2" />
                {t("header_billing")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => void signOut()}>
              <LogOut className="size-4 mr-2" />
              {t("header_sign_out")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
