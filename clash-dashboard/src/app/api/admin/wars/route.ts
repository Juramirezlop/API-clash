import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// GET: Obtener todas las guerras con nombres de jugadores
export async function GET() {
  try {
    const result = await pool.query(`
      SELECT 
        w.id,
        w.player_tag,
        p.player_name,
        w.war_tag,
        w.war_date,
        w.stars,
        w.attacks_used,
        COALESCE(w.manually_edited, FALSE) as manually_edited
      FROM wars w
      JOIN players p ON w.player_tag = p.player_tag
      WHERE w.war_type = 'regular'
      ORDER BY w.war_date DESC, p.player_name ASC
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching wars:', error);
    return NextResponse.json({ error: 'Error fetching wars' }, { status: 500 });
  }
}

// PUT: Actualizar datos de guerra manualmente
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { player_tag, war_tag, stars, attacks_used } = body;

    if (!player_tag || !war_tag) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Actualizar el registro
    await pool.query(`
      UPDATE wars
      SET 
        stars = COALESCE($1, stars),
        attacks_used = COALESCE($2, attacks_used),
        manually_edited = TRUE
      WHERE player_tag = $3 AND war_tag = $4
    `, [stars, attacks_used, player_tag, war_tag]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating war:', error);
    return NextResponse.json({ error: 'Error updating war' }, { status: 500 });
  }
}
