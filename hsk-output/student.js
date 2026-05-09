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
let quizStartTime   = null;
let filteredVocab  = [];
let vqQuestions    = [];
let vqIdx          = 0;
let vqScore        = 0;
let vqCurrentMode  = 0; // 0: Hanzi->Meaning, 1: Meaning->Hanzi
let vqAnswered     = false;
let isHomeworkRetake = false;
let homeworkAutoTimer = null;
let homeworkQTimerLeft = 10;

const AVATAR_COLORS = ['#C84B31','#3D6B4F','#2A5FA5','#6B3FA0','#C08830','#1F7A4D','#8B4513','#2E86C1'];
function avatarColor(name) { let h=0; for(let c of name) h=(h+c.charCodeAt(0))%AVATAR_COLORS.length; return AVATAR_COLORS[h]; }
function initials(name) { return name.trim().split(' ').slice(-2).map(w=>w[0]).join('').toUpperCase().slice(0,2); }
function shuffle(a) { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];} return b; }
function fmtDate(dt) { return dt ? new Date(dt).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—'; }
function fmtTime(s) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
function toggleStudentHistory(qid) {
  const el = document.getElementById(`stu-history-${qid}`);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
      loadAnnouncements(),
      loadSentences(),
      loadQuizFolders()
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

    // Set default leaderboard level
    const lvlSelect = document.getElementById('leaderboard-level-select');
    if (lvlSelect) lvlSelect.value = currentStuLevel;

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

  closeSidebar();
  if (id === 'leaderboard') loadLeaderboard();
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
  const container = document.getElementById('vq-area');
  const prog = document.getElementById('vq-prog');
  const overlay = document.querySelector('#vocab-quiz-overlay .hsk-overlay-inner');
  const cur = vqQuestions[vqIdx];

  // Reset pointer events to clear hover states
  if (container) {
    container.style.pointerEvents = 'none';
    container.scrollTop = 0;
    setTimeout(() => container.style.pointerEvents = 'auto', 50);
  }
  
  if (prog) prog.style.width = `${(vqIdx / vqQuestions.length) * 100}%`;
  if (overlay) overlay.scrollTop = 0;

  // Randomize mode: 0 = Hanzi to Meaning, 1 = Meaning to Hanzi
  vqCurrentMode = Math.random() > 0.5 ? 0 : 1;
  vqAnswered = false;
  
  // Filter wrong answers: get 3 random different from current
  const wrong = shuffle(allVocab.filter(v => v.id !== cur.id)).slice(0, 3);
  const options = shuffle([cur, ...wrong]);
  
  container.innerHTML = `
    <div class="question-card" style="margin-top:20px; box-shadow: 0 15px 40px rgba(0,0,0,0.08); border: none; background: rgba(255,255,255,0.85);">
      <div class="q-label">${vqCurrentMode === 0 ? 'Từ này có nghĩa là gì?' : 'Nghĩa này là từ nào?'}</div>
      
      ${vqCurrentMode === 0 
        ? `<div style="display:flex; justify-content:center; align-items:center;" onclick="speak('${cur.hanzi.replace(/'/g, "\\'")}')">
             <div class="q-hanzi" style="margin:0;">${cur.hanzi}</div>
           </div>`
        : `<div style="cursor:pointer;" onclick="speak('${cur.hanzi.replace(/'/g, "\\'")}')">
             <div class="q-hanzi" style="font-size:32px; font-family:'DM Sans', sans-serif; color: var(--text);">${cur.meaning}</div>
             <div style="font-size:16px; color:var(--text3); margin-top:8px;">${cur.pinyin}</div>
           </div>`
      }
      
      <div class="q-num">Câu ${vqIdx + 1} / ${vqQuestions.length}</div>
    </div>
    
    <div class="options-grid" style="margin-top:30px;">
      ${options.map(opt => `
        <button type="button" class="opt-btn" style="border-color:var(--border);background:var(--surface);color:inherit;"
          onclick="speak('${opt.hanzi.replace(/'/g, "\\'")}'); handleVQAns(this, ${opt.id === cur.id})">
          ${vqCurrentMode === 0 
            ? `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
                 <span class="opt-main">${opt.meaning}</span>
                 <span style="font-size:12px;color:var(--text3);">${opt.pinyin}</span>
               </div>`
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
  const advanceDelay = 1000;
  
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
  
  // Save result as type: Vocab Quiz (Offset 1,000,000)
  saveResult(vqScore, vqQuestions.length, 0, null, 'vocab_quiz');

  container.innerHTML = `
    <div style="text-align:center;padding:60px 20px;">
      <div style="font-size:80px;margin-bottom:20px;">${pct >= 80 ? '🏆' : pct >= 50 ? '👏' : '📚'}</div>
      <h2 style="font-family:'DM Serif Display',serif;font-size:32px;margin-bottom:10px;">Hoàn thành!</h2>
      <p style="color:var(--text2);font-size:18px;margin-bottom:40px;">Bạn trả lời đúng <strong>${vqScore}/${vqQuestions.length}</strong> câu (${pct}%).</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <button class="btn-primary" style="padding:15px 30px;font-size:16px;background:var(--blue);" onclick="renderVQSetup()">🔄 Ôn tập lại</button>
        <button class="btn-ghost" style="padding:15px 30px;font-size:16px;border:1px solid var(--border);" onclick="exitVocabQuiz()">← Quay lại Từ điển</button>
      </div>
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
  if (container) {
    container.scrollTop = 0;
    // Clear sticky hover
    container.style.pointerEvents = 'none';
    void container.offsetHeight;
    container.style.pointerEvents = 'auto';
  }
  
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
    // Filter wrong sentences: get 3 random different from current
    const wrong = shuffle(allSentences.filter(s => s.id !== cur.id)).slice(0, 3);
    const options = shuffle([cur, ...wrong]);
    
    container.innerHTML = `
      <div class="question-card">
        <div class="q-label">${sqCurrentMode === 0 ? 'Câu này có nghĩa là gì?' : 'Dịch câu này sang tiếng Trung:'}</div>
        
        ${sqCurrentMode === 0 
          ? `<div class="q-hanzi">${cur.chinese}</div>`
          : `<div class="q-text-mode" onclick="speak('${cur.chinese.replace(/'/g, "\\'")}')">
               <strong>${cur.meaning}</strong>
               <span>${cur.pinyin}</span>
             </div>`
        }
        
        <div class="q-num">Câu ${sqIdx + 1} / ${sqQuestions.length}</div>
      </div>
      
      <div class="options-grid">
        ${options.map(opt => `
          <button class="opt-btn"
            onclick="speak('${opt.chinese.replace(/'/g, "\\'")}'); handleSQAns(this, ${opt.id === cur.id})">
            ${sqCurrentMode === 0 
              ? `<span class="opt-main">${opt.meaning}</span>
                 <span class="opt-pinyin">${opt.pinyin}</span>`
              : `<span class="opt-main" style="font-size:20px;">${opt.chinese}</span>`
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
    
    // Get wrong options: any word except the blank target
    let wrongWords = allVocab.filter(v => v.hanzi !== sqBlankTarget);
    // Fallback if not enough options
    if (wrongWords.length < 3) {
      wrongWords = [{hanzi:'的', pinyin:'de'}, {hanzi:'是', pinyin:'shì'}, {hanzi:'在', pinyin:'zài'}];
    }
    wrongWords = shuffle(wrongWords).slice(0, 3);
    const correctVocab = allVocab.find(v => v.hanzi === sqBlankTarget);
    const options = shuffle([{ hanzi: sqBlankTarget, pinyin: correctVocab ? correctVocab.pinyin : '', isCorrect: true }, ...wrongWords.map(w => ({ hanzi: w.hanzi, pinyin: w.pinyin, isCorrect: false }))]);
    
    container.innerHTML = `
      <div class="question-card">
        <div class="q-label">Điền từ còn thiếu:</div>
        <div class="q-text-mode" onclick="speak('${cur.chinese.replace(/'/g, "\\'")}')">
          <strong>${cur.meaning}</strong>
          <span>${cur.pinyin}</span>
        </div>
        <div class="q-hanzi" style="font-size:clamp(20px, 5vh, 28px); line-height:1.4;">${displayHtml}</div>
        <div class="q-num">Câu ${sqIdx + 1} / ${sqQuestions.length}</div>
      </div>
      
      <div class="options-grid">
        ${options.map(opt => `
          <button class="opt-btn" onclick="speak('${opt.hanzi.replace(/'/g, "\\'")}'); handleSQAns(this, ${opt.isCorrect})">
            <span class="opt-main" style="font-size:20px;">${opt.hanzi}</span>
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
      <div class="question-card">
        <div class="q-label">Sắp xếp thành câu:</div>
        <div class="q-text-mode" onclick="speak('${cur.chinese.replace(/'/g, "\\'")}')">
          <strong>${cur.meaning}</strong>
          <span>${cur.pinyin}</span>
        </div>
        <div id="arrange-dropzone" style="min-height:44px; border:1px dashed var(--border); border-radius:var(--r); padding:8px; display:flex; flex-wrap:wrap; gap:6px; background:var(--surface);"></div>
        <div class="q-num">Câu ${sqIdx + 1} / ${sqQuestions.length}</div>
      </div>
      
      <div id="arrange-bank" style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center; flex:1; align-content:flex-start; overflow-y:auto; padding:10px 0;">
        ${sqArrangeSegments.map((seg, i) => `
          <button id="arr-btn-${i}" class="opt-btn" style="width:auto; height:auto; min-height:40px; padding:6px 12px; display:flex; flex-direction:column; align-items:center;" onclick="toggleArrangeWord(${i})">
            <span style="font-size:18px;font-weight:700;">${seg.text}</span>
          </button>
        `).join('')}
      </div>
      
      <div style="text-align:center; padding:10px 0;">
        <button id="arrange-check-btn" class="btn-primary" style="padding:10px 30px; opacity:0.5; pointer-events:none;" onclick="checkArrangeAns()">Kiểm tra</button>
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
  }, 1000);
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
  const advanceDelay = 1000;
  
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
  
  // Save result as type: Sentence Quiz (Offset 2,000,000)
  saveResult(sqScore, sqQuestions.length, 0, null, 'sentence_quiz');

  container.innerHTML = `
    <div style="text-align:center;padding:60px 20px;">
      <div style="font-size:80px;margin-bottom:20px;">${pct >= 80 ? '🏆' : pct >= 50 ? '👏' : '📚'}</div>
      <h2 style="font-family:'DM Serif Display',serif;font-size:32px;margin-bottom:10px;">Hoàn thành!</h2>
      <p style="color:var(--text2);font-size:18px;margin-bottom:40px;">Bạn trả lời đúng <strong>${sqScore}/${sqQuestions.length}</strong> câu (${pct}%).</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <button class="btn-primary" style="padding:15px 30px;font-size:16px;background:var(--blue);" onclick="renderSQSetup()">🔄 Ôn tập lại</button>
        <button class="btn-ghost" style="padding:15px 30px;font-size:16px;border:1px solid var(--border);" onclick="exitVocabQuiz()">← Quay lại Luyện câu</button>
      </div>
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
    const { data: classes } = await sb.from('class_members').select('class_id').eq('student_id', currentUser.id);
    const classIds = (classes || []).map(c => c.class_id);

    let query = sb.from('announcements').select('*');
    const now = new Date().toISOString();
    // Only show non-expired announcements
    query = query.or(`expires_at.gt.${now},expires_at.is.null`);

    if (classIds.length > 0) {
      query = query.or(`class_id.is.null,class_id.in.(${classIds.join(',')})`);
    } else {
      query = query.is('class_id', null);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false }).limit(3);
    if (error) throw error;
    
    const quickView = document.getElementById('ann-quick-view');
    if (quickView) {
      if (!data || data.length === 0) {
        quickView.style.display = 'none';
      } else {
        quickView.style.display = 'block';
        quickView.innerHTML = `
          <div class="announcement-banner" style="background:var(--primary-bg); border:1px solid var(--primary); border-radius:var(--r); padding:16px; margin-bottom:24px;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; color:var(--primary);">
              <span style="font-size:20px;">📢</span>
              <strong style="font-size:15px; text-transform:uppercase; letter-spacing:0.5px;">Thông báo mới</strong>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">
              ${data.map(a => `
                <div class="ann-item" style="background:rgba(255,255,255,0.6); padding:12px; border-radius:var(--r-sm); border-left:3px solid var(--primary);">
                  <div style="font-weight:700; font-size:14px; margin-bottom:4px; color:var(--text);">${a.title}</div>
                  <div style="font-size:13px; line-height:1.4; color:var(--text2);">${a.content}</div>
                  <div style="font-size:10px; color:var(--text3); margin-top:6px; text-align:right;">🕒 ${fmtDate(a.created_at)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
    }
  } catch (err) {
    console.error("LoadAnnouncements error:", err);
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

  const nextLevel = currentStuLevel + 1;
  const isPendingNext = pendingSet.has(nextLevel);

  // Level tiles
  const tilesHTML = HSK_DEFS.map(l => {
    const isUnlocked = currentStuLevel >= l.level;
    const isPending  = pendingSet.has(l.level);
    let tileClass = 'hsk-level-tile';
    let icon = l.level === 1 ? '→' : isUnlocked ? '✓' : isPending ? '⏳' : '🔒';
    let nameColor = isUnlocked ? l.color : 'var(--text3)';
    if (isUnlocked && l.level === currentStuLevel) tileClass += ' active';
    if (!isUnlocked && !isPending) tileClass += ' locked';

    // Click handler: if clicking current level, start review for next level
    const clickAttr = (l.level === currentStuLevel && nextLevel <= 6 && !isPendingNext) 
      ? `onclick="startHskReview(${nextLevel})"` 
      : (isPendingNext && l.level === nextLevel) ? `onclick="showPendingOverlay(${nextLevel})"` : '';

    return `
      <div class="${tileClass}" ${clickAttr} style="border-color:${isUnlocked&&l.level===currentStuLevel?l.color:'var(--border)'}; ${clickAttr?'cursor:pointer;':''}">
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
  const fromLevel = toLevel - 1;
  const levelWords = allVocab.filter(v => (v.hsk_level || 1) === fromLevel);
  
  if (levelWords.length < 4) { 
    showToast(`Dữ liệu HSK ${fromLevel} chưa sẵn sàng hoặc không đủ (cần ít nhất 4 từ).`); 
    return; 
  }

  // Confirmation for long quiz
  if (levelWords.length > 20) {
    if (!confirm(`Bạn sắp làm bài ôn tập HSK ${fromLevel} với ${levelWords.length} câu hỏi. \nBạn cần trả lời đúng 100% để yêu cầu lên HSK ${toLevel}. \nBạn đã sẵn sàng chưa?`)) {
      return;
    }
  }

  hskReviewTarget = toLevel;
  // Use ALL words of the level as requested (e.g., 150 questions for HSK1)
  hskReviewQueue  = shuffle(levelWords); 
  hskReviewIdx    = 0;

  document.getElementById('hsk-review-title').textContent = `Ôn tập 100% — Mở khoá HSK ${toLevel} (${hskReviewQueue.length} câu)`;
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
  // Filter wrong answers: get 3 random different from current
  const wrong = shuffle(allVocab.filter(v => v.id !== cur.id)).slice(0, 3);
  const opts  = shuffle([cur,...wrong]);
  
  // Clear sticky hover
  const area = document.getElementById('hsk-review-area');
  if (area) {
    area.style.pointerEvents = 'none';
    void area.offsetHeight;
    area.style.pointerEvents = 'auto';
  }
  document.getElementById('hsk-review-area').innerHTML = `
    <div class="question-card">
      <div class="q-label">Từ này có nghĩa là gì?</div>
      <div class="q-hanzi">${cur.hanzi}</div>
      <div class="q-num">${idx+1} / ${total} — <span style="color:var(--primary);font-weight:700">Phải đúng tất cả!</span></div>
    </div>
    <div class="options-grid">
      ${opts.map(o=>`
        <button class="opt-btn" data-is-correct="${o.id===cur.id}" 
          onclick="speak('${o.hanzi.replace(/'/g, "\\'")}'); handleHskReviewAns(this,${o.id===cur.id},${idx},${cur.id})">
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            <span class="opt-main">${o.meaning}</span>
            <span style="font-size:12px;color:var(--text3);">(${o.pinyin})</span>
            <span class="btn-speak" style="font-size:14px;background:none;border:none;cursor:pointer;" onclick="event.stopPropagation(); speak('${o.hanzi.replace(/'/g, "\\'")}')">🔊</span>
          </div>
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
    setTimeout(() => renderHskReviewQ(idx + 1), 1000);
  } else {
    btn.classList.add('wrong');
    const correctBtn = document.querySelector('#hsk-review-area .opt-btn[data-is-correct="true"]');
    if (correctBtn) correctBtn.classList.add('correct');
    
    const correctVocab = allVocab.find(v=>v.id===correctId);
    fb.textContent=`✗ Sai rồi! Đáp án: ${correctVocab?.pinyin} — ${correctVocab?.meaning}. Làm lại từ đầu!`;
    fb.className='feedback wrong';
    
    // Restart with the same level words
    const fromLevel = hskReviewTarget - 1;
    const levelWords = allVocab.filter(v => (v.hsk_level || 1) === fromLevel);
    setTimeout(()=>{ 
      hskReviewQueue = shuffle(levelWords); 
      renderHskReviewQ(0); 
    }, 1500);
  }
}

async function showHskReviewSuccess() {
  // Save result as type: Vocab Quiz (Review counts as quiz)
  saveResult(hskReviewQueue.length, hskReviewQueue.length, 0, null, 'vocab_quiz');

  document.getElementById('hsk-review-area').innerHTML = `
    <div class="result-card">
      <div class="result-emoji">🎉</div>
      <div class="result-score">${hskReviewQueue.length} / ${hskReviewQueue.length}</div>
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
    showToast('Không thể gửi yêu cầu lên cấp. V vui lòng thử lại.');
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

    const { data: folders } = await sb.from('quiz_folders').select('*').order('name');
    const folderMap = {};
    (folders || []).forEach(f => folderMap[f.id] = { name: f.name, quizzes: [] });
    folderMap[0] = { name: 'Chưa phân loại', quizzes: [] };
    
    const { data:results } = await sb.from('quiz_results').select('*').eq('student_id',currentUser.id).order('completed_at', { ascending: false });
    
    const resultsByQuiz = {}; // quiz_id -> array of results
    (results || []).forEach(r => {
      if (!resultsByQuiz[r.quiz_id]) resultsByQuiz[r.quiz_id] = [];
      resultsByQuiz[r.quiz_id].push(r);
    });

    const bestResultsMap = {}; // quiz_id -> best result object
    Object.keys(resultsByQuiz).forEach(qid => {
      const qResults = resultsByQuiz[qid];
      const sorted = [...qResults].sort((x, y) => {
        const scoreX = x.score / x.total;
        const scoreY = y.score / y.total;
        if (scoreX !== scoreY) return scoreY - scoreX;
        return (x.time_spent || 999999) - (y.time_spent || 999999);
      });
      bestResultsMap[qid] = sorted[0];
    });

    const doneSet = new Set((results||[]).map(r=>r.quiz_id));
    const el = document.getElementById('assigned-list');
    if (!el) return;
    
    // Count incomplete homework
    const incompleteHomework = (assigns||[]).filter(a => 
      a.quizzes && a.quizzes.type === 'homework' && !doneSet.has(a.quizzes.id)
    ).length;
    
    // Update badge
    const badge = document.getElementById('homework-badge');
    if (incompleteHomework > 0) {
      badge.textContent = incompleteHomework;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
    
    if (!assigns||!assigns.length) {
      el.innerHTML='<div class="empty-state"><span class="empty-icon">📝</span>Chưa có bài nào được giao.</div>';
      return;
    }

    // Sort assignments into folders
    assigns.forEach(a => {
      if (!a.quizzes) return;
      const fid = a.quizzes.folder_id || 0;
      if (folderMap[fid]) folderMap[fid].quizzes.push(a);
      else folderMap[0].quizzes.push(a);
    });

    const sortedFolders = Object.entries(folderMap)
      .filter(([id, data]) => data.quizzes.length > 0)
      .sort((a, b) => {
        if (a[0] == 0) return 1;
        if (b[0] == 0) return -1;
        return a[1].name.localeCompare(b[1].name);
      });

    el.innerHTML = sortedFolders.map(([fid, data]) => `
      <div style="grid-column: 1 / -1; margin-top: 24px; margin-bottom: 12px; width: 100%;">
        <h3 style="font-size:18px; display:flex; align-items:center; gap:10px; color:var(--primary); font-family:'DM Serif Display', serif; cursor:pointer; user-select:none; background:var(--surface2); padding:12px; border-radius:var(--r);" onclick="toggleFolderStudent(${fid})">
          <span id="folder-arrow-stu-${fid}" style="transition:transform 0.2s;">▶</span> 📂 ${data.name}
          <span style="font-size:12px; color:var(--text3); font-weight:normal; font-family:'DM Sans', sans-serif;">(${data.quizzes.length} bài)</span>
        </h3>
      </div>
      <div id="folder-content-stu-${fid}" style="display:none; grid-column: 1 / -1; width: 100%; margin-bottom:20px;">
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:16px;">
          ${data.quizzes.map(a => {
          const q = a.quizzes;
          const isDone  = doneSet.has(q.id);
          const isQuick = q.type==='quickquiz';
          const dur     = isQuick && q.duration_seconds ? Math.round(q.duration_seconds/60)+'p' : null;
          const best = bestResultsMap[q.id];
          const qHistory = resultsByQuiz[q.id] || [];
          const hasHistory = qHistory.length > 0;

          return `
            <div class="card" style="padding:18px; border: 1px solid var(--border); transition: transform 0.2s; height: 100%; display: flex; flex-direction: column;">
              <div style="display:flex;gap:14px;align-items:flex-start; flex:1;">
                <div class="quiz-card-icon" style="background:${isQuick?'var(--gold-bg)':'var(--blue-bg)'};width:46px;height:46px;font-size:20px;">
                  ${isQuick?'⚡':'📝'}
                </div>
                <div class="card-info" style="flex:1;">
                  <h4 style="font-size:15px; margin:0;">${q.title}${!isDone?'<span style="color:var(--primary);margin-left:8px;font-weight:700;">!</span>':''}</h4>
                  <p style="margin:4px 0 0 0; font-size:13px; color:var(--text2);">${(q.vocab_ids||[]).length} từ · ${isQuick?'Quick Quiz':'Homework'}${dur?' · '+dur:''}</p>
                  ${isDone ? `<p style="font-size:11px; color:var(--accent); font-weight:600; margin-top:4px;">🏆 Cao nhất: ${best.score}/${best.total} (${fmtTime(best.time_spent)})</p>` : ''}
                </div>
              </div>
              
              <div class="card-actions-bottom" style="margin-top:16px; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; gap:8px;">
                  ${hasHistory ? `<button class="btn-ghost btn-xs" onclick="toggleStudentHistory(${q.id})" title="Xem lịch sử lần làm">📜 Lịch sử</button>` : ''}
                </div>
                ${isDone
                  ? `<div style="display:flex; gap:8px; align-items:center;">
                       <span class="badge badge-done" style="font-size:10px;">✓ Xong</span> 
                       <button class="btn-primary btn-sm" onclick="startQuiz(${q.id}, true)">🔄</button>
                     </div>`
                  : `<button class="btn-primary btn-sm" onclick="startQuiz(${q.id})">Bắt đầu 🎯</button>`
                }
              </div>

              <div id="stu-history-${q.id}" style="display:none; margin-top:12px; padding-top:12px; border-top:1px dashed var(--border);">
                <div style="font-size:12px; font-weight:700; margin-bottom:8px; color:var(--text2);">Lịch sử lần làm:</div>
                <div style="display:flex; flex-direction:column; gap:6px;">
                  ${(() => {
                    // Filter: First attempt + 3 Latest
                    let displayedHistory = qHistory;
                    if (qHistory.length > 4) {
                      const first = qHistory[qHistory.length - 1];
                      const latest3 = qHistory.slice(0, 3);
                      // Avoid duplication if first is one of the latest3
                      displayedHistory = [...latest3];
                      if (!latest3.find(r => r.id === first.id)) displayedHistory.push(first);
                    }
                    
                    return displayedHistory.map((rh, idx) => {
                      const hPct = Math.round(rh.score / rh.total * 100);
                      const isFirst = idx === displayedHistory.length - 1 && qHistory.length > 3;
                      return `
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; background:var(--surface2); padding:6px 10px; border-radius:var(--r-sm);">
                          <span>${isFirst ? '🏁 Lần đầu' : 'Lần ' + (qHistory.length - qHistory.indexOf(rh))}: <strong>${rh.score}/${rh.total}</strong> (${hPct}%)</span>
                          <span style="color:var(--text3); font-size:10px;">${fmtDate(rh.completed_at)}</span>
                        </div>
                      `;
                    }).join('');
                  })()}
                </div>
              </div>
            </div>`;
        }).join('')}
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error("LoadAssigned error:", err);
    const el = document.getElementById('assigned-list');
    if (el) el.innerHTML = '<div class="empty-state">Lỗi tải bài tập</div>';
  }
}

// ══════════════════════════════════════════
//  QUIZ OVERLAY (Làm bài)
// ══════════════════════════════════════════
async function startQuiz(quizId, isRetake = false) {
  activeQuizId = quizId;
  isHomeworkRetake = isRetake;
  quizIdx = 0; quizCorrect = 0; quizAnswered = false;
  quizStartTime = Date.now();
  const { data:quiz } = await sb.from('quizzes').select('*').eq('id',quizId).single();
  if (!quiz) return;
  const vocabIds = quiz.vocab_ids || [];
  const { data:vocab } = await sb.from('vocab').select('*').in('id', vocabIds);
  quizVocab = shuffle(vocab||[]);
  document.getElementById('quiz-overlay-title').textContent = quiz.title;
  const timerWrap = document.getElementById('timer-wrap');
  
  if (isHomeworkRetake && quiz.type === 'homework') {
    homeworkQTimerLeft = 10;
    timerWrap.style.display='block';
    startHomeworkQuestionTimer();
  } else if (quiz.type==='quickquiz' && quiz.duration_seconds) {
    quizTimerLeft = quiz.duration_seconds;
    quizTimerTotal = quiz.duration_seconds;
    timerWrap.style.display='block';
    startQuizTimer();
  } else {
    timerWrap.style.display='none';
    clearInterval(quizTimerInterval);
    clearInterval(homeworkAutoTimer);
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
  // Filter wrong answers from ONLY the selected vocabulary (quizVocab)
  const wrong = shuffle(quizVocab.filter(v => v.id !== cur.id)).slice(0, 3);
  const opts  = shuffle([cur, ...wrong]);

  // Clear sticky hover
  const area = document.getElementById('quiz-area');
  if (area) {
    area.style.pointerEvents = 'none';
    void area.offsetHeight;
    area.style.pointerEvents = 'auto';
  }
  document.getElementById('quiz-area').innerHTML = `
    <div class="question-card">
      <div class="q-label">Từ này có nghĩa là gì?</div>
      <div class="q-hanzi">${cur.hanzi}</div>
      <div class="q-num">${idx+1} / ${total}</div>
    </div>
    <div class="options-grid">
      ${opts.map(o=>`
        <button class="opt-btn" data-is-correct="${o.id===cur.id}" 
          onclick="speak('${o.hanzi.replace(/'/g, "\\'")}'); handleQuizAns(this,${o.id===cur.id},${idx})">
          <span class="opt-main">${o.meaning}</span>
          <span class="opt-pinyin">(${o.pinyin})</span>
          <span class="btn-speak" onclick="event.stopPropagation(); speak('${o.hanzi.replace(/'/g, "\\'")}')">🔊</span>
        </button>`).join('')}
    </div>
    <div class="feedback" id="quiz-fb"></div>
    <button class="next-btn" id="quiz-next" onclick="renderQuizQ(${idx+1})">${idx+1>=total?'Nộp bài':'Câu tiếp →'}</button>`;
  
  // Start homework timer if in retake mode
  if (isHomeworkRetake) {
    startHomeworkQuestionTimer();
  }
}

function handleQuizAns(btn, isCorrect, idx) {
  if (quizAnswered) return;
  quizAnswered = true;
  clearInterval(homeworkAutoTimer);
  document.querySelectorAll('#quiz-area .opt-btn').forEach(b=>b.disabled=true);
  const fb = document.getElementById('quiz-fb');
  if (isCorrect && btn) {
    quizCorrect++;
    btn.classList.add('correct');
    fb.textContent='✓ Chính xác!'; fb.className='feedback correct';
  } else {
    if (btn) btn.classList.add('wrong');
    fb.textContent = btn ? '✗ Sai rồi!' : '⏰ Hết thời gian!';
    fb.className = 'feedback wrong';
    // Highlight the correct one
    const correctBtn = document.querySelector('#quiz-area .opt-btn[data-is-correct="true"]');
    if (correctBtn) correctBtn.classList.add('correct');
    
    const cur = quizVocab[idx];
    fb.innerHTML += `<br>Đáp án: <strong style="color:var(--text);font-size:16px;">${cur.hanzi}</strong> (${cur.pinyin}) - ${cur.meaning}`; 
    fb.className='feedback wrong';
  }
  if (idx + 1 >= quizVocab.length) {
    document.getElementById('quiz-next').style.display = 'block';
  }
  setTimeout(() => renderQuizQ(idx + 1), 1000);
}

async function finishQuiz() {
  clearInterval(quizTimerInterval);
  clearInterval(homeworkAutoTimer);
  const total = quizVocab.length;
  const timeSpent = Math.round((Date.now() - quizStartTime) / 1000);
  const { error } = await sb.from('quiz_results').insert({ 
    quiz_id: activeQuizId, 
    student_id: currentUser.id, 
    score: quizCorrect, 
    total,
    time_spent: timeSpent
  });
  if (error) {
    console.error("Lỗi lưu kết quả bài tập:", error);
    showToast("Không thể lưu kết quả. Có thể do lỗi cơ sở dữ liệu.");
  }
  const pct = Math.round(quizCorrect/total*100);
  const cls = pct>=80?'var(--accent)':pct>=50?'var(--gold)':'var(--primary)';
  document.getElementById('quiz-area').innerHTML = `
    <div class="result-card">
      <div class="result-emoji">${pct>=80?'🎉':pct>=50?'😊':'😅'}</div>
      <div class="result-score" style="color:${cls}">${quizCorrect}<span style="font-size:28px;color:var(--text3)">/${total}</span></div>
      <div class="result-detail">
        ${pct}% chính xác · ${pct>=80?'Xuất sắc!':pct>=50?'Khá tốt, cố lên!':'Cần luyện thêm!'}
        <br><span style="font-size:14px; color:var(--text3); margin-top:8px; display:block;">Thời gian hoàn thành: <strong>${fmtTime(timeSpent)}</strong></span>
      </div>
      <div style="display:flex; gap:10px; margin-top:20px;">
        <button class="btn-ghost" style="flex:1;justify-content:center;" onclick="exitQuizOverlay()">← Quay lại</button>
        <button class="btn-primary" style="flex:1;justify-content:center;" onclick="startQuiz(activeQuizId, isHomeworkRetake)">🔄 Làm lại</button>
      </div>
    </div>`;
  document.getElementById('quiz-prog').style.width='100%';
  await loadAssigned();
  await loadHistory();
}

function startHomeworkQuestionTimer() {
  clearInterval(homeworkAutoTimer);
  homeworkQTimerLeft = 5;
  const timerVal = document.getElementById('timer-val');
  const timerBar = document.getElementById('timer-bar');
  
  homeworkAutoTimer = setInterval(() => {
    homeworkQTimerLeft--;
    if (timerVal) timerVal.textContent = homeworkQTimerLeft + 's';
    if (timerBar) timerBar.style.width = (homeworkQTimerLeft / 5 * 100) + '%';
    
    if (homeworkQTimerLeft <= 0) {
      clearInterval(homeworkAutoTimer);
      handleQuizAns(null, false, quizIdx);
    }
  }, 1000);
}

function exitQuizOverlay() {
  clearInterval(quizTimerInterval);
  clearInterval(homeworkAutoTimer);
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
          </div>
          <div class="flashcard-back">
            <div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
              <button class="btn-speak" onclick="event.stopPropagation(); speak('${cur.hanzi}')">🔊 Nghe phát âm</button>
              <div class="fc-pinyin">${cur.pinyin}</div>
              <div class="fc-meaning">${cur.meaning}</div>
            </div>
          </div>
        </div>
      </div>
      <button class="next-btn" style="display:block;margin-top:20px;" onclick="renderPracticeQ(${idx+1})">Từ tiếp theo →</button>`;
    return;
  }

  const isMeaning = practiceMode==='meaning';
  // Filter wrong answers: get 3 random different from current
  const wrong = shuffle(allVocab.filter(v => v.id !== cur.id)).slice(0, 3);
  const opts  = shuffle([cur,...wrong]);
  document.getElementById('practice-area').innerHTML = `
    <div class="question-card">
      <div class="q-label">${isMeaning?'Từ này có nghĩa là gì?':'Nghĩa này là từ nào?'}</div>
      ${isMeaning
        ? `<div class="q-hanzi">${cur.hanzi}</div>`
        : `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin:20px 0;">
             <button class="btn-speak" style="width:40px;height:40px;font-size:18px;" onclick="speak('${cur.hanzi}')">🔊</button>
             <div class="q-text-mode" style="margin:0;">${cur.meaning}</div>
             <div style="font-size:16px;color:var(--text3)">(${cur.pinyin})</div>
           </div>`
      }
      <div class="q-num">${idx+1} / ${practiceQueue.length}</div>
    </div>
    <div class="options-grid">
      ${opts.map(o=>`
        <button class="opt-btn" data-is-correct="${o.id===cur.id}" 
          onclick="speak('${o.hanzi.replace(/'/g, "\\'")}'); handlePracticeAns(this,${o.id===cur.id},${idx})">
          ${isMeaning
            ? `<span class="opt-main">${o.meaning}</span>
               <span class="opt-pinyin">(${o.pinyin})</span>
               <span class="btn-speak" onclick="event.stopPropagation(); speak('${o.hanzi.replace(/'/g, "\\'")}')">🔊</span>`
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
    // Background save every 10 correct answers for Tự luyện từ (Offset 3,000,000)
    practiceCorrectCount = (window.practiceCorrectCount || 0) + 1;
    window.practiceCorrectCount = practiceCorrectCount;
    if (practiceCorrectCount % 10 === 0) {
      saveResult(10, 10, 0, null, 'practice_mode');
    }
  } else {
    const correctBtn = document.querySelector('#practice-area .opt-btn[data-is-correct="true"]');
    if (correctBtn) correctBtn.classList.add('correct');
    
    const cur = practiceQueue[idx];
    fb.textContent=`✗ Sai rồi! Đáp án: ${cur.pinyin} — ${cur.meaning}`;
    fb.className='feedback wrong';
  }
  if (idx + 1 < practiceQueue.length) {
    // Auto advance, no button needed for intermediate
  } else {
    document.getElementById('pr-next').style.display = 'block';
  }
  setTimeout(() => renderPracticeQ(idx + 1), 1000);
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
      
      let title = r.quizzes?.title || '—';
      if (!r.quiz_id) {
        if (r.time_spent >= 3000000) title = '🏋 Tự luyện từ';
        else if (r.time_spent >= 2000000) title = '💬 Luyện câu';
        else if (r.time_spent >= 1000000) title = '📝 Trắc nghiệm từ';
        else title = '🏁 Ôn tập';
      }
      const actualTime = r.time_spent % 1000000;

      return `
        <tr>
          <td>${title}</td>
          <td class="${cls}">${r.score}/${r.total}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="progress-track" style="width:60px;flex-shrink:0;">
                <div class="progress-fill${pct>=80?' ':pct>=50?' gold':' red'}" style="width:${pct}%"></div>
              </div>
              <span class="${cls}" style="font-size:13px;font-weight:700;">${pct}%</span>
            </div>
          </td>
          <td style="font-size:12px;color:var(--text3);">
            ${fmtTime(actualTime)}<br>
            <span style="font-size:10px;">${fmtDate(r.completed_at)}</span>
          </td>
        </tr>`;
    }).join('');
  } catch (err) {
    console.error("LoadHistory error:", err);
    const el = document.getElementById('history-list');
    if (el) el.innerHTML = '<tr><td colspan="4" class="empty-state">Lỗi tải lịch sử</td></tr>';
  }
}
// ══════════════════════════════════════════
//  LEADERBOARD
// ══════════════════════════════════════════
let currentLeaderboardMode = 'xp';
let currentPracticeType = 'all'; // all, vocab, sentence, practice

function switchLeaderboard(btn, mode) {
  currentLeaderboardMode = mode;
  document.querySelectorAll('.leaderboard-tabs .mode-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadLeaderboard();
}

function switchPracticeType(type) {
  currentPracticeType = type;
  document.querySelectorAll('.practice-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  loadLeaderboard();
}

async function loadLeaderboard() {
  const listEl = document.getElementById('leaderboard-list');
  const lvlSelect = document.getElementById('leaderboard-level-select');
  const subTitleEl = document.getElementById('leaderboard-subtitle');
  
  if (!listEl) return;
  const targetLevel = lvlSelect ? parseInt(lvlSelect.value) : currentStuLevel;
  listEl.innerHTML = '<p class="loading">Đang tải dữ liệu xếp hạng...</p>';
  
  if (lvlSelect) {
    lvlSelect.style.display = currentLeaderboardMode === 'streak' ? 'none' : 'block';
  }

  try {
    // 1. Get all students of the same level (except for Streak)
    let studentQuery = sb.from('profiles').select('id, full_name');
    
    // For most modes, we only care about students in the same HSK level
    const { data: levelPeers } = await sb.from('hsk_student_levels').select('student_id, hsk_level');
    const levelMap = {};
    (levelPeers || []).forEach(lp => levelMap[lp.student_id] = lp.hsk_level);
    
    // 2. Get all quiz results to calculate stats
    // Note: In a production app, this should be a DB View or an RPC for performance
    const { data: allResults, error } = await sb.from('quiz_results').select('*');
    if (error) throw error;

    // 3. Get all student profiles
    const { data: allProfiles } = await sb.from('profiles').select('id, full_name').eq('role', 'student');
    const profileMap = {};
    (allProfiles || []).forEach(p => profileMap[p.id] = p.full_name);

    let ranking = [];

    if (currentLeaderboardMode === 'xp') {
      subTitleEl.textContent = `Top 10 nỗ lực nhất - HSK ${targetLevel}`;
      const xpMap = {};
      allResults.forEach(r => {
        if (levelMap[r.student_id] === targetLevel) {
          xpMap[r.student_id] = (xpMap[r.student_id] || 0) + (r.score || 0);
        }
      });
      ranking = Object.keys(xpMap).map(sid => ({
        id: sid,
        name: profileMap[sid] || 'Học sinh',
        value: xpMap[sid],
        unit: 'XP'
      })).sort((a, b) => b.value - a.value);
    } 
    else if (currentLeaderboardMode === 'accuracy') {
      subTitleEl.textContent = `Top 10 thông thái nhất - HSK ${targetLevel}`;
      const accMap = {};
      allResults.forEach(r => {
        if (levelMap[r.student_id] === targetLevel && r.total > 0) {
          if (!accMap[r.student_id]) accMap[r.student_id] = { sum: 0, count: 0 };
          accMap[r.student_id].sum += (r.score / r.total * 100);
          accMap[r.student_id].count++;
        }
      });
      ranking = Object.keys(accMap)
        .filter(sid => accMap[sid].count >= 1) // Any quiz counts
        .map(sid => ({
          id: sid,
          name: profileMap[sid] || 'Học sinh',
          value: Math.round(accMap[sid].sum / accMap[sid].count),
          unit: '%'
        })).sort((a, b) => b.value - a.value);
    }
    else if (currentLeaderboardMode === 'mastery') {
      subTitleEl.textContent = `Top 10 hoàn thành xuất sắc - HSK ${targetLevel}`;
      const masteryMap = {};
      allResults.forEach(r => {
        if (levelMap[r.student_id] === targetLevel && (r.score / r.total) >= 0.8) {
          if (!masteryMap[r.student_id]) masteryMap[r.student_id] = 0;
          masteryMap[r.student_id]++; // Count all high-score activities (quizzes + practice)
        }
      });
      ranking = Object.keys(masteryMap).map(sid => ({
        id: sid,
        name: profileMap[sid] || 'Học sinh',
        value: masteryMap[sid],
        unit: 'bài'
      })).sort((a, b) => b.value - a.value);
    }
    else if (currentLeaderboardMode === 'streak') {
      subTitleEl.textContent = `Top 10 bền bỉ nhất - Toàn trường`;
      const streakMap = {};
      
      // Group results by student and date
      const studentDates = {};
      allResults.forEach(r => {
        const d = new Date(r.completed_at).toLocaleDateString('en-CA');
        if (!studentDates[r.student_id]) studentDates[r.student_id] = new Set();
        studentDates[r.student_id].add(d);
      });

      Object.keys(studentDates).forEach(sid => {
        let streak = 0;
        let checkDate = new Date();
        for (let i = 0; i < 100; i++) {
          const ds = checkDate.toLocaleDateString('en-CA');
          if (studentDates[sid].has(ds)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            if (i === 0) { checkDate.setDate(checkDate.getDate() - 1); continue; }
            break;
          }
        }
        if (streak > 0) streakMap[sid] = streak;
      });

      ranking = Object.keys(streakMap).map(sid => ({
        id: sid,
        name: profileMap[sid] || 'Học sinh',
        value: streakMap[sid],
        unit: 'ngày'
      })).sort((a, b) => b.value - a.value);
    }
    else if (currentLeaderboardMode === 'speed') {
      subTitleEl.textContent = `Top 10 phản xạ nhanh - HSK ${targetLevel}`;
      const speedMap = {};
      allResults.forEach(r => {
        if (levelMap[r.student_id] === targetLevel && r.time_spent > 0 && r.total > 0) {
          if (!speedMap[r.student_id]) speedMap[r.student_id] = { sum: 0, count: 0 };
          speedMap[r.student_id].sum += (r.time_spent / r.total);
          speedMap[r.student_id].count++;
        }
      });
      ranking = Object.keys(speedMap)
        .filter(sid => speedMap[sid].count >= 1)
        .map(sid => ({
          id: sid,
          name: profileMap[sid] || 'Học sinh',
          value: parseFloat((speedMap[sid].sum / speedMap[sid].count).toFixed(1)),
          unit: 's/câu'
        })).sort((a, b) => a.value - b.value);
    }
    else if (currentLeaderboardMode === 'weekly_practice') {
      subTitleEl.textContent = `Xếp hạng Ôn luyện 7 ngày qua — Toàn trường`;
      
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      // Filter by time and optionally by practice type offset
      let weeklyResults = allResults.filter(r => new Date(r.completed_at) >= weekAgo);
      if (currentPracticeType !== 'all') {
        const offsetMap = { vocab: 1000000, sentence: 2000000, practice: 3000000 };
        const min = offsetMap[currentPracticeType];
        const max = min + 1000000;
        weeklyResults = weeklyResults.filter(r => r.time_spent >= min && r.time_spent < max);
      }
      
      // Normalize time_spent for calculations
      const normalized = weeklyResults.map(r => ({ ...r, time_spent: r.time_spent % 1000000 }));

      // 1. Quantity
      const countMap = {};
      normalized.forEach(r => countMap[r.student_id] = (countMap[r.student_id] || 0) + 1);
      const topCount = Object.keys(countMap).map(sid => ({
        id: sid, name: profileMap[sid] || 'Học sinh', value: countMap[sid], unit: 'lần'
      })).sort((a, b) => b.value - a.value).slice(0, 5);

      // 2. Accuracy
      const accMap = {};
      normalized.forEach(r => {
        if (r.total > 0) {
          if (!accMap[r.student_id]) accMap[r.student_id] = { sum: 0, count: 0 };
          accMap[r.student_id].sum += (r.score / r.total * 100);
          accMap[r.student_id].count++;
        }
      });
      const topAcc = Object.keys(accMap).map(sid => ({
        id: sid, name: profileMap[sid] || 'Học sinh', value: Math.round(accMap[sid].sum / accMap[sid].count), unit: '%'
      })).sort((a, b) => b.value - a.value).slice(0, 5);

      // 3. Speed
      const speedMap = {};
      normalized.forEach(r => {
        if (r.time_spent > 0 && r.total > 0) {
          if (!speedMap[r.student_id]) speedMap[r.student_id] = { sum: 0, count: 0 };
          speedMap[r.student_id].sum += (r.time_spent / r.total);
          speedMap[r.student_id].count++;
        }
      });
      const topSpeed = Object.keys(speedMap).map(sid => ({
        id: sid, name: profileMap[sid] || 'Học sinh', value: parseFloat((speedMap[sid].sum / speedMap[sid].count).toFixed(1)), unit: 's/câu'
      })).sort((a, b) => a.value - b.value).slice(0, 5);

      const renderMini = (title, data, icon, unit) => `
        <div class="weekly-mini-card" style="background:var(--surface); border:1px solid var(--border); border-radius:var(--r); padding:16px;">
          <h4 style="margin-bottom:12px; display:flex; align-items:center; gap:8px; font-size:14px; color:var(--primary);">
            <span>${icon}</span> ${title}
          </h4>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${data.length === 0 ? '<div class="empty-state" style="padding:10px; font-size:12px;">Chưa có dữ liệu</div>' : data.map((item, i) => {
              const isMe = item.id === currentUser.id;
              return `
                <div style="display:flex; align-items:center; gap:10px; padding:6px; border-radius:var(--r-sm); ${isMe ? 'background:var(--primary-bg);' : ''}">
                  <span style="font-weight:700; width:20px; font-size:12px; color:var(--text3);">${i+1}</span>
                  <div class="stu-avatar" style="background:${avatarColor(item.name)}; width:24px; height:24px; font-size:10px;">${initials(item.name)}</div>
                  <span style="flex:1; font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</span>
                  <span style="font-size:12px; font-weight:700; color:var(--primary);">${item.value}<small style="font-weight:400; color:var(--text3); margin-left:2px;">${unit}</small></span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;

      listEl.innerHTML = `
        <div class="practice-type-tabs" style="display:flex; gap:8px; margin-bottom:15px; background:var(--surface2); padding:4px; border-radius:8px;">
          <button class="practice-type-btn ${currentPracticeType==='all'?'active':''}" data-type="all" onclick="switchPracticeType('all')">Tất cả</button>
          <button class="practice-type-btn ${currentPracticeType==='vocab'?'active':''}" data-type="vocab" onclick="switchPracticeType('vocab')">Trắc nghiệm từ</button>
          <button class="practice-type-btn ${currentPracticeType==='sentence'?'active':''}" data-type="sentence" onclick="switchPracticeType('sentence')">Luyện câu</button>
          <button class="practice-type-btn ${currentPracticeType==='practice'?'active':''}" data-type="practice" onclick="switchPracticeType('practice')">Tự luyện từ</button>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap:16px; margin-top:10px;">
          ${renderMini('Nỗ lực nhất', topCount, '🔥', 'lần')}
          ${renderMini('Chính xác nhất', topAcc, '🎯', '%')}
          ${renderMini('Phản xạ nhanh', topSpeed, '⚡', 's/c')}
        </div>
      `;
      return;
    }

    // 4. Render top 10
    const top10 = ranking.slice(0, 10);
    if (top10.length === 0) {
      listEl.innerHTML = '<div class="empty-state">Chưa có dữ liệu xếp hạng trong mục này.</div>';
      return;
    }

    listEl.innerHTML = `
      <div class="leaderboard-container">
        ${top10.map((item, index) => {
          const isMe = item.id === currentUser.id;
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : (index + 1);
          const color = avatarColor(item.name);
          return `
            <div class="leaderboard-item ${isMe ? 'me' : ''}">
              <div class="rank-num">${medal}</div>
              <div class="stu-avatar" style="background:${color}; width:36px; height:36px; font-size:13px;">${initials(item.name)}</div>
              <div class="stu-name-wrap">
                <div class="stu-name">${item.name} ${isMe ? '<span class="badge-me">Bạn</span>' : ''}</div>
                <div class="stu-level-tag">HSK ${levelMap[item.id] || targetLevel}</div>
              </div>
              <div class="rank-value">
                <strong>${item.value}</strong>
                <span>${item.unit}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (err) {
    console.error("Leaderboard error:", err);
    listEl.innerHTML = '<div class="empty-state">Lỗi tải bảng xếp hạng.</div>';
  }
}

async function saveResult(score, total, timeSpent, quizId = null, practiceType = null) {
  let finalTime = timeSpent;
  // Apply offset based on practice type
  if (practiceType === 'vocab_quiz') finalTime += 1000000;
  else if (practiceType === 'sentence_quiz') finalTime += 2000000;
  else if (practiceType === 'practice_mode') finalTime += 3000000;

  try {
    const { error } = await sb.from('quiz_results').insert({
      student_id: currentUser.id,
      quiz_id: quizId,
      score: score,
      total: total,
      time_spent: finalTime
    });
    if (error) throw error;
    // loadHistory removed
  } catch (err) {
    console.error("Save result error:", err);
  }
}

async function submitFeedback() {
  const content = document.getElementById('stu-feedback-content').value.trim();
  const msgEl = document.getElementById('stu-feedback-msg');
  if (!content) return;
  
  try {
    const { error } = await sb.from('student_feedback').insert({
      student_id: currentUser.id,
      content: content
    });
    if (error) throw error;
    
    document.getElementById('stu-feedback-content').value = '';
    closeModal('modal-student-feedback');
    showToast('✓ Cảm ơn bạn đã đóng góp ý kiến!');
  } catch (err) {
    console.error("Feedback error:", err);
    if (msgEl) {
      msgEl.textContent = 'Lỗi gửi góp ý. Vui lòng thử lại.';
      msgEl.className = 'msg error';
      msgEl.style.display = 'block';
    }
  }
}

// ── HELPERS ──
function hskBadge(lvl) {
  return `<span class="badge badge-hsk${lvl}">HSK ${lvl}</span>`;
}

async function loadQuizFolders() {
  const { data } = await sb.from('quiz_folders').select('*').order('name');
  // Logic is handled inside loadAssigned for grouping
}

function toggleFolderStudent(fid) {
  const content = document.getElementById(`folder-content-stu-${fid}`);
  const arrow = document.getElementById(`folder-arrow-stu-${fid}`);
  if (!content) return;
  const isHidden = content.style.display === 'none';
  content.style.display = isHidden ? 'grid' : 'none';
  if (arrow) arrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
}
