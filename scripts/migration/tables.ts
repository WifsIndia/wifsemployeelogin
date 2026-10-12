// Shared table catalogue for export/import. Order = dependency-safe import order.
// `order` gives a stable sort for pagination; `selfRef` columns are imported in a second pass;
// `replaceSeeded` tables are pre-seeded by migrations and are replaced wholesale on the target.
export type TableSpec = {
  name: string;
  order: string[];
  conflict: string; // upsert conflict target
  selfRef?: string;
  replaceSeeded?: boolean;
};

export const TABLES: TableSpec[] = [
  { name: "organization_settings", order: ["id"], conflict: "id" },
  { name: "departments", order: ["id"], conflict: "id", replaceSeeded: true },
  { name: "companies", order: ["id"], conflict: "id" },
  { name: "office_locations", order: ["id"], conflict: "id", replaceSeeded: true },
  { name: "roles", order: ["id"], conflict: "id", replaceSeeded: true },
  { name: "role_permissions", order: ["role_id", "module"], conflict: "role_id,module", replaceSeeded: true },
  { name: "leave_policies", order: ["leave_type"], conflict: "leave_type", replaceSeeded: true },
  { name: "leave_policy_sets", order: ["id"], conflict: "id", replaceSeeded: true },
  { name: "leave_policy_types", order: ["id"], conflict: "id", replaceSeeded: true },
  { name: "holidays", order: ["id"], conflict: "id", replaceSeeded: true },
  // identity
  { name: "profiles", order: ["id"], conflict: "id", selfRef: "manager_id" },
  { name: "user_roles", order: ["id"], conflict: "id" },
  { name: "user_companies", order: ["user_id", "company_id"], conflict: "user_id,company_id" },
  { name: "employee_locations", order: ["user_id", "location_id"], conflict: "user_id,location_id" },
  { name: "employee_compensation", order: ["employee_id"], conflict: "employee_id" },
  // operational
  { name: "projects", order: ["id"], conflict: "id" },
  { name: "attendance", order: ["id"], conflict: "id" },
  { name: "leave_requests", order: ["id"], conflict: "id" },
  { name: "payroll_records", order: ["id"], conflict: "id" },
  { name: "tasks", order: ["id"], conflict: "id" },
  { name: "task_history", order: ["id"], conflict: "id" },
  { name: "task_comments", order: ["id"], conflict: "id" },
  { name: "daily_work_logs", order: ["id"], conflict: "id" },
  // documents
  { name: "document_folders", order: ["id"], conflict: "id", selfRef: "parent_id" },
  { name: "documents", order: ["id"], conflict: "id" },
  // communications & audit
  { name: "announcements", order: ["id"], conflict: "id" },
  { name: "notifications", order: ["id"], conflict: "id" },
  { name: "useful_links", order: ["id"], conflict: "id" },
  { name: "audit_logs", order: ["id"], conflict: "id" },
];

// Seeded rows are deleted child-first before import.
export const SEEDED_DELETE_ORDER = [
  "role_permissions", "roles", "leave_policy_types", "leave_policy_sets",
  "holidays", "office_locations", "departments", "leave_policies",
];

export const SEEDED_KEY: Record<string, string> = {
  role_permissions: "role_id", roles: "id", leave_policy_types: "id", leave_policy_sets: "id",
  holidays: "id", office_locations: "id", departments: "id", leave_policies: "leave_type",
};

export const CURRENT_PROJECT_REF = "nxxfjvxtytwepbkhyzmx";
export const EXPORT_DIR = process.env.EXPORT_DIR || "migration-export";
export const PAGE = 1000;
