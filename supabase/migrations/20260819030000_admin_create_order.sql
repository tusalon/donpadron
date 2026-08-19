-- El descuento atomico de existencias vivia dentro de place_order. Ahora vive
-- aqui y lo llaman los dos caminos (tienda y panel), para no duplicar la logica
-- de stock en dos sitios que se puedan desincronizar.
create or replace function private.create_order(p_payload jsonb, p_status text)
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

  if p_status not in ('pendiente', 'confirmado', 'pagado', 'listo', 'completado') then
    raise exception using errcode = '22023', message = 'Estado de pedido inválido.';
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
     payment_method, notes, total_cup, status)
  values
    (v_order_id, v_display_id, v_customer_id, v_customer_name, v_phone, v_delivery_method,
     v_address, v_payment_method, v_notes, 0, p_status);

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

    if not found then
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

revoke all on function private.create_order(jsonb, text) from public, anon, authenticated;

-- La tienda solo puede crear pedidos pendientes y de productos visibles.
create or replace function public.place_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'items', '[]'::jsonb))
  loop
    if not exists (
      select 1 from public.products
      where id = btrim(coalesce(v_item ->> 'productId', '')) and active
    ) then
      raise exception using errcode = 'P0001', message = 'Uno de los productos ya no está disponible.';
    end if;
  end loop;

  return private.create_order(p_payload, 'pendiente');
end;
$$;

-- El panel si puede vender productos ocultos (un encargo especial) y fijar el
-- estado inicial: lo que se cobra en el mostrador nace pagado, no pendiente.
create or replace function public.admin_create_order(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_admin_session(p_token) then
    raise exception using errcode = '42501', message = 'La sesión administrativa venció.';
  end if;

  return private.create_order(p_payload, coalesce(p_payload ->> 'status', 'confirmado'));
end;
$$;

revoke all on function public.admin_create_order(text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_create_order(text, jsonb) to anon, authenticated;

select 'alta de pedidos desde el panel lista: private.create_order y admin_create_order';
