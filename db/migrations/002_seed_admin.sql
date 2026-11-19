-- Cuenta administrativa inicial para desarrollo.
-- El valor almacenado es un hash, nunca una contraseña en texto plano.

INSERT INTO usuarios (nombre_usuario, email, password_hash, rol)
VALUES (
    'admin',
    'admin@example.com',
    'scrypt:32768:8:1$IhZZn6lx61wQn6Sp$49a26ac2638a5cc3c81481d18bcd7d2a925634b2563701e5cff0ddf3bd43bae0b9034f2cf42dc71fd1bf90e00107549619bb5e2edd67d14ca9ce7f9eaa498e1e',
    'admin'
)
ON CONFLICT (nombre_usuario) DO NOTHING;
