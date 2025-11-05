require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runCustomQuery() {
  try {
    // 👇 ESCRIBE TU QUERY AQUÍ
    const query = `
      UPDATE donation_baselines db
SET 
    baseline_donated = 0,
    baseline_received = 0,
    baseline_date = NOW();
    `;
    
    console.log('🔍 Ejecutando query...\n');
    const result = await pool.query(query);
    
    console.log(`📊 Resultados: ${result.rows.length} filas\n`);
    console.table(result.rows);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

runCustomQuery();
