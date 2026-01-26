document.addEventListener('DOMContentLoaded', () => {
    
    // SCRATCH CARD EFFECT (reveal below text after enough scratching) + sound effects
    const canvas = document.getElementById('scratchCanvas');
    const revealEl = document.querySelector('.scratch-reveal-text');
    if (revealEl) revealEl.style.opacity = '0';

    // Audio setup (Web Audio API)
    let audioCtx = null;
    let isMuted = false;
    const ensureAudio = () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    };

    const setMuted = (m) => {
        isMuted = !!m;
        const btn = document.getElementById('sound-toggle');
        if (btn) btn.textContent = isMuted ? '🔇' : '🔊';
        if (audioCtx && ambientGain) {
            if (isMuted) {
                ambientGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
            } else {
                ambientGain.gain.setTargetAtTime(0.02, audioCtx.currentTime, 0.2);
            }
        }
    };

    // (click sound removed — only scratch sound will play)

    // Play a scratch noise burst (throttled)
    let lastScratchTime = 0;
    const playScratch = (volume = 0.03) => {
        if (isMuted) return;
        ensureAudio();
        const now = performance.now();
        if (now - lastScratchTime < 40) return; // throttle to ~25Hz
        lastScratchTime = now;

        const bufferSize = audioCtx.sampleRate * 0.08; // 80ms noise
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const src = audioCtx.createBufferSource();
        src.buffer = buffer;
        const band = audioCtx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 1200;
        band.Q.value = 0.8;
        const g = audioCtx.createGain();
        g.gain.value = volume;
        src.connect(band); band.connect(g); g.connect(audioCtx.destination);
        src.start(); src.stop(audioCtx.currentTime + 0.09);
    };

    // Background ambient drone (starts on first user interaction)
    let ambientStarted = false;
    let ambientGain = null;
    let ambientNodes = [];
    const startAmbient = () => {
        if (ambientStarted) return;
        ensureAudio();
        ambientStarted = true;

        // Create a warm drifting pad from two low-frequency oscillators
        const gain = audioCtx.createGain();
        // start muted if global mute is on
        if (isMuted) {
            gain.gain.setValueAtTime(0, audioCtx.currentTime);
        } else {
            gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0.02, audioCtx.currentTime + 2.0);
        }
        ambientGain = gain;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1200;

        const o1 = audioCtx.createOscillator();
        o1.type = 'sine';
        o1.frequency.value = 110; // A2
        o1.detune.value = -5;

        const o2 = audioCtx.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = 138.59; // C#3-ish
        o2.detune.value = 7;

        o1.connect(filter);
        o2.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        o1.start(); o2.start();
        ambientNodes = [o1, o2, filter, gain];

        // Slow modulation to make it breathe
        const lfo = audioCtx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.08;
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 60; // mod depth for detune
        lfo.connect(lfoGain);
        lfoGain.connect(o1.detune);
        lfoGain.connect(o2.detune);
        lfo.start();
        ambientNodes.push(lfo, lfoGain);
    };

    // start ambient on first user gesture (pointerdown covers mouse/touch)
    const startAmbientOnFirstGesture = () => {
        document.body.addEventListener('pointerdown', () => {
            startAmbient();
        }, { once: true });
    };
    startAmbientOnFirstGesture();

    // (reveal chime removed — only scratch sound will play)

    if (canvas) {
        const ctx = canvas.getContext('2d');

        // draw the secret text first (beneath overlay)
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 42px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('REST IS', canvas.width / 2, canvas.height / 2 - 15);
        ctx.fillText('SECRATE', canvas.width / 2, canvas.height / 2 + 20);

        // capture the canvas content as a background image (for later restoration)
        const bgImage = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // draw solid overlay on top
        ctx.fillStyle = '#cdff00';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        let isDrawing = false;

        const getScratchedPercent = () => {
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let cleared = 0;
            let total = data.length / 4;
            const step = 8; // sample every 8th pixel for performance
            for (let i = 3; i < data.length; i += 4 * step) {
                if (data[i] === 0) cleared++;
            }
            const sampledTotal = Math.ceil(total / step);
            return cleared / sampledTotal;
        };

        const revealIfNeeded = () => {
            const pct = getScratchedPercent();
            if (pct > 0.32) {
                if (revealEl) revealEl.style.opacity = '1';
                canvas.style.pointerEvents = 'none';
                // restore the original secret text clearly
                ctx.putImageData(bgImage, 0, 0);
            }
        };

        const scratchAt = (x, y) => {
            ctx.clearRect(x - 20, y - 20, 40, 40);
            playScratch(0.03);
            revealIfNeeded();
        };

        canvas.addEventListener('mousedown', (e) => { isDrawing = true; e.preventDefault(); });
        canvas.addEventListener('mouseup', () => { isDrawing = false; });
        canvas.addEventListener('mouseleave', () => { isDrawing = false; });
        canvas.addEventListener('mousemove', (e) => {
            if (!isDrawing) return;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            scratchAt(x, y);
        });

        canvas.addEventListener('touchstart', (e) => { isDrawing = true; e.preventDefault(); });
        canvas.addEventListener('touchend', (e) => { isDrawing = false; e.preventDefault(); });
        canvas.addEventListener('touchmove', (e) => {
            if (!isDrawing) return;
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            scratchAt(x, y);
            e.preventDefault();
        });
    }

    // Sound toggle button
    const soundBtn = document.getElementById('sound-toggle');
    if (soundBtn) {
        soundBtn.addEventListener('click', (e) => {
            e.preventDefault();
            setMuted(!isMuted);
            // if unmuting, ensure ambient can start on gesture
            if (!isMuted) startAmbient();
        });
    }

    // Spacebar sound effect (short sci-fi blip)
    const playSpaceSound = () => {
        if (isMuted) return;
        ensureAudio();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(400, audioCtx.currentTime);
        o.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.18);
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.06, audioCtx.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.28);
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 300;
        o.connect(filter); filter.connect(g); g.connect(audioCtx.destination);
        o.start(); o.stop(audioCtx.currentTime + 0.3);
    };

    // Play space sound on Space key
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            playSpaceSound();
        }
    });
    
    // 1. FAST SCROLL REVEAL logic
    const revealElements = document.querySelectorAll('.reveal');

    const revealOnScroll = () => {
        const windowHeight = window.innerHeight;
        const triggerPoint = 100; 

        revealElements.forEach((el) => {
            const elementTop = el.getBoundingClientRect().top;
            if (elementTop < windowHeight - triggerPoint) {
                el.classList.add('active');
            }
        });
    };

    window.addEventListener('scroll', revealOnScroll);
    revealOnScroll(); // Run once for initial view

    // 2. TILT EFFECT for Founder Card
    const card = document.getElementById('tilt-card');
    if(card) {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const rotateX = ((y - rect.height/2) / rect.height/2) * -10; 
            const rotateY = ((x - rect.width/2) / rect.width/2) * 10;

            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = `perspective(1000px) rotateX(0) rotateY(0)`;
        });
    }

    // 3. NAVIGATION logic
    const scrollToDonate = () => {
        document.getElementById('donate').scrollIntoView({ behavior: 'smooth' });
    };

    document.getElementById('nav-support-btn').addEventListener('click', scrollToDonate);
    document.getElementById('hero-cta').addEventListener('click', scrollToDonate);
});