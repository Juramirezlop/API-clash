import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET() {
  try {
    // Obtener el mes actual para las puntuaciones
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    
    // Query corregido: JOIN con player_scores
    const result = await pool.query(`
      SELECT 
        p.player_tag,
        p.player_name,
        p.join_date,
        p.last_seen,
        p.is_active,
        COALESCE(ps.donation_points, 0) as donation_points,
        COALESCE(ps.event_points, 0) as event_points,
        COALESCE(ps.trophy_points, 0) as trophy_points,
        COALESCE(ps.war_points, 0) as war_points,
        COALESCE(ps.cwl_points, 0) as cwl_points,
        COALESCE(ps.capital_points, 0) as capital_points,
        COALESCE(ps.total_points, 0) as total_points
      FROM players p
      LEFT JOIN player_scores ps ON p.player_tag = ps.player_tag 
        AND ps.season_month = $1
      WHERE p.is_active = true
      ORDER BY COALESCE(ps.total_points, 0) DESC, p.player_name ASC
    `, [currentMonth]);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching players:', error);
    return NextResponse.json(
      { error: 'Failed to fetch players' },
      { status: 500 }
    );
  }
}