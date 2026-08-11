/* ============================================================
   5-MINUTE DYNAMIC QR & WHATSAPP ATTENDANCE MODE
============================================================ */
let activeQrSessionId = null;
let qrTimerInterval = null;
let qrLiveUnsub = null;
let qrMarkedStudentIds = new Set();
let qrSessionActive = false;

async function startQrAttendanceSession(){
  const g = getGroup();
  if(!g){ toast('Please open a class first.'); return; }
  if(g.isLocked){ toast('This class is locked. Unlock it to start QR attendance.'); return; }
  if(!g.students || !g.students.length){ toast('Please add students to this class first.'); return; }

  activeQrSessionId = uid();
  qrSessionActive = true;
  qrMarkedStudentIds.clear();

  const dateStr = document.getElementById('attDate')?.value || new Date().toISOString().slice(0,10);
  const subjectStr = document.getElementById('attSubject')?.value.trim() || 'Class';

  let teacherLat = null;
  let teacherLng = null;

  if(navigator.geolocation){
    try {
      const pos = await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 3500 });
      });
      if(pos && pos.coords){
        teacherLat = pos.coords.latitude;
        teacherLng = pos.coords.longitude;
      }
    } catch(e){}
  }

  const sessionMeta = {
    sessionId: activeQrSessionId,
    email: currentUser ? currentUser.email : '',
    gid: g.id,
    date: dateStr,
    subject: subjectStr,
    teacherLat: teacherLat,
    teacherLng: teacherLng,
    geoRadius: 30,
    createdAt: Date.now(),
    expiresAt: Date.now() + (5 * 60 * 1000)
  };

  if(firebaseDb){
    try {
      await firebaseDb.collection('attendo_qr_sessions').doc(activeQrSessionId).set(sessionMeta);
    } catch(e){ console.error('Cloud QR session error', e); }
  }

  const baseUrl = getAppBaseUrl();
  let studentLink = `${baseUrl}?qrSession=${activeQrSessionId}&email=${encodeURIComponent(currentUser ? currentUser.email : '')}&gid=${g.id}`;
  if(teacherLat && teacherLng){
    studentLink += `&tlat=${teacherLat}&tlng=${teacherLng}`;
  }

  const qrContainer = document.getElementById('qrCanvasContainer');
  if(qrContainer){
    qrContainer.innerHTML = '';
    try {
      if(typeof qrcode === 'function') {
        const qr = qrcode(0, 'M');
        qr.addData(studentLink);
        qr.make();
        qrContainer.innerHTML = qr.createImgTag(5, 10);
      } else if(window.QRCode){
        new QRCode(qrContainer, { text: studentLink, width: 200, height: 200 });
      } else {
        qrContainer.innerHTML = `<div style="padding:10px;font-size:12px;word-break:break-all;color:#111"><a href="${studentLink}" target="_blank">${studentLink}</a></div>`;
      }
    } catch(err) {
      console.log('QR retry with type number', err);
      try {
        const qr = qrcode(10, 'M');
        qr.addData(studentLink);
        qr.make();
        qrContainer.innerHTML = qr.createImgTag(4, 8);
      } catch(err2) {
        qrContainer.innerHTML = `<div style="padding:10px;font-size:12px;word-break:break-all;color:#111"><a href="${studentLink}" target="_blank">${studentLink}</a></div>`;
      }
    }
  }

  if(document.getElementById('qrModalSubtitle')) {
    document.getElementById('qrModalSubtitle').textContent = `${groupInstitution(g)} • ${groupLabel(g)} • ${subjectStr}`;
  }
  if(document.getElementById('qrLiveCount')) {
    document.getElementById('qrLiveCount').textContent = `0 / ${g.students.length}`;
  }
  if(document.getElementById('physicalHeadcountInput')) {
    document.getElementById('physicalHeadcountInput').value = '';
  }
  if(document.getElementById('headcountStatusBadge')) {
    document.getElementById('headcountStatusBadge').style.display = 'none';
  }

  document.getElementById('qrModalBackdrop').classList.add('show');

  startQrCountdownTimer(5 * 60);
  listenLiveQrSubmissions();
}

function startQrCountdownTimer(secondsLeft){
  clearInterval(qrTimerInterval);
  const timerEl = document.getElementById('qrTimer');

  function updateDisplay(s){
    const m = Math.floor(s / 60);
    const sec = s % 60;
    if(timerEl) timerEl.textContent = `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  updateDisplay(secondsLeft);
  qrTimerInterval = setInterval(() => {
    secondsLeft--;
    if(secondsLeft <= 0){
      clearInterval(qrTimerInterval);
      qrSessionActive = false;
      if(timerEl){
        timerEl.textContent = '00:00 (Expired)';
        timerEl.style.color = 'var(--red)';
      }
      toast('5-Minute QR Session expired!');
    } else {
      updateDisplay(secondsLeft);
    }
  }, 1000);
}

function listenLiveQrSubmissions(){
  if(qrLiveUnsub) qrLiveUnsub();
  const countEl = document.getElementById('qrLiveCount');
  const g = getGroup();
  if(countEl && g) countEl.textContent = `0 / ${g.students.length}`;

  if(!firebaseDb || !currentUser) return;

  const docRef = firebaseDb.collection('attendo_storage').doc(sanitizeKey('data:' + currentUser.email));
  qrLiveUnsub = docRef.onSnapshot(doc => {
    if(doc && doc.exists && doc.data() && doc.data().value){
      try {
        const remoteData = JSON.parse(doc.data().value);
        const remoteGroup = (remoteData.groups || []).find(grp => grp.id === currentGroupId);
        if(remoteGroup){
          const sess = (remoteGroup.sessions || []).find(s => s.id === activeQrSessionId);
          if(sess && sess.records){
            const markedCount = Object.values(sess.records).filter(Boolean).length;
            if(countEl) countEl.textContent = `${markedCount} / ${remoteGroup.students.length}`;
            appData = remoteData;
          }
        }
      } catch(e){}
    }
  });
}

function shareQrToWhatsApp(){
  const g = getGroup();
  if(!g) return;
  const baseUrl = getAppBaseUrl();
  const link = `${baseUrl}?qrSession=${activeQrSessionId}&email=${encodeURIComponent(currentUser ? currentUser.email : '')}&gid=${g.id}`;
  const dateStr = document.getElementById('attDate')?.value || '';
  const subjectStr = document.getElementById('attSubject')?.value.trim() || 'Class';

  const msg = `📢 *Attendo 5-Minute Class Attendance Link*\n` +
              `Institution: ${groupInstitution(g)}\n` +
              `Class: ${groupLabel(g)}\n` +
              `Subject: ${subjectStr}\n` +
              `Date: ${dateStr}\n\n` +
              `👇 Click link below to mark your attendance (Valid for 5 mins):\n${link}`;

  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
}

function closeQrModal(){
  clearInterval(qrTimerInterval);
  qrSessionActive = false;
  if(qrLiveUnsub) qrLiveUnsub();
  document.getElementById('qrModalBackdrop').classList.remove('show');
}

function verifyHeadcountMatch(){
  const g = getGroup();
  const physicalInput = document.getElementById('physicalHeadcountInput')?.value;
  const badge = document.getElementById('headcountStatusBadge');
  if(!badge) return;

  if(!physicalInput || isNaN(physicalInput)){
    badge.style.display = 'none';
    return;
  }
  const pCount = parseInt(physicalInput, 10);
  const liveText = document.getElementById('qrLiveCount')?.textContent || '0';
  const appCount = parseInt(liveText.split('/')[0], 10) || qrMarkedStudentIds.size;

  badge.style.display = 'block';
  if(pCount === appCount){
    badge.style.background = 'rgba(34,197,94,0.15)';
    badge.style.color = '#22c55e';
    badge.style.border = '1px solid rgba(34,197,94,0.3)';
    badge.innerHTML = `✅ <b>Headcount Matched Perfectly!</b> (${pCount} physical = ${appCount} in app)`;
  } else if(appCount > pCount){
    const diff = appCount - pCount;
    badge.style.background = 'rgba(239,68,68,0.15)';
    badge.style.color = '#ef4444';
    badge.style.border = '1px solid rgba(239,68,68,0.3)';
    badge.innerHTML = `⚠️ <b>Proxy Mismatch Warning!</b> ${appCount} marked in app, but physical count is ${pCount} (${diff} extra/proxy entries)!`;
  } else {
    const diff = pCount - appCount;
    badge.style.background = 'rgba(245,158,11,0.15)';
    badge.style.color = '#f59e0b';
    badge.style.border = '1px solid rgba(245,158,11,0.3)';
    badge.innerHTML = `ℹ️ ${diff} student(s) in class have not scanned yet. (${appCount}/${pCount})`;
  }
}

function openStudentScanModal(){
  const g = getGroup();
  if(!g) return;
  const select = document.getElementById('scanStudentSelect');
  if(!select) return;
  select.innerHTML = '';

  const unMarked = g.students.filter(s => !qrMarkedStudentIds.has(s.id));
  if(!unMarked.length){
    select.innerHTML = '<option value="">All students marked present!</option>';
  } else {
    unMarked.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.rollNo} — ${s.name}`;
      select.appendChild(opt);
    });
  }
  document.getElementById('studentScanModalBackdrop').classList.add('show');
}

function closeStudentScanModal(){
  document.getElementById('studentScanModalBackdrop').classList.remove('show');
}

function submitStudentSelfAttendance(){
  if(!qrSessionActive){ toast('QR session has expired.'); return; }
  const select = document.getElementById('scanStudentSelect');
  const studentId = select?.value;
  if(!studentId){ toast('Please select a student.'); return; }

  qrMarkedStudentIds.add(studentId);
  const g = getGroup();
  if(document.getElementById('qrLiveCount')) {
    document.getElementById('qrLiveCount').textContent = `${qrMarkedStudentIds.size} / ${g.students.length}`;
  }
  verifyHeadcountMatch();
  closeStudentScanModal();
  toast('✅ Marked present successfully!');
}

async function finishQrSessionAndSave(){
  const g = getGroup();
  if(!g || !activeQrSessionId) return;

  const dateStr = document.getElementById('attDate')?.value || new Date().toISOString().slice(0,10);
  const subjectStr = document.getElementById('attSubject')?.value.trim() || 'Class';

  let sess = g.sessions.find(s => s.id === activeQrSessionId);
  if(!sess){
    sess = { id: activeQrSessionId, date: dateStr, subject: subjectStr, records: {} };
    g.sessions.push(sess);
  }

  g.students.forEach(s => {
    if(qrMarkedStudentIds.has(s.id)) sess.records[s.id] = true;
  });

  await persist();
  closeQrModal();
  renderSessionList();
  renderGroupGrid();
  toast(`Attendance approved & saved! (${Object.values(sess.records).filter(Boolean).length}/${g.students.length} present)`);
}
