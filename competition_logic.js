// competition_logic.js
// Пише етап у seasons/{seasonId}/stages/{stageId} у форматі, який читає STOLAR CARP.

(function () {
  const auth = firebase.auth();
  const db   = firebase.firestore();

  const els = {
    seasonId: document.getElementById('seasonId'),
    stageId: document.getElementById('stageId'),
    label: document.getElementById('label'),
    type: document.getElementById('type'),
    isRegistrationOpen: document.getElementById('isRegistrationOpen'),
    allowBigFishTotal: document.getElementById('allowBigFishTotal'),
    minusOneFor13kg: document.getElementById('minusOneFor13kg'),
    lake: document.getElementById('lake'),
    capacity: document.getElementById('capacity'),
    startDate: document.getElementById('startDate'),
    endDate: document.getElementById('endDate'),
    createBtn: document.getElementById('createBtn'),
    openBtn: document.getElementById('openBtn'),
    closeBtn: document.getElementById('closeBtn'),
    msg: document.getElementById('msg'),
  };

  const ok = t => { els.msg.textContent = t; els.msg.className = 'msg ok'; };
  const err = t => { els.msg.textContent = t; els.msg.className = 'msg err'; };

  // Опційно: пускаємо лише admin
  async function requireAdmin(user) {
    const u = await db.collection('users').doc(user.uid).get();
    const role = (u.exists && u.data().role) || '';
    if (role !== 'admin') throw new Error('Доступ лише для адміністратора.');
  }

  async function upsertStage() {
    const seasonId = (els.seasonId.value || '').trim();
    const stageId  = (els.stageId.value || '').trim();
    if (!seasonId || !stageId) return err('Вкажи seasonId і stageId');

    const isFinal = els.type.value === 'final';

    const payload = {
      label: (els.label.value || '').trim() || stageId,
      type: els.type.value,              // 'stage' | 'final' | 'event'
      isFinal,
      isRegistrationOpen: !!els.isRegistrationOpen.checked,

      // те, що просив:
      allowBigFishTotal: !!els.allowBigFishTotal.checked,
      minusOneFor13kg: !!els.minusOneFor13kg.checked,

      // метадані
      lake: (els.lake.value || '').trim() || null,
      capacity: els.capacity.value ? Number(els.capacity.value) : null,
      startDate: els.startDate.value || null, // 'YYYY-MM-DD'
      endDate: els.endDate.value || null,     // 'YYYY-MM-DD'

      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    // створимо season-док, якщо нема
    const seasonRef = db.collection('seasons').doc(seasonId);
    const seasonSnap = await seasonRef.get();
    if (!seasonSnap.exists) {
      await seasonRef.set({
        label: seasonId,
        year: Number(seasonId) || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    // створюємо/оновлюємо stage
    await seasonRef.collection('stages').doc(stageId).set({
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      ...payload
    }, { merge: true });

    ok('Збережено ✔');
  }

  async function setOpen(isOpen) {
    const seasonId = (els.seasonId.value || '').trim();
    const stageId  = (els.stageId.value || '').trim();
    if (!seasonId || !stageId) return err('Вкажи seasonId і stageId');

    await db.collection('seasons').doc(seasonId)
      .collection('stages').doc(stageId)
      .set({
        isRegistrationOpen: !!isOpen,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

    ok(isOpen ? 'Реєстрацію відкрито' : 'Реєстрацію закрито');
    els.isRegistrationOpen.checked = !!isOpen;
  }

  els.createBtn.addEventListener('click', async () => {
    try {
      const user = auth.currentUser;
      if (!user) return err('Увійди як адмін');
      await requireAdmin(user);
      await upsertStage();
    } catch (e) { err(e.message || String(e)); }
  });

  els.openBtn.addEventListener('click', async () => {
    try {
      const user = auth.currentUser;
      if (!user) return err('Увійди як адмін');
      await requireAdmin(user);
      await setOpen(true);
    } catch (e) { err(e.message || String(e)); }
  });

  els.closeBtn.addEventListener('click', async () => {
    try {
      const user = auth.currentUser;
      if (!user) return err('Увійди як адмін');
      await requireAdmin(user);
      await setOpen(false);
    } catch (e) { err(e.message || String(e)); }
  });

  // Якщо приходимо з параметрами ?seasonId=2026&stageId=2026_e1 — підвантажимо
  (async function prefillFromQuery(){
    const q = new URLSearchParams(location.search);
    const seasonId = q.get('seasonId'); const stageId = q.get('stageId');
    if (seasonId) els.seasonId.value = seasonId;
    if (!seasonId || !stageId) return;

    els.stageId.value = stageId;
    try {
      const ref = db.collection('seasons').doc(seasonId).collection('stages').doc(stageId);
      const snap = await ref.get();
      if (snap.exists) {
        const s = snap.data();
        els.label.value = s.label || '';
        els.type.value = s.type || (s.isFinal ? 'final' : 'stage');
        els.isRegistrationOpen.checked = !!s.isRegistrationOpen;
        els.allowBigFishTotal.checked = !!s.allowBigFishTotal;
        els.minusOneFor13kg.checked = !!s.minusOneFor13kg;
        els.lake.value = s.lake || '';
        els.capacity.value = s.capacity || '';
        els.startDate.value = s.startDate || '';
        els.endDate.value = s.endDate || '';
      }
    } catch {}
  })();
})();
