// ===== 全局變數 =====
let gameState = 'idle'; // idle, playing, gameOver
let score = 0;
let highScore = localStorage.getItem('heartShooterHighScore') || 0;
let timeLeft = 60;
let frameCounter = 0;
let combo = 0;
let maxCombo = 0;
let difficulty = 'normal'; // easy, normal, hard

// 遊戲物件陣列
let hearts = [];
let bullets = [];
let particles = [];

// 箭頭位置和旋轉角度
let arrowX, arrowY;
let arrowAngle = 0;

// 手部檢測
let handDetector = null;
let gestureRecognizer = null;
let gestureState = {
  isPinching: false,
  isThumbsUp: false,
  isPalmOpen: false,
  indexFingerPosition: null,
  lastPinchTime: 0
};

// 成就系統
let achievements = {};
let achievementManager = null;

// 音效管理
let audioManager = null;
let isMuted = localStorage.getItem('heartShooterMuted') === 'true';

// 遊戲常數
const ARROW_SPEED = 8;
const HEART_SPAWN_RATES = {
  easy: 40,
  normal: 25,
  hard: 15
};
const HEART_RADIUS = 20;
const BULLET_RADIUS = 4;
const PARTICLE_COUNT = 12;
const PARTICLE_SPEED = 5;

// ===== 類別定義 =====

/**
 * 愛心物件類別
 */
class Heart {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = random(-2, 2);
    this.vy = random(-2, 2);
    this.radius = HEART_RADIUS;
    this.alive = true;
    this.type = this.getRandomType();
  }

  getRandomType() {
    const rand = random();
    if (rand < 0.02) return 'rainbow'; // 2%
    if (rand < 0.12) return 'gold'; // 10%
    if (rand < 0.17) return 'bomb'; // 5%
    return 'normal'; // 83%
  }

  update() {
    const speedMultiplier = difficulty === 'easy' ? 1 : difficulty === 'hard' ? 3 : 2;
    this.x += this.vx * speedMultiplier;
    this.y += this.vy * speedMultiplier;

    // 邊界反彈
    if (this.x - this.radius < 0 || this.x + this.radius > width) {
      this.vx *= -1;
      this.x = constrain(this.x, this.radius, width - this.radius);
    }
    if (this.y - this.radius < 0 || this.y + this.radius > height) {
      this.vy *= -1;
      this.y = constrain(this.y, this.radius, height - this.radius);
    }
  }

  display() {
    push();
    translate(this.x, this.y);

    // 選擇顏色
    let fillColor = '#ff6b6b';
    let strokeColor = '#ff0000';
    switch (this.type) {
      case 'gold':
        fillColor = '#ffd700';
        strokeColor = '#ffaa00';
        break;
      case 'rainbow':
        fillColor = '#ff1493';
        strokeColor = '#ff69b4';
        break;
      case 'bomb':
        fillColor = '#333333';
        strokeColor = '#666666';
        break;
    }

    fill(fillColor);
    stroke(strokeColor);
    strokeWeight(2);

    // 繪製簡化的愛心形狀
    beginShape();
    for (let i = 0; i < TWO_PI; i += 0.1) {
      let r = this.radius * (13 * cos(i) - 5 * cos(2 * i) - 2 * cos(3 * i) - cos(4 * i)) / 16;
      let px = r * cos(i);
      let py = -r * sin(i);
      vertex(px, py);
    }
    endShape(CLOSE);

    // 繪製眼睛
    fill('#ffffff');
    noStroke();
    circle(-8, -5, 6);
    circle(8, -5, 6);

    // 繪製瞳孔
    fill('#000000');
    circle(-8, -5, 3);
    circle(8, -5, 3);

    pop();
  }

  isHit(bx, by, br) {
    let d = dist(this.x, this.y, bx, by);
    return d < this.radius + br;
  }
}

/**
 * 子彈物件類別
 */
class Bullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    this.vx = cos(angle) * ARROW_SPEED;
    this.vy = sin(angle) * ARROW_SPEED;
    this.radius = BULLET_RADIUS;
    this.alive = true;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;

    // 超出螢幕時刪除
    if (this.x < 0 || this.x > width || this.y < 0 || this.y > height) {
      this.alive = false;
    }
  }

  display() {
    fill('#00d9ff');
    noStroke();
    circle(this.x, this.y, this.radius * 2);
  }
}

/**
 * 粒子物件類別
 */
class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = random(-PARTICLE_SPEED, PARTICLE_SPEED);
    this.vy = random(-PARTICLE_SPEED, PARTICLE_SPEED);
    this.life = 50;
    this.maxLife = 50;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.2; // 重力
    this.life--;
  }

  display() {
    let alpha = map(this.life, 0, this.maxLife, 0, 255);
    fill(255, 107, 107, alpha);
    noStroke();
    circle(this.x, this.y, 4);
  }
}

// ===== 手部檢測類別 =====

class GestureRecognizer {
  constructor() {
    this.pinchThreshold = 0.05;
    this.pinchCooldown = 100;
  }

  recognize(hands) {
    if (hands.length === 0) {
      return {
        isPinching: false,
        isThumbsUp: false,
        isPalmOpen: false,
        indexFingerPosition: null,
        lastPinchTime: gestureState.lastPinchTime
      };
    }

    const hand = hands[0];
    const landmarks = hand.landmarks;

    // 提取關鍵關節點
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const wrist = landmarks[0];

    // 計算手掌寬度
    const palmWidth = this.distance(landmarks[5], landmarks[17]);

    // 檢測 Pinch 手勢
    const indexMiddleDistance = this.distance(indexTip, middleTip);
    const isPinching = indexMiddleDistance < palmWidth * this.pinchThreshold;

    // 檢測 Thumbs Up 手勢
    const isThumbsUp =
      thumbTip.y < indexTip.y &&
      thumbTip.y < middleTip.y &&
      thumbTip.y < ringTip.y &&
      thumbTip.y < pinkyTip.y &&
      indexTip.y > wrist.y &&
      middleTip.y > wrist.y;

    // 檢測 Palm Open 手勢
    const isPalmOpen =
      indexTip.y < landmarks[6].y &&
      middleTip.y < landmarks[10].y &&
      ringTip.y < landmarks[14].y &&
      pinkyTip.y < landmarks[18].y &&
      thumbTip.y < landmarks[2].y;

    // 食指位置
    const indexFingerPosition = {
      x: indexTip.x * width,
      y: indexTip.y * height
    };

    return {
      isPinching,
      isThumbsUp,
      isPalmOpen,
      indexFingerPosition,
      lastPinchTime: gestureState.lastPinchTime
    };
  }

  distance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

// ===== 成就管理 =====

class AchievementManager {
  constructor() {
    this.achievements = {
      first_100: {
        id: 'first_100',
        name: '初次突破',
        description: '首次達到 100 分',
        icon: '🎯',
        unlocked: false
      },
      combo_10: {
        id: 'combo_10',
        name: '連擊大師',
        description: '達到 10 連擊',
        icon: '⚡',
        unlocked: false
      },
      hearts_50: {
        id: 'hearts_50',
        name: '愛心獵人',
        description: '擊中 50 個愛心',
        icon: '❤️',
        unlocked: false
      },
      gold_heart: {
        id: 'gold_heart',
        name: '黃金之心',
        description: '擊中 5 個金色愛心',
        icon: '💛',
        unlocked: false
      },
      rainbow_heart: {
        id: 'rainbow_heart',
        name: '彩虹之心',
        description: '擊中 1 個彩虹愛心',
        icon: '🌈',
        unlocked: false
      },
      high_score_500: {
        id: 'high_score_500',
        name: '高手玩家',
        description: '達到 500 分的高分',
        icon: '👑',
        unlocked: false
      },
      hard_mode: {
        id: 'hard_mode',
        name: '地獄難度',
        description: '在困難模式下完成一局',
        icon: '🔥',
        unlocked: false
      },
      skill_master: {
        id: 'skill_master',
        name: '技能大師',
        description: '使用特殊技能 5 次',
        icon: '✨',
        unlocked: false
      }
    };

    this.heartCount = 0;
    this.goldHeartCount = 0;
    this.rainbowHeartCount = 0;
    this.skillUseCount = 0;

    this.loadAchievements();
  }

  loadAchievements() {
    const saved = localStorage.getItem('heartShooterAchievements');
    if (saved) {
      try {
        const loaded = JSON.parse(saved);
        Object.keys(loaded).forEach(key => {
          if (this.achievements[key]) {
            this.achievements[key].unlocked = loaded[key].unlocked;
            this.achievements[key].unlockedAt = loaded[key].unlockedAt;
          }
        });
      } catch (e) {
        console.warn('Failed to load achievements:', e);
      }
    }
  }

  saveAchievements() {
    localStorage.setItem('heartShooterAchievements', JSON.stringify(this.achievements));
  }

  checkAchievements(currentScore, currentCombo, currentMaxCombo, heartType) {
    const newAchievements = [];

    // 首次 100 分
    if (currentScore >= 100 && !this.achievements.first_100.unlocked) {
      this.achievements.first_100.unlocked = true;
      this.achievements.first_100.unlockedAt = Date.now();
      newAchievements.push(this.achievements.first_100);
    }

    // 連擊 10 次
    if (currentMaxCombo >= 10 && !this.achievements.combo_10.unlocked) {
      this.achievements.combo_10.unlocked = true;
      this.achievements.combo_10.unlockedAt = Date.now();
      newAchievements.push(this.achievements.combo_10);
    }

    // 擊中 50 個愛心
    this.heartCount++;
    if (this.heartCount >= 50 && !this.achievements.hearts_50.unlocked) {
      this.achievements.hearts_50.unlocked = true;
      this.achievements.hearts_50.unlockedAt = Date.now();
      newAchievements.push(this.achievements.hearts_50);
    }

    // 金色愛心
    if (heartType === 'gold') {
      this.goldHeartCount++;
      if (this.goldHeartCount >= 5 && !this.achievements.gold_heart.unlocked) {
        this.achievements.gold_heart.unlocked = true;
        this.achievements.gold_heart.unlockedAt = Date.now();
        newAchievements.push(this.achievements.gold_heart);
      }
    }

    // 彩虹愛心
    if (heartType === 'rainbow') {
      this.rainbowHeartCount++;
      if (this.rainbowHeartCount >= 1 && !this.achievements.rainbow_heart.unlocked) {
        this.achievements.rainbow_heart.unlocked = true;
        this.achievements.rainbow_heart.unlockedAt = Date.now();
        newAchievements.push(this.achievements.rainbow_heart);
      }
    }

    // 高分 500
    if (currentScore >= 500 && !this.achievements.high_score_500.unlocked) {
      this.achievements.high_score_500.unlocked = true;
      this.achievements.high_score_500.unlockedAt = Date.now();
      newAchievements.push(this.achievements.high_score_500);
    }

    // 困難模式
    if (difficulty === 'hard' && !this.achievements.hard_mode.unlocked) {
      this.achievements.hard_mode.unlocked = true;
      this.achievements.hard_mode.unlockedAt = Date.now();
      newAchievements.push(this.achievements.hard_mode);
    }

    if (newAchievements.length > 0) {
      this.saveAchievements();
    }

    return newAchievements;
  }

  getUnlockedCount() {
    return Object.values(this.achievements).filter(a => a.unlocked).length;
  }

  reset() {
    this.heartCount = 0;
    this.goldHeartCount = 0;
    this.rainbowHeartCount = 0;
    this.skillUseCount = 0;
  }
}

// ===== 音效管理 =====

class AudioManager {
  constructor() {
    this.audioContext = null;
  }

  getAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.audioContext;
  }

  playShootSound() {
    if (isMuted) return;
    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

      osc.start(now);
      osc.stop(now + 0.1);
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  }

  playHitSound() {
    if (isMuted) return;
    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  }

  playComboSound() {
    if (isMuted) return;
    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(1000, now + 0.2);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  }

  playGameOverSound() {
    if (isMuted) return;
    try {
      const ctx = this.getAudioContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.5);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

      osc.start(now);
      osc.stop(now + 0.5);
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  }
}

// ===== p5.js 主函數 =====

function setup() {
  let container = document.getElementById('p5-container');
  let w = container.clientWidth;
  let h = container.clientHeight;
  
  let canvas = createCanvas(w, h);
  canvas.parent('p5-container');

  arrowX = width / 2;
  arrowY = height / 2;

  // 初始化管理器
  achievementManager = new AchievementManager();
  audioManager = new AudioManager();
  gestureRecognizer = new GestureRecognizer();

  // 初始化手部檢測
  initializeHandDetection();

  // 更新成就顯示
  updateAchievementsDisplay();

  // 設置事件監聽
  setupEventListeners();
}

function draw() {
  // 背景
  background('#2d2d30');
  drawGrid();

  // 遊戲邏輯
  if (gameState === 'idle') {
    // 空閒狀態
  } else if (gameState === 'playing') {
    updateGame();
    checkCollisions();
    drawGame();
  }

  // 繪製 UI
  drawUI();
}

// ===== 遊戲邏輯函數 =====

function updateGame() {
  frameCounter++;

  // 生成新愛心
  const spawnRate = HEART_SPAWN_RATES[difficulty];
  if (frameCounter % spawnRate === 0) {
    hearts.push(new Heart(random(50, width - 50), random(50, height - 50)));
  }

  // 更新愛心
  for (let heart of hearts) {
    heart.update();
  }

  // 更新子彈
  for (let bullet of bullets) {
    bullet.update();
  }

  // 更新粒子
  for (let particle of particles) {
    particle.update();
  }

  // 刪除已死亡的物件
  hearts = hearts.filter(h => h.alive);
  bullets = bullets.filter(b => b.alive);
  particles = particles.filter(p => p.life > 0);

  // 更新計時器
  if (frameRate() > 0) {
    timeLeft = max(0, 60 - floor(frameCounter / 60));
  }

  // 遊戲結束
  if (timeLeft <= 0) {
    endGame();
  }

  // 更新連擊超時
  if (combo > 0 && frameCounter % 180 === 0) {
    combo = 0;
    updateUIDisplay();
  }
}

function checkCollisions() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    for (let j = hearts.length - 1; j >= 0; j--) {
      if (hearts[j].isHit(bullets[i].x, bullets[i].y, bullets[i].radius)) {
        // 擊中！
        const heart = hearts[j];
        hearts[j].alive = false;
        bullets[i].alive = false;

        // 計算得分
        let points = 0;
        switch (heart.type) {
          case 'normal':
            points = 10;
            break;
          case 'gold':
            points = 50;
            break;
          case 'rainbow':
            points = 100;
            break;
          case 'bomb':
            points = -20;
            break;
        }

        // 應用連擊倍數
        const multiplier = max(1, combo);
        score += points * multiplier;

        // 更新連擊
        combo++;
        maxCombo = max(maxCombo, combo);

        // 播放音效
        audioManager.playHitSound();
        if (combo > 1 && combo % 5 === 0) {
          audioManager.playComboSound();
        }

        // 檢查成就
        const newAchievements = achievementManager.checkAchievements(score, combo, maxCombo, heart.type);
        if (newAchievements.length > 0) {
          showAchievementNotification(newAchievements[0]);
          updateAchievementsDisplay();
        }

        // 建立爆炸效果
        createExplosion(heart.x, heart.y);

        updateUIDisplay();
      }
    }
  }
}

function createExplosion(x, y) {
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(new Particle(x, y));
  }
}

// ===== 渲染函數 =====

function drawGrid() {
  stroke('#3e3e42');
  strokeWeight(1);

  // 垂直線
  for (let x = 0; x < width; x += 40) {
    line(x, 0, x, height);
  }

  // 水平線
  for (let y = 0; y < height; y += 40) {
    line(0, y, width, y);
  }
}

function drawGame() {
  // 繪製愛心
  for (let heart of hearts) {
    heart.display();
  }

  // 繪製子彈
  for (let bullet of bullets) {
    bullet.display();
  }

  // 繪製粒子
  for (let particle of particles) {
    particle.display();
  }

  // 繪製準星
  stroke('#ff6b6b');
  strokeWeight(2);
  noFill();
  circle(arrowX, arrowY, 40);

  // 繪製十字
  line(arrowX - 15, arrowY, arrowX + 15, arrowY);
  line(arrowX, arrowY - 15, arrowX, arrowY + 15);
}

function drawUI() {
  // UI 由 HTML 元素處理
}

// ===== 遊戲控制 =====

function startGame() {
  gameState = 'playing';
  score = 0;
  combo = 0;
  maxCombo = 0;
  timeLeft = 60;
  frameCounter = 0;
  hearts = [];
  bullets = [];
  particles = [];

  achievementManager.reset();

  document.getElementById('instructions-modal').style.display = 'none';
  document.getElementById('gameover-modal').style.display = 'none';

  updateUIDisplay();
}

function endGame() {
  gameState = 'gameOver';

  if (score > highScore) {
    highScore = score;
    localStorage.setItem('heartShooterHighScore', highScore);
  }

  audioManager.playGameOverSound();

  // 顯示遊戲結束面板
  document.getElementById('final-score').textContent = score;
  document.getElementById('final-combo').textContent = 'x' + maxCombo;
  document.getElementById('final-highscore').textContent = highScore;
  document.getElementById('gameover-modal').style.display = 'flex';
}

function restartGame() {
  difficulty = document.querySelector('.difficulty-btn.active').dataset.difficulty;
  startGame();
}

// ===== UI 更新 =====

function updateUIDisplay() {
  document.getElementById('score-value').textContent = score;
  document.getElementById('highscore-value').textContent = highScore;
  document.getElementById('time-value').textContent = timeLeft + 's';

  if (combo > 0) {
    document.getElementById('combo-display').style.display = 'block';
    document.getElementById('combo-value').textContent = 'x' + combo;
  } else {
    document.getElementById('combo-display').style.display = 'none';
  }
}

function updateAchievementsDisplay() {
  const unlockedCount = achievementManager.getUnlockedCount();
  document.getElementById('achievements-btn').textContent = `成就 (${unlockedCount}/8)`;

  // 更新成就網格
  const grid = document.getElementById('achievements-grid');
  grid.innerHTML = '';

  Object.values(achievementManager.achievements).forEach(achievement => {
    const card = document.createElement('div');
    card.className = 'achievement-card ' + (achievement.unlocked ? 'unlocked' : 'locked');

    let dateStr = '';
    if (achievement.unlocked && achievement.unlockedAt) {
      const date = new Date(achievement.unlockedAt);
      dateStr = `<div class="achievement-card-date">✓ ${date.toLocaleDateString('zh-TW')}</div>`;
    }

    card.innerHTML = `
      <div class="achievement-card-icon">${achievement.icon}</div>
      <div class="achievement-card-name">${achievement.name}</div>
      <div class="achievement-card-desc">${achievement.description}</div>
      ${dateStr}
    `;

    grid.appendChild(card);
  });
}

function showAchievementNotification(achievement) {
  const notify = document.getElementById('achievement-notification');
  document.getElementById('achievement-icon').textContent = achievement.icon;
  document.getElementById('achievement-name').textContent = achievement.name;
  document.getElementById('achievement-desc').textContent = achievement.description;

  notify.style.display = 'flex';
  notify.classList.remove('hide');

  setTimeout(() => {
    notify.classList.add('hide');
    setTimeout(() => {
      notify.style.display = 'none';
    }, 300);
  }, 3000);
}

// ===== 手部檢測初始化 =====

function initializeHandDetection() {
  // 動態載入 MediaPipe
  const handsScript = document.createElement('script');
  handsScript.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js';
  document.head.appendChild(handsScript);

  const cameraScript = document.createElement('script');
  cameraScript.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js';
  document.head.appendChild(cameraScript);

  setTimeout(() => {
    if (window.Hands && window.Camera) {
      const video = document.createElement('video');
      video.style.display = 'none';
      document.body.appendChild(video);

      const hands = new window.Hands({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
        }
      });

      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      hands.onResults((results) => {
        if (results.multiHandLandmarks && results.multiHandedness) {
          const hand = {
            landmarks: results.multiHandLandmarks[0],
            handedness: results.multiHandedness[0].label
          };

          gestureState = gestureRecognizer.recognize([hand]);

          // 更新準星位置
          if (gestureState.indexFingerPosition) {
            arrowX = gestureState.indexFingerPosition.x;
            arrowY = gestureState.indexFingerPosition.y;
          }

          // 更新手勢狀態顯示
          updateGestureDisplay();

          // 處理射擊手勢
          if (gestureState.isPinching && gameState === 'playing') {
            const now = Date.now();
            if (now - gestureState.lastPinchTime > 100) {
              gestureState.lastPinchTime = now;
              const angle = atan2(arrowY - height / 2, arrowX - width / 2);
              bullets.push(new Bullet(width / 2, height / 2, angle));
              audioManager.playShootSound();
            }
          }

          // 處理開始手勢
          if (gestureState.isThumbsUp && gameState === 'idle') {
            startGame();
          }
        }
      });

      const camera = new window.Camera(video, {
        onFrame: async () => {
          await hands.send({ image: video });
        },
        width: 1280,
        height: 720
      });

      try {
        camera.start();
      } catch (e) {
        console.warn('Camera initialization failed:', e);
      }
    }
  }, 2000);
}

function updateGestureDisplay() {
  document.getElementById('pinch-status').textContent = gestureState.isPinching ? 'ON' : 'OFF';
  document.getElementById('pinch-status').style.color = gestureState.isPinching ? '#00ff00' : '#888';

  document.getElementById('thumbsup-status').textContent = gestureState.isThumbsUp ? 'ON' : 'OFF';
  document.getElementById('thumbsup-status').style.color = gestureState.isThumbsUp ? '#00ff00' : '#888';

  document.getElementById('palm-status').textContent = gestureState.isPalmOpen ? 'ON' : 'OFF';
  document.getElementById('palm-status').style.color = gestureState.isPalmOpen ? '#00ff00' : '#888';
}

// ===== 事件監聽 =====

function setupEventListeners() {
  // 難度選擇
  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      difficulty = e.target.dataset.difficulty;
    });
  });

  // 成就按鈕
  document.getElementById('achievements-btn').addEventListener('click', () => {
    document.getElementById('achievements-modal').style.display = 'flex';
  });

  // 關閉成就面板
  document.getElementById('achievements-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('achievements-modal')) {
      document.getElementById('achievements-modal').style.display = 'none';
    }
  });

  // 音效按鈕
  document.getElementById('mute-btn').addEventListener('click', () => {
    isMuted = !isMuted;
    localStorage.setItem('heartShooterMuted', isMuted.toString());
    document.getElementById('mute-btn').textContent = isMuted ? '🔇 音效' : '🔊 音效';
  });

  // 視窗調整大小
  window.addEventListener('resize', () => {
    let container = document.getElementById('p5-container');
    let w = container.clientWidth;
    let h = container.clientHeight;
    resizeCanvas(w, h);
  });
}

// ===== 全局函數 =====

function closeAchievementsModal() {
  document.getElementById('achievements-modal').style.display = 'none';
}
