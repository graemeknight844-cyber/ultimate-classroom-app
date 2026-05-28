const SUPABASE_URL = "https://wfnwjkuojshozhtnlror.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pQvC4ZJv7e9-AL2lkp6upw_xpYa2twv";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const canvas = document.getElementById('pupilCanvas');
const ctx = canvas.getContext('2d');
const statusBar = document.getElementById('statusBar');

ctx.lineWidth = 4;
ctx.lineCap = 'round';

const channel = supabase.channel('room_8492', {
  config: { broadcast: { self: false } } 
});

channel
  .on('broadcast', { event: 'draw' }, ({ payload }) => {
    ctx.strokeStyle = payload.color;
    ctx.lineTo(payload.x, payload.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(payload.x, payload.y);
  })
  .on('broadcast', { event: 'image-drop' }, ({ payload }) => {
    const studentImg = new Image();
    studentImg.onload = () => {
      ctx.drawImage(studentImg, payload.x, payload.y, payload.width, payload.height);
    };
    studentImg.src = payload.dataUrl;
  })
  .on('broadcast', { event: 'clear' }, () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath(); 
  })
  .on('broadcast', { event: 'text' }, ({ payload }) => {
    ctx.font = 'bold 20px "Segoe UI", sans-serif';
    ctx.fillStyle = payload.color;
    ctx.textBaseline = 'top';
    ctx.fillText(payload.text, payload.x, payload.y);
    ctx.beginPath();
  })
  .on('broadcast', { event: 'timer-tick' }, ({ payload }) => {
    const mins = Math.floor(payload.seconds / 60).toString().padStart(2, '0');
    const secs = (payload.seconds % 60).toString().padStart(2, '0');
    statusBar.textContent = `Live Lesson - Time Remaining: ${mins}:${secs}`;
  })
  .on('broadcast', { event: 'freeze-state' }, ({ payload }) => {
    if (payload.isFrozen) {
      statusBar.textContent = "CLASSROOM FROZEN BY TEACHER";
      statusBar.style.backgroundColor = "#ff9999";
      canvas.style.opacity = "0.2"; 
    } else {
      statusBar.textContent = "Connected Live to Room 8492";
      statusBar.style.backgroundColor = "#BFEA7C";
      canvas.style.opacity = "1.0";
    }
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      statusBar.textContent = "Connected Live to Room 8492";
      statusBar.style.backgroundColor = "#BFEA7C"; 
      statusBar.style.color = "#333";
    }
  });