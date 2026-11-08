-- =============================================================================
-- RENT & PLAY — SUPABASE POSTGRESQL SCHEMA & TRANSACTION ENGINE
-- =============================================================================
-- Instructions:
-- 1. Open your Supabase Dashboard -> SQL Editor -> New Query
-- 2. Paste this entire file and click "Run"
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. HELPER: ENSURE COLLECTION TABLE EXISTS WITH RLS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_ensure_table(p_collection TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_collection !~ '^[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid collection name: %', p_collection;
  END IF;

  IF to_regclass('public.' || quote_ident(p_collection)) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I (
         id TEXT PRIMARY KEY,
         data JSONB NOT NULL DEFAULT ''{}''::jsonb,
         tx_version BIGINT NOT NULL DEFAULT 1,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )',
      p_collection
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_collection);
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. CREATE ALL 38 ORGANIZED SYSTEM TABLES
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_table TEXT;
  v_tables TEXT[] := ARRAY[
    -- Accounts, Auth & Directory
    'users',
    'customers',
    'customer_identity_keys',
    'email_registration_otps',
    'password_reset_otps',

    -- Equipment & Inventory
    'items',
    'item_categories',
    'item_rates',
    'item_codes',
    'item_status_history',
    'item_condition_records',
    'item_condition_photos',
    'stock_groups',

    -- Rentals, Verification & Hardware Terminals
    'rentals',
    'rental_payment_proofs',
    'rental_extension_operations',
    'voided_rentals',
    'verification_requests',
    'terminals',

    -- Maintenance
    'maintenance_records',
    'maintenance_photos',

    -- Finance, Payments & Analytics Summaries
    'payment_ledger',
    'financial_daily',
    'rental_financial_daily',
    'rental_payment_totals',
    'rental_daily',
    'equipment_rental_totals',
    'equipment_rental_daily',
    'rental_report_snapshots',
    'customer_report_summaries',
    'report_jobs',
    'report_summary_state',

    -- Notifications & Live Updates
    'notification_devices',
    'notification_inboxes',
    'notification_inboxes_messages',
    'notification_outbox',

    -- System Settings, Counters & Audit Trail
    'counters',
    'audit_logs',
    'settings'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    PERFORM public.app_ensure_table(v_table);
  END LOOP;
END;
$$;

-- Create GIN indexes on high-traffic tables for fast JSONB lookups
CREATE INDEX IF NOT EXISTS idx_rentals_data_gin ON public.rentals USING gin (data);
CREATE INDEX IF NOT EXISTS idx_items_data_gin ON public.items USING gin (data);
CREATE INDEX IF NOT EXISTS idx_customers_data_gin ON public.customers USING gin (data);
CREATE INDEX IF NOT EXISTS idx_users_data_gin ON public.users USING gin (data);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_data_gin ON public.payment_ledger USING gin (data);
CREATE INDEX IF NOT EXISTS idx_notification_inboxes_data_gin ON public.notification_inboxes USING gin (data);
CREATE INDEX IF NOT EXISTS idx_notification_inboxes_messages_data_gin ON public.notification_inboxes_messages USING gin (data);
CREATE INDEX IF NOT EXISTS idx_audit_logs_data_gin ON public.audit_logs USING gin (data);

-- -----------------------------------------------------------------------------
-- 3. RPC: READ A SINGLE DOCUMENT
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_get_doc(p_collection TEXT, p_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  PERFORM public.app_ensure_table(p_collection);

  v_row := NULL;
  EXECUTE format(
    'SELECT id, data, tx_version FROM public.%I WHERE id = $1',
    p_collection
  ) INTO v_row USING p_id;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object(
      'id', p_id,
      'exists', false,
      'data', NULL,
      'version', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'exists', true,
    'data', v_row.data,
    'version', v_row.tx_version
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. RPC: LIST ALL DOCUMENTS IN A COLLECTION
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_list_docs(p_collection TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM public.app_ensure_table(p_collection);

  EXECUTE format(
    'SELECT COALESCE(
       jsonb_agg(
         jsonb_build_object(
           ''id'', id,
           ''data'', data,
           ''version'', tx_version
         ) ORDER BY id ASC
       ),
       ''[]''::jsonb
     ) FROM public.%I',
    p_collection
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC: ATOMIC BATCH & TRANSACTION COMMIT WITH OPTIMISTIC CONCURRENCY
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_commit_writes(
  p_writes JSONB,
  p_preconditions JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cond JSONB;
  v_op JSONB;
  v_collection TEXT;
  v_id TEXT;
  v_type TEXT;
  v_data JSONB;
  v_merge BOOLEAN;
  v_exists BOOLEAN;
  v_current_version BIGINT;
  v_expected_exists BOOLEAN;
  v_expected_version BIGINT;
BEGIN
  -- Serialize write transactions across connections to prevent race conditions
  PERFORM pg_advisory_xact_lock(72819402);

  -- 1. Verify transaction read preconditions (if any)
  IF p_preconditions IS NOT NULL AND jsonb_typeof(p_preconditions) = 'array' THEN
    FOR v_cond IN SELECT * FROM jsonb_array_elements(p_preconditions) LOOP
      v_collection := v_cond->>'collection';
      v_id := v_cond->>'id';
      v_expected_exists := (v_cond->>'exists')::boolean;
      v_expected_version := COALESCE((v_cond->>'version')::bigint, 0);

      PERFORM public.app_ensure_table(v_collection);

      v_current_version := NULL;
      EXECUTE format(
        'SELECT tx_version FROM public.%I WHERE id = $1',
        v_collection
      ) INTO v_current_version USING v_id;

      IF v_current_version IS NULL THEN
        IF v_expected_exists THEN
          RAISE EXCEPTION 'TRANSACTION_CONFLICT: %/% was deleted concurrently', v_collection, v_id;
        END IF;
      ELSE
        IF NOT v_expected_exists OR v_current_version <> v_expected_version THEN
          RAISE EXCEPTION 'TRANSACTION_CONFLICT: %/% was modified concurrently', v_collection, v_id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 2. Execute staged writes sequentially inside this atomic transaction
  IF p_writes IS NOT NULL AND jsonb_typeof(p_writes) = 'array' THEN
    FOR v_op IN SELECT * FROM jsonb_array_elements(p_writes) LOOP
      v_type := v_op->>'type';
      v_collection := v_op->>'collection';
      v_id := v_op->>'id';
      v_data := COALESCE(v_op->'data', '{}'::jsonb);
      v_merge := COALESCE((v_op->>'merge')::boolean, false);

      PERFORM public.app_ensure_table(v_collection);

      IF v_type = 'delete' THEN
        EXECUTE format('DELETE FROM public.%I WHERE id = $1', v_collection) USING v_id;

      ELSIF v_type = 'create' THEN
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id = $1)', v_collection)
          INTO v_exists USING v_id;
        IF v_exists THEN
          RAISE EXCEPTION 'Document exists: %/%', v_collection, v_id;
        END IF;
        EXECUTE format(
          'INSERT INTO public.%I (id, data, tx_version, created_at, updated_at)
           VALUES ($1, $2, 1, NOW(), NOW())',
          v_collection
        ) USING v_id, v_data;

      ELSIF v_type = 'update' THEN
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id = $1)', v_collection)
          INTO v_exists USING v_id;
        IF NOT v_exists THEN
          RAISE EXCEPTION 'Missing document: %/%', v_collection, v_id;
        END IF;
        EXECUTE format(
          'UPDATE public.%I
           SET data = data || $2,
               tx_version = tx_version + 1,
               updated_at = NOW()
           WHERE id = $1',
          v_collection
        ) USING v_id, v_data;

      ELSIF v_type = 'set' THEN
        IF v_merge THEN
          EXECUTE format(
            'INSERT INTO public.%I (id, data, tx_version, created_at, updated_at)
             VALUES ($1, $2, 1, NOW(), NOW())
             ON CONFLICT (id) DO UPDATE
               SET data = public.%I.data || EXCLUDED.data,
                   tx_version = public.%I.tx_version + 1,
                   updated_at = NOW()',
            v_collection, v_collection, v_collection
          ) USING v_id, v_data;
        ELSE
          EXECUTE format(
            'INSERT INTO public.%I (id, data, tx_version, created_at, updated_at)
             VALUES ($1, $2, 1, NOW(), NOW())
             ON CONFLICT (id) DO UPDATE
               SET data = EXCLUDED.data,
                   tx_version = public.%I.tx_version + 1,
                   updated_at = NOW()',
            v_collection, v_collection
          ) USING v_id, v_data;
        END IF;

      ELSE
        RAISE EXCEPTION 'Unknown write operation type: %', v_type;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'committed', COALESCE(jsonb_array_length(p_writes), 0));
END;
$$;

-- Restrict RPC functions so only service_role (backend) can execute them
REVOKE ALL ON FUNCTION public.app_ensure_table(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_get_doc(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_list_docs(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_commit_writes(JSONB, JSONB) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.app_ensure_table(TEXT) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.app_get_doc(TEXT, TEXT) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.app_list_docs(TEXT) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.app_commit_writes(JSONB, JSONB) TO service_role, postgres;

-- Notify PostgREST to reload schema cache immediately
NOTIFY pgrst, 'reload schema';

COMMIT;
