const canvas = document.getElementById('starfield');
const ctx = (canvas && canvas.getContext) ? canvas.getContext('2d') : null;
const artRotator = document.getElementById('art-rotator');
const mainModel = document.getElementById('main-model');
const composition = document.getElementById('composition');
const speedDisplay = document.getElementById('speed-display');
const timeDisplay = document.getElementById('time-display');
const crazyText = document.getElementById('crazy-text');
const mouthNormal = document.getElementById('girl-mouth-normal');
const faceFast = document.getElementById('girl-face-fast');
const entryOverlay = document.getElementById('enter-overlay');
const tvStatic = document.getElementById('tv-static');
const tvCtx = tvStatic ? tvStatic.getContext('2d') : null;
const learnMoreBtn = document.getElementById('learn-more-btn');
const hologramModal = document.getElementById('hologram-modal');
const closeHologram = document.getElementById('close-hologram');

// --- 3D Model Layer Manager --- //
const layers = {
  INITIAL: document.getElementById('model-hi'),
  IDLE: document.getElementById('model-dancing'),
  STUNNED: document.getElementById('model-stunned'),
  RECOVERY: document.getElementById('model-gettingUp')
};

// --- Global States --- //
let isStarted = false;
let animState = 'INITIAL';
let activeModel = layers.INITIAL;
let rotationZ = 0;

// --- Audio Controller --- //
const audioElements = {
  click: document.getElementById('audio-click'),
  intro: document.getElementById('audio-intro'),
  slowdown: document.getElementById('audio-slowdown'),
  rise: document.getElementById('audio-rise'),
  space: document.getElementById('audio-space')
};

const speechBubble = document.getElementById('speech-bubble');

class DialogueManager {
  constructor(element) {
    this.el = element;
    this.activeWords = [];
  }

  async showDialogue(text, audio) {
    if (!this.el) return;
    
    this.el.innerHTML = '';
    this.el.style.opacity = '1';
    
    const words = text.split(' ');
    this.activeWords = words.map(w => {
      const span = document.createElement('span');
      span.className = 'word';
      span.innerText = w;
      this.el.appendChild(span);
      return span;
    });

    // Try to get duration, fallback if metadata not loaded
    let duration = audio.duration;
    if (isNaN(duration) || duration === 0) duration = 5; // fallback

    const interval = (duration * 1000) / words.length;

    for (let i = 0; i < this.activeWords.length; i++) {
        setTimeout(() => {
            if (this.activeWords[i]) this.activeWords[i].classList.add('visible');
        }, i * interval);
    }
  }

  hide() {
    if (!this.el) return;
    this.el.style.opacity = '0';
    setTimeout(() => { this.el.innerHTML = ''; }, 300);
  }
}

const dialogue = new DialogueManager(speechBubble);

const audioState = {
  introPlayed: false,
  slowdownTriggered: false
};

function playAudio(id) {
  const audio = audioElements[id];
  if (!audio) return;

  // Stop all other audio to prevent overlap (exclusive play per requirements, except background music)
  Object.values(audioElements).forEach(a => {
    if (a && a !== audio && a !== audioElements.space) {
      a.pause();
      a.currentTime = 0;
    }
  });

  audio.currentTime = 0;
  audio.play().catch(e => console.warn(`[AUDIO] Failed to play ${id}:`, e));

  if (id === 'intro') {
    dialogue.showDialogue("I’m Guardian Nova. This galaxy doesn’t need saving… it needs shaking up.", audio);
  } else if (id === 'rise') {
    dialogue.showDialogue("so you like speed huhh !?", audio);
  }

  audio.onended = () => {
    if (id !== 'slowdown' && id !== 'space') {
      dialogue.hide();
    }
  };
}

// Initialize all layers
Object.entries(layers).forEach(([state, model]) => {
  if (!model) return;

  model.addEventListener('load', async () => {
    model.exposure = 1.4;
    model.environmentImage = 'neutral';
    await model.updateComplete;

    const anims = model.availableAnimations;
    if (anims && anims.length > 0) {
      model.animationName = anims[0];

      if (state !== 'IDLE') {
        if (isStarted) {
          model.play({ repetitions: 1 });
        }

        // --- 1. Intro Audio Trigger (Delayed 1s AFTER ENTRY) --- //
        // Moving this to the enterOverlay click event since browsers block autoplay audio

        // FOOLPROOF BACKUP for one-shot transitions
        if (state === 'INITIAL' || state === 'RECOVERY') {
          const d = (model.duration || 3) * 1000;
          setTimeout(() => {
            if (activeModel === model && isStarted) {
              switchLayer('IDLE');
            }
          }, d);
        }
      } else {
        if (isStarted) {
          model.play();
        }
      }
    }
  });

  model.addEventListener('finished', () => {
    if (state === 'INITIAL' || state === 'RECOVERY') {
      switchLayer('IDLE');
    }
    else if (state === 'IDLE') {
      model.play();
    }
  });
});


function switchLayer(newState) {
  if (animState === newState) return;

  console.log(`[ANIM] Switching layer: ${animState} -> ${newState}`);

  // Deactivate old
  if (activeModel) activeModel.classList.remove('active');

  // Activate new
  animState = newState;
  activeModel = layers[newState];

  if (activeModel) {
    activeModel.classList.add('active');
    // Restart animation from beginning
    activeModel.currentTime = 0;

    if (newState !== 'IDLE') {
      activeModel.play({ repetitions: 1 });

      // --- 3. Rise Audio Trigger (Immediately at Recovery Start) --- //
      if (newState === 'RECOVERY') {
        playAudio('rise');
      }
    } else {
      activeModel.play();
    }
  }
}

function updateAnimationState() {
  if (animState !== 'STUNNED' && animState !== 'RECOVERY' && speedMultiplier >= 10) {
    switchLayer('STUNNED');
  }
  else if (animState === 'STUNNED' && speedMultiplier < 10) {
    switchLayer('RECOVERY');
  }

  // HARD FREEZE for STUNNED state
  if (animState === 'STUNNED' && activeModel && activeModel.duration > 0) {
    if (activeModel.currentTime >= activeModel.duration - 0.1) {
      activeModel.pause();
      activeModel.currentTime = activeModel.duration - 0.1;
    }
  }
}




// Resize handling
let width, height;
function resize() {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- 3D Starfield/Boxes Particle System --- //
const numParticles = 300;
const particles = [];
const focus = 400; // perspective focus
const colors = ['#f687b3', '#4fd1c5', '#b794f4', '#ffffff', '#fbbf24', '#f56565'];

class Particle {
  constructor() {
    this.spawn();
    this.z = Math.random() * 2000;
  }
  spawn() {
    this.x = (Math.random() - 0.5) * 3000;
    this.y = (Math.random() - 0.5) * 3000;
    this.z = 2000; // start far away
    this.size = Math.random() * 4 + 2;
    this.color = colors[Math.floor(Math.random() * colors.length)];
    this.type = Math.random() > 0.5 ? 'box' : 'trail';
  }
  update(speed) {
    this.z -= speed;
    if (this.z < 1) {
      this.spawn();
      this.z = 2000; // respawn at the back immediately to avoid flashing
    }
  }
  draw(ctx, speed) {
    if (this.z < 1) return;

    // 3D Projection
    const scale = focus / this.z;
    const sx = this.x * scale + width / 2;
    const sy = this.y * scale + height / 2;

    // Past z rendering
    const pastZ = this.z + speed * 2;
    const pastScale = focus / pastZ;
    const px = this.x * pastScale + width / 2;
    const py = this.y * pastScale + height / 2;

    const projectedSize = this.size * scale;

    if (sx < 0 || sx > width || sy < 0 || sy > height) {
      // Out of bounds, but keep updating until z resets
      return;
    }

    ctx.fillStyle = this.color;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = projectedSize / 2;

    if (this.type === 'box') {
      ctx.fillRect(sx - projectedSize / 2, sy - projectedSize / 2, projectedSize, projectedSize);
      // Small 3D depth lines (retro aesthetic)
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(sx, sy);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(sx, sy);
      ctx.stroke();
    }
  }
}

for (let i = 0; i < numParticles; i++) {
  particles.push(new Particle());
}

// --- Interaction State --- //
let isHolding = false;
let speedMultiplier = 1;
const maxSpeed = 20;
const accel = 0.95; // Takes ~20s to reach max speed

// Mouse Tracking
let mouseX = 0, mouseY = 0;
window.addEventListener('mousemove', (e) => {
  mouseX = (e.clientX / width) - 0.5;
  mouseY = (e.clientY / height) - 0.5;
});

window.addEventListener('mousedown', () => isHolding = true);
window.addEventListener('mouseup', () => isHolding = false);
window.addEventListener('touchstart', (e) => {
  isHolding = true;
  mouseX = (e.touches[0].clientX / width) - 0.5;
  mouseY = (e.touches[0].clientY / height) - 0.5;
});
window.addEventListener('touchend', () => isHolding = false);


// --- Main Animation Loop --- //
let lastTime = 0;
let totalTime = 0;

// --- 80s TV Static Animation --- //
function drawStatic() {
  if (!tvCtx || (isStarted && entryOverlay.style.display === 'none')) return;
  
  // Lower framerate for some "lag" feel during static
  if (Math.random() > 0.8 && !isStarted) {
    requestAnimationFrame(drawStatic);
    return;
  }

  const w = tvStatic.width = window.innerWidth / 2; // Low res for retro look
  const h = tvStatic.height = window.innerHeight / 2;
  const imageData = tvCtx.createImageData(w, h);
  const data = imageData.data;
  
  // Create noise
  for (let i = 0; i < data.length; i += 4) {
    const val = Math.random() * 255;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 255;
  }
  
  tvCtx.putImageData(imageData, 0, 0);
  requestAnimationFrame(drawStatic);
}
drawStatic();

// --- Entry Logic --- //
if (entryOverlay) {
  entryOverlay.addEventListener('click', () => {
    if (isStarted) return;
    isStarted = true;

    // Phase 1: Sudden Intense Static & Distortion
    entryOverlay.classList.add('tv-distort');
    tvStatic.style.opacity = "0.8"; // Explode with static
    
    // Play start click sound
    playAudio('click');
    
    // Hide text immediately
    const content = entryOverlay.querySelector('.enter-content');
    if (content) content.style.opacity = "0";

    // Phase 2: Power-off reveal & Audio Trigger
    setTimeout(() => {
      entryOverlay.classList.add('revealing');
      
      // Play intro audio
      if (!audioState.introPlayed) {
          playAudio('intro');
          audioState.introPlayed = true;
      }
      
      // Start models
      if (layers.INITIAL) layers.INITIAL.play({ repetitions: 1 });
      if (layers.IDLE) layers.IDLE.play();
    }, 3000); // 3s of glitchy static madness

    // Cleanup
    setTimeout(() => {
      entryOverlay.style.display = 'none';
    }, 4000);
  });
}

function animate(t) {
  const dt = (t - lastTime) / 1000 || 0;
  lastTime = t;
  totalTime += dt;

  // Speed Logic
  if (isHolding) {
    speedMultiplier = Math.min(speedMultiplier + accel * dt, maxSpeed);
  } else {
    speedMultiplier = Math.max(speedMultiplier - accel * dt, 1);
  }

  // Sync Audio Playback Rate for slowdown and space music (if playing)
  if (!audioElements.slowdown.paused) {
    audioElements.slowdown.playbackRate = Math.max(1, speedMultiplier / 5);
  }
  
  // Logic for the new Space Music
  if (speedMultiplier > 1.05 && isStarted) {
    if (audioElements.space.paused) {
        audioElements.space.play().catch(e => console.warn("[AUDIO] Space music error:", e));
    }
    // Sync music playback progress: finish exactly at 20x
    // Speed 1x -> 20x (range 19) at accel 0.95 take 19/0.95 = 20 seconds.
    // Setting playbackRate to match duration/20 gives us the perfect "reach end at 20x" sync.
    if (audioElements.space.duration) {
        audioElements.space.playbackRate = audioElements.space.duration / 20;
    }
  } else {
    if (!audioElements.space.paused) {
        audioElements.space.pause();
        audioElements.space.currentTime = 0; // Reset or just pause? Usually user likes reset for this kind of effect
    }
  }

  // Draw Background
  if (ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; // Trails fade effect
    ctx.fillRect(0, 0, width, height);

    const currentZSpeed = 100 * speedMultiplier * dt;
    for (let p of particles) {
      p.update(currentZSpeed);
      p.draw(ctx, currentZSpeed);
    }
  }

  // Update UI Text
  if (speedDisplay) speedDisplay.textContent = Math.max(1, speedMultiplier).toFixed(2) + 'x';

  const m = Math.floor(t / 60000).toString().padStart(2, '0');
  const s = Math.floor((t % 60000) / 1000).toString().padStart(2, '0');
  const ms = Math.floor(t % 1000).toString().padStart(3, '0');
  if (timeDisplay) timeDisplay.textContent = `${m}:${s}:${ms}`;

  // Update Animation State based on speed
  updateAnimationState();

  // Slow down audio playback scaling: 10x speed -> 1.0, 20x speed -> 1.5
  if (!audioElements.slowdown.paused) {
      audioElements.slowdown.playbackRate = 1 + (speedMultiplier - 10) / 20;
  }

  if (speedMultiplier >= 10) {
    if (crazyText) crazyText.style.opacity = '1';
    if (composition) composition.classList.add('glitch');

    // --- 2. Slowdown Audio Trigger (Synced with Text Popup) --- //
    if (!audioState.slowdownTriggered) {
      playAudio('slowdown');
      audioState.slowdownTriggered = true;
    }
  } else {
    if (crazyText) crazyText.style.opacity = '0';
    if (composition) composition.classList.remove('glitch');

    // Reset trigger flag when speed drops below 10x
    audioState.slowdownTriggered = false;
  }


  // Hand & Girl Transformation
  const orbitX = Math.cos(totalTime) * 30 * (1 + speedMultiplier * 0.1);
  const orbitY = -Math.sin(totalTime) * 30 * (1 + speedMultiplier * 0.1);

  const tx = mouseX * 100 + orbitX;
  const ty = mouseY * 100 + orbitY;

  const rx = -mouseY * 20;
  const ry = mouseX * 20;

  if (artRotator) {
    artRotator.style.transform = `perspective(1000px) translate3d(${tx}px, ${ty}px, 0) rotateX(${rx}deg) rotateY(${ry}deg) scale(${1 + speedMultiplier * 0.01})`;
  }

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

// --- Hologram Modal Logic --- //
if (learnMoreBtn && hologramModal) {
  learnMoreBtn.addEventListener('click', () => {
    hologramModal.classList.remove('hologram-hidden');
  });
}

if (closeHologram && hologramModal) {
  closeHologram.addEventListener('click', () => {
    hologramModal.classList.add('hologram-hidden');
  });
}

// Close modal on escape key or clicking outside
if (hologramModal) {
  hologramModal.addEventListener('click', (e) => {
    if (e.target === hologramModal) {
      hologramModal.classList.add('hologram-hidden');
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hologramModal.classList.add('hologram-hidden');
    }
  });
}
