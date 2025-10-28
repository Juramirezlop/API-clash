"use client"

import { useState, useEffect } from 'react';

interface Player {
  player_tag: string;
  player_name: string;
  donation_points: number;
  event_points: number;
  trophy_points: number;
  war_points: number;
  cwl_points: number;
  capital_points: number;
  total_points: number;
  donation_penalty: number;
  war_penalty: number;
  capital_penalty: number;
  cwl_penalty: number;
  clan_games_penalty: number;
  inactivity_penalty: number;
  total_penalties: number;
  is_active: boolean;
  last_seen: string;
  join_date: string;
}

interface DonationStats {
  player_tag: string;
  player_name: string;
  donations_given: number;
  donations_received: number;
  balance: number;
}

interface WarData {
  player_name: string;
  player_tag: string;
  total_stars: number;
  attacks_used: number;
  wars_participated: number;
  avg_real: number;
}

interface CapitalData {
  player_name: string;
  player_tag: string;
  total_destroyed: number;
  total_attacks: number;
  average_per_attack: number;
  weekends_participated: number;
}

interface CWLData {
  player_tag: string;
  player_name: string;
  total_stars: number;
  total_attacks: number;
  rounds_participated: number;
  cwl_season: string;
}

interface EventData {
  player_tag: string;
  player_name: string;
  season_points: number;
  clan_games_points: number;
}

interface PenaltyData {
  player_tag: string;
  player_name: string;
  donation_penalty: number;
  war_penalty: number;
  capital_penalty: number;
  cwl_penalty: number;
  clan_games_penalty: number;
  inactivity_penalty: number;
  total_penalties: number;
}

interface WeeklyTrophyData {
  player_tag: string;
  player_name: string;
  season_points: number;
  week_start_date: string;
}

export default function Dashboard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [donations, setDonations] = useState<DonationStats[]>([]);
  const [wars, setWars] = useState<WarData[]>([]);
  const [capital, setCapital] = useState<CapitalData[]>([]);
  const [cwl, setCwl] = useState<CWLData[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [penalties, setPenalties] = useState<PenaltyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showOnlyTop15, setShowOnlyTop15] = useState(false);
  const [activeTab, setActiveTab] = useState('rankings');
  const [donationSortBy, setDonationSortBy] = useState('balance');
  const [warSortBy, setWarSortBy] = useState('total');
  const [capitalSortBy, setCapitalSortBy] = useState('total');

  useEffect(() => {
    fetchData();
  }, []);

  const updateData = async () => {
    try {
      setUpdating(true);
      
      const response = await fetch('/api/update', {
        method: 'POST'
      });
      
      const result = await response.json();
      
      if (result.success) {
        await fetchData();
        alert('✅ Datos actualizados exitosamente desde Clash of Clans!');
      } else {
        alert('❌ Error al actualizar: ' + result.message);
      }
      
    } catch (error) {
      console.error('Error updating data:', error);
      alert('❌ Error al actualizar los datos');
    } finally {
      setUpdating(false);
    }
  };

  const resetSeason = async () => {
    if (!confirm('⚠️ ¿Estás seguro de resetear la temporada?\n\nEsto:\n• Reseteará todas las puntuaciones a 0\n• Creará un backup de datos actuales\n• Configurará nueva fecha de inicio\n\nEsta acción NO se puede deshacer.')) {
      return;
    }
    
    try {
      setUpdating(true);
      
      const response = await fetch('/api/reset', {
        method: 'POST'
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`✅ Temporada reseteada correctamente!\n\n📊 ${result.data.players_reset} jugadores reseteados\n💾 Backup: ${result.data.backup_table}\n📅 Nueva temporada desde: ${new Date(result.data.reset_date).toLocaleDateString()}`);
        await fetchData();
      } else {
        alert('❌ Error: ' + result.message);
      }
    } catch (error) {
      console.error('Error resetting season:', error);
      alert('❌ Error al resetear temporada');
    } finally {
      setUpdating(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const donationsUrl = `/api/donations?sort=${donationSortBy}`;
      const warsUrl = `/api/wars?sort=${warSortBy}`;
      const capitalUrl = `/api/capital?sort=${capitalSortBy}`;
      
      const [playersRes, penaltiesRes, donationsRes, warsRes, capitalRes, cwlRes, eventsRes] = await Promise.all([
        fetch('/api/players'),
        fetch('/api/penalties'),
        fetch(donationsUrl),
        fetch(warsUrl),
        fetch(capitalUrl),
        fetch('/api/cwl'),
        fetch('/api/events')
      ]);

      const [playersData, penaltiesData, donationsData, warsData, capitalData, cwlData, eventsData] = await Promise.all([
        playersRes.json(),
        penaltiesRes.json(),
        donationsRes.json(),
        warsRes.json(),
        capitalRes.json(),
        cwlRes.json(),
        eventsRes.json()
      ]);

      setPlayers(playersData || []);
      setPenalties(penaltiesData || []);
      setDonations(donationsData || []);
      setWars(warsData || []);
      setCapital(capitalData || []);
      setCwl(cwlData || []);
      setEvents(eventsData || []);
      
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (!loading) {
      const fetchDonations = async () => {
        try {
          const response = await fetch(`/api/donations?sort=${donationSortBy}`);
          const data = await response.json();
          setDonations(data || []);
        } catch (error) {
          console.error('Error fetching donations:', error);
        }
      };
      fetchDonations();
    }
  }, [donationSortBy, loading]);

  useEffect(() => {
    if (!loading) {
      const fetchWars = async () => {
        try {
          const response = await fetch(`/api/wars?sort=${warSortBy}`);
          const data = await response.json();
          setWars(data || []);
        } catch (error) {
          console.error('Error fetching wars:', error);
        }
      };
      fetchWars();
    }
  }, [warSortBy, loading]);

  useEffect(() => {
    if (!loading) {
      const fetchCapital = async () => {
        try {
          const response = await fetch(`/api/capital?sort=${capitalSortBy}`);
          const data = await response.json();
          setCapital(data || []);
        } catch (error) {
          console.error('Error fetching capital:', error);
        }
      };
      fetchCapital();
    }
  }, [capitalSortBy, loading]);

  const getInactiveDays = (lastSeen: string) => {
    const lastSeenDate = new Date(lastSeen);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastSeenDate.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getActivityIcon = (lastSeen: string, isActive: boolean) => {
    if (!isActive) return '🔴';
    const days = getInactiveDays(lastSeen);
    if (days >= 5) return '🔴';
    if (days >= 3) return '🟠';
    if (days >= 1) return '🟡';
    return '🟢';
  };

  const filteredPlayers = showOnlyTop15 
    ? players.filter(p => p.total_points > 0).slice(0, 15)
    : players;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">⏳ Cargando datos del clan...</div>
      </div>
    );
  }

  const TrophiesWeeklyView = () => {
    const [data, setData] = useState<{players: any[], weeks: any[]} | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      const fetchMonthlyTrophies = async () => {
        try {
          const response = await fetch('/api/trophies-monthly');
          if (!response.ok) throw new Error('Error al cargar copas');
          const result = await response.json();
          setData(result);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };
      fetchMonthlyTrophies();
    }, []);

    if (loading) {
      return <div className="text-center py-12">⏳ Cargando copas mensuales...</div>;
    }

    if (error || !data) {
      return (
        <div>
          <h2 className="text-2xl font-bold text-purple-400 mb-6">
            🏆 Copas Semanales - Acumulado Mensual
          </h2>
          <div className="bg-gray-800 rounded-lg p-12 text-center text-red-400">
            ❌ Error: {error || 'No hay datos disponibles'}
          </div>
        </div>
      );
    }

    const { players, weeks } = data;

    if (!players || players.length === 0) {
      return (
        <div>
          <h2 className="text-2xl font-bold text-purple-400 mb-6">
            🏆 Copas Semanales - Acumulado Mensual
          </h2>
          <div className="bg-gray-800 rounded-lg p-12 text-center text-gray-400">
            📊 No hay datos de copas para este mes
          </div>
        </div>
      );
    }

    return (
      <div>
        <h2 className="text-2xl font-bold text-purple-400 mb-6">
          🏆 Copas Semanales - Acumulado Mensual ({weeks.length} semanas)
        </h2>
        
        <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left">Pos</th>
                  <th className="px-4 py-3 text-left">Jugador</th>
                  {weeks.map((week, idx) => (
                    <th key={`w-${idx}`} className="px-3 py-3 text-center text-sm">
                      S{week.number}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center font-bold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {players.map((player, idx) => (
                  <tr key={player.player_tag} className="hover:bg-gray-700">
                    <td className="px-4 py-3 text-yellow-400 font-bold">{idx + 1}</td>
                    <td className="px-4 py-3">{player.player_name}</td>
                    {weeks.map((week, wIdx) => {
                      const w = player.weeks?.find((pw: any) => pw.week === week.date);
                      return (
                        <td key={`${player.player_tag}-${wIdx}`} className="px-3 py-3 text-center text-purple-400 text-sm">
                          {w?.trophies > 0 ? w.trophies.toLocaleString() : '-'}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center font-bold text-yellow-400">
                      {player.total?.toLocaleString() || '0'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const tabs = [
    { id: 'rankings', label: '🏆 Rankings' },
    { id: 'penalties', label: '⚠️ Penalizaciones' },
    { id: 'donations', label: '🎁 Donaciones' },
    { id: 'wars', label: '⚔️ Guerras' },
    { id: 'cwl', label: '🏆 Liga CWL' },
    { id: 'capital', label: '🏰 Capital' },
    { id: 'events', label: '🎯 Juegos Clan' },
    { id: 'trophies', label: '🏆 Copas' }
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 shadow-lg border-b border-gray-700">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-yellow-400">
              🏆 Dashboard Clan RUDO
            </h1>
            <div className="flex items-center space-x-4">
              <button
                onClick={updateData}
                disabled={updating}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  updating 
                    ? 'bg-gray-600 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {updating ? '⏳ Actualizando...' : '🔄 Actualizar'}
              </button>
              <button
                onClick={() => window.open('/admin/clan-games', '_blank')}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 transition-colors"
              >
                🎯 Admin Clan Games
              </button>
              <button
                onClick={() => window.open('/admin/trophies-edit', '_blank')}
                className="px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-700 transition-colors"
              >
                🏆 Admin Copas
              </button>
              <button
                onClick={() => window.open('/admin/cwl-edit', '_blank')}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 transition-colors"
              >
                🏆 Admin CWL
              </button>
              <button
                onClick={() => window.open('/admin/wars-edit', '_blank')}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition-colors"
              >
                ⚔️ Admin Guerras
              </button>
              <button
                onClick={resetSeason}
                disabled={updating}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  updating 
                    ? 'bg-gray-600 cursor-not-allowed' 
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                🔄 Reset Temporada
              </button>
              <div className="text-sm text-gray-300">
                ✅ {players.filter(p => p.is_active).length} miembros activos
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex flex-wrap gap-1 bg-gray-800 p-1 rounded-lg">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-yellow-600 text-white'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'rankings' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-yellow-400">
                  🏆 Ranking General de Puntos (10 Categorías)
                </h2>
              </div>
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2 text-gray-300">
                  <input
                    type="checkbox"
                    checked={showOnlyTop15}
                    onChange={(e) => setShowOnlyTop15(e.target.checked)}
                    className="rounded"
                  />
                  <span>Solo Top 15</span>
                </label>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-4 text-left">Pos</th>
                    <th className="px-6 py-4 text-left">Estado</th>
                    <th className="px-6 py-4 text-left">Jugador</th>
                    <th className="px-6 py-4 text-center">Donaciones</th>
                    <th className="px-6 py-4 text-center">Clan Games</th>
                    <th className="px-6 py-4 text-center">Copas</th>
                    <th className="px-6 py-4 text-center">Guerras</th>
                    <th className="px-6 py-4 text-center">CWL 🔥</th>
                    <th className="px-6 py-4 text-center">Capital</th>
                    <th className="px-6 py-4 text-center text-red-400">Penaliz.</th>
                    <th className="px-6 py-4 text-center font-bold">TOTAL</th>
                    <th className="px-6 py-4 text-center">Ingreso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredPlayers.map((player, index) => (
                    <tr 
                      key={`ranking-${player.player_tag}`}
                      className={`hover:bg-gray-700 transition-colors ${
                        index < 15 && player.total_points > 0 
                          ? 'bg-green-900/20' 
                          : (player.total_points || 0) < 0 
                            ? 'bg-red-900/20' 
                            : ''
                      }`}
                    >
                      <td className="px-6 py-4 font-bold text-yellow-400">
                        {player.total_points > 0 ? index + 1 : '-'}
                      </td>
                      <td className="px-6 py-4 text-center text-2xl">
                        {getActivityIcon(player.last_seen, player.is_active)}
                      </td>
                      <td className="px-6 py-4 font-medium">
                        {player.player_name}
                        <div className="text-xs text-gray-400">
                          #{player.player_tag}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center text-blue-400">{player.donation_points || 0}</td>
                      <td className="px-6 py-4 text-center text-green-400">{player.event_points || 0}</td>
                      <td className="px-6 py-4 text-center text-purple-400">{player.trophy_points || 0}</td>
                      <td className="px-6 py-4 text-center text-orange-400">{player.war_points || 0}</td>
                      <td className="px-6 py-4 text-center text-red-400 font-semibold">{player.cwl_points || 0}</td>
                      <td className="px-6 py-4 text-center text-cyan-400">{player.capital_points || 0}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`font-bold ${
                          (player.total_penalties || 0) < 0 ? 'text-red-400' : 'text-gray-500'
                        }`}>
                          {player.total_penalties || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-yellow-400 text-lg">
                        {player.total_points || 0}
                      </td>
                      <td className="px-6 py-4 text-center text-xs text-gray-400">
                        {new Date(player.join_date).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'penalties' && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-red-400">
                ⚠️ Sistema de Penalizaciones
              </h2>
              <div className="text-sm text-gray-400 mt-2">
                Solo se muestran jugadores con penalizaciones activas
              </div>
            </div>

            <div className="grid md:grid-cols-6 gap-4 mb-6">
              <div className="bg-gray-800 p-4 rounded-lg border-l-4 border-blue-500">
                <div className="text-2xl mb-2">💸</div>
                <div className="text-xl font-bold text-blue-400">
                  {penalties.reduce((sum, p) => sum + Math.abs(p.donation_penalty), 0)}
                </div>
                <div className="text-gray-400 text-sm">Donaciones</div>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg border-l-4 border-orange-500">
                <div className="text-2xl mb-2">⚔️</div>
                <div className="text-xl font-bold text-orange-400">
                  {penalties.reduce((sum, p) => sum + Math.abs(p.war_penalty), 0)}
                </div>
                <div className="text-gray-400 text-sm">Guerras</div>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg border-l-4 border-yellow-500">
                <div className="text-2xl mb-2">🏰</div>
                <div className="text-xl font-bold text-yellow-400">
                  {penalties.reduce((sum, p) => sum + Math.abs(p.capital_penalty), 0)}
                </div>
                <div className="text-gray-400 text-sm">Capital</div>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg border-l-4 border-purple-500">
                <div className="text-2xl mb-2">🏆</div>
                <div className="text-xl font-bold text-purple-400">
                  {penalties.reduce((sum, p) => sum + Math.abs(p.cwl_penalty), 0)}
                </div>
                <div className="text-gray-400 text-sm">CWL</div>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg border-l-4 border-pink-500">
                <div className="text-2xl mb-2">🎯</div>
                <div className="text-xl font-bold text-pink-400">
                  {penalties.reduce((sum, p) => sum + Math.abs(p.clan_games_penalty), 0)}
                </div>
                <div className="text-gray-400 text-sm">Clan Games</div>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg border-l-4 border-gray-500">
                <div className="text-2xl mb-2">💤</div>
                <div className="text-xl font-bold text-gray-400">
                  {penalties.reduce((sum, p) => sum + Math.abs(p.inactivity_penalty || 0), 0)}
                </div>
                <div className="text-gray-400 text-sm">Inactividad</div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-4 text-left">Jugador</th>
                    <th className="px-6 py-4 text-center">💸 Donaciones</th>
                    <th className="px-6 py-4 text-center">⚔️ Guerras</th>
                    <th className="px-6 py-4 text-center">🏰 Capital</th>
                    <th className="px-6 py-4 text-center">🏆 CWL</th>
                    <th className="px-6 py-4 text-center">🎯 Clan Games</th>
                    <th className="px-6 py-4 text-center">💤 Inactividad</th>
                    <th className="px-6 py-4 text-center font-bold text-red-400">TOTAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {penalties.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                        🎉 ¡No hay penalizaciones activas! Todos los jugadores están al día.
                      </td>
                    </tr>
                  ) : (
                    penalties.map((penalty) => (
                      <tr 
                        key={`penalty-${penalty.player_tag}`}
                        className="hover:bg-gray-700 transition-colors"
                      >
                        <td className="px-6 py-4 font-medium">
                          {penalty.player_name}
                          <div className="text-xs text-gray-400">
                            #{penalty.player_tag}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={penalty.donation_penalty < 0 ? 'text-blue-400 font-bold' : 'text-gray-500'}>
                            {penalty.donation_penalty || 0}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={penalty.war_penalty < 0 ? 'text-orange-400 font-bold' : 'text-gray-500'}>
                            {penalty.war_penalty || 0}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={penalty.capital_penalty < 0 ? 'text-yellow-400 font-bold' : 'text-gray-500'}>
                            {penalty.capital_penalty || 0}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={penalty.cwl_penalty < 0 ? 'text-purple-400 font-bold' : 'text-gray-500'}>
                            {penalty.cwl_penalty || 0}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={penalty.clan_games_penalty < 0 ? 'text-pink-400 font-bold' : 'text-gray-500'}>
                            {penalty.clan_games_penalty || 0}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={(penalty.inactivity_penalty || 0) < 0 ? 'text-gray-400 font-bold' : 'text-gray-500'}>
                            {penalty.inactivity_penalty || 0}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-red-400 font-bold text-lg">
                            {penalty.total_penalties}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6 bg-gray-800 p-4 rounded-lg">
              <h3 className="font-bold text-yellow-400 mb-3">📋 Reglas de Penalización:</h3>
              <div className="grid md:grid-cols-2 gap-3 text-sm text-gray-300">
                <div>
                  <span className="text-blue-400 font-bold">💸 Donaciones:</span> Balance ≤-500 (-2pts), ≤-1000 (-5pts)
                </div>
                <div>
                  <span className="text-orange-400 font-bold">⚔️ Guerras:</span> -1 punto por cada ataque no usado
                </div>
                <div>
                  <span className="text-yellow-400 font-bold">🏰 Capital:</span> -5 pts por fin de semana sin atacar, -3 pts si &lt;10k destruido
                </div>
                <div>
                  <span className="text-purple-400 font-bold">🏆 CWL:</span> -8 puntos por cada ataque no usado
                </div>
                <div>
                  <span className="text-pink-400 font-bold">🎯 Clan Games:</span> -5 pts si 0 puntos, -2 pts si &lt;1000
                </div>
                <div>
                  <span className="text-gray-400 font-bold">💤 Inactividad:</span> -2 pts si ≥2 días sin donar
                </div>
                <div className="text-gray-400 col-span-2">
                  ⏰ Solo aplica a jugadores con más de 7 días en el clan
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'donations' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-green-400">
                🎁 Estadísticas de Donaciones
              </h2>
              <div className="flex items-center space-x-4">
                <select
                  value={donationSortBy}
                  onChange={(e) => setDonationSortBy(e.target.value)}
                  className="bg-gray-700 text-white px-3 py-2 rounded-lg"
                >
                  <option value="balance">Ordenar por Balance</option>
                  <option value="quantity">Ordenar por Cantidad</option>
                </select>
              </div>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6 mb-6">
              <div className="bg-gray-800 p-4 rounded-lg">
                <div className="text-3xl mb-2">📤</div>
                <div className="text-2xl font-bold text-green-400">
                  {donations.reduce((sum, d) => sum + (d.donations_given || 0), 0).toLocaleString()}
                </div>
                <div className="text-gray-400">Total Donado</div>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg">
                <div className="text-3xl mb-2">📥</div>
                <div className="text-2xl font-bold text-blue-400">
                  {donations.reduce((sum, d) => sum + (d.donations_received || 0), 0).toLocaleString()}
                </div>
                <div className="text-gray-400">Total Recibido</div>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg">
                <div className="text-3xl mb-2">⚖️</div>
                <div className="text-2xl font-bold text-orange-400">
                  {donations.filter(d => (d.balance || 0) > 0).length}
                </div>
                <div className="text-gray-400">Balance Positivo</div>
              </div>
            </div>
            
            <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-4 text-left">Pos</th>
                    <th className="px-6 py-4 text-left">Jugador</th>
                    <th className="px-6 py-4 text-center">Donado</th>
                    <th className="px-6 py-4 text-center">Recibido</th>
                    <th className="px-6 py-4 text-center">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {donations.map((donation, index) => (
                    <tr key={`donation-${donation.player_tag}`} className="hover:bg-gray-700 transition-colors">
                      <td className="px-6 py-4 font-bold text-yellow-400">{index + 1}</td>
                      <td className="px-6 py-4 font-medium">{donation.player_name}</td>
                      <td className="px-6 py-4 text-center text-green-400 font-bold">
                        {(donation.donations_given || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-center text-blue-400">
                        {(donation.donations_received || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={
                          (donation.balance || 0) >= 0
                            ? 'text-green-400 font-bold' 
                            : 'text-red-400 font-bold'
                        }>
                          {(donation.balance || 0) > 0 ? '+' : ''}
                          {(donation.balance || 0).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'wars' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-red-400">
                ⚔️ Guerras Normales (Acumulativo)
              </h2>
              <div className="flex items-center space-x-4">
                <select
                  value={warSortBy}
                  onChange={(e) => setWarSortBy(e.target.value)}
                  className="bg-gray-700 text-white px-3 py-2 rounded-lg"
                >
                  <option value="total">Ordenar por Total Estrellas</option>
                  <option value="average">Ordenar por Promedio Real</option>
                </select>
              </div>
            </div>
            
            <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-4 text-left">Pos</th>
                    <th className="px-6 py-4 text-left">Jugador</th>
                    <th className="px-6 py-4 text-center">Estrellas</th>
                    <th className="px-6 py-4 text-center">Ataques</th>
                    <th className="px-6 py-4 text-center">Guerras</th>
                    <th className="px-6 py-4 text-center">Promedio Real</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {wars.map((player, index) => (
                    <tr key={`war-${player.player_tag}`} className="hover:bg-gray-700 transition-colors">
                      <td className="px-6 py-4 font-bold text-yellow-400">{index + 1}</td>
                      <td className="px-6 py-4 font-medium">{player.player_name}</td>
                      <td className="px-6 py-4 text-center text-yellow-400 font-bold">
                        {player.total_stars || 0}
                      </td>
                      <td className="px-6 py-4 text-center">{player.attacks_used || 0}</td>
                      <td className="px-6 py-4 text-center">{player.wars_participated || 0}</td>
                      <td className="px-6 py-4 text-center text-green-400 font-bold">
                        {((player.avg_real || 0) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'cwl' && (
          <div>
            <h2 className="text-2xl font-bold text-purple-400 mb-6">
              🏆 Liga de Guerras (CWL) - Temporada Actual 🔥
            </h2>
            
            <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-4 text-left">Pos</th>
                    <th className="px-6 py-4 text-left">Jugador</th>
                    <th className="px-6 py-4 text-center">Estrellas</th>
                    <th className="px-6 py-4 text-center">Ataques</th>
                    <th className="px-6 py-4 text-center">Rondas</th>
                    <th className="px-6 py-4 text-center">Promedio</th>
                    <th className="px-6 py-4 text-center">Performance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {!Array.isArray(cwl) || cwl.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                        📊 No hay datos de CWL disponibles
                      </td>
                    </tr>
                  ) : (
                    [...cwl]
                      .sort((a, b) => (b.total_stars || 0) - (a.total_stars || 0))
                      .map((player, index) => (
                      <tr key={`cwl-${player.player_tag}`} className="hover:bg-gray-700 transition-colors">
                        <td className="px-6 py-4 font-bold text-yellow-400">{index + 1}</td>
                        <td className="px-6 py-4 font-medium">{player.player_name}</td>
                        <td className="px-6 py-4 text-center text-yellow-400 font-bold">
                          {player.total_stars || 0}
                        </td>
                        <td className="px-6 py-4 text-center">{player.total_attacks || 0}</td>
                        <td className="px-6 py-4 text-center">{player.rounds_participated || 0}</td>
                        <td className="px-6 py-4 text-center">
                          {(player.total_attacks || 0) > 0 ? ((player.total_stars || 0) / (player.total_attacks || 1)).toFixed(1) : '0.0'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            (player.total_stars || 0) >= 15 ? 'bg-green-600' : 
                            (player.total_stars || 0) >= 8 ? 'bg-yellow-600' : 
                            (player.total_stars || 0) > 0 ? 'bg-orange-600' : 'bg-gray-600'
                          }`}>
                            {(player.total_stars || 0) >= 15 ? 'EXCELENTE' : 
                             (player.total_stars || 0) >= 8 ? 'BUENO' : 
                             (player.total_stars || 0) > 0 ? 'REGULAR' : 'SIN DATOS'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'capital' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-blue-400">
                🏰 Capital del Clan (Acumulativo)
              </h2>
              <div className="flex items-center space-x-4">
                <select
                  value={capitalSortBy}
                  onChange={(e) => setCapitalSortBy(e.target.value)}
                  className="bg-gray-700 text-white px-3 py-2 rounded-lg"
                >
                  <option value="total">Ordenar por Total Destruido</option>
                  <option value="average">Ordenar por Promedio por Ataque</option>
                </select>
              </div>
            </div>
            
            <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-4 text-left">Pos</th>
                    <th className="px-6 py-4 text-left">Jugador</th>
                    <th className="px-6 py-4 text-center">Total Destruido</th>
                    <th className="px-6 py-4 text-center">Ataques</th>
                    <th className="px-6 py-4 text-center">Promedio</th>
                    <th className="px-6 py-4 text-center">Fines de Semana</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {capital.map((player, index) => (
                    <tr key={`capital-${player.player_tag}`} className="hover:bg-gray-700 transition-colors">
                      <td className="px-6 py-4 font-bold text-yellow-400">{index + 1}</td>
                      <td className="px-6 py-4 font-medium">{player.player_name}</td>
                      <td className="px-6 py-4 text-center text-orange-400 font-bold">
                        {(player.total_destroyed || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-center">{player.total_attacks || 0}</td>
                      <td className="px-6 py-4 text-center text-green-400 font-bold">
                        {Math.round(player.average_per_attack || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-center">{player.weekends_participated || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'events' && (
          <div>
            <h2 className="text-2xl font-bold text-green-400 mb-6">
              🎯 Juegos del Clan (Clan Games)
            </h2>
            
            <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-4 text-left">Pos</th>
                    <th className="px-6 py-4 text-left">Jugador</th>
                    <th className="px-6 py-4 text-center">Puntos Clan Games</th>
                    <th className="px-6 py-4 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {events
                    .sort((a, b) => (b.clan_games_points || 0) - (a.clan_games_points || 0))
                    .map((player, index) => (
                    <tr key={`events-${player.player_tag}`} className="hover:bg-gray-700 transition-colors">
                      <td className="px-6 py-4 font-bold text-yellow-400">{index + 1}</td>
                      <td className="px-6 py-4 font-medium">{player.player_name}</td>
                      <td className="px-6 py-4 text-center text-green-400 font-bold">
                        {(player.clan_games_points || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          (player.clan_games_points || 0) >= 4000 ? 'bg-green-600' : 
                          (player.clan_games_points || 0) >= 1000 ? 'bg-yellow-600' : 
                          (player.clan_games_points || 0) > 0 ? 'bg-orange-600' : 'bg-gray-600'
                        }`}>
                          {(player.clan_games_points || 0) >= 4000 ? 'COMPLETADO' : 
                           (player.clan_games_points || 0) >= 1000 ? 'EN PROGRESO' : 
                           (player.clan_games_points || 0) > 0 ? 'INICIADO' : 'SIN DATOS'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'trophies' && <TrophiesWeeklyView />}

        <div className="mt-8 bg-gray-800 p-4 rounded-lg">
          <h3 className="font-bold mb-2">📋 Leyenda:</h3>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-2xl">🟢</span> Activo (menos de 1 día)
              <br />
              <span className="text-2xl">🟡</span> Advertencia (1-2 días)
              <br />
              <span className="text-2xl">🟠</span> Inactivo (3-5 días)
              <br />
              <span className="text-2xl">🔴</span> Muy inactivo (+5 días o fuera del clan)
            </div>
            <div>
              <span className="bg-green-900/20 px-2 py-1 rounded">Verde</span> Top 15 con puntos
              <br />
              <span className="text-red-400">🔥 Tier 1 (CWL):</span> 30-27-24-21... pts
              <br />
              <span className="text-orange-400">🔶 Tier 2 (Guerras/Capital):</span> 20-18-16... pts
              <br />
              <span className="text-blue-400">🔷 Tier 3 (Donaciones/Copas/Games):</span> 15-13-12... pts
            </div>
            <div>
              <span className="text-orange-400">⚔️ Guerras:</span> Total + Promedio
              <br />
              <span className="text-red-400">🏆 CWL:</span> Liga (Tier 1)
              <br />
              <span className="text-cyan-400">🏰 Capital:</span> Total + Promedio
              <br />
              <span className="text-blue-400">🎁 Donaciones:</span> Cantidad + Balance
              <br />
              <span className="text-purple-400">🏆 Copas:</span> Trofeos actuales
              <br />
              <span className="text-green-400">🎯 Clan Games:</span> Puntos obtenidos
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// npx cloudflared tunnel --url http://localhost:3000