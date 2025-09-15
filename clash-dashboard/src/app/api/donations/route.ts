import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get('sort') || 'balance';
    
    let orderClause;
    if (sortBy === 'quantity') {
      orderClause = 'ORDER BY COALESCE(d.donations_given, 0) DESC';
    } else {
      orderClause = 'ORDER BY (COALESCE(d.donations_given, 0) - COALESCE(d.donations_received, 0)) DESC';
    }
    
    const query = `
      SELECT DISTINCT
        p.player_name,
        p.player_tag,
        COALESCE(d.donations_given, 0) as donations_given,
        COALESCE(d.donations_received, 0) as donations_received,
        (COALESCE(d.donations_given, 0) - COALESCE(d.donations_received, 0)) as balance
      FROM players p
      LEFT JOIN donations d ON p.player_tag = d.player_tag 
        AND d.recorded_at = (
          SELECT MAX(recorded_at) 
          FROM donations d2 
          WHERE d2.player_tag = p.player_tag
        )
      WHERE p.is_active = true
      ${orderClause}
    `;
    
    const result = await pool.query(query);
    
    return NextResponse.json(result.rows);
    
  } catch (error) {
    console.error('Error en API donations:', error);
    return NextResponse.json(
      { error: 'Error al obtener datos de donaciones' }, 
      { status: 500 }
    );
  }
}