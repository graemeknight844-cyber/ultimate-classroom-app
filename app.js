// 1. SUPABASE SECURITY CONNECTION
const SUPABASE_URL = "https://wfnwjkuojshozhtnlror.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pQvC4ZJv7e9-AL2lkp6upw_xpYa2twv";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkUserSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
  }
}
checkUserSession();

// Setup the broadcasting radio channel on the teacher's side
const channel = supabase.channel('room_8492');
channel.subscribe();

// DOM Element Declarations
const canvas = document.getElementById('teacherCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('penColor');
const clearBtn = document.getElementById('clearBtn');

// Toolbar buttons
const penToolBtn = document.getElementById('penToolBtn');
const textToolBtn = document.getElementById('textToolBtn');
const imgToolBtn = document.getElementById('imgToolBtn');

// Pagination elements
const prevPageBtn = document.querySelector('.pagination .page-btn:first-child');
const nextPageBtn = document.querySelector('.pagination .page-btn:last-child');
const pageText = document.querySelector('.page-text');

// Application Functional State Variables
let currentTool = 'pen'; // 'pen', 'text', 'img'
let isDrawing = false;

// Slide Deck System Variables
let boardsData = []; // Array storing dataURLs of screens
let currentBoardIndex = 0;

// Context Parameter Tuning
ctx.lineWidth = 4;
ctx.lineCap = 'round';
ctx.strokeStyle = colorPicker.value;

// ----------------------------------------------------
// 1. TOOL SELECTION MANAGEMENT
// ----------------------------------------------------
function setActiveTool(tool, activeBtn) {
  currentTool = tool;
  
  // Remove active styling from all toolbar tools
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  
  // Apply active styling to the chosen tool
  activeBtn.classList.add('active');
  
  // Update browser mouse cursor for visual feedback
  if (currentTool === 'text') {
    canvas.style.cursor = 'text';
  } else if (currentTool === 'img') {
    canvas.style.cursor = 'pointer';
  } else {
    canvas.style.cursor = 'crosshair';
  }
}

penToolBtn.addEventListener('click', () => setActiveTool('pen', penToolBtn));
textToolBtn.addEventListener('click', () => setActiveTool('text', textToolBtn));
imgToolBtn.addEventListener('click', () => setActiveTool('img', imgToolBtn));

colorPicker.addEventListener('input', (e) => {
  ctx.strokeStyle = e.target.value;
});

// ----------------------------------------------------
// 2. RENDERING ENGINE (PEN DRAWING)
// ----------------------------------------------------
canvas.addEventListener('mousedown', (e) => {
  if (currentTool !== 'pen') return;
  isDrawing = true;
  draw(e);
});

canvas.addEventListener('mouseup', () => {
  isDrawing = false;
  ctx.beginPath();
});

canvas.addEventListener('mouseout', () => {
  isDrawing = false;
  ctx.beginPath();
});

canvas.addEventListener('mousemove', draw);

// Helper function to track window scaling coordinates
function getCanvasCoordinates(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
    clientX: e.clientX,
    clientY: e.clientY
  };
}

function draw(e) {
  if (!isDrawing || currentTool !== 'pen') return;

  const coords = getCanvasCoordinates(e);

  ctx.lineTo(coords.x, coords.y);
  ctx.stroke();

  // BROADCAST BRUSHSTROKES LIVE TO STUDENTS
  channel.send({
    type: 'broadcast',
    event: 'draw',
    payload: { x: coords.x, y: coords.y, color: ctx.strokeStyle }
  });
  
  ctx.beginPath();
  ctx.moveTo(coords.x, coords.y);
}

// ----------------------------------------------------
// 3. INTERACTIVE TYPING (TEXT TOOL)
// ----------------------------------------------------
canvas.addEventListener('click', (e) => {
  if (currentTool !== 'text') return;

  if (document.querySelector('.canvas-text-input')) return;

  const coords = getCanvasCoordinates(e);
  const wrapper = canvas.parentElement;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'canvas-text-input';
  
  const wrapperRect = wrapper.getBoundingClientRect();
  input.style.left = `${coords.clientX - wrapperRect.left}px`;
  input.style.top = `${coords.clientY - wrapperRect.top}px`;
  
  wrapper.appendChild(input);
  input.focus();

  function finalizeText() {
    const textVal = input.value.trim();
    if (textVal) {
      ctx.font = 'bold 20px "Segoe UI", sans-serif';
      ctx.fillStyle = ctx.strokeStyle; 
      ctx.textBaseline = 'top';
      ctx.fillText(textVal, coords.x, coords.y);

      // BROADCAST STAMPED TEXT LIVE TO STUDENTS
      channel.send({
        type: 'broadcast',
        event: 'text',
        payload: { x: coords.x, y: coords.y, text: textVal, color: ctx.strokeStyle }
      });
    }
    input.remove();
  }

  input.addEventListener('blur', finalizeText);
  input.addEventListener('keydown', (keyEvent) => {
    if (keyEvent.key === 'Enter') finalizeText();
  });
});

// ----------------------------------------------------
// 4. MULTI-BOARD SLIDE PRESENTATION LOGIC
// ----------------------------------------------------
function updatePaginationUI() {
  pageText.textContent = `Board ${currentBoardIndex + 1} of ${Math.max(boardsData.length, 1)}`;
}

function saveCurrentBoardState() {
  boardsData[currentBoardIndex] = canvas.toDataURL();
}

function loadBoardState(index) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  updatePaginationUI();

  if (boardsData[index]) {
    const img = new Image();
    img.src = boardsData[index];
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
    };
  }
}

nextPageBtn.addEventListener('click', () => {
  saveCurrentBoardState();
  currentBoardIndex++;
  
  if (currentBoardIndex >= boardsData.length) {
    boardsData.push(''); 
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    updatePaginationUI();
  } else {
    loadBoardState(currentBoardIndex);
  }
  // Clear out student views whenever switching sheets
  channel.send({ type: 'broadcast', event: 'clear' });
});

prevPageBtn.addEventListener('click', () => {
  if (currentBoardIndex === 0) return; 
  
  saveCurrentBoardState();
  currentBoardIndex--;
  loadBoardState(currentBoardIndex);
  // Clear out student views whenever switching sheets
  channel.send({ type: 'broadcast', event: 'clear' });
});

clearBtn.addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // BROADCAST CANVAS CLEAR COMMAND TO STUDENTS
  channel.send({ type: 'broadcast', event: 'clear' });
});

boardsData[0] = canvas.toDataURL();
updatePaginationUI();

// ----------------------------------------------------
// 5. PDF GENERATION ENGINE
// ----------------------------------------------------
const exportBtn = document.getElementById('exportBtn');

exportBtn.addEventListener('click', async () => {
  saveCurrentBoardState();

  const { jsPDF } = window.jspdf;
  
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [1100, 520]
  });

  let pagesAdded = 0;

  for (let i = 0; i < boardsData.length; i++) {
    const boardSnapshot = boardsData[i];
    
    if (boardSnapshot) {
      if (pagesAdded > 0) {
        pdf.addPage([1100, 520], 'landscape');
      }
      
      pdf.addImage(boardSnapshot, 'PNG', 0, 0, 1100, 520);
      pagesAdded++;
    }
  }

  if (pagesAdded === 0) {
    pdf.addImage(canvas.toDataURL(), 'PNG', 0, 0, 1100, 520);
  }

  pdf.save('whiteboard-lesson-session.pdf');
});