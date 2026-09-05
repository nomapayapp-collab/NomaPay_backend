-- 1. Le sacamos el NOT NULL al sender_wallet_id como vimos antes
ALTER TABLE transactions ALTER COLUMN sender_wallet_id DROP NOT NULL;

-- 2. (OPCIONAL) Si ya tenías transacciones de prueba guardadas con 'buy' o 'sell',
-- tenés que borrarlas primero, sino el paso 4 va a tirar error.
DELETE FROM transactions WHERE type::text IN ('buy', 'sell');

-- 3. Renombramos el enum original
ALTER TYPE transaction_type RENAME TO transaction_type_old;

-- 4. Creamos el enum nuevo limpio solo con los valores que querés
CREATE TYPE transaction_type AS ENUM ('transfer', 'exchange', 'deposit');

-- 5. Cambiamos la columna de la tabla para que use el nuevo enum
ALTER TABLE transactions
ALTER COLUMN type TYPE transaction_type USING type::text::transaction_type;

-- 6. Borramos el enum viejo
DROP TYPE transaction_type_old;