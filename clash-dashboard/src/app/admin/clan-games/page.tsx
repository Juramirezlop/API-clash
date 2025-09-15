'use client';
import { useState, useEffect } from 'react';

interface ClanGamesPlayer {
  player_tag: string;
  player_name: string;
  clan_games_points: number;
}

export default function ClanGamesAdmin() {
  const [players, setPlayers] = useState<ClanGamesPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{[key: string]: number}>({});

  useEffect(() => {
    fetchPlayers();
  }, []);

  const fetchPlayers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/clan-games');
      const data = await response.json();
      setPlayers(data);
      
      // Inicializar valores de edición
      const initialValues: {[key: string]: number} = {};
      data.forEach((player: ClanGamesPlayer) => {
        initialValues[player.player_tag] = player.clan_games_points;
      });
      setEditValues(initialValues);
    } catch (error) {
      console.error('Error fetching players:', error);
      alert('Error al cargar jugadores');
    } finally {
      setLoading(false);
    }
  };

  const updatePlayerPoints = async (playerTag: string) => {
    try {
      setUpdating(playerTag);
      
      const response = await fetch('/api/clan-games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          player_tag: playerTag,
          clan_games_points: editValues[playerTag] || 0
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // Actualizar la lista local
        setPlayers(prev => 
          prev.map(p => 
            p.player_tag === playerTag 
              ? { ...p, clan_games_points: editValues[playerTag] || 0 }
              : p
          )
        );
        alert('✅ Puntos actualizados correctamente');
      } else {
        alert('❌ Error: ' + result.error);
      }
    } catch (error) {
      console.error('Error updating points:', error);
      alert('❌ Error al actualizar puntos');
    } finally {
      setUpdating(null);
    }
  };

  const updateBulkPoints = async () => {
    if (!confirm('¿Actualizar TODOS los puntos modificados?')) return;
    
    const changedPlayers = players.filter(p => 
      editValues[p.player_tag] !== p.clan_games_points
    );
    
    if (changedPlayers.length === 0) {
      alert('No hay cambios que guardar');
      return;
    }
    
    try {
      setUpdating('bulk');
      
      for (const player of changedPlayers) {
        await fetch('/api/clan-games', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            player_tag: player.player_tag,
            clan_games_points: editValues[player.player_tag] || 0
          })
        });
      }
      
      await fetchPlayers(); // Recargar datos
      alert(`✅ ${changedPlayers.length} jugadores actualizados`);
    } catch (error) {
      console.error('Error in bulk update:', error);
      alert('❌ Error en actualización masiva');
    } finally {
      setUpdating(null);
    }
  };

  const resetAllPoints = async () => {
    if (!confirm('⚠️ ¿RESETEAR todos los puntos de Clan Games a 0?\n\nEsta acción NO se puede deshacer.')) {
      return;
    }
    
    try {
      setUpdating('reset');
      
      for (const player of players) {
        await fetch('/api/clan-games', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            player_tag: player.player_tag,
            clan_games_points: 0
          })
        });
      }
      
      await fetchPlayers();
      alert('✅ Todos los puntos reseteados a 0');
    } catch (error) {
      console.error('Error resetting points:', error);
      alert('❌ Error al resetear puntos');
    } finally {
      setUpdating(null);
    }
  };

  const quickSetPoints = (points: number) => {
    const newValues = { ...editValues };
    players.forEach(player => {
      newValues[player.player_tag] = points;
    });
    setEditValues(newValues);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">⏳ Cargando jugadores...</div>
      </div>
    );
  }

  const changedCount = players.filter(p => 
    editValues[p.player_tag] !== p.clan_games_points
  ).length;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-yellow-400 mb-4">
            🎯 Administración de Clan Games
          </h1>
          
          <div className="flex flex-wrap gap-4 items-center">
            <button
              onClick={updateBulkPoints}
              disabled={changedCount === 0 || updating !== null}
              className={`px-6 py-2 rounded-lg font-medium ${
                changedCount > 0 && updating === null
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-gray-600 cursor-not-allowed'
              }`}
            >
              {updating === 'bulk' ? '⏳' : '💾'} Guardar Cambios ({changedCount})
            </button>
            
            <button
              onClick={resetAllPoints}
              disabled={updating !== null}
              className={`px-6 py-2 rounded-lg font-medium ${
                updating === null
                  ? 'bg-red-600 hover:bg-red-700' 
                  : 'bg-gray-600 cursor-not-allowed'
              }`}
            >
              {updating === 'reset' ? '⏳' : '🗑️'} Resetear Todo
            </button>
            
            <div className="flex gap-2">
              <span className="text-gray-300">Asignar a todos:</span>
              <button
                onClick={() => quickSetPoints(0)}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                0
              </button>
              <button
                onClick={() => quickSetPoints(1000)}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                1000
              </button>
              <button
                onClick={() => quickSetPoints(4000)}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                4000
              </button>
            </div>
          </div>
        </div>

        {/* Players List */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-6 py-4 text-left">Jugador</th>
                <th className="px-6 py-4 text-center">Puntos Actuales</th>
                <th className="px-6 py-4 text-center">Nuevos Puntos</th>
                <th className="px-6 py-4 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {players.map((player) => {
                const isChanged = editValues[player.player_tag] !== player.clan_games_points;
                const isUpdatingThis = updating === player.player_tag;
                
                return (
                  <tr 
                    key={player.player_tag} 
                    className={`hover:bg-gray-700 transition-colors ${isChanged ? 'bg-yellow-900/20' : ''}`}
                  >
                    <td className="px-6 py-4 font-medium">
                      {player.player_name}
                      {isChanged && <span className="ml-2 text-yellow-400">●</span>}
                    </td>
                    <td className="px-6 py-4 text-center text-gray-300">
                      {player.clan_games_points.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <input
                        type="number"
                        min="0"
                        max="50000"
                        step="50"
                        value={editValues[player.player_tag] || 0}
                        onChange={(e) => setEditValues(prev => ({
                          ...prev,
                          [player.player_tag]: parseInt(e.target.value) || 0
                        }))}
                        className="w-24 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-center focus:outline-none focus:border-blue-500"
                        disabled={updating !== null}
                      />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => updatePlayerPoints(player.player_tag)}
                        disabled={!isChanged || updating !== null}
                        className={`px-4 py-2 rounded-lg text-sm font-medium ${
                          isChanged && updating === null
                            ? 'bg-blue-600 hover:bg-blue-700' 
                            : 'bg-gray-600 cursor-not-allowed'
                        }`}
                      >
                        {isUpdatingThis ? '⏳' : '💾'} Guardar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Info */}
        <div className="mt-6 text-center text-gray-400 text-sm">
          <p>💡 Los puntos se recalculan automáticamente para el Top 8</p>
          <p>🏆 Sistema: 1°=10pts, 2°=8pts, 3°=6pts, 4°=5pts, 5°=4pts, 6°=3pts, 7°=2pts, 8°=1pts</p>
        </div>
      </div>
    </div>
  );
}