// registration.js (Логіка реєстрації та формування команди)

import { auth } from './firebase-config.js'; 
import { registerUser, createTeam, joinTeam } from './tournamentService.js';
import { createUserWithEmailAndPassword } from 'firebase/auth'; // Потрібен тут для registerUser

const form = document.getElementById('registrationForm');
const messageDiv = document.getElementById('message');
const roleInputs = document.querySelectorAll('input[name="role"]');
const captainSection = document.getElementById('captainSection');
const participantSection = document.getElementById('participantSection');

function displayMessage(msg, type) {
    messageDiv.innerHTML = msg; // Використовуємо innerHTML для форматування коду
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
}

roleInputs.forEach(input => {
    input.addEventListener('change', (e) => {
        captainSection.classList.add('hidden');
        participantSection.classList.add('hidden');
        document.getElementById('teamName').required = false;
        document.getElementById('teamCode').required = false;

        if (e.target.value === 'captain') {
            captainSection.classList.remove('hidden');
            document.getElementById('teamName').required = true;
        } else if (e.target.value === 'participant') {
            participantSection.classList.remove('hidden');
            document.getElementById('teamCode').required = true;
        }
        // Роль "judge" не вимагає додаткових полів
    });
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    displayMessage('Реєстрація...', 'info');

    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;
    const password = document.getElementById('password').value;
    const role = document.querySelector('input[name="role"]:checked')?.value;
    const teamName = document.getElementById('teamName').value;
    const teamCode = document.getElementById('teamCode').value;

    try {
        const userId = await registerUser({ name, email, phone, password, role });
        
        let finalMessage = "Реєстрація успішна! Ви можете увійти.";

        if (role === 'captain') {
            if (!teamName) throw new Error("Будь ласка, введіть назву команди.");
            const { teamCode: generatedCode } = await createTeam(teamName, userId);
            finalMessage = `Вітаємо, ${name}! Ви зареєстрували команду "${teamName}". Ваш код команди для учасників: <b>${generatedCode}</b>`;
        } else if (role === 'participant') {
            if (!teamCode) throw new Error("Будь ласка, введіть код команди.");
            const joinedTeamName = await joinTeam(teamCode, userId);
            finalMessage = `Вітаємо, ${name}! Ви приєдналися до команди "${joinedTeamName}".`;
        } else if (role === 'judge') {
             finalMessage = `Вітаємо, ${name}! Ви зареєстровані як суддя.`;
        }

        displayMessage(finalMessage, 'success');
        form.reset(); 
        
    } catch (error) {
        let errorMessage;
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Цей Email вже використовується.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Пароль має бути не менше 6 символів.';
        } else {
            errorMessage = `Помилка реєстрації: ${error.message}`;
        }
        
        displayMessage(errorMessage, 'error');
    }
});
