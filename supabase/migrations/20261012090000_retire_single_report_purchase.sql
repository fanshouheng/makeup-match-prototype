-- Keep historical orders and fulfillment intact; stop selling the single report.
update public.point_packages
set is_active = false, updated_at = now()
where code = 'report_single' and is_active = true;
