require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

const API_KEY = process.env.CLASH_API_KEY;
const CLAN_TAG = process.env.CLAN_TAG;

const headers = {
    'Authorization': `Bearer ${API_KEY}`,
    'Accept': 'application/json'
};

async function testCapitalAttacks() {
    try {
        const encodedClanTag = encodeURIComponent(`#${CLAN_TAG}`);
        const url = `https://api.clashofclans.com/v1/clans/${encodedClanTag}/capitalraidseasons`;
        
        const response = await axios.get(url, { headers });
        const seasons = response.data.items || [];
        
        console.log('📊 ANÁLISIS DE ATAQUES - Última temporada\n');
        
        if (seasons.length > 0) {
            const lastSeason = seasons[0];
            const membersWithGold = lastSeason.members?.filter(m => m.capitalResourcesLooted > 0) || [];
            
            console.log(`Total jugadores con oro: ${membersWithGold.length}\n`);
            
            // Mostrar primeros 10 para comparar
            membersWithGold.slice(0, 10).forEach((member, i) => {
                const actualAttacks = member.attacks?.length || 0;
                const estimatedAttacks = estimateAttacks(member.capitalResourcesLooted);
                
                console.log(`${i+1}. ${member.name}`);
                console.log(`   Oro: ${member.capitalResourcesLooted.toLocaleString()}`);
                console.log(`   Ataques reales (attacks.length): ${actualAttacks}`);
                console.log(`   Ataques estimados (función): ${estimatedAttacks}`);
                console.log(`   attackLimit: ${member.attackLimit}, bonusAttackLimit: ${member.bonusAttackLimit}`);
                console.log(`   ¿Coinciden?: ${actualAttacks === estimatedAttacks ? '✅ SÍ' : '❌ NO'}`);
                console.log('');
            });
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

function estimateAttacks(destroyed) {
    if (destroyed === 0) return 0;
    if (destroyed <= 3000) return 1;
    if (destroyed <= 6500) return 2;
    if (destroyed <= 10000) return 3;
    if (destroyed <= 13500) return 4;
    if (destroyed <= 17000) return 5;
    return 6;
}

testCapitalAttacks();