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

// ⭐ SISTEMAS DE PUNTUACIÓN
const NORMAL_POINTS = {
    1: 10, 2: 8, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1
};

const PREMIUM_POINTS = {
    1: 20, 2: 16, 3: 12, 4: 10, 5: 8, 6: 6, 7: 4, 8: 2
};

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
                    await this.updatePlayerStats(member.tag, playerData, seasonStart);
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
            
            console.log('\n🧮 Calculando puntuaciones con sistema de 9 categorías...');
            console.log('   📌 Sistema Normal (7 categorías): 10-8-6-5-4-3-2-1 pts');
            console.log('   💎 Sistema Premium (2 categorías): 20-16-12-10-8-6-4-2 pts\n');
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
    
    async updatePlayerStats(playerTag, playerData, seasonStart) {
        const cleanTag = playerTag.replace('#', '');
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = new Date().toISOString().substring(0, 7);
        
        const lastActivity = await pool.query(`
            SELECT d.donations_given, se.season_points as trophies
            FROM donations d
            LEFT JOIN season_events se ON d.player_tag = se.player_tag
            WHERE d.player_tag = $1 
            ORDER BY d.recorded_at DESC 
            LIMIT 1
        `, [cleanTag]);

        const currentDonations = playerData.donations || 0;
        const currentTrophies = playerData.trophies || 0;

        const previousDonations = lastActivity.rows.length > 0 ? lastActivity.rows[0].donations_given : 0;
        const previousTrophies = lastActivity.rows.length > 0 ? (lastActivity.rows[0].trophies || 0) : 0;

        // Detectar actividad si cambiaron donaciones O copas
        if (currentDonations > previousDonations || currentTrophies !== previousTrophies) {
            await pool.query(`
                UPDATE players 
                SET last_seen = NOW() 
                WHERE player_tag = $1
            `, [cleanTag]);
            
            if (currentDonations > previousDonations) {
                console.log(`   🟢 Donaciones: ${previousDonations} → ${currentDonations}`);
            }
            if (currentTrophies !== previousTrophies) {
                console.log(`   🟢 Copas: ${previousTrophies} → ${currentTrophies}`);
            }
        }
        
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
        
        await pool.query(`
            INSERT INTO season_events (player_tag, season_points, clan_games_points, clan_games_date, season_month)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (player_tag, season_month)
            DO UPDATE SET 
                season_points = $2,
                clan_games_date = $4
        `, [
            cleanTag,
            playerData.trophies || 0,
            0,
            today,
            currentMonth
        ]);
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
                    
                    // Guardar acumulado mensual (tabla original)
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
                        DO NOTHING
                    `, [cleanTag, totalDestroyed, estimatedAttacks, avgPerAttack.toFixed(2), weekendDateStr]);
                    
                    // Guardar detalle semanal (tabla nueva para penalizaciones)
                    await pool.query(`
                        INSERT INTO capital_raids_weekly (
                            player_tag, 
                            capital_destroyed, 
                            attacks_used, 
                            weekend_start_date
                        )
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (player_tag, weekend_start_date)
                        DO UPDATE SET 
                            capital_destroyed = $2,
                            attacks_used = $3
                    `, [cleanTag, totalDestroyed, estimatedAttacks, weekendDateStr]);
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
        if (destroyed <= 4000) return 1;
        if (destroyed <= 8000) return 2;
        if (destroyed <= 12000) return 3;
        if (destroyed <= 16000) return 4;
        if (destroyed <= 20000) return 5;
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
                    
                    // Validar que round sea un array válido
                    if (!round || !Array.isArray(round) || round.length === 0) {
                        console.log(`   ⏭️ Ronda ${roundIndex + 1} sin datos disponibles (preparación)`);
                        continue;
                    }
                    
                    console.log(`   📊 Procesando ronda ${roundIndex + 1}`);
                    
                    for (const warTag of round) {
                        try {
                            const warUrl = `https://api.clashofclans.com/v1/clanwarleagues/wars/${warTag}`;
                            const warResponse = await axios.get(warUrl, { headers });
                            const cwlWar = warResponse.data;
                            
                            const warDate = this.parseCoCSDate(cwlWar.startTime);
                            
                            if (warDate >= seasonStart) {
                                const ourClan = cwlWar.clans.find(clan => clan.tag === `#${CLAN_TAG}`);
                                
                                if (ourClan && ourClan.members) {
                                    for (const member of ourClan.members) {
                                        const cleanTag = member.tag.replace('#', '');
                                        const totalStars = member.attacks?.reduce((sum, attack) => sum + attack.stars, 0) || 0;
                                        
                                        await pool.query(`
                                            INSERT INTO cwl_wars (player_tag, stars, attacks_used, cwl_season, round_number, recorded_date)
                                            VALUES ($1, $2, $3, $4, $5, $6)
                                            ON CONFLICT (player_tag, cwl_season, round_number)
                                            DO UPDATE SET 
                                                stars = GREATEST(cwl_wars.stars, $2),
                                                attacks_used = GREATEST(cwl_wars.attacks_used, $3)
                                        `, [cleanTag, totalStars, member.attacks?.length || 0, cwlData.season, roundIndex + 1, warDate]);
                                    }
                                }
                            }
                            
                        } catch (warError) {
                            console.log(`     ⚠️ Error en guerra CWL: ${warError.message}`);
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }
            }
            
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
        await this.calculateCapitalAverage(currentMonth, seasonStart);
        await this.calculateWarTotal(currentMonth, seasonStart);
        await this.calculateWarAverage(currentMonth, seasonStart);
        await this.calculateTrophies(currentMonth);
        await this.calculateCWLPremium(currentMonth, seasonStart);
        await this.calculateClanGamesPremium(currentMonth, seasonStart);
    }
    
    async calculateTopDonors(month, seasonStart) {
        console.log('   💝 1. Donaciones (Cantidad) [Normal 10-8-6-5-4-3-2-1]...');
        
        const allDonations = await pool.query(`
            SELECT DISTINCT ON (player_tag) 
                player_tag, donations_given 
            FROM donations 
            WHERE recorded_at >= $1 AND donations_given > 0
            ORDER BY player_tag, recorded_at DESC
        `, [seasonStart.toISOString().split('T')[0]]);
        
        const sortedDonors = allDonations.rows.sort((a, b) => b.donations_given - a.donations_given);
        const topDonors = sortedDonors.slice(0, 8);
        
        for (let i = 0; i < topDonors.length; i++) {
            const points = NORMAL_POINTS[i + 1] || 0;
            await pool.query(`
                INSERT INTO player_scores (player_tag, donation_points, season_month)
                VALUES ($1, $2, $3)
                ON CONFLICT (player_tag, season_month)
                DO UPDATE SET donation_points = $2
            `, [topDonors[i].player_tag, points, month]);
        }
        
        console.log(`      ✅ Top ${topDonors.length} calculados`);
    }

    async calculateBestBalance(month, seasonStart) {
        console.log('   ⚖️ 2. Donaciones (Balance) [Normal 10-8-6-5-4-3-2-1]...');
        
        const allBalance = await pool.query(`
            SELECT DISTINCT ON (player_tag) 
                player_tag, donations_given, donations_received,
                (donations_given - donations_received) as balance
            FROM donations 
            WHERE recorded_at >= $1
            ORDER BY player_tag, recorded_at DESC
        `, [seasonStart.toISOString().split('T')[0]]);
        
        const sortedBalance = allBalance.rows
            .filter(d => d.balance > 0)
            .sort((a, b) => b.balance - a.balance)
            .slice(0, 8);
        
        for (let i = 0; i < sortedBalance.length; i++) {
            const points = NORMAL_POINTS[i + 1] || 0;
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
        console.log('   🏰 3. Capital (Total) [Normal 10-8-6-5-4-3-2-1]...');
        
        const topCapital = await pool.query(`
            SELECT player_tag, SUM(capital_destroyed) as total_destroyed
            FROM capital_raids 
            WHERE weekend_date >= $1
            GROUP BY player_tag
            HAVING SUM(capital_destroyed) > 0
            ORDER BY total_destroyed DESC LIMIT 8
        `, [seasonStart.toISOString().split('T')[0]]);
        
        for (let i = 0; i < topCapital.rows.length; i++) {
            const points = NORMAL_POINTS[i + 1] || 0;
            await pool.query(`
                INSERT INTO player_scores (player_tag, capital_points, season_month)
                VALUES ($1, $2, $3)
                ON CONFLICT (player_tag, season_month)
                DO UPDATE SET capital_points = $2
            `, [topCapital.rows[i].player_tag, points, month]);
        }
        
        console.log(`      ✅ Top ${topCapital.rows.length} calculados`);
    }
    
    async calculateCapitalAverage(month, seasonStart) {
        console.log('   📊 4. Capital (Promedio) [Normal 10-8-6-5-4-3-2-1]...');
        
        const capitalAvg = await pool.query(`
            SELECT 
                player_tag,
                SUM(capital_destroyed) as total_destroyed,
                SUM(attacks_used) as total_attacks,
                CASE 
                    WHEN SUM(attacks_used) > 0 THEN SUM(capital_destroyed)::float / SUM(attacks_used)
                    ELSE 0 
                END as avg_per_attack
            FROM capital_raids 
            WHERE weekend_date >= $1
            GROUP BY player_tag
            HAVING SUM(attacks_used) > 0 AND SUM(capital_destroyed) > 0
            ORDER BY avg_per_attack DESC LIMIT 8
        `, [seasonStart.toISOString().split('T')[0]]);
        
        for (let i = 0; i < capitalAvg.rows.length; i++) {
            const points = NORMAL_POINTS[i + 1] || 0;
            await pool.query(`
                INSERT INTO player_scores (player_tag, capital_points, season_month)
                VALUES ($1, $2, $3)
                ON CONFLICT (player_tag, season_month)
                DO UPDATE SET capital_points = COALESCE(player_scores.capital_points, 0) + $2
            `, [capitalAvg.rows[i].player_tag, points, month]);
        }
        
        console.log(`      ✅ Top ${capitalAvg.rows.length} calculados`);
    }
    
    async calculateWarTotal(month, seasonStart) {
        console.log('   ⭐ 5. Guerras (Total Estrellas) [Normal 10-8-6-5-4-3-2-1]...');
        
        const topWars = await pool.query(`
            SELECT player_tag, SUM(stars) as total_stars
            FROM wars 
            WHERE war_date >= $1 AND war_type = 'regular' AND player_tag != 'CLAN_SUMMARY'
            GROUP BY player_tag
            HAVING SUM(stars) > 0
            ORDER BY total_stars DESC LIMIT 8
        `, [seasonStart]);
        
        for (let i = 0; i < topWars.rows.length; i++) {
            const points = NORMAL_POINTS[i + 1] || 0;
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
        console.log('   📈 6. Guerras (Promedio Real) [Normal 10-8-6-5-4-3-2-1]...');
        
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
            ORDER BY avg_real DESC LIMIT 8
        `, [seasonStart]);
        
        for (let i = 0; i < warAvg.rows.length; i++) {
            const points = NORMAL_POINTS[i + 1] || 0;
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
        console.log('   🏆 7. Copas (Trofeos) [Normal 10-8-6-5-4-3-2-1]...');
        
        const topTrophies = await pool.query(`
            SELECT player_tag, season_points 
            FROM season_events 
            WHERE season_month = $1 AND season_points > 0
            ORDER BY season_points DESC LIMIT 8
        `, [month]);
        
        for (let i = 0; i < topTrophies.rows.length; i++) {
            const points = NORMAL_POINTS[i + 1] || 0;
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
        console.log('   💎 8. CWL (Liga de Guerras) [PREMIUM 20-16-12-10-8-6-4-2]...');
        
        const seasonCode = seasonStart.toISOString().substring(0, 7);
        
        const topCWL = await pool.query(`
            SELECT player_tag, SUM(stars) as total_stars
            FROM cwl_wars 
            WHERE cwl_season >= $1
            GROUP BY player_tag
            HAVING SUM(stars) > 0
            ORDER BY total_stars DESC LIMIT 8
        `, [seasonCode]);
        
        for (let i = 0; i < topCWL.rows.length; i++) {
            const points = PREMIUM_POINTS[i + 1] || 0;
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
        console.log('   💎 9. Clan Games (Juegos del Clan) [PREMIUM 20-16-12-10-8-6-4-2]...');
        
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
            ORDER BY season_points DESC LIMIT 8
        `, [month, seasonStart.toISOString().split('T')[0]]);
        
        for (let i = 0; i < topClanGames.rows.length; i++) {
            const points = PREMIUM_POINTS[i + 1] || 0;
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
                cwl_penalty = 0, clan_games_penalty = 0, total_penalties = 0
            WHERE season_month = $1
        `, [currentMonth]);
        
        await this.calculateDonationPenalties(currentMonth, seasonStart);
        await this.calculateWarPenalties(currentMonth, seasonStart);
        await this.calculateCapitalPenalties(currentMonth, seasonStart);
        await this.calculateCWLPenalties(currentMonth, seasonStart);
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
            let penalty = -2;
            
            if (player.balance < -500) {
                penalty += -2;
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
            
            penalty += zeroWeekends.rows[0].count * -2;
            
            const lowWeekends = await pool.query(`
                SELECT COUNT(*) as count
                FROM capital_raids_weekly 
                WHERE player_tag = $1 
                AND weekend_start_date >= $2
                AND capital_destroyed > 0 
                AND capital_destroyed < 10000
            `, [player.player_tag, seasonStart.toISOString().split('T')[0]]);
            
            penalty += lowWeekends.rows[0].count * -1;
            
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
        
        const cwlData = await pool.query(`
            SELECT 
                c.player_tag,
                COUNT(DISTINCT c.round_number) as rounds_participated,
                COALESCE(SUM(c.attacks_used), 0) as total_attacks,
                p.join_date
            FROM cwl_wars c
            JOIN players p ON c.player_tag = p.player_tag
            WHERE c.recorded_date >= $1
            AND p.is_active = true
            AND p.join_date <= NOW() - INTERVAL '${minDaysInClan} days'
            GROUP BY c.player_tag, p.join_date
        `, [seasonStart]);
        
        for (const player of cwlData.rows) {
            if (player.rounds_participated > 0 && player.total_attacks < player.rounds_participated) {
                const penalty = -5;
                
                await pool.query(`
                    INSERT INTO player_scores (player_tag, cwl_penalty, season_month)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (player_tag, season_month)
                    DO UPDATE SET cwl_penalty = $2
                `, [player.player_tag, penalty, month]);
            }
        }
        
        console.log(`      ⚠️ Penalizaciones de CWL aplicadas`);
    }
    
    async calculateClanGamesPenalties(month) {
        console.log('   🎯 Penalizaciones - Clan Games...');
        
        const minDaysInClan = 7;
        
        // Verificar si hay al menos UN jugador con puntos de Clan Games
        const hasActiveClanGames = await pool.query(`
            SELECT COUNT(*) as count
            FROM season_events
            WHERE season_month = $1
            AND clan_games_points > 0
        `, [month]);
        
        // Cambiar lógica: solo ejecutar SI hay datos
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
        } else {
            console.log('      ⏭️ Clan Games no cargados aún, saltando penalizaciones');
        }
    }
    
    async calculateFinalTotals(month) {
        console.log('   🏆 Calculando totales finales (con penalizaciones)...');
        
        // 1. Calcular total_penalties (suma de todas las penalizaciones)
        await pool.query(`
            UPDATE player_scores 
            SET total_penalties = COALESCE(donation_penalty, 0) + 
                                COALESCE(war_penalty, 0) + 
                                COALESCE(capital_penalty, 0) + 
                                COALESCE(cwl_penalty, 0) + 
                                COALESCE(clan_games_penalty, 0)
            WHERE season_month = $1
        `, [month]);
        
        // 2. Calcular total_points (suma de puntos + penalizaciones)
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