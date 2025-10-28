import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const week = searchParams.get('week');
    
    // Obtener semanas disponibles
    const weeksResult = await pool.query(`
      SELECT DISTINCT week_start_date 
      FROM season_points_weekly 
      ORDER BY week_start_date DESC
    `);
    
    const weeks = weeksResult.rows.map(row => row.week_start_date);
    
    if (!week && weeks.length === 0) {
      return NextResponse.json({ weeks: [], data: [] });
    }
    
    const selectedWeek = week || weeks[0];
    
    // Obtener datos de la semana seleccionada
    const dataResult = await pool.query(`
      SELECT 
        spw.player_tag,
        p.player_name,
        spw.season_points,
        spw.week_start_date
      FROM season_points_weekly spw
      JOIN players p ON spw.player_tag = p.player_tag
      WHERE spw.week_start_date = $1
      ORDER BY spw.season_points DESC
    `, [selectedWeek]);
    
    return NextResponse.json({
      weeks,
      selectedWeek,
      data: dataResult.rows
    });
    
  } catch (error) {
    console.error('Error fetching weekly trophies:', error);
    return NextResponse.json(
      { error: 'Error al obtener datos' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { player_tag, week_start_date, season_points } = body;
    
    if (!player_tag || !week_start_date || season_points === undefined) {
      return NextResponse.json(
        { success: false, message: 'Faltan datos requeridos' },
        { status: 400 }
      );
    }
    
    await pool.query(`
      UPDATE season_points_weekly 
      SET season_points = $1
        manually_edited = TRUE
      WHERE player_tag = $2 AND week_start_date = $3
    `, [season_points, player_tag, week_start_date]);
    
    return NextResponse.json({
      success: true,
      message: 'Copas actualizadas correctamente'
    });
    
  } catch (error) {
    console.error('Error updating weekly trophies:', error);
    return NextResponse.json(
      { success: false, message: 'Error al actualizar' },
      { status: 500 }
    );
  }
}
