require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function debugScores() {
    try {
        console.log('=== DEBUG PLAYER SCORES ===\n');
        
        // Ver puntos de donaciones específicos
        const donations = await pool.query(`
            SELECT ps.player_tag, p.player_name, ps.donation_points
            FROM player_scores ps
            JOIN players p ON ps.player_tag = p.player_tag
            WHERE ps.season_month = '2025-09'
            AND ps.donation_points > 0
            ORDER BY ps.donation_points DESC
        `);
        
        console.log('PUNTOS DE DONACIONES:');
        donations.rows.forEach(row => {
            console.log(`${row.player_name}: ${row.donation_points} puntos`);
        });
        
        // Ver datos de donaciones raw
        console.log('\nDATOS RAW DE DONACIONES (Top 5):');
        // CAMBIAR ESTA CONSULTA:
        const rawDonations = await pool.query(`
            SELECT DISTINCT ON (player_tag) 
                player_tag, donations_given, donations_received,
                (donations_given - donations_received) as balance
            FROM donations 
            WHERE recorded_at >= '2025-09-01'
            ORDER BY player_tag, recorded_at DESC
        `);

        // Y ordenar manualmente por donaciones:
        const sortedDonations = rawDonations.rows.sort((a, b) => b.donations_given - a.donations_given);

        console.log('\nDATOS RAW DE DONACIONES (Top 5):');
        sortedDonations.slice(0, 5).forEach(row => {
            console.log(`Tag: ${row.player_tag}, Donado: ${row.donations_given}, Balance: ${row.balance}`);
        });
        
        // Ver datos de Clan Games
        console.log('\nCLAN GAMES DATA:');
        const clanGames = await pool.query(`
            SELECT player_tag, clan_games_points, clan_games_date
            FROM season_events 
            WHERE season_month = '2025-09'
            AND clan_games_date >= '2025-09-01'
            AND clan_games_points > 0 AND clan_games_points < 10000
            ORDER BY clan_games_points DESC LIMIT 5
        `);
        
        clanGames.rows.forEach(row => {
            console.log(`Tag: ${row.player_tag}, Points: ${row.clan_games_points}, Date: ${row.clan_games_date}`);
        });
        
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
}

debugScores();