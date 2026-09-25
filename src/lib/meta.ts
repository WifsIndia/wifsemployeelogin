export function pageHead(title: string, description: string) {
  const full = `${title} — WIFS Employee Portal`;
  return {
    meta: [
      { title: full },
      { name: "description", content: description },
      { property: "og:title", content: full },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  };
}

export function daysAgoISO(days: number): string {
  const d = new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60000);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function weekStartISO(): string {
  const d = new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60000);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

export function monthStartISO(): string {
  const d = new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60000);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export function hoursBetween(from: string | null, to: string | null): number {
  if (!from || !to) return 0;
  return Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / 3600000);
}
