import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function GET() {
  try {
    const query = `
      SELECT 
        p.player_name,
        p.player_tag,
        COUNT(w.id) as wars_participated,
        COALESCE(SUM(w.stars), 0) as total_stars,
        COALESCE(SUM(w.attacks_used), 0) as attacks_used,
        COALESCE(AVG(w.stars::decimal / NULLIF(w.attacks_used, 0)), 0) as avg_stars_per_attack
      FROM players p
      LEFT JOIN wars w ON p.player_tag = w.player_tag 
        AND w.war_date >= '2025-09-01'
        AND w.war_type = 'regular'
      WHERE p.is_active = true
      GROUP BY p.player_name, p.player_tag
      ORDER BY 
        COALESCE(SUM(w.stars), 0) DESC,
        p.player_name ASC
    `;
    
    const result = await pool.query(query);
    
    return NextResponse.json(result.rows);
    
  } catch (error) {
    console.error('Error en API wars:', error);
    return NextResponse.json(
      { error: 'Error al obtener datos de guerras' }, 
      { status: 500 }
    );
  }
}