import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin, ListChecks, CalendarDays, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WiFS India Employee Portal" },
      {
        name: "description",
        content:
          "Internal WiFS India portal for GPS attendance, tasks, daily work logs, leave and employee management.",
      },
      { property: "og:title", content: "WiFS India Employee Portal" },
      {
        property: "og:description",
        content:
          "Internal WiFS India portal for GPS attendance, tasks, daily work logs, leave and employee management.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: MapPin, title: "GPS attendance", text: "Check in and out only from inside the WiFS office area." },
  { icon: ListChecks, title: "Tasks & work logs", text: "Track assigned work and daily progress." },
  { icon: CalendarDays, title: "Leave management", text: "Apply for leave and follow approvals." },
  { icon: ShieldCheck, title: "Role-based access", text: "Employee, Manager, HR and Admin permissions." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-5 py-5 lg:px-12">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary font-display text-lg font-bold text-primary-foreground">
            W
          </div>
          <div>
            <p className="font-display text-sm font-bold tracking-wide">WiFS INDIA</p>
            <p className="text-xs text-muted-foreground">Employee Portal</p>
          </div>
        </div>
        <Button asChild>
          <Link to="/auth">Employee Login</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-4xl px-5 py-20 text-center lg:py-28">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-foreground">
          Internal use only
        </p>
        <h1 className="mt-4 font-display text-4xl font-bold leading-tight lg:text-5xl">
          The WiFS India Employee Portal
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground">
          Attendance with office location verification, task tracking, daily work reporting and leave —
          built for the WiFS team on desktop and mobile.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link to="/auth">Login to continue</Link>
        </Button>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-5 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border border-border bg-card p-5">
            <f.icon className="size-6 text-primary" />
            <h2 className="mt-3 font-display text-sm font-semibold">{f.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
