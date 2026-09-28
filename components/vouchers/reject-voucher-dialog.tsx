"use client";

import * as React from "react";
import { XCircle } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function RejectVoucherDialog({
  open,
  onOpenChange,
  voucherNumber,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucherNumber: string;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = React.useState("");

  function handleOpenChange(next: boolean) {
    if (!next) setNote("");
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="size-4 text-destructive" />
            Reject {voucherNumber}?
          </DialogTitle>
          <DialogDescription>
            It goes back to the preparer as un-approved. Add a note so they know what to fix.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Reason (optional)</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Missing supporting invoice..."
            rows={3}
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm(note);
              handleOpenChange(false);
            }}
          >
            Reject voucher
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
