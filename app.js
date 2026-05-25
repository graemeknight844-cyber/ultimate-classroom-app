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
  
  ctx.beginPath();
  ctx.moveTo(coords.x, coords.y);
}

// ----------------------------------------------------
// 3. INTERACTIVE TYPING (TEXT TOOL)
// ----------------------------------------------------
canvas.addEventListener('click', (e) => {
  if (currentTool !== 'text') return;

  // Prevent multiple overlapping inputs from opening simultaneously
  if (document.querySelector('.canvas-text-input')) return;

  const coords = getCanvasCoordinates(e);
  const wrapper = canvas.parentElement;

  // Create standard text entry element dynamically
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'canvas-text-input';
  
  // Position input box accurately relative to viewport bounding box layout offsets
  const wrapperRect = wrapper.getBoundingClientRect();
  input.style.left = `${coords.clientX - wrapperRect.left}px`;
  input.style.top = `${coords.clientY - wrapperRect.top}px`;
  
  wrapper.appendChild(input);
  input.focus();

  // Commit text text permanently directly to HTML5 canvas matrix context
  function finalizeText() {
    const textVal = input.value.trim();
    if (textVal) {
      ctx.font = 'bold 20px "Segoe UI", sans-serif';
      ctx.fillStyle = ctx.strokeStyle; // Match the current brush color choice
      ctx.textBaseline = 'top';
      ctx.fillText(textVal, coords.x, coords.y);
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
  
  // If moving past the end of existing slides, generate a clean sheet
  if (currentBoardIndex >= boardsData.length) {
    boardsData.push(''); 
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    updatePaginationUI();
  } else {
    loadBoardState(currentBoardIndex);
  }
});

prevPageBtn.addEventListener('click', () => {
  if (currentBoardIndex === 0) return; // Boundary limit check
  
  saveCurrentBoardState();
  currentBoardIndex--;
  loadBoardState(currentBoardIndex);
});

clearBtn.addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// Initialize first board state in historical tracking array index
boardsData[0] = canvas.toDataURL();
updatePaginationUI();

// ----------------------------------------------------
// 5. PDF GENERATION ENGINE
// ----------------------------------------------------
const exportBtn = document.getElementById('exportBtn');

exportBtn.addEventListener('click', async () => {
  // 1. Force save the current active board so edits aren't lost
  saveCurrentBoardState();

  // 2. Access the jsPDF library elements
  const { jsPDF } = window.jspdf;
  
  // 3. Initialize a landscape document matching your canvas size perfectly
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [1100, 520]
  });

  let pagesAdded = 0;

  // 4. Loop through the stored snapshot arrays
  for (let i = 0; i < boardsData.length; i++) {
    const boardSnapshot = boardsData[i];
    
    // Only compile pages that have data or aren't completely empty strings
    if (boardSnapshot) {
      // If it isn't the first page being analyzed, insert a fresh layout slide first
      if (pagesAdded > 0) {
        pdf.addPage([1100, 520], 'landscape');
      }
      
      // Stamp the whiteboard canvas image directly onto the current PDF page
      pdf.addImage(boardSnapshot, 'PNG', 0, 0, 1100, 520);
      pagesAdded++;
    }
  }

  // 5. Fallback safety check: if everything was blank, just grab the active canvas view
  if (pagesAdded === 0) {
    pdf.addImage(canvas.toDataURL(), 'PNG', 0, 0, 1100, 520);
  }

  // 6. Push the file to the browser to execute download execution
  pdf.save('whiteboard-lesson-session.pdf');
});into hg