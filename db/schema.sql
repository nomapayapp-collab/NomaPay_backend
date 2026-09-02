CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TYPE kyc_status_type AS ENUM (
  'not_started',
  'pending',
  'approved',
  'rejected'
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    surname VARCHAR(100) NOT NULL,
    document_type VARCHAR(20),
    document_number VARCHAR(30),
    email VARCHAR(255) NOT NULL,
    country VARCHAR(2) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    username VARCHAR(50),
    username_updated_at TIMESTAMPTZ,
    alias VARCHAR(50),
    cbu VARCHAR(22),
    profile_picture_url VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    password_changed_at TIMESTAMPTZ,
    reset_password_token VARCHAR(255),
    reset_password_token_expires_at TIMESTAMPTZ,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    email_verified_at TIMESTAMPTZ,
    kyc_status kyc_status_type NOT NULL DEFAULT 'not_started',
    kyc_reviewed_at TIMESTAMPTZ,
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT uq_users_alias UNIQUE (alias),
    CONSTRAINT uq_users_cbu UNIQUE (cbu),
    CONSTRAINT uq_users_document UNIQUE (
        document_type,
        document_number
    ),
    CONSTRAINT chk_cbu_format CHECK (cbu ~ '^[0-9]{22}$')
);

CREATE OR REPLACE FUNCTION generate_cbu() RETURNS VARCHAR(22) AS $$
DECLARE
  new_cbu VARCHAR(22);
  exists_cbu BOOLEAN;
BEGIN
  LOOP
    SELECT STRING_AGG(FLOOR(RANDOM() * 10)::TEXT, '')
    INTO new_cbu
    FROM GENERATE_SERIES(1, 22);

    SELECT EXISTS (SELECT 1 FROM users WHERE cbu = new_cbu) INTO exists_cbu;
    EXIT WHEN NOT exists_cbu;
  END LOOP;

  RETURN new_cbu;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_default_cbu() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cbu IS NULL THEN
    NEW.cbu := generate_cbu();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_default_cbu ON users;

CREATE TRIGGER trg_set_default_cbu
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_default_cbu();

CREATE OR REPLACE FUNCTION generate_username(p_name VARCHAR, p_surname VARCHAR)
RETURNS VARCHAR(50) AS $$
DECLARE
  base_username VARCHAR(50);
  candidate VARCHAR(50);
  suffix INTEGER := 0;
  exists_username BOOLEAN;
BEGIN
  base_username := lower(unaccent(trim(p_name) || '.' || trim(p_surname)));
  base_username := regexp_replace(base_username, '[^a-z0-9.]', '', 'g');
  base_username := left(base_username, 45);

  candidate := base_username;

  LOOP
    SELECT EXISTS (SELECT 1 FROM users WHERE username = candidate) INTO exists_username;
    EXIT WHEN NOT exists_username;
    suffix := suffix + 1;
    candidate := base_username || suffix::TEXT;
  END LOOP;

  RETURN candidate;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_default_username() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.username IS NULL THEN
    NEW.username := generate_username(NEW.name, NEW.surname);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_default_username
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_default_username();

CREATE OR REPLACE FUNCTION generate_alias(p_name VARCHAR, p_surname VARCHAR)
RETURNS VARCHAR(50) AS $$
DECLARE
  base_alias VARCHAR(50);
  candidate VARCHAR(50);
  suffix INTEGER := 0;
  exists_alias BOOLEAN;
BEGIN
  base_alias := lower(unaccent(trim(p_name) || '.' || trim(p_surname)));
  base_alias := regexp_replace(base_alias, '[^a-z0-9.]', '', 'g');
  base_alias := left(base_alias, 45);

  candidate := base_alias;

  LOOP
    SELECT EXISTS (SELECT 1 FROM users WHERE alias = candidate) INTO exists_alias;
    EXIT WHEN NOT exists_alias;
    suffix := suffix + 1;
    candidate := base_alias || suffix::TEXT;
  END LOOP;

  RETURN candidate;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_default_alias() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.alias IS NULL THEN
    NEW.alias := generate_alias(NEW.name, NEW.surname);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_default_alias
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_default_alias();

CREATE TABLE currencies (
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    symbol VARCHAR(5),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_currencies_name UNIQUE (name)
);

INSERT INTO
    currencies (code, name, symbol)
VALUES (
        'USD',
        'Dólar estadounidense',
        '$'
    ),
    ('ARS', 'Peso argentino', '$'),
    ('BRL', 'Real brasileño', 'R$')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE wallets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    preferred_currency VARCHAR(10) NOT NULL DEFAULT 'USD' REFERENCES currencies (code),
    CONSTRAINT uq_wallets_user UNIQUE (user_id)
);

CREATE TABLE balances (
    id SERIAL PRIMARY KEY,
    wallet_id INTEGER NOT NULL REFERENCES wallets (id) ON DELETE CASCADE,
    currency_code VARCHAR(10) NOT NULL REFERENCES currencies (code),
    amount NUMERIC(20, 8) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_wallet_currency UNIQUE (wallet_id, currency_code)
);

CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'cancelled', 'rejected');

CREATE TYPE transaction_type AS ENUM ('buy', 'sell', 'transfer', 'exchange');

CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    sender_wallet_id INTEGER NOT NULL REFERENCES wallets (id) ON DELETE RESTRICT,
    receiver_wallet_id INTEGER REFERENCES wallets (id) ON DELETE RESTRICT,
    type transaction_type NOT NULL,
    status transaction_status NOT NULL DEFAULT 'pending',
    currency_origin VARCHAR(10) NOT NULL REFERENCES currencies (code),
    currency_destination VARCHAR(10) REFERENCES currencies (code),
    amount NUMERIC(20, 8) NOT NULL,
    fee NUMERIC(20, 8) NOT NULL DEFAULT 0,
    final_amount NUMERIC(20, 8),
    exchange_rate NUMERIC(20, 8),
    transaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_amount_positive CHECK (amount > 0),
    CONSTRAINT chk_fee_non_negative CHECK (fee >= 0),
    CONSTRAINT chk_final_amount_non_negative CHECK (final_amount >= 0)
);

CREATE INDEX idx_transactions_sender_wallet ON transactions (sender_wallet_id);

CREATE INDEX idx_transactions_receiver_wallet ON transactions (receiver_wallet_id);

CREATE INDEX idx_transactions_status ON transactions (status);

CREATE INDEX idx_transactions_date ON transactions (transaction_date);

CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'expired');

CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    plan VARCHAR(50) NOT NULL DEFAULT 'premium',
    status subscription_status NOT NULL DEFAULT 'active',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_subscription_user UNIQUE (user_id)
);