import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function POST(request: Request) {
  try {
    const { player_tag, round_number, cwl_season } = await request.json();
    
    await pool.query(`
      DELETE FROM cwl_wars 
      WHERE player_tag = $1 
        AND round_number = $2 
        AND cwl_season = $3
    `, [player_tag, round_number, cwl_season]);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}