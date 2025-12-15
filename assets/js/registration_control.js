// assets/js/registration_control.js
// Відкриття/закриття реєстрації так, щоб STOLAR CARP читав через collectionGroup("stages")
// Пише: seasons/{seasonId}/stages/{stageId}.isRegistrationOpen = true/false (boolean)

(function () {
  const auth = window.scAuth;
  const db   = window.scDb;

  const authPill = document.getElementById("authPill");
  const rolePill = document.getElementById("rolePill");
  const seasonPick = document.getElementById("seasonPick");
  const stagePick  = document.getElementById("stagePick");
  const btnOpen  = document.getElementById("btnOpen");
  const btnClose = document.getElementById("btnClose");
  const msgEl = document.getElementById("msg");
  const stageState = document.getElementById("stageState");

  function setMsg(t, ok=true){
    msgEl.textContent = t || "";
    msgEl.style.color = ok ? "#43d18a" : "#ff6c6c";
  }
  function ts(){
    return (window.firebase && firebase.firestore?.FieldValue)
      ? firebase.firestore.FieldValue.serverTimestamp()
      : new Date();
  }

  if (!auth || !db) {
    alert("Firebase init не завантажився. Перевір firebase-config.js та compat SDK.");
    return;
  }

  let me = null;
  let myRole = null;

  async function loadMyRole(uid){
    const uSnap = await db.collection("users").doc(uid).get();
    const u = uSnap.exists ? (uSnap.data() || {}) : {};
    return u.role || null;
  }

  function requireAdmin(){
    if (myRole !== "admin") {
      setMsg("Доступ заборонено: потрібна роль admin.", false);
      return false;
    }
    return true;
  }

  async function loadSeasons(){
    seasonPick.innerHTML = `<option value="">— вибери сезон —</option>`;
    const snap = await db.collection("seasons").orderBy("updatedAt","desc").limit(50).get();
    snap.forEach(doc => {
      const d = doc.data() || {};
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = `${doc.id} · ${d.title || "Без назви"}`;
      seasonPick.appendChild(opt);
    });
  }

  async function loadStages(seasonId){
    stagePick.innerHTML = `<option value="">— вибери етап —</option>`;
    stageState.textContent = "—";
    if (!seasonId) return;

    const snap = await db.collection("seasons").doc(seasonId).collection("stages").orderBy("order","asc").get();
    snap.forEach(doc => {
      const st = doc.data() || {};
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = `${doc.id} · ${st.label || "Без назви"} ${st.isRegistrationOpen ? "✅" : "⛔"}`;
      stagePick.appendChild(opt);
    });
  }

  async function renderStageState(seasonId, stageId){
    stageState.textContent = "—";
    if (!seasonId || !stageId) return;

    const ref = db.collection("seasons").doc(seasonId).collection("stages").doc(stageId);
    const snap = await ref.get();
    if (!snap.exists) {
      stageState.textContent = "Етап не знайдено.";
      return;
    }
    const st = snap.data() || {};
    stageState.innerHTML =
      `Етап: <b>${stageId}</b><br>` +
      `Назва: <b>${st.label || "-"}</b><br>` +
      `Реєстрація: <b style="color:${st.isRegistrationOpen ? "#43d18a" : "#ff6c6c"}">${st.isRegistrationOpen ? "ВІДКРИТА" : "ЗАКРИТА"}</b><br>` +
      `order: <b>${st.order ?? "-"}</b>`;
  }

  async function setRegistrationOpen(open){
    if (!requireAdmin()) return;

    const seasonId = seasonPick.value;
    const stageId  = stagePick.value;
    if (!seasonId) return setMsg("Вибери сезон.", false);
    if (!stageId)  return setMsg("Вибери етап.", false);

    try {
      setMsg(open ? "Відкриваю реєстрацію..." : "Закриваю реєстрацію...", true);

      const stRef = db.collection("seasons").doc(seasonId).collection("stages").doc(stageId);
      await stRef.set({
        isRegistrationOpen: !!open,   // ВАЖЛИВО: BOOLEAN
        updatedAt: ts()
      }, { merge: true });

      // settings/active — щоб і DK Prime, і STOLAR CARP могли (за потреби) мати "активний етап"
      await db.collection("settings").doc("active").set({
        activeSeasonId: seasonId,
        activeStageId: stageId,
        activeStageOpen: !!open,
        updatedAt: ts()
      }, { merge: true });

      setMsg(open ? "✅ Реєстрацію ВІДКРИТО" : "⛔ Реєстрацію ЗАКРИТО", true);

      await loadStages(seasonId);
      stagePick.value = stageId;
      await renderStageState(seasonId, stageId);

    } catch (e) {
      console.error(e);
      setMsg("Помилка (Rules/доступ або немає прав). Дивись консоль.", false);
    }
  }

  // listeners
  seasonPick.addEventListener("change", async () => {
    await loadStages(seasonPick.value);
  });

  stagePick.addEventListener("change", async () => {
    await renderStageState(seasonPick.value, stagePick.value);
  });

  btnOpen.addEventListener("click", () => setRegistrationOpen(true));
  btnClose.addEventListener("click", () => setRegistrationOpen(false));

  // auth bootstrap
  rememberLastSelect();

  auth.onAuthStateChanged(async (u) => {
    me = u || null;

    if (!me) {
      authPill.textContent = "Доступ: ❌ (увійди)";
      rolePill.textContent = "Роль: —";
      setMsg("Увійди як admin, щоб керувати реєстрацією.", false);
      return;
    }

    authPill.textContent = "Доступ: ✅";
    try{
      myRole = await loadMyRole(me.uid);
      rolePill.textContent = `Роль: ${myRole || "—"}`;

      await loadSeasons();
      restoreLastSelect();
      if (seasonPick.value) await loadStages(seasonPick.value);
      if (seasonPick.value && stagePick.value) await renderStageState(seasonPick.value, stagePick.value);

      setMsg("Готово. Вибери сезон та етап.", true);
    } catch(e){
      console.error(e);
      setMsg("Не вдалося завантажити дані (перевір Rules / users.role).", false);
    }
  });

  // ---- local helpers
  function rememberLastSelect(){
    seasonPick.addEventListener("change", () => {
      localStorage.setItem("dk_last_season", seasonPick.value || "");
    });
    stagePick.addEventListener("change", () => {
      localStorage.setItem("dk_last_stage", stagePick.value || "");
    });
  }
  function restoreLastSelect(){
    const s = localStorage.getItem("dk_last_season") || "";
    if (s) seasonPick.value = s;
  }
  async function restoreLastSelect(){
    const s = localStorage.getItem("dk_last_season") || "";
    if (s) seasonPick.value = s;

    // stage підставимо пізніше, після loadStages
    const st = localStorage.getItem("dk_last_stage") || "";
    if (st) {
      setTimeout(() => { stagePick.value = st; }, 250);
    }
  }

})();
