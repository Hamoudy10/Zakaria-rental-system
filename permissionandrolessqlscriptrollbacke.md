begin;

-- 1) Restore grants to authenticated/public/anon (table-level)
do $$
declare g record;
begin
  for g in
    select distinct table_schema, table_name, grantee, privilege_type
    from security_audit.grants_backup
    where captured_at = (select max(captured_at) from security_audit.grants_backup)
  loop
    execute format(
      'grant %s on table %I.%I to %I;',
      g.privilege_type,
      g.table_schema,
      g.table_name,
      g.grantee
    );
  end loop;
end $$;

-- 2) Drop current policies
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname='public'
  loop
    execute format('drop policy if exists %I on %I.%I;', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- 3) Recreate backed-up policies (latest snapshot)
do $$
declare p record;
declare role_list text;
declare role_item text;
begin
  for p in
    select *
    from security_audit.policies_backup
    where captured_at = (select max(captured_at) from security_audit.policies_backup)
    order by schemaname, tablename, policyname
  loop
    if p.roles is null or array_length(p.roles,1) is null then
      role_list := 'public';
    else
      role_list := '';
      foreach role_item in array p.roles loop
        role_list := case when role_list='' then quote_ident(role_item) else role_list || ', ' || quote_ident(role_item) end;
      end loop;
    end if;

    execute format(
      'create policy %I on %I.%I as %s for %s to %s %s %s;',
      p.policyname,
      p.schemaname,
      p.tablename,
      lower(p.permissive),
      lower(p.cmd),
      role_list,
      case when p.qual is not null and p.qual <> '' then 'using (' || p.qual || ')' else '' end,
      case when p.with_check is not null and p.with_check <> '' then 'with check (' || p.with_check || ')' else '' end
    );
  end loop;
end $$;

commit;

expose only safe reads:
begin;

-- Example: allow authenticated users read-only categories
grant usage on schema public to authenticated;
grant select on table public.expense_categories to authenticated;

alter table public.expense_categories enable row level security;
alter table public.expense_categories force row level security;

drop policy if exists p_expense_categories_read_auth on public.expense_categories;
create policy p_expense_categories_read_auth
on public.expense_categories
for select
to authenticated
using (is_active = true);

commit;
