// tournamentLogic.js (Логіка подачі заявки)

import { auth, db } from './firebase-config.js'; 
import { registerTeamForTournament } from './tournamentService.js';
import { doc, getDoc } from 'firebase/firestore'; 

const form = document.getElementById('tournamentRegistrationForm');
const messageDiv = document.getElementById('regMessage');
const teamNameDisplay = document.getElementById('teamNameDisplay');

function displayRegMessage(msg, type) {
    messageDiv.textContent = msg;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
}

async function loadTeamInfo() {
    const user = auth.currentUser;
    const submitButton = document.getElementById('submitRegistration');

    if (user) {
        try {
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
            const userData = userDoc.data();
            
            const teamId = userData?.teamId;

            if (!teamId) {
                teamNameDisplay.textContent = "❌ Ви не є членом команди. Заявка неможлива.";
                submitButton.disabled = true;
                return;
            }

            const teamDoc = await getDoc(doc(db, "teams", teamId));
            const teamName = teamDoc.data()?.name || "Назва не знайдена";

            teamNameDisplay.innerHTML = `✅ Ваша команда: <b>${teamName}</b>`;
            submitButton.disabled = false;

        } catch (error) {
            teamNameDisplay.textContent = "Помилка завантаження даних команди.";
            submitButton.disabled = true;
        }

    } else {
        teamNameDisplay.textContent = "Будь ласка, увійдіть, щоб подати заявку.";
        submitButton.disabled = true;
    }
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    displayRegMessage('Обробка заявки...', 'info');

    const tournamentId = document.getElementById('currentTournamentId').value;
    const optionFood = document.getElementById('optionFood').checked;
    const optionRules = document.getElementById('optionRules').checked;
    
    if (!optionRules) {
        displayRegMessage('Необхідно підтвердити згоду з регламентом!', 'error');
        return;
    }

    try {
        await registerTeamForTournament(tournamentId, { 
            food: optionFood, 
            agreed: optionRules 
        });

        displayRegMessage('✅ Заявку успішно подано! Очікуйте на підтвердження оплати.', 'success');
        document.getElementById('submitRegistration').disabled = true;
        
    } catch (error) {
        displayRegMessage(`Помилка: ${error.message}`, 'error');
    }
});

auth.onAuthStateChanged(user => {
    if (user) {
        loadTeamInfo();
    } else {
        // Якщо користувач вийшов, оновлюємо інформацію
        loadTeamInfo();
    }
});
