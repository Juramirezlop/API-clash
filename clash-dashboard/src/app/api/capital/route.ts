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
      // Promedio por ataque
      orderByClause = 'COALESCE(AVG(c.average_per_attack), 0) DESC';
    } else {
      // Total destruido
      orderByClause = 'COALESCE(SUM(c.capital_destroyed), 0) DESC';
    }
    
    const query = `
      SELECT 
        p.player_name,
        p.player_tag,
        COUNT(c.id) as weekends_participated,
        COALESCE(SUM(c.capital_destroyed), 0) as total_destroyed,
        COALESCE(SUM(c.attacks_used), 0) as total_attacks,
        COALESCE(AVG(c.average_per_attack), 0) as average_per_attack
      FROM players p
      LEFT JOIN capital_raids c ON p.player_tag = c.player_tag 
        AND c.weekend_date >= $1
      WHERE p.is_active = true
      GROUP BY p.player_name, p.player_tag
      ORDER BY ${orderByClause}, p.player_name ASC
    `;
    
    const result = await pool.query(query, [seasonStart]);
    
    return NextResponse.json(result.rows);
    
  } catch (error) {
    console.error('Error en API capital:', error);
    return NextResponse.json(
      { error: 'Error al obtener datos de capital' }, 
      { status: 500 }
    );
  }
}