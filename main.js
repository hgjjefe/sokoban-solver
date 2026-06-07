// Using Festival-Rust solver (Festival C++ ported to Rust/WASM)

const LEVEL_DATA = {
  w: 10,          // Width of the sokoban level
  h: 10,
  solution: {
    current: 0,
    directions: '',
    states: []
  },
  levels: [],
  current: ''
}

const resetSolverUI = () => {
  // Reset solver UI to initial state
  const solveButton = document.querySelector('.solve')
  const prevButton = document.querySelector('.prev')
  const nextButton = document.querySelector('.next')

  // Hide navigation buttons
  prevButton.classList.add('d-none')
  nextButton.classList.add('d-none')

  // Reset button text and state
  solveButton.removeAttribute('disabled')
  solveButton.textContent = 'Solve';

  // Clear solution data
  LEVEL_DATA.solution.current = 0
  LEVEL_DATA.solution.directions = ''
  LEVEL_DATA.solution.states = []
}

const updateGridSize = () => {
  const grid = document.querySelector('.grid')
  const mainArea = document.querySelector('.main-area')

  if (!mainArea) return

  // Get the available space in the main area
  const mainAreaRect = mainArea.getBoundingClientRect()
  const availableWidth = mainAreaRect.width - 32 // 32px for padding
  const availableHeight = mainAreaRect.height - 32 // 32px for padding

  // Calculate cell size based on both width and height constraints
  const cellSizeByWidth = Math.floor(availableWidth / LEVEL_DATA.w)
  const cellSizeByHeight = Math.floor(availableHeight / LEVEL_DATA.h)

  // Use the smaller of the two to ensure the grid fits in both dimensions
  const cellSize = Math.min(cellSizeByWidth, cellSizeByHeight)

  // Ensure minimum cell size
  const finalCellSize = Math.max(cellSize, 20)

  const actualGridWidth = finalCellSize * LEVEL_DATA.w
  const actualGridHeight = finalCellSize * LEVEL_DATA.h

  // Set the grid dimensions
  grid.style.width = `${actualGridWidth}px`
  grid.style.height = `${actualGridHeight}px`

  // Update CSS custom property for cell size
  document.documentElement.style.setProperty('--cell-size', `${finalCellSize}px`)

  console.log('Grid updated:', {
    availableWidth,
    availableHeight,
    cellSize: finalCellSize,
    gridWidth: actualGridWidth,
    gridHeight: actualGridHeight,
    gridDimensions: `${LEVEL_DATA.w}x${LEVEL_DATA.h}`
  })
}

const setupInitialGrid = () => {
  const grid = document.querySelector('.grid')
  grid.innerHTML = ''
  for (let wi = 0; wi < LEVEL_DATA.h; wi++) {
    const row = document.createElement('div')
    row.classList.add('row', 'gx-0', `row-${wi}`)
    for (let hi = 0; hi < LEVEL_DATA.w; hi++) {
      const cell = document.createElement('div')
      cell.classList.add('cell', `cell-${wi}-${hi}`)
      cell.setAttribute('data-type', 'floor')
      cell.setAttribute('data-id', `${wi}-${hi}`)
      row.appendChild(cell)
    }
    grid.appendChild(row)
  }

  // Update grid sizing after creation with a small delay to ensure layout is settled
  setTimeout(updateGridSize, 10)

  document.querySelectorAll('.cell').forEach(cell => cell.addEventListener('click', function (event) {
    const dataType = event.target.getAttribute('data-type')
    console.log('click', event.target, dataType)

    switch (dataType) {
      case 'floor': event.target.setAttribute('data-type', 'wall'); break
      case 'wall': event.target.setAttribute('data-type', 'block'); break
      case 'block': event.target.setAttribute('data-type', 'target'); break
      case 'target': event.target.setAttribute('data-type', 'player'); break
      case 'player': event.target.setAttribute('data-type', 'target-block'); break
      case 'target-block': event.target.setAttribute('data-type', 'target-player'); break
      case 'target-player': event.target.setAttribute('data-type', 'floor'); break
    }

    // Reset solver UI when grid is modified
    resetSolverUI()
  }))
}
const bindClicks = () => {
  // Title click handler to refresh page and clear URL parameters
  document.querySelector('.title-link').addEventListener('click', function (event) {
    // Navigate to the base URL without any parameters
    window.location.href = window.location.origin + window.location.pathname
  })

  document.querySelector('.solve').addEventListener('click', function (event) {
    calculate()
  })
  document.querySelector('.next').addEventListener('click', function (event) {
    if (LEVEL_DATA.solution.current + 1 < LEVEL_DATA.solution.states.length) {
      LEVEL_DATA.solution.current++
      displayState(LEVEL_DATA.solution.states[LEVEL_DATA.solution.current])
    }
  })
  document.querySelector('.prev').addEventListener('click', function (event) {
    if (LEVEL_DATA.solution.current > 0) {
      LEVEL_DATA.solution.current--
      displayState(LEVEL_DATA.solution.states[LEVEL_DATA.solution.current])
    }
  })
  document.querySelector('.save').addEventListener('click', async function (event) {
    await save()
    await loadLevel(LEVEL_DATA.current)
  })

  document.querySelector('.export').addEventListener('click', function (event) {
    exportToUrl()
  })

  document.querySelector('.reset').addEventListener('click', function (event) {
    loadLevel(LEVEL_DATA.current)
  })

  document.querySelector('.grid-set-select').addEventListener('change', async function (event) {
    const gridSetPath = event.target.value
    await loadLevelList(gridSetPath)
    // Load the first level in the new grid set
    if (LEVEL_DATA.levels.length > 0) {
      loadLevel(LEVEL_DATA.levels[0].name)
    }
  })

  document.querySelector('.up').addEventListener('click', function (event) { executeManualMove('u') })
  document.querySelector('.down').addEventListener('click', function (event) { executeManualMove('d') })
  document.querySelector('.left').addEventListener('click', function (event) { executeManualMove('l') })
  document.querySelector('.right').addEventListener('click', function (event) { executeManualMove('r') })

  document.querySelector('.new').addEventListener('click', async function (event) {
    const levelName = window.prompt('New grid name', LEVEL_DATA.current)
    if (levelName !== null) {
      const gridWidthText = window.prompt('Grid size, eg 8x8', '8x8')
      if (gridWidthText !== null) {
        LEVEL_DATA.current = levelName
        const gridWidthTextSplit = gridWidthText.match(/(?:\d+\.)?\d+/g)
        LEVEL_DATA.w = parseInt(gridWidthTextSplit[0])
        LEVEL_DATA.h = parseInt(gridWidthTextSplit[1])
        setupInitialGrid()
        await save()
        await loadLevel(levelName)
      }
    }
  })

  document.querySelector('.load-select').addEventListener('change', function (event) {
    console.log('.load-select change', event.target.value)

    if (event.target.value === '__RESET__') {
      // Handle reset option
      const confirmReset = window.confirm('This will delete all saved levels and reset the application. Are you sure?')
      if (confirmReset) {
        // Remove localStorage data
        window.localStorage.removeItem('sok')
        console.log('localStorage cleared')

        // Refresh the page
        window.location.reload()
      } else {
        // User cancelled, reset dropdown to current level
        event.target.value = LEVEL_DATA.current
      }
    } else {
      // Normal level selection
      loadLevel(event.target.value)
    }
  })
  // MOVE KEYS
  document.addEventListener('keydown', function (e) {
    // console.log('e', e.key)
    if (e.key === 'ArrowLeft' || e.key === 'a') {
      executeManualMove('l')
    } else if (e.key === 'ArrowRight' || e.key === 'd') {
      executeManualMove('r')
    } else if (e.key === 'ArrowUp' || e.key === 'w') {
      executeManualMove('u')
    } else if (e.key === 'ArrowDown' || e.key === 's') {
      executeManualMove('d')
    } else if (e.key === 'Escape' || e.key === 'r') {
      loadLevel(LEVEL_DATA.current)
    }
  })

  try {
    // Speech
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const SpeechGrammarList = window.SpeechGrammarList || window.webkitSpeechGrammarList
    console.log('SpeechRecognition', SpeechRecognition)
    // const SpeechRecognitionEvent = window.SpeechRecognitionEvent || webkitSpeechRecognitionEvent

    const directions = ['up', 'down', 'left', 'right', 'restart', 'start again']
    const grammar = '#JSGF V1.0; grammar direction; public <direction> = ' + directions.join(' | ') + ' ;'

    const recognition = new SpeechRecognition()
    const speechRecognitionList = new SpeechGrammarList()
    speechRecognitionList.addFromString(grammar, 1)

    recognition.grammars = speechRecognitionList
    recognition.continuous = true
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 0

    recognition.start()

    console.log('recognition.start()')
    recognition.onresult = function (event) {
      // TODO - This is too slow to wait for the 'onresult' event
      console.log('recognition.onresult', event)
      const lastResult = event.results[event.results.length - 1]
      const direction = lastResult[lastResult.length - 1].transcript
      const isFinal = lastResult.isFinal
      // diagnostic.textContent = 'Result received: ' + color + '.'
      // bg.style.backgroundColor = color
      console.log('Confidence: ' + event.results[0][0].confidence, direction, isFinal)

      if (direction.includes('left')) {
        executeManualMove('l')
      } else if (direction.includes('right')) {
        executeManualMove('r')
      } else if (direction.includes('up')) {
        executeManualMove('u')
      } else if (direction.includes('down')) {
        executeManualMove('d')
      } else if (direction.includes('start')) {
        loadLevel(LEVEL_DATA.current)
      }
    }
  } catch (error) {
    console.log('speechRecognition error', error)
  }
}
const save = async () => {
  const text = gridToText()
  console.log('save', LEVEL_DATA.current, text)
  const savedLevels = JSON.parse(window.localStorage.getItem('sok'))

  const level = savedLevels.find(l => l.name === LEVEL_DATA.current)
  if (level === undefined) {
    const newLevel = { name: LEVEL_DATA.current, grid: text, solution: '' }
    savedLevels.push(newLevel)
  } else {
    level.grid = text
  }
  window.localStorage.setItem('sok', JSON.stringify(savedLevels))
  await loadLevelList()
}

const exportToUrl = () => {
  const state = {
    name: LEVEL_DATA.current,
    width: LEVEL_DATA.w,
    height: LEVEL_DATA.h,
    grid: gridToText()
  }

  // Compress the grid data by encoding it
  const gridString = state.grid.join('')
  const encodedGrid = btoa(gridString) // Base64 encode

  const params = new URLSearchParams()
  params.set('name', state.name)
  params.set('w', state.width.toString())
  params.set('h', state.height.toString())
  params.set('grid', encodedGrid)

  const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`

  // Update the browser URL without reloading the page
  window.history.pushState({ level: state.name }, '', url)

  // Copy to clipboard
  navigator.clipboard.writeText(url).then(() => {
    console.log('URL updated and copied to clipboard:', url)
    alert('Level URL updated and copied to clipboard!')
  }).catch(err => {
    console.error('Failed to copy URL:', err)
    // Fallback: show the URL in a prompt
    prompt('Copy this URL:', url)
  })

  return url
}

const importFromUrl = () => {
  const params = new URLSearchParams(window.location.search)

  if (!params.has('grid')) {
    return false // No grid data in URL
  }

  try {
    const name = params.get('name') || 'Imported Level'
    const width = parseInt(params.get('w')) || 10
    const height = parseInt(params.get('h')) || 10
    const encodedGrid = params.get('grid')

    // Decode the grid data
    const gridString = atob(encodedGrid)
    const grid = []

    for (let i = 0; i < height; i++) {
      const row = gridString.slice(i * width, (i + 1) * width)
      grid.push(row)
    }

    // Create the imported level object
    const importedLevel = {
      name: name,
      grid: grid,
      solution: ''
    }

    // Check if level already exists in LEVEL_DATA.levels
    const existingLevelIndex = LEVEL_DATA.levels.findIndex(l => l.name === name)
    if (existingLevelIndex !== -1) {
      // Update existing level
      LEVEL_DATA.levels[existingLevelIndex] = importedLevel
    } else {
      // Add new level to the list
      LEVEL_DATA.levels.push(importedLevel)
      // Don't sort - keep the order from the .txt file
      // LEVEL_DATA.levels.sort((a, b) => a.name.localeCompare(b.name))
    }

    // Update the select dropdown
    const loadSelect = document.querySelector('.load-select')
    loadSelect.innerHTML = ''
    LEVEL_DATA.levels.forEach(level => {
      const option = document.createElement('option')
      option.setAttribute('value', level.name)
      option.innerText = level.name
      loadSelect.append(option)
    })

    // Add reset option at the bottom
    const resetOption = document.createElement('option')
    resetOption.setAttribute('value', '__RESET__')
    resetOption.innerText = '--- Reset All Data ---'
    resetOption.style.color = '#dc3545' // Bootstrap danger color
    resetOption.style.fontWeight = 'bold'
    loadSelect.append(resetOption)

    // Update LEVEL_DATA with imported level
    LEVEL_DATA.current = name
    LEVEL_DATA.w = width
    LEVEL_DATA.h = height

    // Setup grid and load the imported state
    setupInitialGrid()

    for (let wi = 0; wi < height; wi++) {
      const row = grid[wi].split('')
      for (let hi = 0; hi < width; hi++) {
        const cellValue = row[hi] || ' '
        const dataType = convertToDataType(cellValue)
        document.querySelector(`.cell-${wi}-${hi}`).setAttribute('data-type', dataType)
      }
    }

    // Select the imported level in the dropdown
    loadSelect.value = name

    // Reset solution UI
    document.querySelector('.prev').classList.add('d-none')
    document.querySelector('.next').classList.add('d-none')
    const solverBtnGroup = document.querySelector('.solver-btn-group')
    if (solverBtnGroup) solverBtnGroup.classList.remove('d-none')

    console.log('Imported level from URL:', name, width, height)
    return true
  } catch (error) {
    console.error('Failed to import from URL:', error)
    return false
  }
}
const getGridState = () => {
  const state = []
  for (let wi = 0; wi < LEVEL_DATA.h; wi++) {
    const row = []
    for (let hi = 0; hi < LEVEL_DATA.w; hi++) {
      const dataType = document.querySelector(`.cell-${wi}-${hi}`).getAttribute('data-type')
      row.push(dataType)
    }
    state.push(row)
  }
  return state
}
const getPlayerPos = (state) => {
  for (let wi = 0; wi < LEVEL_DATA.h; wi++) {
    for (let hi = 0; hi < LEVEL_DATA.w; hi++) {
      if (state[wi][hi].includes('player')) {
        return { y: wi, x: hi }
      }
    }
  }
}
const getTargetPos = (x, y, direction) => {
  if (direction.toLowerCase() === 'u') {
    return { player: { x, y: y - 1 }, box: { x, y: y - 2 } }
  } else if (direction.toLowerCase() === 'd') {
    return { player: { x, y: y + 1 }, box: { x, y: y + 2 } }
  } else if (direction.toLowerCase() === 'l') {
    return { player: { x: x - 1, y }, box: { x: x - 2, y } }
  } else if (direction.toLowerCase() === 'r') {
    return { player: { x: x + 1, y }, box: { x: x + 2, y } }
  }
}
const isEnd = (state) => {
  const blockCount = state.flat().filter(dataType => dataType === 'block').length
  const targetBlockCount = state.flat().filter(dataType => dataType === 'target-block').length
  //   console.log('isEnd', state.flat(), blockCount, targetBlockCount)
  if (blockCount === 0 && targetBlockCount > 0) {
    return true
  } else {
    return false
  }
}
const executeManualMove = (direction) => {
  const nextState = calculateNextStateFromDirection(direction, getGridState())
  displayState(nextState)
  if (isEnd(nextState)) {
    setTimeout(function () {
      const currentLevelIndex = LEVEL_DATA.levels.findIndex(l => l.name === LEVEL_DATA.current)
      if (currentLevelIndex + 1 < LEVEL_DATA.levels.length) {
        loadLevel(LEVEL_DATA.levels[currentLevelIndex + 1].name)
      }
    }, 100)
  }
}
const calculateNextStateFromDirection = (direction, currentState) => {
  //   console.log('currentState', currentState)
  const nextState = JSON.parse(JSON.stringify(currentState))
  const playerPos = getPlayerPos(nextState)
  const targetPos = getTargetPos(playerPos.x, playerPos.y, direction)
  //   const playerCellDataType = nextState[playerPos.y][playerPos.x]
  const targetPlayerCellDataType = nextState[targetPos.player.y][targetPos.player.x]
  //   const targetBoxCellDataType = nextState[targetPos.box.y][targetPos.box.x]
  //   console.log('direction', direction, nextState, playerPos, targetPos, playerCellDataType, targetPlayerCellDataType, targetBoxCellDataType)
  if (targetPlayerCellDataType === 'target') {
    nextState[targetPos.player.y][targetPos.player.x] = 'target-player'
    nextState[playerPos.y][playerPos.x] = nextState[playerPos.y][playerPos.x] === 'target-player' ? 'target' : 'floor'
  }
  if (targetPlayerCellDataType === 'floor') {
    nextState[targetPos.player.y][targetPos.player.x] = 'player'
    nextState[playerPos.y][playerPos.x] = nextState[playerPos.y][playerPos.x] === 'target-player' ? 'target' : 'floor'
  }
  if (targetPlayerCellDataType === 'block') {
    if (nextState[targetPos.box.y][targetPos.box.x] === 'wall' || nextState[targetPos.box.y][targetPos.box.x].includes('block')) {
      // No move
    } else {
      nextState[targetPos.player.y][targetPos.player.x] = 'player'
      nextState[playerPos.y][playerPos.x] = nextState[playerPos.y][playerPos.x] === 'target-player' ? 'target' : 'floor'
      nextState[targetPos.box.y][targetPos.box.x] = nextState[targetPos.box.y][targetPos.box.x] === 'target' ? 'target-block' : 'block'
    }
  }
  if (targetPlayerCellDataType === 'target-block') {
    if (nextState[targetPos.box.y][targetPos.box.x] === 'wall' || nextState[targetPos.box.y][targetPos.box.x].includes('block')) {
      // No move
    } else {
      nextState[targetPos.player.y][targetPos.player.x] = 'target-player'
      nextState[playerPos.y][playerPos.x] = nextState[playerPos.y][playerPos.x] === 'target-player' ? 'target' : 'floor'
      nextState[targetPos.box.y][targetPos.box.x] = nextState[targetPos.box.y][targetPos.box.x] === 'target' ? 'target-block' : 'block'
    }
  }
  return nextState
}
const populateSolutionStates = () => {
  LEVEL_DATA.solution.states = [getGridState()]
  console.log('LEVEL_DATA.solution.states', LEVEL_DATA.solution.states)
  LEVEL_DATA.solution.directions.split('').forEach(direction => {
    const nextState = calculateNextStateFromDirection(direction, LEVEL_DATA.solution.states[LEVEL_DATA.solution.states.length - 1])
    LEVEL_DATA.solution.states.push(nextState)
  })
  LEVEL_DATA.solution.current = 0
  console.log('LEVEL_DATA.solution END', LEVEL_DATA.solution)
}
const gridToText = () => {
  const textList = []
  for (let wi = 0; wi < LEVEL_DATA.h; wi++) {
    let text = []
    for (let hi = 0; hi < LEVEL_DATA.w; hi++) {
      const cell = document.querySelector(`.cell-${wi}-${hi}`)
      const dataType = cell.getAttribute('data-type')
      switch (dataType) {
        case 'wall': text += '#'; break
        case 'floor': text += ' '; break
        case 'block': text += '$'; break          // XSB standard
        case 'target': text += '.'; break
        case 'player': text += '@'; break         // XSB standard
        case 'target-block': text += '*'; break   // XSB standard
        case 'target-player': text += '+'; break  // XSB standard
      }
    }
    textList.push(text)
  }
  return textList
}
const displayState = (state) => {
   //  console.log('displayState', state)
  for (let wi = 0; wi < state.length; wi++) {
    const row = state[wi]
    for (let hi = 0; hi < row.length; hi++) {
      const cell = document.querySelector(`.cell-${wi}-${hi}`)
      cell.setAttribute('data-type', state[wi][hi])
    }
  }
}
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const calculate = async () => {
  console.log('calculate')
  const solveButton = document.querySelector('.solve')
  solveButton.setAttribute('disabled', 'disabled')
  solveButton.textContent = 'Solving...'

  await sleep(100) // To allow button to be disabled
  const gridText = gridToText()
  const gridWidth = gridText[0].length
  const level = LEVEL_DATA.levels.find(l => l.name === LEVEL_DATA.current)
  const savedGrid = level.grid.map(l => l.padEnd(gridWidth, ' '))

  if (gridText.join('\n') === savedGrid.join('\n') && level.solution !== '') {
    console.log('calcuate cached', gridText, savedGrid)
    LEVEL_DATA.solution.directions = level.solution

    populateSolutionStates()
    solveButton.removeAttribute('disabled')
    solveButton.textContent = 'Solve';
    solveButton.classList.add('d-none')
    document.querySelector('.prev').classList.remove('d-none')
    document.querySelector('.next').classList.remove('d-none')
    return
  }

  let solution;

  try {
    // Use Festival-Rust WASM solver
    const solverFunction = window.solveFestivalRust;
    const solverName = 'Festival-Rust';
    
    if (!solverFunction) {
      throw new Error('Festival-Rust solver not loaded');
    }

    const progressCallback = (progress) => {
      const { explored, frontier, iterations, timeElapsed } = progress;
      solveButton.textContent = `Solving... ${timeElapsed}s (${explored} explored)`;
    };

    const solverPromise = solverFunction('astar', gridText, progressCallback, 60000)
      .then(([solutionResult, timeStr]) => {
        console.log(`${solverName} completed in ${timeStr}`);
        return solutionResult;
      });

    solution = await solverPromise;

  } catch (error) {
    console.error('Solver error:', error);

    const errorMessage = error?.message || error?.toString() || '';
    if (errorMessage.includes('timeout')) {
      console.log('Solver timed out after 60 seconds');
      window.alert('Calculation timed out after 60 seconds. This puzzle may be too complex or have no solution.');
      solution = 'timeout';
    } else {
      window.alert('Solver error: ' + (errorMessage || 'Unknown error'));
      solution = 'x';
    }
  }

  // Reset button state
  solveButton.removeAttribute('disabled')
  solveButton.textContent = 'Solve';

  if (solution === 'x') {
    window.alert('No solution found')
  } else if (solution === 'timeout') {
    // Already handled above, just return
    return
  } else {
    const savedLevels = JSON.parse(window.localStorage.getItem('sok'))
    const savedLevel = savedLevels.find(l => l.name === LEVEL_DATA.current)

    if (savedLevel === undefined) {
      savedLevels.push({ name: LEVEL_DATA.current, grid: gridText, solution })
    } else {
      savedLevel.solution = solution
    }
    window.localStorage.setItem('sok', JSON.stringify(savedLevels))
    level.solution = solution
    LEVEL_DATA.solution.directions = solution

    populateSolutionStates()
    solveButton.classList.add('d-none')
    document.querySelector('.prev').classList.remove('d-none')
    document.querySelector('.next').classList.remove('d-none')
  }
}
const loadLevelList = async (gridSetPath = 'grids/Base-Levels.txt') => {
  const req = await fetch(gridSetPath)
  const res = await req.text()
  const levels = res.split('Level:').filter(t => t !== '').map(l => {
    let grid = l.split('\n').filter(t => t !== '')
    let name = grid.shift().trim()
    let solution = ''
    if (name.includes('|')) {
      const nameSplit = name.split('|')
      name = nameSplit[0].trim()
      solution = nameSplit[1].trim()
    }
    if (grid.length === 0) {
      grid = Array(8).fill(' '.repeat(8))
    }
    return { name, solution, grid }
  })

  if (window.localStorage.getItem('sok') === null) {
    window.localStorage.setItem('sok', JSON.stringify([]))
  }

  const savedLevels = JSON.parse(window.localStorage.getItem('sok'))
  savedLevels.forEach(savedLevel => {
    const level = levels.find(l => l.name === savedLevel.name)
    if (level === undefined) {
      levels.push(savedLevel)
    } else {
      level.grid = savedLevel.grid
      level.solution = savedLevel.solution
    }
  })
  // Don't sort - keep the order from the .txt file
  // levels.sort((a, b) => a.name.localeCompare(b.name))

  LEVEL_DATA.levels = levels
  console.log('LEVEL_DATA.levels', LEVEL_DATA.levels)
  const loadSelect = document.querySelector('.load-select')
  loadSelect.innerHTML = ''
  LEVEL_DATA.levels.forEach(level => {
    const option = document.createElement('option')
    option.setAttribute('value', level.name)
    option.innerText = level.name
    loadSelect.append(option)
  })

  // Add reset option at the bottom
  const resetOption = document.createElement('option')
  resetOption.setAttribute('value', '__RESET__')
  resetOption.innerText = '--- Reset All Data ---'
  resetOption.style.color = '#dc3545' // Bootstrap danger color
  resetOption.style.fontWeight = 'bold'
  loadSelect.append(resetOption)
}
const convertToDataType = (sign) => {
  switch (sign) {
    case ' ': return 'floor'
    case '#': return 'wall'
    case '$': return 'block'      // XSB standard
    case 'B': return 'block'      // Legacy support
    case '.': return 'target'
    case '@': return 'player'     // XSB standard
    case '&': return 'player'     // Legacy support
    case '*': return 'target-block'  // XSB standard
    case 'X': return 'target-block'  // Legacy support
    case '+': return 'target-player' // XSB standard
    case '%': return 'target-player' // Legacy support
  }
  return 'floor'
}
const loadLevel = async (levelName) => {
  const level = LEVEL_DATA.levels.filter(l => l.name === levelName)[0]
  console.log('loadLevel res', levelName, level)
  LEVEL_DATA.current = levelName
  LEVEL_DATA.h = level.grid.length
  //   console.log('LEVEL_DATA.h', LEVEL_DATA.h)
  LEVEL_DATA.w = Math.max(...level.grid.map(row => row.replace('\n', '').split('').length))
  //   console.log('LEVEL_DATA.w', LEVEL_DATA.w)
  setupInitialGrid()
  for (let wi = 0; wi < level.grid.length; wi++) {
    const row = level.grid[wi].replace('\n', '').split('')
    for (let hi = 0; hi < row.length; hi++) {
      const cellValue = row[hi]
      const dataType = convertToDataType(cellValue)
      //   console.log(wi, hi, cellValue, dataType)
      document.querySelector(`.cell-${wi}-${hi}`).setAttribute('data-type', dataType)
    }
  }
  document.querySelector('.load-select').value = levelName
  document.querySelector('.prev').classList.add('d-none')
  document.querySelector('.next').classList.add('d-none')
  document.querySelector('.solve').classList.remove('d-none')

  // Ensure grid is properly sized after level is loaded
  setTimeout(updateGridSize, 10)
}
const initSolver = async () => {
  const pyodide = await window.loadPyodide()
  await pyodide.loadPackage(['numpy'])

  const solverCodeText = await (await fetch('solver.py')).text()

  // console.log('solverCodeText', solverCodeText)
  const solveSokodan = pyodide.runPython(solverCodeText)
  document.querySelector('.solve').removeAttribute('disabled')
  document.querySelector('.solve').textContent = 'Solve (Python)'
  return solveSokodan
}

const init = async () => {
  console.log('init')
  setupInitialGrid()
  await loadLevelList()

  // Check if there's a level to import from URL
  const importedFromUrl = importFromUrl()

  if (!importedFromUrl) {
    // Load default level if no URL import
    await loadLevel(LEVEL_DATA.levels[0].name)
  }

  bindClicks()

  // Add window resize listener to update grid size (debounced)
  let resizeTimeout
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout)
    resizeTimeout = setTimeout(updateGridSize, 100)
  })

  // Enable solve button
  console.log('Festival-Rust solver ready');
  document.querySelector('.solve').removeAttribute('disabled');
  document.querySelector('.solve').textContent = 'Solve';
}
init()
