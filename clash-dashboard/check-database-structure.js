require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkDatabaseStructure() {
    console.log('🔍 REVISANDO ESTRUCTURA DE BASE DE DATOS\n');
    
    try {
        // 1. Listar todas las tablas
        console.log('📋 TABLAS EXISTENTES:');
        const tables = await pool.query(`
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public'
            ORDER BY tablename
        `);
        
        tables.rows.forEach(table => {
            console.log(`   ✅ ${table.tablename}`);
        });
        
        console.log('\n');
        
        // 2. Estructura de cada tabla importante
        const importantTables = [
            'players', 'donations', 'wars', 'cwl_wars', 
            'capital_raids', 'season_events', 'player_scores'
        ];
        
        for (const tableName of importantTables) {
            console.log(`🔧 ESTRUCTURA DE ${tableName.toUpperCase()}:`);
            
            try {
                const structure = await pool.query(`
                    SELECT 
                        column_name,
                        data_type,
                        is_nullable,
                        column_default
                    FROM information_schema.columns 
                    WHERE table_name = $1
                    ORDER BY ordinal_position
                `, [tableName]);
                
                if (structure.rows.length > 0) {
                    structure.rows.forEach(col => {
                        console.log(`   📄 ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
                    });
                } else {
                    console.log('   ❌ Tabla no existe');
                }
                
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
            }
            
            console.log('');
        }
        
        // 3. Datos de ejemplo de season_events
        console.log('📊 DATOS DE EJEMPLO - season_events:');
        try {
            const sampleData = await pool.query(`
                SELECT * FROM season_events 
                LIMIT 5
            `);
            
            if (sampleData.rows.length > 0) {
                console.log('   Columnas:', Object.keys(sampleData.rows[0]).join(', '));
                sampleData.rows.forEach((row, i) => {
                    console.log(`   Fila ${i + 1}:`, JSON.stringify(row, null, 2));
                });
            } else {
                console.log('   📝 Tabla vacía');
            }
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
        }
        
        console.log('\n');
        
        // 4. Conteo de registros
        console.log('📈 CONTEO DE REGISTROS:');
        for (const tableName of importantTables) {
            try {
                const count = await pool.query(`SELECT COUNT(*) FROM ${tableName}`);
                console.log(`   ${tableName}: ${count.rows[0].count} registros`);
            } catch (error) {
                console.log(`   ${tableName}: Error - ${error.message}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Error general:', error.message);
    } finally {
        await pool.end();
    }
}

checkDatabaseStructure();