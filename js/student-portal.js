/* ============================================================
   STUDENT PUBLIC MOBILE PORTAL (ZERO-LOGIN ATTENDANCE ROUTER)
============================================================ */
let publicPortalData = null;

function portalGroupLabel(g){
  if(!g) return '';
  if(g.type === 'college'){
    const sem = String(g.semester || '').trim();
    const semFormatted = sem.toLowerCase().includes('sem') ? sem : (sem ? `Semester ${sem}` : 'Semester');
    return (g.department || 'Department') + ' — ' + semFormatted;
  }
  if(g.type === 'school_junior') return 'Class ' + (g.className || '') + ' — ' + (g.subject || '');
  return (g.stream || '') + ' — ' + (g.className || '');
}

function portalGroupInstitution(g){
  if(!g) return '';
  return g.type === 'college' ? (g.collegeName || 'College') : (g.schoolName || 'School');
}

async function checkStudentPortalParams(){
  const params = new URLSearchParams(window.location.search);
  if(params.has('qrSession')){
    const sessionId = params.get('qrSession');
    let email = params.get('email');
    let gid = params.get('gid');

    setTimeout(() => {
      openStudentPublicPortal(sessionId, email, gid);
    }, 100);
    return true;
  }
  return false;
}

async function waitForFirebaseDb(maxWaitMs = 4500){
  const start = Date.now();
  while(!firebaseDb && (Date.now() - start) < maxWaitMs){
    await new Promise(r => setTimeout(r, 150));
  }
  return firebaseDb;
}

async function openStudentPublicPortal(sessionId, email, gid){
  try {
    if(document.getElementById('authScreen')) document.getElementById('authScreen').style.display = 'none';
    if(document.getElementById('topbar')) document.getElementById('topbar').style.display = 'none';
    if(document.getElementById('dashboardScreen')) document.getElementById('dashboardScreen').style.display = 'none';
    if(document.getElementById('workspaceScreen')) document.getElementById('workspaceScreen').style.display = 'none';

    const portalScreen = document.getElementById('studentPublicPortalScreen');
    if(portalScreen) portalScreen.style.display = 'flex';

    const instEl = document.getElementById('portalInstitutionName');
    const classEl = document.getElementById('portalClassDetails');
    const subjDateEl = document.getElementById('portalSubjectDate');
    const select = document.getElementById('portalStudentSelect');

    if(subjDateEl) subjDateEl.textContent = 'Fetching session from cloud...';
    if(select) select.innerHTML = '<option value="">Loading students...</option>';

    await waitForFirebaseDb();

    // 1. Fetch QR session metadata if email/gid not in URL
    if((!email || !gid) && firebaseDb){
      try {
        const qrDoc = await firebaseDb.collection('attendo_qr_sessions').doc(sessionId).get();
        if(qrDoc.exists && qrDoc.data()){
          const d = qrDoc.data();
          if(!email) email = d.email;
          if(!gid) gid = d.gid;
        }
      } catch(e) { console.error('Cloud QR metadata fetch error', e); }
    }

    if(!email || !gid){
      if(instEl) instEl.textContent = 'Invalid / Expired Link';
      if(subjDateEl) subjDateEl.textContent = 'Could not load class parameters. Please ask your teacher for a new QR / link.';
      if(select) select.innerHTML = '<option value="">Session not found</option>';
      return;
    }

    // 2. Fetch Teacher's Data from Cloud
    let raw = null;
    try {
      raw = await storageGet('data:' + email);
    } catch(e) {}

    if(!raw && firebaseDb){
      try {
        const docRef = firebaseDb.collection('attendo_storage').doc(sanitizeKey('data:' + email));
        const doc = await docRef.get();
        if(doc.exists && doc.data() && doc.data().value){
          raw = doc.data().value;
        }
      } catch(e) { console.error('Direct cloud storage fetch error', e); }
    }

    if(!raw){
      if(instEl) instEl.textContent = 'Session Expired';
      if(subjDateEl) subjDateEl.textContent = 'Teacher dataset not found. Please ask teacher to refresh attendance session.';
      if(select) select.innerHTML = '<option value="">Data not found</option>';
      return;
    }

    const userAppData = JSON.parse(raw);
    const targetGroup = (userAppData.groups || []).find(g => g.id === gid);

    if(!targetGroup){
      if(instEl) instEl.textContent = 'Class Not Found';
      if(subjDateEl) subjDateEl.textContent = 'The specified class no longer exists.';
      if(select) select.innerHTML = '<option value="">Class not found</option>';
      return;
    }

    publicPortalData = {
      sessionId,
      email,
      gid,
      userAppData,
      targetGroup
    };

    const instName = portalGroupInstitution(targetGroup);
    const classLbl = portalGroupLabel(targetGroup);
    const todayStr = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });

    if(instEl) instEl.textContent = instName;
    if(classEl) classEl.textContent = classLbl;
    if(subjDateEl) subjDateEl.textContent = `Subject: ${targetGroup.subject || 'Class'} • Date: ${todayStr}`;

    const sortedStudents = (targetGroup.students || []).slice().sort((a,b)=>a.rollNo.localeCompare(b.rollNo,undefined,{numeric:true}));

    if(!sortedStudents.length){
      if(select) select.innerHTML = '<option value="">No students in roster yet</option>';
      return;
    }

    select.innerHTML = '<option value="">-- Select Your Roll No / Name --</option>';
    sortedStudents.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.rollNo} — ${s.name}`;
      select.appendChild(opt);
    });

  } catch(err) {
    console.error('Fatal student portal error:', err);
    const subjDateEl = document.getElementById('portalSubjectDate');
    if(subjDateEl) subjDateEl.textContent = 'Error loading session. Please refresh page or scan again.';
  }
}

async function submitPublicStudentAttendance(){
  if(!publicPortalData) return;
  const select = document.getElementById('portalStudentSelect');
  const studentId = select.value;
  const statusEl = document.getElementById('portalStatusMessage');
  const btn = document.getElementById('portalSubmitBtn');

  if(!studentId){
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(248,113,113,0.15)';
    statusEl.style.color = 'var(--red)';
    statusEl.style.border = '1px solid rgba(248,113,113,0.3)';
    statusEl.textContent = 'Please select your Roll Number / Name first.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Submitting...';

  const g = publicPortalData.targetGroup;
  if(!g.sessions) g.sessions = [];

  let sess = g.sessions.find(s => s.id === publicPortalData.sessionId);
  if(!sess){
    sess = {
      id: publicPortalData.sessionId,
      date: new Date().toISOString().slice(0,10),
      subject: 'Class',
      records: {}
    };
    g.sessions.push(sess);
  }

  if(!sess.records) sess.records = {};
  sess.records[studentId] = true;

  await storageSet('data:' + publicPortalData.email, JSON.stringify(publicPortalData.userAppData));

  statusEl.style.display = 'block';
  statusEl.style.background = 'rgba(34,197,94,0.15)';
  statusEl.style.color = '#22c55e';
  statusEl.style.border = '1px solid rgba(34,197,94,0.3)';
  statusEl.innerHTML = '🎉 <b>Attendance Marked Successfully!</b><br>You are registered as Present.';

  btn.style.display = 'none';
}
