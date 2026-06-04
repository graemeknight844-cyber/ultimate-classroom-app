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

  // Connect Realtime Broadcast Listener Dynamic Switcher Engine
  window.startTeacherConnection = function(roomCode) {
    if (!supabaseClient) return;

    channel = supabaseClient.channel(`room_${roomCode}`);

    channel
      .on('broadcast', { event: 'submit-answer' }, ({ payload }) => { 
        // SORTING OFFICE: Look inside the message from the iPad
        
        if (payload.boardImage) {
          // 1. It has an image! Send it to the Teacher's Whiteboard Grid
          if (typeof handleIncomingStudentAnswer === 'function') {
            handleIncomingStudentAnswer(payload); 
          }
        } 
        else if (payload.chosenIndex !== undefined) {
          // 2. It has a quiz choice! Send it to the Live Graph
          if (typeof window.handleIncomingQuizAnswer === 'function') {
            window.handleIncomingQuizAnswer(payload);
          }
        }
      })
      .on('broadcast', { event: 'submit-vote' }, ({ payload }) => { 
        if (typeof handleIncomingVote === 'function') {
          handleIncomingVote(payload); 
        }
      })
      .subscribe((status) => {
        console.log(`Teacher channel status for room_${roomCode}:`, status);
      });
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
      // 1. Remove the active highlight from the Quiz button and add it to Whiteboard
      if (quizModeBtn) quizModeBtn.classList.remove('active');
      if (typeof pollModeBtn !== 'undefined' && pollModeBtn) pollModeBtn.classList.remove('active');
      whiteboardModeBtn.classList.add('active');

      // 2. Hide the quiz and poll panels, and bring the Whiteboard back to life!
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

  // ============================================================================
  // NEW AUTOMATED QUIZ BUTTON TRACKING LOGIC (PLACED SAFELY INSIDE)
  // ============================================================================
  const addBtn = document.getElementById('addQuestionToBankBtn');
  const launchBtn = document.getElementById('launchQuizBtn');
  const emergencyBtn = document.getElementById('emergencyEndQuizBtn');

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const qInput = document.getElementById('quizQuestionInput');
      const opt0 = document.getElementById('quizOpt0');
      const opt1 = document.getElementById('quizOpt1');
      const opt2 = document.getElementById('quizOpt2');
      const opt3 = document.getElementById('quizOpt3');
      const radios = document.getElementsByName('quizCorrectRadio');

      if (!qInput || !qInput.value.trim()) {
        alert("Please enter a question first before saving!");
        return;
      }

      let correctIdx = 0;
      for (let i = 0; i < radios.length; i++) {
        if (radios[i].checked) { correctIdx = i; break; }
      }

      // Ensure quizState variable exists safely
      if (typeof quizState === 'undefined') {
        window.quizState = { isActive: false, currentQuestionIndex: 0, plannedQueue: [], activeSubmissions: {} };
      }

      const quizCard = {
        question: qInput.value.trim(),
        options: [
          opt0?.value.trim() || "Option A",
          opt1?.value.trim() || "Option B",
          opt2?.value.trim() || "Option C",
          opt3?.value.trim() || "Option D"
        ],
        correctIndex: correctIdx
      };

      quizState.plannedQueue.push(quizCard);

      // Clear layout textboxes for next entries
      qInput.value = "";
      if (opt0) opt0.value = "";
      if (opt1) opt1.value = "";
      if (opt2) opt2.value = "";
      if (opt3) opt3.value = "";

      // Update counter text element on screen
      const countBadge = document.getElementById('quizBankCountBadge');
      if (countBadge) countBadge.innerText = `${quizState.plannedQueue.length} Questions Saved`;

      // Update the list showing saved questions below the inputs
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

  if (launchBtn) {
    launchBtn.addEventListener('click', () => {
      if (typeof quizState === 'undefined' || !quizState.plannedQueue || quizState.plannedQueue.length === 0) {
        alert("Your staged queue is empty! Please build and save at least one question card first.");
        return;
      }

      quizState.isActive = true;
      quizState.currentQuestionIndex = 0;

      const presOverlay = document.getElementById('teacherQuizPresentationView');
      if (presOverlay) presOverlay.style.display = 'block';

      const activeCard = quizState.plannedQueue[0];
      const presNum = document.getElementById('presQuestionNumber');
      const presText = document.getElementById('presQuestionText');
      const splash = document.getElementById('presCountdownSplashOverlay');
      const splashNum = document.getElementById('presCountdownNumberBig');
      const marquee = document.getElementById('presStatusTextMarquee');

      if (presNum) presNum.innerText = `Question 1 / ${quizState.plannedQueue.length}`;
      if (presText) presText.innerText = activeCard.question;
      if (marquee) marquee.innerText = "⏳ Get ready! Quiz starting in 3 seconds...";
      if (splash) splash.style.display = 'flex';

      // Safe live data transmission broadcast check
      if (typeof channel !== 'undefined' && channel) {
        channel.send({
          type: 'broadcast',
          event: 'start-live-quiz',
          payload: { question: activeCard.question, options: activeCard.options, playstyle: "gameshow" }
        });
      }

      let count = 3;
      if (splashNum) splashNum.innerText = count;
      const clock = setInterval(() => {
        count--;
        if (count > 0) {
          if (splashNum) splashNum.innerText = count;
        } else {
          clearInterval(clock);
          if (splash) splash.style.display = 'none';
          if (marquee) marquee.innerText = "⚡ Live Answer Collection Active! Waiting for responses...";
        }
      }, 1000);
    });
  }

  if (emergencyBtn) {
    emergencyBtn.addEventListener('click', () => {
      if (typeof quizState !== 'undefined') {
        quizState.isActive = false;
        quizState.plannedQueue = [];
      }
      const presOverlay = document.getElementById('teacherQuizPresentationView');
      if (presOverlay) presOverlay.style.display = 'none';

      const countBadge = document.getElementById('quizBankCountBadge');
      if (countBadge) countBadge.innerText = "0 Questions Saved";

      const container = document.getElementById('quizPersistentBankContainer');
      if (container) {
        container.innerHTML = `<em style="color: #7f8c8d; font-size: 12px; display: block; padding: 10px 0; text-align: center;">No questions stored yet. Build questions above to load your session bank.</em>`;
      }

      if (typeof channel !== 'undefined' && channel) {
        channel.send({ type: 'broadcast', event: 'clear-live-quiz', payload: {} });
      }
      alert("Quiz presentation closed successfully.");
    });
  }

}); // <--- THIS ONE BRACKET CLOSES EVERYTHING SAFELY AT THE END OF THE INITIALIZATION

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
    // Pause state execution
    clearInterval(timerInterval);
    isTimerRunning = false;
    timerToggleBtn.textContent = "Start";
    timerToggleBtn.style.background = "#2ecc71"; // Switch back to green
    enableTimerInputs(true);
  } else {
    // Start countdown execution
    let minutes = parseInt(timerMinInput.value) || 0;
    let seconds = parseInt(timerSecInput.value) || 0;
    let totalSeconds = (minutes * 60) + seconds;

    if (totalSeconds <= 0) {
      alert("Please enter a time greater than 00:00!");
      return;
    }

    isTimerRunning = true;
    timerToggleBtn.textContent = "Pause";
    timerToggleBtn.style.background = "#e74c3c"; // Switch to red
    enableTimerInputs(false); // Lock inputs while ticking

    // Set initial active green color right at launch
    timerMinInput.style.color = "#2ecc71";
    timerSecInput.style.color = "#2ecc71";

    timerInterval = setInterval(() => {
      totalSeconds--;

      if (totalSeconds <= 0) {
        clearInterval(timerInterval);
        isTimerRunning = false;
        timerMinInput.value = "00";
        timerSecInput.value = "00";
        
        // Reset colors back to standard white on completion
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

        // === DYNAMIC COLOR CODING ===
        if (totalSeconds <= 30) {
          // Final 30 seconds: Change text color to warning Red
          timerMinInput.style.color = "#e74c3c";
          timerSecInput.style.color = "#e74c3c";
        } else {
          // Safe zone: Keep text color active Green
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
  // Visual tracking state styling
  timerMinInput.style.background = enable ? "#34495e" : "#2c3e50";
  timerSecInput.style.background = enable ? "#34495e" : "#2c3e50";
}

function triggerTimerCompletionAlert() {
  // Simple visual flash effect on the input boxes to grab teacher attention
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

  // Optional: Play a short, soft system beep if you want audio notification
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5 note
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

  // Find which option the teacher marked as correct
  const correctRadios = document.querySelectorAll('.poll-correct-radio');

  optionInputs.forEach((input, idx) => {
    if (input.value.trim() !== "") {
      validOptions.push(input.value.trim());
      // If this radio element is checked, note its current valid array index position
      if (correctRadios[idx] && correctRadios[idx].checked) {
        detectedCorrectIndex = validOptions.length - 1;
      }
    }
  });

  if (validOptions.length < 2) {
    alert("Please provide at least two poll options!");
    return;
  }

  // Build active state tracking with accuracy profiles
  pollActive = true;
  activePollData = {
    question: questionText,
    options: validOptions,
    correctAnswerIndex: detectedCorrectIndex, // Saved safely! (-1 if none selected)
    votes: {} // Stores studentName: selectedOptionIndex
  };

  // Switch UI windows inside panel
  pollSetup.style.display = 'none';
  pollLiveResults.style.display = 'block';
  livePollQuestion.textContent = questionText;

  renderLivePollBars();

  // Send broadcast out to current student client channels
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
    
    // Visually flag the correct answer on the teacher's live dashboard view
    if (activePollData.correctAnswerIndex === idx) {
      label.innerHTML = `✅ <span style="color: #2ecc71;">${optionText}</span>`;
    } else {
      label.textContent = optionText;
    }

    const barTrack = document.createElement('div');
    barTrack.style.cssText = "flex-grow: 1; background: #e1e1eb; height: 20px; border-radius: 4px; overflow: hidden; position: relative;";

    const barFill = document.createElement('div');
    // Color code the bar chart fill: Green if it's the correct option, charcoal gray if standard
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

  // Auto-format helper loops: pads single digits with a zero when clicking away (e.g., '5' becomes '05')
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
        // 1. Bake elements down safely
        bakeFloatingObjects();
        
        // 2. CRITICAL CHANGE: Save the actual teacher content snapshot *before* projecting pupil work
        // This ensures the current state isn't lost if edits were made since page changes
        saveCurrentBoardState();
        
        // 3. Clear canvas plane and draw student work
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(zoomImg, 0, 0, canvas.width, canvas.height);
        
        // 4. Reveal the Notification Top Banner to the user 
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

// Dedicated function to bring back the teacher's workspace seamlessly
function revertToTeacherPresentationView() {
  if (!ctx || !canvas) return;

  // Clear student work from drawing plane
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Reload teacher's slide content directly from memory maps array
  if (boardsData[currentBoardIndex]) {
    const originalTeacherImg = new Image();
    originalTeacherImg.src = boardsData[currentBoardIndex];
    originalTeacherImg.onload = () => {
      ctx.drawImage(originalTeacherImg, 0, 0);
      // Reset local undo trace history arrays specifically back to standard footprint state
      canvasHistory = [canvas.toDataURL()];
    };
  }

  // Hide the notification banner
  if (studentInspectBanner) {
    studentInspectBanner.style.display = "none";
  }
}
  if (liveImg) { liveImg.src = studentData.boardImage; }


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

// Fixed function boundary layout map
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

    // PAGE GENERATOR TYPE 1: Whiteboard Lesson Slides & Pupil Submissions
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

    // PAGE GENERATOR TYPE 2: Dynamic Poll Analytics Data Sheets (with Answer Criteria Mapping)
    if (savedPollsHistory.length > 0) {
      savedPollsHistory.forEach((poll, index) => {
        pdf.addPage([1100, 520], 'landscape');

        // Draw Header Track
        pdf.setFillColor(46, 204, 113); // Clean Green theme for poll sheets
        pdf.rect(0, 0, 1100, 45, 'F');

        pdf.setTextColor(255, 255, 255);
        pdf.setFont("Helvetica", "bold");
        pdf.setFontSize(16);
        pdf.text(`SESSION REPORT - COMPLETED CLASSROOM POLL #${index + 1}`, 30, 28);

        // Render Main Question Body text
        pdf.setTextColor(40, 40, 60);
        pdf.setFont("Helvetica", "bold");
        pdf.setFontSize(18);
        pdf.text(`Question Asked: ${poll.question}`, 45, 85);

        // Calculate analytical tally properties
        const voterNames = Object.keys(poll.votes);
        const totalVotes = voterNames.length;
        const tally = {};
        let totalCorrectAnswersCount = 0;

        poll.options.forEach((_, idx) => tally[idx] = 0);
        Object.values(poll.votes).forEach(voteIdx => { 
          if(tally[voteIdx] !== undefined) tally[voteIdx]++; 
        });

        // Count how many students matched the correct criteria benchmark choice index
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

        // Draw visual analytical bars inside PDF engine layout 
        let currentYOffset = 135;
        poll.options.forEach((optionText, idx) => {
          const count = tally[idx];
          const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isThisOptionCorrect = (poll.correctAnswerIndex === idx);

          // Append correct marker string to options labels inside PDF document
          const finalOptionLabel = isThisOptionCorrect ? `* ${optionText} [CORRECT]` : optionText;

          pdf.setTextColor(isThisOptionCorrect ? 39 : 50, isThisOptionCorrect ? 174 : 50, isThisOptionCorrect ? 96 : 60);
          pdf.setFont("Helvetica", "bold");
          pdf.setFontSize(13);
          pdf.text(finalOptionLabel, 50, currentYOffset + 14);

          // Background track
          pdf.setFillColor(230, 230, 238);
          pdf.rect(250, currentYOffset, 550, 20, 'F');

          // Progress bar fill (Green if correct choice, default navy slate if incorrect tracking choice)
          if (percent > 0) {
            pdf.setFillColor(isThisOptionCorrect ? 46 : 74, isThisOptionCorrect ? 204 : 74, isThisOptionCorrect ? 113 : 104);
            pdf.rect(250, currentYOffset, (550 * (percent / 100)), 20, 'F');
          }

          // Numerical labels beside bounds
          pdf.setTextColor(70, 70, 90);
          pdf.setFont("Helvetica", "bold");
          pdf.setFontSize(12);
          pdf.text(`${count} vote(s) (${percent}%)`, 815, currentYOffset + 14);

          currentYOffset += 32; 
        });

        // --------------------------------------------------------------------
        // DETAILED PUPIL BREAKDOWN MATRIX (WITH HIGH-CONTRAST ASSESSMENT COLORS)
        // --------------------------------------------------------------------
        currentYOffset += 15; 
        
        pdf.setTextColor(40, 40, 60);
        pdf.setFont("Helvetica", "bold");
        pdf.setFontSize(14);
        pdf.text("Individual Pupil Response Grid", 45, currentYOffset);
        currentYOffset += 12;

        // Table Header row background line
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
            // Check canvas page boundaries overflow limit
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

            // Row background mapping: Green if correct, light Red if incorrect, standard zebra striping if no key set
            if (hasNoCorrectCriteriaSet) {
              if (sIdx % 2 === 0) {
                pdf.setFillColor(245, 245, 250);
                pdf.rect(45, currentYOffset, 1010, 22, 'F');
              }
            } else {
              if (isCorrect) {
                pdf.setFillColor(233, 247, 239); // Clean tint soft translucent green block
              } else {
                pdf.setFillColor(253, 237, 237); // Clean tint soft translucent red block
              }
              pdf.rect(45, currentYOffset, 1010, 22, 'F');
            }
            
            // Draw standard matrix gridline rules
            pdf.setDrawColor(225, 225, 235);
            pdf.rect(45, currentYOffset, 1010, 22, 'S');

            // Print student row values 
            pdf.setTextColor(50, 50, 60);
            pdf.setFont("Helvetica", "bold");
            pdf.setFontSize(11);
            pdf.text(studentName, 60, currentYOffset + 15);

            const chosenOptionStringText = poll.options[chosenIndex] || `Unknown Choice (Index ${chosenIndex})`;
            pdf.setFont("Helvetica", "normal");
            pdf.text(chosenOptionStringText, 350, currentYOffset + 15);

            // Print column evaluation stamps
            if (hasNoCorrectCriteriaSet) {
              pdf.setTextColor(110, 110, 120);
              pdf.text("Ungraded Poll Survey", 850, currentYOffset + 15);
            } else if (isCorrect) {
              pdf.setTextColor(39, 174, 96); // Vibrant deep green font text
              pdf.setFont("Helvetica", "bold");
              pdf.text("CORRECT", 850, currentYOffset + 15);
            } else {
              pdf.setTextColor(192, 57, 43); // Vibrant deep red font text
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

// ============================================================================
// ============================================================================
// AUTOMATED QUIZ ENGINE LOGIC (STEP C - INDEPENDENT CORE MODULE)
// ============================================================================
// ============================================================================

// 1. CHANNELS SUBMISSION BINDING HOOK
// This listens to student submissions arriving over Supabase
function handleIncomingStudentAnswer(payload) {
  // If a quiz isn't currently running on the screen, ignore incoming submissions
  if (!quizState.isActive) return;

  const studentName = payload.studentName || "Anonymous Pupil";
  const chosenIndex = parseInt(payload.chosenIndex);

  // Lock in the student's response
  quizState.activeSubmissions[studentName] = chosenIndex;

  // Re-draw the bar graphs on your presentation screen with the live values
  renderLiveQuizBars();
}
  // Update the text counter display at the top (e.g., 5 / 3 Pupils

  // ============================================================================
// STEP-BY-STEP QUIZ SERVICE FUNCTIONS
// ============================================================================

// This function runs automatically to connect your buttons when the page loads
function setupMyQuizButtons() {
  const addBtn = document.getElementById('addQuestionToBankBtn');

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      // 1. Grab the text boxes from your screen
      const qInput = document.getElementById('quizQuestionInput');
      const opt0 = document.getElementById('quizOpt0');
      const opt1 = document.getElementById('quizOpt1');
      const opt2 = document.getElementById('quizOpt2');
      const opt3 = document.getElementById('quizOpt3');
      const radios = document.getElementsByName('quizCorrectRadio');

      // Safety check: If they didn't type a question, stop them
      if (!qInput || !qInput.value.trim()) {
        alert("Please type a question first before saving!");
        return;
      }

      // 2. Find out which radio dot is clicked as the correct answer
      let correctIdx = 0;
      for (let i = 0; i < radios.length; i++) {
        if (radios[i].checked) {
          correctIdx = i;
          break;
        }
      }

      // 3. Package the typed question neatly
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

      // 4. Drop it into our virtual basket!
      quizState.plannedQueue.push(newQuestionCard);

      // 5. Clear out the text boxes on your screen so you can type a new one
      qInput.value = "";
      if (opt0) opt0.value = "";
      if (opt1) opt1.value = "";
      if (opt2) opt2.value = "";
      if (opt3) opt3.value = "";

      // 6. Update the counter badge text on your screen
      const countBadge = document.getElementById('quizBankCountBadge');
      if (countBadge) {
        countBadge.innerText = `${quizState.plannedQueue.length} Questions Saved`;
      }

      alert("✓ Question added to your session deck successfully!");
    });
  }
}

// Kickstart the button wire-up immediately
setupMyQuizButtons();

