require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function check() {
    const result = await pool.query(`
        SELECT p.player_name, c.round_number, c.stars, c.attacks_used
        FROM cwl_wars c
        JOIN players p ON c.player_tag = p.player_tag
        WHERE c.cwl_season = '2025-10' 
        AND p.player_name IN ('hectro', 'ECARVAJAL 08', 'RodrigoХм×')
        ORDER BY p.player_name, c.round_number
    `);
    
    console.table(result.rows);
    await pool.end();
}

check();