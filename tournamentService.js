// tournamentService.js

import { db, auth } from './firebase-config.js'; // Додайте 'auth' для перевірки
import { doc, getDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';

/**
 * Команда подає заявку на конкретний турнірний етап.
 */
export async function registerTeamForTournament(tournamentId, options) {
    const user = auth.currentUser;
    if (!user) {
        throw new Error("Користувач не авторизований. Спочатку виконайте вхід.");
    }

    const userId = user.uid;

    try {
        // 1. Отримання даних користувача для teamId
        const userDocRef = doc(db, "users", userId);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.data();
        
        const teamId = userData.teamId;

        if (!teamId) {
            throw new Error("Ви не приєднані до жодної команди.");
        }

        // 2. Отримання даних команди (для назви)
        const teamDocRef = doc(db, "teams", teamId);
        const teamDoc = await getDoc(teamDocRef);
        const teamData = teamDoc.data();
        
        // 3. Перевірка, чи команда вже зареєстрована
        const registrationsRef = collection(db, "registrations");
        const existingQuery = await getDocs(
            query(registrationsRef, 
                  where("tournamentId", "==", tournamentId), 
                  where("teamId", "==", teamId))
        );

        if (!existingQuery.empty) {
            throw new Error(`Команда "${teamData.name}" вже подала заявку на цей етап.`);
        }

        // 4. Створення нового документа заявки
        await addDoc(registrationsRef, {
            tournamentId: tournamentId,
            teamId: teamId, 
            teamName: teamData.name, 
            submittedBy: userId, 
            foodOptions: options.food || false,
            agreedToRules: options.agreed || false,
            paid: false, 
            status: 'pending_payment',
            submissionDate: new Date()
        });

    } catch (error) {
        console.error("Помилка під час подачі заявки:", error.message);
        throw error;
    }
}
