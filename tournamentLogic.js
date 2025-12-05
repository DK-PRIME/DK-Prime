// tournamentLogic.js 

// Додайте імпорт db та getDoc
import { auth, db } from './firebase-config.js'; 
import { registerTeamForTournament } from './tournamentService.js';
import { doc, getDoc } from 'firebase/firestore'; // Для запиту до Firestore

const form = document.getElementById('tournamentRegistrationForm');
const messageDiv = document.getElementById('regMessage');
const teamNameDisplay = document.getElementById('teamNameDisplay');

// Функція відображення повідомлень
function displayRegMessage(msg, type) {
    messageDiv.textContent = msg;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
}

// Функція для перевірки статусу авторизації та завантаження назви команди
async function loadTeamInfo() {
    const user = auth.currentUser;
    const submitButton = document.getElementById('submitRegistration');

    if (user) {
        try {
            const userId = user.uid;
            
            // 1. Отримання даних користувача (для teamId)
            const userDocRef = doc(db, "users", userId);
            const userDoc = await getDoc(userDocRef);
            const userData = userDoc.data();
            
            const teamId = userData.teamId;

            if (!teamId) {
                teamNameDisplay.textContent = "❌ Ви не є членом жодної команди. Заявка неможлива.";
                submitButton.disabled = true;
                return;
            }

            // 2. Отримання даних команди (для назви)
            const teamDocRef = doc(db, "teams", teamId);
            const teamDoc = await getDoc(teamDocRef);
            const teamName = teamDoc.data()?.name || "Назва не знайдена";

            // Відображення назви команди
            teamNameDisplay.innerHTML = `✅ Ваша команда: <b>${teamName}</b>`;
            submitButton.disabled = false;

        } catch (error) {
            console.error("Помилка завантаження інформації про команду:", error);
            teamNameDisplay.textContent = "Помилка завантаження даних команди.";
            submitButton.disabled = true;
        }

    } else {
        teamNameDisplay.textContent = "Будь ласка, увійдіть, щоб подати заявку.";
        submitButton.disabled = true;
    }
}

// Обробка відправки форми
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    displayRegMessage('Обробка заявки...', 'info');

    const tournamentId = document.getElementById('currentTournamentId').value;
    const optionFood = document.getElementById('optionFood').checked;
    const optionRules = document.getElementById('optionRules').checked;
    
    // Перевірка, чи користувач підтвердив регламент
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
        
        // Тут можна додати логіку перенаправлення на сторінку оплати
        
    } catch (error) {
        console.error("Помилка подачі заявки:", error);
        displayRegMessage(`Помилка: ${error.message}`, 'error');
    }
});

// Запускаємо перевірку при завантаженні сторінки
loadTeamInfo();
