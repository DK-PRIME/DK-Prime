// assets/js/competition.js
// DK Prime — створення змагань так, щоб STOLAR CARP читав через seasons/*/stages (collectionGroup)

(function () {
  const auth = window.scAuth;
  const db   = window.scDb;

  const elKind   = document.getElementById("kind");
  const elName   = document.getElementById("name");
  const elCompId = document.getElementById("compId");
  const elRule13 = document.getElementById("rule13");

  const elStagesCount = document.getElementById("stagesCount");
  const elHasFinal    = document.getElementById("hasFinal");
  const elFinalOpts   = document.getElementById("finalOpts");
  const elBestOf      = document.getElementById("bestOf");
  const elAutoStages  = document.getElementById("autoStages");

  const elStalkerTeamBlock = document.getElementById("block-stalker-team");
  const elStalkerTeamCount = document.getElementById("stalkerTeamCount");

  const btnCreate = document.getElementById("btnCreate");
  const btnReset  = document.getElementById("btnReset");
  const msgEl     = document.getElementById("msg");

  if (!auth || !db || !window.firebase) {
    alert("Firebase init missing (firebase-config.js / SDK).");
    return;
  }

  function msg(t, ok = true) {
    msgEl.textContent = t || "";
    msgEl.className = "msg " + (t ? (ok ? "ok" : "err") : "");
  }

  function slugify(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
  }

  function nowTS() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function showBlocks() {
    const k = elKind.value;

    // season UI
    const isSeason = (k === "season");
    document.getElementById("block-season").classList.toggle("hidden", !isSeason);
    document.getElementById("block-season-body").classList.toggle("hidden", !isSeason);

    // stalker team UI
    elStalkerTeamBlock.classList.toggle("hidden", k !== "stalker_team");

    // final UI
    elFinalOpts.classList.toggle("hidden", !(isSeason && elHasFinal.checked));

    // авто-етапи
    renderAutoStages();
  }

  function renderAutoStages() {
    elAutoStages.innerHTML = "";
    if (elKind.value !== "season") return;

    const n = Math.max(1, Math.min(20, Number(elStagesCount.value || 1)));
    for (let i = 1; i <= n; i++) {
      const li = document.createElement("li");
      li.textContent = `Етап ${i} (stageId: e${i})`;
      elAutoStages.appendChild(li);
    }
    if (elHasFinal.checked) {
      const li = document.createElement("li");
      li.textContent = "Фінал (stageId: final)";
      elAutoStages.appendChild(li);
    }
  }

  // listeners
  elKind.addEventListener("change", showBlocks);
  elHasFinal.addEventListener("change", showBlocks);
  elStagesCount.addEventListener("input", renderAutoStages);

  btnReset.addEventListener("click", () => {
    elKind.value = "season";
    elName.value = "";
    elCompId.value = "";
    elRule13.checked = false;
    elStagesCount.value = 5;
    elHasFinal.checked = false;
    elBestOf.value = 3;
    elStalkerTeamCount.value = 2;
    msg("");
    showBlocks();
  });

  async function requireAdmin(user) {
    if (!user) throw new Error("Спочатку увійди в DK Prime (admin).");
    const uSnap = await db.collection("users").doc(user.uid).get();
    const u = uSnap.exists ? (uSnap.data() || {}) : {};
    if (u.role !== "admin") throw new Error("Нема доступу. Потрібна роль admin.");
  }

  async function createSeason(seasonId, name, rule13, stagesCount, hasFinal, bestOf, uid) {
    // season doc
    await db.collection("seasons").doc(seasonId).set({
      type: "season",
      name,
      label: name,
      createdAt: nowTS(),
      createdBy: uid,

      stagesCount,
      hasFinal: !!hasFinal,
      ratingBestOf: hasFinal ? Number(bestOf || 1) : null,

      rule13kgMinus1: !!rule13
    }, { merge: true });

    // stages
    const batch = db.batch();
    for (let i = 1; i <= stagesCount; i++) {
      const stageId = `e${i}`;
      const ref = db.collection("seasons").doc(seasonId).collection("stages").doc(stageId);
      batch.set(ref, {
        seasonId,
        stageId,
        order: i,
        isFinal: false,

        label: `${name} — Етап ${i}`,
        title: `${name} — Етап ${i}`,

        isRegistrationOpen: false,   // ВАЖЛИВО: відкривання буде сторінка №2
        createdAt: nowTS(),
        createdBy: uid,

        competitionType: "season",
        rule13kgMinus1: !!rule13
      }, { merge: true });
    }

    if (hasFinal) {
      const ref = db.collection("seasons").doc(seasonId).collection("stages").doc("final");
      batch.set(ref, {
        seasonId,
        stageId: "final",
        order: 999,
        isFinal: true,

        label: `${name} — Фінал`,
        title: `${name} — Фінал`,

        isRegistrationOpen: false,
        createdAt: nowTS(),
        createdBy: uid,

        competitionType: "season_final",
        rule13kgMinus1: !!rule13
      }, { merge: true });
    }

    await batch.commit();
  }

  async function createSingleCompetition(compType, seasonId, name, rule13, uid, extra) {
    // робимо як "сезон з 1 етапом", щоб STOLAR CARP гарантовано бачив
    await db.collection("seasons").doc(seasonId).set({
      type: compType,
      name,
      label: name,
      createdAt: nowTS(),
      createdBy: uid,
      rule13kgMinus1: !!rule13,
      ...extra
    }, { merge: true });

    const stageRef = db.collection("seasons").doc(seasonId).collection("stages").doc("main");
    await stageRef.set({
      seasonId,
      stageId: "main",
      order: 1,
      isFinal: false,

      label: name,
      title: name,

      isRegistrationOpen: false,
      createdAt: nowTS(),
      createdBy: uid,

      competitionType: compType,
      rule13kgMinus1: !!rule13,
      ...extra
    }, { merge: true });
  }

  btnCreate.addEventListener("click", async () => {
    msg("");

    try {
      btnCreate.disabled = true;

      const user = auth.currentUser;
      await requireAdmin(user);

      const kind = elKind.value;
      const name = String(elName.value || "").trim();
      if (!name) throw new Error("Вкажи назву.");

      const customId = String(elCompId.value || "").trim();
      const seasonId = customId ? slugify(customId) : slugify(name) || ("comp_" + Date.now());
      const rule13 = !!elRule13.checked;

      if (kind === "season") {
        const stagesCount = Math.max(1, Math.min(20, Number(elStagesCount.value || 1)));
        const hasFinal = !!elHasFinal.checked;
        const bestOf = Math.max(1, Math.min(20, Number(elBestOf.value || 1)));

        await createSeason(seasonId, name, rule13, stagesCount, hasFinal, bestOf, user.uid);
        msg(`Створено сезон: ${seasonId} ✅`, true);
        return;
      }

      if (kind === "stalker_team") {
        const cnt = Math.max(1, Math.min(3, Number(elStalkerTeamCount.value || 2)));
        await createSingleCompetition("stalker_team", seasonId, name, rule13, user.uid, {
          stalkerTeamCount: cnt,
          zonesCount: cnt,
          scoring: "sum_places_then_weight"
        });
        msg(`Створено сталкер командний: ${seasonId} ✅`, true);
        return;
      }

      if (kind === "stalker_solo") {
        await createSingleCompetition("stalker_solo", seasonId, name, rule13, user.uid, {
          scoring: "total_weight_individual"
        });
        msg(`Створено сталкер одиночний: ${seasonId} ✅`, true);
        return;
      }

      if (kind === "three_tables") {
        await createSingleCompetition("three_tables", seasonId, name, rule13, user.uid, {
          scoring: "three_tables",
          tables: ["total_weight", "top5_weight", "big_fish"]
        });
        msg(`Створено "Таблиця трьох": ${seasonId} ✅`, true);
        return;
      }

      if (kind === "cup") {
        await createSingleCompetition("cup", seasonId, name, rule13, user.uid, {
          scoring: "total_weight"
        });
        msg(`Створено Кубок: ${seasonId} ✅`, true);
        return;
      }

      if (kind === "autumn_carp") {
        await createSingleCompetition("autumn_carp", seasonId, name, rule13, user.uid, {
          scoring: "total_weight"
        });
        msg(`Створено Осінній короп: ${seasonId} ✅`, true);
        return;
      }

      // classic
      await createSingleCompetition("classic", seasonId, name, rule13, user.uid, {
        scoring: "total_weight"
      });
      msg(`Створено змагання: ${seasonId} ✅`, true);

    } catch (e) {
      console.error(e);
      msg(e.message || String(e), false);
    } finally {
      btnCreate.disabled = false;
    }
  });

  // init
  auth.onAuthStateChanged(() => {});
  showBlocks();
})();
