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

const channel = supabaseClient ? supabaseClient.channel('room_8492') : null;
if (channel) {
  channel
    .on('broadcast', { event: 'submit-answer' }, ({ payload }) => { handleIncomingStudentAnswer(payload); })
    .subscribe();
}

// DOM Element Declarations
const canvas = document.getElementById('teacherCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const colorPicker = document.getElementById('penColor') || { value: '#333333' };
const clearBtn = document.getElementById('clearBtn');
const undoBtn = document.getElementById('undoBtn'); // New Undo Element Link

// Toolbar buttons
const penToolBtn = document.getElementById('penToolBtn');
const textToolBtn = document.getElementById('textToolBtn');
const imgToolBtn = document.getElementById('imgToolBtn');
const rubberToolBtn = document.getElementById('rubberToolBtn');

// Sizing Sliders
const sizeThicknessSlider = document.getElementById('penThickness') || { value: 4 };
const textSizeSlider = document.getElementById('textSizeSelector') || { value: 24 };

// Pagination elements
const prevPageBtn = document.querySelector('.pagination .page-btn:first-child');
const nextPageBtn = document.querySelector('.pagination .page-btn:last-child');
const pageText = document.querySelector('.page-text');

// Utility Elements
const timerDisplay = document.querySelector('.timer');
const freezeBtn = document.getElementById('freezeBtn');
const signOutBtn = document.querySelector('.sign-out'); 

// ============================================================================
// APPLICATION STATE & SESSION HISTORY MEMORY
// ============================================================================
let currentTool = 'pen'; 
let isDrawing = false;
let classIsFrozen = false;
let countdownInterval;
let totalSeconds = 300; 

// Multi-Board Sessional Memory Storage Arrays
let boardsData = []; 
let currentBoardIndex = 0;
let studentSubmissionsHistory = [{}]; // Tracks pupil submittals index-by-index
let canvasHistory = []; // Timeline tracking system for undo operations

if (ctx) {
  ctx.lineWidth = sizeThicknessSlider.value;
  ctx.lineCap = 'round';
  ctx.strokeStyle = colorPicker.value;
}

// History Engine Core Helper
function pushToHistory() {
  if (!canvas) return;
  canvasHistory.push(canvas.toDataURL());
  if (canvasHistory.length > 30) canvasHistory.shift(); // Limit memory footprint footprint to 30 steps
}

// ============================================================================
// DRAG & RESIZE VECTOR CORE ENGINE
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

// BAKING ENGINE: Flattens movable DOM items accurately onto the underlying canvas layout
function bakeFloatingObjects() {
  if (!canvas || !ctx) return;
  const wrapper = canvas.parentElement;
  const floatingObjects = wrapper.querySelectorAll('.floating-canvas-object