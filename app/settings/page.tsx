"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Header } from "@/components/header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth-context"
import { useI18n } from "@/components/i18n-context"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

type BalanceResp = { balanceUsd: number }
type LedgerRow = { id: number; ts: number; kind: string; amount_usd: number | string; meta: unknown }
type UsageRow = {
  id: number
  ts: number
  provider: string
  model: string
  input_tokens: number
  output_tokens: number
  charged_usd: number | string
}
type SubResp = {
  profile: { plan?: string; email?: string; name?: string; avatar_url?: string } | null
  subscription: { status?: string; current_period_end?: string | null } | null
}

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

function toNum(n: unknown): number {
  if (typeof n === "number") return n
  if (typeof n === "string" && n.trim()) return Number(n)
  return 0
}

export default function SettingsPage() {
  const { accessToken, user, signOut } = useAuth()
  const { lang } = useI18n()
  const [tab, setTab] = useState("billing")
  const [balance, setBalance] = useState<number | null>(null)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [usage, setUsage] = useState<UsageRow[]>([])
  const [sub, setSub] = useState<SubResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [promoCode, setPromoCode] = useState("")
  const [redeeming, setRedeeming] = useState(false)

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    }),
    [accessToken],
  )

  const refresh = async () => {
    if (!accessToken) return
    setLoading(true)
    try {
      const [b, l, u, s] = await Promise.all([
        fetch("/api/billing/balance", { headers, method: "GET" }).then((r) => r.json() as Promise<BalanceResp>),
        fetch("/api/billing/ledger?limit=40", { headers, method: "GET" }).then((r) => r.json() as Promise<{ rows: LedgerRow[] }>),
        fetch("/api/billing/usage?limit=40", { headers, method: "GET" }).then((r) => r.json() as Promise<{ rows: UsageRow[] }>),
        fetch("/api/billing/subscription", { headers, method: "GET" }).then((r) => r.json() as Promise<SubResp>),
      ])
      if ("error" in (b as any)) throw new Error((b as any).error)
      setBalance((b as BalanceResp).balanceUsd)
      setLedger(l.rows ?? [])
      setUsage(u.rows ?? [])
      setSub(s)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load settings")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  const startCheckout = async (kind: "subscription_pro" | "topup") => {
    if (!accessToken) return
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers,
      body: JSON.stringify(kind === "topup" ? { kind, topupAmountUsd: 5 } : { kind }),
    })
    const data = (await res.json()) as { url?: string; error?: string }
    if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout failed")
    window.location.href = data.url
  }

  const redeemPromo = async () => {
    if (!accessToken) return
    if (!promoCode.trim()) return
    setRedeeming(true)
    try {
      const res = await fetch("/api/billing/redeem", {
        method: "POST",
        headers,
        body: JSON.stringify({ code: promoCode.trim() }),
      })
      const data = (await res.json()) as { ok?: boolean; balanceUsd?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Redeem failed")
      if (typeof data.balanceUsd === "number") setBalance(data.balanceUsd)
      toast.success(lang === "zh-HK" ? "兌換成功" : "Redeemed")
      setPromoCode("")
      void refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Redeem failed")
    } finally {
      setRedeeming(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{lang === "zh-HK" ? "設定" : "Settings"}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === "zh-HK"
                ? "管理帳戶、方案、credit、付款同連接。"
                : "Manage your account, plan, credits, billing, and connections."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              {lang === "zh-HK" ? "重新整理" : "Refresh"}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">{lang === "zh-HK" ? "返回建立器" : "Back to Builder"}</Link>
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/30 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">{lang === "zh-HK" ? "目前餘額" : "Current balance"}</div>
            <div className="text-2xl font-semibold tabular-nums">
              {balance == null ? "—" : money(balance)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => void startCheckout("topup")}>
              {lang === "zh-HK" ? "充值（最少 $5）" : "Top up (min $5)"}
            </Button>
            <Button variant="outline" onClick={() => void startCheckout("subscription_pro")}>
              {lang === "zh-HK" ? "升級 Pro（$10/月）" : "Upgrade Pro ($10/mo)"}
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-9">
            <TabsTrigger value="billing" className="text-xs">
              {lang === "zh-HK" ? "方案與收費" : "Plan & billing"}
            </TabsTrigger>
            <TabsTrigger value="credits" className="text-xs">
              {lang === "zh-HK" ? "Credit 記錄" : "Credit history"}
            </TabsTrigger>
            <TabsTrigger value="usage" className="text-xs">
              {lang === "zh-HK" ? "用量" : "Usage"}
            </TabsTrigger>
            <TabsTrigger value="account" className="text-xs">
              {lang === "zh-HK" ? "帳戶" : "Account"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="billing" className="mt-4">
            <div className="rounded-2xl border border-border bg-card/30 p-6 space-y-6">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-medium">{lang === "zh-HK" ? "目前方案" : "Current plan"}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {sub?.profile?.plan ? sub.profile.plan : "—"}
                    {sub?.subscription?.status ? ` • ${sub.subscription.status}` : ""}
                  </div>
                  {sub?.subscription?.current_period_end ? (
                    <div className="text-xs text-muted-foreground mt-1">
                      {lang === "zh-HK" ? "下期結算日：" : "Period end:"}{" "}
                      {new Date(sub.subscription.current_period_end).toLocaleDateString()}
                    </div>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {lang === "zh-HK"
                    ? "Free：每月 $10；Pro：$10/月送 $15（1.5×）"
                    : "Free: $10/mo credits. Pro: $10/mo with $15 credits (1.5×)."}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background/40 p-4">
                <div className="text-sm font-medium">{lang === "zh-HK" ? "優惠碼" : "Promo code"}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {lang === "zh-HK"
                    ? "輸入優惠碼即可加 credit（每個帳戶通常只可用一次）。"
                    : "Enter a promo code to add credits (usually once per account)."}
                </p>
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <div className="flex-1">
                    <Label htmlFor="promo" className="sr-only">
                      Promo code
                    </Label>
                    <Input
                      id="promo"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      placeholder={lang === "zh-HK" ? "例如：FREE10" : "e.g. FREE10"}
                    />
                  </div>
                  <Button type="button" onClick={() => void redeemPromo()} disabled={redeeming || !promoCode.trim()}>
                    {redeeming ? (lang === "zh-HK" ? "兌換中…" : "Redeeming…") : lang === "zh-HK" ? "兌換" : "Redeem"}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="credits" className="mt-4">
            <div className="rounded-2xl border border-border bg-card/30 p-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{lang === "zh-HK" ? "時間" : "Time"}</TableHead>
                    <TableHead>{lang === "zh-HK" ? "類型" : "Type"}</TableHead>
                    <TableHead className="text-right">{lang === "zh-HK" ? "金額" : "Amount"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.length ? (
                    ledger.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{new Date(r.ts).toLocaleString()}</TableCell>
                        <TableCell className="text-muted-foreground">{r.kind}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {toNum(r.amount_usd) >= 0 ? "+" : ""}
                          {money(toNum(r.amount_usd))}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        {lang === "zh-HK" ? "暫時未有記錄" : "No entries yet"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="usage" className="mt-4">
            <div className="rounded-2xl border border-border bg-card/30 p-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{lang === "zh-HK" ? "時間" : "Time"}</TableHead>
                    <TableHead>{lang === "zh-HK" ? "模型" : "Model"}</TableHead>
                    <TableHead className="text-right">{lang === "zh-HK" ? "Tokens" : "Tokens"}</TableHead>
                    <TableHead className="text-right">{lang === "zh-HK" ? "扣款" : "Charged"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage.length ? (
                    usage.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{new Date(r.ts).toLocaleString()}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.provider} / {r.model}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.input_tokens}+{r.output_tokens}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{money(toNum(r.charged_usd))}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        {lang === "zh-HK" ? "暫時未有記錄" : "No entries yet"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="account" className="mt-4">
            <div className="rounded-2xl border border-border bg-card/30 p-6 space-y-4">
              <div>
                <div className="text-sm font-medium">{lang === "zh-HK" ? "登入電郵" : "Signed-in email"}</div>
                <div className="text-sm text-muted-foreground mt-1">{user?.email ?? "—"}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => void signOut()}>
                  {lang === "zh-HK" ? "登出" : "Sign out"}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

