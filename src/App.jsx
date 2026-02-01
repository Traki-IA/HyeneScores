import React, { useState, useRef, useEffect, useCallback } from 'react';
import { fetchAppData, importFromJSON } from './lib/supabase';

export default function HyeneScores() {
  const [selectedTab, setSelectedTab] = useState('classement');
  const fileInputRef = useRef(null);

  // États Supabase
  const [isLoadingFromSupabase, setIsLoadingFromSupabase] = useState(true);
  const [supabaseError, setSupabaseError] = useState(null);
  const [isSavingToSupabase, setIsSavingToSupabase] = useState(false);
  const [pendingJsonData, setPendingJsonData] = useState(null); // Données JSON en attente de sauvegarde

  // États Classement
  const [selectedChampionship, setSelectedChampionship] = useState('hyenes');
  const [selectedSeason, setSelectedSeason] = useState('');
  const [isSeasonOpen, setIsSeasonOpen] = useState(false);
  const [isChampOpen, setIsChampOpen] = useState(false);

  const championships = [
    { id: 'hyenes', icon: '🏆', name: 'Ligue des Hyènes' },
    { id: 'france', icon: '🇫🇷', name: 'France' },
    { id: 'spain', icon: '🇪🇸', name: 'Espagne' },
    { id: 'italy', icon: '🇮🇹', name: 'Italie' },
    { id: 'england', icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', name: 'Angleterre' }
  ];

  const [teams, setTeams] = useState([]);

  // États Palmarès
  const [champions, setChampions] = useState([]);

  // États Panthéon
  const [pantheonTeams, setPantheonTeams] = useState([]);

  // États Match
  const [selectedJournee, setSelectedJournee] = useState('1');
  const [isJourneeOpen, setIsJourneeOpen] = useState(false);
  const [matches, setMatches] = useState([
    { id: 1, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null },
    { id: 2, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null },
    { id: 3, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null },
    { id: 4, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null },
    { id: 5, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null }
  ]);

  const [allTeams, setAllTeams] = useState([]);

  const [openDropdown, setOpenDropdown] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, right: 'auto' });
  const [exemptTeam, setExemptTeam] = useState('');
  const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);
  const skipNextMatchesLoadRef = useRef(false);

  const [seasons, setSeasons] = useState([]);

  // Nombre de journées dynamique selon le championnat
  const getJourneesForChampionship = (championship) => {
    // Ligue des Hyènes : 72 journées (10 équipes × 2 × 3.6 = 72)
    // Autres championnats : 18 journées
    const count = championship === 'hyenes' ? 72 : 18;
    return Array.from({ length: count }, (_, i) => (i + 1).toString());
  };

  const journees = getJourneesForChampionship(selectedChampionship);

  // États Réglages
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [newSeasonNumber, setNewSeasonNumber] = useState('');

  // État pour stocker les données brutes v2.0
  const [appData, setAppData] = useState(null);

  // État pour la progression de la saison
  const [seasonProgress, setSeasonProgress] = useState({
    currentMatchday: 0,
    totalMatchdays: 0,
    percentage: 0
  });

  // États pour les pénalités
  const [penalties, setPenalties] = useState({}); // { "championshipId_seasonId_teamName": points }
  const [isPenaltyModalOpen, setIsPenaltyModalOpen] = useState(false);
  const [selectedPenaltyTeam, setSelectedPenaltyTeam] = useState('');
  const [penaltyPoints, setPenaltyPoints] = useState('');
  const [isPenaltyTeamDropdownOpen, setIsPenaltyTeamDropdownOpen] = useState(false);

  // Fonction pour charger les données depuis appData v2.0
  const loadDataFromAppData = useCallback((data, championship, season, journee, currentPenalties = {}) => {
    if (!data || !data.entities) return;

    // Fonction locale pour obtenir la pénalité d'une équipe
    const getTeamPenaltyLocal = (teamName, champ, seas) => {
      const key = `${champ}_${seas}_${teamName}`;
      return currentPenalties[key] || 0;
    };

    // Réinitialiser l'équipe exemptée au début (sera mise à jour si trouvée)
    setExemptTeam('');

    // Extraire teams[] depuis entities.seasons
    // Mapper les IDs de championnat vers les clés du fichier v2.0
    const championshipMapping = {
      'hyenes': 'ligue_hyenes',
      'france': 'france',
      'spain': 'espagne',
      'italy': 'italie',
      'england': 'angleterre'
    };
    const championshipKey = championshipMapping[championship] || championship;
    const seasonKey = `${championshipKey}_s${season}`;

    if (data.entities.seasons && data.entities.seasons[seasonKey]) {
      const savedStandings = data.entities.seasons[seasonKey].standings || [];
      const seasonData = data.entities.seasons[seasonKey];

      // === RECALCULER le classement depuis TOUS les matchs de la saison ===
      // (les standings sauvegardés peuvent être obsolètes si de nouvelles journées existent)
      const allSeasonMatches = (data.entities.matches || []).filter(
        block => block.championship === championshipKey &&
                 block.season === parseInt(season)
      );

      let standings;

      if (allSeasonMatches.length > 0) {
        // Récupérer la liste de toutes les équipes
        const teamList = data.entities.managers
          ? Object.values(data.entities.managers).map(m => m.name || '?').filter(n => n !== '?')
          : savedStandings.map(t => t.mgr || t.name || t.team).filter(Boolean);

        // Initialiser les stats pour toutes les équipes à zéro
        const teamStats = {};
        teamList.forEach(team => {
          teamStats[team] = {
            name: team, pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0
          };
        });

        // Parcourir TOUS les matchs de la saison (toutes les journées)
        allSeasonMatches.forEach(matchBlock => {
          if (matchBlock.games && Array.isArray(matchBlock.games)) {
            matchBlock.games.forEach(match => {
              // Normaliser les noms de champs (formats multiples selon la source)
              const home = match.homeTeam || match.home || match.h || match.equipe1 || '';
              const away = match.awayTeam || match.away || match.a || match.equipe2 || '';
              const hs = match.homeScore !== undefined ? match.homeScore :
                         (match.hs !== undefined ? match.hs :
                         (match.scoreHome !== undefined ? match.scoreHome : null));
              const as2 = match.awayScore !== undefined ? match.awayScore :
                          (match.as !== undefined ? match.as :
                          (match.scoreAway !== undefined ? match.scoreAway : null));

              if (hs !== null && hs !== undefined && as2 !== null && as2 !== undefined) {
                const homeScore = parseInt(hs);
                const awayScore = parseInt(as2);

                if (!isNaN(homeScore) && !isNaN(awayScore) && teamStats[home] && teamStats[away]) {
                  teamStats[home].j++;
                  teamStats[away].j++;
                  teamStats[home].bp += homeScore;
                  teamStats[home].bc += awayScore;
                  teamStats[away].bp += awayScore;
                  teamStats[away].bc += homeScore;

                  if (homeScore > awayScore) {
                    teamStats[home].pts += 3;
                    teamStats[home].g++;
                    teamStats[away].p++;
                  } else if (homeScore < awayScore) {
                    teamStats[away].pts += 3;
                    teamStats[away].g++;
                    teamStats[home].p++;
                  } else {
                    teamStats[home].pts++;
                    teamStats[away].pts++;
                    teamStats[home].n++;
                    teamStats[away].n++;
                  }
                  teamStats[home].diff = teamStats[home].bp - teamStats[home].bc;
                  teamStats[away].diff = teamStats[away].bp - teamStats[away].bc;
                }
              }
            });
          }
        });

        // Appliquer les pénalités et trier
        const sortedTeams = Object.values(teamStats)
          .filter(team => team.j > 0)
          .map(team => {
            const penalty = getTeamPenaltyLocal(team.name, championship, season);
            return {
              ...team,
              penalty: penalty,
              effectivePts: team.pts - penalty
            };
          })
          .sort((a, b) => {
            if (b.effectivePts !== a.effectivePts) return b.effectivePts - a.effectivePts;
            if (b.diff !== a.diff) return b.diff - a.diff;
            return b.bp - a.bp;
          });

        standings = sortedTeams.map((team, index) => ({
          pos: index + 1,
          mgr: team.name,
          pts: team.pts,
          j: team.j,
          g: team.g,
          n: team.n,
          p: team.p,
          bp: team.bp,
          bc: team.bc,
          diff: team.diff
        }));
      } else {
        // Pas de données de matchs - utiliser les standings sauvegardés
        standings = savedStandings;
      }

      // Mettre à jour les standings dans data pour que Palmarès/Panthéon voient les données recalculées
      if (data.entities.seasons[seasonKey]) {
        data.entities.seasons[seasonKey].standings = standings;
      }

      // Normaliser les données pour l'affichage (même transformation que v1.0)
      const normalizedTeams = standings.map(team => ({
        rank: team.pos || team.rank || 0,
        name: team.mgr || team.name || team.team || '?',
        pts: team.pts || team.points || 0,
        record: team.record || (team.g !== undefined ? `${team.g}-${team.n}-${team.p}` : (team.w !== undefined ? `${team.w}-${team.d}-${team.l}` : '0-0-0')),
        goalDiff: team.goalDiff || (team.bp !== undefined ? `${team.bp}-${team.bc}` : (team.gf !== undefined ? `${team.gf}-${team.ga}` : '0-0')),
        diff: typeof team.diff === 'number'
          ? (team.diff >= 0 ? `+${team.diff}` : `${team.diff}`)
          : (team.diff || '+0')
      }));

      setTeams(normalizedTeams);

      // Calculer la progression de la saison
      // Ligue des Hyènes : 72 journées, Autres championnats : 18 journées
      // Cas spécial S6 : France a 8 journées, donc Ligue des Hyènes S6 = 62 (8+18+18+18)
      const isS6 = season === '6';
      const isFranceS6 = championship === 'france' && isS6;
      const isHyenesS6 = championship === 'hyenes' && isS6;
      const totalMatchdays = championship === 'hyenes'
        ? (isHyenesS6 ? 62 : 72)
        : (isFranceS6 ? 8 : 18);
      // Utiliser le max des journées enregistrées plutôt que le nb de matchs de la 1ère équipe
      const currentMatchday = allSeasonMatches.length > 0
        ? Math.max(...allSeasonMatches.map(b => b.matchday))
        : (standings[0]?.j || 0);
      const percentage = totalMatchdays > 0 ? ((currentMatchday / totalMatchdays) * 100).toFixed(1) : 0;

      setSeasonProgress({
        currentMatchday,
        totalMatchdays,
        percentage: parseFloat(percentage)
      });
    } else {
      setTeams([]);
      setSeasonProgress({ currentMatchday: 0, totalMatchdays: 72, percentage: 0 });
    }

    // Extraire matches[] depuis entities.matches (si disponible)
    // Note: Le format v2.0 pourrait ne pas inclure les matches, seulement les standings finaux
    if (data.entities.matches && Array.isArray(data.entities.matches)) {
      // Utiliser le championshipKey mappé au lieu de championship
      const matchesForContext = data.entities.matches.find(
        block =>
          block.championship === championshipKey &&
          block.season === parseInt(season) &&
          block.matchday === parseInt(journee)
      );

      if (matchesForContext && matchesForContext.games) {
        // Normaliser les matches pour s'assurer que les champs sont corrects
        const normalizedMatches = matchesForContext.games.map((match, index) => ({
          id: match.id || (index + 1),
          homeTeam: match.homeTeam || match.home || match.h || match.equipe1 || '',
          awayTeam: match.awayTeam || match.away || match.a || match.equipe2 || '',
          homeScore: match.homeScore !== undefined ? match.homeScore :
                     (match.hs !== undefined ? match.hs :
                     (match.scoreHome !== undefined ? match.scoreHome : null)),
          awayScore: match.awayScore !== undefined ? match.awayScore :
                     (match.as !== undefined ? match.as :
                     (match.scoreAway !== undefined ? match.scoreAway : null))
        }));
        // Ne pas écraser les matchs si c'est un auto-sync (l'utilisateur est en train de saisir)
        if (skipNextMatchesLoadRef.current) {
          skipNextMatchesLoadRef.current = false;
        } else {
          setMatches(normalizedMatches);
        }

        // Extraire l'équipe exemptée depuis le bloc match (format v2.0)
        const exemptFromMatch = matchesForContext.exempt || matchesForContext.ex || '';
        if (exemptFromMatch) {
          setExemptTeam(exemptFromMatch);
        }
      } else {
        // Pas de données de matches pour cette journée - réinitialiser
        setMatches([
          { id: 1, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null },
          { id: 2, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null },
          { id: 3, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null },
          { id: 4, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null },
          { id: 5, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null }
        ]);
      }
    } else {
      // entities.matches n'existe pas dans ce fichier v2.0
      // Les matches devront être saisis manuellement
      setMatches([
        { id: 1, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null },
        { id: 2, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null },
        { id: 3, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null },
        { id: 4, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null },
        { id: 5, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null }
      ]);
    }

    // Charger l'équipe exemptée pour cette saison (depuis indexes.exemptTeams)
    if (data.indexes?.exemptTeams) {
      const exemptFromIndex = data.indexes.exemptTeams[season];
      if (exemptFromIndex) {
        setExemptTeam(exemptFromIndex);
      }
    }

    // Extraire champions[] pour le championnat sélectionné
    if (data.entities.seasons) {
      // Mapping inverse pour comparer les clés du fichier avec le championship sélectionné
      const reverseMapping = {
        'ligue_hyenes': 'hyenes',
        'france': 'france',
        'espagne': 'spain',
        'italie': 'italy',
        'angleterre': 'england'
      };

      const championsList = [];
      Object.keys(data.entities.seasons).forEach(seasonKey => {
        const parts = seasonKey.split('_');
        const seasonNum = parts[parts.length - 1].replace('s', '');
        const championshipName = parts.slice(0, -1).join('_');
        const championshipId = reverseMapping[championshipName] || championshipName;

        if (championshipId === championship) {
          const seasonData = data.entities.seasons[seasonKey];
          const standings = seasonData.standings || [];

          if (standings.length > 0) {
            // Vérifier si la saison est terminée
            // Ligue des Hyènes : 72 journées, Autres : 18 journées
            // Cas spécial S6 : France a 8 journées, Ligue des Hyènes S6 = 62
            const isS6 = seasonNum === '6';
            const isFranceS6 = championshipName === 'france' && isS6;
            const isHyenesS6 = championshipName === 'ligue_hyenes' && isS6;
            const totalMatchdays = championshipId === 'hyenes'
              ? (isHyenesS6 ? 62 : 72)
              : 18;
            const firstTeam = standings[0];
            const currentMatchday = firstTeam?.j || 0;

            // France S6 et Hyènes S6 sont considérées comme terminées
            const isSeasonComplete = isFranceS6 || currentMatchday >= totalMatchdays;

            // N'ajouter au palmarès que si la saison est terminée
            if (isSeasonComplete) {
              // Cas spécial : France S6 - deux champions ex-aequo
              if (isFranceS6) {
                championsList.push({
                  season: seasonNum,
                  team: 'BimBam / Warnaque',
                  points: firstTeam?.pts || firstTeam?.points || 0
                });
              } else {
                // Trouver le champion basé sur les points effectifs (pts - pénalité)
                const teamsWithEffectivePts = standings.map(team => {
                  const teamName = team.mgr || team.name || '?';
                  const penalty = getTeamPenaltyLocal(teamName, championshipId, seasonNum);
                  const pts = team.pts || team.points || 0;
                  return {
                    ...team,
                    name: teamName,
                    effectivePts: pts - penalty
                  };
                });

                // Trier par points effectifs (décroissant)
                teamsWithEffectivePts.sort((a, b) => {
                  if (b.effectivePts !== a.effectivePts) {
                    return b.effectivePts - a.effectivePts;
                  }
                  // En cas d'égalité, utiliser la différence de buts
                  const diffA = parseInt(String(a.diff).replace('+', '')) || 0;
                  const diffB = parseInt(String(b.diff).replace('+', '')) || 0;
                  return diffB - diffA;
                });

                const champion = teamsWithEffectivePts[0];
                championsList.push({
                  season: seasonNum,
                  team: champion.name,
                  points: champion.effectivePts
                });
              }
            }
          }
        }
      });

      championsList.sort((a, b) => parseInt(b.season) - parseInt(a.season));
      setChampions(championsList);
    }

    // Recalculer le Panthéon dynamiquement à partir des standings
    if (data.entities.seasons && data.entities.managers) {
      // Initialiser le compteur de trophées pour chaque manager
      const trophyCount = {};
      Object.values(data.entities.managers).forEach(manager => {
        const name = manager.name || '?';
        trophyCount[name] = {
          name: name,
          trophies: 0,  // Ligue des Hyènes
          france: 0,
          spain: 0,
          italy: 0,
          england: 0,
          total: 0
        };
      });

      // Mapping des championnats
      const championshipConfigPantheon = {
        'ligue_hyenes': { field: 'trophies', totalMatchdays: 72, s6Matchdays: 62 },
        'france': { field: 'france', totalMatchdays: 18, s6Matchdays: 8 },
        'espagne': { field: 'spain', totalMatchdays: 18, s6Matchdays: 18 },
        'italie': { field: 'italy', totalMatchdays: 18, s6Matchdays: 18 },
        'angleterre': { field: 'england', totalMatchdays: 18, s6Matchdays: 18 }
      };

      // Parcourir toutes les saisons pour comptabiliser les trophées
      Object.keys(data.entities.seasons).forEach(seasonKey => {
        const parts = seasonKey.split('_');
        const seasonNum = parts[parts.length - 1].replace('s', '');
        const championshipName = parts.slice(0, -1).join('_');
        const config = championshipConfigPantheon[championshipName];

        if (!config) return;

        const seasonData = data.entities.seasons[seasonKey];
        const standings = seasonData.standings || [];

        if (standings.length === 0) return;

        // Vérifier si la saison est terminée
        const isS6 = seasonNum === '6';
        const isFranceS6 = championshipName === 'france' && isS6;
        const totalMatchdays = isS6 ? config.s6Matchdays : config.totalMatchdays;
        const currentMatchday = standings[0]?.j || 0;
        const isSeasonComplete = isFranceS6 || currentMatchday >= totalMatchdays;

        if (!isSeasonComplete) return;

        // Cas spécial : France S6 - deux champions ex-aequo
        if (isFranceS6) {
          if (trophyCount['BimBam']) {
            trophyCount['BimBam'].france += 1;
            trophyCount['BimBam'].total += 1;
          }
          if (trophyCount['Warnaque']) {
            trophyCount['Warnaque'].france += 1;
            trophyCount['Warnaque'].total += 1;
          }
          return;
        }

        // Trouver le champion basé sur les points effectifs (pts - pénalité)
        const teamsWithEffectivePts = standings.map(team => {
          const teamName = team.mgr || team.name || '?';
          const penalty = getTeamPenaltyLocal(teamName,
            championshipName === 'ligue_hyenes' ? 'hyenes' :
            championshipName === 'espagne' ? 'spain' :
            championshipName === 'italie' ? 'italy' :
            championshipName === 'angleterre' ? 'england' :
            championshipName,
            seasonNum);
          const pts = team.pts || team.points || 0;
          return {
            name: teamName,
            effectivePts: pts - penalty,
            diff: team.diff
          };
        });

        // Trier par points effectifs (décroissant)
        teamsWithEffectivePts.sort((a, b) => {
          if (b.effectivePts !== a.effectivePts) {
            return b.effectivePts - a.effectivePts;
          }
          const diffA = parseInt(String(a.diff).replace('+', '')) || 0;
          const diffB = parseInt(String(b.diff).replace('+', '')) || 0;
          return diffB - diffA;
        });

        const champion = teamsWithEffectivePts[0];
        if (champion && trophyCount[champion.name]) {
          trophyCount[champion.name][config.field] += 1;
          trophyCount[champion.name].total += 1;
        }
      });

      // Convertir en tableau et trier par nombre total de trophées
      const pantheon = Object.values(trophyCount)
        .sort((a, b) => b.total - a.total)
        .map((team, index) => ({
          ...team,
          rank: index + 1
        }));

      setPantheonTeams(pantheon);
    }

  }, []);

  // useEffect pour charger les données depuis Supabase au démarrage
  useEffect(() => {
    async function loadFromSupabase() {
      try {
        setIsLoadingFromSupabase(true);
        setSupabaseError(null);
        const data = await fetchAppData();

        // Vérifier si des données existent dans Supabase
        if (data && data.entities && (
          Object.keys(data.entities.managers || {}).length > 0 ||
          Object.keys(data.entities.seasons || {}).length > 0 ||
          (data.entities.matches || []).length > 0
        )) {
          // Charger les données depuis Supabase
          setAppData(data);

          // Extraire allTeams depuis managers
          if (data.entities.managers) {
            const managerNames = Object.values(data.entities.managers)
              .map(manager => manager.name || '?')
              .filter(name => name !== '?');
            setAllTeams(managerNames);
          }

          // Extraire les saisons disponibles
          if (data.entities.seasons) {
            const seasonNumbers = new Set();
            Object.keys(data.entities.seasons).forEach(seasonKey => {
              const match = seasonKey.match(/_s(\d+)$/);
              if (match) {
                seasonNumbers.add(match[1]);
              }
            });
            const sortedSeasons = Array.from(seasonNumbers).sort((a, b) => parseInt(a) - parseInt(b));
            setSeasons(sortedSeasons);
            if (sortedSeasons.length > 0) {
              setSelectedSeason(sortedSeasons[sortedSeasons.length - 1]);
            }
          }

          // Charger les pénalités
          if (data.penalties) {
            setPenalties(data.penalties);
          }

          // Charger le panthéon
          if (data.pantheon && Array.isArray(data.pantheon)) {
            const transformedPantheon = data.pantheon.map((team, index) => ({
              rank: index + 1,
              name: team.name,
              trophies: team.titles || 0,
              france: 0,
              spain: 0,
              italy: 0,
              england: 0,
              total: team.titles || 0
            }));
            setPantheonTeams(transformedPantheon);
          }

          console.log('Données chargées depuis Supabase');
        } else {
          console.log('Aucune donnée dans Supabase - en attente d\'import JSON');
        }
      } catch (error) {
        console.error('Erreur chargement Supabase:', error);
        setSupabaseError(error.message);
      } finally {
        setIsLoadingFromSupabase(false);
      }
    }

    loadFromSupabase();
  }, []);

  // useEffect pour recharger les données quand le contexte change ou les pénalités
  useEffect(() => {
    if (appData && appData.version === '2.0') {
      loadDataFromAppData(appData, selectedChampionship, selectedSeason, selectedJournee, penalties);
    }
  }, [selectedChampionship, selectedSeason, selectedJournee, appData, penalties, loadDataFromAppData]);

  // useEffect pour basculer automatiquement vers 'france' si on entre dans Match avec 'hyenes'
  useEffect(() => {
    if (selectedTab === 'match' && selectedChampionship === 'hyenes') {
      setSelectedChampionship('france');
    }
  }, [selectedTab, selectedChampionship]);

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
    // L'équipe exemptée est fixe pour toute la saison, afficher toutes les équipes
    return allTeams;
  };

  const handleTeamSelect = (matchId, type, team) => {
    const updatedMatches = matches.map(m =>
      m.id === matchId ? { ...m, [type === 'home' ? 'homeTeam' : 'awayTeam']: team } : m
    );
    setMatches(updatedMatches);
    syncMatchesToAppData(updatedMatches);
    setOpenDropdown(null);
  };

  const toggleDropdown = (matchId, type, event) => {
    if (openDropdown?.matchId === matchId && openDropdown?.type === type) {
      setOpenDropdown(null);
    } else {
      const rect = event.currentTarget.getBoundingClientRect();
      const position = {
        top: rect.bottom + 4,
        left: type === 'home' ? rect.left : 'auto',
        right: type === 'away' ? (window.innerWidth - rect.right) : 'auto'
      };
      setDropdownPosition(position);
      setOpenDropdown({ matchId, type });
    }
  };

  const handleSeasonSelect = (season) => {
    setSelectedSeason(season);
    setIsSeasonOpen(false);
  };

  // Fonctions pour les pénalités
  const getPenaltyKey = (teamName) => {
    return `${selectedChampionship}_${selectedSeason}_${teamName}`;
  };

  const getTeamPenalty = (teamName) => {
    const key = getPenaltyKey(teamName);
    return penalties[key] || 0;
  };

  const handleApplyPenalty = () => {
    if (!selectedPenaltyTeam || !penaltyPoints) return;

    const points = parseInt(penaltyPoints);
    if (isNaN(points) || points < 0) {
      alert('Veuillez entrer un nombre de points valide (positif)');
      return;
    }

    const key = getPenaltyKey(selectedPenaltyTeam);
    setPenalties(prev => ({
      ...prev,
      [key]: points
    }));

    // Réinitialiser le formulaire
    setSelectedPenaltyTeam('');
    setPenaltyPoints('');
    setIsPenaltyModalOpen(false);
  };

  const handleRemovePenalty = (teamName) => {
    const key = getPenaltyKey(teamName);
    setPenalties(prev => {
      const newPenalties = { ...prev };
      delete newPenalties[key];
      return newPenalties;
    });
  };

  // === Création d'une nouvelle saison ===
  const handleCreateSeason = () => {
    const seasonNum = newSeasonNumber.trim();
    if (!seasonNum || isNaN(parseInt(seasonNum)) || parseInt(seasonNum) < 1) {
      alert('Veuillez entrer un numéro de saison valide (nombre positif).');
      return;
    }

    // Vérifier si la saison existe déjà
    if (seasons.includes(seasonNum)) {
      alert(`La Saison ${seasonNum} existe déjà.`);
      return;
    }

    if (!appData || appData.version !== '2.0') {
      alert('Veuillez d\'abord importer un fichier de données v2.0.');
      return;
    }

    const updatedAppData = JSON.parse(JSON.stringify(appData));

    // Créer les entrées de saison pour TOUS les championnats
    const championships = ['ligue_hyenes', 'france', 'espagne', 'italie', 'angleterre'];
    championships.forEach(champKey => {
      const seasonKey = `${champKey}_s${seasonNum}`;
      if (!updatedAppData.entities.seasons[seasonKey]) {
        updatedAppData.entities.seasons[seasonKey] = { standings: [] };
      }
    });

    // Mettre à jour la liste des saisons
    const updatedSeasons = [...seasons, seasonNum].sort((a, b) => parseInt(a) - parseInt(b));
    setSeasons(updatedSeasons);

    // Sélectionner la nouvelle saison
    setSelectedSeason(seasonNum);

    // Sauvegarder dans appData
    setAppData(updatedAppData);

    // Réinitialiser le formulaire
    setNewSeasonNumber('');

    alert(`Saison ${seasonNum} créée avec succès pour tous les championnats.`);
  };

  // Obtenir les équipes avec pénalités pour la saison actuelle
  const getTeamsWithPenalties = () => {
    const prefix = `${selectedChampionship}_${selectedSeason}_`;
    return Object.entries(penalties)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, points]) => ({
        teamName: key.replace(prefix, ''),
        points
      }));
  };

  // Calculer le classement trié avec les pénalités appliquées
  const getSortedTeams = () => {
    return [...teams]
      .map(team => ({
        ...team,
        effectivePts: team.pts - getTeamPenalty(team.name)
      }))
      .sort((a, b) => {
        // Trier par points effectifs (décroissant)
        if (b.effectivePts !== a.effectivePts) {
          return b.effectivePts - a.effectivePts;
        }
        // En cas d'égalité, trier par différence de buts
        const diffA = parseInt(String(a.diff).replace('+', '')) || 0;
        const diffB = parseInt(String(b.diff).replace('+', '')) || 0;
        return diffB - diffA;
      })
      .map((team, index) => ({
        ...team,
        displayRank: index + 1
      }));
  };

  const handleJourneeSelect = (journee) => {
    setSelectedJournee(journee);
    setIsJourneeOpen(false);
  };

  // Fonction utilitaire pour recalculer les standings d'un championnat
  const recalculateStandingsForExport = (exportData, championshipKey, season) => {
    const seasonKey = `${championshipKey}_s${season}`;

    // Récupérer tous les matchs de cette saison/championnat
    const allSeasonMatches = (exportData.entities.matches || []).filter(
      block => block.championship === championshipKey &&
               block.season === parseInt(season)
    );

    // Initialiser les stats pour chaque équipe
    const teamStats = {};
    allTeams.forEach(team => {
      teamStats[team] = {
        name: team, pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0
      };
    });

    // Calculer les stats à partir de tous les matchs
    allSeasonMatches.forEach(block => {
      if (block.games && Array.isArray(block.games)) {
        block.games.forEach(game => {
          // Normaliser les noms de champs (formats multiples selon la source)
          const home = game.homeTeam || game.home || game.h || game.equipe1 || '';
          const away = game.awayTeam || game.away || game.a || game.equipe2 || '';
          const hsVal = game.homeScore !== undefined ? game.homeScore :
                        (game.hs !== undefined ? game.hs :
                        (game.scoreHome !== undefined ? game.scoreHome : null));
          const asVal = game.awayScore !== undefined ? game.awayScore :
                        (game.as !== undefined ? game.as :
                        (game.scoreAway !== undefined ? game.scoreAway : null));

          if (home && away && hsVal !== null && hsVal !== undefined &&
              asVal !== null && asVal !== undefined) {
            const homeScore = parseInt(hsVal);
            const awayScore = parseInt(asVal);

            if (!isNaN(homeScore) && !isNaN(awayScore)) {
              if (!teamStats[home]) {
                teamStats[home] = { name: home, pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0 };
              }
              if (!teamStats[away]) {
                teamStats[away] = { name: away, pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0 };
              }

              teamStats[home].j++;
              teamStats[away].j++;
              teamStats[home].bp += homeScore;
              teamStats[home].bc += awayScore;
              teamStats[away].bp += awayScore;
              teamStats[away].bc += homeScore;

              if (homeScore > awayScore) {
                teamStats[home].g++;
                teamStats[home].pts += 3;
                teamStats[away].p++;
              } else if (homeScore < awayScore) {
                teamStats[away].g++;
                teamStats[away].pts += 3;
                teamStats[home].p++;
              } else {
                teamStats[home].n++;
                teamStats[away].n++;
                teamStats[home].pts += 1;
                teamStats[away].pts += 1;
              }
            }
          }
        });
      }
    });

    // Calculer diff et trier
    Object.values(teamStats).forEach(team => {
      team.diff = team.bp - team.bc;
    });

    const sortedTeams = Object.values(teamStats)
      .filter(team => team.j > 0)
      .sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.diff !== a.diff) return b.diff - a.diff;
        return b.bp - a.bp;
      });

    const newStandings = sortedTeams.map((team, index) => ({
      pos: index + 1,
      mgr: team.name,
      pts: team.pts,
      j: team.j,
      g: team.g,
      n: team.n,
      p: team.p,
      bp: team.bp,
      bc: team.bc,
      diff: team.diff
    }));

    // Mettre à jour les standings
    if (!exportData.entities.seasons[seasonKey]) {
      exportData.entities.seasons[seasonKey] = { standings: [] };
    }
    exportData.entities.seasons[seasonKey].standings = newStandings;

    return exportData;
  };

  // Fonction pour sauvegarder les données vers Supabase
  const handleSaveToSupabase = async () => {
    if (!pendingJsonData && !appData) {
      alert('Aucune donnée à sauvegarder. Importez d\'abord un fichier JSON.');
      return;
    }

    const dataToSave = pendingJsonData || appData;

    try {
      setIsSavingToSupabase(true);
      await importFromJSON(dataToSave);
      setPendingJsonData(null);
      alert('Données sauvegardées dans Supabase avec succès !');

      // Recharger les données depuis Supabase pour confirmer
      const freshData = await fetchAppData();
      if (freshData) {
        setAppData(freshData);
      }
    } catch (error) {
      console.error('Erreur sauvegarde Supabase:', error);
      alert('Erreur lors de la sauvegarde vers Supabase: ' + error.message);
    } finally {
      setIsSavingToSupabase(false);
    }
  };

  // Fonctions Réglages
  const handleExportJSON = () => {
    try {
      let data;

      // Si on a des données v2.0, les exporter avec les matchs modifiés et pénalités
      if (appData && appData.version === '2.0') {
        // Créer une copie profonde de appData
        const exportData = JSON.parse(JSON.stringify(appData));

        // Mapping des IDs de championnat vers les clés du fichier v2.0
        const championshipMapping = {
          'hyenes': 'ligue_hyenes',
          'france': 'france',
          'spain': 'espagne',
          'italy': 'italie',
          'england': 'angleterre'
        };
        const championshipKey = championshipMapping[selectedChampionship] || selectedChampionship;

        // Initialiser entities.matches si nécessaire
        if (!exportData.entities.matches) {
          exportData.entities.matches = [];
        }

        // Chercher si un bloc existe déjà pour ce contexte
        const existingBlockIndex = exportData.entities.matches.findIndex(
          block => block.championship === championshipKey &&
                   block.season === parseInt(selectedSeason) &&
                   block.matchday === parseInt(selectedJournee)
        );

        // Préparer le bloc de matchs avec les données actuelles
        const matchBlock = {
          championship: championshipKey,
          season: parseInt(selectedSeason),
          matchday: parseInt(selectedJournee),
          games: matches.map(m => ({
            id: m.id,
            homeTeam: m.homeTeam || '',
            awayTeam: m.awayTeam || '',
            homeScore: m.homeScore,
            awayScore: m.awayScore
          })),
          exempt: exemptTeam || ''
        };

        // Mettre à jour ou ajouter le bloc
        if (existingBlockIndex >= 0) {
          exportData.entities.matches[existingBlockIndex] = matchBlock;
        } else {
          exportData.entities.matches.push(matchBlock);
        }

        // Recalculer les standings pour ce championnat/saison
        recalculateStandingsForExport(exportData, championshipKey, selectedSeason);

        data = {
          ...exportData,
          penalties: penalties,
          exportDate: new Date().toISOString()
        };
      } else {
        // Export format v1.0
        data = {
          classement: teams,
          matches,
          palmares: champions,
          pantheon: pantheonTeams,
          penalties: penalties,
          exportDate: new Date().toISOString(),
          version: '1.0',
          context: {
            championship: selectedChampionship,
            season: selectedSeason,
            journee: selectedJournee
          }
        };
      }

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

          // Extraire allTeams depuis entities.managers (source de vérité avec tous les managers)
          if (data.entities.managers) {
            const managerNames = Object.values(data.entities.managers)
              .map(manager => manager.name || '?')
              .filter(name => name !== '?');
            setAllTeams(managerNames);
          } else if (data.metadata?.managers && Array.isArray(data.metadata.managers)) {
            // Fallback : utiliser metadata.managers si entities.managers n'existe pas
            setAllTeams(data.metadata.managers);
          }

          // Extraire les saisons disponibles depuis entities.seasons
          if (data.entities.seasons) {
            const seasonNumbers = new Set();
            Object.keys(data.entities.seasons).forEach(seasonKey => {
              const match = seasonKey.match(/_s(\d+)$/);
              if (match) {
                seasonNumbers.add(match[1]);
              }
            });
            const sortedSeasons = Array.from(seasonNumbers).sort((a, b) => parseInt(a) - parseInt(b));
            setSeasons(sortedSeasons);
            // Sélectionner la dernière saison par défaut
            if (sortedSeasons.length > 0) {
              setSelectedSeason(sortedSeasons[sortedSeasons.length - 1]);
            }
          }

          // Charger les données pour le contexte actuel (avec pénalités du fichier si disponibles)
          const filePenalties = data.penalties && typeof data.penalties === 'object' ? data.penalties : {};
          loadDataFromAppData(data, selectedChampionship, selectedSeason, selectedJournee, filePenalties);

          // Extraire pantheonTeams[] - calcul DYNAMIQUE depuis les standings de toutes les saisons
          if (data.entities.seasons && data.entities.managers) {
            // Initialiser le compteur de trophées pour chaque manager
            const trophyCount = {};
            Object.values(data.entities.managers).forEach(manager => {
              const name = manager.name || '?';
              trophyCount[name] = {
                name: name,
                trophies: 0,  // Ligue des Hyènes
                france: 0,
                spain: 0,
                italy: 0,
                england: 0,
                total: 0
              };
            });

            // Mapping des championnats
            const championshipConfig = {
              'ligue_hyenes': { field: 'trophies', totalMatchdays: 72, s6Matchdays: 62 },
              'france': { field: 'france', totalMatchdays: 18, s6Matchdays: 8 },
              'espagne': { field: 'spain', totalMatchdays: 18, s6Matchdays: 18 },
              'italie': { field: 'italy', totalMatchdays: 18, s6Matchdays: 18 },
              'angleterre': { field: 'england', totalMatchdays: 18, s6Matchdays: 18 }
            };

            // Parcourir toutes les saisons pour comptabiliser les trophées
            Object.keys(data.entities.seasons).forEach(seasonKey => {
              const parts = seasonKey.split('_');
              const seasonNum = parts[parts.length - 1].replace('s', '');
              const championshipName = parts.slice(0, -1).join('_');
              const config = championshipConfig[championshipName];

              if (!config) return;

              const seasonData = data.entities.seasons[seasonKey];
              const standings = seasonData.standings || [];

              if (standings.length === 0) return;

              // Vérifier si la saison est terminée
              const isS6 = seasonNum === '6';
              const isFranceS6 = championshipName === 'france' && isS6;
              const totalMatchdays = isS6 ? config.s6Matchdays : config.totalMatchdays;
              const currentMatchday = standings[0]?.j || 0;
              const isSeasonComplete = isFranceS6 || currentMatchday >= totalMatchdays;

              if (!isSeasonComplete) return;

              // Cas spécial : France S6 - deux champions ex-aequo
              if (isFranceS6) {
                if (trophyCount['BimBam']) {
                  trophyCount['BimBam'].france += 1;
                  trophyCount['BimBam'].total += 1;
                }
                if (trophyCount['Warnaque']) {
                  trophyCount['Warnaque'].france += 1;
                  trophyCount['Warnaque'].total += 1;
                }
                return;
              }

              // Trouver le champion basé sur les points effectifs (pts - pénalité)
              const teamsWithEffectivePts = standings.map(team => {
                const teamName = team.mgr || team.name || '?';
                // Construire la clé de pénalité avec le bon format de championnat
                const champId = championshipName === 'ligue_hyenes' ? 'hyenes' :
                               championshipName === 'espagne' ? 'spain' :
                               championshipName === 'italie' ? 'italy' :
                               championshipName === 'angleterre' ? 'england' :
                               championshipName;
                const penaltyKey = `${champId}_${seasonNum}_${teamName}`;
                const penalty = filePenalties[penaltyKey] || 0;
                const pts = team.pts || team.points || 0;
                return {
                  name: teamName,
                  effectivePts: pts - penalty,
                  diff: team.diff
                };
              });

              // Trier par points effectifs (décroissant)
              teamsWithEffectivePts.sort((a, b) => {
                if (b.effectivePts !== a.effectivePts) {
                  return b.effectivePts - a.effectivePts;
                }
                const diffA = parseInt(String(a.diff).replace('+', '')) || 0;
                const diffB = parseInt(String(b.diff).replace('+', '')) || 0;
                return diffB - diffA;
              });

              const champion = teamsWithEffectivePts[0];
              if (champion && trophyCount[champion.name]) {
                trophyCount[champion.name][config.field] += 1;
                trophyCount[champion.name].total += 1;
              }
            });

            // Convertir en tableau et trier par nombre total de trophées
            const pantheon = Object.values(trophyCount)
              .sort((a, b) => b.total - a.total)
              .map((team, index) => ({
                ...team,
                rank: index + 1
              }));

            setPantheonTeams(pantheon);
          }

          // Importer les pénalités (format v2.0)
          if (data.penalties && typeof data.penalties === 'object') {
            setPenalties(data.penalties);
          }

          // Stocker les données pour sauvegarde vers Supabase
          setPendingJsonData(data);
          alert('✅ Données v2.0 importées ! Cliquez sur "Sauvegarder vers Supabase" pour les enregistrer dans la base de données.');
        } else {
          // Format v1.0 legacy - transformer vers format interne

          // Restaurer le contexte si disponible (championnat/saison/journée)
          if (data.context) {
            if (data.context.championship) setSelectedChampionship(data.context.championship);
            if (data.context.season) setSelectedSeason(data.context.season);
            if (data.context.journee) setSelectedJournee(data.context.journee);
          }

          // Transformer classement
          if (data.classement && Array.isArray(data.classement)) {
            const transformedTeams = data.classement.map(team => ({
              rank: team.pos || team.rank,
              name: team.name,
              pts: team.pts,
              record: team.record || (team.g !== undefined ? `${team.g}-${team.n}-${team.p}` : '0-0-0'),
              goalDiff: team.goalDiff || (team.bp !== undefined ? `${team.bp}-${team.bc}` : '0-0'),
              diff: team.diff !== undefined
                ? (typeof team.diff === 'string' ? team.diff : (team.diff >= 0 ? `+${team.diff}` : `${team.diff}`))
                : '+0'
            }));
            setTeams(transformedTeams);

            // Extraire allTeams depuis le classement
            const teamNames = transformedTeams.map(team => team.name);
            if (teamNames.length > 0) {
              setAllTeams(teamNames);
            }
          }

          // Matches (pas de transformation nécessaire)
          if (data.matches && Array.isArray(data.matches)) {
            setMatches(data.matches);
          }

          // Transformer palmarès
          if (data.palmares && Array.isArray(data.palmares)) {
            const transformedChampions = data.palmares.map(champion => ({
              season: champion.season || champion.saison || '?',
              team: champion.team || champion.equipe || champion.name || '?',
              points: champion.points || champion.pts || 0
            }));
            setChampions(transformedChampions);

            // Extraire les saisons depuis le palmarès
            const seasonNumbers = transformedChampions
              .map(c => c.season)
              .filter(s => s !== '?')
              .sort((a, b) => parseInt(a) - parseInt(b));
            if (seasonNumbers.length > 0) {
              setSeasons([...new Set(seasonNumbers)]);
            }
          }

          // Transformer panthéon
          if (data.pantheon && Array.isArray(data.pantheon)) {
            const transformedPantheon = data.pantheon.map((team, index) => ({
              rank: team.rank || team.pos || (index + 1),
              name: team.name || team.equipe || '?',
              trophies: team.trophies || team.titres || team.total || 0,
              france: team.france || 0,
              spain: team.spain || team.espagne || 0,
              italy: team.italy || team.italie || 0,
              england: team.england || team.angleterre || 0,
              total: team.total || team.trophies || team.titres || 0
            }));
            setPantheonTeams(transformedPantheon);
          }

          // Importer les pénalités
          if (data.penalties && typeof data.penalties === 'object') {
            setPenalties(data.penalties);
          }

          // Stocker les données pour sauvegarde vers Supabase
          setPendingJsonData(data);
          alert('✅ Données v1.0 importées ! Cliquez sur "Sauvegarder vers Supabase" pour les enregistrer dans la base de données.');
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
    // Synchroniser les matchs modifiés avec appData et recalculer le classement
    if (appData && appData.version === '2.0') {
      // Mapping des IDs de championnat vers les clés du fichier v2.0
      const championshipMapping = {
        'hyenes': 'ligue_hyenes',
        'france': 'france',
        'spain': 'espagne',
        'italy': 'italie',
        'england': 'angleterre'
      };
      const championshipKey = championshipMapping[selectedChampionship] || selectedChampionship;
      const seasonKey = `${championshipKey}_s${selectedSeason}`;

      // Créer une copie mise à jour de appData
      const updatedAppData = JSON.parse(JSON.stringify(appData));

      // Initialiser entities.matches si nécessaire
      if (!updatedAppData.entities.matches) {
        updatedAppData.entities.matches = [];
      }

      // Chercher si un bloc existe déjà pour ce contexte (journée actuelle)
      const existingBlockIndex = updatedAppData.entities.matches.findIndex(
        block => block.championship === championshipKey &&
                 block.season === parseInt(selectedSeason) &&
                 block.matchday === parseInt(selectedJournee)
      );

      // Récupérer les anciens matchs de cette journée (pour calculer la différence)
      const oldMatchBlock = existingBlockIndex >= 0
        ? updatedAppData.entities.matches[existingBlockIndex]
        : null;

      // Préparer le bloc de matchs avec les données actuelles
      const newMatchBlock = {
        championship: championshipKey,
        season: parseInt(selectedSeason),
        matchday: parseInt(selectedJournee),
        games: matches.map(m => ({
          id: m.id,
          homeTeam: m.homeTeam || '',
          awayTeam: m.awayTeam || '',
          homeScore: m.homeScore,
          awayScore: m.awayScore
        })),
        exempt: exemptTeam || ''
      };

      // Mettre à jour ou ajouter le bloc
      if (existingBlockIndex >= 0) {
        updatedAppData.entities.matches[existingBlockIndex] = newMatchBlock;
      } else {
        updatedAppData.entities.matches.push(newMatchBlock);
      }

      // === RECALCULER LE CLASSEMENT DEPUIS TOUS LES MATCHS DE LA SAISON ===
      // Récupérer TOUS les matchs de ce championnat/saison (toutes les journées)
      const allSeasonMatches = updatedAppData.entities.matches.filter(
        block => block.championship === championshipKey &&
                 block.season === parseInt(selectedSeason)
      );

      // Initialiser les stats pour TOUTES les équipes à zéro
      const teamStats = {};
      allTeams.forEach(team => {
        teamStats[team] = {
          name: team,
          pts: 0,
          j: 0,
          g: 0,
          n: 0,
          p: 0,
          bp: 0,
          bc: 0,
          diff: 0
        };
      });

      // Parcourir TOUS les blocs de matchs de la saison (toutes les journées)
      allSeasonMatches.forEach(matchBlock => {
        if (matchBlock.games && Array.isArray(matchBlock.games)) {
          matchBlock.games.forEach(match => {
            // Normaliser les noms de champs (formats multiples selon la source)
            const home = match.homeTeam || match.home || match.h || match.equipe1 || '';
            const away = match.awayTeam || match.away || match.a || match.equipe2 || '';
            const hs = match.homeScore !== undefined ? match.homeScore :
                       (match.hs !== undefined ? match.hs :
                       (match.scoreHome !== undefined ? match.scoreHome : null));
            const as2 = match.awayScore !== undefined ? match.awayScore :
                        (match.as !== undefined ? match.as :
                        (match.scoreAway !== undefined ? match.scoreAway : null));

            if (hs !== null && hs !== undefined && as2 !== null && as2 !== undefined) {
              const homeScore = parseInt(hs);
              const awayScore = parseInt(as2);

              // S'assurer que les équipes existent dans teamStats
              if (!isNaN(homeScore) && !isNaN(awayScore) && teamStats[home] && teamStats[away]) {
                // Incrémenter les matchs joués
                teamStats[home].j++;
                teamStats[away].j++;

                // Enregistrer les buts
                teamStats[home].bp += homeScore;
                teamStats[home].bc += awayScore;
                teamStats[away].bp += awayScore;
                teamStats[away].bc += homeScore;

                // Déterminer le résultat et attribuer les points
                if (homeScore > awayScore) {
                  // Victoire domicile
                  teamStats[home].pts += 3;
                  teamStats[home].g++;
                  teamStats[away].p++;
                } else if (homeScore < awayScore) {
                  // Victoire extérieur
                  teamStats[away].pts += 3;
                  teamStats[away].g++;
                  teamStats[home].p++;
                } else {
                  // Match nul
                  teamStats[home].pts++;
                  teamStats[away].pts++;
                  teamStats[home].n++;
                  teamStats[away].n++;
                }

                // Calculer la différence de buts
                teamStats[home].diff = teamStats[home].bp - teamStats[home].bc;
                teamStats[away].diff = teamStats[away].bp - teamStats[away].bc;
              }
            }
          });
        }
      });

      // Appliquer les pénalités et trier
      const sortedTeams = Object.values(teamStats)
        .filter(team => team.j > 0)
        .map(team => {
          const penaltyKey = `${selectedChampionship}_${selectedSeason}_${team.name}`;
          const penalty = penalties[penaltyKey] || 0;
          return {
            ...team,
            penalty: penalty,
            effectivePts: team.pts - penalty
          };
        })
        .sort((a, b) => {
          if (b.effectivePts !== a.effectivePts) return b.effectivePts - a.effectivePts;
          if (b.diff !== a.diff) return b.diff - a.diff;
          return b.bp - a.bp;
        });

      // Créer le nouveau classement avec rangs
      const newStandings = sortedTeams.map((team, index) => ({
        pos: index + 1,
        mgr: team.name,
        pts: team.pts,
        j: team.j,
        g: team.g,
        n: team.n,
        p: team.p,
        bp: team.bp,
        bc: team.bc,
        diff: team.diff
      }));

      // Mettre à jour les standings dans appData
      if (!updatedAppData.entities.seasons[seasonKey]) {
        updatedAppData.entities.seasons[seasonKey] = { standings: [] };
      }
      updatedAppData.entities.seasons[seasonKey].standings = newStandings;

      // Mettre à jour appData
      setAppData(updatedAppData);

      // Mettre à jour l'affichage des équipes
      const normalizedTeams = newStandings.map(team => ({
        rank: team.pos,
        name: team.mgr,
        pts: team.pts,
        record: `${team.g}-${team.n}-${team.p}`,
        goalDiff: `${team.bp}-${team.bc}`,
        diff: team.diff >= 0 ? `+${team.diff}` : `${team.diff}`
      }));
      setTeams(normalizedTeams);

      // Mettre à jour la progression (allSeasonMatches déjà défini plus haut)
      const maxMatchday = Math.max(...allSeasonMatches.map(b => b.matchday), parseInt(selectedJournee));
      const totalMatchdays = 18;
      setSeasonProgress({
        currentMatchday: maxMatchday,
        totalMatchdays,
        percentage: parseFloat(((maxMatchday / totalMatchdays) * 100).toFixed(1))
      });

      alert('✅ Classement mis à jour avec les nouvelles données !');
    } else {
      // Format v1.0 : simple re-render
      setTeams([...teams]);
      setMatches([...matches]);
      setChampions([...champions]);
      setPantheonTeams([...pantheonTeams]);
      alert('✅ Données actualisées !');
    }
  };

  // === AUTO-SYNC : synchroniser les matchs vers appData à chaque modification ===
  const syncMatchesToAppData = useCallback((updatedMatches) => {
    if (!appData || appData.version !== '2.0' || allTeams.length === 0) return;

    const championshipMapping = {
      'hyenes': 'ligue_hyenes',
      'france': 'france',
      'spain': 'espagne',
      'italy': 'italie',
      'england': 'angleterre'
    };
    const championshipKey = championshipMapping[selectedChampionship] || selectedChampionship;
    const seasonKey = `${championshipKey}_s${selectedSeason}`;

    const updatedAppData = JSON.parse(JSON.stringify(appData));

    if (!updatedAppData.entities.matches) {
      updatedAppData.entities.matches = [];
    }

    // Créer le bloc de matchs avec les données actuelles
    const newMatchBlock = {
      championship: championshipKey,
      season: parseInt(selectedSeason),
      matchday: parseInt(selectedJournee),
      games: updatedMatches.map(m => ({
        id: m.id,
        homeTeam: m.homeTeam || '',
        awayTeam: m.awayTeam || '',
        homeScore: m.homeScore,
        awayScore: m.awayScore
      })),
      exempt: exemptTeam || ''
    };

    // Mettre à jour ou ajouter le bloc
    const existingBlockIndex = updatedAppData.entities.matches.findIndex(
      block => block.championship === championshipKey &&
               block.season === parseInt(selectedSeason) &&
               block.matchday === parseInt(selectedJournee)
    );
    if (existingBlockIndex >= 0) {
      updatedAppData.entities.matches[existingBlockIndex] = newMatchBlock;
    } else {
      updatedAppData.entities.matches.push(newMatchBlock);
    }

    // Recalculer le classement depuis TOUS les matchs de la saison
    const allSeasonMatches = updatedAppData.entities.matches.filter(
      block => block.championship === championshipKey &&
               block.season === parseInt(selectedSeason)
    );

    const teamStats = {};
    allTeams.forEach(team => {
      teamStats[team] = {
        name: team, pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0
      };
    });

    allSeasonMatches.forEach(matchBlock => {
      if (matchBlock.games && Array.isArray(matchBlock.games)) {
        matchBlock.games.forEach(match => {
          const home = match.homeTeam || match.home || match.h || match.equipe1 || '';
          const away = match.awayTeam || match.away || match.a || match.equipe2 || '';
          const hs = match.homeScore !== undefined ? match.homeScore :
                     (match.hs !== undefined ? match.hs :
                     (match.scoreHome !== undefined ? match.scoreHome : null));
          const as2 = match.awayScore !== undefined ? match.awayScore :
                      (match.as !== undefined ? match.as :
                      (match.scoreAway !== undefined ? match.scoreAway : null));

          if (hs !== null && hs !== undefined && as2 !== null && as2 !== undefined) {
            const homeScore = parseInt(hs);
            const awayScore = parseInt(as2);

            if (!isNaN(homeScore) && !isNaN(awayScore) && teamStats[home] && teamStats[away]) {
              teamStats[home].j++;
              teamStats[away].j++;
              teamStats[home].bp += homeScore;
              teamStats[home].bc += awayScore;
              teamStats[away].bp += awayScore;
              teamStats[away].bc += homeScore;

              if (homeScore > awayScore) {
                teamStats[home].pts += 3;
                teamStats[home].g++;
                teamStats[away].p++;
              } else if (homeScore < awayScore) {
                teamStats[away].pts += 3;
                teamStats[away].g++;
                teamStats[home].p++;
              } else {
                teamStats[home].pts++;
                teamStats[away].pts++;
                teamStats[home].n++;
                teamStats[away].n++;
              }
              teamStats[home].diff = teamStats[home].bp - teamStats[home].bc;
              teamStats[away].diff = teamStats[away].bp - teamStats[away].bc;
            }
          }
        });
      }
    });

    // Trier avec pénalités
    const sortedTeams = Object.values(teamStats)
      .filter(team => team.j > 0)
      .map(team => {
        const penaltyKey = `${selectedChampionship}_${selectedSeason}_${team.name}`;
        const penalty = penalties[penaltyKey] || 0;
        return { ...team, penalty, effectivePts: team.pts - penalty };
      })
      .sort((a, b) => {
        if (b.effectivePts !== a.effectivePts) return b.effectivePts - a.effectivePts;
        if (b.diff !== a.diff) return b.diff - a.diff;
        return b.bp - a.bp;
      });

    const newStandings = sortedTeams.map((team, index) => ({
      pos: index + 1,
      mgr: team.name,
      pts: team.pts,
      j: team.j, g: team.g, n: team.n, p: team.p,
      bp: team.bp, bc: team.bc, diff: team.diff
    }));

    // Sauvegarder les standings recalculés dans appData
    if (!updatedAppData.entities.seasons[seasonKey]) {
      updatedAppData.entities.seasons[seasonKey] = { standings: [] };
    }
    updatedAppData.entities.seasons[seasonKey].standings = newStandings;

    // Empêcher loadDataFromAppData d'écraser les matchs en cours de saisie
    skipNextMatchesLoadRef.current = true;
    setAppData(updatedAppData);
  }, [appData, allTeams, selectedChampionship, selectedSeason, selectedJournee, exemptTeam, penalties]);

  return (
    <div className="h-screen bg-black text-white font-sans flex flex-col overflow-hidden safe-top ios26-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        /* === iOS 26 Design System === */
        :root {
          --glass-bg: rgba(255, 255, 255, 0.08);
          --glass-border: rgba(255, 255, 255, 0.15);
          --glass-highlight: rgba(255, 255, 255, 0.25);
          --glass-shadow: rgba(0, 0, 0, 0.4);
          --liquid-blur: 20px;
          --liquid-saturation: 180%;
          --spring-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
          --spring-smooth: cubic-bezier(0.25, 0.1, 0.25, 1);
          --cyan-glow: rgba(34, 211, 238, 0.4);
          --green-glow: rgba(34, 197, 94, 0.4);
        }

        * {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          -webkit-tap-highlight-color: transparent;
        }

        /* === Liquid Glass Effect === */
        .liquid-glass {
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.1) 0%,
            rgba(255, 255, 255, 0.05) 50%,
            rgba(255, 255, 255, 0.02) 100%
          );
          backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturation));
          -webkit-backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturation));
          border: 1px solid var(--glass-border);
          box-shadow:
            0 8px 32px var(--glass-shadow),
            inset 0 1px 0 var(--glass-highlight),
            inset 0 -1px 0 rgba(0, 0, 0, 0.1);
        }

        .liquid-glass-intense {
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.15) 0%,
            rgba(255, 255, 255, 0.08) 50%,
            rgba(255, 255, 255, 0.03) 100%
          );
          backdrop-filter: blur(30px) saturate(200%);
          -webkit-backdrop-filter: blur(30px) saturate(200%);
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow:
            0 12px 40px rgba(0, 0, 0, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.3),
            inset 0 -1px 0 rgba(0, 0, 0, 0.15);
        }

        /* === iOS 26 Header === */
        .ios26-header {
          background: linear-gradient(
            180deg,
            rgba(34, 211, 238, 0.15) 0%,
            rgba(34, 211, 238, 0.05) 100%
          );
          backdrop-filter: blur(25px) saturate(180%);
          -webkit-backdrop-filter: blur(25px) saturate(180%);
          border: 1.5px solid rgba(34, 211, 238, 0.3);
          box-shadow:
            0 4px 24px rgba(34, 211, 238, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.2),
            0 1px 0 rgba(0, 0, 0, 0.1);
        }

        /* === iOS 26 Tab Bar === */
        .ios26-tabbar {
          background: linear-gradient(
            180deg,
            rgba(30, 30, 35, 0.95) 0%,
            rgba(20, 20, 25, 0.98) 100%
          );
          backdrop-filter: blur(40px) saturate(200%);
          -webkit-backdrop-filter: blur(40px) saturate(200%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow:
            0 -8px 32px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        /* === iOS 26 Card === */
        .ios26-card {
          background: linear-gradient(
            145deg,
            rgba(255, 255, 255, 0.08) 0%,
            rgba(255, 255, 255, 0.03) 100%
          );
          backdrop-filter: blur(20px) saturate(150%);
          -webkit-backdrop-filter: blur(20px) saturate(150%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.15);
        }

        /* === iOS 26 Button === */
        .ios26-btn {
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.12) 0%,
            rgba(255, 255, 255, 0.05) 100%
          );
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow:
            0 4px 16px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }

        /* === iOS 26 Input === */
        .ios26-input {
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .ios26-input:focus {
          border-color: rgba(34, 211, 238, 0.5);
          box-shadow:
            inset 0 2px 4px rgba(0, 0, 0, 0.2),
            0 0 0 3px rgba(34, 211, 238, 0.15);
        }

        /* === iOS 26 Dropdown === */
        .ios26-dropdown {
          background: linear-gradient(
            180deg,
            rgba(40, 40, 50, 0.98) 0%,
            rgba(30, 30, 40, 0.99) 100%
          );
          backdrop-filter: blur(40px) saturate(200%);
          -webkit-backdrop-filter: blur(40px) saturate(200%);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow:
            0 20px 60px rgba(0, 0, 0, 0.6),
            0 8px 20px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        /* === iOS 26 Modal === */
        .ios26-modal {
          background: linear-gradient(
            180deg,
            rgba(35, 35, 45, 0.98) 0%,
            rgba(25, 25, 35, 0.99) 100%
          );
          backdrop-filter: blur(50px) saturate(200%);
          -webkit-backdrop-filter: blur(50px) saturate(200%);
          border: 1.5px solid rgba(255, 255, 255, 0.15);
          box-shadow:
            0 24px 80px rgba(0, 0, 0, 0.7),
            0 12px 30px rgba(0, 0, 0, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }

        /* === iOS 26 Progress Bar === */
        .ios26-progress {
          background: rgba(255, 255, 255, 0.08);
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
          overflow: hidden;
        }

        .ios26-progress-bar {
          background: linear-gradient(
            90deg,
            #22d3ee 0%,
            #14b8a6 50%,
            #22c55e 100%
          );
          box-shadow:
            0 0 20px rgba(34, 211, 238, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.3);
          position: relative;
        }

        .ios26-progress-bar::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 50%;
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.3) 0%,
            transparent 100%
          );
        }

        /* === iOS 26 Glow Effects === */
        .glow-cyan {
          text-shadow: 0 0 20px var(--cyan-glow), 0 0 40px var(--cyan-glow);
        }

        .glow-green {
          text-shadow: 0 0 20px var(--green-glow), 0 0 40px var(--green-glow);
        }

        /* === Tab Active Indicator === */
        .ios26-tab-active {
          background: linear-gradient(
            135deg,
            rgba(34, 211, 238, 0.25) 0%,
            rgba(34, 211, 238, 0.15) 100%
          );
          box-shadow:
            0 4px 16px rgba(34, 211, 238, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }

        /* === Row Style === */
        .ios26-row {
          border-radius: 12px;
          margin: 2px 0;
        }

        /* === Number Inputs === */
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

        /* === iOS 26 Background === */
        .ios26-app {
          background: linear-gradient(
            180deg,
            #0a0a0f 0%,
            #000000 50%,
            #050508 100%
          );
        }

        /* === Vibrancy Overlay === */
        .ios26-vibrancy {
          position: relative;
        }

        .ios26-vibrancy::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(
            ellipse at 50% 0%,
            rgba(34, 211, 238, 0.08) 0%,
            transparent 60%
          );
          pointer-events: none;
        }
      `}</style>

      {/* CLASSEMENT */}
      {selectedTab === 'classement' && (
        <div className="h-full flex flex-col ios26-vibrancy pb-14">
          <div className="px-2 pt-2 flex-shrink-0">
            <div className="ios26-header rounded-xl py-2 text-center">
              <h1 className="text-cyan-400 text-2xl font-extrabold tracking-widest glow-cyan">CLASSEMENT</h1>
            </div>
          </div>

          <div className="flex-1 px-2">

              {/* Selectors */}
              <div className="py-2 relative">
                <div className="flex items-stretch gap-3">
                  <div className="flex-1 relative">
                    <button
                      onClick={() => setIsChampOpen(!isChampOpen)}
                      className={`w-full h-12 ios26-btn rounded-xl px-4 text-white text-base font-semibold cursor-pointer flex items-center justify-between ${
                        isChampOpen ? 'border-cyan-500/50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{championships.find(c => c.id === selectedChampionship)?.icon}</span>
                        <span className="truncate">{championships.find(c => c.id === selectedChampionship)?.name}</span>
                      </div>
                      <svg className={`w-5 h-5 text-cyan-400 flex-shrink-0 ${isChampOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isChampOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsChampOpen(false)}></div>
                        <div className="absolute left-0 right-0 top-full mt-2 ios26-dropdown rounded-2xl z-50 max-h-64 overflow-y-auto">
                          {championships.map(champ => (
                            <button
                              key={champ.id}
                              onClick={() => {
                                setSelectedChampionship(champ.id);
                                setIsChampOpen(false);
                              }}
                              className={`w-full px-4 py-3 text-base font-semibold text-left flex items-center gap-3 ${
                                selectedChampionship === champ.id
                                  ? 'bg-cyan-500/20 text-cyan-400'
                                  : 'text-white hover:bg-white/10'
                              }`}
                            >
                              <span className="text-2xl">{champ.icon}</span>
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
                      className={`w-full h-12 ios26-btn rounded-xl px-4 text-white text-base font-semibold cursor-pointer flex items-center justify-between ${
                        isSeasonOpen ? 'border-cyan-500/50' : ''
                      }`}
                    >
                      <span>Saison {selectedSeason}</span>
                      <svg className={`w-5 h-5 text-cyan-400 flex-shrink-0 ${isSeasonOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isSeasonOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsSeasonOpen(false)}></div>
                        <div className="absolute right-0 top-full mt-2 ios26-dropdown rounded-2xl z-50 w-36 max-h-48 overflow-y-auto">
                          {seasons.map(season => (
                            <button
                              key={season}
                              onClick={() => handleSeasonSelect(season)}
                              className={`w-full px-4 py-3 text-base font-semibold text-left ${
                                selectedSeason === season
                                  ? 'bg-cyan-500/20 text-cyan-400'
                                  : 'text-white hover:bg-white/10'
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
              <div className="flex items-center gap-3 py-1.5">
                <span className="text-gray-400 text-sm font-bold min-w-[52px]">
                  J{seasonProgress.currentMatchday}/{seasonProgress.totalMatchdays}
                </span>
                <div className="flex-1 ios26-progress rounded-full h-2">
                  <div
                    className="ios26-progress-bar h-full rounded-full"
                    style={{ width: `${seasonProgress.percentage}%` }}
                  ></div>
                </div>
                <span className="text-cyan-400 text-sm font-bold glow-cyan min-w-[48px] text-right">{seasonProgress.percentage}%</span>
              </div>

              {/* Table Header */}
              <div className="grid grid-cols-12 gap-1 px-2 py-1.5 liquid-glass rounded-xl mt-1">
                <div className="col-span-1 text-gray-400 text-sm font-bold text-center">#</div>
                <div className="col-span-4 text-gray-400 text-sm font-bold text-left">CLUB</div>
                <div className="col-span-2 text-gray-400 text-sm font-bold text-center">PTS</div>
                <div className="col-span-2 text-gray-400 text-sm font-bold text-center">V-N-D</div>
                <div className="col-span-2 text-gray-400 text-sm font-bold text-center">BP:BC</div>
                <div className="col-span-1 text-gray-400 text-sm font-bold text-center">DIF</div>
              </div>

              {/* Teams List */}
              <div className="pb-0">
                {getSortedTeams().map((team) => (
                  <div
                    key={team.name}
                    className="grid grid-cols-12 gap-1 px-2 ios26-row items-center"
                    style={{ height: '42px' }}
                  >
                    <div className="col-span-1 flex items-center justify-center font-mono font-bold text-base text-cyan-400 glow-cyan">
                      {team.displayRank < 10 ? `0${team.displayRank}` : team.displayRank}
                    </div>
                    <div className="col-span-4 flex items-center">
                      <span className="text-white font-bold text-base">{team.name}</span>
                    </div>
                    <div className="col-span-2 text-center relative">
                      <span className="text-green-400 font-bold text-lg glow-green">{team.effectivePts}</span>
                      {getTeamPenalty(team.name) > 0 && (
                        <span className="text-orange-400 text-[9px] font-bold absolute -top-0.5 ml-0.5">*</span>
                      )}
                    </div>
                    <div className="col-span-2 text-center text-gray-300 text-sm font-medium">
                      {team.record}
                    </div>
                    <div className="col-span-2 text-center text-gray-300 text-sm font-medium">
                      {team.goalDiff}
                    </div>
                    <div className="col-span-1 text-center">
                      <span className={`text-sm font-bold ${String(team.diff || '').startsWith('+') ? 'text-green-400' : 'text-red-400'}`}>
                        {team.diff}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Section Pénalités - iOS 26 Style */}
                <div className="mt-1">
                  <div className="liquid-glass rounded-lg px-2 py-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap flex-1">
                        <span className="text-orange-400 text-xs font-bold">PÉNALITÉS</span>
                        {getTeamsWithPenalties().map(({ teamName, points }) => (
                          <div
                            key={teamName}
                            className="flex items-center gap-2 bg-orange-500/15 border border-orange-500/30 rounded-lg px-3 py-1"
                          >
                            <span className="text-white text-sm font-medium">{teamName}</span>
                            <span className="text-orange-400 text-sm font-bold">-{points}</span>
                            <button
                              onClick={() => handleRemovePenalty(teamName)}
                              className="text-gray-400 hover:text-red-400 ml-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setIsPenaltyModalOpen(true)}
                        className="ios26-btn rounded-xl px-4 py-2 text-orange-400 text-sm font-bold border-orange-500/30"
                      >
                        + Ajouter
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Pénalité - iOS 26 Style */}
              {isPenaltyModalOpen && (
                <>
                  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" onClick={() => setIsPenaltyModalOpen(false)}></div>
                  <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
                    <div className="ios26-modal rounded-3xl p-6 max-w-md w-full">
                      <div className="text-center mb-6">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-orange-500/20 flex items-center justify-center">
                          <span className="text-3xl">-</span>
                        </div>
                        <h3 className="text-orange-400 text-xl font-bold mb-1">AJOUTER UNE PÉNALITÉ</h3>
                        <p className="text-gray-400 text-sm">Retirer des points à une équipe</p>
                      </div>

                      {/* Sélection équipe */}
                      <div className="mb-4">
                        <label className="block text-gray-400 text-xs font-bold mb-2 tracking-wide">ÉQUIPE</label>
                        <div className="relative">
                          <button
                            onClick={() => setIsPenaltyTeamDropdownOpen(!isPenaltyTeamDropdownOpen)}
                            className="w-full ios26-btn rounded-xl px-4 py-3.5 text-white text-sm font-semibold cursor-pointer flex items-center justify-between"
                          >
                            <span className="truncate">{selectedPenaltyTeam || 'Sélectionner une équipe'}</span>
                            <svg className={`w-4 h-4 text-orange-400 flex-shrink-0 ml-2 ${isPenaltyTeamDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {isPenaltyTeamDropdownOpen && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setIsPenaltyTeamDropdownOpen(false)}></div>
                              <div className="absolute left-0 right-0 top-full mt-2 ios26-dropdown rounded-2xl z-50 max-h-48 overflow-y-auto">
                                {teams.map(team => (
                                  <button
                                    key={team.name}
                                    onClick={() => {
                                      setSelectedPenaltyTeam(team.name);
                                      setIsPenaltyTeamDropdownOpen(false);
                                    }}
                                    className={`w-full px-4 py-3 text-sm font-semibold text-left ${
                                      selectedPenaltyTeam === team.name
                                        ? 'bg-orange-500/20 text-orange-400'
                                        : 'text-white hover:bg-white/10'
                                    }`}
                                  >
                                    {team.name}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Points de pénalité */}
                      <div className="mb-6">
                        <label className="block text-gray-400 text-xs font-bold mb-2 tracking-wide">POINTS À RETIRER</label>
                        <input
                          type="number"
                          min="1"
                          value={penaltyPoints}
                          onChange={(e) => setPenaltyPoints(e.target.value)}
                          placeholder="Ex: 3"
                          className="w-full ios26-input rounded-xl px-4 py-3.5 text-white text-sm font-medium outline-none"
                        />
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setIsPenaltyModalOpen(false);
                            setSelectedPenaltyTeam('');
                            setPenaltyPoints('');
                          }}
                          className="flex-1 ios26-btn rounded-xl px-4 py-3.5 text-white text-sm font-semibold"
                        >
                          Annuler
                        </button>
                        <button
                          onClick={handleApplyPenalty}
                          disabled={!selectedPenaltyTeam || !penaltyPoints}
                          className="flex-1 bg-orange-500/20 border border-orange-500/50 hover:bg-orange-500/30 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl px-4 py-3.5 text-orange-400 text-sm font-bold"
                        >
                          Appliquer
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
          </div>
        </div>
      )}

      {/* MATCH */}
      {selectedTab === 'match' && (
        <div className="h-full flex flex-col ios26-vibrancy pb-14">
          <div className="px-2 pt-2 flex-shrink-0">
            <div className="ios26-header rounded-xl py-2 text-center">
              <h1 className="text-cyan-400 text-2xl font-extrabold tracking-widest glow-cyan">MATCHS</h1>
            </div>
          </div>

          <div className="flex-1 px-2">

              {/* Selectors */}
              <div className="py-2 flex-shrink-0 relative">
                <div className="flex items-stretch gap-3">
                  {/* Championship Dropdown */}
                  <div className="flex-1 relative">
                    <button
                      onClick={() => setIsChampOpen(!isChampOpen)}
                      className={`w-full h-12 ios26-btn rounded-xl px-4 text-white text-base font-semibold cursor-pointer flex items-center justify-between ${
                        isChampOpen ? 'border-cyan-500/50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{championships.find(c => c.id === selectedChampionship)?.icon}</span>
                        <span className="truncate">{championships.find(c => c.id === selectedChampionship)?.name}</span>
                      </div>
                      <svg className={`w-5 h-5 text-cyan-400 flex-shrink-0 ${isChampOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isChampOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsChampOpen(false)}></div>
                        <div className="absolute left-0 right-0 top-full mt-2 ios26-dropdown rounded-2xl z-50 max-h-48 overflow-y-auto">
                          {championships.filter(c => c.id !== 'hyenes').map(champ => (
                            <button
                              key={champ.id}
                              onClick={() => {
                                setSelectedChampionship(champ.id);
                                setIsChampOpen(false);
                              }}
                              className={`w-full px-4 py-3 text-base font-semibold text-left flex items-center gap-3 ${
                                selectedChampionship === champ.id
                                  ? 'bg-cyan-500/20 text-cyan-400'
                                  : 'text-white hover:bg-white/10'
                              }`}
                            >
                              <span className="text-2xl">{champ.icon}</span>
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
                      className={`w-full h-12 ios26-btn rounded-xl px-4 text-white text-base font-semibold cursor-pointer flex items-center justify-between ${
                        isSeasonOpen ? 'border-cyan-500/50' : ''
                      }`}
                    >
                      <span>Saison {selectedSeason}</span>
                      <svg className={`w-5 h-5 text-cyan-400 flex-shrink-0 ${isSeasonOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isSeasonOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsSeasonOpen(false)}></div>
                        <div className="absolute right-0 top-full mt-2 ios26-dropdown rounded-2xl z-50 w-36 max-h-48 overflow-y-auto">
                          {seasons.map(season => (
                            <button
                              key={season}
                              onClick={() => {
                                setSelectedSeason(season);
                                setIsSeasonOpen(false);
                              }}
                              className={`w-full px-4 py-3 text-base font-semibold text-left ${
                                selectedSeason === season
                                  ? 'bg-cyan-500/20 text-cyan-400'
                                  : 'text-white hover:bg-white/10'
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

              {/* Navigation Journée - iOS 26 Style */}
              <div className="py-1.5 flex-shrink-0">
                <div className="flex items-center gap-2 px-1">
                  <button
                    onClick={() => {
                      const currentIdx = journees.indexOf(selectedJournee);
                      if (currentIdx > 0) setSelectedJournee(journees[currentIdx - 1]);
                    }}
                    className="w-11 h-11 flex items-center justify-center text-cyan-400 ios26-btn rounded-xl disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                    disabled={selectedJournee === '1'}
                  >
                    <span className="text-base font-bold">◀</span>
                  </button>
                  <div className="flex-1 liquid-glass rounded-xl px-4 py-2 flex items-center justify-center gap-2">
                    <span className="text-gray-400 text-base font-medium">Journée</span>
                    <span className="text-cyan-400 text-xl font-bold glow-cyan">{selectedJournee}</span>
                    <span className="text-gray-500 text-base">/</span>
                    <span className="text-gray-400 text-base">{journees.length}</span>
                  </div>
                  <button
                    onClick={() => {
                      const currentIdx = journees.indexOf(selectedJournee);
                      if (currentIdx < journees.length - 1) setSelectedJournee(journees[currentIdx + 1]);
                    }}
                    className="w-11 h-11 flex items-center justify-center text-cyan-400 ios26-btn rounded-xl disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                    disabled={selectedJournee === journees[journees.length - 1]}
                  >
                    <span className="text-base font-bold">▶</span>
                  </button>
                </div>
              </div>

              {/* Matches List */}
              <div className="mt-1">
                {/* Header */}
                <div className="grid grid-cols-12 gap-1 py-2 liquid-glass rounded-xl">
                  <div className="col-span-5 text-center text-gray-400 text-sm font-bold tracking-wide">
                    DOMICILE
                  </div>
                  <div className="col-span-2 text-center text-gray-400 text-sm font-bold tracking-wide">
                    SCORE
                  </div>
                  <div className="col-span-5 text-center text-gray-400 text-sm font-bold tracking-wide">
                    EXTÉRIEUR
                  </div>
                </div>

                <div className="space-y-1 mt-1">
                  {matches.map((match, index) => (
                    <div
                      key={match.id}
                      className="grid grid-cols-12 items-center gap-0.5 py-1.5 px-0.5 ios26-row"
                    >
                      {/* Home Team */}
                      <div className="col-span-5 relative flex justify-start">
                          <button
                            onClick={(e) => toggleDropdown(match.id, 'home', e)}
                            className={`w-full max-w-[135px] rounded-xl px-2.5 py-2 flex items-center justify-between group cursor-pointer ${
                              match.homeTeam && match.awayTeam && match.homeScore !== null && match.awayScore !== null
                                ? 'bg-emerald-500/15 border border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                                : 'ios26-btn'
                            }`}
                          >
                            <span className="text-white text-sm font-semibold leading-tight text-left flex-1 pr-1 truncate">{match.homeTeam || '────────'}</span>
                            <svg className={`w-3.5 h-3.5 flex-shrink-0 ${
                              match.homeTeam && match.awayTeam && match.homeScore !== null && match.awayScore !== null
                                ? 'text-emerald-400'
                                : 'text-gray-500 group-hover:text-cyan-400'
                            }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {openDropdown?.matchId === match.id && openDropdown?.type === 'home' && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)}></div>
                              <div
                                className="fixed ios26-dropdown rounded-2xl z-50 max-h-[420px] overflow-y-auto w-[150px] "
                                style={{
                                  top: `${dropdownPosition.top}px`,
                                  left: dropdownPosition.left !== 'auto' ? `${dropdownPosition.left}px` : 'auto',
                                  right: dropdownPosition.right !== 'auto' ? `${dropdownPosition.right}px` : 'auto'
                                }}
                              >
                                <button
                                  onClick={() => handleTeamSelect(match.id, 'home', '')}
                                  className="w-full px-4 py-3 text-sm font-semibold text-left flex items-center text-white hover:bg-white/10 whitespace-nowrap"
                                >
                                  Aucune équipe
                                </button>
                                {getAvailableTeams(match.id, 'home').map(team => (
                                  <button
                                    key={team}
                                    onClick={() => handleTeamSelect(match.id, 'home', team)}
                                    className="w-full px-4 py-3 text-sm font-semibold text-left flex items-center text-white hover:bg-white/10 whitespace-nowrap"
                                  >
                                    {team}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                      </div>

                      {/* Scores */}
                      <div className="col-span-2 flex items-center justify-center gap-0.5">
                          <input
                            type="number"
                            value={match.homeScore !== null ? match.homeScore : ''}
                            onChange={(e) => {
                              const value = e.target.value === '' ? null : parseInt(e.target.value);
                              const updatedMatches = matches.map(m => m.id === match.id ? { ...m, homeScore: value } : m);
                              setMatches(updatedMatches);
                              syncMatchesToAppData(updatedMatches);
                            }}
                            placeholder="-"
                            className={`rounded-xl w-9 h-9 text-center text-base font-bold outline-none ${
                              match.homeTeam && match.awayTeam && match.homeScore !== null && match.awayScore !== null
                                ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-500/10'
                                : 'ios26-input text-cyan-400'
                            }`}
                          />
                          <span className="text-gray-500 font-bold text-sm px-0">-</span>
                          <input
                            type="number"
                            value={match.awayScore !== null ? match.awayScore : ''}
                            onChange={(e) => {
                              const value = e.target.value === '' ? null : parseInt(e.target.value);
                              const updatedMatches = matches.map(m => m.id === match.id ? { ...m, awayScore: value } : m);
                              setMatches(updatedMatches);
                              syncMatchesToAppData(updatedMatches);
                            }}
                            placeholder="-"
                            className={`rounded-xl w-9 h-9 text-center text-base font-bold outline-none ${
                              match.homeTeam && match.awayTeam && match.homeScore !== null && match.awayScore !== null
                                ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-500/10'
                                : 'ios26-input text-cyan-400'
                            }`}
                          />
                      </div>

                      {/* Away Team */}
                      <div className="col-span-5 relative flex justify-end">
                          <button
                            onClick={(e) => toggleDropdown(match.id, 'away', e)}
                            className={`w-full max-w-[135px] rounded-xl px-2.5 py-2 flex items-center justify-between group cursor-pointer ${
                              match.homeTeam && match.awayTeam && match.homeScore !== null && match.awayScore !== null
                                ? 'bg-emerald-500/15 border border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                                : 'ios26-btn'
                            }`}
                          >
                            <span className="text-white text-sm font-semibold leading-tight text-left flex-1 pr-1 truncate">{match.awayTeam || '────────'}</span>
                            <svg className={`w-3.5 h-3.5 flex-shrink-0 ${
                              match.homeTeam && match.awayTeam && match.homeScore !== null && match.awayScore !== null
                                ? 'text-emerald-400'
                                : 'text-gray-500 group-hover:text-cyan-400'
                            }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {openDropdown?.matchId === match.id && openDropdown?.type === 'away' && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)}></div>
                              <div
                                className="fixed ios26-dropdown rounded-2xl z-50 max-h-[420px] overflow-y-auto w-[150px] "
                                style={{
                                  top: `${dropdownPosition.top}px`,
                                  left: dropdownPosition.left !== 'auto' ? `${dropdownPosition.left}px` : 'auto',
                                  right: dropdownPosition.right !== 'auto' ? `${dropdownPosition.right}px` : 'auto'
                                }}
                              >
                                <button
                                  onClick={() => handleTeamSelect(match.id, 'away', '')}
                                  className="w-full px-4 py-3 text-sm font-semibold text-left flex items-center text-white hover:bg-white/10 whitespace-nowrap"
                                >
                                  Aucune équipe
                                </button>
                                {getAvailableTeams(match.id, 'away').map(team => (
                                  <button
                                    key={team}
                                    onClick={() => handleTeamSelect(match.id, 'away', team)}
                                    className="w-full px-4 py-3 text-sm font-semibold text-left flex items-center text-white hover:bg-white/10 whitespace-nowrap"
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

                {/* Section Exempt - iOS 26 Style */}
                <div className="mt-3 pt-2">
                  <div className="liquid-glass rounded-xl p-3">
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-gray-300 text-base font-semibold">Exempt :</span>
                      <div className="relative w-48">
                        <button
                          onClick={() => setIsTeamDropdownOpen(!isTeamDropdownOpen)}
                          className="w-full bg-red-500/15 border border-red-500/30 hover:bg-red-500/20 rounded-xl px-4 py-2.5 text-white text-base font-semibold cursor-pointer flex items-center justify-between backdrop-blur-sm"
                        >
                          <span className="truncate">{exemptTeam || 'Aucune'}</span>
                          <svg className={`w-4 h-4 text-red-400 flex-shrink-0 ml-2 ${isTeamDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {isTeamDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsTeamDropdownOpen(false)}></div>
                            <div className="absolute left-0 right-0 top-full mt-2 ios26-dropdown rounded-2xl z-50 max-h-[420px] overflow-y-auto ">
                              <button
                                onClick={() => {
                                  setExemptTeam('');
                                  setIsTeamDropdownOpen(false);
                                }}
                                className="w-full px-4 py-3 text-base font-semibold text-left text-white hover:bg-white/10"
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
                                  className="w-full px-4 py-3 text-base font-semibold text-left text-white hover:bg-white/10"
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
        <div className="h-full flex flex-col ios26-vibrancy overflow-y-auto pb-16">
          <div className="px-2 pt-2 flex-shrink-0">
            <div className="ios26-header rounded-xl py-2 text-center">
              <h1 className="text-cyan-400 text-2xl font-extrabold tracking-widest glow-cyan">PALMARÈS</h1>
            </div>
          </div>

          <div className="flex-1 px-2">

              {/* Championship Buttons - iOS 26 Style */}
              <div className="py-2 flex-shrink-0 px-1">
                <div className="flex items-center justify-between">
                  {championships.map(champ => (
                    <button
                      key={champ.id}
                      onClick={() => setSelectedChampionship(champ.id)}
                      className={`w-12 h-12 flex items-center justify-center rounded-xl text-2xl ${
                        selectedChampionship === champ.id
                          ? 'ios26-tab-active scale-110'
                          : 'ios26-btn hover:scale-105'
                      }`}
                    >
                      {champ.icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table Header */}
              <div className="grid grid-cols-12 gap-1 px-2 py-2 liquid-glass rounded-xl mt-1 flex-shrink-0">
                <div className="col-span-3 text-gray-400 text-sm font-bold tracking-widest text-center">SAISON</div>
                <div className="col-span-6 text-gray-400 text-sm font-bold tracking-widest text-center">CHAMPION</div>
                <div className="col-span-3 text-gray-400 text-sm font-bold tracking-widest text-center">POINTS</div>
              </div>

              {/* Champions List */}
              <div className="pb-0 mt-1">
                {champions.map((champion, index) => (
                  <div
                    key={champion.season}
                    className="grid grid-cols-12 gap-1 px-2 py-0 ios26-row items-center"
                    style={{ height: '48px' }}
                  >
                    <div className="col-span-3 flex justify-center">
                      <span className="text-cyan-400 text-lg font-bold glow-cyan">{champion.season}</span>
                    </div>
                    <div className="col-span-6 text-center">
                      <span className="text-white text-base font-bold tracking-wide">{champion.team}</span>
                    </div>
                    <div className="col-span-3 text-center">
                      <span className="text-green-400 text-base font-bold glow-green">{champion.points}</span>
                      <span className="text-gray-400 text-sm ml-1">pts</span>
                    </div>
                  </div>
                ))}
              </div>
          </div>
        </div>
      )}

      {/* PANTHEON */}
      {selectedTab === 'pantheon' && (
        <div className="h-full flex flex-col ios26-vibrancy pb-14">
          <div className="px-2 pt-2 flex-shrink-0">
            <div className="ios26-header rounded-xl py-2 text-center">
              <h1 className="text-cyan-400 text-2xl font-extrabold tracking-widest glow-cyan">PANTHÉON</h1>
            </div>
          </div>

          <div className="flex-1 px-2">

              {/* Table Header */}
              <div className="py-2 px-2 liquid-glass rounded-xl mt-2 flex-shrink-0">
                <div className="grid grid-cols-12 gap-0.5 items-center">
                  <div className="col-span-1 flex justify-center text-gray-400 text-sm font-bold tracking-widest">#</div>
                  <div className="col-span-4 flex items-center text-left pl-1 text-gray-400 text-sm font-bold tracking-widest">ÉQUIPE</div>
                  <div className="col-span-1 flex justify-center text-gray-400 text-sm font-bold tracking-widest">
                    <div className="text-lg">🏆</div>
                  </div>
                  <div className="col-span-1 flex justify-center text-gray-400 text-sm font-bold tracking-widest">
                    <div className="text-lg">🇫🇷</div>
                  </div>
                  <div className="col-span-1 flex justify-center text-gray-400 text-sm font-bold tracking-widest">
                    <div className="text-lg">🇪🇸</div>
                  </div>
                  <div className="col-span-1 flex justify-center text-gray-400 text-sm font-bold tracking-widest">
                    <div className="text-lg">🇮🇹</div>
                  </div>
                  <div className="col-span-1 flex justify-center text-gray-400 text-sm font-bold tracking-widest">
                    <div className="text-lg">🏴󠁧󠁢󠁥󠁮󠁧󠁿</div>
                  </div>
                  <div className="col-span-2 flex justify-center text-gray-400 text-sm font-bold tracking-widest">TOTAL</div>
                </div>
              </div>

              {/* Teams List */}
              <div className="pb-0 mt-1">
                {pantheonTeams.map((team, index) => (
                  <div
                    key={team.rank}
                    className="py-0 px-2 ios26-row"
                    style={{ height: '42px' }}
                  >
                    <div className="grid grid-cols-12 gap-0.5 items-center w-full h-full">
                      <div className="col-span-1 flex items-center justify-center font-mono font-bold text-base text-cyan-400 glow-cyan">
                        {team.rank < 10 ? `0${team.rank}` : team.rank}
                      </div>
                      <div className="col-span-4 flex items-center text-left pl-1">
                        <span className="text-white text-base font-bold tracking-tight">{team.name}</span>
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <span className="text-gray-300 text-base font-medium">{team.trophies}</span>
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <span className="text-gray-300 text-base font-medium">{team.france}</span>
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <span className="text-gray-300 text-base font-medium">{team.spain}</span>
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <span className="text-gray-300 text-base font-medium">{team.italy}</span>
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        <span className="text-gray-300 text-base font-medium">{team.england}</span>
                      </div>
                      <div className="col-span-2 flex items-center justify-center">
                        <span className="text-green-400 text-lg font-bold glow-green">{team.total}</span>
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
        <div className="h-full flex flex-col ios26-vibrancy pb-14">
          <div className="px-2 pt-2 flex-shrink-0">
            <div className="ios26-header rounded-xl py-2 text-center">
              <h1 className="text-cyan-400 text-2xl font-extrabold tracking-widest glow-cyan">RÉGLAGES</h1>
            </div>
          </div>

          <div className="flex-1 px-2">
            <div className="space-y-2 mt-2">

              {/* Sauvegarde - iOS 26 Card */}
              <div className="ios26-card rounded-xl p-3">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-cyan-500/20 flex items-center justify-center backdrop-blur-sm">
                    <span className="text-xl">💾</span>
                  </div>
                  <h2 className="text-cyan-400 text-base font-bold tracking-wide">SAUVEGARDE</h2>
                </div>
                <div className="space-y-2">
                  <button
                    onClick={handleExportJSON}
                    className="w-full ios26-btn rounded-xl px-4 py-2.5 text-white text-base font-semibold flex items-center justify-between group"
                  >
                    <span className="group-hover:text-cyan-400">Exporter (JSON)</span>
                    <span className="text-lg group-hover:scale-110">📥</span>
                  </button>
                  <button
                    onClick={handleImportJSON}
                    className="w-full ios26-btn rounded-xl px-4 py-2.5 text-white text-base font-semibold flex items-center justify-between group"
                  >
                    <span className="group-hover:text-cyan-400">Importer (JSON)</span>
                    <span className="text-lg group-hover:scale-110">📤</span>
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

              {/* Supabase - iOS 26 Card */}
              <div className="ios26-card rounded-xl p-3" style={{ borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center backdrop-blur-sm">
                    <span className="text-xl">☁️</span>
                  </div>
                  <h2 className="text-blue-400 text-base font-bold tracking-wide">SUPABASE</h2>
                  {isLoadingFromSupabase && (
                    <span className="text-xs text-blue-300 animate-pulse">Chargement...</span>
                  )}
                </div>
                <div className="space-y-2">
                  <button
                    onClick={handleSaveToSupabase}
                    disabled={isSavingToSupabase || (!pendingJsonData && !appData)}
                    className={`w-full ios26-btn rounded-xl px-4 py-2.5 text-white text-base font-semibold flex items-center justify-between group ${
                      isSavingToSupabase ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    style={{ borderColor: 'rgba(59, 130, 246, 0.2)' }}
                  >
                    <span className="group-hover:text-blue-400">
                      {isSavingToSupabase ? 'Sauvegarde en cours...' : 'Sauvegarder vers Supabase'}
                    </span>
                    <span className="text-lg group-hover:scale-110">{isSavingToSupabase ? '⏳' : '☁️'}</span>
                  </button>
                  {pendingJsonData && (
                    <p className="text-xs text-blue-300 text-center">
                      Données JSON en attente de sauvegarde
                    </p>
                  )}
                  {supabaseError && (
                    <p className="text-xs text-red-400 text-center">
                      Erreur: {supabaseError}
                    </p>
                  )}
                </div>
              </div>

              {/* Données - iOS 26 Card */}
              <div className="ios26-card rounded-xl p-3" style={{ borderColor: 'rgba(34, 197, 94, 0.2)' }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-green-500/20 flex items-center justify-center backdrop-blur-sm">
                    <span className="text-xl">🔄</span>
                  </div>
                  <h2 className="text-green-400 text-base font-bold tracking-wide">DONNÉES</h2>
                </div>
                <button
                  onClick={handleRefreshData}
                  className="w-full ios26-btn rounded-xl px-4 py-2.5 text-white text-base font-semibold flex items-center justify-between group"
                  style={{ borderColor: 'rgba(34, 197, 94, 0.2)' }}
                >
                  <span className="group-hover:text-green-400">Actualiser l'affichage</span>
                  <span className="text-lg group-hover:rotate-180">🔄</span>
                </button>
              </div>

              {/* Nouvelle Saison - iOS 26 Card */}
              <div className="ios26-card rounded-xl p-3" style={{ borderColor: 'rgba(168, 85, 247, 0.2)' }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center backdrop-blur-sm">
                    <span className="text-xl font-bold text-purple-400">+</span>
                  </div>
                  <h2 className="text-purple-400 text-base font-bold tracking-wide">NOUVELLE SAISON</h2>
                </div>
                <div className="space-y-2">
                  <div className="flex gap-3">
                    <input
                      type="number"
                      value={newSeasonNumber}
                      onChange={(e) => setNewSeasonNumber(e.target.value)}
                      placeholder="N° (ex: 11)"
                      min="1"
                      className="flex-1 ios26-input rounded-xl px-4 py-2.5 text-white text-base font-medium outline-none placeholder-gray-500"
                      style={{ borderColor: 'rgba(168, 85, 247, 0.2)' }}
                    />
                    <button
                      onClick={handleCreateSeason}
                      className="bg-purple-500/20 border border-purple-500/30 hover:bg-purple-500/30 rounded-xl px-4 py-2.5 text-purple-400 text-base font-bold"
                    >
                      Créer
                    </button>
                  </div>
                  {seasons.length > 0 && (
                    <p className="text-gray-500 text-sm font-medium">
                      Saisons : {seasons.map(s => `S${s}`).join(', ')}
                    </p>
                  )}
                </div>
              </div>

              {/* Système - iOS 26 Card */}
              <div className="ios26-card rounded-xl p-3" style={{ borderColor: 'rgba(239, 68, 68, 0.2)', background: 'linear-gradient(145deg, rgba(239, 68, 68, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%)' }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center backdrop-blur-sm">
                    <span className="text-xl">⚠️</span>
                  </div>
                  <h2 className="text-red-400 text-base font-bold tracking-wide">SYSTÈME</h2>
                </div>
                <button
                  onClick={() => setShowResetModal(true)}
                  className="w-full bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 rounded-xl px-4 py-2.5 text-red-400 text-base font-bold flex items-center justify-between group"
                >
                  <span className="group-hover:text-red-300">Réinitialiser</span>
                  <span className="text-lg group-hover:scale-110">🗑️</span>
                </button>
              </div>
            </div>
          </div>

          {/* Modal Reset - iOS 26 Style */}
          {showResetModal && (
            <>
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" onClick={() => setShowResetModal(false)}></div>
              <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
                <div className="ios26-modal rounded-3xl p-6 max-w-md w-full ">
                  <div className="text-center mb-6">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-red-500/20 flex items-center justify-center">
                      <span className="text-5xl">⚠️</span>
                    </div>
                    <h3 className="text-red-400 text-xl font-bold mb-2">ATTENTION</h3>
                    <p className="text-gray-400 text-sm">Cette action est irréversible.</p>
                  </div>
                  <div className="mb-6">
                    <input
                      type="text"
                      value={resetConfirmation}
                      onChange={(e) => setResetConfirmation(e.target.value)}
                      placeholder="Tapez SUPPRIMER"
                      className="w-full ios26-input rounded-xl px-4 py-3.5 text-white text-sm font-medium outline-none"
                      style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setShowResetModal(false); setResetConfirmation(''); }}
                      className="flex-1 ios26-btn rounded-xl px-4 py-3.5 text-white text-sm font-semibold"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleReset}
                      className="flex-1 bg-red-500/20 border border-red-500/50 hover:bg-red-500/30 rounded-xl px-4 py-3.5 text-red-400 text-sm font-bold "
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
        <div className="h-full flex flex-col items-center justify-center ios26-vibrancy">
          <div className=" text-center">
            <div className="w-24 h-24 mx-auto mb-6 rounded-3xl liquid-glass-intense flex items-center justify-center">
              <span className="text-5xl">📊</span>
            </div>
            <h2 className="text-cyan-400 text-2xl font-extrabold glow-cyan">STATISTIQUES</h2>
            <p className="text-gray-400 text-sm mt-3 font-medium">Bientôt disponible</p>
          </div>
        </div>
      )}

      {/* Bottom Navigation - iOS 26 Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-2 pt-1" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        <div className="ios26-tabbar rounded-[20px] max-w-screen-xl mx-auto overflow-hidden">
          <div className="flex justify-around items-center px-1 py-1.5">
            <button
              onClick={() => setSelectedTab('classement')}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 min-w-[48px] ${
                selectedTab === 'classement'
                  ? 'ios26-tab-active text-cyan-400 scale-105'
                  : 'text-gray-500 hover:text-gray-400 active:scale-95'
              }`}
            >
              <div className="text-lg">{selectedTab === 'classement' ? '🏆' : '🏆'}</div>
              <span className="text-[10px] font-bold tracking-wide">Classement</span>
            </button>
            <button
              onClick={() => setSelectedTab('match')}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 min-w-[48px] ${
                selectedTab === 'match'
                  ? 'ios26-tab-active text-cyan-400 scale-105'
                  : 'text-gray-500 hover:text-gray-400 active:scale-95'
              }`}
            >
              <div className="text-lg">📅</div>
              <span className="text-[10px] font-bold tracking-wide">Match</span>
            </button>
            <button
              onClick={() => setSelectedTab('palmares')}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 min-w-[48px] ${
                selectedTab === 'palmares'
                  ? 'ios26-tab-active text-cyan-400 scale-105'
                  : 'text-gray-500 hover:text-gray-400 active:scale-95'
              }`}
            >
              <div className="text-lg">🎯</div>
              <span className="text-[10px] font-bold tracking-wide">Palmarès</span>
            </button>
            <button
              onClick={() => setSelectedTab('pantheon')}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 min-w-[48px] ${
                selectedTab === 'pantheon'
                  ? 'ios26-tab-active text-cyan-400 scale-105'
                  : 'text-gray-500 hover:text-gray-400 active:scale-95'
              }`}
            >
              <div className="text-lg">🏅</div>
              <span className="text-[10px] font-bold tracking-wide">Panthéon</span>
            </button>
            <button
              onClick={() => setSelectedTab('stats')}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 min-w-[48px] ${
                selectedTab === 'stats'
                  ? 'ios26-tab-active text-cyan-400 scale-105'
                  : 'text-gray-500 hover:text-gray-400 active:scale-95'
              }`}
            >
              <div className="text-lg">📊</div>
              <span className="text-[10px] font-bold tracking-wide">Stats</span>
            </button>
            <button
              onClick={() => setSelectedTab('reglages')}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 min-w-[48px] ${
                selectedTab === 'reglages'
                  ? 'ios26-tab-active text-cyan-400 scale-105'
                  : 'text-gray-500 hover:text-gray-400 active:scale-95'
              }`}
            >
              <div className="text-lg">⚙️</div>
              <span className="text-[10px] font-bold tracking-wide">Réglages</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
