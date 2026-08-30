-- Migración: 0001_add_google_auth.sql
-- Fecha: 2026-08-30
-- Descripción: agrega soporte para login/registro con Google.
--   - google_id: identifica al usuario cuando entra con Google
--   - password_hash: deja de ser obligatorio (usuarios de Google no tienen contraseña propia)
--   - country: deja de ser obligatorio (Google no lo provee de forma confiable)

ALTER TABLE users
  ADD COLUMN google_id VARCHAR(255),
  ALTER COLUMN password_hash DROP NOT NULL,
  ALTER COLUMN country DROP NOT NULL;

ALTER TABLE users
  ADD CONSTRAINT uq_users_google_id UNIQUE (google_id);