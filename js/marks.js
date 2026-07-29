/* ============================================================
   ATTENDANCE MARKS SYSTEM
============================================================ */
let activeSlabsData = [];

function openMarksModal(){
  const g = getGroup();
  if(!g) return;

  const cfg = g.marksConfig || {
    enabled: false,
    maxMarks: 10,
    mode: 'proportional',
    customSlabs: [
      { minPct: 0, maxPct: 74.99, marks: 0 },
      { minPct: 75, maxPct: 84.99, marks: 5 },
      { minPct: 85, maxPct: 94.99, marks: 7.5 },
      { minPct: 95, maxPct: 100, marks: 10 }
    ]
  };

  document.getElementById('marksModalSubtitle').textContent = `${groupInstitution(g)} • ${groupLabel(g)}`;
  document.getElementById('marksEnabledToggle').checked = !!cfg.enabled;
  document.getElementById('marksMaxInput').value = cfg.maxMarks || 10;

  const modeRadios = document.getElementsByName('marksModeRadio');
  for(let r of modeRadios){
    r.checked = r.value === (cfg.mode || 'proportional');
  }

  activeSlabsData = JSON.parse(JSON.stringify(cfg.customSlabs || [
    { minPct: 0, maxPct: 74.99, marks: 0 },
    { minPct: 75, maxPct: 84.99, marks: 5 },
    { minPct: 85, maxPct: 94.99, marks: 7.5 },
    { minPct: 95, maxPct: 100, marks: 10 }
  ]));

  toggleMarksControls();
  toggleMarksModeUI();
  renderCustomSlabsTable();

  document.getElementById('marksModalBackdrop').classList.add('show');
}

function closeMarksModal(){
  document.getElementById('marksModalBackdrop').classList.remove('show');
}

function toggleMarksControls(){
  const enabled = document.getElementById('marksEnabledToggle').checked;
  const grp = document.getElementById('marksControlsGroup');
  const sec = document.getElementById('marksModeSection');
  if(grp){
    grp.style.opacity = enabled ? '1' : '0.4';
    grp.style.pointerEvents = enabled ? 'auto' : 'none';
  }
  if(sec){
    sec.style.opacity = enabled ? '1' : '0.4';
    sec.style.pointerEvents = enabled ? 'auto' : 'none';
  }
}

function toggleMarksModeUI(){
  const radios = document.getElementsByName('marksModeRadio');
  let selectedMode = 'proportional';
  for(let r of radios){
    if(r.checked){ selectedMode = r.value; break; }
  }

  const slabsEditor = document.getElementById('customSlabsEditor');
  if(slabsEditor){
    slabsEditor.style.display = selectedMode === 'custom_slabs' ? 'block' : 'none';
  }
}

function renderCustomSlabsTable(){
  const tbody = document.getElementById('slabsTableBody');
  if(!tbody) return;
  tbody.innerHTML = '';

  activeSlabsData.forEach((s, idx) => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-soft)';
    tr.innerHTML = `
      <td style="padding:4px"><input type="number" step="0.1" value="${s.minPct}" onchange="updateSlabValue(${idx},'minPct',this.value)" style="width:65px;padding:4px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:4px"> %</td>
      <td style="padding:4px"><input type="number" step="0.1" value="${s.maxPct}" onchange="updateSlabValue(${idx},'maxPct',this.value)" style="width:65px;padding:4px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:4px"> %</td>
      <td style="padding:4px"><input type="number" step="0.5" value="${s.marks}" onchange="updateSlabValue(${idx},'marks',this.value)" style="width:60px;padding:4px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:4px;font-weight:600"></td>
      <td style="padding:4px;text-align:right"><button class="icon-btn" style="color:var(--red)" onclick="deleteCustomSlabRow(${idx})">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function updateSlabValue(idx, field, val){
  if(activeSlabsData[idx]){
    activeSlabsData[idx][field] = parseFloat(val) || 0;
  }
}

function addCustomSlabRow(){
  const lastMax = activeSlabsData.length ? activeSlabsData[activeSlabsData.length - 1].maxPct : 0;
  activeSlabsData.push({
    minPct: Math.min(100, Math.round((lastMax + 0.01) * 100) / 100),
    maxPct: 100,
    marks: 10
  });
  renderCustomSlabsTable();
}

function deleteCustomSlabRow(idx){
  activeSlabsData.splice(idx, 1);
  renderCustomSlabsTable();
}

function loadCollegeSlabPreset(){
  activeSlabsData = [
    { minPct: 0, maxPct: 74.99, marks: 0 },
    { minPct: 75, maxPct: 84.99, marks: 5 },
    { minPct: 85, maxPct: 94.99, marks: 7.5 },
    { minPct: 95, maxPct: 100, marks: 10 }
  ];
  document.getElementById('marksMaxInput').value = 10;
  renderCustomSlabsTable();
  toast('College 10-Mark Preset loaded.');
}

function loadSchoolSlabPreset(){
  activeSlabsData = [
    { minPct: 0, maxPct: 74.99, marks: 0 },
    { minPct: 75, maxPct: 89.99, marks: 3 },
    { minPct: 90, maxPct: 100, marks: 5 }
  ];
  document.getElementById('marksMaxInput').value = 5;
  renderCustomSlabsTable();
  toast('School 5-Mark Preset loaded.');
}

async function saveMarksConfig(){
  const g = getGroup();
  if(!g) return;

  const enabled = document.getElementById('marksEnabledToggle').checked;
  const maxMarks = parseFloat(document.getElementById('marksMaxInput').value) || 10;

  const radios = document.getElementsByName('marksModeRadio');
  let selectedMode = 'proportional';
  for(let r of radios){
    if(r.checked){ selectedMode = r.value; break; }
  }

  g.marksConfig = {
    enabled,
    maxMarks,
    mode: selectedMode,
    customSlabs: activeSlabsData
  };

  await persist();
  closeMarksModal();
  renderReport();
  toast('Attendance marks criteria saved!');
}

function computeAttendanceMarks(pct, g){
  if(!g || !g.marksConfig || !g.marksConfig.enabled) return 0;
  const cfg = g.marksConfig;
  const maxM = cfg.maxMarks || 10;

  if(cfg.mode === 'proportional'){
    return Math.round((pct / 100) * maxM * 10) / 10;
  }

  const slabs = cfg.customSlabs || [];
  for(let s of slabs){
    if(pct >= s.minPct && pct <= s.maxPct){
      return s.marks;
    }
  }
  return 0;
}
