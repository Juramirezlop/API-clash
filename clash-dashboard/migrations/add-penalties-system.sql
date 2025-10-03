-- =====================================================
-- MIGRACIÓN: Sistema de Penalizaciones
-- Fecha: 2025-10-01
-- =====================================================

-- 1. Crear tabla para granularidad semanal de capital
CREATE TABLE IF NOT EXISTS capital_raids_weekly (
    id SERIAL PRIMARY KEY,
    player_tag VARCHAR NOT NULL,
    capital_destroyed INTEGER DEFAULT 0,
    attacks_used INTEGER DEFAULT 0,
    weekend_start_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(player_tag, weekend_start_date)
);

CREATE INDEX IF NOT EXISTS idx_capital_weekly_player_date 
ON capital_raids_weekly(player_tag, weekend_start_date);

-- 2. Agregar columnas de penalización a player_scores
ALTER TABLE player_scores
ADD COLUMN IF NOT EXISTS donation_penalty INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS war_penalty INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS capital_penalty INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cwl_penalty INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS clan_games_penalty INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_penalties INTEGER DEFAULT 0;

-- 3. Verificar que las columnas se crearon correctamente
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'player_scores'
AND column_name LIKE '%penalty%'
ORDER BY ordinal_position;

-- 4. Verificar estructura de capital_raids_weekly
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'capital_raids_weekly'
ORDER BY ordinal_position;