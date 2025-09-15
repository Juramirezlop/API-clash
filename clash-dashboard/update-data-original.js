require('dotenv').config({ path: '.env.local' });
const axios = require('axios');
const { Pool } = require('pg');

// Configuración
const API_KEY = process.env.CLASH_API_KEY;
const CLAN_TAG = process.env.CLAN_TAG;
const DATABASE_URL = process.env.DATABASE_URL;

const headers = {
    'Authorization': `Bearer ${API_KEY}`,
    'Accept': 'application/json'
};

// Conexión a PostgreSQL
const pool = new Pool({
    connectionString: DATABASE_URL
});

// Sistema de puntuación (1°=10pts, 2°=8pts, etc.)
const POINTS_SYSTEM = {
    1: 10, 2: 8, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1
};

// 🎯 FECHA LÍMITE: Solo datos desde 1 septiembre 2025
const SEASON_START = new Date('2025-09-01T00:00:00.000Z');

class ClashDataUpdater {
    
    async updateAllData() {
        console.log('🚀 Iniciando actualización completa de datos...');
        console.log(`🗓️ Filtrando datos desde: ${SEASON_START.toISOString().split('T')[0]}\n`);
        
        try {
            // 1. Obtener miembros del clan
            const members = await this.getClanMembers();
            console.log(`👥 Miembros encontrados: ${members.length}\n`);
            
            // 2. Actualizar tabla de jugadores
            await this.updatePlayersTable(members);
            
            // 3. Obtener datos individuales de cada jugador
            console.log('📊 Obteniendo datos individuales...');
            for (let i = 0; i < members.length; i++) {
                const member = members[i];
                console.log(`   ${i + 1}/${members.length}: ${member.name}`);
                
                try {
                    const playerData = await this.getPlayerData(member.tag);
                    await this.updatePlayerStats(member.tag, playerData);
                    
                    // Pausa pequeña para no saturar la API
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.error(`     ❌ Error con ${member.name}: ${error.message}`);
                }
            }
            
            // 4. Obtener datos de guerras Y capital
            console.log('\n⚔️ Obteniendo datos de guerras y capital...');
            await this.updateWarData();
            await this.updateCapitalData();
            
            // 5. Verificar y obtener CWL si existe
            console.log('\n🏆 Verificando datos de CWL...');
            await this.updateCWLData();
            
            // 6. Calcular puntuaciones
            console.log('\n🧮 Calculando puntuaciones...');
            await this.calculateAllScores();
            
            console.log('\n✅ ¡Actualización completada exitosamente!');
            
        } catch (error) {
            console.error('❌ Error en la actualización:', error.message);
        } finally {
            await pool.end();
        }
    }
    
    async getClanMembers() {
        const encodedClanTag = encodeURIComponent(`#${CLAN_TAG}`);
        const url = `https://api.clashofclans.com/v1/clans/${encodedClanTag}`;
        
        const response = await axios.get(url, { headers });
        return response.data.memberList;
    }
    
    async updatePlayersTable(members) {
        console.log('💾 Actualizando tabla de jugadores...');
        
        for (const member of members) {
            await pool.query(`
                INSERT INTO players (player_tag, player_name, last_seen, is_active) 
                VALUES ($1, $2, NOW(), true)
                ON CONFLICT (player_tag) 
                DO UPDATE SET 
                    player_name = $2,
                    last_seen = NOW(),
                    is_active = true,
                    updated_at = NOW()
            `, [member.tag.replace('#', ''), member.name]);
        }
        
        // Marcar como inactivos a los que no están en el clan
        const activeTags = members.map(m => m.tag.replace('#', ''));
        if (activeTags.length > 0) {
            await pool.query(`
                UPDATE players 
                SET is_active = false 
                WHERE player_tag NOT IN (${activeTags.map((_, i) => `$${i + 1}`).join(',')})
            `, activeTags);
        }
    }
    
    async getPlayerData(playerTag) {
        const encodedTag = encodeURIComponent(playerTag);
        const url = `https://api.clashofclans.com/v1/players/${encodedTag}`;
        
        const response = await axios.get(url, { headers });
        return response.data;
    }
    
    async updatePlayerStats(playerTag, playerData) {
        const cleanTag = playerTag.replace('#', '');
        const today = new Date().toISOString().split('T')[0];
        
        // Actualizar donaciones (siempre, para tener datos actuales)
        await pool.query(`
            INSERT INTO donations (player_tag, donations_given, donations_received, donation_ratio, recorded_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (player_tag, recorded_at)
            DO UPDATE SET
                donations_given = $2,
                donations_received = $3,
                donation_ratio = $4
        `, [
            cleanTag,
            playerData.donations || 0,
            playerData.donationsReceived || 0,
            playerData.donationsReceived > 0 ? (playerData.donations / playerData.donationsReceived).toFixed(2) : 0,
            today
        ]);
        
        // Actualizar puntos de temporada
        await pool.query(`
            INSERT INTO season_events (player_tag, season_points, season_month)
            VALUES ($1, $2, $3)
            ON CONFLICT (player_tag, season_month)
            DO UPDATE SET season_points = $2
        `, [
            cleanTag,
            playerData.trophies || 0,
            new Date().toISOString().substring(0, 7) // YYYY-MM
        ]);
    }
    
    async updateWarData() {
        try {
            // Obtener guerra actual
            await this.getCurrentWar();
            
            // Obtener historial de guerras (ARREGLADO)
            await this.getWarHistory();
            
        } catch (error) {
            console.error('⚠️ Error obteniendo datos de guerra:', error.message);
        }
    }
    
    // 🏰 Actualizar datos del Capital del Clan
    async updateCapitalData() {
        console.log('🏰 Obteniendo datos del Capital del Clan...');
        
        try {
            const encodedClanTag = encodeURIComponent(`#${CLAN_TAG}`);
            const url = `https://api.clashofclans.com/v1/clans/${encodedClanTag}/capitalraidseasons`;
            
            const response = await axios.get(url, { headers });
            const seasons = response.data.items || [];
            
            console.log(`   📅 Temporadas de capital encontradas: ${seasons.length}`);
            
            let processedSeasons = 0;
            
            // Filtrar y procesar temporadas desde septiembre 2025
            for (const season of seasons) {
                const weekendDate = this.parseCoCSDate(season.startTime);
                
                // Solo procesar si es desde 1 septiembre 2025
                if (weekendDate < SEASON_START) {
                    continue;
                }
                
                const weekendDateStr = weekendDate.toISOString().split('T')[0];
                console.log(`   📊 Procesando fin de semana: ${weekendDateStr}`);
                processedSeasons++;
                
                // Procesar miembros de esta temporada
                for (const member of season.members || []) {
                    const cleanTag = member.tag.replace('#', '');
                    const attacksUsed = member.attackCount || 0;
                    const totalDestroyed = member.capitalResourcesLooted || 0;
                    const avgPerAttack = attacksUsed > 0 ? (totalDestroyed / attacksUsed) : 0;
                    
                    await pool.query(`
                        INSERT INTO capital_raids (
                            player_tag, 
                            capital_destroyed, 
                            attacks_used, 
                            average_per_attack, 
                            weekend_date
                        )
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (player_tag, weekend_date)
                        DO UPDATE SET
                            capital_destroyed = $2,
                            attacks_used = $3,
                            average_per_attack = $4
                    `, [cleanTag, totalDestroyed, attacksUsed, avgPerAttack, weekendDateStr]);
                }
                
                if (processedSeasons >= 8) break;
            }
            
            console.log(`   ✅ Capital actualizado: ${processedSeasons} temporadas procesadas`);
            
        } catch (error) {
            console.error('   ❌ Error obteniendo capital:', error.message);
        }
    }
    
    async getCurrentWar() {
        const encodedClanTag = encodeURIComponent(`#${CLAN_TAG}`);
        const url = `https://api.clashofclans.com/v1/clans/${encodedClanTag}/currentwar`;
        
        try {
            const response = await axios.get(url, { headers });
            const war = response.data;
            
            if (war.state === 'notInWar') {
                console.log('   ⚪ No hay guerra actual');
                return;
            }
            
            console.log(`   ⚔️ Guerra actual: ${war.state}`);
            
            // Usar startTime para guerra actual (más confiable)
            const warDate = this.parseCoCSDate(war.startTime || war.preparationStartTime);
            const warTag = this.generateWarTag(war.startTime || war.preparationStartTime, war.clan.tag);
            
            // Filtrar: Solo si es desde septiembre 2025
            if (warDate < SEASON_START) {
                console.log('   ⏭️ Guerra muy antigua, saltando...');
                return;
            }
            
            const isCWL = war.warType === 'cwl';
            console.log(`   📋 Tipo: ${isCWL ? 'Liga de Guerras (CWL)' : 'Guerra Regular'}`);
            console.log(`   📅 Fecha procesada: ${warDate.toISOString()}`);
            console.log(`   🏷️ War tag: ${warTag}`);
            
            // Guardar datos de la guerra
            for (const member of war.clan.members || []) {
                const cleanTag = member.tag.replace('#', '');
                const totalStars = member.attacks?.reduce((sum, attack) => sum + attack.stars, 0) || 0;
                
                if (isCWL) {
                    const currentSeason = warDate.toISOString().substring(0, 7);
                    const roundNumber = this.getCWLRound(warDate);
                    
                    await pool.query(`
                        INSERT INTO cwl_wars (player_tag, stars, attacks_used, cwl_season, round_number, recorded_date)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (player_tag, cwl_season, round_number)
                        DO UPDATE SET 
                            stars = GREATEST(cwl_wars.stars, $2),
                            attacks_used = GREATEST(cwl_wars.attacks_used, $3)
                    `, [cleanTag, totalStars, member.attacks?.length || 0, currentSeason, roundNumber, warDate]);
                } else {
                    await pool.query(`
                        INSERT INTO wars (player_tag, war_tag, stars, attacks_used, war_date, war_type)
                        VALUES ($1, $2, $3, $4, $5, 'regular')
                        ON CONFLICT (war_tag, player_tag)
                        DO UPDATE SET 
                            stars = GREATEST(wars.stars, $3),
                            attacks_used = GREATEST(wars.attacks_used, $4)
                    `, [cleanTag, warTag, totalStars, member.attacks?.length || 0, warDate]);
                }
            }
            
        } catch (error) {
            if (error.response?.status === 403) {
                console.log('   🔒 Guerra privada (no se puede acceder)');
            } else {
                throw error;
            }
        }
    }
    
    // 🔧 ARREGLADO: Usar endTime para el historial
    async getWarHistory() {
        const encodedClanTag = encodeURIComponent(`#${CLAN_TAG}`);
        const url = `https://api.clashofclans.com/v1/clans/${encodedClanTag}/warlog`;
        
        try {
            const response = await axios.get(url, { headers });
            const wars = response.data.items || [];
            
            console.log(`   📜 Historial: ${wars.length} guerras encontradas`);
            
            let processedWars = 0;
            let skippedWars = 0;
            
            for (const war of wars) {
                if (war.result === 'lose' || war.result === 'win' || war.result === 'tie') {
                    
                    // 🔧 USAR endTime en lugar de preparationStartTime
                    if (!war.endTime) {
                        skippedWars++;
                        continue;
                    }
                    
                    const warEndDate = this.parseCoCSDate(war.endTime);
                    
                    // Filtrar: Solo guerras que terminaron desde septiembre 2025
                    if (warEndDate < SEASON_START) {
                        break; // Parar aquí, las guerras están ordenadas por fecha
                    }
                    
                    // Generar tag único usando endTime
                    const warTag = this.generateWarTag(war.endTime, `#${CLAN_TAG}`);
                    processedWars++;
                    
                    // ⚠️ PROBLEMA: El historial no incluye datos de miembros
                    // Solo podemos guardar la guerra sin detalles de jugadores
                    console.log(`   📝 Guerra vs ${war.opponent?.name || 'Desconocido'}: ${war.result} (${warEndDate.toISOString().split('T')[0]})`);
                    
                    // ⚠️ SKIP: El historial no incluye datos de jugadores individuales
                    // No podemos insertar datos sin jugadores válidos
                    // await pool.query(...)  // Comentado por limitación de API
                }
            }
            
            console.log(`   ⚠️ LIMITACIÓN: El historial no incluye datos de jugadores individuales`);
            console.log(`   ✅ Procesadas: ${processedWars} guerras | Saltadas: ${skippedWars} sin fecha`);
            
        } catch (error) {
            console.error('   ⚠️ Error en historial de guerras:', error.message);
        }
    }
    
    // 🏆 NUEVA FUNCIÓN: Intentar obtener datos de CWL
    async updateCWLData() {
        try {
            const encodedClanTag = encodeURIComponent(`#${CLAN_TAG}`);
            const cwlUrl = `https://api.clashofclans.com/v1/clans/${encodedClanTag}/currentwar/leaguegroup`;
            
            const response = await axios.get(cwlUrl, { headers });
            const cwlData = response.data;
            
            console.log('   ✅ ¡Datos de CWL encontrados!');
            console.log(`   📅 Temporada: ${cwlData.season}`);
            console.log(`   🏆 Estado: ${cwlData.state}`);
            console.log(`   ⚔️ Rondas: ${cwlData.rounds?.length || 0}`);
            
            // Procesar cada ronda de CWL
            if (cwlData.rounds && cwlData.rounds.length > 0) {
                for (let roundIndex = 0; roundIndex < cwlData.rounds.length; roundIndex++) {
                    const round = cwlData.rounds[roundIndex];
                    console.log(`   📊 Procesando ronda ${roundIndex + 1} (${round.length} guerras)`);
                    
                    // Cada ronda puede tener múltiples guerras
                    for (const warTag of round) {
                        try {
                            // Obtener detalles de cada guerra de CWL
                            const warUrl = `https://api.clashofclans.com/v1/clanwarleagues/wars/${warTag}`;
                            const warResponse = await axios.get(warUrl, { headers });
                            const cwlWar = warResponse.data;
                            
                            const warDate = this.parseCoCSDate(cwlWar.startTime);
                            
                            // Solo procesar si es desde septiembre 2025
                            if (warDate >= SEASON_START) {
                                // Buscar nuestro clan en la guerra
                                const ourClan = cwlWar.clans.find(clan => 
                                    clan.tag === `#${CLAN_TAG}`
                                );
                                
                                if (ourClan && ourClan.members) {
                                    console.log(`     ⚔️ Guerra CWL encontrada: ${ourClan.members.length} miembros`);
                                    
                                    // Guardar datos de cada miembro
                                    for (const member of ourClan.members) {
                                        const cleanTag = member.tag.replace('#', '');
                                        const totalStars = member.attacks?.reduce((sum, attack) => sum + attack.stars, 0) || 0;
                                        
                                        await pool.query(`
                                            INSERT INTO cwl_wars (player_tag, stars, attacks_used, cwl_season, round_number, recorded_date)
                                            VALUES ($1, $2, $3, $4, $5, $6)
                                            ON CONFLICT (player_tag, cwl_season, round_number)
                                            DO UPDATE SET 
                                                stars = cwl_wars.stars + $2,
                                                attacks_used = cwl_wars.attacks_used + $3
                                        `, [cleanTag, totalStars, member.attacks?.length || 0, cwlData.season, roundIndex + 1, warDate]);
                                    }
                                }
                            }
                            
                        } catch (warError) {
                            console.log(`     ⚠️ Error obteniendo guerra CWL: ${warError.message}`);
                        }
                        
                        // Pausa para no saturar la API
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }
            }
            
        } catch (error) {
            if (error.response?.status === 404) {
                console.log('   ❌ No hay CWL activa actualmente');
            } else {
                console.log(`   ⚠️ Error obteniendo CWL: ${error.message}`);
            }
        }
    }
    
    // Generar war_tag más corto
    generateWarTag(cocTimestamp, clanTag) {
        const date = this.parseCoCSDate(cocTimestamp);
        const dateStr = date.toISOString().replace(/[-:]/g, '').substring(0, 13);
        const clanSuffix = clanTag.replace('#', '').slice(-3);
        
        return `${dateStr}_${clanSuffix}`.substring(0, 20);
    }
    
    // Parsear fechas de Clash of Clans correctamente
    parseCoCSDate(cocDateString) {
        if (!cocDateString) {
            return new Date('2020-01-01'); // Fecha muy antigua para filtrar
        }
        
        try {
            let isoString = cocDateString;
            
            if (!isoString.endsWith('Z')) {
                isoString += 'Z';
            }
            
            if (isoString.length >= 17 && isoString.indexOf('-') === -1) {
                isoString = isoString.replace(
                    /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
                    '$1-$2-$3T$4:$5:$6'
                );
            }
            
            const date = new Date(isoString);
            
            if (isNaN(date.getTime())) {
                return new Date('2020-01-01'); // Fecha muy antigua para filtrar
            }
            
            return date;
        } catch (error) {
            return new Date('2020-01-01'); // Fecha muy antigua para filtrar
        }
    }
    
    // Determinar ronda de CWL basada en la fecha
    getCWLRound(warDate) {
        const dayOfMonth = warDate.getDate();
        
        if (dayOfMonth <= 7) return 1;
        if (dayOfMonth <= 9) return 2;
        if (dayOfMonth <= 11) return 3;
        if (dayOfMonth <= 13) return 4;
        if (dayOfMonth <= 15) return 5;
        if (dayOfMonth <= 17) return 6;
        return 7;
    }
    
    async calculateAllScores() {
        const currentMonth = new Date().toISOString().substring(0, 7);
        
        await this.calculateDonationPoints(currentMonth);
        await this.calculateEventPoints(currentMonth);
        await this.calculateWarPoints(currentMonth);
        await this.calculateCWLPoints(currentMonth);
        await this.calculateCapitalPoints(currentMonth);
        await this.calculateTotalPoints(currentMonth);
    }
    
    async calculateDonationPoints(month) {
        console.log('   💝 Calculando puntos de donaciones...');
        
        // Solo donaciones desde septiembre 2025
        const topDonors = await pool.query(`
            SELECT player_tag, donations_given 
            FROM donations 
            WHERE recorded_at >= $1
            AND donations_given > 0
            ORDER BY donations_given DESC 
            LIMIT 8
        `, [SEASON_START.toISOString().split('T')[0]]);
        
        const topBalanced = await pool.query(`
            SELECT player_tag, donation_ratio 
            FROM donations 
            WHERE recorded_at >= $1
            AND donations_received > 0 AND donation_ratio > 0
            ORDER BY donation_ratio DESC 
            LIMIT 8
        `, [SEASON_START.toISOString().split('T')[0]]);
        
        // Limpiar puntos de donación del mes
        await pool.query(`
            INSERT INTO player_scores (player_tag, season_month, donation_points)
            SELECT DISTINCT player_tag, $1, 0
            FROM donations 
            WHERE recorded_at >= $2
            ON CONFLICT (player_tag, season_month) 
            DO UPDATE SET donation_points = 0
        `, [month, SEASON_START.toISOString().split('T')[0]]);
        
        // Asignar puntos a donadores
        for (let i = 0; i < topDonors.rows.length; i++) {
            const points = POINTS_SYSTEM[i + 1] || 0;
            await this.upsertPlayerScore(topDonors.rows[i].player_tag, 'donation_points', points, month);
        }
        
        // Sumar puntos adicionales a equilibrados
        for (let i = 0; i < topBalanced.rows.length; i++) {
            const points = POINTS_SYSTEM[i + 1] || 0;
            await pool.query(`
                INSERT INTO player_scores (player_tag, donation_points, season_month)
                VALUES ($1, $2, $3)
                ON CONFLICT (player_tag, season_month)
                DO UPDATE SET donation_points = player_scores.donation_points + $2
            `, [topBalanced.rows[i].player_tag, points, month]);
        }
    }
    
    async calculateEventPoints(month) {
        console.log('   🎯 Calculando puntos de eventos...');
        
        const topEvents = await pool.query(`
            SELECT player_tag, season_points 
            FROM season_events 
            WHERE season_month = $1
            ORDER BY season_points DESC 
            LIMIT 8
        `, [month]);
        
        for (let i = 0; i < topEvents.rows.length; i++) {
            const points = POINTS_SYSTEM[i + 1] || 0;
            await this.upsertPlayerScore(topEvents.rows[i].player_tag, 'event_points', points, month);
        }
    }
    
    async calculateWarPoints(month) {
        console.log('   ⚔️ Calculando puntos de guerras...');
        
        // Solo guerras desde septiembre 2025
        const topWarStars = await pool.query(`
            SELECT player_tag, SUM(stars) as total_stars
            FROM wars 
            WHERE war_date >= $1
            AND war_type = 'regular'
            AND player_tag != 'CLAN_SUMMARY'
            GROUP BY player_tag
            HAVING SUM(stars) > 0
            ORDER BY total_stars DESC 
            LIMIT 8
        `, [SEASON_START]);
        
        for (let i = 0; i < topWarStars.rows.length; i++) {
            const points = POINTS_SYSTEM[i + 1] || 0;
            await this.upsertPlayerScore(topWarStars.rows[i].player_tag, 'war_points', points, month);
        }
    }
    
    async calculateCWLPoints(month) {
        console.log('   🏆 Calculando puntos de CWL...');
        
        // Solo CWL desde septiembre 2025
        const topCWLStars = await pool.query(`
            SELECT player_tag, SUM(stars) as total_stars
            FROM cwl_wars 
            WHERE cwl_season >= '2025-09'
            GROUP BY player_tag
            HAVING SUM(stars) > 0
            ORDER BY total_stars DESC 
            LIMIT 8
        `);
        
        for (let i = 0; i < topCWLStars.rows.length; i++) {
            const points = POINTS_SYSTEM[i + 1] || 0;
            await this.upsertPlayerScore(topCWLStars.rows[i].player_tag, 'cwl_points', points, month);
        }
    }
    
    async calculateCapitalPoints(month) {
        console.log('   🏰 Calculando puntos de capital...');
        
        // Solo capital desde septiembre 2025
        const topCapitalAvg = await pool.query(`
            SELECT player_tag, AVG(average_per_attack) as avg_per_attack
            FROM capital_raids 
            WHERE weekend_date >= $1
            AND attacks_used > 0
            GROUP BY player_tag
            HAVING AVG(average_per_attack) > 0
            ORDER BY avg_per_attack DESC 
            LIMIT 8
        `, [SEASON_START.toISOString().split('T')[0]]);
        
        for (let i = 0; i < topCapitalAvg.rows.length; i++) {
            const points = POINTS_SYSTEM[i + 1] || 0;
            await this.upsertPlayerScore(topCapitalAvg.rows[i].player_tag, 'capital_points', points, month);
        }
    }
    
    async upsertPlayerScore(playerTag, pointType, points, month) {
        await pool.query(`
            INSERT INTO player_scores (player_tag, ${pointType}, season_month)
            VALUES ($1, $2, $3)
            ON CONFLICT (player_tag, season_month)
            DO UPDATE SET ${pointType} = $2
        `, [playerTag, points, month]);
    }
    
    async calculateTotalPoints(month) {
        console.log('   🏆 Calculando puntos totales...');
        
        await pool.query(`
            UPDATE player_scores 
            SET total_points = COALESCE(war_points, 0) + COALESCE(cwl_points, 0) + 
                              COALESCE(donation_points, 0) + COALESCE(capital_points, 0) + 
                              COALESCE(event_points, 0),
                last_updated = NOW()
            WHERE season_month = $1
        `, [month]);
    }
}

// Ejecutar actualización
const updater = new ClashDataUpdater();
updater.updateAllData();