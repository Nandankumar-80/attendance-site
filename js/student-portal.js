/* ============================================================
   STUDENT PUBLIC MOBILE PORTAL (ZERO-LOGIN ATTENDANCE ROUTER)
============================================================ */
let publicPortalData = null;

async function checkStudentPortalParams(){
  const params = new URLSearchParams(window.location.search);
  if(params.has('qrSession')){
    const sessionId = params.get('qrSession');
    let email = params.get('email');
    let gid = params.get('gid');

    await openStudentPublicPortal(sessionId, email, gid);
    return true;
  }
  return false;
}

async function openStudentPublicPortal(sessionId, email, gid){
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('topbar').style.display = 'none';
  document.getElementById('dashboardScreen').style.display = 'none';
  document.getElementById('workspaceScreen').style.display = 'none';

  const portalScreen = document.getElementById('studentPublicPortalScreen');
  if(portalScreen) portalScreen.style.display = 'flex';

  document.getElementById('portalSubjectDate').textContent = 'Fetching session...';
  const select = document.getElementById('portalStudentSelect');
  select.innerHTML = '<option value="">Loading students...</option>';

  if((!email || !gid) && firebaseDb){
    try {
      const qrDoc = await firebaseDb.collection('attendo_qr_sessions').doc(sessionId).get();
      if(qrDoc.exists && qrDoc.data()){
        const d = qrDoc.data();
        email = d.email;
        gid = d.gid;
      }
    } catch(e) {}
  }

  if(!email || !gid){
    document.getElementById('portalInstitutionName').textContent = 'Invalid Link';
    document.getElementById('portalSubjectDate').textContent = 'Could not load class session parameters.';
    return;
  }

  const raw = await storageGet('data:' + email);
  if(!raw){
    document.getElementById('portalInstitutionName').textContent = 'Session Expired';
    document.getElementById('portalSubjectDate').textContent = 'Teacher data not found.';
    return;
  }

  const userAppData = JSON.parse(raw);
  const targetGroup = (userAppData.groups || []).find(g => g.id === gid);

  if(!targetGroup){
    document.getElementById('portalInstitutionName').textContent = 'Class Not Found';
    document.getElementById('portalSubjectDate').textContent = 'The specified class no longer exists.';
    return;
  }

  publicPortalData = {
    sessionId,
    email,
    gid,
    userAppData,
    targetGroup
  };

  document.getElementById('portalInstitutionName').textContent = groupInstitution(targetGroup);
  document.getElementById('portalClassDetails').textContent = groupLabel(targetGroup);
  document.getElementById('portalSubjectDate').textContent = `Subject: ${targetGroup.subject || 'Class'} • Date: ${new Date().toLocaleDateString('en-IN')}`;

  select.innerHTML = '<option value="">-- Select Your Roll No / Name --</option>';
  const sortedStudents = (targetGroup.students || []).slice().sort((a,b)=>a.rollNo.localeCompare(b.rollNo,undefined,{numeric:true}));
  sortedStudents.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.rollNo} — ${s.name}`;
    select.appendChild(opt);
  });
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
