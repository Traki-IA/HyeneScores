import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { fetchAppData, importFromJSON, signIn, signOut, getSession, onAuthStateChange, checkIsAdmin, saveManager, saveMatches, deleteManager, updateManagerName, saveSeason, savePenalty, deletePenalty, updateSeasonExempt, saveChampion, updatePantheon } from './lib/supabase';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, Legend } from 'recharts';

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
const HYENES_S6_MATCHDAYS = 64;
const FRANCE_S6_MATCHDAYS = 10;
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

// === CONSTANTES STATS ===
const STATS_CATEGORIES = [
  { id: 'records', icon: '🏅', label: 'Records' },
  { id: 'performance', icon: '📈', label: 'Performance' },
  { id: 'h2h', icon: '⚔️', label: 'H2H' },
  { id: 'trends', icon: '📉', label: 'Évolution' },
  { id: 'homeaway', icon: '🏟️', label: 'Dom/Ext' },
  { id: 'scoring', icon: '⚽', label: 'Buts' }
];

const MANAGER_COLORS = [
  '#22d3ee', '#22c55e', '#eab308', '#f87171', '#a78bfa',
  '#fb923c', '#ec4899', '#14b8a6', '#6366f1', '#84cc16'
];

const EURO_CHAMPIONSHIPS = ['france', 'espagne', 'italie', 'angleterre'];

// Icône de championnat pour les stats
const CHAMP_ICON = { hyenes: '🏆', france: '🇫🇷', spain: '🇪🇸', italy: '🇮🇹', england: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', espagne: '🇪🇸', italie: '🇮🇹', angleterre: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', ligue_hyenes: '🏆' };

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

// === MOTEUR DE CALCUL STATS ===
//
// Mode de calcul :
// - Les stats sont calculées dynamiquement à partir des matchs stockés en base Supabase
// - Filtre par championnat : "Ligue des Hyènes" = matchs des championnats européens (france, espagne, italie, angleterre)
// - Filtre par saison : chaque saison correspond à un numéro (1, 2, 3...), "All time" = toutes les saisons
// - "Matchs joués" (totalGames) = nombre de matchs individuels (5 matchs par journée)
// - "Journées" (totalMatchdays) = nombre de blocs de journée
//
// Procédure de mise à jour :
// - Les données sont alimentées via la page Match (saisie manuelle) ou import JSON
// - Les stats se recalculent automatiquement à chaque changement de filtre ou rafraîchissement des données
// - Auto-refresh toutes les 30 secondes (AUTO_REFRESH_INTERVAL_MS)
// - Aucune mise à jour manuelle des stats n'est nécessaire
//

function getFilteredMatches(appData, champFilter, seasonFilter) {
  if (!appData?.entities?.matches) return [];
  return appData.entities.matches.filter(block => {
    if (!block.games || !Array.isArray(block.games)) return false;
    const champMatch = champFilter === 'all'
      ? !['ligue_hyenes'].includes(block.championship?.toLowerCase())
      : champFilter === 'hyenes'
        ? EURO_CHAMPIONSHIPS.includes(block.championship?.toLowerCase())
        : (block.championship?.toLowerCase() === (CHAMPIONSHIP_MAPPING[champFilter] || champFilter)?.toLowerCase());
    const seasonMatch = seasonFilter === 'all' || Number(block.season) === Number(seasonFilter);
    return champMatch && seasonMatch;
  });
}

function flattenMatches(matchBlocks) {
  const flat = [];
  matchBlocks.forEach(block => {
    if (!block.games) return;
    block.games.forEach(match => {
      const { homeTeam, awayTeam, homeScore, awayScore } = normalizeMatch(match);
      if (homeScore === null || homeScore === undefined || awayScore === null || awayScore === undefined) return;
      const hs = parseInt(homeScore), as2 = parseInt(awayScore);
      if (isNaN(hs) || isNaN(as2)) return;
      flat.push({ homeTeam, awayTeam, homeScore: hs, awayScore: as2, championship: block.championship, season: block.season, matchday: block.matchday });
    });
  });
  return flat;
}

function computeRecords(flatMatches, matchBlocks, appData, champFilter, seasonFilter) {
  // Biggest victories (top 3)
  const biggestWins = [...flatMatches]
    .map(m => ({ ...m, diff: Math.abs(m.homeScore - m.awayScore), total: m.homeScore + m.awayScore, winner: m.homeScore > m.awayScore ? m.homeTeam : m.awayTeam, loser: m.homeScore > m.awayScore ? m.awayTeam : m.homeTeam, winScore: Math.max(m.homeScore, m.awayScore), loseScore: Math.min(m.homeScore, m.awayScore) }))
    .filter(m => m.diff > 0)
    .sort((a, b) => b.diff - a.diff || b.total - a.total)
    .slice(0, 3);

  // Highest scoring matches (top 3)
  const highestScoring = [...flatMatches]
    .map(m => ({ ...m, total: m.homeScore + m.awayScore }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  // Streaks (wins, unbeaten, losses)
  const streaks = computeStreakRecords(matchBlocks);

  // Trophy wins record — computed entirely from match data (source of truth).
  // Standings in appData.entities.seasons are unreliable: they are recomputed
  // in-memory by loadDataFromAppData (useEffect, post-render) but never saved
  // back to Supabase, so every auto-refresh (30s) replaces them with stale data.
  const trophyWins = {};
  const allMatchBlocks = appData?.entities?.matches || [];

  // Group match blocks by (championship, season)
  const champSeasonGroups = {};
  allMatchBlocks.forEach(block => {
    const champ = (block.championship || '').toLowerCase();
    const sNum = Number(block.season);
    if (!champ || !sNum) return;
    const key = `${champ}_${sNum}`;
    if (!champSeasonGroups[key]) champSeasonGroups[key] = { champ, sNum, blocks: [] };
    champSeasonGroups[key].blocks.push(block);
  });

  // Helper: compute the champion (top team by pts > diff > bp) from match blocks
  const findChampionFromBlocks = (blocks) => {
    const stats = {};
    blocks.forEach(block => {
      (block.games || []).forEach(game => {
        const { homeTeam, awayTeam, homeScore, awayScore } = normalizeMatch(game);
        if (homeScore === null || awayScore === null) return;
        const hs = parseInt(homeScore), as2 = parseInt(awayScore);
        if (isNaN(hs) || isNaN(as2) || !homeTeam || !awayTeam) return;
        if (!stats[homeTeam]) stats[homeTeam] = { name: homeTeam, pts: 0, j: 0, diff: 0, bp: 0 };
        if (!stats[awayTeam]) stats[awayTeam] = { name: awayTeam, pts: 0, j: 0, diff: 0, bp: 0 };
        stats[homeTeam].j++; stats[awayTeam].j++;
        stats[homeTeam].bp += hs; stats[awayTeam].bp += as2;
        stats[homeTeam].diff += (hs - as2); stats[awayTeam].diff += (as2 - hs);
        if (hs > as2) { stats[homeTeam].pts += 3; }
        else if (hs < as2) { stats[awayTeam].pts += 3; }
        else { stats[homeTeam].pts += 1; stats[awayTeam].pts += 1; }
      });
    });
    const sorted = Object.values(stats).sort((a, b) => b.pts - a.pts || b.diff - a.diff || b.bp - a.bp);
    return sorted.length > 0 ? sorted[0] : null;
  };

  // Individual championships
  if (champFilter === 'all' || champFilter !== 'hyenes') {
    Object.values(champSeasonGroups).forEach(({ champ, sNum, blocks }) => {
      if (champ === 'ligue_hyenes') return;
      // Apply championship filter
      if (champFilter !== 'all') {
        const mappedChamp = (CHAMPIONSHIP_MAPPING[champFilter] || champFilter).toLowerCase();
        if (champ !== mappedChamp) return;
      }
      if (seasonFilter !== 'all' && sNum !== Number(seasonFilter)) return;

      // Check if season is complete
      const championshipId = Object.entries(CHAMPIONSHIP_MAPPING).find(([, v]) => v.toLowerCase() === champ)?.[0] || champ;
      const isFranceS6 = championshipId === 'france' && sNum === 6;
      const totalMatchdays = isFranceS6 ? FRANCE_S6_MATCHDAYS : STANDARD_MATCHDAYS;
      const playedMatchdays = new Set(blocks.map(b => b.matchday)).size;
      if (!isFranceS6 && playedMatchdays < totalMatchdays) return;

      const champion = findChampionFromBlocks(blocks);
      if (!champion) return;
      if (!trophyWins[champion.name]) trophyWins[champion.name] = { name: champion.name, titles: 0, seasons: [] };
      trophyWins[champion.name].titles++;
      trophyWins[champion.name].seasons.push({ championship: champ, season: sNum });
    });
  }

  // Hyènes league (aggregated from 4 European championships)
  if (champFilter === 'all' || champFilter === 'hyenes') {
    const hyenesSeasonNums = new Set();
    allMatchBlocks.forEach(block => {
      if (EURO_CHAMPIONSHIPS.includes((block.championship || '').toLowerCase())) {
        const sNum = Number(block.season);
        if (sNum) hyenesSeasonNums.add(sNum);
      }
    });

    hyenesSeasonNums.forEach(sNum => {
      if (seasonFilter !== 'all' && sNum !== Number(seasonFilter)) return;
      const isS6 = sNum === 6;
      const totalMatchdays = isS6 ? HYENES_S6_MATCHDAYS : HYENES_MATCHDAYS;

      // Collect all European match blocks for this season and count matchdays
      const allBlocks = [];
      let totalPlayed = 0;
      EURO_CHAMPIONSHIPS.forEach(ec => {
        const entry = champSeasonGroups[`${ec}_${sNum}`];
        if (entry) {
          allBlocks.push(...entry.blocks);
          totalPlayed += new Set(entry.blocks.map(b => b.matchday)).size;
        }
      });
      if (totalPlayed < totalMatchdays) return;

      const champion = findChampionFromBlocks(allBlocks);
      if (!champion) return;
      if (!trophyWins[champion.name]) trophyWins[champion.name] = { name: champion.name, titles: 0, seasons: [] };
      trophyWins[champion.name].titles++;
      trophyWins[champion.name].seasons.push({ championship: 'ligue_hyenes', season: sNum });
    });
  }

  const trophyRanking = Object.values(trophyWins).sort((a, b) => b.titles - a.titles).slice(0, 3);

  return { biggestWins, highestScoring, streaks, trophyRanking };
}

function computeStreakRecords(matchBlocks) {
  const managerMatches = {};
  matchBlocks.forEach(block => {
    if (!block.games) return;
    block.games.forEach(match => {
      const { homeTeam, awayTeam, homeScore, awayScore } = normalizeMatch(match);
      if (homeScore === null || awayScore === null) return;
      const hs = parseInt(homeScore), as2 = parseInt(awayScore);
      if (isNaN(hs) || isNaN(as2)) return;
      // Group by manager + championship + season: streaks are per-championship
      // because matchday numbering is independent per championship (1-18 each)
      const sn = Number(block.season);
      const champ = block.championship || '';
      const key1 = `${homeTeam}_${champ}_${sn}`;
      const key2 = `${awayTeam}_${champ}_${sn}`;
      if (!managerMatches[key1]) managerMatches[key1] = [];
      if (!managerMatches[key2]) managerMatches[key2] = [];
      managerMatches[key1].push({ matchday: block.matchday, result: hs > as2 ? 'W' : hs < as2 ? 'L' : 'D', manager: homeTeam, championship: champ, season: sn });
      managerMatches[key2].push({ matchday: block.matchday, result: as2 > hs ? 'W' : as2 < hs ? 'L' : 'D', manager: awayTeam, championship: champ, season: sn });
    });
  });

  let longestWin = { length: 0 }, longestUnbeaten = { length: 0 }, longestLosing = { length: 0 };

  Object.values(managerMatches).forEach(matches => {
    matches.sort((a, b) => a.matchday - b.matchday);
    let winStreak = 0, unbeatStreak = 0, loseStreak = 0;
    matches.forEach(m => {
      if (m.result === 'W') { winStreak++; unbeatStreak++; loseStreak = 0; }
      else if (m.result === 'D') { winStreak = 0; unbeatStreak++; loseStreak = 0; }
      else { winStreak = 0; unbeatStreak = 0; loseStreak++; }
      if (winStreak > longestWin.length) longestWin = { length: winStreak, manager: m.manager, championship: m.championship, season: m.season };
      if (unbeatStreak > longestUnbeaten.length) longestUnbeaten = { length: unbeatStreak, manager: m.manager, championship: m.championship, season: m.season };
      if (loseStreak > longestLosing.length) longestLosing = { length: loseStreak, manager: m.manager, championship: m.championship, season: m.season };
    });
  });

  return { longestWin, longestUnbeaten, longestLosing };
}

function computePerformance(flatMatches, managers) {
  const stats = {};
  managers.forEach(m => { stats[m] = { name: m, pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0 }; });
  flatMatches.forEach(m => {
    if (!stats[m.homeTeam]) stats[m.homeTeam] = { name: m.homeTeam, pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0 };
    if (!stats[m.awayTeam]) stats[m.awayTeam] = { name: m.awayTeam, pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0 };
    stats[m.homeTeam].j++; stats[m.awayTeam].j++;
    stats[m.homeTeam].bp += m.homeScore; stats[m.homeTeam].bc += m.awayScore;
    stats[m.awayTeam].bp += m.awayScore; stats[m.awayTeam].bc += m.homeScore;
    if (m.homeScore > m.awayScore) { stats[m.homeTeam].pts += 3; stats[m.homeTeam].g++; stats[m.awayTeam].p++; }
    else if (m.homeScore < m.awayScore) { stats[m.awayTeam].pts += 3; stats[m.awayTeam].g++; stats[m.homeTeam].p++; }
    else { stats[m.homeTeam].pts++; stats[m.awayTeam].pts++; stats[m.homeTeam].n++; stats[m.awayTeam].n++; }
  });
  const arr = Object.values(stats).filter(s => s.j >= 3);
  const ppg = [...arr].map(s => ({ ...s, value: (s.pts / s.j).toFixed(2) })).sort((a, b) => b.value - a.value);
  const winRate = [...arr].map(s => ({ ...s, value: ((s.g / s.j) * 100).toFixed(1) })).sort((a, b) => b.value - a.value);
  const attack = [...arr].map(s => ({ ...s, value: (s.bp / s.j).toFixed(2) })).sort((a, b) => b.value - a.value);
  const defense = [...arr].map(s => ({ ...s, value: (s.bc / s.j).toFixed(2) })).sort((a, b) => a.value - b.value);
  return { ppg, winRate, attack, defense };
}

function computeHeadToHead(flatMatches, managers) {
  const h2h = {};
  const h2hMatches = {};
  managers.forEach(a => { h2h[a] = {}; managers.forEach(b => { if (a !== b) { h2h[a][b] = { w: 0, d: 0, l: 0, gf: 0, ga: 0, played: 0 }; h2hMatches[`${a}_${b}`] = []; } }); });
  flatMatches.forEach(m => {
    const h = m.homeTeam, a = m.awayTeam;
    if (!h2h[h]) h2h[h] = {};
    if (!h2h[a]) h2h[a] = {};
    if (!h2h[h][a]) h2h[h][a] = { w: 0, d: 0, l: 0, gf: 0, ga: 0, played: 0 };
    if (!h2h[a][h]) h2h[a][h] = { w: 0, d: 0, l: 0, gf: 0, ga: 0, played: 0 };
    h2h[h][a].played++; h2h[a][h].played++;
    h2h[h][a].gf += m.homeScore; h2h[h][a].ga += m.awayScore;
    h2h[a][h].gf += m.awayScore; h2h[a][h].ga += m.homeScore;
    if (m.homeScore > m.awayScore) { h2h[h][a].w++; h2h[a][h].l++; }
    else if (m.homeScore < m.awayScore) { h2h[a][h].w++; h2h[h][a].l++; }
    else { h2h[h][a].d++; h2h[a][h].d++; }
    // Store match details for detailed view
    const matchDetail = { home: h, away: a, homeScore: m.homeScore, awayScore: m.awayScore, championship: m.championship, season: m.season, matchday: m.matchday };
    const keyHA = `${h}_${a}`;
    const keyAH = `${a}_${h}`;
    if (!h2hMatches[keyHA]) h2hMatches[keyHA] = [];
    if (!h2hMatches[keyAH]) h2hMatches[keyAH] = [];
    h2hMatches[keyHA].push(matchDetail);
    h2hMatches[keyAH].push(matchDetail);
  });
  const activeManagers = managers.filter(m => Object.values(h2h[m] || {}).some(v => v.played > 0));
  return { matrix: h2h, managers: activeManagers, matches: h2hMatches };
}

function computeTrends(appData, managers, champFilter, seasonFilter) {
  // Timeline: for each matchday, cumulative standings
  const timeline = [];
  if (seasonFilter !== 'all' && appData?.entities?.matches) {
    const filtered = appData.entities.matches.filter(block => {
      if (!block.games || !Array.isArray(block.games)) return false;
      const champMatch = champFilter === 'all'
        ? !['ligue_hyenes'].includes(block.championship?.toLowerCase())
        : champFilter === 'hyenes'
          ? EURO_CHAMPIONSHIPS.includes(block.championship?.toLowerCase())
          : (block.championship?.toLowerCase() === (CHAMPIONSHIP_MAPPING[champFilter] || champFilter)?.toLowerCase());
      return champMatch && Number(block.season) === Number(seasonFilter);
    });

    const maxMatchday = Math.max(0, ...filtered.map(b => b.matchday || 0));
    for (let md = 1; md <= maxMatchday; md++) {
      const blocksUpToMd = filtered.filter(b => b.matchday <= md);
      const teamStats = {};
      managers.forEach(m => { teamStats[m] = { pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0 }; });
      blocksUpToMd.forEach(block => {
        block.games.forEach(match => {
          const { homeTeam, awayTeam, homeScore, awayScore } = normalizeMatch(match);
          if (homeScore === null || awayScore === null) return;
          const hs = parseInt(homeScore), as2 = parseInt(awayScore);
          if (isNaN(hs) || isNaN(as2)) return;
          if (!teamStats[homeTeam]) teamStats[homeTeam] = { pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0 };
          if (!teamStats[awayTeam]) teamStats[awayTeam] = { pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0, diff: 0 };
          teamStats[homeTeam].j++; teamStats[awayTeam].j++;
          teamStats[homeTeam].bp += hs; teamStats[homeTeam].bc += as2;
          teamStats[awayTeam].bp += as2; teamStats[awayTeam].bc += hs;
          if (hs > as2) { teamStats[homeTeam].pts += 3; teamStats[homeTeam].g++; teamStats[awayTeam].p++; }
          else if (hs < as2) { teamStats[awayTeam].pts += 3; teamStats[awayTeam].g++; teamStats[homeTeam].p++; }
          else { teamStats[homeTeam].pts++; teamStats[awayTeam].pts++; teamStats[homeTeam].n++; teamStats[awayTeam].n++; }
          teamStats[homeTeam].diff = teamStats[homeTeam].bp - teamStats[homeTeam].bc;
          teamStats[awayTeam].diff = teamStats[awayTeam].bp - teamStats[awayTeam].bc;
        });
      });
      // Calculate positions
      const sorted = Object.entries(teamStats)
        .filter(([, s]) => s.j > 0)
        .sort(([, a], [, b]) => b.pts !== a.pts ? b.pts - a.pts : b.diff !== a.diff ? b.diff - a.diff : b.bp - a.bp);
      const point = { matchday: md };
      sorted.forEach(([name, s], idx) => {
        point[`pts_${name}`] = s.pts;
        point[`pos_${name}`] = idx + 1;
      });
      timeline.push(point);
    }
  }

  return { timeline };
}

function computeHomeAway(flatMatches, managers) {
  const stats = {};
  managers.forEach(m => { stats[m] = { name: m, home: { j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0 }, away: { j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0 } }; });
  flatMatches.forEach(m => {
    if (!stats[m.homeTeam]) stats[m.homeTeam] = { name: m.homeTeam, home: { j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0 }, away: { j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0 } };
    if (!stats[m.awayTeam]) stats[m.awayTeam] = { name: m.awayTeam, home: { j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0 }, away: { j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0 } };
    const h = stats[m.homeTeam].home, a = stats[m.awayTeam].away;
    h.j++; a.j++;
    h.bp += m.homeScore; h.bc += m.awayScore;
    a.bp += m.awayScore; a.bc += m.homeScore;
    if (m.homeScore > m.awayScore) { h.g++; a.p++; }
    else if (m.homeScore < m.awayScore) { a.g++; h.p++; }
    else { h.n++; a.n++; }
  });
  const arr = Object.values(stats).filter(s => s.home.j + s.away.j >= 3);
  const homeWinRate = [...arr].filter(s => s.home.j >= 2).map(s => ({ name: s.name, value: ((s.home.g / s.home.j) * 100).toFixed(1), j: s.home.j })).sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
  const awayWinRate = [...arr].filter(s => s.away.j >= 2).map(s => ({ name: s.name, value: ((s.away.g / s.away.j) * 100).toFixed(1), j: s.away.j })).sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
  const comparison = [...arr].map(s => ({
    name: s.name,
    homeRate: s.home.j > 0 ? ((s.home.g / s.home.j) * 100).toFixed(1) : '0.0',
    awayRate: s.away.j > 0 ? ((s.away.g / s.away.j) * 100).toFixed(1) : '0.0',
    homeJ: s.home.j, awayJ: s.away.j
  })).sort((a, b) => parseFloat(b.homeRate) - parseFloat(a.homeRate));
  return { homeWinRate, awayWinRate, comparison };
}

function computeScoring(flatMatches, matchBlocks, managers) {
  const totalGoals = flatMatches.reduce((s, m) => s + m.homeScore + m.awayScore, 0);
  const totalGames = flatMatches.length;
  const totalMatchdays = matchBlocks.length;
  const avgGoals = totalGames > 0 ? (totalGoals / totalGames).toFixed(2) : '0.00';
  const highScoringRate = totalGames > 0 ? ((flatMatches.filter(m => m.homeScore + m.awayScore >= 4).length / totalGames) * 100).toFixed(1) : '0.0';

  // Clean sheets & failed to score
  const mgrStats = {};
  managers.forEach(m => { mgrStats[m] = { name: m, cleanSheets: 0, failedToScore: 0, j: 0 }; });
  flatMatches.forEach(m => {
    if (!mgrStats[m.homeTeam]) mgrStats[m.homeTeam] = { name: m.homeTeam, cleanSheets: 0, failedToScore: 0, j: 0 };
    if (!mgrStats[m.awayTeam]) mgrStats[m.awayTeam] = { name: m.awayTeam, cleanSheets: 0, failedToScore: 0, j: 0 };
    mgrStats[m.homeTeam].j++; mgrStats[m.awayTeam].j++;
    if (m.awayScore === 0) mgrStats[m.homeTeam].cleanSheets++;
    if (m.homeScore === 0) mgrStats[m.awayTeam].cleanSheets++;
    if (m.homeScore === 0) mgrStats[m.homeTeam].failedToScore++;
    if (m.awayScore === 0) mgrStats[m.awayTeam].failedToScore++;
  });
  const cleanSheets = Object.values(mgrStats).filter(s => s.j >= 3).sort((a, b) => b.cleanSheets - a.cleanSheets);
  const failedToScore = Object.values(mgrStats).filter(s => s.j >= 3).sort((a, b) => b.failedToScore - a.failedToScore);

  // Score distribution
  const scoreDist = {};
  flatMatches.forEach(m => {
    const score = m.homeScore >= m.awayScore ? `${m.homeScore}-${m.awayScore}` : `${m.awayScore}-${m.homeScore}`;
    scoreDist[score] = (scoreDist[score] || 0) + 1;
  });
  const scoreDistArr = Object.entries(scoreDist).map(([score, count]) => ({ score, count })).sort((a, b) => b.count - a.count).slice(0, 10);

  return { totalGoals, totalGames, totalMatchdays, avgGoals, highScoringRate, cleanSheets, failedToScore, scoreDistArr };
}

function computeAllStats(appData, champFilter, seasonFilter) {
  if (!appData?.entities?.matches) return null;
  const matchBlocks = getFilteredMatches(appData, champFilter, seasonFilter);
  const flat = flattenMatches(matchBlocks);
  const managers = appData.entities.managers
    ? Object.values(appData.entities.managers).map(m => m.name).filter(Boolean)
    : [];
  if (flat.length === 0 && managers.length === 0) return null;

  return {
    records: computeRecords(flat, matchBlocks, appData, champFilter, seasonFilter),
    performance: computePerformance(flat, managers),
    h2h: computeHeadToHead(flat, managers),
    trends: computeTrends(appData, managers, champFilter, seasonFilter),
    homeAway: computeHomeAway(flat, managers),
    scoring: computeScoring(flat, matchBlocks, managers)
  };
}

export default function HyeneScores() {
  const [selectedTab, setSelectedTab] = useState('classement');
  const selectedTabRef = useRef('classement');
  const fileInputRef = useRef(null);

  // États Authentification
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const isAdminRef = useRef(false);
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

  // Nombre de journées dynamique selon le championnat et la saison
  const getJourneesForChampionship = (championship, season) => {
    const isS6 = season === '6';
    let count;
    if (championship === 'hyenes') {
      count = isS6 ? HYENES_S6_MATCHDAYS : HYENES_MATCHDAYS;
    } else if (championship === 'france' && isS6) {
      count = FRANCE_S6_MATCHDAYS;
    } else {
      count = STANDARD_MATCHDAYS;
    }
    return Array.from({ length: count }, (_, i) => (i + 1).toString());
  };

  const journees = getJourneesForChampionship(selectedChampionship, selectedSeason);

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

  // États Stats
  const [statsChampionship, setStatsChampionship] = useState('hyenes');
  const [statsSeason, setStatsSeason] = useState('all');
  const [statsCategory, setStatsCategory] = useState('records');
  const [visibleManagers, setVisibleManagers] = useState(new Set());
  const [timelineMode, setTimelineMode] = useState('points');
  const [h2hTeamA, setH2hTeamA] = useState(null);
  const [h2hTeamB, setH2hTeamB] = useState(null);
  const [isStatsChampOpen, setIsStatsChampOpen] = useState(false);
  const [isStatsSeasonOpen, setIsStatsSeasonOpen] = useState(false);
  const [isH2hDropdownAOpen, setIsH2hDropdownAOpen] = useState(false);
  const [isH2hDropdownBOpen, setIsH2hDropdownBOpen] = useState(false);
  const [isEvoTeamDropdownOpen, setIsEvoTeamDropdownOpen] = useState(false);

  // Compute stats only when on the stats tab
  const statsResult = useMemo(() => {
    if (selectedTab !== 'stats' || !appData) return null;
    return computeAllStats(appData, statsChampionship, statsSeason);
  }, [selectedTab, appData, statsChampionship, statsSeason]);

  // Initialize visible managers when stats data changes
  useEffect(() => {
    if (statsResult?.trends?.timeline?.length > 0 && appData?.entities?.managers) {
      const mgrs = Object.values(appData.entities.managers).map(m => m.name).filter(Boolean);
      setVisibleManagers(prev => prev.size === 0 ? new Set(mgrs) : prev);
    }
  }, [statsResult, appData]);

  // Get available seasons list for stats filter
  const availableSeasons = useMemo(() => {
    if (!appData?.entities?.seasons) return [];
    const nums = new Set();
    Object.values(appData.entities.seasons).forEach(s => { if (s.season) nums.add(s.season); });
    return [...nums].sort((a, b) => a - b);
  }, [appData]);

  // Auto-select latest season when switching to Evolution tab with "All time"
  useEffect(() => {
    if (statsCategory === 'trends' && statsSeason === 'all' && availableSeasons.length > 0) {
      setStatsSeason(String(availableSeasons[availableSeasons.length - 1]));
    }
  }, [statsCategory, availableSeasons]);

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
          currentMatchday += new Set(champMatches.map(b => b.matchday)).size;
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

        // France S6 : système de binômes - les équipes avec stats identiques partagent le même rang
        const isFranceS6Standings = championship === 'france' && season === '6';
        let currentPos = 1;

        standings = sortedTeams.map((team, index) => {
          if (isFranceS6Standings && index > 0) {
            const prev = sortedTeams[index - 1];
            if (prev.effectivePts !== team.effectivePts || prev.diff !== team.diff) {
              currentPos++;
            }
          } else if (!isFranceS6Standings) {
            currentPos = index + 1;
          }
          return {
            pos: currentPos,
            mgr: team.name,
            pts: team.pts,
            j: team.j,
            g: team.g,
            n: team.n,
            p: team.p,
            bp: team.bp,
            bc: team.bc,
            diff: team.diff
          };
        });
      } else {
        // Pas de données de matchs - utiliser les standings sauvegardés
        standings = savedStandings;
      }

      // Mettre à jour les standings dans data pour que Palmarès/Panthéon voient les données recalculées
      if (data.entities.seasons[seasonKey]) {
        data.entities.seasons[seasonKey].standings = standings;
        // Stocker le nombre de journées distinctes jouées (pas le max, pour détecter les trous)
        if (allSeasonMatches.length > 0) {
          data.entities.seasons[seasonKey].playedMatchdays = new Set(allSeasonMatches.map(b => b.matchday)).size;
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
      // Cas spécial S6 : France a 10 journées, donc Ligue des Hyènes S6 = 64 (10+18+18+18)
      const isS6 = season === '6';
      const isFranceS6 = championship === 'france' && isS6;
      const isHyenesS6 = championship === 'hyenes' && isS6;
      const totalMatchdays = championship === 'hyenes'
        ? (isHyenesS6 ? HYENES_S6_MATCHDAYS : HYENES_MATCHDAYS)
        : (isFranceS6 ? FRANCE_S6_MATCHDAYS : STANDARD_MATCHDAYS);
      // Compter les journées distinctes réellement saisies (pas le max, pour détecter les trous)
      const currentMatchday = allSeasonMatches.length > 0
        ? new Set(allSeasonMatches.map(b => b.matchday)).size
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
            playedMatchdays += new Set(champMatches.map(b => b.matchday)).size;
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
            playedMatchdays = new Set(champMatches.map(b => b.matchday)).size;
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
            // Cas spécial S6 : France a 10 journées, Ligue des Hyènes S6 = 64
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
                const firstTeam = standings[0];
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
        'ligue_hyenes': { field: 'trophies', totalMatchdays: HYENES_MATCHDAYS, s6Matchdays: HYENES_S6_MATCHDAYS },
        'france': { field: 'france', totalMatchdays: STANDARD_MATCHDAYS, s6Matchdays: FRANCE_S6_MATCHDAYS },
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
          // Déterminer le runner-up (3e au classement, après les deux co-champions)
          const franceS6Teams = standings.map(team => {
            const teamName = team.mgr || team.name || '?';
            const penalty = getTeamPenaltyLocal(teamName, championshipName, seasonNum);
            const pts = team.pts || team.points || 0;
            return { name: teamName, effectivePts: pts - penalty, diff: team.diff };
          });
          franceS6Teams.sort((a, b) => {
            if (b.effectivePts !== a.effectivePts) return b.effectivePts - a.effectivePts;
            const diffA = parseInt(String(a.diff).replace('+', '')) || 0;
            const diffB = parseInt(String(b.diff).replace('+', '')) || 0;
            return diffB - diffA;
          });
          // Trouver tous les runner-ups ex-aequo (même pts et diff après les co-champions)
          const remainingTeams = franceS6Teams.filter(t => t.name !== 'BimBam' && t.name !== 'Warnaque');
          const firstRunnerUp = remainingTeams[0];
          let runnerUpName = null;
          if (firstRunnerUp) {
            const firstDiff = parseInt(String(firstRunnerUp.diff).replace('+', '')) || 0;
            const coRunnerUps = remainingTeams.filter(t => {
              const tDiff = parseInt(String(t.diff).replace('+', '')) || 0;
              return t.effectivePts === firstRunnerUp.effectivePts && tDiff === firstDiff;
            });
            runnerUpName = coRunnerUps.map(t => t.name).join(' / ');
          }
          allChampionsForDb.push({ championship: championshipName, season: parseInt(seasonNum), champion: 'BimBam / Warnaque', runnerUp: runnerUpName });
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

      // Convertir en tableau et trier : priorité Ligue des Hyènes, puis total de trophées
      const pantheon = Object.values(trophyCount)
        .sort((a, b) => {
          // 1. Priorité aux trophées Ligue des Hyènes (championnat le plus prestigieux)
          if (b.trophies !== a.trophies) return b.trophies - a.trophies;
          // 2. Départage par nombre total de trophées
          return b.total - a.total;
        })
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
          ...pantheon.map(p =>
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
      // Désactiver l'auto-refresh quand l'admin est sur l'onglet Matchs
      // Seules les sauvegardes explicites (debounce) écrivent vers Supabase
      if (!isInitial && selectedTabRef.current === 'match' && isAdminRef.current) {
        return;
      }
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

  // Synchroniser les refs avec le state pour que le setInterval y accède
  useEffect(() => {
    selectedTabRef.current = selectedTab;
    // Libérer le verrou Service Worker quand on quitte l'onglet Matchs
    if (selectedTab !== 'match') {
      window.__hyeneFormDirty = false;
    }
  }, [selectedTab]);
  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

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
      window.__hyeneFormDirty = true;
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
    const sorted = [...teams]
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
      });

    // France S6 : système de binômes - les équipes avec stats identiques partagent le même rang
    const isFranceS6 = selectedChampionship === 'france' && selectedSeason === '6';

    if (isFranceS6) {
      let currentRank = 1;
      return sorted.map((team, index) => {
        if (index > 0) {
          const prev = sorted[index - 1];
          const prevDiff = parseInt(String(prev.diff).replace('+', '')) || 0;
          const currDiff = parseInt(String(team.diff).replace('+', '')) || 0;
          if (prev.effectivePts !== team.effectivePts || prevDiff !== currDiff) {
            currentRank++;
          }
        }
        return { ...team, displayRank: currentRank };
      });
    }

    return sorted.map((team, index) => ({
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
              'ligue_hyenes': { field: 'trophies', totalMatchdays: HYENES_MATCHDAYS, s6Matchdays: HYENES_S6_MATCHDAYS },
              'france': { field: 'france', totalMatchdays: STANDARD_MATCHDAYS, s6Matchdays: FRANCE_S6_MATCHDAYS },
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
      const distinctMatchdays = new Set([...allSeasonMatches.map(b => b.matchday), parseInt(selectedJournee)]);
      const currentMatchday = distinctMatchdays.size;
      const totalMatchdays = 18;
      setSeasonProgress({
        currentMatchday,
        totalMatchdays,
        percentage: parseFloat(((currentMatchday / totalMatchdays) * 100).toFixed(1))
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
    window.__hyeneFormDirty = true;
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
                        <div className="absolute right-0 top-full mt-2 ios26-dropdown rounded-2xl z-50 w-36 max-h-72 overflow-y-auto">
                          {[...seasons].reverse().map(season => (
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
                        <div className="absolute right-0 top-full mt-2 ios26-dropdown rounded-2xl z-50 w-36 max-h-72 overflow-y-auto">
                          {[...seasons].reverse().map(season => (
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
                  <div className="col-span-1 flex justify-center text-yellow-500 text-sm font-bold tracking-widest">
                    <div className="text-lg glow-gold">🏆</div>
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
                        <span className={`text-base font-bold ${team.trophies > 0 ? 'text-yellow-500 glow-gold' : 'text-gray-500'}`}>{team.trophies}</span>
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

      {/* STATS */}
      {selectedTab === 'stats' && (
        <div className="h-full flex flex-col ios26-vibrancy pb-20">
          {/* Header */}
          <div className="px-2 pt-2 flex-shrink-0">
            <div className="ios26-header rounded-xl py-2 text-center">
              <h1 className="text-cyan-400 text-2xl font-extrabold tracking-widest glow-cyan">STATISTIQUES</h1>
            </div>
          </div>

          <div className="flex-1 px-2 overflow-y-auto">
            {/* Selectors — même style que Classement */}
            <div className="py-2 relative">
              <div className="flex items-stretch gap-3">
                {/* Championship dropdown */}
                <div className="flex-1 relative">
                  <button
                    onClick={() => { setIsStatsChampOpen(!isStatsChampOpen); setIsStatsSeasonOpen(false); }}
                    className={`w-full h-12 ios26-btn rounded-xl px-4 text-white text-base font-semibold cursor-pointer flex items-center justify-between ${isStatsChampOpen ? 'border-cyan-500/50' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{championships.find(c => c.id === statsChampionship)?.icon}</span>
                      <span className="truncate">{championships.find(c => c.id === statsChampionship)?.name}</span>
                    </div>
                    <svg className={`w-5 h-5 text-cyan-400 flex-shrink-0 transition-transform ${isStatsChampOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isStatsChampOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsStatsChampOpen(false)}></div>
                      <div className="absolute left-0 right-0 top-full mt-2 ios26-dropdown rounded-2xl z-50 overflow-hidden">
                        {championships.map(champ => (
                          <button
                            key={champ.id}
                            onClick={() => { setStatsChampionship(champ.id); setIsStatsChampOpen(false); }}
                            className={`w-full px-4 py-3 text-base font-semibold text-left flex items-center gap-3 ${statsChampionship === champ.id ? 'bg-cyan-500/20 text-cyan-400' : 'text-white hover:bg-white/10'}`}
                          >
                            <span className="text-2xl">{champ.icon}</span>
                            <span>{champ.name}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Season dropdown */}
                <div className="w-32 relative">
                  <button
                    onClick={() => { setIsStatsSeasonOpen(!isStatsSeasonOpen); setIsStatsChampOpen(false); }}
                    className={`w-full h-12 ios26-btn rounded-xl px-4 text-white text-base font-semibold cursor-pointer flex items-center justify-between ${isStatsSeasonOpen ? 'border-cyan-500/50' : ''}`}
                  >
                    <span>{statsSeason === 'all' ? 'All time' : `Saison ${statsSeason}`}</span>
                    <svg className={`w-5 h-5 text-cyan-400 flex-shrink-0 transition-transform ${isStatsSeasonOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isStatsSeasonOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsStatsSeasonOpen(false)}></div>
                      <div className="absolute right-0 top-full mt-2 ios26-dropdown rounded-2xl z-50 w-36 max-h-72 overflow-y-auto">
                        {statsCategory !== 'trends' && (
                          <button
                            onClick={() => { setStatsSeason('all'); setIsStatsSeasonOpen(false); }}
                            className={`w-full px-4 py-3 text-base font-semibold text-left ${statsSeason === 'all' ? 'bg-cyan-500/20 text-cyan-400' : 'text-white hover:bg-white/10'}`}
                          >
                            All time
                          </button>
                        )}
                        {[...availableSeasons].reverse().map(s => (
                          <button
                            key={s}
                            onClick={() => { setStatsSeason(String(s)); setIsStatsSeasonOpen(false); }}
                            className={`w-full px-4 py-3 text-base font-semibold text-left ${statsSeason === String(s) ? 'bg-cyan-500/20 text-cyan-400' : 'text-white hover:bg-white/10'}`}
                          >
                            Saison {s}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Category Selector */}
            <div className="flex gap-1.5 overflow-x-auto py-1 scrollbar-hide">
              {STATS_CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => setStatsCategory(cat.id)} className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${statsCategory === cat.id ? 'ios26-tab-active text-cyan-400' : 'ios26-btn text-gray-500'}`}>
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>

            {/* Category Content */}
            {!statsResult ? (
              <div className="text-center py-12 text-gray-500 text-sm">Aucune donnée disponible</div>
            ) : (
              <div className="space-y-2 pt-2 pb-20">

                {/* === RECORDS === */}
                {statsCategory === 'records' && statsResult.records && (
                  <>
                    {/* Trophy Wins */}
                    {statsResult.records.trophyRanking.length > 0 && (
                      <div className="ios26-card rounded-xl px-4 py-3">
                        <h3 className="text-yellow-400 text-sm font-extrabold mb-2">🏆 Palmarès des Trophées</h3>
                        {statsResult.records.trophyRanking.map((t, i) => (
                          <div key={i} className={`flex items-center py-2 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                            <span className="text-lg w-8 flex-shrink-0 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                            <span className={`flex-1 font-bold text-sm truncate ${i === 0 ? 'text-yellow-400' : 'text-gray-300'}`}>{t.name}</span>
                            <span className={`font-extrabold text-lg w-8 text-right flex-shrink-0 ${i === 0 ? 'text-yellow-400' : 'text-cyan-400'}`}>{t.titles}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Biggest Wins */}
                    <div className="ios26-card rounded-xl px-4 py-3">
                      <h3 className="text-cyan-400 text-sm font-extrabold mb-1">🥊 Plus Larges Victoires</h3>
                      {statsResult.records.biggestWins.length === 0 ? (
                        <p className="text-gray-500 text-sm">Aucun résultat</p>
                      ) : statsResult.records.biggestWins.map((m, i) => (
                        <div key={i} className={`py-2 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                          <div className="flex items-center">
                            <span className={`font-extrabold text-sm w-6 flex-shrink-0 ${i === 0 ? 'text-yellow-400' : 'text-gray-500'}`}>{i + 1}.</span>
                            <span className={`flex-1 text-right font-bold text-sm truncate ${i === 0 ? 'text-yellow-400' : 'text-gray-200'}`}>{m.homeTeam}</span>
                            <span className="flex-shrink-0 mx-2 font-extrabold text-base text-center w-16"><span className={m.homeScore > m.awayScore ? 'text-green-400' : 'text-red-400'}>{m.homeScore}</span> - <span className={m.awayScore > m.homeScore ? 'text-green-400' : 'text-red-400'}>{m.awayScore}</span></span>
                            <span className={`flex-1 text-left font-bold text-sm truncate ${i === 0 ? 'text-yellow-400' : 'text-gray-200'}`}>{m.awayTeam}</span>
                          </div>
                          <div className="text-gray-500 text-xs text-center mt-0.5">{CHAMP_ICON[m.championship] || ''} Saison {m.season} — Journée {m.matchday}</div>
                        </div>
                      ))}
                    </div>

                    {/* Highest Scoring */}
                    <div className="ios26-card rounded-xl px-4 py-3">
                      <h3 className="text-cyan-400 text-sm font-extrabold mb-1">⚡ Matchs les Plus Prolifiques</h3>
                      {statsResult.records.highestScoring.map((m, i) => (
                        <div key={i} className={`py-2 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                          <div className="flex items-center">
                            <span className={`font-extrabold text-sm w-6 flex-shrink-0 ${i === 0 ? 'text-yellow-400' : 'text-gray-500'}`}>{i + 1}.</span>
                            <span className={`flex-1 text-right font-bold text-sm truncate ${i === 0 ? 'text-yellow-400' : 'text-gray-200'}`}>{m.homeTeam}</span>
                            <span className="flex-shrink-0 mx-2 font-extrabold text-base text-center w-16"><span className="text-cyan-400">{m.homeScore}</span> - <span className="text-cyan-400">{m.awayScore}</span></span>
                            <span className={`flex-1 text-left font-bold text-sm truncate ${i === 0 ? 'text-yellow-400' : 'text-gray-200'}`}>{m.awayTeam}</span>
                          </div>
                          <div className="text-gray-500 text-xs text-center mt-0.5">{CHAMP_ICON[m.championship] || ''} Saison {m.season} — <span className="text-cyan-400 font-bold">{m.total} buts</span></div>
                        </div>
                      ))}
                    </div>

                    {/* Streaks */}
                    <div className="ios26-card rounded-xl px-4 py-3">
                      <h3 className="text-cyan-400 text-sm font-extrabold mb-2">🔥 Records de Séries</h3>
                      <div className="space-y-3">
                        {statsResult.records.streaks.longestWin.length > 0 && (
                          <div>
                            <div className="text-green-400 font-bold text-xs mb-0.5">Victoires consécutives</div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-green-400 font-extrabold text-xl">{statsResult.records.streaks.longestWin.length}</span>
                              <span className="text-gray-300 text-sm font-semibold">{statsResult.records.streaks.longestWin.manager}</span>
                              <span className="text-gray-500 text-xs ml-auto">{CHAMP_ICON[statsResult.records.streaks.longestWin.championship] || ''} S{statsResult.records.streaks.longestWin.season}</span>
                            </div>
                          </div>
                        )}
                        {statsResult.records.streaks.longestUnbeaten.length > 0 && (
                          <div>
                            <div className="text-cyan-400 font-bold text-xs mb-0.5">Invincibilité</div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-cyan-400 font-extrabold text-xl">{statsResult.records.streaks.longestUnbeaten.length}</span>
                              <span className="text-gray-300 text-sm font-semibold">{statsResult.records.streaks.longestUnbeaten.manager}</span>
                              <span className="text-gray-500 text-xs ml-auto">{CHAMP_ICON[statsResult.records.streaks.longestUnbeaten.championship] || ''} S{statsResult.records.streaks.longestUnbeaten.season}</span>
                            </div>
                          </div>
                        )}
                        {statsResult.records.streaks.longestLosing.length > 0 && (
                          <div>
                            <div className="text-red-400 font-bold text-xs mb-0.5">Défaites consécutives</div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-red-400 font-extrabold text-xl">{statsResult.records.streaks.longestLosing.length}</span>
                              <span className="text-gray-300 text-sm font-semibold">{statsResult.records.streaks.longestLosing.manager}</span>
                              <span className="text-gray-500 text-xs ml-auto">{CHAMP_ICON[statsResult.records.streaks.longestLosing.championship] || ''} S{statsResult.records.streaks.longestLosing.season}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* === PERFORMANCES === */}
                {statsCategory === 'performance' && statsResult.performance && (() => {
                  const maxAttack = Math.max(1, ...statsResult.performance.attack.map(s => parseFloat(s.value)));
                  const maxDefense = Math.max(1, ...statsResult.performance.defense.map(s => parseFloat(s.value)));
                  return (
                  <>
                    {/* Points per game */}
                    <div className="ios26-card rounded-xl p-3">
                      <h3 className="text-cyan-400 text-sm font-bold mb-2">📊 Points Par Match</h3>
                      {statsResult.performance.ppg.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 text-xs">
                          <span className="text-gray-500 w-5 font-bold">{i + 1}.</span>
                          <span className="text-gray-300 w-24 truncate font-semibold">{s.name}</span>
                          <div className="flex-1 h-5 rounded-full overflow-hidden bg-white/5">
                            <div className="stats-bar h-full rounded-full" style={{ width: `${Math.min(100, (parseFloat(s.value) / 3) * 100)}%`, background: 'linear-gradient(90deg, rgba(34,211,238,0.4), rgba(34,211,238,0.7))' }} />
                          </div>
                          <span className="text-cyan-400 font-bold w-10 text-right">{s.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Win Rate */}
                    <div className="ios26-card rounded-xl p-3">
                      <h3 className="text-green-400 text-sm font-bold mb-2">🏆 Taux de Victoire</h3>
                      {statsResult.performance.winRate.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 text-xs">
                          <span className="text-gray-500 w-5 font-bold">{i + 1}.</span>
                          <span className="text-gray-300 w-24 truncate font-semibold">{s.name}</span>
                          <div className="flex-1 h-5 rounded-full overflow-hidden bg-white/5">
                            <div className="stats-bar h-full rounded-full" style={{ width: `${Math.min(100, parseFloat(s.value))}%`, background: `linear-gradient(90deg, rgba(34,197,94,0.4), rgba(34,197,94,0.7))` }} />
                          </div>
                          <span className="text-green-400 font-bold w-12 text-right">{s.value}%</span>
                        </div>
                      ))}
                    </div>

                    {/* Attack Rating */}
                    <div className="ios26-card rounded-xl p-3">
                      <h3 className="text-cyan-400 text-sm font-bold mb-2">⚔️ Classement Offensif <span className="text-gray-500 font-normal">(buts/match)</span></h3>
                      {statsResult.performance.attack.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 text-xs">
                          <span className="text-gray-500 w-5 font-bold">{i + 1}.</span>
                          <span className="text-gray-300 w-24 truncate font-semibold">{s.name}</span>
                          <div className="flex-1 h-5 rounded-full overflow-hidden bg-white/5">
                            <div className="stats-bar h-full rounded-full" style={{ width: `${Math.min(100, (parseFloat(s.value) / maxAttack) * 100)}%`, background: 'linear-gradient(90deg, rgba(34,211,238,0.4), rgba(34,211,238,0.7))' }} />
                          </div>
                          <span className="text-cyan-400 font-bold w-10 text-right">{s.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Defense Rating */}
                    <div className="ios26-card rounded-xl p-3">
                      <h3 className="text-green-400 text-sm font-bold mb-2">🛡️ Classement Défensif <span className="text-gray-500 font-normal">(buts encaissés/match)</span></h3>
                      {statsResult.performance.defense.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 text-xs">
                          <span className="text-gray-500 w-5 font-bold">{i + 1}.</span>
                          <span className="text-gray-300 w-24 truncate font-semibold">{s.name}</span>
                          <div className="flex-1 h-5 rounded-full overflow-hidden bg-white/5">
                            <div className="stats-bar h-full rounded-full" style={{ width: `${Math.min(100, (parseFloat(s.value) / maxDefense) * 100)}%`, background: `linear-gradient(90deg, rgba(${parseFloat(s.value) < 1.5 ? '34,197,94' : parseFloat(s.value) < 2.5 ? '234,179,8' : '248,113,113'},0.4), rgba(${parseFloat(s.value) < 1.5 ? '34,197,94' : parseFloat(s.value) < 2.5 ? '234,179,8' : '248,113,113'},0.7))` }} />
                          </div>
                          <span className={`font-bold w-10 text-right ${parseFloat(s.value) < 1.5 ? 'text-green-400' : parseFloat(s.value) < 2.5 ? 'text-yellow-400' : 'text-red-400'}`}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                  );
                })()}

                {/* === HEAD TO HEAD === */}
                {statsCategory === 'h2h' && statsResult.h2h && (
                  <>
                    {statsResult.h2h.managers.length === 0 ? (
                      <div className="ios26-card rounded-xl p-3">
                        <p className="text-gray-500 text-xs text-center">Aucune confrontation disponible</p>
                      </div>
                    ) : (
                      <>
                        {/* Team selectors - two side-by-side dropdowns */}
                        <div className="ios26-card rounded-xl p-3">
                          <div className="flex gap-2">
                            {/* Team A dropdown */}
                            <div className="flex-1 relative">
                              <button
                                onClick={() => { setIsH2hDropdownAOpen(!isH2hDropdownAOpen); setIsH2hDropdownBOpen(false); }}
                                className={`w-full h-10 ios26-btn rounded-xl px-3 text-sm font-bold cursor-pointer flex items-center justify-between ${isH2hDropdownAOpen ? 'border-cyan-500/50' : ''}`}
                              >
                                <span className={h2hTeamA ? 'text-cyan-400' : 'text-gray-500'}>{h2hTeamA || 'Équipe 1'}</span>
                                <svg className={`w-4 h-4 text-cyan-400 flex-shrink-0 transition-transform ${isH2hDropdownAOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              {isH2hDropdownAOpen && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setIsH2hDropdownAOpen(false)}></div>
                                  <div className="absolute left-0 right-0 top-full mt-1 ios26-dropdown rounded-xl z-50 max-h-60 overflow-y-auto">
                                    {statsResult.h2h.managers.map(m => (
                                      <button key={m} onClick={() => { setH2hTeamA(m); setIsH2hDropdownAOpen(false); if (h2hTeamB === m) setH2hTeamB(null); }}
                                        className={`w-full px-3 py-2.5 text-sm font-semibold text-left ${h2hTeamA === m ? 'bg-cyan-500/20 text-cyan-400' : 'text-white hover:bg-white/10'}`}>
                                        {m}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>

                            <span className="text-gray-500 text-xs font-bold self-center">vs</span>

                            {/* Team B dropdown */}
                            <div className="flex-1 relative">
                              <button
                                onClick={() => { if (h2hTeamA) { setIsH2hDropdownBOpen(!isH2hDropdownBOpen); setIsH2hDropdownAOpen(false); } }}
                                className={`w-full h-10 ios26-btn rounded-xl px-3 text-sm font-bold cursor-pointer flex items-center justify-between ${!h2hTeamA ? 'opacity-50 cursor-not-allowed' : ''} ${isH2hDropdownBOpen ? 'border-orange-500/50' : ''}`}
                              >
                                <span className={h2hTeamB ? 'text-orange-400' : 'text-gray-500'}>{h2hTeamB || 'Équipe 2'}</span>
                                <svg className={`w-4 h-4 text-orange-400 flex-shrink-0 transition-transform ${isH2hDropdownBOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              {isH2hDropdownBOpen && h2hTeamA && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setIsH2hDropdownBOpen(false)}></div>
                                  <div className="absolute left-0 right-0 top-full mt-1 ios26-dropdown rounded-xl z-50 max-h-60 overflow-y-auto">
                                    {statsResult.h2h.managers.filter(m => m !== h2hTeamA).map(m => {
                                      const rec = statsResult.h2h.matrix[h2hTeamA]?.[m];
                                      const hasMatches = rec && rec.played > 0;
                                      return (
                                        <button key={m} onClick={() => { if (hasMatches) { setH2hTeamB(m); setIsH2hDropdownBOpen(false); } }}
                                          className={`w-full px-3 py-2.5 text-sm font-semibold text-left ${h2hTeamB === m ? 'bg-orange-500/20 text-orange-400' : hasMatches ? 'text-white hover:bg-white/10' : 'text-gray-600 opacity-50 cursor-not-allowed'}`}>
                                          {m} {hasMatches ? <span className="text-gray-600 text-[10px]">({rec.played})</span> : ''}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Detailed H2H view when both teams selected */}
                        {h2hTeamA && h2hTeamB && (() => {
                          const rec = statsResult.h2h.matrix[h2hTeamA]?.[h2hTeamB];
                          const recB = statsResult.h2h.matrix[h2hTeamB]?.[h2hTeamA];
                          if (!rec || rec.played === 0) return null;
                          const matchList = (statsResult.h2h.matches[`${h2hTeamA}_${h2hTeamB}`] || []).sort((a, b) => b.season !== a.season ? b.season - a.season : b.matchday - a.matchday);
                          const totalGames = rec.played;
                          const winPctA = totalGames > 0 ? ((rec.w / totalGames) * 100).toFixed(0) : 0;
                          const drawPct = totalGames > 0 ? ((rec.d / totalGames) * 100).toFixed(0) : 0;
                          const winPctB = totalGames > 0 ? ((rec.l / totalGames) * 100).toFixed(0) : 0;
                          return (
                            <>
                              {/* Summary card */}
                              <div className="ios26-card rounded-xl p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-cyan-400 font-extrabold text-sm">{h2hTeamA}</span>
                                  <span className="text-gray-500 text-xs font-bold">vs</span>
                                  <span className="text-orange-400 font-extrabold text-sm">{h2hTeamB}</span>
                                </div>

                                {/* Record bar */}
                                <div className="flex h-3 rounded-full overflow-hidden mb-2">
                                  {rec.w > 0 && <div className="bg-green-500/70 transition-all" style={{ width: `${winPctA}%` }} />}
                                  {rec.d > 0 && <div className="bg-gray-500/70 transition-all" style={{ width: `${drawPct}%` }} />}
                                  {rec.l > 0 && <div className="bg-red-500/70 transition-all" style={{ width: `${winPctB}%` }} />}
                                </div>
                                <div className="flex items-center justify-between text-[10px] mb-3">
                                  <span className="text-green-400 font-bold">{rec.w}V ({winPctA}%)</span>
                                  <span className="text-gray-400 font-bold">{rec.d}N ({drawPct}%)</span>
                                  <span className="text-red-400 font-bold">{rec.l}D ({winPctB}%)</span>
                                </div>

                                {/* Stats comparison */}
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-cyan-400 font-bold w-8 text-left">{rec.gf}</span>
                                    <span className="text-gray-500 flex-1 text-center text-[10px]">Buts marqués</span>
                                    <span className="text-orange-400 font-bold w-8 text-right">{recB.gf}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-cyan-400 font-bold w-8 text-left">{rec.ga}</span>
                                    <span className="text-gray-500 flex-1 text-center text-[10px]">Buts encaissés</span>
                                    <span className="text-orange-400 font-bold w-8 text-right">{recB.ga}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-cyan-400 font-bold w-8 text-left">{totalGames > 0 ? (rec.gf / totalGames).toFixed(1) : '0'}</span>
                                    <span className="text-gray-500 flex-1 text-center text-[10px]">Moyenne buts/match</span>
                                    <span className="text-orange-400 font-bold w-8 text-right">{totalGames > 0 ? (recB.gf / totalGames).toFixed(1) : '0'}</span>
                                  </div>
                                </div>

                                <div className="text-center mt-3">
                                  <span className="text-gray-500 text-[10px]">{totalGames} confrontation{totalGames > 1 ? 's' : ''}</span>
                                </div>
                              </div>

                              {/* Match history */}
                              <div className="ios26-card rounded-xl p-3">
                                <h3 className="text-cyan-400 text-sm font-bold mb-2">📋 Historique des Confrontations</h3>
                                {matchList.length === 0 ? (
                                  <p className="text-gray-500 text-xs">Aucun match</p>
                                ) : matchList.map((match, i) => {
                                  const isWinA = (match.home === h2hTeamA && match.homeScore > match.awayScore) || (match.away === h2hTeamA && match.awayScore > match.homeScore);
                                  const isWinB = (match.home === h2hTeamB && match.homeScore > match.awayScore) || (match.away === h2hTeamB && match.awayScore > match.homeScore);
                                  const borderColor = isWinA ? 'border-l-green-500' : isWinB ? 'border-l-red-500' : 'border-l-gray-500';
                                  return (
                                    <div key={i} className={`border-l-2 ${borderColor} pl-2 py-1.5 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className={`font-semibold ${match.home === h2hTeamA ? 'text-cyan-400' : 'text-orange-400'}`}>{match.home}</span>
                                        <span className="font-extrabold text-gray-200 mx-2">{match.homeScore} - {match.awayScore}</span>
                                        <span className={`font-semibold ${match.away === h2hTeamA ? 'text-cyan-400' : 'text-orange-400'}`}>{match.away}</span>
                                      </div>
                                      <div className="text-[10px] text-gray-500 text-center mt-0.5">
                                        {CHAMP_ICON[match.championship] || ''} Saison {match.season} — Journée {match.matchday}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          );
                        })()}

                        {/* Prompt to select teams */}
                        {!h2hTeamA && (
                          <div className="text-center py-4">
                            <p className="text-gray-500 text-xs">Sélectionnez deux équipes pour voir les confrontations directes</p>
                          </div>
                        )}
                        {h2hTeamA && !h2hTeamB && (
                          <div className="text-center py-4">
                            <p className="text-gray-500 text-xs">Sélectionnez l'équipe adverse</p>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* === ÉVOLUTION / TRENDS === */}
                {statsCategory === 'trends' && statsResult.trends && (
                  <>
                    {/* Timeline - matchday by matchday */}
                    {statsSeason !== 'all' && statsResult.trends.timeline.length > 0 ? (
                      <div className="ios26-card rounded-xl px-1.5 py-3">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-cyan-400 text-sm font-bold">📈 Évolution {timelineMode === 'points' ? 'des Points' : 'du Classement'}</h3>
                        </div>

                        {/* Controls: team dropdown + point/position toggle */}
                        <div className="flex gap-2 mb-3">
                          {/* Team multi-select dropdown */}
                          <div className="flex-1 relative">
                            <button
                              onClick={() => setIsEvoTeamDropdownOpen(!isEvoTeamDropdownOpen)}
                              className={`w-full h-9 ios26-btn rounded-xl px-3 text-xs font-bold cursor-pointer flex items-center justify-between ${isEvoTeamDropdownOpen ? 'border-cyan-500/50' : ''}`}
                            >
                              <span className="text-gray-300 truncate">
                                {(() => {
                                  const allMgrs = appData?.entities?.managers ? Object.values(appData.entities.managers).map(m => m.name).filter(Boolean) : [];
                                  if (visibleManagers.size === 0) return 'Aucune équipe';
                                  if (visibleManagers.size === allMgrs.length) return 'Toutes les équipes';
                                  return `${visibleManagers.size} équipe${visibleManagers.size > 1 ? 's' : ''}`;
                                })()}
                              </span>
                              <svg className={`w-4 h-4 text-cyan-400 flex-shrink-0 transition-transform ${isEvoTeamDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {isEvoTeamDropdownOpen && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsEvoTeamDropdownOpen(false)}></div>
                                <div className="absolute left-0 right-0 top-full mt-1 ios26-dropdown rounded-xl z-50 max-h-60 overflow-y-auto">
                                  <button
                                    onClick={() => {
                                      const allMgrs = appData?.entities?.managers ? Object.values(appData.entities.managers).map(m => m.name).filter(Boolean) : [];
                                      setVisibleManagers(prev => prev.size === allMgrs.length ? new Set() : new Set(allMgrs));
                                    }}
                                    className="w-full px-3 py-2 text-xs font-bold text-left text-cyan-400 border-b border-white/10 hover:bg-white/10"
                                  >
                                    {(() => { const allMgrs = appData?.entities?.managers ? Object.values(appData.entities.managers).map(m => m.name).filter(Boolean) : []; return visibleManagers.size === allMgrs.length; })() ? 'Tout désélectionner' : 'Tout sélectionner'}
                                  </button>
                                  {appData?.entities?.managers && Object.values(appData.entities.managers).map((m, idx) => {
                                    if (!m.name) return null;
                                    const isVisible = visibleManagers.has(m.name);
                                    const color = MANAGER_COLORS[idx % MANAGER_COLORS.length];
                                    return (
                                      <button key={m.name} onClick={() => setVisibleManagers(prev => {
                                        const next = new Set(prev);
                                        if (next.has(m.name)) next.delete(m.name); else next.add(m.name);
                                        return next;
                                      })} className="w-full px-3 py-2 text-xs font-semibold text-left flex items-center gap-2 hover:bg-white/10">
                                        <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: isVisible ? color : 'transparent', border: `2px solid ${isVisible ? color : '#555'}` }}></span>
                                        <span style={{ color: isVisible ? color : '#666' }}>{m.name}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </>
                            )}
                          </div>

                          {/* Points / Position toggle buttons */}
                          <div className="flex rounded-xl overflow-hidden flex-shrink-0">
                            <button onClick={() => setTimelineMode('points')} className={`px-3 py-1.5 text-[10px] font-bold transition-all ${timelineMode === 'points' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'ios26-btn text-gray-400'}`} style={{ borderRadius: '12px 0 0 12px' }}>
                              📊 Points
                            </button>
                            <button onClick={() => setTimelineMode('position')} className={`px-3 py-1.5 text-[10px] font-bold transition-all ${timelineMode === 'position' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'ios26-btn text-gray-400'}`} style={{ borderRadius: '0 12px 12px 0' }}>
                              🏆 Position
                            </button>
                          </div>
                        </div>

                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={statsResult.trends.timeline} margin={{ top: 5, right: 0, left: -30, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                              <XAxis dataKey="matchday" tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `J${v}`} />
                              <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} reversed={timelineMode === 'position'} domain={timelineMode === 'position' ? [1, 'auto'] : ['auto', 'auto']} />
                              <Tooltip contentStyle={{ background: 'rgba(20,20,30,0.95)', border: '1px solid rgba(34,211,238,0.3)', borderRadius: '8px', fontSize: '11px', color: '#e5e7eb' }} />
                              {appData?.entities?.managers && Object.values(appData.entities.managers).map((m, idx) => {
                                if (!m.name || !visibleManagers.has(m.name)) return null;
                                const dataKey = timelineMode === 'points' ? `pts_${m.name}` : `pos_${m.name}`;
                                return (
                                  <Line key={m.name} type="monotone" dataKey={dataKey} name={m.name} stroke={MANAGER_COLORS[idx % MANAGER_COLORS.length]} strokeWidth={2} dot={false} connectNulls />
                                );
                              })}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-500 text-xs">Aucune donnée pour cette saison</div>
                    )}
                  </>
                )}

                {/* === HOME / AWAY === */}
                {statsCategory === 'homeaway' && statsResult.homeAway && (
                  <>
                    {/* Comparison */}
                    <div className="ios26-card rounded-xl p-3">
                      <h3 className="text-cyan-400 text-sm font-bold mb-3">🏟️ Taux de Victoire Dom/Ext</h3>
                      <div className="flex items-center justify-end gap-6 mb-2 text-[10px] font-bold">
                        <span className="text-cyan-400">🏠 Domicile</span>
                        <span className="text-orange-400">✈️ Extérieur</span>
                      </div>
                      {statsResult.homeAway.comparison.map((s, i) => (
                        <div key={i} className={`py-2.5 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                          <div className="text-gray-200 font-bold text-xs mb-2">{s.name}</div>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-cyan-400 font-extrabold text-sm w-12 text-right">{s.homeRate}%</span>
                              <div className="flex-1 h-4 rounded-full overflow-hidden bg-white/5">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, parseFloat(s.homeRate))}%`, background: 'linear-gradient(90deg, rgba(34,211,238,0.4), rgba(34,211,238,0.7))' }} />
                              </div>
                              <span className="text-gray-500 text-[10px] w-8 text-right">{s.homeJ}m</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-orange-400 font-extrabold text-sm w-12 text-right">{s.awayRate}%</span>
                              <div className="flex-1 h-4 rounded-full overflow-hidden bg-white/5">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, parseFloat(s.awayRate))}%`, background: 'linear-gradient(90deg, rgba(251,146,60,0.4), rgba(251,146,60,0.7))' }} />
                              </div>
                              <span className="text-gray-500 text-[10px] w-8 text-right">{s.awayJ}m</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Fortress */}
                    <div className="ios26-card rounded-xl p-3">
                      <h3 className="text-cyan-400 text-sm font-bold mb-2">🏰 Forteresses <span className="text-gray-500 font-normal">(meilleur taux domicile)</span></h3>
                      {statsResult.homeAway.homeWinRate.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 text-xs">
                          <span className="text-gray-500 w-5 font-bold">{i + 1}.</span>
                          <span className="text-gray-300 w-24 truncate font-semibold">{s.name}</span>
                          <div className="flex-1 h-4 rounded-full overflow-hidden bg-white/5">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, parseFloat(s.value))}%`, background: 'linear-gradient(90deg, rgba(34,211,238,0.4), rgba(34,211,238,0.7))' }} />
                          </div>
                          <span className="text-cyan-400 font-bold w-12 text-right">{s.value}%</span>
                          <span className="text-gray-600 text-[10px] w-6 text-right">{s.j}m</span>
                        </div>
                      ))}
                    </div>

                    {/* Road Warriors */}
                    <div className="ios26-card rounded-xl p-3">
                      <h3 className="text-orange-400 text-sm font-bold mb-2">✈️ Guerriers d'Extérieur <span className="text-gray-500 font-normal">(meilleur taux extérieur)</span></h3>
                      {statsResult.homeAway.awayWinRate.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 text-xs">
                          <span className="text-gray-500 w-5 font-bold">{i + 1}.</span>
                          <span className="text-gray-300 w-24 truncate font-semibold">{s.name}</span>
                          <div className="flex-1 h-4 rounded-full overflow-hidden bg-white/5">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, parseFloat(s.value))}%`, background: 'linear-gradient(90deg, rgba(251,146,60,0.4), rgba(251,146,60,0.7))' }} />
                          </div>
                          <span className="text-orange-400 font-bold w-12 text-right">{s.value}%</span>
                          <span className="text-gray-600 text-[10px] w-6 text-right">{s.j}m</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* === SCORING === */}
                {statsCategory === 'scoring' && statsResult.scoring && (
                  <>
                    {/* Clean sheets */}
                    <div className="ios26-card rounded-xl p-3">
                      <h3 className="text-green-400 text-sm font-bold mb-2">🧤 Clean Sheets</h3>
                      {statsResult.scoring.cleanSheets.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 text-xs">
                          <span className="text-gray-500 w-5 font-bold">{i + 1}.</span>
                          <span className="text-gray-300 w-24 truncate font-semibold">{s.name}</span>
                          <div className="flex-1 h-4 rounded-full overflow-hidden bg-white/5">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, s.j > 0 ? (s.cleanSheets / s.j) * 100 : 0)}%`, background: 'linear-gradient(90deg, rgba(34,197,94,0.4), rgba(34,197,94,0.7))' }} />
                          </div>
                          <span className="text-green-400 font-bold w-6 text-right">{s.cleanSheets}</span>
                          <span className="text-gray-600 text-[10px] w-8 text-right">{s.j}m</span>
                        </div>
                      ))}
                    </div>

                    {/* Failed to score */}
                    <div className="ios26-card rounded-xl p-3">
                      <h3 className="text-red-400 text-sm font-bold mb-2">❌ Matchs Sans Marquer</h3>
                      {statsResult.scoring.failedToScore.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 text-xs">
                          <span className="text-gray-500 w-5 font-bold">{i + 1}.</span>
                          <span className="text-gray-300 w-24 truncate font-semibold">{s.name}</span>
                          <div className="flex-1 h-4 rounded-full overflow-hidden bg-white/5">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, s.j > 0 ? (s.failedToScore / s.j) * 100 : 0)}%`, background: 'linear-gradient(90deg, rgba(248,113,113,0.4), rgba(248,113,113,0.7))' }} />
                          </div>
                          <span className="text-red-400 font-bold w-6 text-right">{s.failedToScore}</span>
                          <span className="text-gray-600 text-[10px] w-8 text-right">{s.j}m</span>
                        </div>
                      ))}
                    </div>

                    {/* Score Distribution */}
                    <div className="ios26-card rounded-xl p-3">
                      <h3 className="text-cyan-400 text-sm font-bold mb-2">📊 Scores les Plus Fréquents</h3>
                      {statsResult.scoring.scoreDistArr.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 text-xs">
                          <span className="text-gray-300 font-bold w-10 text-center">{s.score}</span>
                          <div className="flex-1 h-4 rounded-full overflow-hidden bg-white/5">
                            <div className="h-full rounded-full" style={{ width: `${(s.count / (statsResult.scoring.scoreDistArr[0]?.count || 1)) * 100}%`, background: 'linear-gradient(90deg, rgba(34,211,238,0.4), rgba(34,211,238,0.7))' }} />
                          </div>
                          <span className="text-cyan-400 font-bold w-8 text-right">{s.count}×</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}


              </div>
            )}
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
