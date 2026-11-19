-- Moderación de la comunidad.
-- Agrega el estado de suspensión de cuentas y la auditoría de las reseñas
-- eliminadas por un administrador. No borra datos existentes.

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS baneado BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS baneado_en TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS baneado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

ALTER TABLE resenas
    ADD COLUMN IF NOT EXISTS eliminada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS fecha_eliminacion TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_usuarios_baneado ON usuarios (baneado) WHERE baneado = TRUE;

-- La unicidad pasa a aplicarse solo a las reseñas activas. Así, después de
-- eliminar una reseña, la misma persona puede volver a opinar del restaurante.
ALTER TABLE resenas DROP CONSTRAINT IF EXISTS uq_resenas_usuario_restaurante;

CREATE UNIQUE INDEX IF NOT EXISTS uq_resenas_usuario_restaurante_activa
    ON resenas (usuario_id, restaurante_id)
    WHERE eliminada = FALSE;
