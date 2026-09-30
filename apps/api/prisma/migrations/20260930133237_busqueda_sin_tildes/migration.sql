-- Búsqueda sin distinguir tildes ni mayúsculas ("lucia" encuentra "Lucía").
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() no es IMMUTABLE; este envoltorio sí lo es y permite crear índices sobre expresiones más adelante.
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
