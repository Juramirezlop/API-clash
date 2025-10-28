import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function GET() {
  try {
    const currentYear = new Date().getFullYear();
    const currentMonthNum = new Date().getMonth() + 1;
    
    console.log(`📅 Buscando copas para: ${currentYear}-${String(currentMonthNum).padStart(2, '0')}`);
    
    // Obtener TODAS las semanas del mes actual
    const result = await pool.query(`
      SELECT 
        p.player_name,
        spw.player_tag,
        TO_CHAR(spw.week_start_date, 'YYYY-MM-DD') as week_start_date,
        spw.season_points
      FROM season_points_weekly spw
      JOIN players p ON spw.player_tag = p.player_tag
      WHERE p.is_active = true
        AND EXTRACT(YEAR FROM spw.week_start_date) = $1
        AND EXTRACT(MONTH FROM spw.week_start_date) = $2
      ORDER BY spw.player_tag, spw.week_start_date, spw.season_points DESC
    `, [currentYear, currentMonthNum]);
    
    console.log(`📊 Registros encontrados: ${result.rows.length}`);
    
    if (result.rows.length === 0) {
      console.log('⚠️ No hay datos de copas semanales para este mes');
      return NextResponse.json({ players: [], weeks: [] });
    }
    
    // Obtener semanas únicas y ordenarlas
    const weeksSet = new Set<string>();
    result.rows.forEach(row => weeksSet.add(row.week_start_date));
    const sortedWeeks = Array.from(weeksSet).sort();
    
    console.log(`📅 Semanas encontradas: ${sortedWeeks.join(', ')}`);
    
    // Crear mapeo de semana a número
    const weekNumbers = new Map<string, number>();
    sortedWeeks.forEach((week, index) => {
      weekNumbers.set(week, index + 1);
    });
    
    // Agrupar por jugador
    const playerMap = new Map();
    
    for (const row of result.rows) {
      if (!playerMap.has(row.player_tag)) {
        playerMap.set(row.player_tag, {
          player_name: row.player_name,
          player_tag: row.player_tag,
          weeks: [],
          total: 0
        });
      }
      
      const player = playerMap.get(row.player_tag);
      const weekNumber = weekNumbers.get(row.week_start_date);
      
      // Buscar si ya existe esta semana para este jugador
      const existingWeek = player.weeks.find((w: any) => w.week === row.week_start_date);
      
      if (existingWeek) {
        // Si existe, tomar el máximo de trofeos
        if (row.season_points > existingWeek.trophies) {
          player.total = player.total - existingWeek.trophies + row.season_points;
          existingWeek.trophies = row.season_points;
        }
      } else {
        // Si no existe, agregar
        player.weeks.push({
          week: row.week_start_date,
          week_number: weekNumber,
          trophies: row.season_points
        });
        player.total += row.season_points;
      }
    }
    
    // Convertir a array y ordenar por total
    const players = Array.from(playerMap.values())
      .sort((a, b) => b.total - a.total);
    
    console.log(`👥 Jugadores procesados: ${players.length}`);
    if (players.length > 0) {
      console.log(`🏆 Top 3: ${players.slice(0, 3).map(p => `${p.player_name}(${p.total})`).join(', ')}`);
    }
    
    // Añadir información de semanas disponibles
    const response = {
      players,
      weeks: sortedWeeks.map((week, index) => ({
        date: week,
        number: index + 1
      }))
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('❌ Error fetching monthly trophies:', error);
    return NextResponse.json(
      { error: 'Error al obtener copas mensuales' },
      { status: 500 }
    );
  }
}