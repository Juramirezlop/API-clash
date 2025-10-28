import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get('sort') || 'total'; // 'total' o 'average'
    
    // Obtener fecha de inicio de temporada dinámica
    const seasonConfig = await pool.query(`
      SELECT season_start_date 
      FROM season_config 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    const seasonStart = seasonConfig.rows.length > 0 
      ? seasonConfig.rows[0].season_start_date 
      : '2025-09-01';
    
    let orderByClause = '';
    
    if (sortBy === 'average') {
      // Promedio real: estrellas / (guerras × 6)
      orderByClause = `
        CASE 
          WHEN COUNT(DISTINCT w.war_tag) > 0 
          THEN COALESCE(SUM(w.stars), 0)::decimal / (COUNT(DISTINCT w.war_tag) * 6)
          ELSE 0 
        END DESC
      `;
    } else {
      // Total estrellas
      orderByClause = 'COALESCE(SUM(w.stars), 0) DESC';
    }
    
    const query = `
      SELECT 
        p.player_name,
        p.player_tag,
        COUNT(DISTINCT w.war_tag) as wars_participated,
        COALESCE(SUM(w.stars), 0) as total_stars,
        COALESCE(SUM(w.attacks_used), 0) as attacks_used,
        CASE 
          WHEN COUNT(DISTINCT w.war_tag) > 0 
          THEN COALESCE(SUM(w.stars), 0)::decimal / (COUNT(DISTINCT w.war_tag) * 6)
          ELSE 0 
        END as avg_real
      FROM players p
      LEFT JOIN wars w ON p.player_tag = w.player_tag 
        AND w.war_date >= $1
        AND w.war_type = 'regular'
      WHERE p.is_active = true
      GROUP BY p.player_name, p.player_tag
      ORDER BY ${orderByClause}, p.player_name ASC
    `;
    
    const result = await pool.query(query, [seasonStart]);
    
    return NextResponse.json(result.rows);
    
  } catch (error) {
    console.error('Error en API wars:', error);
    return NextResponse.json(
      { error: 'Error al obtener datos de guerras' }, 
      { status: 500 }
    );
  }
}
