-- Transactional, idempotent shop-state commits for multi-device POS operation.
-- The existing application state remains JSON during the launch migration, but
-- every write is now compare-and-swap protected and can be retried safely.

alter table public.shop_cloud_snapshots
  add column if not exists revision bigint not null default 0;

create table if not exists public.shop_state_mutations (
  shop_id uuid not null references public.shops(id) on delete cascade,
  operation_id text not null,
  revision bigint not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (shop_id, operation_id)
);

create index if not exists shop_state_mutations_created_at_idx
  on public.shop_state_mutations (shop_id, created_at desc);

alter table public.shop_state_mutations enable row level security;

revoke all on table public.shop_state_mutations from anon, authenticated;

create or replace function public.commit_shop_cloud_snapshot(
  p_shop_id uuid,
  p_expected_revision bigint,
  p_operation_id text,
  p_state jsonb,
  p_result jsonb default '{}'::jsonb,
  p_updated_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot public.shop_cloud_snapshots%rowtype;
  v_existing public.shop_state_mutations%rowtype;
  v_next_revision bigint;
begin
  if p_operation_id is null or btrim(p_operation_id) = '' then
    raise exception 'Operation id is required.' using errcode = '22023';
  end if;

  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'Shop state must be a JSON object.' using errcode = '22023';
  end if;

  select *
    into v_existing
    from public.shop_state_mutations
   where shop_id = p_shop_id
     and operation_id = p_operation_id;

  if found then
    select *
      into v_snapshot
      from public.shop_cloud_snapshots
     where shop_id = p_shop_id;

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'revision', v_existing.revision,
      'result', v_existing.result,
      'state', coalesce(v_snapshot.state, '{}'::jsonb)
    );
  end if;

  insert into public.shop_cloud_snapshots (shop_id, state, revision, updated_by, updated_at)
  values (p_shop_id, '{}'::jsonb, 0, p_updated_by, now())
  on conflict (shop_id) do nothing;

  select *
    into v_snapshot
    from public.shop_cloud_snapshots
   where shop_id = p_shop_id
   for update;

  if v_snapshot.revision <> greatest(0, coalesce(p_expected_revision, 0)) then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'revision', v_snapshot.revision,
      'state', v_snapshot.state
    );
  end if;

  v_next_revision := v_snapshot.revision + 1;

  update public.shop_cloud_snapshots
     set state = p_state,
         revision = v_next_revision,
         updated_by = p_updated_by,
         updated_at = now()
   where shop_id = p_shop_id;

  insert into public.shop_state_mutations (shop_id, operation_id, revision, result)
  values (p_shop_id, p_operation_id, v_next_revision, coalesce(p_result, '{}'::jsonb));

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'revision', v_next_revision,
    'result', coalesce(p_result, '{}'::jsonb),
    'state', p_state
  );
end;
$$;

revoke all on function public.commit_shop_cloud_snapshot(uuid, bigint, text, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.commit_shop_cloud_snapshot(uuid, bigint, text, jsonb, jsonb, uuid)
  to service_role;

create or replace function public.prune_shop_state_mutations(
  p_shop_id uuid,
  p_before timestamptz default now() - interval '30 days'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.shop_state_mutations
   where shop_id = p_shop_id
     and created_at < p_before;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.prune_shop_state_mutations(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.prune_shop_state_mutations(uuid, timestamptz)
  to service_role;
