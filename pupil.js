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

  // Simplification Fix: Strip config restrictions to fix event channel dropouts
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
      
      // Safety fix: Support flat payload variables if nested keys fail
      const data = response.payload || response;
      if (!data || !data.question) return;

      // Hijack view space instantly
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
    
    .subscribe((status) => {
      if (!statusBar) return;
      if (status === 'SUBSCRIBED') {
        statusBar.textContent = `Connected Live to Room ${activeRoomCode}`;
        statusBar.style.backgroundColor = "#BFEA7C"; 
        statusBar.style.color = "#333";
      }
    });
}