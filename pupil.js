// 1. SUPABASE SECURITY & CONNECTION
const SUPABASE_URL = "https://wfnwjkuojshozhtnlror.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pQvC4ZJv7e9-AL2lkp6upw_xpYa2twv";
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// 2. DOM ELEMENT DECLARATIONS
const joinScreen = document.getElementById('joinScreen');
const boardWorkspace = document.getElementById('boardWorkspace');
const pupilNameInput = document.getElementById('pupilNameInput');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinClassBtn = document.getElementById('joinClassBtn');

const canvas = document.getElementById('pupilCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const statusBar = document.getElementById('statusBar');

// New Student Tool Elements
const pupilPenColor = document.getElementById('pupilPenColor');
const pupilClearBtn = document.getElementById('pupilClearBtn');

// 3. APPLICATION STATE VARIABLES
let activeRoomCode = "";
let studentName = "";
let isDrawing = false;
let classIsFrozen = false;
let liveChannel = null;

if (ctx && pupilPenColor) {
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.strokeStyle = pupilPenColor.value;
}

// 4. LISTEN FOR THE "JOIN CLASS" BUTTON CLICK
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

    // Phase Switch: Hide login card, show workspace!
    joinScreen.style.display = "none";
    boardWorkspace.style.display = "block";

    // Launch connection
    startLiveConnection(roomCode);
  });
}

// 5. PUPIL'S PERSONAL DRAWING SYSTEM
if (canvas && ctx) {
  // Mouse Events
  canvas.addEventListener('mousedown', (e) => {
    if (classIsFrozen) return; // Block drawing if frozen
    isDrawing = true;
    draw(e);
  });
  canvas.addEventListener('mouseup', () => { 
    isDrawing = false; 
    ctx.beginPath(); 
    sendBoardSnapshotToTeacher(); // Send snapshot when pen lifts!
  });
  canvas.addEventListener('mouseout', () => { 
    isDrawing = false; 
    ctx.beginPath(); 
  });
  canvas.addEventListener('mousemove', draw);

  // Touch Screen Events (For Phones/Tablets!)
  canvas.addEventListener('touchstart', (e) => {
    if (classIsFrozen) return;
    isDrawing = true;
    const touch = e.touches[0];
    draw(touch);
  });
  canvas.addEventListener('touchend', () => {
    isDrawing = false;
    ctx.beginPath();
    sendBoardSnapshotToTeacher(); // Send snapshot when finger lifts!
  });
  canvas.addEventListener('touchmove', (e) => {
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
  ctx.lineTo(coords.x, coords.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(coords.x, coords.y);
}

// Change pen color when color picker moves
if (pupilPenColor && ctx) {
  pupilPenColor.addEventListener('input', (e) => {
    ctx.strokeStyle = e.target.value;
  });
}

// Clear local canvas
if (pupilClearBtn && ctx && canvas) {
  pupilClearBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    sendBoardSnapshotToTeacher(); // Send an empty snapshot so teacher sees it cleared
  });
}

// 6. AUTO-SENDER: PACKS UP THE CANVAS AND SENDS TO TEACHER
function sendBoardSnapshotToTeacher() {
  if (!liveChannel || !canvas) return;
  
  // Compress their canvas into a small thumbnail string image
  // CHANGE THIS LINE inside sendBoardSnapshotToTeacher():
const snapshotDataUrl = canvas.toDataURL('image/png'); // Changed from jpeg to png!

  // Send it over the airwaves tagged with their custom name!
  liveChannel.send({
    type: 'broadcast',
    event: 'submit-answer',
    payload: {
      name: studentName,
      boardImage: snapshotDataUrl
    }
  });
}

// 7. REAL-TIME LISTENER (Listens to Teacher commands)
function startLiveConnection(roomCode) {
  if (!supabaseClient) return;

  liveChannel = supabaseClient.channel(`room_${roomCode}`, {
    config: { broadcast: { self: false } } 
  });

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
    .subscribe((status) => {
      if (!statusBar) return;
      if (status === 'SUBSCRIBED') {
        statusBar.textContent = `Connected Live to Room ${activeRoomCode}`;
        statusBar.style.backgroundColor = "#BFEA7C"; 
        statusBar.style.color = "#333";
      }
    });
}