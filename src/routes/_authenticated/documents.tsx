import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { pageHead } from "@/lib/meta";
import { PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => pageHead("Documents", "Company policies and employee documents."),
  component: Page,
});

function Page() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Documents" description="Company policies, forms and your employee documents." />
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <FileText className="mx-auto size-10 text-muted-foreground" />
        <h2 className="mt-3 font-display text-lg font-semibold">Coming soon</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Document sharing will be available here in a future update.
        </p>
      </div>
    </div>
  );
}
