import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function GET() {
  try {
    const currentMonth = new Date().toISOString().substring(0, 7);
    
    const result = await pool.query(`
      SELECT 
        p.player_tag,
        p.player_name,
        COALESCE(se.season_points, 0) as season_points,
        COALESCE(se.clan_games_points, 0) as clan_games_points
      FROM players p
      LEFT JOIN season_events se ON p.player_tag = se.player_tag 
        AND se.season_month = $1
      WHERE p.is_active = true
      ORDER BY 
        COALESCE(se.clan_games_points, 0) DESC,
        COALESCE(se.season_points, 0) DESC
    `, [currentMonth]);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json({ error: 'Error fetching events data' }, { status: 500 });
  }
}