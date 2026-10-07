<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Employee org assignment (role, supervisor/ADO via manager_id, companies, salary) is edited only through src/components/EmployeeEditDialog.tsx — one editor for Employees page and Super Admin Staff settings.
- Company-owned items (documents, folders) use `company_id` null = all staff, checked via `public.can_access_company`; files live in the private `documents` bucket and are readable only when a visible `documents` row points at them — keeps storage access identical to table RLS.
- Task changes are recorded by the `tasks_history` trigger into `task_history`; never write history from the client — keeps history tamper-proof.
- Responsive sizing for tables and dialogs belongs in the existing shared UI components; page layouts use shrinking grid tracks and local scroll regions to prevent viewport overflow without duplicating views.
- Personal employee documents reuse `documents` with `employee_id` set; access is the employee themself or viewers allowed by can_view_employee, uploads/edits via can_manage_employee_docs — one document system for shared and personal files.
- Processing/locking state for actions lives in the shared Button (async onClick → spinner, disabled, no repeat), Switch, Dialog (can't close mid-request) and ConfirmDelete; pages must return the promise from their handlers instead of adding per-page busy flags.
- Menu items and page gates come from `my_permissions` View flags via `usePermissions`/`RequireModule` (Super Admin always passes); never hard-code modules per role — Roles & Permissions must drive every portal while RLS stays the enforcement.
- Leave rules (types, balances, notice, half-day, working days) read the employee's assigned `leave_policy_id` policy; the legacy `leave_policies` table is used only when no policy is assigned.
- `check_out` closes today's open session or, failing that, the previous local day's open session — overnight shifts never create a second record.
