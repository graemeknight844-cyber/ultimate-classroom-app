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
let currentCorrectAnswerIndex = null;
let hasAnsweredCurrentQuestion = false;

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

// 👇 ADD THIS SCORING LOGIC HERE:
if (typeof hasAnsweredCurrentQuestion !== 'undefined' && !hasAnsweredCurrentQuestion) {
  hasAnsweredCurrentQuestion = true; // Lock their answer for this question
  
  // If their choice matches the hidden correct index sent by the teacher, award a point!
  if (typeof currentCorrectAnswerIndex !== 'undefined' && idx === currentCorrectAnswerIndex) {
    pupilScore = (pupilScore || 0) + 1;
    console.log("🎯 Correct! Score is now: " + pupilScore);
  }
}

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
    // LIVE QUIZ INTERCEPT NETWORK ROUTING LAYERS
    // ========================================================================
    .on('broadcast', { event: 'start-live-quiz' }, ({ payload }) => {
  // 1. Keep your existing safety checks exactly as they are:
  if (!pupilWhiteboardView || !pupilQuizView || !pupilQuizQuestion || !pupilQuizOptions) return;
  if (pupilPollView) pupilPollView.style.display = 'none'; 

  // 2. ADD THESE THREE LINES RIGHT HERE:
  currentCorrectAnswerIndex = payload.correctIndex;
  totalQuizQuestions = payload.totalQuestions;
  hasAnsweredCurrentQuestion = false; 

  // 3. LEAVE EVERYTHING ELSE BELOW THIS ALONE (Your existing code that renders options, etc.)
      pupilWhiteboardView.style.display = 'none';
      pupilQuizView.style.display = 'block';
      if (pupilQuizStatus) pupilQuizStatus.style.display = 'none';

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

      if (payload.options && Array.isArray(payload.options)) {
        payload.options.forEach((optionText, index) => {
          const btn = document.createElement('button');
          btn.textContent = optionText;
          btn.style.cssText = "width: 100%; padding: 14px; border: 1px solid #2980b9; border-radius: 6px; background: #ebf5fb; font-size: 16px; font-weight: bold; cursor: pointer; color: #2980b9; transition: all 0.2s; outline: none; margin-bottom: 8px; text-align: left;";
          
          btn.onmouseover = () => { btn.style.background = "#2980b9"; btn.style.color = "#ffffff"; };
          btn.onmouseout = () => { btn.style.background = "#ebf5fb"; btn.style.color = "#2980b9"; };

          btn.addEventListener('click', () => {
            
            // 👇 SQUEEZE THESE LINES IN HERE (DO NOT DELETE THE REST):
            if (!hasAnsweredCurrentQuestion) {
              hasAnsweredCurrentQuestion = true; 
              if (index === currentCorrectAnswerIndex) {
                pupilScore++;
              }
            }
            // 👆 END OF NEW LINES

            // FIX APPLIED HERE: Sending perfectly matched parameters down the network line!
            liveChannel.send({
              type: 'broadcast',
              event: 'submit-answer', 
              payload: { 
                studentName: studentName, 
                chosenIndex: index 
              }
            });
            
            const allOptionBtns = pupilQuizOptions.querySelectorAll('button');
            allOptionBtns.forEach(b => { 
              b.disabled = true; 
              b.style.opacity = "0.4"; 
              b.style.cursor = "default";
              b.onmouseover = null; 
            });
            
            btn.style.background = "#2ecc71";
            btn.style.color = "#ffffff";
            btn.style.opacity = "1";

            if (pupilQuizStatus) {
              pupilQuizStatus.textContent = `✓ Answer submitted to teacher panel!`;
              pupilQuizStatus.style.display = 'block';
              pupilQuizStatus.style.color = '#2ecc71';
            }
          });
          
          pupilQuizOptions.appendChild(btn);
        });
      }
    })
    .on('broadcast', { event: 'clear-live-quiz' }, () => {
  // 1. Keep your existing safety check
  if (!pupilWhiteboardView || !pupilQuizView) return;
  
  // 2. Instantly hide the quiz questions panel
  pupilQuizView.style.display = 'none';

  // 3. Create or grab the fullscreen popup modal overlay
  let scoreModal = document.getElementById('pupilQuizScorecardModal');
  if (!scoreModal) {
    scoreModal = document.createElement('div');
    scoreModal.id = 'pupilQuizScorecardModal';
    scoreModal.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(26, 26, 36, 0.95); color: white; z-index: 999999; display: flex; flex-direction: column; justify-content: center; align-items: center; font-family: sans-serif; padding: 20px; box-sizing: border-box;";
    document.body.appendChild(scoreModal);
  } else {
    scoreModal.style.display = 'flex';
  }

  // 4. Calculate their grading percentage
  const percentage = totalQuizQuestions > 0 ? Math.round((pupilScore / totalQuizQuestions) * 100) : 0;
  let performanceMessage = "Great effort! 🌟";
  if (percentage >= 80) performanceMessage = "Outstanding Job! 🎉🏆";
  if (percentage === 100) performanceMessage = "Perfect Score! 🎖️🔥";

  // 5. Inject the scorecard visual layout
  scoreModal.innerHTML = `
    <div style="background: #252538; padding: 40px; border-radius: 12px; text-align: center; max-width: 400px; width: 100%; border: 2px solid #3498db; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
      <h2 style="margin-top: 0; font-size: 24px; color: #3498db;">Quiz Complete!</h2>
      <h1 style="font-size: 48px; margin: 20px 0; color: #2ecc71;">${pupilScore} / ${totalQuizQuestions}</h1>
      <p style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">${percentage}% Correct</p>
      <p style="color: #a0a0c0; margin-bottom: 30px;">${performanceMessage}</p>
      <button id="closeScorecardBtn" style="background: #3498db; color: white; border: none; padding: 12px 30px; font-size: 16px; font-weight: bold; border-radius: 6px; cursor: pointer; width: 100%; transition: background 0.2s;">Return to Whiteboard</button>
    </div>
  `;

  // 6. When they click the button, remove the modal and finally open the Whiteboard view
  document.getElementById('closeScorecardBtn').addEventListener('click', () => {
    scoreModal.style.display = 'none';
    pupilWhiteboardView.style.display = 'block'; // 👈 Your old line runs here instead!
    
    // Clear out tracking metrics so they start fresh on the next quiz
    pupilScore = 0;
    totalQuizQuestions = 0;
  });
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