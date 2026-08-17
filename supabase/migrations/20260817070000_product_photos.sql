alter table public.products add column photo_url text not null default '';

create or replace function public.get_catalog()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'products', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'description', p.description,
          'category', p.category,
          'unit', p.unit,
          'priceCup', p.price_cup,
          'stock', p.stock,
          'minimumStep', p.minimum_step,
          'emoji', p.emoji,
          'accent', p.accent,
          'photoUrl', p.photo_url
        ) order by p.category, p.name
      )
      from public.products p
      where p.active
    ), '[]'::jsonb),
    'settings', coalesce((
      select jsonb_build_object(
        'businessName', s.business_name,
        'whatsappPhone', s.whatsapp_phone,
        'pickupAddress', s.pickup_address,
        'paymentCopy', s.payment_copy
      )
      from public.settings s
      where s.id = 'main'
    ), '{}'::jsonb)
  );
$$;

create or replace function public.admin_dashboard(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_admin_session(p_token) then
    raise exception using errcode = '42501', message = 'La sesion administrativa vencio.';
  end if;

  return jsonb_build_object(
    'products', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'description', p.description,
          'category', p.category,
          'unit', p.unit,
          'priceCup', p.price_cup,
          'stock', p.stock,
          'minimumStep', p.minimum_step,
          'emoji', p.emoji,
          'accent', p.accent,
          'photoUrl', p.photo_url,
          'active', p.active
        ) order by p.category, p.name
      )
      from public.products p
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'displayId', o.display_id,
          'customerName', o.customer_name,
          'phone', o.phone,
          'deliveryMethod', o.delivery_method,
          'address', o.address,
          'paymentMethod', o.payment_method,
          'notes', o.notes,
          'totalCup', o.total_cup,
          'status', o.status,
          'createdAt', o.created_at,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', i.id,
                'productId', i.product_id,
                'productName', i.product_name,
                'quantity', i.quantity,
                'unit', i.unit,
                'priceEachCup', i.price_each_cup,
                'subtotalCup', i.subtotal_cup
              ) order by i.id
            )
            from public.order_items i
            where i.order_id = o.id
          ), '[]'::jsonb)
        ) order by o.created_at desc
      )
      from (
        select * from public.orders order by created_at desc limit 80
      ) o
    ), '[]'::jsonb),
    'settings', coalesce((
      select jsonb_build_object(
        'businessName', s.business_name,
        'whatsappPhone', s.whatsapp_phone,
        'pickupAddress', s.pickup_address,
        'paymentCopy', s.payment_copy
      )
      from public.settings s
      where s.id = 'main'
    ), '{}'::jsonb)
  );
end;
$$;

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
  v_photo_url text := left(btrim(coalesce(p_product ->> 'photoUrl', '')), 500);
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

  if v_photo_url <> '' and v_photo_url !~ '^https://' then
    raise exception using errcode = '22023', message = 'La foto del producto no es valida.';
  end if;

  if p_create and exists (select 1 from public.products where id = v_id) then
    raise exception using errcode = '23505', message = 'Ya existe un producto con ese identificador. Cambia el nombre para diferenciarlo.';
  end if;

  insert into public.products
    (id, name, description, category, unit, price_cup, stock,
     minimum_step, emoji, accent, photo_url, active, updated_at)
  values
    (v_id, v_name, v_description, v_category, v_unit, v_price_cup, v_stock,
     v_minimum_step, v_emoji, lower(v_accent), v_photo_url, v_active, now())
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
      photo_url = excluded.photo_url,
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
    'photoUrl', v_photo_url,
    'active', v_active
  );
end;
$$;

select 'fotos de producto listas: columna photo_url y funciones actualizadas';
