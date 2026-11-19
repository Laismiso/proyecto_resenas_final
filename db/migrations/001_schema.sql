-- Sabor & Reseña: esquema inicial.
-- Esta migración no elimina tablas ni datos existentes.

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type
        WHERE typname = 'rol_usuario'
    ) THEN
        CREATE TYPE rol_usuario AS ENUM ('admin', 'moderador', 'usuario');
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nombre_usuario VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol rol_usuario NOT NULL DEFAULT 'usuario',
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS restaurantes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    direccion VARCHAR(255),
    categoria VARCHAR(100),
    telefono VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS resenas (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    restaurante_id INTEGER NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
    calificacion SMALLINT NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
    comentario TEXT NOT NULL CHECK (char_length(btrim(comentario)) BETWEEN 1 AND 500),
    eliminada BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_resenas_usuario_restaurante UNIQUE (usuario_id, restaurante_id)
);

CREATE TABLE IF NOT EXISTS sesiones (
    id_hash CHAR(64) PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expira_en TIMESTAMPTZ NOT NULL,
    creada_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resenas_restaurante ON resenas (restaurante_id);
CREATE INDEX IF NOT EXISTS idx_resenas_usuario ON resenas (usuario_id);
CREATE INDEX IF NOT EXISTS idx_restaurantes_categoria ON restaurantes (categoria);
CREATE INDEX IF NOT EXISTS idx_sesiones_expira_en ON sesiones (expira_en);
