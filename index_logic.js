// index_logic.js (Логіка авторизації для index.html)

import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore'; 

const loginForm = document.getElementById('loginForm');
const adminLinks = document.getElementById('adminLinks');
const authMessage = document.getElementById('authMessage');
const userStatus = document.getElementById('userStatus');
const logoutButton = document.getElementById('logoutButton');
const judgeBadge = document.getElementById('judgeBadge');
const registerLink = document.querySelector('.register-link'); // Новий елемент

// --- 1. ЛОГІКА ВХОДУ ---

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authMessage.textContent = 'Вхід...';
    authMessage.style.color = 'var(--accent)';

    const email = document.getElementById('emailInput').value;
    const password = document.getElementById('passwordInput').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // auth.onAuthStateChanged візьме на себе подальше оновлення інтерфейсу
    } catch (error) {
        let message = 'Помилка входу. Перевірте email та пароль.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            message = 'Невірний email або пароль.';
        }
        authMessage.textContent = message;
        authMessage.style.color = 'var(--error)';
    }
});

// --- 2. ЛОГІКА ВИХОДУ ---

logoutButton.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        authMessage.textContent = `Помилка виходу: ${error.message}`;
        authMessage.style.color = 'var(--error)';
    }
});

// --- 3. ПЕРЕВІРКА АВТОРИЗАЦІЇ ТА РОЛІ ---

auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Користувач увійшов
        loginForm.classList.add('hidden');
        registerLink.classList.add('hidden'); // Ховаємо посилання на реєстрацію
        logoutButton.classList.remove('hidden');
        authMessage.textContent = '';
        
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            const role = userDoc.data()?.role;
            const judgeZone = userDoc.data()?.judgeZone;

            userStatus.textContent = `Увійшов як: ${role} (${user.email})`;
            userStatus.classList.remove('hidden');

            // Перевірка ролей: доступ надається лише адміністраторам та суддям
            if (role === 'admin' || role === 'judge') {
                adminLinks.classList.remove('hidden');
                
                // Відображення призначеної зони для судді
                if (role === 'judge' && judgeZone) {
                    judgeBadge.textContent = `Zone: ${judgeZone} → results`;
                } else {
                    judgeBadge.textContent = 'private → results';
                }
                
            } else {
                // Інші ролі (participant/captain)
                adminLinks.classList.add('hidden');
                authMessage.textContent = `Ваша роль (${role}) не має доступу до цієї панелі.`;
                authMessage.style.color = 'var(--error)';
            }
            
        } catch (error) {
            authMessage.textContent = `Помилка отримання даних користувача: ${error.message}`;
            authMessage.style.color = 'var(--error)';
            adminLinks.classList.add('hidden');
        }

    } else {
        // Користувач вийшов
        loginForm.classList.remove('hidden');
        registerLink.classList.remove('hidden'); // Показуємо посилання на реєстрацію
        logoutButton.classList.add('hidden');
        adminLinks.classList.add('hidden');
        userStatus.classList.add('hidden');
        userStatus.textContent = '';
        judgeBadge.textContent = 'private → results'; // Скидаємо бейдж
    }
});
