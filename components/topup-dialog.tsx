"use client"

import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/components/i18n-context"

export function TopUpDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const { t } = useI18n()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("topup_title")}</DialogTitle>
          <DialogDescription>{t("topup_desc")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              onOpenChange(false)
              router.push("/settings?tab=billing")
            }}
          >
            {t("topup_cta")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

