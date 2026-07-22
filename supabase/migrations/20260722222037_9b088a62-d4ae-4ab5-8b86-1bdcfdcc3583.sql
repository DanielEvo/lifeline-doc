
revoke execute on function public.has_active_subscription(uuid, text) from public;
revoke execute on function public.has_active_subscription(uuid, text) from authenticated;
grant execute on function public.has_active_subscription(uuid, text) to service_role;
