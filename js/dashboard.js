/* ============================================================
   DASHBOARD & CLASS/GROUP MANAGEMENT
============================================================ */
let currentGroupId = null;
let currentGroupType = 'college';
let editingGroupId = null;

function goToDashboard(){
  document.getElementById('workspaceScreen').style.display = 'none';
  document.getElementById('dashboardScreen').style.display = 'block';
  renderGroupGrid();
}

function groupLabel(g){
  if(!g) return '';
  if(g.type === 'college'){
    const sem = String(g.semester || '').trim();
    const semFormatted = sem.toLowerCase().includes('sem') ? sem : (sem ? `Semester ${sem}` : 'Semester');
    return (g.department || 'Department') + ' — ' + semFormatted;
  }
  if(g.type === 'school_junior') return 'Class ' + (g.className || '') + ' — ' + (g.subject || '');
  return (g.stream || '') + ' — ' + (g.className || '');
}

function groupInstitution(g){
  if(!g) return '';
  return g.type === 'college' ? (g.collegeName || 'College') : (g.schoolName || 'School');
}

function renderGroupGrid(){
  const grid = document.getElementById('groupGrid');
  if(!grid) return;
  grid.innerHTML = '';
  const query = (document.getElementById('dashSearch')?.value || '').toLowerCase().trim();

  const filtered = (appData.groups || []).filter(g => {
    if(!query) return true;
    const inst = groupInstitution(g).toLowerCase();
    const lbl = groupLabel(g).toLowerCase();
    return inst.includes(query) || lbl.includes(query);
  });

  filtered.forEach(g=>{
    const card = document.createElement('div');
    card.className = 'group-card';
    card.onclick = ()=>openGroup(g.id);
    const totalSessions = g.sessions ? g.sessions.length : 0;
    const totalStudents = g.students ? g.students.length : 0;
    const isLocked = !!g.isLocked;
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <span class="badge" style="margin:0">${g.type === 'college' ? 'College' : (g.type === 'school_junior' ? 'School (1–10)' : 'School')}</span>
        <div style="display:flex;gap:4px;align-items:center">
          ${isLocked ? '<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;background:rgba(251,191,36,0.18);color:#fbbf24;margin-right:2px">🔒 Locked</span>' : ''}
          <button class="icon-btn" onclick="event.stopPropagation(); toggleLockGroup('${g.id}')" title="${isLocked ? 'Unlock Class' : 'Lock Class'}" style="font-size:13px;padding:3px 6px;color:${isLocked ? '#fbbf24' : 'var(--text-dim)'}">${isLocked ? '🔓' : '🔒'}</button>
          ${!isLocked ? `<button class="icon-btn" onclick="event.stopPropagation(); openEditGroupModal('${g.id}')" title="Edit Class" style="font-size:13px;padding:3px 6px;color:var(--text-dim)">✏️</button>` : ''}
          <button class="icon-btn" onclick="event.stopPropagation(); deleteGroup('${g.id}')" title="Delete Class" style="font-size:13px;padding:3px 6px;color:var(--red)">🗑️</button>
        </div>
      </div>
      <h3>${groupInstitution(g)}</h3>
      <p>${groupLabel(g)}</p>
      <div class="stats">
        <span><b>${totalStudents}</b> students</span>
        <span><b>${totalSessions}</b> classes taken</span>
      </div>`;
    grid.appendChild(card);
  });

  const newCard = document.createElement('div');
  newCard.className = 'new-card';
  newCard.onclick = openNewGroupModal;
  newCard.innerHTML = `<span class="plus">+</span><span>Add new class</span>`;
  grid.appendChild(newCard);
}

function setGroupType(type){
  currentGroupType = type;
  const tCollege = document.getElementById('typeCollege');
  const tSchool = document.getElementById('typeSchool');
  const tSchoolJunior = document.getElementById('typeSchoolJunior');

  if(tCollege) tCollege.classList.toggle('active', type === 'college');
  if(tSchool) tSchool.classList.toggle('active', type === 'school');
  if(tSchoolJunior) tSchoolJunior.classList.toggle('active', type === 'school_junior');

  const fCollege = document.getElementById('collegeFields');
  const fSchool = document.getElementById('schoolFields');
  const fSchoolJunior = document.getElementById('schoolJuniorFields');

  if(fCollege) fCollege.style.display = type === 'college' ? 'block' : 'none';
  if(fSchool) fSchool.style.display = type === 'school' ? 'block' : 'none';
  if(fSchoolJunior) fSchoolJunior.style.display = type === 'school_junior' ? 'block' : 'none';
}

function openNewGroupModal(){
  editingGroupId = null;
  document.getElementById('groupModalTitle').textContent = 'Set up a new class';
  const submitBtn = document.getElementById('groupModalSubmitBtn');
  if(submitBtn) submitBtn.textContent = 'Create class';

  setGroupType('college');
  if(document.getElementById('collegeName')) document.getElementById('collegeName').value = '';
  if(document.getElementById('collegeDept')) document.getElementById('collegeDept').value = '';
  if(document.getElementById('collegeSem')) document.getElementById('collegeSem').value = '';
  if(document.getElementById('schoolName')) document.getElementById('schoolName').value = '';
  if(document.getElementById('juniorSchoolName')) document.getElementById('juniorSchoolName').value = '';

  document.getElementById('groupModalBackdrop').classList.add('show');
}

function openEditGroupModal(id){
  const g = (appData.groups || []).find(item => item.id === id);
  if(!g) return;
  editingGroupId = id;
  document.getElementById('groupModalTitle').textContent = 'Edit class details';
  const submitBtn = document.getElementById('groupModalSubmitBtn');
  if(submitBtn) submitBtn.textContent = 'Save changes';

  setGroupType(g.type || 'college');

  if(g.type === 'college'){
    if(document.getElementById('collegeName')) document.getElementById('collegeName').value = g.collegeName || '';
    if(document.getElementById('collegeDept')) document.getElementById('collegeDept').value = g.department || '';
    if(document.getElementById('collegeSem')) document.getElementById('collegeSem').value = g.semester || '';
  } else if(g.type === 'school_junior'){
    if(document.getElementById('juniorSchoolName')) document.getElementById('juniorSchoolName').value = g.schoolName || '';
    if(document.getElementById('juniorClass')) document.getElementById('juniorClass').value = g.className || '1st';
    if(document.getElementById('juniorSubject')) document.getElementById('juniorSubject').value = g.subject || 'General (All Subjects)';
  } else {
    if(document.getElementById('schoolName')) document.getElementById('schoolName').value = g.schoolName || '';
    if(document.getElementById('schoolClass')) document.getElementById('schoolClass').value = g.className || '11th';
    if(document.getElementById('schoolStream')) document.getElementById('schoolStream').value = g.stream || 'Science';
  }

  document.getElementById('groupModalBackdrop').classList.add('show');
}

function openEditGroupModalCurrent(){
  if(currentGroupId) openEditGroupModal(currentGroupId);
}

function closeGroupModal(){
  editingGroupId = null;
  document.getElementById('groupModalBackdrop').classList.remove('show');
}

async function createGroup(){
  let g = editingGroupId ? (appData.groups || []).find(item => item.id === editingGroupId) : null;
  const isNew = !g;

  if(isNew){
    g = {
      id: uid(),
      type: currentGroupType,
      students: [],
      sessions: [],
      isLocked: false,
      marksConfig: { enabled: false, maxMarks: 10, mode: 'proportional', customSlabs: [] }
    };
  } else {
    g.type = currentGroupType;
  }

  if(currentGroupType === 'college'){
    g.collegeName = document.getElementById('collegeName').value.trim();
    g.department = document.getElementById('collegeDept').value.trim();
    g.semester = document.getElementById('collegeSem').value.trim();
    if(!g.collegeName || !g.department){ toast('Please fill in College name and Department.'); return; }
  } else if(currentGroupType === 'school_junior'){
    g.schoolName = document.getElementById('juniorSchoolName').value.trim();
    g.className = document.getElementById('juniorClass').value;
    g.subject = document.getElementById('juniorSubject').value;
    if(!g.schoolName){ toast('Please fill in School name.'); return; }
  } else {
    g.schoolName = document.getElementById('schoolName').value.trim();
    g.className = document.getElementById('schoolClass').value;
    g.stream = document.getElementById('schoolStream').value;
    if(!g.schoolName){ toast('Please fill in School name.'); return; }
  }

  if(isNew) appData.groups.push(g);
  await persist();
  closeGroupModal();
  renderGroupGrid();

  if(currentGroupId === g.id){
    document.getElementById('wsTitle').textContent = groupInstitution(g);
    document.getElementById('wsSubtitle').textContent = groupLabel(g);
  }

  toast(isNew ? 'Class created!' : 'Class details updated!');
}

async function saveGroup(){
  await createGroup();
}

async function deleteGroup(id){
  const g = (appData.groups || []).find(item => item.id === id);
  if(!g) return;
  if(!confirm(`Delete "${groupLabel(g)}"? All students and attendance history for this class will be removed.`)) return;

  appData.groups = appData.groups.filter(item => item.id !== id);
  await persist();
  renderGroupGrid();
  if(currentGroupId === id) goToDashboard();
  toast('Class deleted.');
}

async function deleteGroupCurrent(){
  if(currentGroupId) deleteGroup(currentGroupId);
}

async function toggleLockGroup(id){
  const g = (appData.groups || []).find(item => item.id === id);
  if(!g) return;

  if(!g.isLocked){
    const confirmLock = confirm(`🔒 LOCK CLASS WARNING!\n\nAre you sure you want to LOCK "${groupInstitution(g)} (${groupLabel(g)})"?\n\nOnce locked, all attendance entries, student roster, and past session records for this class will become READ-ONLY until unlocked.`);
    if(!confirmLock) return;
    g.isLocked = true;
    toast(`🔒 Class "${groupLabel(g)}" locked. All records are now read-only.`);
  } else {
    const confirmUnlock = confirm(`🔓 UNLOCK CLASS?\n\nDo you want to UNLOCK "${groupInstitution(g)} (${groupLabel(g)})" to allow adding students, modifying roster, and taking attendance?`);
    if(!confirmUnlock) return;
    g.isLocked = false;
    toast(`🔓 Class "${groupLabel(g)}" unlocked.`);
  }

  await persist();
  renderGroupGrid();
  if(currentGroupId === id) updateLockUI(g);
}

async function toggleLockCurrentGroup(){
  if(currentGroupId) toggleLockGroup(currentGroupId);
}
