/* ============================================================
   GROUP WORKSPACE, ROSTER, CSV/EXCEL IMPORT & MANUAL ATTENDANCE
============================================================ */
let attMap = {}; // studentId -> bool
let editingSessionId = null;
let selectedStudentForHistory = null;
let editingStudentId = null;

function getGroup(){
  return (appData.groups || []).find(g => g.id === currentGroupId);
}

function openGroup(id){
  currentGroupId = id;
  const g = getGroup();
  if(!g) return;

  document.getElementById('dashboardScreen').style.display = 'none';
  document.getElementById('workspaceScreen').style.display = 'block';
  document.getElementById('wsTitle').textContent = groupInstitution(g);
  document.getElementById('wsSubtitle').textContent = groupLabel(g);

  updateLockUI(g);
  switchTab('students');
}

function updateLockUI(g){
  const lockBtn = document.getElementById('lockClassBtn');
  const editBtn = document.getElementById('editClassBtn');
  const lockedBanner = document.getElementById('lockedBanner');

  if(g.isLocked){
    if(lockBtn) { lockBtn.textContent = '🔓 Unlock Class'; lockBtn.style.color = '#fbbf24'; }
    if(editBtn) editBtn.style.display = 'none';
    if(lockedBanner) lockedBanner.style.display = 'flex';
  } else {
    if(lockBtn) { lockBtn.textContent = '🔒 Lock Class'; lockBtn.style.color = 'var(--text)'; }
    if(editBtn) editBtn.style.display = 'inline-flex';
    if(lockedBanner) lockedBanner.style.display = 'none';
  }
}

function switchTab(name){
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active', p.id === 'panel-' + name));

  if(name === 'students') renderStudents();
  if(name === 'attendance') prepareAttendancePanel();
  if(name === 'reports') initReportView();
}

function openTab(name){
  switchTab(name);
}

/* ---------- Student Roster ---------- */
function renderStudents(){
  const g = getGroup();
  if(!g) return;
  const tbody = document.getElementById('studentTableBody');
  if(!tbody) return;
  tbody.innerHTML = '';

  const addWrap = document.getElementById('addStudentFormControls');
  if(addWrap) addWrap.style.display = g.isLocked ? 'none' : 'flex';

  const query = (document.getElementById('studentSearch')?.value || '').toLowerCase().trim();
  const sorted = g.students.slice().sort((a,b)=>a.rollNo.localeCompare(b.rollNo,undefined,{numeric:true}));
  const filtered = sorted.filter(s => {
    if(!query) return true;
    return s.name.toLowerCase().includes(query) || s.rollNo.toLowerCase().includes(query) || (s.phone && s.phone.includes(query));
  });

  const emptyEl = document.getElementById('studentsEmpty') || document.getElementById('studentEmpty');
  if(emptyEl) emptyEl.style.display = filtered.length ? 'none' : 'block';

  filtered.forEach(s=>{
    const tr = document.createElement('tr');
    tr.className = 'clickable';
    tr.onclick = (e) => {
      if(!e.target.closest('button')) openStudentHistoryModal(s.id);
    };
    tr.innerHTML = `
      <td><span class="roll-pill">${s.rollNo}</span></td>
      <td><b>${s.name}</b></td>
      <td>${s.phone ? '📱 ' + s.phone : '<span style="color:var(--text-dim)">Not added</span>'}</td>
      <td>
        ${!g.isLocked ? `
          <button class="icon-btn" onclick="event.stopPropagation(); openEditStudentModal('${s.id}')" title="Edit student">✏️ Edit</button>
          <button class="icon-btn" onclick="event.stopPropagation(); deleteStudent('${s.id}')" title="Remove student" style="color:var(--red);margin-left:6px">🗑️</button>
        ` : '<span style="font-size:12px;color:var(--text-dim)">Locked</span>'}
      </td>`;
    tbody.appendChild(tr);
  });
}

async function addStudent(){
  const g = getGroup();
  if(g && g.isLocked){ toast('This class is locked. Unlock it to add students.'); return; }
  const nameEl = document.getElementById('newStudentName');
  const rollEl = document.getElementById('newStudentRoll');
  const phoneEl = document.getElementById('newStudentPhone');

  if(!nameEl || !rollEl) return;
  const name = nameEl.value.trim();
  const roll = rollEl.value.trim();
  const phone = phoneEl ? phoneEl.value.trim() : '';

  if(!name || !roll){ toast('Please enter both student name and roll number.'); return; }

  const duplicate = g.students.find(s => s.rollNo.toLowerCase() === roll.toLowerCase());
  if(duplicate){ toast(`Roll number "${roll}" already exists in this class.`); return; }

  g.students.push({ id: uid(), rollNo: roll, name: name, phone: phone });
  await persist();

  nameEl.value = '';
  rollEl.value = '';
  if(phoneEl) phoneEl.value = '';

  renderStudents();
  renderGroupGrid();
  toast('Student added to roster!');
}

/* ---------- Edit Student Modal ---------- */
function openEditStudentModal(id){
  const g = getGroup();
  if(g && g.isLocked){ toast('This class is locked. Unlock it to edit student details.'); return; }
  const s = g.students.find(item => item.id === id);
  if(!s) return;

  editingStudentId = id;
  if(document.getElementById('editStudentRoll')) document.getElementById('editStudentRoll').value = s.rollNo || '';
  if(document.getElementById('editStudentName')) document.getElementById('editStudentName').value = s.name || '';
  if(document.getElementById('editStudentPhone')) document.getElementById('editStudentPhone').value = s.phone || '';

  document.getElementById('editStudentModalBackdrop').classList.add('show');
}

function openEditStudentModalFromHistory(){
  if(selectedStudentForHistory){
    const sid = typeof selectedStudentForHistory === 'object' ? selectedStudentForHistory.id : selectedStudentForHistory;
    closeStudentHistoryModal();
    openEditStudentModal(sid);
  }
}

function closeEditStudentModal(){
  editingStudentId = null;
  document.getElementById('editStudentModalBackdrop').classList.remove('show');
}

async function saveStudentEdit(){
  if(!editingStudentId) return;
  const g = getGroup();
  if(!g) return;
  if(g.isLocked){ toast('Class is locked.'); return; }

  const s = g.students.find(item => item.id === editingStudentId);
  if(!s) return;

  const roll = document.getElementById('editStudentRoll').value.trim();
  const name = document.getElementById('editStudentName').value.trim();
  const phone = document.getElementById('editStudentPhone').value.trim();

  if(!roll || !name){ toast('Roll number and Name are required.'); return; }

  const duplicate = g.students.find(item => item.id !== editingStudentId && item.rollNo.toLowerCase() === roll.toLowerCase());
  if(duplicate){ toast(`Roll number "${roll}" is already used in this class.`); return; }

  s.rollNo = roll;
  s.name = name;
  s.phone = phone;

  await persist();
  closeEditStudentModal();
  renderStudents();
  renderGroupGrid();
  toast('Student details updated!');
}

async function deleteStudent(id){
  const g = getGroup();
  if(!g) return;
  if(g.isLocked){ toast('Class is locked.'); return; }
  const s = g.students.find(item => item.id === id);
  if(!s) return;

  if(!confirm(`Remove ${s.name} (${s.rollNo}) from this class?`)) return;
  g.students = g.students.filter(item => item.id !== id);

  g.sessions.forEach(sess => {
    if(sess.records) delete sess.records[id];
  });

  await persist();
  renderStudents();
  renderGroupGrid();
  toast('Student removed.');
}

/* ---------- Excel / CSV Import & Export ---------- */
function openCsvModal(){
  const g = getGroup();
  if(g && g.isLocked){ toast('This class is locked.'); return; }
  document.getElementById('csvModalBackdrop').classList.add('show');
  updateImportPreview();
}

function closeCsvModal(){
  document.getElementById('csvModalBackdrop').classList.remove('show');
  if(document.getElementById('csvInput')) document.getElementById('csvInput').value = '';
  if(document.getElementById('csvFileInput')) document.getElementById('csvFileInput').value = '';
  if(document.getElementById('importPreviewArea')) document.getElementById('importPreviewArea').style.display = 'none';
}

async function handleFileSelect(e){
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  const fileName = file.name.toLowerCase();

  if(fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.ods')){
    try {
      if(typeof XLSX === 'undefined'){ toast('Excel library loading... please try again.'); return; }
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      const csvLines = rows
        .filter(r => r && r.length > 0 && r.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ''))
        .map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(', '));
      document.getElementById('csvInput').value = csvLines.join('\n');
      toast(`Loaded ${rows.length} rows from Excel sheet.`);
      updateImportPreview();
    } catch(err){
      console.error(err);
      toast('Failed to parse Excel file.');
    }
  } else {
    try {
      const text = await file.text();
      document.getElementById('csvInput').value = text;
      toast('CSV file loaded.');
      updateImportPreview();
    } catch(err){
      console.error(err);
      toast('Failed to read CSV file.');
    }
  }
}

function parseRawStudentData(text){
  if(!text || !text.trim()) return [];
  const lines = text.trim().split(/\r?\n/);
  const parsedRows = [];

  lines.forEach(line => {
    line = line.trim();
    if(!line) return;
    let parts;
    if(line.includes('\t')){ parts = line.split('\t'); }
    else if(line.includes(';')){ parts = line.split(';'); }
    else { parts = line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/); }
    parts = parts.map(p => p.trim().replace(/^["']|["']$/g, ''));
    if(parts.some(p => p.length > 0)) parsedRows.push(parts);
  });

  if(!parsedRows.length) return [];

  let headerRowIndex = -1, rollColIdx = -1, nameColIdx = -1, phoneColIdx = -1;
  for(let i = 0; i < Math.min(3, parsedRows.length); i++){
    const row = parsedRows[i].map(c => String(c).toLowerCase());
    const rIdx = row.findIndex(c => c.includes('roll') || c.includes('reg') || c.includes('enroll') || c === 'id' || c.includes('r.no') || c === 'sl.no' || c === 's.no');
    const nIdx = row.findIndex(c => c.includes('name') || c.includes('student'));
    const pIdx = row.findIndex(c => c.includes('phone') || c.includes('mobile') || c.includes('contact') || c.includes('whatsapp'));
    if(nIdx !== -1 || rIdx !== -1){
      headerRowIndex = i; nameColIdx = nIdx; rollColIdx = rIdx; phoneColIdx = pIdx;
      break;
    }
  }

  const result = [];
  const startIdx = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;
  for(let i = startIdx; i < parsedRows.length; i++){
    const row = parsedRows[i];
    if(!row || row.length < 1) continue;
    let roll = '', name = '', phone = '';

    if(headerRowIndex !== -1){
      name = nameColIdx !== -1 ? row[nameColIdx] || '' : '';
      roll = rollColIdx !== -1 ? row[rollColIdx] || '' : '';
      phone = phoneColIdx !== -1 ? row[phoneColIdx] || '' : '';
      if(!roll && name){
        const nonNameCols = row.filter((_, idx) => idx !== nameColIdx && idx !== phoneColIdx && row[idx]);
        if(nonNameCols.length) roll = nonNameCols[0];
      }
    } else {
      if(row.length >= 3){
        roll = row[0]; name = row[1]; phone = row[2] || '';
      } else if(row.length === 2){
        if(/^[a-zA-Z\s]{3,}$/.test(row[0]) && /^[0-9a-zA-Z]{1,15}$/.test(row[1])){
          name = row[0]; roll = row[1];
        } else {
          roll = row[0]; name = row[1];
        }
      } else if(row.length === 1){
        name = row[0]; roll = String(i + 1);
      }
    }

    roll = String(roll).trim(); name = String(name).trim(); phone = String(phone).trim();
    if(roll.toLowerCase() === 'roll' || name.toLowerCase() === 'name') continue;
    if(name || roll){
      if(!roll) roll = String(result.length + 1);
      if(!name) name = 'Student ' + roll;
      result.push({ rollNo: roll, name: name, phone: phone });
    }
  }
  return result;
}

function updateImportPreview(){
  const text = document.getElementById('csvInput')?.value || '';
  const students = parseRawStudentData(text);
  const previewArea = document.getElementById('importPreviewArea');
  const tbody = document.getElementById('previewTableBody');
  const countEl = document.getElementById('previewCount');
  if(!previewArea || !tbody || !countEl) return;

  if(!students.length){
    previewArea.style.display = 'none';
    return;
  }
  previewArea.style.display = 'block';
  countEl.textContent = `${students.length} student${students.length > 1 ? 's' : ''} detected`;
  tbody.innerHTML = students.slice(0, 10).map(s => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid var(--border)">${s.rollNo}</td>
      <td style="padding:6px 10px;border-bottom:1px solid var(--border)"><b>${s.name}</b></td>
      <td style="padding:6px 10px;border-bottom:1px solid var(--border)">${s.phone || 'None'}</td>
    </tr>
  `).join('') + (students.length > 10 ? `<tr><td colspan="3" style="padding:6px 10px;color:var(--text-dim)">...and ${students.length - 10} more</td></tr>` : '');
}

async function processCsvImport(){
  const text = document.getElementById('csvInput')?.value.trim() || '';
  if(!text){ toast('Please select an Excel/CSV file or paste student list.'); return; }
  const g = getGroup();
  if(!g){ toast('No active class selected.'); return; }
  if(g.isLocked){ toast('Class is locked.'); return; }

  const parsedStudents = parseRawStudentData(text);
  if(!parsedStudents.length){ toast('Could not detect valid student records.'); return; }

  let addedCount = 0, skippedCount = 0;
  parsedStudents.forEach(s => {
    const exists = g.students.some(existing => existing.rollNo.toLowerCase() === s.rollNo.toLowerCase());
    if(!exists){
      g.students.push({ id: uid(), name: s.name, rollNo: s.rollNo, phone: s.phone });
      addedCount++;
    } else {
      skippedCount++;
    }
  });

  await persist();
  closeCsvModal();
  renderStudents();
  renderGroupGrid();
  toast(`Imported ${addedCount} student(s) (${skippedCount} duplicates skipped)`);
}

function exportStudentsCsv(){
  const g = getGroup();
  if(!g || !g.students.length){ toast('No students to export.'); return; }
  let csv = 'Roll No,Name,Phone\n';
  g.students.slice().sort((a,b)=>a.rollNo.localeCompare(b.rollNo,undefined,{numeric:true})).forEach(s => {
    csv += `"${s.rollNo}","${s.name}","${s.phone || ''}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `students-${groupInstitution(g).replace(/\s+/g,'_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Student roster exported to CSV.');
}

/* ---------- Attendance & Sessions ---------- */
function prepareAttendancePanel(){
  const g = getGroup();
  if(!g) return;

  const today = new Date().toISOString().slice(0,10);
  if(document.getElementById('attDate')) document.getElementById('attDate').value = today;

  if(document.getElementById('attSubject')){
    document.getElementById('attSubject').value = (g.type === 'school_junior' && g.subject) ? g.subject : '';
  }

  editingSessionId = null;
  if(document.getElementById('editSessionBadge')) document.getElementById('editSessionBadge').style.display = 'none';

  attMap = {};
  renderAttendanceForm();
  renderSessionList();
}

function renderAttendanceForm(){
  const g = getGroup();
  if(!g) return;

  const list = document.getElementById('attList');
  if(!list) return;
  list.innerHTML = '';

  const students = g.students.slice().sort((a,b)=>a.rollNo.localeCompare(b.rollNo,undefined,{numeric:true}));

  students.forEach(s=>{
    const state = attMap[s.id]; // true = Present, false = Absent, undefined = Neutral (no color by default)
    const isP = state === true;
    const isA = state === false;

    const row = document.createElement('div');
    row.className = 'att-row';
    row.innerHTML = `
      <div class="who">
        <span class="roll-pill">${s.rollNo}</span>
        <b>${s.name}</b>
      </div>
      <div class="att-toggle">
        <button class="present ${isP ? 'on' : ''}" onclick="setAtt('${s.id}', true)">Present</button>
        <button class="absent ${isA ? 'on' : ''}" onclick="setAtt('${s.id}', false)">Absent</button>
      </div>`;
    list.appendChild(row);
  });
}

function setAtt(id, isPresent){
  attMap[id] = isPresent;
  renderAttendanceForm();
}

function markAll(isPresent){
  const g = getGroup();
  if(!g) return;
  g.students.forEach(s => attMap[s.id] = isPresent);
  renderAttendanceForm();
}

async function saveAttendance(){
  const g = getGroup();
  if(!g) return;
  if(g.isLocked){ toast('This class is locked. Unlock it to take attendance.'); return; }

  const date = document.getElementById('attDate').value;
  const subject = document.getElementById('attSubject').value.trim() || 'Class';
  if(!date){ toast('Please select a date.'); return; }

  let sess = editingSessionId ? g.sessions.find(s=>s.id === editingSessionId) : null;
  if(!sess){
    sess = { id: uid(), date, subject, records: {} };
    g.sessions.push(sess);
  } else {
    sess.date = date;
    sess.subject = subject;
  }

  sess.records = {};
  g.students.forEach(s => {
    sess.records[s.id] = !!attMap[s.id];
  });

  await persist();
  toast(editingSessionId ? 'Attendance updated!' : 'Attendance saved!');
  editingSessionId = null;
  if(document.getElementById('editSessionBadge')) document.getElementById('editSessionBadge').style.display = 'none';

  prepareAttendancePanel();
  renderGroupGrid();
}

async function saveSession(){
  await saveAttendance();
}

function renderSessionList(){
  const g = getGroup();
  if(!g) return;

  const container = document.getElementById('sessionList') || document.getElementById('sessionListContainer');
  if(!container) return;
  container.innerHTML = '';

  const sessions = g.sessions.slice().sort((a,b)=>b.date.localeCompare(a.date));
  if(!sessions.length){
    container.innerHTML = '<div style="font-size:13px;color:var(--text-dim);padding:10px 0">No past classes recorded yet.</div>';
    return;
  }

  sessions.forEach(s=>{
    const item = document.createElement('div');
    item.className = 'session-item';
    const presentCount = Object.values(s.records || {}).filter(Boolean).length;
    const totalCount = g.students.length;

    item.innerHTML = `
      <div>
        <b>${s.date}</b> — ${s.subject}
        <span style="margin-left:8px;font-size:12px">(${presentCount}/${totalCount} Present)</span>
      </div>
      <div>
        ${!g.isLocked ? `
          <button class="icon-btn" onclick="editSession('${s.id}')">✏️ Edit</button>
          <button class="icon-btn" onclick="deleteSession('${s.id}')" style="color:var(--red);margin-left:6px">🗑️</button>
        ` : ''}
      </div>`;
    container.appendChild(item);
  });
}

function editSession(id){
  const g = getGroup();
  if(!g) return;
  if(g.isLocked){ toast('Class is locked.'); return; }
  const s = g.sessions.find(item=>item.id === id);
  if(!s) return;

  editingSessionId = id;
  document.getElementById('attDate').value = s.date;
  document.getElementById('attSubject').value = s.subject || '';
  if(document.getElementById('editSessionBadge')) document.getElementById('editSessionBadge').style.display = 'inline-flex';

  attMap = {};
  g.students.forEach(stu => {
    attMap[stu.id] = !!(s.records && s.records[stu.id]);
  });
  renderAttendanceForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelSessionEdit(){
  editingSessionId = null;
  if(document.getElementById('editSessionBadge')) document.getElementById('editSessionBadge').style.display = 'none';
  prepareAttendancePanel();
}

function cancelEditSession(){
  cancelSessionEdit();
}

async function deleteSession(id){
  const g = getGroup();
  if(!g) return;
  if(g.isLocked){ toast('Class is locked.'); return; }

  if(!confirm('Delete this attendance session?')) return;
  g.sessions = g.sessions.filter(s=>s.id !== id);
  await persist();
  renderSessionList();
  renderGroupGrid();
  toast('Session deleted.');
}

/* ---------- Student Profile & History Modal ---------- */
function openStudentHistoryModal(studentId){
  const g = getGroup();
  if(!g) return;
  const s = g.students.find(stu => stu.id === studentId);
  if(!s) return;

  selectedStudentForHistory = s;
  document.getElementById('studentHistoryTitle').textContent = s.name;
  document.getElementById('studentHistorySubtitle').textContent = `Roll No: ${s.rollNo} • ${groupInstitution(g)}`;
  if(document.getElementById('shPhoneInput')) document.getElementById('shPhoneInput').value = s.phone || '';

  const sessions = g.sessions.slice().sort((a,b)=>b.date.localeCompare(a.date));
  const total = sessions.length;
  const presentCount = sessions.filter(sess => sess.records && sess.records[studentId]).length;
  const absentCount = total - presentCount;
  const pct = total ? Math.round((presentCount / total) * 100) : 0;

  if(document.getElementById('shTotal')) document.getElementById('shTotal').textContent = total;
  if(document.getElementById('shPresent')) document.getElementById('shPresent').textContent = presentCount;
  if(document.getElementById('shAbsent')) document.getElementById('shAbsent').textContent = absentCount;
  if(document.getElementById('shPct')) document.getElementById('shPct').textContent = pct + '%';

  const container = document.getElementById('shLog') || document.getElementById('historyModalLog');
  if(container){
    container.innerHTML = '';
    if(!sessions.length){
      container.innerHTML = '<div style="font-size:13px;color:var(--text-dim);text-align:center;padding:16px">No attendance records found.</div>';
    } else {
      sessions.forEach(sess => {
        const isPresent = !!(sess.records && sess.records[studentId]);
        const item = document.createElement('div');
        item.className = 'history-log-item';
        item.innerHTML = `
          <div><b>${sess.date}</b> — ${sess.subject}</div>
          <div><span class="${isPresent ? 'badge-success' : 'badge-danger'}">${isPresent ? 'Present' : 'Absent'}</span></div>`;
        container.appendChild(item);
      });
    }
  }

  document.getElementById('studentHistoryModalBackdrop').classList.add('show');
}

function closeStudentHistoryModal(){
  document.getElementById('studentHistoryModalBackdrop').classList.remove('show');
}

async function saveStudentPhoneFromModal(){
  const g = getGroup();
  if(!g || !selectedStudentForHistory) return;
  if(g.isLocked){ toast('Class is locked.'); return; }

  const input = document.getElementById('shPhoneInput');
  if(!input) return;
  selectedStudentForHistory.phone = input.value.trim();

  await persist();
  renderStudents();
  toast('Phone number updated!');
}

function sendWhatsAppAlert(targetStudent){
  const student = targetStudent || selectedStudentForHistory;
  if(!student) return;
  const g = getGroup();
  const sessions = g.sessions;
  const total = sessions.length;
  const presentCount = sessions.filter(s => s.records && s.records[student.id]).length;
  const pct = total ? Math.round((presentCount / total) * 100) : 0;

  const msg = `📌 *Attendo Notice regarding Attendance*\n` +
              `Student: ${student.name} (Roll No: ${student.rollNo})\n` +
              `Class: ${groupInstitution(g)} (${groupLabel(g)})\n` +
              `Attendance: ${presentCount}/${total} classes (${pct}%)\n` +
              `Status: ${pct < 75 ? '⚠️ Shortage Warning (Below 75%)' : 'Good Standing'}`;

  const cleanPhone = (student.phone || '').replace(/\D/g, '');
  let phoneParam = cleanPhone.length >= 10 ? (cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone) : '';
  const waUrl = phoneParam ? `https://wa.me/${phoneParam}?text=${encodeURIComponent(msg)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
}

/* ---------- Bulk WhatsApp Alerts Modal ---------- */
function openBulkWaModal(){
  const g = getGroup();
  if(!g){ if(typeof toast==='function') toast('Please open a class first.'); return; }
  
  const backdrop = document.getElementById('bulkWaModalBackdrop');
  if(backdrop){
    backdrop.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(5,5,10,0.85);display:flex !important;align-items:center;justify-content:center;z-index:999999;padding:20px;backdrop-filter:blur(4px);";
    backdrop.classList.add('show');
  }

  const container = document.getElementById('bulkWaList');
  if(!container) return;

  const { rows } = computeReport();
  const defaulters = rows.filter(r => r.pct < 75);

  if(!rows.length){
    container.innerHTML = '<div style="font-size:13px;color:var(--text-dim);padding:14px">No attendance sessions recorded.</div>';
  } else if(!defaulters.length){
    container.innerHTML = '<div style="font-size:13px;color:var(--green);padding:14px">🎉 All students have attendance ≥ 75%. No defaulters!</div>';
  } else {
    let html = '';
    defaulters.forEach(r => {
      html += `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;margin-bottom:8px;background:var(--card2);border:1px solid var(--border);border-radius:10px">
          <div>
            <b>${r.name}</b> <span class="roll-pill" style="margin-left:4px">${r.rollNo}</span> — <span style="color:var(--red);font-weight:700">${r.pct}%</span>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="sendWhatsAppAlertBySid('${r.studentId}')" style="color:#25D366;border-color:rgba(37,211,102,0.4);font-size:12px;padding:4px 10px">💬 Alert</button>
        </div>`;
    });
    container.innerHTML = html;
  }
}

function closeBulkWaModal(){
  const backdrop = document.getElementById('bulkWaModalBackdrop');
  if(backdrop){
    backdrop.style.cssText = "display:none !important;";
    backdrop.classList.remove('show');
  }
}

function sendWhatsAppAlertBySid(sid){
  const g = getGroup();
  if(!g) return;
  const student = g.students.find(s => s.id === sid);
  if(student) sendWhatsAppAlert(student);
}

function copyGroupDefaulterSummary(){
  const g = getGroup();
  if(!g) return;
  const { total, rows } = computeReport();
  const defaulters = rows.filter(r => r.pct < 75);

  let text = `⚠️ *ATTENDANCE SHORTAGE WARNING*\n` +
             `Institution: ${groupInstitution(g)}\n` +
             `Class: ${groupLabel(g)}\n` +
             `Total Classes Held: ${total}\n\n`;

  if(!defaulters.length){
    text += `✅ All students have achieved satisfactory attendance (75%+).\n`;
  } else {
    text += `The following students have attendance below 75%:\n`;
    defaulters.forEach((d, idx) => {
      text += `${idx + 1}. ${d.name} (Roll: ${d.rollNo}) — ${d.pct}% (${d.present}/${d.total} present)\n`;
    });
    text += `\nKindly contact the department / class coordinator immediately.`;
  }

  navigator.clipboard.writeText(text).then(() => {
    toast('Defaulter list summary copied to clipboard!');
  }).catch(() => {
    toast('Copied defaulter summary to clipboard.');
  });
}
