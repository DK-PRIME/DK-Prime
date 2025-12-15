// assets/js/competition.js
// DK Prime: створення змагань/сезонів у Firestore так, щоб STOLAR CARP читав однаково.
// Пише у: seasons/{seasonId}  +  seasons/{seasonId}/stages/{stageId}

(function () {
  const auth = window.scAuth;
  const db = window.scDb;

  if (!auth || !db || !window.firebase) {
    alert("Firebase init не завантажився. Перевір firebase-config.js та підключення compat SDK.");
    return;
  }

  // ====== helpers ======
  const $ = (id) => document.getElementById(id);
  const msg = (t, ok = true) => {
    const el = $("msg");
    if (!el) return;
    el.textContent = t || "";
    el.style.color = ok ? "#7CFFB2" : "#ff6c6c";
  };

  const nowTS = () => firebase.firestore.FieldValue.serverTimestamp();

  function normalizeId(v) {
    return String(v || "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^\w\-]/g, "_")
      .slice(0, 60);
  }

  function stageIdForSeason(n) {
    return `e${n}`; // e1, e2, ...
  }

  function stageLabelForSeason(n) {
    return `Етап ${n}`;
  }

  // ====== форма ======
  // Очікую що в competition.html є такі поля (зроби id саме так):
  // common:
  //   competitionKind (select): "season" | "single"
  //   seasonId, title
  //
  // season:
  //   year, numStages, hasFinal (checkbox), ratingBestOf, minusOneFor13kg (checkbox), allowBigFishTotal (checkbox)
  //
  // single:
  //   singleType (select): "three_tables" | "stalker_solo" | "stalker_team" | "standard"
  //   stalkerTeamMembers (select/number 1-3) (тільки для stalker_team)
  //
  // button:
  //   saveBtn

  const kindEl = $("competitionKind");
  const saveBtn = $("saveBtn");

  function readCommon() {
    const seasonId = normalizeId($("seasonId")?.value);
    const title = String($("title")?.value || "").trim();

    if (!seasonId) throw new Error("Вкажи seasonId (наприклад: 2026 або Extreme_STOLAR_CARP)");
    if (!title) throw new Error("Вкажи назву змагання/сезону");

    return { seasonId, title };
  }

  function readSeason() {
    const year = Number($("year")?.value || "0") || null;
    const numStages = Number($("numStages")?.value || "0") || 0;
    const hasFinal = !!$("hasFinal")?.checked;
    const ratingBestOf = Number($("ratingBestOf")?.value || "0") || 0;

    const minusOneFor13kg = !!$("minusOneFor13kg")?.checked;
    const allowBigFishTotal = !!$("allowBigFishTotal")?.checked;

    if (!numStages || numStages < 1 || numStages > 12) {
      throw new Error("К-ть етапів має бути 1–12");
    }

    if (hasFinal && (!ratingBestOf || ratingBestOf < 1 || ratingBestOf > numStages)) {
      throw new Error("Якщо є фінал — вкажи скільки етапів йдуть в залік (1..кількість етапів)");
    }

    return { year, numStages, hasFinal, ratingBestOf, minusOneFor13kg, allowBigFishTotal };
  }

  function readSingle() {
    const singleType = String($("singleType")?.value || "").trim();
    if (!singleType) throw new Error("Обери тип змагання");

    let stalkerTeamMembers = null;
    if (singleType === "stalker_team") {
      stalkerTeamMembers = Number($("stalkerTeamMembers")?.value || "0") || 0;
      if (![1, 2, 3].includes(stalkerTeamMembers)) {
        throw new Error("Сталкер командний: вибери 1/2/3 учасники");
      }
    }

    return { singleType, stalkerTeamMembers };
  }

  async function requireAdmin(user) {
    if (!user) throw new Error("Треба увійти в адмінку.");
    const uSnap = await db.collection("users").doc(user.uid).get();
    const role = uSnap.exists ? (uSnap.data() || {}).role : null;
    if (role !== "admin") throw new Error("Доступ заборонено (не admin).");
  }

  // ====== write logic ======
  async function createOrUpdateSeasonSeasonDoc({ seasonId, title }, seasonData) {
    const seasonRef = db.collection("seasons").doc(seasonId);

    const payload = {
      id: seasonId,
      title,
      kind: "season",          // ✅ щоб сайт розумів
      type: "season_fishing",  // ✅ як у тебе в консолі було
      year: seasonData.year || null,

      numStages: seasonData.numStages,
      hasFinal: seasonData.hasFinal,
      ratingBestOf: seasonData.hasFinal ? seasonData.ratingBestOf : 0,

      // правила/опції (важливо для сайтів)
      minusOneFor13kg: seasonData.minusOneFor13kg,
      allowBigFishTotal: seasonData.allowBigFishTotal,

      // реєстрацію відкриває сторінка №2 (тут лише дефолти)
      activeStageId: null,
      activeStageOpen: false,

      createdAt: nowTS(),
      updatedAt: nowTS()
    };

    await seasonRef.set(payload, { merge: true });

    // авто-створення stages e1..eN (+ final)
    const batch = db.batch();

    for (let i = 1; i <= seasonData.numStages; i++) {
      const stageId = `${seasonId}_${stageIdForSeason(i)}`; // 2026_e1
      const stRef = seasonRef.collection("stages").doc(stageId);

      batch.set(
        stRef,
        {
          id: stageId,
          seasonId,
          kind: "stage",
          label: stageLabelForSeason(i),
          order: i,
          isFinal: false,

          // ✅ ключ, який читає STOLAR CARP для реєстру:
          isRegistrationOpen: false,

          // опції/правила
          allowBigFishTotal: seasonData.allowBigFishTotal,
          minusOneFor13kg: seasonData.minusOneFor13kg,

          createdAt: nowTS(),
          updatedAt: nowTS()
        },
        { merge: true }
      );
    }

    if (seasonData.hasFinal) {
      const stageId = `${seasonId}_final`;
      const stRef = seasonRef.collection("stages").doc(stageId);

      batch.set(
        stRef,
        {
          id: stageId,
          seasonId,
          kind: "stage",
          label: "Фінал",
          order: seasonData.numStages + 1,
          isFinal: true,
          isRegistrationOpen: false,

          allowBigFishTotal: seasonData.allowBigFishTotal,
          minusOneFor13kg: seasonData.minusOneFor13kg,

          createdAt: nowTS(),
          updatedAt: nowTS()
        },
        { merge: true }
      );
    }

    await batch.commit();
  }

  async function createOrUpdateSingleCompetition({ seasonId, title }, singleData) {
    // single теж кладемо в seasons/{id}, але kind="single"
    const seasonRef = db.collection("seasons").doc(seasonId);

    const payload = {
      id: seasonId,
      title,
      kind: "single",
      type: "single",

      // тип змагання (для логіки результатів потім)
      singleType: singleData.singleType,
      stalkerTeamMembers: singleData.stalkerTeamMembers ?? null,

      // дефолти для контролю реєстрації (сторінка №2)
      activeStageId: null,
      activeStageOpen: false,

      createdAt: nowTS(),
      updatedAt: nowTS()
    };

    await seasonRef.set(payload, { merge: true });

    // Для single робимо 1 “stage” всередині seasons/{id}/stages/{id_main}
    const mainStageId = `${seasonId}_main`;
    await seasonRef.collection("stages").doc(mainStageId).set(
      {
        id: mainStageId,
        seasonId,
        kind: "stage",
        label: "Основний етап",
        order: 1,
        isFinal: false,
        isRegistrationOpen: false,

        // правила/прапорці під твої типи:
        scoringModel: singleData.singleType, // three_tables | stalker_solo | stalker_team | standard
        stalkerTeamMembers: singleData.stalkerTeamMembers ?? null,

        createdAt: nowTS(),
        updatedAt: nowTS()
      },
      { merge: true }
    );
  }

  // ====== UI events ======
  auth.onAuthStateChanged(async (user) => {
    try {
      await requireAdmin(user);
      msg("✅ Адмін доступ OK", true);
      if (saveBtn) saveBtn.disabled = false;
    } catch (e) {
      console.error(e);
      msg(e.message || "Нема доступу", false);
      if (saveBtn) saveBtn.disabled = true;
    }
  });

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      try {
        msg("");
        saveBtn.disabled = true;

        const kind = String(kindEl?.value || "season");
        const common = readCommon();

        if (kind === "season") {
          const seasonData = readSeason();
          await createOrUpdateSeasonSeasonDoc(common, seasonData);
          msg(`✅ Сезон створено/оновлено: ${common.seasonId} (auto e1..e${seasonData.numStages}${seasonData.hasFinal ? " + final" : ""})`, true);
        } else {
          const singleData = readSingle();
          await createOrUpdateSingleCompetition(common, singleData);
          msg(`✅ Змагання створено/оновлено: ${common.seasonId} (тип: ${singleData.singleType})`, true);
        }
      } catch (e) {
        console.error(e);
        msg(e.message || "Помилка збереження", false);
      } finally {
        saveBtn.disabled = false;
      }
    });
  }
})();
