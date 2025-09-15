import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST() {
  try {
    console.log('🚀 Iniciando actualización de datos...');
    
    // Ejecutar el script de actualización
    const { stdout, stderr } = await execAsync('node update-data.js', {
      cwd: process.cwd(), // Ejecutar desde la raíz del proyecto
      timeout: 120000 // 2 minutos máximo
    });
    
    console.log('✅ Actualización completada');
    console.log('STDOUT:', stdout);
    
    if (stderr) {
      console.warn('STDERR:', stderr);
    }
    
    return NextResponse.json({
      success: true,
      message: 'Datos actualizados exitosamente',
      output: stdout
    });
    
  } catch (error: unknown) {
    console.error('❌ Error en actualización:', error);

    if (error instanceof Error) {
        return NextResponse.json({
        success: false,
        message: 'Error al actualizar datos',
        error: error.message
        }, { status: 500 });
    }

    return NextResponse.json({
        success: false,
        message: 'Error desconocido',
        error: String(error)
    }, { status: 500 });
  }
}