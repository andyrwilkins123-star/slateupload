// WorkSlate - Main Application Script
// Copyright (c) 2025 Andrew Wilkins
// ==========================================

// GEMINI API KEY (Replace with your own)
let GEMINI_API_KEY = "";

// ==========================================
// DRAGGABLE WINDOWS LOGIC
// ==========================================

function makeDraggable(el) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const header = el.querySelector(".fw-header");
    if (header) header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        el.style.top = (el.offsetTop - pos2) + "px";
        el.style.left = (el.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

// Calculator Mode Switcher
function switchCalcMode(mode) {
    const frame = document.getElementById('desmos-frame');
    const btnSci = document.getElementById('btn-mode-sci');
    const btnGraph = document.getElementById('btn-mode-graph');
    const win = document.getElementById('win-calc');

    if (mode === 'sci') {
        frame.src = "https://www.desmos.com/scientific";
        win.style.width = "360px";

        btnSci.style.background = "white";
        btnSci.style.boxShadow = "0 1px 2px rgba(0,0,0,0.1)";
        btnSci.style.color = "black";
        btnGraph.style.background = "transparent";
        btnGraph.style.boxShadow = "none";
        btnGraph.style.color = "#64748b";
    } else {
        frame.src = "https://www.desmos.com/calculator?embedded=true";
        win.style.width = "600px";

        btnGraph.style.background = "white";
        btnGraph.style.boxShadow = "0 1px 2px rgba(0,0,0,0.1)";
        btnGraph.style.color = "black";
        btnSci.style.background = "transparent";
        btnSci.style.boxShadow = "none";
        btnSci.style.color = "#64748b";
    }

    if(parseInt(win.style.left) + parseInt(win.style.width) > window.innerWidth) {
        win.style.left = (window.innerWidth - parseInt(win.style.width) - 20) + "px";
    }
}

// ==========================================
// UI CONTROLLER
// ==========================================

class UIController {
    constructor() {
        document.querySelectorAll('.floating-window').forEach(makeDraggable);
        this.timerInterval = null;
        this.calcMode = 'DEG';
        this.lastAns = 0;
    }

    toggleInspector() {
        const el = document.querySelector('.inspector');
        if (el.classList.contains('collapsed')) {
            el.classList.remove('collapsed');
            el.style.display = 'flex';
        } else {
            el.classList.add('collapsed');
        }
    }

    toggleWindow(id) {
        const el = document.getElementById(id);
        if (el.style.display === 'flex') {
            el.style.display = 'none';
        } else {
            el.style.display = 'flex';
            const w = window.innerWidth;
            const h = window.innerHeight;
            const elW = el.offsetWidth || 300;
            const elH = el.offsetHeight || 300;

            el.style.left = Math.max(20, (w / 2 - elW / 2)) + 'px';

            if (id === 'win-calc') {
                el.style.top = '20px';
            } else {
                el.style.top = Math.max(20, (h / 2 - elH / 2)) + 'px';
            }
        }
    }

    rollDice() {
        const count = parseInt(document.getElementById('diceCount').value);
        const container = document.getElementById('diceContainer');
        container.innerHTML = '';
        for(let i=0; i<count; i++) {
            const val = Math.floor(Math.random() * 6) + 1;
            const die = document.createElement('div');
            die.className = `die die-${val}`;
            for(let d=0; d<val; d++) {
                const dot = document.createElement('span');
                dot.className = 'dot';
                die.appendChild(dot);
            }
            container.appendChild(die);
        }
    }

    startTimer() {
        if(this.timerInterval) clearInterval(this.timerInterval);
        let m = parseInt(document.getElementById('tMin').value) || 0;
        let s = parseInt(document.getElementById('tSec').value) || 0;
        let total = m * 60 + s;
        if(total <= 0) return;
        this.updateTimerDisplay(total);
        this.timerInterval = setInterval(() => {
            total--;
            if(total < 0) {
                clearInterval(this.timerInterval);
                alert("Time's Up!");
            } else {
                this.updateTimerDisplay(total);
            }
        }, 1000);
    }

    stopTimer() {
        clearInterval(this.timerInterval);
    }

    resetTimer() {
        clearInterval(this.timerInterval);
        document.getElementById('timerDisplay').innerText = "00:00";
    }

    updateTimerDisplay(totalSeconds) {
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        document.getElementById('timerDisplay').innerText =
            `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }

    loadYoutube() {
        const urlInput = document.getElementById('ytUrl');
        const url = urlInput.value.trim();
        const frame = document.getElementById('ytFrame');
        if (!url) return;
        const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length === 11) {
            frame.src = `https://www.youtube-nocookie.com/embed/${match[2]}?autoplay=1&rel=0&modestbranding=1`;
        } else {
            alert("Could not recognize that YouTube URL.");
        }
    }
}

// ==========================================
// PHYSICS ENGINE
// ==========================================

class PhysicsController {
    constructor(appInstance) {
        this.app = appInstance;
        this.engine = null;
        this.isActive = false;
        this.bodyMap = new Map();
        this.loopId = null;
    }

    toggle() {
        if (typeof Matter === 'undefined') {
            alert("Physics engine (Matter.js) is not loaded.");
            return;
        }
        if (this.isActive) this.stop();
        else this.start();
    }

    updateUI() {
        const btn = document.getElementById('dockBtnGravity');
        if (!btn) return;

        const appleSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"></path><path d="M10 2c1 .5 2 2 2 5"></path></svg>`;
        const stopSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;

        if (this.isActive) {
            btn.style.background = '#fee2e2';
            btn.style.color = '#ef4444';
            btn.innerHTML = stopSVG;
        } else {
            btn.style.background = '';
            btn.style.color = '';
            btn.innerHTML = appleSVG;
        }
    }

    start() {
        if (this.isActive) return;
        this.isActive = true;
        this.updateUI();

        this.engine = Matter.Engine.create({
            positionIterations: 30,
            velocityIterations: 30
        });
        this.engine.world.gravity.y = 1;

        const objects = this.app.getCurrentObjects();
        const bodies = [];

        objects.forEach(obj => {
            let body = null;
            const rot = obj.rotation || 0;

            if (obj.type === 'rect' || obj.type === 'image') {
                const w = Number(obj.w) || 10;
                const h = Number(obj.h) || 10;
                const cx = Number(obj.x) + w / 2;
                const cy = Number(obj.y) + h / 2;

                body = Matter.Bodies.rectangle(cx, cy, w, h, {
                    angle: rot,
                    restitution: 0.3,
                    friction: 0.1,
                    density: 0.002
                });
                this.bodyMap.set(body, obj);
            }
            else if (obj.type === 'circle') {
                const r = Number(obj.radius || obj.r || 20);
                body = Matter.Bodies.circle(Number(obj.x), Number(obj.y), r, {
                    restitution: 0.7,
                    friction: 0.001,
                    frictionAir: 0.01,
                    density: 0.04
                });
                this.bodyMap.set(body, obj);
            }
            else if (obj.type === 'poly') {
                const r = Number(obj.radius || obj.r || 20);
                body = Matter.Bodies.polygon(Number(obj.x), Number(obj.y), obj.sides || 5, r, {
                    angle: rot,
                    restitution: 0.3,
                    friction: 0.01,
                    density: 0.04
                });
                this.bodyMap.set(body, obj);
            }
            else if (obj.type === 'line') {
                const x1 = Number(obj.x1);
                const y1 = Number(obj.y1);
                const x2 = Number(obj.x2);
                const y2 = Number(obj.y2);

                const dx = x2 - x1;
                const dy = y2 - y1;
                const length = Math.sqrt(dx * dx + dy * dy);
                const visualAngle = Math.atan2(dy, dx);
                const cx = (x1 + x2) / 2;
                const cy = (y1 + y2) / 2;
                const finalAngle = visualAngle + rot;

                const visualWidth = Number(obj.width || 3);
                const physicsThick = Math.max(visualWidth, 10);

                body = Matter.Bodies.rectangle(cx, cy, length, physicsThick, {
                    isStatic: true,
                    angle: finalAngle,
                    friction: 0,
                    frictionStatic: 0,
                    restitution: 0.5
                });
            }
            else if (obj.type === 'path' && obj.points.length > 1) {
                const b = this.app.getObjectBounds(obj);
                const parts = [];
                const visualWidth = Number(obj.width || 3);
                const physicsThick = Math.max(visualWidth, 10);

                for(let i = 0; i < obj.points.length - 1; i++) {
                    const p1 = obj.points[i];
                    const p2 = obj.points[i+1];
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);

                    if(dist < 5) continue;

                    const angle = Math.atan2(dy, dx);
                    const segCX = (p1.x + p2.x) / 2;
                    const segCY = (p1.y + p2.y) / 2;

                    let finalCX = segCX;
                    let finalCY = segCY;
                    if (rot !== 0) {
                        const rx = segCX - b.cx;
                        const ry = segCY - b.cy;
                        finalCX = b.cx + (rx * Math.cos(rot) - ry * Math.sin(rot));
                        finalCY = b.cy + (rx * Math.sin(rot) + ry * Math.cos(rot));
                    }

                    const segment = Matter.Bodies.rectangle(finalCX, finalCY, dist + 2, physicsThick, {
                        isStatic: true,
                        angle: angle + rot,
                        friction: 0,
                        frictionStatic: 0,
                        render: { visible: false }
                    });
                    parts.push(segment);
                }
                if(parts.length > 0) bodies.push(...parts);
            }

            if (body) bodies.push(body);
        });

        const w = this.app.canvas.width;
        const h = this.app.canvas.height;
        const wallT = 200;

        const floor = Matter.Bodies.rectangle(w/2, h + (wallT/2), w * 5, wallT, { isStatic: true, friction: 1.0 });
        const left = Matter.Bodies.rectangle(0 - wallT/2, h/2, wallT, h * 5, { isStatic: true, friction: 0 });
        const right = Matter.Bodies.rectangle(w + wallT/2, h/2, wallT, h * 5, { isStatic: true, friction: 0 });

        bodies.push(floor, left, right);
        Matter.Composite.add(this.engine.world, bodies);

        this.loopId = requestAnimationFrame(() => this.syncLoop());
    }

    syncLoop() {
        if (!this.isActive || !this.engine) return;

        Matter.Engine.update(this.engine, 16.666);

        const allBodies = Matter.Composite.allBodies(this.engine.world);

        allBodies.forEach(body => {
            if (body.isStatic) return;

            const obj = this.bodyMap.get(body);
            if (obj) {
                obj.rotation = body.angle;
                if (obj.type === 'rect' || obj.type === 'image') {
                    obj.x = body.position.x - obj.w / 2;
                    obj.y = body.position.y - obj.h / 2;
                } else {
                    obj.x = body.position.x;
                    obj.y = body.position.y;
                }
            }
        });

        this.app.draw();
        this.loopId = requestAnimationFrame(() => this.syncLoop());
    }

    stop() {
        if (!this.isActive) return;
        this.isActive = false;
        this.updateUI();

        if (this.loopId) cancelAnimationFrame(this.loopId);
        if (this.engine) Matter.Engine.clear(this.engine);

        this.engine = null;
        this.loopId = null;
        this.bodyMap.clear();

        this.app.saveHistory();
    }
}

// ==========================================
// RADIAL MENU
// ==========================================

class RadialMenu {
    constructor() {
        const old = document.getElementById('radialOverlay');
        if (old) old.remove();

        if (!document.getElementById('radial-styles')) {
            const css = `
                .radial-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9999; display: none; }
                .radial-menu { position: absolute; width: 200px; height: 200px; transform: translate(-50%, -50%) scale(0); border-radius: 50%; pointer-events: none; transition: transform 0.15s ease-out; }
                .radial-menu.open { transform: translate(-50%, -50%) scale(1); }
                .radial-btn { position: absolute; width: 50px; height: 50px; background: white; border: 1px solid #cbd5e1; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15); cursor: pointer; pointer-events: auto; color: #475569; transition: 0.2s; }
                .radial-btn:hover { background: #f1f5f9; transform: scale(1.15); color: #0f172a; border-color: #3b82f6; }
                .radial-center { top: 50%; left: 50%; margin-top: -20px; margin-left: -20px; width: 40px; height: 40px; background: #ef4444; color: white; border: none; }
            `;
            const style = document.createElement('style');
            style.id = 'radial-styles';
            style.innerText = css;
            document.head.appendChild(style);
        }

        this.overlay = document.createElement('div');
        this.overlay.id = 'radialOverlay';
        this.overlay.className = 'radial-overlay';
        this.overlay.onclick = () => this.hide();

        this.menu = document.createElement('div');
        this.menu.id = 'radialMenu';
        this.menu.className = 'radial-menu';
        this.overlay.appendChild(this.menu);
        document.body.appendChild(this.overlay);

        this.enabled = true;

        this.items = [
            { id: 'pen', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>', angle: 270, action: () => app.setTool('pen') },
            { id: 'rect', icon: '<div style="width:16px; height:16px; border:2px solid currentColor; border-radius:2px;"></div>', angle: 315, action: () => app.setTool('rect') },
            { id: 'select', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path></svg>', angle: 0, action: () => app.setTool('select') },
            { id: 'circle', icon: '<div style="width:16px; height:16px; border:2px solid currentColor; border-radius:50%;"></div>', angle: 45, action: () => app.setTool('circle') },
            { id: 'eraser', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 20H7L3 16C3 16 3 16 3 16C1.5 14.5 1.5 12 3 10.5L10 3.5C11.5 2 14 2 15.5 3.5L20.5 8.5C22 10 22 12.5 20.5 14L16 18.5"></path><path d="M18 14l-6-6"></path></svg>', angle: 90, action: () => app.setTool('eraser') },
            { id: 'line', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="19" x2="19" y2="5"></line></svg>', angle: 225, action: () => app.setTool('line') },
            { id: 'undo', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>', angle: 180, action: () => app.undo() },
        ];

        this.initButtons();
        this.initEvents();
    }

    toggle() {
        this.enabled = !this.enabled;
        const btn = document.getElementById('btn-radial-toggle');
        if (btn) {
            btn.style.opacity = this.enabled ? "1" : "0.5";
            if (!this.enabled) {
                btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>';
            } else {
                btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v8"></path><path d="M8 12h8"></path></svg>';
            }
        }
    }

    initButtons() {
        const centerBtn = document.createElement('div');
        centerBtn.className = 'radial-btn radial-center';
        centerBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        centerBtn.onclick = (e) => { e.stopPropagation(); this.hide(); };
        this.menu.appendChild(centerBtn);

        const radius = 70;
        this.items.forEach(item => {
            const btn = document.createElement('div');
            btn.className = 'radial-btn';
            btn.innerHTML = item.icon;
            btn.title = item.id;
            const rad = item.angle * (Math.PI / 180);
            btn.style.left = `calc(50% + ${Math.cos(rad) * radius}px - 25px)`;
            btn.style.top = `calc(50% + ${Math.sin(rad) * radius}px - 25px)`;
            btn.onclick = (e) => { e.stopPropagation(); item.action(); this.hide(); };
            this.menu.appendChild(btn);
        });
    }

    initEvents() {
        window.addEventListener('contextmenu', (e) => {
            if (!this.enabled) return;
            e.preventDefault();
            this.show(e.clientX, e.clientY);
        });

        let touchTimer = null;
        let startX = 0, startY = 0;
        const canvas = document.getElementById('tempCanvas');
        if(!canvas) return;

        const cancel = (e) => {
            if (touchTimer) {
                if(e.type === 'touchmove') {
                    const t = e.touches[0];
                    if (Math.abs(t.clientX - startX) > 15 || Math.abs(t.clientY - startY) > 15) {
                        clearTimeout(touchTimer);
                        touchTimer = null;
                    }
                } else {
                    clearTimeout(touchTimer);
                    touchTimer = null;
                }
            }
        };

        canvas.addEventListener('touchstart', (e) => {
            if (!this.enabled) return;
            if (e.touches.length > 1) return;
            const t = e.touches[0];
            startX = t.clientX;
            startY = t.clientY;
            touchTimer = setTimeout(() => {
                if (typeof app !== 'undefined') app.cancelCurrentAction();
                this.show(startX, startY);
                if (navigator.vibrate) navigator.vibrate(50);
            }, 500);
        }, { passive: false });

        canvas.addEventListener('touchmove', cancel, { passive: false });
        canvas.addEventListener('touchend', cancel);
    }

    show(x, y) {
        this.overlay.style.display = 'block';
        this.menu.style.left = x + 'px';
        this.menu.style.top = y + 'px';
        setTimeout(() => this.menu.classList.add('open'), 10);
    }

    hide() {
        this.menu.classList.remove('open');
        setTimeout(() => this.overlay.style.display = 'none', 200);
    }
}

// ==========================================
// AI CHAT FUNCTIONS
// ==========================================

let currentAILevel = 'KS1';

function setAILevel(level) {
    currentAILevel = level;
    document.querySelectorAll('.lvl-btn').forEach(btn => {
        if (btn.innerText === level) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function toggleChat() {
    const w = document.getElementById('agent-chat-window');
    w.style.display = (w.style.display === 'flex') ? 'none' : 'flex';
}

function handleEnter(e) {
    if (e.key === 'Enter') sendMessage();
}

function appendMessage(text, sender) {
    const container = document.getElementById('agent-messages');
    const msg = document.createElement('div');
    msg.className = `message ${sender}-message`;
    msg.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    if (window.MathJax) MathJax.typesetPromise([msg]);
}

async function sendMessage() {
    const input = document.getElementById('agent-input');
    const text = input.value.trim();
    if (!text) return;

    appendMessage(text, 'user');
    input.value = '';

    const typingId = showTyping();
    const response = await fetchGemini(text);
    removeTyping(typingId);
    appendMessage(response, 'bot');
}

function showTyping() {
    const container = document.getElementById('agent-messages');
    const id = 'typing-' + Date.now();
    const msg = document.createElement('div');
    msg.id = id;
    msg.className = 'message bot-message';
    msg.style.fontStyle = 'italic';
    msg.style.color = '#94a3b8';
    msg.innerText = 'Thinking...';
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    return id;
}

function removeTyping(id) {
    const el = document.getElementById(id);
    if(el) el.remove();
}

async function fetchGemini(userText) {
    const levelPrompts = {
        'KS1': "Explain simply for a 5-7 year old child. Use short sentences, fun analogies, and very basic vocabulary.",
        'KS2': "Explain for a 7-11 year old student. Use clear language, helpful examples, and avoid overly complex jargon.",
        'KS3': "Explain for a 11-14 year old student. You can use subject-specific terminology but explain it clearly.",
        'KS4': "Explain for a 14-16 year old student (GCSE level). Use formal academic language and precise terminology suitable for exams.",
        'KS5': "Explain for a 16-18 year old student (A-Level/College). Use advanced academic language, deep technical detail, and assume strong prior knowledge."
    };

    const levelInstruction = levelPrompts[currentAILevel] || levelPrompts['KS1'];

    const systemPrompt = `
    You are a helpful AI Tutor embedded in a whiteboard app.
    - **Target Audience:** ${currentAILevel} (${levelInstruction})
    - Keep answers concise, clear, and friendly.
    - **MATH FORMATTING RULES:** - Use LaTeX for all mathematical expressions.
      - **IMPORTANT: DO NOT use dollar signs ($) anywhere.**
      - Instead, strictly use the bracket syntax:
      - Use \\( and \\) for inline math. Example: \\( x^2 + y^2 = r^2 \\)
      - Use \\[ and \\] for block equations. Example: \\[ E = mc^2 \\]
    `;

    const url = 'https://text.pollinations.ai/';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userText }
                ],
                model: 'openai',
                seed: 42
            })
        });

        if (!response.ok) throw new Error("AI Service Busy");

        const text = await response.text();
        return text;

    } catch (e) {
        console.error("AI Error:", e);
        return "I'm having trouble connecting to the brain. Please try again in a moment!";
    }
}

// ==========================================
// GLOBAL INITIALIZATION
// ==========================================

let app, ui, radialMenu;

window.addEventListener('DOMContentLoaded', () => {
    // Initialize after DOM is ready - see Part 2 for MathsMaster class
});
