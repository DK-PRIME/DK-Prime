// admin_judge_logic.js (Логіка для адміна та судді)

import { auth, db } from './firebase-config.js'; 
import { doc, getDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { confirmPayment, runDraw, getTeamsForJudgeZone, recordWeighing } from './tournamentService.js';


// --- КОНСТАНТИ ТА ЕЛЕМЕНТИ ---
const adminSection = document.getElementById('adminSection');
const judgeSection = document.getElementById('judgeSection');
const userRoleStatus = document.getElementById('userRoleStatus');
const adminMessageDiv = document.getElementById('adminMessage');
const judgeHeader = document.getElementById('judgeHeader');
const teamsContainer = document.getElementById('teamsContainer');
const registrationsList = document.getElementById('registrationsList');
const runDrawButton = document.getElementById('runDrawButton');
const sectorsInput = document.getElementById('availableSectorsInput');
const CURRENT_TOURNAMENT_ID = document.getElementById('adminTournamentId').value;


// --- ДОПОМІЖНІ ФУНКЦІЇ ---

function displayAdminMessage(msg, type = 'info') {
    adminMessageDiv.textContent = msg;
    adminMessageDiv.className = `message ${type}`;
}

// --- 1. АДМІН-ЛОГІКА (Крок 4, 5) ---

async function loadAdminInterface() {
    displayAdminMessage('Завантаження заявок...', 'info');
    registrationsList.innerHTML = '<tr><td colspan="5" style="text-align: center;">Завантаження...</td></tr>';
    
    try {
        const q = query(collection(db, "registrations"), where("tournamentId", "==", CURRENT_TOURNAMENT_ID), orderBy("submissionDate", "asc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            registrationsList.innerHTML = '<tr><td colspan="5" style="text-align: center;">Жодних заявок.</td></tr>';
            return;
        }

        let html = '';
        querySnapshot.forEach(doc => {
            const reg = doc.data();
            const id = doc.id;
            const isPaid = reg.paid;
            const statusClass = isPaid ? 'status-paid' : 'status-pending';
            const statusText = isPaid ? 'Оплачено' : 'Очікує оплати';
            const sector = reg.zone && reg.sector ? `${reg.zone}-${reg.sector}` : 'Не призначено';

            html += `
                <tr>
                    <td>${id.substring(0, 6)}...</td>
                    <td>${reg.teamName}</td>
                    <td>${sector}</td>
                    <td class="${statusClass}">${statusText}</td>
                    <td>
                        <button class="confirm-btn" data-id="${id}" ${isPaid ? 'disabled' : ''}>
                            ${isPaid ? 'Підтверджено' : 'Підтвердити Оплату'}
                        </button>
                    </td>
                </tr>
            `;
        });
        
        registrationsList.innerHTML = html;
        document.querySelectorAll('.confirm-btn').forEach(button => {
            button.addEventListener('click', handlePaymentConfirmation);
        });
        displayAdminMessage('Дані завантажено.', 'success');

    } catch (error) {
        displayAdminMessage(`Помилка завантаження: ${error.message}`, 'error');
    }
}

async function handlePaymentConfirmation(e) {
    const button = e.target;
    const registrationId = button.getAttribute('data-id');
    button.disabled = true;
    button.textContent = 'Обробка...';

    try {
        await confirmPayment(registrationId);
        displayAdminMessage('Оплату успішно підтверджено!', 'success');
        await loadAdminInterface(); // Оновлюємо список
    } catch (error) {
        displayAdminMessage(`Помилка: ${error.message}`, 'error');
        button.disabled = false;
        button.textContent = 'Помилка!';
    }
}

async function handleDraw() {
    runDrawButton.disabled = true;
    runDrawButton.textContent = 'Жеребкування...';
    try {
        const sectorString = sectorsInput.value.trim();
        const availableSectors = sectorString.split(',').map(s => s.trim().toUpperCase()).filter(s => s.includes('-'));

        await runDraw(CURRENT_TOURNAMENT_ID, availableSectors);
        
        displayAdminMessage('🎉 Жеребкування успішно завершено!', 'success');
        await loadAdminInterface(); // Оновлюємо таблицю з призначеними секторами
        runDrawButton.textContent = 'Жеребкування Проведено!';
        
    } catch (error) {
        displayAdminMessage(`Помилка жеребкування: ${error.message}`, 'error');
        runDrawButton.disabled = false;
        runDrawButton.textContent = 'Провести Жеребкування';
    }
}

// --- 2. СУДДІВСЬКА ЛОГІКА (Крок 6) ---

async function loadJudgeInterface(assignedZone) {
    judgeHeader.textContent = `2. Суддівство (Зона: ${assignedZone})`;
    teamsContainer.innerHTML = '<p>Завантаження команд...</p>';
    
    try {
        const teams = await getTeamsForJudgeZone(CURRENT_TOURNAMENT_ID, assignedZone);
        renderTeams(teams);
    } catch (error) {
        teamsContainer.innerHTML = `<p style="color:red;">Помилка: ${error.message}</p>`;
    }
}

function renderTeams(teams) {
    // ... (Функція renderTeams з попередньої відповіді, яка створює картки команд) ...
    // Для стислості, тут припускається, що вона додана.
    if (teams.length === 0) {
        teamsContainer.innerHTML = '<p>У вашій зоні ще немає команд.</p>';
        return;
    }
    
    let html = '';
    teams.forEach(team => {
        const weighings = team.weighings || [];
        const totalWeight = team.totalWeight || 0;
        
        const weighingListHtml = weighings.map(w => 
            `<li>${w.weight} кг (час: ${new Date(w.timestamp.seconds * 1000).toLocaleTimeString('uk-UA')})</li>`
        ).join('');
        
        html += `
            <div class="team-card" data-reg-id="${team.id}">
                <div class="team-header">
                    <span>${team.zone}-${team.sector}: <b>${team.teamName}</b></span>
                    <span class="total-weight">Вага: ${totalWeight.toFixed(2)} кг</span>
                </div>
                
                <div class="weighing-form">
                    <input type="number" step="0.01" min="0.1" placeholder="Вага риби (кг)" data-reg-id="${team.id}" class="weight-input">
                    <button data-reg-id="${team.id}" class="record-btn">Внести Зважування</button>
                </div>

                <div class="weighing-info">
                    <strong>Історія зважувань:</strong>
                    <ul class="weighing-list">${weighingListHtml || '<li>Зважувань ще не було.</li>'}</ul>
                </div>
            </div>
        `;
    });
    
    teamsContainer.innerHTML = html;
    
    document.querySelectorAll('.record-btn').forEach(button => {
        button.addEventListener('click', handleRecordClick);
    });
}

async function handleRecordClick(e) {
    const button = e.target;
    const registrationId = button.getAttribute('data-reg-id');
    const input = document.querySelector(`.weight-input[data-reg-id="${registrationId}"]`);
    const fishWeight = parseFloat(input.value);
    
    if (isNaN(fishWeight) || fishWeight <= 0.01) {
        alert("Введіть коректну вагу.");
        return;
    }
    
    button.disabled = true;
    button.textContent = 'Збереження...';
    
    try {
        await recordWeighing(registrationId, fishWeight, auth.currentUser.uid);
        
        displayAdminMessage(`Вага ${fishWeight} кг успішно внесена!`, 'success');
        input.value = ''; 
        
        const judgeDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        const assignedZone = judgeDoc.data().judgeZone;
        await loadJudgeInterface(assignedZone); // Перезавантажуємо
        
    } catch (error) {
        displayAdminMessage(`Помилка запису: ${error.message}`, 'error');
        button.disabled = false;
        button.textContent = 'Внести Зважування';
    }
}


// --- 3. ІНІЦІАЛІЗАЦІЯ ---

auth.onAuthStateChanged(async (user) => {
    if (!user) {
        userRoleStatus.textContent = "Статус: Ви не увійшли. Доступ обмежено.";
        adminSection.classList.add('hidden');
        judgeSection.classList.add('hidden');
        return;
    }

    const userDoc = await getDoc(doc(db, "users", user.uid));
    const role = userDoc.data()?.role;
    
    userRoleStatus.textContent = `Статус: Увійшов як ${role} (${user.email})`;

    if (role === 'admin') {
        adminSection.classList.remove('hidden');
        runDrawButton.addEventListener('click', handleDraw);
        loadAdminInterface();
    } else if (role === 'judge') {
        const assignedZone = userDoc.data()?.judgeZone; 
        if (assignedZone) {
            judgeSection.classList.remove('hidden');
            loadJudgeInterface(assignedZone);
        } else {
             userRoleStatus.textContent += " | Зона не призначена.";
        }
    } else {
        userRoleStatus.textContent = "Статус: Недостатньо прав доступу.";
    }
});
