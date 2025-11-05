require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkBaselines() {
  try {
    console.log('💸 VERIFICANDO BASELINES DE DONACIONES\n');
    console.log('='.repeat(100));
    
    // Ver los baselines guardados
    const baselines = await pool.query(`
      SELECT 
        p.player_name,
        db.baseline_donated,
        db.baseline_received,
        (db.baseline_donated - db.baseline_received) as baseline_balance,
        db.baseline_date
      FROM donation_baselines db
      JOIN players p ON db.player_tag = p.player_tag
      WHERE p.is_active = true
      ORDER BY db.baseline_donated DESC
    `);
    
    console.log(`Total jugadores con baseline: ${baselines.rows.length}\n`);
    console.log('Jugador              | Donadas  | Recibidas | Balance   | Fecha Baseline');
    console.log('-'.repeat(100));
    
    baselines.rows.forEach(row => {
      const balance = row.baseline_balance >= 0 ? `+${row.baseline_balance}` : row.baseline_balance;
      console.log(
        `${row.player_name.padEnd(20)} | ${String(row.baseline_donated).padEnd(8)} | ${String(row.baseline_received).padEnd(9)} | ${String(balance).padEnd(9)} | ${new Date(row.baseline_date).toLocaleString('es-ES')}`
      );
    });
    
    console.log('\n' + '='.repeat(100));
    
    // Comparar con donaciones actuales en la temporada
    console.log('\n📊 COMPARACIÓN: Baseline vs Donaciones Actuales de la Temporada\n');
    console.log('='.repeat(100));
    
    const comparison = await pool.query(`
      SELECT 
        p.player_name,
        db.baseline_donated,
        COALESCE(d.donations_given, 0) as season_donated,
        db.baseline_received,
        COALESCE(d.donations_received, 0) as season_received
      FROM donation_baselines db
      JOIN players p ON db.player_tag = p.player_tag
      LEFT JOIN (
        SELECT DISTINCT ON (player_tag)
          player_tag,
          donations_given,
          donations_received
        FROM donations
        ORDER BY player_tag, recorded_at DESC
      ) d ON db.player_tag = d.player_tag
      WHERE p.is_active = true
      ORDER BY season_donated DESC
      LIMIT 15
    `);
    
    console.log('Jugador              | Baseline | Temporada | Diferencia | Baseline | Temporada | Diferencia');
    console.log('                     | Donadas  | Donadas   | (Progreso) | Recibidas| Recibidas | (Progreso)');
    console.log('-'.repeat(100));
    
    comparison.rows.forEach(row => {
      const diffDonated = row.season_donated - row.baseline_donated;
      const diffReceived = row.season_received - row.baseline_received;
      
      console.log(
        `${row.player_name.padEnd(20)} | ${String(row.baseline_donated).padEnd(8)} | ${String(row.season_donated).padEnd(9)} | ${String(diffDonated).padStart(10)} | ${String(row.baseline_received).padEnd(8)} | ${String(row.season_received).padEnd(9)} | ${String(diffReceived).padStart(10)}`
      );
    });
    
    console.log('\n' + '='.repeat(100));
    console.log('\n💡 EXPLICACIÓN:');
    console.log('   - Baseline: Donaciones totales guardadas al hacer RESET');
    console.log('   - Temporada: Donaciones actuales en la tabla donations (calculadas desde baseline)');
    console.log('   - Diferencia: Si es 0, significa que aún no han donado desde el reset');
    console.log('   - Diferencia positiva: Han donado desde el reset\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkBaselines();
