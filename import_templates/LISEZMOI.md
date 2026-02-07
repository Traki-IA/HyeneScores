# Import CSV vers Supabase

## Ordre d'import obligatoire

Les tables ont des dépendances entre elles. Importer dans cet ordre :

| Étape | Fichier | Table | Rôle |
|-------|---------|-------|------|
| 1 | `1_managers.csv` | `managers` | Managers (équipes) — référencés par toutes les autres tables |
| 2 | `2_seasons.csv` | `seasons` | Saisons + équipe exempte par championnat |
| 3 | `3_matches.csv` | `matches` | Résultats des matchs (classements recalculés automatiquement) |
| 4 | `4_champions.csv` | `champions` | Palmarès (vainqueurs des saisons passées) |
| 5 | `5_pantheon.csv` | `pantheon` | Classement historique global |
| 6 | `6_penalties.csv` | `penalties` | Pénalités de points (optionnel) |

## Comment importer

1. Aller sur **Supabase Dashboard** > **Table Editor**
2. Sélectionner la table cible
3. Cliquer **Insert** > **Import data from CSV**
4. Charger le fichier CSV correspondant

## Règles importantes

- **`managers` en premier** : les noms dans toutes les autres tables doivent correspondre exactement
- **`seasons` avant `matches`** : l'app a besoin des entrées seasons pour afficher les classements
- **`standings` dans seasons** : laisser `[]` — l'app recalcule automatiquement depuis les matchs
- **`exempt_team`** : doit être identique dans les 4 championnats d'une même saison
- **Championnats valides** : `france`, `espagne`, `italie`, `angleterre`
- **Colonnes auto-générées** (absentes des CSV) : `id` (sauf managers), `created_at`, `updated_at`
