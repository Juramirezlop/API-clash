'use client';

import { useState, useEffect } from 'react';

interface WarRecord {
  id: number;
  player_tag: string;
  player_name: string;
  war_tag: string;
  war_date: string;
  stars: number;
  attacks_used: number;
  manually_edited: boolean;
}

export default function WarsEditPage() {
  const [wars, setWars] = useState<WarRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedWarTag, setSelectedWarTag] = useState<string>('');

  useEffect(() => {
    fetchWars();
  }, []);

  const fetchWars = async () => {
    try {
      const response = await fetch('/api/admin/wars');
      const data = await response.json();
      setWars(data || []);
      
      // Seleccionar la guerra más reciente por defecto
      if (data && data.length > 0) {
        const uniqueWarTags = [...new Set(data.map((w: WarRecord) => w.war_tag))];
        setSelectedWarTag(uniqueWarTags[0]);
      }
    } catch (error) {
      console.error('Error fetching wars:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (warRecord: WarRecord, field: 'stars' | 'attacks_used', value: number) => {
    try {
      setSaving(true);
      
      const response = await fetch('/api/admin/wars', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_tag: warRecord.player_tag,
          war_tag: warRecord.war_tag,
          [field]: value,
          manually_edited: true
        })
      });

      if (response.ok) {
        await fetchWars();
      } else {
        alert('❌ Error al guardar');
      }
    } catch (error) {
      console.error('Error saving war data:', error);
      alert('❌ Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const uniqueWarTags = [...new Set(wars.map(w => w.war_tag))].sort().reverse();
  const filteredWars = wars.filter(w => w.war_tag === selectedWarTag);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div>⏳ Cargando guerras...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-red-400">⚔️ Editar Guerras</h1>
          <button
            onClick={() => window.close()}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            ← Volver
          </button>
        </div>

        {wars.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-12 text-center text-gray-400">
            📊 No hay datos de guerras disponibles
          </div>
        ) : (
          <>
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Seleccionar Guerra:</label>
              <select
                value={selectedWarTag}
                onChange={(e) => setSelectedWarTag(e.target.value)}
                className="w-full md:w-96 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
              >
                {uniqueWarTags.map((warTag) => {
                  const warData = wars.find(w => w.war_tag === warTag);
                  return (
                    <option key={warTag} value={warTag}>
                      Guerra del {warData ? new Date(warData.war_date).toLocaleDateString('es-ES') : warTag}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left">Jugador</th>
                      <th className="px-6 py-3 text-center">Estrellas</th>
                      <th className="px-6 py-3 text-center">Ataques Usados</th>
                      <th className="px-6 py-3 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {filteredWars.map((war) => (
                      <tr key={`${war.war_tag}-${war.player_tag}`} className="hover:bg-gray-700">
                        <td className="px-6 py-3">
                          <div className="font-medium">{war.player_name}</div>
                          <div className="text-xs text-gray-400">#{war.player_tag}</div>
                        </td>
                        <td className="px-6 py-3">
                          <input
                            type="number"
                            min="0"
                            max="6"
                            value={war.stars}
                            onChange={(e) => {
                              const value = parseInt(e.target.value) || 0;
                              if (value >= 0 && value <= 6) {
                                handleSave(war, 'stars', value);
                              }
                            }}
                            disabled={saving}
                            className="w-20 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-center text-yellow-400 font-bold"
                          />
                        </td>
                        <td className="px-6 py-3">
                          <input
                            type="number"
                            min="0"
                            max="2"
                            value={war.attacks_used}
                            onChange={(e) => {
                              const value = parseInt(e.target.value) || 0;
                              if (value >= 0 && value <= 2) {
                                handleSave(war, 'attacks_used', value);
                              }
                            }}
                            disabled={saving}
                            className="w-20 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-center"
                          />
                        </td>
                        <td className="px-6 py-3 text-center">
                          {war.manually_edited ? (
                            <span className="px-2 py-1 bg-purple-600 text-xs rounded">✏️ Editado</span>
                          ) : (
                            <span className="px-2 py-1 bg-gray-600 text-xs rounded">🤖 Auto</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 bg-gray-800 p-4 rounded-lg">
              <h3 className="font-bold text-yellow-400 mb-2">📋 Instrucciones:</h3>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• Los cambios se guardan automáticamente al modificar un campo</li>
                <li>• Estrellas: 0-6 (máximo 3 por ataque)</li>
                <li>• Ataques: 0-2 (máximo 2 por guerra regular)</li>
                <li>• Los registros editados manualmente no se sobrescribirán al ejecutar update-data.js</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
