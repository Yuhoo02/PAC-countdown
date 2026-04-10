const hoursInput = document.querySelector("#hoursInput");
const presetButtons = [...document.querySelectorAll(".preset-btn")];
const startBtn = document.querySelector("#startBtn");
const pauseBtn = document.querySelector("#pauseBtn");
const resetBtn = document.querySelector("#resetBtn");
const timeLabel = document.querySelector("#timeLabel");
const dotsLabel = document.querySelector("#dotsLabel");
const progressLabel = document.querySelector("#progressLabel");
const stageMessage = document.querySelector("#stageMessage");
const canvas = document.querySelector("#stageCanvas");
const zoomInBtn = document.querySelector("#zoomInBtn");
const zoomOutBtn = document.querySelector("#zoomOutBtn");
const zoomLabel = document.querySelector("#zoomLabel");
const ctx = canvas.getContext("2d");

const state = {
  totalSeconds: 0,
  remainingSeconds: 0,
  remainingMs: 0,
  endTime: 0,
  paused: true,
  pausedRemainingMs: 0,
  rafId: 0,
  dots: [],
  zoom: 1,
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 7;
const ZOOM_STEP = 1;

function syncButtonStates() {
  startBtn.disabled = !state.paused && state.remainingSeconds > 0;
  zoomOutBtn.disabled = state.zoom <= MIN_ZOOM;
  zoomInBtn.disabled = state.zoom >= MAX_ZOOM;
  zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const hours = String(Math.floor(safeSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((safeSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(safeSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function getSelectedSeconds() {
  const parsedHours = Number(hoursInput.value);

  if (!Number.isFinite(parsedHours) || parsedHours < 0.25) {
    return 0;
  }

  const normalizedHours = Math.round(parsedHours * 4) / 4;
  hoursInput.value = normalizedHours.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");

  return Math.round(normalizedHours * 3600);
}

function setPresetActive(hoursValue) {
  presetButtons.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.hours) === hoursValue);
  });
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width * ratio));
  const height = Math.max(320, Math.round(rect.height * ratio));

  canvas.width = width;
  canvas.height = height;

  if (state.totalSeconds > 0) {
    state.dots = buildDots(state.totalSeconds);
  }

  draw();
}

function buildDots(totalSeconds) {
  const horizontalPadding = 34;
  const verticalPadding = 34;
  const usableWidth = canvas.width - horizontalPadding * 2;
  const usableHeight = canvas.height - verticalPadding * 2;
  const aspect = usableWidth / usableHeight;
  const cols = Math.max(24, Math.ceil(Math.sqrt(totalSeconds * aspect)));
  const rows = Math.max(1, Math.ceil(totalSeconds / cols));
  const stepX = usableWidth / Math.max(cols - 1, 1);
  const stepY = usableHeight / Math.max(rows - 1, 1);

  return Array.from({ length: totalSeconds }, (_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const serpentineCol = row % 2 === 0 ? col : cols - 1 - col;
    const x = horizontalPadding + serpentineCol * stepX;
    const y = verticalPadding + row * stepY;
    return { x, y };
  });
}

function getElapsedMs() {
  return Math.max(0, state.totalSeconds * 1000 - state.remainingMs);
}

function getEatenDotsCount() {
  const elapsedMs = getElapsedMs();

  if (elapsedMs <= 0) {
    return 0;
  }

  return Math.min(state.dots.length, Math.floor(elapsedMs / 1000) + 1);
}

function drawBackgroundGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(85, 214, 255, 0.06)";
  ctx.lineWidth = 1;

  for (let x = 20; x < canvas.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 20; y < canvas.height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawDots() {
  const eatenDots = getEatenDotsCount();
  const dotRadius = state.totalSeconds > 10000 ? 1.2 : state.totalSeconds > 3000 ? 1.8 : 2.3;

  for (let index = 0; index < state.dots.length; index += 1) {
    const dot = state.dots[index];
    const isEaten = index < eatenDots;
    ctx.beginPath();
    ctx.fillStyle = isEaten ? "rgba(97, 115, 148, 0.16)" : "rgba(255, 243, 188, 0.94)";
    ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function getPacmanPosition() {
  if (!state.dots.length) {
    return null;
  }

  const elapsedMs = getElapsedMs();
  const traveledDots = Math.min(state.dots.length - 1, Math.max(0, elapsedMs / 1000));
  const currentIndex = Math.floor(traveledDots);
  const interpolation = traveledDots - currentIndex;
  const currentDot = state.dots[currentIndex];
  const nextDot = state.dots[Math.min(currentIndex + 1, state.dots.length - 1)];

  if (state.paused || state.remainingSeconds === 0) {
    const pausedAngle = Math.atan2(nextDot.y - currentDot.y, nextDot.x - currentDot.x) || 0;
    return {
      x: currentDot.x,
      y: currentDot.y,
      angle: pausedAngle,
      mouth: 0.25,
    };
  }

  const x = currentDot.x + (nextDot.x - currentDot.x) * interpolation;
  const y = currentDot.y + (nextDot.y - currentDot.y) * interpolation;
  const angle = Math.atan2(nextDot.y - currentDot.y, nextDot.x - currentDot.x);
  const mouth = 0.14 + Math.abs(Math.sin(Date.now() / 130)) * 0.28;

  return { x, y, angle, mouth };
}

function applyCameraTransform() {
  const pacman = getPacmanPosition();
  const zoom = state.zoom;

  if (!pacman || zoom === 1) {
    return;
  }

  const focusX = pacman.x;
  const focusY = pacman.y;
  const offsetX = canvas.width / 2 - focusX * zoom;
  const offsetY = canvas.height / 2 - focusY * zoom;
  const minOffsetX = canvas.width - canvas.width * zoom;
  const minOffsetY = canvas.height - canvas.height * zoom;
  const clampedOffsetX = Math.min(0, Math.max(minOffsetX, offsetX));
  const clampedOffsetY = Math.min(0, Math.max(minOffsetY, offsetY));

  ctx.translate(clampedOffsetX, clampedOffsetY);
  ctx.scale(zoom, zoom);
}

function getCameraState() {
  const pacman = getPacmanPosition();
  const zoom = state.zoom;

  if (!pacman) {
    return {
      zoom,
      offsetX: 0,
      offsetY: 0,
      focusX: 0,
      focusY: 0,
    };
  }

  if (zoom === 1) {
    return {
      zoom,
      offsetX: 0,
      offsetY: 0,
      focusX: pacman.x,
      focusY: pacman.y,
    };
  }

  const offsetX = canvas.width / 2 - pacman.x * zoom;
  const offsetY = canvas.height / 2 - pacman.y * zoom;
  const minOffsetX = canvas.width - canvas.width * zoom;
  const minOffsetY = canvas.height - canvas.height * zoom;

  return {
    zoom,
    offsetX: Math.min(0, Math.max(minOffsetX, offsetX)),
    offsetY: Math.min(0, Math.max(minOffsetY, offsetY)),
    focusX: pacman.x,
    focusY: pacman.y,
  };
}

function drawPacman() {
  const pacman = getPacmanPosition();

  if (!pacman) {
    return;
  }

  ctx.save();
  ctx.translate(pacman.x, pacman.y);
  ctx.rotate(pacman.angle);
  ctx.fillStyle = "#ffcb2f";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 12, pacman.mouth, Math.PI * 2 - pacman.mouth);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Keep the eye on the upper side of the sprite so Pac-Man doesn't look flipped on reverse rows.
  const eyeX = pacman.x + Math.cos(pacman.angle - Math.PI / 2) * 5;
  const eyeY = pacman.y + Math.sin(pacman.angle - Math.PI / 2) * 5;

  ctx.save();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBanner() {
  ctx.save();
  ctx.fillStyle = "rgba(8, 16, 30, 0.78)";
  ctx.fillRect(16, canvas.height - 58, 272, 42);
  ctx.strokeStyle = "rgba(85, 214, 255, 0.18)";
  ctx.strokeRect(16, canvas.height - 58, 272, 42);
  ctx.fillStyle = "#f7f4df";
  ctx.font = `${Math.max(14, Math.round(canvas.width / 72))}px "Space Grotesk", sans-serif`;
  ctx.fillText(`DOTS LEFT ${formatNumber(state.remainingSeconds)}`, 30, canvas.height - 31);
  ctx.restore();
}

function drawMiniMap() {
  if (state.zoom <= 1 || !state.dots.length) {
    return;
  }

  const mapWidth = Math.min(440, canvas.width * 0.38);
  const mapHeight = Math.min(264, canvas.height * 0.38);
  const insetPadding = 16;
  const mapX = canvas.width - mapWidth - insetPadding;
  const mapY = canvas.height - mapHeight - insetPadding;
  const scaleX = mapWidth / canvas.width;
  const scaleY = mapHeight / canvas.height;
  const pacman = getPacmanPosition();
  const camera = getCameraState();
  const viewportWidth = canvas.width / state.zoom;
  const viewportHeight = canvas.height / state.zoom;
  const worldX = -camera.offsetX / state.zoom;
  const worldY = -camera.offsetY / state.zoom;

  ctx.save();
  ctx.fillStyle = "rgba(3, 8, 18, 0.88)";
  ctx.fillRect(mapX, mapY, mapWidth, mapHeight);
  ctx.strokeStyle = "rgba(85, 214, 255, 0.28)";
  ctx.lineWidth = 1;
  ctx.strokeRect(mapX, mapY, mapWidth, mapHeight);

  const eatenDots = getEatenDotsCount();
  const miniDotRadius = Math.max(0.7, Math.min(scaleX, scaleY) * 1.8);

  for (let index = 0; index < state.dots.length; index += 1) {
    const dot = state.dots[index];
    ctx.beginPath();
    ctx.fillStyle = index < eatenDots ? "rgba(83, 103, 134, 0.32)" : "rgba(255, 240, 170, 0.9)";
    ctx.arc(mapX + dot.x * scaleX, mapY + dot.y * scaleY, miniDotRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(255, 203, 47, 0.95)";
  ctx.lineWidth = 2;
  ctx.strokeRect(
    mapX + worldX * scaleX,
    mapY + worldY * scaleY,
    viewportWidth * scaleX,
    viewportHeight * scaleY
  );

  if (pacman) {
    ctx.beginPath();
    ctx.fillStyle = "#ffcb2f";
    ctx.arc(mapX + pacman.x * scaleX, mapY + pacman.y * scaleY, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.font = '11px "Space Grotesk", sans-serif';
  ctx.fillText("FULL MAP", mapX + 10, mapY + 16);
  ctx.restore();
}

function draw(now = performance.now()) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  applyCameraTransform();
  drawBackgroundGrid();
  drawDots();
  drawPacman();
  ctx.restore();
  drawBanner();
  drawMiniMap();
}

function syncStats() {
  timeLabel.textContent = formatTime(state.remainingSeconds);
  dotsLabel.textContent = formatNumber(state.remainingSeconds);

  const progress =
    state.totalSeconds > 0
      ? Math.round(((state.totalSeconds - state.remainingSeconds) / state.totalSeconds) * 100)
      : 0;

  progressLabel.textContent = `${progress}%`;
}

function updateStageMessage(message) {
  stageMessage.textContent = message;
}

function animate(now) {
  let shouldContinue = !state.paused;

  if (!state.paused) {
    state.remainingMs = Math.max(0, state.endTime - Date.now());
    state.remainingSeconds = Math.ceil(state.remainingMs / 1000);

    if (state.remainingMs <= 0) {
      state.remainingSeconds = 0;
      state.remainingMs = 0;
      state.paused = true;
      state.pausedRemainingMs = 0;
      shouldContinue = false;
      updateStageMessage("카운트다운 완료. 팩맨이 모든 점을 먹었습니다.");
    }

    syncStats();
    syncButtonStates();
  }

  draw(now);

  if (shouldContinue) {
    state.rafId = requestAnimationFrame(animate);
  }
}

function initializeTimer(totalSeconds) {
  state.totalSeconds = totalSeconds;
  state.remainingSeconds = totalSeconds;
  state.remainingMs = totalSeconds * 1000;
  state.pausedRemainingMs = totalSeconds * 1000;
  state.dots = buildDots(totalSeconds);
  syncStats();
  syncButtonStates();
  draw();
}

function startCountdown() {
  const selectedSeconds = getSelectedSeconds();

  if (!selectedSeconds) {
    updateStageMessage("0보다 큰 시간을 입력해 주세요.");
    hoursInput.focus();
    return;
  }

  cancelAnimationFrame(state.rafId);

  const isFreshStart = state.totalSeconds !== selectedSeconds || state.remainingSeconds === 0;

  if (isFreshStart) {
    initializeTimer(selectedSeconds);
  }

  state.paused = false;
  state.endTime = Date.now() + state.pausedRemainingMs;

  updateStageMessage(`${formatTime(state.remainingSeconds)} 동안 팩맨이 점을 먹는 중입니다.`);
  syncButtonStates();
  state.rafId = requestAnimationFrame(animate);
}

function pauseCountdown() {
  if (state.paused) {
    return;
  }

  state.paused = true;
  state.pausedRemainingMs = Math.max(0, state.endTime - Date.now());
  state.remainingMs = state.pausedRemainingMs;
  state.remainingSeconds = Math.ceil(state.pausedRemainingMs / 1000);
  syncStats();
  syncButtonStates();
  draw();
  updateStageMessage("일시정지 상태입니다. 다시 시작하면 이어서 진행됩니다.");
}

function resetCountdown() {
  cancelAnimationFrame(state.rafId);

  const selectedSeconds = getSelectedSeconds();
  state.paused = true;
  state.endTime = 0;
  state.pausedRemainingMs = selectedSeconds * 1000;
  initializeTimer(selectedSeconds);

  updateStageMessage("시간을 고르고 시작 버튼을 눌러 주세요.");
  syncButtonStates();
}

function changeZoom(direction) {
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom + direction * ZOOM_STEP));

  if (nextZoom === state.zoom) {
    return;
  }

  state.zoom = nextZoom;
  syncButtonStates();
  draw();
}

startBtn.addEventListener("click", startCountdown);
pauseBtn.addEventListener("click", pauseCountdown);
resetBtn.addEventListener("click", resetCountdown);
zoomInBtn.addEventListener("click", () => changeZoom(1));
zoomOutBtn.addEventListener("click", () => changeZoom(-1));

presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const hoursValue = Number(button.dataset.hours);
    hoursInput.value = String(hoursValue);
    setPresetActive(hoursValue);
    resetCountdown();
  });
});

hoursInput.addEventListener("input", () => {
  setPresetActive(Number(hoursInput.value));
});

window.addEventListener("resize", resizeCanvas);

initializeTimer(getSelectedSeconds());
resizeCanvas();
