create table public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text not null,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'aceptado', 'rechazado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers enable row level security;
revoke all on table public.customers from public, anon, authenticated;

alter table public.orders add column customer_id uuid references public.customers(id);
create index orders_customer_id_idx on public.orders (customer_id);

-- Los pedidos que ya existian se convierten en la cartera inicial. Se dan por
-- aceptados: ya compraron antes de que existiera la aprobacion, y marcarlos
-- pendientes llenaria el panel de solicitudes falsas.
insert into public.customers (phone, name, status, created_at)
select
  regexp_replace(o.phone, '\D', '', 'g'),
  (array_agg(o.customer_name order by o.created_at desc))[1],
  'aceptado',
  min(o.created_at)
from public.orders o
where regexp_replace(o.phone, '\D', '', 'g') <> ''
group by regexp_replace(o.phone, '\D', '', 'g')
on conflict (phone) do nothing;

update public.orders o
set customer_id = c.id
from public.customers c
where c.phone = regexp_replace(o.phone, '\D', '', 'g')
  and o.customer_id is null;

-- place_order: identico al anterior, salvo que ahora registra al cliente en la
-- cartera (el primer pedido crea la solicitud) y enlaza el pedido con el.
create or replace function public.place_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_name text := btrim(coalesce(p_payload ->> 'customerName', ''));
  v_phone text := btrim(coalesce(p_payload ->> 'phone', ''));
  v_normalized_phone text;
  v_customer_id uuid;
  v_delivery_method text := btrim(coalesce(p_payload ->> 'deliveryMethod', 'recoger'));
  v_address text := btrim(coalesce(p_payload ->> 'address', ''));
  v_payment_method text := btrim(coalesce(p_payload ->> 'paymentMethod', 'Efectivo'));
  v_notes text := left(btrim(coalesce(p_payload ->> 'notes', '')), 300);
  v_items jsonb := p_payload -> 'items';
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id text;
  v_quantity numeric(12, 3);
  v_subtotal integer;
  v_total integer := 0;
  v_order_id uuid := gen_random_uuid();
  v_display_id text;
  v_seen text[] := array[]::text[];
  v_settings public.settings%rowtype;
begin
  v_normalized_phone := regexp_replace(v_phone, '\D', '', 'g');

  if v_customer_name = '' or length(v_normalized_phone) < 8 then
    raise exception using errcode = '22023', message = 'Escribe tu nombre y un teléfono válido.';
  end if;

  if v_delivery_method not in ('recoger', 'domicilio') then
    raise exception using errcode = '22023', message = 'Forma de entrega inválida.';
  end if;

  if v_delivery_method = 'domicilio' and v_address = '' then
    raise exception using errcode = '22023', message = 'Escribe la dirección de entrega.';
  end if;

  if v_payment_method not in ('Transfermóvil', 'Efectivo') then
    raise exception using errcode = '22023', message = 'Forma de pago inválida.';
  end if;

  if jsonb_typeof(v_items) <> 'array'
     or jsonb_array_length(v_items) < 1
     or jsonb_array_length(v_items) > 20 then
    raise exception using errcode = '22023', message = 'Añade al menos un producto al pedido.';
  end if;

  insert into public.customers (phone, name)
  values (v_normalized_phone, v_customer_name)
  on conflict (phone) do update
  set name = excluded.name, updated_at = now()
  returning id into v_customer_id;

  v_display_id := 'DP-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 6));

  insert into public.orders
    (id, display_id, customer_id, customer_name, phone, delivery_method, address,
     payment_method, notes, total_cup)
  values
    (v_order_id, v_display_id, v_customer_id, v_customer_name, v_phone, v_delivery_method,
     v_address, v_payment_method, v_notes, 0);

  for v_item in
    select value
    from jsonb_array_elements(v_items)
    order by value ->> 'productId'
  loop
    v_product_id := btrim(coalesce(v_item ->> 'productId', ''));

    if v_product_id = '' or jsonb_typeof(v_item -> 'quantity') <> 'number' then
      raise exception using errcode = '22023', message = 'Revisa los productos del pedido.';
    end if;

    v_quantity := (v_item ->> 'quantity')::numeric;

    if v_quantity <= 0 or v_product_id = any(v_seen) then
      raise exception using errcode = '22023', message = 'Revisa las cantidades del pedido.';
    end if;
    v_seen := array_append(v_seen, v_product_id);

    select * into v_product
    from public.products
    where id = v_product_id
    for update;

    if not found or not v_product.active then
      raise exception using errcode = 'P0001', message = 'Uno de los productos ya no está disponible.';
    end if;

    if v_quantity > v_product.stock then
      raise exception using errcode = 'P0001',
        message = format('Solo quedan %s de %s.', v_product.stock, v_product.name);
    end if;

    if abs((v_quantity / v_product.minimum_step) - round(v_quantity / v_product.minimum_step)) > 0.0001 then
      raise exception using errcode = '22023', message = format('Revisa la cantidad de %s.', v_product.name);
    end if;

    v_subtotal := round(v_product.price_cup * v_quantity)::integer;
    v_total := v_total + v_subtotal;

    insert into public.order_items
      (order_id, product_id, product_name, quantity, unit, price_each_cup, subtotal_cup)
    values
      (v_order_id, v_product.id, v_product.name, v_quantity, v_product.unit,
       v_product.price_cup, v_subtotal);

    update public.products
    set stock = stock - v_quantity, updated_at = now()
    where id = v_product.id;
  end loop;

  update public.orders
  set total_cup = v_total, updated_at = now()
  where id = v_order_id;

  select * into v_settings from public.settings where id = 'main';

  return jsonb_build_object(
    'order', jsonb_build_object(
      'id', v_order_id,
      'displayId', v_display_id,
      'totalCup', v_total
    ),
    'settings', jsonb_build_object(
      'whatsappPhone', coalesce(v_settings.whatsapp_phone, ''),
      'pickupAddress', coalesce(v_settings.pickup_address, ''),
      'paymentCopy', coalesce(v_settings.payment_copy, '')
    )
  );
end;
$$;

create or replace function public.admin_set_customer_status(
  p_token text,
  p_customer_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_admin_session(p_token) then
    raise exception using errcode = '42501', message = 'La sesión administrativa venció.';
  end if;

  if p_status not in ('pendiente', 'aceptado', 'rechazado') then
    raise exception using errcode = '22023', message = 'Estado de cliente inválido.';
  end if;

  update public.customers
  set status = p_status, updated_at = now()
  where id = p_customer_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Cliente no encontrado.';
  end if;
end;
$$;

create or replace function public.admin_customer_detail(p_token text, p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_admin_session(p_token) then
    raise exception using errcode = '42501', message = 'La sesión administrativa venció.';
  end if;

  return jsonb_build_object(
    'topProducts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'productName', t.product_name,
          'quantity', t.quantity,
          'totalCup', t.total_cup
        ) order by t.quantity desc
      )
      from (
        select i.product_name,
               sum(i.quantity) as quantity,
               sum(i.subtotal_cup) as total_cup
        from public.order_items i
        join public.orders o on o.id = i.order_id
        where o.customer_id = p_customer_id and o.status <> 'cancelado'
        group by i.product_name
        order by sum(i.quantity) desc
        limit 8
      ) t
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'displayId', r.display_id,
          'totalCup', r.total_cup,
          'status', r.status,
          'createdAt', r.created_at
        ) order by r.created_at desc
      )
      from (
        select * from public.orders
        where customer_id = p_customer_id
        order by created_at desc
        limit 20
      ) r
    ), '[]'::jsonb)
  );
end;
$$;

-- admin_dashboard: mismo contenido, mas el bloque de cartera con los agregados
-- de venta por cliente (los cancelados no cuentan como venta).
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
    'customers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'phone', c.phone,
          'status', c.status,
          'createdAt', c.created_at,
          'orderCount', coalesce(stats.order_count, 0),
          'totalSpentCup', coalesce(stats.total_spent, 0),
          'lastOrderAt', stats.last_order_at
        ) order by (c.status = 'pendiente') desc, stats.last_order_at desc nulls last, c.name
      )
      from public.customers c
      left join lateral (
        select count(*) as order_count,
               sum(o.total_cup) as total_spent,
               max(o.created_at) as last_order_at
        from public.orders o
        where o.customer_id = c.id and o.status <> 'cancelado'
      ) stats on true
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'displayId', o.display_id,
          'customerId', o.customer_id,
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

revoke all on function public.admin_set_customer_status(text, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_customer_detail(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_set_customer_status(text, uuid, text) to anon, authenticated;
grant execute on function public.admin_customer_detail(text, uuid) to anon, authenticated;

select 'cartera de clientes lista: tabla customers, backfill y funciones de admin';
