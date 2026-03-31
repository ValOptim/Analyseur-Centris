(function () {
  const ROOT_ID = "centris-analyseur-root";
  const TOGGLE_ID = "centris-analyseur-toggle";
  const LABELS = {
    revenus: ["revenus bruts potentiels"],
    unites: ["nombre d unites", "nombre d'unites"],
    unitesRes: ["unites residentielles"],
    usage: ["utilisation de la propriete"]
  };

  const SCHL_DEFAULTS = {
    vacancePct: 3,
    gestionPct: 4,
    entretienPct: 5,
    remplacementPct: 4
  };

  let state = {
    open: true,
    lastSignature: ""
  };

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

  function computeAnalysis(data) {
    const gross = data.grossPotential;
    const price = data.askingPrice;
    const taxes = data.taxes || 0;
    const expenses = data.operatingExpenses || 0;

    const schlNorm = Number.isFinite(gross)
      ? gross * (SCHL_DEFAULTS.vacancePct + SCHL_DEFAULTS.gestionPct + SCHL_DEFAULTS.entretienPct + SCHL_DEFAULTS.remplacementPct) / 100
      : null;

    const netIncome = Number.isFinite(gross)
      ? gross - taxes - expenses - (schlNorm || 0)
      : null;

    const mrb = Number.isFinite(gross) && gross > 0 ? price / gross : null;
    const mrn = Number.isFinite(netIncome) && netIncome > 0 ? price / netIncome : null;
    const tga = Number.isFinite(netIncome) && price > 0 ? (netIncome / price) * 100 : null;

    return {
      schlNorm,
      netIncome,
      mrb,
      mrn,
      tga
    };
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

    const eligibilityError = getEligibilityError(data);
    if (eligibilityError) {
      root.innerHTML = `
        <div class="ca-panel">
          <div class="ca-header">
            <div class="ca-title">Analyse financière préliminaire</div>
            <button class="ca-close" type="button" aria-label="Fermer">x</button>
          </div>
          <div class="ca-content">
            <div class="ca-ineligible">${eligibilityError}</div>
          </div>
          <div class="ca-footer">
            <button class="ca-print" type="button">Imprimer</button>
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

    const analysis = computeAnalysis(data);
    const unitCount = parseUnitCount(data.unitsText);
    const pricePerUnit = unitCount ? data.askingPrice / unitCount : null;

    const taxesSection = data.financialSections.find((s) => normalizeText(s.title).includes("taxes"));
    const depensesSection = data.financialSections.find((s) => normalizeText(s.title).includes("depenses"));
    const otherSections = data.financialSections.filter((s) => s !== taxesSection && s !== depensesSection);

    const mergedDepenses = taxesSection || depensesSection
      ? {
          title: depensesSection?.title || taxesSection?.title,
          items: [
            ...(taxesSection?.items || []).map((item) => ({ ...item, name: `Taxes ${item.name.toLowerCase()}` })),
            ...(depensesSection?.items || [])
          ],
          total: (taxesSection?.total ?? 0) + (depensesSection?.total ?? 0)
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
              ${buildRow("Revenus bruts potentiels", Number.isFinite(data.grossPotential) ? formatMoney(data.grossPotential) : "-")}
            </tbody>
          </table>

          <table>
            <thead><tr><th colspan="2">Indicateurs</th></tr></thead>
            <tbody>
              ${buildRow("MRB", formatNumber(analysis.mrb, 2))}
              ${buildRow("MRN (normalisé)", formatNumber(analysis.mrn, 2))}
              ${buildRow("TGA (normalisé)", Number.isFinite(analysis.tga) ? `${formatNumber(analysis.tga, 2)} %` : "-")}
            </tbody>
          </table>

          ${sectionsHtml}

          <div class="ca-note">
            Hypothèse SCHL v0 : vacance ${SCHL_DEFAULTS.vacancePct} %, gestion ${SCHL_DEFAULTS.gestionPct} %, entretien ${SCHL_DEFAULTS.entretienPct} %, remplacement ${SCHL_DEFAULTS.remplacementPct} % du revenu brut.
          </div>
        </div>
        <div class="ca-footer">
          <button class="ca-print" type="button">Imprimer</button>
        </div>
      </div>
    `;

    root.querySelector(".ca-close")?.addEventListener("click", () => {
      state.open = false;
      renderVisibleState();
    });
    root.querySelector(".ca-print")?.addEventListener("click", () => window.print());

    renderVisibleState();
  }

  function createSignature(data) {
    if (!data) return "";
    return [
      data.listingId,
      data.askingPrice,
      data.grossPotential,
      data.taxes,
      data.operatingExpenses
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
})();
