import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

export async function POST() {
    try {
        const resetDate = new Date();
        const currentMonth = resetDate.toISOString().substring(0, 7);
        
        console.log('🔄 Iniciando reset de temporada...');
        
        // 1. Crear backup
        const backupSuffix = resetDate.toISOString().replace(/[-:]/g, '').substring(0, 13);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS player_scores_backup_${backupSuffix} AS 
            SELECT * FROM player_scores WHERE season_month = $1
        `, [currentMonth]);
        
        // 2. Reset Clan Games a 0
        await pool.query(`
            UPDATE season_events 
            SET clan_games_points = 0, clan_games_date = NULL
            WHERE season_month = $1
        `, [currentMonth]);
        
        // 3. Reset puntuaciones
        await pool.query(`
            UPDATE player_scores 
            SET war_points = 0, cwl_points = 0, donation_points = 0, 
                capital_points = 0, event_points = 0, trophy_points = 0, 
                total_points = 0, last_updated = NOW()
            WHERE season_month = $1
        `, [currentMonth]);
        
        // 4. Insertar nueva configuración de temporada
        await pool.query(`
            INSERT INTO season_config (season_start_date, season_name) 
            VALUES ($1, $2)
        `, [resetDate, `Reset ${resetDate.toLocaleDateString()}`]);
        
        // 5. Obtener conteo de jugadores
        const activePlayersCount = await pool.query(`
            SELECT COUNT(*) FROM players WHERE is_active = true
        `);
        
        return NextResponse.json({
            success: true,
            message: 'Reset de temporada completado',
            data: {
                reset_date: resetDate.toISOString(),
                backup_table: `player_scores_backup_${backupSuffix}`,
                players_reset: activePlayersCount.rows[0].count
            }
        });
        
    } catch (error) {
        console.error('Error en reset:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        return NextResponse.json(
            { 
                success: false, 
                message: 'Error en reset de temporada: ' + errorMessage 
            }, 
            { status: 500 }
        );
    }
}