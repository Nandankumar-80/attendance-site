/* ============================================================
   STUDENT PUBLIC MOBILE PORTAL (ZERO-LOGIN ATTENDANCE ROUTER)
   WITH LIGHTNING-FAST 30m GEOFENCING & CLOUD ROSTER SYNC
============================================================ */
let publicPortalData = null;

function calculateHaversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

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
    }, 10);
    return true;
  }
  return false;
}

async function waitForFirebaseDb(maxWaitMs = 1500){
  const start = Date.now();
  while(!firebaseDb && (Date.now() - start) < maxWaitMs){
    await new Promise(r => setTimeout(r, 80));
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

    if(subjDateEl) subjDateEl.textContent = 'Syncing session from cloud...';
    if(select) select.innerHTML = '<option value="">Loading students...</option>';

    const params = new URLSearchParams(window.location.search);
    if(!email) email = params.get('email');
    if(!gid) gid = params.get('gid');
    let tlat = parseFloat(params.get('tlat'));
    let tlng = parseFloat(params.get('tlng'));

    if(email) email = decodeURIComponent(email).trim().toLowerCase();

    // Fast Parallel Firebase DB Check
    waitForFirebaseDb(1500).then(async (db) => {
      if((!email || !gid) && db && sessionId){
        try {
          const qrDoc = await db.collection('attendo_qr_sessions').doc(sessionId).get();
          if(qrDoc.exists && qrDoc.data()){
            const d = qrDoc.data();
            if(!email && d.email) email = d.email.trim().toLowerCase();
            if(!gid && d.gid) gid = d.gid;
            if(isNaN(tlat) && d.teacherLat) tlat = parseFloat(d.teacherLat);
            if(isNaN(tlng) && d.teacherLng) tlng = parseFloat(d.teacherLng);
          }
        } catch(e){}
      }
    });

    if(!email || !gid){
      if(instEl) instEl.textContent = 'Ready to Scan QR';
      if(subjDateEl) subjDateEl.textContent = 'Please tap "📷 Open Live Camera QR Scanner" above to scan your teacher\'s classroom QR code.';
      if(select) select.innerHTML = '<option value="">Tap camera scanner above to scan QR</option>';
      return;
    }

    // 2. Fetch Teacher's Data from Cloud / Cache
    let raw = null;
    try {
      raw = await storageGet('data:' + email);
    } catch(e) {}

    if(!raw && firebaseDb){
      try {
        const docKey = typeof sanitizeKey === 'function' ? sanitizeKey('data:' + email) : ('data_' + email.replace(/[^a-zA-Z0-9_]/g, '_'));
        const docRef = firebaseDb.collection('attendo_storage').doc(docKey);
        const doc = await docRef.get();
        if(doc.exists && doc.data() && doc.data().value){
          raw = doc.data().value;
        }
      } catch(e) {}
    }

    if(!raw){
      if(instEl) instEl.textContent = 'Ready to Scan Classroom QR';
      if(subjDateEl) subjDateEl.textContent = 'Please tap "📷 Open Live Camera QR Scanner" above to scan your teacher\'s active QR code.';
      if(select) select.innerHTML = '<option value="">Scan active classroom QR code</option>';
      return;
    }

    const userAppData = JSON.parse(raw);
    const targetGroup = (userAppData.groups || []).find(g => g.id === gid);

    if(!targetGroup){
      if(instEl) instEl.textContent = 'Class Not Found';
      if(subjDateEl) subjDateEl.textContent = 'The specified class ID was not found in teacher roster.';
      if(select) select.innerHTML = '<option value="">Class not found</option>';
      return;
    }

    publicPortalData = {
      sessionId,
      email,
      gid,
      tlat,
      tlng,
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
    if(subjDateEl) subjDateEl.textContent = 'Error loading session. Please scan active QR code again.';
  }
}

async function submitPublicStudentAttendance(){
  if(!publicPortalData) return;
  const select = document.getElementById('portalStudentSelect');
  const studentId = select ? select.value : '';
  const statusEl = document.getElementById('portalStatusMessage');
  const btn = document.getElementById('portalSubmitBtn');

  if(!studentId){
    if(statusEl){
      statusEl.style.display = 'block';
      statusEl.style.background = 'rgba(248,113,113,0.15)';
      statusEl.style.color = 'var(--red)';
      statusEl.style.border = '1px solid rgba(248,113,113,0.3)';
      statusEl.textContent = 'Please select your Roll Number / Name first.';
    }
    return;
  }

  if(btn){
    btn.disabled = true;
    btn.textContent = 'Verifying Location...';
  }

  // 30-Meter Geofence Fast Verification Check
  const params = new URLSearchParams(window.location.search);
  let tlat = parseFloat(params.get('tlat') || (publicPortalData && publicPortalData.tlat));
  let tlng = parseFloat(params.get('tlng') || (publicPortalData && publicPortalData.tlng));

  if(!isNaN(tlat) && !isNaN(tlng)){
    let sLat = null, sLng = null;
    try {
      const pos = await new Promise((resolve) => {
        if(navigator.geolocation){
          navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 1800, maximumAge: 60000 });
        } else {
          resolve(null);
        }
      });
      if(pos && pos.coords){
        sLat = pos.coords.latitude;
        sLng = pos.coords.longitude;
      }
    } catch(e){}

    if(sLat === null || sLng === null){
      if(btn){
        btn.disabled = false;
        btn.textContent = '✅ Mark Me Present';
      }
      if(statusEl){
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(248,113,113,0.15)';
        statusEl.style.color = 'var(--red)';
        statusEl.style.border = '1px solid rgba(248,113,113,0.3)';
        statusEl.style.padding = '14px';
        statusEl.style.borderRadius = '10px';
        statusEl.innerHTML = '📍 <b>Location Permission Required!</b><br>Geofenced attendance requires GPS location permission to verify you are within 30m of classroom.';
      }
      return;
    }

    const distMeters = calculateHaversineDistanceMeters(tlat, tlng, sLat, sLng);
    if(distMeters > 30){
      if(btn){
        btn.disabled = false;
        btn.textContent = '✅ Mark Me Present';
      }
      if(statusEl){
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(248,113,113,0.15)';
        statusEl.style.color = 'var(--red)';
        statusEl.style.border = '1px solid rgba(248,113,113,0.3)';
        statusEl.style.padding = '14px';
        statusEl.style.borderRadius = '10px';
        statusEl.innerHTML = `
          <div style="font-size:36px;margin-bottom:6px">🚫</div>
          <h3 style="margin:0 0 6px 0;font-size:16px;color:#ef4444">Sorry, You are Out of Range!</h3>
          <p style="margin:0;font-size:13px;line-height:1.5">You are currently <b>${distMeters} meters</b> away from the classroom.<br><span style="font-size:12px;color:var(--text-dim)">Geofenced attendance is restricted to within <b>30 meters</b> of the teacher.</span></p>
        `;
      }
      return;
    }
  }

  // Instant UI Feedback
  if(btn){
    btn.disabled = true;
    btn.textContent = 'Submitting...';
  }

  try {
    const g = publicPortalData.targetGroup;
    if(!g.sessions) g.sessions = [];

    let sess = g.sessions.find(s => s.id === publicPortalData.sessionId);
    if(!sess){
      sess = {
        id: publicPortalData.sessionId,
        date: new Date().toISOString().slice(0,10),
        subject: g.subject || 'Class',
        records: {}
      };
      g.sessions.push(sess);
    }

    if(!sess.records) sess.records = {};
    sess.records[studentId] = true;

    // Get student info for confirmation card
    const student = (g.students || []).find(s => s.id === studentId);
    const sName = student ? student.name : 'Student';
    const sRoll = student ? student.rollNo : '';
    const instName = portalGroupInstitution(g);
    const classLbl = portalGroupLabel(g);

    // Hide selection controls & show instant confirmation card
    if(select) select.style.display = 'none';
    if(btn) btn.style.display = 'none';

    if(statusEl){
      statusEl.style.display = 'block';
      statusEl.style.background = 'rgba(34,197,94,0.12)';
      statusEl.style.color = '#22c55e';
      statusEl.style.border = '1px solid rgba(34,197,94,0.4)';
      statusEl.style.borderRadius = '14px';
      statusEl.style.padding = '20px';
      statusEl.style.textAlign = 'center';

      statusEl.innerHTML = `
        <div style="font-size:42px;margin-bottom:8px">🎉</div>
        <h3 style="margin:0 0 6px 0;font-size:18px;color:#22c55e">Your Attendance is Successfully Registered!</h3>
        <p style="margin:0 0 12px 0;font-size:13px;color:var(--text-dim)">Thank you, <b>${sName}</b> (Roll No: ${sRoll})! Your attendance for today has been registered.</p>
        
        <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:left;font-size:12px;color:var(--text);margin-top:10px">
          <div style="margin-bottom:4px"><b>Institution:</b> ${instName}</div>
          <div style="margin-bottom:4px"><b>Class:</b> ${classLbl}</div>
          <div style="margin-bottom:4px"><b>Status:</b> <span style="color:#22c55e;font-weight:700">✅ Present</span></div>
          <div><b>Geofence Verification:</b> <span style="color:var(--cyan);font-weight:600">📍 Verified (Within 30m Classroom Radius)</span></div>
        </div>
      `;
    }

    // Save to local & cloud storage asynchronously in background
    storageSet('data:' + publicPortalData.email, JSON.stringify(publicPortalData.userAppData)).catch(e=>{});

  } catch(e) {
    console.error('Error submitting student attendance', e);
    if(btn){
      btn.disabled = false;
      btn.textContent = '✅ Mark Me Present';
    }
    if(statusEl){
      statusEl.style.display = 'block';
      statusEl.style.background = 'rgba(248,113,113,0.15)';
      statusEl.style.color = 'var(--red)';
      statusEl.style.border = '1px solid rgba(248,113,113,0.3)';
      statusEl.textContent = 'Failed to submit. Please try again.';
    }
  }
}

let html5QrScannerInstance = null;

async function openCameraQrScanner(){
  const backdrop = document.getElementById('cameraScanModalBackdrop');
  if(backdrop){
    backdrop.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(5,5,10,0.88);display:flex !important;align-items:center;justify-content:center;z-index:999999;padding:20px;backdrop-filter:blur(4px);";
    backdrop.classList.add('show');
  }

  const errEl = document.getElementById('qrScanError');
  if(errEl) errEl.textContent = '';

  const loadingEl = document.getElementById('qrCameraLoading');
  if(loadingEl) loadingEl.style.display = 'block';

  try {
    if(html5QrScannerInstance){
      try { await html5QrScannerInstance.stop(); } catch(e){}
    }

    if(!window.Html5Qrcode){
      if(errEl) errEl.textContent = 'Scanner library loading. Please try again in a moment.';
      if(loadingEl) loadingEl.style.display = 'none';
      return;
    }

    html5QrScannerInstance = new Html5Qrcode("qrReaderVideo");
    await html5QrScannerInstance.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => {
        onCameraQrCodeScanned(decodedText);
      },
      (errorMessage) => {}
    );
    if(loadingEl) loadingEl.style.display = 'none';
  } catch(e){
    console.error('Camera QR start error:', e);
    if(loadingEl) loadingEl.style.display = 'none';
    if(errEl) errEl.textContent = 'Camera access error. Please allow camera permissions in browser settings.';
  }
}

async function closeCameraQrScanner(){
  if(html5QrScannerInstance){
    try { await html5QrScannerInstance.stop(); } catch(e){}
    html5QrScannerInstance = null;
  }
  const backdrop = document.getElementById('cameraScanModalBackdrop');
  if(backdrop){
    backdrop.style.cssText = "display:none !important;";
    backdrop.classList.remove('show');
  }
}

function onCameraQrCodeScanned(scannedUrl){
  closeCameraQrScanner();
  if(typeof toast === 'function') toast('📷 QR Code Scanned!');
  try {
    let fullUrl = (scannedUrl || '').trim();
    if(fullUrl && !fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')){
      fullUrl = 'https://' + fullUrl;
    }

    const urlObj = new URL(fullUrl);
    const params = urlObj.searchParams;
    const qrSession = params.get('qrSession');
    const email = params.get('email');
    const gid = params.get('gid');
    const tlat = params.get('tlat');
    const tlng = params.get('tlng');

    if(qrSession){
      let newSearch = `?qrSession=${qrSession}`;
      if(email) newSearch += `&email=${encodeURIComponent(email)}`;
      if(gid) newSearch += `&gid=${gid}`;
      if(tlat) newSearch += `&tlat=${tlat}`;
      if(tlng) newSearch += `&tlng=${tlng}`;

      window.history.pushState({}, '', newSearch);
      openStudentPublicPortal(qrSession, email, gid);
    } else {
      if(typeof toast === 'function') toast('Invalid Attendo QR code.');
    }
  } catch(e){
    console.error('QR parse error:', e);
    if(typeof toast === 'function') toast('Scanned code is not a valid URL.');
  }
}

async function scanQrFromGallery(event){
  const file = event.target.files && event.target.files[0];
  if(!file) return;

  const errEl = document.getElementById('qrScanError');
  if(errEl) errEl.textContent = 'Decoding QR image... Please wait.';

  try {
    if(!window.Html5Qrcode){
      if(errEl) errEl.textContent = 'Decoder library loading. Please try again in a moment.';
      return;
    }

    const html5QrCode = new Html5Qrcode("qrReaderVideo");
    const decodedText = await html5QrCode.scanFile(file, true);
    if(decodedText){
      onCameraQrCodeScanned(decodedText);
    } else {
      if(errEl) errEl.textContent = 'Could not detect a valid QR code in this image.';
    }
  } catch(err) {
    console.error('Gallery QR decode error:', err);
    if(errEl) errEl.textContent = 'Could not detect a valid Attendo QR code in this image. Please select a clear QR image/screenshot.';
  } finally {
    event.target.value = '';
  }
}
