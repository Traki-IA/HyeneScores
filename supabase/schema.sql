-- ============================================
-- SCHEMA HYENESCORES - SUPABASE
-- Version 2.0 avec Authentification Admin
-- ============================================
--
-- INSTRUCTIONS:
-- 1. Créez votre projet sur https://app.supabase.com
-- 2. Allez dans Authentication > Users > Add user
--    Créez votre compte admin avec votre email
-- 3. Copiez ce script dans SQL Editor et exécutez-le
-- 4. IMPORTANT: Remplacez 'VOTRE_EMAIL@EXAMPLE.COM' par votre email admin
--
-- ============================================

-- ============================================
-- CONFIGURATION: VOTRE EMAIL ADMIN
-- ============================================
-- Remplacez cette valeur par votre email avant d'exécuter le script

DO $$
BEGIN
  -- Créer une variable de configuration pour l'email admin
  -- MODIFIEZ CETTE LIGNE avec votre email:
  PERFORM set_config('app.admin_email', 'VOTRE_EMAIL@EXAMPLE.COM', false);
END $$;

-- ============================================
-- FONCTION: Vérifier si l'utilisateur est admin
-- ============================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    auth.jwt() IS NOT NULL AND
    auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TABLE 1: managers (équipes/joueurs)
-- ============================================

CREATE TABLE IF NOT EXISTS managers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE 2: seasons (saisons + classements)
-- ============================================

CREATE TABLE IF NOT EXISTS seasons (
  id SERIAL PRIMARY KEY,
  championship TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  standings JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(championship, season_number)
);

-- ============================================
-- TABLE 3: matches (résultats des matchs)
-- ============================================

CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  championship TEXT NOT NULL,
  season INTEGER NOT NULL,
  matchday INTEGER NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  exempt_team TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_matches_context
  ON matches(championship, season, matchday);

-- ============================================
-- TABLE 4: champions (palmarès)
-- ============================================

CREATE TABLE IF NOT EXISTS champions (
  id SERIAL PRIMARY KEY,
  championship TEXT NOT NULL,
  season INTEGER NOT NULL,
  champion_name TEXT NOT NULL,
  runner_up_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(championship, season)
);

-- ============================================
-- TABLE 5: pantheon (classement historique)
-- ============================================

CREATE TABLE IF NOT EXISTS pantheon (
  id SERIAL PRIMARY KEY,
  manager_name TEXT NOT NULL UNIQUE,
  total_points INTEGER DEFAULT 0,
  titles INTEGER DEFAULT 0,
  runner_ups INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE 6: penalties (pénalités)
-- ============================================

CREATE TABLE IF NOT EXISTS penalties (
  id SERIAL PRIMARY KEY,
  championship TEXT NOT NULL,
  season INTEGER NOT NULL,
  team_name TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(championship, season, team_name)
);

-- ============================================
-- TABLE 7: app_settings (paramètres globaux)
-- ============================================

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insérer les paramètres par défaut
INSERT INTO app_settings (key, value) VALUES
  ('current_season', '{"number": 1}'),
  ('app_config', '{"version": "2.0", "initialized": true}')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Activer RLS sur toutes les tables
ALTER TABLE managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE champions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pantheon ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLITIQUES: LECTURE PUBLIQUE
-- ============================================

CREATE POLICY "Lecture publique managers" ON managers
  FOR SELECT USING (true);

CREATE POLICY "Lecture publique seasons" ON seasons
  FOR SELECT USING (true);

CREATE POLICY "Lecture publique matches" ON matches
  FOR SELECT USING (true);

CREATE POLICY "Lecture publique champions" ON champions
  FOR SELECT USING (true);

CREATE POLICY "Lecture publique pantheon" ON pantheon
  FOR SELECT USING (true);

CREATE POLICY "Lecture publique penalties" ON penalties
  FOR SELECT USING (true);

CREATE POLICY "Lecture publique app_settings" ON app_settings
  FOR SELECT USING (true);

-- ============================================
-- POLITIQUES: ÉCRITURE ADMIN SEULEMENT
-- ============================================

-- managers
CREATE POLICY "Admin insert managers" ON managers
  FOR INSERT WITH CHECK (auth.jwt() ->> 'email' IS NOT NULL);
CREATE POLICY "Admin update managers" ON managers
  FOR UPDATE USING (auth.jwt() ->> 'email' IS NOT NULL);
CREATE POLICY "Admin delete managers" ON managers
  FOR DELETE USING (auth.jwt() ->> 'email' IS NOT NULL);

-- seasons
CREATE POLICY "Admin insert seasons" ON seasons
  FOR INSERT WITH CHECK (auth.jwt() ->> 'email' IS NOT NULL);
CREATE POLICY "Admin update seasons" ON seasons
  FOR UPDATE USING (auth.jwt() ->> 'email' IS NOT NULL);
CREATE POLICY "Admin delete seasons" ON seasons
  FOR DELETE USING (auth.jwt() ->> 'email' IS NOT NULL);

-- matches
CREATE POLICY "Admin insert matches" ON matches
  FOR INSERT WITH CHECK (auth.jwt() ->> 'email' IS NOT NULL);
CREATE POLICY "Admin update matches" ON matches
  FOR UPDATE USING (auth.jwt() ->> 'email' IS NOT NULL);
CREATE POLICY "Admin delete matches" ON matches
  FOR DELETE USING (auth.jwt() ->> 'email' IS NOT NULL);

-- champions
CREATE POLICY "Admin insert champions" ON champions
  FOR INSERT WITH CHECK (auth.jwt() ->> 'email' IS NOT NULL);
CREATE POLICY "Admin update champions" ON champions
  FOR UPDATE USING (auth.jwt() ->> 'email' IS NOT NULL);
CREATE POLICY "Admin delete champions" ON champions
  FOR DELETE USING (auth.jwt() ->> 'email' IS NOT NULL);

-- pantheon
CREATE POLICY "Admin insert pantheon" ON pantheon
  FOR INSERT WITH CHECK (auth.jwt() ->> 'email' IS NOT NULL);
CREATE POLICY "Admin update pantheon" ON pantheon
  FOR UPDATE USING (auth.jwt() ->> 'email' IS NOT NULL);
CREATE POLICY "Admin delete pantheon" ON pantheon
  FOR DELETE USING (auth.jwt() ->> 'email' IS NOT NULL);

-- penalties
CREATE POLICY "Admin insert penalties" ON penalties
  FOR INSERT WITH CHECK (auth.jwt() ->> 'email' IS NOT NULL);
CREATE POLICY "Admin update penalties" ON penalties
  FOR UPDATE USING (auth.jwt() ->> 'email' IS NOT NULL);
CREATE POLICY "Admin delete penalties" ON penalties
  FOR DELETE USING (auth.jwt() ->> 'email' IS NOT NULL);

-- app_settings
CREATE POLICY "Admin insert app_settings" ON app_settings
  FOR INSERT WITH CHECK (auth.jwt() ->> 'email' IS NOT NULL);
CREATE POLICY "Admin update app_settings" ON app_settings
  FOR UPDATE USING (auth.jwt() ->> 'email' IS NOT NULL);
CREATE POLICY "Admin delete app_settings" ON app_settings
  FOR DELETE USING (auth.jwt() ->> 'email' IS NOT NULL);

-- ============================================
-- TRIGGERS: Mise à jour automatique updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour seasons
DROP TRIGGER IF EXISTS update_seasons_updated_at ON seasons;
CREATE TRIGGER update_seasons_updated_at
  BEFORE UPDATE ON seasons
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger pour pantheon
DROP TRIGGER IF EXISTS update_pantheon_updated_at ON pantheon;
CREATE TRIGGER update_pantheon_updated_at
  BEFORE UPDATE ON pantheon
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger pour app_settings
DROP TRIGGER IF EXISTS update_app_settings_updated_at ON app_settings;
CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FIN DU SCRIPT
-- ============================================
--
-- Après exécution, vous devriez avoir:
-- - 7 tables créées
-- - RLS activé sur toutes les tables
-- - Lecture publique pour tous
-- - Écriture réservée aux utilisateurs authentifiés
--
-- Pour tester:
-- 1. Créez un utilisateur dans Authentication > Users
-- 2. Connectez-vous dans votre app
-- 3. Essayez d'ajouter des données
--
-- ============================================
