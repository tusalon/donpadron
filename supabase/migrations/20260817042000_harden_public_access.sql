create index order_items_product_id_idx on public.order_items (product_id);

create policy "catalogo_publico_productos_activos"
on public.products
for select
to anon
using (active);

create policy "ajustes_publicos_principales"
on public.settings
for select
to anon
using (id = 'main');

create policy "pedidos_sin_acceso_directo"
on public.orders
for all
to anon, authenticated
using (false)
with check (false);

create policy "items_sin_acceso_directo"
on public.order_items
for all
to anon, authenticated
using (false)
with check (false);

grant select on table public.products, public.settings to anon;
alter function public.get_catalog() security invoker;

revoke execute on function public.get_catalog() from authenticated;
revoke execute on function public.place_order(jsonb) from authenticated;
revoke execute on function public.admin_login(text) from authenticated;
revoke execute on function public.admin_logout(text) from authenticated;
revoke execute on function public.admin_dashboard(text) from authenticated;
revoke execute on function public.admin_update_product(text, text, numeric, integer, boolean) from authenticated;
revoke execute on function public.admin_update_order(text, uuid, text) from authenticated;
revoke execute on function public.admin_update_settings(text, text, text, text, text) from authenticated;
