// WorkSlate - MathsMaster Main Application Class
// Copyright (c) 2025 Andrew Wilkins
// ==========================================

class MathsMaster {
    constructor() {
        this.bgCanvas = document.getElementById('bgCanvas');
        this.bgCtx = this.bgCanvas.getContext('2d');
        this.canvas = document.getElementById('mainCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.tempCanvas = document.getElementById('tempCanvas');
        this.tempCtx = this.tempCanvas.getContext('2d');
        this.wrapper = document.getElementById('canvas-wrapper');
        this.cacheCanvas = document.createElement('canvas');
        this.cacheCtx = this.cacheCanvas.getContext('2d');
        this.needsBake = true;
        this.textEditor = document.getElementById('textEditor');
        this.fileHandle = null;
        this.history = [];
        this.historyStep = -1;

        // Webcam
        this.videoEl = document.createElement('video');
        this.videoEl.autoplay = true;
        this.videoEl.playsInline = true;
        this.webcamStream = null;
        this.isWebcamFrozen = false;
        this.webcamLoopId = null;

        this.state = {
            tool: 'pen',
            snapToGrid: false,
            color: '#000000',
            penSize: 3,
            textSize: 36,
            penType: 'pen',
            lineType: 'solid',
            fontFamily: "'Lexend', sans-serif",
            slides: [[]],
            currentSlide: 0,
            gridType: 'square',
            gridSize: 50,
            isDrawing: false,
            startX: 0,
            startY: 0,
            lastX: 0,
            lastY: 0,
            selectedObjects: [],
            selectionRect: null,
            isSelecting: false,
            dragHandle: null,
            showRuler: false,
            showProtractor: false,
            showCompass: false,
            activeMathTool: null,
            mathAction: null,
            tempObject: null,
            ruler: { x: 100, y: 100, w: 400, h: 65, rotation: 0 },
            protractor: { x: 400, y: 300, r: 150, rotation: 0 },
            compass: { x: 300, y: 300, r: 100, rotation: 0 },
            editingText: null
        };

        this.physics = new PhysicsController(this);
        this.init();
    }

    deleteObjectAt(x, y) {
        const slide = this.getCurrentObjects();
        for (let i = slide.length - 1; i >= 0; i--) {
            if (this.hitTest(x, y, slide[i])) {
                slide.splice(i, 1);
                this.draw();
                this.saveLocal();
                this.saveHistory();
                return;
            }
        }
    }

    eraseAt(mx, my) {
        const eraserRadius = (this.state.penSize || 10) * 2;
        const currentObjs = this.getCurrentObjects();
        const survivors = [];
        let somethingChanged = false;

        const isFragmentValid = (points) => {
            if (points.length < 2) return false;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            points.forEach(p => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            });
            return (maxX - minX > 5 || maxY - minY > 5);
        };

        currentObjs.forEach(obj => {
            if (obj.locked) {
                survivors.push(obj);
                return;
            }

            if (obj.type === 'path') {
                const b = this.getObjectBounds(obj);
                if (mx < b.x - eraserRadius || mx > b.x + b.w + eraserRadius ||
                    my < b.y - eraserRadius || my > b.y + b.h + eraserRadius) {
                    survivors.push(obj);
                    return;
                }

                const newSegments = [];
                let currentPoints = [];
                let touched = false;

                for (let i = 0; i < obj.points.length; i++) {
                    const p = obj.points[i];
                    const dist = Math.hypot(p.x - mx, p.y - my);

                    if (dist > eraserRadius) {
                        currentPoints.push(p);
                    } else {
                        touched = true;
                        if (currentPoints.length > 1 && isFragmentValid(currentPoints)) {
                            const fragment = JSON.parse(JSON.stringify(obj));
                            fragment.points = currentPoints;
                            delete fragment.isEraser;
                            newSegments.push(fragment);
                        }
                        currentPoints = [];
                    }
                }

                if (currentPoints.length > 1 && isFragmentValid(currentPoints)) {
                    const fragment = JSON.parse(JSON.stringify(obj));
                    fragment.points = currentPoints;
                    delete fragment.isEraser;
                    newSegments.push(fragment);
                }

                if (touched) {
                    somethingChanged = true;
                    survivors.push(...newSegments);
                } else {
                    survivors.push(obj);
                }
            } else {
                if (this.hitTest(mx, my, obj)) {
                    somethingChanged = true;
                } else {
                    survivors.push(obj);
                }
            }
        });

        if (somethingChanged) {
            this.state.slides[this.state.currentSlide] = survivors;
            this.needsBake = true;
            this.draw();
        }
    }

    cancelCurrentAction() {
        this.state.isDrawing = false;
        this.state.isSelecting = false;
        this.state.activeMathTool = null;
        this.state.dragHandle = null;
        this.state.currentPath = null;
        this.state.tempObject = null;
        this.state.selectionRect = null;
        this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
    }

    init() {
        this.wrapper.appendChild(this.textEditor);
        this.tempCanvas.addEventListener('mousedown', e => this.onDown(e));
        window.addEventListener('mousemove', e => { this.onMove(e); });
        window.addEventListener('mouseup', e => this.onUp(e));
        this.tempCanvas.addEventListener('dblclick', e => this.onDoubleClick(e));

        const handleTouch = (e, callback) => {
            if (e.touches.length > 1) return;
            if (e.cancelable) e.preventDefault();
            callback({
                clientX: e.changedTouches[0].clientX,
                clientY: e.changedTouches[0].clientY,
                preventDefault: () => {}
            });
        };

        this.tempCanvas.addEventListener('touchstart', e => handleTouch(e, (me) => this.onDown(me)), { passive: false });
        this.tempCanvas.addEventListener('touchmove', e => handleTouch(e, (me) => this.onMove(me)), { passive: false });
        this.tempCanvas.addEventListener('touchend', e => handleTouch(e, (me) => this.onUp(me)), { passive: false });

        document.getElementById('fileInput').addEventListener('change', e => this.handleImage(e));
        this.textEditor.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.key === 'Escape') {
                e.preventDefault();
                this.finalizeTextEntry();
            }
        });
        this.textEditor.addEventListener('input', (e) => {
            e.stopPropagation();
            this.autoResizeTextEditor();
        });

        this.textEditor.addEventListener('mousedown', (e) => e.stopPropagation());
        this.textEditor.addEventListener('touchstart', (e) => e.stopPropagation());

        window.addEventListener('keydown', e => {
            if (this.state.editingText) return;
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveProject();
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.state.selectedObjects.length > 0) {
                this.deleteSelected();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                this.undo();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                this.redo();
            }
        });

        window.addEventListener('resize', () => this.resizeCanvas());

        this.loadLocal();
        setTimeout(() => {
            this.saveHistory();
            this.resizeCanvas();
            this.draw();
        }, 300);
    }

    handleImage(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                let w = img.width;
                let h = img.height;
                const maxSize = 1024;

                if (w > maxSize || h > maxSize) {
                    const ratio = Math.min(maxSize / w, maxSize / h);
                    w *= ratio;
                    h *= ratio;
                }

                const imgObj = {
                    type: 'image',
                    x: (this.canvas.width / 2) - (w / 2),
                    y: (this.canvas.height / 2) - (h / 2),
                    w: w,
                    h: h,
                    src: event.target.result,
                    rotation: 0,
                    scaleX: 1,
                    scaleY: 1
                };

                this.getCurrentObjects().push(imgObj);
                this.setTool('select');
                this.state.selectedObjects = [imgObj];
                this.updateSelectionUI();

                this.needsBake = true;
                this.draw();

                this.saveLocal();
                this.saveHistory();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    }

    updateContextualSidebar() {
        const tool = this.state.tool;
        const sel = this.state.selectedObjects;
        const inspector = document.getElementById('mainInspector');

        const pPen = document.getElementById('panel-pen');
        const pText = document.getElementById('panel-text');
        const pColor = document.getElementById('panel-color');
        const penTypeCtrl = document.getElementById('penTypeControl');

        const isDrawingTool = ['pen', 'line', 'rect', 'circle', 'poly'].includes(tool);
        const isTextTool = (tool === 'text');
        const hasSelection = (sel.length > 0);
        const isTextSelection = (hasSelection && sel[0].type === 'text');
        const isShapeSelection = (hasSelection && !isTextSelection && sel[0].type !== 'image');

        inspector.style.display = 'none';
        pPen.style.display = 'none';
        pText.style.display = 'none';
        pColor.style.display = 'none';

        if (isDrawingTool || isShapeSelection) {
            inspector.style.display = 'flex';
            pPen.style.display = 'block';
            pColor.style.display = 'block';

            const sizeVal = isShapeSelection ? (sel[0].width || 3) : this.state.penSize;
            document.getElementById('rangeThickness').value = sizeVal;

            if (penTypeCtrl) penTypeCtrl.style.display = (tool === 'pen') ? 'block' : 'none';
        }

        if (isTextTool || isTextSelection) {
            inspector.style.display = 'flex';
            pText.style.display = 'block';
            pColor.style.display = 'block';

            const sizeVal = isTextSelection ? (sel[0].fontSize || 36) : this.state.textSize;
            document.getElementById('rangeTextSize').value = sizeVal;

            if (isTextSelection) {
                document.getElementById('fontSelect').value = sel[0].fontFamily || "'Lexend', sans-serif";
            }
        }
    }

    saveLocal() {
        try {
            localStorage.setItem('workslate_slides', JSON.stringify(this.state.slides));
        } catch (e) {
            console.warn("Storage Full");
        }
    }

    loadLocal() {
        const data = localStorage.getItem('workslate_slides');
        if (data) {
            try {
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed)) this.state.slides = parsed;
            } catch (e) {
                console.error("Save corrupted");
            }
        }
    }

    getDeepCopy(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    saveHistory() {
        try {
            if (!this.lastStableState) {
                this.lastStableState = this.getDeepCopy(this.state.slides);
                this.history.push({ type: 'full', data: this.getDeepCopy(this.state.slides) });
                this.historyStep = 0;
                return;
            }

            const currentSlides = this.state.slides;
            const prevSlides = this.lastStableState;

            if (currentSlides.length !== prevSlides.length) {
                const fullSnap = { type: 'full', data: this.getDeepCopy(currentSlides) };
                this._pushHistoryItem(fullSnap);
                this.lastStableState = this.getDeepCopy(currentSlides);
                return;
            }

            let changedIndex = -1;
            for (let i = 0; i < currentSlides.length; i++) {
                if (JSON.stringify(currentSlides[i]) !== JSON.stringify(prevSlides[i])) {
                    changedIndex = i;
                    break;
                }
            }

            if (changedIndex === -1) return;

            const delta = {
                type: 'delta',
                slideIndex: changedIndex,
                before: prevSlides[changedIndex],
                after: this.getDeepCopy(currentSlides[changedIndex])
            };

            this._pushHistoryItem(delta);
            this.lastStableState[changedIndex] = delta.after;

            console.log(`Saved Delta: Slide ${changedIndex + 1} updated.`);

        } catch (e) {
            console.warn("History Error:", e);
        }
    }

    _pushHistoryItem(item) {
        if (this.historyStep < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyStep + 1);
        }
        this.history.push(item);
        if (this.history.length > 30) {
            this.history.shift();
        } else {
            this.historyStep++;
        }
    }

    bringToFront() {
        if (this.state.selectedObjects.length === 0) return;
        const currentObjs = this.getCurrentObjects();
        const sel = this.state.selectedObjects[0];
        const index = currentObjs.indexOf(sel);

        if (index > -1 && index < currentObjs.length - 1) {
            currentObjs.splice(index, 1);
            currentObjs.push(sel);
            this.draw();
            this.saveHistory();
        }
    }

    sendToBack() {
        if (this.state.selectedObjects.length === 0) return;
        const currentObjs = this.getCurrentObjects();
        const sel = this.state.selectedObjects[0];
        const index = currentObjs.indexOf(sel);

        if (index > 0) {
            currentObjs.splice(index, 1);
            currentObjs.unshift(sel);
            this.draw();
            this.saveHistory();
        }
    }

    undo() {
        if (this.historyStep > 0) {
            const item = this.history[this.historyStep];
            this.historyStep--;
            if (item.type === 'full') {
                this.restoreHistoryState(this.history[this.historyStep]);
            } else if (item.type === 'delta') {
                this.state.slides[item.slideIndex] = this.getDeepCopy(item.before);
                if (this.lastStableState) this.lastStableState[item.slideIndex] = this.getDeepCopy(item.before);
                this.finishRestore();
            }
        }
    }

    redo() {
        if (this.historyStep < this.history.length - 1) {
            this.historyStep++;
            const item = this.history[this.historyStep];
            if (item.type === 'full') {
                this.restoreHistoryState(item);
            } else if (item.type === 'delta') {
                this.state.slides[item.slideIndex] = this.getDeepCopy(item.after);
                if (this.lastStableState) this.lastStableState[item.slideIndex] = this.getDeepCopy(item.after);
                this.finishRestore();
            }
        }
    }

    restoreHistoryState(historyItem) {
        if (!historyItem) return;
        if (historyItem.type === 'full' || !historyItem.type) {
            const data = historyItem.data || historyItem;
            this.state.slides = typeof data === 'string' ? JSON.parse(data) : this.getDeepCopy(data);
            this.lastStableState = this.getDeepCopy(this.state.slides);
        }
        this.finishRestore();
    }

    finishRestore() {
        this.state.selectedObjects = [];
        this.updateSelectionUI();
        this.needsBake = true;
        this.draw();
        this.saveLocal();
    }

    updateSelectionUI() {
        document.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`.icon-btn[onclick*="'${this.state.tool}'"]`);
        if (activeBtn) activeBtn.classList.add('active');

        this.updateContextBar();
        this.updateContextualSidebar();
        this.needsBake = true;
    }

    updateContextBar() {
        let bar = document.getElementById('floatingContextBar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'floatingContextBar';
            bar.className = 'context-bar';
            bar.style.zIndex = "9999";
            document.body.appendChild(bar);
        }

        if (this.state.selectedObjects.length === 0) {
            bar.style.display = 'none';
            return;
        }

        const obj = this.state.selectedObjects[0];
        const b = this.getObjectBounds(obj);

        const icons = {
            clone: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
            lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
            unlock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>',
            flipH: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a2 2 0 0 0-2-2h-3"></path><circle cx="16" cy="7" r="4"></circle></svg>',
            flipV: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>',
            group: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',
            split: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 8l8 8"></path><path d="M16 8l-8 8"></path></svg>',
            front: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline></svg>',
            back: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline></svg>',
            trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
            bold: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path></svg>',
            italic: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line></svg>',
            globe: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>'
        };

        const rowStyle = 'display:flex; gap:8px; align-items:center; justify-content:center; padding-bottom:8px;';
        let topRowHTML = '';

        if (obj.type === 'text') {
            topRowHTML = `
                <div style="${rowStyle}">
                    <button class="ctx-btn" onclick="app.toggleTextBold()" title="Bold">${icons.bold}</button>
                    <button class="ctx-btn" onclick="app.toggleTextItalic()" title="Italic">${icons.italic}</button>
                    <input type="color" class="ctx-color" value="${obj.color}" oninput="app.setColor(this.value)">
                    <div class="ctx-sep"></div>
                    <select id="ctxLangSelect" class="ctx-select" style="max-width: 80px;">
                        <option value="French">French</option>
                        <option value="Spanish">Spanish</option>
                        <option value="German">German</option>
                        <option value="Italian">Italian</option>
                        <option value="Chinese (Mandarin)">Chinese</option>
                        <option value="Arabic">Arabic</option>
                        <option value="Japanese">Japanese</option>
                        <option value="Hindi">Hindi</option>
                        <option value="Turkish">Turkish</option>
                        <option value="Korean">Korean</option>
                        <option value="Portuguese">Portuguese</option>
                        <option value="Russian">Russian</option>
                        <option value="Dutch">Dutch</option>
                        <option value="Polish">Polish</option>
                        <option value="Vietnamese">Vietnamese</option>
                        <option value="Thai">Thai</option>
                    </select>
                    <button class="ctx-btn" onclick="app.translateSelectedText()" title="Translate">${icons.globe}</button>
                </div>
            `;
        } else {
            topRowHTML = `
                <div style="${rowStyle}">
                    <input type="color" class="ctx-color" value="${obj.color}" oninput="app.setColor(this.value)">
                    <button class="ctx-btn" onclick="app.toggleFill()" title="Toggle Fill">
                        ${obj.filled ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>'}
                    </button>
                </div>
            `;
        }

        const actionGridHTML = `
            <div class="ctx-grid">
                <button class="ctx-grid-btn" onclick="app.duplicateSelected()">${icons.clone} Clone</button>
                <button class="ctx-grid-btn" onclick="app.toggleLock()">
                    ${obj.locked ? icons.unlock + ' Unlock' : icons.lock + ' Lock'}
                </button>

                <button class="ctx-grid-btn" onclick="app.flipSelected('h')">${icons.flipH} Flip H</button>
                <button class="ctx-grid-btn" onclick="app.flipSelected('v')">${icons.flipV} Flip V</button>

                <button class="ctx-grid-btn" onclick="app.groupSelected()">${icons.group} Group</button>
                <button class="ctx-grid-btn" onclick="app.ungroupSelected()">${icons.split} Split</button>

                <button class="ctx-grid-btn" onclick="app.bringToFront()">${icons.front} Front</button>
                <button class="ctx-grid-btn" onclick="app.sendToBack()">${icons.back} Back</button>

                <button class="ctx-grid-btn delete-btn" onclick="app.deleteSelected()">${icons.trash} Delete</button>
            </div>
        `;

        bar.innerHTML = topRowHTML + actionGridHTML;
        bar.style.display = 'flex';

        const barWidth = 220;
        const barHeight = bar.offsetHeight || 260;

        let left = b.cx - (barWidth / 2);
        let top = b.y - barHeight - 10;

        if (top + barHeight > window.innerHeight) {
            top = b.y - barHeight - 10;
        }

        if (top < 10) {
            top = b.y + b.h + 20;
            if (top + barHeight > window.innerHeight) {
                top = 10;
            }
        }

        if (left < 10) left = 10;
        if (left + barWidth > window.innerWidth) {
            left = window.innerWidth - barWidth - 10;
        }

        bar.style.left = left + 'px';
        bar.style.top = top + 'px';
    }

    bakeStatic() {
        this.cacheCtx.clearRect(0, 0, this.cacheCanvas.width, this.cacheCanvas.height);

        const objs = this.getCurrentObjects();
        if (!objs) return;

        objs.forEach(o => {
            if (!this.state.selectedObjects.includes(o)) {
                if (o.type === 'path' && o.isEraser) {
                    this.cacheCtx.globalCompositeOperation = 'destination-out';
                    this.drawEraserPath(o, this.cacheCtx);
                    this.cacheCtx.globalCompositeOperation = 'source-over';
                } else {
                    this.drawObject(o, this.cacheCtx);
                }
            }
        });

        this.needsBake = false;
    }

    draw() {
        if (this.physics && this.physics.isActive) {
            this.needsBake = true;
        }

        if (this.needsBake) {
            this.bakeStatic();
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.cacheCanvas, 0, 0);

        this.state.selectedObjects.forEach(o => {
            this.drawObject(o, this.ctx);
            this.drawSelection(o);
        });

        this.ctx.save();
        if (this.state.isSelecting && this.state.selectionRect) {
            const r = this.state.selectionRect;
            this.ctx.strokeStyle = '#007acc';
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([5, 5]);
            this.ctx.strokeRect(r.x, r.y, r.w, r.h);
            this.ctx.fillStyle = 'rgba(0, 122, 204, 0.1)';
            this.ctx.fillRect(r.x, r.y, r.w, r.h);
        }

        if (this.state.tempObject) this.drawObject(this.state.tempObject);

        if (this.state.currentPath) {
            if (this.state.currentPath.isEraser) {
                this.ctx.globalCompositeOperation = 'destination-out';
                this.drawEraserPath(this.state.currentPath, this.ctx);
                this.ctx.globalCompositeOperation = 'source-over';
            } else {
                this.drawObject(this.state.currentPath, this.ctx);
            }
        }
        this.ctx.restore();

        if (this.state.showRuler) this.drawRuler();
        if (this.state.showProtractor) this.drawProtractor();
        if (this.state.showCompass) this.drawCompass();
    }

    drawEraserPath(o, ctx = this.ctx) {
        ctx.lineWidth = (o.width || 20) * 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        if (o.points.length > 0) {
            ctx.moveTo(o.points[0].x, o.points[0].y);
            for (let i = 1; i < o.points.length; i++) ctx.lineTo(o.points[i].x, o.points[i].y);
        }
        ctx.stroke();
    }

    drawObject(o, ctx = this.ctx) {
        if (o.isBeingEdited) return;
        ctx.save();
        const b = this.getObjectBounds(o);

        if (o.rotation || o.scaleX || o.scaleY) {
            ctx.translate(b.cx, b.cy);
            ctx.rotate(o.rotation || 0);
            ctx.scale(o.scaleX || 1, o.scaleY || 1);
            ctx.translate(-b.cx, -b.cy);
        }

        ctx.strokeStyle = o.color;
        ctx.lineWidth = o.width;
        ctx.fillStyle = o.color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (o.type === 'path') {
            if (o.penType === 'highlighter') {
                ctx.globalAlpha = 0.3;
                ctx.lineWidth = 20;
            }
            ctx.beginPath();
            if (o.points.length > 2) {
                ctx.moveTo(o.points[0].x, o.points[0].y);

                for (let i = 1; i < o.points.length - 2; i++) {
                    const xc = (o.points[i].x + o.points[i + 1].x) / 2;
                    const yc = (o.points[i].y + o.points[i + 1].y) / 2;
                    ctx.quadraticCurveTo(o.points[i].x, o.points[i].y, xc, yc);
                }

                ctx.quadraticCurveTo(
                    o.points[o.points.length - 2].x,
                    o.points[o.points.length - 2].y,
                    o.points[o.points.length - 1].x,
                    o.points[o.points.length - 1].y
                );
            }
            ctx.stroke();
        } else if (o.type === 'rect') {
            ctx.beginPath();
            ctx.rect(o.x, o.y, o.w, o.h);
            if (o.filled) ctx.fill();
            ctx.stroke();
        } else if (o.type === 'circle') {
            ctx.beginPath();
            ctx.arc(o.x, o.y, (o.radius || o.r), 0, Math.PI * 2);
            if (o.filled) ctx.fill();
            ctx.stroke();
        } else if (o.type === 'poly') {
            ctx.beginPath();
            const step = (Math.PI * 2) / o.sides;
            for (let i = 0; i < o.sides; i++) {
                const px = o.x + o.radius * Math.cos(i * step - Math.PI / 2);
                const py = o.y + o.radius * Math.sin(i * step - Math.PI / 2);
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            if (o.filled) ctx.fill();
            ctx.stroke();
        } else if (o.type === 'line') {
            ctx.beginPath();
            if (o.lineType && o.lineType.includes('dotted')) ctx.setLineDash([5, 10]);
            ctx.moveTo(o.x1, o.y1);
            ctx.lineTo(o.x2, o.y2);
            ctx.stroke();
            ctx.setLineDash([]);
        } else if (o.type === 'image') {
            if (!(o.img instanceof HTMLImageElement) && o.src) {
                const i = new Image();
                i.src = o.src;
                o.img = i;
                i.onload = () => this.draw();
            }
            if (o.img && o.img.complete && o.img.naturalWidth > 0) {
                ctx.drawImage(o.img, o.x, o.y, o.w, o.h);
            }
        } else if (o.type === 'text') {
            const weight = o.fontWeight || '';
            const style = o.fontStyle || '';
            ctx.font = `${style} ${weight} ${o.fontSize}px ${o.fontFamily || 'Lexend'}`;
            ctx.textBaseline = 'top';
            ctx.fillStyle = o.color;
            const lines = o.text.split('\n');
            lines.forEach((l, i) => ctx.fillText(l, o.x, o.y + i * o.fontSize * 1.2));
        } else if (o.type === 'group') {
            ctx.translate(o.x, o.y);
            o.children.forEach(child => this.drawObject(child, ctx));
            ctx.translate(-o.x, -o.y);
        }
        ctx.restore();
    }

    drawSelection(o) {
        this.ctx.save();
        const b = this.getObjectBounds(o);
        if (o.rotation) {
            this.ctx.translate(b.cx, b.cy);
            this.ctx.rotate(o.rotation);
            this.ctx.translate(-b.cx, -b.cy);
        }

        this.ctx.strokeStyle = o.locked ? 'red' : '#007acc';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);

        if (o.type === 'line') {
            this.ctx.beginPath();
            this.ctx.moveTo(o.x1, o.y1);
            this.ctx.lineTo(o.x2, o.y2);
            this.ctx.stroke();
            if (!o.locked) {
                this.drawHandle(o.x1, o.y1);
                this.drawHandle(o.x2, o.y2);
            }
        } else {
            if (o.type === 'circle' || o.type === 'poly') {
                this.ctx.beginPath();
                this.ctx.arc(o.x, o.y, (o.radius || o.r), 0, Math.PI * 2);
                this.ctx.stroke();
            } else {
                this.ctx.strokeRect(b.x, b.y, b.w, b.h);
            }

            if (!o.locked) {
                if (o.type === 'circle' || o.type === 'poly') this.drawHandle(o.x + (o.radius || o.r), o.y);
                else if (o.type !== 'text') this.drawHandle(b.x + b.w, b.y + b.h);

                this.ctx.beginPath();
                this.ctx.moveTo(b.cx, b.y);
                this.ctx.lineTo(b.cx, b.y - 20);
                this.ctx.setLineDash([]);
                this.ctx.stroke();

                this.ctx.beginPath();
                this.ctx.arc(b.cx, b.y - 20, 5, 0, Math.PI * 2);

                this.ctx.fillStyle = (this.state.hoveredAction === 'rotate') ? '#f59e0b' : '#007acc';
                this.ctx.fill();
            }
        }
        this.ctx.restore();
    }

    drawHandle(x, y) {
        this.ctx.setLineDash([]);
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = '#007acc';
        this.ctx.fillRect(x - 4, y - 4, 8, 8);
        this.ctx.strokeRect(x - 4, y - 4, 8, 8);
    }

    drawRuler() {
        const r = this.state.ruler;
        this.ctx.save();
        this.ctx.translate(r.x, r.y);
        this.ctx.rotate(r.rotation);
        this.ctx.shadowColor = 'rgba(0,0,0,0.1)';
        this.ctx.shadowBlur = 15;
        this.ctx.shadowOffsetY = 5;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.roundRect(0, 0, r.w, r.h, 10);
        this.ctx.fill();
        this.ctx.shadowColor = 'transparent';
        this.ctx.strokeStyle = '#e2e8f0';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        this.ctx.fillStyle = '#1e293b';
        this.ctx.textAlign = 'center';
        this.ctx.font = '10px sans-serif';
        this.ctx.fillText("0 cm", 15, 25);
        for (let i = 0; i <= r.w; i += 37.8) {
            if (i > r.w - 10) break;
            this.ctx.fillRect(i + 15, 0, 1, 10);
            if (i > 0) this.ctx.fillText(Math.round(i / 37.8), i + 15, 22);
            for (let j = 1; j < 10; j++) this.ctx.fillRect(i + 15 + (j * 3.78), 0, 0.5, 5);
        }
        this.ctx.fillText("0 in", 15, r.h - 18);
        for (let i = 0; i <= r.w; i += 96) {
            if (i > r.w - 10) break;
            this.ctx.fillRect(i + 15, r.h - 12, 1, 12);
            if (i > 0) this.ctx.fillText(Math.round(i / 96), i + 15, r.h - 18);
            this.ctx.fillRect(i + 15 + 48, r.h - 8, 0.5, 8);
        }

        this.ctx.beginPath();
        this.ctx.arc(r.w + 40, r.h / 2, 14, 0, Math.PI * 2);
        this.ctx.fillStyle = 'white';
        this.ctx.fill();
        this.ctx.strokeStyle = (this.state.hoveredAction === 'rotate') ? '#f59e0b' : '#3b82f6';
        this.ctx.lineWidth = (this.state.hoveredAction === 'rotate') ? 4 : 2;
        this.ctx.stroke();

        this.ctx.fillStyle = '#3b82f6';
        this.ctx.font = '18px monospace';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('↻', r.w + 40, r.h / 2 + 2);
        this.ctx.restore();
    }

    drawProtractor() {
        const p = this.state.protractor;
        this.ctx.save();
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate(p.rotation);
        this.ctx.shadowColor = 'rgba(0,0,0,0.1)';
        this.ctx.shadowBlur = 15;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.r, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.fill();
        this.ctx.shadowColor = 'transparent';
        this.ctx.strokeStyle = '#cbd5e1';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.r - 30, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(224, 242, 254, 0.3)';
        this.ctx.fill();
        this.ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
        this.ctx.fillRect(-p.r + 40, -15, (p.r * 2) - 80, 30);
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'red';
        this.ctx.lineWidth = 1;
        this.ctx.moveTo(-p.r, 0);
        this.ctx.lineTo(p.r, 0);
        this.ctx.stroke();
        this.ctx.fillStyle = '#1e293b';
        this.ctx.fillRect(-10, 0, 20, 1);
        this.ctx.fillRect(0, -10, 1, 20);

        this.ctx.fillStyle = '#000000';
        this.ctx.font = 'bold 10px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        for (let i = 0; i < 360; i += 1) {
            if (i % 2 !== 0) continue;
            this.ctx.save();
            this.ctx.rotate((i * Math.PI) / 180);
            const isTen = i % 10 === 0;
            this.ctx.fillRect(p.r - (isTen ? 10 : 5), 0, (isTen ? 10 : 5), 1);
            if (isTen) {
                this.ctx.save();
                this.ctx.translate(p.r - 20, 0);
                this.ctx.rotate(-(i * Math.PI) / 180);
                this.ctx.fillText(i, 0, 0);
                this.ctx.restore();
            }
            this.ctx.restore();
        }

        this.ctx.beginPath();
        this.ctx.arc(p.r + 40, 0, 14, 0, Math.PI * 2);
        this.ctx.fillStyle = 'white';
        this.ctx.fill();
        this.ctx.strokeStyle = (this.state.hoveredAction === 'rotate') ? '#f59e0b' : '#3b82f6';
        this.ctx.lineWidth = (this.state.hoveredAction === 'rotate') ? 4 : 2;
        this.ctx.stroke();

        this.ctx.fillStyle = '#3b82f6';
        this.ctx.font = '18px monospace';
        this.ctx.fillText('↻', p.r + 40, 2);
        this.ctx.restore();
    }

    drawCompass() {
        const c = this.state.compass;
        this.ctx.save();
        this.ctx.translate(c.x, c.y);
        this.ctx.rotate(c.rotation);
        this.ctx.shadowColor = 'rgba(0,0,0,0.2)';
        this.ctx.shadowBlur = 10;
        this.ctx.fillStyle = 'rgba(226, 232, 240, 0.95)';
        this.ctx.strokeStyle = '#94a3b8';
        this.ctx.beginPath();
        this.ctx.roundRect(-20, -20, c.r + 40, 40, 20);
        this.ctx.fill();
        this.ctx.shadowColor = 'transparent';
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 16, 0, Math.PI * 2);
        this.ctx.fillStyle = '#ef4444';
        this.ctx.fill();
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(0, -6);
        this.ctx.lineTo(0, 6);
        this.ctx.moveTo(-6, 0);
        this.ctx.lineTo(6, 0);
        this.ctx.stroke();
        const yellowX = c.r * 0.4;
        this.ctx.beginPath();
        this.ctx.arc(yellowX, 0, 14, 0, Math.PI * 2);
        this.ctx.fillStyle = '#f59e0b';
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.fillStyle = 'white';
        this.ctx.font = '16px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('↻', yellowX, 1);
        const greenX = c.r * 0.7;
        this.ctx.fillStyle = '#10b981';
        this.ctx.fillRect(greenX - 12, -12, 24, 24);
        this.ctx.strokeRect(greenX - 12, -12, 24, 24);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '14px monospace';
        this.ctx.fillText('↔', greenX, 1);
        this.ctx.beginPath();
        this.ctx.arc(c.r, 0, 8, 0, Math.PI * 2);
        this.ctx.fillStyle = '#1e293b';
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.moveTo(c.r, 0);
        this.ctx.lineTo(c.r + 4, 16);
        this.ctx.lineTo(c.r - 4, 16);
        this.ctx.fill();
        this.ctx.restore();
    }

    getObjectBounds(o) {
        if (o.type === 'group') {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            if (o.children.length === 0) return { x: o.x, y: o.y, w: 0, h: 0, cx: o.x, cy: o.y };
            o.children.forEach(c => {
                const cb = this.getObjectBounds(c);
                minX = Math.min(minX, cb.x + o.x);
                minY = Math.min(minY, cb.y + o.y);
                maxX = Math.max(maxX, cb.x + cb.w + o.x);
                maxY = Math.max(maxY, cb.y + cb.h + o.y);
            });
            return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
        }
        if (o.type === 'path') {
            if (!o.points || o.points.length === 0) return { x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0 };
            let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
            o.points.forEach(p => {
                mx = Math.min(mx, p.x);
                my = Math.min(my, p.y);
                Mx = Math.max(Mx, p.x);
                My = Math.max(My, p.y);
            });
            const pad = (o.width || 3) / 2 + 5;
            return { x: mx - pad, y: my - pad, w: (Mx - mx) + pad * 2, h: (My - my) + pad * 2, cx: (mx + Mx) / 2, cy: (my + My) / 2 };
        }
        if (o.type === 'line') return { x: Math.min(o.x1, o.x2) - 5, y: Math.min(o.y1, o.y2) - 5, w: Math.abs(o.x2 - o.x1) + 10, h: Math.abs(o.y2 - o.y1) + 10, cx: (o.x1 + o.x2) / 2, cy: (o.y1 + o.y2) / 2 };
        if (o.type === 'text') {
            this.ctx.font = `${o.fontSize}px ${o.fontFamily || 'Arial'}`;
            const lines = o.text.split('\n');
            let maxW = 0;
            lines.forEach(line => maxW = Math.max(maxW, this.ctx.measureText(line).width));
            const h = o.fontSize * 1.2 * lines.length;
            return { x: o.x, y: o.y, w: maxW, h: h, cx: o.x + maxW / 2, cy: o.y + h / 2 };
        }
        const r = o.radius || o.r || 0;
        if (o.type === 'circle' || o.type === 'poly') return { x: o.x - r, y: o.y - r, w: r * 2, h: r * 2, cx: o.x, cy: o.y };
        return { x: o.x, y: o.y, w: o.w, h: o.h, cx: o.x + o.w / 2, cy: o.y + o.h / 2 };
    }

    findObject(mx, my) {
        const objs = this.getCurrentObjects();
        for (let i = objs.length - 1; i >= 0; i--) {
            if (this.hitTest(mx, my, objs[i])) return objs[i];
        }
        return null;
    }

    hitTest(mx, my, o) {
        const b = this.getObjectBounds(o);
        const rot = o.rotation || 0;
        const dx = mx - b.cx;
        const dy = my - b.cy;
        const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot) + b.cx;
        const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot) + b.cy;
        return (lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h);
    }

    checkMathToolHit(x, y) {
        if (this.state.showCompass) {
            const c = this.state.compass;
            const dx = x - c.x;
            const dy = y - c.y;
            const lx = dx * Math.cos(-c.rotation) - dy * Math.sin(-c.rotation);
            const ly = dx * Math.sin(-c.rotation) + dy * Math.cos(-c.rotation);

            if (Math.hypot(lx, ly) < 20) {
                this.state.activeMathTool = 'compass';
                this.state.mathAction = 'move';
                this.state.lastX = x;
                this.state.lastY = y;
                return true;
            }
            if (Math.hypot(lx - (c.r * 0.4), ly) < 15) {
                this.state.activeMathTool = 'compass';
                this.state.mathAction = 'rotate_nodraw';
                return true;
            }
            if (Math.hypot(lx - (c.r * 0.7), ly) < 15) {
                this.state.activeMathTool = 'compass';
                this.state.mathAction = 'resize';
                return true;
            }
            if (Math.hypot(lx - c.r, ly) < 20) {
                this.state.activeMathTool = 'compass';
                this.state.mathAction = 'draw';
                this.state.currentPath = { type: 'path', points: [], color: this.state.color, width: 2 };
                return true;
            }
        }
        if (this.state.showRuler) {
            const r = this.state.ruler;
            const dx = x - r.x;
            const dy = y - r.y;
            const lx = dx * Math.cos(-r.rotation) - dy * Math.sin(-r.rotation);
            const ly = dx * Math.sin(-r.rotation) + dy * Math.cos(-r.rotation);
            if (Math.hypot(lx - (r.w + 40), ly - r.h / 2) < 20) {
                this.state.activeMathTool = 'ruler';
                this.state.mathAction = 'rotate';
                return true;
            }
            if (lx > r.w - 20 && lx < r.w && ly > 0 && ly < r.h) {
                this.state.activeMathTool = 'ruler';
                this.state.mathAction = 'resize';
                return true;
            }
            if (lx > 0 && lx < r.w && ly > 0 && ly < r.h) {
                this.state.activeMathTool = 'ruler';
                this.state.mathAction = 'move';
                this.state.lastX = x;
                this.state.lastY = y;
                return true;
            }
        }
        if (this.state.showProtractor) {
            const p = this.state.protractor;
            const dx = x - p.x;
            const dy = y - p.y;
            const lx = dx * Math.cos(-p.rotation) - dy * Math.sin(-p.rotation);
            const ly = dx * Math.sin(-p.rotation) + dy * Math.cos(-p.rotation);
            if (Math.hypot(lx - (p.r + 40), ly) < 20) {
                this.state.activeMathTool = 'protractor';
                this.state.mathAction = 'rotate';
                return true;
            }
            const d = Math.hypot(dx, dy);
            if (d < p.r - 20) {
                this.state.activeMathTool = 'protractor';
                this.state.mathAction = 'move';
                this.state.lastX = x;
                this.state.lastY = y;
                return true;
            }
        }
        return false;
    }

    checkHandleHit(mx, my, o) {
        if (o.locked) return null;
        const b = this.getObjectBounds(o);
        const rot = o.rotation || 0;
        const transform = (x, y) => {
            const dx = x - b.cx;
            const dy = y - b.cy;
            return {
                x: dx * Math.cos(rot) - dy * Math.sin(rot) + b.cx,
                y: dx * Math.sin(rot) + dy * Math.cos(rot) + b.cy
            };
        };

        if (o.type === 'line') {
            if (Math.hypot(mx - o.x1, my - o.y1) < 10) return 'start';
            if (Math.hypot(mx - o.x2, my - o.y2) < 10) return 'end';
            return null;
        }
        const rotH = transform(b.cx, b.y - 20);
        if (Math.hypot(mx - rotH.x, my - rotH.y) < 10) return 'rotate';
        if (o.type !== 'text') {
            const resH = (o.type === 'circle' || o.type === 'poly') ? transform(o.x + (o.radius || o.r), o.y) : transform(b.x + b.w, b.y + b.h);
            if (Math.hypot(mx - resH.x, my - resH.y) < 10) return 'resize';
        }
        return null;
    }

    getHoverInfo(x, y) {
        if (this.state.showCompass) {
            const c = this.state.compass;
            const { lx, ly } = this.toLocal(x, y, c.x, c.y, c.rotation);
            if (Math.hypot(lx - (c.r * 0.4), ly) < 15) return { type: 'tool', cursor: 'grab', action: 'rotate', id: 'compass' };
            if (Math.hypot(lx - (c.r * 0.7), ly) < 15) return { type: 'tool', cursor: 'ew-resize', action: 'resize', id: 'compass' };
            if (Math.hypot(lx, ly) < 20) return { type: 'tool', cursor: 'move', action: 'move', id: 'compass' };
            if (Math.hypot(lx - c.r, ly) < 20) return { type: 'tool', cursor: 'crosshair', action: 'draw', id: 'compass' };
        }

        if (this.state.showProtractor) {
            const p = this.state.protractor;
            const { lx, ly } = this.toLocal(x, y, p.x, p.y, p.rotation);
            if (Math.hypot(lx - (p.r + 40), ly) < 20) return { type: 'tool', cursor: 'grab', action: 'rotate', id: 'prot' };
            if (Math.hypot(x - p.x, y - p.y) < p.r - 20) return { type: 'tool', cursor: 'move', action: 'move', id: 'prot' };
        }

        if (this.state.showRuler) {
            const r = this.state.ruler;
            const { lx, ly } = this.toLocal(x, y, r.x, r.y, r.rotation);
            if (Math.hypot(lx - (r.w + 40), ly - r.h / 2) < 20) return { type: 'tool', cursor: 'grab', action: 'rotate', id: 'ruler' };
            if (lx > r.w - 20 && lx < r.w && ly > 0 && ly < r.h) return { type: 'tool', cursor: 'ew-resize', action: 'resize', id: 'ruler' };
            if (lx > 0 && lx < r.w && ly > 0 && ly < r.h) return { type: 'tool', cursor: 'move', action: 'move', id: 'ruler' };
        }

        if (this.state.selectedObjects.length === 1 && !this.state.selectedObjects[0].locked) {
            const handle = this.checkHandleHit(x, y, this.state.selectedObjects[0]);
            if (handle === 'rotate') return { type: 'handle', cursor: 'grab', action: 'rotate' };
            if (handle === 'resize') return { type: 'handle', cursor: 'nwse-resize', action: 'resize' };
            if (this.hitTest(x, y, this.state.selectedObjects[0])) return { type: 'obj', cursor: 'move', action: 'move' };
        } else {
            if (this.findObject(x, y)) return { type: 'obj', cursor: 'move', action: 'move' };
        }

        return null;
    }

    toLocal(mx, my, ox, oy, rot) {
        const dx = mx - ox;
        const dy = my - oy;
        return {
            lx: dx * Math.cos(-rot) - dy * Math.sin(-rot),
            ly: dx * Math.sin(-rot) + dy * Math.cos(-rot)
        };
    }

    onDown(e) {
        const { x, y } = this.getPos(e);
        this.state.startX = x;
        this.state.startY = y;
        this.state.lastX = x;
        this.state.lastY = y;
        this.state.isDrawing = false;

        if (this.state.editingText) {
            if (e.target !== this.textEditor) this.finalizeTextEntry();
            return;
        }

        if (this.checkMathToolHit(x, y)) {
            if (this.state.activeMathTool === 'compass' && this.state.mathAction === 'draw') {
                const c = this.state.compass;
                const angle = Math.atan2(y - c.y, x - c.x);
                const startX = c.x + c.r * Math.cos(angle);
                const startY = c.y + c.r * Math.sin(angle);

                this.state.currentPath = {
                    type: 'path',
                    points: [{ x: startX, y: startY }],
                    color: this.state.color,
                    width: this.state.penSize,
                    penType: this.state.penType
                };
                this.state.isDrawing = true;
            }
            return;
        }

        if (this.state.tool === 'select') {
            if (this.state.selectedObjects.length === 1 && !this.state.selectedObjects[0].locked) {
                const handle = this.checkHandleHit(x, y, this.state.selectedObjects[0]);
                if (handle) {
                    this.state.dragHandle = handle;
                    return;
                }
            }
            const found = this.findObject(x, y);
            if (found) {
                this.state.selectedObjects = [found];

                if (!found.locked) {
                    this.state.dragHandle = 'move';
                } else {
                    this.state.dragHandle = null;
                }

                this.updateSelectionUI();
            } else {
                this.state.selectedObjects = [];
                this.state.isSelecting = true;
                this.state.selectionRect = { x, y, w: 0, h: 0 };
                this.updateSelectionUI();
            }
            this.draw();
            return;
        }

        this.state.isDrawing = true;
        if (this.state.tool === 'eraser') {
            this.state.isErasing = true;
            this.eraseAt(x, y);
            return;
        }

        this.state.isDrawing = true;
        if (this.state.tool === 'pen') {
            this.state.currentPath = {
                type: 'path',
                points: [{ x, y }],
                color: this.state.color,
                width: this.state.penSize,
                isEraser: false,
                penType: this.state.penType,
                rotation: 0
            };
        } else if (this.state.tool === 'text') {
            const found = this.findObject(x, y);
            if (found && found.type === 'text') {
                this.startTextEntry(found.x, found.y, found);
            } else {
                this.startTextEntry(x, y);
            }
            this.state.isDrawing = false;
        } else if (this.state.tool === 'poly') {
            this.getCurrentObjects().push({
                type: 'poly',
                x,
                y,
                radius: 50,
                sides: this.state.polySides || 5,
                color: this.state.color,
                width: this.state.penSize,
                rotation: 0,
                filled: false
            });
            this.state.isDrawing = false;
            this.setTool('select');
            this.state.selectedObjects = [this.getCurrentObjects()[this.getCurrentObjects().length - 1]];
            this.updateSelectionUI();
            this.draw();
            this.saveLocal();
            this.saveHistory();
        } else {
            if (this.state.tool === 'rect') this.state.tempObject = { type: 'rect', x, y, w: 0, h: 0, color: this.state.color, width: this.state.penSize, rotation: 0, filled: false };
            else if (this.state.tool === 'circle') this.state.tempObject = { type: 'circle', x, y, radius: 0, color: this.state.color, width: this.state.penSize, rotation: 0, filled: false };
            else if (this.state.tool === 'line') this.state.tempObject = { type: 'line', x1: x, y1: y, x2: x, y2: y, color: this.state.color, width: this.state.penSize };
        }
    }

    onMove(e) {
        const r = this.canvas.getBoundingClientRect();
        const rawX = e.clientX - r.left;
        const rawY = e.clientY - r.top;
        const { x, y } = this.getPos(e);

        if (this.state.isErasing) {
            this.eraseAt(x, y);

            this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
            this.tempCtx.beginPath();
            const radius = Math.max((this.state.penSize || 3) * 4, 20);
            this.tempCtx.arc(x, y, radius, 0, Math.PI * 2);
            this.tempCtx.fillStyle = 'rgba(255, 200, 200, 0.4)';
            this.tempCtx.strokeStyle = 'red';
            this.tempCtx.lineWidth = 1;
            this.tempCtx.fill();
            this.tempCtx.stroke();
            return;
        }

        if (!this.state.isDrawing && !this.state.dragHandle && !this.state.activeMathTool && !this.state.isSelecting) {
            const hover = this.getHoverInfo(rawX, rawY);
            this.tempCanvas.style.cursor = hover ? hover.cursor : 'default';
            const prevHover = this.state.hoveredAction;
            const newHover = hover ? hover.action : null;
            if (prevHover !== newHover) {
                this.state.hoveredAction = newHover;
                this.draw();
            }
            return;
        }

        if ((this.state.activeMathTool && this.state.mathAction !== 'draw') ||
            (this.state.tool === 'select' && (this.state.isSelecting || this.state.dragHandle))) {

            const dx = x - this.state.lastX;
            const dy = y - this.state.lastY;

            if (this.state.activeMathTool) {
                const t = this.state.activeMathTool;
                const obj = this.state[t];

                if (this.state.mathAction === 'move') {
                    obj.x += dx;
                    obj.y += dy;
                }
                else if (this.state.mathAction === 'rotate' || this.state.mathAction === 'rotate_nodraw') {
                    const angle = Math.atan2(y - obj.y, x - obj.x);
                    let offset = 0;
                    if (t === 'ruler') offset = Math.atan2(obj.h / 2, obj.w + 40);

                    obj.rotation = angle - offset;
                }
                else if (this.state.mathAction === 'resize') {
                    if (obj.w !== undefined) obj.w += dx;
                    if (obj.r !== undefined) obj.r += dx;
                }
            }

            else if (this.state.isSelecting) {
                if (this.state.selectionRect) {
                    this.state.selectionRect.w = x - this.state.selectionRect.x;
                    this.state.selectionRect.h = y - this.state.selectionRect.y;
                }
            }

            else if (this.state.dragHandle) {
                const sel = this.state.selectedObjects[0];

                if (this.state.dragHandle === 'move') {
                    this.state.selectedObjects.forEach(o => this.offsetObject(o, dx, dy));
                }
                else if (this.state.dragHandle === 'rotate') {
                    const b = this.getObjectBounds(sel);
                    const angle = Math.atan2(y - b.cy, x - b.cx);
                    sel.rotation = angle + Math.PI / 2;
                }
                else if (this.state.dragHandle === 'resize') {
                    if (sel.type === 'rect' || sel.type === 'image') {
                        sel.w += dx;
                        sel.h += dy;
                    }
                    else if (sel.type === 'circle' || sel.type === 'poly') {
                        if (sel.radius !== undefined) sel.radius += dx;
                        else if (sel.r !== undefined) sel.r += dx;
                    }
                    else if (sel.type === 'text') {
                        sel.fontSize = (sel.fontSize || 20) + (dx * 0.5);
                        if (sel.fontSize < 5) sel.fontSize = 5;
                    }
                    else {
                        const s = 1 + (dx * 0.01);
                        sel.scaleX = (sel.scaleX || 1) * s;
                        sel.scaleY = (sel.scaleY || 1) * s;
                    }
                }
                else if (this.state.dragHandle === 'start') {
                    sel.x1 = x;
                    sel.y1 = y;
                }
                else if (this.state.dragHandle === 'end') {
                    sel.x2 = x;
                    sel.y2 = y;
                }
            }

            this.state.lastX = x;
            this.state.lastY = y;
            this.draw();
            return;
        }

        if (this.state.isDrawing) {
            this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);

            if (this.state.tool === 'pen' || (this.state.activeMathTool === 'compass')) {
                let drawX = x;
                let drawY = y;

                if (this.state.activeMathTool === 'compass') {
                    const c = this.state.compass;
                    const angle = Math.atan2(y - c.y, x - c.x);
                    drawX = c.x + c.r * Math.cos(angle);
                    drawY = c.y + c.r * Math.sin(angle);
                    c.rotation = angle;
                    this.draw();
                }

                if (this.state.currentPath) this.state.currentPath.points.push({ x: drawX, y: drawY });
                if (this.state.currentPath) {
                    this.drawObject(this.state.currentPath, this.tempCtx);
                }
            }
            else if (this.state.tempObject) {
                if (this.state.tool === 'rect') {
                    this.state.tempObject.w = x - this.state.startX;
                    this.state.tempObject.h = y - this.state.startY;
                }
                else if (this.state.tool === 'circle') {
                    this.state.tempObject.radius = Math.sqrt((x - this.state.startX) ** 2 + (y - this.state.startY) ** 2);
                }
                else if (this.state.tool === 'line') {
                    this.state.tempObject.x2 = x;
                    this.state.tempObject.y2 = y;
                }

                this.drawObject(this.state.tempObject, this.tempCtx);
            }

            this.state.lastX = x;
            this.state.lastY = y;
        }
    }

    onUp(e) {
        if (this.state.isErasing) {
            this.state.isErasing = false;
            this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
            this.saveHistory();
            return;
        }

        if (this.state.activeMathTool === 'compass' && this.state.currentPath) {
            this.getCurrentObjects().push(this.state.currentPath);
            this.state.currentPath = null;
        }

        this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);

        if (this.state.isSelecting) {
            const r = this.state.selectionRect;
            if (r) {
                const bx = r.w < 0 ? r.x + r.w : r.x;
                const by = r.h < 0 ? r.y + r.h : r.y;
                const bw = Math.abs(r.w);
                const bh = Math.abs(r.h);

                const slide = this.getCurrentObjects();
                if (slide) {
                    this.state.selectedObjects = slide.filter(o => {
                        const b = this.getObjectBounds(o);
                        return (bx < b.x + b.w && bx + bw > b.x && by < b.y + b.h && by + bh > b.y);
                    });
                }
            }
            this.state.isSelecting = false;
            this.state.selectionRect = null;
            this.updateSelectionUI();
            this.draw();
            return;
        }

        this.state.isDrawing = false;
        this.state.activeMathTool = null;
        this.state.dragHandle = null;

        const obj = this.state.tempObject || this.state.currentPath;

        if (obj) {
            if (obj.type === 'path' && obj.points.length === 1) {
                obj.points.push({ ...obj.points[0] });
                obj.points.push({ ...obj.points[0] });
            }

            let isValid = true;

            if (obj.type === 'rect' && (Math.abs(obj.w) < 5 || Math.abs(obj.h) < 5)) isValid = false;
            else if ((obj.type === 'circle' || obj.type === 'poly') && (obj.radius || obj.r || 0) < 5) isValid = false;
            else if (obj.type === 'line' && Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1) < 5) isValid = false;
            else if (obj.type === 'path' && obj.points.length < 2) isValid = false;

            if (isValid) {
                this.getCurrentObjects().push(obj);
            }

            this.state.tempObject = null;
            this.state.currentPath = null;
        }

        this.needsBake = true;
        this.draw();
        this.saveLocal();
        this.saveHistory();
    }

    onDoubleClick(e) {
        const { x, y } = this.getPos(e);
        const found = this.findObject(x, y);
        if (found && found.type === 'text') {
            this.startTextEntry(found.x, found.y, found);
        }
    }

    getCurrentObjects() {
        if (!this.state.slides[this.state.currentSlide]) {
            this.state.slides[this.state.currentSlide] = [];
        }
        return this.state.slides[this.state.currentSlide];
    }

    getPos(e) {
        const r = this.canvas.getBoundingClientRect();
        let x = e.clientX - r.left;
        let y = e.clientY - r.top;
        if (this.state.snapToGrid && this.state.gridType !== 'none') {
            const s = this.state.gridSize;
            x = Math.round(x / s) * s;
            y = Math.round(y / s) * s;
        }
        return { x, y };
    }

    offsetObject(o, dx, dy) {
        if (o.type === 'line') {
            o.x1 += dx;
            o.x2 += dx;
            o.y1 += dy;
            o.y2 += dy;
        }
        else if (o.type === 'path') {
            o.points.forEach(p => {
                p.x += dx;
                p.y += dy;
            });
        }
        else {
            o.x += dx;
            o.y += dy;
        }
    }

    setTool(tool) {
        if (this.state.editingText) this.finalizeTextEntry();

        this.state.tool = tool;

        if (tool !== 'select') {
            this.state.selectedObjects = [];
        }

        this.updateSelectionUI();

        if (tool === 'poly') {
            this.state.polySides = parseInt(prompt("Sides?", "5")) || 5;
        }

        this.draw();
    }

    setPenSize(s) {
        this.state.penSize = parseInt(s);
        const lbl = document.getElementById('lblThickness');
        if (lbl) lbl.innerText = s;

        this.state.selectedObjects.forEach(o => {
            if (!o.locked) o.width = this.state.penSize;
        });
        this.draw();
        this.saveHistory();
    }

    setTextSize(s) {
        this.state.textSize = parseInt(s);
        const lbl = document.getElementById('lblTextSize');
        if (lbl) lbl.innerText = s;

        this.state.selectedObjects.forEach(o => {
            if (o.type === 'text') o.fontSize = this.state.textSize;
        });
        this.draw();
        this.saveHistory();
    }

    setFontFamily(f) {
        this.state.fontFamily = f;
        this.state.selectedObjects.forEach(o => {
            if (o.type === 'text') o.fontFamily = f;
        });
        this.draw();
        this.saveHistory();
    }

    setColor(c) {
        this.state.color = c;
        this.state.selectedObjects.forEach(o => o.color = c);
        this.draw();
        this.saveHistory();
    }

    toggleFill() {
        this.state.selectedObjects.forEach(o => {
            if (['rect', 'circle', 'poly'].includes(o.type)) o.filled = !o.filled;
        });
        this.draw();
        this.saveHistory();
    }

    setPenType(t) {
        this.state.penType = t;
    }

    duplicateSelected() {
        const newSel = [];
        this.state.selectedObjects.forEach(o => {
            const c = JSON.parse(JSON.stringify(o));
            c.locked = false;
            this.offsetObject(c, 20, 20);
            this.getCurrentObjects().push(c);
            newSel.push(c);
        });
        this.state.selectedObjects = newSel;
        this.draw();
        this.saveLocal();
        this.saveHistory();
    }

    flipSelected(axis) {
        if (this.state.selectedObjects.length === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.state.selectedObjects.forEach(o => {
            const b = this.getObjectBounds(o);
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.w);
            maxY = Math.max(maxY, b.y + b.h);
        });
        const groupCx = (minX + maxX) / 2;
        const groupCy = (minY + maxY) / 2;

        this.state.selectedObjects.forEach(o => {
            if (o.locked) return;

            const flipPoint = (x, y) => {
                let nx = x, ny = y;
                if (axis === 'h') nx = groupCx + (groupCx - x);
                if (axis === 'v') ny = groupCy + (groupCy - y);
                return { x: nx, y: ny };
            };

            if (o.type === 'line') {
                const p1 = flipPoint(o.x1, o.y1);
                const p2 = flipPoint(o.x2, o.y2);
                o.x1 = p1.x;
                o.y1 = p1.y;
                o.x2 = p2.x;
                o.y2 = p2.y;
            }
            else if (o.type === 'path') {
                o.points.forEach(p => {
                    const np = flipPoint(p.x, p.y);
                    p.x = np.x;
                    p.y = np.y;
                });
            }
            else if (['rect', 'image', 'text', 'group', 'circle', 'poly'].includes(o.type)) {
                const b = this.getObjectBounds(o);
                const newCenter = flipPoint(b.cx, b.cy);

                if (o.type === 'circle' || o.type === 'poly') {
                    o.x = newCenter.x;
                    o.y = newCenter.y;
                } else {
                    o.x = newCenter.x - (b.w / 2);
                    o.y = newCenter.y - (b.h / 2);
                }

                if (axis === 'h') o.scaleX = (o.scaleX || 1) * -1;
                if (axis === 'v') o.scaleY = (o.scaleY || 1) * -1;

                if (axis === 'h' || axis === 'v') o.rotation = (o.rotation || 0) * -1;
            }
        });

        this.draw();
        this.saveLocal();
        this.saveHistory();
    }

    deleteSelected() {
        const s = this.getCurrentObjects();
        this.state.slides[this.state.currentSlide] = s.filter(o => !this.state.selectedObjects.includes(o));
        this.state.selectedObjects = [];
        this.updateSelectionUI();
        this.needsBake = true;
        this.draw();
        this.saveLocal();
        this.saveHistory();
    }

    toggleRuler() {
        this.state.showRuler = !this.state.showRuler;
        this.draw();
    }

    toggleProtractor() {
        this.state.showProtractor = !this.state.showProtractor;
        this.draw();
    }

    toggleCompass() {
        this.state.showCompass = !this.state.showCompass;
        this.draw();
    }

    toggleLock() {
        if (this.state.selectedObjects.length === 0) return;

        const newState = !this.state.selectedObjects[0].locked;
        this.state.selectedObjects.forEach(o => o.locked = newState);

        this.updateSelectionUI();

        this.draw();
        this.saveLocal();
        this.saveHistory();
    }

    groupSelected() {
        if (this.state.selectedObjects.length < 2) return;
        const groupObj = {
            type: 'group',
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            rotation: 0,
            children: [],
            id: Date.now()
        };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.state.selectedObjects.forEach(o => {
            const b = this.getObjectBounds(o);
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.w);
            maxY = Math.max(maxY, b.y + b.h);
        });
        groupObj.x = minX;
        groupObj.y = minY;
        groupObj.w = maxX - minX;
        groupObj.h = maxY - minY;
        this.state.selectedObjects.forEach(o => {
            this.offsetObject(o, -groupObj.x, -groupObj.y);
            groupObj.children.push(o);
        });
        const slide = this.getCurrentObjects();
        this.state.slides[this.state.currentSlide] = slide.filter(o => !this.state.selectedObjects.includes(o));
        this.state.slides[this.state.currentSlide].push(groupObj);
        this.state.selectedObjects = [groupObj];
        this.updateSelectionUI();
        this.draw();
        this.saveLocal();
        this.saveHistory();
    }

    ungroupSelected() {
        if (this.state.selectedObjects.length !== 1 || this.state.selectedObjects[0].type !== 'group') return;
        const group = this.state.selectedObjects[0];
        const newSelection = [];
        group.children.forEach(child => {
            this.offsetObject(child, group.x, group.y);
            this.getCurrentObjects().push(child);
            newSelection.push(child);
        });
        const slide = this.getCurrentObjects();
        this.state.slides[this.state.currentSlide] = slide.filter(o => o !== group);
        this.state.selectedObjects = newSelection;
        this.updateSelectionUI();
        this.draw();
        this.saveLocal();
        this.saveHistory();
    }

    async translateSelectedText() {
        if (this.state.selectedObjects.length !== 1 || this.state.selectedObjects[0].type !== 'text') {
            alert("Please select a single text object to translate.");
            return;
        }

        const floatSelect = document.getElementById('ctxLangSelect');
        const sideSelect = document.getElementById('targetLang');
        const langName = (floatSelect && floatSelect.offsetParent !== null) ? floatSelect.value : (sideSelect ? sideSelect.value : 'French');

        const langMap = {
            "French": "fr",
            "Spanish": "es",
            "German": "de",
            "Italian": "it",
            "Chinese (Mandarin)": "zh",
            "Arabic": "ar",
            "Japanese": "ja",
            "Hindi": "hi",
            "Turkish": "tr",
            "Korean": "ko",
            "Portuguese": "pt",
            "Russian": "ru",
            "Dutch": "nl",
            "Polish": "pl",
            "Vietnamese": "vi",
            "Thai": "th"
        };
        const targetCode = langMap[langName] || "fr";

        const originalObj = this.state.selectedObjects[0];
        const originalText = originalObj.text;

        const translatedObj = {
            type: 'text',
            x: originalObj.x,
            y: originalObj.y + (originalObj.h || 40) + 20,
            text: "Translating...",
            color: originalObj.color || '#000000',
            fontSize: originalObj.fontSize || 36,
            fontFamily: originalObj.fontFamily || 'Lexend'
        };

        this.getCurrentObjects().push(translatedObj);
        this.draw();

        try {
            const sourceLang = "autodetect";
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(originalText)}&langpair=${sourceLang}|${targetCode}&de=andyrwilkins123@gmail.com`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.responseStatus !== 200) {
                throw new Error(data.responseDetails || "Translation failed");
            }

            translatedObj.text = data.responseData.translatedText;

            this.state.selectedObjects = [translatedObj];
            this.updateSelectionUI();
            this.draw();
            this.saveHistory();

        } catch (err) {
            console.error("Translation Failed:", err);
            translatedObj.text = "Error: " + err.message;
            this.draw();
        }
    }

    startTextEntry(x, y, existingObj = null) {
        if (this.state.editingText) this.finalizeTextEntry();

        if (this.textEditor.parentNode !== this.wrapper) {
            this.wrapper.appendChild(this.textEditor);
        }

        let obj = existingObj;
        if (!obj) {
            obj = {
                type: 'text',
                x: x,
                y: y,
                text: "",
                color: this.state.color,
                fontSize: this.state.textSize,
                fontFamily: this.state.fontFamily,
                fontWeight: 'normal',
                fontStyle: 'normal'
            };
        }

        this.state.editingText = obj;
        obj.isBeingEdited = true;

        this.textEditor.value = obj.text;
        this.textEditor.style.color = obj.color;
        this.textEditor.style.font = `${obj.fontStyle || ''} ${obj.fontWeight || ''} ${obj.fontSize}px ${obj.fontFamily}`;
        this.textEditor.style.lineHeight = "1.2";
        this.textEditor.style.display = 'block';
        this.textEditor.style.left = obj.x + 'px';
        this.textEditor.style.top = obj.y + 'px';

        const toolbar = document.getElementById('textToolbar');
        const colorInput = document.getElementById('textToolbarColor');

        if (toolbar) {
            toolbar.style.display = 'flex';
            toolbar.style.left = obj.x + 'px';
            toolbar.style.top = obj.y + 'px';

            colorInput.value = obj.color;

            const boldBtn = toolbar.querySelector('button[onclick*="Bold"]');
            const italicBtn = toolbar.querySelector('button[onclick*="Italic"]');

            if (boldBtn) boldBtn.classList.toggle('active', obj.fontWeight === 'bold');
            if (italicBtn) italicBtn.classList.toggle('active', obj.fontStyle === 'italic');
        }

        this.autoResizeTextEditor();
        setTimeout(() => this.textEditor.focus(), 50);
        this.draw();
    }

    autoResizeTextEditor() {
        this.textEditor.style.height = 'auto';
        this.textEditor.style.width = 'auto';

        const newW = Math.max(50, this.textEditor.scrollWidth + 10);
        const newH = Math.max(30, this.textEditor.scrollHeight);

        this.textEditor.style.width = newW + "px";
        this.textEditor.style.height = newH + "px";
    }

    finalizeTextEntry() {
        const toolbar = document.getElementById('textToolbar');
        if (toolbar) toolbar.style.display = 'none';
        if (this.state.editingText) {
            this.state.editingText.isBeingEdited = false;
            const val = this.textEditor.value;

            if (val.trim().length > 0) {
                this.state.editingText.text = val;
                const current = this.getCurrentObjects();
                if (!current.includes(this.state.editingText)) {
                    current.push(this.state.editingText);
                }
            } else {
                const current = this.getCurrentObjects();
                const idx = current.indexOf(this.state.editingText);
                if (idx > -1) current.splice(idx, 1);
            }
        }

        this.textEditor.style.display = 'none';
        this.state.editingText = null;
        this.draw();
        this.saveLocal();
        this.saveHistory();
    }

    toggleTextBold() {
        if (!this.state.editingText) return;
        const obj = this.state.editingText;

        obj.fontWeight = (obj.fontWeight === 'bold') ? 'normal' : 'bold';

        this.textEditor.style.fontWeight = obj.fontWeight;

        const btn = document.querySelector('#textToolbar button[onclick*="Bold"]');
        if (btn) btn.classList.toggle('active');

        this.autoResizeTextEditor();
        this.draw();
    }

    toggleTextItalic() {
        if (!this.state.editingText) return;
        const obj = this.state.editingText;

        obj.fontStyle = (obj.fontStyle === 'italic') ? 'normal' : 'italic';

        this.textEditor.style.fontStyle = obj.fontStyle;

        const btn = document.querySelector('#textToolbar button[onclick*="Italic"]');
        if (btn) btn.classList.toggle('active');

        this.draw();
    }

    updateTextColor(val) {
        if (!this.state.editingText) return;

        this.state.editingText.color = val;
        this.textEditor.style.color = val;
        this.draw();
    }

    async openProject() {
        if (window.showOpenFilePicker) {
            try {
                const [handle] = await window.showOpenFilePicker({
                    types: [{ description: 'WorkSlate Project', accept: { 'application/json': ['.json'] } }],
                    multiple: false
                });
                this.fileHandle = handle;
                const file = await handle.getFile();
                const contents = await file.text();
                this.loadFromJSON(contents);
            } catch (err) {
                if (err.name !== 'AbortError') console.error(err);
            }
        } else {
            document.getElementById('loadInput').click();
        }
    }

    loadProjectFile(inputElement) {
        const file = inputElement.files[0];
        if (!file) return;

        this.fileHandle = null;

        const reader = new FileReader();
        reader.onload = (e) => this.loadFromJSON(e.target.result);
        reader.readAsText(file);
        inputElement.value = '';
    }

    loadFromJSON(jsonString) {
        try {
            this.state.slides = JSON.parse(jsonString);
            this.state.currentSlide = 0;
            this.state.selectedObjects = [];
            this.draw();
            this.saveLocal();
            this.saveHistory();
            alert("Project loaded successfully!");
        } catch (err) {
            alert("Error parsing project file.");
        }
        this.needsBake = true;
    }

    async saveProject() {
        if (this.fileHandle) {
            try {
                const writable = await this.fileHandle.createWritable();
                await writable.write(JSON.stringify(this.state.slides));
                await writable.close();

                const btn = document.querySelector('div[onclick="app.saveProject()"]');
                const originalContent = btn.innerHTML;
                btn.innerHTML = "✔";
                setTimeout(() => btn.innerHTML = originalContent, 1000);
            } catch (err) {
                console.error("Save failed:", err);
                alert("Failed to save to file. Try 'Save As'.");
            }
        } else {
            this.saveProjectAs();
        }
    }

    async saveProjectAs() {
        const dataStr = JSON.stringify(this.state.slides);

        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'workslate_project.json',
                    types: [{ description: 'WorkSlate Project', accept: { 'application/json': ['.json'] } }]
                });
                this.fileHandle = handle;
                const writable = await handle.createWritable();
                await writable.write(dataStr);
                await writable.close();
            } catch (err) {
                // User cancelled
            }
        } else {
            const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', 'workslate_project.json');
            linkElement.click();
        }
    }

    exportPNG() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.canvas.width;
        tempCanvas.height = this.canvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        tempCtx.drawImage(this.bgCanvas, 0, 0);
        tempCtx.drawImage(this.canvas, 0, 0);

        const dataURL = tempCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `slide_${this.state.currentSlide + 1}.png`;
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (this.state.gridType === 'webcam' && this.videoEl) {
            // Handle webcam export
        } else {
            tempCtx.drawImage(this.bgCanvas, 0, 0);
        }
    }

    toggleSorter() {
        const sorter = document.getElementById('slideSorter');
        if (sorter.style.display === 'grid') {
            sorter.style.display = 'none';
        } else {
            this.renderSorter();
            sorter.style.display = 'grid';
        }
    }

    addSlide() {
        this.state.slides.push([]);
        this.renderSorter();
        this.saveHistory();
    }

    renderSorter() {
        const sorter = document.getElementById('slideSorter');
        const addBtn = sorter.querySelector('.add-slide-card');
        sorter.innerHTML = '';
        this.state.slides.forEach((slide, index) => {
            const card = document.createElement('div');
            card.className = `slide-card ${index === this.state.currentSlide ? 'active' : ''}`;
            card.onclick = (e) => {
                if (e.target.className.includes('btn-del')) return;
                this.state.currentSlide = index;
                this.toggleSorter();
                this.needsBake = true;
                this.draw();
            };
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 140;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, 200, 140);
            const scaleX = 200 / (this.canvas.width || 1000);
            const scaleY = 140 / (this.canvas.height || 800);
            ctx.save();
            ctx.scale(scaleX, scaleY);
            slide.forEach(o => {
                ctx.strokeStyle = o.color;
                ctx.lineWidth = o.width;
                if (o.type === 'rect') ctx.strokeRect(o.x, o.y, o.w, o.h);
                else if (o.type === 'path' && o.points.length) {
                    ctx.beginPath();
                    ctx.moveTo(o.points[0].x, o.points[0].y);
                    o.points.forEach(p => ctx.lineTo(p.x, p.y));
                    ctx.stroke();
                }
            });
            ctx.restore();
            const thumb = document.createElement('img');
            thumb.className = 'slide-thumb';
            thumb.src = canvas.toDataURL();
            const meta = document.createElement('div');
            meta.className = 'slide-meta';
            meta.innerHTML = `<span>Slide ${index + 1}</span>`;
            if (this.state.slides.length > 1) {
                const delBtn = document.createElement('button');
                delBtn.className = 'btn-del-slide';
                delBtn.innerHTML = '🗑';
                delBtn.onclick = () => {
                    this.state.slides.splice(index, 1);
                    if (this.state.currentSlide >= this.state.slides.length) this.state.currentSlide = this.state.slides.length - 1;
                    this.renderSorter();
                    this.saveHistory();
                };
                meta.appendChild(delBtn);
            }
            card.appendChild(thumb);
            card.appendChild(meta);
            sorter.appendChild(card);
        });
        if (addBtn) sorter.appendChild(addBtn);
    }

    prevSlide() {
        if (this.state.currentSlide > 0) {
            this.state.currentSlide--;
            this.needsBake = true;
            this.draw();
            this.saveLocal();
        }
    }

    nextSlide() {
        if (this.state.currentSlide < this.state.slides.length - 1) {
            this.state.currentSlide++;
        } else {
            this.state.slides.push([]);
            this.state.currentSlide++;
        }
        this.needsBake = true;
        this.draw();
        this.saveLocal();
        this.saveHistory();
    }

    resizeCanvas() {
        const w = this.wrapper.clientWidth;
        const h = this.wrapper.clientHeight;

        this.canvas.width = w;
        this.canvas.height = h;
        this.bgCanvas.width = w;
        this.bgCanvas.height = h;
        this.tempCanvas.width = w;
        this.tempCanvas.height = h;

        this.cacheCanvas.width = w;
        this.cacheCanvas.height = h;
        this.needsBake = true;

        this.drawGrid();
        this.draw();
    }

    drawGrid() {
        const s = this.state.gridSize;
        const w = this.bgCanvas.width;
        const h = this.bgCanvas.height;
        let bgColor = '#FDF5E6';
        if (this.state.gridType === 'graph-cyan') {
            bgColor = '#ecfeff';
        }
        this.bgCtx.clearRect(0, 0, w, h);
        this.bgCtx.fillStyle = bgColor;
        this.bgCtx.fillRect(0, 0, w, h);

        if (this.state.gridType === 'none') return;
        this.bgCtx.save();
        if (this.state.gridType === 'graph-cyan') {
            const cyanColor = '6, 182, 212';
            const unit = s / 2;
            this.bgCtx.beginPath();
            this.bgCtx.strokeStyle = `rgba(${cyanColor}, 0.2)`;
            this.bgCtx.lineWidth = 0.5;
            for (let x = 0; x <= w; x += unit) {
                this.bgCtx.moveTo(x, 0);
                this.bgCtx.lineTo(x, h);
            }
            for (let y = 0; y <= h; y += unit) {
                this.bgCtx.moveTo(0, y);
                this.bgCtx.lineTo(w, y);
            }
            this.bgCtx.stroke();
            this.bgCtx.beginPath();
            this.bgCtx.strokeStyle = `rgba(${cyanColor}, 0.5)`;
            this.bgCtx.lineWidth = 1;
            const med = unit * 5;
            for (let x = 0; x <= w; x += med) {
                this.bgCtx.moveTo(x, 0);
                this.bgCtx.lineTo(x, h);
            }
            for (let y = 0; y <= h; y += med) {
                this.bgCtx.moveTo(0, y);
                this.bgCtx.lineTo(w, y);
            }
            this.bgCtx.stroke();
            this.bgCtx.beginPath();
            this.bgCtx.strokeStyle = `rgba(${cyanColor}, 1.0)`;
            this.bgCtx.lineWidth = 2;
            const major = unit * 10;
            for (let x = 0; x <= w; x += major) {
                this.bgCtx.moveTo(x, 0);
                this.bgCtx.lineTo(x, h);
            }
            for (let y = 0; y <= h; y += major) {
                this.bgCtx.moveTo(0, y);
                this.bgCtx.lineTo(w, y);
            }
            this.bgCtx.stroke();
        } else if (this.state.gridType === 'dot') {
            this.bgCtx.beginPath();
            this.bgCtx.fillStyle = '#64748b';
            for (let x = s; x < w; x += s) {
                for (let y = s; y < h; y += s) {
                    this.bgCtx.moveTo(x + 2, y);
                    this.bgCtx.arc(x, y, 2, 0, Math.PI * 2);
                }
            }
            this.bgCtx.fill();
        } else {
            this.bgCtx.beginPath();
            this.bgCtx.strokeStyle = '#cbd5e1';
            this.bgCtx.lineWidth = 1;
            if (this.state.gridType !== 'lined') {
                for (let x = 0; x <= w; x += s) {
                    this.bgCtx.moveTo(x, 0);
                    this.bgCtx.lineTo(x, h);
                }
            }
            for (let y = 0; y <= h; y += s) {
                this.bgCtx.moveTo(0, y);
                this.bgCtx.lineTo(w, y);
            }
            this.bgCtx.stroke();
        }
        this.bgCtx.restore();
    }

    setGridType(t) {
        if (this.state.gridType === 'webcam' && t !== 'webcam') {
            this.stopWebcam();
        }

        this.state.gridType = t;

        if (t === 'webcam') {
            this.startWebcam();
        } else {
            this.drawGrid();
        }
    }

    async startWebcam() {
        if (this.webcamStream) return;
        try {
            this.webcamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            this.videoEl.srcObject = this.webcamStream;

            this.videoEl.onloadedmetadata = () => {
                this.videoEl.play();
                this.drawWebcamLoop();
            };

            const btn = document.getElementById('btnFreeze');
            if (btn) btn.style.display = 'flex';
        } catch (err) {
            console.error("Webcam error:", err);
            alert("Could not access camera. Please allow permissions.");
            this.setGridType('square');
            document.getElementById('bgSelect').value = 'square';
        }
    }

    stopWebcam() {
        if (this.webcamStream) {
            this.webcamStream.getTracks().forEach(track => track.stop());
            this.webcamStream = null;
        }
        if (this.webcamLoopId) {
            cancelAnimationFrame(this.webcamLoopId);
            this.webcamLoopId = null;
        }
        this.isWebcamFrozen = false;

        const btn = document.getElementById('btnFreeze');
        if (btn) {
            btn.style.display = 'none';
            btn.innerHTML = "❄ Freeze Frame";
            btn.style.background = '#fee2e2';
            btn.style.color = '#ef4444';
        }
    }

    drawWebcamLoop() {
        if (this.state.gridType !== 'webcam') return;

        if (!this.isWebcamFrozen && this.videoEl.readyState === 4) {
            const w = this.bgCanvas.width;
            const h = this.bgCanvas.height;

            const vw = this.videoEl.videoWidth;
            const vh = this.videoEl.videoHeight;
            const r = Math.max(w / vw, h / vh);
            const nw = vw * r;
            const nh = vh * r;
            const ox = (w - nw) / 2;
            const oy = (h - nh) / 2;

            this.bgCtx.drawImage(this.videoEl, ox, oy, nw, nh);
        }

        this.webcamLoopId = requestAnimationFrame(() => this.drawWebcamLoop());
    }

    toggleWebcamFreeze() {
        this.isWebcamFrozen = !this.isWebcamFrozen;
        const btn = document.getElementById('btnFreeze');
        if (this.isWebcamFrozen) {
            btn.innerHTML = "▶ Unfreeze";
            btn.style.background = '#dcfce7';
            btn.style.color = '#166534';
            btn.style.borderColor = '#86efac';
        } else {
            btn.innerHTML = "❄ Freeze Frame";
            btn.style.background = '#fee2e2';
            btn.style.color = '#ef4444';
            btn.style.borderColor = '#fca5a5';
        }
    }

    setGridSize(s) {
        this.state.gridSize = parseInt(s);
        this.drawGrid();
    }

    toggleSnap() {
        this.state.snapToGrid = !this.state.snapToGrid;
    }
}

// Initialize the application
window.addEventListener('DOMContentLoaded', () => {
    app = new MathsMaster();
    ui = new UIController();
    radialMenu = new RadialMenu();
});
