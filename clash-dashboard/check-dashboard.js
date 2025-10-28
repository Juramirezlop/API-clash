require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// =====================================================
// 📊 Verificar Estado del Dashboard
// =====================================================
// 
// Este script muestra un resumen de todos los datos
// importantes del dashboard
//
// =====================================================

async function checkDashboard() {
  console.log('📊 RESUMEN DEL DASHBOARD\n');
  console.log('═'.repeat(60) + '\n');
  
  try {
    // 1. Jugadores activos
    const players = await pool.query(`
      SELECT COUNT(*) as total FROM players WHERE is_active = true
    `);
    console.log(`👥 Jugadores activos: ${players.rows[0].total}\n`);
    
    // 2. Copas semanales
    const weeks = await pool.query(`
      SELECT DISTINCT week_start_date, COUNT(*) as players
      FROM season_points_weekly
      GROUP BY week_start_date
      ORDER BY week_start_date DESC
      LIMIT 5
    `);
    
    console.log('🏆 Copas semanales (últimas 5 semanas):');
    if (weeks.rows.length > 0) {
      weeks.rows.forEach(row => {
        const date = new Date(row.week_start_date);
        console.log(`   ${date.toLocaleDateString()}: ${row.players} jugadores`);
      });
    } else {
      console.log('   ⚠️ No hay datos de copas semanales');
    }
    console.log('');
    
    // 3. Guerras
    const wars = await pool.query(`
      SELECT COUNT(DISTINCT war_tag) as total FROM wars WHERE war_type = 'regular'
    `);
    console.log(`⚔️ Guerras registradas: ${wars.rows[0].total}\n`);
    
    // 4. CWL
    const cwl = await pool.query(`
      SELECT COUNT(DISTINCT cwl_season) as seasons,
             COUNT(DISTINCT player_tag) as players
      FROM cwl_wars
    `);
    console.log(`🏆 CWL:`);
    console.log(`   Temporadas: ${cwl.rows[0].seasons}`);
    console.log(`   Jugadores: ${cwl.rows[0].players}\n`);
    
    // 5. Capital
    const capital = await pool.query(`
      SELECT COUNT(DISTINCT weekend_date) as weekends,
             COUNT(DISTINCT player_tag) as players
      FROM capital_raids
    `);
    console.log(`🏰 Capital:`);
    console.log(`   Fines de semana: ${capital.rows[0].weekends}`);
    console.log(`   Jugadores: ${capital.rows[0].players}\n`);
    
    // 6. Clan Games
    const clanGames = await pool.query(`
      SELECT COUNT(*) as players,
             SUM(clan_games_points) as total_points
      FROM season_events
      WHERE clan_games_points > 0
    `);
    console.log(`🎯 Clan Games:`);
    console.log(`   Jugadores participando: ${clanGames.rows[0].players}`);
    console.log(`   Puntos totales: ${clanGames.rows[0].total_points || 0}\n`);
    
    // 7. Protecciones
    console.log('🛡️ Protecciones manually_edited:');
    const tables = ['wars', 'capital_raids_weekly', 'cwl_wars', 'season_points_weekly'];
    
    for (const table of tables) {
      const check = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = $1 AND column_name = 'manually_edited'
      `, [table]);
      
      const hasProtection = check.rows.length > 0;
      const icon = hasProtection ? '✅' : '❌';
      
      if (hasProtection) {
        const stats = await pool.query(`
          SELECT SUM(CASE WHEN manually_edited = TRUE THEN 1 ELSE 0 END) as edited
          FROM ${table}
        `);
        const edited = stats.rows[0].edited || 0;
        console.log(`   ${icon} ${table} (${edited} editados)`);
      } else {
        console.log(`   ${icon} ${table} (sin protección)`);
      }
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log('\n✅ Dashboard verificado correctamente\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDashboard();
