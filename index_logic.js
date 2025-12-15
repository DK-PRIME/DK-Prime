// index_logic.js (DK Prime)
// ЄДИНА логіка створення змагань/сезонів і етапів так, щоб читав STOLAR CARP:
// seasons/{seasonId}
// seasons/{seasonId}/stages/{stageId}  (isRegistrationOpen=true/false)

(function () {
  // --- універсальне підключення до Firestore ---
  function getDb() {
    if (window.scDb) return window.scDb;
    if (window.db) return window.db;
    if (window.firebase && firebase.firestore) return firebase.firestore();
    return null;
  }

  const db = getDb();

  // --- DOM (підключимося до елементів; якщо їх нема — просто не впадемо) ---
  const elSeasonId      = document.getElementById("seasonId");
  const elSeasonTitle   = document.getElementById("seasonTitle");
  const elSeasonYear    = document.getElementById("seasonYear");
  const elSeasonType    = document.getElementById("seasonType"); // season_fishing | single (не критично)
  const elNumStages     = document.getElementById("numStages");
  const elRatingStages  = document.getElementById("ratingStages");
  const btnSaveSeason   = document.getElementById("btnSaveSeason");

  const elStageSeasonId = document.getElementById("stageSeasonId");
  const elStageId       = document.getElementById("stageId");
  const elStageLabel    = document.getElementById("stageLabel");
  const elStageOrder    = document.getElementById("stageOrder");
  const chkIsFinal      = document.getElementById("isFinal");
  const chkRegOpen      = document.getElementById("isRegistrationOpen");
  const btnSaveStage    = document.getElementById("btnSaveStage");

  const elListSeasons   = document.getElementById("seasonsList");
  const elListStages    = document.getElementById("stagesList");
  const elMsg           = document.getElementById("msg");

  function msg(text, ok = true) {
    if (!elMsg) return;
    elMsg.textContent = text || "";
    elMsg.style.color = ok ? "#43d18a" : "#ff6c6c";
  }

  function nowTs() {
    return (window.firebase && firebase.firestore && firebase.firestore.FieldValue)
      ? firebase.firestore.FieldValue.serverTimestamp()
      : new Date();
  }

  function safeStr(v) {
    return String(v || "").trim();
  }

  function normalizeId(v) {
    return safeStr(v)
      .replace(/\s+/g, "_")
      .replace(/[^\w\-]/g, "")
      .slice(0, 80);
  }

  if (!db) {
    msg("Firebase/Firestore не підключено (db=null). Перевір firebase-config.js", false);
    return;
  }

  // ---------- SAVE SEASON ----------
  async function saveSeason() {
    const seasonId = normalizeId(elSeasonId?.value || "");
    const title    = safeStr(elSeasonTitle?.value || "");
    const year     = Number(elSeasonYear?.value || 0) || null;
    const type     = safeStr(elSeasonType?.value || "season_fishing");
    const numStages = Number(elNumStages?.value || 0) || 0;
    const ratingStages = Number(elRatingStages?.value || 0) || 0;

    if (!seasonId) return msg("Вкажи seasonId (наприклад: 2026 або Extreme_STOLAR_CARP)", false);
    if (!title)    return msg("Вкажи назву змагання/сезону", false);

    try {
      msg("Зберігаю сезон...", true);

      const ref = db.collection("seasons").doc(seasonId);
      const snap = await ref.get();

      const payload = {
        id: seasonId,
        title,
        year: year ?? null,
        type,                // season_fishing / single
        numStages: numStages || 0,
        ratingStages: ratingStages || 0,

        // ці поля твоєму сайту не шкодять, але корисні
        updatedAt: nowTs(),
      };

      if (!snap.exists) {
        payload.createdAt = nowTs();
        // дефолтні “активні” поля (не обов’язково, але зручно)
        payload.activeStageId = payload.activeStageId || null;
        payload.activeStageOpen = payload.activeStageOpen || false;
      }

      await ref.set(payload, { merge: true });

      msg(`Сезон збережено: ${seasonId}`, true);
      await refreshSeasons();
    } catch (e) {
      console.error(e);
      msg("Помилка збереження сезону (дивись консоль).", false);
    }
  }

  // ---------- SAVE STAGE ----------
  async function saveStage() {
    const seasonId = normalizeId(elStageSeasonId?.value || "");
    const stageId  = normalizeId(elStageId?.value || "");
    const label    = safeStr(elStageLabel?.value || "");
    const order    = Number(elStageOrder?.value || 0) || 0;
    const isFinal  = !!chkIsFinal?.checked;
    const isRegistrationOpen = !!chkRegOpen?.checked;

    if (!seasonId) return msg("Вкажи seasonId для етапу (наприклад 2026)", false);
    if (!stageId)  return msg("Вкажи stageId (наприклад 2026_e1 або 2026_final)", false);
    if (!label)    return msg("Вкажи label (назва етапу)", false);

    try {
      msg("Зберігаю етап...", true);

      const stRef = db.collection("seasons").doc(seasonId).collection("stages").doc(stageId);
      const snap = await stRef.get();

      const payload = {
        id: stageId,
        seasonId,
        label,
        order,
        isFinal,
        isRegistrationOpen,   // <<< КЛЮЧОВЕ ДЛЯ STOLAR CARP (читання collectionGroup)
        updatedAt: nowTs(),
      };

      if (!snap.exists) payload.createdAt = nowTs();

      await stRef.set(payload, { merge: true });

      // бонус: якщо відкрили реєстрацію — можна писати “активний етап” у сезон (не обов’язково)
      // щоб адмінці було простіше відображати
      await db.collection("seasons").doc(seasonId).set({
        activeStageId: stageId,
        activeStageOpen: isRegistrationOpen,
        updatedAt: nowTs(),
      }, { merge: true });

      msg(`Етап збережено: ${seasonId}/${stageId} (реєстрація: ${isRegistrationOpen ? "ВІДКРИТА" : "закрита"})`, true);
      await refreshStages(seasonId);
    } catch (e) {
      console.error(e);
      msg("Помилка збереження етапу (дивись консоль).", false);
    }
  }

  // ---------- LIST / REFRESH ----------
  async function refreshSeasons() {
    if (!elListSeasons) return;

    elListSeasons.innerHTML = "Завантаження...";
    try {
      const snap = await db.collection("seasons").orderBy("updatedAt", "desc").limit(30).get();
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...(d.data() || {}) }));

      if (!items.length) {
        elListSeasons.innerHTML = "Сезонів ще нема.";
        return;
      }

      elListSeasons.innerHTML = items.map(s => {
        const t = s.title || s.id;
        const y = s.year ? ` (${s.year})` : "";
        return `
          <div class="card" style="margin:10px 0;padding:12px;border:1px solid rgba(255,255,255,.12);border-radius:12px;">
            <div style="font-weight:700">${t}${y}</div>
            <div style="opacity:.8;font-size:13px">seasonId: <b>${s.id}</b> · type: ${s.type || "-"}</div>
            <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn--ghost" data-pick-season="${s.id}">Показати етапи</button>
              <button class="btn btn--ghost" data-fill-season="${s.id}">Підставити в форму етапу</button>
            </div>
          </div>
        `;
      }).join("");

      // кнопки
      elListSeasons.querySelectorAll("[data-pick-season]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-pick-season");
          await refreshStages(id);
        });
      });
      elListSeasons.querySelectorAll("[data-fill-season]").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-fill-season");
          if (elStageSeasonId) elStageSeasonId.value = id;
          msg(`В форму етапу підставлено seasonId: ${id}`, true);
        });
      });

    } catch (e) {
      console.error(e);
      elListSeasons.innerHTML = "Помилка завантаження сезонів.";
    }
  }

  async function refreshStages(seasonId) {
    if (!elListStages) return;
    if (!seasonId) {
      elListStages.innerHTML = "Вибери сезон.";
      return;
    }

    elListStages.innerHTML = "Завантаження етапів...";
    try {
      const snap = await db
        .collection("seasons").doc(seasonId)
        .collection("stages")
        .orderBy("order", "asc")
        .get();

      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...(d.data() || {}) }));

      if (!items.length) {
        elListStages.innerHTML = "Етапів ще нема.";
        return;
      }

      elListStages.innerHTML = items.map(st => {
        const open = st.isRegistrationOpen ? "✅ ВІДКРИТО" : "⛔ ЗАКРИТО";
        const fin  = st.isFinal ? " · ФІНАЛ" : "";
        return `
          <div class="card" style="margin:10px 0;padding:12px;border:1px solid rgba(255,255,255,.12);border-radius:12px;">
            <div style="font-weight:700">${st.label || st.id}${fin}</div>
            <div style="opacity:.85;font-size:13px">
              stageId: <b>${st.id}</b> · order: ${st.order ?? "-"} · ${open}
            </div>
          </div>
        `;
      }).join("");
    } catch (e) {
      console.error(e);
      elListStages.innerHTML = "Помилка завантаження етапів.";
    }
  }

  // ---------- биндинг кнопок ----------
  if (btnSaveSeason) btnSaveSeason.addEventListener("click", (e) => { e.preventDefault(); saveSeason(); });
  if (btnSaveStage)  btnSaveStage.addEventListener("click", (e) => { e.preventDefault(); saveStage(); });

  // старт
  refreshSeasons();
})();
