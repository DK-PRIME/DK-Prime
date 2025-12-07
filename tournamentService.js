// tournamentService.js
// (Всі функції з Кроків 1-7)

// Підтягуємо готові auth і db з firebase-config.js
import { db, auth } from "./firebase-config.js";

// Імпортуємо те, що потрібно з Firebase Auth
import {
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// Імпортуємо те, що потрібно з Firestore
import {
  doc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  query,
  where,
  getDocs,
  arrayUnion,
  onSnapshot,
  orderBy,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";


// --- ДОПОМІЖНІ ФУНКЦІЇ ---

function generateTeamCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}


// --- 1. ФУНКЦІЇ РЕЄСТРАЦІЇ ТА КОМАНД (Крок 1, 2) ---

export async function registerUser({ name, email, phone, password, role }) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  await addDoc(collection(db, "users"), {
    uid: user.uid,
    name,
    email,
    phone,
    role,
    createdAt: new Date(),
    teamId: null,
  });

  // Якщо хочеш мати документ строго за uid:
  // await setDoc(doc(db, "users", user.uid), {
  //   name,
  //   email,
  //   phone,
  //   role,
  //   createdAt: new Date(),
  //   teamId: null,
  // });

  return user.uid;
}

export async function createTeam(teamName, captainId) {
  const teamCode = generateTeamCode();

  const teamRef = await addDoc(collection(db, "teams"), {
    name: teamName,
    captainId,
    teamCode,
    members: [captainId],
    createdAt: new Date(),
  });
  const teamId = teamRef.id;

  const userRef = doc(db, "users", captainId);
  await updateDoc(userRef, { teamId });

  return { teamId, teamCode, teamName };
}

export async function joinTeam(teamCode, participantId) {
  const teamsRef = collection(db, "teams");
  const q = query(teamsRef, where("teamCode", "==", teamCode.toUpperCase()));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    throw new Error(`Команду з кодом "${teamCode}" не знайдено.`);
  }

  const teamDoc = querySnapshot.docs[0];
  const teamId = teamDoc.id;
  const teamData = teamDoc.data();
  const teamName = teamData.name;

  if (teamData.members && teamData.members.includes(participantId)) {
    return teamName;
  }

  const teamDocRef = doc(db, "teams", teamId);
  await updateDoc(teamDocRef, { members: arrayUnion(participantId) });

  const userDocRef = doc(db, "users", participantId);
  await updateDoc(userDocRef, { teamId });

  return teamName;
}


// --- 2. ФУНКЦІЯ ПОДАЧІ ЗАЯВКИ (Крок 3) ---

export async function registerTeamForTournament(tournamentId, options) {
  const user = auth.currentUser;
  if (!user) throw new Error("Користувач не авторизований.");

  const userId = user.uid;

  const userDocSnap = await getDoc(doc(db, "users", userId));
  const userData = userDocSnap.data();
  const teamId = userData?.teamId;

  if (!teamId) throw new Error("Ви не приєднані до жодної команди.");

  const teamDocSnap = await getDoc(doc(db, "teams", teamId));
  const teamData = teamDocSnap.data();

  const registrationsRef = collection(db, "registrations");
  const existingQuery = await getDocs(
    query(
      registrationsRef,
      where("tournamentId", "==", tournamentId),
      where("teamId", "==", teamId)
    )
  );

  if (!existingQuery.empty) {
    throw new Error(`Команда "${teamData.name}" вже подала заявку на цей етап.`);
  }

  await addDoc(registrationsRef, {
    tournamentId,
    teamId,
    teamName: teamData.name,
    submittedBy: userId,
    foodOptions: options.food || false,
    agreedToRules: options.agreed || false,
    paid: false,
    status: "pending_payment",
    submissionDate: new Date(),
    totalWeight: 0,
    weighings: [],
  });
}


// --- 3. ФУНКЦІЇ АДМІНІСТРУВАННЯ (Крок 4, 5) ---

export async function confirmPayment(registrationId) {
  const registrationRef = doc(db, "registrations", registrationId);
  await updateDoc(registrationRef, {
    paid: true,
    status: "paid_confirmed",
    paymentConfirmedAt: new Date(),
  });
}

export async function runDraw(tournamentId, availableSectors) {
  const registrationsRef = collection(db, "registrations");
  const q = query(
    registrationsRef,
    where("tournamentId", "==", tournamentId),
    where("paid", "==", true)
  );
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    throw new Error("Немає команд із підтвердженою оплатою.");
  }

  if (querySnapshot.docs.length > availableSectors.length) {
    throw new Error("Кількість команд перевищує кількість секторів.");
  }

  const paidTeams = querySnapshot.docs.map((d) => ({ id: d.id }));
  const sectorsToAssign = [...availableSectors];

  // Перемішуємо сектори
  sectorsToAssign.sort(() => Math.random() - 0.5);

  const updates = [];

  paidTeams.forEach((team, index) => {
    const fullSector = sectorsToAssign[index];
    const [zone, sector] = fullSector.split("-");

    updates.push(
      updateDoc(doc(db, "registrations", team.id), {
        zone,
        sector,
        drawStatus: "completed",
      })
    );
  });

  await Promise.all(updates);
}


// --- 4. ФУНКЦІЇ СУДДІВСТВА (Крок 6) ---

export async function getTeamsForJudgeZone(tournamentId, judgeZone) {
  const registrationsRef = collection(db, "registrations");
  const q = query(
    registrationsRef,
    where("tournamentId", "==", tournamentId),
    where("paid", "==", true),
    where("zone", "==", judgeZone)
  );
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

export async function recordWeighing(registrationId, fishWeight, judgeId) {
  if (fishWeight <= 0) {
    throw new Error("Вага риби має бути більше нуля.");
  }

  const registrationRef = doc(db, "registrations", registrationId);
  const newWeighing = {
    weight: fishWeight,
    timestamp: new Date(),
    recordedBy: judgeId,
  };

  // Транзакція гарантує коректну загальну вагу
  await runTransaction(db, async (transaction) => {
    const docSnap = await transaction.get(registrationRef);
    if (!docSnap.exists()) {
      throw new Error("Документ не існує.");
    }

    const data = docSnap.data();
    const currentTotalWeight = data.totalWeight || 0;
    const currentWeighings = data.weighings || [];

    transaction.update(registrationRef, {
      weighings: [...currentWeighings, newWeighing],
      totalWeight: currentTotalWeight + fishWeight,
    });
  });
}


// --- 5. ФУНКЦІЇ ЛАЙВ-ТАБЛИЦЬ (Крок 7) ---

function calculateZonePlaces(teams) {
  const teamsByZone = teams.reduce((acc, team) => {
    const zone = team.zone || "N/A";
    if (!acc[zone]) acc[zone] = [];
    acc[zone].push(team);
    return acc;
  }, {});

  const finalResults = [];

  for (const zone in teamsByZone) {
    const sortedTeams = teamsByZone[zone].sort(
      (a, b) => (b.totalWeight || 0) - (a.totalWeight || 0)
    );

    sortedTeams.forEach((team, index) => {
      team.zonePlace = index + 1;
      finalResults.push(team);
    });
  }

  // Загальний рейтинг по вазі
  finalResults.sort(
    (a, b) => (b.totalWeight || 0) - (a.totalWeight || 0)
  );

  return finalResults;
}

export function subscribeToLiveResults(tournamentId, callback) {
  const registrationsRef = collection(db, "registrations");

  const q = query(
    registrationsRef,
    where("tournamentId", "==", tournamentId),
    where("paid", "==", true),
    orderBy("totalWeight", "desc")
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const teams = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const teamsWithPlaces = calculateZonePlaces(teams);
      callback(teamsWithPlaces);
    },
    (error) => {
      console.error("Помилка при слуханні лайв-результатів:", error);
      callback([]);
    }
  );

  return unsubscribe;
}
