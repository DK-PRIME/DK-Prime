// registration_control_logic.js
(function(){
  const auth = firebase.auth();
  const db = firebase.firestore();
  const list = document.getElementById('list');
  const msg = t => { const el = document.getElementById('msg'); el.textContent = t||''; };

  async function requireAdmin(user){
    const u = await db.collection('users').doc(user.uid).get();
    if (!u.exists || u.data().role !== 'admin') throw new Error('Лише адмін');
  }

  function renderItem(seasonId, stageId, s){
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <div>
        <div style="font-weight:700">${s.label || stageId}</div>
        <div style="opacity:.8;font-size:.9rem">${seasonId} · ${stageId} ${s.isFinal?'· ФІНАЛ':''}</div>
      </div>
      <div>
        <button class="btn ${s.isRegistrationOpen?'on':''}" data-act="toggle"> ${s.isRegistrationOpen?'Відкрита':'Закрита'} </button>
      </div>
    `;
    div.querySelector('[data-act=toggle]').onclick = async () => {
      await db.collection('seasons').doc(seasonId).collection('stages').doc(stageId)
        .set({ isRegistrationOpen: !s.isRegistrationOpen, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge:true });
      load();
    };
    return div;
  }

  async function load(){
    list.innerHTML = 'Завантаження...';
    const out = [];
    // зчитуємо всі сезони
    const seasons = await db.collection('seasons').get();
    for (const seas of seasons.docs){
      const stages = await seas.ref.collection('stages').get();
      stages.forEach(st => out.push({seasonId: seas.id, stageId: st.id, data: st.data()}));
    }
    out.sort((a,b)=> (a.seasonId+a.stageId).localeCompare(b.seasonId+b.stageId));
    list.innerHTML = '';
    out.forEach(x => list.appendChild(renderItem(x.seasonId, x.stageId, x.data)));
  }

  auth.onAuthStateChanged(async (user)=>{
    if (!user){ msg('Увійди як адмін'); return; }
    try{ await requireAdmin(user); await load(); msg(''); }
    catch(e){ msg(e.message||String(e)); }
  });
})();
