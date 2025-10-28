'use client';

import { useState, useEffect } from 'react';

interface WeeklyTrophy {
  player_tag: string;
  player_name: string;
  season_points: number;
  week_start_date: string;
}

export default function TrophiesEditPage() {
  const [weeklyData, setWeeklyData] = useState<WeeklyTrophy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);

  useEffect(() => {
    fetchWeeklyData();
  }, [selectedWeek]);

  const fetchWeeklyData = async () => {
    try {
      setLoading(true);
      const url = selectedWeek 
        ? `/api/trophies-weekly?week=${selectedWeek}`
        : '/api/trophies-weekly';
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.weeks) {
        setAvailableWeeks(data.weeks);
        if (!selectedWeek && data.weeks.length > 0) {
          setSelectedWeek(data.weeks[0]);
        }
      }
      
      if (data.data) {
        setWeeklyData(data.data);
      }
    } catch (error) {
      console.error('Error fetching weekly trophies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (playerTag: string, newPoints: number) => {
    if (!selectedWeek) return;
    
    try {
      setSaving(true);
      
      const response = await fetch('/api/trophies-weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_tag: playerTag,
          week_start_date: selectedWeek,
          season_points: newPoints
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        await fetchWeeklyData();
        alert('✅ Copas actualizadas');
      } else {
        alert('❌ Error: ' + result.message);
      }
    } catch (error) {
      console.error('Error updating trophies:', error);
      alert('❌ Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">⏳ Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-purple-400">
            🏆 Editar Copas Semanales
          </h1>
          <button
            onClick={() => window.close()}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
          >
            ← Volver
          </button>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Seleccionar Semana:</label>
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg w-64"
          >
            {availableWeeks.map(week => (
              <option key={week} value={week}>
                Semana del {new Date(week).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-6 py-4 text-left">Jugador</th>
                <th className="px-6 py-4 text-center">Tag</th>
                <th className="px-6 py-4 text-center">Copas Actuales</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {weeklyData.map((player) => (
                <tr key={player.player_tag} className="hover:bg-gray-700">
                  <td className="px-6 py-4 font-medium">{player.player_name}</td>
                  <td className="px-6 py-4 text-center text-sm text-gray-400">
                    #{player.player_tag}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <input
                      type="number"
                      defaultValue={player.season_points}
                      className="bg-gray-700 text-white px-3 py-1 rounded w-24 text-center"
                      id={`points-${player.player_tag}`}
                    />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => {
                        const input = document.getElementById(`points-${player.player_tag}`) as HTMLInputElement;
                        const newPoints = parseInt(input.value);
                        if (!isNaN(newPoints)) {
                          handleUpdate(player.player_tag, newPoints);
                        }
                      }}
                      disabled={saving}
                      className="px-4 py-1 bg-purple-600 hover:bg-purple-700 rounded disabled:bg-gray-600"
                    >
                      💾 Guardar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 bg-gray-800 p-4 rounded-lg">
          <h3 className="font-bold text-yellow-400 mb-2">ℹ️ Información:</h3>
          <p className="text-sm text-gray-300">
            • Las copas se registran automáticamente cada semana por el sistema<br/>
            • Puedes editar manualmente si hay errores o valores incorrectos<br/>
            • Los cambios se guardan individualmente por jugador
          </p>
        </div>
      </div>
    </div>
  );
}
