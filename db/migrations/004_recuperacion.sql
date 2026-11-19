-- Recuperación de contraseña por correo.
-- Guarda solo el hash del token: el valor original viaja en el enlace y no
-- queda almacenado en la base. No borra datos existentes.

CREATE TABLE IF NOT EXISTS recuperaciones_contrasena (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expira_en TIMESTAMPTZ NOT NULL,
    usado_en TIMESTAMPTZ,
    creada_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recuperaciones_usuario
    ON recuperaciones_contrasena (usuario_id);

CREATE INDEX IF NOT EXISTS idx_recuperaciones_pendientes
    ON recuperaciones_contrasena (usuario_id, expira_en)
    WHERE usado_en IS NULL;
