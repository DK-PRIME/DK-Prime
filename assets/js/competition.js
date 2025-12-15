// assets/js/competition.js
// DK Prime — створення сезону (з автогенерацією етапів) або одиночного змагання
// Пише так, щоб STOLAR CARP читав через collectionGroup("stages") по isRegistrationOpen

(function () {
  const auth = window.scAuth;
  const db = window.scDb;

  const el = (id) => document.getElementById(id);

  const authState = el("authState");
  const roleState = el("roleState");
  const msg = el("msg");
  const createBtn = el("createBtn");
  const createState = el("createState");

  const kind = el("kind"); // season | single

  // season fields
  const seasonBlock = el("seasonBlock");
  const seasonId = el("seasonId");
  const seasonTitle = el("seasonTitle");
  const seasonYear = el("seasonYear");
  const numStages = el("numStages");
  const hasFinal = el("hasFinal");
  const ratingStages = el("ratingStages");
  const minus13 = el("minus13");
  const autoStagesList = el("autoStagesList");

  // single fields
  const singleBlock = el("singleBlock");
  const singleId = el("singleId");
  const singleTitle = el("singleTitle");
  const singleType = el("singleType"); // table3 | stalker_solo | stalker_team | classic
  const stalkerTeamSizeWrap = el("stalkerTeamSizeWrap");
  const stalkerTeamSize = el("stalkerTeamSize");

  function setMsg(text, ok = true) {
    if (!msg) return;
    msg.textContent = text || "";
    msg.style.color = text ? (ok ? "#7CFFB2" : "#ff6c6c") : "";
  }

  function setWorking(v, text) {
    if (createBtn) createBtn.disabled = !!v;
    if (createState) createState.textContent = text || (v ? "працюю..." : "");
  }

  function showAutoStages(list) {
    if (!autoStagesList) return;
    autoStagesList.innerHTML = "";
    list.forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s;
      autoStagesList.appendChild(li);
    });
  }

  function sanitizeId(v) {
    return String(v || "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "");
  }

  function toInt(v, def = 0) {
    const n = parseInt(String(v || ""), 10);
    return Number.isFinite(n) ? n : def;
  }

  function toggleKindUI() {
    const k = kind?.value || "season";
    if (seasonBlock) seasonBlock.style.display = k === "season" ? "" : "none";
    if (singleBlock) singleBlock.style.display = k === "single" ? "" : "none";
    setMsg("");
  }

  function toggleStalkerTeamUI() {
    const t = singleType?.value || "";
    if (stalkerTeamSizeWrap) stalkerTeamSizeWrap.style.display = t === "stalker_team" ? "" : "none";
  }

  async function getRole(uid) {
    const snap = await db.collection("users").doc(uid).get();
    const u = snap.exists ? snap.data() : null;
    return (u && u.role) || "";
  }

  async function requireAdmin(user) {
    const role = await getRole(user.uid);
    if (roleState) roleState.textContent = role ? `роль: ${role}` : "роль: (нема)";
    if (role !== "admin") {
      if (createBtn) createBtn.disabled = true;
      throw new Error("Нема доступу. Потрібна роль admin у users/{uid}.role");
    }
    if (createBtn) createBtn.disabled = false;
    return role;
  }

  // --- CREATE: SEASON (auto stages) ---
  async function createSeasonFlow(user) {
    const sid = sanitizeId(seasonId?.value);
    if (!sid) throw new Error("Вкажи seasonId (напр. 2026 або STOLAR_2026).");

    const title = String(seasonTitle?.value || "").trim();
    const year = toInt(seasonYear?.value, 0);

    const nStages = Math.max(1, toInt(numStages?.value, 5));
    const finalOn = !!hasFinal?.checked;

    // скільки етапів йдуть в залік (якщо фінал включений — питаємо)
    let rStages = Math.max(1, toInt(ratingStages?.value, nStages));
    if (finalOn && rStages > nStages) rStages = nStages;

    const minusOneFor13kg = !!minus13?.checked;

    // season doc
    const seasonRef = db.collection("seasons").doc(sid);

    // Підготовка stage IDs (Етап 1..N + фінал)
    const stageIds = [];
    for (let i = 1; i <= nStages; i++) stageIds.push(`${sid}_e${i}`);
    if (finalOn) stageIds.push(`${sid}_final`);

    // Пишемо сезоном + етапами батчем
    const batch = db.batch();

    batch.set(
      seasonRef,
      {
        id: sid,
        title: title || sid,
        type: "season_fishing",
        year: year || null,

        numStages: nStages,
        ratingStages: rStages,
        hasFinal: finalOn,

        minusOneFor13kg: minusOneFor13kg,

        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    for (let i = 1; i <= nStages; i++) {
      const stId = `${sid}_e${i}`;
      const stRef = seasonRef.collection("stages").doc(stId);
      batch.set(
        stRef,
        {
          id: stId,
          seasonId: sid,
          order: i,
          label: `Етап ${i}`,
          isFinal: false,

          // важливо для STOLAR CARP: цей прапор читається на реєстрації
          isRegistrationOpen: false,

          // опції/правила етапу (зберігаємо тут теж, щоб було просто)
          minusOneFor13kg: minusOneFor13kg,
          allowBigFishTotal: true,

          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    if (finalOn) {
      const stId = `${sid}_final`;
      const stRef = seasonRef.collection("stages").doc(stId);
      batch.set(
        stRef,
        {
          id: stId,
          seasonId: sid,
          order: nStages + 1,
          label: "Фінал",
          isFinal: true,
          isRegistrationOpen: false,

          minusOneFor13kg: minusOneFor13kg,
          allowBigFishTotal: true,

          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    await batch.commit();
    showAutoStages(stageIds);

    setMsg(`Готово ✅ Створено season "${sid}" + ${stageIds.length} stage(ів).`, true);
  }

  // --- CREATE: SINGLE COMPETITION (as season with 1 stage) ---
  async function createSingleFlow(user) {
    const cid = sanitizeId(singleId?.value);
    if (!cid) throw new Error("Вкажи id змагання (напр. stalker_2026_01).");

    const title = String(singleTitle?.value || "").trim() || cid;
    const cType = String(singleType?.value || "classic");

    const teamSize =
      cType === "stalker_team" ? Math.max(1, Math.min(3, toInt(stalkerTeamSize?.value, 2))) : null;

    // модель: як season з 1 stage, щоб STOLAR CARP читав через collectionGroup("stages")
    const seasonRef = db.collection("seasons").doc(cid);
    const stageRef = seasonRef.collection("stages").doc(`${cid}_main`);

    const payloadSeason = {
      id: cid,
      title,
      type: "single",
      competitionType: cType, // table3 | stalker_solo | stalker_team | classic
      stalkerTeamSize: teamSize,

      numStages: 1,
      ratingStages: 1,
      hasFinal: false,

      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const payloadStage = {
      id: `${cid}_main`,
      seasonId: cid,
      order: 1,
      label: title,
      isFinal: false,
      isRegistrationOpen: false,

      competitionType: cType,
      stalkerTeamSize: teamSize,

      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const batch = db.batch();
    batch.set(seasonRef, payloadSeason, { merge: true });
    batch.set(stageRef, payloadStage, { merge: true });
    await batch.commit();

    showAutoStages([`${cid}_main`]);
    setMsg(`Готово ✅ Створено змагання "${cid}" (1 stage).`, true);
  }

  async function onCreate(user) {
    setMsg("");
    setWorking(true, "створення...");
    try {
      await requireAdmin(user);

      const k = kind?.value || "season";
      if (k === "season") {
        await createSeasonFlow(user);
      } else {
        await createSingleFlow(user);
      }
    } finally {
      setWorking(false, "");
    }
  }

  // init checks
  if (!auth || !db || !window.firebase) {
    alert("Firebase init не завантажився. Перевір firebase-config.js та підключення compat SDK.");
    return;
  }

  // UI hooks
  if (kind) kind.addEventListener("change", toggleKindUI);
  if (singleType) singleType.addEventListener("change", toggleStalkerTeamUI);
  if (hasFinal) {
    hasFinal.addEventListener("change", () => {
      // якщо фінал вимкнули — просто лишаємо ratingStages як є
      // якщо увімкнули — логіка вже підрізає ratingStages в createSeasonFlow
    });
  }
  toggleKindUI();
  toggleStalkerTeamUI();

  // auth state
  auth.onAuthStateChanged(async (user) => {
    if (authState) authState.textContent = user ? "вхід: ✅" : "вхід: ❌";
    if (!user) {
      if (createBtn) createBtn.disabled = true;
      if (roleState) roleState.textContent = "роль: (увійди)";
      return;
    }
    try {
      await requireAdmin(user);
    } catch (e) {
      setMsg(e.message || "Нема доступу.", false);
    }
  });

  if (createBtn) {
    createBtn.addEventListener("click", async () => {
      const user = auth.currentUser;
      if (!user) return setMsg("Спочатку увійди в акаунт.", false);

      try {
        await onCreate(user);
      } catch (e) {
        console.error(e);
        setMsg(e.message || "Помилка створення.", false);
      }
    });
  }
})();
