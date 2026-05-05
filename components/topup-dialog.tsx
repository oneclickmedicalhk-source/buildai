"use client"

import { useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/components/auth-context"

export function TopUpDialog({
  open,
  onOpenChange,
  minimumUsd = 5,
  onTopUp,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  minimumUsd?: number
  onTopUp?: (amountUsd: number) => void
}) {
  const [amount, setAmount] = useState(String(minimumUsd))
  const { accessToken } = useAuth()
  const amountUsd = useMemo(() => Number(amount), [amount])
  const valid = Number.isFinite(amountUsd) && amountUsd >= minimumUsd

  const handleContinue = async () => {
    if (!valid) return
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ kind: "topup", topupAmountUsd: amountUsd }),
    })
    const data = (await res.json()) as { url?: string; error?: string }
    if (!res.ok || !data.url) throw new Error(data.error ?? "Top up failed")
    window.location.href = data.url
    onTopUp?.(amountUsd)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Top up credits</DialogTitle>
          <DialogDescription>
            Your balance is too low to continue. Top up to resume. Minimum ${minimumUsd}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1">
          <Label htmlFor="amount">Amount (USD)</Label>
          <Input
            id="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`${minimumUsd}`}
          />
          <p className="text-xs text-muted-foreground">No bonus credits for top ups.</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" disabled={!valid} onClick={() => void handleContinue()}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

