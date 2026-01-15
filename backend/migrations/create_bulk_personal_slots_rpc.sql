-- RPC: create_bulk_personal_slots(payload jsonb)
-- Retorna { created: [{id,start_time,end_time}], failed: [{slot,error}] }
-- Observações:
-- - Assume start_time/end_time em timestamptz
-- - Considera blocked_days(date) como bloqueio total do dia
-- - Overlap via tstzrange && tstzrange
-- - Ignora slots "vagos": event_type IS NULL e (status IS NULL OR upper(status)='VAGO')

create or replace function public.create_bulk_personal_slots(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  result jsonb;
begin
  with input as (
    select
      s as slot_json,
      ord::int as ord,
      (s->>'date')::date as slot_date,
      (s->>'time')::time as slot_time,
      nullif(s->>'activity','')::text as activity,
      (s->>'duration')::text as duration
    from jsonb_array_elements(payload->'slots') with ordinality as t(s, ord)
  ),
  prepared as (
    select
      i.*,
      case
        when duration in ('2h','120m') then 120
        when duration in ('1h30','90m') then 90
        when duration in ('1h','60m') then 60
        else 30
      end as duration_minutes,
      ((i.slot_date::text || 'T' || i.slot_time::text || '-03:00')::timestamptz) as start_time,
      ((i.slot_date::text || 'T' || i.slot_time::text || '-03:00')::timestamptz)
        + (case
            when duration in ('2h','120m') then interval '120 minutes'
            when duration in ('1h30','90m') then interval '90 minutes'
            when duration in ('1h','60m') then interval '60 minutes'
            else interval '30 minutes'
          end) as end_time
    from input i
  ),
  blocked as (
    select p.ord
    from prepared p
    join blocked_days bd on bd.date = p.slot_date
  ),
  conflicts_existing as (
    select distinct p.ord
    from prepared p
    join time_slots ts
      on ts.start_time is not null
     and ts.end_time is not null
     and tstzrange(ts.start_time, ts.end_time, '[)') && tstzrange(p.start_time, p.end_time, '[)')
     and not (ts.event_type is null and (ts.status is null or upper(ts.status) = 'VAGO'))
  ),
  conflicts_batch as (
    -- se dois itens do lote sobrepõem, falha o de maior ord (mantém o primeiro)
    select distinct b.ord
    from prepared a
    join prepared b
      on a.ord < b.ord
     and tstzrange(a.start_time, a.end_time, '[)') && tstzrange(b.start_time, b.end_time, '[)')
  ),
  to_insert as (
    select p.*
    from prepared p
    where p.ord not in (select ord from blocked)
      and p.ord not in (select ord from conflicts_existing)
      and p.ord not in (select ord from conflicts_batch)
  ),
  inserted as (
    insert into time_slots (
      event_type,
      status,
      personal_activity,
      start_time,
      end_time,
      price_category,
      price,
      patient_id,
      contract_id,
      sibling_order,
      is_paid,
      flow_status,
      reminder_one_hour,
      reminder_twenty_four_hours,
      is_inaugural
    )
    select
      'personal',
      'PENDENTE',
      coalesce(ti.activity, 'Atividade Pessoal'),
      ti.start_time,
      ti.end_time,
      null,
      null,
      null,
      null,
      0,
      false,
      null,
      false,
      false,
      false
    from to_insert ti
    returning id, start_time, end_time
  ),
  created_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', ins.id,
          'start_time', ins.start_time,
          'end_time', ins.end_time
        )
      ),
      '[]'::jsonb
    ) as v
    from inserted ins
  ),
  failed_rows as (
    select p.slot_json as slot_json,
      case
        when p.ord in (select ord from blocked) then 'Este dia está bloqueado. Não é possível criar novos agendamentos.'
        when p.ord in (select ord from conflicts_batch) then 'Conflito: este slot se sobrepõe com outro slot do mesmo lote.'
        when p.ord in (select ord from conflicts_existing) then 'Conflito: horário já está ocupado.'
        else 'Erro desconhecido'
      end as error
    from prepared p
    where p.ord in (select ord from blocked)
       or p.ord in (select ord from conflicts_existing)
       or p.ord in (select ord from conflicts_batch)
  ),
  failed_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'slot', fr.slot_json,
          'error', fr.error
        )
      ),
      '[]'::jsonb
    ) as v
    from failed_rows fr
  )
  select jsonb_build_object(
    'created', (select v from created_json),
    'failed', (select v from failed_json)
  )
  into result;

  return result;
end;
$$;

