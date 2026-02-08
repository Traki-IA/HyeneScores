import { useState, useRef, useEffect, useCallback } from 'react';
import { fetchAppData, importFromJSON, signIn, signOut, getSession, onAuthStateChange, checkIsAdmin, saveManager, saveMatches, deleteManager, updateManagerName, saveSeason, savePenalty, deletePenalty, updateSeasonExempt, saveChampion, updatePantheon } from './lib/supabase';

// === CONSTANTES DE CONFIGURATION ===
const MAX_SCORE = 99;
const MIN_SCORE = 0;
const MAX_MANAGER_NAME_LENGTH = 50;
const MANAGER_NAME_PATTERN = /^[\p{L}\p{N}\s\-'.]+$/u; // Lettres, chiffres, espaces, tirets, apostrophes, points
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const AUTOSAVE_DEBOUNCE_MS = 800;
const AUTO_REFRESH_INTERVAL_MS = 30 * 1000; // 30 secondes
const SUPABASE_PAGE_SIZE = 1000;
const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const HYENES_MATCHDAYS = 72;
const STANDARD_MATCHDAYS = 18;
const HYENES_S6_MATCHDAYS = 62;
const FRANCE_S6_MATCHDAYS = 8;
const MATCHES_PER_MATCHDAY = 5;

// Constantes extraites au niveau module (évite les recréations à chaque render)
const CHAMPIONSHIPS = [
  { id: 'hyenes', icon: '🏆', name: 'Ligue des Hyènes' },
  { id: 'france', icon: '🇫🇷', name: 'France' },
  { id: 'spain', icon: '🇪🇸', name: 'Espagne' },
  { id: 'italy', icon: '🇮🇹', name: 'Italie' },
  { id: 'england', icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', name: 'Angleterre' }
];

const CHAMPIONSHIP_MAPPING = {
  'hyenes': 'ligue_hyenes',
  'france': 'france',
  'spain': 'espagne',
  'italy': 'italie',
  'england': 'angleterre'
};

const REVERSE_CHAMPIONSHIP_MAPPING = Object.fromEntries(
  Object.entries(CHAMPIONSHIP_MAPPING).map(([k, v]) => [v, k])
);

const DEFAULT_MATCHES = [
  { id: 1, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null },
  { id: 2, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null },
  { id: 3, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null },
  { id: 4, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null },
  { id: 5, homeTeam: '', awayTeam: '', homeScore: null, awayScore: null }
];

// Normalise un objet match brut vers un format uniforme
function normalizeMatch(match) {
  return {
    homeTeam: match.homeTeam || match.home || match.h || match.equipe1 || '',
    awayTeam: match.awayTeam || match.away || match.a || match.equipe2 || '',
    homeScore: match.homeScore !== undefined ? match.homeScore :
               (match.hs !== undefined ? match.hs :
               (match.scoreHome !== undefined ? match.scoreHome : null)),
    awayScore: match.awayScore !== undefined ? match.awayScore :
               (match.as !== undefined ? match.as :
               (match.scoreAway !== undefined ? match.scoreAway : null))
  };
}

/**
 * Calcule les statistiques d'un ensemble de matchs pour chaque équipe.
 * Fonction utilitaire partagée pour éviter la duplication du calcul standings.
 * @param {Array} matchBlocks - Blocs de matchs [{games: [...], ...}]
 * @param {string[]} teamList - Liste des noms d'équipes
 * @returns {Object} teamStats - { teamName: { name, pts, j, g, n, p, bp, bc, diff } }
 */
function calculateTeamStats(matchBlocks, teamList) {
  const teamStats = {};
  teamList.forEach(team => {
    teamStats[team] = { name: team, pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0 };
  });

  matchBlocks.forEach(matchBlock => {
    if (!matchBlock.games || !Array.isArray(matchBlock.games)) return;

    matchBlock.games.forEach(match => {
      const { homeTeam: home, awayTeam: away, homeScore: hs, awayScore: as2 } = normalizeMatch(match);

      if (hs === null || hs === undefined || as2 === null || as2 === undefined) return;

      const homeScore = parseInt(hs);
      const awayScore = parseInt(as2);

      if (isNaN(homeScore) || isNaN(awayScore)) return;
      if (!teamStats[home]) teamStats[home] = { name: home, pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0 };
      if (!teamStats[away]) teamStats[away] = { name: away, pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0 };

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
    });
  });

  return teamStats;
}

/**
 * Trie les équipes par points effectifs (pts - pénalité), diff de buts, puis buts marqués.
 * @param {Object} teamStats - Résultat de calculateTeamStats
 * @param {Function} getPenalty - (teamName) => number de points de pénalité
 * @returns {Array} Classement trié [{pos, mgr, pts, j, g, n, p, bp, bc, diff}, ...]
 */
function sortTeamsToStandings(teamStats, getPenalty = () => 0) {
  return Object.values(teamStats)
    .filter(team => team.j > 0)
    .map(team => ({
      ...team,
      penalty: getPenalty(team.name),
      effectivePts: team.pts - getPenalty(team.name)
    }))
    .sort((a, b) => {
      if (b.effectivePts !== a.effectivePts) return b.effectivePts - a.effectivePts;
      if (b.diff !== a.diff) return b.diff - a.diff;
      return b.bp - a.bp;
    })
    .map((team, index) => ({
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
}

export default function HyeneScores() {
  const [selectedTab, setSelectedTab] = useState('classement');
  const fileInputRef = useRef(null);

  // États Authentification
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // États Supabase
  const [isLoadingFromSupabase, setIsLoadingFromSupabase] = useState(true);
  const [supabaseError, setSupabaseError] = useState(null);
  const [isSavingToSupabase, setIsSavingToSupabase] = useState(false);
  const [pendingJsonData, setPendingJsonData] = useState(null);
  const [isCreatingSeason, setIsCreatingSeason] = useState(false);

  // États Classement
  const [selectedChampionship, setSelectedChampionship] = useState('hyenes');
  const [selectedSeason, setSelectedSeason] = useState('');
  const [isSeasonOpen, setIsSeasonOpen] = useState(false);
  const [isChampOpen, setIsChampOpen] = useState(false);

  // Alias pour compatibilité avec le JSX existant
  const championships = CHAMPIONSHIPS;

  const [teams, setTeams] = useState([]);

  // États Palmarès
  const [champions, setChampions] = useState([]);

  // États Panthéon
  const [pantheonTeams, setPantheonTeams] = useState([]);

  // États Match
  const [selectedJournee, setSelectedJournee] = useState('1');
  const [isJourneeOpen, setIsJourneeOpen] = useState(false);
  const [matches, setMatches] = useState(DEFAULT_MATCHES);

  const [allTeams, setAllTeams] = useState([]);

  const [openDropdown, setOpenDropdown] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, right: 'auto' });
  const [exemptTeam, setExemptTeam] = useState('');
  const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);
  const skipNextMatchesLoadRef = useRef(false);
  const skipNextExemptLoadRef = useRef(false);
  const saveMatchesTimeoutRef = useRef(null);

  const [seasons, setSeasons] = useState([]);

  // Nombre de journées dynamique selon le championnat
  const getJourneesForChampionship = (championship) => {
    const count = championship === 'hyenes' ? HYENES_MATCHDAYS : STANDARD_MATCHDAYS;
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

  // États pour la gestion des Managers
  const [newManagerName, setNewManagerName] = useState('');
  const [isAddingManager, setIsAddingManager] = useState(false);
  const [managerError, setManagerError] = useState('');
  const [editingManagerId, setEditingManagerId] = useState(null);
  const [editingManagerName, setEditingManagerName] = useState('');
  const [isEditingManager, setIsEditingManager] = useState(false);

  // Fonction pour charger les données depuis appData v2.0
  const loadDataFromAppData = useCallback((data, championship, season, journee, currentPenalties = {}, isAdminUser = false) => {
    if (!data || !data.entities) return;

    // Fonction locale pour obtenir la pénalité d'une équipe
    const getTeamPenaltyLocal = (teamName, champ, seas) => {
      const key = `${champ}_${seas}_${teamName}`;
      return currentPenalties[key] || 0;
    };

    // Extraire teams[] depuis entities.seasons
    // Mapper les IDs de championnat vers les clés du fichier v2.0
    const championshipKey = CHAMPIONSHIP_MAPPING[championship] || championship;
    const seasonKey = `${championshipKey}_s${season}`;

    // === Résolution de l'équipe exemptée depuis la table seasons ===
    if (!skipNextExemptLoadRef.current) {
      let resolvedExempt = '';

      // Lire l'exempt depuis entities.seasons (source unique de vérité)
      if (data.entities.seasons) {
        const currentSeason = data.entities.seasons[seasonKey];
        if (currentSeason?.exemptTeam) {
          resolvedExempt = currentSeason.exemptTeam;
        } else {
          // Hériter depuis n'importe quel championnat de la même saison
          const anySeasonEntry = Object.values(data.entities.seasons).find(
            s => s.season === parseInt(season) && s.exemptTeam
          );
          if (anySeasonEntry) {
            resolvedExempt = anySeasonEntry.exemptTeam;
          }
        }
      }

      // Override legacy (indexes.exemptTeams)
      if (data.indexes?.exemptTeams?.[season]) {
        resolvedExempt = data.indexes.exemptTeams[season];
      }

      setExemptTeam(resolvedExempt);
    } else {
      skipNextExemptLoadRef.current = false;
    }

    // === CAS SPÉCIAL: LIGUE DES HYÈNES ===
    // La Ligue des Hyènes n'a pas de matchs propres - c'est une agrégation des 4 championnats
    if (championship === 'hyenes' || championshipKey === 'ligue_hyenes') {

      // Les 4 championnats à agréger
      const euroChampionships = ['france', 'espagne', 'italie', 'angleterre'];

      // Récupérer la liste des managers
      const managerList = data.entities.managers
        ? Object.values(data.entities.managers).map(m => m.name || '?').filter(n => n !== '?')
        : [];

      // Initialiser les stats agrégées pour chaque manager
      const aggregatedStats = {};
      managerList.forEach(mgr => {
        aggregatedStats[mgr] = {
          name: mgr,
          pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0,
          // Détail par championnat pour affichage
          details: { france: 0, espagne: 0, italie: 0, angleterre: 0 }
        };
      });

      // Parcourir chaque championnat européen
      euroChampionships.forEach(euroChamp => {
        const euroMatches = (data.entities.matches || []).filter(
          block => block.championship?.toLowerCase() === euroChamp.toLowerCase() &&
                   block.season === parseInt(season)
        );

        // Calculer les stats de ce championnat
        const champStats = {};
        managerList.forEach(mgr => {
          champStats[mgr] = { pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0 };
        });

        euroMatches.forEach(matchBlock => {
          if (matchBlock.games && Array.isArray(matchBlock.games)) {
            matchBlock.games.forEach(match => {
              const { homeTeam: home, awayTeam: away, homeScore: hs, awayScore: as2 } = normalizeMatch(match);

              if (hs !== null && as2 !== null && champStats[home] && champStats[away]) {
                const homeScore = parseInt(hs);
                const awayScore = parseInt(as2);

                if (!isNaN(homeScore) && !isNaN(awayScore)) {
                  champStats[home].j++;
                  champStats[away].j++;
                  champStats[home].bp += homeScore;
                  champStats[home].bc += awayScore;
                  champStats[away].bp += awayScore;
                  champStats[away].bc += homeScore;

                  if (homeScore > awayScore) {
                    champStats[home].pts += 3;
                    champStats[home].g++;
                    champStats[away].p++;
                  } else if (homeScore < awayScore) {
                    champStats[away].pts += 3;
                    champStats[away].g++;
                    champStats[home].p++;
                  } else {
                    champStats[home].pts++;
                    champStats[away].pts++;
                    champStats[home].n++;
                    champStats[away].n++;
                  }
                  champStats[home].diff = champStats[home].bp - champStats[home].bc;
                  champStats[away].diff = champStats[away].bp - champStats[away].bc;
                }
              }
            });
          }
        });

        // Ajouter les stats de ce championnat aux stats agrégées
        managerList.forEach(mgr => {
          if (aggregatedStats[mgr] && champStats[mgr]) {
            aggregatedStats[mgr].pts += champStats[mgr].pts;
            aggregatedStats[mgr].j += champStats[mgr].j;
            aggregatedStats[mgr].g += champStats[mgr].g;
            aggregatedStats[mgr].n += champStats[mgr].n;
            aggregatedStats[mgr].p += champStats[mgr].p;
            aggregatedStats[mgr].bp += champStats[mgr].bp;
            aggregatedStats[mgr].bc += champStats[mgr].bc;
            aggregatedStats[mgr].diff += champStats[mgr].diff;
            aggregatedStats[mgr].details[euroChamp] = champStats[mgr].pts;
          }
        });
      });

      // Appliquer les pénalités et trier
      const sortedAggregated = Object.values(aggregatedStats)
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

      const hyenesStandings = sortedAggregated.map((team, index) => ({
        pos: index + 1,
        mgr: team.name,
        pts: team.pts,
        j: team.j,
        g: team.g,
        n: team.n,
        p: team.p,
        bp: team.bp,
        bc: team.bc,
        diff: team.diff,
        details: team.details
      }));


      // Mettre à jour les équipes et le classement
      // Inclure tous les champs nécessaires pour l'affichage (record, goalDiff)
      const normalizedTeams = hyenesStandings.map((team, index) => ({
        rank: index + 1,
        name: team.mgr,
        pts: team.pts,
        j: team.j,
        g: team.g,
        n: team.n,
        p: team.p,
        bp: team.bp,
        bc: team.bc,
        diff: team.diff >= 0 ? `+${team.diff}` : `${team.diff}`,
        record: `${team.g}-${team.n}-${team.p}`,
        goalDiff: `${team.bp}-${team.bc}`,
        details: team.details
      }));
      setTeams(normalizedTeams);

      // Sauvegarder les standings Hyènes dans data.entities.seasons
      // pour que le Palmarès et le Panthéon puissent les trouver
      if (!data.entities.seasons) data.entities.seasons = {};
      if (!data.entities.seasons[seasonKey]) {
        data.entities.seasons[seasonKey] = { season: parseInt(season) };
      }
      data.entities.seasons[seasonKey].standings = hyenesStandings;

      // Calculer la progression de la saison (somme des journées jouées par championnat)
      const isS6 = season === '6';
      let currentMatchday = 0;
      euroChampionships.forEach(champ => {
        const champMatches = (data.entities.matches || []).filter(
          block => block.championship?.toLowerCase() === champ.toLowerCase() &&
                   block.season === parseInt(season)
        );
        if (champMatches.length > 0) {
          currentMatchday += Math.max(...champMatches.map(b => b.matchday));
        }
      });
      const totalMatchdays = isS6 ? HYENES_S6_MATCHDAYS : HYENES_MATCHDAYS;
      const percentage = totalMatchdays > 0 ? Math.round((currentMatchday / totalMatchdays) * 100) : 0;
      setSeasonProgress({ currentMatchday, totalMatchdays, percentage });

      // Pas de matchs à afficher pour la Ligue des Hyènes (c'est une agrégation)
      setMatches([]);

    } else if (data.entities.seasons && data.entities.seasons[seasonKey]) {
      const savedStandings = data.entities.seasons[seasonKey].standings || [];

      // === RECALCULER le classement depuis TOUS les matchs de la saison ===
      // (les standings sauvegardés peuvent être obsolètes si de nouvelles journées existent)
      // Comparaison insensible à la casse pour éviter les problèmes de format
      const championshipKeyLowerForStandings = championshipKey.toLowerCase();
      const allSeasonMatches = (data.entities.matches || []).filter(
        block => block.championship?.toLowerCase() === championshipKeyLowerForStandings &&
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
              const { homeTeam: home, awayTeam: away, homeScore: hs, awayScore: as2 } = normalizeMatch(match);

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
        // Stocker le nombre de journées jouées (basé sur les matchdays, pas sur j)
        if (allSeasonMatches.length > 0) {
          data.entities.seasons[seasonKey].playedMatchdays = Math.max(...allSeasonMatches.map(b => b.matchday));
        }
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
    // La Ligue des Hyènes n'a pas de matchs propres (setMatches([]) déjà appelé)
    if (championship !== 'hyenes' && data.entities.matches && Array.isArray(data.entities.matches)) {
      const championshipKeyLower = championshipKey.toLowerCase();
      const matchesForContext = data.entities.matches.find(
        block =>
          block.championship?.toLowerCase() === championshipKeyLower &&
          block.season === parseInt(season) &&
          block.matchday === parseInt(journee)
      );

      if (matchesForContext && matchesForContext.games) {
        // Normaliser les matches pour s'assurer que les champs sont corrects
        const normalizedMatches = matchesForContext.games.map((match, index) => ({
          id: match.id || (index + 1),
          ...normalizeMatch(match)
        }));

        // Dédupliquer les matchs (garder le premier de chaque paire d'équipes)
        const seen = new Set();
        const deduplicatedMatches = normalizedMatches.filter(match => {
          const key = `${match.homeTeam}_${match.awayTeam}`;
          if (seen.has(key)) {
            console.warn('Match en double ignoré:', match);
            return false;
          }
          seen.add(key);
          return true;
        });

        // Limiter à 5 matchs max par journée (10 équipes qui jouent)
        // et compléter avec des matchs vides si moins de 5
        const limitedMatches = deduplicatedMatches.slice(0, 5);
        const finalMatches = [...limitedMatches];
        while (finalMatches.length < 5) {
          finalMatches.push({
            id: finalMatches.length + 1,
            homeTeam: '',
            awayTeam: '',
            homeScore: null,
            awayScore: null
          });
        }

        if (normalizedMatches.length !== limitedMatches.length) {
          console.warn(`Matchs dédupliqués: ${normalizedMatches.length} -> ${limitedMatches.length}`);
        }
        // Ne pas écraser les matchs si c'est un auto-sync (l'utilisateur est en train de saisir)
        if (skipNextMatchesLoadRef.current) {
          skipNextMatchesLoadRef.current = false;
        } else {
          setMatches(finalMatches);
        }

      } else {
        // Pas de données de matches pour cette journée - réinitialiser
        setMatches(DEFAULT_MATCHES);
      }
    } else {
      // entities.matches n'existe pas dans ce fichier v2.0
      // Les matches devront être saisis manuellement
      setMatches(DEFAULT_MATCHES);
    }

    // === Pré-calculer les standings Ligue des Hyènes pour TOUTES les saisons ===
    // Nécessaire pour que le Palmarès et le Panthéon trouvent les entrées ligue_hyenes_s{N}
    if (data.entities.matches && data.entities.managers) {
      const managerListAll = Object.values(data.entities.managers)
        .map(m => m.name || '?').filter(n => n !== '?');
      const euroChamps = ['france', 'espagne', 'italie', 'angleterre'];

      // Trouver toutes les saisons disponibles dans les matchs
      const allSeasonNums = new Set();
      data.entities.matches.forEach(block => {
        if (block.season) allSeasonNums.add(block.season);
      });

      allSeasonNums.forEach(seasonNum => {
        const hyenesKey = `ligue_hyenes_s${seasonNum}`;

        // Agréger les stats des 4 championnats pour cette saison
        const aggStats = {};
        managerListAll.forEach(mgr => {
          aggStats[mgr] = { name: mgr, pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0 };
        });

        let playedMatchdays = 0;
        euroChamps.forEach(champ => {
          const champMatches = data.entities.matches.filter(
            block => block.championship?.toLowerCase() === champ && block.season === seasonNum
          );
          if (champMatches.length > 0) {
            playedMatchdays += Math.max(...champMatches.map(b => b.matchday));
          }
          champMatches.forEach(matchBlock => {
            if (!matchBlock.games || !Array.isArray(matchBlock.games)) return;
            matchBlock.games.forEach(match => {
              const { homeTeam: home, awayTeam: away, homeScore: hs, awayScore: as2 } = normalizeMatch(match);
              if (hs === null || hs === undefined || as2 === null || as2 === undefined) return;
              const hScore = parseInt(hs), aScore = parseInt(as2);
              if (isNaN(hScore) || isNaN(aScore)) return;
              if (!aggStats[home]) aggStats[home] = { name: home, pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0 };
              if (!aggStats[away]) aggStats[away] = { name: away, pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0 };
              aggStats[home].j++; aggStats[away].j++;
              aggStats[home].bp += hScore; aggStats[home].bc += aScore;
              aggStats[away].bp += aScore; aggStats[away].bc += hScore;
              if (hScore > aScore) { aggStats[home].pts += 3; aggStats[home].g++; aggStats[away].p++; }
              else if (hScore < aScore) { aggStats[away].pts += 3; aggStats[away].g++; aggStats[home].p++; }
              else { aggStats[home].pts++; aggStats[away].pts++; aggStats[home].n++; aggStats[away].n++; }
              aggStats[home].diff = aggStats[home].bp - aggStats[home].bc;
              aggStats[away].diff = aggStats[away].bp - aggStats[away].bc;
            });
          });
        });

        const hyenesStandingsAll = Object.values(aggStats)
          .filter(t => t.j > 0)
          .sort((a, b) => {
            const penA = getTeamPenaltyLocal(a.name, 'hyenes', String(seasonNum));
            const penB = getTeamPenaltyLocal(b.name, 'hyenes', String(seasonNum));
            const effA = a.pts - penA, effB = b.pts - penB;
            if (effB !== effA) return effB - effA;
            if (b.diff !== a.diff) return b.diff - a.diff;
            return b.bp - a.bp;
          })
          .map((t, i) => ({ pos: i + 1, mgr: t.name, pts: t.pts, j: t.j, g: t.g, n: t.n, p: t.p, bp: t.bp, bc: t.bc, diff: t.diff }));

        if (hyenesStandingsAll.length > 0) {
          if (!data.entities.seasons) data.entities.seasons = {};
          if (!data.entities.seasons[hyenesKey]) {
            data.entities.seasons[hyenesKey] = { season: seasonNum };
          }
          data.entities.seasons[hyenesKey].standings = hyenesStandingsAll;
          data.entities.seasons[hyenesKey].playedMatchdays = playedMatchdays;
        }
      });
    }

    // === Pré-calculer les standings pour les championnats individuels (TOUTES les saisons) ===
    // Même logique que le pré-calcul Hyènes : créer/mettre à jour les entrées dans
    // data.entities.seasons pour que le Palmarès et le Panthéon aient des données complètes.
    // Sans cela, les entrées comme france_s7, espagne_s7 n'existent pas si elles
    // n'ont jamais été sauvegardées en base → le Panthéon affiche 0 trophées.
    if (data.entities.matches && data.entities.managers) {
      const managerListAll = Object.values(data.entities.managers)
        .map(m => m.name || '?').filter(n => n !== '?');
      const individualChamps = ['france', 'espagne', 'italie', 'angleterre'];

      // Trouver toutes les saisons par championnat depuis les matchs
      const champSeasons = {};
      data.entities.matches.forEach(block => {
        const champ = block.championship?.toLowerCase();
        if (champ && block.season && individualChamps.includes(champ)) {
          if (!champSeasons[champ]) champSeasons[champ] = new Set();
          champSeasons[champ].add(block.season);
        }
      });

      individualChamps.forEach(champ => {
        const seasonNums = champSeasons[champ];
        if (!seasonNums) return;

        seasonNums.forEach(seasonNum => {
          const champKey = `${champ}_s${seasonNum}`;

          // Calculer les stats depuis les matchs
          const champStats = {};
          managerListAll.forEach(mgr => {
            champStats[mgr] = { name: mgr, pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0 };
          });

          const champMatches = data.entities.matches.filter(
            block => block.championship?.toLowerCase() === champ && block.season === seasonNum
          );

          let playedMatchdays = 0;
          if (champMatches.length > 0) {
            playedMatchdays = Math.max(...champMatches.map(b => b.matchday));
          }

          champMatches.forEach(matchBlock => {
            if (!matchBlock.games || !Array.isArray(matchBlock.games)) return;
            matchBlock.games.forEach(match => {
              const { homeTeam: home, awayTeam: away, homeScore: hs, awayScore: as2 } = normalizeMatch(match);
              if (hs === null || hs === undefined || as2 === null || as2 === undefined) return;
              const hScore = parseInt(hs), aScore = parseInt(as2);
              if (isNaN(hScore) || isNaN(aScore)) return;
              if (!champStats[home]) champStats[home] = { name: home, pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0 };
              if (!champStats[away]) champStats[away] = { name: away, pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0 };
              champStats[home].j++; champStats[away].j++;
              champStats[home].bp += hScore; champStats[home].bc += aScore;
              champStats[away].bp += aScore; champStats[away].bc += hScore;
              if (hScore > aScore) { champStats[home].pts += 3; champStats[home].g++; champStats[away].p++; }
              else if (hScore < aScore) { champStats[away].pts += 3; champStats[away].g++; champStats[home].p++; }
              else { champStats[home].pts++; champStats[away].pts++; champStats[home].n++; champStats[away].n++; }
              champStats[home].diff = champStats[home].bp - champStats[home].bc;
              champStats[away].diff = champStats[away].bp - champStats[away].bc;
            });
          });

          // Mapper le nom de championnat vers l'ID pour getTeamPenaltyLocal
          const champId = champ === 'espagne' ? 'spain' : champ === 'italie' ? 'italy' : champ === 'angleterre' ? 'england' : champ;

          const champStandingsAll = Object.values(champStats)
            .filter(t => t.j > 0)
            .sort((a, b) => {
              const penA = getTeamPenaltyLocal(a.name, champId, String(seasonNum));
              const penB = getTeamPenaltyLocal(b.name, champId, String(seasonNum));
              const effA = a.pts - penA, effB = b.pts - penB;
              if (effB !== effA) return effB - effA;
              if (b.diff !== a.diff) return b.diff - a.diff;
              return b.bp - a.bp;
            })
            .map((t, i) => ({ pos: i + 1, mgr: t.name, pts: t.pts, j: t.j, g: t.g, n: t.n, p: t.p, bp: t.bp, bc: t.bc, diff: t.diff }));

          if (champStandingsAll.length > 0) {
            if (!data.entities.seasons) data.entities.seasons = {};
            if (!data.entities.seasons[champKey]) {
              data.entities.seasons[champKey] = { season: seasonNum };
            }
            data.entities.seasons[champKey].standings = champStandingsAll;
            data.entities.seasons[champKey].playedMatchdays = playedMatchdays;
          }
        });
      });
    }

    // Extraire champions[] pour le championnat sélectionné
    if (data.entities.seasons) {
      const championsList = [];
      Object.keys(data.entities.seasons).forEach(seasonKey => {
        const parts = seasonKey.split('_');
        const seasonNum = parts[parts.length - 1].replace('s', '');
        const championshipName = parts.slice(0, -1).join('_');
        const championshipId = REVERSE_CHAMPIONSHIP_MAPPING[championshipName] || championshipName;

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
              ? (isHyenesS6 ? HYENES_S6_MATCHDAYS : HYENES_MATCHDAYS)
              : (isFranceS6 ? FRANCE_S6_MATCHDAYS : STANDARD_MATCHDAYS);
            // Utiliser playedMatchdays (journées disputées) plutôt que j (matchs joués par équipe)
            // car avec le système d'équipe exemptée, j < totalMatchdays même pour une saison terminée
            const currentMatchday = seasonData.playedMatchdays || standings[0]?.j || 0;

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

      // Collecter tous les champions pour la persistance Supabase
      const allChampionsForDb = [];

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
        // Utiliser playedMatchdays (journées disputées) plutôt que j (matchs joués par équipe)
        const currentMatchday = seasonData.playedMatchdays || standings[0]?.j || 0;
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
          allChampionsForDb.push({ championship: championshipName, season: parseInt(seasonNum), champion: 'BimBam / Warnaque' });
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
        const runnerUp = teamsWithEffectivePts[1];
        if (champion && trophyCount[champion.name]) {
          trophyCount[champion.name][config.field] += 1;
          trophyCount[champion.name].total += 1;
        }
        if (champion) {
          allChampionsForDb.push({
            championship: championshipName,
            season: parseInt(seasonNum),
            champion: champion.name,
            runnerUp: runnerUp?.name || null
          });
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

      // Persister les champions et le Panthéon vers Supabase (fire-and-forget, admin uniquement)
      if (isAdminUser) {
        Promise.allSettled([
          ...allChampionsForDb.map(c =>
            saveChampion(c.championship, c.season, c.champion, c.runnerUp).catch(err => console.error('Erreur saveChampion:', err))
          ),
          ...pantheon.filter(p => p.total > 0).map(p =>
            updatePantheon(p.name, 0, p.total, 0).catch(err => console.error('Erreur updatePantheon:', err))
          )
        ]).catch(err => console.error('Erreur persistence Panthéon:', err));
      }
    }

  }, []);

  // useEffect pour gérer l'authentification
  useEffect(() => {
    async function initAuth() {
      try {
        const session = await getSession();
        if (session?.user) {
          setUser(session.user);
          const adminStatus = await checkIsAdmin(session.user.email);
          setIsAdmin(adminStatus);
        }
      } catch (error) {
        console.error('Erreur initialisation auth:', error);
      } finally {
        setIsAuthLoading(false);
      }
    }

    initAuth();

    // Écouter les changements d'authentification
    let subscription = null;
    try {
      const result = onAuthStateChange(async (event, session) => {
        if (session?.user) {
          setUser(session.user);
          const adminStatus = await checkIsAdmin(session.user.email);
          setIsAdmin(adminStatus);
        } else {
          setUser(null);
          setIsAdmin(false);
        }
      });
      subscription = result?.data?.subscription;
    } catch (error) {
      console.error('Erreur onAuthStateChange:', error);
    }

    return () => {
      if (subscription?.unsubscribe) {
        subscription.unsubscribe();
      }
    };
  }, []);

  // Cleanup du timeout de sauvegarde au démontage
  useEffect(() => {
    return () => {
      if (saveMatchesTimeoutRef.current) {
        clearTimeout(saveMatchesTimeoutRef.current);
      }
    };
  }, []);

  // Fonction de connexion
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      await signIn(loginEmail, loginPassword);
      setShowLoginModal(false);
      setLoginEmail('');
      setLoginPassword('');
    } catch (error) {
      setLoginError('Email ou mot de passe incorrect');
      setLoginPassword('');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Fonction de déconnexion (mise à jour optimiste de l'UI)
  const handleLogout = async () => {
    setIsLoggingOut(true);
    // Mise à jour optimiste : on nettoie l'UI immédiatement
    setUser(null);
    setIsAdmin(false);
    try {
      await signOut();
    } catch (error) {
      console.error('Erreur déconnexion:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Ref pour éviter une closure périmée dans le timer d'inactivité
  const handleLogoutRef = useRef(handleLogout);
  handleLogoutRef.current = handleLogout;

  // Déconnexion automatique après 15 minutes d'inactivité
  useEffect(() => {
    if (!user) return;

    const INACTIVITY_TIMEOUT = INACTIVITY_TIMEOUT_MS;
    let timeoutId = null;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogoutRef.current();
      }, INACTIVITY_TIMEOUT);
    };

    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach(event => window.addEventListener(event, resetTimer));

    // Démarrer le timer initial
    resetTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      activityEvents.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [user]);

  // Fonction pour ajouter un manager
  const handleAddManager = async () => {
    const trimmedName = newManagerName.trim();
    if (!trimmedName) {
      setManagerError('Le nom ne peut pas être vide');
      return;
    }

    if (trimmedName.length > MAX_MANAGER_NAME_LENGTH) {
      setManagerError(`Le nom ne peut pas dépasser ${MAX_MANAGER_NAME_LENGTH} caractères`);
      return;
    }

    if (!MANAGER_NAME_PATTERN.test(trimmedName)) {
      setManagerError('Le nom contient des caractères non autorisés');
      return;
    }

    // Vérifier si le manager existe déjà
    if (allTeams.includes(trimmedName)) {
      setManagerError('Ce manager existe déjà');
      return;
    }

    setIsAddingManager(true);
    setManagerError('');

    try {
      // Générer un ID unique pour le manager
      const managerId = trimmedName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

      // Sauvegarder dans Supabase si admin connecté
      if (isAdmin) {
        await saveManager({ id: managerId, name: trimmedName });
      }

      // Mettre à jour l'état local
      const newManagers = {
        ...(appData?.entities?.managers || {}),
        [managerId]: { id: managerId, name: trimmedName }
      };

      setAppData(prev => ({
        ...prev,
        entities: {
          ...prev?.entities,
          managers: newManagers
        }
      }));

      setAllTeams(prev => [...prev, trimmedName].sort());
      setNewManagerName('');
    } catch (error) {
      console.error('Erreur ajout manager:', error);
      setManagerError('Erreur lors de l\'ajout');
    } finally {
      setIsAddingManager(false);
    }
  };

  // Fonction pour supprimer un manager
  const handleDeleteManager = async (managerName) => {
    if (!window.confirm(`Supprimer le manager "${managerName}" ?`)) {
      return;
    }

    try {
      // Trouver l'ID du manager
      const managers = appData?.entities?.managers || {};
      const managerEntry = Object.entries(managers).find(([_, m]) => m.name === managerName);

      if (managerEntry && isAdmin) {
        const [managerId] = managerEntry;
        // Supprimer de Supabase
        await deleteManager(managerId);
      }

      // Supprimer localement
      const newManagers = { ...(appData?.entities?.managers || {}) };
      Object.keys(newManagers).forEach(key => {
        if (newManagers[key].name === managerName) {
          delete newManagers[key];
        }
      });

      setAppData(prev => ({
        ...prev,
        entities: {
          ...prev?.entities,
          managers: newManagers
        }
      }));

      setAllTeams(prev => prev.filter(t => t !== managerName));
    } catch (error) {
      console.error('Erreur suppression manager:', error);
      alert('Erreur lors de la suppression du manager');
    }
  };

  // Fonction pour commencer l'édition d'un manager
  const startEditingManager = (managerName) => {
    const managers = appData?.entities?.managers || {};
    const managerEntry = Object.entries(managers).find(([_, m]) => m.name === managerName);
    if (managerEntry) {
      const [managerId] = managerEntry;
      setEditingManagerId(managerId);
      setEditingManagerName(managerName);
    }
  };

  // Fonction pour annuler l'édition
  const cancelEditingManager = () => {
    setEditingManagerId(null);
    setEditingManagerName('');
    setManagerError('');
  };

  // Fonction pour sauvegarder la modification du nom
  const handleSaveManagerEdit = async () => {
    if (!editingManagerName.trim()) {
      setManagerError('Le nom ne peut pas être vide');
      return;
    }

    // Vérifier si le nom existe déjà (sauf pour le manager actuel)
    const managers = appData?.entities?.managers || {};
    const currentManager = managers[editingManagerId];
    const oldName = currentManager?.name;

    if (oldName === editingManagerName.trim()) {
      cancelEditingManager();
      return;
    }

    const nameExists = Object.values(managers).some(
      m => m.name.toLowerCase() === editingManagerName.trim().toLowerCase() && m.id !== editingManagerId
    );

    if (nameExists) {
      setManagerError('Ce nom existe déjà');
      return;
    }

    setIsEditingManager(true);
    setManagerError('');

    try {
      const newName = editingManagerName.trim();

      // Mettre à jour dans Supabase (propagation automatique)
      if (isAdmin) {
        await updateManagerName(editingManagerId, oldName, newName);
      }

      // Mettre à jour localement dans appData
      setAppData(prev => {
        const newData = { ...prev };

        // Mettre à jour managers
        if (newData.entities?.managers?.[editingManagerId]) {
          newData.entities.managers[editingManagerId].name = newName;
        }

        // Mettre à jour matches
        if (newData.entities?.matches) {
          newData.entities.matches = newData.entities.matches.map(matchBlock => ({
            ...matchBlock,
            games: matchBlock.games.map(game => ({
              ...game,
              homeTeam: game.homeTeam === oldName ? newName : game.homeTeam,
              awayTeam: game.awayTeam === oldName ? newName : game.awayTeam
            }))
          }));
        }

        // Mettre à jour exempt dans seasons
        if (newData.entities?.seasons) {
          Object.values(newData.entities.seasons).forEach(s => {
            if (s.exemptTeam === oldName) s.exemptTeam = newName;
          });
        }

        // Mettre à jour palmares
        if (newData.palmares) {
          Object.keys(newData.palmares).forEach(champ => {
            newData.palmares[champ] = newData.palmares[champ].map(entry => ({
              ...entry,
              champion: entry.champion === oldName ? newName : entry.champion,
              runnerUp: entry.runnerUp === oldName ? newName : entry.runnerUp
            }));
          });
        }

        // Mettre à jour pantheon
        if (newData.pantheon) {
          newData.pantheon = newData.pantheon.map(p => ({
            ...p,
            name: p.name === oldName ? newName : p.name
          }));
        }

        // Mettre à jour penalties
        if (newData.penalties) {
          const newPenalties = {};
          Object.entries(newData.penalties).forEach(([key, value]) => {
            const parts = key.split('_');
            if (parts.length >= 3) {
              const teamName = parts.slice(2).join('_');
              if (teamName === oldName) {
                const newKey = `${parts[0]}_${parts[1]}_${newName}`;
                newPenalties[newKey] = value;
              } else {
                newPenalties[key] = value;
              }
            } else {
              newPenalties[key] = value;
            }
          });
          newData.penalties = newPenalties;
        }

        return newData;
      });

      // Mettre à jour allTeams
      setAllTeams(prev => prev.map(t => t === oldName ? newName : t));

      // Mettre à jour matches affichés si nécessaire
      setMatches(prev => prev.map(m => ({
        ...m,
        homeTeam: m.homeTeam === oldName ? newName : m.homeTeam,
        awayTeam: m.awayTeam === oldName ? newName : m.awayTeam
      })));

      // Mettre à jour teams (classement)
      setTeams(prev => prev.map(t => ({
        ...t,
        name: t.name === oldName ? newName : t.name
      })));

      // Mettre à jour exemptTeam si nécessaire
      if (exemptTeam === oldName) {
        setExemptTeam(newName);
      }

      cancelEditingManager();
    } catch (error) {
      console.error('Erreur modification manager:', error);
      setManagerError('Erreur lors de la modification');
    } finally {
      setIsEditingManager(false);
    }
  };

  // useEffect pour charger les données depuis Supabase au démarrage + auto-refresh périodique
  useEffect(() => {
    function applySupabaseData(data) {
      if (data && data.entities && (
        Object.keys(data.entities.managers || {}).length > 0 ||
        Object.keys(data.entities.seasons || {}).length > 0 ||
        (data.entities.matches || []).length > 0
      )) {
        setAppData(data);

        if (data.entities.managers) {
          const managerNames = Object.values(data.entities.managers)
            .map(manager => manager.name || '?')
            .filter(name => name !== '?');
          setAllTeams(managerNames);
        }

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
            setSelectedSeason(prev => prev || sortedSeasons[sortedSeasons.length - 1]);
          }
        }

        if (data.penalties) {
          setPenalties(data.penalties);
        }

        // Note: le Panthéon est calculé dynamiquement par loadDataFromAppData()
        // à partir des standings de chaque saison. Ne pas utiliser data.pantheon
        // (format legacy incomplet : pas de détail par championnat).
      }
    }

    async function loadFromSupabase(isInitial) {
      try {
        if (isInitial) {
          setIsLoadingFromSupabase(true);
          setSupabaseError(null);
        }
        const data = await fetchAppData();
        applySupabaseData(data);
        if (isInitial) setSupabaseError(null);
      } catch (error) {
        console.error('Erreur chargement Supabase:', error);
        if (isInitial) setSupabaseError('Erreur de connexion au serveur');
      } finally {
        if (isInitial) setIsLoadingFromSupabase(false);
      }
    }

    // Chargement initial
    loadFromSupabase(true);

    // Auto-refresh périodique (silencieux, pas de loader)
    const refreshInterval = setInterval(() => loadFromSupabase(false), AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(refreshInterval);
  }, []);

  // useEffect pour recharger les données quand le contexte change ou les pénalités
  useEffect(() => {
    if (appData && appData.version === '2.0') {
      loadDataFromAppData(appData, selectedChampionship, selectedSeason, selectedJournee, penalties, isAdmin);
    }
  }, [selectedChampionship, selectedSeason, selectedJournee, appData, penalties, loadDataFromAppData, isAdmin]);

  // useEffect pour forcer un championnat valide sur l'onglet Match (exclure Ligue des Hyènes)
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

  // Propager l'exemption à tous les championnats et toutes les journées de la saison
  const handleExemptTeamChange = (team) => {
    setExemptTeam(team);

    if (appData && appData.version === '2.0' && appData.entities.seasons) {
      const updatedAppData = structuredClone(appData);
      const euroChampionships = ['france', 'espagne', 'italie', 'angleterre'];

      // Mettre à jour exempt dans chaque entrée seasons de cette saison
      euroChampionships.forEach(champ => {
        const key = `${champ}_s${selectedSeason}`;
        if (updatedAppData.entities.seasons[key]) {
          updatedAppData.entities.seasons[key].exemptTeam = team || '';
        }
      });

      // Empêcher loadDataFromAppData d'écraser l'exempt qu'on vient de définir
      skipNextExemptLoadRef.current = true;
      setAppData(updatedAppData);
    }

    // Sync vers Supabase
    if (isAdmin) {
      updateSeasonExempt(parseInt(selectedSeason), team || null)
        .catch(err => console.error('Erreur sync exempt Supabase:', err));
    }
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
      const NAV_BAR_HEIGHT = 80;
      const DROPDOWN_MAX = 420;
      const spaceBelow = window.innerHeight - rect.bottom - NAV_BAR_HEIGHT;
      const spaceAbove = rect.top;
      const openUpward = spaceBelow < 200 && spaceAbove > spaceBelow;

      const position = {
        left: type === 'home' ? rect.left : 'auto',
        right: type === 'away' ? (window.innerWidth - rect.right) : 'auto'
      };

      if (openUpward) {
        position.top = 'auto';
        position.bottom = window.innerHeight - rect.top + 4;
        position.maxHeight = Math.min(DROPDOWN_MAX, spaceAbove - 10);
      } else {
        position.top = rect.bottom + 4;
        position.bottom = 'auto';
        position.maxHeight = Math.min(DROPDOWN_MAX, spaceBelow - 4);
      }

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

  const handleApplyPenalty = async () => {
    if (!selectedPenaltyTeam || !penaltyPoints) return;

    const points = parseInt(penaltyPoints);
    if (isNaN(points) || points < 0) {
      alert('Veuillez entrer un nombre de points valide (positif)');
      return;
    }

    // Sauvegarder dans Supabase si admin
    if (isAdmin) {
      try {
        await savePenalty(selectedChampionship, parseInt(selectedSeason), selectedPenaltyTeam, points);
      } catch (error) {
        console.error('Erreur sauvegarde pénalité:', error);
        alert('Erreur lors de la sauvegarde de la pénalité');
        return;
      }
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

  const handleRemovePenalty = async (teamName) => {
    // Supprimer de Supabase si admin
    if (isAdmin) {
      try {
        await deletePenalty(selectedChampionship, parseInt(selectedSeason), teamName);
      } catch (error) {
        console.error('Erreur suppression pénalité:', error);
        alert('Erreur lors de la suppression de la pénalité');
        return;
      }
    }

    const key = getPenaltyKey(teamName);
    setPenalties(prev => {
      const newPenalties = { ...prev };
      delete newPenalties[key];
      return newPenalties;
    });
  };

  // === Création d'une nouvelle saison ===
  const handleCreateSeason = async () => {
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

    const championshipKeys = ['ligue_hyenes', 'france', 'espagne', 'italie', 'angleterre'];

    setIsCreatingSeason(true);

    // Mettre à jour appData localement d'abord (UI réactive)
    const baseAppData = appData && appData.version === '2.0'
      ? structuredClone(appData)
      : { version: '2.0', entities: { managers: {}, seasons: {}, matches: [] } };

    championshipKeys.forEach(champKey => {
      const seasonKey = `${champKey}_s${seasonNum}`;
      if (!baseAppData.entities.seasons[seasonKey]) {
        baseAppData.entities.seasons[seasonKey] = { standings: [] };
      }
    });

    const updatedSeasons = [...seasons, seasonNum].sort((a, b) => parseInt(a) - parseInt(b));
    setSeasons(updatedSeasons);
    setSelectedSeason(seasonNum);
    setAppData(baseAppData);
    setNewSeasonNumber('');

    // Sauvegarder dans Supabase si admin (en parallèle, non-bloquant)
    if (isAdmin) {
      try {
        await Promise.all(
          championshipKeys.map(champKey =>
            saveSeason(champKey, parseInt(seasonNum), [])
          )
        );
      } catch (error) {
        console.error('Erreur sauvegarde saison Supabase:', error);
        alert(`Saison ${seasonNum} créée localement, mais la synchronisation Supabase a échoué (${error.message || error}). Utilisez "Sauvegarder vers Supabase" pour réessayer.`);
        setIsCreatingSeason(false);
        return;
      }
    }

    setIsCreatingSeason(false);
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

    const championshipKeyLower = championshipKey.toLowerCase();
    const allSeasonMatches = (exportData.entities.matches || []).filter(
      block => block.championship?.toLowerCase() === championshipKeyLower &&
               block.season === parseInt(season)
    );

    const teamStats = calculateTeamStats(allSeasonMatches, allTeams);
    const newStandings = sortTeamsToStandings(teamStats);

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
      alert('Erreur lors de la sauvegarde. Veuillez réessayer.');
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
        const exportData = structuredClone(appData);

        const championshipKey = CHAMPIONSHIP_MAPPING[selectedChampionship] || selectedChampionship;

        // Initialiser entities.matches si nécessaire
        if (!exportData.entities.matches) {
          exportData.entities.matches = [];
        }

        // Chercher si un bloc existe déjà pour ce contexte
        // Comparaison insensible à la casse
        const championshipKeyLowerExport = championshipKey.toLowerCase();
        const existingBlockIndex = exportData.entities.matches.findIndex(
          block => block.championship?.toLowerCase() === championshipKeyLowerExport &&
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
          }))
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

  // Fonction de validation JSON pour sécuriser l'import
  const validateJSONData = (data, fileSize) => {
    const errors = [];

    // Vérifier la taille du fichier
    if (fileSize > MAX_IMPORT_FILE_SIZE) {
      errors.push('Fichier trop volumineux (max 10 MB)');
    }

    // Vérifier que c'est un objet
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      errors.push('Format invalide');
      return { valid: false, errors };
    }

    // Vérifier la version
    const version = data.version;
    if (version && !['1.0', '2.0'].includes(version)) {
      errors.push('Version non supportée');
    }

    // Validation v2.0
    if (version === '2.0') {
      if (!data.entities || typeof data.entities !== 'object') {
        errors.push('Structure entities manquante');
      } else {
        // Valider entities.managers
        if (data.entities.managers && typeof data.entities.managers !== 'object') {
          errors.push('Format managers invalide');
        }
        // Valider entities.seasons
        if (data.entities.seasons && typeof data.entities.seasons !== 'object') {
          errors.push('Format seasons invalide');
        }
        // Valider entities.matches
        if (data.entities.matches && !Array.isArray(data.entities.matches)) {
          errors.push('Format matches invalide');
        }
      }
    }

    // Vérification de sécurité : pas de contenu potentiellement dangereux
    // Vérifier récursivement les valeurs string uniquement (évite les faux positifs sur les clés)
    const checkDangerousStrings = (obj) => {
      if (typeof obj === 'string') {
        if (/<script/i.test(obj) || /javascript:/i.test(obj) ||
            /eval\s*\(/i.test(obj) || /Function\s*\(/i.test(obj)) {
          return true;
        }
      } else if (Array.isArray(obj)) {
        return obj.some(checkDangerousStrings);
      } else if (obj && typeof obj === 'object') {
        return Object.values(obj).some(checkDangerousStrings);
      }
      return false;
    };

    if (checkDangerousStrings(data)) {
      errors.push('Contenu non autorisé détecté');
    }

    // Vérifier la profondeur maximale d'imbrication (protection DoS)
    const checkDepth = (obj, depth = 0) => {
      if (depth > 10) return true;
      if (Array.isArray(obj)) return obj.some(v => checkDepth(v, depth + 1));
      if (obj && typeof obj === 'object') return Object.values(obj).some(v => checkDepth(v, depth + 1));
      return false;
    };

    if (checkDepth(data)) {
      errors.push('Structure trop profonde (max 10 niveaux)');
    }

    return { valid: errors.length === 0, errors };
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rawContent = e.target?.result;
        const data = JSON.parse(rawContent);

        // Valider les données avant de les importer
        const validation = validateJSONData(data, file.size);
        if (!validation.valid) {
          alert('❌ Fichier invalide : ' + validation.errors[0]);
          return;
        }

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
          loadDataFromAppData(data, selectedChampionship, selectedSeason, selectedJournee, filePenalties, isAdmin);

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
      const championshipKey = CHAMPIONSHIP_MAPPING[selectedChampionship] || selectedChampionship;
      const seasonKey = `${championshipKey}_s${selectedSeason}`;

      // Créer une copie mise à jour de appData
      const updatedAppData = structuredClone(appData);

      // Initialiser entities.matches si nécessaire
      if (!updatedAppData.entities.matches) {
        updatedAppData.entities.matches = [];
      }

      // Chercher si un bloc existe déjà pour ce contexte (journée actuelle)
      // Comparaison insensible à la casse
      const championshipKeyLowerRefresh = championshipKey.toLowerCase();
      const existingBlockIndex = updatedAppData.entities.matches.findIndex(
        block => block.championship?.toLowerCase() === championshipKeyLowerRefresh &&
                 block.season === parseInt(selectedSeason) &&
                 block.matchday === parseInt(selectedJournee)
      );


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
        }))
      };

      // Mettre à jour ou ajouter le bloc
      if (existingBlockIndex >= 0) {
        updatedAppData.entities.matches[existingBlockIndex] = newMatchBlock;
      } else {
        updatedAppData.entities.matches.push(newMatchBlock);
      }

      // === RECALCULER LE CLASSEMENT DEPUIS TOUS LES MATCHS DE LA SAISON ===
      const championshipKeyLowerRecalc = championshipKey.toLowerCase();
      const allSeasonMatches = updatedAppData.entities.matches.filter(
        block => block.championship?.toLowerCase() === championshipKeyLowerRecalc &&
                 block.season === parseInt(selectedSeason)
      );

      const teamStats = calculateTeamStats(allSeasonMatches, allTeams);
      const getPenalty = (name) => penalties[`${selectedChampionship}_${selectedSeason}_${name}`] || 0;
      const newStandings = sortTeamsToStandings(teamStats, getPenalty);

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

    const championshipKey = CHAMPIONSHIP_MAPPING[selectedChampionship] || selectedChampionship;
    const seasonKey = `${championshipKey}_s${selectedSeason}`;

    const updatedAppData = structuredClone(appData);

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
      }))
    };

    // Mettre à jour ou ajouter le bloc
    // Comparaison insensible à la casse
    const championshipKeyLowerSync = championshipKey.toLowerCase();
    const existingBlockIndex = updatedAppData.entities.matches.findIndex(
      block => block.championship?.toLowerCase() === championshipKeyLowerSync &&
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
      block => block.championship?.toLowerCase() === championshipKeyLowerSync &&
               block.season === parseInt(selectedSeason)
    );

    const teamStats = calculateTeamStats(allSeasonMatches, allTeams);
    const getPenalty = (name) => penalties[`${selectedChampionship}_${selectedSeason}_${name}`] || 0;
    const newStandings = sortTeamsToStandings(teamStats, getPenalty);

    // Sauvegarder les standings recalculés dans appData
    if (!updatedAppData.entities.seasons[seasonKey]) {
      updatedAppData.entities.seasons[seasonKey] = { standings: [] };
    }
    updatedAppData.entities.seasons[seasonKey].standings = newStandings;

    // Empêcher loadDataFromAppData d'écraser les matchs en cours de saisie
    skipNextMatchesLoadRef.current = true;
    setAppData(updatedAppData);

    // Auto-save vers Supabase si admin connecté (avec debounce pour éviter les doublons)
    // Sauvegarder même si tous les matchs sont vides (pour supprimer les anciens matchs)
    if (isAdmin) {
      // Annuler le save précédent s'il est en attente
      if (saveMatchesTimeoutRef.current) {
        clearTimeout(saveMatchesTimeoutRef.current);
      }

      // Debounce pour éviter les sauvegardes multiples rapides
      saveMatchesTimeoutRef.current = setTimeout(() => {
        saveMatches(
          championshipKey,
          parseInt(selectedSeason),
          parseInt(selectedJournee),
          newMatchBlock.games
        ).catch(err => console.error('Erreur auto-save Supabase:', err));
      }, AUTOSAVE_DEBOUNCE_MS);
    }
  }, [appData, allTeams, selectedChampionship, selectedSeason, selectedJournee, penalties, isAdmin]);

  return (
    <div className="h-screen bg-black text-white font-sans flex flex-col overflow-hidden safe-top ios26-app">
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
                        <div className="absolute left-0 right-0 top-full mt-2 ios26-dropdown rounded-2xl z-50 overflow-hidden">
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
                <div className="col-span-2 text-gray-400 text-xs font-bold text-center">V-N-D</div>
                <div className="col-span-2 text-gray-400 text-xs font-bold text-center">BP:BC</div>
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
                    <div className="col-span-2 text-center text-gray-300 text-xs font-medium whitespace-nowrap">
                      {team.record}
                    </div>
                    <div className="col-span-2 text-center text-gray-300 text-xs font-medium whitespace-nowrap">
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
                            {isAdmin && (
                              <button
                                onClick={() => handleRemovePenalty(teamName)}
                                className="text-gray-400 hover:text-red-400 ml-1"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => setIsPenaltyModalOpen(true)}
                          className="ios26-btn rounded-xl px-4 py-2 text-orange-400 text-sm font-bold border-orange-500/30"
                        >
                          + Ajouter
                        </button>
                      )}
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
                        <div className="absolute left-0 right-0 top-full mt-2 ios26-dropdown rounded-2xl z-50 overflow-hidden">
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
                            onClick={(e) => isAdmin && toggleDropdown(match.id, 'home', e)}
                            disabled={!isAdmin}
                            className={`w-full max-w-[135px] rounded-xl px-2.5 py-2 flex items-center justify-between group ${
                              !isAdmin ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                            } ${
                              match.homeTeam && match.awayTeam && match.homeScore !== null && match.awayScore !== null
                                ? 'bg-emerald-500/15 border border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                                : 'ios26-btn'
                            }`}
                          >
                            <span className={`text-sm font-semibold leading-tight text-left flex-1 pr-1 truncate ${match.homeTeam ? 'text-white' : 'text-gray-500'}`}>{match.homeTeam || 'Sélectionner'}</span>
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
                                className="fixed ios26-dropdown rounded-2xl z-50 overflow-y-auto w-[150px]"
                                style={{
                                  top: dropdownPosition.top !== 'auto' ? `${dropdownPosition.top}px` : 'auto',
                                  bottom: dropdownPosition.bottom !== 'auto' ? `${dropdownPosition.bottom}px` : 'auto',
                                  left: dropdownPosition.left !== 'auto' ? `${dropdownPosition.left}px` : 'auto',
                                  right: dropdownPosition.right !== 'auto' ? `${dropdownPosition.right}px` : 'auto',
                                  maxHeight: `${dropdownPosition.maxHeight || 420}px`
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
                            min={MIN_SCORE}
                            max={MAX_SCORE}
                            value={match.homeScore !== null ? match.homeScore : ''}
                            onChange={(e) => {
                              if (!isAdmin) return;
                              const raw = e.target.value === '' ? null : parseInt(e.target.value);
                              const value = raw !== null ? Math.max(MIN_SCORE, Math.min(MAX_SCORE, raw)) : null;
                              const updatedMatches = matches.map(m => m.id === match.id ? { ...m, homeScore: value } : m);
                              setMatches(updatedMatches);
                              syncMatchesToAppData(updatedMatches);
                            }}
                            placeholder="-"
                            disabled={!isAdmin}
                            className={`rounded-xl w-9 h-9 text-center text-base font-bold outline-none ${
                              !isAdmin
                                ? 'ios26-input text-gray-400 cursor-not-allowed'
                                : match.homeTeam && match.awayTeam && match.homeScore !== null && match.awayScore !== null
                                  ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-500/10'
                                  : 'ios26-input text-cyan-400'
                            }`}
                          />
                          <span className="text-gray-500 font-bold text-sm px-0">-</span>
                          <input
                            type="number"
                            min={MIN_SCORE}
                            max={MAX_SCORE}
                            value={match.awayScore !== null ? match.awayScore : ''}
                            onChange={(e) => {
                              if (!isAdmin) return;
                              const raw = e.target.value === '' ? null : parseInt(e.target.value);
                              const value = raw !== null ? Math.max(MIN_SCORE, Math.min(MAX_SCORE, raw)) : null;
                              const updatedMatches = matches.map(m => m.id === match.id ? { ...m, awayScore: value } : m);
                              setMatches(updatedMatches);
                              syncMatchesToAppData(updatedMatches);
                            }}
                            placeholder="-"
                            disabled={!isAdmin}
                            className={`rounded-xl w-9 h-9 text-center text-base font-bold outline-none ${
                              !isAdmin
                                ? 'ios26-input text-gray-400 cursor-not-allowed'
                                : match.homeTeam && match.awayTeam && match.homeScore !== null && match.awayScore !== null
                                  ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-500/10'
                                  : 'ios26-input text-cyan-400'
                            }`}
                          />
                      </div>

                      {/* Away Team */}
                      <div className="col-span-5 relative flex justify-end">
                          <button
                            onClick={(e) => isAdmin && toggleDropdown(match.id, 'away', e)}
                            disabled={!isAdmin}
                            className={`w-full max-w-[135px] rounded-xl px-2.5 py-2 flex items-center justify-between group ${
                              !isAdmin ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                            } ${
                              match.homeTeam && match.awayTeam && match.homeScore !== null && match.awayScore !== null
                                ? 'bg-emerald-500/15 border border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                                : 'ios26-btn'
                            }`}
                          >
                            <span className={`text-sm font-semibold leading-tight text-left flex-1 pr-1 truncate ${match.awayTeam ? 'text-white' : 'text-gray-500'}`}>{match.awayTeam || 'Sélectionner'}</span>
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
                                className="fixed ios26-dropdown rounded-2xl z-50 overflow-y-auto w-[150px]"
                                style={{
                                  top: dropdownPosition.top !== 'auto' ? `${dropdownPosition.top}px` : 'auto',
                                  bottom: dropdownPosition.bottom !== 'auto' ? `${dropdownPosition.bottom}px` : 'auto',
                                  left: dropdownPosition.left !== 'auto' ? `${dropdownPosition.left}px` : 'auto',
                                  right: dropdownPosition.right !== 'auto' ? `${dropdownPosition.right}px` : 'auto',
                                  maxHeight: `${dropdownPosition.maxHeight || 420}px`
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
                          onClick={() => isAdmin && setIsTeamDropdownOpen(!isTeamDropdownOpen)}
                          disabled={!isAdmin}
                          className={`w-full bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-2.5 text-white text-base font-semibold flex items-center justify-between backdrop-blur-sm ${!isAdmin ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-red-500/20'}`}
                        >
                          <span className="truncate">{exemptTeam || 'Aucune'}</span>
                          <svg className={`w-4 h-4 text-red-400 flex-shrink-0 ml-2 ${isTeamDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {isTeamDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsTeamDropdownOpen(false)}></div>
                            <div className="absolute left-0 right-0 bottom-full mb-2 ios26-dropdown rounded-2xl z-50 max-h-[420px] overflow-y-auto">
                              <button
                                onClick={() => {
                                  handleExemptTeamChange('');
                                  setIsTeamDropdownOpen(false);
                                }}
                                className="w-full px-4 py-3 text-base font-semibold text-left text-white hover:bg-white/10"
                              >
                                Aucune
                              </button>
                              {allTeams.map(team => (
                                <button
                                  key={team}
                                  onClick={() => {
                                    handleExemptTeamChange(team);
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
                      className={`px-5 py-2 flex items-center justify-center rounded-xl text-2xl ${
                        selectedChampionship === champ.id
                          ? 'ios26-tab-active'
                          : 'ios26-btn'
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

          <div className="flex-1 px-2 overflow-y-auto pb-4">
            <div className="space-y-2 mt-2">

              {/* Compte Admin - iOS 26 Card */}
              <div className="ios26-card rounded-xl p-3" style={{ borderColor: isAdmin ? 'rgba(16, 185, 129, 0.3)' : 'rgba(251, 146, 60, 0.3)' }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center backdrop-blur-sm ${isAdmin ? 'bg-emerald-500/20' : 'bg-orange-500/20'}`}>
                    <span className="text-xl">{user ? '👤' : '🔒'}</span>
                  </div>
                  <h2 className={`text-base font-bold tracking-wide ${isAdmin ? 'text-emerald-400' : 'text-orange-400'}`}>COMPTE</h2>
                  {isAuthLoading && (
                    <span className="text-xs text-gray-400 animate-pulse">Vérification...</span>
                  )}
                </div>

                {user ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-white/5">
                      <span className="text-sm text-gray-300">{user.email}</span>
                      {isAdmin && (
                        <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">Admin</span>
                      )}
                    </div>
                    <button
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="w-full ios26-btn rounded-xl px-4 py-2.5 text-white text-base font-semibold flex items-center justify-between group disabled:opacity-50"
                      style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}
                    >
                      {isLoggingOut ? (
                        <>
                          <span className="text-gray-400">Déconnexion...</span>
                          <span className="text-lg animate-spin">⏳</span>
                        </>
                      ) : (
                        <>
                          <span className="group-hover:text-red-400">Se déconnecter</span>
                          <span className="text-lg">🚪</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400 text-center mb-2">
                      Connectez-vous pour modifier les données
                    </p>
                    <button
                      onClick={() => setShowLoginModal(true)}
                      className="w-full ios26-btn rounded-xl px-4 py-2.5 text-white text-base font-semibold flex items-center justify-between group"
                      style={{ borderColor: 'rgba(59, 130, 246, 0.2)' }}
                    >
                      <span className="group-hover:text-blue-400">Se connecter</span>
                      <span className="text-lg ">🔑</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Managers - iOS 26 Card */}
              <div className="ios26-card rounded-xl p-3" style={{ borderColor: 'rgba(168, 85, 247, 0.2)' }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center backdrop-blur-sm">
                    <span className="text-xl">👥</span>
                  </div>
                  <h2 className="text-purple-400 text-base font-bold tracking-wide">MANAGERS</h2>
                  <span className="text-xs text-gray-400">({allTeams.length})</span>
                </div>

                {/* Formulaire d'ajout */}
                <div className="mb-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newManagerName}
                      onChange={(e) => { setNewManagerName(e.target.value); setManagerError(''); }}
                      placeholder="Nouveau manager..."
                      className="flex-1 ios26-input rounded-xl px-3 py-2 text-white text-sm font-medium outline-none"
                      style={{ borderColor: 'rgba(168, 85, 247, 0.3)' }}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddManager()}
                      disabled={!isAdmin}
                    />
                    <button
                      onClick={handleAddManager}
                      disabled={isAddingManager || !newManagerName.trim() || !isAdmin}
                      className="ios26-btn rounded-xl px-4 py-2 text-purple-400 text-sm font-semibold disabled:opacity-50"
                      style={{ borderColor: 'rgba(168, 85, 247, 0.3)' }}
                    >
                      {isAddingManager ? '...' : '+'}
                    </button>
                  </div>
                  {managerError && (
                    <p className="text-red-400 text-xs mt-1 ml-1">{managerError}</p>
                  )}
                  {!isAdmin && (
                    <p className="text-gray-500 text-xs mt-1 ml-1">Connectez-vous pour ajouter des managers</p>
                  )}
                </div>

                {/* Liste des managers */}
                <div className="max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
                  {allTeams.length === 0 ? (
                    <p className="text-gray-500 text-xs text-center py-2">Aucun manager</p>
                  ) : (
                    allTeams.map((manager, index) => {
                      const managers = appData?.entities?.managers || {};
                      const managerEntry = Object.entries(managers).find(([_, m]) => m.name === manager);
                      const managerId = managerEntry ? managerEntry[0] : null;
                      const isEditing = editingManagerId === managerId;

                      return (
                        <div
                          key={managerId || manager}
                          className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 group"
                        >
                          {isEditing ? (
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                type="text"
                                value={editingManagerName}
                                onChange={(e) => setEditingManagerName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveManagerEdit();
                                  if (e.key === 'Escape') cancelEditingManager();
                                }}
                                className="flex-1 bg-white/10 border border-cyan-500/50 rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:border-cyan-400"
                                autoFocus
                                disabled={isEditingManager}
                              />
                              <button
                                onClick={handleSaveManagerEdit}
                                disabled={isEditingManager}
                                className="text-green-400 hover:text-green-300 text-sm px-1"
                              >
                                {isEditingManager ? '⏳' : '✓'}
                              </button>
                              <button
                                onClick={cancelEditingManager}
                                disabled={isEditingManager}
                                className="text-gray-400 hover:text-gray-300 text-sm px-1"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="text-white text-sm">{manager}</span>
                              {isAdmin && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                                  <button
                                    onClick={() => startEditingManager(manager)}
                                    className="text-cyan-400 hover:text-cyan-300 text-sm px-2 py-1"
                                    title="Modifier"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={() => handleDeleteManager(manager)}
                                    className="text-red-400 hover:text-red-300 text-sm px-2 py-1"
                                    title="Supprimer"
                                  >
                                    ✕
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

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
                    disabled={!isAdmin}
                    className={`w-full ios26-btn rounded-xl px-4 py-2.5 text-white text-base font-semibold flex items-center justify-between group ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className="group-hover:text-cyan-400">Exporter (JSON)</span>
                    <span className="text-lg ">📥</span>
                  </button>
                  <button
                    onClick={handleImportJSON}
                    disabled={!isAdmin}
                    className={`w-full ios26-btn rounded-xl px-4 py-2.5 text-white text-base font-semibold flex items-center justify-between group ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className="group-hover:text-cyan-400">Importer (JSON)</span>
                    <span className="text-lg ">📤</span>
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
                    disabled={!isAdmin || isSavingToSupabase || (!pendingJsonData && !appData)}
                    className={`w-full ios26-btn rounded-xl px-4 py-2.5 text-white text-base font-semibold flex items-center justify-between group ${
                      !isAdmin || isSavingToSupabase ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    style={{ borderColor: 'rgba(59, 130, 246, 0.2)' }}
                  >
                    <span className="group-hover:text-blue-400">
                      {isSavingToSupabase ? 'Sauvegarde en cours...' : 'Sauvegarder vers Supabase'}
                    </span>
                    <span className="text-lg ">{isSavingToSupabase ? '⏳' : '☁️'}</span>
                  </button>
                  {!isAdmin && (
                    <p className="text-xs text-gray-500 text-center">Connexion admin requise</p>
                  )}
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
                      disabled={!isAdmin}
                      className={`flex-1 ios26-input rounded-xl px-4 py-2.5 text-white text-base font-medium outline-none placeholder-gray-500 ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                      style={{ borderColor: 'rgba(168, 85, 247, 0.2)' }}
                    />
                    <button
                      onClick={handleCreateSeason}
                      disabled={!isAdmin || isCreatingSeason}
                      className={`bg-purple-500/20 border border-purple-500/30 hover:bg-purple-500/30 rounded-xl px-4 py-2.5 text-purple-400 text-base font-bold ${!isAdmin || isCreatingSeason ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isCreatingSeason ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          Création...
                        </span>
                      ) : 'Créer'}
                    </button>
                  </div>
                  {!isAdmin && (
                    <p className="text-xs text-gray-500">Connexion admin requise pour créer une saison</p>
                  )}
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
                  disabled={!isAdmin}
                  className={`w-full bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 rounded-xl px-4 py-2.5 text-red-400 text-base font-bold flex items-center justify-between group ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="group-hover:text-red-300">Réinitialiser</span>
                  <span className="text-lg ">🗑️</span>
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

          {/* Modal Connexion - iOS 26 Style */}
          {showLoginModal && (
            <>
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" onClick={() => { setShowLoginModal(false); setLoginError(''); }}></div>
              <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
                <div className="ios26-modal rounded-3xl p-6 max-w-md w-full">
                  <div className="text-center mb-6">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-blue-500/20 flex items-center justify-center">
                      <span className="text-5xl">🔐</span>
                    </div>
                    <h3 className="text-blue-400 text-xl font-bold mb-2">CONNEXION ADMIN</h3>
                    <p className="text-gray-400 text-sm">Connectez-vous pour modifier les données</p>
                  </div>
                  <form onSubmit={handleLogin}>
                    <div className="space-y-4 mb-6">
                      <div>
                        <label className="block text-gray-400 text-xs font-medium mb-2 ml-1">Email</label>
                        <input
                          type="email"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="admin@example.com"
                          className="w-full ios26-input rounded-xl px-4 py-3.5 text-white text-sm font-medium outline-none"
                          style={{ borderColor: 'rgba(59, 130, 246, 0.3)' }}
                          required
                          autoComplete="email"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-400 text-xs font-medium mb-2 ml-1">Mot de passe</label>
                        <input
                          type="password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full ios26-input rounded-xl px-4 py-3.5 text-white text-sm font-medium outline-none"
                          style={{ borderColor: 'rgba(59, 130, 246, 0.3)' }}
                          required
                          autoComplete="current-password"
                        />
                      </div>
                      {loginError && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                          <p className="text-red-400 text-sm text-center">{loginError}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => { setShowLoginModal(false); setLoginError(''); setLoginEmail(''); setLoginPassword(''); }}
                        className="flex-1 ios26-btn rounded-xl px-4 py-3.5 text-white text-sm font-semibold"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        disabled={isLoggingIn}
                        className="flex-1 bg-blue-500/20 border border-blue-500/50 hover:bg-blue-500/30 disabled:opacity-50 rounded-xl px-4 py-3.5 text-blue-400 text-sm font-bold flex items-center justify-center gap-2"
                      >
                        {isLoggingIn ? (
                          <>
                            <span className="animate-spin">⏳</span>
                            <span>Connexion...</span>
                          </>
                        ) : (
                          <span>Se connecter</span>
                        )}
                      </button>
                    </div>
                  </form>
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
                  ? 'ios26-tab-active text-cyan-400'
                  : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              <div className="text-lg">{'🏆'}</div>
              <span className="text-[10px] font-bold tracking-wide">Classement</span>
            </button>
            <button
              onClick={() => setSelectedTab('match')}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 min-w-[48px] ${
                selectedTab === 'match'
                  ? 'ios26-tab-active text-cyan-400'
                  : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              <div className="text-lg">📅</div>
              <span className="text-[10px] font-bold tracking-wide">Match</span>
            </button>
            <button
              onClick={() => setSelectedTab('palmares')}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 min-w-[48px] ${
                selectedTab === 'palmares'
                  ? 'ios26-tab-active text-cyan-400'
                  : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              <div className="text-lg">🎯</div>
              <span className="text-[10px] font-bold tracking-wide">Palmarès</span>
            </button>
            <button
              onClick={() => setSelectedTab('pantheon')}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 min-w-[48px] ${
                selectedTab === 'pantheon'
                  ? 'ios26-tab-active text-cyan-400'
                  : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              <div className="text-lg">🏅</div>
              <span className="text-[10px] font-bold tracking-wide">Panthéon</span>
            </button>
            <button
              onClick={() => setSelectedTab('stats')}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 min-w-[48px] ${
                selectedTab === 'stats'
                  ? 'ios26-tab-active text-cyan-400'
                  : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              <div className="text-lg">📊</div>
              <span className="text-[10px] font-bold tracking-wide">Stats</span>
            </button>
            <button
              onClick={() => setSelectedTab('reglages')}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 min-w-[48px] ${
                selectedTab === 'reglages'
                  ? 'ios26-tab-active text-cyan-400'
                  : 'text-gray-500 hover:text-gray-400'
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
