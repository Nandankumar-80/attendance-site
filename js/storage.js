/* ============================================================
   STORAGE ENGINE (0ms Local Storage Cache + Async Cloud DB)
============================================================ */
let currentUser = null;      // { email, name, designation }
let appData = { groups: [] };

async function storageGet(key){
  let localVal = null;
  try { localVal = window.localStorage.getItem(key); } catch(e){}

  if(localVal !== null){
    if(firebaseDb){
      firebaseDb.collection('attendo_storage').doc(sanitizeKey(key)).get().then(doc => {
        if(doc && doc.exists && doc.data() && doc.data().value){
          try { window.localStorage.setItem(key, doc.data().value); } catch(e){}
        }
      }).catch(e => {});
    }
    return localVal;
  }

  if(firebaseDb){
    try {
      const docRef = firebaseDb.collection('attendo_storage').doc(sanitizeKey(key));
      const doc = await docRef.get();
      if(doc && doc.exists && doc.data() && doc.data().value){
        const cloudVal = doc.data().value;
        try { window.localStorage.setItem(key, cloudVal); } catch(e){}
        return cloudVal;
      }
    } catch(e) {
      console.log('Cloud get fallback to local', e);
    }
  }
  return localVal;
}

async function storageSet(key, value){
  try { window.localStorage.setItem(key, value); } catch(e){}

  if(firebaseDb){
    firebaseDb.collection('attendo_storage').doc(sanitizeKey(key)).set({
      value: value,
      updatedAt: Date.now()
    }, { merge: true }).catch(e => {
      console.log('Background cloud sync note:', e.message);
    });
  }
}

async function persist(){
  if(currentUser && currentUser.email){
    await storageSet('data:' + currentUser.email, JSON.stringify(appData));
  }
}

function uid(){
  return Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
}

function toast(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 2400);
}
