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

export function TopUpDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Top up credits</DialogTitle>
          <DialogDescription>
            Your balance is too low to continue. Top up to resume.
          </DialogDescription>
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
            Go to billing / top up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

