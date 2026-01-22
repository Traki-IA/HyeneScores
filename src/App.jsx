import React, { useState, useRef } from 'react';

export default function HyeneScores() {
  const [selectedTab, setSelectedTab] = useState('classement');
  const fileInputRef = useRef(null);

  // États Classement
  const [selectedChampionship, setSelectedChampionship] = useState('hyenes');
  const [selectedSeason, setSelectedSeason] = useState('9');
  const [isSeasonOpen, setIsSeasonOpen] = useState(false);
  const [isChampOpen, setIsChampOpen] = useState(false);

  const championships = [
    { id: 'hyenes', icon: '🏆', name: 'Ligue des Hyènes' },
    { id: 'france', icon: '🇫🇷', name: 'France' },
    { id: 'spain', icon: '🇪🇸', name: 'Espagne' },
    { id: 'italy', icon: '🇮🇹', name: 'Italie' },
    { id: 'england', icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', name: 'Angleterre' }
  ];

  const [teams, setTeams] = useState([
    { rank: 1, name: 'MILAN AC', pts: 95, record: '30-5-18', goalDiff: '116-67', diff: '+49' },
    { rank: 2, name: 'STOCKY FC', pts: 86, record: '24-14-15', goalDiff: '116-89', diff: '+27' },
    { rank: 3, name: 'BIMBAM', pts: 84, record: '25-9-19', goalDiff: '119-96', diff: '+23' },
    { rank: 4, name: 'DYNAMO KEV', pts: 82, record: '26-4-23', goalDiff: '119-110', diff: '+09' },
    { rank: 5, name: 'TRAKNAR FC', pts: 74, record: '21-11-21', goalDiff: '111-105', diff: '+06' },
    { rank: 6, name: 'FC GRINTA', pts: 74, record: '22-8-23', goalDiff: '96-102', diff: '-06' },
    { rank: 7, name: 'COMARDINHO', pts: 71, record: '20-11-22', goalDiff: '94-107', diff: '-13' },
    { rank: 8, name: 'MAMBA TEAM', pts: 64, record: '18-10-25', goalDiff: '96-110', diff: '-14' },
    { rank: 9, name: 'WARNAQUE', pts: 61, record: '17-10-26', goalDiff: '94-110', diff: '-16' },
    { rank: 10, name: 'NOPIGOAL FC', pts: 61, record: '16-12-26', goalDiff: '86-121', diff: '-35' }
  ]);

  // États Palmarès
  const [champions, setChampions] = useState([
    { season: '9', team: 'MILAN AC', points: 95 },
    { season: '8', team: 'STOCKY FC', points: 92 },
    { season: '7', team: 'BIMBAM', points: 88 },
    { season: '6', team: 'MILAN AC', points: 90 },
    { season: '5', team: 'DYNAMO KEV', points: 87 },
    { season: '4', team: 'TRAKNAR FC', points: 85 },
    { season: '3', team: 'FC GRINTA', points: 83 },
    { season: '2', team: 'MILAN AC', points: 89 },
    { season: '1', team: 'STOCKY FC', points: 86 }
  ]);

  // États Panthéon
  const [pantheonTeams, setPantheonTeams] = useState([
    { rank: 1, name: 'MILAN AC', trophies: 15, france: 5, spain: 4, italy: 4, england: 2, total: 15 },
    { rank: 2, name: 'STOCKY FC', trophies: 12, france: 4, spain: 3, italy: 3, england: 2, total: 12 },
    { rank: 3, name: 'BIMBAM', trophies: 10, france: 3, spain: 3, italy: 2, england: 2, total: 10 },
    { rank: 4, name: 'DYNAMO KEV', trophies: 8, france: 2, spain: 2, italy: 2, england: 2, total: 8 },
    { rank: 5, name: 'TRAKNAR FC', trophies: 6, france: 2, spain: 1, italy: 2, england: 1, total: 6 },
    { rank: 6, name: 'FC GRINTA', trophies: 5, france: 1, spain: 2, italy: 1, england: 1, total: 5 },
    { rank: 7, name: 'COMARDINHO', trophies: 3, france: 1, spain: 1, italy: 1, england: 0, total: 3 },
    { rank: 8, name: 'MAMBA TEAM', trophies: 2, france: 1, spain: 0, italy: 1, england: 0, total: 2 },
    { rank: 9, name: 'WARNAQUE', trophies: 1, france: 0, spain: 1, italy: 0, england: 0, total: 1 },
    { rank: 10, name: 'NOPIGOAL FC', trophies: 0, france: 0, spain: 0, italy: 0, england: 0, total: 0 }
  ]);

  // États Match
  const [selectedJournee, setSelectedJournee] = useState('1');
  const [isJourneeOpen, setIsJourneeOpen] = useState(false);
  const [matches, setMatches] = useState([
    { id: 1, homeTeam: 'MILAN AC', awayTeam: 'STOCKY FC', homeScore: 2, awayScore: 2 },
    { id: 2, homeTeam: 'DYNAMO KEV', awayTeam: 'BIMBAM', homeScore: 4, awayScore: 4 },
    { id: 3, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null },
    { id: 4, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null },
    { id: 5, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null }
  ]);

  const allTeams = [
    'MILAN AC', 'STOCKY FC', 'BIMBAM', 'DYNAMO KEV', 'TRAKNAR FC',
    'FC GRINTA', 'COMARDINHO', 'MAMBA TEAM', 'WARNAQUE', 'NOPIGOAL FC'
  ];

  const [openDropdown, setOpenDropdown] = useState(null);
  const [exemptTeam, setExemptTeam] = useState('');
  const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);

  const seasons = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const journees = Array.from({ length: 18 }, (_, i) => (i + 1).toString());

  // États Réglages
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');

  // État pour stocker les données brutes v2.0
  const [appData, setAppData] = useState(null);

  // Fonctions Match
  const getAvailableTeams = (currentMatchId, currentType) => {
    const selectedTeams = [];
    matches.forEach(match => {
      if (match.id === currentMatchId) {
        if (currentType === 'home' && match.awayTeam) selectedTeams.push(match.awayTeam);
        else if (currentType === 'away' && match.homeTeam) selectedTeams.push(match.homeTeam);
      } else {
        if (match.homeTeam) selectedTeams.push(match.homeTeam);
        if (match.awayTeam) selectedTeams.push(match.awayTeam);
      }
    });
    if (exemptTeam) selectedTeams.push(exemptTeam);
    return allTeams.filter(team => !selectedTeams.includes(team));
  };

  const getAvailableTeamsForExempt = () => {
    const selectedTeams = [];
    matches.forEach(match => {
      if (match.homeTeam) selectedTeams.push(match.homeTeam);
      if (match.awayTeam) selectedTeams.push(match.awayTeam);
    });
    return allTeams.filter(team => !selectedTeams.includes(team));
  };

  const handleTeamSelect = (matchId, type, team) => {
    setMatches(matches.map(m => 
      m.id === matchId ? { ...m, [type === 'home' ? 'homeTeam' : 'awayTeam']: team } : m
    ));
    setOpenDropdown(null);
  };

  const toggleDropdown = (matchId, type) => {
    setOpenDropdown(openDropdown?.matchId === matchId && openDropdown?.type === type ? null : { matchId, type });
  };

  const handleSeasonSelect = (season) => {
    setSelectedSeason(season);
    setIsSeasonOpen(false);
  };

  const handleJourneeSelect = (journee) => {
    setSelectedJournee(journee);
    setIsJourneeOpen(false);
  };

  // Fonctions Réglages
  const handleExportJSON = () => {
    try {
      const data = {
        classement: teams,
        matches,
        palmares: champions,
        pantheon: pantheonTeams,
        exportDate: new Date().toISOString(),
        version: '1.0'
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hyenescores-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Erreur lors de l\'export JSON');
    }
  };

  const handleReset = () => {
    if (resetConfirmation === 'SUPPRIMER') {
      alert('Données réinitialisées (simulation)');
      setShowResetModal(false);
      setResetConfirmation('');
    } else {
      alert('Veuillez taper "SUPPRIMER" pour confirmer');
    }
  };

  const handleImportJSON = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result);

        // Détecter la version du fichier
        const version = data.version || '1.0';

        if (version === '2.0') {
          // Format v2.0 optimisé
          if (!data.entities || !data.metadata) {
            alert('❌ Fichier v2.0 invalide : structure entities/metadata manquante');
            return;
          }

          // Stocker les données brutes v2.0 pour accès global
          setAppData(data);

          // Extraire teams[] depuis entities.seasons[selectedChampionship_sXX].standings
          const championshipKey = selectedChampionship === 'hyenes' ? 'ligue_hyenes' : selectedChampionship;
          const seasonKey = `${championshipKey}_s${selectedSeason}`;

          if (data.entities.seasons && data.entities.seasons[seasonKey]) {
            const standings = data.entities.seasons[seasonKey].standings || [];
            setTeams(standings);
          }

          // Extraire matches[] depuis entities.matches filtré par championship/season/matchday
          if (data.entities.matches && Array.isArray(data.entities.matches)) {
            const matchesForContext = data.entities.matches.find(
              block =>
                block.championship === selectedChampionship &&
                block.season === parseInt(selectedSeason) &&
                block.matchday === parseInt(selectedJournee)
            );

            if (matchesForContext && matchesForContext.games) {
              setMatches(matchesForContext.games);
            }
          }

          // Extraire champions[] - les équipes en position 1 pour chaque saison
          if (data.entities.seasons) {
            const championsList = [];
            Object.keys(data.entities.seasons).forEach(seasonKey => {
              // Parser le seasonKey (ex: "ligue_hyenes_s9" -> championship: ligue_hyenes, season: 9)
              const parts = seasonKey.split('_');
              const season = parts[parts.length - 1].replace('s', '');
              const championship = parts.slice(0, -1).join('_');

              // Vérifier si c'est le championnat sélectionné
              const championshipId = championship === 'ligue_hyenes' ? 'hyenes' : championship;

              if (championshipId === selectedChampionship) {
                const seasonData = data.entities.seasons[seasonKey];
                const champion = seasonData.standings?.find(team => team.rank === 1);

                if (champion) {
                  championsList.push({
                    season: season,
                    team: champion.name,
                    points: champion.pts
                  });
                }
              }
            });

            // Trier par saison décroissante
            championsList.sort((a, b) => parseInt(b.season) - parseInt(a.season));
            setChampions(championsList);
          }

          // Extraire pantheonTeams[] depuis entities.managers[].stats
          if (data.entities.managers && Array.isArray(data.entities.managers)) {
            const pantheon = data.entities.managers.map((manager, index) => ({
              rank: index + 1,
              name: manager.name,
              trophies: manager.stats?.totalTitles || 0,
              france: manager.stats?.france?.titles || 0,
              spain: manager.stats?.spain?.titles || 0,
              italy: manager.stats?.italy?.titles || 0,
              england: manager.stats?.england?.titles || 0,
              total: manager.stats?.totalTitles || 0
            }));

            // Trier par nombre de trophées
            pantheon.sort((a, b) => b.total - a.total);

            // Mettre à jour les rangs
            pantheon.forEach((team, index) => {
              team.rank = index + 1;
            });

            setPantheonTeams(pantheon);
          }

          alert('✅ Données v2.0 importées avec succès !');
        } else {
          // Format v1.0 legacy (comportement original)
          if (data.classement && Array.isArray(data.classement)) {
            setTeams(data.classement);
          }
          if (data.matches && Array.isArray(data.matches)) {
            setMatches(data.matches);
          }
          if (data.palmares && Array.isArray(data.palmares)) {
            setChampions(data.palmares);
          }
          if (data.pantheon && Array.isArray(data.pantheon)) {
            setPantheonTeams(data.pantheon);
          }

          alert('✅ Données v1.0 importées avec succès !');
        }
      } catch (error) {
        console.error('Erreur d\'importation:', error);
        alert('❌ Erreur lors de l\'importation : fichier JSON invalide');
      }
    };
    reader.readAsText(file);

    // Réinitialiser l'input pour permettre de sélectionner le même fichier à nouveau
    event.target.value = '';
  };

  const handleRefreshData = () => {
    // Force un re-render pour actualiser l'affichage
    // Utile après avoir modifié les données manuellement
    setTeams([...teams]);
    setMatches([...matches]);
    setChampions([...champions]);
    setPantheonTeams([...pantheonTeams]);
    alert('✅ Données actualisées !');
  };

  return (
    <div className="h-screen bg-black text-white font-sans flex flex-col overflow-hidden safe-top">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { 
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          -webkit-tap-highlight-color: transparent;
        }
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
        body {
          background-color: #000000;
        }
        .safe-top {
          padding-top: env(safe-area-inset-top);
        }
      `}</style>

      {/* CLASSEMENT */}
      {selectedTab === 'classement' && (
        <div className="h-full flex flex-col bg-gradient-to-br from-gray-900 to-black">
          <div className="px-2 pt-4 pb-2 flex-shrink-0">
            <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-cyan-500/50 rounded-xl p-3 text-center">
              <h1 className="text-cyan-400 text-2xl font-bold tracking-widest">CLASSEMENT</h1>
            </div>
          </div>

          <div className="flex-1 px-2 pb-28 overflow-hidden flex flex-col">

              {/* Selectors */}
              <div className="px-2 py-2 border-b border-gray-800 flex-shrink-0 relative">
                <div className="flex items-stretch gap-2">
                  <div className="flex-1 relative">
                    <button
                      onClick={() => setIsChampOpen(!isChampOpen)}
                      className={`w-full h-full bg-black/50 border rounded-lg px-3 py-2.5 text-white text-sm font-medium cursor-pointer transition-colors flex items-center justify-between ${
                        isChampOpen ? 'border-cyan-500/50' : 'border-gray-800 hover:border-cyan-500/30'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{championships.find(c => c.id === selectedChampionship)?.icon}</span>
                        <span className="truncate">{championships.find(c => c.id === selectedChampionship)?.name}</span>
                      </div>
                      <svg className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${isChampOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isChampOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsChampOpen(false)}></div>
                        <div className="absolute left-0 right-0 top-full mt-1 bg-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl z-50 max-h-64 overflow-y-auto">
                          {championships.map(champ => (
                            <button
                              key={champ.id}
                              onClick={() => {
                                setSelectedChampionship(champ.id);
                                setIsChampOpen(false);
                              }}
                              className={`w-full px-3 py-2.5 text-sm font-medium text-left transition-colors flex items-center gap-2 ${
                                selectedChampionship === champ.id
                                  ? 'bg-cyan-500/20 text-cyan-400'
                                  : 'text-white hover:bg-gray-800'
                              }`}
                            >
                              <span className="text-xl">{champ.icon}</span>
                              <span>{champ.name}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="w-32 relative">
                    <button
                      onClick={() => setIsSeasonOpen(!isSeasonOpen)}
                      className={`w-full h-full bg-black/50 border rounded-lg px-3 py-2.5 text-white text-sm font-medium cursor-pointer transition-colors flex items-center justify-between ${
                        isSeasonOpen ? 'border-cyan-500/50' : 'border-gray-800 hover:border-cyan-500/30'
                      }`}
                    >
                      <span>Saison {selectedSeason}</span>
                      <svg className={`w-4 h-4 text-gray-500 transition-transform ${isSeasonOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isSeasonOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsSeasonOpen(false)}></div>
                        <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl z-50 w-32 max-h-64 overflow-y-auto">
                          {seasons.map(season => (
                            <button
                              key={season}
                              onClick={() => handleSeasonSelect(season)}
                              className={`w-full px-3 py-2.5 text-sm font-medium text-left transition-colors ${
                                selectedSeason === season
                                  ? 'bg-cyan-500/20 text-cyan-400'
                                  : 'text-white hover:bg-gray-800'
                              }`}
                            >
                              Saison {season}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="px-2 py-1.5 border-b border-gray-800 flex-shrink-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-500 text-xs font-semibold">Journée 53/72</span>
                  <span className="text-cyan-400 text-xs font-bold">73.6%</span>
                </div>
                <div className="bg-gray-800 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-gradient-to-r from-cyan-500 via-teal-400 to-green-400 h-full rounded-full" style={{ width: '73.6%' }}></div>
                </div>
              </div>

              {/* Table Header */}
              <div className="grid grid-cols-12 gap-1 px-2 py-1.5 bg-gray-900/50 border-b border-gray-800 flex-shrink-0">
                <div className="col-span-1 text-gray-500 text-xs font-semibold tracking-widest text-center">#</div>
                <div className="col-span-4 text-gray-500 text-xs font-semibold tracking-widest text-left">CLUB</div>
                <div className="col-span-2 text-gray-500 text-xs font-semibold tracking-widest text-center">PTS</div>
                <div className="col-span-2 text-gray-500 text-xs font-semibold tracking-widest text-center">V-N-D</div>
                <div className="col-span-2 text-gray-500 text-xs font-semibold tracking-widest text-center">BP:BC</div>
                <div className="col-span-1 text-gray-500 text-xs font-semibold tracking-widest text-center">DIF</div>
              </div>

              {/* Teams List */}
              <div className="flex-1 overflow-y-auto px-2 pb-1">
                {teams.map(team => (
                  <div
                    key={team.rank}
                    className="grid grid-cols-12 gap-1 py-1.5 border-b border-gray-800/50 hover:bg-gray-900/30 transition-all items-center"
                    style={{ height: '40px', minHeight: '40px', maxHeight: '40px' }}
                  >
                    <div className="col-span-1 font-bold text-sm whitespace-nowrap overflow-hidden text-cyan-400">
                      {team.rank < 10 ? `0${team.rank}` : team.rank}
                    </div>
                    <div className="col-span-4 flex items-center whitespace-nowrap overflow-hidden">
                      <span className="text-white font-semibold text-sm tracking-wide">{team.name}</span>
                    </div>
                    <div className="col-span-2 text-center whitespace-nowrap overflow-hidden">
                      <span className="text-green-500 font-bold text-lg drop-shadow-[0_0_10px_rgba(34,197,94,0.6)]">{team.pts}</span>
                    </div>
                    <div className="col-span-2 text-center text-white text-xs font-medium whitespace-nowrap overflow-hidden">
                      {team.record}
                    </div>
                    <div className="col-span-2 text-center text-white text-xs font-medium whitespace-nowrap overflow-hidden">
                      {team.goalDiff}
                    </div>
                    <div className="col-span-1 text-center whitespace-nowrap overflow-hidden">
                      <span className={`text-xs font-semibold ${team.diff.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                        {team.diff}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
          </div>
        </div>
      )}

      {/* MATCH */}
      {selectedTab === 'match' && (
        <div className="h-full flex flex-col bg-gradient-to-br from-gray-900 to-black">
          <div className="px-2 pt-4 pb-2 flex-shrink-0">
            <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-cyan-500/50 rounded-xl p-3 text-center">
              <h1 className="text-cyan-400 text-2xl font-bold tracking-widest">MATCHS</h1>
            </div>
          </div>

          <div className="flex-1 px-2 pb-28 overflow-hidden flex flex-col">

              {/* Selectors */}
              <div className="px-2 py-2 border-b border-gray-800 flex-shrink-0 relative">
                <div className="flex items-stretch gap-2">
                  {/* Championship Dropdown */}
                  <div className="flex-1 relative">
                    <button
                      onClick={() => setIsChampOpen(!isChampOpen)}
                      className={`w-full h-full bg-black/50 border rounded-lg px-3 py-2.5 text-white text-sm font-medium cursor-pointer transition-colors flex items-center justify-between ${
                        isChampOpen ? 'border-cyan-500/50' : 'border-gray-800 hover:border-cyan-500/30'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{championships.find(c => c.id === selectedChampionship)?.icon}</span>
                        <span className="truncate">{championships.find(c => c.id === selectedChampionship)?.name}</span>
                      </div>
                      <svg className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${isChampOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isChampOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsChampOpen(false)}></div>
                        <div className="absolute left-0 right-0 top-full mt-1 bg-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl z-50 max-h-64 overflow-y-auto">
                          {championships.filter(c => c.id !== 'hyenes').map(champ => (
                            <button
                              key={champ.id}
                              onClick={() => {
                                setSelectedChampionship(champ.id);
                                setIsChampOpen(false);
                              }}
                              className={`w-full px-3 py-2.5 text-sm font-medium text-left transition-colors flex items-center gap-2 ${
                                selectedChampionship === champ.id
                                  ? 'bg-cyan-500/20 text-cyan-400'
                                  : 'text-white hover:bg-gray-800'
                              }`}
                            >
                              <span className="text-xl">{champ.icon}</span>
                              <span>{champ.name}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Season Dropdown */}
                  <div className="w-32 relative">
                    <button
                      onClick={() => setIsSeasonOpen(!isSeasonOpen)}
                      className={`w-full h-full bg-black/50 border rounded-lg px-3 py-2.5 text-white text-sm font-medium cursor-pointer transition-colors flex items-center justify-between ${
                        isSeasonOpen ? 'border-cyan-500/50' : 'border-gray-800 hover:border-cyan-500/30'
                      }`}
                    >
                      <span>Saison {selectedSeason}</span>
                      <svg className={`w-4 h-4 text-gray-500 transition-transform ${isSeasonOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isSeasonOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsSeasonOpen(false)}></div>
                        <div className="absolute left-0 right-0 top-full mt-1 bg-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl z-50 max-h-64 overflow-y-auto">
                          {seasons.map(season => (
                            <button
                              key={season}
                              onClick={() => {
                                setSelectedSeason(season);
                                setIsSeasonOpen(false);
                              }}
                              className={`w-full px-3 py-2.5 text-sm font-medium text-left transition-colors ${
                                selectedSeason === season
                                  ? 'bg-cyan-500/20 text-cyan-400'
                                  : 'text-white hover:bg-gray-800'
                              }`}
                            >
                              Saison {season}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Navigation Journée */}
              <div className="px-2 py-2 border-b border-gray-800 flex-shrink-0">
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => {
                      const currentIdx = journees.indexOf(selectedJournee);
                      if (currentIdx > 0) setSelectedJournee(journees[currentIdx - 1]);
                    }}
                    className="w-10 h-10 flex items-center justify-center text-cyan-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    disabled={selectedJournee === '1'}
                  >
                    <span className="text-xl font-bold">◀</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-medium">Journée</span>
                    <span className="text-cyan-400 text-lg font-bold">{selectedJournee}</span>
                    <span className="text-gray-500 text-sm">/</span>
                    <span className="text-gray-400 text-sm">{journees.length}</span>
                  </div>
                  <button
                    onClick={() => {
                      const currentIdx = journees.indexOf(selectedJournee);
                      if (currentIdx < journees.length - 1) setSelectedJournee(journees[currentIdx + 1]);
                    }}
                    className="w-10 h-10 flex items-center justify-center text-cyan-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    disabled={selectedJournee === journees[journees.length - 1]}
                  >
                    <span className="text-xl font-bold">▶</span>
                  </button>
                </div>
              </div>

              {/* Matches List */}
              <div className="flex-1 overflow-y-auto px-2 py-3">
                {/* Header */}
                <div className="grid grid-cols-12 gap-1 py-2 mb-2">
                  <div className="col-span-5 text-center text-gray-500 text-xs font-semibold tracking-widest">
                    DOMICILE
                  </div>
                  <div className="col-span-2 text-center text-gray-500 text-xs font-semibold tracking-widest">
                    SCORE
                  </div>
                  <div className="col-span-5 text-center text-gray-500 text-xs font-semibold tracking-widest">
                    EXTÉRIEUR
                  </div>
                </div>

                <div className="space-y-0">
                  {matches.map(match => (
                    <div key={match.id} className="grid grid-cols-12 items-center gap-1 py-2 border-b border-gray-800/50 last:border-b-0">
                      {/* Home Team */}
                      <div className="col-span-5 relative flex justify-start">
                          <button
                            onClick={() => toggleDropdown(match.id, 'home')}
                            className={`w-full max-w-[130px] bg-black/50 rounded-md px-1.5 py-1 flex items-center justify-between group hover:border-cyan-500/30 cursor-pointer transition-all duration-300 ${
                              match.homeTeam && match.awayTeam && match.homeScore !== null && match.awayScore !== null
                                ? 'border-2 border-emerald-500 shadow-[inset_0_0_8px_rgba(16,185,129,0.15)]'
                                : 'border border-gray-800'
                            }`}
                          >
                            <span className="text-white text-xs font-semibold leading-tight text-left flex-1 pr-0.5">{match.homeTeam || '────────'}</span>
                            <svg className="w-3 h-3 text-gray-500 group-hover:text-cyan-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {openDropdown?.matchId === match.id && openDropdown?.type === 'home' && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)}></div>
                              <div className="absolute left-0 top-full mt-1 w-full max-w-[130px] bg-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl z-50 max-h-64 overflow-y-auto">
                                <button
                                  onClick={() => handleTeamSelect(match.id, 'home', '')}
                                  className="w-full px-2 py-1.5 text-xs font-medium text-left transition-colors flex items-center text-white hover:bg-gray-800 whitespace-nowrap"
                                >
                                  Aucune équipe
                                </button>
                                {getAvailableTeams(match.id, 'home').map(team => (
                                  <button
                                    key={team}
                                    onClick={() => handleTeamSelect(match.id, 'home', team)}
                                    className="w-full px-2 py-1.5 text-xs font-medium text-left transition-colors flex items-center text-white hover:bg-gray-800 whitespace-nowrap"
                                  >
                                    {team}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                      </div>

                      {/* Scores */}
                      <div className="col-span-2 flex items-center justify-center gap-0">
                          <input
                            type="number"
                            value={match.homeScore !== null ? match.homeScore : ''}
                            onChange={(e) => {
                              const value = e.target.value === '' ? null : parseInt(e.target.value);
                              setMatches(matches.map(m => m.id === match.id ? { ...m, homeScore: value } : m));
                            }}
                            placeholder="-"
                            className={`bg-black/50 rounded-md w-8 h-8 text-center text-cyan-400 text-sm font-bold outline-none transition-all duration-300 ${
                              match.homeTeam && match.awayTeam && match.homeScore !== null && match.awayScore !== null
                                ? 'border-2 border-emerald-500 shadow-[inset_0_0_10px_rgba(16,185,129,0.2)]'
                                : 'border border-gray-800 hover:border-cyan-500/50'
                            }`}
                          />
                          <span className="text-gray-600 font-bold text-xs px-0.5">-</span>
                          <input
                            type="number"
                            value={match.awayScore !== null ? match.awayScore : ''}
                            onChange={(e) => {
                              const value = e.target.value === '' ? null : parseInt(e.target.value);
                              setMatches(matches.map(m => m.id === match.id ? { ...m, awayScore: value } : m));
                            }}
                            placeholder="-"
                            className={`bg-black/50 rounded-md w-8 h-8 text-center text-cyan-400 text-sm font-bold outline-none transition-all duration-300 ${
                              match.homeTeam && match.awayTeam && match.homeScore !== null && match.awayScore !== null
                                ? 'border-2 border-emerald-500 shadow-[inset_0_0_10px_rgba(16,185,129,0.2)]'
                                : 'border border-gray-800 hover:border-cyan-500/50'
                            }`}
                          />
                      </div>

                      {/* Away Team */}
                      <div className="col-span-5 relative flex justify-end">
                          <button
                            onClick={() => toggleDropdown(match.id, 'away')}
                            className={`w-full max-w-[130px] bg-black/50 rounded-md px-1.5 py-1 flex items-center justify-between group hover:border-cyan-500/30 cursor-pointer transition-all duration-300 ${
                              match.homeTeam && match.awayTeam && match.homeScore !== null && match.awayScore !== null
                                ? 'border-2 border-emerald-500 shadow-[inset_0_0_8px_rgba(16,185,129,0.15)]'
                                : 'border border-gray-800'
                            }`}
                          >
                            <span className="text-white text-xs font-semibold leading-tight text-left flex-1 pr-0.5">{match.awayTeam || '────────'}</span>
                            <svg className="w-3 h-3 text-gray-500 group-hover:text-cyan-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {openDropdown?.matchId === match.id && openDropdown?.type === 'away' && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)}></div>
                              <div className="absolute right-0 top-full mt-1 w-full max-w-[130px] bg-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl z-50 max-h-64 overflow-y-auto">
                                <button
                                  onClick={() => handleTeamSelect(match.id, 'away', '')}
                                  className="w-full px-2 py-1.5 text-xs font-medium text-left transition-colors flex items-center text-white hover:bg-gray-800 whitespace-nowrap"
                                >
                                  Aucune équipe
                                </button>
                                {getAvailableTeams(match.id, 'away').map(team => (
                                  <button
                                    key={team}
                                    onClick={() => handleTeamSelect(match.id, 'away', team)}
                                    className="w-full px-2 py-1.5 text-xs font-medium text-left transition-colors flex items-center text-white hover:bg-gray-800 whitespace-nowrap"
                                  >
                                    {team}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Section Exempt */}
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <div className="bg-black/30 border border-gray-800 rounded-lg p-4">
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-gray-400 text-sm font-medium">Exempt :</span>
                      <div className="relative w-48">
                        <button
                          onClick={() => setIsTeamDropdownOpen(!isTeamDropdownOpen)}
                          className="w-full bg-black/50 border border-gray-800 hover:border-cyan-500/30 rounded-md px-4 py-2.5 text-white text-sm font-medium cursor-pointer transition-colors flex items-center justify-between"
                        >
                          <span className="truncate">{exemptTeam || 'Aucune'}</span>
                          <svg className="w-4 h-4 text-gray-500 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {isTeamDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsTeamDropdownOpen(false)}></div>
                            <div className="absolute left-0 right-0 top-full mt-1 bg-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl z-50 max-h-64 overflow-y-auto">
                              <button
                                onClick={() => {
                                  setExemptTeam('');
                                  setIsTeamDropdownOpen(false);
                                }}
                                className="w-full px-3 py-2 text-sm font-medium text-left transition-colors text-white hover:bg-gray-800"
                              >
                                Aucune
                              </button>
                              {getAvailableTeamsForExempt().map(team => (
                                <button
                                  key={team}
                                  onClick={() => {
                                    setExemptTeam(team);
                                    setIsTeamDropdownOpen(false);
                                  }}
                                  className="w-full px-3 py-2 text-sm font-medium text-left transition-colors text-white hover:bg-gray-800"
                                >
                                  {team}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
          </div>
        </div>
      )}

      {/* PALMARES */}
      {selectedTab === 'palmares' && (
        <div className="h-full flex flex-col bg-gradient-to-br from-gray-900 to-black">
          <div className="px-2 pt-4 pb-2 flex-shrink-0">
            <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-cyan-500/50 rounded-xl p-3 text-center">
              <h1 className="text-cyan-400 text-2xl font-bold tracking-widest">PALMARÈS</h1>
            </div>
          </div>

          <div className="flex-1 px-2 pb-28 overflow-hidden flex flex-col">

              {/* Selectors */}
              <div className="px-2 py-2 border-b border-gray-800 flex-shrink-0 relative">
                <div className="flex items-stretch gap-2">
                  {/* Championship Dropdown */}
                  <div className="flex-1 relative">
                    <button
                      onClick={() => setIsChampOpen(!isChampOpen)}
                      className={`w-full h-full bg-black/50 border rounded-lg px-3 py-2.5 text-white text-sm font-medium cursor-pointer transition-colors flex items-center justify-between ${
                        isChampOpen ? 'border-cyan-500/50' : 'border-gray-800 hover:border-cyan-500/30'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{championships.find(c => c.id === selectedChampionship)?.icon}</span>
                        <span className="truncate">{championships.find(c => c.id === selectedChampionship)?.name}</span>
                      </div>
                      <svg className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${isChampOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isChampOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsChampOpen(false)}></div>
                        <div className="absolute left-0 right-0 top-full mt-1 bg-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl z-50 max-h-64 overflow-y-auto">
                          {championships.map(champ => (
                            <button
                              key={champ.id}
                              onClick={() => {
                                setSelectedChampionship(champ.id);
                                setIsChampOpen(false);
                              }}
                              className={`w-full px-3 py-2.5 text-sm font-medium text-left transition-colors flex items-center gap-2 ${
                                selectedChampionship === champ.id
                                  ? 'bg-cyan-500/20 text-cyan-400'
                                  : 'text-white hover:bg-gray-800'
                              }`}
                            >
                              <span className="text-xl">{champ.icon}</span>
                              <span>{champ.name}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Season Dropdown */}
                  <div className="w-32 relative">
                    <button
                      onClick={() => setIsSeasonOpen(!isSeasonOpen)}
                      className={`w-full h-full bg-black/50 border rounded-lg px-3 py-2.5 text-white text-sm font-medium cursor-pointer transition-colors flex items-center justify-between ${
                        isSeasonOpen ? 'border-cyan-500/50' : 'border-gray-800 hover:border-cyan-500/30'
                      }`}
                    >
                      <span>Saison {selectedSeason}</span>
                      <svg className={`w-4 h-4 text-gray-500 transition-transform ${isSeasonOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isSeasonOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsSeasonOpen(false)}></div>
                        <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl z-50 w-32 max-h-64 overflow-y-auto">
                          {seasons.map(season => (
                            <button
                              key={season}
                              onClick={() => {
                                setSelectedSeason(season);
                                setIsSeasonOpen(false);
                              }}
                              className={`w-full px-3 py-2.5 text-sm font-medium text-left transition-colors ${
                                selectedSeason === season
                                  ? 'bg-cyan-500/20 text-cyan-400'
                                  : 'text-white hover:bg-gray-800'
                              }`}
                            >
                              Saison {season}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Table Header */}
              <div className="grid grid-cols-12 gap-1 px-2 py-2 bg-gray-900/50 border-b border-gray-800 flex-shrink-0">
                <div className="col-span-3 text-gray-500 text-xs font-semibold tracking-widest text-center">SAISON</div>
                <div className="col-span-6 text-gray-500 text-xs font-semibold tracking-widest text-center">CHAMPION</div>
                <div className="col-span-3 text-gray-500 text-xs font-semibold tracking-widest text-center">POINTS</div>
              </div>

              {/* Champions List */}
              <div className="flex-1 overflow-y-auto px-2 pb-1">
                {champions.map(champion => (
                  <div
                    key={champion.season}
                    className="grid grid-cols-12 gap-1 px-2 py-2 border-b border-gray-800 hover:bg-gray-900/30 transition-colors items-center h-[48px]"
                  >
                    <div className="col-span-3 flex justify-center">
                      <span className="text-cyan-400 text-lg font-bold drop-shadow-[0_0_10px_rgba(34,211,238,0.6)]">{champion.season}</span>
                    </div>
                    <div className="col-span-6 text-center">
                      <span className="text-white text-base font-semibold tracking-wide">{champion.team}</span>
                    </div>
                    <div className="col-span-3 text-center">
                      <span className="text-green-500 text-base font-bold">{champion.points}</span>
                      <span className="text-gray-500 text-xs ml-1">pts</span>
                    </div>
                  </div>
                ))}
              </div>
          </div>
        </div>
      )}

      {/* PANTHEON */}
      {selectedTab === 'pantheon' && (
        <div className="h-full flex flex-col bg-gradient-to-br from-gray-900 to-black">
          <div className="px-2 pt-4 pb-2 flex-shrink-0">
            <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-cyan-500/50 rounded-xl p-3 text-center">
              <h1 className="text-cyan-400 text-2xl font-bold tracking-widest">PANTHÉON</h1>
            </div>
          </div>

          <div className="flex-1 px-2 pb-28 overflow-hidden flex flex-col">

              {/* Table Header */}
              <div className="px-2 py-2 bg-gray-900/50 border-b border-gray-800 flex-shrink-0">
                <div className="grid grid-cols-12 gap-0.5 items-center">
                  <div className="col-span-1 flex justify-center text-gray-500 text-xs font-semibold tracking-widest">#</div>
                  <div className="col-span-4 flex items-center text-left pl-1 text-gray-500 text-xs font-semibold tracking-widest">ÉQUIPE</div>
                  <div className="col-span-1 flex justify-center text-gray-500 text-xs font-semibold tracking-widest">
                    <div className="text-lg">🏆</div>
                  </div>
                  <div className="col-span-1 flex justify-center text-gray-500 text-xs font-semibold tracking-widest">
                    <div className="text-lg">🇫🇷</div>
                  </div>
                  <div className="col-span-1 flex justify-center text-gray-500 text-xs font-semibold tracking-widest">
                    <div className="text-lg">🇪🇸</div>
                  </div>
                  <div className="col-span-1 flex justify-center text-gray-500 text-xs font-semibold tracking-widest">
                    <div className="text-lg">🇮🇹</div>
                  </div>
                  <div className="col-span-1 flex justify-center text-gray-500 text-xs font-semibold tracking-widest">
                    <div className="text-lg">🏴󠁧󠁢󠁥󠁮󠁧󠁿</div>
                  </div>
                  <div className="col-span-2 flex justify-center text-gray-500 text-xs font-semibold tracking-widest">TOTAL</div>
                </div>
              </div>

              {/* Teams List */}
              <div className="flex-1 overflow-y-auto px-2 pb-1">
                {pantheonTeams.map(team => (
                  <div
                    key={team.rank}
                    className="py-2 border-b border-gray-800 hover:bg-gray-900/30 transition-colors h-[48px]"
                  >
                    <div className="grid grid-cols-12 gap-0.5 items-center w-full h-full">
                      <div className="col-span-1 flex items-center justify-center font-bold text-sm text-cyan-400">
                        {team.rank < 10 ? `0${team.rank}` : team.rank}
                      </div>
                      <div className="col-span-4 flex items-center text-left pl-1">
                        <span className="text-white text-base font-bold tracking-tight">{team.name}</span>
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <span className="text-white text-sm font-medium">{team.trophies}</span>
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <span className="text-white text-sm font-medium">{team.france}</span>
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <span className="text-white text-sm font-medium">{team.spain}</span>
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <span className="text-white text-sm font-medium">{team.italy}</span>
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <span className="text-white text-sm font-medium">{team.england}</span>
                      </div>
                      <div className="col-span-2 flex items-center justify-center">
                        <span className="text-green-500 text-lg font-bold drop-shadow-[0_0_10px_rgba(34,197,94,0.6)]">{team.total}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
          </div>
        </div>
      )}

      {/* REGLAGES */}
      {selectedTab === 'reglages' && (
        <div className="h-full flex flex-col bg-gradient-to-br from-gray-900 to-black">
          <div className="px-2 pt-4 pb-2 flex-shrink-0">
            <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-cyan-500/50 rounded-xl p-3 text-center">
              <h1 className="text-cyan-400 text-2xl font-bold tracking-widest">RÉGLAGES</h1>
            </div>
          </div>

          <div className="flex-1 px-2 pb-28 overflow-y-auto">
            <div className="space-y-3">

              {/* Sauvegarde */}
              <div className="bg-gradient-to-br from-gray-900/50 to-black/50 border-2 border-cyan-500/30 rounded-2xl p-4 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                    <span className="text-xl">💾</span>
                  </div>
                  <h2 className="text-cyan-400 text-base font-bold tracking-wide">SAUVEGARDE</h2>
                </div>
                <div className="space-y-2">
                  <button
                    onClick={handleExportJSON}
                    className="w-full bg-black/40 border border-cyan-500/30 hover:border-cyan-500/60 hover:bg-cyan-500/10 rounded-xl px-4 py-3 text-white text-sm font-medium transition-all duration-300 flex items-center justify-between group"
                  >
                    <span className="group-hover:text-cyan-400 transition-colors">Exporter toutes les données (JSON)</span>
                    <span className="text-xl group-hover:scale-110 transition-transform">📥</span>
                  </button>
                  <button
                    onClick={handleImportJSON}
                    className="w-full bg-black/40 border border-cyan-500/30 hover:border-cyan-500/60 hover:bg-cyan-500/10 rounded-xl px-4 py-3 text-white text-sm font-medium transition-all duration-300 flex items-center justify-between group"
                  >
                    <span className="group-hover:text-cyan-400 transition-colors">Importer des données (JSON)</span>
                    <span className="text-xl group-hover:scale-110 transition-transform">📤</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Données */}
              <div className="bg-gradient-to-br from-gray-900/50 to-black/50 border-2 border-green-500/30 rounded-2xl p-4 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <span className="text-xl">🔄</span>
                  </div>
                  <h2 className="text-green-400 text-base font-bold tracking-wide">DONNÉES</h2>
                </div>
                <button
                  onClick={handleRefreshData}
                  className="w-full bg-black/40 border border-green-500/30 hover:border-green-500/60 hover:bg-green-500/10 rounded-xl px-4 py-3 text-white text-sm font-medium transition-all duration-300 flex items-center justify-between group"
                >
                  <span className="group-hover:text-green-400 transition-colors">Actualiser l'affichage</span>
                  <span className="text-xl group-hover:rotate-180 transition-transform duration-500">🔄</span>
                </button>
              </div>

              {/* Système */}
              <div className="bg-gradient-to-br from-red-900/20 to-black/50 border-2 border-red-500/30 rounded-2xl p-4 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                    <span className="text-xl">⚠️</span>
                  </div>
                  <h2 className="text-red-400 text-base font-bold tracking-wide">SYSTÈME</h2>
                </div>
                <button
                  onClick={() => setShowResetModal(true)}
                  className="w-full bg-red-900/30 border border-red-500/30 hover:border-red-500/60 hover:bg-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm font-bold transition-all duration-300 flex items-center justify-between group"
                >
                  <span className="group-hover:text-red-300 transition-colors">Réinitialiser toutes les données</span>
                  <span className="text-xl group-hover:scale-110 transition-transform">🗑️</span>
                </button>
              </div>
            </div>
          </div>

          {/* Modal Reset */}
          {showResetModal && (
            <>
              <div className="fixed inset-0 bg-black/80 z-50" onClick={() => setShowResetModal(false)}></div>
              <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
                <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-red-500 rounded-xl p-6 max-w-md w-full">
                  <div className="text-center mb-6">
                    <div className="text-6xl mb-4">⚠️</div>
                    <h3 className="text-red-400 text-xl font-bold mb-2">ATTENTION</h3>
                    <p className="text-gray-400 text-sm">Cette action est irréversible.</p>
                  </div>
                  <div className="mb-6">
                    <input
                      type="text"
                      value={resetConfirmation}
                      onChange={(e) => setResetConfirmation(e.target.value)}
                      placeholder="Tapez SUPPRIMER"
                      className="w-full bg-black/50 border border-red-500/50 rounded-lg px-4 py-3 text-white text-sm outline-none"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setShowResetModal(false); setResetConfirmation(''); }}
                      className="flex-1 bg-gray-800 rounded-lg px-4 py-3 text-white text-sm font-medium"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleReset}
                      className="flex-1 bg-red-900/50 border border-red-500 rounded-lg px-4 py-3 text-red-400 text-sm font-bold"
                    >
                      Confirmer
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* STATS (Placeholder) */}
      {selectedTab === 'stats' && (
        <div className="h-full flex flex-col items-center justify-center">
          <div className="text-6xl mb-4">📊</div>
          <h2 className="text-cyan-400 text-2xl font-bold">STATISTIQUES</h2>
          <p className="text-gray-500 text-sm mt-2">Bientôt disponible</p>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-3 pt-2" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="bg-gray-900/80 backdrop-blur-xl border border-gray-800/50 rounded-3xl shadow-2xl max-w-screen-xl mx-auto overflow-hidden">
          <div className="flex justify-around items-center px-2 py-2">
            <button
              onClick={() => setSelectedTab('classement')}
              className={`flex flex-col items-center gap-1 transition-all duration-300 ease-out rounded-2xl px-3 py-2 min-w-[56px] ${
                selectedTab === 'classement'
                  ? 'bg-cyan-500/20 text-cyan-400 scale-105 shadow-lg shadow-cyan-500/20'
                  : 'text-gray-500 hover:text-gray-400 hover:bg-gray-800/50 active:scale-95'
              }`}
            >
              <div className="text-2xl">🏆</div>
              <span className="text-[10px] font-semibold">Classement</span>
            </button>
            <button
              onClick={() => setSelectedTab('match')}
              className={`flex flex-col items-center gap-1 transition-all duration-300 ease-out rounded-2xl px-3 py-2 min-w-[56px] ${
                selectedTab === 'match'
                  ? 'bg-cyan-500/20 text-cyan-400 scale-105 shadow-lg shadow-cyan-500/20'
                  : 'text-gray-500 hover:text-gray-400 hover:bg-gray-800/50 active:scale-95'
              }`}
            >
              <div className="text-2xl">📅</div>
              <span className="text-[10px] font-semibold">Match</span>
            </button>
            <button
              onClick={() => setSelectedTab('palmares')}
              className={`flex flex-col items-center gap-1 transition-all duration-300 ease-out rounded-2xl px-3 py-2 min-w-[56px] ${
                selectedTab === 'palmares'
                  ? 'bg-cyan-500/20 text-cyan-400 scale-105 shadow-lg shadow-cyan-500/20'
                  : 'text-gray-500 hover:text-gray-400 hover:bg-gray-800/50 active:scale-95'
              }`}
            >
              <div className="text-2xl">🎯</div>
              <span className="text-[10px] font-semibold">Palmarès</span>
            </button>
            <button
              onClick={() => setSelectedTab('pantheon')}
              className={`flex flex-col items-center gap-1 transition-all duration-300 ease-out rounded-2xl px-3 py-2 min-w-[56px] ${
                selectedTab === 'pantheon'
                  ? 'bg-cyan-500/20 text-cyan-400 scale-105 shadow-lg shadow-cyan-500/20'
                  : 'text-gray-500 hover:text-gray-400 hover:bg-gray-800/50 active:scale-95'
              }`}
            >
              <div className="text-2xl">🏅</div>
              <span className="text-[10px] font-semibold">Panthéon</span>
            </button>
            <button
              onClick={() => setSelectedTab('stats')}
              className={`flex flex-col items-center gap-1 transition-all duration-300 ease-out rounded-2xl px-3 py-2 min-w-[56px] ${
                selectedTab === 'stats'
                  ? 'bg-cyan-500/20 text-cyan-400 scale-105 shadow-lg shadow-cyan-500/20'
                  : 'text-gray-500 hover:text-gray-400 hover:bg-gray-800/50 active:scale-95'
              }`}
            >
              <div className="text-2xl">📊</div>
              <span className="text-[10px] font-semibold">Stats</span>
            </button>
            <button
              onClick={() => setSelectedTab('reglages')}
              className={`flex flex-col items-center gap-1 transition-all duration-300 ease-out rounded-2xl px-3 py-2 min-w-[56px] ${
                selectedTab === 'reglages'
                  ? 'bg-cyan-500/20 text-cyan-400 scale-105 shadow-lg shadow-cyan-500/20'
                  : 'text-gray-500 hover:text-gray-400 hover:bg-gray-800/50 active:scale-95'
              }`}
            >
              <div className="text-2xl">⚙️</div>
              <span className="text-[10px] font-semibold">Réglages</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
