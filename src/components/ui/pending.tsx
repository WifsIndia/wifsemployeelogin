import * as React from "react";

/** Shared "a request is running" state for a dialog, so it can't be closed or re-submitted mid-request. */
export interface PendingScope {
  busy: boolean;
  start: () => void;
  end: () => void;
}

export const PendingContext = React.createContext<PendingScope | null>(null);

export function usePendingScope(): PendingScope {
  const [count, setCount] = React.useState(0);
  const start = React.useCallback(() => setCount((c) => c + 1), []);
  const end = React.useCallback(() => setCount((c) => Math.max(0, c - 1)), []);
  return React.useMemo(() => ({ busy: count > 0, start, end }), [count, start, end]);
}

const VERBS: Record<string, string> = {
  save: "Saving", update: "Updating", delete: "Deleting", remove: "Removing", create: "Creating",
  add: "Adding", upload: "Uploading", submit: "Submitting", approve: "Approving", reject: "Rejecting",
  finalize: "Finalizing", reopen: "Reopening", calculate: "Calculating", recalculate: "Recalculating",
  cancel: "Cancelling", send: "Sending", apply: "Applying", assign: "Assigning", generate: "Generating",
  mark: "Updating", change: "Changing", reset: "Resetting", sign: "Signing in", log: "Saving",
};

function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  return "";
}

/** "Save changes" → "Saving…", "Delete" → "Deleting…", otherwise "Processing…". */
export function pendingLabel(children: React.ReactNode): string | null {
  const text = textOf(children).trim();
  if (!text) return null;
  const first = text.split(/\s+/)[0]!.toLowerCase();
  return `${VERBS[first] ?? "Processing"}…`;
}
