import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// GET: Obtener jugadores del último fin de semana de capital
export async function GET() {
  try {
    const result = await pool.query(`
      SELECT 
        p.player_tag,
        p.player_name,
        c.capital_destroyed,
        c.attacks_used,
        c.weekend_date
      FROM players p
      INNER JOIN capital_raids c ON p.player_tag = c.player_tag
      WHERE c.weekend_date = (
        SELECT MAX(weekend_date) FROM capital_raids
      )
      AND p.is_active = true
      ORDER BY p.player_name
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching capital data:', error);
    return NextResponse.json({ error: 'Error fetching data' }, { status: 500 });
  }
}

// POST: Actualizar ataques manualmente
export async function POST(request: NextRequest) {
  try {
    const { player_tag, attacks_used } = await request.json();
    
    if (!player_tag || typeof attacks_used !== 'number' || attacks_used < 0) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    
    // Obtener última fecha de capital
    const lastWeekend = await pool.query(`
      SELECT MAX(weekend_date) as weekend_date FROM capital_raids
    `);
    
    const weekendDate = lastWeekend.rows[0].weekend_date;
    
    // Obtener oro destruido actual
    const capitalData = await pool.query(`
      SELECT capital_destroyed FROM capital_raids
      WHERE player_tag = $1 AND weekend_date = $2
    `, [player_tag, weekendDate]);
    
    if (capitalData.rows.length === 0) {
      return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });
    }
    
    const capitalDestroyed = capitalData.rows[0].capital_destroyed;
    const avgPerAttack = attacks_used > 0 ? (capitalDestroyed / attacks_used).toFixed(2) : 0;
    
    // Actualizar en capital_raids (tabla principal para dashboard)
    await pool.query(`
      UPDATE capital_raids
      SET attacks_used = $1,
          average_per_attack = $2
      WHERE player_tag = $3 AND weekend_date = $4
    `, [attacks_used, avgPerAttack, player_tag, weekendDate]);
    
    // Actualizar en capital_raids_weekly (tabla para penalizaciones)
    await pool.query(`
      UPDATE capital_raids_weekly
      SET attacks_used = $1,
          manually_edited = TRUE
      WHERE player_tag = $2 AND weekend_start_date = $3
    `, [attacks_used, player_tag, weekendDate]);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Ataques actualizados correctamente' 
    });
    
  } catch (error) {
    console.error('Error updating capital:', error);
    return NextResponse.json({ error: 'Error updating data' }, { status: 500 });
  }
}