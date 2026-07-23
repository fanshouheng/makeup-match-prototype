alter table public.product_events
  add column failure_reason text;

alter table public.product_events
  add constraint product_events_failure_reason_check check (
    (
      event_name = 'analysis_failed'
      and (
        failure_reason is null
        or failure_reason in (
          'no_face',
          'multiple_faces',
          'too_dark',
          'pose_issue',
          'component_error'
        )
      )
    )
    or (event_name <> 'analysis_failed' and failure_reason is null)
  );

comment on column public.product_events.failure_reason is
  'Optional allowlisted reason for analysis_failed. Contains no photo, face, match, creator, device, or error details.';
