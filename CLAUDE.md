# Analyseur Centris

Extension Chrome (Manifest V3) qui analyse les propriétés immobilières sur Centris.ca et affiche des métriques financières (MRB, MRN, TGA) directement sur la page.

## Structure

```
extension-centris-analyseur/
  manifest.json   # Config extension (v0.1.0)
  content.js      # Toute la logique (IIFE, ~394 lignes)
  styles.css      # Panneau latéral fixe (360px)
Exemples/         # Pages HTML sauvegardées pour tester manuellement
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

| Fonction              | Rôle |
|-----------------------|------|
| `extractData()`       | Scrape le DOM Centris (prix, revenus, dépenses, taxes) |
| `getEligibilityError()` | Vérifie : résidentiel uniquement, 5 unités et plus |
| `computeAnalysis()`   | Calcule MRB, MRN, TGA, normalisation SCHL |
| `renderPanel()`       | Injecte le HTML du panneau dans `<aside>` |
| `refresh()`           | Appelé par MutationObserver (debounce 200 ms) |

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
