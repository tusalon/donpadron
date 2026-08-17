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

select 'parte 1 lista: admin_dashboard con description y accent';
