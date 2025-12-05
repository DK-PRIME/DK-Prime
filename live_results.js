// live_results.js (Логіка Лайв-Таблиць)

import { subscribeToLiveResults } from './tournamentService.js'; 

const resultsBody = document.getElementById('resultsBody');
const statusMessage = document.getElementById('statusMessage');
const CURRENT_TOURNAMENT_ID = document.getElementById('liveTournamentId').value; 

function renderResults(teams) {
    if (teams.length === 0) {
        resultsBody.innerHTML = '<tr><td colspan="6">Дані лайв-результатів відсутні.</td></tr>';
        statusMessage.textContent = 'Оновлено: Дані відсутні.';
        return;
    }

    let html = '';
    
    // Сортування за Зоною, а потім за місцем у Зоні
    teams.sort((a, b) => {
        if (a.zone < b.zone) return -1;
        if (a.zone > b.zone) return 1;
        return a.zonePlace - b.zonePlace;
    });

    let lastZone = null;
    
    teams.forEach(team => {
        const zonePlace = team.zonePlace || '-';
        const totalWeight = (team.totalWeight || 0).toFixed(2);
        const weighingsCount = team.weighings ? team.weighings.length : 0;
        
        if (team.zone && team.zone !== lastZone) {
            html += `<tr class="zone-separator"><td colspan="6" class="zone-name">Зона ${team.zone}</td></tr>`;
            lastZone = team.zone;
        }

        html += `
            <tr>
                <td class="zone-place">${zonePlace}</td>
                <td>${team.zone || 'N/A'}</td>
                <td>${team.sector || 'N/A'}</td>
                <td style="text-align: left;">${team.teamName}</td>
                <td class="total-weight">${totalWeight}</td>
                <td>${weighingsCount}</td>
            </tr>
        `;
    });

    resultsBody.innerHTML = html;
    statusMessage.textContent = `Оновлено: ${new Date().toLocaleTimeString('uk-UA')}`;
}

function initLiveResults() {
    statusMessage.textContent = 'Підключення до бази даних...';
    
    const unsubscribe = subscribeToLiveResults(CURRENT_TOURNAMENT_ID, renderResults);
    
    window.addEventListener('beforeunload', unsubscribe);
}

initLiveResults();
