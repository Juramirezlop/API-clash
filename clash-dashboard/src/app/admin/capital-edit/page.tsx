'use client';

import { useState, useEffect } from 'react';

interface CapitalPlayer {
  player_tag: string;
  player_name: string;
  capital_destroyed: number;
  attacks_used: number;
  weekend_date: string;
}

export default function CapitalEditPage() {
  const [players, setPlayers] = useState<CapitalPlayer[]>([]);
  const [editValues, setEditValues] = useState<{[key: string]: number}>({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchPlayers();
  }, []);

  const fetchPlayers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/capital-edit');
      const data = await response.json();
      setPlayers(data);
      
      const initialValues: {[key: string]: number} = {};
      data.forEach((p: CapitalPlayer) => {
        initialValues[p.player_tag] = p.attacks_used;
      });
      setEditValues(initialValues);
    } catch (error) {
      console.error('Error fetching capital data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateAttacks = async (playerTag: string) => {
    try {
      setUpdating(playerTag);
      
      const response = await fetch('/api/capital-edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          player_tag: playerTag,
          attacks_used: editValues[playerTag] || 0
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setPlayers(players.map(p => 
          p.player_tag === playerTag 
            ? { ...p, attacks_used: editValues[playerTag] || 0 }
            : p
        ));
        alert('✅ Ataques actualizados correctamente');
      } else {
        alert('❌ Error: ' + result.error);
      }
    } catch (error) {
      console.error('Error updating attacks:', error);
      alert('❌ Error al actualizar ataques');
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
            <h1 className="text-3xl font-bold text-blue-400">
              🏰 Editor de Ataques - Capital (Última Semana)
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
        <div className="bg-yellow-900/20 border border-yellow-600 rounded-lg p-4 mb-6">
          <p className="text-yellow-200">
            ⚠️ <strong>Nota:</strong> Solo se muestran datos del último fin de semana de capital. 
            El oro destruido viene de la API y no se puede editar. Solo puedes ajustar el número de ataques usados.
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-6 py-4 text-left">Jugador</th>
                <th className="px-6 py-4 text-center">Oro Destruido</th>
                <th className="px-6 py-4 text-center">Ataques Usados</th>
                <th className="px-6 py-4 text-center">Promedio</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {players.map((player) => {
                const currentAttacks = editValues[player.player_tag] || 0;
                const average = currentAttacks > 0 ? Math.round(player.capital_destroyed / currentAttacks) : 0;
                const hasChanges = currentAttacks !== player.attacks_used;
                
                return (
                  <tr key={player.player_tag} className="hover:bg-gray-700 transition-colors">
                    <td className="px-6 py-4 font-medium">
                      {player.player_name}
                      <div className="text-xs text-gray-400">#{player.player_tag}</div>
                    </td>
                    <td className="px-6 py-4 text-center text-orange-400 font-bold">
                      {player.capital_destroyed.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={editValues[player.player_tag] || 0}
                        onChange={(e) => setEditValues({
                          ...editValues,
                          [player.player_tag]: parseInt(e.target.value) || 0
                        })}
                        className="w-20 px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 text-center"
                      />
                    </td>
                    <td className="px-6 py-4 text-center text-green-400">
                      {average.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => updateAttacks(player.player_tag)}
                        disabled={!hasChanges || updating === player.player_tag}
                        className={`px-4 py-2 rounded transition-colors ${
                          hasChanges && updating !== player.player_tag
                            ? 'bg-blue-600 hover:bg-blue-700'
                            : 'bg-gray-600 cursor-not-allowed'
                        }`}
                      >
                        {updating === player.player_tag ? '⏳' : hasChanges ? '💾 Guardar' : '✓'}
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