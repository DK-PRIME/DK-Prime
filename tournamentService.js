// tournamentService.js (або додайте до registration.js, якщо так зручніше)

import { auth, db } from './firebase-config.js'; 
import { doc, getDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';

/**
 * Команда подає заявку на конкретний турнірний етап.
 * @param {string} tournamentId - ID етапу турніру (наприклад, 'etap_1_2026').
 * @param {Object} options - Додаткові опції заявки.
 * @param {boolean} options.food - Чи потрібне харчування.
 * @param {boolean} options.agreed - Згода з регламентом.
 */
export async function registerTeamForTournament(tournamentId, options) {
    const user = auth.currentUser;
    if (!user) {
        throw new Error("Користувач не авторизований. Спочатку виконайте вхід.");
    }

    const userId = user.uid;

    // ... (решта коду функції, яка отримує teamId, teamName і створює документ у 'registrations')
    // ... (див. повний код функції у попередній відповіді)

    // Припустимо, що вся логіка виконана, і заявка створена в 'registrations'
    
}
