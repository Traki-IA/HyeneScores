# 📋 Changelog & Prompts - HyeneScores

**Principe des prompts :** Modifications ciblées uniquement, pas de réécriture complète.

---

## 📄 Page CLASSEMENT

### ✅ Modifications Validées

1. **Sélecteur de compétition** : 5 boutons → Dropdown unique
2. **Header compact** : Padding réduit (px-4 py-3 → px-3 py-2)
3. **Alignement dropdowns** : Même hauteur (flex items-stretch)
4. **Optimisation générale** : Hauteur lignes 48px → 40px, barre progression h-2 → h-1.5

---

### 🚀 Prompts pour Claude Code

#### **Prompt 1 : Ajout du state pour dropdown compétition**

```
Dans src/App.jsx, ajoute ce state avec les autres useState (après const [isSeasonOpen, setIsSeasonOpen] = useState(false);) :

const [isChampOpen, setIsChampOpen] = useState(false);
```

---

#### **Prompt 2 : Remplacement du sélecteur de compétition par dropdown**

```
Dans src/App.jsx, dans la section CLASSEMENT, localise cette structure :

<div className="flex-1">
  <div className="grid grid-cols-5 gap-2">
    {championships.map(champ => (

Remplace TOUTE cette div (de <div className="flex-1"> jusqu'à sa fermeture </div>) par :

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
```

---

#### **Prompt 3 : Optimisation des espacements - Sélecteurs**

```
Dans src/App.jsx, section CLASSEMENT :

1. Trouve : <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0 relative">
   Remplace par : <div className="px-3 py-2 border-b border-gray-800 flex-shrink-0 relative">

2. Juste en dessous, trouve : <div className="flex items-center gap-2">
   Remplace par : <div className="flex items-stretch gap-2">

3. Dans le bouton saison, trouve : className={`w-full bg-black/50 border
   Remplace par : className={`w-full h-full bg-black/50 border
```

---

#### **Prompt 4 : Optimisation barre de progression**

```
Dans src/App.jsx, section CLASSEMENT, trouve la barre de progression :

1. Trouve : <div className="px-4 py-2 border-b border-gray-800 flex-shrink-0">
   Remplace par : <div className="px-3 py-1.5 border-b border-gray-800 flex-shrink-0">

2. Dans la même section, trouve : <div className="bg-gray-800 rounded-full h-2 overflow-hidden">
   Remplace par : <div className="bg-gray-800 rounded-full h-1.5 overflow-hidden">
```

---

#### **Prompt 5 : Optimisation header tableau**

```
Dans src/App.jsx, section CLASSEMENT, trouve le header du tableau :

Trouve : <div className="grid grid-cols-12 gap-1 px-4 py-2 bg-gray-900/50 border-b border-gray-800 flex-shrink-0">
Remplace par : <div className="grid grid-cols-12 gap-1 px-3 py-1.5 bg-gray-900/50 border-b border-gray-800 flex-shrink-0">
```

---

#### **Prompt 6 : Optimisation liste des équipes**

```
Dans src/App.jsx, section CLASSEMENT, optimise la liste des équipes :

1. Trouve : <div className="flex-1 overflow-y-auto px-4 pb-2">
   Remplace par : <div className="flex-1 overflow-y-auto px-3 pb-1">

2. Trouve : className="grid grid-cols-12 gap-1 py-2 border-b border-gray-800/50
   Remplace par : className="grid grid-cols-12 gap-1 py-1.5 border-b border-gray-800/50

3. Trouve : style={{ height: '48px', minHeight: '48px', maxHeight: '48px' }}
   Remplace par : style={{ height: '40px', minHeight: '40px', maxHeight: '40px' }}
```

---

#### **Prompt 7 : Optimisation header titre CLASSEMENT**

```
Dans src/App.jsx, section CLASSEMENT, tout en haut :

1. Trouve : <div className="px-4 pt-4 pb-3 flex-shrink-0">
   Remplace par : <div className="px-4 pt-4 pb-2 flex-shrink-0">

2. Juste en dessous, trouve : <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-cyan-500/50 rounded-xl p-4 text-center">
   Remplace par : <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-cyan-500/50 rounded-xl p-3 text-center">
```

---

## 📅 Page MATCH

### ✅ Modifications Validées

1. **Sélecteurs harmonisés** : 4 drapeaux + 2 dropdowns → 3 dropdowns égaux
2. **Layout flexible** : Largeur fixe → flex-1 pour noms complets
3. **Taille police** : text-sm → text-xs pour équipes
4. **Validation visuelle** : Bordure verte si 2 équipes ET 2 scores
5. **Header harmonisé** : Padding px-4 py-3 → px-3 py-2

---

### 🚀 Prompts pour Claude Code

#### **Prompt 8 : Ajout du state pour dropdown compétition**

```
Dans src/App.jsx, ajoute ce state avec les autres useState de la section MATCH (si pas déjà présent) :

const [isChampOpen, setIsChampOpen] = useState(false);
```

---

#### **Prompt 9 : Remplacement des sélecteurs par 3 dropdowns**

```
Dans src/App.jsx, section MATCH, localise la div des sélecteurs qui commence par :

<div className="px-4 py-3 border-b border-gray-800 flex-shrink-0 relative">

Remplace TOUTE cette section par :

<div className="px-3 py-2 border-b border-gray-800 flex-shrink-0 relative">
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
    <div className="flex-1 relative">
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

    {/* Journée Dropdown */}
    <div className="flex-1 relative">
      <button
        onClick={() => setIsJourneeOpen(!isJourneeOpen)}
        className={`w-full h-full bg-black/50 border rounded-lg px-3 py-2.5 text-white text-sm font-medium cursor-pointer transition-colors flex items-center justify-between ${
          isJourneeOpen ? 'border-cyan-500/50' : 'border-gray-800 hover:border-cyan-500/30'
        }`}
      >
        <span>Journée {selectedJournee}</span>
        <svg className={`w-4 h-4 text-gray-500 transition-transform ${isJourneeOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isJourneeOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsJourneeOpen(false)}></div>
          <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl z-50 w-32 max-h-64 overflow-y-auto">
            {journees.map(journee => (
              <button
                key={journee}
                onClick={() => {
                  setSelectedJournee(journee);
                  setIsJourneeOpen(false);
                }}
                className={`w-full px-3 py-2.5 text-sm font-medium text-left transition-colors ${
                  selectedJournee === journee
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-white hover:bg-gray-800'
                }`}
              >
                Journée {journee}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  </div>
</div>
```

---

#### **Prompt 10 : Optimisation header titre MATCHS**

```
Dans src/App.jsx, section MATCH, tout en haut :

1. Trouve : <div className="px-4 pt-4 pb-3 flex-shrink-0">
   Remplace par : <div className="px-4 pt-4 pb-2 flex-shrink-0">

2. Juste en dessous, trouve : <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-cyan-500/50 rounded-xl p-4 text-center">
   Remplace par : <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-cyan-500/50 rounded-xl p-3 text-center">
```

---

#### **Prompt 11 : Optimisation taille police et scores**

```
Dans src/App.jsx, section MATCH, dans la liste des matchs :

1. Dans les boutons d'équipe (homeTeam et awayTeam), trouve TOUTES les occurrences de :
   <span className="text-white text-sm font-semibold truncate">
   Remplace par :
   <span className="text-white text-xs font-semibold truncate">

2. Dans les inputs de score, trouve TOUTES les occurrences de :
   className={`bg-black/50 rounded-md w-11 h-11
   Remplace par :
   className={`bg-black/50 rounded-md w-10 h-11
```

---

#### **Prompt 12 : Correction validation visuelle (CRITIQUE)**

```
Dans src/App.jsx, section MATCH, dans chaque match il y a 4 éléments avec une condition de validation.

Trouve TOUTES les occurrences de cette condition :
match.homeScore !== null && match.awayScore !== null

Remplace par :
match.homeTeam && match.awayTeam && match.homeScore !== null && match.awayScore !== null

Cela concerne :
- Le bouton homeTeam (border-2 border-emerald-500)
- Le bouton awayTeam (border-2 border-emerald-500)
- L'input homeScore (border-2 border-emerald-500)
- L'input awayScore (border-2 border-emerald-500)

Il y a environ 4 endroits à modifier pour CHAQUE match de la liste.
```

---

## 🎯 Page PALMARÈS

### ✅ Modifications Validées

1. **Sélecteur de compétition** : 4 drapeaux → Dropdown unique
2. **Ajout Ligue des Hyènes** : 4 championnats → 5 championnats
3. **Layout harmonisé** : Grille → 2 dropdowns alignés (Compétition flex-1 | Saison w-28)
4. **Header harmonisé** : Padding px-4 py-3 → px-3 py-2

---

### 🚀 Prompts pour Claude Code

#### **Prompt 13 : Ajout du state pour dropdown compétition**

```
Dans src/App.jsx, ajoute ce state avec les autres useState de la section PALMARÈS (si pas déjà présent) :

const [isChampOpen, setIsChampOpen] = useState(false);
```

---

#### **Prompt 14 : Remplacement des sélecteurs par dropdowns**

```
Dans src/App.jsx, section PALMARES, localise la div des sélecteurs qui commence par :

<div className="px-4 py-3 border-b border-gray-800

Remplace TOUTE cette section par :

<div className="px-3 py-2 border-b border-gray-800 flex-shrink-0 relative">
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
    <div className="w-28 relative">
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
          <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl z-50 w-28 max-h-64 overflow-y-auto">
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
```

---

#### **Prompt 15 : Optimisation header titre PALMARÈS**

```
Dans src/App.jsx, section PALMARES, tout en haut :

1. Trouve : <div className="px-4 pt-4 pb-3 flex-shrink-0">
   Remplace par : <div className="px-4 pt-4 pb-2 flex-shrink-0">

2. Juste en dessous, trouve : <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-cyan-500/50 rounded-xl p-4 text-center">
   Remplace par : <div className="bg-gradient-to-br from-gray-900 to-black border-2 border-cyan-500/50 rounded-xl p-3 text-center">
```

---

## 📊 Récapitulatif Global

| Page | Prompts | Modifications clés |
|------|---------|-------------------|
| **Classement** | 1-7 | Dropdown compétition, espacements optimisés, hauteur lignes 40px |
| **Match** | 8-12 | 3 dropdowns, validation 2 équipes + 2 scores, text-xs équipes |
| **Palmarès** | 13-15 | Dropdown compétition + Hyènes, layout harmonisé |

---

## ✅ Checklist de validation finale

### Page Classement
- [ ] Prompts 1-7 appliqués
- [ ] Dropdown compétition fonctionne (5 options)
- [ ] Les 10 équipes visibles sans scroll
- [ ] Cohérence visuelle

### Page Match
- [ ] Prompts 8-12 appliqués
- [ ] 3 dropdowns égaux fonctionnent
- [ ] Noms d'équipes lisibles en entier
- [ ] Bordure verte uniquement si 2 équipes + 2 scores
- [ ] Cohérence avec Classement

### Page Palmarès
- [ ] Prompts 13-15 appliqués
- [ ] Dropdown compétition avec 5 options (dont Hyènes)
- [ ] Proportions identiques à Classement
- [ ] Cohérence visuelle

---

## 🎯 Instructions d'application

**Ordre recommandé :**
1. Applique les prompts 1-7 (Classement)
2. Teste la page Classement
3. Applique les prompts 8-12 (Match)
4. Teste la page Match
5. Applique les prompts 13-15 (Palmarès)
6. Teste la page Palmarès
7. Test final de navigation entre les 3 pages

**Commande test :**
```bash
npm run dev
```

---

**✨ Fin du changelog - Prêt pour l'application avec Claude Code !**
