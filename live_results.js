// live_results.js (Логіка Лайв-Таблиць)

import { subscribeToLiveResults } from "./tournamentService.js";

const resultsBodyEl     = document.getElementById("resultsBody");
const statusMessageEl   = document.getElementById("statusMessage");
const liveTournamentEl  = document.getElementById("liveTournamentId");
const CURRENT_TOURNAMENT_ID = liveTournamentEl ? liveTournamentEl.value : "";

// Рендер результатів у таблицю
function renderResults(teams) {
  if (!resultsBodyEl || !statusMessageEl) {
    console.warn("⚠️ live_results: немає елементів resultsBody або statusMessage в DOM");
    return;
  }

  if (!teams || teams.length === 0) {
    resultsBodyEl.innerHTML =
      '<tr><td colspan="6">Дані лайв-результатів відсутні.</td></tr>';
    statusMessageEl.textContent = "Оновлено: Дані відсутні.";
    return;
  }

  let html = "";

  // Сортування за зоною, а потім за місцем у зоні
  teams.sort((a, b) => {
    if ((a.zone || "") < (b.zone || "")) return -1;
    if ((a.zone || "") > (b.zone || "")) return 1;
    return (a.zonePlace || 0) - (b.zonePlace || 0);
  });

  let lastZone = null;

  teams.forEach((team) => {
    const zonePlace     = team.zonePlace || "-";
    const totalWeight   = (team.totalWeight || 0).toFixed(2);
    const weighingsCount = Array.isArray(team.weighings)
      ? team.weighings.length
      : 0;

    if (team.zone && team.zone !== lastZone) {
      html += `
        <tr class="zone-separator">
          <td colspan="6" class="zone-name">Зона ${team.zone}</td>
        </tr>
      `;
      lastZone = team.zone;
    }

    html += `
      <tr>
        <td class="zone-place">${zonePlace}</td>
        <td>${team.zone || "N/A"}</td>
        <td>${team.sector || "N/A"}</td>
        <td style="text-align: left;">${team.teamName || "-"}</td>
        <td class="total-weight">${totalWeight}</td>
        <td>${weighingsCount}</td>
      </tr>
    `;
  });

  resultsBodyEl.innerHTML = html;
  statusMessageEl.textContent = `Оновлено: ${new Date().toLocaleTimeString(
    "uk-UA",
  )}`;
}

function initLiveResults() {
  if (!statusMessageEl) {
    console.warn("⚠️ live_results: statusMessage не знайдений");
    return;
  }
  if (!CURRENT_TOURNAMENT_ID) {
    console.warn("⚠️ live_results: liveTournamentId не заданий");
    statusMessageEl.textContent = "Помилка: ID турніру не заданий.";
    return;
  }

  statusMessageEl.textContent = "Підключення до бази даних...";

  const unsubscribe = subscribeToLiveResults(
    CURRENT_TOURNAMENT_ID,
    renderResults,
  );

  // На всякий, щоб відписатися при закритті сторінки
  if (typeof unsubscribe === "function") {
    window.addEventListener("beforeunload", unsubscribe);
  }
}

// Старт
initLiveResults();
