-- ============================================
-- QUERY: Ver Baselines de Donaciones
-- ============================================
-- Descripción: Muestra los baselines guardados
-- y compara con donaciones actuales
-- ============================================

-- 1. Ver todos los baselines
SELECT 
    p.player_name,
    db.baseline_donated,
    db.baseline_received,
    (db.baseline_donated - db.baseline_received) as baseline_balance,
    db.baseline_date
FROM donation_baselines db
JOIN players p ON db.player_tag = p.player_tag
WHERE p.is_active = true
ORDER BY db.baseline_donated DESC;

-- 2. Comparar baseline con donaciones actuales
SELECT 
    p.player_name,
    db.baseline_donated,
    COALESCE(d.donations_given, 0) as season_donated,
    (COALESCE(d.donations_given, 0) - db.baseline_donated) as progreso_donadas,
    db.baseline_received,
    COALESCE(d.donations_received, 0) as season_received,
    (COALESCE(d.donations_received, 0) - db.baseline_received) as progreso_recibidas
FROM donation_baselines db
JOIN players p ON db.player_tag = p.player_tag
LEFT JOIN (
    SELECT DISTINCT ON (player_tag)
        player_tag,
        donations_given,
        donations_received
    FROM donations
    ORDER BY player_tag, recorded_at DESC
) d ON db.player_tag = d.player_tag
WHERE p.is_active = true
ORDER BY progreso_donadas DESC;

-- 3. Encontrar jugadores SIN baseline (error)
SELECT p.player_name, p.player_tag
FROM players p
LEFT JOIN donation_baselines db ON p.player_tag = db.player_tag
WHERE p.is_active = true
AND db.player_tag IS NULL;

-- 4. Ver estadísticas generales
SELECT 
    COUNT(*) as total_jugadores,
    SUM(baseline_donated) as total_donaciones_baseline,
    AVG(baseline_donated) as promedio_donaciones,
    MAX(baseline_donated) as max_donaciones,
    MIN(baseline_donated) as min_donaciones
FROM donation_baselines db
JOIN players p ON db.player_tag = p.player_tag
WHERE p.is_active = true;
