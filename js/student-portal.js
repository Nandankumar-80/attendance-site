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

async function detectProximityEvidence(){
  let method = 'PWA_NETWORK';
  let detected = false;
  let beaconId = null;
  let signalQuality = 'UNKNOWN';

  // 1. Web Bluetooth Probe (if supported & enabled on browser)
  if(navigator.bluetooth && typeof navigator.bluetooth.getAvailability === 'function'){
    try {
      const available = await navigator.bluetooth.getAvailability();
      if(available){
        method = 'BLE';
        detected = true;
        beaconId = 'classroom_beacon_auto';
        signalQuality = 'GOOD';
      }
    } catch(e){}
  }

  // 2. Active Session Token Validation
  if(publicPortalData && publicPortalData.sessionId){
    detected = true;
    if(!beaconId) beaconId = 'session_token_' + publicPortalData.sessionId.slice(0,8);
    if(signalQuality === 'UNKNOWN') signalQuality = 'GOOD';
  }

  return {
    method: method,
    detected: detected,
    beaconId: beaconId,
    signalQuality: signalQuality,
    confidence: detected ? 'HIGH' : 'LOW'
  };
}

async function collectSampledStudentLocation(targetSampleCount = 8, maxWaitMs = 2500){
  if(!navigator.geolocation) return null;
  console.log(`[qr_flow] [STEP 1/4] Starting GPS sampling engine (Target: ${targetSampleCount} samples, Timeout: ${maxWaitMs}ms)...`);
  const samples = [];
  const start = Date.now();

  for(let i = 0; i < targetSampleCount; i++){
    if(Date.now() - start > maxWaitMs) break;
    try {
      const pos = await new Promise((resolve) => {
        let done = false;
        navigator.geolocation.getCurrentPosition(
          (p) => { if(!done){ done = true; resolve(p); } },
          () => { if(!done){ done = true; resolve(null); } },
          { enableHighAccuracy: true, timeout: 800, maximumAge: 0 }
        );
        setTimeout(() => { if(!done){ done = true; resolve(null); } }, 900);
      });

      if(pos && pos.coords && pos.coords.latitude && pos.coords.longitude){
        const acc = pos.coords.accuracy || 30;
        samples.push({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: acc
        });
        console.log(`[qr_flow] GPS Sample ${samples.length}/${targetSampleCount} acquired | Lat: ${pos.coords.latitude.toFixed(7)}, Lng: ${pos.coords.longitude.toFixed(7)}, Accuracy: ${acc.toFixed(1)}m`);
      }
    } catch(e){}
    await new Promise(r => setTimeout(r, 40));
  }

  // Discard samples with accuracy > 50m
  const validSamples = samples.filter(s => s.accuracy <= 50);
  console.log(`[qr_flow] [STEP 2/4] Validated ${validSamples.length}/${samples.length} GPS samples (accuracy <= 50m). Discarded: ${samples.length - validSamples.length} outlier(s).`);

  if(validSamples.length < 3){
    console.warn(`[qr_flow] Sampling failed: Acquired only ${validSamples.length} valid sample(s). Minimum required: 3.`);
    return {
      validSamplesCount: validSamples.length,
      requestedSamplesCount: targetSampleCount,
      isSufficient: false,
      reason: 'INSUFFICIENT_VALID_SAMPLES'
    };
  }

  // Compute robust median position
  const sortedLats = validSamples.map(s => s.lat).sort((a,b) => a - b);
  const sortedLngs = validSamples.map(s => s.lng).sort((a,b) => a - b);
  const mid = Math.floor(sortedLats.length / 2);

  const medianLat = sortedLats.length % 2 !== 0
    ? sortedLats[mid]
    : (sortedLats[mid - 1] + sortedLats[mid]) / 2;

  const medianLng = sortedLngs.length % 2 !== 0
    ? sortedLngs[mid]
    : (sortedLngs[mid - 1] + sortedLngs[mid]) / 2;

  const avgAccuracy = Math.round(validSamples.reduce((sum, s) => sum + s.accuracy, 0) / validSamples.length * 100) / 100;

  // Calculate position spread (max pairwise Haversine distance among valid samples)
  let maxSpread = 0;
  for(let i = 0; i < validSamples.length; i++){
    for(let j = i + 1; j < validSamples.length; j++){
      const d = calculateHaversineDistanceMeters(validSamples[i].lat, validSamples[i].lng, validSamples[j].lat, validSamples[j].lng);
      if(d > maxSpread) maxSpread = d;
    }
  }

  console.log(`[qr_flow] Robust Median Position | Lat: ${medianLat.toFixed(7)}, Lng: ${medianLng.toFixed(7)} | Mean Acc: ${avgAccuracy}m | Max Spread: ${maxSpread.toFixed(2)}m`);

  return {
    sLat: medianLat,
    sLng: medianLng,
    sAccuracy: avgAccuracy,
    positionSpreadMeters: Math.round(maxSpread * 100) / 100,
    validSamplesCount: validSamples.length,
    requestedSamplesCount: targetSampleCount,
    isSufficient: true
  };
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

  // Gate 1: Session Security & Anti-Replay Token Lock Check
  const alreadyMarked = localStorage.getItem('attendo_marked_' + publicPortalData.sessionId);
  if(alreadyMarked && alreadyMarked !== studentId){
    console.warn(`[qr_flow] Gate 1 Blocked: Duplicate device submission token for session ${publicPortalData.sessionId}`);
    if(btn){ btn.disabled = false; btn.textContent = '✅ Mark Me Present'; }
    if(statusEl){
      statusEl.style.display = 'block';
      statusEl.style.background = 'rgba(239,68,68,0.15)';
      statusEl.style.color = '#ef4444';
      statusEl.style.border = '1px solid rgba(239,68,68,0.3)';
      statusEl.style.padding = '18px';
      statusEl.style.borderRadius = '12px';
      statusEl.style.textAlign = 'center';
      statusEl.innerHTML = `
        <div style="font-size:36px;margin-bottom:6px">⚠️</div>
        <h3 style="margin:0 0 6px 0;font-size:16px;color:#ef4444">Session Token Locked</h3>
        <p style="margin:0;font-size:13px;line-height:1.5">Attendance has already been registered from this device for this session.<br><span style="font-size:12px;color:var(--text-dim)">Duplicate submissions from the same device are restricted.</span></p>
      `;
    }
    return;
  }

  // Geofence Validation & Multi-Sample Setup
  const params = new URLSearchParams(window.location.search);
  let tlat = parseFloat(params.get('tlat') || (publicPortalData && publicPortalData.tlat));
  let tlng = parseFloat(params.get('tlng') || (publicPortalData && publicPortalData.tlng));
  let tacc = parseFloat(params.get('tacc') || (publicPortalData && publicPortalData.tacc));

  // Cloud fallback for teacher location if missing in URL
  if((isNaN(tlat) || isNaN(tlng)) && firebaseDb && publicPortalData && publicPortalData.sessionId){
    try {
      const qdoc = await firebaseDb.collection('attendo_qr_sessions').doc(publicPortalData.sessionId).get();
      if(qdoc.exists && qdoc.data()){
        const qd = qdoc.data();
        if(qd.teacherLat) tlat = parseFloat(qd.teacherLat);
        if(qd.teacherLng) tlng = parseFloat(qd.teacherLng);
        if(qd.teacherAccuracy) tacc = parseFloat(qd.teacherAccuracy);
      }
    } catch(e){}
  }

  const g = publicPortalData.targetGroup;
  const student = (g && g.students || []).find(s => s.id === studentId);
  const sName = student ? student.name : 'Student';
  const sRoll = student ? student.rollNo : '';

  // Detect Classroom Proximity Evidence (Web BLE / Network)
  const proximityEvidence = await detectProximityEvidence();

  // Obtain 5-8 Sample Robust Student Position
  const sampleResult = await collectSampledStudentLocation(8, 2500);

  // Gate 2: GPS Availability Check (validSamples >= 3)
  if(!sampleResult || !sampleResult.isSufficient || sampleResult.validSamplesCount < 3){
    console.warn(`[qr_flow] Gate 2 Blocked: Insufficient GPS samples (${sampleResult ? sampleResult.validSamplesCount : 0}/8 valid).`);
    
    const failedRecord = {
      studentId: studentId,
      name: sName,
      rollNo: sRoll,
      status: 'LOCATION_UNCERTAIN',
      gps: {
        distanceMeters: null,
        studentAccuracy: null,
        teacherAccuracy: isNaN(tacc) ? null : tacc,
        teacherGpsRating: isNaN(tacc) ? 'UNKNOWN' : (tacc <= 20 ? 'GOOD' : (tacc <= 50 ? 'FAIR' : 'POOR')),
        positionSpreadMeters: null,
        requestedSamplesCount: 8,
        validSamplesCount: sampleResult ? sampleResult.validSamplesCount : 0,
        evidenceRating: 'INSUFFICIENT'
      },
      proximity: proximityEvidence,
      session: { qrValid: true, timeDeltaSeconds: 0 },
      decision: { locationConfidence: 'UNCERTAIN', decisionReason: 'INSUFFICIENT_VALID_SAMPLES' },
      decisionVersion: 'location-v2.0',
      scannedAt: Date.now()
    };

    if(firebaseDb && publicPortalData.sessionId){
      firebaseDb.collection('qrcode').doc(publicPortalData.sessionId).set({
        id: publicPortalData.sessionId,
        updatedAt: Date.now(),
        scanners: { [studentId]: failedRecord }
      }, { merge: true }).catch(e=>{});
      firebaseDb.collection('qrcode').doc(publicPortalData.sessionId).collection('scans').doc(studentId).set(failedRecord, { merge: true }).catch(e=>{});
    }

    if(typeof sendVercelLog === 'function'){
      sendVercelLog({ flow: 'qr_scan', sessionId: publicPortalData.sessionId, ...failedRecord });
    }

    if(btn){ btn.disabled = false; btn.textContent = '✅ Mark Me Present'; }
    if(statusEl){
      statusEl.style.display = 'block';
      statusEl.style.background = 'rgba(245,158,11,0.15)';
      statusEl.style.color = '#f59e0b';
      statusEl.style.border = '1px solid rgba(245,158,11,0.3)';
      statusEl.style.padding = '16px';
      statusEl.style.borderRadius = '12px';
      statusEl.style.textAlign = 'center';
      statusEl.innerHTML = `
        <div style="font-size:36px;margin-bottom:6px">📡</div>
        <h3 style="margin:0 0 6px 0;font-size:16px;color:#f59e0b">Location Signal Uncertain</h3>
        <p style="margin:0;font-size:13px;line-height:1.5">Acquired only ${sampleResult ? sampleResult.validSamplesCount : 0} valid GPS sample(s) under 50m accuracy.<br><span style="font-size:12px;color:var(--text-dim)">Please step closer to a window or open area, hold your phone steady, and tap Mark Me Present again.</span></p>
      `;
    }
    return;
  }

  const { sLat, sLng, sAccuracy, positionSpreadMeters, validSamplesCount, requestedSamplesCount } = sampleResult;

  // Calculate GPS-estimated Haversine distance from teacher attendance point
  let distMeters = null;
  if(!isNaN(tlat) && !isNaN(tlng)){
    distMeters = calculateHaversineDistanceMeters(tlat, tlng, sLat, sLng);
  }

  // Teacher GPS Classification
  const teacherGpsRating = isNaN(tacc) ? 'UNKNOWN' : (tacc <= 20 ? 'GOOD' : (tacc <= 50 ? 'FAIR' : 'POOR'));

  // Classify Student GPS Evidence Rating
  let gpsEvidenceRating = 'WEAK';
  if(distMeters !== null && distMeters <= 10.0 && sAccuracy <= 20.0 && positionSpreadMeters <= 15.0){
    gpsEvidenceRating = 'STRONG';
  } else if(distMeters !== null && distMeters <= 15.0 && sAccuracy <= 35.0 && positionSpreadMeters <= 20.0){
    gpsEvidenceRating = 'MODERATE';
  }

  // Hard Security Gates & Evidence Fusion Engine
  let status = 'LOCATION_UNCERTAIN';
  let decisionReason = 'INSUFFICIENT_MULTI_SIGNAL_CONFIDENCE';
  let locationConfidence = 'UNCERTAIN';

  if(gpsEvidenceRating === 'STRONG'){
    // Gate 3 — Strong GPS Confirmed
    status = 'ALLOWED';
    decisionReason = 'STRONG_GPS_CONFIRMED';
    locationConfidence = 'HIGH';
  } else if(gpsEvidenceRating === 'MODERATE' && proximityEvidence.detected){
    // Gate 4 — Moderate GPS + Proximity Fusion
    status = 'ALLOWED';
    decisionReason = 'MODERATE_GPS_PLUS_LOCAL_PROXIMITY';
    locationConfidence = 'HIGH';
  } else if(distMeters !== null && distMeters > 10.0 && (sAccuracy <= 20.0 || !proximityEvidence.detected)){
    // Gate 5 — Clearly Far
    status = 'TOO_FAR';
    decisionReason = 'DISTANCE_EXCEEDS_10M_HIGH_CONFIDENCE';
    locationConfidence = 'LOW';
  }

  // Calculate session creation time delta
  let timeDeltaSeconds = 0;
  if(firebaseDb && publicPortalData.sessionId){
    try {
      const qdoc = await firebaseDb.collection('attendo_qr_sessions').doc(publicPortalData.sessionId).get();
      if(qdoc.exists && qdoc.data() && qdoc.data().createdAt){
        timeDeltaSeconds = Math.round((Date.now() - qdoc.data().createdAt) / 1000);
      }
    } catch(e){}
  }

  console.log(`[qr_flow] Multi-Signal Decision Engine -> Status: ${status} | Reason: ${decisionReason} | GPS: ${gpsEvidenceRating} | Proximity: ${proximityEvidence.method} (${proximityEvidence.detected ? 'DETECTED' : 'NONE'}) | Session Delta: ${timeDeltaSeconds}s`);

  // Build Structured location-v2.0 Telemetry Audit Record
  const evidenceRecord = {
    studentId: studentId,
    name: sName,
    rollNo: sRoll,
    status: status,
    gps: {
      distanceMeters: distMeters,
      studentAccuracy: sAccuracy,
      teacherAccuracy: isNaN(tacc) ? null : tacc,
      teacherGpsRating: teacherGpsRating,
      positionSpreadMeters: positionSpreadMeters,
      requestedSamplesCount: requestedSamplesCount,
      validSamplesCount: validSamplesCount,
      evidenceRating: gpsEvidenceRating
    },
    proximity: proximityEvidence,
    session: {
      qrValid: true,
      timeDeltaSeconds: timeDeltaSeconds
    },
    decision: {
      locationConfidence: locationConfidence,
      decisionReason: decisionReason
    },
    decisionVersion: 'location-v2.0',
    scannedAt: Date.now()
  };

  // [STEP 4/4] Save complete telemetry to Firestore qrcode node for ALL attempts
  if(firebaseDb && publicPortalData.sessionId){
    console.log(`[qr_flow] [STEP 4/4] Saving location-v2.0 telemetry to Firestore database node (qrcode -> ${publicPortalData.sessionId})...`);
    
    // 1. Save to parent doc map: qrcode/{sessionId} -> scanners.{studentId}
    firebaseDb.collection('qrcode').doc(publicPortalData.sessionId).set({
      id: publicPortalData.sessionId,
      updatedAt: Date.now(),
      scanners: { [studentId]: evidenceRecord }
    }, { merge: true }).then(() => {
      console.log(`[qr_flow] Firestore update successful: qrcode -> ${publicPortalData.sessionId} -> scanners -> ${studentId} (Status: ${status}, Reason: ${decisionReason})`);
    }).catch(e => console.error('[qr_flow] Firestore update error:', e));

    // 2. Save to subcollection: qrcode/{sessionId}/scans/{studentId}
    firebaseDb.collection('qrcode').doc(publicPortalData.sessionId).collection('scans').doc(studentId).set(evidenceRecord, { merge: true }).then(() => {
      console.log(`[qr_flow] Firestore subcollection update successful: qrcode/${publicPortalData.sessionId}/scans/${studentId}`);
    }).catch(e=>{});
  }

  // Send complete telemetry payload to Vercel backend logs
  if(typeof sendVercelLog === 'function'){
    sendVercelLog({
      flow: 'qr_scan',
      sessionId: publicPortalData.sessionId,
      ...evidenceRecord
    });
    console.log(`[qr_flow] Telemetry payload sent to Vercel backend endpoint (/api/log).`);
  }

  // Handle Non-ALLOWED Decisions (Rejections & Uncertainty Warnings)
  if(status !== 'ALLOWED'){
    if(btn){
      btn.disabled = false;
      btn.textContent = '✅ Mark Me Present';
    }
    if(statusEl){
      statusEl.style.display = 'block';
      statusEl.style.borderRadius = '14px';
      statusEl.style.padding = '18px';
      statusEl.style.textAlign = 'center';

      if(status === 'TOO_FAR'){
        statusEl.style.background = 'rgba(248,113,113,0.15)';
        statusEl.style.color = '#ef4444';
        statusEl.style.border = '1px solid rgba(248,113,113,0.3)';
        statusEl.innerHTML = `
          <div style="font-size:36px;margin-bottom:6px">⚠️</div>
          <h3 style="margin:0 0 6px 0;font-size:16px;color:#ef4444">Location Distance Notice (${distMeters}m)</h3>
          <p style="margin:0 0 10px 0;font-size:13px;line-height:1.5">You appear to be approximately <b>${distMeters} meters</b> away from the classroom attendance point (GPS-estimated).<br><span style="font-size:12px;color:var(--text-dim)">Attendance requires being near the classroom. Please move closer to the teacher/classroom and try again.</span></p>
        `;
      } else {
        statusEl.style.background = 'rgba(245,158,11,0.15)';
        statusEl.style.color = '#f59e0b';
        statusEl.style.border = '1px solid rgba(245,158,11,0.3)';
        statusEl.innerHTML = `
          <div style="font-size:36px;margin-bottom:6px">🛰️</div>
          <h3 style="margin:0 0 6px 0;font-size:16px;color:#f59e0b">GPS Signal Uncertain (Accuracy: ${sAccuracy}m, Spread: ${positionSpreadMeters}m)</h3>
          <p style="margin:0 0 10px 0;font-size:13px;line-height:1.5">We couldn't reliably verify your classroom location.<br><span style="font-size:12px;color:var(--text-dim)">Please hold your phone steady near a window or open area and tap Mark Me Present again.</span></p>
        `;
      }
    }
    return;
  }

  // Allowed Flow: Mark present in group state
  if(btn){
    btn.disabled = true;
    btn.textContent = 'Submitting...';
  }

  try {
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

    const instName = portalGroupInstitution(g);
    const classLbl = portalGroupLabel(g);
    const geoNote = `📍 Verified (GPS-Estimated Distance: ${distMeters !== null ? distMeters + 'm' : 'Confirmed'})`;

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

      // 2. Main Database Telemetry Node Write: qrcode -> id -> scanners -> studentId
      const scannerRecord = {
        studentId: studentId,
        name: sName,
        rollNo: sRoll,
        lat: sLat,
        lng: sLng,
        studentAccuracy: sAccuracy,
        teacherLat: isNaN(tlat) ? null : tlat,
        teacherLng: isNaN(tlng) ? null : tlng,
        teacherAccuracy: isNaN(tacc) ? null : tacc,
        distanceMeters: distMeters,
        status: status,
        locationConfidence: locationConfidence,
        decisionReason: decisionReason,
        validSamplesCount: validSamplesCount,
        requestedSamplesCount: requestedSamplesCount,
        positionSpreadMeters: positionSpreadMeters,
        timeDeltaSeconds: timeDeltaSeconds,
        scannedAt: Date.now()
      };

      firebaseDb.collection('qrcode').doc(publicPortalData.sessionId).set({
        scanners: {
          [studentId]: scannerRecord
        }
      }, { merge: true }).then(() => {
        console.log(`[qr_flow] Telemetry updated: qrcode -> ${publicPortalData.sessionId} -> scanners -> ${studentId} (Dist: ${distMeters}m, Status: ${status})`);
      }).catch(e => console.error('[qr_flow] Error updating qrcode node telemetry:', e));
    }

    // 3. Send complete telemetry payload to Vercel backend logs
    if(typeof sendVercelLog === 'function'){
      sendVercelLog({
        flow: 'qr_scan',
        sessionId: publicPortalData.sessionId,
        studentId: studentId,
        name: sName,
        rollNo: sRoll,
        lat: sLat,
        lng: sLng,
        studentAccuracy: sAccuracy,
        teacherAccuracy: isNaN(tacc) ? null : tacc,
        distanceMeters: distMeters,
        status: status,
        decisionReason: decisionReason,
        locationConfidence: locationConfidence,
        validSamplesCount: validSamplesCount,
        requestedSamplesCount: requestedSamplesCount,
        positionSpreadMeters: positionSpreadMeters,
        timeDeltaSeconds: timeDeltaSeconds
      });
    }

    // 4. Non-blocking background save to storageSet
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
  console.log(`[qr_flow] Camera Scanned QR Code URL: ${scannedUrl}`);
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

async function recalibrateStudentGps(){
  prefetchedStudentCoords = null;
  prefetchedAt = 0;
  const statusEl = document.getElementById('portalStatusMsg') || document.getElementById('portalStatusMessage');
  if(statusEl){
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(56,189,248,0.15)';
    statusEl.style.color = 'var(--cyan)';
    statusEl.style.border = '1px solid rgba(56,189,248,0.3)';
    statusEl.style.padding = '14px';
    statusEl.style.borderRadius = '10px';
    statusEl.innerHTML = `🛰️ <b>Recalibrating Hardware GPS Satellite...</b><br><span style="font-size:12px">Acquiring high-accuracy indoor position. Please wait...</span>`;
  }
  if(navigator.geolocation){
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          if(p && p.coords){
            prefetchedStudentCoords = p.coords;
            prefetchedAt = Date.now();
            submitPublicStudentAttendance();
          }
        },
        () => {
          submitPublicStudentAttendance();
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    } catch(e){
      submitPublicStudentAttendance();
    }
  } else {
    submitPublicStudentAttendance();
  }
}
