create table private.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

revoke all on table private.push_subscriptions from public, anon, authenticated;

create or replace function public.admin_save_push_subscription(
  p_token text,
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_admin_session(p_token) then
    raise exception using errcode = '42501', message = 'La sesion administrativa vencio.';
  end if;

  if btrim(coalesce(p_endpoint, '')) = '' or btrim(coalesce(p_p256dh, '')) = '' or btrim(coalesce(p_auth, '')) = '' then
    raise exception using errcode = '22023', message = 'La suscripcion de notificaciones no es valida.';
  end if;

  insert into private.push_subscriptions (endpoint, p256dh, auth)
  values (p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
  set p256dh = excluded.p256dh,
      auth = excluded.auth;
end;
$$;

revoke all on function public.admin_save_push_subscription(text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_save_push_subscription(text, text, text, text) to anon, authenticated;

select 'push notifications listas: tabla de suscripciones y admin_save_push_subscription';
