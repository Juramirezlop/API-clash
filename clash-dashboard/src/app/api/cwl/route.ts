import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT 
        p.player_tag,
        p.player_name,
        COALESCE(SUM(c.stars), 0) as total_stars,
        COALESCE(SUM(c.attacks_used), 0) as total_attacks,
        COUNT(DISTINCT c.round_number) as rounds_participated,
        c.cwl_season
      FROM players p
      LEFT JOIN cwl_wars c ON p.player_tag = c.player_tag 
        AND c.cwl_season >= '2025-09'
      WHERE p.is_active = true
      GROUP BY p.player_tag, p.player_name, c.cwl_season
      ORDER BY COALESCE(SUM(c.stars), 0) DESC
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching CWL data:', error);
    return NextResponse.json({ error: 'Error fetching CWL data' }, { status: 500 });
  }
}