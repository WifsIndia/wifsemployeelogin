import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { pageHead } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { AccessDenied, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { OrganizationSection, AttendanceSection, SystemSection, PayrollRulesForm } from "@/components/settings/OrgSettings";
import { CompaniesSection, LocationsSection } from "@/components/settings/Directory";
import { StaffSection, RolesSection, LeavePolicySection, HolidaysSection } from "@/components/settings/Policies";

const SECTIONS = [
  ["organization", "Organization"], ["locations", "Locations"], ["staff", "Staff"], ["roles", "Roles & Permissions"],
  ["leave", "Leave Policy"], ["holidays", "Holidays"], ["payroll", "Payroll"], ["attendance", "Attendance"], ["system", "System"],
] as const;
type Section = (typeof SECTIONS)[number][0];

export const Route = createFileRoute("/_authenticated/super-admin/settings")({
  validateSearch: z.object({ section: z.enum(SECTIONS.map((s) => s[0]) as [Section, ...Section[]]).optional() }),
  head: () => pageHead("Settings", "Organization-wide settings for WiFS Super Admins."),
  component: SettingsPage,
});

function SettingsPage() {
  const { roles } = useAuth();
  const { section = "organization" } = Route.useSearch();
  if (!roles.includes("super_admin")) return <AccessDenied />;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Settings" description="Organization-wide configuration" />
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex gap-1 overflow-x-auto lg:w-52 lg:shrink-0 lg:flex-col">
          {SECTIONS.map(([key, label]) => (
            <Link key={key} to="/super-admin/settings" search={{ section: key }}
              className={cn("whitespace-nowrap rounded-md px-3 py-2 text-sm", section === key ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted")}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 flex-1 space-y-6">
          {section === "organization" && <><OrganizationSection /><CompaniesSection /></>}
          {section === "locations" && (
            <>
              <LocationsSection />
              <Button asChild variant="outline"><Link to="/admin/settings/office-location">GPS attendance office settings</Link></Button>
            </>
          )}
          {section === "staff" && <StaffSection />}
          {section === "roles" && <RolesSection />}
          {section === "leave" && <LeavePolicySection />}
          {section === "holidays" && <HolidaysSection />}
          {section === "payroll" && (
            <>
              <PayrollRulesForm />
              <p className="text-sm text-muted-foreground">Set each person's salary and bank details from Staff → Edit. Monthly payroll runs come in a later phase.</p>
            </>
          )}
          {section === "attendance" && <AttendanceSection />}
          {section === "system" && <SystemSection />}
        </div>
      </div>
    </div>
  );
}
