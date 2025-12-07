// admin_judge_logic.js (Логіка для адміна та судді)

import { auth, db } from "./firebase-config.js";

// Firestore (через CDN, а не 'firebase/firestore')
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Auth-слухач
import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
  confirmPayment,
  runDraw,
  getTeamsForJudgeZone,
  recordWeighing,
} from "./tournamentService.js";


// --- КОНСТАНТИ ТА ЕЛЕМЕНТИ ---
const adminSection      = document.getElementById("adminSection");
const judgeSection      = document.getElementById("judgeSection");
const userRoleStatus    = document.getElementById("userRoleStatus");
const adminMessageDiv   = document.getElementById("adminMessage");
const judgeHeader       = document.getElementById("judgeHeader");
const teamsContainer    = document.getElementById("teamsContainer");
const registrationsList = document.getElementById("registrationsList");
const runDrawButton     = document.getElementById("runDrawButton");
const sectorsInput      = document.getElementById("availableSectorsInput");

const adminTournamentIdInput = document.getElementById("adminTournamentId");
const CURRENT_TOURNAMENT_ID  = adminTournamentIdInput ? adminTournamentIdInput.value : "";


// --- ДОПОМІЖНІ ФУНКЦІЇ ---

function displayAdminMessage(msg, type = "info") {
  if (!adminMessageDiv) return;
  adminMessageDiv.textContent = msg;
  adminMessageDiv.className = `message ${type}`;
}


// --- 1. АДМІН-ЛОГІКА (Крок 4, 5) ---

async function loadAdminInterface() {
  if (!registrationsList) return;

  displayAdminMessage("Завантаження заявок...", "info");
  registrationsList.innerHTML =
    '<tr><td colspan="5" style="text-align: center;">Завантаження...</td></tr>';

  try {
    const q = query(
      collection(db, "registrations"),
      where("tournamentId", "==", CURRENT_TOURNAMENT_ID),
      orderBy("submissionDate", "asc"),
    );
    const querySnapshot = await getDocs(q);

    // Якщо заявок немає
    if (querySnapshot.empty) {
      registrationsList.innerHTML =
        '<tr><td colspan="5" style="text-align: center;">Жодних заявок.</td></tr>';

      const drawWaitingList = document.getElementById("drawWaitingList");
      if (drawWaitingList) {
        drawWaitingList.innerHTML =
          "<li>Поки що немає жодної оплаченoї заявки.</li>";
      }
      return;
    }

    let html = "";
    const waitingForDraw = []; // Сюди збираємо команди, що допущені до жеребкування

    querySnapshot.forEach((d) => {
      const reg = d.data();
      const id = d.id;

      const isPaid = !!reg.paid;
      const statusClass = isPaid ? "status-paid" : "status-pending";
      const statusText = isPaid ? "Оплачено" : "Очікує оплати";
      const sector =
        reg.zone && reg.sector ? `${reg.zone}-${reg.sector}` : "Не призначено";

      // Якщо оплата є, а зона/сектор ще не призначені — команда чекає жеребкування
      if (isPaid && (!reg.zone || !reg.sector)) {
        waitingForDraw.push(reg.teamName || id.substring(0, 6) + "...");
      }

      html += `
        <tr>
          <td>${id.substring(0, 6)}...</td>
          <td>${reg.teamName || "-"}</td>
          <td>${sector}</td>
          <td class="${statusClass}">${statusText}</td>
          <td>
            <button class="confirm-btn" data-id="${id}" ${
              isPaid ? "disabled" : ""
            }>
              ${isPaid ? "Підтверджено" : "Підтвердити Оплату"}
            </button>
          </td>
        </tr>
      `;
    });

    registrationsList.innerHTML = html;

    // Кнопки підтвердження оплати
    document.querySelectorAll(".confirm-btn").forEach((button) => {
      button.addEventListener("click", handlePaymentConfirmation);
    });

    // Оновлюємо список "Очікують жеребкування"
    const drawWaitingList = document.getElementById("drawWaitingList");
    if (drawWaitingList) {
      if (!waitingForDraw.length) {
        drawWaitingList.innerHTML =
          "<li>Поки що немає команд, допущених до жеребкування.</li>";
      } else {
        drawWaitingList.innerHTML = waitingForDraw
          .map((name, idx) => `<li>${idx + 1}. ${name}</li>`)
          .join("");
      }
    }

    displayAdminMessage("Дані завантажено.", "success");
  } catch (error) {
    console.error("Помилка завантаження заявок:", error);
    displayAdminMessage(`Помилка завантаження: ${error.message}`, "error");

    const drawWaitingList = document.getElementById("drawWaitingList");
    if (drawWaitingList) {
      drawWaitingList.innerHTML =
        "<li>Помилка завантаження списку для жеребкування.</li>";
    }
  }
}

async function handlePaymentConfirmation(e) {
  const button = e.target;
  const registrationId = button.getAttribute("data-id");

  button.disabled = true;
  button.textContent = "Обробка...";

  try {
    await confirmPayment(registrationId);
    displayAdminMessage("Оплату успішно підтверджено!", "success");
    await loadAdminInterface(); // Оновлюємо список
  } catch (error) {
    console.error("Помилка підтвердження оплати:", error);
    displayAdminMessage(`Помилка: ${error.message}`, "error");
    button.disabled = false;
    button.textContent = "Помилка!";
  }
}

async function handleDraw() {
  if (!runDrawButton) return;

  runDrawButton.disabled = true;
  runDrawButton.textContent = "Жеребкування...";

  try {
    const sectorString = (sectorsInput?.value || "").trim();
    const availableSectors = sectorString
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.includes("-"));

    if (!availableSectors.length) {
      throw new Error("Вкажи доступні сектори у форматі A-1, A-2, B-3,...");
    }

    await runDraw(CURRENT_TOURNAMENT_ID, availableSectors);

    displayAdminMessage("🎉 Жеребкування успішно завершено!", "success");
    await loadAdminInterface(); // Оновлюємо таблицю з секторами
    runDrawButton.textContent = "Жеребкування Проведено!";
  } catch (error) {
    console.error("Помилка жеребкування:", error);
    displayAdminMessage(`Помилка жеребкування: ${error.message}`, "error");
    runDrawButton.disabled = false;
    runDrawButton.textContent = "Провести Жеребкування";
  }
}


// --- 2. СУДДІВСЬКА ЛОГІКА (Крок 6) ---

async function loadJudgeInterface(assignedZone) {
  if (judgeHeader) {
    judgeHeader.textContent = `2. Суддівство (Зона: ${assignedZone})`;
  }
  if (teamsContainer) {
    teamsContainer.innerHTML = "<p>Завантаження команд...</p>";
  }

  try {
    const teams = await getTeamsForJudgeZone(CURRENT_TOURNAMENT_ID, assignedZone);
    renderTeams(teams);
  } catch (error) {
    console.error("Помилка завантаження команд судді:", error);
    if (teamsContainer) {
      teamsContainer.innerHTML = `<p style="color:red;">Помилка: ${error.message}</p>`;
    }
  }
}

function renderTeams(teams) {
  if (!teamsContainer) return;

  if (!teams || teams.length === 0) {
    teamsContainer.innerHTML = "<p>У вашій зоні ще немає команд.</p>";
    return;
  }

  let html = "";
  teams.forEach((team) => {
    const weighings = team.weighings || [];
    const totalWeight = team.totalWeight || 0;

    const weighingListHtml =
      weighings.length > 0
        ? weighings
            .map((w) => {
              // timestamp може бути Firestore Timestamp або Date
              let timeStr = "";
              if (w.timestamp) {
                try {
                  const ts =
                    w.timestamp.seconds != null
                      ? new Date(w.timestamp.seconds * 1000)
                      : new Date(w.timestamp);
                  timeStr = ts.toLocaleTimeString("uk-UA");
                } catch {
                  timeStr = "";
                }
              }
              return `<li>${w.weight} кг${
                timeStr ? ` (час: ${timeStr})` : ""
              }</li>`;
            })
            .join("")
        : "<li>Зважувань ще не було.</li>";

    html += `
      <div class="team-card" data-reg-id="${team.id}">
        <div class="team-header">
          <span>${team.zone || "?"}-${team.sector || "?"}: <b>${
      team.teamName || "-"
    }</b></span>
          <span class="total-weight">Вага: ${totalWeight.toFixed(2)} кг</span>
        </div>
        
        <div class="weighing-form">
          <input
            type="number"
            step="0.01"
            min="0.1"
            placeholder="Вага риби (кг)"
            data-reg-id="${team.id}"
            class="weight-input"
          >
          <button data-reg-id="${team.id}" class="record-btn">
            Внести Зважування
          </button>
        </div>

        <div class="weighing-info">
          <strong>Історія зважувань:</strong>
          <ul class="weighing-list">${weighingListHtml}</ul>
        </div>
      </div>
    `;
  });

  teamsContainer.innerHTML = html;

  document.querySelectorAll(".record-btn").forEach((button) => {
    button.addEventListener("click", handleRecordClick);
  });
}

async function handleRecordClick(e) {
  const button = e.target;
  const registrationId = button.getAttribute("data-reg-id");
  const input = document.querySelector(
    `.weight-input[data-reg-id="${registrationId}"]`,
  );

  const fishWeight = parseFloat(input?.value || "0");

  if (isNaN(fishWeight) || fishWeight <= 0.01) {
    alert("Введіть коректну вагу.");
    return;
  }

  button.disabled = true;
  button.textContent = "Збереження...";

  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("Користувач не авторизований.");
    }

    await recordWeighing(registrationId, fishWeight, currentUser.uid);

    displayAdminMessage(`Вага ${fishWeight} кг успішно внесена!`, "success");
    if (input) input.value = "";

    const judgeDoc = await getDoc(doc(db, "users", currentUser.uid));
    const assignedZone = judgeDoc.data()?.judgeZone;

    if (assignedZone) {
      await loadJudgeInterface(assignedZone); // Перезавантажуємо
    }
  } catch (error) {
    console.error("Помилка запису зважування:", error);
    displayAdminMessage(`Помилка запису: ${error.message}`, "error");
    button.disabled = false;
    button.textContent = "Внести Зважування";
  }
}


// --- 3. ІНІЦІАЛІЗАЦІЯ ---

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    if (userRoleStatus) {
      userRoleStatus.textContent = "Статус: Ви не увійшли. Доступ обмежено.";
    }
    if (adminSection) adminSection.classList.add("hidden");
    if (judgeSection) judgeSection.classList.add("hidden");
    return;
  }

  const userDocSnap = await getDoc(doc(db, "users", user.uid));
  const role = userDocSnap.data()?.role;

  if (userRoleStatus) {
    userRoleStatus.textContent = `Статус: Увійшов як ${role} (${user.email})`;
  }

  if (role === "admin") {
    if (adminSection) adminSection.classList.remove("hidden");
    if (judgeSection) judgeSection.classList.add("hidden");

    if (runDrawButton) {
      runDrawButton.addEventListener("click", handleDraw);
    }
    await loadAdminInterface();
  } else if (role === "judge") {
    if (adminSection) adminSection.classList.add("hidden");
    if (judgeSection) judgeSection.classList.remove("hidden");

    const assignedZone = userDocSnap.data()?.judgeZone;
    if (assignedZone) {
      await loadJudgeInterface(assignedZone);
    } else if (userRoleStatus) {
      userRoleStatus.textContent += " | Зона не призначена.";
    }
  } else {
    if (adminSection) adminSection.classList.add("hidden");
    if (judgeSection) judgeSection.classList.add("hidden");
    if (userRoleStatus) {
      userRoleStatus.textContent = "Статус: Недостатньо прав доступу.";
    }
  }
});
