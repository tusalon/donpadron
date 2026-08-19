-- PostgREST solo expone los esquemas configurados (por defecto public y
-- graphql_public), asi que la funcion edge no puede leer private.push_subscriptions
-- directamente. Estas dos funciones le dan acceso sin exponer el esquema.

create or replace function public.push_list_subscriptions()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'endpoint', s.endpoint,
        'p256dh', s.p256dh,
        'auth', s.auth
      )
    ),
    '[]'::jsonb
  )
  from private.push_subscriptions s;
$$;

create or replace function public.push_delete_subscriptions(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from private.push_subscriptions
  where id = any(coalesce(p_ids, array[]::uuid[]));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.push_list_subscriptions() from public, anon, authenticated;
revoke all on function public.push_delete_subscriptions(uuid[]) from public, anon, authenticated;
grant execute on function public.push_list_subscriptions() to service_role;
grant execute on function public.push_delete_subscriptions(uuid[]) to service_role;

select 'push por rpc lista: push_list_subscriptions y push_delete_subscriptions';
