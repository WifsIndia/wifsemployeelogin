import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  MapPin,
  ListChecks,
  NotebookPen,
  CalendarDays,
  Megaphone,
  Bell,
  FileText,
  Users,
  BarChart3,
  Settings,
  UserRound,
  LogOut,
  Menu,
  X,
  UsersRound,
  Loader2,
} from "lucide-react";
import { useAuth, type AppRole } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const I = {
  dashboard: { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  team: { to: "/team", label: "Team", icon: UsersRound },
  employees: { to: "/admin/employees", label: "Employees", icon: Users },
  attendance: { to: "/attendance", label: "Attendance", icon: MapPin },
  myTasks: { to: "/tasks", label: "My Tasks", icon: ListChecks },
  tasks: { to: "/tasks", label: "Tasks", icon: ListChecks },
  work: { to: "/work-log", label: "Daily Work", icon: NotebookPen },
  leave: { to: "/leave", label: "Leave", icon: CalendarDays },
  ann: { to: "/announcements", label: "Announcements", icon: Megaphone },
  reports: { to: "/reports", label: "Reports", icon: BarChart3 },
  notif: { to: "/notifications", label: "Notifications", icon: Bell },
  settings: { to: "/admin/settings/office-location", label: "Office Location", icon: MapPin },
  org: { to: "/super-admin/settings", label: "Settings", icon: Settings },
  docs: { to: "/documents", label: "Documents", icon: FileText },
  profile: { to: "/profile", label: "Profile", icon: UserRound },
} satisfies Record<string, NavItem>;

const NAV_BY_ROLE: Record<AppRole, NavItem[]> = {
  agent: [I.dashboard, I.attendance, I.myTasks, I.work, I.leave, I.ann, I.notif, I.docs, I.profile],
  ado: [I.dashboard, I.team, I.attendance, I.tasks, I.work, I.leave, I.ann, I.notif, I.docs, I.profile],
  super_admin: [I.dashboard, I.org, I.employees, I.attendance, I.tasks, I.work, I.leave, I.ann, I.reports, I.notif, I.settings, I.docs, I.profile],
  employee: [I.dashboard, I.attendance, I.myTasks, I.work, I.leave, I.ann, I.notif, I.docs, I.profile],
  manager: [I.dashboard, I.team, I.attendance, I.tasks, I.work, I.leave, I.ann, I.notif, I.profile],
  hr: [I.dashboard, I.employees, I.attendance, I.work, I.leave, I.ann, I.reports, I.notif, I.profile],
  admin: [
    I.dashboard,
    I.employees,
    I.attendance,
    I.tasks,
    I.work,
    I.leave,
    I.ann,
    I.reports,
    I.notif,
    I.settings,
    I.docs,
    I.profile,
  ],
};

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, primaryRole, signOut, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: unread = 0 } = useQuery({
    queryKey: ["unread-notifications", user?.id],
    enabled: !!user?.id,
    refetchInterval: 60000,
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("read", false);
      return count ?? 0;
    },
  });

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  const items = NAV_BY_ROLE[primaryRole];

  const sidebar = (
    <div className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
        <div className="flex size-10 items-center justify-center rounded-lg bg-sidebar-primary font-display text-lg font-bold text-sidebar-primary-foreground">
          W
        </div>
        <div>
          <p className="font-display text-sm font-bold tracking-wide">WiFS INDIA</p>
          <p className="text-xs text-sidebar-foreground/70">Employee Portal</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map((item) => (
          <SideLink key={item.to + item.label} item={item} pathname={pathname} onNavigate={() => setOpen(false)}>
            {item.to === "/notifications" && unread > 0 ? (
              <span className="ml-auto rounded-full bg-sidebar-primary px-2 py-0.5 text-[11px] font-semibold text-sidebar-primary-foreground">
                {unread}
              </span>
            ) : null}
          </SideLink>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <p className="truncate text-sm font-medium">{profile?.full_name || "Employee"}</p>
        <p className="mb-3 text-xs uppercase tracking-wide text-sidebar-primary">{primaryRole.replace("_", " ")}</p>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 rounded-md bg-sidebar-accent px-3 py-2 text-sm text-sidebar-accent-foreground transition-colors hover:opacity-90"
        >
          <LogOut className="size-4" /> Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-foreground/50" onClick={() => setOpen(false)} />
          <div className="relative z-10">{sidebar}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card px-4 py-3 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-semibold">WiFS Employee Portal</p>
          </div>
          <Link to="/notifications" className="relative rounded-md p-2 hover:bg-muted" aria-label="Notifications">
            <Bell className="size-5" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                {unread}
              </span>
            )}
          </Link>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function SideLink({
  item,
  pathname,
  onNavigate,
  children,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
  children?: ReactNode;
}) {
  const Icon = item.icon;
  const active = pathname === item.to || pathname === item.to + "/" || (pathname.startsWith(item.to + "/"));
  return (
    <Link
      to={item.to as "/dashboard"}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
      {children}
    </Link>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function AccessDenied() {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center">
      <p className="font-display text-4xl font-bold text-destructive">403</p>
      <h2 className="mt-2 text-lg font-semibold">Access denied</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        You do not have permission to view this page. Contact your administrator if you believe this is a
        mistake.
      </p>
      <Link to="/dashboard" className="mt-5 inline-block text-sm font-semibold text-primary hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}

export function RequireRole({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const { hasRole } = useAuth();
  if (!hasRole(...roles)) return <AccessDenied />;
  return <>{children}</>;
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-12 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const s = status.toUpperCase();
  const tone =
    s === "APPROVED" || s === "COMPLETED" || s === "CHECKED_OUT" || s === "ACTIVE"
      ? "bg-success/15 text-success"
      : s === "REJECTED" || s === "INACTIVE" || s === "URGENT" || s === "ABSENT"
        ? "bg-destructive/15 text-destructive"
        : s === "PENDING" || s === "ON_HOLD" || s === "HIGH" || s === "CHECKED_IN"
          ? "bg-warning/20 text-warning-foreground"
          : "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", tone)}>
      {s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
    </span>
  );
}
