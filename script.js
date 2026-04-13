const manualHourInput = document.querySelector("#manualHourInput");
const manualMinuteInput = document.querySelector("#manualMinuteInput");
const presetButtons = [...document.querySelectorAll(".preset-btn")];
const clockButtons = [...document.querySelectorAll(".clock-btn")];
const startBtn = document.querySelector("#startBtn");
const pauseBtn = document.querySelector("#pauseBtn");
const resetBtn = document.querySelector("#resetBtn");
const manualModeBtn = document.querySelector("#manualModeBtn");
const clockModeBtn = document.querySelector("#clockModeBtn");
const manualPresetGroup = document.querySelector("#manualPresetGroup");
const clockPresetGroup = document.querySelector("#clockPresetGroup");
const clockTimeGroup = document.querySelector("#clockTimeGroup");
const fieldGroup = document.querySelector(".field-group");
const targetHourInput = document.querySelector("#targetHourInput");
const targetMinuteInput = document.querySelector("#targetMinuteInput");
const timeLabel = document.querySelector("#timeLabel");
const dotsLabel = document.querySelector("#dotsLabel");
const progressLabel = document.querySelector("#progressLabel");
const stageMessage = document.querySelector("#stageMessage");
const canvas = document.querySelector("#stageCanvas");
const zoomInBtn = document.querySelector("#zoomInBtn");
const zoomOutBtn = document.querySelector("#zoomOutBtn");
const zoomLabel = document.querySelector("#zoomLabel");
const speedButtons = [...document.querySelectorAll(".speed-btn")];
const toggleSettingsBtn = document.querySelector("#toggleSettingsBtn");
const clearModal = document.querySelector("#clearModal");
const clearCloseBtn = document.querySelector("#clearCloseBtn");
const lunchModal = document.querySelector("#lunchModal");
const lunchCloseBtn = document.querySelector("#lunchCloseBtn");
const ctx = canvas.getContext("2d");

const state = {
  mode: "clock",
  targetHour: 17,
  targetMinute: 0,
  manualPresetSeconds: null,
  speed: 1,
  settingsCollapsed: false,
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
const LUNCH_MODAL_STORAGE_KEY = "pac-countdown-lunch-modal-date";

function syncButtonStates() {
  document.body.dataset.settingsCollapsed = String(state.settingsCollapsed);
  startBtn.disabled = !state.paused && state.remainingSeconds > 0;
  pauseBtn.disabled = state.paused || state.remainingSeconds === 0;
  resetBtn.disabled = state.totalSeconds === 0 || state.remainingSeconds === state.totalSeconds;
  zoomOutBtn.disabled = state.zoom <= MIN_ZOOM;
  zoomInBtn.disabled = state.zoom >= MAX_ZOOM;
  zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
  toggleSettingsBtn.setAttribute("aria-expanded", String(!state.settingsCollapsed));

  speedButtons.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.speed) === state.speed);
  });
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

function getTargetDate(targetHour, targetMinute) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(targetHour, targetMinute, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  return target;
}

function updateModeUI() {
  const isManual = state.mode === "manual";
  document.body.dataset.mode = state.mode;
  manualModeBtn.classList.toggle("active", isManual);
  clockModeBtn.classList.toggle("active", !isManual);
  fieldGroup.classList.toggle("hidden", !isManual);
  manualPresetGroup.classList.toggle("hidden", !isManual);
  clockPresetGroup.classList.toggle("hidden", isManual);
  clockTimeGroup.classList.toggle("hidden", isManual);
  manualHourInput.disabled = !isManual;
  manualMinuteInput.disabled = !isManual;
  targetHourInput.disabled = isManual;
  targetMinuteInput.disabled = isManual;
  targetHourInput.value = String(state.targetHour);
  targetMinuteInput.value = String(state.targetMinute).padStart(2, "0");

  clockButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      Number(button.dataset.targetHour) === state.targetHour && state.targetMinute === 0
    );
  });
}

function getSelectedSeconds() {
  if (state.mode === "clock") {
    const safeHour = Math.min(23, Math.max(0, Number(targetHourInput.value) || 0));
    const normalizedMinute = Math.min(59, Math.max(0, Number(targetMinuteInput.value) || 0));
    state.targetHour = safeHour;
    state.targetMinute = normalizedMinute;
    targetHourInput.value = String(safeHour);
    targetMinuteInput.value = String(normalizedMinute).padStart(2, "0");
    const targetDate = getTargetDate(state.targetHour, state.targetMinute);
    return Math.max(0, Math.round((targetDate.getTime() - Date.now()) / 1000));
  }

  const safeHour = Math.min(23, Math.max(0, Number(manualHourInput.value) || 0));
  const normalizedMinute = Math.min(59, Math.max(0, Number(manualMinuteInput.value) || 0));

  manualHourInput.value = String(safeHour);
  manualMinuteInput.value = String(normalizedMinute).padStart(2, "0");

  if (state.manualPresetSeconds !== null) {
    return state.manualPresetSeconds;
  }

  const totalMinutes = safeHour * 60 + normalizedMinute;

  if (totalMinutes < 1) {
    return 0;
  }

  return totalMinutes * 60;
}

function setPresetActive(secondsValue) {
  presetButtons.forEach((button) => {
    if (button.classList.contains("clock-btn")) {
      return;
    }

    button.classList.toggle("active", Number(button.dataset.seconds) === secondsValue);
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
    state.dots = buildDots(getTotalDotCount());
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

function getTotalDotCount() {
  return Math.max(1, state.totalSeconds * state.speed);
}

function getProgressRatio() {
  if (state.totalSeconds <= 0) {
    return 0;
  }

  return Math.min(1, getElapsedMs() / (state.totalSeconds * 1000));
}

function hasCountdownStarted() {
  return !state.paused || state.remainingMs < state.totalSeconds * 1000;
}

function getLeadPoint() {
  const firstDot = state.dots[0];
  const secondDot = state.dots[1];
  const stagePadding = 34;

  if (!firstDot) {
    return { x: stagePadding, y: stagePadding };
  }

  if (!secondDot) {
    return { x: Math.max(stagePadding, firstDot.x - 24), y: firstDot.y };
  }

  return {
    x: Math.max(stagePadding, Math.min(canvas.width - stagePadding, firstDot.x - (secondDot.x - firstDot.x))),
    y: Math.max(stagePadding, Math.min(canvas.height - stagePadding, firstDot.y - (secondDot.y - firstDot.y))),
  };
}

function getEatenDotsCount() {
  const startedOffset = hasCountdownStarted() ? 1 : 0;
  return Math.min(state.dots.length, Math.floor(getProgressRatio() * state.dots.length) + startedOffset);
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
    return {
      x: 34,
      y: 34,
      angle: 0,
      mouth: 0.25,
    };
  }

  const leadPoint = getLeadPoint();
  const totalSegments = state.dots.length;
  const startedOffset = hasCountdownStarted() ? 1 : 0;
  const traveledSegments = Math.min(
    totalSegments,
    Math.max(0, getProgressRatio() * totalSegments + startedOffset)
  );

  if (traveledSegments >= totalSegments) {
    const lastDot = state.dots[state.dots.length - 1];
    const previousDot = state.dots[state.dots.length - 2] ?? leadPoint;
    const completedAngle = Math.atan2(lastDot.y - previousDot.y, lastDot.x - previousDot.x) || 0;

    return {
      x: lastDot.x,
      y: lastDot.y,
      angle: completedAngle,
      mouth: 0.25,
    };
  }

  const segmentIndex = Math.floor(traveledSegments);
  const interpolation = traveledSegments - segmentIndex;
  const currentDot = segmentIndex === 0 ? leadPoint : state.dots[segmentIndex - 1];
  const nextDot = state.dots[segmentIndex];

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

function drawStageTimeOverlay() {
  if (state.totalSeconds <= 0) {
    return;
  }

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const overlayWidth = Math.min(canvas.width * 0.54, 520);
  const overlayHeight = Math.min(canvas.height * 0.18, 120);
  const radius = 18;
  const left = centerX - overlayWidth / 2;
  const top = centerY - overlayHeight / 2;
  const gradient = ctx.createRadialGradient(centerX, centerY, overlayHeight * 0.12, centerX, centerY, overlayWidth * 0.56);

  gradient.addColorStop(0, "rgba(3, 8, 18, 0.36)");
  gradient.addColorStop(0.58, "rgba(3, 8, 18, 0.18)");
  gradient.addColorStop(1, "rgba(3, 8, 18, 0)");

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(left + radius, top);
  ctx.lineTo(left + overlayWidth - radius, top);
  ctx.quadraticCurveTo(left + overlayWidth, top, left + overlayWidth, top + radius);
  ctx.lineTo(left + overlayWidth, top + overlayHeight - radius);
  ctx.quadraticCurveTo(
    left + overlayWidth,
    top + overlayHeight,
    left + overlayWidth - radius,
    top + overlayHeight
  );
  ctx.lineTo(left + radius, top + overlayHeight);
  ctx.quadraticCurveTo(left, top + overlayHeight, left, top + overlayHeight - radius);
  ctx.lineTo(left, top + radius);
  ctx.quadraticCurveTo(left, top, left + radius, top);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.shadowColor = "rgba(3, 8, 18, 0.34)";
  ctx.shadowBlur = 52;
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.max(42, Math.round(canvas.width / 15))}px "Space Grotesk", sans-serif`;
  ctx.fillStyle = "rgba(247, 244, 223, 0.34)";
  ctx.shadowColor = "rgba(255, 255, 255, 0.18)";
  ctx.shadowBlur = 30;
  ctx.fillText(formatTime(state.remainingSeconds), centerX, centerY);
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
  drawStageTimeOverlay();
  drawMiniMap();
}

function syncStats() {
  const dotsLeft = Math.max(0, state.dots.length - getEatenDotsCount());

  if (timeLabel) {
    timeLabel.textContent = formatTime(state.remainingSeconds);
  }

  dotsLabel.textContent = formatNumber(dotsLeft);

  const progress =
    state.totalSeconds > 0
      ? Math.round(((state.totalSeconds - state.remainingSeconds) / state.totalSeconds) * 100)
      : 0;

  progressLabel.textContent = `${progress}%`;
}

function updateStageMessage(message) {
  stageMessage.textContent = message;
}

function showClearModal() {
  clearModal.classList.remove("hidden");
}

function hideClearModal() {
  clearModal.classList.add("hidden");
}

function hideLunchModal() {
  lunchModal.classList.add("hidden");
}

function showLunchModal() {
  lunchModal.classList.remove("hidden");
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function maybeShowLunchModal(now = new Date()) {
  if (now.getHours() !== 12 || now.getMinutes() !== 0) {
    return;
  }

  const todayKey = getLocalDateKey(now);

  if (window.localStorage.getItem(LUNCH_MODAL_STORAGE_KEY) === todayKey) {
    return;
  }

  showLunchModal();
  window.localStorage.setItem(LUNCH_MODAL_STORAGE_KEY, todayKey);
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
      showClearModal();
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
  state.dots = buildDots(getTotalDotCount());
  syncStats();
  syncButtonStates();
  draw();
}

function startCountdown() {
  const hasActiveProgress = state.paused && state.remainingSeconds > 0 && state.remainingSeconds < state.totalSeconds;

  if (hasActiveProgress && state.mode === "manual") {
    cancelAnimationFrame(state.rafId);
    hideClearModal();
    state.paused = false;
    state.endTime = Date.now() + state.pausedRemainingMs;

    updateStageMessage(
      state.mode === "clock"
        ? `${String(state.targetHour).padStart(2, "0")}:${String(state.targetMinute).padStart(2, "0")}까지 다시 진행합니다.`
        : `${formatTime(state.remainingSeconds)} 동안 다시 진행합니다.`
    );
    syncButtonStates();
    state.rafId = requestAnimationFrame(animate);
    return;
  }

  const selectedSeconds = getSelectedSeconds();

  if (hasActiveProgress && state.mode === "clock" && selectedSeconds > 0 && selectedSeconds < state.totalSeconds) {
    cancelAnimationFrame(state.rafId);
    hideClearModal();
    state.pausedRemainingMs = selectedSeconds * 1000;
    state.remainingMs = state.pausedRemainingMs;
    state.remainingSeconds = selectedSeconds;
    state.paused = false;
    state.endTime = Date.now() + state.pausedRemainingMs;

    updateStageMessage(
      `${String(state.targetHour).padStart(2, "0")}:${String(state.targetMinute).padStart(2, "0")}까지 다시 진행합니다.`
    );
    syncStats();
    syncButtonStates();
    draw();
    state.rafId = requestAnimationFrame(animate);
    return;
  }

  if (!selectedSeconds) {
    updateStageMessage(
      state.mode === "manual" ? "0.25시간 이상 입력해 주세요." : "목표 시간을 다시 선택해 주세요."
    );
    if (state.mode === "manual") {
      manualHourInput.focus();
    }
    return;
  }

  cancelAnimationFrame(state.rafId);

  const isFreshStart = state.totalSeconds !== selectedSeconds || state.remainingSeconds === 0;

  if (isFreshStart) {
    initializeTimer(selectedSeconds);
  }

  hideClearModal();
  state.paused = false;
  state.endTime = Date.now() + state.pausedRemainingMs;

  updateStageMessage(
    state.mode === "clock"
      ? `${String(state.targetHour).padStart(2, "0")}:${String(state.targetMinute).padStart(2, "0")}까지 진행 중입니다.`
      : `${formatTime(state.remainingSeconds)} 동안 팩맨이 점을 먹는 중입니다.`
  );
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
  hideClearModal();
  state.paused = true;
  state.endTime = 0;
  state.pausedRemainingMs = selectedSeconds * 1000;
  initializeTimer(selectedSeconds);

  updateStageMessage("시간을 고르고 시작 버튼을 눌러 주세요.");
  syncButtonStates();
}

function setMode(mode) {
  hideClearModal();
  state.mode = mode;
  updateModeUI();
  resetCountdown();
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

function changeSpeed(nextSpeed) {
  if (nextSpeed === state.speed) {
    return;
  }

  state.speed = nextSpeed;
  state.dots = buildDots(getTotalDotCount());
  syncStats();
  syncButtonStates();
  draw();
}

function toggleSettingsPanel() {
  state.settingsCollapsed = !state.settingsCollapsed;
  syncButtonStates();
  resizeCanvas();
}

startBtn.addEventListener("click", startCountdown);
pauseBtn.addEventListener("click", pauseCountdown);
resetBtn.addEventListener("click", resetCountdown);
zoomInBtn.addEventListener("click", () => changeZoom(1));
zoomOutBtn.addEventListener("click", () => changeZoom(-1));
toggleSettingsBtn.addEventListener("click", toggleSettingsPanel);
manualModeBtn.addEventListener("click", () => setMode("manual"));
clockModeBtn.addEventListener("click", () => setMode("clock"));
clearCloseBtn.addEventListener("click", hideClearModal);
clearModal.addEventListener("click", (event) => {
  if (event.target === clearModal || event.target.classList.contains("clear-modal-backdrop")) {
    hideClearModal();
  }
});
lunchCloseBtn.addEventListener("click", hideLunchModal);
lunchModal.addEventListener("click", (event) => {
  if (event.target === lunchModal || event.target.classList.contains("clear-modal-backdrop")) {
    hideLunchModal();
  }
});
speedButtons.forEach((button) => {
  button.addEventListener("click", () => {
    changeSpeed(Number(button.dataset.speed));
  });
});

presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.classList.contains("clock-btn")) {
      return;
    }

    const presetSeconds = Number(button.dataset.seconds);
    const totalMinutes = Math.floor(presetSeconds / 60);
    const nextHours = Math.floor(totalMinutes / 60);
    const nextMinutes = totalMinutes % 60;
    state.manualPresetSeconds = presetSeconds;
    manualHourInput.value = String(nextHours);
    manualMinuteInput.value = String(nextMinutes).padStart(2, "0");
    setPresetActive(presetSeconds);
    resetCountdown();
  });
});

clockButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.targetHour = Number(button.dataset.targetHour);
    state.targetMinute = 0;
    updateModeUI();
    resetCountdown();
  });
});

targetHourInput.addEventListener("input", () => {
  state.targetHour = Math.min(23, Math.max(0, Number(targetHourInput.value) || 0));
  updateModeUI();
});

targetMinuteInput.addEventListener("input", () => {
  state.targetMinute = Math.min(59, Math.max(0, Number(targetMinuteInput.value) || 0));
  updateModeUI();
});

manualHourInput.addEventListener("input", () => {
  state.manualPresetSeconds = null;
  setPresetActive(-1);
});

manualMinuteInput.addEventListener("input", () => {
  state.manualPresetSeconds = null;
  setPresetActive(-1);
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("load", resizeCanvas);

initializeTimer(getSelectedSeconds());
updateModeUI();
resizeCanvas();
requestAnimationFrame(resizeCanvas);
maybeShowLunchModal();
window.setInterval(() => maybeShowLunchModal(), 1000);
