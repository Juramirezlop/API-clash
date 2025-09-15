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
        COUNT(c.id) as weekends_participated,
        COALESCE(SUM(c.capital_destroyed), 0) as total_destroyed,
        COALESCE(SUM(c.attacks_used), 0) as total_attacks,
        COALESCE(AVG(c.average_per_attack), 0) as average_per_attack
      FROM players p
      LEFT JOIN capital_raids c ON p.player_tag = c.player_tag 
        AND c.weekend_date >= '2025-09-01'
      WHERE p.is_active = true
      GROUP BY p.player_name, p.player_tag
      ORDER BY 
        COALESCE(AVG(c.average_per_attack), 0) DESC,
        p.player_name ASC
    `;
    
    const result = await pool.query(query);
    
    return NextResponse.json(result.rows);
    
  } catch (error) {
    console.error('Error en API capital:', error);
    return NextResponse.json(
      { error: 'Error al obtener datos de capital' }, 
      { status: 500 }
    );
  }
}