# Changelog

Toutes les modifications notables de l'Analyseur Centris sont documentées ici.

## [0.2.0] — 2026-04-22

### Ajouté
- **Affichage de la version** en bas du panneau (footer discret, gris clair, 10 px) — visible dans le panneau éligible, non éligible et l'écran de blocage. Lit `chrome.runtime.getManifest().version`.
- **Système de contrôle à distance** via fichier JSON statique hébergé sur GitHub Pages (`https://valoptim.github.io/Analyseur-Centris/remote-config.json`).
  - **Kill switch** (`killSwitch` + `killMessage`) : blocage global avec message personnalisé. Utile en cas de bug critique ou de barèmes obsolètes.
  - **Version minimale requise** (`minVersion`) : bloque les versions inférieures avec lien de téléchargement.
  - **Notification de nouvelle version** (`latestVersion`) : bannière jaune douce non bloquante.
  - **Message libre** (`message`) : bannière bleue info pour annonces ponctuelles.
- **Cache de la config distante** : 6 h dans `chrome.storage.local`, refresh silencieux en arrière-plan.
- **Fail-open** : si le fetch de la config échoue et qu'aucun cache n'existe, l'extension fonctionne normalement (jamais bloquée par une panne externe).
- Fichier initial `docs/remote-config.json` (kill switch off, min/latest = 0.2.0).

### Modifié
- `manifest.json` : version `0.1.0` → `0.2.0`, ajout permission `storage`, ajout host permission `https://valoptim.github.io/*`.
- `content.js` : nouvelles constantes `REMOTE_CONFIG_URL`, `CACHE_KEY`, `CACHE_TTL_MS`, `FETCH_TIMEOUT_MS`. Nouvelles fonctions : `getCurrentVersion`, `compareVersions`, `readCache`, `writeCache`, `fetchRemoteConfig`, `loadRemoteConfig`, `buildVersionFooter`, `buildBannersHtml`, `renderBlockedPanel`. Bootstrap appelle `loadRemoteConfig().then(refresh)`. Signature de cache inclut désormais la config distante pour déclencher le rerendu.
- `styles.css` : nouvelles classes `.ca-version`, `.ca-banner`, `.ca-banner-update`, `.ca-banner-message`, `.ca-blocked`, `.ca-blocked-message`, `.ca-blocked-btn`.

### Notes
- Le `fetch` est fait directement depuis le content script (sans service worker) car GitHub Pages renvoie `Access-Control-Allow-Origin: *`. Migration vers un service worker possible si on change d'hébergeur.
- Aucune télémétrie d'usage n'est collectée. Le contrôle est purement descendant (lecture d'un fichier statique).

## [0.1.0]

Version initiale (avant ce changelog) : extraction des données Centris, calcul MRB / MRN / TGA, normalisation SCHL, panneau latéral imprimable.
