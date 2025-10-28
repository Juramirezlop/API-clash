-- Agregar columna manually_edited a la tabla wars
ALTER TABLE wars 
ADD COLUMN IF NOT EXISTS manually_edited BOOLEAN DEFAULT FALSE;

-- Verificar
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'wars' AND column_name = 'manually_edited';
