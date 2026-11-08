(() => {
  'use strict';

  const ROWS = 12;
  const COLS = 18;
  const gridElement = document.querySelector('#grid');
  const statusBox = document.querySelector('#statusBox');
  const statusText = document.querySelector('#statusText');
  const runButton = document.querySelector('#runButton');
  const runLabel = document.querySelector('#runLabel');
  const stepButton = document.querySelector('#stepButton');
  const resetButton = document.querySelector('#resetButton');
  const clearButton = document.querySelector('#clearButton');
  const speedRange = document.querySelector('#speedRange');
  const speedValue = document.querySelector('#speedValue');
  const visitedMetric = document.querySelector('#visitedMetric');
  const stepsMetric = document.querySelector('#stepsMetric');
  const costMetric = document.querySelector('#costMetric');
  const toolButtons = [...document.querySelectorAll('[data-tool]')];

  const indexOf = (row, col) => row * COLS + col;
  const rowOf = (index) => Math.floor(index / COLS);
  const colOf = (index) => index % COLS;
  const manhattan = (a, b) => Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b));

  function sampleWalls() {
    const walls = new Set();
    for (let row = 2; row <= 9; row += 1) if (row !== 6) walls.add(indexOf(row, 5));
    for (let row = 1; row <= 8; row += 1) if (row !== 4) walls.add(indexOf(row, 10));
    for (let col = 10; col <= 14; col += 1) if (col !== 12) walls.add(indexOf(7, col));
    return walls;
  }

  const state = {
    start: indexOf(10, 2),
    goal: indexOf(1, 15),
    robot: indexOf(10, 2),
    walls: sampleWalls(),
    tool: 'wall',
    result: null,
    timeline: [],
    cursor: 0,
    explored: new Set(),
    route: new Set(),
    moves: 0,
    playing: false,
    timer: null,
    terminal: false,
  };

  const robotSvg = '<svg class="robot-svg" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 4v5M12 11h16a4 4 0 0 1 4 4v13a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V15a4 4 0 0 1 4-4Z" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="15" cy="21" r="2.2" fill="currentColor"/><circle cx="25" cy="21" r="2.2" fill="currentColor"/><path d="M15 27h10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

  function setStatus(message, kind = 'ready') {
    statusText.textContent = message;
    statusBox.dataset.state = kind;
  }

  function updateMetrics() {
    visitedMetric.textContent = String(state.explored.size);
    stepsMetric.textContent = String(state.moves);
    const cost = state.result?.path ? state.result.path.length - 1 : null;
    costMetric.innerHTML = cost === null ? '— <small>خطوة</small>' : `${cost} <small>خطوة</small>`;
  }

  function renderGrid() {
    const cells = document.createDocumentFragment();
    const route = state.route;
    for (let index = 0; index < ROWS * COLS; index += 1) {
      const cell = document.createElement('button');
      const row = rowOf(index) + 1;
      const col = colOf(index) + 1;
      cell.type = 'button';
      cell.className = 'cell';
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-rowindex', String(row));
      cell.setAttribute('aria-colindex', String(col));
      cell.setAttribute('aria-label', `صف ${row}، عمود ${col}`);
      cell.dataset.index = String(index);
      if (state.walls.has(index)) cell.classList.add('wall');
      if (state.explored.has(index) && index !== state.start && index !== state.goal) cell.classList.add('visited');
      if (route.has(index) && index !== state.start && index !== state.goal) cell.classList.add('path');
      if (index === state.start) cell.classList.add('start-cell');
      if (index === state.goal) cell.classList.add('goal-cell');
      if (index === state.robot) cell.classList.add('robot-cell');

      const content = document.createElement('span');
      content.className = 'cell-content';
      if (index === state.robot) content.innerHTML = robotSvg;
      else if (index === state.goal) content.innerHTML = '<span class="goal-ring" aria-hidden="true"></span>';
      else if (state.walls.has(index)) content.setAttribute('aria-hidden', 'true');
      cell.append(content);
      if (index === state.start) cell.setAttribute('aria-label', `موقع الروبوت، صف ${row}، عمود ${col}`);
      if (index === state.goal) cell.setAttribute('aria-label', `الهدف، صف ${row}، عمود ${col}`);
      if (state.walls.has(index)) cell.setAttribute('aria-label', `عائق، صف ${row}، عمود ${col}`);
      cells.append(cell);
    }
    gridElement.replaceChildren(cells);
    updateMetrics();
  }

  function neighbors(index) {
    const row = rowOf(index);
    const col = colOf(index);
    const output = [];
    if (row > 0) output.push(indexOf(row - 1, col));
    if (col < COLS - 1) output.push(indexOf(row, col + 1));
    if (row < ROWS - 1) output.push(indexOf(row + 1, col));
    if (col > 0) output.push(indexOf(row, col - 1));
    return output;
  }

  function reconstructPath(cameFrom, current) {
    const path = [current];
    while (cameFrom.has(current)) {
      current = cameFrom.get(current);
      path.push(current);
    }
    path.reverse();
    return path;
  }

  function findPath() {
    const open = [{ index: state.start, g: 0, f: manhattan(state.start, state.goal) }];
    const openSet = new Set([state.start]);
    const closed = new Set();
    const cameFrom = new Map();
    const gScore = new Map([[state.start, 0]]);
    const expanded = [];

    while (open.length > 0) {
      open.sort((a, b) => a.f - b.f || manhattan(a.index, state.goal) - manhattan(b.index, state.goal) || a.g - b.g);
      const current = open.shift();
      if (closed.has(current.index)) continue;
      openSet.delete(current.index);
      closed.add(current.index);
      expanded.push(current.index);

      if (current.index === state.goal) {
        return { path: reconstructPath(cameFrom, current.index), expanded };
      }

      for (const next of neighbors(current.index)) {
        if (state.walls.has(next) || closed.has(next)) continue;
        const tentativeG = (gScore.get(current.index) ?? Infinity) + 1;
        if (tentativeG >= (gScore.get(next) ?? Infinity)) continue;
        cameFrom.set(next, current.index);
        gScore.set(next, tentativeG);
        const entry = { index: next, g: tentativeG, f: tentativeG + manhattan(next, state.goal) };
        if (openSet.has(next)) {
          const oldPosition = open.findIndex((item) => item.index === next);
          if (oldPosition !== -1) open.splice(oldPosition, 1);
        }
        open.push(entry);
        openSet.add(next);
      }
    }
    return { path: null, expanded };
  }

  function resetPlayback(announce = true) {
    if (state.timer) window.clearTimeout(state.timer);
    state.timer = null;
    state.playing = false;
    state.terminal = false;
    state.robot = state.start;
    state.result = null;
    state.timeline = [];
    state.cursor = 0;
    state.explored = new Set();
    state.route = new Set();
    state.moves = 0;
    runLabel.textContent = 'ابدأ البحث';
    runButton.classList.remove('is-paused');
    if (announce) setStatus('الخريطة جاهزة — ابدأ البحث.');
    renderGrid();
  }

  function prepareSearch() {
    state.result = findPath();
    state.timeline = state.result.expanded.map((index) => ({ type: 'explore', index }));
    if (state.result.path) {
      state.timeline.push({ type: 'reveal-path' });
      for (const index of state.result.path.slice(1)) state.timeline.push({ type: 'move', index });
      setStatus('تم حساب المسار — الروبوت يبدأ استكشاف الخريطة.', 'running');
    } else {
      state.timeline.push({ type: 'no-path' });
      setStatus('يجري فحص الخريطة بحثًا عن مسار متاح.', 'running');
    }
    state.cursor = 0;
    state.terminal = false;
    updateMetrics();
  }

  function applyEvent(event) {
    if (event.type === 'explore') {
      state.explored.add(event.index);
      if (event.index === state.goal && state.result.path) {
        setStatus('وصل البحث إلى الهدف — يجري تجهيز المسار.', 'running');
      } else {
        setStatus(`A* يفحص الخلية ${state.explored.size} ويوازن بين g(n) و h(n).`, 'running');
      }
    } else if (event.type === 'reveal-path') {
      state.route = new Set(state.result.path);
      setStatus(`عُثر على مسار أمثل بطول ${state.result.path.length - 1} خطوة. الروبوت في طريقه!`, 'running');
    } else if (event.type === 'move') {
      state.robot = event.index;
      state.moves += 1;
      setStatus(`الروبوت يتحرك — الخطوة ${state.moves} من ${state.result.path.length - 1}.`, 'running');
    } else if (event.type === 'no-path') {
      state.terminal = true;
      state.playing = false;
      runLabel.textContent = 'إعادة التشغيل';
      runButton.classList.remove('is-paused');
      setStatus('تعذّر العثور على مسار. أزل بعض العوائق وحاول مجددًا.', 'failure');
    }
    renderGrid();
  }

  function finishIfNeeded() {
    if (state.cursor < state.timeline.length || state.terminal) return false;
    state.terminal = true;
    state.playing = false;
    runLabel.textContent = 'إعادة التشغيل';
    runButton.classList.remove('is-paused');
    if (state.result?.path) setStatus(`وصل الروبوت إلى الهدف بنجاح خلال ${state.moves} خطوة.`, 'success');
    else setStatus('تعذّر العثور على مسار. أزل بعض العوائق وحاول مجددًا.', 'failure');
    return true;
  }

  function applyNextEvent() {
    if (state.cursor >= state.timeline.length) return finishIfNeeded();
    const event = state.timeline[state.cursor];
    state.cursor += 1;
    applyEvent(event);
    return finishIfNeeded();
  }

  function stepDelay() {
    return 780 - (Number(speedRange.value) - 1) * 135;
  }

  function scheduleNext() {
    if (!state.playing) return;
    state.timer = window.setTimeout(() => {
      state.timer = null;
      const finished = applyNextEvent();
      if (!finished && state.playing) scheduleNext();
    }, stepDelay());
  }

  function startOrPause() {
    if (state.playing) {
      state.playing = false;
      if (state.timer) window.clearTimeout(state.timer);
      state.timer = null;
      runLabel.textContent = 'استئناف';
      runButton.classList.add('is-paused');
      setStatus('المحاكاة متوقفة مؤقتًا — استأنف أو نفّذ خطوة واحدة.', 'paused');
      return;
    }
    if (state.terminal) resetPlayback(false);
    if (!state.result) prepareSearch();
    if (state.cursor >= state.timeline.length) {
      finishIfNeeded();
      return;
    }
    state.playing = true;
    runLabel.textContent = 'إيقاف مؤقت';
    runButton.classList.remove('is-paused');
    setStatus('المحاكاة تعمل — راقب الخلايا التي يفحصها A*.', 'running');
    scheduleNext();
  }

  function singleStep() {
    if (state.playing) {
      state.playing = false;
      if (state.timer) window.clearTimeout(state.timer);
      state.timer = null;
    }
    if (state.terminal) resetPlayback(false);
    if (!state.result) prepareSearch();
    runLabel.textContent = 'استئناف';
    runButton.classList.add('is-paused');
    if (state.cursor < state.timeline.length) {
      applyNextEvent();
      if (!state.terminal) setStatus('تقدمت المحاكاة خطوة واحدة. اضغط «استئناف» للمتابعة.', 'paused');
    }
  }

  function selectTool(tool) {
    state.tool = tool;
    toolButtons.forEach((button) => {
      const active = button.dataset.tool === tool;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function editCell(index) {
    if (state.playing) {
      state.playing = false;
      if (state.timer) window.clearTimeout(state.timer);
      state.timer = null;
    }
    if (state.tool === 'start') {
      if (index === state.goal || state.walls.has(index)) {
        setStatus('اختر خلية خالية وغير مستخدمة للروبوت.');
        return;
      }
      state.start = index;
      state.robot = index;
    } else if (state.tool === 'goal') {
      if (index === state.start || state.walls.has(index)) {
        setStatus('اختر خلية خالية وغير مستخدمة للهدف.');
        return;
      }
      state.goal = index;
    } else if (state.tool === 'wall') {
      if (index === state.start || index === state.goal) return;
      if (state.walls.has(index)) state.walls.delete(index);
      else state.walls.add(index);
    } else if (state.tool === 'erase') {
      state.walls.delete(index);
    }
    resetPlayback(false);
    setStatus('تم تحديث الخريطة — ابدأ البحث عندما تكون جاهزًا.');
  }

  gridElement.addEventListener('click', (event) => {
    const cell = event.target.closest('.cell');
    if (cell) editCell(Number(cell.dataset.index));
  });

  toolButtons.forEach((button) => button.addEventListener('click', () => selectTool(button.dataset.tool)));
  runButton.addEventListener('click', startOrPause);
  stepButton.addEventListener('click', singleStep);
  resetButton.addEventListener('click', () => resetPlayback(true));
  clearButton.addEventListener('click', () => {
    state.walls.clear();
    resetPlayback(false);
    setStatus('أُزيلت جميع العوائق — يمكنك إضافة عوائق جديدة أو بدء البحث.');
  });
  speedRange.addEventListener('input', () => { speedValue.textContent = `${speedRange.value}×`; });

  document.querySelector('#mapDimensions').textContent = `${COLS} × ${ROWS} شبكة`;
  renderGrid();
})();
