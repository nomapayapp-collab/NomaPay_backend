-- Migración: 0003_fix_nullable_columns.sql
-- Fecha: 2026-09-01
-- Descripción: varias columnas de "users" quedaron creadas como NOT NULL en
--   algunas bases (según cuándo se corrió schema.sql por primera vez), aunque
--   en el schema.sql actual del repo son opcionales por diseño: se completan
--   en flujos posteriores al registro (KYC, recuperación de contraseña,
--   verificación de email, login con Google, edición de perfil), no en el
--   registro básico por email/password.
--
--   Sin este fix, POST /auth/register falla con:
--   "el valor nulo en la columna «document_type» viola la restricción de no nulo"
--   (o el mismo error para cualquiera de las columnas de abajo).
--
--   Es seguro correrla más de una vez: si una columna ya permite NULL,
--   Postgres no hace nada y no tira error.

ALTER TABLE users
ALTER COLUMN document_type
DROP NOT NULL,
ALTER COLUMN document_number
DROP NOT NULL,
ALTER COLUMN username_updated_at
DROP NOT NULL,
ALTER COLUMN cbu
DROP NOT NULL,
ALTER COLUMN profile_picture_url
DROP NOT NULL,
ALTER COLUMN password_changed_at
DROP NOT NULL,
ALTER COLUMN reset_password_token
DROP NOT NULL,
ALTER COLUMN reset_password_token_expires_at
DROP NOT NULL,
ALTER COLUMN email_verified_at
DROP NOT NULL,
ALTER COLUMN kyc_reviewed_at
DROP NOT NULL,
ALTER COLUMN google_id
DROP NOT NULL;

SELECT tgname FROM pg_trigger WHERE tgrelid = 'users'::regclass;

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