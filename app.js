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
let activePollData = { question: '', options: [], votes: {} };
let savedPollsHistory = []; // Keeps track of completed polls for the PDF export

// Analytics archive container for lesson PDF summary report outputs
let savedQuizzesHistory = [];

// AUTOMATED QUIZ SYSTEM STATE VARIABLES
let quizState = {
  isActive: false,           // Is the live fullscreen presentation running?
  currentQuestionIndex: 0,   // What question number are we on right now?
  plannedQueue: [],          // Holds the list of questions you save to your deck
  activeSubmissions: {}      // Stores student answers as they lock them in live
};

// Global DOM references
let canvas, ctx, colorPicker, clearBtn, undoBtn;
let penToolBtn, textToolBtn, imgToolBtn, rubberToolBtn;
let sizeThicknessSlider, textSizeSlider;
let prevPageBtn, nextPageBtn, pageText;
let timerDisplay, freezeBtn, signOutBtn;

// New Polling DOM variables
let pollModeBtn, pollPanel, pollSetup, pollLiveResults;
let pollQuestionInput, startPollBtn, endPollBtn, livePollQuestion, resultsBarsContainer;

let studentInspectBanner;
let leavePupilBoardBtn;

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

  // Bind Student Inspection DOM Elements
  studentInspectBanner = document.getElementById('studentInspectBanner');
  leavePupilBoardBtn = document.getElementById('leavePupilBoardBtn');

  if (leavePupilBoardBtn) {
    leavePupilBoardBtn.addEventListener('click', revertToTeacherPresentationView);
  }

  if (ctx) {
    ctx.lineWidth = sizeThicknessSlider.value;
    ctx.lineCap = 'round';
    ctx.strokeStyle = colorPicker.value;
    
    boardsData[0] = canvas.toDataURL();
    canvasHistory.push(boardsData[0]); 
  }
  
  updatePaginationUI();
  setupEventListeners();

  // Centralized Realtime Network Transmission Switch Engine Routing
  window.startTeacherConnection = function(roomCode) {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      channel = supabaseClient.channel(`room_${roomCode}`)
        .on('broadcast', { event: 'submit-answer' }, ({ payload }) => { 
          console.log("📦 Received package from iPad:", payload);
          
          if (payload.boardImage) {
            handleIncomingStudentBoard(payload); 
          } 
          else if (payload.chosenIndex !== undefined) {
            handleIncomingQuizResponse(payload);
          }
        })
        .on('broadcast', { event: 'submit-vote' }, ({ payload }) => { 
          handleIncomingVote(payload); 
        })
        .subscribe((status) => {
          console.log(`Teacher channel status for room_${roomCode}:`, status);
        });
    }
  };

  window.startTeacherConnection("8492");

  // ============================================================================
  // QUIZ MENU PANEL NAVIGATION SWITCHES
  // ============================================================================
  const whiteboardModeBtn = document.getElementById('whiteboardModeBtn');
  const quizModeBtn = document.getElementById('quizModeBtn');
  const quizPanel = document.getElementById('quizPanel');
  const teacherWhiteboardView = document.getElementById('teacherWhiteboardView');

  if (quizModeBtn) {
    quizModeBtn.addEventListener('click', () => {
      if (whiteboardModeBtn) whiteboardModeBtn.classList.remove('active');
      if (typeof pollModeBtn !== 'undefined' && pollModeBtn) pollModeBtn.classList.remove('active');
      quizModeBtn.classList.add('active');

      if (quizPanel) quizPanel.style.display = 'block';
      if (typeof pollPanel !== 'undefined' && pollPanel) pollPanel.style.display = 'none';
      if (teacherWhiteboardView) teacherWhiteboardView.style.display = 'none';
    });
  }

  if (whiteboardModeBtn) {
    whiteboardModeBtn.addEventListener('click', () => {
      if (quizModeBtn) quizModeBtn.classList.remove('active');
      if (typeof pollModeBtn !== 'undefined' && pollModeBtn) pollModeBtn.classList.remove('active');
      whiteboardModeBtn.classList.add('active');

      if (quizPanel) quizPanel.style.display = 'none';
      if (typeof pollPanel !== 'undefined' && pollPanel) pollPanel.style.display = 'none';
      if (teacherWhiteboardView) teacherWhiteboardView.style.display = 'block';
    });
  }
  
  if (typeof pollModeBtn !== 'undefined' && pollModeBtn) {
    pollModeBtn.addEventListener('click', () => {
      if (quizPanel) quizPanel.style.display = 'none';
    });
  }

  // Bind Quiz Setup Logic Engine Elements inside Main Setup Initialization
  setupMyQuizButtons();
});

// ============================================================================
// EVENT LISTENERS WIRING SETUP
// ============================================================================
function setupEventListeners() {
  if (penToolBtn) penToolBtn.addEventListener('click', () => setActiveTool('pen', penToolBtn));
  if (textToolBtn) textToolBtn.addEventListener('click', () => setActiveTool('text', textToolBtn));
  if (imgToolBtn) imgToolBtn.addEventListener('click', () => setActiveTool('img', imgToolBtn));
  if (rubberToolBtn) rubberToolBtn.addEventListener('click', () => setActiveTool('rubber', rubberToolBtn));

  // Polling Panel Buttons
  if (pollModeBtn) pollModeBtn.addEventListener('click', togglePollPanel);
  if (startPollBtn) startPollBtn.addEventListener('click', launchPoll);
  if (endPollBtn) endPollBtn.addEventListener('click', closeAndSavePoll);

  if (colorPicker) {
    colorPicker.addEventListener('input', (e) => {
      if (currentTool === 'rubber') setActiveTool('pen', penToolBtn);
      if (ctx) ctx.strokeStyle = e.target.value;
    });
  }

  // Drawing Engine Events
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

  // Bind Lesson Timer Engine DOM Elements
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
// WHITEBOARD UTILITY CORE
// ============================================================================
function pushToHistory() {
  if (!canvas) return;
  canvasHistory.push(canvas.toDataURL());
  if (canvasHistory.length > 30) canvasHistory.shift(); 
}

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
    let totalSeconds = (minutes * 60) + seconds;

    if (totalSeconds <= 0) {
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
      totalSeconds--;

      if (totalSeconds <= 0) {
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
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        timerMinInput.value = m.toString().padStart(2, '0');
        timerSecInput.value = s.toString().padStart(2, '0');

        if (totalSeconds <= 30) {
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
    console.log("Audio API connection footprint pending user gesture interaction.");
  }
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
  let isDragging = false;
  let isResizing = false;
  let startX, startY, startLeft, startTop, startWidth, startHeight;

  el.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('resize-handle')) return;
    isDragging = true;
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
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = el.offsetWidth;
      startHeight = el.offsetHeight;
      e.stopPropagation();
      e.preventDefault();
    });
  }

  window.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.left = `${startLeft + dx}px`;
      el.style.top = `${startTop + dy}px`;
    }
    if (isResizing) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.width = `${Math.max(50, startWidth + dx)}px`;
      el.style.height = `${Math.max(30, startHeight + dy)}px`;
    }
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    isResizing = false;
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
// LIVE STUDENT BOARD DISTRIBUTION SYSTEM - UNIVERSAL DOM CONTROLLER
// ============================================================================
function handleIncomingStudentBoard(studentData) {
  const pupilName = studentData.name || studentData.studentName || "Anonymous Pupil";
  
  if (typeof studentSubmissionsHistory !== 'undefined' && currentBoardIndex !== undefined) {
    if (!studentSubmissionsHistory[currentBoardIndex]) {
      studentSubmissionsHistory[currentBoardIndex] = {};
    }
    studentSubmissionsHistory[currentBoardIndex][pupilName] = studentData.boardImage;
  }

  renderStudentThumbnailDOM({ name: pupilName, boardImage: studentData.boardImage });
}

function renderStudentThumbnailDOM(studentData) {
  const pupilName = studentData.name || studentData.studentName || "Anonymous Pupil";
  const safeNameId = pupilName.replace(/\s+/g, '-');
  
  // 1. If this student already has a slot, update their drawing instantly
  let liveImg = document.getElementById(`thumb-img-${safeNameId}`);
  if (liveImg) {
    liveImg.src = studentData.boardImage;
    return;
  }

  // 2. Find the "See All" button to locate our footer dashboard block
  const seeAllBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('See All'));
  if (!seeAllBtn || !seeAllBtn.parentElement) return;

  // 3. Find ALL candidate boxes in the footer. 
  // We avoid tiny internal child containers by ensuring they are direct layout boxes
  const totalFooterBoxes = Array.from(seeAllBtn.parentElement.querySelectorAll('div, .mini-board'))
                                .filter(box => {
                                  return box !== seeAllBtn && 
                                         box.offsetWidth > 50 && 
                                         box.offsetHeight > 40 && 
                                         !box.id.startsWith('thumb-name') && // Ignore label strips
                                         box.tagName === 'DIV';
                                });

  // 4. Find the first box that doesn't belong to any student yet
  let bestSlot = totalFooterBoxes.find(box => !box.hasAttribute('data-assigned-pupil'));

  // 5. If we ran out of pre-built white boxes, build a fresh one automatically!
  if (!bestSlot) {
    const fallbackCard = document.createElement('div');
    fallbackCard.setAttribute('data-assigned-pupil', safeNameId);
    fallbackCard.className = "active-student-card dynamic-spawn-card";
    fallbackCard.style.cssText = "width: 130px; height: 95px; background-color: #ffffff; border: 2px solid #dcdce6; border-radius: 8px; cursor: pointer; position: relative; overflow: hidden; display: inline-block; margin: 0 4px; vertical-align: top;";
    
    const fbImg = document.createElement('img');
    fbImg.id = `thumb-img-${safeNameId}`;
    fbImg.className = "student-thumb-src";
    fbImg.style.width = "100%";
    fbImg.style.height = "100%";
    fbImg.style.objectFit = "contain";
    fbImg.src = studentData.boardImage;
    fallbackCard.appendChild(fbImg);
    
    const fbLabel = document.createElement('div');
    fbLabel.id = `thumb-name-${safeNameId}`;
    fbLabel.textContent = pupilName;
    fbLabel.style.cssText = "width: 100%; background-color: #4c4c5e; color: #ffffff; font-size: 12px; font-weight: bold; text-align: center; padding: 4px 0; position: absolute; bottom: 0; left: 0; z-index: 10; box-sizing: border-box;";
    fallbackCard.appendChild(fbLabel);
    
    fallbackCard.addEventListener('click', () => {
      zoomStudentWorkspaceToCanvas(fbImg.src, pupilName);
    });

    seeAllBtn.parentElement.appendChild(fallbackCard);
    return;
  }

  // 6. Claim this pre-built box for our current student!
  bestSlot.setAttribute('data-assigned-pupil', safeNameId);
  bestSlot.style.position = "relative";
  bestSlot.style.display = "block";
  bestSlot.style.overflow = "hidden";
  bestSlot.style.cursor = "pointer";
  bestSlot.style.border = "2px solid #dcdce6";
  bestSlot.style.backgroundColor = "#ffffff";
  if (!bestSlot.className.includes("active-student-card")) {
    bestSlot.className += " active-student-card";
  }

  liveImg = document.createElement('img');
  liveImg.id = `thumb-img-${safeNameId}`;
  liveImg.className = "student-thumb-src";
  liveImg.style.width = "100%";
  liveImg.style.height = "100%";
  liveImg.style.objectFit = "contain";
  liveImg.style.display = "block";
  liveImg.src = studentData.boardImage;

  const nameLabel = document.createElement('div');
  nameLabel.id = `thumb-name-${safeNameId}`;
  nameLabel.textContent = pupilName;
  nameLabel.style.cssText = "width: 100%; background-color: #4c4c5e; color: #ffffff; font-size: 12px; font-weight: bold; text-align: center; padding: 4px 0; position: absolute; bottom: 0; left: 0; z-index: 10; box-sizing: border-box;";

  // Safe insertion: clear placeholders and anchor our image + tag
  bestSlot.innerHTML = '';
  bestSlot.appendChild(liveImg);
  bestSlot.appendChild(nameLabel);

  bestSlot.addEventListener('click', () => {
    zoomStudentWorkspaceToCanvas(liveImg.src, pupilName);
  });
}

function zoomStudentWorkspaceToCanvas(imgSrc, pupilName) {
  if (!ctx || !canvas) return;
  const zoomImg = new Image();
  zoomImg.onload = () => {
    if (typeof bakeFloatingObjects === 'function') bakeFloatingObjects();
    if (typeof saveCurrentBoardState === 'function') saveCurrentBoardState();
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(zoomImg, 0, 0, canvas.width, canvas.height);
    
    if (studentInspectBanner) {
      const bannerText = document.getElementById('inspectBannerText');
      if (bannerText) bannerText.textContent = `👁️ Displaying Workspace: ${pupilName}`;
      studentInspectBanner.style.display = "flex";
    }
  };
  zoomImg.src = imgSrc;
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
  document.querySelectorAll('.mini-board, .active-student-card').forEach(slot => { 
    slot.innerHTML = ''; 
    slot.style.position = "";
    slot.style.backgroundImage = "";
    slot.removeAttribute('data-assigned-pupil'); // 🧼 CLEAR THE SLOT LOCK FOR NEXT SESSION
  });
  document.querySelectorAll('.dynamic-spawn-card').forEach(card => card.remove());
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
// ADVANCED REPORT BOOKLET EXPORT MODULE (With Correct/Incorrect Grid Mapping)
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
    
    // 👇 PASTE THE NEW QUIZ REPORT LOGIC RIGHT HERE:
    if (typeof savedQuizzesHistory !== 'undefined' && savedQuizzesHistory.length > 0) {
      savedQuizzesHistory.forEach((quiz, index) => {
        pdf.addPage([1100, 520], 'landscape');

        pdf.setFillColor(41, 128, 185); 
        pdf.rect(0, 0, 1100, 45, 'F');

        pdf.setTextColor(255, 255, 255);
        pdf.setFont("Helvetica", "bold");
        pdf.setFontSize(16);
        pdf.text(`SESSION REPORT - COMPLETED LIVE QUIZ QUESTION #${index + 1}`, 30, 28);

        pdf.setTextColor(40, 40, 60);
        pdf.setFont("Helvetica", "bold");
        pdf.setFontSize(18);
        pdf.text(`Quiz Question: ${quiz.question}`, 45, 85);

        pdf.setFont("Helvetica", "normal");
        pdf.setFontSize(12);
        pdf.setTextColor(100, 100, 120);
        pdf.text(`Total Student Submissions Locked: ${quiz.totalPupilsAnswered}   |   Class Performance: ${quiz.classScore}`, 45, 105);

        let currentQuizY = 135;
        quiz.options.forEach((optionText) => {
          const isThisCorrect = (optionText === quiz.correctAnswer);
          const cleanTextLabel = isThisCorrect ? `✓ ${optionText} [CORRECT ANSWER]` : `• ${optionText}`;

          if (isThisCorrect) {
            pdf.setFillColor(233, 247, 239);
            pdf.setTextColor(46, 204, 113);
            pdf.setFont("Helvetica", "bold");
          } else {
            pdf.setTextColor(120, 120, 140);
            pdf.setFont("Helvetica", "normal");
          }
          
          pdf.setFontSize(13);
          pdf.text(cleanTextLabel, 55, currentQuizY + 12);
          currentQuizY += 25;
        });
      });
    }
    // 👆 END OF NEW QUIZ REPORT LOGIC

    pdf.save('complete-classroom-lesson-session.pdf');
  });
}

// ============================================================================
// AUTOMATED QUIZ ENGINE LOGIC (Collision-Free Module Stream)
// ============================================================================

// Centralized handler decoupled from whiteboard streams
function handleIncomingQuizResponse(payload) {
  if (!quizState.isActive) return;

  const studentName = payload.studentName || "Anonymous Pupil";
  const chosenIndex = parseInt(payload.chosenIndex);

  quizState.activeSubmissions[studentName] = chosenIndex;

  if (typeof renderLiveQuizBars === 'function') {
    renderLiveQuizBars();
  }
}

// Setup and wire the Quiz interactive panels explicitly
function setupMyQuizButtons() {
  const addBtn = document.getElementById('addQuestionToBankBtn');

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const qInput = document.getElementById('quizQuestionInput');
      const opt0 = document.getElementById('quizOpt0');
      const opt1 = document.getElementById('quizOpt1');
      const opt2 = document.getElementById('quizOpt2');
      const opt3 = document.getElementById('quizOpt3');
      const radios = document.getElementsByName('quizCorrectRadio');

      if (!qInput || !qInput.value.trim()) {
        alert("Please type a question first before saving!");
        return;
      }

      let correctIdx = 0;
      for (let i = 0; i < radios.length; i++) {
        if (radios[i].checked) {
          correctIdx = i;
          break;
        }
      }

      const newQuestionCard = {
        question: qInput.value.trim(),
        options: [
          opt0?.value.trim() || "Option A",
          opt1?.value.trim() || "Option B",
          opt2?.value.trim() || "Option C",
          opt3?.value.trim() || "Option D"
        ],
        correctIndex: correctIdx
      };

      quizState.plannedQueue.push(newQuestionCard);

      qInput.value = "";
      if (opt0) opt0.value = "";
      if (opt1) opt1.value = "";
      if (opt2) opt2.value = "";
      if (opt3) opt3.value = "";

      const countBadge = document.getElementById('quizBankCountBadge');
      if (countBadge) {
        countBadge.innerText = `${quizState.plannedQueue.length} Questions Saved`;
      }

      const container = document.getElementById('quizPersistentBankContainer');
      if (container) {
        container.innerHTML = quizState.plannedQueue.map((item, idx) => `
          <div style="background: #34495e; padding: 8px 12px; border-radius: 4px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; color: #fff;">
            <span><strong>${idx + 1}.</strong> ${item.question}</span>
            <span style="color: #2ecc71; font-weight: bold; font-size: 11px;">Staged</span>
          </div>
        `).join('');
      }

      alert("✓ Question added to your session deck successfully!");
    });
  }
}

// ============================================================================
// AUTOMATED QUIZ LIVE DELIVERY MODULE (PRESENTATION & LIVE STATS)
// ============================================================================

// 1. LAUNCH THE ACTIVE LIVE DECK SCREEN
function startLiveQuizDeck() {
  if (!quizState || quizState.plannedQueue.length === 0) {
    alert("Your question deck is empty! Please create and save at least one question first.");
    return;
  }

  // Lock the system state flags
  quizState.isActive = true;
  quizState.currentQuestionIndex = 0;
  quizState.activeSubmissions = {}; // Clear out any stale data

  // Swap out the active screen blocks cleanly
  const whiteboardView = document.getElementById('teacherWhiteboardView');
  const quizSetupPanel = document.getElementById('quizPanel');
  
  if (whiteboardView) whiteboardView.style.display = 'none';
  if (quizSetupPanel) quizSetupPanel.style.display = 'none';

  // Spawns a dedicated high-contrast live playback stage over the screen
  let liveStage = document.getElementById('quizLivePresentationStage');
  if (!liveStage) {
    liveStage = document.createElement('div');
    liveStage.id = 'quizLivePresentationStage';
    liveStage.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: #1a1a24; color: #ffffff; z-index: 99999; padding: 40px; box-sizing: border-box; font-family: 'Segoe UI', sans-serif; display: flex; flex-direction: column; justify-content: space-between;";
    document.body.appendChild(liveStage);
  } else {
    liveStage.style.display = 'flex';
  }

  // Render the interface inside the live arena stage overlay
  liveStage.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2c2c3e; padding-bottom: 15px;">
      <div>
        <span style="background: #e74c3c; padding: 4px 10px; border-radius: 4px; font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-right: 10px;">Live Arena</span>
        <span id="quizStageProgressTracker" style="font-size: 16px; font-weight: 600; color: #a0a0c0;">Question 1 of ${quizState.plannedQueue.length}</span>
      </div>
      <button id="closeLiveQuizArenaBtn" style="background: #c0392b; color: white; border: none; padding: 8px 16px; font-weight: bold; border-radius: 4px; cursor: pointer;">End Session</button>
    </div>

    <div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: center; max-width: 1000px; margin: 0 auto; width: 100%; padding: 40px 0;">
      <h1 id="quizStageQuestionHeader" style="font-size: 32px; font-weight: bold; margin-bottom: 30px; line-height: 1.3; color: #fff;">Loading...</h1>
      <div id="quizStageLiveBarsContainer" style="display: flex; flex-direction: column; gap: 15px; margin-bottom: 20px;"></div>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #2c2c3e; padding-top: 15px;">
      <div style="font-size: 14px; color: #8e8e9f;">
        Responses Registered: <span id="quizStageSubmissionCounter" style="font-weight: bold; color: #2ecc71; font-size: 16px;">0</span> Active Pupils
      </div>
      <div>
        <button id="quizStageShowAnswerBtn" style="background: #3498db; color: white; border: none; padding: 10px 20px; font-weight: bold; border-radius: 4px; cursor: pointer; margin-right: 10px;">Reveal Answer</button>
        <button id="quizStageNextQuestionBtn" style="background: #2ecc71; color: white; border: none; padding: 10px 24px; font-weight: bold; border-radius: 4px; cursor: pointer;">Next Question ➔</button>
      </div>
    </div>
  `;

  // Attach execution listeners inside the active view
  document.getElementById('closeLiveQuizArenaBtn').addEventListener('click', terminateLiveQuizDeck);
  document.getElementById('quizStageShowAnswerBtn').addEventListener('click', revealCorrectQuizAnswer);
  document.getElementById('quizStageNextQuestionBtn').addEventListener('click', advanceQuizDeckNext);

  presentActiveQuizQuestionIndex();
}

// 2. DISPATCH ACTIVE SLIDE DATA TO IPADS
function presentActiveQuizQuestionIndex() {
  const currentQuestion = quizState.plannedQueue[quizState.currentQuestionIndex];
  if (!currentQuestion) return;

  quizState.activeSubmissions = {}; // Clear responses for the new question

  document.getElementById('quizStageProgressTracker').textContent = `Question ${quizState.currentQuestionIndex + 1} of ${quizState.plannedQueue.length}`;
  document.getElementById('quizStageQuestionHeader').textContent = currentQuestion.question;
  document.getElementById('quizStageSubmissionCounter').textContent = "0";

  renderLiveQuizBars(false);

  // 👇 PASTE/ENSURE THE BROADCAST IS EXACTLY HERE AT THE BOTTOM OF THIS FUNCTION:
  if (channel) {
    channel.send({
      type: 'broadcast',
      event: 'start-live-quiz',
      payload: {
        index: quizState.currentQuestionIndex,
        question: currentQuestion.question,
        options: currentQuestion.options,
        correctIndex: currentQuestion.correctIndex,    // 👈 Hidden correct index for scoring
        totalQuestions: quizState.plannedQueue.length   // 👈 Total count for the final score
      }
    });
  }
} // 👈 This closing bracket ends the function
// 3. DRAW AND RE-UPDATE HORIZONTAL BARS IN REAL TIME
function renderLiveQuizBars(revealAnswerKey = false) {
  const container = document.getElementById('quizStageLiveBarsContainer');
  if (!container) return;

  const currentQuestion = quizState.plannedQueue[quizState.currentQuestionIndex];
  if (!currentQuestion) return;

  const studentAnswersArray = Object.values(quizState.activeSubmissions);
  const totalSubmissionsCount = studentAnswersArray.length;

  const labelCounter = document.getElementById('quizStageSubmissionCounter');
  if (labelCounter) labelCounter.textContent = totalSubmissionsCount;

  const tally = { 0: 0, 1: 0, 2: 0, 3: 0 };
  studentAnswersArray.forEach(idx => { if (tally[idx] !== undefined) tally[idx]++; });

  container.innerHTML = '';

  currentQuestion.options.forEach((optionText, idx) => {
    const voteCount = tally[idx];
    const percentage = totalSubmissionsCount > 0 ? Math.round((voteCount / totalSubmissionsCount) * 100) : 0;
    const isThisCorrectOption = (currentQuestion.correctIndex === idx);

    const row = document.createElement('div');
    row.style.cssText = "display: flex; align-items: center; background: #252538; padding: 12px 20px; border-radius: 6px; position: relative; overflow: hidden; border: 2px solid transparent; transition: all 0.2s ease; margin-bottom: 8px;";

    if (revealAnswerKey) {
      if (isThisCorrectOption) {
        row.style.borderColor = "#2ecc71";
        row.style.background = "#1b3a2b";
      } else {
        row.style.opacity = "0.3";
      }
    }

    const optionLetter = String.fromCharCode(65 + idx); // A, B, C, D

    row.innerHTML = `
      <div style="width: 35px; font-weight: bold; font-size: 18px; color: ${revealAnswerKey && isThisCorrectOption ? '#2ecc71' : '#3498db'}; z-index: 5;">${optionLetter}</div>
      <div style="flex-grow: 1; font-size: 16px; font-weight: 600; z-index: 5; color: #fff;">${optionText}</div>
      <div style="font-size: 14px; font-weight: bold; color: #a0a0c0; z-index: 5; text-align: right; width: 150px;">${voteCount} votes (${percentage}%)</div>
      <div style="position: absolute; left: 0; top: 0; bottom: 0; width: ${percentage}%; background: ${revealAnswerKey && isThisCorrectOption ? 'rgba(46, 204, 113, 0.25)' : 'rgba(52, 152, 219, 0.12)'}; transition: width 0.3s ease; z-index: 1;"></div>
    `;
    container.appendChild(row);
  });
}

// 4. DISPLAY CORRECT ANSWER SELECTION
function revealCorrectQuizAnswer() {
  renderLiveQuizBars(true);

  // 👇 ADD THIS ANALYTICS SNAPSHOT LOGIC RIGHT HERE:
  const currentQuestion = quizState.plannedQueue[quizState.currentQuestionIndex];
  if (currentQuestion) {
    // 1. Calculate how many total answers were submitted by the class
    const totalSubmissions = Object.keys(quizState.activeSubmissions || {}).length;
    let correctCount = 0;

    // 2. Count how many pupils chose the correct index
    Object.values(quizState.activeSubmissions || {}).forEach(chosenIndex => {
      if (chosenIndex === currentQuestion.correctIndex) {
        correctCount++;
      }
    });

    // 3. Turn it into a clean class performance percentage
    const successPercentage = totalSubmissions > 0 ? Math.round((correctCount / totalSubmissions) * 100) : 0;

    // 4. Save this snapshot into our global archive array for the PDF writer
    savedQuizzesHistory.push({
      question: currentQuestion.question,
      options: currentQuestion.options,
      correctAnswer: currentQuestion.options[currentQuestion.correctIndex],
      totalPupilsAnswered: totalSubmissions,
      classScore: `${correctCount}/${totalSubmissions} (${successPercentage}% Correct)`
    });

    console.log("📊 Quiz question performance archived for PDF export:", currentQuestion.question);
  }
}

// 5. PROCEED TO NEXT QUEUED TASK SLIDE
function advanceQuizDeckNext() {
  if (quizState.currentQuestionIndex + 1 < quizState.plannedQueue.length) {
    quizState.currentQuestionIndex++;
    presentActiveQuizQuestionIndex();
  } else {
    alert("🏁 That was the last question in your saved quiz deck!");
    terminateLiveQuizDeck();
  }
}

// 6. CLOSES THE ARENA OVERLAY AND SHUTS DOWN SESSION FLAGS
function terminateLiveQuizDeck() {
  quizState.isActive = false;
  
  const liveStage = document.getElementById('quizLivePresentationStage');
  if (liveStage) liveStage.style.display = 'none';

  const whiteboardView = document.getElementById('teacherWhiteboardView');
  if (whiteboardView) whiteboardView.style.display = 'block';

  // FIX: Change 'close-live-quiz' to 'clear-live-quiz' to match the pupil listener!
  if (channel) {
    channel.send({ 
      type: 'broadcast', 
      event: 'clear-live-quiz' // <--- Changed here
    });
    console.log("📡 Broadcasted clear signal to all student devices.");
  }
}

// 7. AUTO-ATTACH TO THE HTML SWITCH BUTTON ON THE PAGE
const startLiveQuizDeckBtn = document.getElementById('startLiveQuizDeckBtn');
if (startLiveQuizDeckBtn) {
  startLiveQuizDeckBtn.addEventListener('click', startLiveQuizDeck);
}