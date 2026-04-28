// ════════════════════════════════════════════
//  HSK CLASSROOM — Student JS (Sidebar Layout)
// ════════════════════════════════════════════

// ── State ──
let currentUser   = null;
let allVocab      = [];
let practiceMode  = 'meaning';
let practiceQueue = [];
let practiceIdx   = 0;
let practiceAnswered = false;
let currentStuLevel = 1; // Unified Global Level Tracker
let allSentences   = [];
let hskReviewTarget = 2;
let hskReviewQueue  = [];
let hskReviewIdx    = 0;
let hskReviewAnswered = false;
let activeQuizId    = null;
let quizVocab       = [];
let quizIdx         = 0;
let quizAnswered    = false;
let quizCorrect     = 0;
let quizTimerInterval = null;
let quizTimerLeft   = 0;
let quizTimerTotal  = 0;
let filteredVocab  = [];
let vqQuestions    = [];
let vqIdx          = 0;
let vqScore        = 0;
let vqCurrentMode  = 0; // 0: Hanzi->Meaning, 1: Meaning->Hanzi
let vqAnswered     = false;

const AVATAR_COLORS = ['#C84B31','#3D6B4F','#2A5FA5','#6B3FA0','#C08830','#1F7A4D','#8B4513','#2E86C1'];
function avatarColor(name) { let h=0; for(let c of name) h=(h+c.charCodeAt(0))%AVATAR_COLORS.length; return AVATAR_COLORS[h]; }
function initials(name) { return name.trim().split(' ').slice(-2).map(w=>w[0]).join('').toUpperCase().slice(0,2); }
function shuffle(a) { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];} return b; }
function fmtDate(dt) { return dt ? new Date(dt).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—'; }

// ── TTS ──
function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const ut = new SpeechSynthesisUtterance(text);
  ut.lang = 'zh-CN';
  ut.rate = 0.8;
  window.speechSynthesis.speak(ut);
}

// ── Init ──
(async () => {
  try {
    const { data:{ session } } = await sb.auth.getSession();
    if (!session) { window.location.replace('index.html'); return; }
    currentUser = session.user;
    
    const { data:profile, error:profErr } = await sb.from('profiles').select('*').eq('id',currentUser.id).single();
    if (profErr || !profile || profile.role !== 'student') { 
      console.error("Auth error:", profErr);
      window.location.replace('index.html'); 
      return; 
    }
    
    document.getElementById('stu-name').textContent   = profile.full_name;
    document.getElementById('stu-avatar').textContent = initials(profile.full_name);
    document.getElementById('stu-avatar').style.background = avatarColor(profile.full_name);
    
    // Set global student level early
    currentStuLevel = profile.current_level || 1;
    
    // 1. First, get the correct level
    await loadHskLevel();
    
    // 2. Then load data based on that level
    await Promise.allSettled([
      loadVocab(), 
      loadLessons(), 
      loadAssigned(), 
      loadHistory(), 
      loadAnnouncements(),
      loadSentences()
    ]);

    // Attach Filter Event Listeners (Teacher Style)
    const sInput = document.getElementById('search-vocab');
    const lSelect = document.getElementById('filter-vocab-level');
    const cSelect = document.getElementById('filter-vocab-cat');
    if (sInput) sInput.addEventListener('input', filterVocab);
    if (lSelect) lSelect.addEventListener('change', filterVocab);
    if (cSelect) cSelect.addEventListener('change', filterVocab);

    const sSent = document.getElementById('search-sentences');
    const lSent = document.getElementById('filter-sent-stu-level');
    const cSent = document.getElementById('filter-sent-stu-cat');
    if (sSent) sSent.addEventListener('input', filterSentences);
    if (lSent) lSent.addEventListener('change', filterSentences);
    if (cSent) cSent.addEventListener('change', filterSentences);

    const vqBtn = document.getElementById('vocab-quiz-btn');
    if (vqBtn) vqBtn.addEventListener('click', startVocabQuiz);

    const sqBtn = document.getElementById('sentence-quiz-btn');
    if (sqBtn) sqBtn.addEventListener('click', () => startSentenceQuiz('full'));

    const swBtn = document.getElementById('sentence-word-quiz-btn');
    if (swBtn) swBtn.addEventListener('click', () => startSentenceQuiz('words'));

  } catch (err) {
    console.error("Init crash:", err);
    showToast("Lỗi khởi động hệ thống. Vui lòng tải lại trang.");
  }
})();

// ── Navigation ──
function showPanel(id) {
  document.querySelectorAll('.tab-panel').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  document.getElementById('panel-'+id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(btn=>{
    if(btn.getAttribute('onclick')===`showPanel('${id}')`) btn.classList.add('active');
  });

  if (id === 'announcements') {
    const badge = document.getElementById('ann-badge');
    if (badge) badge.style.display = 'none';
    // Mark latest as seen
    sb.from('announcements').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => {
      if (data) localStorage.setItem('hsk_last_ann_id', data.id);
    });
  }

  closeSidebar();
  if (id === 'leaderboard') loadLeaderboard();
  if (id === 'announcements') loadAnnouncements();
  if (id === 'lessons') loadLessons();
  if (id === 'sentences') loadSentences();
}
function openSidebar()  { document.getElementById('sidebar').classList.add('open'); document.getElementById('mobile-overlay').classList.add('open'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('mobile-overlay').classList.remove('open'); }

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

async function logout() { await sb.auth.signOut(); window.location.replace('index.html'); }

function showToast(msg,dur=3000){
  const el=document.getElementById('toast-msg');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),dur);
}

// ══════════════════════════════════════════
//  VOCAB (Identical to Teacher)
// ══════════════════════════════════════════
async function loadVocab() {
  // Fetch ALL words but we will filter visibility in render
  const { data } = await sb.from('vocab').select('*')
    .order('hsk_level').order('id').limit(2000);
    
  allVocab = data || [];
  // Initially show only up to current level
  filteredVocab = allVocab.filter(v => v.hsk_level <= currentStuLevel);
  renderVocabTable(filteredVocab);
}

function renderVocabTable(list) {
  const el = document.getElementById('vocab-list');
  if (!el) return;
  if (!list.length) { el.innerHTML = '<tr><td colspan="5" class="empty-state">Chưa có từ vựng nào.</td></tr>'; return; }
  
  const sorted = [...list].sort((a, b) => {
    if (a.hsk_level !== b.hsk_level) return a.hsk_level - b.hsk_level;
    return (a.category || 'Khác').localeCompare(b.category || 'Khác');
  });
  
  let currentLvl = null;
  let currentCat = null;
  el.innerHTML = sorted.map(v => {
    let groupRow = '';
    const vLvl = v.hsk_level || 1;
    const vCat = v.category || 'Khác';
    
    if (vLvl !== currentLvl) {
      currentLvl = vLvl;
      currentCat = vCat;
      groupRow = `<tr class="table-group-header-lvl"><td colspan="5">🏆 Cấp độ HSK ${currentLvl}</td></tr>
                  <tr class="table-group-header"><td colspan="5">📁 Chủ đề: ${currentCat}</td></tr>`;
    } else if (vCat !== currentCat) {
      currentCat = vCat;
      groupRow = `<tr class="table-group-header"><td colspan="5">📁 Chủ đề: ${currentCat}</td></tr>`;
    }
    
    return `
      ${groupRow}
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="btn-speak" onclick="speak('${v.hanzi}')">🔊</button>
            <div class="vocab-hanzi">${v.hanzi}</div>
          </div>
        </td>
        <td><div class="vocab-pinyin">${v.pinyin}</div></td>
        <td><div class="vocab-meaning">${v.meaning}</div></td>
        <td>${hskBadge(v.hsk_level || 1)}</td>
        <td><span class="badge" style="background:var(--surface2);color:var(--text2)">${v.category || 'Khác'}</span></td>
      </tr>`;
  }).join('');
}

function filterVocab() {
  const q = document.getElementById('search-vocab').value.toLowerCase().trim();
  const cat = document.getElementById('filter-vocab-cat').value;
  const lvl = document.getElementById('filter-vocab-level').value;
  
  // 1. If student specifically selects a LOCKED level from the dropdown
  if (lvl && parseInt(lvl) > currentStuLevel) {
    const el = document.getElementById('vocab-list');
    el.innerHTML = `<tr><td colspan="5" class="empty-state">
      <div style="padding:30px; background:var(--surface2); border-radius:var(--r); border:1px dashed var(--border);">
        <div style="font-size:32px; margin-bottom:12px;">🔒</div>
        <div style="font-weight:700; color:var(--text); font-size:16px;">Cấp độ HSK ${lvl} đang bị khóa</div>
        <p style="font-size:13px; color:var(--text2); margin-top:6px; max-width:300px; margin-left:auto; margin-right:auto;">
          Bạn cần đạt cấp độ HSK ${lvl} để tra cứu từ điển và làm bài tập trong kho dữ liệu này.
        </p>
      </div>
    </td></tr>`;
    return;
  }

  // 2. Filter what student IS ALLOWED to see
  filteredVocab = allVocab.filter(v => 
    v.hsk_level <= currentStuLevel &&
    (!q || v.hanzi.toLowerCase().includes(q) || v.pinyin.toLowerCase().includes(q) || v.meaning.toLowerCase().includes(q)) &&
    (!cat || v.category === cat) &&
    (!lvl || v.hsk_level == lvl)
  );
  
  const el = document.getElementById('vocab-list');
  if (filteredVocab.length > 0) {
    renderVocabTable(filteredVocab);
  } else {
    // 3. If no results, check if the query exists in HIGHER levels (Search mode)
    if (q) {
      const lockedMatch = allVocab.find(v => 
        v.hsk_level > currentStuLevel &&
        (v.hanzi.toLowerCase().includes(q) || v.pinyin.toLowerCase().includes(q) || v.meaning.toLowerCase().includes(q))
      );
      
      if (lockedMatch) {
        el.innerHTML = `<tr><td colspan="5" class="empty-state">
          <div style="padding:20px; background:var(--primary-bg); border-radius:var(--r); border:1px dashed var(--primary);">
            <div style="font-size:24px; margin-bottom:8px;">🔒</div>
            <div style="font-weight:700; color:var(--primary);">Từ này thuộc HSK ${lockedMatch.hsk_level}</div>
            <p style="font-size:13px; color:var(--text2); margin-top:4px;">Bạn cần đạt cấp độ HSK ${lockedMatch.hsk_level} để mở khóa từ này!</p>
          </div>
        </td></tr>`;
        return;
      }
    }
    el.innerHTML = '<tr><td colspan="5" class="empty-state">Không tìm thấy từ vựng nào.</td></tr>';
  }
}

function startVocabQuiz() {
  if (!allVocab || allVocab.length === 0) {
    showToast("Đang tải dữ liệu, vui lòng đợi giây lát...");
    return;
  }
  
  const overlay = document.getElementById('vocab-quiz-overlay');
  if (overlay) {
    overlay.classList.add('open');
    renderVQSetup();
  }
}

function renderVQSetup() {
  const container = document.getElementById('vq-area');
  const prog = document.getElementById('vq-prog');
  if (prog) prog.style.width = '0%';
  
  let hskButtons = '';
  for (let i = 1; i <= currentStuLevel; i++) {
    hskButtons += `
      <button class="btn-ghost" 
        style="border:1px solid var(--border); padding:15px; flex:1; cursor:pointer; font-weight:600; transition:all 0.2s;" 
        onmouseover="this.style.background='var(--primary-bg)'; this.style.color='var(--primary)'" 
        onmouseout="this.style.background='none'; this.style.color='var(--text2)'"
        onclick="startVocabQuizFiltered(${i})">HSK ${i}</button>`;
  }

  container.innerHTML = `
    <div style="text-align:center; padding:40px 20px;">
      <div style="font-size:50px; margin-bottom:20px;">📝</div>
      <h2 style="font-family:'DM Serif Display',serif; font-size:26px; margin-bottom:10px;">Thiết lập bài tập từ vựng</h2>
      <p style="color:var(--text2); margin-bottom:30px;">Chọn phạm vi bạn muốn ôn tập:</p>
      
      <div style="display:flex; flex-direction:column; gap:12px; max-width:320px; margin:0 auto;">
        <button class="btn-primary" 
          style="padding:18px; font-size:16px; cursor:pointer; box-shadow:0 4px 15px rgba(200,75,49,0.2);" 
          onclick="startVocabQuizFiltered('all')">🌟 Tổng hợp (HSK 1 - ${currentStuLevel})</button>
        <div style="display:flex; gap:8px;">
          ${hskButtons}
        </div>
      </div>
    </div>
  `;
}

function startVocabQuizFiltered(mode) {
  let pool = [];
  if (mode === 'all') {
    pool = allVocab.filter(v => v.hsk_level <= currentStuLevel);
  } else {
    pool = allVocab.filter(v => v.hsk_level === mode);
  }

  if (pool.length < 4) {
    showToast("Không đủ từ vựng trong phạm vi này để làm trắc nghiệm.");
    return;
  }

  vqQuestions = shuffle(pool).slice(0, 10);
  vqIdx = 0;
  vqScore = 0;
  renderVQ();
}

function exitVocabQuiz() {
  if (vqIdx < vqQuestions.length && vqIdx > 0) {
    if (!confirm("Bạn có muốn thoát bài tập đang làm không?")) return;
  }
  document.getElementById('vocab-quiz-overlay').classList.remove('open');
}

function renderVQ() {
  const cur = vqQuestions[vqIdx];
  const container = document.getElementById('vq-area');
  const prog = document.getElementById('vq-prog');
  const overlay = document.querySelector('#vocab-quiz-overlay .hsk-overlay-inner');
  
  // Progress Bar
  if (prog) prog.style.width = `${(vqIdx / vqQuestions.length) * 100}%`;
  if (overlay) overlay.scrollTop = 0;
  if (container) container.scrollTop = 0;
  
  // Force browser to clear any persisting hover states from touch events
  if (container) {
    container.style.pointerEvents = 'none';
    // Force reflow to clear hover state
    void container.offsetHeight;
    container.style.pointerEvents = 'auto';
  }
  
  // Randomize mode: 0 = Hanzi to Meaning, 1 = Meaning to Hanzi
  vqCurrentMode = Math.random() > 0.5 ? 0 : 1;
  vqAnswered = false;
  
  const wrong = shuffle(allVocab.filter(v => v.id !== cur.id)).slice(0, 3);
  const options = shuffle([cur, ...wrong]);
  
  container.innerHTML = `
    <div class="question-card" style="margin-top:20px; box-shadow: 0 15px 40px rgba(0,0,0,0.08); border: none; background: rgba(255,255,255,0.85);">
      <div class="q-label">${vqCurrentMode === 0 ? 'Từ này có nghĩa là gì?' : 'Nghĩa này là từ nào?'}</div>
      
      ${vqCurrentMode === 0 
        ? `<div style="display:flex; justify-content:center; align-items:center;">
             <div class="q-hanzi" style="margin:0;">${cur.hanzi}</div>
           </div>`
        : `<div class="q-hanzi" style="font-size:32px; font-family:'DM Sans', sans-serif; color: var(--text);">${cur.meaning}</div>
           <div style="display:flex; justify-content:center; align-items:center; gap:8px; margin-top:8px;">
             <div class="q-pinyin" style="font-size:16px; color:var(--text3); font-family:'DM Sans', sans-serif; margin:0;">${cur.pinyin}</div>
             <button class="btn-speak" style="width:34px;height:34px;font-size:16px;" onclick="speak('${cur.hanzi.replace(/'/g, "\\'")}')">🔊</button>
           </div>`
      }
      
      <div class="q-num">Câu ${vqIdx + 1} / ${vqQuestions.length}</div>
    </div>
    
    <div class="options-grid" style="margin-top:30px;">
      ${options.map(opt => `
        <button type="button" class="opt-btn" style="border-color:var(--border);background:var(--surface);color:inherit;"
          ${vqCurrentMode === 0
            ? `onmouseenter="speak('${opt.hanzi.replace(/'/g, "\\'")}')" onclick="speak('${opt.hanzi.replace(/'/g, "\\'")}'); handleVQAns(this, ${opt.id === cur.id})"`
            : `onclick="handleVQAns(this, ${opt.id === cur.id})"`}>
          ${vqCurrentMode === 0 
            ? `<span class="opt-main">${opt.meaning}</span>
               <span class="opt-pinyin">${opt.pinyin}</span>`
            : `<span class="opt-main" style="font-size:24px;">${opt.hanzi}</span>`
          }
        </button>
      `).join('')}
    </div>
    <div id="vq-feedback" class="feedback"></div>
  `;
}

function handleVQAns(btn, isCorrect) {
  if (vqAnswered) return;
  vqAnswered = true;
  const btns = document.querySelectorAll('#vq-area .opt-btn');
  btns.forEach(b => {
    b.disabled = true;
    b.style.pointerEvents = 'none';
  });
  const fb = document.getElementById('vq-feedback');
  const cur = vqQuestions[vqIdx];
  
  if (isCorrect) {
    vqScore++;
    btn.classList.add('correct');
    fb.textContent = '✓ Chính xác!';
    fb.className = 'feedback correct';
  } else {
    btn.classList.add('wrong');
    // Find correct button based on mode
    const correctText = vqCurrentMode === 0 ? cur.meaning : cur.hanzi;
    const correctBtn = Array.from(btns).find(b => b.querySelector('.opt-main').innerText === correctText);
    if (correctBtn) correctBtn.classList.add('correct');
    
    fb.textContent = `✗ Sai rồi! Đáp án: ${cur.hanzi} (${cur.pinyin}) - ${cur.meaning}`;
    fb.className = 'feedback wrong';
  }
  
  fb.style.display = 'block';
  const isTouchMobile = window.matchMedia('(max-width: 480px), (hover: none) and (pointer: coarse)').matches;
  const advanceDelay = isTouchMobile ? 650 : 1200;
  
  setTimeout(() => {
    vqIdx++;
    if (vqIdx < vqQuestions.length) {
      renderVQ();
    } else {
      showVQResult();
    }
  }, advanceDelay);
}

function showVQResult() {
  const container = document.getElementById('vq-area');
  const prog = document.getElementById('vq-prog');
  if (prog) prog.style.width = '100%';
  
  const pct = Math.round((vqScore / vqQuestions.length) * 100);
  
  container.innerHTML = `
    <div style="text-align:center;padding:60px 20px;">
      <div style="font-size:80px;margin-bottom:20px;">${pct >= 80 ? '🏆' : pct >= 50 ? '👏' : '📚'}</div>
      <h2 style="font-family:'DM Serif Display',serif;font-size:32px;margin-bottom:10px;">Hoàn thành!</h2>
      <p style="color:var(--text2);font-size:18px;margin-bottom:40px;">Bạn trả lời đúng <strong>${vqScore}/${vqQuestions.length}</strong> câu (${pct}%).</p>
      <button class="btn-primary" style="padding:15px 40px;font-size:16px;" onclick="exitVocabQuiz()">Quay lại Từ điển</button>
    </div>
  `;
}

// ── SHORT SENTENCES ──
let sqQuestions = [];
let sqIdx = 0;
let sqScore = 0;
let sqBlankTarget = null;
let sqArrangeSegments = [];
let sqArrangeSelected = [];
let sqArrangeExpected = "";

function segmentChinese(text) {
  if (window.Intl && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
    return Array.from(segmenter.segment(text)).map(s => ({ text: s.segment, isWord: s.isWordLike }));
  }
  return text.split('').map(c => ({ text: c, isWord: !/[.,?!;:'"()，。？！；：“”（） \n]/.test(c) }));
}

async function loadSentences() {
  try {
    // Load all sentence levels so HSK4 rows are always visible in the table.
    // Quiz/practice gating still uses currentStuLevel.
    const { data, error } = await sb.from('short_sentences').select('*')
      .order('hsk_level').order('id');
      
    if (error) {
      console.warn("LoadSentences failed:", error);
      throw error;
    }
    
    allSentences = data || [];
    filterSentences();
  } catch(e) { 
    console.error("LoadSentences fatal error:", e); 
    const el = document.getElementById('sentences-list-stu');
    if (el) el.innerHTML = '<tr><td colspan="4" class="empty-state">Lỗi tải dữ liệu câu.</td></tr>';
  }
}

let sqQuizType = 'full'; // 'full' or 'words'

function startSentenceQuiz(type = 'full') {
  sqQuizType = type;
  if (!allSentences || allSentences.length === 0) {
    showToast("Đang tải dữ liệu, vui lòng đợi giây lát...");
    return;
  }
  
  const overlay = document.getElementById('vocab-quiz-overlay');
  if (overlay) {
    overlay.classList.add('open');
    const title = overlay.querySelector('.overlay-topbar strong');
    if (title) title.textContent = type === 'full' ? 'Trắc nghiệm Dịch câu' : 'Trắc nghiệm Điền & Xếp từ';
    renderSQSetup();
  }
}

function renderSQSetup() {
  const container = document.getElementById('vq-area'); // Reuse area
  const prog = document.getElementById('vq-prog');
  if (prog) prog.style.width = '0%';
  
  let hskButtons = '';
  for (let i = 1; i <= currentStuLevel; i++) {
    hskButtons += `
      <button class="btn-ghost" 
        style="border:1px solid var(--border); padding:15px; flex:1; cursor:pointer; font-weight:600; transition:all 0.2s;" 
        onmouseover="this.style.background='var(--primary-bg)'; this.style.color='var(--primary)'" 
        onmouseout="this.style.background='none'; this.style.color='var(--text2)'"
        onclick="startSentenceQuizFiltered(${i})">HSK ${i}</button>`;
  }

  container.innerHTML = `
    <div style="text-align:center; padding:40px 20px;">
      <div style="font-size:50px; margin-bottom:20px;">💬</div>
      <h2 style="font-family:'DM Serif Display',serif; font-size:24px; margin-bottom:10px;">Thiết lập bài tập câu</h2>
      <p style="color:var(--text2); margin-bottom:30px;">Chọn phạm vi mẫu câu bạn muốn ôn tập:</p>
      
      <div style="display:flex; flex-direction:column; gap:12px; max-width:320px; margin:0 auto;">
        <button class="btn-primary" 
          style="padding:18px; font-size:16px; cursor:pointer; box-shadow:0 4px 15px rgba(200,75,49,0.2);" 
          onclick="startSentenceQuizFiltered('all')">🌟 Tổng hợp (HSK 1 - ${currentStuLevel})</button>
        <div style="display:flex; gap:8px;">
          ${hskButtons}
        </div>
      </div>
    </div>
  `;
}

function startSentenceQuizFiltered(mode) {
  let pool = [];
  if (mode === 'all') {
    pool = allSentences.filter(s => (s.hsk_level || 1) <= currentStuLevel);
  } else {
    pool = allSentences.filter(s => (s.hsk_level || 1) === mode);
  }

  if (pool.length < 4) {
    showToast("Không đủ câu trong phạm vi này để làm trắc nghiệm. Hãy kiểm tra lại cấp độ HSK của câu trong SQL.");
    return;
  }

  sqQuestions = shuffle(pool).slice(0, 10);
  sqIdx = 0;
  sqScore = 0;
  renderSQ();
}

let sqCurrentMode = 0; // 0: Hanzi->VN, 1: VN->Hanzi, 2: Fill-in-blank, 3: Arrange Words

function renderSQ() {
  const cur = sqQuestions[sqIdx];
  const container = document.getElementById('vq-area');
  const prog = document.getElementById('vq-prog');
  const overlay = document.querySelector('#vocab-quiz-overlay .hsk-overlay-inner');
  
  if (prog) prog.style.width = `${(sqIdx / sqQuestions.length) * 100}%`;
  if (overlay) overlay.scrollTop = 0;
  if (container) container.scrollTop = 0;
  
  if (sqQuizType === 'full') {
    sqCurrentMode = Math.random() > 0.5 ? 0 : 1;
  } else {
    sqCurrentMode = Math.random() > 0.5 ? 2 : 3;
  }
  
  const segments = segmentChinese(cur.chinese);
  const wordsOnly = segments.filter(s => s.isWord).map(s => s.text);
  
  // Fallback if sentence is too simple
  if ((sqCurrentMode === 2 || sqCurrentMode === 3) && wordsOnly.length < 2) {
    sqCurrentMode = Math.random() > 0.5 ? 0 : 1;
  }
  
  if (sqCurrentMode === 0 || sqCurrentMode === 1) {
    const wrong = shuffle(allSentences.filter(s => s.id !== cur.id)).slice(0, 3);
    const options = shuffle([cur, ...wrong]);
    
    container.innerHTML = `
      <div class="question-card" style="margin-top:20px; box-shadow: 0 15px 40px rgba(0,0,0,0.08); border: none; background: rgba(255,255,255,0.85); padding:32px 24px 24px;">
        <div class="q-label">${sqCurrentMode === 0 ? 'Câu này có nghĩa là gì?' : 'Dịch câu này sang tiếng Trung:'}</div>
        
        ${sqCurrentMode === 0 
          ? `<div style="display:flex; justify-content:center; align-items:center; gap:15px;">
               <div class="q-hanzi" style="font-size:32px; margin:0;">${cur.chinese}</div>
             </div>`
          : `<div class="q-hanzi" style="font-size:24px; font-family:'DM Sans', sans-serif; color: var(--text); line-height:1.4;">${cur.meaning}</div>
             <div style="display:flex; justify-content:center; align-items:center; gap:8px; margin-top:8px;">
               <div class="q-pinyin" style="font-size:16px; color:var(--text3); font-family:'DM Sans', sans-serif; margin:0;">${cur.pinyin}</div>
               <button class="btn-speak" style="width:34px;height:34px;font-size:16px;" onclick="speak('${cur.chinese.replace(/'/g, "\\'")}')">🔊</button>
             </div>`
        }
        
        <div class="q-num">Câu ${sqIdx + 1} / ${sqQuestions.length}</div>
      </div>
      
      <div class="options-grid" style="margin-top:30px;">
        ${options.map(opt => `
          <button class="opt-btn" style="border-color:var(--border);background:var(--surface);color:inherit;"
            ${sqCurrentMode === 0
              ? `onmouseenter="speak('${opt.chinese.replace(/'/g, "\\'")}')" onclick="speak('${opt.chinese.replace(/'/g, "\\'")}'); handleSQAns(this, ${opt.id === cur.id})"`
              : `onclick="handleSQAns(this, ${opt.id === cur.id})"`}>
            ${sqCurrentMode === 0 
              ? `<span class="opt-main" style="font-size:15px;">${opt.meaning}</span>
                 <span class="opt-pinyin" style="font-size:12px;">${opt.pinyin}</span>`
              : `<span class="opt-main" style="font-size:18px;">${opt.chinese}</span>`
            }
          </button>
        `).join('')}
      </div>
      <div id="vq-feedback" class="feedback"></div>
    `;
  } 
  else if (sqCurrentMode === 2) {
    // Fill in the blank
    sqBlankTarget = wordsOnly[Math.floor(Math.random() * wordsOnly.length)];
    let replaced = false;
    let displayHtml = '';
    for (let s of segments) {
      if (!replaced && s.text === sqBlankTarget) {
        displayHtml += `<span style="display:inline-block; min-width:40px; border-bottom:2px solid var(--primary); margin:0 4px; color:transparent;">_</span>`;
        replaced = true;
      } else {
        displayHtml += s.text;
      }
    }
    
    // Attempt to get wrong options from allVocab, fallback to random other words
    let wrongWords = allVocab.filter(v => v.hanzi !== sqBlankTarget);
    if (wrongWords.length < 3) wrongWords = [{hanzi:'的', pinyin:'de'}, {hanzi:'是', pinyin:'shì'}, {hanzi:'在', pinyin:'zài'}];
    wrongWords = shuffle(wrongWords).slice(0, 3);
    const correctVocab = allVocab.find(v => v.hanzi === sqBlankTarget);
    const options = shuffle([{ hanzi: sqBlankTarget, pinyin: correctVocab ? correctVocab.pinyin : '', isCorrect: true }, ...wrongWords.map(w => ({ hanzi: w.hanzi, pinyin: w.pinyin, isCorrect: false }))]);
    
    container.innerHTML = `
      <div class="question-card" style="margin-top:20px; box-shadow: 0 15px 40px rgba(0,0,0,0.08); border: none; background: rgba(255,255,255,0.85); padding:32px 24px 24px;">
        <div class="q-label">Điền từ còn thiếu vào chỗ trống:</div>
        <div style="font-size:16px; color:var(--text2); margin-bottom:12px;">${cur.meaning}</div>
        <div class="q-hanzi" style="font-size:28px; line-height:1.6; margin:0;">${displayHtml}</div>
        <div class="q-num">Câu ${sqIdx + 1} / ${sqQuestions.length}</div>
      </div>
      
      <div class="options-grid" style="margin-top:30px;">
        ${options.map(opt => `
          <button class="opt-btn" style="border-color:var(--border);background:var(--surface);color:inherit;" onclick="speak('${opt.hanzi.replace(/'/g, "\\'")}'); handleSQAns(this, ${opt.isCorrect})">
            <span class="opt-main" style="font-size:24px;">${opt.hanzi}</span>
          </button>
        `).join('')}
      </div>
      <div id="vq-feedback" class="feedback"></div>
    `;
  }
  else if (sqCurrentMode === 3) {
    // Arrange words
    sqArrangeSegments = shuffle(segments.filter(s => s.text.trim() !== ''));
    sqArrangeSelected = [];
    sqArrangeExpected = segments.map(s => s.text.trim()).join('');
    
    container.innerHTML = `
      <div class="question-card" style="margin-top:20px; box-shadow: 0 15px 40px rgba(0,0,0,0.08); border: none; background: rgba(255,255,255,0.85); padding:32px 24px 24px;">
        <div class="q-label">Sắp xếp các từ thành câu hoàn chỉnh:</div>
        <div style="font-size:18px; color:var(--text); margin-top:8px; margin-bottom:20px; font-weight:500;">${cur.meaning}</div>
        
        <div id="arrange-dropzone" style="min-height:64px; border:1px dashed var(--border); border-radius:var(--r); padding:12px; display:flex; flex-wrap:wrap; gap:8px; align-items:flex-start; background:var(--surface);"></div>
        
        <div class="q-num">Câu ${sqIdx + 1} / ${sqQuestions.length}</div>
      </div>
      
      <div id="arrange-bank" style="margin-top:28px; display:flex; flex-wrap:wrap; gap:10px; justify-content:center;">
        ${sqArrangeSegments.map((seg, i) => {
          const v = allVocab.find(vocab => vocab.hanzi === seg.text);
          const py = v ? v.pinyin : '';
          return `
          <button id="arr-btn-${i}" class="opt-btn" style="border-color:var(--border);background:var(--surface);color:inherit;min-width:104px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;text-align:center;" onclick="toggleArrangeWord(${i})">
            <span style="font-size:20px;font-weight:700;line-height:1.1;">${seg.text}</span>
            ${py ? `<span style="font-size:12px; color:var(--text3); margin-top:3px;">${py}</span>` : ''}
          </button>
          `;
        }).join('')}
      </div>
      
      <div style="margin-top:24px; text-align:center;">
        <button id="arrange-check-btn" class="btn-primary" style="padding:12px 30px; font-size:16px; opacity:0.5; pointer-events:none;" onclick="checkArrangeAns()">Kiểm tra</button>
      </div>
      <div id="vq-feedback" class="feedback"></div>
    `;
  }
}

function toggleArrangeWord(i) {
  speak(sqArrangeSegments[i].text);

  const btn = document.getElementById(`arr-btn-${i}`);
  const dropzone = document.getElementById('arrange-dropzone');
  
  if (sqArrangeSelected.includes(i)) {
    sqArrangeSelected = sqArrangeSelected.filter(val => val !== i);
    document.getElementById('arrange-bank').appendChild(btn);
  } else {
    sqArrangeSelected.push(i);
    dropzone.appendChild(btn);
  }
  btn.style.borderColor = 'var(--border)';
  btn.style.background = 'var(--surface)';
  btn.style.color = 'inherit';
  
  const checkBtn = document.getElementById('arrange-check-btn');
  if (sqArrangeSelected.length === sqArrangeSegments.length) {
    checkBtn.style.opacity = '1';
    checkBtn.style.pointerEvents = 'auto';
  } else {
    checkBtn.style.opacity = '0.5';
    checkBtn.style.pointerEvents = 'none';
  }
}

function checkArrangeAns() {
  const checkBtn = document.getElementById('arrange-check-btn');
  checkBtn.style.display = 'none';
  
  const btns = document.querySelectorAll('#arrange-bank button, #arrange-dropzone button');
  btns.forEach(b => b.style.pointerEvents = 'none');
  
  const fb = document.getElementById('vq-feedback');
  const cur = sqQuestions[sqIdx];
  
  const selectedText = sqArrangeSelected.map(i => sqArrangeSegments[i].text).join('');
  const isCorrect = selectedText === sqArrangeExpected;
  
  if (isCorrect) {
    sqScore++;
    fb.textContent = '✓ Chính xác!';
    fb.className = 'feedback correct';
  } else {
    fb.innerHTML = `✗ Sai rồi! Câu đúng: <br><strong style="font-size:20px;color:var(--text);margin-top:4px;display:block;">${cur.chinese}</strong>`;
    fb.className = 'feedback wrong';
  }
  
  fb.style.display = 'block';
  
  setTimeout(() => {
    sqIdx++;
    if (sqIdx < sqQuestions.length) {
      renderSQ();
    } else {
      showSQResult();
    }
  }, 2500);
}

function handleSQAns(btn, isCorrect) {
  const btns = document.querySelectorAll('#vq-area .opt-btn');
  btns.forEach(b => b.style.pointerEvents = 'none');
  const fb = document.getElementById('vq-feedback');
  const cur = sqQuestions[sqIdx];
  
  if (isCorrect) {
    sqScore++;
    btn.classList.add('correct');
    fb.textContent = '✓ Chính xác!';
    fb.className = 'feedback correct';
  } else {
    btn.classList.add('wrong');
    if (sqCurrentMode === 0 || sqCurrentMode === 1) {
      const correctText = sqCurrentMode === 0 ? cur.meaning : cur.chinese;
      const correctBtn = Array.from(btns).find(b => b.querySelector('.opt-main').innerText === correctText);
      if (correctBtn) correctBtn.classList.add('correct');
      fb.textContent = `✗ Sai rồi! Đáp án: ${cur.chinese} (${cur.pinyin}) - ${cur.meaning}`;
    } else if (sqCurrentMode === 2) {
      const correctBtn = Array.from(btns).find(b => b.querySelector('.opt-main').innerText === sqBlankTarget);
      if (correctBtn) correctBtn.classList.add('correct');
      fb.textContent = `✗ Sai rồi! Đáp án đúng: ${sqBlankTarget}`;
    }
    fb.className = 'feedback wrong';
  }
  
  fb.style.display = 'block';
  const isTouchMobile = window.matchMedia('(max-width: 480px), (hover: none) and (pointer: coarse)').matches;
  const advanceDelay = isTouchMobile ? 650 : 1500;
  
  setTimeout(() => {
    sqIdx++;
    if (sqIdx < sqQuestions.length) {
      renderSQ();
    } else {
      showSQResult();
    }
  }, advanceDelay);
}

function showSQResult() {
  const container = document.getElementById('vq-area');
  const prog = document.getElementById('vq-prog');
  if (prog) prog.style.width = '100%';
  const pct = Math.round((sqScore / sqQuestions.length) * 100);
  
  container.innerHTML = `
    <div style="text-align:center;padding:60px 20px;">
      <div style="font-size:80px;margin-bottom:20px;">${pct >= 80 ? '🏆' : pct >= 50 ? '👏' : '📚'}</div>
      <h2 style="font-family:'DM Serif Display',serif;font-size:32px;margin-bottom:10px;">Hoàn thành!</h2>
      <p style="color:var(--text2);font-size:18px;margin-bottom:40px;">Bạn trả lời đúng <strong>${sqScore}/${sqQuestions.length}</strong> câu (${pct}%).</p>
      <button class="btn-primary" style="padding:15px 40px;font-size:16px;" onclick="exitVocabQuiz()">Quay lại Luyện câu</button>
    </div>
  `;
}
function renderSentences(list) {
  const el = document.getElementById('sentences-list-stu');
  if (!el) return;
  if (!list.length) { el.innerHTML = '<tr><td colspan="4" class="empty-state">Chưa có câu nào.</td></tr>'; return; }

  const sorted = [...list].sort((a, b) => (a.category || 'Khác').localeCompare(b.category || 'Khác'));

  let currentCat = null;
  el.innerHTML = sorted.map(s => {
    let catRow = '';
    const sCat = s.category || 'Khác';
    if (sCat !== currentCat) {
      currentCat = sCat;
      catRow = `<tr class="table-group-header"><td colspan="4">📁 Chủ đề: ${currentCat}</td></tr>`;
    }

    return `
      ${catRow}
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:12px;">
            <button class="btn-speak" onclick="speak('${s.chinese}')">🔊</button>
            <div style="font-family:'Noto Serif SC',serif;font-size:18px;font-weight:700;color:var(--primary)">${s.chinese}</div>
          </div>
          <div style="font-size:12px;color:var(--text3);margin-left:44px;">${s.pinyin}</div>
        </td>
        <td><div style="font-size:14px;color:var(--text);font-weight:500;">${s.meaning}</div></td>
        <td><span class="badge hsk-badge-${s.hsk_level || 1}">HSK ${s.hsk_level || 1}</span></td>
        <td><span class="badge" style="background:var(--primary-bg);color:var(--primary)">${sCat}</span></td>
      </tr>`;
  }).join('');
}

function filterSentences() {
  const q = document.getElementById('search-sentences').value.toLowerCase().trim();
  const cat = document.getElementById('filter-sent-stu-cat').value;
  const lvl = document.getElementById('filter-sent-stu-level').value;
  
  const filtered = allSentences.filter(s => {
    const matchesQuery = !q || 
      s.chinese.includes(q) || 
      s.meaning.toLowerCase().includes(q) || 
      s.pinyin.toLowerCase().includes(q);
    const matchesCat = !cat || s.category === cat;
    const matchesLvl = !lvl || String(s.hsk_level) === String(lvl);
    return matchesQuery && matchesCat && matchesLvl;
  });
  
  renderSentences(filtered);
}



// ── ANNOUNCEMENTS ──
async function loadAnnouncements() {
  try {
    // 1. Get student classes
    const { data: classes } = await sb.from('class_members').select('class_id').eq('student_id', currentUser.id);
    const classIds = (classes || []).map(c => c.class_id);

    // 2. Fetch announcements (global OR for student's classes)
    let query = sb.from('announcements').select('*');
    if (classIds.length > 0) {
      query = query.or(`class_id.is.null,class_id.in.(${classIds.join(',')})`);
    } else {
      query = query.is('class_id', null);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    
    // 3. Sidebar Badge Logic
    const lastSeenId = parseInt(localStorage.getItem('hsk_last_ann_id') || '0');
    const latestAnn = data && data.length ? data[0] : null;
    const badge = document.getElementById('ann-badge');
    if (latestAnn && latestAnn.id > lastSeenId) {
      if (badge) badge.style.display = 'block';
    } else {
      if (badge) badge.style.display = 'none';
    }

    // 2. Front Page (Dashboard) Quick View
    const quickView = document.getElementById('ann-quick-view');
    if (quickView && latestAnn) {
      quickView.style.display = 'block';
      quickView.innerHTML = `
        <div class="ann-dash-card" onclick="showPanel('announcements')">
          <div class="ann-dash-icon">📢</div>
          <div class="ann-dash-body">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <strong style="font-size:17px;">Thông báo mới nhất</strong>
              <span class="ann-dash-date" style="font-size:13px;">🕒 ${fmtDate(latestAnn.created_at)}</span>
            </div>
            <div style="font-weight:700;font-size:15px;color:var(--text);margin-bottom:4px;">${latestAnn.title}</div>
            <p style="font-size:14px;line-height:1.4;">${latestAnn.content}</p>
          </div>
          <div style="color:var(--gold);font-size:24px;margin-left:10px;">›</div>
        </div>
      `;
    }

    // 3. Full List Logic
    const el = document.getElementById('announcement-list');
    if (!el) return;
    if (!data?.length) { el.innerHTML = '<div class="empty-state">Chưa có thông báo nào</div>'; return; }
    el.innerHTML = data.map(a => `
      <div class="ann-card">
        <div class="ann-card-header">
          <div class="ann-card-icon">📢</div>
          <div class="ann-card-meta">
            <h4>${a.title}</h4>
            <span class="ann-date">🕒 ${fmtDate(a.created_at)}</span>
          </div>
        </div>
        <div class="ann-card-content">${a.content}</div>
      </div>`).join('');
  } catch (err) {
    console.error("LoadAnnouncements error:", err);
    const el = document.getElementById('announcement-list');
    if (el) el.innerHTML = '<div class="empty-state">Lỗi tải thông báo</div>';
  }
}

function markAnnouncementsAsRead() {
  const list = document.getElementById('announcement-list');
  // We can't easily get the latest ID here without another fetch or global state
  // But since we just loaded them, we can assume the latest one in the list is the one
  // Or just call another quick fetch or use a global variable.
}

function filterVocabStu() {
  const q = document.getElementById('search-vocab-stu').value.toLowerCase();
  renderVocabTable(q ? allVocab.filter(v=>v.hanzi.includes(q)||v.pinyin.toLowerCase().includes(q)||v.meaning.toLowerCase().includes(q)) : allVocab);
}

// ══════════════════════════════════════════
//  HSK LEVEL
// ══════════════════════════════════════════
const HSK_DEFS = [
  { level:1, name:'HSK 1', icon:'→', color:'var(--blue)',   bg:'var(--blue-bg)',   desc:'150 từ vựng cơ bản' },
  { level:2, name:'HSK 2', icon:'🔒', color:'var(--text3)', bg:'var(--surface2)',  desc:'300 từ vựng sơ cấp' },
  { level:3, name:'HSK 3', icon:'🔒', color:'var(--text3)', bg:'var(--surface2)',  desc:'600 từ vựng trung cấp' },
  { level:4, name:'HSK 4', icon:'🔒', color:'var(--text3)', bg:'var(--surface2)',  desc:'1200 từ vựng trung cấp' },
  { level:5, name:'HSK 5', icon:'🔒', color:'var(--text3)', bg:'var(--surface2)',  desc:'2500 từ vựng cao cấp' },
  { level:6, name:'HSK 6', icon:'🔒', color:'var(--text3)', bg:'var(--surface2)',  desc:'5000 từ vựng cao cấp' },
];

async function loadHskLevel() {
  try {
    const { data:levelData } = await sb.from('hsk_student_levels').select('hsk_level').eq('student_id',currentUser.id).maybeSingle();
    currentStuLevel = levelData?.hsk_level || 1;
    document.getElementById('stu-level-label').textContent = `Học sinh · HSK${currentStuLevel}`;

    const { data:pending } = await sb.from('hsk_level_requests').select('*').eq('student_id',currentUser.id).eq('status','pending');
    // Quiz results for progress
    const { data:results } = await sb.from('quiz_results').select('score,total').eq('student_id',currentUser.id);
    let avgPct = null;
    if (results&&results.length) {
      const sum = results.reduce((a,r)=>a+r.score/r.total*100,0);
      avgPct = Math.round(sum/results.length);
    }
    renderHskLevelTab(pending||[], avgPct);
  } catch (err) {
    console.error("LoadHskLevel error:", err);
    const el = document.getElementById('hsk-level-content');
    if (el) el.innerHTML = '<div class="empty-state">Lỗi tải cấp độ</div>';
  }
}

// ── LESSONS ──
async function loadLessons() {
  try {
    const { data: myClasses, error: classErr } = await sb.from('class_members').select('class_id').eq('student_id', currentUser.id);
    if (classErr) throw classErr;
    
    const el = document.getElementById('lessons-list-stu');
    if (!el) return;

    if (!myClasses?.length) {
      el.innerHTML = '<div class="empty-state">Bạn chưa được xếp vào lớp nào.</div>';
      return;
    }
    const classIds = myClasses.map(c => c.class_id);
    const { data: lessons, error: lessonErr } = await sb.from('lessons').select('*, classes(name), lesson_vocab(vocab(*))').in('class_id', classIds).order('created_at', { ascending: false });
    if (lessonErr) throw lessonErr;
    
    if (!lessons?.length) {
      el.innerHTML = '<div class="empty-state">Chưa có bài học nào được giao cho lớp của bạn.</div>';
      return;
    }
    
    el.innerHTML = lessons.map(l => `
      <div class="card" style="padding:18px;">
        <div style="display:flex;gap:14px;align-items:flex-start;">
          <div class="quiz-card-icon" style="background:var(--blue-bg);color:var(--blue);width:46px;height:46px;font-size:20px;">📖</div>
          <div class="card-info">
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;">${l.classes?.name}</div>
            <h4 style="font-size:15px;margin-top:2px;">${l.title}</h4>
            <p>${(l.lesson_vocab || []).length} từ vựng cần học</p>
          </div>
        </div>
        <div class="card-actions-bottom">
           <span style="font-size:12px;color:var(--text3)">📂 Bài học lớp</span>
           <button class="btn-primary btn-sm" onclick="viewLessonVocab(${l.id})">🔍 Xem & Học bài</button>
        </div>
      </div>`).join('');
  } catch (err) {
    console.error("LoadLessons error:", err);
    const el = document.getElementById('lessons-list-stu');
    if (el) el.innerHTML = '<div class="empty-state">Lỗi tải bài học</div>';
  }
}

async function viewLessonVocab(lessonId) {
  const { data: lesson } = await sb.from('lessons').select('*, lesson_vocab(vocab(*))').eq('id', lessonId).single();
  if (!lesson) return;
  
  // Reuse vocab table rendering or show a simple list
  const list = (lesson.lesson_vocab || []).map(lv => lv.vocab).filter(Boolean);
  const vocabTable = list.map(v => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="btn-speak" onclick="event.stopPropagation(); speak('${v.hanzi}')">🔊</button>
          <div class="vocab-hanzi" style="font-size:20px">${v.hanzi}</div>
        </div>
      </td>
      <td>${v.pinyin}</td>
      <td>${v.meaning}</td>
    </tr>`).join('');

  // Temporarily show in a simple overlay or switch to vocab tab with filter
  // For now, let's just show a custom overlay
  const overlay = document.createElement('div');
  overlay.className = 'hsk-overlay open';
  overlay.innerHTML = `
    <div class="hsk-overlay-inner" style="max-width:700px">
      <div class="overlay-topbar">
        <strong>${lesson.title} — Danh sách từ vựng</strong>
        <button class="btn-ghost btn-sm" onclick="this.closest('.hsk-overlay').remove()">✕ Đóng</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Hán tự</th><th>Pinyin</th><th>Nghĩa</th></tr></thead>
          <tbody>${vocabTable || '<tr><td colspan="3">Không có từ vựng</td></tr>'}</tbody>
        </table>
      </div>
      <button class="btn-primary" style="width:100%;justify-content:center;margin-top:16px;" onclick="startLessonPractice(${lesson.id})">🏋 Luyện tập bài này</button>
    </div>`;
  document.body.appendChild(overlay);
}

async function startLessonPractice(lessonId) {
  const { data: lesson } = await sb.from('lessons').select('*, lesson_vocab(vocab(*))').eq('id', lessonId).single();
  const list = (lesson.lesson_vocab || []).map(lv => lv.vocab).filter(Boolean);
  if (list.length < 4) { alert('Cần ít nhất 4 từ vựng để luyện tập.'); return; }
  
  // Close the overlay
  const ov = document.querySelector('.hsk-overlay.open:not(#quiz-overlay):not(#hsk-review-overlay)');
  if (ov) ov.remove();
  
  // Setup practice
  practiceQueue = shuffle(list);
  practiceIdx = 0;
  practiceMode = 'meaning';
  showPanel('practice');
  document.getElementById('practice-idle').style.display = 'none';
  renderPracticeQ(0);
}

function renderHskLevelTab(pendingReqs, avgPct) {
  const pendingSet = new Set(pendingReqs.map(r=>r.to_level));
  const el = document.getElementById('hsk-level-content');
  const subEl = document.getElementById('hsk-subtitle');
  if (currentStuLevel < 6) subEl.textContent = `Hoàn thành HSK${currentStuLevel} để mở khoá HSK${currentStuLevel+1}`;
  else subEl.textContent = 'Bạn đã đạt cấp độ HSK cao nhất!';

  // Level tiles
  const tilesHTML = HSK_DEFS.map(l => {
    const isUnlocked = currentStuLevel >= l.level;
    const isPending  = pendingSet.has(l.level);
    let tileClass = 'hsk-level-tile';
    let icon = l.level === 1 ? '→' : isUnlocked ? '✓' : isPending ? '⏳' : '🔒';
    let nameColor = isUnlocked ? l.color : 'var(--text3)';
    if (isUnlocked && l.level === currentStuLevel) tileClass += ' active';
    if (!isUnlocked && !isPending) tileClass += ' locked';
    return `
      <div class="${tileClass}" style="border-color:${isUnlocked&&l.level===currentStuLevel?l.color:'var(--border)'}">
        <span class="tile-icon">${icon}</span>
        <div class="tile-name" style="color:${nameColor}">${l.name} ${isUnlocked?'· Đang học':isPending?'· Chờ duyệt':'· Bị khoá'}</div>
        <div class="tile-sub">${isUnlocked||isPending ? l.desc : l.level===currentStuLevel+1?'Cần 100% HSK'+currentStuLevel+' + giáo viên duyệt':'Cần hoàn thành HSK'+(l.level-1)+' + giáo viên duyệt'}</div>
      </div>`;
  }).join('');

  // Detail card current level
  const progressPct = avgPct !== null ? avgPct : 0;
  const progCls = progressPct >= 70 ? '' : progressPct >= 40 ? ' gold' : ' red';
  const curLevel = HSK_DEFS.find(l=>l.level===currentStuLevel);
  const detailCard = `
    <div class="hsk-detail-card">
      <div class="hsk-detail-icon" style="background:var(--blue-bg)">→</div>
      <div class="hsk-detail-info">
        <h3>HSK ${currentStuLevel} — Đang học</h3>
        <p>${allVocab.length} / ${curLevel?.desc||''} đã học · Cần 100% ôn tập để lên HSK${currentStuLevel+1}</p>
        <div class="progress-track" style="margin-top:8px;width:180px;">
          <div class="progress-fill${progCls}" style="width:${progressPct}%"></div>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div class="hsk-detail-pct" style="color:${progressPct>=70?'var(--accent)':progressPct>=40?'var(--gold)':'var(--primary)'}">${progressPct}%</div>
        <div class="hsk-detail-sub">hoàn thành</div>
      </div>
    </div>`;

  // Action buttons
  const nextLevel = currentStuLevel + 1;
  const isPendingNext = pendingSet.has(nextLevel);
  const actionGrid = nextLevel <= 6 ? `
    <div class="hsk-action-grid">
      <button class="hsk-action-btn" onclick="showPanel('sentences')">
        <span class="btn-icon-lg">💬</span>
        <span>Luyện câu ngắn</span>
      </button>
      <button class="hsk-action-btn" onclick="showPanel('vocab')">
        <span class="btn-icon-lg">📖</span>
        <span>Học từ vựng HSK${currentStuLevel}</span>
      </button>
      ${isPendingNext
        ? `<button class="hsk-action-btn" onclick="showPendingOverlay(${nextLevel})">
             <span class="btn-icon-lg">⏳</span>
             <span>Xem trạng thái duyệt</span>
           </button>`
        : `<button class="hsk-action-btn" onclick="startHskReview(${nextLevel})" ${allVocab.length<4?'disabled':''}>
             <span class="btn-icon-lg">🎯</span>
             <span>Làm bài ôn tập 100%</span>
           </button>`
      }
    </div>` : '';

  el.innerHTML = `
    <div class="hsk-level-grid">${tilesHTML}</div>
    ${detailCard}
    ${actionGrid}
  `;
}

function showPendingOverlay(level) {
  document.getElementById('pending-level-name').textContent = 'HSK'+level;
  document.getElementById('hsk-pending-overlay').classList.add('open');
}

// ══════════════════════════════════════════
//  HSK REVIEW QUIZ
// ══════════════════════════════════════════
async function startHskReview(toLevel) {
  if (allVocab.length < 4) { showToast('Cần ít nhất 4 từ vựng để luyện tập.'); return; }
  hskReviewTarget = toLevel;
  hskReviewQueue  = shuffle(allVocab).slice(0, 5);
  hskReviewIdx    = 0;
  document.getElementById('hsk-review-title').textContent = `Ôn tập 100% — Mở khoá HSK ${toLevel}`;
  document.getElementById('hsk-review-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  renderHskReviewQ(0);
}

function renderHskReviewQ(idx) {
  const total = hskReviewQueue.length;
  document.getElementById('hsk-review-prog').style.width = (idx/total*100)+'%';
  if (idx >= total) { showHskReviewSuccess(); return; }
  hskReviewAnswered = false;
  const cur = hskReviewQueue[idx];
  const wrong = shuffle(allVocab.filter(v=>v.id!==cur.id)).slice(0,3);
  const opts  = shuffle([cur,...wrong]);
  document.getElementById('hsk-review-area').innerHTML = `
    <div class="question-card">
      <div class="q-label">Từ này có nghĩa là gì?</div>
      <div class="q-hanzi">${cur.hanzi}</div>
      <div class="q-num">${idx+1} / ${total} — <span style="color:var(--primary);font-weight:700">Phải đúng tất cả!</span></div>
    </div>
    <div class="options-grid">
      ${opts.map(o=>`
        <button class="opt-btn" data-is-correct="${o.id===cur.id}" 
          onmouseenter="speak('${o.hanzi}')"
          onclick="speak('${o.hanzi}'); handleHskReviewAns(this,${o.id===cur.id},${idx},${cur.id})">
          <span class="opt-main">${o.meaning}</span>
          <span class="opt-pinyin">${o.pinyin}</span>
        </button>`).join('')}
    </div>
    <div class="feedback" id="hsk-fb"></div>
    <button class="next-btn" id="hsk-next" onclick="renderHskReviewQ(${idx+1})">Câu tiếp theo →</button>`;
}

function handleHskReviewAns(btn, isCorrect, idx, correctId) {
  if (hskReviewAnswered) return;
  hskReviewAnswered = true;
  document.querySelectorAll('#hsk-review-area .opt-btn').forEach(b=>b.disabled=true);
  const fb = document.getElementById('hsk-fb');
  if (isCorrect) {
    btn.classList.add('correct');
    fb.textContent='✓ Chính xác!'; fb.className='feedback correct';
    document.getElementById('hsk-next').style.display='block';
  } else {
    btn.classList.add('wrong');
    const correctBtn = document.querySelector('#hsk-review-area .opt-btn[data-is-correct="true"]');
    if (correctBtn) correctBtn.classList.add('correct');
    
    const correctVocab = allVocab.find(v=>v.id===correctId);
    fb.textContent=`✗ Sai rồi! Đáp án: ${correctVocab?.pinyin} — ${correctVocab?.meaning}. Làm lại từ đầu!`;
    fb.className='feedback wrong';
    setTimeout(()=>{ hskReviewQueue=shuffle(allVocab).slice(0,5); renderHskReviewQ(0); }, 2000);
  }
}

async function showHskReviewSuccess() {
  document.getElementById('hsk-review-area').innerHTML = `
    <div class="result-card">
      <div class="result-emoji">🎉</div>
      <div class="result-score">5 / 5</div>
      <div class="result-detail">Xuất sắc! Bạn đã hoàn thành 100% bài ôn tập.</div>
      <button class="btn-primary" style="width:100%;justify-content:center;margin-bottom:10px;" onclick="submitHskRequest()">
        Gửi yêu cầu lên HSK ${hskReviewTarget}
      </button>
      <button class="btn-ghost" style="width:100%;justify-content:center;" onclick="exitHskReview()">Để sau</button>
    </div>`;
}

async function submitHskRequest() {
  const btn = document.querySelector('#hsk-review-area .btn-primary');
  if (btn) { btn.disabled=true; btn.textContent='Đang gửi...'; }
  try {
    const { data:exist, error:existErr } = await sb
      .from('hsk_level_requests')
      .select('id')
      .eq('student_id', currentUser.id)
      .eq('to_level', hskReviewTarget)
      .eq('status', 'pending');

    if (existErr) throw existErr;

    if (exist && exist.length) {
      exitHskReview();
      showPendingOverlay(hskReviewTarget);
      return;
    }

    const { error:insertErr } = await sb.from('hsk_level_requests').insert({
      student_id: currentUser.id,
      // Use current level state (myHskLevel does not exist and causes a runtime crash).
      from_level: currentStuLevel,
      to_level: hskReviewTarget,
      score_pct: 100
    });

    if (insertErr) throw insertErr;

    exitHskReview();
    await loadHskLevel();
    showPendingOverlay(hskReviewTarget);
  } catch (err) {
    console.error('submitHskRequest error:', err);
    if (btn) { btn.disabled = false; btn.textContent = 'Gửi yêu cầu lên HSK ' + hskReviewTarget; }
    showToast('Không thể gửi yêu cầu lên cấp. Vui lòng thử lại.');
  }
}

function exitHskReview() {
  document.getElementById('hsk-review-overlay').classList.remove('open');
  document.body.style.overflow='';
}

// ══════════════════════════════════════════
//  ASSIGNED QUIZZES
// ══════════════════════════════════════════
async function loadAssigned() {
  try {
    const { data:assigns, error } = await sb
      .from('quiz_assignments')
      .select('*, quizzes(*)')
      .eq('student_id',currentUser.id);
    if (error) throw error;
    
    const { data:done } = await sb.from('quiz_results').select('quiz_id').eq('student_id',currentUser.id);
    const doneSet = new Set((done||[]).map(r=>r.quiz_id));
    const el = document.getElementById('assigned-list');
    if (!el) return;
    if (!assigns||!assigns.length) {
      el.innerHTML='<div class="empty-state"><span class="empty-icon">📝</span>Chưa có bài nào được giao.</div>';
      return;
    }
    el.innerHTML = assigns.map(a => {
      const q = a.quizzes;
      if (!q) return '';
      const isDone  = doneSet.has(q.id);
      const isQuick = q.type==='quickquiz';
      const dur     = isQuick && q.duration_seconds ? Math.round(q.duration_seconds/60)+'p' : null;
      return `
        <div class="card" style="padding:18px;">
          <div style="display:flex;gap:14px;align-items:flex-start;">
            <div class="quiz-card-icon" style="background:${isQuick?'var(--gold-bg)':'var(--blue-bg)'};width:46px;height:46px;font-size:20px;">
              ${isQuick?'⚡':'📝'}
            </div>
            <div class="card-info">
              <h4 style="font-size:15px;">${q.title}</h4>
              <p>${(q.vocab_ids||[]).length} từ · ${isQuick?'Kiểm tra nhanh':'Bài tập về nhà'}${dur?' · '+dur:''}</p>
            </div>
          </div>
          <div class="card-actions-bottom">
            <span style="font-size:12px;color:var(--text3)">${isQuick?'⚡ Quick Quiz':'📝 Homework'}</span>
            ${isDone
              ? '<span class="badge badge-done">✓ Đã hoàn thành</span>'
              : `<button class="btn-primary btn-sm" onclick="startQuiz(${q.id})">🎯 Bắt đầu làm bài</button>`
            }
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    console.error("LoadAssigned error:", err);
    const el = document.getElementById('assigned-list');
    if (el) el.innerHTML = '<div class="empty-state">Lỗi tải bài tập</div>';
  }
}

// ══════════════════════════════════════════
//  QUIZ OVERLAY (Làm bài)
// ══════════════════════════════════════════
async function startQuiz(quizId) {
  activeQuizId = quizId;
  quizIdx = 0; quizCorrect = 0; quizAnswered = false;
  const { data:quiz } = await sb.from('quizzes').select('*').eq('id',quizId).single();
  if (!quiz) return;
  const vocabIds = quiz.vocab_ids || [];
  const { data:vocab } = await sb.from('vocab').select('*').in('id', vocabIds);
  quizVocab = shuffle(vocab||[]);
  document.getElementById('quiz-overlay-title').textContent = quiz.title;
  const timerWrap = document.getElementById('timer-wrap');
  if (quiz.type==='quickquiz' && quiz.duration_seconds) {
    quizTimerLeft = quiz.duration_seconds;
    quizTimerTotal = quiz.duration_seconds;
    timerWrap.style.display='block';
    startQuizTimer();
  } else {
    timerWrap.style.display='none';
    clearInterval(quizTimerInterval);
  }
  document.getElementById('quiz-overlay').classList.add('open');
  document.body.style.overflow='hidden';
  renderQuizQ(0);
}

function startQuizTimer() {
  clearInterval(quizTimerInterval);
  quizTimerInterval = setInterval(()=>{
    quizTimerLeft--;
    const m = Math.floor(quizTimerLeft/60).toString().padStart(2,'0');
    const s = (quizTimerLeft%60).toString().padStart(2,'0');
    document.getElementById('timer-val').textContent = m+':'+s;
    document.getElementById('timer-bar').style.width = (quizTimerLeft/quizTimerTotal*100)+'%';
    if (quizTimerLeft<=0) { clearInterval(quizTimerInterval); finishQuiz(); }
  },1000);
}

function renderQuizQ(idx) {
  const total = quizVocab.length;
  document.getElementById('quiz-prog').style.width=(idx/total*100)+'%';
  if (idx>=total) { finishQuiz(); return; }
  quizIdx = idx; quizAnswered = false;
  const cur   = quizVocab[idx];
  const wrong = shuffle(allVocab.filter(v=>v.id!==cur.id)).slice(0,3);
  const opts  = shuffle([cur,...wrong]);
  document.getElementById('quiz-area').innerHTML = `
    <div class="question-card">
      <div class="q-label">Từ này có nghĩa là gì?</div>
      <div class="q-hanzi">${cur.hanzi}</div>
      <div class="q-num">${idx+1} / ${total}</div>
    </div>
    <div class="options-grid">
      ${opts.map(o=>`
        <button class="opt-btn" data-is-correct="${o.id===cur.id}" 
          onmouseenter="speak('${o.hanzi}')"
          onclick="speak('${o.hanzi}'); handleQuizAns(this,${o.id===cur.id},${idx})">
          <span class="opt-main">${o.meaning}</span>
          <span class="opt-pinyin">${o.pinyin}</span>
        </button>`).join('')}
    </div>
    <div class="feedback" id="quiz-fb"></div>
    <button class="next-btn" id="quiz-next" onclick="renderQuizQ(${idx+1})">${idx+1>=total?'Nộp bài':'Câu tiếp →'}</button>`;
}

function handleQuizAns(btn, isCorrect, idx) {
  if (quizAnswered) return;
  quizAnswered = true;
  document.querySelectorAll('#quiz-area .opt-btn').forEach(b=>b.disabled=true);
  const fb = document.getElementById('quiz-fb');
  if (isCorrect) {
    quizCorrect++;
    btn.classList.add('correct');
    fb.textContent='✓ Chính xác!'; fb.className='feedback correct';
  } else {
    btn.classList.add('wrong');
    // Highlight the correct one
    const correctBtn = document.querySelector('#quiz-area .opt-btn[data-is-correct="true"]');
    if (correctBtn) correctBtn.classList.add('correct');
    
    const cur = quizVocab[idx];
    fb.textContent=`✗ Sai rồi! Đáp án: ${cur.pinyin} (${cur.meaning})`; 
    fb.className='feedback wrong';
  }
  document.getElementById('quiz-next').style.display='block';
}

async function finishQuiz() {
  clearInterval(quizTimerInterval);
  const total = quizVocab.length;
  await sb.from('quiz_results').insert({ quiz_id:activeQuizId, student_id:currentUser.id, score:quizCorrect, total });
  const pct = Math.round(quizCorrect/total*100);
  const cls = pct>=80?'var(--accent)':pct>=50?'var(--gold)':'var(--primary)';
  document.getElementById('quiz-area').innerHTML = `
    <div class="result-card">
      <div class="result-emoji">${pct>=80?'🎉':pct>=50?'😊':'😅'}</div>
      <div class="result-score" style="color:${cls}">${quizCorrect}<span style="font-size:28px;color:var(--text3)">/${total}</span></div>
      <div class="result-detail">${pct}% chính xác · ${pct>=80?'Xuất sắc!':pct>=50?'Khá tốt, cố lên!':'Cần luyện thêm!'}</div>
      <button class="btn-primary" style="width:100%;justify-content:center;" onclick="exitQuizOverlay()">← Quay lại</button>
    </div>`;
  document.getElementById('quiz-prog').style.width='100%';
  await loadAssigned();
  await loadHistory();
}

function exitQuizOverlay() {
  clearInterval(quizTimerInterval);
  document.getElementById('quiz-overlay').classList.remove('open');
  document.body.style.overflow='';
}

// ══════════════════════════════════════════
//  PRACTICE
// ══════════════════════════════════════════
function selectMode(btn, mode) {
  practiceMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('practice-area').innerHTML='<p class="empty-state"><span class="empty-icon">🏋</span>Bấm bắt đầu để luyện tập</p>';
  document.getElementById('practice-idle').style.display='block';
}

function startPractice() {
  if (allVocab.length < 4) { showToast('Cần ít nhất 4 từ vựng.'); return; }
  practiceQueue = shuffle(allVocab);
  practiceIdx   = 0;
  document.getElementById('practice-idle').style.display='none';
  renderPracticeQ(0);
}

function renderPracticeQ(idx) {
  if (idx >= practiceQueue.length) { practiceQueue = shuffle(allVocab); idx=0; }
  practiceIdx = idx;
  const cur   = practiceQueue[idx];

  if (practiceMode === 'flashcard') {
    document.getElementById('practice-area').innerHTML = `
      <div class="flashcard-container" onclick="this.querySelector('.flashcard').classList.toggle('flipped')">
        <div class="flashcard">
          <div class="flashcard-front">
            <div class="q-label">Hán tự (Bấm để lật)</div>
            <div class="fc-hanzi">${cur.hanzi}</div>
            <button class="btn-speak" style="margin-top:10px" onclick="event.stopPropagation(); speak('${cur.hanzi}')">🔊 Nghe</button>
          </div>
          <div class="flashcard-back">
            <div class="fc-pinyin">${cur.pinyin}</div>
            <div class="fc-meaning">${cur.meaning}</div>
          </div>
        </div>
      </div>
      <button class="next-btn" style="display:block;margin-top:20px;" onclick="renderPracticeQ(${idx+1})">Từ tiếp theo →</button>`;
    return;
  }

  const wrong = shuffle(allVocab.filter(v=>v.id!==cur.id)).slice(0,3);
  const opts  = shuffle([cur,...wrong]);
  const isMeaning = practiceMode==='meaning';
  document.getElementById('practice-area').innerHTML = `
    <div class="question-card">
      <div class="q-label">${isMeaning?'Từ này có nghĩa là gì?':'Nghĩa này là từ nào?'}</div>
      ${isMeaning
        ? `<div class="q-hanzi">${cur.hanzi}</div>`
        : `<div class="q-text-mode" style="margin:20px 0;">${cur.meaning}</div>
           <div style="display:flex; justify-content:center; align-items:center; gap:8px; margin-top:-10px;">
             <div class="q-pinyin" style="font-size:16px; color:var(--text3); font-family:'DM Sans', sans-serif; margin:0;">${cur.pinyin}</div>
             <button class="btn-speak" style="width:34px;height:34px;font-size:16px;" onclick="speak('${cur.hanzi.replace(/'/g, "\\'")}')">🔊</button>
           </div>`}
      <div class="q-num">${idx+1} / ${practiceQueue.length}</div>
    </div>
    <div class="options-grid">
      ${opts.map(o=>`
        <button class="opt-btn" data-is-correct="${o.id===cur.id}" 
          ${isMeaning
            ? `onmouseenter="speak('${o.hanzi}')" onclick="speak('${o.hanzi}'); handlePracticeAns(this,${o.id===cur.id},${idx})"`
            : `onclick="handlePracticeAns(this,${o.id===cur.id},${idx})"`}>
          ${isMeaning
            ? `<span class="opt-main">${o.meaning}</span>
               <span class="opt-pinyin">${o.pinyin}</span>`
            : `<span class="opt-hanzi">${o.hanzi}</span>`
          }
        </button>`).join('')}
    </div>
    <div class="feedback" id="pr-fb"></div>
    <button class="next-btn" id="pr-next" onclick="renderPracticeQ(${idx+1})">Câu tiếp →</button>`;
}

function handlePracticeAns(btn, isCorrect, idx) {
  document.querySelectorAll('#practice-area .opt-btn').forEach(b=>b.disabled=true);
  const fb=document.getElementById('pr-fb');
  btn.classList.add(isCorrect?'correct':'wrong');
  if (isCorrect) {
    fb.textContent='✓ Chính xác!';
    fb.className='feedback correct';
  } else {
    const correctBtn = document.querySelector('#practice-area .opt-btn[data-is-correct="true"]');
    if (correctBtn) correctBtn.classList.add('correct');
    
    const cur = practiceQueue[idx];
    fb.textContent=`✗ Sai rồi! Đáp án: ${cur.pinyin} — ${cur.meaning}`;
    fb.className='feedback wrong';
  }
  document.getElementById('pr-next').style.display='block';
}

// ══════════════════════════════════════════
//  HISTORY
// ══════════════════════════════════════════
async function loadHistory() {
  try {
    const { data, error } = await sb.from('quiz_results')
      .select('*, quizzes(title)')
      .eq('student_id',currentUser.id)
      .order('completed_at',{ascending:false});
    if (error) throw error;
    
    const el = document.getElementById('history-list');
    if (!el) return;
    if (!data||!data.length) { el.innerHTML='<tr><td colspan="4" class="empty-state">Chưa có kết quả nào</td></tr>'; return; }
    el.innerHTML = data.map(r=>{
      const pct=Math.round(r.score/r.total*100);
      const cls=pct>=80?'score-good':pct>=50?'score-mid':'score-bad';
      return `
        <tr>
          <td>${r.quizzes?.title||'—'}</td>
          <td class="${cls}">${r.score}/${r.total}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="progress-track" style="width:60px;flex-shrink:0;">
                <div class="progress-fill${pct>=80?' ':pct>=50?' gold':' red'}" style="width:${pct}%"></div>
              </div>
              <span class="${cls}" style="font-size:13px;font-weight:700;">${pct}%</span>
            </div>
          </td>
          <td style="font-size:12px;color:var(--text3);">${fmtDate(r.completed_at)}</td>
        </tr>`;
    }).join('');
  } catch (err) {
    console.error("LoadHistory error:", err);
    const el = document.getElementById('history-list');
    if (el) el.innerHTML = '<tr><td colspan="4" class="empty-state">Lỗi tải lịch sử</td></tr>';
  }
}
// ── HELPERS ──
function hskBadge(lvl) {
  return `<span class="badge badge-hsk${lvl}">HSK ${lvl}</span>`;
}
