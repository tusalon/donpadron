create or replace function public.admin_save_product(
  p_token text,
  p_product jsonb,
  p_create boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := btrim(coalesce(p_product ->> 'id', ''));
  v_name text := left(btrim(coalesce(p_product ->> 'name', '')), 90);
  v_description text := left(btrim(coalesce(p_product ->> 'description', '')), 280);
  v_category text := left(btrim(coalesce(p_product ->> 'category', '')), 60);
  v_unit text := left(btrim(coalesce(p_product ->> 'unit', '')), 80);
  v_price_cup integer;
  v_stock numeric(12, 3);
  v_minimum_step numeric(12, 3);
  v_emoji text := left(btrim(coalesce(p_product ->> 'emoji', '🥩')), 12);
  v_accent text := btrim(coalesce(p_product ->> 'accent', '#d92525'));
  v_active boolean := coalesce((p_product ->> 'active')::boolean, true);
begin
  if not private.has_admin_session(p_token) then
    raise exception using errcode = '42501', message = 'La sesion administrativa vencio.';
  end if;

  if v_id = '' or v_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'El identificador del producto no es valido.';
  end if;

  if v_name = '' or v_category = '' or v_unit = '' then
    raise exception using errcode = '22023', message = 'Completa nombre, categoria y unidad.';
  end if;

  if jsonb_typeof(p_product -> 'priceCup') <> 'number'
     or jsonb_typeof(p_product -> 'stock') <> 'number'
     or jsonb_typeof(p_product -> 'minimumStep') <> 'number' then
    raise exception using errcode = '22023', message = 'Revisa el precio, la existencia y el paso.';
  end if;

  v_price_cup := round((p_product ->> 'priceCup')::numeric)::integer;
  v_stock := (p_product ->> 'stock')::numeric;
  v_minimum_step := (p_product ->> 'minimumStep')::numeric;

  if v_price_cup < 0 or v_stock < 0 or v_minimum_step <= 0 then
    raise exception using errcode = '22023', message = 'Revisa el precio, la existencia y el paso.';
  end if;

  if v_accent !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception using errcode = '22023', message = 'El color del producto no es valido.';
  end if;

  if p_create and exists (select 1 from public.products where id = v_id) then
    raise exception using errcode = '23505', message = 'Ya existe un producto con ese identificador. Cambia el nombre para diferenciarlo.';
  end if;

  insert into public.products
    (id, name, description, category, unit, price_cup, stock,
     minimum_step, emoji, accent, active, updated_at)
  values
    (v_id, v_name, v_description, v_category, v_unit, v_price_cup, v_stock,
     v_minimum_step, v_emoji, lower(v_accent), v_active, now())
  on conflict (id) do update
  set name = excluded.name,
      description = excluded.description,
      category = excluded.category,
      unit = excluded.unit,
      price_cup = excluded.price_cup,
      stock = excluded.stock,
      minimum_step = excluded.minimum_step,
      emoji = excluded.emoji,
      accent = excluded.accent,
      active = excluded.active,
      updated_at = now();

  return jsonb_build_object(
    'id', v_id,
    'name', v_name,
    'description', v_description,
    'category', v_category,
    'unit', v_unit,
    'priceCup', v_price_cup,
    'stock', v_stock,
    'minimumStep', v_minimum_step,
    'emoji', v_emoji,
    'accent', lower(v_accent),
    'active', v_active
  );
end;
$$;

revoke all on function public.admin_save_product(text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.admin_save_product(text, jsonb, boolean) to anon, authenticated;

select 'parte 2 lista: admin_save_product creada y permisos otorgados';
