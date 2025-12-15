// registrations_logic.js
// Показує заявки (registrations) по конкретному stage, дозволяє: approve / reject.
// Після "Approve" статус = 'approved' → далі потрапляє у список для жеребкування.

(function(){
  const auth = firebase.auth(); const db = firebase.firestore();
  const seasonIdEl = document.getElementById('seasonId');
  const stageIdEl  = document.getElementById('stageId');
  const loadBtn = document.getElementById('loadBtn');
  const rows = document.getElementById('rows');
  const msg = t => { document.getElementById('msg').textContent = t||''; };

  async function requireAdmin(user){
    const u = await db.collection('users').doc(user.uid).get();
    if (!u.exists || u.data().role !== 'admin') throw new Error('Лише адмін');
  }

  function tr(r){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.teamName||'—'}</td>
      <td>${r.captain||'—'}</td>
      <td>${r.phone||'—'}</td>
      <td>${r.food||'Ні'} ${r.foodQty?('('+r.foodQty+')'):''}</td>
      <td>${r.status||'—'}</td>
      <td>
        <button class="btn" data-act="approve">Підтвердити</button>
        <button class="btn" data-act="reject">Відхилити</button>
      </td>
    `;
    tr.querySelector('[data-act=approve]').onclick = async () => {
      await firebase.firestore().collection('registrations').doc(r._id).set({
        status:'approved',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge:true });
      load();
    };
    tr.querySelector('[data-act=reject]').onclick = async () => {
      await firebase.firestore().collection('registrations').doc(r._id).set({
        status:'rejected',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge:true });
      load();
    };
    return tr;
  }

  async function load(){
    const seasonId = (seasonIdEl.value||'').trim();
    const stageId  = (stageIdEl.value||'').trim();
    if (!seasonId || !stageId){ msg('Вкажи seasonId і stageId'); return; }

    rows.innerHTML = '<tr><td colspan="6">Завантаження…</td></tr>';

    // читаємо всі заявки цього етапу
    const snap = await db.collection('registrations')
      .where('seasonId','==',seasonId)
      .where('stageId','==',stageId)
      .get();

    const arr = [];
    snap.forEach(d => arr.push({ _id:d.id, ...d.data() }));
    arr.sort((a,b)=> (a.teamName||'').localeCompare(b.teamName||''));
    rows.innerHTML = '';
    if (!arr.length){ rows.innerHTML = '<tr><td colspan="6">Нема заявок</td></tr>'; return; }
    arr.forEach(r => rows.appendChild(tr(r)));
  }

  loadBtn.onclick = load;

  auth.onAuthStateChanged(async (user)=>{
    if (!user){ msg('Увійди як адмін'); return; }
    try { await requireAdmin(user); msg(''); }
    catch(e){ msg(e.message||String(e)); }
  });
})();
