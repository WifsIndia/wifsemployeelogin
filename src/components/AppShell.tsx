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
  ShieldCheck,
} from "lucide-react";
import { useAuth, type AppRole } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: AppRole[];
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/attendance", label: "Attendance", icon: MapPin },
  { to: "/attendance/history", label: "Attendance History", icon: CalendarDays },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/work-log", label: "Daily Work Log", icon: NotebookPen },
  { to: "/leave", label: "Leave", icon: CalendarDays },
  { to: "/announcements", label: "Announcements", icon: Megaphone },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/profile", label: "My Profile", icon: UserRound },
];

const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Overview", icon: ShieldCheck, roles: ["admin", "hr", "manager"] },
  { to: "/admin/employees", label: "Employees", icon: Users, roles: ["admin", "hr"] },
  { to: "/admin/attendance", label: "Attendance", icon: MapPin, roles: ["admin", "hr", "manager"] },
  { to: "/admin/tasks", label: "Tasks", icon: ListChecks, roles: ["admin", "hr", "manager"] },
  { to: "/admin/reports", label: "Reports", icon: BarChart3, roles: ["admin", "hr", "manager"] },
  { to: "/admin/settings", label: "Settings", icon: Settings, roles: ["admin"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, primaryRole, hasRole, signOut, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: unread = 0 } = useQuery({
    queryKey: ["unread-notifications", user?.id],
    enabled: !!user?.id,
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

  const adminItems = ADMIN_NAV.filter((i) => !i.roles || hasRole(...i.roles));

  const sidebar = (
    <div className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
        <div className="flex size-10 items-center justify-center rounded-lg bg-sidebar-primary font-display text-lg font-bold text-sidebar-primary-foreground">
          W
        </div>
        <div>
          <p className="font-display text-sm font-bold tracking-wide">WIFS INDIA</p>
          <p className="text-xs text-sidebar-foreground/70">Employee Portal</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV.map((item) => (
          <SideLink key={item.to} item={item} pathname={pathname} onNavigate={() => setOpen(false)}>
            {item.to === "/notifications" && unread > 0 ? (
              <span className="ml-auto rounded-full bg-sidebar-primary px-2 py-0.5 text-[11px] font-semibold text-sidebar-primary-foreground">
                {unread}
              </span>
            ) : null}
          </SideLink>
        ))}
        {adminItems.length > 0 && (
          <div className="pt-4">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              Administration
            </p>
            {adminItems.map((item) => (
              <SideLink key={item.to} item={item} pathname={pathname} onNavigate={() => setOpen(false)} />
            ))}
          </div>
        )}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <p className="truncate text-sm font-medium">{profile?.full_name || "Employee"}</p>
        <p className="mb-3 text-xs uppercase tracking-wide text-sidebar-primary">{primaryRole}</p>
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
      <aside className="hidden lg:block">{sidebar}</aside>
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
            <p className="truncate font-display text-base font-semibold">WIFS Employee Portal</p>
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
  const active = pathname === item.to;
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

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
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
      <Link to="/dashboard" className="mt-5 inline-block text-sm font-medium text-primary underline">
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
