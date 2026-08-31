/* ============================================================
   STUDENT PUBLIC MOBILE PORTAL (ZERO-LOGIN ATTENDANCE ROUTER)
   UNIVERSAL CLOCK-SKEW PROOF CLASSROOM GEOFENCE & QR ENGINE
============================================================ */
let publicPortalData = null;
let prefetchedStudentCoords = null;
let prefetchedAt = 0;

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

function prefetchStudentLocation(){
  if(navigator.geolocation){
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          if(p && p.coords){
            prefetchedStudentCoords = p.coords;
            prefetchedAt = Date.now();
          }
        },
        () => {
          navigator.geolocation.getCurrentPosition(
            (p2) => {
              if(p2 && p2.coords){
                prefetchedStudentCoords = p2.coords;
                prefetchedAt = Date.now();
              }
            },
            () => {},
            { enableHighAccuracy: false, timeout: 4000, maximumAge: 120000 }
          );
        },
        { enableHighAccuracy: true, timeout: 4000, maximumAge: 30000 }
      );
    } catch(e){}
  }
}

async function checkStudentPortalParams(){
  const params = new URLSearchParams(window.location.search);
  if(params.has('qrSession')){
    const sessionId = params.get('qrSession');
    let email = params.get('email');
    let gid = params.get('gid');

    setTimeout(() => {
      openStudentPublicPortal(sessionId, email, gid);
    }, 5);
    return true;
  }
  return false;
}

async function waitForFirebaseDb(maxWaitMs = 2500){
  const start = Date.now();
  while(!firebaseDb && (Date.now() - start) < maxWaitMs){
    await new Promise(r => setTimeout(r, 50));
  }
  return firebaseDb;
}

async function renderStudentPortalUI(targetGroup, sessionId, email, gid, tlat, tlng, userAppData){
  publicPortalData = { sessionId, email, gid, tlat, tlng, userAppData, targetGroup };
  const instEl = document.getElementById('portalInstitutionName');
  const classEl = document.getElementById('portalClassDetails');
  const subjDateEl = document.getElementById('portalSubjectDate');
  const select = document.getElementById('portalStudentSelect');
  const statusEl = document.getElementById('portalStatusMsg') || document.getElementById('portalStatusMessage');
  const btn = document.getElementById('portalSubmitBtn');

  const instName = portalGroupInstitution(targetGroup);
  const classLbl = portalGroupLabel(targetGroup);
  const todayStr = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });

  if(instEl) instEl.textContent = instName;
  if(classEl) classEl.textContent = classLbl;
  if(subjDateEl) subjDateEl.textContent = `Subject: ${targetGroup.subject || 'Class'} • Date: ${todayStr}`;

  const sortedStudents = (targetGroup.students || []).slice().sort((a,b)=>a.rollNo.localeCompare(b.rollNo,undefined,{numeric:true}));
  if(select && sortedStudents.length){
    select.style.display = 'block';
    if(btn) btn.style.display = 'block';
    if(statusEl) statusEl.style.display = 'none';

    select.innerHTML = '<option value="">-- Select Your Roll No / Name --</option>';
    sortedStudents.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.rollNo} — ${s.name}`;
      select.appendChild(opt);
    });

    select.onchange = () => prefetchStudentLocation();
  }
}

async function openStudentPublicPortal(sessionId, email, gid){
  try {
    prefetchedStudentCoords = null;
    prefetchStudentLocation();

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
    const statusEl = document.getElementById('portalStatusMsg') || document.getElementById('portalStatusMessage');
    const btn = document.getElementById('portalSubmitBtn');

    const params = new URLSearchParams(window.location.search);
    if(!email) email = params.get('email');
    if(!gid) gid = params.get('gid');
    let tlat = parseFloat(params.get('tlat'));
    let tlng = parseFloat(params.get('tlng'));

    if(email) email = decodeURIComponent(email).trim().toLowerCase();

    // 1. Single Device Duplicate Submission Lock Check
    const alreadyMarked = localStorage.getItem('attendo_marked_' + sessionId);
    if(alreadyMarked){
      if(subjDateEl) subjDateEl.textContent = `Attendance Already Registered`;
      if(select) select.style.display = 'none';
      if(btn) btn.style.display = 'none';
      if(statusEl){
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(245,158,11,0.15)';
        statusEl.style.color = '#f59e0b';
        statusEl.style.border = '1px solid rgba(245,158,11,0.3)';
        statusEl.style.padding = '18px';
        statusEl.style.borderRadius = '12px';
        statusEl.style.textAlign = 'center';
        statusEl.innerHTML = `
          <div style="font-size:36px;margin-bottom:6px">⚠️</div>
          <h3 style="margin:0 0 6px 0;font-size:16px;color:#f59e0b">Already Registered!</h3>
          <p style="margin:0;font-size:13px;line-height:1.5">You have already registered your attendance for this session from this device.<br><span style="font-size:12px;color:var(--text-dim)">Duplicate submissions are restricted.</span></p>
        `;
      }
      return;
    }

    // 2. Fast Local Storage Roster Lookup
    let raw = null;
    try {
      raw = window.localStorage.getItem('attendo_fast_roster_' + email);
    } catch(e) {}

    let userAppData = null;
    let targetGroup = null;

    if(raw){
      try {
        userAppData = JSON.parse(raw);
        targetGroup = (userAppData.groups || []).find(g => g.id === gid) || (userAppData.groups && userAppData.groups.length ? userAppData.groups[0] : null);
      } catch(e){}
    }

    if(targetGroup){
      renderStudentPortalUI(targetGroup, sessionId, email, gid, tlat, tlng, userAppData);
    } else {
      if(subjDateEl) subjDateEl.textContent = 'Syncing session & student list...';
      if(select) select.innerHTML = '<option value="">Loading students...</option>';
    }

    // 3. Robust Cloud Roster & Session State Sync (Cross-Phone Fail-Proof)
    const db = await waitForFirebaseDb(2500);
    if(db && sessionId){
      try {
        // Fetch session metadata first
        const qrDoc = await db.collection('attendo_qr_sessions').doc(sessionId).get();
        if(qrDoc.exists && qrDoc.data()){
          const sessionData = qrDoc.data();
          if(!email && sessionData.email) email = sessionData.email.trim().toLowerCase();
          if(!gid && sessionData.gid) gid = sessionData.gid;
          if(isNaN(tlat) && sessionData.teacherLat) tlat = parseFloat(sessionData.teacherLat);
          if(isNaN(tlng) && sessionData.teacherLng) tlng = parseFloat(sessionData.teacherLng);

          // Check if session was manually closed by teacher
          if(sessionData.isClosed === true){
            if(instEl) instEl.textContent = 'Session Closed';
            if(subjDateEl) subjDateEl.textContent = '🚫 Attendance Session Closed by Teacher!';
            if(select) select.style.display = 'none';
            if(btn) btn.style.display = 'none';
            if(statusEl){
              statusEl.style.display = 'block';
              statusEl.style.background = 'rgba(239,68,68,0.15)';
              statusEl.style.color = '#ef4444';
              statusEl.style.border = '1px solid rgba(239,68,68,0.3)';
              statusEl.style.padding = '18px';
              statusEl.style.borderRadius = '12px';
              statusEl.style.textAlign = 'center';
              statusEl.innerHTML = `
                <div style="font-size:36px;margin-bottom:6px">🚫</div>
                <h3 style="margin:0 0 6px 0;font-size:16px;color:#ef4444">Attendance Session Closed</h3>
                <p style="margin:0;font-size:13px;line-height:1.5">Your teacher has finished this attendance session.<br><span style="font-size:12px;color:var(--text-dim)">New submissions are now closed.</span></p>
              `;
            }
            return;
          }
        }

        // Fetch target group roster from Cloud Firestore if not found locally
        if(!targetGroup && email){
          const docKey = typeof sanitizeKey === 'function' ? sanitizeKey('data:' + email) : ('data_' + email.replace(/[^a-zA-Z0-9_]/g, '_'));
          const docRef = db.collection('attendo_storage').doc(docKey);
          const doc = await docRef.get();
          if(doc.exists && doc.data() && doc.data().value){
            const cloudRaw = doc.data().value;
            try { window.localStorage.setItem('attendo_fast_roster_' + email, cloudRaw); } catch(e){}
            userAppData = JSON.parse(cloudRaw);
            targetGroup = (userAppData.groups || []).find(g => g.id === gid) || (userAppData.groups && userAppData.groups.length ? userAppData.groups[0] : null);
            if(targetGroup){
              renderStudentPortalUI(targetGroup, sessionId, email, gid, tlat, tlng, userAppData);
            }
          }
        } else if(targetGroup && publicPortalData){
          publicPortalData.tlat = tlat;
          publicPortalData.tlng = tlng;
        }
      } catch(e){
        console.error('Cloud sync error in student portal', e);
      }
    }

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
  const statusEl = document.getElementById('portalStatusMsg') || document.getElementById('portalStatusMessage');
  const btn = document.getElementById('portalSubmitBtn');

  if(!studentId){
    if(statusEl){
      statusEl.style.display = 'block';
      statusEl.style.background = 'rgba(248,113,113,0.15)';
      statusEl.style.color = 'var(--red)';
      statusEl.style.border = '1px solid rgba(248,113,113,0.3)';
      statusEl.style.padding = '14px';
      statusEl.style.borderRadius = '10px';
      statusEl.textContent = 'Please select your Roll Number / Name first.';
    }
    return;
  }

  // Instant Reset UI on Click
  if(statusEl) statusEl.style.display = 'none';
  if(btn){
    btn.disabled = true;
    btn.textContent = '📍 Verifying Attendance...';
  }

  // Fast Check If Session Was Closed by Teacher
  if(firebaseDb && publicPortalData.sessionId){
    try {
      const qrDoc = await firebaseDb.collection('attendo_qr_sessions').doc(publicPortalData.sessionId).get();
      if(qrDoc.exists && qrDoc.data()){
        const d = qrDoc.data();
        if(d.isClosed === true){
          if(select) select.style.display = 'none';
          if(btn) btn.style.display = 'none';
          if(statusEl){
            statusEl.style.display = 'block';
            statusEl.style.background = 'rgba(239,68,68,0.15)';
            statusEl.style.color = '#ef4444';
            statusEl.style.border = '1px solid rgba(239,68,68,0.3)';
            statusEl.style.padding = '18px';
            statusEl.style.borderRadius = '12px';
            statusEl.style.textAlign = 'center';
            statusEl.innerHTML = `
              <div style="font-size:36px;margin-bottom:6px">🚫</div>
              <h3 style="margin:0 0 6px 0;font-size:16px;color:#ef4444">Attendance Session Closed</h3>
              <p style="margin:0;font-size:13px;line-height:1.5">Your teacher has finished this attendance session.<br><span style="font-size:12px;color:var(--text-dim)">New submissions are closed.</span></p>
            `;
          }
          return;
        }
      }
    } catch(e){}
  }

  // Geofence Validation Setup
  const params = new URLSearchParams(window.location.search);
  let tlat = parseFloat(params.get('tlat') || (publicPortalData && publicPortalData.tlat));
  let tlng = parseFloat(params.get('tlng') || (publicPortalData && publicPortalData.tlng));
  let geoNote = '📍 Verified (Classroom QR Scanned)';

  // Cloud fallback for teacher location if missing in URL
  if((isNaN(tlat) || isNaN(tlng)) && firebaseDb && publicPortalData && publicPortalData.sessionId){
    try {
      const qdoc = await firebaseDb.collection('attendo_qr_sessions').doc(publicPortalData.sessionId).get();
      if(qdoc.exists && qdoc.data()){
        const qd = qdoc.data();
        if(qd.teacherLat) tlat = parseFloat(qd.teacherLat);
        if(qd.teacherLng) tlng = parseFloat(qd.teacherLng);
      }
    } catch(e){}
  }

  // Obtain Student Coords smoothly
  let sLat = null, sLng = null;

  if(prefetchedStudentCoords && (Date.now() - prefetchedAt) < 30000){
    sLat = prefetchedStudentCoords.latitude;
    sLng = prefetchedStudentCoords.longitude;
  } else {
    try {
      const pos = await new Promise((resolve) => {
        if(!navigator.geolocation) return resolve(null);
        let resolved = false;

        navigator.geolocation.getCurrentPosition(
          (p) => { if(!resolved){ resolved = true; resolve(p); } },
          () => {
            navigator.geolocation.getCurrentPosition(
              (p2) => { if(!resolved){ resolved = true; resolve(p2); } },
              () => { if(!resolved){ resolved = true; resolve(null); } },
              { enableHighAccuracy: false, timeout: 3500, maximumAge: 120000 }
            );
          },
          { enableHighAccuracy: true, timeout: 3000, maximumAge: 30000 }
        );

        setTimeout(() => {
          if(!resolved){
            resolved = true;
            navigator.geolocation.getCurrentPosition(
              (p3) => resolve(p3),
              () => resolve(null),
              { enableHighAccuracy: false, timeout: 2500, maximumAge: 300000 }
            );
          }
        }, 3500);
      });

      if(pos && pos.coords){
        sLat = pos.coords.latitude;
        sLng = pos.coords.longitude;
        prefetchedStudentCoords = pos.coords;
        prefetchedAt = Date.now();
      }
    } catch(e){}
  }

  // Mandatory Strict 10-Meter Geofence Engine (WiFi / Mobile SIM Network Proof)
  if(!isNaN(tlat) && !isNaN(tlng)){
    if(sLat === null || sLng === null){
      if(btn){
        btn.disabled = false;
        btn.textContent = '✅ Mark Me Present';
      }
      if(statusEl){
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(248,113,113,0.15)';
        statusEl.style.color = '#ef4444';
        statusEl.style.border = '1px solid rgba(248,113,113,0.3)';
        statusEl.style.padding = '16px';
        statusEl.style.borderRadius = '12px';
        statusEl.style.textAlign = 'center';
        statusEl.innerHTML = `
          <div style="font-size:36px;margin-bottom:6px">📍</div>
          <h3 style="margin:0 0 6px 0;font-size:16px;color:#ef4444">GPS Location Access Required!</h3>
          <p style="margin:0;font-size:13px;line-height:1.5">Strict 10-meter geofenced attendance requires high-accuracy GPS location on your phone.<br><span style="font-size:12px;color:var(--text-dim)">Please turn on Location/GPS on your device, allow browser permission, and tap Mark Me Present again.</span></p>
        `;
      }
      return;
    }

    const distMeters = calculateHaversineDistanceMeters(tlat, tlng, sLat, sLng);
    if(distMeters > 10){
      prefetchedStudentCoords = null; // Clear cache on far away detection
      if(btn){
        btn.disabled = false;
        btn.textContent = '✅ Mark Me Present';
      }
      if(statusEl){
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(248,113,113,0.15)';
        statusEl.style.color = '#ef4444';
        statusEl.style.border = '1px solid rgba(248,113,113,0.3)';
        statusEl.style.padding = '16px';
        statusEl.style.borderRadius = '12px';
        statusEl.style.textAlign = 'center';
        statusEl.innerHTML = `
          <div style="font-size:36px;margin-bottom:6px">🚫</div>
          <h3 style="margin:0 0 6px 0;font-size:16px;color:#ef4444">Sorry, You are Far Away!</h3>
          <p style="margin:0;font-size:13px;line-height:1.5">You are currently <b>${distMeters} meters</b> away from the teacher.<br><span style="font-size:12px;color:var(--text-dim)">Strict 10-meter geofenced attendance requires you to be near the teacher. Please move closer and tap Mark Me Present again.</span></p>
        `;
      }
      return;
    } else {
      geoNote = `📍 Verified (Within 10m Classroom Radius • ${distMeters}m)`;
    }
  }

  if(btn){
    btn.disabled = true;
    btn.textContent = 'Submitting...';
  }

  try {
    const g = publicPortalData.targetGroup;
    if(g){
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
    }

    // Get student info for confirmation card
    const student = (g && g.students || []).find(s => s.id === studentId);
    const sName = student ? student.name : 'Student';
    const sRoll = student ? student.rollNo : '';
    const instName = portalGroupInstitution(g);
    const classLbl = portalGroupLabel(g);

    // Save device lock token to prevent duplicate submissions from same phone
    try {
      localStorage.setItem('attendo_marked_' + publicPortalData.sessionId, studentId);
    } catch(e){}

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
          <div><b>Geofence Verification:</b> <span style="color:var(--cyan);font-weight:600">${geoNote}</span></div>
        </div>
      `;
    }

    // 1. Direct Public Write to attendo_qr_sessions for instant live headcount increment on teacher screen
    if(firebaseDb && publicPortalData.sessionId){
      firebaseDb.collection('attendo_qr_sessions').doc(publicPortalData.sessionId).set({
        records: { [studentId]: true },
        lastStudentMarked: sName,
        lastMarkedAt: Date.now()
      }, { merge: true }).catch(e=>{});
    }

    // 2. Non-blocking background save to storageSet
    try {
      if(publicPortalData.email && publicPortalData.userAppData){
        storageSet('data:' + publicPortalData.email, JSON.stringify(publicPortalData.userAppData)).catch(e=>{});
      }
    } catch(e){}

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
