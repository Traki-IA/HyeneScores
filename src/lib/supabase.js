import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Verifier si Supabase est configure
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn('Supabase credentials missing. Check your .env file.');
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// ============================================
// SERVICES POUR LA BASE DE DONNEES
// ============================================

/**
 * Recupere toutes les donnees de l'application
 * Format compatible avec le format v2.0 existant
 */
export async function fetchAppData() {
  // Si Supabase n'est pas configure, retourner des donnees vides
  if (!isSupabaseConfigured || !supabase) {
    console.log('Supabase non configure - mode hors ligne');
    return {
      version: '2.0',
      entities: { managers: {}, seasons: {}, matches: [] },
      palmares: {},
      pantheon: [],
      penalties: {}
    };
  }

  try {
    const [
      { data: managers, error: managersError },
      { data: seasons, error: seasonsError },
      { data: matches, error: matchesError },
      { data: champions, error: championsError },
      { data: pantheon, error: pantheonError },
      { data: penalties, error: penaltiesError }
    ] = await Promise.all([
      supabase.from('managers').select('*'),
      supabase.from('seasons').select('*'),
      supabase.from('matches').select('*').order('matchday', { ascending: true }),
      supabase.from('champions').select('*').order('season', { ascending: true }),
      supabase.from('pantheon').select('*').order('total_points', { ascending: false }),
      supabase.from('penalties').select('*')
    ]);

    // Log les erreurs mais ne pas crasher - les tables peuvent ne pas exister encore
    if (managersError) console.warn('Erreur managers:', managersError.message);
    if (seasonsError) console.warn('Erreur seasons:', seasonsError.message);
    if (matchesError) console.warn('Erreur matches:', matchesError.message);
    if (championsError) console.warn('Erreur champions:', championsError.message);
    if (pantheonError) console.warn('Erreur pantheon:', pantheonError.message);
    if (penaltiesError) console.warn('Erreur penalties:', penaltiesError.message);

    // Transformer en format v2.0 compatible
    const managersMap = {};
    managers?.forEach(m => {
      managersMap[m.id] = { name: m.name, id: m.id };
    });

    const seasonsMap = {};
    seasons?.forEach(s => {
      const key = `${s.championship}_s${s.season_number}`;
      seasonsMap[key] = {
        championship: s.championship,
        season: s.season_number,
        standings: s.standings || []
      };
    });

    // Grouper les matches par championship/season/matchday
    const matchesArray = [];
    const matchGroups = {};
    matches?.forEach(m => {
      const key = `${m.championship}_${m.season}_${m.matchday}`;
      if (!matchGroups[key]) {
        matchGroups[key] = {
          championship: m.championship,
          season: m.season,
          matchday: m.matchday,
          exempt: m.exempt_team || '',
          games: []
        };
      }
      matchGroups[key].games.push({
        id: m.id,
        homeTeam: m.home_team,
        awayTeam: m.away_team,
        homeScore: m.home_score,
        awayScore: m.away_score
      });
    });
    Object.values(matchGroups).forEach(group => matchesArray.push(group));

    // Format palmares
    const palmaresMap = {};
    champions?.forEach(c => {
      if (!palmaresMap[c.championship]) {
        palmaresMap[c.championship] = [];
      }
      palmaresMap[c.championship].push({
        season: c.season,
        champion: c.champion_name,
        runnerUp: c.runner_up_name || ''
      });
    });

    // Format penalties
    const penaltiesMap = {};
    penalties?.forEach(p => {
      const key = `${p.championship}_${p.season}_${p.team_name}`;
      penaltiesMap[key] = p.points;
    });

    return {
      version: '2.0',
      entities: {
        managers: managersMap,
        seasons: seasonsMap,
        matches: matchesArray
      },
      palmares: palmaresMap,
      pantheon: pantheon?.map(p => ({
        name: p.manager_name,
        totalPoints: p.total_points,
        titles: p.titles,
        runnerUps: p.runner_ups
      })) || [],
      penalties: penaltiesMap
    };
  } catch (error) {
    console.error('Erreur lors du chargement des donnees:', error);
    // Retourner des donnees vides en cas d'erreur pour ne pas crasher l'app
    return {
      version: '2.0',
      entities: { managers: {}, seasons: {}, matches: [] },
      palmares: {},
      pantheon: [],
      penalties: {}
    };
  }
}

// ============================================
// FONCTIONS ADMIN (necessitent authentification)
// ============================================

/**
 * Sauvegarde un manager
 */
export async function saveManager(manager) {
  if (!supabase) throw new Error('Supabase non configure');
  const { data, error } = await supabase
    .from('managers')
    .upsert({ id: manager.id, name: manager.name })
    .select();

  if (error) throw error;
  return data;
}

/**
 * Sauvegarde les donnees d'une saison
 */
export async function saveSeason(championship, seasonNumber, standings) {
  if (!supabase) throw new Error('Supabase non configure');
  const { data, error } = await supabase
    .from('seasons')
    .upsert({
      championship,
      season_number: seasonNumber,
      standings
    }, { onConflict: 'championship,season_number' })
    .select();

  if (error) throw error;
  return data;
}

/**
 * Sauvegarde les matchs d'une journee
 */
export async function saveMatches(championship, season, matchday, games, exemptTeam = null) {
  if (!supabase) throw new Error('Supabase non configure');

  // Filtrer les matchs vides (sans equipes)
  const validGames = games.filter(game => game.homeTeam && game.awayTeam);

  if (validGames.length === 0) {
    return []; // Pas de matchs valides a sauvegarder
  }

  // Supprimer les anciens matchs de cette journee
  await supabase
    .from('matches')
    .delete()
    .eq('championship', championship)
    .eq('season', season)
    .eq('matchday', matchday);

  // Inserer les nouveaux matchs
  const matchesToInsert = validGames.map(game => ({
    championship,
    season,
    matchday,
    home_team: game.homeTeam,
    away_team: game.awayTeam,
    home_score: game.homeScore,
    away_score: game.awayScore,
    exempt_team: exemptTeam
  }));

  const { data, error } = await supabase
    .from('matches')
    .insert(matchesToInsert)
    .select();

  if (error) throw error;
  return data;
}

/**
 * Sauvegarde un champion
 */
export async function saveChampion(championship, season, championName, runnerUpName = null) {
  if (!supabase) throw new Error('Supabase non configure');
  const { data, error } = await supabase
    .from('champions')
    .upsert({
      championship,
      season,
      champion_name: championName,
      runner_up_name: runnerUpName
    }, { onConflict: 'championship,season' })
    .select();

  if (error) throw error;
  return data;
}

/**
 * Met a jour le pantheon
 */
export async function updatePantheon(managerName, totalPoints, titles, runnerUps) {
  if (!supabase) throw new Error('Supabase non configure');
  const { data, error } = await supabase
    .from('pantheon')
    .upsert({
      manager_name: managerName,
      total_points: totalPoints,
      titles,
      runner_ups: runnerUps
    }, { onConflict: 'manager_name' })
    .select();

  if (error) throw error;
  return data;
}

/**
 * Sauvegarde une penalite
 */
export async function savePenalty(championship, season, teamName, points) {
  if (!supabase) throw new Error('Supabase non configure');
  const { data, error } = await supabase
    .from('penalties')
    .upsert({
      championship,
      season,
      team_name: teamName,
      points
    }, { onConflict: 'championship,season,team_name' })
    .select();

  if (error) throw error;
  return data;
}

/**
 * Importe les donnees JSON v2.0 dans Supabase
 * Utile pour la migration initiale
 */
export async function importFromJSON(jsonData) {
  if (!supabase) throw new Error('Supabase non configure');
  if (!jsonData || !jsonData.entities) {
    throw new Error('Format de donnees invalide');
  }

  const { entities, palmares, pantheon, penalties } = jsonData;

  // Import managers
  if (entities.managers) {
    const managers = Object.values(entities.managers).map(m => ({
      id: m.id,
      name: m.name
    }));
    if (managers.length > 0) {
      await supabase.from('managers').upsert(managers);
    }
  }

  // Import seasons
  if (entities.seasons) {
    const seasonsData = Object.entries(entities.seasons).map(([key, value]) => ({
      championship: value.championship,
      season_number: value.season,
      standings: value.standings
    }));
    for (const season of seasonsData) {
      await saveSeason(season.championship, season.season_number, season.standings);
    }
  }

  // Import matches
  if (entities.matches && Array.isArray(entities.matches)) {
    for (const matchBlock of entities.matches) {
      // Transformer les games si format abrege (h, a, hs, as)
      const normalizedGames = matchBlock.games.map(game => ({
        id: game.id,
        homeTeam: game.homeTeam || game.h,
        awayTeam: game.awayTeam || game.a,
        homeScore: game.homeScore ?? game.hs,
        awayScore: game.awayScore ?? game.as
      }));

      await saveMatches(
        matchBlock.championship,
        matchBlock.season,
        matchBlock.matchday,
        normalizedGames,
        matchBlock.exempt
      );
    }
  }

  // Import palmares
  if (palmares) {
    for (const [championship, seasons] of Object.entries(palmares)) {
      for (const s of seasons) {
        await saveChampion(championship, s.season, s.champion, s.runnerUp);
      }
    }
  }

  // Import pantheon
  if (pantheon && Array.isArray(pantheon)) {
    for (const p of pantheon) {
      await updatePantheon(p.name, p.totalPoints, p.titles, p.runnerUps);
    }
  }

  // Import penalties
  if (penalties) {
    for (const [key, points] of Object.entries(penalties)) {
      const [championship, season, teamName] = key.split('_');
      await savePenalty(championship, parseInt(season), teamName, points);
    }
  }

  return { success: true };
}
