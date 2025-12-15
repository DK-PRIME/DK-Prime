// assets/js/competition.js
// Екран 1: створення сезону/змагання
// Пише в Firestore ТІЛЬКИ структуру, яку читає STOLAR CARP:
// seasons/{seasonId}
// seasons/{seasonId}/stages/{stageId}
// Відкривати/закривати реєстрацію — ТІЛЬКИ на сторінці 2.

(function () {
  const msgEl = document.getElementById("msg");
  const authStateEl = document.getElementById("authState");
  const roleStateEl = document.getElementById("roleState");
  const createBtn = document.getElementById("createBtn");
  const createState = document.getElementById("createState");

  const kindEl = document.getElementById("kind");
  const minus13El = document.getElementById("minus13");

  const seasonBlock = document.getElementById("seasonBlock");
  const singleBlock = document.getElementById("singleBlock");

  const seasonIdEl = document.getElementById("seasonId");
  const seasonTitleEl = document.getElementById("seasonTitle");
  const seasonYearEl = document.getElementById("seasonYear");
  const numStagesEl = document.getElementById("numStages");
  const hasFinalEl = document.getElementById("hasFinal");
  const ratingStagesEl = document.getElementById("ratingStages");
  const autoStagesListEl = document.getElementById("autoStagesList");

  const singleIdEl = document.getElementById("singleId");
  const singleTitleEl = document.getElementById("singleTitle");
  const singleTypeEl = document.getElementById("singleType");
  const stalkerTeamSizeWrap = document.getElementById("stalkerTeamSizeWrap");
  const stalkerTeamSizeEl = document.getElementById("stalkerTeamSize");

  // init firebase from your firebase-config.js
  const auth = (window.scAuth) ? window.scAuth : (window.firebase ? firebase.auth() : null);
  const db = (window.scDb) ? window.scDb : (window.firebase ? firebase.firestore() : null);

  function setMsg(text, ok = true) {
    if (!msgEl) return;
    msgEl.className = ok ? "ok" : "err";
    msgEl.textContent = text || "";
  }

  function setBusy(v, text) {
    if (createBtn) createBtn.disabled = !!v;
    if (createState) createState.textContent = text || (v ? "роблю..." : "");
  }

  function asBool(v) { return String(v) === "true"; }

  function normId(id) {
    return String(id || "").trim().replace(/\s+/g, "_");
  }

  function renderAutoStages() {
    if (!autoStagesListEl) return;
    autoStagesListEl.innerHTML = "";

    const seasonId = normId(seasonIdEl.value);
    const n = Number(numStagesEl.value || 0);
    const hasFinal = asBool(hasFinalEl.value);

    if (!seasonId || !n) return;

    for (let i = 1; i <= n; i++) {
      const li = document.createElement("li");
      li.textContent = `${seasonId}_e${i}  —  "Етап ${i}"`;
      autoStagesListEl.appendChild(li);
    }
    if (hasFinal) {
      const li = document.createElement("li");
      li.textContent = `${seasonId}_final  —  "Фінал"`;
      autoStagesListEl.appendChild(li);
    }
  }

  function toggleBlocks() {
    const kind = kindEl.value;
    seasonBlock.classList.toggle("hidden", kind !== "season");
    singleBlock.classList.toggle("hidden", kind !== "single");
  }

  function toggleStalkerTeamSize() {
    const t = singleTypeEl.value;
    stalkerTeamSizeWrap.classList.toggle("hidden", t !== "stalker_team");
  }

  async function requireAdmin(user) {
    const uSnap = await db.collection("users").doc(user.uid).get();
    const role = (uSnap.exists && uSnap.data()) ? (uSnap.data().role || "") : "";
    roleStateEl.textContent = role || "невідомо";
    if (role !== "admin") throw new Error("Доступ заборонено: потрібна роль admin.");
  }

  async function createSeasonFlow(user) {
    const seasonId = normId(seasonIdEl.value);
    const title = String(seasonTitleEl.value || "").trim();
    const year = Number(seasonYearEl.value || 0);
    const numStages = Number(numStagesEl.value || 0);
    const hasFinal = asBool(hasFinalEl.value);
    const ratingStages = Number(ratingStagesEl.value || 0);
    const minusOneFor13kg = asBool(minus13El.value);

    if (!seasonId) throw new Error("Вкажи seasonId.");
    if (!title) throw new Error("Вкажи назву сезону.");
    if (!year) throw new Error("Вкажи рік.");
    if (!numStages || numStages < 1) throw new Error("К-сть етапів має бути >= 1.");
    if (!ratingStages || ratingStages < 1 || ratingStages > numStages) {
      throw new Error("ratingStages має бути від 1 до numStages.");
    }

    const seasonRef = db.collection("seasons").doc(seasonId);

    // season doc
    const seasonDoc = {
      id: seasonId,
      title,
      year,
      type: "season_fishing",
      numStages,
      hasFinal,
      ratingStages,
      minusOneFor13kg,
      // читабельні дефолти
      activeStageId: null,
      activeStageOpen: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    const batch = db.batch();
    batch.set(seasonRef, seasonDoc, { merge: true });

    // auto stages: seasonId_e1..eN
    for (let i = 1; i <= numStages; i++) {
      const stageId = `${seasonId}_e${i}`;
      const stageRef = seasonRef.collection("stages").doc(stageId);

      batch.set(stageRef, {
        id: stageId,
        seasonId,
        label: `Етап ${i}`,
        order: i,
        isFinal: false,

        // IMPORTANT for STOLAR CARP register:
        isRegistrationOpen: false,

        // додаткові параметри
        allowBigFishTotal: true,
        minusOneFor13kg,

        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    // final optional
    if (hasFinal) {
      const stageId = `${seasonId}_final`;
      const stageRef = seasonRef.collection("stages").doc(stageId);

      batch.set(stageRef, {
        id: stageId,
        seasonId,
        label: "Фінал",
        order: numStages + 1,
        isFinal: true,
        isRegistrationOpen: false,
        allowBigFishTotal: true,
        minusOneFor13kg,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await batch.commit();
    return { seasonId };
  }

  async function createSingleFlow(user) {
    const competitionId = normId(singleIdEl.value);
    const title = String(singleTitleEl.value || "").trim();
    const type = String(singleTypeEl.value || "classic");
    const minusOneFor13kg = asBool(minus13El.value);
    const teamSize = Number(stalkerTeamSizeEl.value || 1);

    if (!competitionId) throw new Error("Вкажи competitionId (це буде seasonId).");
    if (!title) throw new Error("Вкажи назву змагання.");

    const seasonRef = db.collection("seasons").doc(competitionId);
    const stageId = `${competitionId}_main`;
    const stageRef = seasonRef.collection("stages").doc(stageId);

    const seasonDoc = {
      id: competitionId,
      title,
      year: new Date().getFullYear(),
      type,                 // table_three / stalker_solo / stalker_team / classic
      numStages: 1,
      hasFinal: false,
      ratingStages: 1,
      minusOneFor13kg,

      // правила/налаштування типів
      rules: {
        type,
        stalkerTeamSize: (type === "stalker_team") ? teamSize : null,
        // опис критеріїв (щоб не губилось що це за тип)
        criteria:
          type === "table_three" ? ["totalWeight", "top5Weight", "teamBigFish"] :
          type === "stalker_solo" ? ["userTotalWeight"] :
          type === "stalker_team" ? ["sumPlacesByZones", "teamTotalWeightTieBreaker"] :
          ["totalWeight"]
      },

      activeStageId: null,
      activeStageOpen: false,

      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    const stageDoc = {
      id: stageId,
      seasonId: competitionId,
      label: title,
      order: 1,
      isFinal: false,

      // IMPORTANT for STOLAR CARP register:
      isRegistrationOpen: false,

      allowBigFishTotal: true,
      minusOneFor13kg,

      // дублюємо тип, щоб зручно було читати
      competitionType: type,
      stalkerTeamSize: (type === "stalker_team") ? teamSize : null,

      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    const batch = db.batch();
    batch.set(seasonRef, seasonDoc, { merge: true });
    batch.set(stageRef, stageDoc, { merge: true });
    await batch.commit();

    return { seasonId: competitionId };
  }

  // UI events
  kindEl.addEventListener("change", () => { toggleBlocks(); setMsg(""); });
  singleTypeEl.addEventListener("change", () => { toggleStalkerTeamSize(); });
  seasonIdEl.addEventListener("input", renderAutoStages);
  numStagesEl.addEventListener("input", renderAutoStages);
  hasFinalEl.addEventListener("change", renderAutoStages);

  // MAIN
  async function boot() {
    if (!auth || !db || !window.firebase) {
      authStateEl.textContent = "Firebase init НЕ завантажився";
      roleStateEl.textContent = "-";
      setMsg("Перевір: підключення firebase-config.js і firebase compat скриптів.", false);
      if (createBtn) createBtn.disabled = true;
      return;
    }

    toggleBlocks();
    toggleStalkerTeamSize();
    renderAutoStages();

    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        authStateEl.textContent = "не залогінений";
        roleStateEl.textContent = "-";
        setMsg("Зайди в адмінку (логін).", false);
        if (createBtn) createBtn.disabled = true;
        return;
      }

      try {
        authStateEl.textContent = user.email || "ok";
        await requireAdmin(user);
        setMsg("Готово. Можна створювати.", true);
        if (createBtn) createBtn.disabled = false;
      } catch (e) {
        setMsg(e.message || "Нема доступу.", false);
        if (createBtn) createBtn.disabled = true;
      }
    });

    createBtn.addEventListener("click", async () => {
      const user = auth.currentUser;
      if (!user) { setMsg("Нема логіну.", false); return; }

      try {
        setBusy(true, "створюю...");
        setMsg("");

        await requireAdmin(user);

        const kind = kindEl.value;
        let res;
        if (kind === "season") res = await createSeasonFlow(user);
        else res = await createSingleFlow(user);

        setMsg(`✅ Створено: ${res.seasonId}. Реєстрацію відкриваємо на сторінці 2.`, true);
      } catch (e) {
        console.error(e);
        setMsg(e.message || "Помилка створення.", false);
      } finally {
        setBusy(false, "");
      }
    });
  }

  boot();
})();
