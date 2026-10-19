-- Rollback for 20261019170000_gestao_cadastros_request_comments.sql
-- Removes the comment RPC. Aborts if comments already exist: request history
-- is permanent. The enum value 'comment_added' is kept (PostgreSQL cannot drop
-- enum values; an unused value is harmless).

begin;

do $$
begin
  if exists (select 1 from public.gestao_cadastros_request_events where event_type::text = 'comment_added') then
    raise exception 'Comments already exist: keep the migration (history is permanent).';
  end if;
end;
$$;

drop function public.gestao_cadastros_add_comment(uuid, text);

commit;
