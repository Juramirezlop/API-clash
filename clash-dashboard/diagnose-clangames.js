require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const TIER3_POINTS = { 1: 15, 2: 13, 3: 12, 4: 11, 5: 10, 6: 9, 7: 8, 8: 7, 9: 6, 10: 5, 11: 4, 12: 3, 13: 2, 14: 1, 15: 1 };

async function diagnoseClanGames() {
  console.log('🔍 DIAGNÓSTICO DE CLAN GAMES\n');
  console.log('═'.repeat(80) + '\n');
  
  try {
    const currentMonth = new Date().toISOString().substring(0, 7);
    
    // 1. Ver datos de season_events
    console.log('📊 PASO 1: Datos en season_events');
    const clanGamesRaw = await pool.query(`
      SELECT 
        p.player_name,
        se.player_tag,
        se.clan_games_points,
        se.clan_games_date,
        se.season_month
      FROM season_events se
      JOIN players p ON se.player_tag = p.player_tag
      WHERE se.season_month = $1
      AND se.clan_games_points > 0
      ORDER BY se.clan_games_points DESC
    `, [currentMonth]);
    
    console.log(`Total jugadores con Clan Games: ${clanGamesRaw.rows.length}`);
    console.log('\nTop 15:');
    console.log('Pos | Jugador              | Puntos CG | Fecha CG     | Puntos Esperados (Tier 3)');
    console.log('-'.repeat(80));
    
    clanGamesRaw.rows.slice(0, 15).forEach((row, idx) => {
      const expectedPoints = TIER3_POINTS[idx + 1] || 0;
      console.log(`${String(idx + 1).padEnd(3)} | ${row.player_name.padEnd(20)} | ${String(row.clan_games_points).padEnd(9)} | ${row.clan_games_date || 'null'} | ${expectedPoints} pts`);
    });
    
    // 2. Ver puntos asignados en player_scores
    console.log('\n\n📊 PASO 2: Puntos asignados en player_scores (event_points)');
    const assignedPoints = await pool.query(`
      SELECT 
        p.player_name,
        ps.player_tag,
        ps.event_points,
        se.clan_games_points
      FROM player_scores ps
      JOIN players p ON ps.player_tag = p.player_tag
      LEFT JOIN season_events se ON ps.player_tag = se.player_tag AND se.season_month = $1
      WHERE ps.season_month = $1
      AND ps.event_points > 0
      ORDER BY se.clan_games_points DESC
    `, [currentMonth]);
    
    console.log(`Total jugadores con event_points: ${assignedPoints.rows.length}`);
    console.log('\nTop 15 con puntos asignados:');
    console.log('Pos | Jugador              | Puntos CG | Event Points | Esperado | Match');
    console.log('-'.repeat(80));
    
    assignedPoints.rows.slice(0, 15).forEach((row, idx) => {
      const expectedPoints = TIER3_POINTS[idx + 1] || 0;
      const match = row.event_points === expectedPoints ? '✅' : '❌';
      console.log(`${String(idx + 1).padEnd(3)} | ${row.player_name.padEnd(20)} | ${String(row.clan_games_points || 0).padEnd(9)} | ${String(row.event_points).padEnd(12)} | ${String(expectedPoints).padEnd(8)} | ${match}`);
    });
    
    // 3. Verificar el query que usa calculateClanGamesPremium
    console.log('\n\n📊 PASO 3: Simulación del query de calculateClanGamesPremium');
    
    const seasonStartResult = await pool.query(`
      SELECT season_start_date 
      FROM season_config 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    const seasonStart = seasonStartResult.rows.length > 0 
      ? new Date(seasonStartResult.rows[0].season_start_date).toISOString().split('T')[0]
      : '2025-09-01';
    
    console.log(`Season Start Date: ${seasonStart}`);
    
    const queryResult = await pool.query(`
      SELECT se.player_tag,
        p.player_name,
        se.clan_games_points as current_points,
        COALESCE(baseline.clan_games_points, 0) as baseline_points,
        GREATEST(0, se.clan_games_points - COALESCE(baseline.clan_games_points, 0)) as season_points
      FROM season_events se
      JOIN players p ON se.player_tag = p.player_tag
      LEFT JOIN (
        SELECT player_tag, clan_games_points
        FROM season_events 
        WHERE created_at <= $2
        AND player_tag IN (SELECT player_tag FROM season_events WHERE season_month = $1)
      ) baseline ON se.player_tag = baseline.player_tag
      WHERE se.season_month = $1 
      AND se.clan_games_date >= $2
      AND se.clan_games_points > 0
      ORDER BY season_points DESC LIMIT 15
    `, [currentMonth, seasonStart]);
    
    console.log(`\nResultados del query (top 15):`);
    console.log('Pos | Jugador              | Current | Baseline | Season Pts | Tier3 Pts');
    console.log('-'.repeat(80));
    
    queryResult.rows.forEach((row, idx) => {
      const expectedPoints = TIER3_POINTS[idx + 1] || 0;
      console.log(`${String(idx + 1).padEnd(3)} | ${row.player_name.padEnd(20)} | ${String(row.current_points).padEnd(7)} | ${String(row.baseline_points).padEnd(8)} | ${String(row.season_points).padEnd(10)} | ${expectedPoints}`);
    });
    
    // 4. Verificar si hay baseline problemático
    console.log('\n\n📊 PASO 4: Verificación de baselines');
    const baselineCheck = await pool.query(`
      SELECT 
        se1.player_tag,
        p.player_name,
        se1.clan_games_points as current_points,
        se1.created_at as current_date,
        se2.clan_games_points as baseline_points,
        se2.created_at as baseline_date
      FROM season_events se1
      JOIN players p ON se1.player_tag = p.player_tag
      LEFT JOIN (
        SELECT player_tag, clan_games_points, created_at
        FROM season_events 
        WHERE created_at <= $2
      ) se2 ON se1.player_tag = se2.player_tag
      WHERE se1.season_month = $1
      AND se1.clan_games_points > 0
      ORDER BY se1.clan_games_points DESC
      LIMIT 5
    `, [currentMonth, seasonStart]);
    
    console.log('\nPrimeros 5 jugadores - análisis de baseline:');
    baselineCheck.rows.forEach(row => {
      console.log(`\n${row.player_name}:`);
      console.log(`  Current: ${row.current_points} puntos (${row.current_date})`);
      console.log(`  Baseline: ${row.baseline_points || 'null'} puntos (${row.baseline_date || 'n/a'})`);
    });
    
    console.log('\n' + '═'.repeat(80));
    console.log('\n✅ Diagnóstico completado\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

diagnoseClanGames();
