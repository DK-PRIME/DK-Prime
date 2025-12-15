// assets/js/competition.js
// DK Prime — створення/редагування змагань (seasons) і етапів (stages)
// Пише у Firestore:
//   seasons/{seasonId}
//   seasons/{seasonId}/stages/{stageId}
// Відкриття реєстрації для STOLAR CARP: stage.isRegistrationOpen = true

(function () {
  if (!window.firebase) {
    alert("Firebase SDK не підключений (firebase-*compat).");
    return;
  }

  // Firebase (compat)
  const auth = firebase.auth();
  const db = firebase.firestore();

  // ====== helpers ======
  const $ = (id) => document.getElementById(id);
  const nowTS = () => firebase.firestore.FieldValue.serverTimestamp();

  function val(id) {
    const el = $(id);
    return el ? String(el.value || "").trim() : "";
  }
  function num(id) {
    const v = val(id);
    if (v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function bool(id) {
    const el = $(id);
    return !!(el && el.checked);
  }

  function setMsg(text, ok = true) {
    const msgEl = $("msg");
    if (!msgEl) return;
    msgEl.textContent = text || "";
    msgEl.style.color = ok ? "#43d18a" : "#ff6c6c";
  }

  function requireAdmin(user) {
    if (!user) throw new Error("Не залогінений. Перейди на login.");
    // Якщо не хочеш перевірку ролі — можеш прибрати цей блок.
    // Але в тебе rules дозволяють write по seasons/stages тільки admin.
    return db.collection("users").doc(user.uid).get().then((snap) => {
      const role = (snap.exists && snap.data() && snap.data().role) || "";
      if (role !== "admin") throw new Error("Доступ заборонено: потрібна роль admin.");
      return true;
    });
  }

  function seasonRef(seasonId) {
    return db.collection("seasons").doc(seasonId);
  }
  function stageRef(seasonId, stageId) {
    return db.collection("seasons").doc(seasonId).collection("stages").doc(stageId);
  }

  // ====== SEASON SAVE ======
  async function saveSeason() {
    const seasonId = val("seasonId");
    if (!seasonId) return setMsg("Вкажи seasonId (наприклад: 2026 або Extreme_STOLAR_CARP).", false);

    const data = {
      id: seasonId,
      title: val("seasonTitle") || val("title") || "",          // підтримка різних id у html
      year: num("seasonYear") ?? num("year"),
      type: val("seasonType") || val("type") || "season_fishing",
      numStages: num("numStages"),
      ratingStages: num("ratingStages"),
      updatedAt: nowTS(),
    };

    // якщо документу ще немає — поставимо createdAt
    const ref = seasonRef(seasonId);
    const snap = await ref.get();
    if (!snap.exists) data.createdAt = nowTS();

    await ref.set(data, { merge: true });
    setMsg(`Сезон збережено: ${seasonId}`, true);

    // оновити списки (якщо є блоки)
    await renderSeasons();
  }

  // ====== STAGE SAVE ======
  async function saveStage() {
    const seasonId = val("stageSeasonId") || val("seasonId_stage") || val("seasonIdForStage") || val("seasonId2") || val("seasonId");
    const stageId = val("stageId");
    if (!seasonId) return setMsg("Вкажи seasonId для етапу.", false);
    if (!stageId) return setMsg("Вкажи stageId (наприклад: 2026_e1 або 2026_final).", false);

    const data = {
      id: stageId,
      seasonId: seasonId,
      label: val("label") || val("stageLabel") || "",
      order: num("order"),
      isFinal: bool("isFinal"),
      // це головне поле для STOLAR CARP:
      isRegistrationOpen: bool("isRegistrationOpen"),
      // твої додаткові прапорці:
      allowBigFishTotal: bool("allowBigFishTotal"),
      minusOneFor13kg: bool("minusOneFor13kg"),

      lake: val("lake") || "",
      capacity: num("capacity"),
      startDate: val("startDate") || "", // як рядок — нормально; якщо захочеш Timestamp, переробимо
      endDate: val("endDate") || "",

      updatedAt: nowTS(),
    };

    const ref = stageRef(seasonId, stageId);
    const snap = await ref.get();
    if (!snap.exists) data.createdAt = nowTS();

    await ref.set(data, { merge: true });
    setMsg(`Етап збережено: ${seasonId} / ${stageId}`, true);

    await renderStagesForSeason(seasonId);
  }

  // ====== OPEN / CLOSE REG ======
  async function setRegOpen(open) {
    const seasonId = val("stageSeasonId") || val("seasonId_stage") || val("seasonIdForStage") || val("seasonId2") || val("seasonId");
    const stageId = val("stageId");
    if (!seasonId || !stageId) return setMsg("Для відкриття/закриття вкажи seasonId + stageId.", false);

    await stageRef(seasonId, stageId).set(
      { isRegistrationOpen: !!open, updatedAt: nowTS() },
      { merge: true }
    );

    setMsg(open ? "Реєстрацію ВІДКРИТО ✅" : "Реєстрацію ЗАКРИТО ⛔", true);
    await renderStagesForSeason(seasonId);
  }

  // ====== LISTS (optional UI) ======
  async function renderSeasons() {
    const box = $("seasonsList");
    if (!box) return; // якщо у твоєму html нема такого блока — просто нічого не робимо

    box.innerHTML = "Завантаження сезонів...";
    const snap = await db.collection("seasons").orderBy("updatedAt", "desc").limit(50).get();

    if (snap.empty) {
      box.innerHTML = "<div style='opacity:.8'>Сезонів ще немає.</div>";
      return;
    }

    const items = [];
    snap.forEach((d) => {
      const s = d.data() || {};
      items.push(`
        <div style="padding:10px;border:1px solid #2a2f45;border-radius:12px;margin:8px 0;background:#141825;cursor:pointer"
             data-season="${d.id}">
          <b>${s.title || d.id}</b>
          <div style="opacity:.75;font-size:.9rem">seasonId: ${d.id} · year: ${s.year ?? ""} · type: ${s.type ?? ""}</div>
        </div>
      `);
    });

    box.innerHTML = items.join("");

    // клік по сезону -> підставити seasonId у форму і підвантажити етапи
    box.querySelectorAll("[data-season]").forEach((el) => {
      el.addEventListener("click", async () => {
        const sid = el.getAttribute("data-season");
        if ($("seasonId")) $("seasonId").value = sid;
        // форма етапу теж часто потребує seasonId:
        const stageSeason = $("stageSeasonId") || $("seasonId_stage") || $("seasonIdForStage") || $("seasonId2");
        if (stageSeason) stageSeason.value = sid;

        await renderStagesForSeason(sid);
      });
    });
  }

  async function renderStagesForSeason(seasonId) {
    const box = $("stagesList");
    if (!box) return;

    if (!seasonId) {
      box.innerHTML = "<div style='opacity:.8'>Вибери сезон.</div>";
      return;
    }

    box.innerHTML = "Завантаження етапів...";
    const snap = await db
      .collection("seasons")
      .doc(seasonId)
      .collection("stages")
      .orderBy("order", "asc")
      .get();

    if (snap.empty) {
      box.innerHTML = "<div style='opacity:.8'>Етапів у сезоні ще немає.</div>";
      return;
    }

    const rows = [];
    snap.forEach((d) => {
      const st = d.data() || {};
      rows.push(`
        <div style="padding:10px;border:1px solid #2a2f45;border-radius:12px;margin:8px 0;background:#0f1320">
          <b>${st.label || d.id}</b>
          <div style="opacity:.75;font-size:.9rem">
            stageId: ${d.id}
            ${st.isFinal ? " · <b style='color:#f6c34c'>ФІНАЛ</b>" : ""}
            · order: ${st.order ?? "-"}
            · reg: ${st.isRegistrationOpen ? "<span style='color:#43d18a'>OPEN</span>" : "<span style='color:#ff6c6c'>CLOSED</span>"}
            · BigFishTotal: ${st.allowBigFishTotal ? "так" : "ні"}
            · −1 за 13кг: ${st.minusOneFor13kg ? "так" : "ні"}
          </div>
          <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">
            <button data-fill="${d.id}" style="padding:6px 10px;border-radius:10px;border:1px solid #2a2f45;background:#141825;color:#fff;cursor:pointer">
              Редагувати
            </button>
            <button data-open="${d.id}" style="padding:6px 10px;border-radius:10px;border:1px solid #2a2f45;background:#141825;color:#fff;cursor:pointer">
              Відкрити реєстрацію
            </button>
            <button data-close="${d.id}" style="padding:6px 10px;border-radius:10px;border:1px solid #2a2f45;background:#141825;color:#fff;cursor:pointer">
              Закрити реєстрацію
            </button>
          </div>
        </div>
      `);
    });

    box.innerHTML = rows.join("");

    // actions
    box.querySelectorAll("[data-fill]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const stageId = btn.getAttribute("data-fill");
        const stSnap = await stageRef(seasonId, stageId).get();
        const st = stSnap.data() || {};

        if ($("stageId")) $("stageId").value = stageId;
        const stageSeason = $("stageSeasonId") || $("seasonId_stage") || $("seasonIdForStage") || $("seasonId2");
        if (stageSeason) stageSeason.value = seasonId;

        if ($("label")) $("label").value = st.label || "";
        if ($("order")) $("order").value = st.order ?? "";
        if ($("isFinal")) $("isFinal").checked = !!st.isFinal;
        if ($("isRegistrationOpen")) $("isRegistrationOpen").checked = !!st.isRegistrationOpen;
        if ($("allowBigFishTotal")) $("allowBigFishTotal").checked = !!st.allowBigFishTotal;
        if ($("minusOneFor13kg")) $("minusOneFor13kg").checked = !!st.minusOneFor13kg;

        if ($("lake")) $("lake").value = st.lake || "";
        if ($("capacity")) $("capacity").value = st.capacity ?? "";
        if ($("startDate")) $("startDate").value = st.startDate || "";
        if ($("endDate")) $("endDate").value = st.endDate || "";

        setMsg(`Редагування етапу: ${seasonId}/${stageId}`, true);
      });
    });

    box.querySelectorAll("[data-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const stageId = btn.getAttribute("data-open");
        if ($("stageId")) $("stageId").value = stageId;
        const stageSeason = $("stageSeasonId") || $("seasonId_stage") || $("seasonIdForStage") || $("seasonId2");
        if (stageSeason) stageSeason.value = seasonId;
        setRegOpen(true);
      });
    });

    box.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const stageId = btn.getAttribute("data-close");
        if ($("stageId")) $("stageId").value = stageId;
        const stageSeason = $("stageSeasonId") || $("seasonId_stage") || $("seasonIdForStage") || $("seasonId2");
        if (stageSeason) stageSeason.value = seasonId;
        setRegOpen(false);
      });
    });
  }

  // ====== wire buttons (ids expected) ======
  function wire() {
    const saveSeasonBtn = $("saveSeasonBtn") || $("saveSeason") || $("seasonSaveBtn");
    const saveStageBtn = $("saveStageBtn") || $("saveStage") || $("stageSaveBtn") || $("createBtn");

    const openBtn = $("openBtn");
    const closeBtn = $("closeBtn");

    if (saveSeasonBtn) saveSeasonBtn.addEventListener("click", (e) => { e.preventDefault(); saveSeason().catch(err => setMsg(err.message || "Помилка сезону", false)); });
    if (saveStageBtn)  saveStageBtn.addEventListener("click",  (e) => { e.preventDefault(); saveStage().catch(err => setMsg(err.message || "Помилка етапу", false)); });

    if (openBtn)  openBtn.addEventListener("click", (e) => { e.preventDefault(); setRegOpen(true).catch(err => setMsg(err.message || "Помилка open", false)); });
    if (closeBtn) closeBtn.addEventListener("click", (e) => { e.preventDefault(); setRegOpen(false).catch(err => setMsg(err.message || "Помилка close", false)); });
  }

  // ====== start ======
  auth.onAuthStateChanged(async (user) => {
    try {
      await requireAdmin(user);
      wire();
      // якщо є списки — підвантажимо
      await renderSeasons();
      setMsg("Адмін доступ OK. Можеш створювати сезони/етапи.", true);
    } catch (e) {
      console.error(e);
      setMsg(e.message || "Нема доступу.", false);
    }
  });
})();
