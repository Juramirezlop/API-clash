import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

export async function POST() {
    try {
        const resetDate = new Date();
        const currentMonth = resetDate.toISOString().substring(0, 7);
        const resetDateStr = resetDate.toISOString().split('T')[0];
        
        console.log('🔄 Iniciando reset COMPLETO de temporada...');
        
        // 1. Crear tabla de baselines si no existe
        await pool.query(`
            CREATE TABLE IF NOT EXISTS donation_baselines (
                player_tag VARCHAR(20) PRIMARY KEY,
                baseline_donated INTEGER DEFAULT 0,
                baseline_received INTEGER DEFAULT 0,
                baseline_date TIMESTAMP DEFAULT NOW()
            )
        `);
        
        // 2. RESETEAR baselines a 0 (porque Clash of Clans resetea donaciones cada mes)
        await pool.query(`
            INSERT INTO donation_baselines (player_tag, baseline_donated, baseline_received, baseline_date)
            SELECT 
                player_tag, 
                0,
                0,
                NOW()
            FROM players
            WHERE is_active = true
            ON CONFLICT (player_tag) 
            DO UPDATE SET 
                baseline_donated = 0,
                baseline_received = 0,
                baseline_date = NOW()
        `);
        
        console.log('💾 Baselines de donaciones reseteados a 0');
        
        // 3. Crear backup de puntuaciones
        const backupSuffix = resetDate.toISOString().replace(/[-:]/g, '').substring(0, 13);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS player_scores_backup_${backupSuffix} AS 
            SELECT * FROM player_scores WHERE season_month = $1
        `, [currentMonth]);
        
        console.log(`💾 Backup creado: player_scores_backup_${backupSuffix}`);
        
        // 4. Reset puntuaciones Y PENALIZACIONES a 0
        await pool.query(`
            UPDATE player_scores 
            SET war_points = 0, cwl_points = 0, donation_points = 0, 
                capital_points = 0, event_points = 0, trophy_points = 0, 
                total_points = 0,
                donation_penalty = 0, war_penalty = 0, capital_penalty = 0,
                cwl_penalty = 0, clan_games_penalty = 0, inactivity_penalty = 0,
                total_penalties = 0,
                last_updated = NOW()
            WHERE season_month = $1
        `, [currentMonth]);
        
        console.log('✅ Puntuaciones y penalizaciones reseteadas a 0');
        
        // 5. BORRAR TODOS los datos históricos de guerras
        const deletedWars = await pool.query(`DELETE FROM wars`);
        console.log(`🗑️ Borradas TODAS las guerras: ${deletedWars.rowCount || 0} registros`);
        
        // 6. BORRAR TODOS los datos de capital raids
        const deletedCapital = await pool.query(`DELETE FROM capital_raids`);
        const deletedCapitalWeekly = await pool.query(`DELETE FROM capital_raids_weekly`);
        console.log(`🗑️ Borrados TODOS los registros de capital: ${(deletedCapital.rowCount || 0) + (deletedCapitalWeekly.rowCount || 0)}`);
        
        // 7. BORRAR TODOS los datos de CWL
        const deletedCWL = await pool.query(`DELETE FROM cwl_wars`);
        console.log(`🗑️ Borrados TODOS los registros de CWL: ${deletedCWL.rowCount || 0}`);
        
        // 8. BORRAR TODOS los registros semanales de copas
        const deletedTrophies = await pool.query(`DELETE FROM season_points_weekly`);
        console.log(`🗑️ Borrados TODOS los registros de copas semanales: ${deletedTrophies.rowCount || 0}`);
        
        // 9. Reset Clan Games a 0 y borrar fechas
        await pool.query(`
            UPDATE season_events 
            SET clan_games_points = 0, clan_games_date = NULL
            WHERE season_month = $1
        `, [currentMonth]);
        
        console.log('✅ Clan Games reseteado a 0');
        
        // 10. Insertar nueva configuración de temporada
        await pool.query(`
            INSERT INTO season_config (season_start_date, season_name) 
            VALUES ($1, $2)
        `, [resetDate, `Temporada ${resetDate.toLocaleDateString('es-ES')}`]);
        
        console.log('✅ Nueva temporada configurada');
        
        // 11. Obtener conteo de jugadores activos
        const activePlayersCount = await pool.query(`
            SELECT COUNT(*) FROM players WHERE is_active = true
        `);
        
        console.log(`👥 ${activePlayersCount.rows[0].count} jugadores activos`);
        
        return NextResponse.json({
            success: true,
            message: 'Reset de temporada completado - baselines en 0',
            data: {
                reset_date: resetDate.toISOString(),
                backup_table: `player_scores_backup_${backupSuffix}`,
                players_reset: activePlayersCount.rows[0].count,
                deleted_wars: deletedWars.rowCount || 0,
                deleted_capital: (deletedCapital.rowCount || 0) + (deletedCapitalWeekly.rowCount || 0),
                deleted_cwl: deletedCWL.rowCount || 0,
                deleted_trophies: deletedTrophies.rowCount || 0,
                baselines_reset_to_zero: true
            }
        });
        
    } catch (error) {
        console.error('❌ Error en reset:', error);
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
