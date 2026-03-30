# Analyseur Centris (MVP)

Extension Chrome (Manifest V3) qui ajoute un panneau a droite sur les fiches Centris et affiche:
- recapitulatif de la propriete
- details financiers extraits de la fiche
- calculs MRB, MRN, TGA
- estimation des depenses de normalisation SCHL (version hypothese)

## Installation

1. Ouvrir `chrome://extensions`
2. Activer le mode developpeur
3. Cliquer `Load unpacked` / `Charger l'extension non empaquetee`
4. Selectionner le dossier: `Analyseur Centris/extension-centris-analyseur`

## Hypotheses v0

La normalisation SCHL est estimee avec:
- vacance: 3 % du revenu brut
- gestion: 4 %
- entretien: 5 %
- remplacement: 4 %

Total normalisation: 16 % du revenu brut.

## Notes

- Le panneau s'affiche uniquement si la page contient un No Centris et un prix.
- Les montants annuels proviennent des tableaux `financial-details-table-yearly`.
- Les donnees viennent du DOM de la page, sans appel API externe.
