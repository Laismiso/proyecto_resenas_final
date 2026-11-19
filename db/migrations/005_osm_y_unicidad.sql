-- Catálogo de lugares de OpenStreetMap y nombres de usuario sin ambigüedad.
-- Permite guardar en PostgreSQL las reseñas que antes vivían solo en el
-- navegador, asociándolas a un restaurante estable identificado por su lugar
-- de OpenStreetMap. Tampoco borra datos existentes.

ALTER TABLE restaurantes
    ADD COLUMN IF NOT EXISTS osm_tipo VARCHAR(20),
    ADD COLUMN IF NOT EXISTS osm_id BIGINT,
    ADD COLUMN IF NOT EXISTS latitud DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitud DOUBLE PRECISION;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_restaurantes_osm_tipo'
    ) THEN
        ALTER TABLE restaurantes
            ADD CONSTRAINT chk_restaurantes_osm_tipo
            CHECK (osm_tipo IS NULL OR osm_tipo IN ('node', 'way', 'relation'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_restaurantes_coordenadas'
    ) THEN
        ALTER TABLE restaurantes
            ADD CONSTRAINT chk_restaurantes_coordenadas
            CHECK (
                (latitud IS NULL AND longitud IS NULL)
                OR (latitud BETWEEN -90 AND 90 AND longitud BETWEEN -180 AND 180)
            );
    END IF;
END
$$;

-- Un lugar de OpenStreetMap no se duplica aunque lo importen varias personas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurantes_osm
    ON restaurantes (osm_tipo, osm_id)
    WHERE osm_id IS NOT NULL;

-- El inicio de sesión no distingue mayúsculas de minúsculas. Estos índices
-- impiden registrar "Manu" y "manu" como cuentas distintas y evitan que el
-- login elija una al azar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_nombre_lower
    ON usuarios (lower(nombre_usuario));

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_email_lower
    ON usuarios (lower(email));
