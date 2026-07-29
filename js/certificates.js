/* ============================================================
   CERTIFICATE OF APPRECIATION PDF GENERATOR (>= 95% THRESHOLD)
============================================================ */

function downloadCertificatePdf(studentId){
  const g = getGroup();
  if(!g) return;
  const student = g.students.find(s => s.id === studentId);
  if(!student) return;

  const monthSessions = getMonthSessions();
  const totalClasses = monthSessions.length;
  const presentCount = monthSessions.filter(sess => sess.records[studentId]).length;
  const pct = totalClasses ? Math.round((presentCount / totalClasses) * 100) : 0;

  if(pct < 95){
    toast(`Certificate requires at least 95% attendance (${student.name} has ${pct}%).`);
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();  // 297mm
  const ph = doc.internal.pageSize.getHeight(); // 210mm

  const instName = groupInstitution(g);
  const teacherName = currentUser ? currentUser.name : 'Faculty Coordinator';
  const userDesig = currentUser && currentUser.designation ? currentUser.designation : (g.type === 'college' ? 'Professor' : 'Teacher');
  const subjectName = selectedSubjectLabel();

  // Decorative Outer Double Border (Gold/Violet theme)
  doc.setLineWidth(1.5);
  doc.setDrawColor(124, 58, 237); // Violet
  doc.rect(8, 8, pw - 16, ph - 16);

  doc.setLineWidth(0.5);
  doc.setDrawColor(245, 158, 11); // Gold
  doc.rect(11, 11, pw - 22, ph - 22);

  // Background Watermark (Institution Name centered ASCII clean)
  doc.saveGraphicsState();
  const cleanWatermarkText = instName.toUpperCase().replace(/[^\x00-\x7F]/g, "");
  let watermarkFontSize = Math.floor(650 / Math.max(cleanWatermarkText.length, 10));
  watermarkFontSize = Math.min(38, Math.max(20, watermarkFontSize));

  doc.setFontSize(watermarkFontSize);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(240, 238, 250);
  doc.text(cleanWatermarkText, pw / 2, ph / 2 + 10, { align: 'center', angle: 18 });
  doc.restoreGraphicsState();

  // Institution Header
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(40, 40, 60);
  doc.text(instName.toUpperCase(), pw / 2, 28, { align: 'center' });

  // Main Title
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(124, 58, 237);
  doc.text("CERTIFICATE OF APPRECIATION", pw / 2, 46, { align: 'center' });

  // Subtitle Wording
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 120);
  doc.text("This certificate is proudly awarded to", pw / 2, 58, { align: 'center' });

  // Student Name & Roll Number
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(124, 58, 237);
  doc.text(student.name.toUpperCase(), pw / 2, 72, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(60, 60, 80);
  doc.text(`Roll Number: ${student.rollNo}   •   ${groupLabel(g)}`, pw / 2, 81, { align: 'center' });

  // Descriptive Wording
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(70, 70, 90);
  const awardWording = `In recognition of achieving an exemplary attendance record of ${pct}% (${presentCount}/${totalClasses} classes) in the subject of "${subjectName}". Your dedication, commitment, and regular attendance reflect outstanding academic discipline.`;
  const wrappedBody = doc.splitTextToSize(awardWording, pw - 70);
  doc.text(wrappedBody, pw / 2, 96, { align: 'center' });

  // Gold Badge Display Box
  doc.setFillColor(254, 243, 199);
  doc.setDrawColor(245, 158, 11);
  doc.roundedRect(pw / 2 - 45, 122, 90, 14, 3, 3, 'FD');

  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(180, 83, 9);
  doc.text(`${pct}% ATTENDANCE EXCELLENCE AWARD`, pw / 2, 131, { align: 'center' });

  // Signatures & Issue Info at Bottom
  const sigY = ph - 30;

  // Left: Date & Cert ID
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(50, 50, 70);
  doc.text(`Date of Issue: ${new Date().toLocaleDateString('en-IN')}`, 30, sigY);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 110, 130);
  doc.text(`Cert ID: ATT-${student.rollNo}-${Date.now().toString(36).toUpperCase()}`, 30, sigY + 6);

  // Right: Teacher / Professor Signature
  const sigX = pw - 45;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 45);
  doc.text(teacherName, sigX - 5, sigY + 4, { align: 'center' });

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 110, 130);
  doc.text(`${userDesig} Signature`, sigX - 5, sigY + 9, { align: 'center' });

  doc.save(`certificate-${student.name.replace(/\s+/g,'_')}-${student.rollNo}.pdf`);
  toast(`Certificate generated for ${student.name}!`);
}

function downloadTopPerformersCertificates(){
  const { rows } = computeReport();
  const topPerformers = rows.filter(r => r.pct >= 95);
  if(!topPerformers.length){
    toast('No students with >= 95% attendance found.');
    return;
  }

  topPerformers.forEach((r, idx) => {
    setTimeout(() => {
      downloadCertificatePdf(r.studentId);
    }, idx * 400);
  });
  toast(`Generating certificates for ${topPerformers.length} top performer(s)...`);
}
