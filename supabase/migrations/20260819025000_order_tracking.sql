-- Seguimiento publico del pedido. La seguridad es el uuid v4 del pedido: no es
-- adivinable y no aparece en ningun listado publico, asi que solo lo tiene quien
-- recibio el enlace.
create or replace function public.get_order_status(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_settings public.settings%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Pedido no encontrado.';
  end if;

  select * into v_settings from public.settings where id = 'main';

  return jsonb_build_object(
    'displayId', v_order.display_id,
    'customerName', v_order.customer_name,
    'status', v_order.status,
    'totalCup', v_order.total_cup,
    'deliveryMethod', v_order.delivery_method,
    'address', v_order.address,
    'paymentMethod', v_order.payment_method,
    'createdAt', v_order.created_at,
    'updatedAt', v_order.updated_at,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'productName', i.product_name,
          'quantity', i.quantity,
          'unit', i.unit,
          'subtotalCup', i.subtotal_cup
        ) order by i.id
      )
      from public.order_items i
      where i.order_id = v_order.id
    ), '[]'::jsonb),
    'business', jsonb_build_object(
      'name', coalesce(v_settings.business_name, 'Don Padrón'),
      'whatsappPhone', coalesce(v_settings.whatsapp_phone, ''),
      'pickupAddress', coalesce(v_settings.pickup_address, '')
    )
  );
end;
$$;

revoke all on function public.get_order_status(uuid) from public, anon, authenticated;
grant execute on function public.get_order_status(uuid) to anon, authenticated;

select 'seguimiento de pedido listo: get_order_status';
