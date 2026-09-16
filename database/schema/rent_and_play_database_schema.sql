-- ============================================================
-- Rent & Play - MySQL 8.0 Database Schema
-- Designed for:
--   Web Dashboard + Mobile App + ESP32 Terminal
-- Architecture:
--   Web / Mobile / ESP32 -> Backend REST API -> MySQL
-- ============================================================

CREATE DATABASE IF NOT EXISTS rent_and_play
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE rent_and_play;

SET time_zone = '+08:00';

-- ============================================================
-- 1. USERS / OPERATORS
-- ============================================================

CREATE TABLE users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(191) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('OWNER', 'OPERATOR') NOT NULL DEFAULT 'OPERATOR',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    KEY idx_users_role_active (role, is_active)
) ENGINE=InnoDB;

-- ============================================================
-- 2. CUSTOMERS / RENTERS
-- ============================================================

CREATE TABLE customers (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_code VARCHAR(30) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30) NULL,
    email VARCHAR(191) NULL,
    address VARCHAR(255) NULL,
    notes TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    UNIQUE KEY uq_customers_code (customer_code),
    KEY idx_customers_name (full_name),
    KEY idx_customers_phone (phone),
    KEY idx_customers_active (is_active)
) ENGINE=InnoDB;

-- ============================================================
-- 3. ITEM CATEGORIES
-- ============================================================

CREATE TABLE item_categories (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    UNIQUE KEY uq_item_categories_name (name)
) ENGINE=InnoDB;

-- ============================================================
-- 4. ITEMS / EQUIPMENT INVENTORY
-- ============================================================

CREATE TABLE items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    item_code VARCHAR(50) NOT NULL,
    category_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT NULL,

    -- QR value scanned by mobile app.
    qr_token VARCHAR(191) NOT NULL,

    status ENUM(
        'AVAILABLE',
        'RESERVED_PENDING',
        'RENTED',
        'UNDER_MAINTENANCE',
        'INACTIVE'
    ) NOT NULL DEFAULT 'AVAILABLE',

    condition_status ENUM(
        'GOOD',
        'FAIR',
        'DAMAGED',
        'NEEDS_INSPECTION'
    ) NOT NULL DEFAULT 'GOOD',

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    UNIQUE KEY uq_items_code (item_code),
    UNIQUE KEY uq_items_qr_token (qr_token),
    KEY idx_items_category (category_id),
    KEY idx_items_status (status),
    KEY idx_items_active_status (is_active, status),

    CONSTRAINT fk_items_category
        FOREIGN KEY (category_id)
        REFERENCES item_categories(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ============================================================
-- 5. RATE CONFIGURATION
-- Keeps rate history instead of overwriting old rates.
-- ============================================================

CREATE TABLE item_rates (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    item_id BIGINT UNSIGNED NOT NULL,

    rate_type ENUM('FLAT', 'HOURLY', 'DAILY') NOT NULL DEFAULT 'DAILY',
    rental_rate DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    deposit_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    late_penalty_rate DECIMAL(12,2) NOT NULL DEFAULT 0.00,

    effective_from DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    effective_to DATETIME(3) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    KEY idx_item_rates_item_active (item_id, is_active),
    KEY idx_item_rates_effective (item_id, effective_from, effective_to),

    CONSTRAINT chk_item_rates_nonnegative
        CHECK (
            rental_rate >= 0
            AND deposit_amount >= 0
            AND late_penalty_rate >= 0
        ),

    CONSTRAINT fk_item_rates_item
        FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_item_rates_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- 6. ESP32 TERMINALS
-- ============================================================

CREATE TABLE terminals (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    terminal_code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,

    -- Store only a HASH of the device API key/secret.
    api_key_hash VARCHAR(255) NULL,

    status ENUM('ONLINE', 'OFFLINE', 'DISABLED') NOT NULL DEFAULT 'OFFLINE',
    firmware_version VARCHAR(50) NULL,
    last_seen_at DATETIME(3) NULL,
    last_ip VARCHAR(45) NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    UNIQUE KEY uq_terminals_code (terminal_code),
    KEY idx_terminals_status (status),
    KEY idx_terminals_last_seen (last_seen_at)
) ENGINE=InnoDB;

CREATE TABLE terminal_status_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    terminal_id BIGINT UNSIGNED NOT NULL,
    status ENUM('ONLINE', 'OFFLINE', 'API_ERROR', 'RECONNECTED') NOT NULL,
    ip_address VARCHAR(45) NULL,
    details VARCHAR(255) NULL,
    recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    KEY idx_terminal_logs_terminal_time (terminal_id, recorded_at),

    CONSTRAINT fk_terminal_logs_terminal
        FOREIGN KEY (terminal_id)
        REFERENCES terminals(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 7. RENTALS
-- A rental remains the long-term business record.
-- The ESP32 verification is stored separately.
-- ============================================================

CREATE TABLE rentals (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    rental_code VARCHAR(40) NOT NULL,

    customer_id BIGINT UNSIGNED NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    created_by BIGINT UNSIGNED NULL,

    status ENUM(
        'PENDING_VERIFICATION',
        'ACTIVE',
        'COMPLETED',
        'REJECTED',
        'EXPIRED',
        'CANCELLED'
    ) NOT NULL DEFAULT 'PENDING_VERIFICATION',

    requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    confirmed_rental_at DATETIME(3) NULL,
    due_at DATETIME(3) NOT NULL,
    completed_at DATETIME(3) NULL,

    -- Snapshot the configured rate at transaction time.
    rate_type_snapshot ENUM('FLAT', 'HOURLY', 'DAILY') NOT NULL,
    rental_rate_snapshot DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    deposit_snapshot DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    late_penalty_rate_snapshot DECIMAL(12,2) NOT NULL DEFAULT 0.00,

    rental_fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    deposit_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    late_penalty DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_charge DECIMAL(12,2) NOT NULL DEFAULT 0.00,

    notes TEXT NULL,

    -- MySQL partial-unique-index workaround:
    -- Active/Pending rental => 1, final states => NULL.
    active_item_lock TINYINT
        GENERATED ALWAYS AS (
            CASE
                WHEN status IN ('PENDING_VERIFICATION', 'ACTIVE') THEN 1
                ELSE NULL
            END
        ) STORED,

    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    UNIQUE KEY uq_rentals_code (rental_code),

    -- Prevents the same item from having two simultaneous
    -- pending/active rentals.
    UNIQUE KEY uq_rentals_one_active_per_item (item_id, active_item_lock),

    KEY idx_rentals_customer (customer_id),
    KEY idx_rentals_status_due (status, due_at),
    KEY idx_rentals_item_status (item_id, status),
    KEY idx_rentals_requested_at (requested_at),

    CONSTRAINT chk_rentals_amounts_nonnegative
        CHECK (
            rental_rate_snapshot >= 0
            AND deposit_snapshot >= 0
            AND late_penalty_rate_snapshot >= 0
            AND rental_fee >= 0
            AND deposit_amount >= 0
            AND late_penalty >= 0
            AND total_charge >= 0
        ),

    CONSTRAINT fk_rentals_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_rentals_item
        FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_rentals_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- 8. RETURN RECORDS
-- One completed/attempted return record per rental.
-- A return can be pending ESP32 verification before finalization.
-- ============================================================

CREATE TABLE return_records (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    return_code VARCHAR(40) NOT NULL,
    rental_id BIGINT UNSIGNED NOT NULL,

    status ENUM(
        'PENDING_VERIFICATION',
        'CONFIRMED',
        'REJECTED',
        'EXPIRED',
        'CANCELLED'
    ) NOT NULL DEFAULT 'PENDING_VERIFICATION',

    requested_return_at DATETIME(3) NOT NULL,
    confirmed_return_at DATETIME(3) NULL,

    condition_on_return ENUM(
        'GOOD',
        'FAIR',
        'DAMAGED',
        'NEEDS_INSPECTION'
    ) NOT NULL,

    late_penalty DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    other_charge DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_return_charge DECIMAL(12,2) NOT NULL DEFAULT 0.00,

    maintenance_required BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT NULL,

    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    UNIQUE KEY uq_return_records_code (return_code),
    KEY idx_returns_rental (rental_id),
    KEY idx_returns_status (status),

    CONSTRAINT chk_return_amounts_nonnegative
        CHECK (
            late_penalty >= 0
            AND other_charge >= 0
            AND total_return_charge >= 0
        ),

    CONSTRAINT fk_returns_rental
        FOREIGN KEY (rental_id)
        REFERENCES rentals(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_returns_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- 9. ESP32 VERIFICATION REQUESTS
-- This is the physical confirmation gate.
-- ============================================================

CREATE TABLE verification_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    verification_code VARCHAR(50) NOT NULL,

    transaction_type ENUM('RENTAL', 'RETURN') NOT NULL,
    rental_id BIGINT UNSIGNED NOT NULL,
    return_record_id BIGINT UNSIGNED NULL,
    terminal_id BIGINT UNSIGNED NOT NULL,

    status ENUM(
        'PENDING',
        'CONFIRMED',
        'REJECTED',
        'EXPIRED',
        'CANCELLED'
    ) NOT NULL DEFAULT 'PENDING',

    display_status VARCHAR(50) NOT NULL,

    requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    expires_at DATETIME(3) NOT NULL,
    confirmed_at DATETIME(3) NULL,
    rejected_at DATETIME(3) NULL,

    button_code VARCHAR(20) NULL,
    rejection_reason VARCHAR(255) NULL,

    -- Can be used by the backend for idempotency / duplicate protection.
    idempotency_key VARCHAR(100) NULL,

    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    UNIQUE KEY uq_verification_code (verification_code),
    UNIQUE KEY uq_verification_idempotency (idempotency_key),

    KEY idx_verification_terminal_pending (terminal_id, status, requested_at),
    KEY idx_verification_rental (rental_id),
    KEY idx_verification_return (return_record_id),
    KEY idx_verification_expiry (status, expires_at),

    CONSTRAINT fk_verification_rental
        FOREIGN KEY (rental_id)
        REFERENCES rentals(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_verification_return
        FOREIGN KEY (return_record_id)
        REFERENCES return_records(id),

    CONSTRAINT fk_verification_terminal
        FOREIGN KEY (terminal_id)
        REFERENCES terminals(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_verification_type_reference
        CHECK (
            (transaction_type = 'RENTAL' AND return_record_id IS NULL)
            OR
            (transaction_type = 'RETURN' AND return_record_id IS NOT NULL)
        )
) ENGINE=InnoDB;

CREATE TABLE verification_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    verification_request_id BIGINT UNSIGNED NOT NULL,

    event_type ENUM(
        'CREATED',
        'FETCHED_BY_TERMINAL',
        'BUTTON_PRESSED',
        'CONFIRMED',
        'REJECTED',
        'EXPIRED',
        'API_ERROR',
        'DUPLICATE_ATTEMPT'
    ) NOT NULL,

    event_source ENUM('BACKEND', 'WEB', 'MOBILE', 'ESP32', 'SYSTEM') NOT NULL,
    details JSON NULL,
    occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    KEY idx_verification_events_request_time
        (verification_request_id, occurred_at),

    CONSTRAINT fk_verification_events_request
        FOREIGN KEY (verification_request_id)
        REFERENCES verification_requests(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 10. MAINTENANCE
-- ============================================================

CREATE TABLE maintenance_records (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    item_id BIGINT UNSIGNED NOT NULL,
    return_record_id BIGINT UNSIGNED NULL,

    status ENUM('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')
        NOT NULL DEFAULT 'OPEN',

    reason VARCHAR(255) NOT NULL,
    details TEXT NULL,
    started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    completed_at DATETIME(3) NULL,

    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    KEY idx_maintenance_item_status (item_id, status),
    KEY idx_maintenance_return (return_record_id),

    CONSTRAINT fk_maintenance_item
        FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_maintenance_return
        FOREIGN KEY (return_record_id)
        REFERENCES return_records(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_maintenance_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- 11. ITEM STATUS HISTORY
-- Useful for audit/reporting and debugging synchronization.
-- ============================================================

CREATE TABLE item_status_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    item_id BIGINT UNSIGNED NOT NULL,
    old_status ENUM(
        'AVAILABLE',
        'RESERVED_PENDING',
        'RENTED',
        'UNDER_MAINTENANCE',
        'INACTIVE'
    ) NULL,
    new_status ENUM(
        'AVAILABLE',
        'RESERVED_PENDING',
        'RENTED',
        'UNDER_MAINTENANCE',
        'INACTIVE'
    ) NOT NULL,
    source ENUM('BACKEND', 'WEB', 'MOBILE', 'ESP32', 'SYSTEM') NOT NULL,
    reference_type VARCHAR(50) NULL,
    reference_id BIGINT UNSIGNED NULL,
    changed_by BIGINT UNSIGNED NULL,
    changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    KEY idx_item_status_history_item_time (item_id, changed_at),

    CONSTRAINT fk_item_status_history_item
        FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_item_status_history_user
        FOREIGN KEY (changed_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- 12. AUDIT LOG
-- Generic application audit trail.
-- ============================================================

CREATE TABLE audit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NULL,
    terminal_id BIGINT UNSIGNED NULL,

    actor_type ENUM('USER', 'TERMINAL', 'SYSTEM') NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id BIGINT UNSIGNED NULL,

    old_values JSON NULL,
    new_values JSON NULL,
    ip_address VARCHAR(45) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (id),
    KEY idx_audit_entity (entity_type, entity_id),
    KEY idx_audit_user_time (user_id, created_at),
    KEY idx_audit_terminal_time (terminal_id, created_at),
    KEY idx_audit_created_at (created_at),

    CONSTRAINT fk_audit_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_audit_terminal
        FOREIGN KEY (terminal_id)
        REFERENCES terminals(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- 13. STARTER DATA
-- ============================================================

INSERT INTO item_categories (name, description)
VALUES
    ('Sports Equipment', 'Rentable sports equipment'),
    ('Board Games', 'Board games available for rent'),
    ('Card Games', 'Card games available for rent'),
    ('Gaming Consoles', 'Gaming consoles and related equipment')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO terminals (terminal_code, name, status)
VALUES ('TERM-01', 'Rental Counter Terminal', 'OFFLINE')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ============================================================
-- 14. USEFUL VIEWS FOR WEB DASHBOARD
-- ============================================================

CREATE OR REPLACE VIEW vw_active_rentals AS
SELECT
    r.id,
    r.rental_code,
    c.customer_code,
    c.full_name AS customer_name,
    i.item_code,
    i.name AS item_name,
    r.confirmed_rental_at,
    r.due_at,
    r.rental_fee,
    r.deposit_amount,
    r.late_penalty,
    r.status,
    CASE
        WHEN r.status = 'ACTIVE' AND r.due_at < CURRENT_TIMESTAMP(3)
            THEN 'OVERDUE'
        WHEN r.status = 'ACTIVE'
            THEN 'ACTIVE'
        ELSE r.status
    END AS display_status
FROM rentals r
JOIN customers c ON c.id = r.customer_id
JOIN items i ON i.id = r.item_id
WHERE r.status IN ('PENDING_VERIFICATION', 'ACTIVE');

CREATE OR REPLACE VIEW vw_pending_verifications AS
SELECT
    v.id,
    v.verification_code,
    v.transaction_type,
    v.status,
    v.display_status,
    v.requested_at,
    v.expires_at,
    t.terminal_code,
    r.rental_code,
    i.item_code,
    i.name AS item_name
FROM verification_requests v
JOIN terminals t ON t.id = v.terminal_id
JOIN rentals r ON r.id = v.rental_id
JOIN items i ON i.id = r.item_id
WHERE v.status = 'PENDING';

-- ============================================================
-- END OF SCHEMA
-- ============================================================
