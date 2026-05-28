// 1. SUPABASE SECURITY & CONNECTION
const SUPABASE_URL = "https://wfnwjkuojshozhtnlror.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pQvC4ZJv7e9-AL2lkp6upw_xpYa2twv";

// Changed 'supabase' to 'supabaseClient' to prevent the browser from crashing!
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

if (ctx) {
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
}

let activeRoomCode = "";

// 3. LISTEN FOR THE "JOIN CLASS" BUTTON CLICK
if (joinClassBtn) {
  joinClassBtn.addEventListener('click', () => {
    const pupilName = pupilNameInput.value.trim();
    const roomCode = roomCodeInput.value.trim();

    if (!pupilName || !roomCode) {
      alert("Please enter both your name and the room code!");
      return;
    }

    activeRoomCode = roomCode;

    // Phase Switch: Hide login card, show whiteboard workspace!
    joinScreen.style.display = "none";
    boardWorkspace.style.display = "block";

    // Launch connection
    startLiveConnection(roomCode);
  });
}

// 4. REAL-TIME BROADCAST ENGINE
function startLiveConnection(roomCode) {
  if (!supabaseClient) return;

  const channel = supabaseClient.channel(`room_${roomCode}`, {
    config: { broadcast: { self: false } } 
  });

  channel
    .on('broadcast', { event: 'draw' }, ({ payload }) => {
      if (!ctx) return;
      ctx.strokeStyle = payload.color;
      ctx.lineTo(payload.x, payload.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(payload.x, payload.y);
    })
    .on('broadcast', { event: 'image-drop' }, ({ payload }) => {
      if (!ctx) return;
      const studentImg = new Image();
      studentImg.onload = () => {
        ctx.drawImage(studentImg, payload.x, payload.y, payload.width, payload.height);
      };
      studentImg.src = payload.dataUrl;
    })
    .on('broadcast', { event: 'clear' }, () => {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath(); 
    })
    .on('broadcast', { event: 'text' }, ({ payload }) => {
      if (!ctx) return;
      ctx.font = 'bold 20px "Segoe UI", sans-serif';
      ctx.fillStyle = payload.color;
      ctx.textBaseline = 'top';
      ctx.fillText(payload.text, payload.x, payload.y);
      ctx.beginPath();
    })
    .on('broadcast', { event: 'timer-tick' }, ({ payload }) => {
      if (!statusBar) return;
      const mins = Math.floor(payload.seconds / 60).toString().padStart(2, '0');
      const secs = (payload.seconds % 60).toString().padStart(2, '0');
      statusBar.textContent = `Live Lesson - Time Remaining: ${mins}:${secs}`;
    })
    .on('broadcast', { event: 'freeze-state' }, ({ payload }) => {
      if (!statusBar || !canvas) return;
      if (payload.isFrozen) {
        statusBar.textContent = "CLASSROOM FROZEN BY TEACHER";
        statusBar.style.backgroundColor = "#ff9999";
        canvas.style.opacity = "0.2"; 
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