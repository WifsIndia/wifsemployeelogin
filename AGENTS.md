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
