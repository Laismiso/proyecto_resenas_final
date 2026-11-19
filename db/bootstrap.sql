-- Preparación segura de PostgreSQL para Sabor & Reseña.
-- Ejecutar desde una terminal con acceso de administrador:
-- sudo -u postgres psql -d postgres -f db/bootstrap.sql
-- No contiene contraseñas. \password solicita la clave de forma interactiva.

\set ON_ERROR_STOP on

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'admin_app'
    ) THEN
        CREATE ROLE admin_app LOGIN;
    END IF;
END
$$;

\password admin_app

SELECT 'CREATE DATABASE restaurant_reviews OWNER admin_app TEMPLATE template0'
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database WHERE datname = 'restaurant_reviews'
)\gexec

\connect restaurant_reviews

ALTER DATABASE restaurant_reviews OWNER TO admin_app;
ALTER SCHEMA public OWNER TO admin_app;
GRANT ALL PRIVILEGES ON DATABASE restaurant_reviews TO admin_app;
GRANT ALL PRIVILEGES ON SCHEMA public TO admin_app;
