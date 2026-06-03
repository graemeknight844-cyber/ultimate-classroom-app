// ============================================================================
// 1. SUPABASE SECURITY & CONNECTION
// ============================================================================
const SUPABASE_URL = "https://wfnwjkuojshozhtnlror.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pQvC4ZJv7e9-AL2lkp6upw_xpYa2twv";

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

async function checkUserSession() {
  if (!supabaseClient) return;
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = "index.html"; }
}
checkUserSession();

// Fallback configuration channel initialized globally so buttons don't throw null errors
let channel = supabaseClient ? supabaseClient.channel('room_8492') : null;

// ============================================================================
// APPLICATION GLOBAL STATE VARIABLES
// ============================================================================
let currentTool = 'pen'; 
let isDrawing = false;
let classIsFrozen = false;
let countdownInterval;
let totalSeconds = 300; 

let boardsData = []; 
let currentBoardIndex = 0;
let studentSubmissionsHistory = [{}]; 
let canvasHistory = []; 

// POLLING DATA STRUCTURES
let pollActive = false;
let activePollData = { question: "", options: [], votes: [0,0,0,0], correctOptionIndex: null, studentVotes: {} };
let savedPollsHistory = []; // Keeps track of completed polls for the PDF export

// Global DOM references
let canvas, ctx, colorPicker, clearBtn, undoBtn;
let penToolBtn, textToolBtn, imgToolBtn, rubberToolBtn;
let sizeThicknessSlider, textSizeSlider;
let prevPageBtn, nextPageBtn, pageText;
let timerDisplay, freezeBtn, signOutBtn;

// New Polling DOM variables
let pollModeBtn, pollPanel, pollSetup, pollLiveResults;
let pollQuestionInput, startPollBtn, endPollBtn, livePollQuestion, resultsBarsContainer;

/// === MAKE SURE THESE TWO LINES ARE ALIVE HERE ===
let studentInspectBanner;
let leavePupilBoardBtn;

// ============================================================================
// MODULAR QUIZ MASTER DATA MATRIX ENGINE STRUCTURE
// ============================================================================
let quizState = {
  isActive: false,
  currentMode: "gameshow",
  plannedQueue: [],       
  currentQueueIndex: 0,   
  question: "",
  options: [],
  correctAnswerIndex: -1,
  startTime: null,        
  submissions: {},
  leaderboardScores: {}
};

// Quiz DOM Component Element Handles
let quizPanel, quizModeSelect, quizQuestionInput, launchQuizBtn, endQuizBtn, quizLiveEngine, quizEngineStatus, quizDataDisplayContainer;
let quizBulkInput, importQuizBtn, quizQueueStatus;

// Timer Variables
let timerInterval = null;
let isTimerRunning = false;
let timerMinInput, timerSecInput, timerToggleBtn;

// ============================================================================
// INITIALIZATION ENGINE (Fires once HTML is fully loaded)
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Bind Whiteboard DOM Elements
  canvas = document.getElementById('teacherCanvas');
  ctx = canvas ? canvas.getContext('2d') : null;
  colorPicker = document.getElementById('penColor') || { value: '#333333' };
  clearBtn = document.getElementById('clearBtn');
  undoBtn = document.getElementById('undoBtn'); 

  penToolBtn = document.getElementById('penToolBtn');
  textToolBtn = document.getElementById('textToolBtn');
  imgToolBtn = document.getElementById('imgToolBtn');
  rubberToolBtn = document.getElementById('rubberToolBtn');

  sizeThicknessSlider = document.getElementById('penThickness') || { value: 4 };
  textSizeSlider = document.getElementById('textSizeSelector') || { value: 24 };

  prevPageBtn = document.querySelector('.pagination .page-btn:first-child');
  nextPageBtn = document.querySelector('.pagination .page-btn:last-child');
  pageText = document.querySelector('.page-text');

  timerDisplay = document.querySelector('.timer');
  freezeBtn = document.getElementById('freezeBtn');
  signOutBtn = document.querySelector('.sign-out'); 

  // Bind Polling DOM Elements
  pollModeBtn = document.getElementById('pollModeBtn');
  pollPanel = document.getElementById('pollPanel');
  pollSetup = document.getElementById('pollSetup');
  pollLiveResults = document.getElementById('pollLiveResults');
  pollQuestionInput = document.getElementById('pollQuestion');
  startPollBtn = document.getElementById('startPollBtn');
  endPollBtn = document.getElementById('endPollBtn');
  livePollQuestion = document.getElementById('livePollQuestion');
  resultsBarsContainer = document.getElementById('resultsBars');

  // === NEW STUDENT INSPECTION DOM ELEMENT BINDINGS ===
  studentInspectBanner = document.getElementById('studentInspectBanner');
  leavePupilBoardBtn = document.getElementById('leavePupilBoardBtn');

  if (leavePupilBoardBtn) {
    leavePupilBoardBtn.addEventListener('click', revertToTeacherPresentationView);
  }

  // Bind Quiz Master Dashboard Component Elements
  quizPanel = document.getElementById('quizPanel');
  quizModeSelect = document.getElementById('quizModeSelect');
  quizQuestionInput = document.getElementById('quizQuestion');
  launchQuizBtn = document.getElementById('launchQuizBtn');
  endQuizBtn = document.getElementById('endQuizBtn');
  quizLiveEngine = document.getElementById('quizLiveEngine');
  quizEngineStatus = document.getElementById('quizEngineStatus');
  quizDataDisplayContainer = document.getElementById('quizDataDisplayContainer');
  
  // New Pre-Planning Imports bindings
  quizBulkInput = document.getElementById('quizBulkInput');
  importQuizBtn = document.getElementById('importQuizBtn');
  quizQueueStatus = document.getElementById('quizQueueStatus');

  if (importQuizBtn) {
    importQuizBtn.addEventListener('click', handleBulkQuizImport);
  }

  if (ctx) {
    ctx.lineWidth = sizeThicknessSlider.value;
    ctx.lineCap = 'round';
    ctx.strokeStyle = colorPicker.value;
    
    boardsData[0] = canvas.toDataURL();
    canvasHistory.push(boardsData[0]); 
  }
  
  updatePaginationUI();

  // ============================================================================
  // GLOBAL CONTROLLER: DYNAMIC QUIZ PLAYSTYLE INTERFACE SWITCHER
  // ============================================================================
  window.toggleQuizContextFields = function(selectedPlaystyleValue) {
    const comprehensionWrapper = document.getElementById('quizComprehensionWrapper');
    if (!comprehensionWrapper) return;
    
    if (selectedPlaystyleValue === "independent") {
      comprehensionWrapper.style.display = "block";
    } else {
      comprehensionWrapper.style.display = "none";
      const refTextArea = document.getElementById('quizRefText');
      if (refTextArea) refTextArea.value = ""; 
    }
  };

  // ============================================================================
  // CORE DATA ENGINE: PERSISTENT SESSION DECK STORAGE MANAGEMENT
  // ============================================================================
  const addBtn = document.getElementById('addQuestionToBankBtn');
  if (addBtn) {
    addBtn.addEventListener('click', saveCurrentFormToPersistentDeckBank);
  }

  // Connect Realtime Broadcast Listener Dynamic Switcher Engine
  window.startTeacherConnection = function(roomCode) {
    if (!supabaseClient) return;

    channel = supabaseClient.channel(`room_${roomCode}`);

    channel
      .on('broadcast', { event: 'submit-answer' }, ({ payload }) => { handleIncomingStudentAnswer(payload); })
      .on('broadcast', { event: 'submit-vote' }, ({ payload }) => { handleIncomingVote(payload); })
      .subscribe((status) => {
        console.log(`Teacher channel status for room_${roomCode}:`, status);
      });
  };

  // Connect instantly to the standard testing room configuration
  window.startTeacherConnection("8492");

  // Critical: Setup listeners AFTER all elements are bounded inside DOM ready thread
  setupEventListeners();
}); 

// ============================================================================
// GLOBAL SCOPE DECK STORAGE CONSTRUCTORS (Safely outside initialization thread)
// ============================================================================
let persistentQuizDeckBank = [];

function saveCurrentFormToPersistentDeckBank() {
  const qInput = document.getElementById('quizQuestion');
  const refTextEl = document.getElementById('quizRefText');
  const optInputs = document.querySelectorAll('.quiz-opt');
  const correctRadios = document.querySelectorAll('input[name="quizCorrectRadio"]');
  
  const questionText = qInput ? qInput.value.trim() : "";
  if (!questionText) {
    alert("Please write a question before adding it to your lesson session bank deck!");
    return;
  }
  
  const optionsArr = [];
  optInputs.forEach(input => {
    if (input.value.trim() !== "") optionsArr.push(input.value.trim());
  });
  
  if (optionsArr.length < 2) {
    alert("Please provide at least two valid answer choice choices!");
    return;
  }
  
  let correctIdx = 0;
  correctRadios.forEach((radio, idx) => {
    if (radio.checked) correctIdx = idx;
  });
  
  const questionCard = {
    id: "quiz-card-" + Date.now(),
    question: questionText,
    options: optionsArr,
    correctAnswerIndex: correctIdx,
    playstyle: document.getElementById('quizModeSelect').value,
    referenceText: refTextEl ? refTextEl.value.trim() : ""
  };
  
  persistentQuizDeckBank.push(questionCard);
  renderPersistentDeckBankUI();
  
  if (qInput) qInput.value = "";
  if (refTextEl) refTextEl.value = "";
  optInputs.forEach(i => i.value = "");
}

function renderPersistentDeckBankUI() {
  const container = document.getElementById('quizPersistentBankContainer');
  const badge = document.getElementById('quizBankCountBadge');
  if (!container) return;
  
  if (badge) badge.textContent = `${persistentQuizDeckBank.length} Questions Saved`;
  
  if (persistentQuizDeckBank.length === 0) {
    container.innerHTML = `<em style="color: #7f8c8d; font-size: 12px; display: block; padding: 10px 0; text-align: center;">No questions stored yet. Build questions above to load your session bank.</em>`;
    return;
  }
  
  container.innerHTML = "";
  persistentQuizDeckBank.forEach((card, idx) => {
    const cardRow = document.createElement('div');
    cardRow.style.cssText = "display: flex; align-items: center; justify-content: space-between; background: #34495e; padding: 8px 12px; border-radius: 4px; border-left: 4px solid #3498db; margin-bottom: 6px;";
    
    const textDetails = document.createElement('div');
    textDetails.style.cssText = "max-width: 70%;";
    
    const title = document.createElement('div');
    title.style.cssText = "font-weight: bold; font-size: 13px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
    title.textContent = `${idx + 1}. ${card.question}`;
    
    const subtitle = document.createElement('div');
    subtitle.style.cssText = "font-size: 11px; color: #bdc3c7; margin-top: 2px;";
    subtitle.textContent = `Mode: ${card.playstyle === 'gameshow' ? '⚡ Speed Competitor' : '📖 Self-Directed'} | Choices: ${card.options.length}`;
    
    textDetails.appendChild(title);
    textDetails.appendChild(subtitle);
    
    const stageBtn = document.createElement('button');
    stageBtn.textContent = "⚡ STAGE CARD";
    stageBtn.style.cssText = "background: #1abc9c; color: white; border: none; padding: 5px 10px; font-size: 11px; font-weight: bold; border-radius: 3px; cursor: pointer;";
    
    stageBtn.addEventListener('click', () => {
      if (document.getElementById('quizQuestion')) document.getElementById('quizQuestion').value = card.question;
      document.getElementById('quizModeSelect').value = card.playstyle;
      window.toggleQuizContextFields(card.playstyle);
      
      if (card.referenceText && document.getElementById('quizRefText')) {
        document.getElementById('quizRefText').value = card.referenceText;
      }
      
      const formOpts = document.querySelectorAll('.quiz-opt');
      formOpts.forEach((input, oIdx) => {
        input.value = card.options[oIdx] ? card.options[oIdx] : "";
      });
      
      const formRadios = document.querySelectorAll('input[name="quizCorrectRadio"]');
      if (formRadios[card.correctAnswerIndex]) formRadios[card.correctAnswerIndex].checked = true;
    });
    
    cardRow.appendChild(textDetails);
    cardRow.appendChild(stageBtn);
    container.appendChild(cardRow);
  });
}

// ============================================================================
// BULK TEXT-BOX QUIZ QUEUE PARSER ENGINE
// ============================================================================
function handleBulkQuizImport() {
  if (!quizBulkInput || !quizBulkInput.value.trim()) {
    alert("Please paste some quiz data into the text box first!");
    return;
  }

  const rawLines = quizBulkInput.value.split('\n');
  const parsedQuestions = [];

  rawLines.forEach((line, lineIndex) => {
    const cleanLine = line.trim();
    if (!cleanLine) return; 

    const segments = cleanLine.split('|').map(s => s.trim());
    
    if (segments.length < 4) {
      console.warn(`Line ${lineIndex + 1} skipped due to invalid segment counts.`);
      return;
    }

    const questionText = segments[0];
    const correctIndexStr = segments[segments.length - 1];
    const correctIdx = parseInt(correctIndexStr);
    const optionArray = segments.slice(1, segments.length - 1);

    if (isNaN(correctIdx) || correctIdx < 0 || correctIdx >= optionArray.length) {
      console.warn(`Line ${lineIndex + 1} skipped: Correct index marker is out of option bounds.`);
      return;
    }

    parsedQuestions.push({
      question: questionText,
      options: optionArray, 
      correctAnswerIndex: correctIdx
    });
  });

  if (parsedQuestions.length === 0) {
    alert("Could not parse any valid quiz questions. Check your formatting criteria examples!");
    return;
  }

  quizState.plannedQueue = parsedQuestions;
  quizState.currentQueueIndex = 0;

  if (quizQueueStatus) {
    quizQueueStatus.textContent = `Queue: ${parsedQuestions.length} Qs Loaded!`;
    quizQueueStatus.style.color = "#2ecc71"; 
  }

  loadQuestionFromQueueIntoInputs(0);
  alert(`Success! ${parsedQuestions.length} questions successfully loaded into your lesson planning queue.`);
}

function loadQuestionFromQueueIntoInputs(index) {
  if (!quizState.plannedQueue[index]) return;
  const currentItem = quizState.plannedQueue[index];

  if (quizQuestionInput) quizQuestionInput.value = currentItem.question;

  const inputRows = document.querySelectorAll('.quiz-opt');
  const radioButtons = document.querySelectorAll('input[name="quizCorrectRadio"]');

  inputRows.forEach((input, idx) => {
    if (currentItem.options[idx]) {
      input.value = currentItem.options[idx];
      input.parentElement.style.opacity = "1"; 
    } else {
      input.value = ""; 
      input.parentElement.style.opacity = "0.4"; 
    }
  });

  if (radioButtons[currentItem.correctAnswerIndex]) {
    radioButtons[currentItem.correctAnswerIndex].checked = true;
  }
}

// Fallback listener stubs to prevent channel pipeline routing crashes
function handleIncomingStudentAnswer(payload) { console.log("Incoming student answer:", payload); }
function handleIncomingVote(payload) { console.log("Incoming poll vote:", payload); }

// ============================================================================
// WHITEBOARD UTILITY CORE
// ============================================================================
function pushToHistory() {
  if (!canvas) return;
  canvasHistory.push(canvas.toDataURL());
  if (canvasHistory.length > 30) canvasHistory.shift(); 
}

// ============================================================================
// TOOL CONTROL SYSTEM
// ============================================================================
function setActiveTool(tool, activeBtn) {
  bakeFloatingObjects(); 
  currentTool = tool;
  
  document.querySelectorAll('.tool-btn').forEach(btn => {
    if (btn.id !== 'undoBtn') btn.classList.remove('active');
  });
  if (activeBtn && activeBtn.id !== 'undoBtn') activeBtn.classList.add('active');
  
  if (!canvas || !ctx) return;
  
  if (currentTool === 'rubber') {
    ctx.globalCompositeOperation = 'destination-out';
    canvas.style.cursor = 'cell';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    if (currentTool === 'text') { canvas.style.cursor = 'text'; }
    else if (currentTool === 'img') { canvas.style.cursor = 'pointer'; }
    else { canvas.style.cursor = 'crosshair'; }
  }
}

// ============================================================================
// INTERACTIVE LESSON COUNTDOWN TIMER ENGINE
// ============================================================================
function toggleLessonTimer() {
  if (isTimerRunning) {
    clearInterval(timerInterval);
    isTimerRunning = false;
    timerToggleBtn.textContent = "Start";
    timerToggleBtn.style.background = "#2ecc71"; 
    enableTimerInputs(true);
  } else {
    let minutes = parseInt(timerMinInput.value) || 0;
    let seconds = parseInt(timerSecInput.value) || 0;
    let totalSecondsLeft = (minutes * 60) + seconds;

    if (totalSecondsLeft <= 0) {
      alert("Please enter a time greater than 00:00!");
      return;
    }

    isTimerRunning = true;
    timerToggleBtn.textContent = "Pause";
    timerToggleBtn.style.background = "#e74c3c"; 
    enableTimerInputs(false); 

    timerMinInput.style.color = "#2ecc71";
    timerSecInput.style.color = "#2ecc71";

    timerInterval = setInterval(() => {
      totalSecondsLeft--;

      if (totalSecondsLeft <= 0) {
        clearInterval(timerInterval);
        isTimerRunning = false;
        timerMinInput.value = "00";
        timerSecInput.value = "00";
        
        timerMinInput.style.color = "#ffffff";
        timerSecInput.style.color = "#ffffff";
        
        timerToggleBtn.textContent = "Start";
        timerToggleBtn.style.background = "#2ecc71";
        enableTimerInputs(true);
        
        triggerTimerCompletionAlert();
      } else {
        const m = Math.floor(totalSecondsLeft / 60);
        const s = totalSecondsLeft % 60;
        timerMinInput.value = m.toString().padStart(2, '0');
        timerSecInput.value = s.toString().padStart(2, '0');

        if (totalSecondsLeft <= 30) {
          timerMinInput.style.color = "#e74c3c";
          timerSecInput.style.color = "#e74c3c";
        } else {
          timerMinInput.style.color = "#2ecc71";
          timerSecInput.style.color = "#2ecc71";
        }
      }
    }, 1000);
  }
}

// Fixed or problem area check? Let's keep scanning.
function enableTimerInputs(enable) {
  if (!timerMinInput || !timerSecInput) return;
  timerMinInput.disabled = !enable;
  timerSecInput.disabled = !enable;
  timerMinInput.style.background = enable ? "#34495e" : "#2c3e50";
  timerSecInput.style.background = enable ? "#34495e" : "#2c3e50";
}

function triggerTimerCompletionAlert() {
  let flashCount = 0;
  const alertInterval = setInterval(() => {
    const isEven = flashCount % 2 === 0;
    timerMinInput.style.background = isEven ? "#e74c3c" : "#34495e";
    timerSecInput.style.background = isEven ? "#e74c3c" : "#34495e";
    flashCount++;
    if (flashCount >= 6) {
      clearInterval(alertInterval);
      timerMinInput.style.background = "#34495e";
      timerSecInput.style.background = "#34495e";
    }
  }, 250);

  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); 
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.3);
  } catch (e) {
    console.log("Audio API not supported or awaiting user interaction gesture.");
  }
}

// ============================================================================
// POLLING LOGIC HUB - WITH CORRECT ANSWER TRACKING
// ============================================================================
function togglePollPanel() {
  if (!pollPanel) return;
  if (pollPanel.style.display === 'none' || !pollPanel.style.display) {
    pollPanel.style.display = 'block';
    pollModeBtn.classList.add('active');
  } else {
    pollPanel.style.display = 'none';
    pollModeBtn.classList.remove('active');
  }
}

function launchPoll() {
  const questionText = pollQuestionInput.value.trim() || "Quick Poll";
  const optionInputs = document.querySelectorAll('.poll-opt');
  const validOptions = [];
  let detectedCorrectIndex = -1;

  const correctRadios = document.querySelectorAll('.poll-correct-radio');

  optionInputs.forEach((input, idx) => {
    if (input.value.trim() !== "") {
      validOptions.push(input.value.trim());
      if (correctRadios[idx] && correctRadios[idx].checked) {
        detectedCorrectIndex = validOptions.length - 1;
      }
    }
  });

  if (validOptions.length < 2) {
    alert("Please provide at least two poll options!");
    return;
  }

  pollActive = true;
  activePollData = {
    question: questionText,
    options: validOptions,
    correctAnswerIndex: detectedCorrectIndex, 
    votes: {} 
  };

  pollSetup.style.display = 'none';
  pollLiveResults.style.display = 'block';
  livePollQuestion.textContent = questionText;

  renderLivePollBars();

  if (channel) {
    channel.send({
      type: 'broadcast',
      event: 'start-poll',
      payload: { question: questionText, options: validOptions }
    });
  }
}

function handleIncomingVote(payload) {
  if (!pollActive) return;
  activePollData.votes[payload.studentName] = payload.optionIndex;
  renderLivePollBars();
}

function renderLivePollBars() {
  if (!resultsBarsContainer) return;
  resultsBarsContainer.innerHTML = '';

  const totalVotes = Object.keys(activePollData.votes).length;
  
  const tally = {};
  activePollData.options.forEach((_, idx) => tally[idx] = 0);
  Object.values(activePollData.votes).forEach(voteIdx => {
    if (tally[voteIdx] !== undefined) tally[voteIdx]++;
  });

  activePollData.options.forEach((optionText, idx) => {
    const count = tally[idx];
    const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;

    const row = document.createElement('div');
    row.style.cssText = "display: flex; align-items: center; gap: 10px; font-family: sans-serif; margin-bottom: 6px;";

    const label = document.createElement('div');
    label.style.width = '140px';
    label.style.fontWeight = 'bold';
    label.style.fontSize = '13px';
    
    if (activePollData.correctAnswerIndex === idx) {
      label.innerHTML = `✅ <span style="color: #2ecc71;">${optionText}</span>`;
    } else {
      label.textContent = optionText;
    }

    const barTrack = document.createElement('div');
    barTrack.style.cssText = "flex-grow: 1; background: #e1e1eb; height: 20px; border-radius: 4px; overflow: hidden; position: relative;";

    const barFill = document.createElement('div');
    const barColor = (activePollData.correctAnswerIndex === idx) ? '#2ecc71' : '#4a4a68';
    barFill.style.cssText = `background: ${barColor}; width: ${percent}%; height: 100%; transition: width 0.3s ease;`;

    const stats = document.createElement('div');
    stats.style.width = '85px';
    stats.style.fontSize = '13px';
    stats.style.textAlign = 'right';
    stats.textContent = `${count} vote(s) (${percent}%)`;

    barTrack.appendChild(barFill);
    row.appendChild(label);
    row.appendChild(barTrack);
    row.appendChild(stats);
    resultsBarsContainer.appendChild(row);
  });
}

function closeAndSavePoll() {
  pollActive = false;
  savedPollsHistory.push(JSON.parse(JSON.stringify(activePollData)));

  pollSetup.style.display = 'block';
  pollLiveResults.style.display = 'none';
  pollQuestionInput.value = '';
  document.querySelectorAll('.poll-opt').forEach(i => i.value = '');

  if (channel) {
    channel.send({ type: 'broadcast', event: 'close-poll' });
  }
  alert("Poll results saved securely with correct criteria metrics!");
}

// ============================================================================
// EVENT LISTENERS WIRING SETUP
// ============================================================================
function setupEventListeners() {
  if (penToolBtn) penToolBtn.addEventListener('click', () => setActiveTool('pen', penToolBtn));
  if (textToolBtn) textToolBtn.addEventListener('click', () => setActiveTool('text', textToolBtn));
  if (imgToolBtn) imgToolBtn.addEventListener('click', () => setActiveTool('img', imgToolBtn));
  if (rubberToolBtn) rubberToolBtn.addEventListener('click', () => setActiveTool('rubber', rubberToolBtn));

  const whiteboardModeBtn = document.getElementById('whiteboardModeBtn');
  const quizModeBtn = document.getElementById('quizModeBtn');

  function switchActiveDashboardView(selectedMode) {
    if (pollPanel) pollPanel.style.display = 'none';
    if (quizPanel) quizPanel.style.display = 'none';
    
    [whiteboardModeBtn, quizModeBtn, pollModeBtn].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });

    if (selectedMode === 'poll' && pollPanel) {
      pollPanel.style.display = 'block';
      if (pollModeBtn) pollModeBtn.classList.add('active');
    } else if (selectedMode === 'quiz' && quizPanel) {
      quizPanel.style.display = 'block';
      if (quizModeBtn) quizModeBtn.classList.add('active');
    } else if (selectedMode === 'whiteboard') {
      if (whiteboardModeBtn) whiteboardModeBtn.classList.add('active');
    }
  }

  if (whiteboardModeBtn) whiteboardModeBtn.addEventListener('click', () => switchActiveDashboardView('whiteboard'));
  if (pollModeBtn) pollModeBtn.addEventListener('click', () => switchActiveDashboardView('poll'));
  if (quizModeBtn) quizModeBtn.addEventListener('click', () => switchActiveDashboardView('quiz'));

  if (startPollBtn) startPollBtn.addEventListener('click', launchPoll);
  if (endPollBtn) endPollBtn.addEventListener('click', closeAndSavePoll);

  if (colorPicker) {
    colorPicker.addEventListener('input', (e) => {
      if (currentTool === 'rubber') setActiveTool('pen', penToolBtn);
      if (ctx) ctx.strokeStyle = e.target.value;
    });
  }

  if (canvas && ctx) {
    canvas.addEventListener('mousedown', (e) => {
      if (currentTool !== 'pen' && currentTool !== 'rubber') return;
      isDrawing = true;
      draw(e);
    });
    canvas.addEventListener('mouseup', () => { 
      if (isDrawing) { isDrawing = false; ctx.beginPath(); pushToHistory(); }
    });
    canvas.addEventListener('mouseout', () => { 
      if (isDrawing) { isDrawing = false; ctx.beginPath(); pushToHistory(); }
    });
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('click', handleCanvasClick);
  }

  if (undoBtn) undoBtn.addEventListener('click', handleUndoAction);

  timerMinInput = document.getElementById('timerMin');
  timerSecInput = document.getElementById('timerSec');
  timerToggleBtn = document.getElementById('timerToggleBtn');

  if (timerToggleBtn) {
    timerToggleBtn.addEventListener('click', toggleLessonTimer);
  }

  [timerMinInput, timerSecInput].forEach(input => {
    if (input) {
      input.addEventListener('blur', () => {
        let val = parseInt(input.value) || 0;
        if (val < 0) val = 0;
        if (val > 59) val = 59;
        input.value = val.toString().padStart(2, '0');
      });
    }
  });

  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      saveCurrentBoardState();
      currentBoardIndex++;
      if (currentBoardIndex >= boardsData.length) {
        boardsData.push(''); 
        studentSubmissionsHistory.push({}); 
        if (ctx && canvas) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          canvasHistory = [canvas.toDataURL()];
        }
        clearStudentThumbnailsDOM();
        updatePaginationUI();
        if (channel) channel.send({ type: 'broadcast', event: 'switch-board', payload: { index: currentBoardIndex } });
      } else {
        loadBoardState(currentBoardIndex);
      }
    });
  }

  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
      if (currentBoardIndex === 0) return; 
      saveCurrentBoardState();
      currentBoardIndex--;
      loadBoardState(currentBoardIndex);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (canvas) {
        const activeObjects = canvas.parentElement.querySelectorAll('.floating-canvas-object');
        activeObjects.forEach(o => o.remove());
      }
      if (ctx && canvas) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pushToHistory(); 
      }
      if (channel) channel.send({ type: 'broadcast', event: 'clear' });
    });
  }

  if (freezeBtn) {
    freezeBtn.addEventListener('click', () => {
      classIsFrozen = !classIsFrozen;
      freezeBtn.textContent = classIsFrozen ? "Unfreeze Class" : "Freeze Class";
      freezeBtn.style.backgroundColor = classIsFrozen ? "#ff9999" : "#ffcccc";
      if (channel) channel.send({ type: 'broadcast', event: 'freeze-state', payload: { isFrozen: classIsFrozen } });
    });
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      if (supabaseClient) await supabaseClient.auth.signOut();
      window.location.href = "index.html";
    });
  }
}

// ============================================================================
// DRAWING ENGINE MECHANICS
// ============================================================================
function getCanvasCoordinates(e) {
  if (!canvas) return { x: 0, y: 0, clientX: 0, clientY: 0 };
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
    clientX: e.clientX,
    clientY: e.clientY
  };
}

function draw(e) {
  if (!isDrawing || (currentTool !== 'pen' && currentTool !== 'rubber') || !ctx) return;
  const coords = getCanvasCoordinates(e);
  
  ctx.lineWidth = sizeThicknessSlider.value || 4;
  ctx.lineTo(coords.x, coords.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(coords.x, coords.y);
}

// ============================================================================
// CANVAS MOUSE INTERACTION ROUTER
// ============================================================================
function handleCanvasClick(e) {
  const wrapper = canvas.parentElement;
  const wrapperRect = wrapper.getBoundingClientRect();
  const clickX = e.clientX - wrapperRect.left;
  const clickY = e.clientY - wrapperRect.top;

  if (currentTool === 'text') {
    const userSelectedSize = parseInt(textSizeSlider.value) || 24;
    
    const textWrapper = document.createElement('div');
    textWrapper.className = 'floating-canvas-object text-type-wrapper';
    textWrapper.style.cssText = `position: absolute; left: ${clickX}px; top: ${clickY - (userSelectedSize / 2)}px; border: 2px dashed #4a4a68; cursor: move; background: transparent; padding: 4px; display: inline-block; z-index: 1000;`;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = "Type here...";
    input.style.cssText = `font-size: ${userSelectedSize}px; font-weight: bold; font-family: "Segoe UI", sans-serif; border: none; background: transparent; color: ${colorPicker.value}; outline: none; min-width: 120px; padding: 0; margin: 0; line-height: 1;`;
    
    const autoGrowWidth = () => {
      const textLength = input.value.length || input.placeholder.length;
      const dynamicCalculatedWidth = textLength * (userSelectedSize * 0.62) + 20;
      input.style.width = `${Math.max(120, dynamicCalculatedWidth)}px`;
    };

    autoGrowWidth();
    input.addEventListener('input', autoGrowWidth);
    
    textWrapper.appendChild(input);
    wrapper.appendChild(textWrapper);
    
    input.focus();
    input.select();

    makeElementDraggableAndResizable(textWrapper, false);

    input.addEventListener('keydown', (k) => {
      if (k.key === 'Enter') { setActiveTool('pen', penToolBtn); }
    });
  }

  if (currentTool === 'img') {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = (event) => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => { spawnMovableImage(ev.target.result, clickX, clickY); };
        reader.readAsDataURL(file);
      }
    };
    fileInput.click();
    setActiveTool('pen', penToolBtn);
  }
}

// ============================================================================
// DRAG & RESIZE VECTOR ENGINE
// ============================================================================
function makeElementDraggableAndResizable(el, allowResize) {
  let isDraggingObj = false;
  let isResizingObj = false;
  let startX, startY, startLeft, startTop, startWidth, startHeight;

  el.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('resize-handle')) return;
    isDraggingObj = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = el.offsetLeft;
    startTop = el.offsetTop;
    e.preventDefault();
  });

  if (allowResize) {
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    handle.style.cssText = 'width:14px; height:14px; background:#4a4a68; position:absolute; bottom:0; right:0; cursor:se-resize; border-radius:50%; border:2px solid white;';
    el.appendChild(handle);

    handle.addEventListener('mousedown', (e) => {
      isResizingObj = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = el.offsetWidth;
      startHeight = el.offsetHeight;
      e.stopPropagation();
      e.preventDefault();
    });
  }

  window.addEventListener('mousemove', (e) => {
    if (isDraggingObj) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.left = `${startLeft + dx}px`;
      el.style.top = `${startTop + dy}px`;
    }
    if (isResizingObj) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.width = `${Math.max(50, startWidth + dx)}px`;
      el.style.height = `${Math.max(30, startHeight + dy)}px`;
    }
  });

  window.addEventListener('mouseup', () => {
    isDraggingObj = false;
    isResizingObj = false;
  });
}

function bakeFloatingObjects() {
  if (!canvas || !ctx) return;
  const wrapper = canvas.parentElement;
  const floatingObjects = wrapper.querySelectorAll('.floating-canvas-object');
  
  if (floatingObjects.length === 0) return;

  const scaleX = canvas.width / canvas.getBoundingClientRect().width;
  const scaleY = canvas.height / canvas.getBoundingClientRect().height;

  floatingObjects.forEach(obj => {
    const rect = obj.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    
    const x = (rect.left - canvasRect.left) * scaleX;
    const y = (rect.top - canvasRect.top) * scaleY;
    const w = rect.width * scaleX;
    const h = rect.height * scaleY;

    ctx.globalCompositeOperation = 'source-over';

    if (obj.classList.contains('text-type-wrapper')) {
      const inputEl = obj.querySelector('input');
      const textVal = inputEl ? inputEl.value.trim() : '';
      if (textVal) {
        const localFontSize = parseInt(window.getComputedStyle(inputEl).fontSize);
        const dynamicFontSize = localFontSize * scaleY;
        ctx.font = `bold ${dynamicFontSize}px "Segoe UI", sans-serif`;
        ctx.fillStyle = colorPicker.value || '#000000';
        ctx.textBaseline = 'top';
        ctx.fillText(textVal, x, y + (4 * scaleY));
      }
    } else if (obj.classList.contains('image-type-wrapper')) {
      const imgEl = obj.querySelector('img');
      if (imgEl && imgEl.src) {
        ctx.drawImage(imgEl, x, y, w, h);
      }
    }
    obj.remove();
  });

  pushToHistory(); 
}

function spawnMovableImage(srcDataUrl, initialX, initialY) {
  const wrapper = canvas.parentElement;
  const imgWrapper = document.createElement('div');
  imgWrapper.className = 'floating-canvas-object image-type-wrapper';
  imgWrapper.style.cssText = `position: absolute; left: ${initialX}px; top: ${initialY}px; width: 220px; height: 150px; border: 2px dashed #4a4a68; cursor: move; padding: 2px; background: rgba(255,255,255,0.4);`;

  const img = document.createElement('img');
  img.src = srcDataUrl;
  img.style.cssText = 'width: 100%; height: 100%; object-fit: contain; pointer-events: none;';
  
  imgWrapper.appendChild(img);
  wrapper.appendChild(imgWrapper);
  makeElementDraggableAndResizable(imgWrapper, true);
}

window.addEventListener('paste', (e) => {
  if (currentTool !== 'img') return;
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      const reader = new FileReader();
      reader.onload = (event) => { spawnMovableImage(event.target.result, 150, 100); };
      reader.readAsDataURL(file);
    }
  }
});

// ============================================================================
// UNDO ACTION ENGINE
// ============================================================================
function handleUndoAction() {
  if (canvas) {
    const activeFloatingObjects = canvas.parentElement.querySelectorAll('.floating-canvas-object');
    if (activeFloatingObjects.length > 0) {
      activeFloatingObjects[activeFloatingObjects.length - 1].remove();
      return;
    }
  }

  if (canvasHistory.length > 1) {
    canvasHistory.pop(); 
    const previousStoredState = canvasHistory[canvasHistory.length - 1];
    
    const img = new Image();
    img.src = previousStoredState;
    img.onload = () => {
      if (!ctx || !canvas) return;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      boardsData[currentBoardIndex] = canvas.toDataURL(); 
    };
  }
}

// ============================================================================
// LIVE STUDENT BOARD DISTRIBUTION SYSTEM - WITH INSPECTION TOGGLE HOOKS
// ============================================================================
function handleIncomingStudentAnswer(studentData) {
  if (!studentSubmissionsHistory[currentBoardIndex]) {
    studentSubmissionsHistory[currentBoardIndex] = {};
  }
  studentSubmissionsHistory[currentBoardIndex][studentData.name] = studentData.boardImage;
  renderStudentThumbnailDOM(studentData);
}

function renderStudentThumbnailDOM(studentData) {
  const safeNameId = studentData.name.replace(/\s+/g, '-');
  let liveImg = document.getElementById(`thumb-img-${safeNameId}`);

  if (!liveImg) {
    const slots = Array.from(document.querySelectorAll('.mini-board'));
    const emptySlot = slots.find(slot => slot.children.length === 0);
    
    let targetTarget = emptySlot;
    if (!targetTarget) {
      targetTarget = document.createElement('div');
      targetTarget.className = 'mini-board';
      document.querySelector('.pupil-boards').appendChild(targetTarget);
    }

    targetTarget.style.position = "relative";
    targetTarget.style.display = "block";
    targetTarget.style.overflow = "hidden"; 
    targetTarget.style.cursor = "pointer";

    liveImg = document.createElement('img');
    liveImg.id = `thumb-img-${safeNameId}`;
    liveImg.style.width = "100%";
    liveImg.style.height = "100%";
    liveImg.style.objectFit = "contain";

    const nameLabel = document.createElement('div');
    nameLabel.id = `thumb-name-${safeNameId}`;
    nameLabel.textContent = studentData.name;
    nameLabel.style.cssText = "width:100%; background:#4c4c5e; color:#fff; font-size:12px; font-weight:bold; text-align:center; padding:4px 0; position:absolute; bottom:0; left:0; box-sizing:border-box; z-index:10;";

    targetTarget.appendChild(liveImg);
    targetTarget.appendChild(nameLabel);

    targetTarget.addEventListener('click', () => {
      if (!ctx || !canvas) return;
      
      const zoomImg = new Image();
      zoomImg.onload = () => {
        bakeFloatingObjects();
        saveCurrentBoardState();
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(zoomImg, 0, 0, canvas.width, canvas.height);
        
        if (studentInspectBanner) {
          const bannerText = document.getElementById('inspectBannerText');
          if (bannerText) bannerText.textContent = `👁️ Displaying Workspace: ${studentData.name}`;
          studentInspectBanner.style.display = "flex";
        }
      };
      zoomImg.src = liveImg.src;
    });
  }
  
  if (liveImg) { liveImg.src = studentData.boardImage; }
}

function revertToTeacherPresentationView() {
  if (!ctx || !canvas) return;

  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (boardsData[currentBoardIndex]) {
    const originalTeacherImg = new Image();
    originalTeacherImg.src = boardsData[currentBoardIndex];
    originalTeacherImg.onload = () => {
      ctx.drawImage(originalTeacherImg, 0, 0);
      canvasHistory = [canvas.toDataURL()];
    };
  }

  if (studentInspectBanner) {
    studentInspectBanner.style.display = "none";
  }
}

function clearStudentThumbnailsDOM() {
  document.querySelectorAll('.mini-board').forEach(slot => { slot.innerHTML = ''; });
  const allMiniBoards = document.querySelectorAll('.mini-board');
  if (allMiniBoards.length > 4) {
    for (let i = 4; i < allMiniBoards.length; i++) { allMiniBoards[i].remove(); }
  }
}

// ============================================================================
// MULTI-BOARD RE-SYNCHRONIZATION LOGIC
// ============================================================================
function updatePaginationUI() {
  if (pageText) pageText.textContent = `Board ${currentBoardIndex + 1} of ${Math.max(boardsData.length, 1)}`;
}

function saveCurrentBoardState() { 
  if (!canvas) return;
  boardsData[currentBoardIndex] = canvas.toDataURL(); 
}

function loadBoardState(index) {
  if (!ctx || !canvas) return;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  updatePaginationUI();
  
  if (boardsData[index]) {
    const img = new Image();
    img.src = boardsData[index];
    img.onload = () => { 
      ctx.drawImage(img, 0, 0); 
      canvasHistory = [canvas.toDataURL()]; 
    };
  } else {
    canvasHistory = [canvas.toDataURL()];
  }

  clearStudentThumbnailsDOM();
  const historicalAnswers = studentSubmissionsHistory[index] || {};
  Object.keys(historicalAnswers).forEach(name => {
    renderStudentThumbnailDOM({ name: name, boardImage: historicalAnswers[name] });
  });

  if (channel) {
    channel.send({
      type: 'broadcast',
      event: 'switch-board',
      payload: { index: index }
    });
  }
}

// ============================================================================
// ADVANCED REPORT BOOKLET EXPORT MODULE
// ============================================================================
const exportBtn = document.getElementById('exportBtn');
if (exportBtn) {
  exportBtn.addEventListener('click', async () => {
    saveCurrentBoardState(); 
    
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1100, 520] });
    let isFirstPage = true;

    for (let i = 0; i < boardsData.length; i++) {
      if (!boardsData[i]) continue;

      if (!isFirstPage) { pdf.addPage([1100, 520], 'landscape'); }
      isFirstPage = false;

      pdf.setFillColor(74, 74, 104); 
      pdf.rect(0, 0, 1100, 45, 'F');
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("Helvetica", "bold");
      pdf.setFontSize(16);
      pdf.text(`LESSON SLIDE SHEET ${i + 1} - TEACHER QUESTION/TASK`, 30, 28);

      pdf.addImage(boardsData[i], 'PNG', 30, 65, 1040, 435);

      const answersForThisBoard = studentSubmissionsHistory[i] || {};
      const studentNames = Object.keys(answersForThisBoard);

      if (studentNames.length > 0) {
        let pupilCellCounter = 0;

        for (let s = 0; s < studentNames.length; s++) {
          if (pupilCellCounter % 4 === 0) {
            pdf.addPage([1100, 520], 'landscape');
            
            pdf.setFillColor(90, 90, 115);
            pdf.rect(0, 0, 1100, 40, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFont("Helvetica", "bold");
            pdf.setFontSize(14);
            pdf.text(`PUPIL SUBMISSIONS FOR SLIDE SHEET ${i + 1}`, 30, 25);
          }

          const currentPupilName = studentNames[s];
          const pupilImgData = answersForThisBoard[currentPupilName];

          const col = pupilCellCounter % 2; 
          const row = Math.floor((pupilCellCounter % 4) / 2);

          const x = 40 + (col * 530);
          const y = 65 + (row * 225);

          pdf.setFillColor(245, 245, 250);
          pdf.rect(x, y, 500, 210, 'F');
          pdf.setDrawColor(215, 215, 225);
          pdf.rect(x, y, 500, 210, 'S');

          pdf.setTextColor(50, 50, 70);
          pdf.setFont("Helvetica", "bold");
          pdf.setFontSize(13);
          pdf.text(`Pupil Workspace: ${currentPupilName}`, x + 15, y + 22);

          if (pupilImgData) {
            pdf.addImage(pupilImgData, 'PNG', x + 15, y + 32, 470, 163);
          }

          pupilCellCounter++;
        }
      }
    }

    if (savedPollsHistory.length > 0) {
      savedPollsHistory.forEach((poll, index) => {
        pdf.addPage([1100, 520], 'landscape');

        pdf.setFillColor(46, 204, 113); 
        pdf.rect(0, 0, 1100, 45, 'F');

        pdf.setTextColor(255, 255, 255);
        pdf.setFont("Helvetica", "bold");
        pdf.setFontSize(16);
        pdf.text(`SESSION REPORT - COMPLETED CLASSROOM POLL #${index + 1}`, 30, 28);

        pdf.setTextColor(40, 40, 60);
        pdf.setFont("Helvetica", "bold");
        pdf.setFontSize(18);
        pdf.text(`Question Asked: ${poll.question}`, 45, 85);

        const voterNames = Object.keys(poll.votes);
        const totalVotes = voterNames.length;
        const tally = {};
        let totalCorrectAnswersCount = 0;

        poll.options.forEach((_, idx) => tally[idx] = 0);
        Object.values(poll.votes).forEach(voteIdx => { 
          if(tally[voteIdx] !== undefined) tally[voteIdx]++; 
        });

        if (poll.correctAnswerIndex !== undefined && poll.correctAnswerIndex !== -1) {
          voterNames.forEach(name => {
            if (poll.votes[name] === poll.correctAnswerIndex) {
              totalCorrectAnswersCount++;
            }
          });
        }

        const classAccuracyPercentage = totalVotes > 0 ? Math.round((totalCorrectAnswersCount / totalVotes) * 100) : 0;

        pdf.setFont("Helvetica", "normal");
        pdf.setFontSize(12);
        pdf.setTextColor(100, 100, 120);
        
        let statsLabelString = `Total Registered Responses Collected: ${totalVotes}`;
        if (poll.correctAnswerIndex !== -1) {
          statsLabelString += `   |   Overall Classroom Accuracy: ${classAccuracyPercentage}% (${totalCorrectAnswersCount}/${totalVotes})`;
        }
        pdf.text(statsLabelString, 45, 105);

        let currentYOffset = 135;
        poll.options.forEach((optionText, idx) => {
          const count = tally[idx];
          const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isThisOptionCorrect = (poll.correctAnswerIndex === idx);

          const finalOptionLabel = isThisOptionCorrect ? `* ${optionText} [CORRECT]` : optionText;

          pdf.setTextColor(isThisOptionCorrect ? 39 : 50, isThisOptionCorrect ? 174 : 50, isThisOptionCorrect ? 96 : 60);
          pdf.setFont("Helvetica", "bold");
          pdf.setFontSize(13);
          pdf.text(finalOptionLabel, 50, currentYOffset + 14);

          pdf.setFillColor(230, 230, 238);
          pdf.rect(250, currentYOffset, 550, 20, 'F');

          if (percent > 0) {
            pdf.setFillColor(isThisOptionCorrect ? 46 : 74, isThisOptionCorrect ? 204 : 74, isThisOptionCorrect ? 113 : 104);
            pdf.rect(250, currentYOffset, (550 * (percent / 100)), 20, 'F');
          }

          pdf.setTextColor(70, 70, 90);
          pdf.setFont("Helvetica", "bold");
          pdf.setFontSize(12);
          pdf.text(`${count} vote(s) (${percent}%)`, 815, currentYOffset + 14);

          currentYOffset += 32; 
        });

        currentYOffset += 15; 
        
        pdf.setTextColor(40, 40, 60);
        pdf.setFont("Helvetica", "bold");
        pdf.setFontSize(14);
        pdf.text("Individual Pupil Response Grid", 45, currentYOffset);
        currentYOffset += 12;

        pdf.setFillColor(74, 74, 104);
        pdf.rect(45, currentYOffset, 1010, 24, 'F');

        pdf.setTextColor(255, 255, 255);
        pdf.setFont("Helvetica", "bold");
        pdf.setFontSize(11);
        pdf.text("Pupil Name", 60, currentYOffset + 16);
        pdf.text("Selected Option / Response Given", 350, currentYOffset + 16);
        pdf.text("Assessment Result", 850, currentYOffset + 16);

        currentYOffset += 24;

        if (totalVotes === 0) {
          pdf.setDrawColor(215, 215, 225);
          pdf.rect(45, currentYOffset, 1010, 24, 'S');
          pdf.setTextColor(130, 130, 140);
          pdf.setFont("Helvetica", "italic");
          pdf.setFontSize(11);
          pdf.text("No active student submissions recorded for this poll segment.", 60, currentYOffset + 16);
        } else {
          voterNames.forEach((studentName, sIdx) => {
            if (currentYOffset > 480) {
              pdf.addPage([1100, 520], 'landscape');
              
              pdf.setFillColor(90, 90, 115);
              pdf.rect(0, 0, 1100, 35, 'F');
              pdf.setTextColor(255, 255, 255);
              pdf.setFont("Helvetica", "bold");
              pdf.setFontSize(13);
              pdf.text(`PUPIL BREAKDOWN MATRIX - POLL #${index + 1} (CONTINUED)`, 30, 22);
              
              currentYOffset = 60;
              pdf.setFillColor(74, 74, 104);
              pdf.rect(45, currentYOffset, 1010, 24, 'F');
              pdf.setTextColor(255, 255, 255);
              pdf.setFont("Helvetica", "bold");
              pdf.setFontSize(11);
              pdf.text("Pupil Name", 60, currentYOffset + 16);
              pdf.text("Selected Option / Response Given", 350, currentYOffset + 16);
              pdf.text("Assessment Result", 850, currentYOffset + 16);
              currentYOffset += 24;
            }

            const chosenIndex = poll.votes[studentName];
            const isCorrect = (poll.correctAnswerIndex !== -1 && chosenIndex === poll.correctAnswerIndex);
            const hasNoCorrectCriteriaSet = (poll.correctAnswerIndex === -1);

            if (hasNoCorrectCriteriaSet) {
              if (sIdx % 2 === 0) {
                pdf.setFillColor(245, 245, 250);
                pdf.rect(45, currentYOffset, 1010, 22, 'F');
              }
            } else {
              if (isCorrect) {
                pdf.setFillColor(233, 247, 239); 
              } else {
                pdf.setFillColor(253, 237, 237); 
              }
              pdf.rect(45, currentYOffset, 1010, 22, 'F');
            }
            
            pdf.setDrawColor(225, 225, 235);
            pdf.rect(45, currentYOffset, 1010, 22, 'S');

            pdf.setTextColor(50, 50, 60);
            pdf.setFont("Helvetica", "bold");
            pdf.setFontSize(11);
            pdf.text(studentName, 60, currentYOffset + 15);

            const chosenOptionStringText = poll.options[chosenIndex] || `Unknown Choice (Index ${chosenIndex})`;
            pdf.setFont("Helvetica", "normal");
            pdf.text(chosenOptionStringText, 350, currentYOffset + 15);

            if (hasNoCorrectCriteriaSet) {
              pdf.setTextColor(110, 110, 120);
              pdf.text("Ungraded Poll Survey", 850, currentYOffset + 15);
            } else if (isCorrect) {
              pdf.setTextColor(39, 174, 96); 
              pdf.setFont("Helvetica", "bold");
              pdf.text("CORRECT", 850, currentYOffset + 15);
            } else {
              pdf.setTextColor(192, 57, 43); 
              pdf.setFont("Helvetica", "bold");
              pdf.text("INCORRECT", 850, currentYOffset + 15);
            }

            currentYOffset += 22; 
          });
        }
      });
    }
    
    pdf.save('complete-classroom-lesson-session.pdf');
  });
}