import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// GET: Obtener jugadores para editar puntos de Clan Games
export async function GET() {
  try {
    const currentMonth = new Date().toISOString().substring(0, 7);
    
    const result = await pool.query(`
      SELECT 
        p.player_tag,
        p.player_name,
        COALESCE(se.clan_games_points, 0) as clan_games_points
      FROM players p
      LEFT JOIN season_events se ON p.player_tag = se.player_tag 
        AND se.season_month = $1
      WHERE p.is_active = true
      ORDER BY p.player_name
    `, [currentMonth]);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching clan games data:', error);
    return NextResponse.json({ error: 'Error fetching data' }, { status: 500 });
  }
}

// POST: Actualizar puntos de Clan Games manualmente
export async function POST(request: NextRequest) {
  try {
    const { player_tag, clan_games_points } = await request.json();
    const currentMonth = new Date().toISOString().substring(0, 7);
    const today = new Date().toISOString().split('T')[0];
    
    // Validar entrada
    if (!player_tag || typeof clan_games_points !== 'number' || clan_games_points < 0) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    
    // Primero obtener season_points existentes
    const existingPoints = await pool.query(`
      SELECT COALESCE(season_points, 0) as season_points
      FROM season_events 
      WHERE player_tag = $1 AND season_month = $2
    `, [player_tag, currentMonth]);
    
    const currentSeasonPoints = existingPoints.rows.length > 0 
      ? existingPoints.rows[0].season_points 
      : 0;
    
    // Ahora hacer el insert/update con valores simples
    await pool.query(`
      INSERT INTO season_events (player_tag, season_points, clan_games_points, clan_games_date, season_month)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (player_tag, season_month)
      DO UPDATE SET 
        clan_games_points = $3,
        clan_games_date = CASE 
          WHEN $3 > 0 THEN $4 
          ELSE season_events.clan_games_date 
        END
    `, [player_tag, currentSeasonPoints, clan_games_points, today, currentMonth]);
    
    // Recalcular puntos de eventos (Top 8 Clan Games)
    await recalculateEventPoints(currentMonth);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Puntos actualizados correctamente' 
    });
    
  } catch (error) {
    console.error('Error updating clan games:', error);
    return NextResponse.json({ error: 'Error updating data' }, { status: 500 });
  }
}

// Función para recalcular automáticamente los puntos de eventos
async function recalculateEventPoints(month: string) {
  const POINTS_SYSTEM = { 1: 10, 2: 8, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1 };
  
  // Limpiar puntos de eventos anteriores
  await pool.query(`
    UPDATE player_scores 
    SET event_points = 0 
    WHERE season_month = $1
  `, [month]);
  
  // Obtener Top 8 Clan Games
  const topClanGames = await pool.query(`
    SELECT player_tag, clan_games_points 
    FROM season_events 
    WHERE season_month = $1 
    AND clan_games_points > 0
    ORDER BY clan_games_points DESC LIMIT 8
  `, [month]);
  
  // Asignar puntos
  for (let i = 0; i < topClanGames.rows.length; i++) {
    const points = POINTS_SYSTEM[i + 1 as keyof typeof POINTS_SYSTEM] || 0;
    await pool.query(`
      INSERT INTO player_scores (player_tag, event_points, season_month)
      VALUES ($1, $2, $3)
      ON CONFLICT (player_tag, season_month)
      DO UPDATE SET event_points = $2
    `, [topClanGames.rows[i].player_tag, points, month]);
  }
  
  // Recalcular totales
  await pool.query(`
    UPDATE player_scores 
    SET total_points = 
      COALESCE(donation_points, 0) + 
      COALESCE(event_points, 0) + 
      COALESCE(trophy_points, 0) + 
      COALESCE(war_points, 0) + 
      COALESCE(cwl_points, 0) + 
      COALESCE(capital_points, 0)
    WHERE season_month = $1
  `, [month]);
}
