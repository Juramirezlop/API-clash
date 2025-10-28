import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function GET() {
  try {
    // Obtener fecha de inicio de temporada dinámica
    const seasonConfig = await pool.query(`
      SELECT season_start_date 
      FROM season_config 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    const seasonStart = seasonConfig.rows.length > 0 
      ? new Date(seasonConfig.rows[0].season_start_date).toISOString().substring(0, 7)
      : '2025-09';
    
    const result = await pool.query(`
      SELECT 
        p.player_tag,
        p.player_name,
        COALESCE(SUM(c.stars), 0) as total_stars,
        COALESCE(SUM(c.attacks_used), 0) as total_attacks,
        COUNT(DISTINCT c.round_number) as rounds_participated,
        MAX(c.cwl_season) as cwl_season
      FROM cwl_wars c
      INNER JOIN players p ON p.player_tag = c.player_tag
      WHERE c.cwl_season >= $1
        AND p.is_active = true
      GROUP BY p.player_tag, p.player_name
      ORDER BY COALESCE(SUM(c.stars), 0) DESC
    `, [seasonStart]);

    return NextResponse.json(result.rows || []);
  } catch (error) {
    console.error('Error fetching CWL data:', error);
    return NextResponse.json({ error: 'Error fetching CWL data' }, { status: 500 });
  }
}