/**
 * earth-scroll.js  —  Image Sequence Earth Zoom (Apple-style)
 * ═══════════════════════════════════════════════════════════════
 *
 * WHY IMAGE SEQUENCE?
 *   video.currentTime scrubbing requires the browser to decode
 *   video frames from the nearest keyframe — this adds 50-150ms
 *   latency per seek, causing the "choppy frames" feel.
 *
 *   Image sequence approach: pre-load all frames as <img> elements.
 *   canvas.drawImage(frame) is GPU-accelerated and completes in
 *   < 1ms — completely smooth at any scroll speed.
 *
 * SETUP (one-time):
 *   1. Open http://localhost:5173/extract-frames.html
 *   2. Click "Extract Frames" → wait for all 90 frames
 *   3. Click "Download ZIP" → extract earth-frames/ to public/
 *   4. Reload the portfolio — it will auto-detect and use frames
 *
 * FALLBACK:
 *   If public/earth-frames/ doesn't exist yet, falls back to
 *   video.currentTime scrubbing so the page isn't broken.
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  // ── CONFIG ────────────────────────────────────────────────────
  const FRAME_COUNT   = 90;         // Must match what extract-frames.html produced
  const FRAMES_PATH   = '/earth-frames/frame-';  // e.g. frame-001.jpg

  // Scroll physics
  const TOTAL_PX      = window.innerHeight * 3.5;
  const WHEEL_MULT    = 1.4;
  const TOUCH_MULT    = 3.0;
  const STIFFNESS     = 0.18;       // Spring pull strength
  const DAMPING       = 0.78;       // Spring friction

  // Phase thresholds (fraction of TOTAL_PX)
  const PHASE_START   = 0.08;       // 0–8%  = first page (no earth)
  const PHASE_FULL    = 0.16;       // 8–16% = earth fades in
  const ALT_MAX_KM    = 35_786;

  // ── DOM ───────────────────────────────────────────────────────
  const overlay     = document.getElementById('earth-scroll-section');
  const canvas      = document.getElementById('earth-canvas');
  const video       = document.getElementById('earth-video');   // fallback
  const scrollIndic = document.getElementById('scroll-indicator');
  const altDisplay  = document.getElementById('altitude-display');
  const altValue    = document.getElementById('alt-value');
  const planetTag   = document.getElementById('planet-tag');

  if (!overlay || !canvas) { console.warn('[earth-scroll] Missing elements'); return; }

  const ctx = canvas.getContext('2d');

  // ── STATE ─────────────────────────────────────────────────────
  let targetScroll = 0;
  let smoothScroll = 0;
  let velocity     = 0;
  let rafActive    = false;

  // Image sequence state
  const frames        = new Array(FRAME_COUNT);
  let   loadedCount   = 0;
  let   useFrames     = false;    // true once frames are ready
  let   frameCheckDone = false;   // did we already test if frames exist?

  // Video fallback state
  let videoReady    = false;
  let lastSeekTime  = -1;
  let lastFrameIdx  = -1;

  // ── CANVAS SIZING ─────────────────────────────────────────────
  function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', () => { resizeCanvas(); renderCurrentFrame(); }, { passive: true });

  // ── IMAGE SEQUENCE LOADING ────────────────────────────────────

  /**
   * Draw a frame from the image sequence — instant, GPU accelerated.
   * Uses cover-style scaling: fills canvas, centers, no distortion.
   */
  function drawFrame(img) {
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const cw = canvas.width, ch = canvas.height;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const scale = Math.max(cw / iw, ch / ih);
    const sw = iw * scale, sh = ih * scale;
    const ox = (cw - sw) / 2, oy = (ch - sh) / 2;
    ctx.drawImage(img, ox, oy, sw, sh);
  }

  /** Pre-load all FRAME_COUNT frames. Starts rendering as each arrives. */
  function loadFrames() {
    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      const n   = String(i + 1).padStart(3, '0');
      img.src   = `${FRAMES_PATH}${n}.jpg`;

      img.onload = () => {
        frames[i] = img;
        loadedCount++;
        if (!useFrames && loadedCount >= Math.min(10, FRAME_COUNT)) {
          // Start using frames as soon as 10 are ready (enough for early scroll)
          useFrames     = true;
          frameCheckDone = true;
          console.log('[earth-scroll] Image sequence active — buttery smooth!');
          renderCurrentFrame(); // draw frame 0 immediately
        }
      };

      img.onerror = () => {
        // First frame 404 = frames folder not present
        if (i === 0 && !frameCheckDone) {
          frameCheckDone = true;
          useFrames = false;
          console.warn('[earth-scroll] No image frames found — using video fallback.');
          console.info('[earth-scroll] For smooth rendering: open /extract-frames.html');
          // Show the video instead
          if (video) { video.style.display = 'block'; }
        }
      };

      frames[i] = img;
    }
  }

  loadFrames();

  // ── VIDEO FALLBACK ────────────────────────────────────────────

  function seekVideo(t) {
    if (!video || !videoReady || !video.duration) return;
    if (Math.abs(t - lastSeekTime) < 0.015) return;
    lastSeekTime = t;
    if (typeof video.fastSeek === 'function') video.fastSeek(t);
    else video.currentTime = t;
  }

  if (video) {
    video.pause();
    video.currentTime = 0;
    video.preload = 'auto';
    video.addEventListener('loadedmetadata', () => { videoReady = true; });
    if (video.readyState >= 1) videoReady = true;
  }

  // ── RENDER ────────────────────────────────────────────────────

  function renderCurrentFrame() {
    const raw = smoothScroll / TOTAL_PX;
    if (raw <= PHASE_START || !useFrames) return;

    const videoRange = 1 - PHASE_FULL;
    const videoT     = Math.max(0, (raw - PHASE_FULL) / videoRange);
    const idx        = Math.round(Math.min(videoT, 1) * (FRAME_COUNT - 1));

    if (idx === lastFrameIdx) return;  // no change
    lastFrameIdx = idx;
    if (frames[idx]?.complete && frames[idx].naturalWidth > 0) {
      drawFrame(frames[idx]);
    }
  }

  // ── STATE APPLICATION ─────────────────────────────────────────

  function applyState(raw) {
    // Phase 0: earth hidden
    if (raw <= PHASE_START) {
      overlay.style.opacity       = '0';
      overlay.style.pointerEvents = 'none';
      scrollIndic?.classList.remove('hidden');
      altDisplay?.classList.remove('visible');
      planetTag?.classList.remove('visible');
      if (useFrames) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        lastFrameIdx = -1;
      } else seekVideo(0);
      return;
    }

    // Phase 1: fade-in (cubic ease-in for dramatic entrance)
    const fadeT   = Math.min(1, (raw - PHASE_START) / (PHASE_FULL - PHASE_START));
    const opacity = fadeT * fadeT * fadeT;
    overlay.style.opacity       = opacity.toFixed(4);
    overlay.style.pointerEvents = opacity > 0.01 ? 'auto' : 'none';

    // Phase 2: video / frame progress
    const videoRange = 1 - PHASE_FULL;
    const videoT     = Math.max(0, (raw - PHASE_FULL) / videoRange);
    const clamped    = Math.min(videoT, 1);

    if (useFrames) {
      // IMAGE SEQUENCE — instant draw
      const idx = Math.round(clamped * (FRAME_COUNT - 1));
      if (idx !== lastFrameIdx) {
        lastFrameIdx = idx;
        if (frames[idx]?.complete && frames[idx].naturalWidth > 0) {
          drawFrame(frames[idx]);
        } else if (frames[idx]) {
          // Frame still loading — find nearest loaded frame
          for (let d = 1; d < 10; d++) {
            const lo = frames[idx - d], hi = frames[idx + d];
            if (hi?.complete && hi.naturalWidth > 0) { drawFrame(hi); break; }
            if (lo?.complete && lo.naturalWidth > 0) { drawFrame(lo); break; }
          }
        }
      }
    } else {
      // VIDEO FALLBACK
      if (video?.duration) seekVideo(clamped * video.duration);
    }

    // Altitude HUD
    if (altValue) {
      altValue.textContent = Math.round(ALT_MAX_KM * (1 - clamped)).toLocaleString('en-US');
    }

    // HUD toggles
    const started = raw > PHASE_FULL + 0.01;
    scrollIndic?.classList.toggle('hidden', started);
    altDisplay?.classList.toggle('visible', started);
    planetTag?.classList.toggle('visible', started);
  }

  // ── SPRING PHYSICS LOOP ───────────────────────────────────────

  function tick() {
    const force  = (targetScroll - smoothScroll) * STIFFNESS;
    velocity     = (velocity + force) * DAMPING;
    smoothScroll += velocity;
    smoothScroll  = Math.max(0, Math.min(TOTAL_PX, smoothScroll));

    applyState(smoothScroll / TOTAL_PX);

    if (Math.abs(velocity) < 0.2 && Math.abs(targetScroll - smoothScroll) < 0.2) {
      smoothScroll = targetScroll;
      applyState(smoothScroll / TOTAL_PX);
      rafActive = false;
      return;
    }
    requestAnimationFrame(tick);
  }

  function kickLoop() {
    if (!rafActive) { rafActive = true; requestAnimationFrame(tick); }
  }

  // ── INPUT: Wheel ──────────────────────────────────────────────
  window.addEventListener('wheel', (e) => {
    e.preventDefault();
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 20;
    if (e.deltaMode === 2) delta *= window.innerHeight;
    targetScroll += delta * WHEEL_MULT;
    targetScroll  = Math.max(0, Math.min(TOTAL_PX, targetScroll));
    kickLoop();
  }, { passive: false });

  // ── INPUT: Touch ──────────────────────────────────────────────
  let touchY = 0;
  window.addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    const dy = touchY - e.touches[0].clientY;
    touchY = e.touches[0].clientY;
    targetScroll += dy * TOUCH_MULT;
    targetScroll  = Math.max(0, Math.min(TOTAL_PX, targetScroll));
    kickLoop();
  }, { passive: true });

  // ── INPUT: Keyboard ───────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    let d = 0;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') d = 250;
    if (e.key === 'ArrowUp'   || e.key === 'PageUp')   d = -250;
    if (e.key === ' ')                                  d = e.shiftKey ? -250 : 250;
    if (!d) return;
    targetScroll += d;
    targetScroll  = Math.max(0, Math.min(TOTAL_PX, targetScroll));
    kickLoop();
  });

  // Initial state
  applyState(0);
  console.log('[earth-scroll] Loaded. Frames available:', useFrames ? 'YES (image sequence)' : 'NO (video fallback — run /extract-frames.html)');

})();
