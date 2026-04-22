# Analyseur Centris

Extension Chrome (Manifest V3) qui analyse les propriétés immobilières sur Centris.ca et affiche des métriques financières (MRB, MRN, TGA) directement sur la page.

## Structure

```
extension-centris-analyseur/
  manifest.json       # Config extension (v0.2.0)
  content.js          # Toute la logique (IIFE, ~690 lignes)
  styles.css          # Panneau latéral fixe (360px)
docs/
  remote-config.json  # Config distante servie via GitHub Pages
Exemples/             # Pages HTML sauvegardées pour tester manuellement
CHANGELOG.md          # Historique des versions
```

## Installation & test

Aucun build requis. Charger l'extension directement dans Chrome :

1. Ouvrir `chrome://extensions`
2. Activer le mode développeur
3. "Charger l'extension non empaquetée" → sélectionner `extension-centris-analyseur/`
4. Naviguer vers une fiche Centris pour voir le panneau

Pour tester sans internet, ouvrir les fichiers dans `Exemples/` directement dans Chrome (l'extension ne s'y injecte pas automatiquement — utiliser `chrome://extensions` > "Inspecter les vues" pour déboguer).

## Architecture de content.js

Tout le code est dans une IIFE (`(function () { ... })()`). Pas de modules, pas de classes.

Flux principal : `refresh()` → `extractData()` → `computeAnalysis()` → `renderPanel()`

Au démarrage, `loadRemoteConfig()` est appelé en parallèle. Quand il termine, `refresh()` est rappelé pour rerendre avec la config distante (kill switch, version min, bannières).

| Fonction                | Rôle |
|-------------------------|------|
| `extractData()`         | Scrape le DOM Centris (prix, revenus, dépenses, taxes) |
| `getEligibilityError()` | Vérifie : résidentiel uniquement, 5 unités et plus |
| `computeAnalysis()`     | Calcule MRB, MRN, TGA, normalisation SCHL |
| `loadRemoteConfig()`    | Lit la config distante (cache 6 h dans `chrome.storage.local`, fail-open) |
| `compareVersions()`     | Comparaison semver simple pour `minVersion` / `latestVersion` |
| `renderPanel()`         | Injecte le HTML du panneau dans `<aside>` |
| `renderBlockedPanel()`  | Écran de blocage (kill switch ou version trop ancienne) |
| `buildBannersHtml()`    | Bannières non bloquantes (notification, message) |
| `refresh()`             | Appelé par MutationObserver (debounce 200 ms) |

## Calculs financiers

- **MRB** = Prix / Revenu brut potentiel
- **MRN** = Prix / Revenu net normalisé
- **TGA** = (Revenu net / Prix) × 100 %
- **Normalisation SCHL** = 16 % du revenu brut (vacance 3 % + gestion 4 % + entretien 5 % + remplacement 4 %)

Les constantes SCHL sont dans `SCHL_DEFAULTS` au début de `content.js`.

## Conventions de code

- **Noms de fonctions/variables** : anglais, camelCase
- **Chaînes UI** : français (fr-CA)
- **Formatage** : `Intl.NumberFormat("fr-CA")` pour les montants et nombres
- **Pas de framework** : vanilla JS uniquement, aucune dépendance externe
- **Pas de `console.log`** en production
- Garder tout dans l'IIFE — ne pas polluer le scope global

## Contrôle à distance

L'extension fetch `https://valoptim.github.io/Analyseur-Centris/remote-config.json` au chargement. Cache 6 h dans `chrome.storage.local`, fail-open si fetch échoue (l'extension fonctionne normalement sans config).

Champs de `remote-config.json` :

| Champ           | Effet |
|-----------------|-------|
| `killSwitch`    | Si `true`, bloque l'extension avec `killMessage` |
| `killMessage`   | Texte affiché lors du blocage par kill switch |
| `minVersion`    | Versions strictement inférieures bloquées avec lien `downloadUrl` |
| `latestVersion` | Si current < latest, bannière douce non bloquante |
| `message`       | Texte libre dans une bannière info, sans bloquer |
| `downloadUrl`   | Lien proposé dans les écrans de blocage |

Pour mettre à jour : éditer `docs/remote-config.json` puis `git push`. Les utilisateurs voient le changement sous 6 h max (TTL cache).

Constantes dans `content.js` : `REMOTE_CONFIG_URL`, `CACHE_KEY`, `CACHE_TTL_MS`, `FETCH_TIMEOUT_MS`.

Pour vider le cache côté client (test) :
```js
chrome.storage.local.remove("remoteConfig", () => location.reload());
```

## Sélecteurs DOM clés

L'extension cible des sélecteurs spécifiques à Centris. Si le site change, vérifier :

- Prix : `meta[itemprop='price']` ou `#RawPrice`
- Caractéristiques : `.carac-container` > `.carac-title` / `.carac-value`
- Tableaux financiers : `.financial-details-table`, `.financial-details-table-yearly`

`normalizeText()` supprime les accents avant comparaison — essentiel pour les labels Centris.

## Ce projet ne contient pas

- Tests automatisés
- Linter / formatter configuré
- Pipeline CI/CD
- Clés API ou données sensibles
