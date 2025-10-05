require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function test() {
  console.log('\n=== JUGADORES NUEVOS (< 7 días) ===');
  const newPlayers = await pool.query(`
    SELECT player_name, join_date, 
          EXTRACT(DAY FROM (NOW() - join_date)) as days_in_clan
    FROM players 
    WHERE is_active = true 
    AND join_date > NOW() - INTERVAL '7 days'
    ORDER BY join_date DESC
  `);
  console.log(newPlayers.rows);

  console.log('\n=== PENALIZACIONES DE CAPITAL ===');
  const penalties = await pool.query(`
    SELECT p.player_name, ps.capital_penalty, p.join_date
    FROM player_scores ps
    JOIN players p ON ps.player_tag = p.player_tag
    WHERE ps.season_month = '2025-10'
    AND ps.capital_penalty < 0
    ORDER BY ps.capital_penalty ASC
  `);
  console.log(penalties.rows);
    await pool.end();
    }

test();