import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Verifier si Supabase est configure
const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn('Supabase credentials missing. Check your .env file.');
}

const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// ============================================
// AUTHENTIFICATION
// ============================================

/**
 * Connexion avec email/mot de passe
 */
export async function signIn(email, password) {
  if (!supabase) throw new Error('Supabase non configure');

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  return data;
}

/**
 * Deconnexion
 */
export async function signOut() {
  if (!supabase) throw new Error('Supabase non configure');

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Recuperer la session actuelle
 */
export async function getSession() {
  if (!supabase) return null;

  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/**
 * Ecouter les changements d'authentification
 */
export function onAuthStateChange(callback) {
  if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } };

  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

/**
 * Verifier si l'utilisateur est admin (email dans admin_users)
 */
export async function checkIsAdmin(email) {
  if (!supabase || !email) return false;

  const { data, error } = await supabase
    .from('admin_users')
    .select('email')
    .eq('email', email)
    .single();

  if (error) return false;
  return !!data;
}

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
    // Fonction pour récupérer tous les matchs avec pagination
    // Supabase limite le nombre de lignes par requête par défaut
    const SUPABASE_PAGE_SIZE = 1000;
    const fetchAllMatches = async () => {
      const allMatches = [];
      const pageSize = SUPABASE_PAGE_SIZE;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('matches')
          .select('*')
          .order('matchday', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) {
          console.warn('Erreur matches page', offset / pageSize, ':', error.message);
          hasMore = false;
        } else if (data && data.length > 0) {
          allMatches.push(...data);
          console.log(`Matchs chargés: ${allMatches.length} (page ${Math.floor(offset / pageSize) + 1})`);
          offset += pageSize;
          // Si on reçoit moins que pageSize, c'est la dernière page
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      return allMatches;
    };

    const [
      { data: managers, error: managersError },
      { data: seasons, error: seasonsError },
      matches,
      { data: champions, error: championsError },
      { data: pantheon, error: pantheonError },
      { data: penalties, error: penaltiesError }
    ] = await Promise.all([
      supabase.from('managers').select('*'),
      supabase.from('seasons').select('*'),
      fetchAllMatches(),
      supabase.from('champions').select('*').order('season', { ascending: true }),
      supabase.from('pantheon').select('*').order('total_points', { ascending: false }),
      supabase.from('penalties').select('*')
    ]);

    // Log les erreurs mais ne pas crasher - les tables peuvent ne pas exister encore
    if (managersError) console.warn('Erreur managers:', managersError.message);
    if (seasonsError) console.warn('Erreur seasons:', seasonsError.message);
    // Note: les erreurs de matches sont gérées dans fetchAllMatches()
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

    // Debug: voir combien de matchs bruts sont récupérés
    console.log('Matchs bruts recus de Supabase:', matches?.length || 0);

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
 * Supprime un manager de la base de données
 */
export async function deleteManager(managerId) {
  if (!supabase) throw new Error('Supabase non configure');
  const { error } = await supabase
    .from('managers')
    .delete()
    .eq('id', managerId);

  if (error) throw error;
  return { success: true };
}

/**
 * Met à jour le nom d'un manager et propage le changement sur toutes les données associées
 * - Table managers
 * - Table matches (home_team, away_team, exempt_team)
 * - Table champions (champion_name, runner_up_name)
 * - Table pantheon (manager_name)
 * - Table penalties (team_name)
 */
export async function updateManagerName(managerId, oldName, newName) {
  if (!supabase) throw new Error('Supabase non configure');

  // 1. Mettre à jour le nom dans la table managers
  const { error: managerError } = await supabase
    .from('managers')
    .update({ name: newName })
    .eq('id', managerId);

  if (managerError) throw managerError;

  // 2-8. Propager le renommage dans toutes les tables liées
  const cascadeUpdates = [
    supabase.from('matches').update({ home_team: newName }).eq('home_team', oldName),
    supabase.from('matches').update({ away_team: newName }).eq('away_team', oldName),
    supabase.from('matches').update({ exempt_team: newName }).eq('exempt_team', oldName),
    supabase.from('champions').update({ champion_name: newName }).eq('champion_name', oldName),
    supabase.from('champions').update({ runner_up_name: newName }).eq('runner_up_name', oldName),
    supabase.from('pantheon').update({ manager_name: newName }).eq('manager_name', oldName),
    supabase.from('penalties').update({ team_name: newName }).eq('team_name', oldName),
  ];

  const results = await Promise.all(cascadeUpdates);
  const errors = results.filter(r => r.error).map(r => r.error);
  if (errors.length > 0) {
    console.error('Erreurs lors du renommage en cascade:', errors);
    throw new Error(`Renommage partiel: ${errors.length} table(s) en erreur`);
  }

  return { success: true };
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

  // Toujours supprimer les anciens matchs de cette journee (meme si pas de nouveaux matchs)
  const { error: deleteError } = await supabase
    .from('matches')
    .delete()
    .eq('championship', championship)
    .eq('season', season)
    .eq('matchday', matchday);

  if (deleteError) throw deleteError;

  // Si pas de matchs valides, retourner (la suppression a deja ete faite)
  if (validGames.length === 0) {
    return [];
  }

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
async function saveChampion(championship, season, championName, runnerUpName = null) {
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
async function updatePantheon(managerName, totalPoints, titles, runnerUps) {
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
 * Supprime une penalite
 */
export async function deletePenalty(championship, season, teamName) {
  if (!supabase) throw new Error('Supabase non configure');
  const { error } = await supabase
    .from('penalties')
    .delete()
    .eq('championship', championship)
    .eq('season', season)
    .eq('team_name', teamName);

  if (error) throw error;
  return { success: true };
}

/**
 * Met à jour l'équipe exemptée pour tous les matchs d'une saison
 */
export async function updateSeasonExempt(season, exemptTeam) {
  if (!supabase) throw new Error('Supabase non configure');
  const { error } = await supabase
    .from('matches')
    .update({ exempt_team: exemptTeam || null })
    .eq('season', season);

  if (error) throw error;
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

  // Import matches avec gestion d'erreurs et progression
  if (entities.matches && Array.isArray(entities.matches)) {
    const totalBlocks = entities.matches.length;
    let importedCount = 0;
    let errorCount = 0;

    console.log(`Import de ${totalBlocks} blocs de matchs...`);

    for (const matchBlock of entities.matches) {
      try {
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

        importedCount++;

        // Log progression tous les 50 blocs
        if (importedCount % 50 === 0) {
          console.log(`Progression: ${importedCount}/${totalBlocks} blocs importes`);
        }
      } catch (err) {
        errorCount++;
        console.error(`Erreur import ${matchBlock.championship} S${matchBlock.season} J${matchBlock.matchday}:`, err.message);
      }
    }

    console.log(`Import termine: ${importedCount}/${totalBlocks} blocs, ${errorCount} erreurs`);
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
      const firstSep = key.indexOf('_');
      const secondSep = key.indexOf('_', firstSep + 1);
      const championship = key.substring(0, firstSep);
      const season = key.substring(firstSep + 1, secondSep);
      const teamName = key.substring(secondSep + 1);
      await savePenalty(championship, parseInt(season), teamName, points);
    }
  }

  return { success: true };
}
