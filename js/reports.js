/* ============================================================
   REPORTS, EXPORTS & DATA BACKUP/RESTORE
============================================================ */

function initReportView(){
  const g = getGroup();
  if(!g) return;

  const today = new Date().toISOString().slice(0,7);
  document.getElementById('reportMonth').value = today;

  populateSubjectOptions();
  renderReport();
}

function populateSubjectOptions(){
  const g = getGroup();
  if(!g) return;
  const sel = document.getElementById('reportSubject');
  if(!sel) return;

  const subjects = new Set();
  g.sessions.forEach(s=> { if(s.subject) subjects.add(s.subject); });

  let html = '<option value="__all__">All subjects</option>';
  subjects.forEach(sub => {
    html += `<option value="${sub}">${sub}</option>`;
  });
  sel.innerHTML = html;
}

function onReportMonthChange(){
  populateSubjectOptions();
  renderReport();
}

function getMonthSessions(){
  const g = getGroup();
  if(!g) return [];
  const month = document.getElementById('reportMonth').value;
  const subjectEl = document.getElementById('reportSubject');
  const subject = subjectEl ? subjectEl.value : '__all__';
  return g.sessions.filter(s=> s.date.startsWith(month) && (subject === '__all__' || s.subject === subject));
}

function selectedSubjectLabel(){
  const sel = document.getElementById('reportSubject');
  if(!sel || sel.value === '__all__') return 'All subjects';
  return sel.value;
}

function computeReport(){
  const g = getGroup();
  const sessions = getMonthSessions();
  const total = sessions.length;
  const threshold = parseInt(document.getElementById('reportThreshold')?.value || '100', 10);

  let rows = g.students.map(s=>{
    const present = sessions.filter(sess => sess.records[s.id]).length;
    const pct = total ? Math.round((present/total)*100) : 0;
    const marks = computeAttendanceMarks(pct, g);
    return { studentId: s.id, rollNo: s.rollNo, name: s.name, present, total, pct, marks };
  }).sort((a,b)=>a.rollNo.localeCompare(b.rollNo,undefined,{numeric:true}));

  if(threshold < 100){
    rows = rows.filter(r => r.pct < threshold);
  }

  return { total, rows };
}

function resetAndRefreshReport(){
  const today = new Date().toISOString().slice(0,7);
  document.getElementById('reportMonth').value = today;
  populateSubjectOptions();
  document.getElementById('reportSubject').value = '__all__';
  document.getElementById('reportThreshold').value = '100';
  renderReport();
  toast('Report filters reset to initial state.');
}

function renderReport(){
  const g = getGroup();
  const { total, rows } = computeReport();
  const summary = document.getElementById('reportSummary');
  const avgPct = rows.length ? Math.round(rows.reduce((a,r)=>a+r.pct,0)/rows.length) : 0;
  summary.innerHTML = `
    <div class="stat-card"><div class="n">${total}</div><div class="l">Classes held</div></div>
    <div class="stat-card"><div class="n">${rows.length}</div><div class="l">Students listed</div></div>
    <div class="stat-card"><div class="n">${avgPct}%</div><div class="l">Average attendance</div></div>`;

  const daysWrap = document.getElementById('classDaysWrap');
  const sessions = getMonthSessions().slice().sort((a,b)=>a.date.localeCompare(b.date));
  if(sessions.length){
    const chips = sessions.map(s=>{
      const d = new Date(s.date+'T00:00:00');
      const label = d.toLocaleDateString('en-IN',{ day:'numeric', month:'short' });
      return `<span class="classday-chip" title="${s.subject}">${label}</span>`;
    }).join('');
    daysWrap.innerHTML = `<div class="classdays-label">Classes counted this month (${sessions.length})</div><div class="classdays-row">${chips}</div>`;
  } else {
    daysWrap.innerHTML = '';
  }

  const isMarksEnabled = g.marksConfig && g.marksConfig.enabled;
  const maxM = (g.marksConfig && g.marksConfig.maxMarks) || 10;

  const headerRow = document.getElementById('reportTableHeaderRow');
  if(headerRow){
    headerRow.innerHTML = `
      <th>Roll no.</th>
      <th>Name</th>
      <th>Present</th>
      <th>Total classes</th>
      <th>Attendance %</th>
      ${isMarksEnabled ? `<th style="color:var(--cyan)">Marks (/${maxM})</th>` : ''}
      <th>Actions</th>
    `;
  }

  const body = document.getElementById('reportTableBody');
  body.innerHTML = '';
  document.getElementById('reportEmpty').style.display = total ? (rows.length ? 'none' : 'block') : 'block';

  rows.forEach(r=>{
    const barClass = r.pct < 50 ? 'pct-low' : (r.pct < 75 ? 'pct-mid' : '');
    const marksBadge = isMarksEnabled ? `<td style="font-weight:700;color:var(--cyan)">${r.marks} / ${maxM}</td>` : '';
    const tr = document.createElement('tr');
    tr.className = 'clickable';
    tr.onclick = (e) => {
      if(!e.target.closest('button')) openStudentHistoryModal(r.studentId);
    };
    tr.innerHTML = `
      <td><span class="roll-pill">${r.rollNo}</span></td>
      <td><b>${r.name}</b> ${r.pct < 75 ? '<span class="badge-danger" style="margin-left:6px">Shortage</span>' : (r.pct >= 95 ? '<span class="badge-success" style="margin-left:6px;background:rgba(245,158,11,0.2);color:#f59e0b">⭐ Top Performer</span>' : '')}</td>
      <td>${r.present}</td>
      <td>${r.total}</td>
      <td><span class="pct-bar ${barClass}"><i style="width:${r.pct}%"></i></span>${r.pct}%</td>
      ${marksBadge}
      <td>
        <button class="icon-btn" style="color:var(--cyan)" onclick="openStudentHistoryModal('${r.studentId}')">View History</button>
        ${r.pct >= 95 ? `<button class="icon-btn" style="color:#f59e0b;margin-left:6px" onclick="event.stopPropagation(); downloadCertificatePdf('${r.studentId}')" title="Download Certificate of Appreciation">🏆 Certificate</button>` : ''}
      </td>`;
    body.appendChild(tr);
  });
}

function downloadPdf(){
  const g = getGroup();
  const { total, rows } = computeReport();
  const subjectLabel = selectedSubjectLabel();
  if(!total){ toast('No classes recorded for this month / subject yet.'); return; }

  const isMarksEnabled = g.marksConfig && g.marksConfig.enabled;
  const maxM = (g.marksConfig && g.marksConfig.maxMarks) || 10;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const institution = groupInstitution(g);
  
  const teacherName = currentUser ? currentUser.name : 'Faculty / Class Coordinator';
  const userDesig = currentUser && currentUser.designation ? currentUser.designation : (g.type === 'college' ? 'Professor' : 'Teacher');
  const displaySigTitle = userDesig.toLowerCase().includes('signature') ? userDesig : `${userDesig} Signature`;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 45);
  doc.text('ATTENDANCE REPORT', 14, 18);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 100);
  doc.text(`${institution}  |  ${groupLabel(g)}`, 14, 25);
  doc.text(`Month: ${document.getElementById('reportMonth').value}   |   Subject: ${subjectLabel}   |   Classes held: ${total}`, 14, 31);

  const sessions = getMonthSessions().slice().sort((a,b)=>a.date.localeCompare(b.date));
  const sessionLine = sessions.map(s=>{
    const d = new Date(s.date+'T00:00:00');
    const label = d.toLocaleDateString('en-IN',{ day:'numeric', month:'short' });
    return subjectLabel === 'All subjects' ? `${label} (${s.subject})` : label;
  }).join(',  ');

  doc.setFontSize(9);
  doc.setTextColor(100);
  const wrapped = doc.splitTextToSize(`Classes: ${sessionLine}`, 180);
  doc.text(wrapped, 14, 37);
  const tableStartY = 37 + (wrapped.length * 4) + 6;

  const headCols = isMarksEnabled 
    ? [['Roll no.', 'Name', 'Present', 'Total classes', 'Attendance %', `Marks (/${maxM})`]]
    : [['Roll no.', 'Name', 'Present', 'Total classes', 'Attendance %']];

  const bodyData = rows.map(r => {
    return isMarksEnabled 
      ? [r.rollNo, r.name, r.present, r.total, r.pct + '%', `${r.marks}/${maxM}`]
      : [r.rollNo, r.name, r.present, r.total, r.pct + '%'];
  });

  doc.autoTable({
    startY: tableStartY,
    margin: { bottom: 25, top: 15, left: 14, right: 14 },
    head: headCols,
    body: bodyData,
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [124, 58, 237], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    doc.saveGraphicsState();
    const instText = institution.toUpperCase();
    let watermarkFontSize = Math.floor(750 / Math.max(instText.length, 10));
    watermarkFontSize = Math.min(46, Math.max(26, watermarkFontSize));

    if(doc.GState){
      try {
        doc.setGState(new doc.GState({ opacity: 0.07 }));
      } catch(e){}
    }

    doc.setFontSize(watermarkFontSize);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(242, 244, 252);
    
    doc.text(instText, pageWidth / 2, pageHeight / 2 + 10, { align: 'center', angle: 22 });
    doc.restoreGraphicsState();

    const sigX = pageWidth - 14;
    const sigY = pageHeight - 16;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 45);
    doc.text(teacherName, sigX, sigY - 5, { align: 'right' });

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110, 110, 130);
    doc.text(displaySigTitle, sigX, sigY + 1, { align: 'right' });

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 150);
    doc.text(`Page ${i} of ${pageCount}`, 14, sigY + 1);
  }

  const fileSubject = subjectLabel === 'All subjects' ? 'all-subjects' : subjectLabel.replace(/\s+/g,'_');
  doc.save(`attendance-${institution.replace(/\s+/g,'_')}-${fileSubject}-${document.getElementById('reportMonth').value}.pdf`);
  toast('PDF downloaded with watermark & signature.');
}

function downloadCsvMatrix(){
  const g = getGroup();
  const sessions = getMonthSessions().slice().sort((a,b)=>a.date.localeCompare(b.date));
  const { rows } = computeReport();
  if(!rows.length){ toast('No data to export.'); return; }

  const isMarksEnabled = g.marksConfig && g.marksConfig.enabled;
  const maxM = (g.marksConfig && g.marksConfig.maxMarks) || 10;

  let csv = 'Roll No,Name,' + sessions.map(s => `"${s.date} (${s.subject.replace(/"/g,'""')})"`).join(',') + ',Total Present,Total Classes,Percentage' + (isMarksEnabled ? `,Marks (out of ${maxM})` : '') + '\n';

  rows.forEach(r => {
    let rowStr = `"${r.rollNo}","${r.name}",`;
    const sStatuses = sessions.map(s => s.records[r.studentId] ? 'P' : 'A');
    rowStr += sStatuses.join(',') + `,${r.present},${r.total},${r.pct}%` + (isMarksEnabled ? `,${r.marks}` : '') + '\n';
    csv += rowStr;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance-matrix-${groupInstitution(g).replace(/\s+/g,'_')}-${document.getElementById('reportMonth').value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Attendance Matrix exported to CSV.');
}

/* ---------- Backup & Restore ---------- */
function openBackupModal(){
  const backdrop = document.getElementById('backupModalBackdrop');
  if(backdrop){
    backdrop.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(5,5,10,0.85);display:flex !important;align-items:center;justify-content:center;z-index:999999;padding:20px;backdrop-filter:blur(4px);";
    backdrop.classList.add('show');
  }
}
function closeBackupModal(){
  const backdrop = document.getElementById('backupModalBackdrop');
  if(backdrop){
    backdrop.style.cssText = "display:none !important;";
    backdrop.classList.remove('show');
  }
}

function downloadDataBackup(){
  if(!currentUser){ toast('Please log in first.'); return; }
  const backup = {
    user: currentUser,
    data: appData,
    exportDate: new Date().toISOString(),
    version: '1.1'
  };
  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendo-backup-${currentUser.email}-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup downloaded successfully.');
}

async function restoreDataBackup(){
  const fileInput = document.getElementById('backupFileInput');
  if(!fileInput || !fileInput.files || !fileInput.files[0]){
    toast('Please select a JSON backup file.');
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if(parsed && parsed.data && Array.isArray(parsed.data.groups)){
        appData = parsed.data;
        await persist();
        closeBackupModal();
        if(currentGroupId) openGroup(currentGroupId);
        else goToDashboard();
        toast('Data restored successfully!');
      } else {
        toast('Invalid backup file format.');
      }
    } catch(err) {
      console.error(err);
      toast('Failed to parse backup file.');
    }
  };
  reader.readAsText(file);
}
