'use client';

import { useState, useEffect } from 'react';

interface CWLPlayer {
  player_tag: string;
  player_name: string;
  round_number: number;
  stars: number;
  attacks_used: number;
  cwl_season: string;
}

export default function CWLEditPage() {
  const [players, setPlayers] = useState<CWLPlayer[]>([]);
  const [rounds, setRounds] = useState<number[]>([]);
  const [selectedRound, setSelectedRound] = useState<number>(1);
  const [editValues, setEditValues] = useState<{[key: string]: {stars: number, attacks: number}}>({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (rounds.length > 0) {
      setSelectedRound(rounds[rounds.length - 1]); // Última ronda por defecto
    }
  }, [rounds]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/cwl-edit');
      const data = await response.json();
      const uniqueRounds = [...new Set<number>(data.map((p: CWLPlayer) => p.round_number))].sort((a, b) => a - b);
      
      setRounds(uniqueRounds);
      setPlayers(data);
      
      const initialValues: {[key: string]: {stars: number, attacks: number}} = {};
      data.forEach((p: CWLPlayer) => {
        const key = `${p.player_tag}_${p.round_number}`;
        initialValues[key] = { stars: p.stars, attacks: p.attacks_used };
      });
      setEditValues(initialValues);
    } catch (error) {
      console.error('Error fetching CWL data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPlayers = players.filter(p => p.round_number === selectedRound);

  const updatePlayer = async (playerTag: string, roundNumber: number) => {
    try {
      const key = `${playerTag}_${roundNumber}`;
      setUpdating(key);
      
      const response = await fetch('/api/cwl-edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          player_tag: playerTag,
          round_number: roundNumber,
          stars: editValues[key]?.stars || 0,
          attacks_used: editValues[key]?.attacks || 0
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setPlayers(players.map(p => 
          p.player_tag === playerTag && p.round_number === roundNumber
            ? { ...p, stars: editValues[key]?.stars || 0, attacks_used: editValues[key]?.attacks || 0 }
            : p
        ));
        alert('✅ Datos actualizados correctamente');
      } else {
        alert('❌ Error: ' + result.error);
      }
    } catch (error) {
      console.error('Error updating CWL:', error);
      alert('❌ Error al actualizar datos');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">⏳ Cargando datos...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 shadow-lg border-b border-gray-700">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-purple-400">
              🏆 Editor de CWL por Ronda
            </h1>
            <button
              onClick={() => window.close()}
              className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-700 transition-colors"
            >
              ← Volver
            </button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Seleccionar Ronda:</label>
          <select
            value={selectedRound}
            onChange={(e) => setSelectedRound(parseInt(e.target.value))}
            className="bg-gray-700 text-white px-4 py-2 rounded-lg"
          >
            {rounds.map(round => (
              <option key={round} value={round}>Ronda {round}</option>
            ))}
          </select>
        </div>

        <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-6 py-4 text-left">Jugador</th>
                <th className="px-6 py-4 text-center">Estrellas</th>
                <th className="px-6 py-4 text-center">Ataques</th>
                <th className="px-6 py-4 text-center">Promedio</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredPlayers.map((player) => {
                const key = `${player.player_tag}_${player.round_number}`;
                const currentStars = editValues[key]?.stars || 0;
                const currentAttacks = editValues[key]?.attacks || 0;
                const average = currentAttacks > 0 ? (currentStars / currentAttacks).toFixed(1) : '0.0';
                const hasChanges = currentStars !== player.stars || currentAttacks !== player.attacks_used;
                
                return (
                  <tr key={key} className="hover:bg-gray-700 transition-colors">
                    <td className="px-6 py-4 font-medium">
                      {player.player_name}
                      <div className="text-xs text-gray-400">#{player.player_tag}</div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <input
                        type="number"
                        min="0"
                        max="9"
                        value={editValues[key]?.stars || 0}
                        onChange={(e) => setEditValues({
                          ...editValues,
                          [key]: { ...editValues[key], stars: parseInt(e.target.value) || 0 }
                        })}
                        className="w-20 px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 text-center"
                      />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <input
                        type="number"
                        min="0"
                        max="3"
                        value={editValues[key]?.attacks || 0}
                        onChange={(e) => setEditValues({
                          ...editValues,
                          [key]: { ...editValues[key], attacks: parseInt(e.target.value) || 0 }
                        })}
                        className="w-20 px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 text-center"
                      />
                    </td>
                    <td className="px-6 py-4 text-center text-green-400">
                      {average}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => updatePlayer(player.player_tag, player.round_number)}
                        disabled={!hasChanges || updating === key}
                        className={`px-4 py-2 rounded transition-colors ${
                          hasChanges && updating !== key
                            ? 'bg-purple-600 hover:bg-purple-700'
                            : 'bg-gray-600 cursor-not-allowed'
                        }`}
                      >
                        {updating === key ? '⏳' : hasChanges ? '💾 Guardar' : '✓'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}