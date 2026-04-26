(function () {
  const ROOT_ID = "centris-analyseur-root";
  const TOGGLE_ID = "centris-analyseur-toggle";
  const LABELS = {
    revenus: ["revenus bruts potentiels"],
    unites: ["nombre d unites", "nombre d'unites"],
    unitesRes: ["unites residentielles"],
    usage: ["utilisation de la propriete"]
  };

  const REMOTE_CONFIG_URL = "https://valoptim.github.io/Analyseur-Centris/remote-config.json";
  const CACHE_KEY = "remoteConfig";
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 heures
  const FETCH_TIMEOUT_MS = 5000;

  const SCHL_DEFAULTS = {
    vacancePct: 5, // max conservateur de la fourchette 2-5%
    woodBrick: {
      small: { // < 12 unités
        maintenancePUPA: 610,
        gestionPct: 4.25,
        conciergeriesPUPA: 215
      },
      large: { // 12+ unités
        maintenancePUPA: 610,
        gestionPct: 5.0,
        conciergeriesPUPA: 365
      }
    },
    concrete: {
      maintenancePUPA: 925,
      gestionPct: 5.0,
      conciergeriesPUPA: 610
    }
  };

  let state = {
    open: true,
    lastSignature: "",
    buildingType: "woodBrick", // "woodBrick" | "concrete"
    remoteConfig: null,
    remoteConfigLoaded: false
  };

  const MARKETING_HTML = `
    <div class="ca-marketing">
      <div class="ca-marketing-credit">
        Développé par <a href="https://linkedin.com/in/felixhini" target="_blank" rel="noopener">Félix Hini</a>
        @ <a href="https://valoptim.agency/" target="_blank" rel="noopener">ValOptim</a>
      </div>
      <div class="ca-marketing-feedback">
        <a href="mailto:felix@valoptim.agency?subject=Feedback%20Analyseur%20Centris">Feedback ou questions&nbsp;?</a>
      </div>
    </div>
  `;

  const PRINT_BUTTON_HTML = `
    <button class="ca-print" type="button">
      <svg class="ca-print-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="6 9 6 2 18 2 18 9"></polyline>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
        <rect x="6" y="14" width="12" height="8"></rect>
      </svg>
      <span>Imprimer</span>
    </button>
  `;

  function normalizeText(value) {
    return (value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\u2019']/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .trim();
  }

  function parseMoney(text) {
    if (!text) return null;
    const cleaned = text.replace(/\u00a0/g, " ").replace(/[^0-9,.-]/g, "").replace(/,/g, ".");
    if (!cleaned || cleaned === "-" || cleaned === ".") return null;
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : null;
  }

  function formatMoney(value) {
    if (!Number.isFinite(value)) return "-";
    return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(value);
  }

  function formatNumber(value, digits = 2) {
    if (!Number.isFinite(value)) return "-";
    return new Intl.NumberFormat("fr-CA", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  }

  function findCaracValue(candidates) {
    const rows = document.querySelectorAll(".carac-container");
    const normalizedCandidates = candidates.map(normalizeText);

    for (const row of rows) {
      const titleEl = row.querySelector(".carac-title");
      const valueEl = row.querySelector(".carac-value");
      if (!titleEl || !valueEl) continue;

      const title = normalizeText(titleEl.textContent);
      if (normalizedCandidates.some((candidate) => title.includes(candidate))) {
        return valueEl.textContent.trim().replace(/\u00a0/g, " ");
      }
    }

    return "";
  }

  function parseTable(tableEl) {
    if (!tableEl) return null;

    const title = tableEl.querySelector(".financial-details-table-title")?.textContent?.trim() || "";
    const items = [];

    tableEl.querySelectorAll("tbody tr").forEach((tr) => {
      const cells = tr.querySelectorAll("td");
      if (cells.length < 2) return;
      const name = cells[0].textContent.trim();
      const raw = cells[1].textContent.trim();
      const value = parseMoney(raw);
      items.push({ name, value, raw });
    });

    const totalCell = tableEl.querySelector("tfoot .financial-details-table-total td:last-child");
    const total = totalCell ? parseMoney(totalCell.textContent) : null;

    return { title, items, total };
  }

  function parseFinancialSections() {
    const sections = [];

    const evaluationTable = document.querySelector(".financial-details-tables > .financial-details-table > table");
    if (evaluationTable) sections.push(parseTable(evaluationTable));

    document.querySelectorAll(".financial-details-table-container .financial-details-table-yearly table").forEach((table) => {
      sections.push(parseTable(table));
    });

    return sections.filter(Boolean);
  }

  function findSectionTotalByName(sections, keyword) {
    const target = sections.find((section) => normalizeText(section.title).includes(keyword));
    return target?.total ?? null;
  }

  function extractData() {
    const listingId = (document.querySelector("#ListingDisplayId")?.textContent || document.querySelector("#ListingId")?.textContent || "").trim();
    const rawPrice = document.querySelector("meta[itemprop='price']")?.getAttribute("content") || document.querySelector("#RawPrice")?.textContent || "";
    const askingPrice = parseMoney(rawPrice);

    if (!listingId || !Number.isFinite(askingPrice)) {
      return null;
    }

    const title = (document.querySelector("[data-id='PageTitle']")?.textContent || "").trim();
    const address = (document.querySelector("h2[itemprop='address']")?.textContent || "").trim();

    const grossPotentialText = findCaracValue(LABELS.revenus);
    const unitsText = findCaracValue(LABELS.unites);
    const unitsResText = findCaracValue(LABELS.unitesRes);
    const usageText = findCaracValue(LABELS.usage);

    const grossPotential = parseMoney(grossPotentialText);
    const financialSections = parseFinancialSections();

    const taxes = findSectionTotalByName(financialSections, "taxes");
    const operatingExpenses = findSectionTotalByName(financialSections, "depenses");

    return {
      listingId,
      title,
      address,
      askingPrice,
      grossPotential,
      unitsText,
      unitsResText,
      usageText,
      taxes,
      operatingExpenses,
      financialSections
    };
  }

  function parseUnitCount(text) {
    if (!text) return null;
    let total = 0;
    let found = false;
    const re = /\((\d+)\)/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      total += parseInt(match[1], 10);
      found = true;
    }
    return found ? total : null;
  }

  function isResidentialOnly(usageText) {
    const normalized = normalizeText(usageText);
    return normalized === "residentielle";
  }

  function getEligibilityError(data) {
    if (!isResidentialOnly(data.usageText)) {
      return "Ce calculateur est conçu pour analyser seulement les immeubles résidentiels de 5 unités et plus.";
    }
    const unitCount = parseUnitCount(data.unitsText);
    if (unitCount !== null && unitCount < 5) {
      return "Ce calculateur est conçu pour analyser seulement les immeubles résidentiels de 5 unités et plus.";
    }
    return null;
  }

  function computeAnalysis(data, buildingType) {
    const gross = data.grossPotential; // RB
    const price = data.askingPrice;
    const taxes = data.taxes || 0;
    const expenses = data.operatingExpenses || 0;
    const unitCount = parseUnitCount(data.unitsText) || 0;

    let schlNorm = null;
    let schlBreakdown = null;
    if (Number.isFinite(gross) && unitCount > 0) {
      const profile = buildingType === "concrete"
        ? SCHL_DEFAULTS.concrete
        : (unitCount < 12 ? SCHL_DEFAULTS.woodBrick.small : SCHL_DEFAULTS.woodBrick.large);

      const vacance      = gross * SCHL_DEFAULTS.vacancePct / 100;
      const rbe          = gross - vacance;
      const gestion      = rbe * profile.gestionPct / 100;
      const maintenance  = profile.maintenancePUPA * unitCount;
      const conciergerie = profile.conciergeriesPUPA * unitCount;

      schlNorm = vacance + gestion + maintenance + conciergerie;
      schlBreakdown = { vacance, gestion, maintenance, conciergerie };
    }

    const netIncome = Number.isFinite(gross)
      ? gross - taxes - expenses - (schlNorm || 0)
      : null;

    const mrb = Number.isFinite(gross) && gross > 0 ? price / gross : null;
    const mrn = Number.isFinite(netIncome) && netIncome > 0 ? price / netIncome : null;
    const tga = Number.isFinite(netIncome) && price > 0 ? (netIncome / price) * 100 : null;

    return { schlNorm, schlBreakdown, netIncome, mrb, mrn, tga };
  }

  function getCurrentVersion() {
    try {
      return chrome.runtime.getManifest().version;
    } catch (e) {
      return "?";
    }
  }

  function compareVersions(a, b) {
    const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
    const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const da = pa[i] || 0;
      const db = pb[i] || 0;
      if (da > db) return 1;
      if (da < db) return -1;
    }
    return 0;
  }

  function readCache() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(CACHE_KEY, (result) => {
          resolve((result && result[CACHE_KEY]) || null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function writeCache(config) {
    try {
      chrome.storage.local.set({ [CACHE_KEY]: { config, timestamp: Date.now() } });
    } catch (e) {
      // silencieux
    }
  }

  async function fetchRemoteConfig() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(REMOTE_CONFIG_URL, { cache: "no-store", signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) return null;
      return await response.json();
    } catch (e) {
      clearTimeout(timeoutId);
      return null;
    }
  }

  async function loadRemoteConfig() {
    const cached = await readCache();
    const fresh = cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS;

    if (fresh && cached.config) {
      state.remoteConfig = cached.config;
      state.remoteConfigLoaded = true;
      // Refresh silencieux en arrière-plan
      fetchRemoteConfig().then((config) => { if (config) writeCache(config); });
      return;
    }

    const config = await fetchRemoteConfig();
    if (config) {
      state.remoteConfig = config;
      writeCache(config);
    } else if (cached && cached.config) {
      state.remoteConfig = cached.config; // fallback sur cache périmé
    } else {
      state.remoteConfig = null; // fail-open
    }
    state.remoteConfigLoaded = true;
  }

  function buildVersionFooter() {
    return `<div class="ca-version">v${getCurrentVersion()}</div>`;
  }

  function buildBannersHtml(config, currentVersion) {
    const banners = [];
    if (config && config.message) {
      banners.push(`<div class="ca-banner ca-banner-message">${config.message}</div>`);
    }
    if (config && config.latestVersion && compareVersions(currentVersion, config.latestVersion) < 0) {
      const link = config.downloadUrl
        ? ` <a href="${config.downloadUrl}" target="_blank" rel="noopener">Télécharger</a>`
        : "";
      banners.push(`<div class="ca-banner ca-banner-update">Nouvelle version disponible (v${config.latestVersion}).${link}</div>`);
    }
    return banners.join("");
  }

  function renderBlockedPanel(message, downloadUrl) {
    const downloadBtn = downloadUrl
      ? `<a class="ca-blocked-btn" href="${downloadUrl}" target="_blank" rel="noopener">Télécharger la mise à jour</a>`
      : "";
    return `
      <div class="ca-panel">
        <div class="ca-header">
          <div class="ca-title">Analyse financière préliminaire</div>
          <button class="ca-close" type="button" aria-label="Fermer">x</button>
        </div>
        <div class="ca-content">
          ${MARKETING_HTML}
          <div class="ca-blocked">
            <div class="ca-blocked-message">${message}</div>
            ${downloadBtn}
          </div>
        </div>
        <div class="ca-footer">
          ${buildVersionFooter()}
        </div>
      </div>
    `;
  }

  function ensureUI() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("aside");
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }

    let toggle = document.getElementById(TOGGLE_ID);
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.id = TOGGLE_ID;
      toggle.type = "button";
      toggle.textContent = "Analyse";
      toggle.addEventListener("click", () => {
        state.open = !state.open;
        renderVisibleState();
      });
      document.body.appendChild(toggle);
    }

    return { root, toggle };
  }

  function renderVisibleState() {
    const root = document.getElementById(ROOT_ID);
    const toggle = document.getElementById(TOGGLE_ID);
    if (!root || !toggle) return;

    root.style.display = state.open ? "block" : "none";
    toggle.style.right = state.open ? "360px" : "0";
    document.body.classList.toggle("ca-panel-open", state.open);
  }

  function buildRow(label, value, trClass) {
    return `<tr class="${trClass || ""}"><td>${label}</td><td class="value">${value}</td></tr>`;
  }

  function renderPanel(data) {
    const { root } = ensureUI();

    if (!data) {
      root.innerHTML = "";
      const toggle = document.getElementById(TOGGLE_ID);
      if (toggle) toggle.style.display = "none";
      document.body.classList.remove("ca-panel-open");
      return;
    }

    const toggle = document.getElementById(TOGGLE_ID);
    if (toggle) toggle.style.display = "block";

    const config = state.remoteConfig;
    const currentVersion = getCurrentVersion();

    if (config && config.killSwitch === true) {
      root.innerHTML = renderBlockedPanel(
        config.killMessage || "L'extension est temporairement indisponible.",
        config.downloadUrl
      );
      root.querySelector(".ca-close")?.addEventListener("click", () => {
        state.open = false;
        renderVisibleState();
      });
      renderVisibleState();
      return;
    }

    if (config && config.minVersion && compareVersions(currentVersion, config.minVersion) < 0) {
      root.innerHTML = renderBlockedPanel(
        `Une mise à jour est requise (version minimale : v${config.minVersion}). Vous utilisez la version v${currentVersion}.`,
        config.downloadUrl
      );
      root.querySelector(".ca-close")?.addEventListener("click", () => {
        state.open = false;
        renderVisibleState();
      });
      renderVisibleState();
      return;
    }

    const bannersHtml = buildBannersHtml(config, currentVersion);

    const eligibilityError = getEligibilityError(data);
    if (eligibilityError) {
      root.innerHTML = `
        <div class="ca-panel">
          <div class="ca-header">
            <div class="ca-title">Analyse financière préliminaire</div>
            <button class="ca-close" type="button" aria-label="Fermer">x</button>
          </div>
          <div class="ca-content">
            ${bannersHtml}
            ${MARKETING_HTML}
            <div class="ca-ineligible">${eligibilityError}</div>
          </div>
          <div class="ca-footer">
            ${PRINT_BUTTON_HTML}
            ${buildVersionFooter()}
          </div>
        </div>
      `;
      root.querySelector(".ca-close")?.addEventListener("click", () => {
        state.open = false;
        renderVisibleState();
      });
      root.querySelector(".ca-print")?.addEventListener("click", () => window.print());
      renderVisibleState();
      return;
    }

    const analysis = computeAnalysis(data, state.buildingType);
    const unitCount = parseUnitCount(data.unitsText);
    const pricePerUnit = unitCount ? data.askingPrice / unitCount : null;

    const taxesSection = data.financialSections.find((s) => normalizeText(s.title).includes("taxes"));
    const depensesSection = data.financialSections.find((s) => normalizeText(s.title).includes("depenses"));
    const otherSections = data.financialSections.filter((s) => s !== taxesSection && s !== depensesSection);

    const normalizedRows = analysis.schlBreakdown ? [
      { name: "Vacances et mauvaises créances (normalisée)", value: analysis.schlBreakdown.vacance },
      { name: "Gestion et administration (normalisée)", value: analysis.schlBreakdown.gestion },
      { name: "Entretien et réparations (normalisée)", value: analysis.schlBreakdown.maintenance },
      { name: "Concierge / Salaire (normalisée)", value: analysis.schlBreakdown.conciergerie }
    ] : [];

    const mergedDepenses = taxesSection || depensesSection
      ? {
          title: "Dépenses",
          items: [
            ...(taxesSection?.items || []).map((item) => ({ ...item, name: `Taxes ${item.name.toLowerCase()} (réelle)` })),
            ...(depensesSection?.items || []).map((item) => ({ ...item, name: `${item.name} (réelle)` })),
            ...normalizedRows
          ],
          total: ((taxesSection?.total ?? 0) + (depensesSection?.total ?? 0)) + (analysis.schlNorm || 0)
        }
      : null;

    const sectionsToRender = [...(mergedDepenses ? [mergedDepenses] : []), ...otherSections];

    const sectionsHtml = sectionsToRender
      .map((section) => `
        <table>
          <thead><tr><th colspan="2">${section.title}</th></tr></thead>
          <tbody>
            ${section.items.map((item) => buildRow(item.name, Number.isFinite(item.value) ? formatMoney(item.value) : item.raw)).join("")}
            ${buildRow("Total", Number.isFinite(section.total) ? formatMoney(section.total) : "-", "row-total")}
          </tbody>
        </table>
      `)
      .join("");

    root.innerHTML = `
      <div class="ca-panel">
        <div class="ca-header">
          <div class="ca-title">Analyse financière préliminaire</div>
          <button class="ca-close" type="button" aria-label="Fermer">x</button>
        </div>
        <div class="ca-content">
          ${bannersHtml}
          ${MARKETING_HTML}
          <table>
            <thead><tr><th colspan="2">Résumé</th></tr></thead>
            <tbody>
              ${buildRow("N° Centris", `<a href="${window.location.href}" target="_blank">${data.listingId}</a>`)}
              <!-- ${buildRow("Type", data.title || "-")} -->
              ${buildRow("Adresse", data.address || "-")}
              ${buildRow("Prix demandé", formatMoney(data.askingPrice))}
              ${buildRow("Prix par unité", Number.isFinite(pricePerUnit) ? formatMoney(pricePerUnit) : "-")}
              <!-- ${buildRow("Usage", data.usageText || "-")} -->
              ${buildRow("Nombre d'unités", unitCount ?? "-")}
              ${buildRow("Unités résidentielles", data.unitsResText || "-")}
            </tbody>
          </table>

          <div class="ca-building-toggle">
            <button class="ca-btn-building ${state.buildingType === 'woodBrick' ? 'active' : ''}" data-type="woodBrick">Bois/brique</button>
            <button class="ca-btn-building ${state.buildingType === 'concrete' ? 'active' : ''}" data-type="concrete">Béton</button>
          </div>

          <table>
            <thead><tr><th colspan="2">Indicateurs</th></tr></thead>
            <tbody>
              ${buildRow("MRB", formatNumber(analysis.mrb, 2))}
              ${buildRow("MRN (normalisé)", formatNumber(analysis.mrn, 2))}
              ${buildRow("TGA (normalisé)", Number.isFinite(analysis.tga) ? `${formatNumber(analysis.tga, 2)} %` : "-")}
            </tbody>
          </table>

          <table>
            <thead><tr><th colspan="2">Revenus</th></tr></thead>
            <tbody>
              ${buildRow("Revenus bruts potentiels", Number.isFinite(data.grossPotential) ? formatMoney(data.grossPotential) : "-")}
              ${buildRow(`Vacances &amp; mauvaises créances (${SCHL_DEFAULTS.vacancePct} %)`, Number.isFinite(analysis.schlBreakdown?.vacance) ? formatMoney(-analysis.schlBreakdown.vacance) : "-")}
              ${buildRow("Revenus bruts effectifs", Number.isFinite(analysis.schlBreakdown?.vacance) ? formatMoney(data.grossPotential - analysis.schlBreakdown.vacance) : "-")}
              ${buildRow("Revenus nets normalisés", Number.isFinite(analysis.netIncome) ? formatMoney(analysis.netIncome) : "-", "row-total")}
            </tbody>
          </table>

          ${sectionsHtml}

          <div class="ca-schl-reference">
            <div class="ca-schl-ref-title">Barèmes SCHL de référence</div>
            <div class="ca-schl-ref-note">La section 2 (Réserve de remplacement) n'est pas incluse dans cette analyse préliminaire par manque d'information.</div>
            <table>
              <thead>
                <tr><th colspan="4">1. Dépenses d'exploitation normalisées</th></tr>
                <tr><th>Poste</th><th>BB &lt;12</th><th>BB 12+</th><th>Béton</th></tr>
              </thead>
              <tbody>
                <tr><td>Vacances</td><td>2–5 % RB</td><td>2–5 % RB</td><td>2–5 % RB</td></tr>
                <tr><td>Taxes foncières</td><td>Réelles</td><td>Réelles</td><td>Réelles</td></tr>
                <tr><td>Assurance</td><td>Réelle</td><td>Réelle</td><td>Réelle</td></tr>
                <tr><td>Électricité</td><td>Réelle</td><td>Réelle</td><td>Réelle</td></tr>
                <tr><td>Entretien</td><td>610 $/PUPA*</td><td>610 $/PUPA*</td><td>925 $/PUPA*</td></tr>
                <tr><td>Gestion</td><td>4,25 % RBE</td><td>5,0 % RBE</td><td>5,0 % RBE</td></tr>
                <tr><td>Concierge</td><td>215 $/PUPA*</td><td>365 $/PUPA*</td><td>610 $/PUPA*</td></tr>
              </tbody>
            </table>
            <div class="ca-schl-pupa-note">* PUPA : Par Unité Par Année</div>
            <table>
              <thead>
                <tr><th colspan="3">2. Réserve de remplacement</th></tr>
                <tr><th>Équipement</th><th>Montant</th><th>Notes</th></tr>
              </thead>
              <tbody>
                <tr><td>Électroménager</td><td>60 $/app./an</td><td>Par appareil du propriétaire</td></tr>
                <tr><td>Thermopompe / Clim.</td><td>190 $/unité/an</td><td>Par appareil fourni</td></tr>
                <tr><td>Ascenseur</td><td>3 600 $/asc./an</td><td>300 $/mois</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="ca-footer">
          ${PRINT_BUTTON_HTML}
          ${buildVersionFooter()}
        </div>
      </div>
    `;

    root.querySelector(".ca-close")?.addEventListener("click", () => {
      state.open = false;
      renderVisibleState();
    });
    root.querySelector(".ca-print")?.addEventListener("click", () => window.print());
    root.querySelectorAll(".ca-btn-building").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.buildingType = btn.dataset.type;
        renderPanel(data);
      });
    });

    renderVisibleState();
  }

  function createSignature(data) {
    if (!data) return "";
    const configSig = state.remoteConfig
      ? `${state.remoteConfig.killSwitch ? 1 : 0}:${state.remoteConfig.minVersion || ""}:${state.remoteConfig.latestVersion || ""}:${state.remoteConfig.message || ""}`
      : "no-config";
    return [
      data.listingId,
      data.askingPrice,
      data.grossPotential,
      data.taxes,
      data.operatingExpenses,
      configSig
    ].join("|");
  }

  function refresh() {
    const data = extractData();
    const signature = createSignature(data);

    if (signature === state.lastSignature) return;
    state.lastSignature = signature;
    renderPanel(data);
  }

  function debounce(fn, wait) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, wait);
    };
  }

  const debouncedRefresh = debounce(refresh, 200);

  const observer = new MutationObserver(() => {
    debouncedRefresh();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("popstate", debouncedRefresh);
  window.addEventListener("hashchange", debouncedRefresh);

  const originalPushState = history.pushState;
  history.pushState = function () {
    const result = originalPushState.apply(this, arguments);
    debouncedRefresh();
    return result;
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function () {
    const result = originalReplaceState.apply(this, arguments);
    debouncedRefresh();
    return result;
  };

  refresh();

  loadRemoteConfig().then(() => {
    refresh();
  });
})();
