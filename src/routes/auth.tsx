import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Employee Login — WIFS India Portal" },
      {
        name: "description",
        content: "Secure login for WIFS India employees to access attendance, tasks and leave.",
      },
      { property: "og:title", content: "Employee Login — WIFS India Portal" },
      {
        property: "og:description",
        content: "Secure login for WIFS India employees to access attendance, tasks and leave.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard", replace: true });
  }, [loading, session, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      toast.error(
        error.message.includes("Invalid login")
          ? "Incorrect email or password."
          : error.message,
      );
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("If that email exists, a password reset link has been sent.");
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-lg bg-sidebar-primary font-display text-xl font-bold text-sidebar-primary-foreground">
            W
          </div>
          <div>
            <p className="font-display text-lg font-bold tracking-wide">WIFS INDIA</p>
            <p className="text-sm text-sidebar-foreground/70">Employee Portal</p>
          </div>
        </div>
        <div>
          <h2 className="font-display text-3xl font-bold leading-tight">
            Attendance, tasks and leave — in one secure place.
          </h2>
          <p className="mt-4 max-w-md text-sm text-sidebar-foreground/70">
            Check in from the office with GPS verification, track your daily work and manage your team
            from any device.
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs text-sidebar-foreground/60">
          <ShieldCheck className="size-4" /> Protected by role-based access control
        </p>
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="mb-3 flex size-11 items-center justify-center rounded-lg bg-primary font-display text-xl font-bold text-primary-foreground">
              W
            </div>
            <p className="font-display text-lg font-bold">WIFS Employee Portal</p>
          </div>
          <h1 className="font-display text-2xl font-bold">
            {mode === "login" ? "Employee login" : "Reset your password"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "login"
              ? "Use the work email address provided by WIFS."
              : "We will email you a secure reset link."}
          </p>

          <form onSubmit={mode === "login" ? handleLogin : handleReset} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@wifsindia.com"
              />
            </div>
            {mode === "login" && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              {mode === "login" ? "Login" : "Send reset link"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-4 text-sm text-primary underline"
            onClick={() => setMode(mode === "login" ? "forgot" : "login")}
          >
            {mode === "login" ? "Forgot password?" : "Back to login"}
          </button>

          <p className="mt-8 text-xs text-muted-foreground">
            Accounts are created by WIFS HR or an administrator.{" "}
            <Link to="/" className="underline">
              Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
