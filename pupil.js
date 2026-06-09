// ==========================================
// 1. SUPABASE SECURITY & CONNECTION
// ==========================================
const SUPABASE_URL = "https://wfnwjkuojshozhtnlror.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pQvC4ZJv7e9-AL2lkp6upw_xpYa2twv";
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// ==========================================
// 2. DOM ELEMENT DECLARATIONS
// ==========================================
const joinScreen = document.getElementById('joinScreen');
const boardWorkspace = document.getElementById('boardWorkspace');
const pupilNameInput = document.getElementById('pupilNameInput');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinClassBtn = document.getElementById('joinClassBtn');

const canvas = document.getElementById('pupilCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const statusBar = document.getElementById('statusBar');

const pupilPenColor = document.getElementById('pupilPenColor');
const pupilClearBtn = document.getElementById('pupilClearBtn');

const pupilRubberBtn = document.getElementById('pupilRubberBtn');
const pupilPenBtn = document.getElementById('pupilPenBtn');
const pupilThicknessSlider = document.getElementById('pupilThickness') || { value: 4 };

// Poll UI Elements
const pupilWhiteboardView = document.getElementById('pupilWhiteboardView');
const pupilPollView = document.getElementById('pupilPollView');
const pupilPollQuestion = document.getElementById('pupilPollQuestion');
const pupilPollOptions = document.getElementById('pupilPollOptions');
const pupilPollStatus = document.getElementById('pupilPollStatus');

// Quiz UI Elements
const pupilQuizView = document.getElementById('pupilQuizView');
const pupilQuizQuestion = document.getElementById('pupilQuizQuestion');
const pupilQuizOptions = document.getElementById('pupilQuizOptions');
const pupilQuizStatus = document.getElementById('pupilQuizStatus');
const pupilQuizRefText = document.getElementById('pupilQuizRefText');

// ==========================================
// 3. APPLICATION STATE VARIABLES
// ==========================================
let activeRoomCode = "";
let studentName = "";
let isDrawing = false;
let classIsFrozen = false;
let liveChannel = null;

let studentBoardsData = ['']; 
let currentStudentBoardIndex = 0;
let currentThickness = 4;
let isEraser = false;

if (ctx && pupilPenColor) {
  ctx.lineWidth = currentThickness;
  ctx.lineCap = 'round';
  ctx.strokeStyle = pupilPenColor.value;
}

// Local tracking variables for the quiz scoreboard
let pupilScore = 0;
let totalQuizQuestions = 0;
let currentCorrectAnswerIndices = []; 
let hasAnsweredCurrentQuestion = false;
let studentChosenIndex = null;        // Kept for backward compatibility
let studentChosenIndices = [];       // 🎯 NEW: Tracks multiple selections for multi-choice questions

// ==========================================
// 4. LISTEN FOR THE "JOIN CLASS" BUTTON CLICK
// ==========================================
if (joinClassBtn) {
  joinClassBtn.addEventListener('click', () => {
    const name = pupilNameInput.value.trim();
    const roomCode = roomCodeInput.value.trim();

    if (!name || !roomCode) {
      alert("Please enter both your name and the room code!");
      return;
    }

    studentName = name;
    activeRoomCode = roomCode;

    joinScreen.style.display = "none";
    boardWorkspace.style.display = "block";

    startLiveConnection(roomCode);
  });
}

// ==========================================
// 5. PUPIL'S PERSONAL DRAWING SYSTEM & UTILITIES
// ==========================================
if (canvas && ctx) {
  canvas.addEventListener('mousedown', (e) => {
    if (classIsFrozen) return; 
    isDrawing = true;
    draw(e);
  });
  canvas.addEventListener('mouseup', () => { 
    isDrawing = false; 
    ctx.beginPath(); 
    setTimeout(() => { sendBoardSnapshotToTeacher(); }, 50);
  });
  canvas.addEventListener('mouseout', () => { 
    isDrawing = false; 
    ctx.beginPath(); 
  });
  canvas.addEventListener('mousemove', draw);

  canvas.addEventListener('touchstart', (e) => {
    if (classIsFrozen) return;
    e.preventDefault(); 
    isDrawing = true;
    const touch = e.touches[0];
    draw(touch);
  });
  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    isDrawing = false;
    ctx.beginPath();
    setTimeout(() => { sendBoardSnapshotToTeacher(); }, 50);
  });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault(); 
    const touch = e.touches[0];
    draw(touch);
  });
}

function getCanvasCoordinates(e) {
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function draw(e) {
  if (!isDrawing || !ctx || classIsFrozen) return;
  const coords = getCanvasCoordinates(e);
  
  currentThickness = pupilThicknessSlider.value || 4;
  ctx.lineWidth = currentThickness;
  
  if (isEraser) {
    ctx.globalCompositeOperation = 'destination-out'; 
  } else {
    ctx.globalCompositeOperation = 'source-over'; 
    ctx.strokeStyle = pupilPenColor.value || '#000000';
  }
  
  ctx.lineTo(coords.x, coords.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(coords.x, coords.y);
}

if (pupilPenColor && ctx) {
  pupilPenColor.addEventListener('input', (e) => {
    isEraser = false; 
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = e.target.value;
  });
}

if (pupilRubberBtn) {
  pupilRubberBtn.addEventListener('click', () => { isEraser = true; });
}
if (pupilPenBtn) {
  pupilPenBtn.addEventListener('click', () => {
    isEraser = false;
    ctx.globalCompositeOperation = 'source-over';
  });
}

if (pupilClearBtn && ctx && canvas) {
  pupilClearBtn.addEventListener('click', () => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    setTimeout(() => { sendBoardSnapshotToTeacher(); }, 50);
  });
}

// ==========================================
// 6. AUTO-SENDER: SHIPS BASEBOARD SNAPS
// ==========================================
function sendBoardSnapshotToTeacher() {
  if (!liveChannel || !canvas) return;
  const snapshotDataUrl = canvas.toDataURL('image/png'); 

  liveChannel.send({
    type: 'broadcast',
    event: 'submit-answer',
    payload: { name: studentName, boardImage: snapshotDataUrl }
  });
}

// ==========================================
// 7. REAL-TIME LISTENER (Standardized Channel Connection)
// ==========================================
function startLiveConnection(roomCode) {
  if (!supabaseClient) return;

  liveChannel = supabaseClient.channel(`room_${roomCode}`);

  liveChannel
    .on('broadcast', { event: 'timer-tick' }, ({ payload }) => {
      if (!statusBar) return;
      const mins = Math.floor(payload.seconds / 60).toString().padStart(2, '0');
      const secs = (payload.seconds % 60).toString().padStart(2, '0');
      statusBar.textContent = `Live Lesson - Time Remaining: ${mins}:${secs}`;
    })
    .on('broadcast', { event: 'freeze-state' }, ({ payload }) => {
      if (!statusBar || !canvas) return;
      classIsFrozen = payload.isFrozen;
      if (classIsFrozen) {
        statusBar.textContent = "CLASSROOM FROZEN BY TEACHER";
        statusBar.style.backgroundColor = "#ff9999";
        canvas.style.opacity = "0.3"; 
      } else {
        statusBar.textContent = `Connected Live to Room ${activeRoomCode}`;
        statusBar.style.backgroundColor = "#BFEA7C";
        canvas.style.opacity = "1.0";
      }
    })
    .on('broadcast', { event: 'switch-board' }, ({ payload }) => {
      if (!canvas || !ctx) return;
      
      studentBoardsData[currentStudentBoardIndex] = canvas.toDataURL();
      currentStudentBoardIndex = payload.index;
      
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();
      
      if (studentBoardsData[currentStudentBoardIndex]) {
        const img = new Image();
        img.src = studentBoardsData[currentStudentBoardIndex];
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          sendBoardSnapshotToTeacher();
        };
      } else {
        studentBoardsData[currentStudentBoardIndex] = '';
        sendBoardSnapshotToTeacher();
      }
    })
    
    // ========================================================================
    // RE-WIRED BROADCAST POLL INTERCEPTORS
    // ========================================================================
    .on('broadcast', { event: 'start-poll' }, (response) => {
      if (!pupilWhiteboardView || !pupilPollView || !pupilPollQuestion || !pupilPollOptions || !pupilPollStatus) return;
      
      const data = response.payload || response;
      if (!data || !data.question) return;

      pupilWhiteboardView.style.display = 'none';
      pupilPollView.style.display = 'block';
      pupilPollStatus.style.display = 'none';
      
      pupilPollQuestion.textContent = data.question;
      pupilPollOptions.innerHTML = ''; 
      
      if (data.options && Array.isArray(data.options)) {
        data.options.forEach((optionText, index) => {
          const btn = document.createElement('button');
          btn.textContent = optionText;
          btn.style.cssText = "width: 100%; padding: 14px; border: 1px solid #4a4a68; border-radius: 6px; background: #f4f4f9; font-size: 16px; font-weight: bold; cursor: pointer; color: #4a4a68; transition: all 0.2s; outline: none;";
          
          btn.onmouseover = () => { btn.style.background = "#4a4a68"; btn.style.color = "#ffffff"; };
          btn.onmouseout = () => { btn.style.background = "#f4f4f9"; btn.style.color = "#4a4a68"; };

          btn.addEventListener('click', () => {
            liveChannel.send({
              type: 'broadcast',
              event: 'submit-vote',
              payload: { studentName: studentName, optionIndex: index }
            });
            
            const allOptionBtns = pupilPollOptions.querySelectorAll('button');
            allOptionBtns.forEach(b => { 
              b.disabled = true; 
              b.style.opacity = "0.5"; 
              b.style.cursor = "default";
              b.onmouseover = null; 
            });
            
            pupilPollStatus.style.display = 'block';
          });
          
          pupilPollOptions.appendChild(btn);
        });
      }
    })
    .on('broadcast', { event: 'close-poll' }, () => {
      if (!pupilWhiteboardView || !pupilPollView) return;
      pupilPollView.style.display = 'none';
      pupilWhiteboardView.style.display = 'block';
    })

    // ========================================================================
    // LIVE QUIZ INTERCEPT NETWORK ROUTING LAYERS (UPDATED FOR MULTI-SELECT)
    // ========================================================================
    .on('broadcast', { event: 'start-live-quiz' }, ({ payload }) => {
      if (!pupilWhiteboardView || !pupilQuizView || !pupilQuizQuestion || !pupilQuizOptions) return;
      if (pupilPollView) pupilPollView.style.display = 'none'; 

      // Clear tracking variables for the new question
      totalQuizQuestions = payload.totalQuestions;
      hasAnsweredCurrentQuestion = false; 
      studentChosenIndex = null;
      studentChosenIndices = []; // 🎯 Reset selection matrix

      // Hide status tracking element completely (Clean layout)
      if (pupilQuizStatus) {
        pupilQuizStatus.style.display = 'none';
        pupilQuizStatus.textContent = '';
      }

      pupilWhiteboardView.style.display = 'none';
      pupilQuizView.style.display = 'block';

      pupilQuizQuestion.textContent = payload.question;
      pupilQuizOptions.innerHTML = ''; 

      if (pupilQuizRefText) {
        if (payload.playstyle === "independent" && payload.referenceText) {
          pupilQuizRefText.textContent = payload.referenceText;
          pupilQuizRefText.style.display = "block";
        } else {
          pupilQuizRefText.style.display = "none";
          pupilQuizRefText.textContent = "";
        }
      }

      // Check if teacher flagged this question card as multi-answer selection mode
      const isMultiAnswerMode = payload.isMultiAnswer || false;

      // ====================================================================
      // ⏱️ INTEGRATED COGNITIVE PAUSE: 3-2-1 SCREEN ANIMATION ENGINE
      // ====================================================================
      if (payload.runCountdown) {
        pupilQuizOptions.style.visibility = 'hidden';

        let overlay = document.getElementById('pupilQuizCountdownOverlay');
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.id = 'pupilQuizCountdownOverlay';
          document.body.appendChild(overlay);
        }
        
        overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: #1a1a24; color: #ffffff; z-index: 999999; display: flex; flex-direction: column; justify-content: center; align-items: center; font-family: 'Segoe UI', sans-serif; user-select: none;";
        
        let currentTick = 3;
        overlay.innerHTML = `
          <div style="text-align: center;">
            <div style="font-size: 14px; text-transform: uppercase; letter-spacing: 3px; color: #8e8e9f; margin-bottom: 15px; font-weight: bold;">Get Ready...</div>
            <div id="pupilCountdownNum" style="font-size: 110px; font-weight: 900; color: #e67e22; transition: all 0.1s ease;">3</div>
          </div>
        `;

        const clockTicker = setInterval(() => {
          currentTick--;
          const numDisplay = document.getElementById('pupilCountdownNum');

          if (currentTick > 0) {
            if (numDisplay) {
              numDisplay.textContent = currentTick;
              numDisplay.style.transform = 'scale(1.2)';
              setTimeout(() => { if(numDisplay) numDisplay.style.transform = 'scale(1)'; }, 100);
            }
          } else if (currentTick === 0) {
            if (numDisplay) {
              numDisplay.textContent = "GO!";
              numDisplay.style.color = "#2ecc71";
            }
          } else {
            clearInterval(clockTicker);
            overlay.style.display = 'none';
            pupilQuizOptions.style.visibility = 'visible';
          }
        }, 1000);

      } else {
        pupilQuizOptions.style.visibility = 'visible';
      }

      // Populate choices
      if (payload.options && Array.isArray(payload.options)) {
        payload.options.forEach((optionText, index) => {
          const btn = document.createElement('button');
          btn.className = "pupil-quiz-option-btn"; 
          btn.setAttribute('data-index', index);
          btn.textContent = optionText;
          btn.style.cssText = "width: 100%; padding: 14px; border: 1px solid #2980b9; border-radius: 6px; background: #ebf5fb; font-size: 16px; font-weight: bold; cursor: pointer; color: #2980b9; transition: all 0.2s; outline: none; margin-bottom: 8px; text-align: left; opacity: 1;";
          
          btn.onmouseover = () => { if (!hasAnsweredCurrentQuestion) { btn.style.background = "#2980b9"; btn.style.color = "#ffffff"; } };
          btn.onmouseout = () => { if (!hasAnsweredCurrentQuestion && !studentChosenIndices.includes(index)) { btn.style.background = "#ebf5fb"; btn.style.color = "#2980b9"; } };

          btn.addEventListener('click', () => {
            if (hasAnsweredCurrentQuestion) return; 
            
            if (isMultiAnswerMode) {
              // 🎯 MULTI-SELECT MODE: Toggle choice inside the matrix index array
              if (studentChosenIndices.includes(index)) {
                studentChosenIndices = studentChosenIndices.filter(i => i !== index);
                btn.style.background = "#ebf5fb";
                btn.style.color = "#2980b9";
              } else {
                studentChosenIndices.push(index);
                btn.style.background = "#3498db";
                btn.style.color = "#ffffff";
              }
            } else {
              // 🔘 SINGLE-SELECT MODE: Lock and submit immediately
              hasAnsweredCurrentQuestion = true; 
              studentChosenIndex = index;
              studentChosenIndices = [index];

              liveChannel.send({
                type: 'broadcast',
                event: 'submit-answer', 
                payload: { studentName: studentName, chosenIndex: index }
              });
              
              const allOptionBtns = pupilQuizOptions.querySelectorAll('.pupil-quiz-option-btn');
              allOptionBtns.forEach(b => { 
                b.disabled = true; 
                b.style.opacity = "0.3"; 
                b.style.cursor = "default";
              });
              
              btn.style.background = "#3498db";
              btn.style.color = "#ffffff";
              btn.style.opacity = "1";
            }
          });
          
          pupilQuizOptions.appendChild(btn);
        });

        // 🎯 Spawns the submission lock button for multi-answer questions
        if (isMultiAnswerMode) {
          const submitBtn = document.createElement('button');
          submitBtn.id = "lockInMultiAnswersBtn";
          submitBtn.textContent = "🔒 Lock In Answers";
          submitBtn.style.cssText = "width: 100%; padding: 15px; border: none; border-radius: 6px; background: #2ecc71; font-size: 18px; font-weight: bold; cursor: pointer; color: white; margin-top: 10px; text-transform: uppercase; transition: all 0.2s;";
          
          submitBtn.addEventListener('click', () => {
            if (studentChosenIndices.length === 0) {
              alert("Please select at least one choice before locking in!");
              return;
            }

            hasAnsweredCurrentQuestion = true;
            submitBtn.disabled = true;
            submitBtn.style.background = "#7f8c8d";
            submitBtn.textContent = "✓ Selection Submitted";

            // Freeze choices and dim items that weren't selected
            const allOptionBtns = pupilQuizOptions.querySelectorAll('.pupil-quiz-option-btn');
            allOptionBtns.forEach(b => {
              b.disabled = true;
              const idx = parseInt(b.getAttribute('data-index'));
              if (!studentChosenIndices.includes(idx)) {
                b.style.opacity = "0.25";
              }
              b.style.cursor = "default";
            });

            // Ship out array payload matrix to the teacher's script panel
            liveChannel.send({
              type: 'broadcast',
              event: 'submit-answer', 
              payload: { studentName: studentName, chosenIndex: studentChosenIndices }
            });
          });

          pupilQuizOptions.appendChild(submitBtn);
        }
      }
    })

/// ========================================================================
    // LIVE QUIZ REVEAL LISTENER (UPDATED FOR MULTI-CHOICE ASSESSMENT HIGHLIGHTS)
    // ========================================================================
    .on('broadcast', { event: 'reveal-quiz-answer' }, ({ payload }) => {
      if (!pupilQuizOptions || !payload || !payload.correctIndices) return;

      const correctAnswersArray = payload.correctIndices; 
      const allOptionBtns = pupilQuizOptions.querySelectorAll('.pupil-quiz-option-btn');

      // 🎯 STRICT ASSESSMENT CHECK: Student earns a point if their entire selection match matches perfectly
      const isPerfectMatch = studentChosenIndices.length === correctAnswersArray.length && 
                             studentChosenIndices.every(idx => correctAnswersArray.includes(idx));

      if (isPerfectMatch) {
        pupilScore++;
        console.log(`🎯 Score verified down on iPad! Total: ${pupilScore}`);
      }

      // Remove the lock-in button from view if present
      const lockBtn = document.getElementById('lockInMultiAnswersBtn');
      if (lockBtn) lockBtn.style.display = 'none';

      // Re-style option buttons with validation telemetry feedback mapping colors
      allOptionBtns.forEach((btn, idx) => {
        const isThisCorrect = correctAnswersArray.includes(idx);
        const wasThisChosenByStudent = studentChosenIndices.includes(idx);

        if (wasThisChosenByStudent) {
          if (isThisCorrect) {
            btn.style.background = "#2ecc71"; // ✅ Green if they picked a correct option
            btn.style.borderColor = "#27ae60";
          } else {
            btn.style.background = "#e74c3c"; // ❌ Red if they picked a wrong option
            btn.style.borderColor = "#c0392b";
          }
          btn.style.color = "#ffffff";
          btn.style.opacity = "1"; 
        } else {
          if (isThisCorrect) {
            btn.style.background = "#2ecc71"; // 🟢 Light up missed answers gently
            btn.style.color = "#ffffff";
            btn.style.opacity = "0.5"; 
          } else {
            btn.style.opacity = "0.15"; // Completely dim out irrelevant wrong options
          }
        }
      });
    })

    // ========================================================================
    // CLEAR QUIZ LISTENER (RETURNS PUPILS TO WHITEBOARD)
    // ========================================================================
    .on('broadcast', { event: 'clear-live-quiz' }, () => {
      if (!pupilWhiteboardView || !pupilQuizView) return;
      
      console.log("Quiz ended by teacher. Dropping back to Whiteboard.");
      
      pupilQuizView.style.display = 'none';
      if (pupilPollView) pupilPollView.style.display = 'none';
      pupilWhiteboardView.style.display = 'block';
      
      // Clean up local states for the next round
      studentChosenIndex = null;
      studentChosenIndices = []; // 🎯 Clear array reference matrix logs
      hasAnsweredCurrentQuestion = false;
    })

    // ========================================================================
    // PIPELINE SUBSCRIPTION IGNITION CORE
    // ========================================================================
    .subscribe((status) => {
      if (!statusBar) return;
      if (status === 'SUBSCRIBED') {
        statusBar.textContent = `Connected Live to Room ${activeRoomCode}`;
        statusBar.style.backgroundColor = "#BFEA7C"; 
        statusBar.style.color = "#333";
      }
    });
}