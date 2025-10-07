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
        
        // 2. Guardar baseline de donaciones ANTES de resetear
        await pool.query(`
            INSERT INTO donation_baselines (player_tag, baseline_donated, baseline_received, baseline_date)
            SELECT DISTINCT ON (player_tag) 
                player_tag, 
                donations_given, 
                donations_received,
                NOW()
            FROM donations
            ORDER BY player_tag, recorded_at DESC
            ON CONFLICT (player_tag) 
            DO UPDATE SET 
                baseline_donated = EXCLUDED.baseline_donated,
                baseline_received = EXCLUDED.baseline_received,
                baseline_date = NOW()
        `);
        
        console.log('💾 Baselines de donaciones guardados');
        
        // 3. Crear backup de puntuaciones
        const backupSuffix = resetDate.toISOString().replace(/[-:]/g, '').substring(0, 13);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS player_scores_backup_${backupSuffix} AS 
            SELECT * FROM player_scores WHERE season_month = $1
        `, [currentMonth]);
        
        console.log(`💾 Backup creado: player_scores_backup_${backupSuffix}`);
        
        // 4. Reset puntuaciones a 0
        await pool.query(`
            UPDATE player_scores 
            SET war_points = 0, cwl_points = 0, donation_points = 0, 
                capital_points = 0, event_points = 0, trophy_points = 0, 
                total_points = 0, last_updated = NOW()
            WHERE season_month = $1
        `, [currentMonth]);
        
        console.log('✅ Puntuaciones reseteadas a 0');
        
        // 5. BORRAR TODOS los datos históricos de guerras
        const deletedWars = await pool.query(`DELETE FROM wars`);
        console.log(`🗑️ Borradas TODAS las guerras: ${deletedWars.rowCount} registros`);
        
        // 6. BORRAR TODOS los datos de capital raids
        const deletedCapital = await pool.query(`DELETE FROM capital_raids`);
        console.log(`🗑️ Borrados TODOS los registros de capital: ${deletedCapital.rowCount}`);
        
        // 7. BORRAR TODOS los datos de CWL
        const deletedCWL = await pool.query(`DELETE FROM cwl_wars`);
        console.log(`🗑️ Borrados TODOS los registros de CWL: ${deletedCWL.rowCount}`);
        
        // 8. Reset Clan Games a 0 y borrar fechas
        await pool.query(`
            UPDATE season_events 
            SET clan_games_points = 0, clan_games_date = NULL
            WHERE season_month = $1
        `, [currentMonth]);
        
        console.log('✅ Clan Games reseteado a 0');
        
        // 9. Insertar nueva configuración de temporada
        await pool.query(`
            INSERT INTO season_config (season_start_date, season_name) 
            VALUES ($1, $2)
        `, [resetDate, `Temporada ${resetDate.toLocaleDateString('es-ES')}`]);
        
        console.log('✅ Nueva temporada configurada');
        
        // 10. Obtener conteo de jugadores activos
        const activePlayersCount = await pool.query(`
            SELECT COUNT(*) FROM players WHERE is_active = true
        `);
        
        console.log(`👥 ${activePlayersCount.rows[0].count} jugadores activos`);
        
        return NextResponse.json({
            success: true,
            message: 'Reset de temporada completado con baselines guardados',
            data: {
                reset_date: resetDate.toISOString(),
                backup_table: `player_scores_backup_${backupSuffix}`,
                players_reset: activePlayersCount.rows[0].count,
                deleted_wars: deletedWars.rowCount,
                deleted_capital: deletedCapital.rowCount,
                deleted_cwl: deletedCWL.rowCount,
                baselines_saved: true
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