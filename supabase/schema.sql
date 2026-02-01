-- ============================================
-- SCHEMA HYENESCORES - SUPABASE
-- ============================================
-- Executez ce script dans l'editeur SQL de Supabase:
-- https://app.supabase.com/project/YOUR_PROJECT/sql
-- ============================================

-- Table des managers (joueurs/equipes)
CREATE TABLE IF NOT EXISTS managers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des saisons
CREATE TABLE IF NOT EXISTS seasons (
  id SERIAL PRIMARY KEY,
  championship TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  standings JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(championship, season_number)
);

-- Table des matchs
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

-- Index pour les requetes frequentes sur les matchs
CREATE INDEX IF NOT EXISTS idx_matches_context
  ON matches(championship, season, matchday);

-- Table des champions (palmares)
CREATE TABLE IF NOT EXISTS champions (
  id SERIAL PRIMARY KEY,
  championship TEXT NOT NULL,
  season INTEGER NOT NULL,
  champion_name TEXT NOT NULL,
  runner_up_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(championship, season)
);

-- Table du pantheon (classement historique)
CREATE TABLE IF NOT EXISTS pantheon (
  id SERIAL PRIMARY KEY,
  manager_name TEXT NOT NULL UNIQUE,
  total_points INTEGER DEFAULT 0,
  titles INTEGER DEFAULT 0,
  runner_ups INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des penalites
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
-- ROW LEVEL SECURITY (RLS)
-- Lecture publique, ecriture admin seulement
-- ============================================

-- Activer RLS sur toutes les tables
ALTER TABLE managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE champions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pantheon ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalties ENABLE ROW LEVEL SECURITY;

-- Politiques de LECTURE (tout le monde peut lire)
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

-- ============================================
-- OPTION 1: Acces admin via service_role key
-- ============================================
-- Si vous utilisez la cle service_role (cote serveur),
-- elle bypass automatiquement RLS.
-- C'est la methode la plus simple pour un admin unique.

-- ============================================
-- OPTION 2: Acces admin via email authentifie
-- ============================================
-- Decommentez ces politiques si vous voulez utiliser
-- l'authentification Supabase pour l'admin.
-- Remplacez 'votre-email@example.com' par votre email.

-- CREATE POLICY "Admin insert managers" ON managers
--   FOR INSERT WITH CHECK (auth.jwt() ->> 'email' = 'votre-email@example.com');
-- CREATE POLICY "Admin update managers" ON managers
--   FOR UPDATE USING (auth.jwt() ->> 'email' = 'votre-email@example.com');
-- CREATE POLICY "Admin delete managers" ON managers
--   FOR DELETE USING (auth.jwt() ->> 'email' = 'votre-email@example.com');

-- CREATE POLICY "Admin insert seasons" ON seasons
--   FOR INSERT WITH CHECK (auth.jwt() ->> 'email' = 'votre-email@example.com');
-- CREATE POLICY "Admin update seasons" ON seasons
--   FOR UPDATE USING (auth.jwt() ->> 'email' = 'votre-email@example.com');
-- CREATE POLICY "Admin delete seasons" ON seasons
--   FOR DELETE USING (auth.jwt() ->> 'email' = 'votre-email@example.com');

-- CREATE POLICY "Admin insert matches" ON matches
--   FOR INSERT WITH CHECK (auth.jwt() ->> 'email' = 'votre-email@example.com');
-- CREATE POLICY "Admin update matches" ON matches
--   FOR UPDATE USING (auth.jwt() ->> 'email' = 'votre-email@example.com');
-- CREATE POLICY "Admin delete matches" ON matches
--   FOR DELETE USING (auth.jwt() ->> 'email' = 'votre-email@example.com');

-- CREATE POLICY "Admin insert champions" ON champions
--   FOR INSERT WITH CHECK (auth.jwt() ->> 'email' = 'votre-email@example.com');
-- CREATE POLICY "Admin update champions" ON champions
--   FOR UPDATE USING (auth.jwt() ->> 'email' = 'votre-email@example.com');
-- CREATE POLICY "Admin delete champions" ON champions
--   FOR DELETE USING (auth.jwt() ->> 'email' = 'votre-email@example.com');

-- CREATE POLICY "Admin insert pantheon" ON pantheon
--   FOR INSERT WITH CHECK (auth.jwt() ->> 'email' = 'votre-email@example.com');
-- CREATE POLICY "Admin update pantheon" ON pantheon
--   FOR UPDATE USING (auth.jwt() ->> 'email' = 'votre-email@example.com');
-- CREATE POLICY "Admin delete pantheon" ON pantheon
--   FOR DELETE USING (auth.jwt() ->> 'email' = 'votre-email@example.com');

-- CREATE POLICY "Admin insert penalties" ON penalties
--   FOR INSERT WITH CHECK (auth.jwt() ->> 'email' = 'votre-email@example.com');
-- CREATE POLICY "Admin update penalties" ON penalties
--   FOR UPDATE USING (auth.jwt() ->> 'email' = 'votre-email@example.com');
-- CREATE POLICY "Admin delete penalties" ON penalties
--   FOR DELETE USING (auth.jwt() ->> 'email' = 'votre-email@example.com');

-- ============================================
-- TRIGGERS pour updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_seasons_updated_at
  BEFORE UPDATE ON seasons
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pantheon_updated_at
  BEFORE UPDATE ON pantheon
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
