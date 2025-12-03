// Беремо вже ініціалізовані auth і db з твого firebase-модуля
import { auth, db } from "./stolarcarp-firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

import {
  doc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// ---------- DOM-елементи ----------

const emailInput      = document.getElementById("email");
const passwordInput   = document.getElementById("password");
const btnRegister     = document.getElementById("btnRegister");
const btnLogin        = document.getElementById("btnLogin");
const btnLogout       = document.getElementById("btnLogout");
const authStatus      = document.getElementById("authStatus");

const teamSection     = document.getElementById("teamSection");
const teamNameInput   = document.getElementById("teamName");
const btnCreateTeam   = document.getElementById("btnCreateTeam");
const teamStatus      = document.getElementById("teamStatus");
const teamsList       = document.getElementById("teamsList");

const currentUserInfo = document.getElementById("currentUserInfo");

let unsubscribeTeams = null;

// ---------- Хелпер для статусів ----------

function showStatus(el, msg, isError = false) {
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#f87171" : "#6ee7b7";
}

// ---------- Реєстрація капітана (створення акаунта) ----------

if (btnRegister) {
  btnRegister.addEventListener("click", async () => {
    const email    = emailInput?.value.trim();
    const password = passwordInput?.value.trim();

    if (!email || !password) {
      showStatus(authStatus, "Введи email і пароль", true);
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const user = cred.user;

      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        role: "captain",
        createdAt: serverTimestamp()
      });

      showStatus(authStatus, "Капітан зареєстрований і залогінений");
    } catch (err) {
      console.error(err);
      showStatus(authStatus, "Помилка реєстрації: " + (err.message || err.code), true);
    }
  });
}

// ---------- Вхід ----------

if (btnLogin) {
  btnLogin.addEventListener("click", async () => {
    const email    = emailInput?.value.trim();
    const password = passwordInput?.value.trim();

    if (!email || !password) {
      showStatus(authStatus, "Введи email і пароль", true);
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      showStatus(authStatus, "Успішний вхід");
    } catch (err) {
      console.error(err);
      showStatus(authStatus, "Помилка входу: " + (err.message || err.code), true);
    }
  });
}

// ---------- Вихід ----------

if (btnLogout) {
  btnLogout.addEventListener("click", async () => {
    try {
      await signOut(auth);
      showStatus(authStatus, "Вийшов з акаунта");
    } catch (err) {
      console.error(err);
      showStatus(authStatus, "Помилка виходу: " + (err.message || err.code), true);
    }
  });
}

// ---------- Створення КОМАНДИ (бойова колекція "teams") ----------

if (btnCreateTeam) {
  btnCreateTeam.addEventListener("click", async () => {
    const name = teamNameInput?.value.trim();
    const user = auth.currentUser;

    if (!user) {
      showStatus(teamStatus, "Спочатку увійди в акаунт", true);
      return;
    }
    if (!name) {
      showStatus(teamStatus, "Введи назву команди", true);
      return;
    }

    try {
      const random   = Math.random().toString(36).substring(2, 8);
      const joinCode = random.toUpperCase();

      await addDoc(collection(db, "teams"), {
        name,
        captainUid: user.uid,
        joinCode,
        createdAt: serverTimestamp()
      });

      showStatus(teamStatus, "Команда створена. Код для учасників: " + joinCode);
      if (teamNameInput) teamNameInput.value = "";
    } catch (err) {
      console.error(err);
      showStatus(teamStatus, "Помилка створення команди: " + (err.message || err.code), true);
    }
  });
}

// ---------- Відстеження авторизації + live-списку команд ----------

onAuthStateChanged(auth, (user) => {
  if (currentUserInfo) {
    currentUserInfo.textContent = user
      ? `Залогінений як: ${user.email}`
      : "Не залогінений";
  }

  if (btnLogout) {
    btnLogout.style.display = user ? "block" : "none";
  }
  if (teamSection) {
    teamSection.style.display = user ? "block" : "none";
  }

  if (!user) {
    // якщо вийшли — чистимо слухач + список
    if (unsubscribeTeams) {
      unsubscribeTeams();
      unsubscribeTeams = null;
    }
    if (teamsList) teamsList.innerHTML = "";
    return;
  }

  // якщо вже був слухач — відпишемось
  if (unsubscribeTeams) {
    unsubscribeTeams();
  }

  const q = query(
    collection(db, "teams"),
    orderBy("createdAt", "desc")
  );

  unsubscribeTeams = onSnapshot(q, (snapshot) => {
    if (!teamsList) return;

    teamsList.innerHTML = "";

    if (snapshot.empty) {
      teamsList.textContent = "Поки що немає команд";
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const captainShort = (data.captainUid || "").slice(0, 6) + "..";
      const code = data.joinCode || "—";

      const div = document.createElement("div");
      div.textContent = `${data.name} | капітан: ${captainShort} | код: ${code}`;
      teamsList.appendChild(div);
    });
  });
});
