create table if not exists public.songs (
  video_id text primary key,
  title text not null,
  artist text not null default '',
  cover text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.plays (
  id bigint generated always as identity primary key,
  video_id text not null references public.songs (video_id) on delete cascade,
  cid text not null,
  country text not null default '',
  day date not null default ((now() at time zone 'utc')::date),
  created_at timestamptz not null default now(),
  unique (cid, video_id, day)
);

create index if not exists plays_day_idx on public.plays (day, video_id);
create index if not exists plays_country_day_idx on public.plays (country, day, video_id);
create index if not exists plays_cid_created_idx on public.plays (cid, created_at);

alter table public.songs enable row level security;
alter table public.plays enable row level security;

create or replace function public.register_play(
  p_id text, p_cid text, p_title text, p_artist text, p_cover text, p_country text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
  added int;
begin
  select count(*) into recent from plays where cid = p_cid and created_at > now() - interval '1 minute';
  if recent >= 30 then
    return 'rate';
  end if;

  insert into songs (video_id, title, artist, cover)
  values (p_id, p_title, p_artist, p_cover)
  on conflict (video_id) do update set updated_at = now();

  insert into plays (video_id, cid, country)
  values (p_id, p_cid, coalesce(p_country, ''))
  on conflict (cid, video_id, day) do nothing;
  get diagnostics added = row_count;

  if random() < 0.01 then
    delete from plays where day < ((now() at time zone 'utc')::date - 120);
  end if;

  return case when added > 0 then 'counted' else 'dup' end;
end;
$$;

create or replace function public.get_top(
  p_period text, p_country text default null, p_limit int default 20
) returns table (r_id text, r_title text, r_artist text, r_cover text, r_total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.video_id, s.title, s.artist, s.cover, count(*)::bigint
  from plays p
  join songs s on s.video_id = p.video_id
  where p.day >= case p_period
      when 'day' then (now() at time zone 'utc')::date
      when 'week' then date_trunc('week', now() at time zone 'utc')::date
      when 'month' then date_trunc('month', now() at time zone 'utc')::date
    end
    and (p_country is null or p.country = p_country)
  group by s.video_id, s.title, s.artist, s.cover
  order by count(*) desc, max(p.created_at) desc
  limit least(greatest(p_limit, 1), 50);
$$;

revoke all on function public.register_play(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.get_top(text, text, int) from public, anon, authenticated;
grant execute on function public.register_play(text, text, text, text, text, text) to service_role;
grant execute on function public.get_top(text, text, int) to service_role;
