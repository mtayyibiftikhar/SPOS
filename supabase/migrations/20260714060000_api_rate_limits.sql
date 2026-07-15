create table if not exists public.api_rate_limits (
  scope text not null,
  identifier_hash text not null check (char_length(identifier_hash) = 64),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, identifier_hash)
);

create index if not exists api_rate_limits_updated_at_idx
  on public.api_rate_limits(updated_at);

alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from anon, authenticated;
grant select, insert, update, delete on table public.api_rate_limits to service_role;

create or replace function public.consume_api_rate_limit(
  p_scope text,
  p_identifier_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.api_rate_limits%rowtype;
  v_retry_after integer := 0;
begin
  if coalesce(trim(p_scope), '') = '' or char_length(p_identifier_hash) <> 64 then
    raise exception 'Invalid rate-limit identity';
  end if;

  p_limit := greatest(1, p_limit);
  p_window_seconds := greatest(1, p_window_seconds);
  p_block_seconds := greatest(1, p_block_seconds);

  insert into public.api_rate_limits(scope, identifier_hash, attempt_count, window_started_at, updated_at)
  values (p_scope, p_identifier_hash, 0, v_now, v_now)
  on conflict (scope, identifier_hash) do nothing;

  select *
    into v_row
    from public.api_rate_limits
   where scope = p_scope and identifier_hash = p_identifier_hash
   for update;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    v_retry_after := greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer);
    return jsonb_build_object('allowed', false, 'remaining', 0, 'retry_after_seconds', v_retry_after);
  end if;

  if v_row.window_started_at + make_interval(secs => p_window_seconds) <= v_now then
    update public.api_rate_limits
       set attempt_count = 1,
           blocked_until = null,
           updated_at = v_now,
           window_started_at = v_now
     where scope = p_scope and identifier_hash = p_identifier_hash;

    return jsonb_build_object('allowed', true, 'remaining', p_limit - 1, 'retry_after_seconds', 0);
  end if;

  if v_row.attempt_count + 1 > p_limit then
    update public.api_rate_limits
       set blocked_until = v_now + make_interval(secs => p_block_seconds),
           updated_at = v_now
     where scope = p_scope and identifier_hash = p_identifier_hash;

    return jsonb_build_object('allowed', false, 'remaining', 0, 'retry_after_seconds', p_block_seconds);
  end if;

  update public.api_rate_limits
     set attempt_count = attempt_count + 1,
         blocked_until = null,
         updated_at = v_now
   where scope = p_scope and identifier_hash = p_identifier_hash;

  if random() < 0.01 then
    delete from public.api_rate_limits where updated_at < v_now - interval '7 days';
  end if;

  return jsonb_build_object(
    'allowed', true,
    'remaining', greatest(0, p_limit - (v_row.attempt_count + 1)),
    'retry_after_seconds', 0
  );
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer, integer) to service_role;
