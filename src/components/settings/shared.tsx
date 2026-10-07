import { useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function ConfirmDelete({ what, onConfirm, label }: { what: string; onConfirm: () => unknown; label?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Stay open (and locked) until the delete finishes, so it can't be sent twice.
  const run = async () => {
    setBusy(true);
    try { await onConfirm(); setOpen(false); } finally { setBusy(false); }
  };
  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive" aria-label={`Delete ${what}`}>
          <Trash2 className="size-4" /> {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {what}?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={run} loading={busy} loadingText="Deleting…">
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={"min-w-0 space-y-1.5 " + (className ?? "")}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={"h-11 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-base sm:h-9 md:text-sm " + (props.className ?? "")}
    />
  );
}

export const tableCls = "w-full text-sm";
export const thCls = "whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground";
export const tdCls = "px-3 py-3 border-t border-border";

export function money(n: number | string | null | undefined, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(n ?? 0));
}
