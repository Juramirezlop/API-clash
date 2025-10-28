import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function GET() {
  try {
    // Obtener la semana actual (lunes de esta semana)
    const result = await pool.query(`
      WITH current_week AS (
        SELECT DATE_TRUNC('week', CURRENT_DATE) as week_start
      )
      SELECT 
        spw.player_tag,
        p.player_name,
        spw.season_points,
        spw.week_start_date
      FROM season_points_weekly spw
      JOIN players p ON spw.player_tag = p.player_tag
      CROSS JOIN current_week
      WHERE spw.week_start_date = current_week.week_start
      ORDER BY spw.season_points DESC
    `);
    
    return NextResponse.json(result.rows);
    
  } catch (error) {
    console.error('Error fetching current week trophies:', error);
    return NextResponse.json(
      { error: 'Error al obtener copas semanales' },
      { status: 500 }
    );
  }
}
