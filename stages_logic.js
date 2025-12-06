// stages_logic.js
import { firebaseConfig } from "./firebase-config.js";
import {
  initializeApp,
  getApps,
  getApp,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// 1. Ініціалізація додатка
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// поточний сезон – зараз 2026
const SEASON_ID = "2026";

const stagesContainer = document.getElementById("stagesContainer");
const messageEl = document.getElementById("message");
const closeAllBtn = document.getElementById("closeAllBtn");

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle("error", isError);
}

// 2. Завантажити етапи + поточний активний
async function loadStages() {
  setMessage("Завантаження етапів...");
  stagesContainer.innerHTML = "";

  try {
    const seasonRef = doc(db, "seasons", SEASON_ID);
    const seasonSnap = await getDoc(seasonRef);

    if (!seasonSnap.exists()) {
      setMessage("Документ сезону 2026 не знайдено у Firestore.", true);
      return;
    }

    const seasonData = seasonSnap.data();
    const activeStageId = seasonData.openRegistrationStageId || null;

    const stagesCol = collection(seasonRef, "stages");
    const stagesSnap = await getDocs(stagesCol);

    const stages = [];
    stagesSnap.forEach((d) =>
      stages.push({ id: d.id, ...d.data() })
    );

    // сортуємо по order
    stages.sort((a, b) => (a.order || 0) - (b.order || 0));

    if (!stages.length) {
      setMessage("Етапів для сезону ще немає.", true);
      return;
    }

    stages.forEach((stage) => {
      const row = document.createElement("div");
      row.className = "stage-row";

      // статус по датах
      const now = new Date();
      const start = stage.dateStart ? new Date(stage.dateStart) : null;
      const end = stage.dateEnd ? new Date(stage.dateEnd) : null;

      let statusText = "";
      let statusClass = "";

      if (stage.id === activeStageId) {
        statusText = "Активний для реєстрації";
        statusClass = "active";
      }

      if (start && now < start) {
        statusText = statusText || "Ще не почався";
        statusClass = statusClass || "upcoming";
      } else if (end && now > end) {
        statusText = statusText || "Дати минули";
        statusClass = statusClass || "finished";
      } else if (!statusText) {
        statusText = "У вікні дат";
        statusClass = "manual";
      }

      const main = document.createElement("div");
      main.className = "stage-main";
      main.innerHTML = `
        <div class="stage-name">${stage.name || stage.id}</div>
        <div class="stage-dates">
          ${stage.dateStart || "—"} → ${stage.dateEnd || "—"}
        </div>
        <span class="stage-status ${statusClass}">${statusText}</span>
      `;

      const actions = document.createElement("div");
      actions.className = "stage-actions";

      const btnSetActive = document.createElement("button");
      btnSetActive.textContent =
        stage.id === activeStageId
          ? "Обраний"
          : "Зробити активним";
      btnSetActive.disabled = stage.id === activeStageId;
      btnSetActive.className = "btn-primary";

      btnSetActive.addEventListener("click", async () => {
        await setActiveStage(stage.id);
      });

      actions.appendChild(btnSetActive);
      row.appendChild(main);
      row.appendChild(actions);
      stagesContainer.appendChild(row);
    });

    if (activeStageId) {
      setMessage(`Зараз відкритий етап: ${activeStageId}`);
    } else {
      setMessage("Наразі жоден етап не відкритий для реєстрації.");
    }
  } catch (err) {
    console.error(err);
    setMessage("Помилка при завантаженні етапів: " + err.message, true);
  }
}

// 3. Встановити активний етап (для реєстрації)
async function setActiveStage(stageId) {
  try {
    setMessage("Оновлюю активний етап...");
    const seasonRef = doc(db, "seasons", SEASON_ID);
    await updateDoc(seasonRef, {
      openRegistrationStageId: stageId,
    });
    await loadStages();
  } catch (err) {
    console.error(err);
    setMessage("Помилка при збереженні: " + err.message, true);
  }
}

// 4. Закрити всі етапи (реєстрація OFF)
async function closeAllStages() {
  try {
    setMessage("Закриваю реєстрацію для всіх етапів...");
    const seasonRef = doc(db, "seasons", SEASON_ID);
    await updateDoc(seasonRef, {
      openRegistrationStageId: null,
    });
    await loadStages();
  } catch (err) {
    console.error(err);
    setMessage("Помилка при оновленні: " + err.message, true);
  }
}

closeAllBtn.addEventListener("click", closeAllStages);

// старт
loadStages();
