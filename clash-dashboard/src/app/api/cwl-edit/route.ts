import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// GET: Obtener todos los jugadores de CWL con todas las rondas
export async function GET() {
  try {
    const result = await pool.query(`
      SELECT 
        p.player_tag,
        p.player_name,
        c.round_number,
        c.stars,
        c.attacks_used,
        c.cwl_season
      FROM players p
      INNER JOIN cwl_wars c ON p.player_tag = c.player_tag
      WHERE c.cwl_season >= '2025-10'
      AND p.is_active = true
      ORDER BY c.round_number, p.player_name
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching CWL data:', error);
    return NextResponse.json({ error: 'Error fetching data' }, { status: 500 });
  }
}

// POST: Actualizar estrellas y ataques manualmente
export async function POST(request: NextRequest) {
  try {
    const { player_tag, round_number, stars, attacks_used } = await request.json();
    
    if (!player_tag || !round_number || typeof stars !== 'number' || typeof attacks_used !== 'number') {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    
    // Actualizar datos de CWL
    await pool.query(`
      UPDATE cwl_wars
      SET stars = $1,
          attacks_used = $2
          manually_edited = TRUE
      WHERE player_tag = $3 
      AND round_number = $4
      AND cwl_season >= '2025-10'
    `, [stars, attacks_used, player_tag, round_number]);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Datos CWL actualizados correctamente' 
    });
    
  } catch (error) {
    console.error('Error updating CWL:', error);
    return NextResponse.json({ error: 'Error updating data' }, { status: 500 });
  }
}