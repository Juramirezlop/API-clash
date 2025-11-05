require('dotenv').config({ path: '.env.local' });
const axios = require('axios');
const { Pool } = require('pg');

const API_KEY = process.env.CLASH_API_KEY;
const CLAN_TAG = process.env.CLAN_TAG;
const DATABASE_URL = process.env.DATABASE_URL;

const headers = {
    'Authorization': `Bearer ${API_KEY}`,
    'Accept': 'application/json'
};

const pool = new Pool({
    connectionString: DATABASE_URL
});

// ⭐ SISTEMAS DE PUNTUACIÓN - 10 CATEGORÍAS
const TIER1_POINTS = { 1: 30, 2: 27, 3: 24, 4: 21, 5: 19, 6: 17, 7: 15, 8: 13, 9: 11, 10: 9, 11: 7, 12: 5, 13: 3, 14: 2, 15: 1 };
const TIER2_POINTS = { 1: 20, 2: 18, 3: 16, 4: 14, 5: 12, 6: 10, 7: 8, 8: 7, 9: 6, 10: 5, 11: 4, 12: 3, 13: 2, 14: 1, 15: 1 };
const TIER3_POINTS = { 1: 15, 2: 13, 3: 12, 4: 11, 5: 10, 6: 9, 7: 8, 8: 7, 9: 6, 10: 5, 11: 4, 12: 3, 13: 2, 14: 1, 15: 1 };
const TIER4_POINTS = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 };

class AccumulativeClashUpdater {
    
    async updateAllData() {
        console.log('🚀 Iniciando actualización ACUMULATIVA...');
        
        const seasonStart = await this.getSeasonStartDate();
        console.log(`🗓️ Temporada desde: ${seasonStart.toISOString().split('T')[0]}\n`);
        
        try {
            const members = await this.getClanMembers();
            console.log(`👥 Miembros encontrados: ${members.length}\n`);
            
            await this.updatePlayersTable(members);
            
            console.log('📊 Actualizando datos individuales...');
            for (let i = 0; i < members.length; i++) {
                const member = members[i];
                console.log(`   ${i + 1}/${members.length}: ${member.name}`);
                
                try {
                    const playerData = await this.getPlayerData(member.tag);
                    await this.updatePlayerStats(member.tag, playerData, seasonStart, member.name);
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.error(`     ❌ Error con ${member.name}: ${error.message}`);
                }
            }
            
            console.log('\n⚔️ Actualizando guerras y capital (ACUMULATIVO)...');
            await this.updateWarDataAccumulative(seasonStart);
            await this.updateCapitalDataAccumulative(seasonStart);
            
            console.log('\n🏆 Verificando CWL...');
            await this.updateCWLData(seasonStart);
            
            console.log('\n🧮 Calculando puntuaciones con sistema de 10 categorías...');
            console.log('   🔥 Tier 1 (CWL): 30-27-24-21-19-17-15-13-11-9-7-5-3-2-1 pts');
            console.log('   🔶 Tier 2 (Capital): 20-18-16-14-12-10-8-7-6-5-4-3-2-1-1 pts');
            console.log('   🔷 Tier 3 (Guerras/Copas/Clan Games): 15-13-12-11-10-9-8-7-6-5-4-3-2-1-1 pts');
            console.log('   ⚪ Tier 4 (Donaciones): 5-4-3-2-1 pts\n');
            await this.calculateAllScoresFixed(seasonStart);
            
            console.log('\n⚠️ Calculando penalizaciones...');
            await this.calculateAllPenalties(seasonStart);
            
            console.log('\n✅ ¡Actualización acumulativa completada!');
            
        } catch (error) {
            console.error('❌ Error en la actualización:', error.message);
        } finally {
            await pool.end();
        }
    }
    
    async getSeasonStartDate() {
        try {
            const result = await pool.query(`
                SELECT season_start_date 
                FROM season_config 
                ORDER BY created_at DESC 
                LIMIT 1
            `);
            
            if (result.rows.length > 0) {
                return new Date(result.rows[0].season_start_date);
            }
            
            return new Date('2025-09-01T00:00:00.000Z');
            
        } catch (error) {
            console.log('⚠️ No se encontró configuración de temporada, usando septiembre 1');
            return new Date('2025-09-01T00:00:00.000Z');
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
                    is_active = true,
                    updated_at = NOW()
            `, [member.tag.replace('#', ''), member.name]);
        }
        
        const activeTags = members.map(m => m.tag.replace('#', ''));
        if (activeTags.length > 0) {
            const placeholders = activeTags.map((_, i) => `$${i + 1}`).join(',');
            await pool.query(`
                UPDATE players 
                SET is_active = false 
                WHERE player_tag NOT IN (${placeholders})
            `, activeTags);
        }
                
        // 🗑️ ELIMINAR PERMANENTEMENTE jugadores inactivos de TODAS las tablas
        console.log('🗑️ Eliminando jugadores que salieron del clan...');
        
        const inactivePlayers = await pool.query(`
            SELECT player_tag, player_name FROM players WHERE is_active = false
        `);
        
        if (inactivePlayers.rows.length > 0) {
            console.log(`   ⚠️ Encontrados ${inactivePlayers.rows.length} jugadores inactivos:`);
            inactivePlayers.rows.forEach(p => {
                console.log(`      - ${p.player_name} (#${p.player_tag})`);
            });
            
            const inactiveTags = inactivePlayers.rows.map(p => p.player_tag);
            
            // Eliminar de todas las tablas en orden
            await pool.query(`DELETE FROM player_scores WHERE player_tag = ANY($1)`, [inactiveTags]);
            await pool.query(`DELETE FROM season_points_weekly WHERE player_tag = ANY($1)`, [inactiveTags]);
            await pool.query(`DELETE FROM season_events WHERE player_tag = ANY($1)`, [inactiveTags]);
            await pool.query(`DELETE FROM capital_raids_weekly WHERE player_tag = ANY($1)`, [inactiveTags]);
            await pool.query(`DELETE FROM capital_raids WHERE player_tag = ANY($1)`, [inactiveTags]);
            await pool.query(`DELETE FROM cwl_wars WHERE player_tag = ANY($1)`, [inactiveTags]);
            await pool.query(`DELETE FROM wars WHERE player_tag = ANY($1)`, [inactiveTags]);
            await pool.query(`DELETE FROM donations WHERE player_tag = ANY($1)`, [inactiveTags]);
            await pool.query(`DELETE FROM donation_baselines WHERE player_tag = ANY($1)`, [inactiveTags]);
            await pool.query(`DELETE FROM players WHERE player_tag = ANY($1)`, [inactiveTags]);
            
            console.log(`   ✅ ${inactivePlayers.rows.length} jugadores eliminados de la base de datos`);
        } else {
            console.log('   ✅ No hay jugadores inactivos para eliminar');
        }
    }
    
    async getPlayerData(playerTag) {
        const encodedTag = encodeURIComponent(playerTag);
        const url = `https://api.clashofclans.com/v1/players/${encodedTag}`;
        
        const response = await axios.get(url, { headers });
        return response.data;
    }
    
    async updatePlayerStats(playerTag, playerData, seasonStart, playerName) {
        const cleanTag = playerTag.replace('#', '');
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = new Date().toISOString().substring(0, 7);
        
        // Obtener o crear baseline
        let baseline = await pool.query(`
            SELECT baseline_donated, baseline_received
            FROM donation_baselines
            WHERE player_tag = $1
        `, [cleanTag]);
        
        // Si no existe baseline, crearlo
        if (baseline.rows.length === 0) {
            await pool.query(`
                INSERT INTO donation_baselines (player_tag, baseline_donated, baseline_received)
                VALUES ($1, $2, $3)
            `, [cleanTag, playerData.donations || 0, playerData.donationsReceived || 0]);
            
            baseline = await pool.query(`
                SELECT baseline_donated, baseline_received
                FROM donation_baselines
                WHERE player_tag = $1
            `, [cleanTag]);
        }
        
        const baselineDonated = baseline.rows[0].baseline_donated || 0;
        const baselineReceived = baseline.rows[0].baseline_received || 0;
        
        const seasonDonated = Math.max(0, (playerData.donations || 0) - baselineDonated);
        const seasonReceived = Math.max(0, (playerData.donationsReceived || 0) - baselineReceived);
        
        const lastActivity = await pool.query(`
            SELECT d.donations_given, se.season_points as trophies, p.attack_wins
            FROM players p
            LEFT JOIN donations d ON p.player_tag = d.player_tag
            LEFT JOIN season_events se ON p.player_tag = se.player_tag AND se.season_month = $2
            WHERE p.player_tag = $1 
            ORDER BY d.recorded_at DESC LIMIT 1
        `, [cleanTag, currentMonth]);

        const currentTrophies = playerData.trophies || 0;
        const currentAttackWins = playerData.attackWins || 0;
        const previousDonations = lastActivity.rows.length > 0 ? lastActivity.rows[0].donations_given : 0;
        const previousTrophies = lastActivity.rows.length > 0 ? lastActivity.rows[0].trophies : 0;
        const previousAttackWins = lastActivity.rows.length > 0 ? lastActivity.rows[0].attack_wins : 0;

        // Detectar actividad (sin defensas)
        const hasActivity = (
            seasonDonated > previousDonations ||  // Donó
            currentTrophies !== previousTrophies ||  // Cambió copas
            currentAttackWins > previousAttackWins  // Atacó
        );

        if (hasActivity) {
            await pool.query(`
                UPDATE players 
                SET last_seen = NOW(), attack_wins = $2
                WHERE player_tag = $1
            `, [cleanTag, currentAttackWins]);
            console.log(`   🟢 Actividad detectada: ${playerName}`);
        }
        
        let donationRatio = 0;
        if (seasonReceived > 0 && seasonDonated >= 0) {
            donationRatio = parseFloat((seasonDonated / seasonReceived).toFixed(2));
        }

        await pool.query(`
            INSERT INTO donations (player_tag, donations_given, donations_received, donation_ratio, recorded_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (player_tag, recorded_at)
            DO UPDATE SET 
                donations_given = GREATEST(donations.donations_given, $2),
                donations_received = GREATEST(donations.donations_received, $3),
                donation_ratio = $4
        `, [cleanTag, seasonDonated, seasonReceived, donationRatio, today]);

        await pool.query(`
            INSERT INTO season_events (player_tag, season_points, season_month)
            VALUES ($1, $2, $3)
            ON CONFLICT (player_tag, season_month) DO UPDATE SET season_points = $2
        `, [cleanTag, currentTrophies, currentMonth]);

        // Guardar snapshot semanal de trofeos
        const todayDate = new Date();
        const dayOfWeek = todayDate.getDay();
        const weekStart = new Date(todayDate);
        const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        weekStart.setDate(todayDate.getDate() - daysToSubtract);
        weekStart.setHours(0, 0, 0, 0);
        const weekStartStr = weekStart.toISOString().split('T')[0];

        const manualCheckTrophies = await pool.query(`
            SELECT manually_edited FROM season_points_weekly 
            WHERE player_tag = $1 AND week_start_date = $2
        `, [cleanTag, weekStartStr]);

        if (manualCheckTrophies.rows.length > 0 && manualCheckTrophies.rows[0].manually_edited) {
            console.log(`   ✏️ ${playerName}: Copas editadas manualmente, saltando...`);
        } else {
            await pool.query(`
                INSERT INTO season_points_weekly (player_tag, season_points, week_start_date, season_month, manually_edited)
                VALUES ($1, $2, $3, $4, FALSE)
                ON CONFLICT (player_tag, week_start_date)
                DO UPDATE SET 
                    season_points = CASE 
                        WHEN season_points_weekly.manually_edited = TRUE 
                        THEN season_points_weekly.season_points 
                        ELSE GREATEST(season_points_weekly.season_points, $2) 
                    END
            `, [cleanTag, currentTrophies, weekStartStr, currentMonth]);
        }
    }
            
    async updateWarDataAccumulative(seasonStart) {
        try {
            await this.getCurrentWarAccumulative(seasonStart);
            await this.getWarHistoryAccumulative(seasonStart);
        } catch (error) {
            console.error('⚠️ Error obteniendo guerras:', error.message);
        }
    }
    
    async getCurrentWarAccumulative(seasonStart) {
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
            
            const warDate = this.parseCoCSDate(war.startTime || war.preparationStartTime);
            const warTag = this.generateWarTag(war.startTime || war.preparationStartTime, war.clan.tag);
            
            if (warDate < seasonStart) {
                console.log('   ⏭️ Guerra muy antigua, saltando...');
                return;
            }
            
            const isCWL = war.warType === 'cwl';
            console.log(`   📋 Tipo: ${isCWL ? 'Liga de Guerras (CWL)' : 'Guerra Regular'}`);
            console.log(`   📅 Fecha: ${warDate.toISOString().split('T')[0]}`);
            
            for (const member of war.clan.members || []) {
                const cleanTag = member.tag.replace('#', '');
                const totalStars = member.attacks?.reduce((sum, attack) => sum + attack.stars, 0) || 0;
                
                if (!isCWL) {
                    // Verificar si fue editado manualmente
                    const manualCheck = await pool.query(`
                        SELECT manually_edited FROM wars 
                        WHERE war_tag = $1 AND player_tag = $2
                    `, [warTag, cleanTag]);
                    
                    const isManuallyEdited = manualCheck.rows.length > 0 && manualCheck.rows[0].manually_edited;
                    
                    if (isManuallyEdited) {
                        // No sobrescribir si fue editado manualmente
                        console.log(`     ✏️ ${member.name}: Editado manualmente, saltando...`);
                        continue;
                    }
                    
                    await pool.query(`
                        INSERT INTO wars (player_tag, war_tag, stars, attacks_used, war_date, war_type, manually_edited)
                        VALUES ($1, $2, $3, $4, $5, 'regular', FALSE)
                        ON CONFLICT (war_tag, player_tag)
                        DO UPDATE SET 
                            stars = CASE WHEN wars.manually_edited = TRUE THEN wars.stars ELSE GREATEST(wars.stars, $3) END,
                            attacks_used = CASE WHEN wars.manually_edited = TRUE THEN wars.attacks_used ELSE GREATEST(wars.attacks_used, $4) END
                    `, [cleanTag, warTag, totalStars, member.attacks?.length || 0, warDate]);
                }
            }
            
        } catch (error) {
            if (error.response?.status === 403) {
                console.log('   🔒 Guerra privada');
            } else {
                throw error;
            }
        }
    }
    
    async getWarHistoryAccumulative(seasonStart) {
        const encodedClanTag = encodeURIComponent(`#${CLAN_TAG}`);
        const url = `https://api.clashofclans.com/v1/clans/${encodedClanTag}/warlog`;
        
        try {
            const response = await axios.get(url, { headers });
            const wars = response.data.items || [];
            
            console.log(`   📜 Historial: ${wars.length} guerras encontradas`);
            
            let processedWars = 0;
            
            for (const war of wars) {
                if (war.result === 'lose' || war.result === 'win' || war.result === 'tie') {
                    if (!war.endTime) continue;
                    
                    const warEndDate = this.parseCoCSDate(war.endTime);
                    if (warEndDate < seasonStart) break;
                    
                    processedWars++;
                    console.log(`     📝 Guerra registrada: ${warEndDate.toISOString().split('T')[0]}`);
                }
            }
            
            console.log(`   ✅ Procesadas: ${processedWars} guerras desde temporada actual`);
            
        } catch (error) {
            console.error('   ⚠️ Error en historial:', error.message);
        }
    }
    
    async updateCapitalDataAccumulative(seasonStart) {
        console.log('🏰 Actualizando capital (ACUMULATIVO)...');
        
        try {
            const encodedClanTag = encodeURIComponent(`#${CLAN_TAG}`);
            const url = `https://api.clashofclans.com/v1/clans/${encodedClanTag}/capitalraidseasons`;
            
            const response = await axios.get(url, { headers });
            const seasons = response.data.items || [];
            
            console.log(`   📅 Temporadas encontradas: ${seasons.length}`);
            
            let processedSeasons = 0;
            
            for (const season of seasons) {
                const weekendDate = this.parseCoCSDate(season.startTime);
                
                if (weekendDate < seasonStart) continue;
                
                const weekendDateStr = weekendDate.toISOString().split('T')[0];
                console.log(`   📊 Procesando: ${weekendDateStr}`);
                processedSeasons++;
                
                for (const member of season.members || []) {
                    const cleanTag = member.tag.replace('#', '');
                    const attacksUsed = member.attackCount || 0;
                    const totalDestroyed = member.capitalResourcesLooted || 0;
                    
                    const estimatedAttacks = attacksUsed > 0 ? attacksUsed : this.estimateAttacks(totalDestroyed);
                    const avgPerAttack = estimatedAttacks > 0 ? (totalDestroyed / estimatedAttacks) : 0;
                    
                    const manualCheck = await pool.query(`
                        SELECT manually_edited, attacks_used as manual_attacks
                        FROM capital_raids_weekly 
                        WHERE player_tag = $1 AND weekend_start_date = $2
                    `, [cleanTag, weekendDateStr]);

                    const isManuallyEdited = manualCheck.rows.length > 0 && manualCheck.rows[0].manually_edited;
                    
                    if (isManuallyEdited) {
                        const manualAttacks = manualCheck.rows[0].manual_attacks;
                        const manualAvg = manualAttacks > 0 ? (totalDestroyed / manualAttacks).toFixed(2) : '0.00';
                        
                        await pool.query(`
                            UPDATE capital_raids
                            SET capital_destroyed = $1,
                                average_per_attack = $2
                            WHERE player_tag = $3 AND weekend_date = $4
                        `, [totalDestroyed, manualAvg, cleanTag, weekendDateStr]);
                    } else {
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
                        `, [cleanTag, totalDestroyed, estimatedAttacks, avgPerAttack.toFixed(2), weekendDateStr]);
                    }
                    
                    await pool.query(`
                        INSERT INTO capital_raids_weekly (
                            player_tag, 
                            capital_destroyed, 
                            attacks_used, 
                            weekend_start_date,
                            manually_edited
                        )
                        VALUES ($1, $2, $3, $4, FALSE)
                        ON CONFLICT (player_tag, weekend_start_date)
                        DO UPDATE SET 
                            capital_destroyed = EXCLUDED.capital_destroyed,
                            attacks_used = CASE 
                                WHEN capital_raids_weekly.manually_edited = TRUE 
                                THEN capital_raids_weekly.attacks_used
                                ELSE EXCLUDED.attacks_used
                            END,
                            manually_edited = capital_raids_weekly.manually_edited
                    `, [cleanTag, totalDestroyed, estimatedAttacks, weekendDateStr]);
                }
                
                const activePlayers = await pool.query(`
                    SELECT player_tag FROM players WHERE is_active = true
                `);
                
                for (const player of activePlayers.rows) {
                    await pool.query(`
                        INSERT INTO capital_raids_weekly (
                            player_tag, 
                            capital_destroyed, 
                            attacks_used, 
                            weekend_start_date,
                            manually_edited
                        )
                        VALUES ($1, 0, 0, $2, FALSE)
                        ON CONFLICT (player_tag, weekend_start_date) DO NOTHING
                    `, [player.player_tag, weekendDateStr]);
                }
                
                if (processedSeasons >= 10) break;
            }
            
            console.log(`   ✅ Capital actualizado: ${processedSeasons} temporadas procesadas`);
            
        } catch (error) {
            console.error('   ❌ Error en capital:', error.message);
        }
    }
    
    estimateAttacks(destroyed) {
        if (destroyed === 0) return 0;
        if (destroyed <= 3000) return 1;
        if (destroyed <= 6500) return 2;
        if (destroyed <= 10000) return 3;
        if (destroyed <= 13500) return 4;
        if (destroyed <= 17000) return 5;
        return 6;
    }
    
    async updateCWLData(seasonStart) {
        try {
            const encodedClanTag = encodeURIComponent(`#${CLAN_TAG}`);
            const cwlUrl = `https://api.clashofclans.com/v1/clans/${encodedClanTag}/currentwar/leaguegroup`;
            
            const response = await axios.get(cwlUrl, { headers });
            const cwlData = response.data;
            
            console.log('   ✅ ¡Datos de CWL encontrados!');
            console.log(`   📅 Temporada: ${cwlData.season}`);
            console.log(`   🏆 Estado: ${cwlData.state}`);
            
            if (cwlData.rounds && cwlData.rounds.length > 0) {
                for (let roundIndex = 0; roundIndex < cwlData.rounds.length; roundIndex++) {
                    const round = cwlData.rounds[roundIndex];
                    const warTags = round?.warTags || [];
                    
                    if (!warTags || warTags.length === 0 || warTags[0] === '#0') {
                        console.log(`   ⏭️ Ronda ${roundIndex + 1} sin datos`);
                        continue;
                    }
                    
                    console.log(`   📊 Procesando ronda ${roundIndex + 1}`);
                    
                    for (const warTag of warTags) {
                        try {
                            const encodedWarTag = encodeURIComponent(warTag);
                            const warUrl = `https://api.clashofclans.com/v1/clanwarleagues/wars/${encodedWarTag}`;
                            const warResponse = await axios.get(warUrl, { headers });
                            const cwlWar = warResponse.data;
                            
                            const warDate = this.parseCoCSDate(cwlWar.startTime);
                            
                            if (warDate >= seasonStart) {
                                const ourClan = cwlWar.clan?.tag === `#${CLAN_TAG}` ? cwlWar.clan :
                                            cwlWar.opponent?.tag === `#${CLAN_TAG}` ? cwlWar.opponent : null;
                                
                                if (ourClan && ourClan.members) {
                                    for (const member of ourClan.members) {
                                        const cleanTag = member.tag.replace('#', '');
                                        const stars = member.attacks?.reduce((sum, attack) => sum + attack.stars, 0) || 0;
                                        const attacks = member.attacks?.length || 0;

                                        const manualCheckCWL = await pool.query(`
                                            SELECT manually_edited FROM cwl_wars 
                                            WHERE player_tag = $1 AND cwl_season = $2 AND round_number = $3
                                        `, [cleanTag, cwlData.season, roundIndex + 1]);
                                        
                                        if (manualCheckCWL.rows.length > 0 && manualCheckCWL.rows[0].manually_edited) {
                                            console.log(`     ✏️ ${member.name} R${roundIndex + 1}: Editado manualmente, saltando...`);
                                            continue;
                                        }
                                        
                                        await pool.query(`
                                            INSERT INTO cwl_wars (player_tag, stars, attacks_used, cwl_season, round_number, recorded_date)
                                            VALUES ($1, $2, $3, $4, $5, $6)
                                            ON CONFLICT (player_tag, cwl_season, round_number)
                                            DO UPDATE SET 
                                                stars = CASE WHEN cwl_wars.manually_edited = TRUE THEN cwl_wars.stars ELSE GREATEST(cwl_wars.stars, $2) END,
                                                attacks_used = CASE WHEN cwl_wars.manually_edited = TRUE THEN cwl_wars.attacks_used ELSE GREATEST(cwl_wars.attacks_used, $3) END
                                        `, [cleanTag, stars, attacks, cwlData.season, roundIndex + 1, warDate]);
                                    }
                                }
                            }
                            
                        } catch (warError) {
                            console.log(`     ⚠️ Error en guerra: ${warError.message}`);
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }
            }
            
            console.log('   ✅ CWL guardado por rondas');
            
        } catch (error) {
            if (error.response?.status === 404) {
                console.log('   ❌ No hay CWL activa');
            } else {
                console.log(`   ⚠️ Error CWL: ${error.message}`);
            }
        }
    }
        
    async calculateAllScoresFixed(seasonStart) {
        const currentMonth = new Date().toISOString().substring(0, 7);
        
        console.log('   🧹 Limpiando puntuaciones anteriores...');
        await pool.query(`
            UPDATE player_scores 
            SET donation_points = 0, event_points = 0, trophy_points = 0,
                war_points = 0, cwl_points = 0, capital_points = 0, total_points = 0
            WHERE season_month = $1
        `, [currentMonth]);
        
        await this.calculateTopDonors(currentMonth, seasonStart);
        await this.calculateBestBalance(currentMonth, seasonStart);
        await this.calculateCapitalTotal(currentMonth, seasonStart);
        await this.calculateWarTotal(currentMonth, seasonStart);
        await this.calculateWarAverage(currentMonth, seasonStart);
        await this.calculateTrophies(currentMonth);
        await this.calculateCWLPremium(currentMonth, seasonStart);
        await this.calculateClanGamesPremium(currentMonth, seasonStart);
    }
    
    async calculateTopDonors(month, seasonStart) {
        console.log('   👍 1. Donaciones (Cantidad) [Tier 4: 5pts]...');
        
        const allDonations = await pool.query(`
            SELECT DISTINCT ON (player_tag)
                player_tag, 
                donations_given
            FROM donations 
            WHERE recorded_at >= $1
            ORDER BY player_tag, recorded_at DESC
        `, [seasonStart]);
        
        const sortedDonors = allDonations.rows
            .filter(d => d.donations_given > 0)
            .sort((a, b) => b.donations_given - a.donations_given)
            .slice(0, 5);
        
        for (let i = 0; i < sortedDonors.length; i++) {
            const points = TIER4_POINTS[i + 1] || 0;
            await pool.query(`
                INSERT INTO player_scores (player_tag, donation_points, season_month)
                VALUES ($1, $2, $3)
                ON CONFLICT (player_tag, season_month)
                DO UPDATE SET donation_points = $2
            `, [sortedDonors[i].player_tag, points, month]);
        }
        
        console.log(`      ✅ Top ${sortedDonors.length} calculados`);
    }

    async calculateBestBalance(month, seasonStart) {
        console.log('   ⚖️ 2. Donaciones (Balance) [Tier 4: 5pts]...');
        
        const allBalance = await pool.query(`
            SELECT DISTINCT ON (player_tag)
                player_tag,
                donations_given,
                donations_received,
                (donations_given - donations_received) as balance
            FROM donations 
            WHERE recorded_at >= $1
            ORDER BY player_tag, recorded_at DESC
        `, [seasonStart]);
        
        const sortedBalance = allBalance.rows
            .filter(d => d.balance > 0)
            .sort((a, b) => b.balance - a.balance)
            .slice(0, 5);
        
        for (let i = 0; i < sortedBalance.length; i++) {
            const points = TIER4_POINTS[i + 1] || 0;
            await pool.query(`
                INSERT INTO player_scores (player_tag, donation_points, season_month)
                VALUES ($1, $2, $3)
                ON CONFLICT (player_tag, season_month)
                DO UPDATE SET donation_points = COALESCE(player_scores.donation_points, 0) + $2
            `, [sortedBalance[i].player_tag, points, month]);
        }
        
        console.log(`      ✅ Top ${sortedBalance.length} calculados`);
    }
    
    async calculateCapitalTotal(month, seasonStart) {
        console.log('   🏰 3. Capital (Total) [Tier 2: 20pts]...');
        
        const topCapital = await pool.query(`
            SELECT player_tag, SUM(capital_destroyed) as total_destroyed
            FROM capital_raids 
            WHERE weekend_date >= $1
            GROUP BY player_tag
            HAVING SUM(capital_destroyed) > 0
            ORDER BY total_destroyed DESC LIMIT 15
        `, [seasonStart.toISOString().split('T')[0]]);
        
        for (let i = 0; i < topCapital.rows.length; i++) {
            const points = TIER2_POINTS[i + 1] || 0;
            await pool.query(`
                INSERT INTO player_scores (player_tag, capital_points, season_month)
                VALUES ($1, $2, $3)
                ON CONFLICT (player_tag, season_month)
                DO UPDATE SET capital_points = $2
            `, [topCapital.rows[i].player_tag, points, month]);
        }
        
        console.log(`      ✅ Top ${topCapital.rows.length} calculados`);
    }
    
    // async calculateCapitalAverage(month, seasonStart) {
    //     console.log('   📊 4. Capital (Promedio) [Tier 2: 20pts]...');
        
    //     const capitalAvg = await pool.query(`
    //         SELECT 
    //             player_tag,
    //             SUM(capital_destroyed) as total_destroyed,
    //             SUM(attacks_used) as total_attacks,
    //             CASE 
    //                 WHEN SUM(attacks_used) > 0 THEN SUM(capital_destroyed)::float / SUM(attacks_used)
    //                 ELSE 0 
    //             END as avg_per_attack
    //         FROM capital_raids 
    //         WHERE weekend_date >= $1
    //         GROUP BY player_tag
    //         HAVING SUM(attacks_used) > 0 AND SUM(capital_destroyed) > 0
    //         ORDER BY avg_per_attack DESC LIMIT 15
    //     `, [seasonStart.toISOString().split('T')[0]]);
        
    //     for (let i = 0; i < capitalAvg.rows.length; i++) {
    //         const points = TIER2_POINTS[i + 1] || 0;
    //         await pool.query(`
    //             INSERT INTO player_scores (player_tag, capital_points, season_month)
    //             VALUES ($1, $2, $3)
    //             ON CONFLICT (player_tag, season_month)
    //             DO UPDATE SET capital_points = COALESCE(player_scores.capital_points, 0) + $2
    //         `, [capitalAvg.rows[i].player_tag, points, month]);
    //     }
        
    //     console.log(`      ✅ Top ${capitalAvg.rows.length} calculados`);
    // }
    
    async calculateWarTotal(month, seasonStart) {
        console.log('   ⭐ 5. Guerras (Total Estrellas) [Tier 3: 15pts]...');
        
        const topWars = await pool.query(`
            SELECT player_tag, SUM(stars) as total_stars
            FROM wars 
            WHERE war_date >= $1 AND war_type = 'regular' AND player_tag != 'CLAN_SUMMARY'
            GROUP BY player_tag
            HAVING SUM(stars) > 0
            ORDER BY total_stars DESC LIMIT 15
        `, [seasonStart]);

        console.log(`   📊 Encontrados: ${topWars.rows.length} jugadores con estrellas`);
        
        for (let i = 0; i < topWars.rows.length; i++) {
            const points = TIER3_POINTS[i + 1] || 0;
            await pool.query(`
                INSERT INTO player_scores (player_tag, war_points, season_month)
                VALUES ($1, $2, $3)
                ON CONFLICT (player_tag, season_month)
                DO UPDATE SET war_points = $2
            `, [topWars.rows[i].player_tag, points, month]);
        }
        
        console.log(`      ✅ Top ${topWars.rows.length} calculados`);
    }
    
    async calculateWarAverage(month, seasonStart) {
        console.log('   📈 6. Guerras (Promedio Real) [Tier 3: 15pts]...');
        
        const warAvg = await pool.query(`
            SELECT 
                player_tag,
                SUM(stars) as total_stars,
                COUNT(DISTINCT war_tag) as total_wars,
                (SUM(stars)::float / (COUNT(DISTINCT war_tag) * 6)) as avg_real
            FROM wars 
            WHERE war_date >= $1 AND war_type = 'regular' AND player_tag != 'CLAN_SUMMARY'
            GROUP BY player_tag
            HAVING COUNT(DISTINCT war_tag) > 0 AND SUM(stars) > 0
            ORDER BY avg_real DESC LIMIT 15
        `, [seasonStart]);
        
        for (let i = 0; i < warAvg.rows.length; i++) {
            const points = TIER3_POINTS[i + 1] || 0;
            await pool.query(`
                INSERT INTO player_scores (player_tag, war_points, season_month)
                VALUES ($1, $2, $3)
                ON CONFLICT (player_tag, season_month)
                DO UPDATE SET war_points = COALESCE(player_scores.war_points, 0) + $2
            `, [warAvg.rows[i].player_tag, points, month]);
        }
        
        console.log(`      ✅ Top ${warAvg.rows.length} calculados`);
    }
    
    async calculateTrophies(month) {
        console.log('   🏆 7. Copas (Acumulado Mensual) [Tier 3: 15pts]...');
        
        const topTrophies = await pool.query(`
            SELECT player_tag, SUM(season_points) as total_trophies
            FROM season_points_weekly
            WHERE season_month = $1
            GROUP BY player_tag
            HAVING SUM(season_points) > 0
            ORDER BY total_trophies DESC LIMIT 15
        `, [month]);
        
        for (let i = 0; i < topTrophies.rows.length; i++) {
            const points = TIER3_POINTS[i + 1] || 0;
            
            await pool.query(`
                INSERT INTO player_scores (player_tag, trophy_points, season_month)
                VALUES ($1, $2, $3)
                ON CONFLICT (player_tag, season_month)
                DO UPDATE SET trophy_points = $2
            `, [topTrophies.rows[i].player_tag, points, month]);
        }
        
        console.log(`      ✅ Top ${topTrophies.rows.length} calculados`);
    }
    
    async calculateCWLPremium(month, seasonStart) {
        console.log('   💎 8. CWL (Liga de Guerras) [TIER 1: 30pts]...');
        
        const seasonCode = seasonStart.toISOString().substring(0, 7);
        
        const topCWL = await pool.query(`
            SELECT 
                player_tag, 
                SUM(stars) as total_stars,
                SUM(attacks_used) as total_attacks,
                COUNT(DISTINCT round_number) as rounds_participated
            FROM cwl_wars 
            WHERE cwl_season >= $1
            GROUP BY player_tag
            HAVING SUM(stars) > 0
            ORDER BY total_stars DESC LIMIT 15
        `, [seasonCode]);
        
        console.log('   📊 Top 15 CWL:');
        topCWL.rows.forEach((player, i) => {
            const points = TIER1_POINTS[i + 1] || 0;
            console.log(`      ${i+1}. ${player.player_tag}: ${player.total_stars} ⭐ = ${points} pts`);
        });
        
        for (let i = 0; i < topCWL.rows.length; i++) {
            const points = TIER1_POINTS[i + 1] || 0;
            await pool.query(`
                INSERT INTO player_scores (player_tag, cwl_points, season_month)
                VALUES ($1, $2, $3)
                ON CONFLICT (player_tag, season_month)
                DO UPDATE SET cwl_points = $2
            `, [topCWL.rows[i].player_tag, points, month]);
        }
        
        console.log(`      ✅ Top ${topCWL.rows.length} calculados`);
    }
    
    async calculateClanGamesPremium(month, seasonStart) {
        console.log('   💎 9. Clan Games (Juegos del Clan) [Tier 3: 15pts]...');
        
        const topClanGames = await pool.query(`
            SELECT se.player_tag, 
                GREATEST(0, se.clan_games_points - COALESCE(baseline.clan_games_points, 0)) as season_points
            FROM season_events se
            LEFT JOIN (
                SELECT player_tag, clan_games_points
                FROM season_events 
                WHERE created_at <= $2
                AND player_tag IN (SELECT player_tag FROM season_events WHERE season_month = $1)
            ) baseline ON se.player_tag = baseline.player_tag
            WHERE se.season_month = $1 
            AND se.clan_games_date >= $2
            AND se.clan_games_points > 0
            ORDER BY season_points DESC LIMIT 15
        `, [month, seasonStart.toISOString().split('T')[0]]);
        
        for (let i = 0; i < topClanGames.rows.length; i++) {
            const points = TIER3_POINTS[i + 1] || 0;
            await pool.query(`
                INSERT INTO player_scores (player_tag, event_points, season_month)
                VALUES ($1, $2, $3)
                ON CONFLICT (player_tag, season_month)
                DO UPDATE SET event_points = $2
            `, [topClanGames.rows[i].player_tag, points, month]);
        }
        
        console.log(`      ✅ Top ${topClanGames.rows.length} calculados`);
    }
    
    // ========================================
    // SISTEMA DE PENALIZACIONES
    // ========================================
    
    async calculateAllPenalties(seasonStart) {
        const currentMonth = new Date().toISOString().substring(0, 7);
        
        console.log('   🧹 Limpiando penalizaciones anteriores...');
        await pool.query(`
            UPDATE player_scores 
            SET donation_penalty = 0, war_penalty = 0, capital_penalty = 0,
                cwl_penalty = 0, clan_games_penalty = 0, inactivity_penalty = 0, total_penalties = 0
            WHERE season_month = $1
        `, [currentMonth]);
        
        await this.calculateDonationPenalties(currentMonth, seasonStart);
        await this.calculateWarPenalties(currentMonth, seasonStart);
        await this.calculateCapitalPenalties(currentMonth, seasonStart);
        await this.calculateCWLPenalties(currentMonth, seasonStart);
        await this.calculateInactivityPenalty(currentMonth);
        const skipped = await this.calculateClanGamesPenalties(currentMonth);
        if (skipped) {
            console.log('   ✅ Clan Games saltados correctamente');
        }
        await this.calculateFinalTotals(currentMonth);
    }
    
    async calculateDonationPenalties(month, seasonStart) {
        console.log('   💸 Penalizaciones - Donaciones...');
        
        const minDaysInClan = 7;
        
        const allDonations = await pool.query(`
            SELECT DISTINCT ON (d.player_tag) 
                d.player_tag,
                d.donations_given,
                d.donations_received,
                (d.donations_given - d.donations_received) as balance,
                p.join_date
            FROM donations d
            JOIN players p ON d.player_tag = p.player_tag
            WHERE d.recorded_at >= $1
            AND p.is_active = true
            AND p.join_date <= NOW() - INTERVAL '${minDaysInClan} days'
            ORDER BY d.player_tag, d.recorded_at DESC
        `, [seasonStart.toISOString().split('T')[0]]);
        
        const top5Worst = allDonations.rows
            .filter(d => d.balance < 0)
            .sort((a, b) => a.balance - b.balance)
            .slice(0, 5);
        
        for (const player of top5Worst) {
            let penalty = 0;
            
            if (player.balance <= -1000) {
                penalty = -5;
            } else if (player.balance <= -500) {
                penalty = -2;
            }
            
            if (penalty < 0) {
                await pool.query(`
                    INSERT INTO player_scores (player_tag, donation_penalty, season_month)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (player_tag, season_month)
                    DO UPDATE SET donation_penalty = $2
                `, [player.player_tag, penalty, month]);
            }

            await pool.query(`
                INSERT INTO player_scores (player_tag, donation_penalty, season_month)
                VALUES ($1, $2, $3)
                ON CONFLICT (player_tag, season_month)
                DO UPDATE SET donation_penalty = $2
            `, [player.player_tag, penalty, month]);
        }
        
        console.log(`      ⚠️ ${top5Worst.length} jugadores penalizados`);
    }
    
    async calculateWarPenalties(month, seasonStart) {
        console.log('   ⚔️ Penalizaciones - Guerras...');
        
        const minDaysInClan = 7;
        
        const warData = await pool.query(`
            SELECT 
                w.player_tag,
                COUNT(DISTINCT w.war_tag) as wars_participated,
                COALESCE(SUM(w.attacks_used), 0) as attacks_used,
                p.join_date
            FROM wars w
            JOIN players p ON w.player_tag = p.player_tag
            WHERE w.war_date >= $1
            AND w.war_type = 'regular'
            AND p.is_active = true
            AND p.join_date <= NOW() - INTERVAL '${minDaysInClan} days'
            GROUP BY w.player_tag, p.join_date
        `, [seasonStart]);
        
        for (const player of warData.rows) {
            const expectedAttacks = player.wars_participated * 2;
            const missedAttacks = expectedAttacks - player.attacks_used;
            
            if (missedAttacks > 0) {
                const penalty = -missedAttacks;
                
                await pool.query(`
                    INSERT INTO player_scores (player_tag, war_penalty, season_month)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (player_tag, season_month)
                    DO UPDATE SET war_penalty = $2
                `, [player.player_tag, penalty, month]);
            }
        }
        
        console.log(`      ⚠️ Penalizaciones de guerra aplicadas`);
    }
    
    async calculateCapitalPenalties(month, seasonStart) {
        console.log('   🏰 Penalizaciones - Capital...');
        
        const minDaysInClan = 7;
        
        const players = await pool.query(`
            SELECT player_tag 
            FROM players 
            WHERE is_active = true 
            AND join_date <= NOW() - INTERVAL '${minDaysInClan} days'
        `);
        
        for (const player of players.rows) {
            let penalty = 0;
            
            const zeroWeekends = await pool.query(`
                SELECT COUNT(*) as count
                FROM capital_raids_weekly 
                WHERE player_tag = $1 
                AND weekend_start_date >= $2
                AND capital_destroyed = 0
            `, [player.player_tag, seasonStart.toISOString().split('T')[0]]);
            
            penalty += zeroWeekends.rows[0].count * -5;
            
            const lowWeekends = await pool.query(`
                SELECT COUNT(*) as count
                FROM capital_raids_weekly 
                WHERE player_tag = $1 
                AND weekend_start_date >= $2
                AND capital_destroyed > 0 
                AND capital_destroyed < 10000
            `, [player.player_tag, seasonStart.toISOString().split('T')[0]]);
            
            penalty += lowWeekends.rows[0].count * -3;
            
            if (penalty < 0) {
                await pool.query(`
                    INSERT INTO player_scores (player_tag, capital_penalty, season_month)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (player_tag, season_month)
                    DO UPDATE SET capital_penalty = $2
                `, [player.player_tag, penalty, month]);
            }
        }
        
        console.log(`      ⚠️ Penalizaciones de capital aplicadas`);
    }
    
    async calculateCWLPenalties(month, seasonStart) {
        console.log('   🏆 Penalizaciones - CWL...');
        
        const minDaysInClan = 7;
        
        // Solo penalizar rondas con ataques registrados (rondas completadas)
        const completedRounds = await pool.query(`
            SELECT DISTINCT round_number
            FROM cwl_wars
            WHERE cwl_season >= $1
            AND attacks_used > 0
            ORDER BY round_number
        `, [seasonStart.toISOString().substring(0, 7)]);
        
        if (completedRounds.rows.length === 0) {
            console.log('   ⏭️ No hay rondas completadas aún');
            return;
        }
        
        const roundNumbers = completedRounds.rows.map(r => r.round_number);
        console.log(`   📊 Rondas completadas: ${roundNumbers.join(', ')}`);
        
        const cwlData = await pool.query(`
            SELECT 
                c.player_tag,
                COUNT(DISTINCT c.round_number) as rounds_participated,
                COALESCE(SUM(c.attacks_used), 0) as total_attacks,
                p.join_date
            FROM cwl_wars c
            JOIN players p ON c.player_tag = p.player_tag
            WHERE c.recorded_date >= $1
            -- QUITAR: AND c.attacks_used > 0  ← Esta línea excluye a los penalizados
            AND c.round_number IN (
                SELECT DISTINCT round_number 
                FROM cwl_wars 
                WHERE cwl_season >= $2 
                AND attacks_used > 0
            )
            AND p.is_active = true
            AND p.join_date <= NOW() - INTERVAL '${minDaysInClan} days'
            GROUP BY c.player_tag, p.join_date
        `, [seasonStart, seasonStart.toISOString().substring(0, 7)]);
        
        for (const player of cwlData.rows) {
            const expectedAttacks = player.rounds_participated;
            const missedAttacks = expectedAttacks - player.total_attacks;
            
            if (missedAttacks > 0) {
                const penalty = missedAttacks * -8;
                
                await pool.query(`
                    INSERT INTO player_scores (player_tag, cwl_penalty, season_month)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (player_tag, season_month)
                    DO UPDATE SET cwl_penalty = $2
                `, [player.player_tag, penalty, month]);
            }
        }
        
        console.log(`      ⚠️ ${cwlData.rows.length} jugadores evaluados`);
    }
    
    async calculateInactivityPenalty(month) {
        console.log('   💤 Penalizaciones - Inactividad (acumulativa)...');
        
        const minDaysInClan = 7;
        
        const inactivePlayers = await pool.query(`
            SELECT p.player_tag, 
                   EXTRACT(DAY FROM NOW() - p.last_seen) as days_inactive
            FROM players p
            WHERE p.is_active = true
            AND p.join_date <= NOW() - INTERVAL '${minDaysInClan} days'
            AND EXTRACT(DAY FROM NOW() - p.last_seen) >= 4
        `);
        
        for (const player of inactivePlayers.rows) {
            const daysInactive = Math.floor(player.days_inactive);
            
            // Limitar a máximo 7 días (día 7 = -5 puntos)
            const effectiveDays = Math.min(daysInactive, 7);
            const penalty = effectiveDays === 4 ? -2 : -(2 + (effectiveDays - 4));
            
            await pool.query(`
                INSERT INTO player_scores (player_tag, inactivity_penalty, season_month)
                VALUES ($1, $2, $3)
                ON CONFLICT (player_tag, season_month)
                DO UPDATE SET inactivity_penalty = $2
            `, [player.player_tag, penalty, month]);
        }
        
        console.log(`      ⚠️ ${inactivePlayers.rows.length} jugadores inactivos penalizados`);
    }
    
    async calculateClanGamesPenalties(month) {
        console.log('   🎯 Penalizaciones - Clan Games...');
        
        const minDaysInClan = 7;
        
        const hasActiveClanGames = await pool.query(`
            SELECT COUNT(*) as count
            FROM season_events
            WHERE season_month = $1
            AND clan_games_points > 0
        `, [month]);
        
        if (hasActiveClanGames.rows[0].count > 0) {
            const clanGamesData = await pool.query(`
                SELECT 
                    se.player_tag,
                    se.clan_games_points,
                    p.join_date
                FROM season_events se
                JOIN players p ON se.player_tag = p.player_tag
                WHERE se.season_month = $1
                AND p.is_active = true
                AND p.join_date <= NOW() - INTERVAL '${minDaysInClan} days'
            `, [month]);
            
            for (const player of clanGamesData.rows) {
                let penalty = 0;
                
                if (player.clan_games_points === 0) {
                    penalty = -5;
                } else if (player.clan_games_points < 1000) {
                    penalty = -2;
                }
                
                if (penalty < 0) {
                    await pool.query(`
                        INSERT INTO player_scores (player_tag, clan_games_penalty, season_month)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (player_tag, season_month)
                        DO UPDATE SET clan_games_penalty = $2
                    `, [player.player_tag, penalty, month]);
                }
            }
            
            console.log(`      ⚠️ Penalizaciones de Clan Games aplicadas`);
            return false;
        } else {
            console.log('      ⏭️ Clan Games no cargados aún, saltando penalizaciones');
            return true;
        }
    }
    
    async calculateFinalTotals(month) {
        console.log('   🏆 Calculando totales finales (con penalizaciones)...');
        
        await pool.query(`
            UPDATE player_scores 
            SET total_penalties = COALESCE(donation_penalty, 0) + 
                                COALESCE(war_penalty, 0) + 
                                COALESCE(capital_penalty, 0) + 
                                COALESCE(cwl_penalty, 0) + 
                                COALESCE(clan_games_penalty, 0) +
                                COALESCE(inactivity_penalty, 0)
            WHERE season_month = $1
        `, [month]);
        
        await pool.query(`
            UPDATE player_scores 
            SET total_points = 
                COALESCE(donation_points, 0) + 
                COALESCE(event_points, 0) + 
                COALESCE(trophy_points, 0) + 
                COALESCE(war_points, 0) + 
                COALESCE(cwl_points, 0) + 
                COALESCE(capital_points, 0) + 
                COALESCE(total_penalties, 0)
            WHERE season_month = $1
        `, [month]);
        
        console.log('      ✅ Totales finales calculados correctamente');
    }
    
    generateWarTag(cocTimestamp, clanTag) {
        const date = this.parseCoCSDate(cocTimestamp);
        const dateStr = date.toISOString().replace(/[-:]/g, '').substring(0, 13);
        const clanSuffix = clanTag.replace('#', '').slice(-3);
        return `${dateStr}_${clanSuffix}`.substring(0, 20);
    }
    
    parseCoCSDate(cocDateString) {
        if (!cocDateString) return new Date('2020-01-01');
        
        try {
            let isoString = cocDateString;
            if (!isoString.endsWith('Z')) isoString += 'Z';
            
            if (isoString.length >= 17 && isoString.indexOf('-') === -1) {
                isoString = isoString.replace(
                    /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
                    '$1-$2-$3T$4:$5:$6'
                );
            }
            
            const date = new Date(isoString);
            return isNaN(date.getTime()) ? new Date('2020-01-01') : date;
        } catch (error) {
            return new Date('2020-01-01');
        }
    }
}

const updater = new AccumulativeClashUpdater();
updater.updateAllData();