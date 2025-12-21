-- KangarooPOS Transaction Functions
-- Migration: 00003_transaction_functions
-- Description: PostgreSQL RPC functions for ACID transactions

-- =============================================================================
-- GENERIC TRANSACTION EXECUTOR
-- =============================================================================
-- Executes a batch of operations in a single ACID transaction
-- Supports insert, update, and delete operations

CREATE OR REPLACE FUNCTION execute_transaction(
  p_operations JSONB,
  p_account_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation JSONB;
  v_op_type TEXT;
  v_table_name TEXT;
  v_record_id UUID;
  v_data JSONB;
  v_result JSONB;
  v_results JSONB := '[]'::JSONB;
  v_sql TEXT;
  v_columns TEXT;
  v_values TEXT;
  v_sets TEXT;
  v_key TEXT;
  v_value JSONB;
  v_allowed_tables TEXT[] := ARRAY[
    'orders', 'order_items', 'payments', 'refunds',
    'inventory', 'inventory_transactions',
    'customers', 'shifts'
  ];
BEGIN
  -- Validate operations array
  IF p_operations IS NULL OR jsonb_typeof(p_operations) != 'array' THEN
    RAISE EXCEPTION 'Operations must be a non-null array';
  END IF;

  -- Process each operation
  FOR v_operation IN SELECT * FROM jsonb_array_elements(p_operations)
  LOOP
    v_op_type := v_operation->>'type';
    v_table_name := v_operation->>'table';
    v_record_id := (v_operation->>'id')::UUID;
    v_data := v_operation->'data';

    -- Validate table name to prevent SQL injection
    IF NOT v_table_name = ANY(v_allowed_tables) THEN
      RAISE EXCEPTION 'Table % is not allowed for transactions', v_table_name;
    END IF;

    -- Ensure account_id is set for security
    IF v_data IS NOT NULL AND v_data->>'account_id' IS NOT NULL THEN
      IF (v_data->>'account_id')::UUID != p_account_id THEN
        RAISE EXCEPTION 'Account ID mismatch in operation data';
      END IF;
    END IF;

    CASE v_op_type
      WHEN 'insert' THEN
        -- Build insert statement dynamically
        v_columns := '';
        v_values := '';

        FOR v_key, v_value IN SELECT * FROM jsonb_each(v_data)
        LOOP
          IF v_columns != '' THEN
            v_columns := v_columns || ', ';
            v_values := v_values || ', ';
          END IF;
          v_columns := v_columns || quote_ident(v_key);
          v_values := v_values || quote_literal(v_value #>> '{}');
        END LOOP;

        -- Add account_id if not present
        IF v_data->>'account_id' IS NULL AND v_table_name NOT IN ('order_items') THEN
          IF v_columns != '' THEN
            v_columns := v_columns || ', ';
            v_values := v_values || ', ';
          END IF;
          v_columns := v_columns || 'account_id';
          v_values := v_values || quote_literal(p_account_id::TEXT);
        END IF;

        v_sql := format(
          'INSERT INTO %I (%s) VALUES (%s) RETURNING to_jsonb(%I.*)',
          v_table_name, v_columns, v_values, v_table_name
        );

        EXECUTE v_sql INTO v_result;
        v_results := v_results || jsonb_build_object('operation', 'insert', 'table', v_table_name, 'data', v_result);

      WHEN 'update' THEN
        IF v_record_id IS NULL THEN
          RAISE EXCEPTION 'Record ID is required for update operations';
        END IF;

        -- Build update statement
        v_sets := '';
        FOR v_key, v_value IN SELECT * FROM jsonb_each(v_data)
        LOOP
          IF v_key != 'id' AND v_key != 'account_id' THEN
            IF v_sets != '' THEN
              v_sets := v_sets || ', ';
            END IF;
            v_sets := v_sets || quote_ident(v_key) || ' = ' || quote_literal(v_value #>> '{}');
          END IF;
        END LOOP;

        -- Add updated_at if table has it
        IF v_table_name IN ('orders', 'payments', 'refunds', 'customers', 'shifts', 'inventory') THEN
          IF v_sets != '' THEN
            v_sets := v_sets || ', ';
          END IF;
          v_sets := v_sets || 'updated_at = NOW()';
        END IF;

        v_sql := format(
          'UPDATE %I SET %s WHERE id = %L AND account_id = %L RETURNING to_jsonb(%I.*)',
          v_table_name, v_sets, v_record_id, p_account_id, v_table_name
        );

        EXECUTE v_sql INTO v_result;

        IF v_result IS NULL THEN
          RAISE EXCEPTION 'Record not found or access denied: %.%', v_table_name, v_record_id;
        END IF;

        v_results := v_results || jsonb_build_object('operation', 'update', 'table', v_table_name, 'data', v_result);

      WHEN 'delete' THEN
        IF v_record_id IS NULL THEN
          RAISE EXCEPTION 'Record ID is required for delete operations';
        END IF;

        v_sql := format(
          'DELETE FROM %I WHERE id = %L AND account_id = %L RETURNING to_jsonb(%I.*)',
          v_table_name, v_record_id, p_account_id, v_table_name
        );

        EXECUTE v_sql INTO v_result;

        IF v_result IS NULL THEN
          RAISE EXCEPTION 'Record not found or access denied for delete: %.%', v_table_name, v_record_id;
        END IF;

        v_results := v_results || jsonb_build_object('operation', 'delete', 'table', v_table_name, 'id', v_record_id);

      ELSE
        RAISE EXCEPTION 'Unknown operation type: %', v_op_type;
    END CASE;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'results', v_results
  );

EXCEPTION WHEN OTHERS THEN
  -- Transaction is automatically rolled back
  RAISE;
END;
$$;

-- =============================================================================
-- COMPLETE ORDER WITH PAYMENT
-- =============================================================================
-- Atomically completes an order and records payment
-- Also updates inventory and customer stats

CREATE OR REPLACE FUNCTION complete_order_with_payment(
  p_order_id UUID,
  p_payment_data JSONB,
  p_account_id UUID,
  p_deduct_inventory BOOLEAN DEFAULT true
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_payment_id UUID;
  v_payment RECORD;
  v_item RECORD;
  v_inventory RECORD;
  v_new_quantity DECIMAL(10, 4);
  v_receipt_number TEXT;
BEGIN
  -- Fetch and lock the order
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id AND account_id = p_account_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF v_order.status NOT IN ('draft', 'pending', 'preparing', 'ready') THEN
    RAISE EXCEPTION 'Order cannot be completed. Current status: %', v_order.status;
  END IF;

  -- Validate payment amount
  IF (p_payment_data->>'amount_cents')::INTEGER < (v_order.total_cents - COALESCE((
    SELECT SUM(amount_cents) FROM payments
    WHERE order_id = p_order_id AND status = 'captured'
  ), 0)) THEN
    RAISE EXCEPTION 'Payment amount insufficient for remaining balance';
  END IF;

  -- Generate receipt number if not present
  v_receipt_number := v_order.receipt_number;
  IF v_receipt_number IS NULL THEN
    v_receipt_number := 'R-' || to_char(NOW(), 'YYYYMMDD') || '-' ||
                        lpad((nextval('receipt_seq')::TEXT), 6, '0');
  END IF;

  -- Create the payment
  v_payment_id := COALESCE((p_payment_data->>'id')::UUID, uuid_generate_v4());

  INSERT INTO payments (
    id,
    account_id,
    order_id,
    payment_type_id,
    amount_cents,
    tip_cents,
    currency,
    status,
    card_brand,
    card_last_four,
    reference,
    notes,
    processed_at
  ) VALUES (
    v_payment_id,
    p_account_id,
    p_order_id,
    (p_payment_data->>'payment_type_id')::UUID,
    (p_payment_data->>'amount_cents')::INTEGER,
    COALESCE((p_payment_data->>'tip_cents')::INTEGER, 0),
    COALESCE(p_payment_data->>'currency', 'USD'),
    'captured',
    p_payment_data->>'card_brand',
    p_payment_data->>'card_last_four',
    p_payment_data->>'reference',
    p_payment_data->>'notes',
    NOW()
  )
  RETURNING * INTO v_payment;

  -- Update order status and tip
  UPDATE orders SET
    status = 'completed',
    receipt_number = v_receipt_number,
    tip_cents = v_order.tip_cents + COALESCE((p_payment_data->>'tip_cents')::INTEGER, 0),
    total_cents = v_order.total_cents + COALESCE((p_payment_data->>'tip_cents')::INTEGER, 0),
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  -- Deduct inventory for each order item (if enabled)
  IF p_deduct_inventory THEN
    FOR v_item IN
      SELECT oi.*, p.track_stock
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = p_order_id AND p.track_stock = true
    LOOP
      -- Get inventory record for the store
      SELECT * INTO v_inventory
      FROM inventory
      WHERE product_id = v_item.product_id
        AND store_id = v_order.store_id
        AND (variant_id IS NOT DISTINCT FROM v_item.variant_id)
      FOR UPDATE;

      IF v_inventory IS NOT NULL THEN
        v_new_quantity := v_inventory.quantity - v_item.quantity;

        -- Update inventory
        UPDATE inventory SET
          quantity = v_new_quantity,
          updated_at = NOW()
        WHERE id = v_inventory.id;

        -- Record transaction
        INSERT INTO inventory_transactions (
          account_id,
          inventory_id,
          transaction_type,
          quantity_change,
          quantity_before,
          quantity_after,
          reference_type,
          reference_id,
          reason
        ) VALUES (
          p_account_id,
          v_inventory.id,
          'sale',
          -v_item.quantity,
          v_inventory.quantity,
          v_new_quantity,
          'order_item',
          v_item.id,
          'Order completed: ' || v_receipt_number
        );
      END IF;
    END LOOP;
  END IF;

  -- Update customer stats if customer is attached
  IF v_order.customer_id IS NOT NULL THEN
    UPDATE customers SET
      total_spent_cents = total_spent_cents + v_order.total_cents,
      visit_count = visit_count + 1,
      last_visit_at = NOW(),
      updated_at = NOW()
    WHERE id = v_order.customer_id;
  END IF;

  -- Update shift stats if shift is attached
  IF v_order.shift_id IS NOT NULL THEN
    UPDATE shifts SET
      total_sales_cents = total_sales_cents + v_order.total_cents,
      total_tips_cents = total_tips_cents + COALESCE((p_payment_data->>'tip_cents')::INTEGER, 0),
      transaction_count = transaction_count + 1,
      updated_at = NOW()
    WHERE id = v_order.shift_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'payment_id', v_payment_id,
    'receipt_number', v_receipt_number,
    'order_status', 'completed',
    'payment_status', 'captured'
  );

EXCEPTION WHEN OTHERS THEN
  -- Transaction is automatically rolled back
  RAISE;
END;
$$;

-- Create receipt sequence if it doesn't exist
DO $$
BEGIN
  CREATE SEQUENCE IF NOT EXISTS receipt_seq START 1;
EXCEPTION WHEN duplicate_table THEN
  NULL;
END $$;

-- =============================================================================
-- TRANSFER INVENTORY BETWEEN STORES
-- =============================================================================
-- Atomically transfers inventory from one store to another

CREATE OR REPLACE FUNCTION transfer_inventory(
  p_from_store_id UUID,
  p_to_store_id UUID,
  p_items JSONB,
  p_account_id UUID,
  p_employee_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_product_id UUID;
  v_variant_id UUID;
  v_quantity DECIMAL(10, 4);
  v_from_inventory RECORD;
  v_to_inventory RECORD;
  v_new_from_qty DECIMAL(10, 4);
  v_new_to_qty DECIMAL(10, 4);
  v_transfer_id UUID := uuid_generate_v4();
  v_transfers JSONB := '[]'::JSONB;
BEGIN
  -- Validate stores exist and belong to account
  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = p_from_store_id AND account_id = p_account_id) THEN
    RAISE EXCEPTION 'Source store not found or access denied: %', p_from_store_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = p_to_store_id AND account_id = p_account_id) THEN
    RAISE EXCEPTION 'Destination store not found or access denied: %', p_to_store_id;
  END IF;

  IF p_from_store_id = p_to_store_id THEN
    RAISE EXCEPTION 'Source and destination stores cannot be the same';
  END IF;

  -- Validate items array
  IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Items must be a non-empty array';
  END IF;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_quantity := (v_item->>'quantity')::DECIMAL(10, 4);

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantity must be positive for product: %', v_product_id;
    END IF;

    -- Lock and get source inventory
    SELECT * INTO v_from_inventory
    FROM inventory
    WHERE store_id = p_from_store_id
      AND product_id = v_product_id
      AND (variant_id IS NOT DISTINCT FROM v_variant_id)
    FOR UPDATE;

    IF v_from_inventory IS NULL THEN
      RAISE EXCEPTION 'Source inventory not found for product: %', v_product_id;
    END IF;

    IF v_from_inventory.quantity < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock in source store for product: %. Available: %, Requested: %',
        v_product_id, v_from_inventory.quantity, v_quantity;
    END IF;

    -- Get or create destination inventory
    SELECT * INTO v_to_inventory
    FROM inventory
    WHERE store_id = p_to_store_id
      AND product_id = v_product_id
      AND (variant_id IS NOT DISTINCT FROM v_variant_id)
    FOR UPDATE;

    v_new_from_qty := v_from_inventory.quantity - v_quantity;

    IF v_to_inventory IS NULL THEN
      -- Create new inventory record
      INSERT INTO inventory (
        account_id,
        store_id,
        product_id,
        variant_id,
        quantity,
        low_stock_threshold,
        reorder_point
      ) VALUES (
        p_account_id,
        p_to_store_id,
        v_product_id,
        v_variant_id,
        v_quantity,
        v_from_inventory.low_stock_threshold,
        v_from_inventory.reorder_point
      )
      RETURNING * INTO v_to_inventory;

      v_new_to_qty := v_quantity;
    ELSE
      v_new_to_qty := v_to_inventory.quantity + v_quantity;

      UPDATE inventory SET
        quantity = v_new_to_qty,
        updated_at = NOW()
      WHERE id = v_to_inventory.id;
    END IF;

    -- Update source inventory
    UPDATE inventory SET
      quantity = v_new_from_qty,
      updated_at = NOW()
    WHERE id = v_from_inventory.id;

    -- Record transfer_out transaction
    INSERT INTO inventory_transactions (
      account_id,
      inventory_id,
      transaction_type,
      quantity_change,
      quantity_before,
      quantity_after,
      reference_type,
      reference_id,
      employee_id,
      reason,
      notes
    ) VALUES (
      p_account_id,
      v_from_inventory.id,
      'transfer_out',
      -v_quantity,
      v_from_inventory.quantity,
      v_new_from_qty,
      'transfer',
      v_transfer_id,
      p_employee_id,
      'Transfer to store: ' || p_to_store_id::TEXT,
      p_notes
    );

    -- Record transfer_in transaction
    INSERT INTO inventory_transactions (
      account_id,
      inventory_id,
      transaction_type,
      quantity_change,
      quantity_before,
      quantity_after,
      reference_type,
      reference_id,
      employee_id,
      reason,
      notes
    ) VALUES (
      p_account_id,
      v_to_inventory.id,
      'transfer_in',
      v_quantity,
      COALESCE(v_to_inventory.quantity, 0),
      v_new_to_qty,
      'transfer',
      v_transfer_id,
      p_employee_id,
      'Transfer from store: ' || p_from_store_id::TEXT,
      p_notes
    );

    v_transfers := v_transfers || jsonb_build_object(
      'product_id', v_product_id,
      'variant_id', v_variant_id,
      'quantity', v_quantity,
      'from_quantity_before', v_from_inventory.quantity,
      'from_quantity_after', v_new_from_qty,
      'to_quantity_before', COALESCE(v_to_inventory.quantity, 0),
      'to_quantity_after', v_new_to_qty
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'transfer_id', v_transfer_id,
    'from_store_id', p_from_store_id,
    'to_store_id', p_to_store_id,
    'items_transferred', jsonb_array_length(p_items),
    'transfers', v_transfers
  );

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- =============================================================================
-- BATCH SYNC OPERATIONS
-- =============================================================================
-- Processes multiple sync entries atomically from edge nodes

CREATE OR REPLACE FUNCTION sync_batch_operations(
  p_entries JSONB,
  p_account_id UUID,
  p_edge_node_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry JSONB;
  v_results JSONB := '[]'::JSONB;
  v_operation TEXT;
  v_table_name TEXT;
  v_record_id UUID;
  v_data JSONB;
  v_result JSONB;
  v_synced_count INTEGER := 0;
  v_failed_count INTEGER := 0;
  v_conflict_count INTEGER := 0;
BEGIN
  -- Validate entries
  IF p_entries IS NULL OR jsonb_typeof(p_entries) != 'array' THEN
    RAISE EXCEPTION 'Entries must be a non-null array';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_operation := v_entry->>'operation';
    v_table_name := v_entry->>'table';
    v_record_id := (v_entry->>'recordId')::UUID;
    v_data := v_entry->'data';

    BEGIN
      CASE v_operation
        WHEN 'insert' THEN
          -- Check for conflict (record already exists)
          IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = v_table_name) THEN
            EXECUTE format('SELECT 1 FROM %I WHERE id = %L', v_table_name, v_record_id) INTO v_result;
            IF v_result IS NOT NULL THEN
              v_conflict_count := v_conflict_count + 1;
              v_results := v_results || jsonb_build_object(
                'id', v_entry->>'id',
                'status', 'conflict',
                'message', 'Record already exists'
              );
              CONTINUE;
            END IF;
          END IF;

          -- Perform insert via execute_transaction
          PERFORM execute_transaction(
            jsonb_build_array(
              jsonb_build_object('type', 'insert', 'table', v_table_name, 'data', v_data)
            ),
            p_account_id
          );
          v_synced_count := v_synced_count + 1;
          v_results := v_results || jsonb_build_object('id', v_entry->>'id', 'status', 'synced');

        WHEN 'update' THEN
          PERFORM execute_transaction(
            jsonb_build_array(
              jsonb_build_object('type', 'update', 'table', v_table_name, 'id', v_record_id, 'data', v_data)
            ),
            p_account_id
          );
          v_synced_count := v_synced_count + 1;
          v_results := v_results || jsonb_build_object('id', v_entry->>'id', 'status', 'synced');

        WHEN 'delete' THEN
          PERFORM execute_transaction(
            jsonb_build_array(
              jsonb_build_object('type', 'delete', 'table', v_table_name, 'id', v_record_id)
            ),
            p_account_id
          );
          v_synced_count := v_synced_count + 1;
          v_results := v_results || jsonb_build_object('id', v_entry->>'id', 'status', 'synced');

        ELSE
          RAISE EXCEPTION 'Unknown operation: %', v_operation;
      END CASE;

    EXCEPTION WHEN OTHERS THEN
      v_failed_count := v_failed_count + 1;
      v_results := v_results || jsonb_build_object(
        'id', v_entry->>'id',
        'status', 'failed',
        'error', SQLERRM
      );
    END;
  END LOOP;

  -- Update edge node last sync time
  UPDATE edge_nodes SET
    last_sync_at = NOW(),
    updated_at = NOW()
  WHERE id = p_edge_node_id AND account_id = p_account_id;

  RETURN jsonb_build_object(
    'success', true,
    'synced', v_synced_count,
    'failed', v_failed_count,
    'conflicts', v_conflict_count,
    'results', v_results
  );

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- =============================================================================
-- GRANTS
-- =============================================================================
-- Grant execute permissions to authenticated users

GRANT EXECUTE ON FUNCTION execute_transaction(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_order_with_payment(UUID, JSONB, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION transfer_inventory(UUID, UUID, JSONB, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION sync_batch_operations(JSONB, UUID, UUID) TO authenticated;

-- Also grant to service_role for backend operations
GRANT EXECUTE ON FUNCTION execute_transaction(JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION complete_order_with_payment(UUID, JSONB, UUID, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION transfer_inventory(UUID, UUID, JSONB, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION sync_batch_operations(JSONB, UUID, UUID) TO service_role;
