require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// =====================================================
// 🛡️ SCRIPT ÚNICO: Protección de Ediciones Manuales
// =====================================================
// 
// Este script hace 3 cosas:
// 1. Verifica qué tablas tienen protección
// 2. Agrega la protección si falta
// 3. Verifica que todo esté correcto
//
// =====================================================

async function main() {
  console.log('🛡️ SISTEMA DE PROTECCIÓN DE EDICIONES MANUALES\n');
  console.log('═'.repeat(60) + '\n');
  
  try {
    // PASO 1: Verificar estado actual
    console.log('📊 PASO 1: Verificando estado actual...\n');
    
    const tables = ['wars', 'capital_raids_weekly', 'cwl_wars', 'season_points_weekly'];
    const statusBefore = {};
    
    for (const table of tables) {
      const check = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = $1 AND column_name = 'manually_edited'
      `, [table]);
      
      statusBefore[table] = check.rows.length > 0;
      
      const icon = statusBefore[table] ? '✅' : '❌';
      console.log(`  ${icon} ${table.padEnd(25)} ${statusBefore[table] ? 'PROTEGIDA' : 'SIN PROTECCIÓN'}`);
    }
    
    // PASO 2: Agregar protección si falta
    console.log('\n📝 PASO 2: Aplicando protecciones faltantes...\n');
    
    let addedProtections = 0;
    
    // CWL
    if (!statusBefore['cwl_wars']) {
      console.log('  ⚙️ Agregando protección a cwl_wars...');
      await pool.query(`
        ALTER TABLE cwl_wars 
        ADD COLUMN IF NOT EXISTS manually_edited BOOLEAN DEFAULT FALSE
      `);
      addedProtections++;
      console.log('     ✅ Columna agregada');
    }
    
    // Copas
    if (!statusBefore['season_points_weekly']) {
      console.log('  ⚙️ Agregando protección a season_points_weekly...');
      await pool.query(`
        ALTER TABLE season_points_weekly 
        ADD COLUMN IF NOT EXISTS manually_edited BOOLEAN DEFAULT FALSE
      `);
      addedProtections++;
      console.log('     ✅ Columna agregada');
    }
    
    if (addedProtections === 0) {
      console.log('  ✅ Todas las protecciones ya están aplicadas');
    } else {
      console.log(`\n  ✅ Se agregaron ${addedProtections} protección(es)`);
    }
    
    // PASO 3: Verificar resultado final
    console.log('\n📊 PASO 3: Verificando resultado final...\n');
    
    const statusAfter = {};
    
    for (const table of tables) {
      const check = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = $1 AND column_name = 'manually_edited'
      `, [table]);
      
      statusAfter[table] = check.rows.length > 0;
      
      const icon = statusAfter[table] ? '🟢' : '🔴';
      console.log(`  ${icon} ${table.padEnd(25)} ${statusAfter[table] ? 'PROTEGIDA' : 'VULNERABLE'}`);
    }
    
    // PASO 4: Mostrar estadísticas
    console.log('\n📈 PASO 4: Estadísticas de registros...\n');
    
    for (const table of tables) {
      if (statusAfter[table]) {
        const stats = await pool.query(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN manually_edited = TRUE THEN 1 ELSE 0 END) as editados
          FROM ${table}
        `);
        
        const total = stats.rows[0].total;
        const editados = stats.rows[0].editados || 0;
        
        console.log(`  ${table}:`);
        console.log(`    Total: ${total} registros`);
        console.log(`    Editados manualmente: ${editados}`);
      }
    }
    
    // RESUMEN FINAL
    console.log('\n' + '═'.repeat(60));
    console.log('\n🎯 RESUMEN FINAL:\n');
    
    const allProtected = Object.values(statusAfter).every(v => v === true);
    
    if (allProtected) {
      console.log('  ✅ TODAS LAS TABLAS ESTÁN PROTEGIDAS\n');
      console.log('  📌 Ahora necesitas actualizar el código:');
      console.log('     1. Abrir CORRECCIONES_MANUAL_EDIT.txt');
      console.log('     2. Aplicar los cambios en update-data.js');
      console.log('     3. Aplicar los cambios en las APIs de CWL y Copas');
      console.log('     4. Reiniciar el servidor Next.js\n');
    } else {
      console.log('  ⚠️ ALGUNAS TABLAS AÚN NO TIENEN PROTECCIÓN\n');
      console.log('  Vuelve a ejecutar este script para reintentar.\n');
    }
    
    console.log('═'.repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\nDetalles:', error);
  } finally {
    await pool.end();
  }
}

main();
