// registration.js

// 1. Імпорт Firebase функцій
import { auth, db } from './firebase-config.js'; // Змінено на ваш файл
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, collection, addDoc, updateDoc, query, where, getDocs, arrayUnion } from 'firebase/firestore';

// --- ДОПОМІЖНІ ФУНКЦІЇ (як ми розробили раніше) ---

// A. Генератор коду команди (для капітана)
function generateTeamCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// B. Реєстрація користувача та збереження даних у Firestore (Крок 1)
async function registerUser({ name, email, phone, password, role }) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await setDoc(doc(db, "users", user.uid), {
        name: name,
        email: email,
        phone: phone,
        role: role,
        createdAt: new Date(),
        teamId: null 
    });
    return user.uid;
}

// C. Створення команди (для капітана) (Крок 2, частина 1)
async function createTeam(teamName, captainId) {
    const teamCode = generateTeamCode();
    
    const teamRef = await addDoc(collection(db, "teams"), {
        name: teamName,
        captainId: captainId,
        teamCode: teamCode,
        members: [captainId],
        createdAt: new Date()
    });
    const teamId = teamRef.id;

    const userRef = doc(db, "users", captainId);
    await updateDoc(userRef, { teamId: teamId });
    
    return { teamId, teamCode, teamName };
}

// D. Приєднання до команди (для учасника) (Крок 2, частина 2)
async function joinTeam(teamCode, participantId) {
    const teamsRef = collection(db, "teams");
    const q = query(teamsRef, where("teamCode", "==", teamCode.toUpperCase()));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        throw new Error(`Команду з кодом "${teamCode}" не знайдено.`);
    }

    const teamDoc = querySnapshot.docs[0];
    const teamId = teamDoc.id;
    const teamName = teamDoc.data().name;

    if (teamDoc.data().members.includes(participantId)) {
        return teamName; // Вже учасник
    }

    const teamDocRef = doc(db, "teams", teamId);
    await updateDoc(teamDocRef, { members: arrayUnion(participantId) });

    const userDocRef = doc(db, "users", participantId);
    await updateDoc(userDocRef, { teamId: teamId });
    
    return teamName;
}


// --- ОСНОВНА ЛОГІКА ОБРОБКИ ФОРМИ ---

const form = document.getElementById('registrationForm');
const messageDiv = document.getElementById('message');
const roleInputs = document.querySelectorAll('input[name="role"]');
const captainSection = document.getElementById('captainSection');
const participantSection = document.getElementById('participantSection');

// Функція відображення повідомлень
function displayMessage(msg, type) {
    messageDiv.textContent = msg;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
}

// Логіка перемикання секцій капітан/учасник
roleInputs.forEach(input => {
    input.addEventListener('change', (e) => {
        captainSection.classList.add('hidden');
        participantSection.classList.add('hidden');
        if (e.target.value === 'captain') {
            captainSection.classList.remove('hidden');
            document.getElementById('teamName').required = true;
            document.getElementById('teamCode').required = false;
        } else if (e.target.value === 'participant') {
            participantSection.classList.remove('hidden');
            document.getElementById('teamCode').required = true;
            document.getElementById('teamName').required = false;
        }
    });
});


// Обробка відправки форми
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
        // 1. Реєстрація користувача (Крок 1)
        const userId = await registerUser({ name, email, phone, password, role });
        
        let finalMessage = "Реєстрація успішна!";

        // 2. Обробка ролі (Крок 2)
        if (role === 'captain') {
            if (!teamName) throw new Error("Будь ласка, введіть назву команди.");
            const { teamCode: generatedCode } = await createTeam(teamName, userId);
            finalMessage = `Вітаємо, ${name}! Ви успішно зареєстрували команду "${teamName}". Ваш код команди для учасників: **${generatedCode}**`;
        } else if (role === 'participant') {
            if (!teamCode) throw new Error("Будь ласка, введіть код команди.");
            const joinedTeamName = await joinTeam(teamCode, userId);
            finalMessage = `Вітаємо, ${name}! Ви успішно приєдналися до команди "${joinedTeamName}".`;
        }

        displayMessage(finalMessage, 'success');
        form.reset(); // Очистити форму
        
        // Тут можна додати перенаправлення на сторінку турнірів
        // setTimeout(() => window.location.href = "/tournaments.html", 3000);

    } catch (error) {
        let errorMessage;
        // Переклад типових помилок Firebase
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Цей Email вже використовується. Спробуйте увійти.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Пароль має бути не менше 6 символів.';
        } else {
            errorMessage = `Помилка реєстрації: ${error.message}`;
        }
        
        displayMessage(errorMessage, 'error');
    }
});
