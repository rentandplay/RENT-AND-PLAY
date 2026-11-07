-- Run after supabase-schema.sql. Re-runnable; no existing data is removed.
BEGIN;
SELECT public.app_ensure_table('chat_threads');
SELECT public.app_ensure_table('chat_messages');
SELECT public.app_ensure_table('chat_operations');
SELECT public.app_ensure_table('chat_limits');
CREATE INDEX IF NOT EXISTS chat_threads_customer_sort ON public.chat_threads ((data->>'customer_id'), (data->>'sort_key') DESC);
CREATE INDEX IF NOT EXISTS chat_threads_sort ON public.chat_threads ((data->>'sort_key') DESC);
CREATE INDEX IF NOT EXISTS chat_threads_status_sort ON public.chat_threads ((data->>'status'), (data->>'sort_key') DESC);
CREATE INDEX IF NOT EXISTS chat_messages_thread_seq ON public.chat_messages ((data->>'thread_id'), ((data->'seq')));

-- Firebase identity is validated by the backend. These RPCs are backend-only;
-- no client key or anonymous/authenticated role may read private conversations.
CREATE OR REPLACE FUNCTION public.app_chat_list_docs(p_collection TEXT, p_filters JSONB DEFAULT '[]', p_order JSONB DEFAULT NULL, p_limit INT DEFAULT 51)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  clause JSONB; field TEXT; op TEXT; conditions TEXT := ''; ordering TEXT := 'id'; result JSONB;
BEGIN
  IF p_collection NOT IN ('chat_threads', 'chat_messages') THEN RAISE EXCEPTION 'Invalid chat collection'; END IF;
  IF jsonb_typeof(p_filters) <> 'array' OR jsonb_array_length(p_filters) > 5 THEN RAISE EXCEPTION 'Invalid chat filters'; END IF;
  FOR clause IN SELECT * FROM jsonb_array_elements(p_filters) LOOP
    field := clause->>0; op := clause->>1;
    IF field NOT IN ('customer_id', 'thread_id', 'status', 'sort_key', 'seq') OR op NOT IN ('==', '<', '>') THEN RAISE EXCEPTION 'Invalid chat filter'; END IF;
    IF field = 'seq' THEN
      conditions := conditions || format(' AND data->%L %s %L::jsonb', field, CASE WHEN op = '==' THEN '=' ELSE op END, (clause->2)::text);
    ELSE
      conditions := conditions || format(' AND data->>%L %s %L', field, CASE WHEN op = '==' THEN '=' ELSE op END, clause->>2);
    END IF;
  END LOOP;
  IF p_order IS NOT NULL AND p_order <> 'null'::jsonb THEN
    field := p_order->>'field'; op := p_order->>'direction';
    IF field NOT IN ('sort_key', 'seq') OR op NOT IN ('asc', 'desc') THEN RAISE EXCEPTION 'Invalid chat order'; END IF;
    ordering := CASE WHEN field = 'sort_key' THEN format('data->>%L', field) ELSE format('data->%L', field) END || ' ' || op || ', id';
  END IF;
  EXECUTE format('SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (SELECT id, data, tx_version AS version FROM public.%I WHERE true %s ORDER BY %s LIMIT $1) t', p_collection, conditions, ordering)
    INTO result USING greatest(1, least(coalesce(p_limit, 51), 101));
  RETURN result;
END;
$$;
REVOKE ALL ON public.chat_threads, public.chat_messages, public.chat_operations, public.chat_limits FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.app_chat_list_docs(TEXT, JSONB, JSONB, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_chat_list_docs(TEXT, JSONB, JSONB, INT) TO service_role, postgres;
NOTIFY pgrst, 'reload schema';
COMMIT;
