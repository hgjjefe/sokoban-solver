// import { range } from "./utils";
// import { Deque } from "./Deque";
class Deque {
    data = []; // 👈 Use a fast native array
    head = 0;
    tail = 0;
    pushBack(item) {
        this.data[this.tail] = item;
        this.tail++;
    }
    popFront() {
        if (this.head === this.tail)
            return undefined;
        const item = this.data[this.head];
        this.data[this.head] = null; // 👈 Safely clear memory without breaking V8 optimization!
        this.head++;
        // Optional: Periodic cleanup if the array gets massively bloated
        // if (this.head > 100000) {
        //     this.data = this.data.slice(this.head);
        //     this.tail -= this.head;
        //     this.head = 0;
        // }
        return item ?? undefined;
    }
    constructor(arr = undefined) {
        if (arr === undefined)
            return;
        for (let item of arr)
            this.pushBack(item);
    }
    get length() {
        return this.tail - this.head;
    }
}
// GridText formatting Helpers
const range = (n) => [...Array(n).keys()];
function stripEmptyRowsCols(gridText) {
    const res = gridText.filter(row => /\S/.test(row));
    const gridWidth = res[0].length;
    const rangeW = range(gridWidth);
    const minCol = rangeW.findIndex(i => /\S/.test(res.map(row => row[i]).join('')));
    const maxCol = rangeW.findLastIndex(i => /\S/.test(res.map(row => row[i]).join('')));
    return res.map(row => row.slice(minCol, maxCol + 1));
}
const MOVES = {
    'U': [-1, 0], 'D': [1, 0], 'L': [0, -1], 'R': [0, 1],
    //  'u': [-1, 0], 'd': [1, 0], 'l': [0, -1], 'r': [0, 1]
};
// =========== SOME HELPERS ==============
// Convert [r,c] into a packed PosInt
function posInt(r, c) {
    return (r << 16) | c;
} // Unpack PosInt into [r,c]
function getRC(posInt) {
    return [posInt >> 16, posInt & 0xFFFF];
}
// Get packed positions orthogonally adjacent to the currentPos
function getAdjPos(currentPos) {
    let [r, c] = getRC(currentPos);
    return [posInt(r - 1, c), posInt(r + 1, c), posInt(r, c - 1), posInt(r, c + 1)];
}
function getAdjPosWithMove(currentPos) {
    let [r, c] = getRC(currentPos);
    return [[posInt(r - 1, c), [-1, 0]], [posInt(r + 1, c), [1, 0]], [posInt(r, c - 1), [0, -1]], [posInt(r, c + 1), [0, 1]]];
}
function formatPositionSet(posSet) {
    let posTups = [];
    for (let posInt of posSet)
        posTups.push(getRC(posInt));
    let posStrings = posTups.map(p => `(${p[0]},${p[1]})`).join(' ');
    return "Positions: " + posStrings;
}
// ========= THE SOLVER CLASS ==========
export class Solver {
    board;
    rows;
    cols;
    initialPlayerPos = null; // Changed to allow null
    initialBoxPositions = new Set();
    initialRawBoxCount = 0;
    wallPositions = new Set();
    goalPositions = new Set();
    goalCount;
    pushablePositions = new Set();
    playerZobristTable = []; // For Zobrist Hashing
    boxZobristTable = [];
    // // FLOODFILL BUFFER DURING RUNNING
    // private floodPositions: Uint32Array;
    constructor(board) {
        // board = stripEmptyRowsCols(board);
        this.board = board.map(row => row.split(''));
        this.rows = this.board.length;
        this.cols = this.board[0].length;
        for (let r = 0; r < this.rows; r++) {
            this.playerZobristTable[r] = [];
            this.boxZobristTable[r] = [];
            for (let c = 0; c < this.cols; c++) {
                const cell = this.board[r][c];
                const key = (r << 16) | c;
                switch (cell) {
                    case '#':
                        this.wallPositions.add(key);
                        break;
                    case '@':
                        this.initialPlayerPos = key;
                        break;
                    case '$':
                        this.initialBoxPositions.add(key);
                        this.initialRawBoxCount++;
                        break;
                    case '.':
                        this.goalPositions.add(key);
                        break;
                    case '*':
                        this.initialBoxPositions.add(key);
                        this.goalPositions.add(key);
                        break;
                    case '+':
                        this.initialPlayerPos = key;
                        this.goalPositions.add(key);
                        break;
                }
                // Fill the zobrist tables with pseudorandom numbers
                // Generate two random 32-bit numbers and stitch them into a 64-bit BigInt
                const upper32player = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
                const lower32player = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
                const random64player = (upper32player << 32n) | lower32player;
                this.playerZobristTable[r][c] = random64player;
                const upper32box = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
                const lower32box = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
                const random64box = (upper32box << 32n) | lower32box;
                this.boxZobristTable[r][c] = random64box;
            }
        }
        this.goalCount = this.goalPositions.size;
    }
    // Call this once at the very start of solve() to get your baseline hash
    getInitialHash(playerInt, boxes) {
        let [playerR, playerC] = getRC(playerInt);
        let hash = this.playerZobristTable[playerR][playerC];
        for (const packedPos of boxes) {
            const r = packedPos >> 16;
            const c = packedPos & 0xFFFF;
            hash ^= this.boxZobristTable[r][c]; // XOR the box position in
        }
        return hash;
    }
    // Some helpers
    // private getStateKey(playerPos: PosTup, boxPositions: PositionSet): string {
    //     const sortedBoxes = Array.from(boxPositions).sort().join(';');
    //     return `${playerPos[0]},${playerPos[1]}|${sortedBoxes}`;
    // }
    isSolved(boxPositions) {
        for (const box of boxPositions) {
            if (!this.goalPositions.has(box))
                return false;
        }
        return true;
    }
    isInBound(playerPos) {
        let [playerR, playerC] = getRC(playerPos);
        return 0 <= playerR && playerR < this.rows && 0 <= playerC && playerC < this.cols;
    }
    // Static Analysis using naive flood fill, called at start of solve()
    getPushablePositions(wallPositions, goalPositions) {
        let flooded = new Set();
        let queue = new Deque();
        for (let goalPos of this.goalPositions) {
            flooded.add(goalPos);
            queue.pushBack(goalPos);
        }
        while (queue.length) {
            let curPos = queue.popFront();
            let [r, c] = getRC(curPos);
            for (let nPos of getAdjPos(curPos)) { // FIXED
                let [nr, nc] = getRC(nPos);
                if (!flooded.has(nPos) && !this.wallPositions.has(nPos)
                    && !this.wallPositions.has(posInt(r + 2 * (nr - r), c + 2 * (nc - c)))) {
                    flooded.add(nPos);
                    queue.pushBack(nPos);
                }
            }
        }
        return flooded;
    }
    // Flood fill with simple bfs, identifying pushable box positions
    floodRoom(playerPos, boxPositions, generatePushes = true) {
        let flooded = new Set([playerPos]);
        let queue = new Deque([playerPos]);
        let pushableBoxes = [];
        let minPlayerPos = playerPos;
        let [minR, minC] = getRC(playerPos);
        while (queue.length) {
            let curPos = queue.popFront();
            if (curPos === undefined)
                break;
            for (let [nPos, [dr, dc]] of getAdjPosWithMove(curPos)) { // FIXED
                let [nr, nc] = getRC(nPos);
                // Flood to a floor
                if (!flooded.has(nPos) && !this.wallPositions.has(nPos) && !boxPositions.has(nPos)) {
                    flooded.add(nPos);
                    queue.pushBack(nPos);
                    // Compare and update canonical tile instantly (reading order: top-to-bottom, left-to-right)
                    if (nr < minR || (nr === minR && nc < minC)) {
                        minR = nr;
                        minC = nc;
                        minPlayerPos = nPos;
                    }
                }
                else if (generatePushes && boxPositions.has(nPos)) { // Flood water finds a box
                    let landingRow = nr + dr;
                    let landingCol = nc + dc;
                    let landingPosInt = posInt(landingRow, landingCol);
                    // A push is only valid if the landing tile is NOT a wall and NOT another box
                    if (!this.wallPositions.has(landingPosInt) && !boxPositions.has(landingPosInt)) {
                        pushableBoxes.push([nPos, dr, dc]);
                    }
                }
            }
        } // The top left corner floor, list of [boxes, dr, dc] where dr,dc is move
        return { playerPos: minPlayerPos, pushes: pushableBoxes };
    }
    // 🔥 Fixed getNextPushes engine
    getNextPushes(rawPlayerPos, boxPositions, currentHash) {
        const res = [];
        // 1. Analyze the current room from our raw entry point
        const { playerPos: canonPlayerPos, pushes } = this.floodRoom(rawPlayerPos, boxPositions);
        // 2. Compute the canonical hash for this room state
        let [rawR, rawC] = getRC(rawPlayerPos);
        let [canR, canC] = getRC(canonPlayerPos);
        // Swap raw player position hash out, and put the standardized canonical hash in
        let canonicalHash = currentHash
            ^ this.playerZobristTable[rawR][rawC]
            ^ this.playerZobristTable[canR][canC];
        // 2. Pre-calculate the base box-only hash snapshot for this room
        let baseBoxHash = currentHash ^ this.playerZobristTable[rawR][rawC];
        // 3. Generate child transitions
        for (const [boxInt, dr, dc] of pushes) {
            let [boxR, boxC] = getRC(boxInt);
            let [newBoxR, newBoxC] = [boxR + dr, boxC + dc];
            // Create the next state's immutable box arrangement
            const newBoxPositions = new Set(boxPositions);
            newBoxPositions.delete(boxInt);
            newBoxPositions.add(posInt(newBoxR, newBoxC));
            // Incrementally update Zobrist hash for this specific push event
            let nextHash = baseBoxHash
                ^ this.boxZobristTable[boxR][boxC] // Remove box from old spot
                ^ this.boxZobristTable[newBoxR][newBoxC] // Place box in new spot
                ^ this.playerZobristTable[boxR][boxC]; // Place player rawly where the box used to stand
            // Pass the raw player landing coordinate down to the child state
            // Inside the for-loop of getNextPushes, update your res.push to pass direction and old box position:
            res.push([boxInt, newBoxPositions, nextHash, [dr, dc]]);
        }
        return { canonicalHash, transitions: res };
    }
    getNeighbors(playerPos, boxPositions, currentHash) {
        const neighbors = [];
        const [r, c] = getRC(playerPos);
        for (const [moveChar, [dr, dc]] of Object.entries(MOVES)) {
            const newPlayerR = r + dr;
            const newPlayerC = c + dc;
            const newPlayerKey = (newPlayerR << 16) | newPlayerC;
            // Move making player out of boound or hit a wall is not valid
            if (!this.isInBound(newPlayerKey) || this.board[newPlayerR][newPlayerC] === '#') {
                continue;
            }
            // ZOBRIST HASHING
            let nextHash = currentHash;
            // 1. Erase old player position, apply new player position
            nextHash ^= this.playerZobristTable[r][c]; // Remove old player
            nextHash ^= this.playerZobristTable[newPlayerR][newPlayerC]; // Add new player
            // Push a box => Outputs capital move letters
            if (boxPositions.has(newPlayerKey)) {
                const newBoxR = newPlayerR + dr;
                const newBoxC = newPlayerC + dc;
                const newBoxKey = (newBoxR << 16) | newBoxC;
                // Box cannot be pushed to out of bounds OR another box OR a wall
                //   OR to non-pushable positions
                if (!this.isInBound(newBoxKey) || boxPositions.has(newBoxKey)
                    || this.board[newBoxR][newBoxC] === '#' || !this.pushablePositions.has(newBoxKey)) {
                    continue;
                }
                let dRawBoxCount = this.goalPositions.has(newPlayerKey) ? 1 : 0;
                dRawBoxCount += this.goalPositions.has(newBoxKey) ? -1 : 0;
                const newBoxPositions = new Set(boxPositions);
                newBoxPositions.delete(newPlayerKey);
                newBoxPositions.add(newBoxKey);
                // ZOBRIST HASHING
                // 2. Erase old box position, apply new box position
                nextHash ^= this.boxZobristTable[newPlayerR][newPlayerC]; // Remove box from its old spot
                nextHash ^= this.boxZobristTable[newBoxR][newBoxC]; // Add box to its new spot
                neighbors.push([newPlayerKey, newBoxPositions, moveChar, dRawBoxCount, nextHash]);
            }
            else { // Just a move, no pushes
                neighbors.push([newPlayerKey, boxPositions, moveChar.toLowerCase(), 0, nextHash]);
            }
        }
        return neighbors;
    }
    // ============ BFS on move basis (naive) ===============
    solveBFS(progressCallback, isPrintBoard = false) {
        // THE QUEUE IS THE FRONTIER,[playerPos, boxPositions, BoxCount, StateHash]
        const queue = new Deque();
        const visited = new Map();
        let nodesSearched = 0;
        // const initialState: GameState = {
        //     playerPos: this.initialPlayerPos,
        //     boxPositions: this.initialBoxPositions
        // };
        const initialHash = this.getInitialHash(this.initialPlayerPos, this.initialBoxPositions);
        queue.pushBack([this.initialPlayerPos, this.initialBoxPositions, this.initialRawBoxCount, initialHash]);
        visited.set(initialHash, { parentHash: null, move: '' });
        // THE QUEUE LOOP
        while (queue.length > 0) {
            const popped = queue.popFront();
            if (!popped)
                break;
            nodesSearched++;
            if (nodesSearched % 1000 === 0)
                progressCallback({ explored: nodesSearched });
            const [playerPos, boxPositions, currentRawBoxCount, currentHash] = popped;
            if (1 <= nodesSearched && nodesSearched <= 1000 && isPrintBoard)
                console.log(`node ${nodesSearched}:\n${this.printBoard(playerPos, boxPositions)}`);
            // Check if solved   // Legacy check: this.isSolved(boxPositions)
            if (currentRawBoxCount === 0) {
                // Reconstruct the path from the visited Map
                const finalPath = [];
                let curr = currentHash;
                while (curr !== null) {
                    const step = visited.get(curr);
                    if (step.move)
                        finalPath.push(step.move);
                    curr = step.parentHash;
                }
                return { type: 'success', path: finalPath.reverse().join(''), nodesSearched: nodesSearched };
            }
            for (const [nextPlayer, nextBoxes, move, dRawBoxCount, nextHash] of this.getNeighbors(playerPos, boxPositions, currentHash)) {
                if (visited.has(nextHash))
                    continue;
                // If not yet seen this next state then add to queue
                visited.set(nextHash, { parentHash: currentHash, move: move });
                let nextRawBoxCount = currentRawBoxCount + dRawBoxCount;
                queue.pushBack([nextPlayer, nextBoxes, nextRawBoxCount, nextHash]);
            }
        }
        return { type: 'error', message: "Error: No solution found", nodesSearched: nodesSearched };
    }
    // ============ BFS on push basis ===============
    solveBFSPush(progressCallback, isPrintBoard = false) {
        const queue = new Deque();
        const visited = new Map();
        let nodesSearched = 0;
        // 1. Compute the true canonical starting state
        const { playerPos: initialCanonicalInt } = this.floodRoom(this.initialPlayerPos, this.initialBoxPositions, false);
        const initialCanonicalHash = this.getInitialHash(initialCanonicalInt, this.initialBoxPositions);
        queue.pushBack([initialCanonicalInt, this.initialBoxPositions, this.initialRawBoxCount, initialCanonicalHash]);
        visited.set(initialCanonicalHash, { parentHash: null, move: '' });
        const getPushChar = (dr, dc) => {
            if (dr === -1)
                return 'U';
            if (dr === 1)
                return 'D';
            if (dc === -1)
                return 'L';
            if (dc === 1)
                return 'R';
            return '';
        };
        // THE MAIN SOLVER LOOP
        while (queue.length > 0) {
            const popped = queue.popFront();
            if (!popped)
                break;
            nodesSearched++;
            if (nodesSearched % 1000 === 0)
                progressCallback({ explored: nodesSearched });
            const [canonicalPlayerPos, boxPositions, currentRawBoxCount, currentCanonicalHash] = popped;
            if (1 <= nodesSearched && nodesSearched <= 1000 && isPrintBoard)
                console.log(`node ${nodesSearched}:\n${this.printBoard(canonicalPlayerPos, boxPositions)}`);
            // 🚀 OPTIMIZATION: Unpack the current canonical player row/col OUTSIDE the loop
            // This fixes the primitive indexing crash and saves thousands of redundant operations.
            const [canR, canC] = getRC(canonicalPlayerPos);
            // 2. WIN CONDITION => Reconstruct the path
            if (this.isSolved(boxPositions)) {
                const finalPath = [];
                let curr = currentCanonicalHash;
                while (curr !== null) {
                    const step = visited.get(curr);
                    if (step.move)
                        finalPath.push(step.move);
                    curr = step.parentHash;
                }
                return {
                    type: 'success',
                    path: finalPath.reverse().join(''),
                    nodesSearched: nodesSearched
                };
            }
            // 3. EXPAND NEIGHBORS: We need pushes here, so generatePushes defaults to true
            const { pushes } = this.floodRoom(canonicalPlayerPos, boxPositions);
            for (const [boxInt, dr, dc] of pushes) {
                let [boxR, boxC] = getRC(boxInt);
                let [newBoxR, newBoxC] = [boxR + dr, boxC + dc];
                const newBoxInt = posInt(newBoxR, newBoxC);
                // 🚀 OPTIMIZATION 1: Mutate the set in-place (Zero memory allocation!)
                boxPositions.delete(boxInt);
                boxPositions.add(newBoxInt);
                // Run the flood fill directly on the shared set
                const { playerPos: nextCanonicalInt } = this.floodRoom(boxInt, boxPositions, false);
                const nextCanonicalPos = getRC(nextCanonicalInt);
                // Calculate the Zobrist hash 
                let nextCanonicalHash = currentCanonicalHash
                    ^ this.boxZobristTable[boxR][boxC]
                    ^ this.boxZobristTable[newBoxR][newBoxC]
                    ^ this.playerZobristTable[canR][canC]
                    ^ this.playerZobristTable[nextCanonicalPos[0]][nextCanonicalPos[1]];
                // 🚀 OPTIMIZATION 2: Check visited early!
                if (visited.has(nextCanonicalHash) || !this.pushablePositions.has(newBoxInt)) {
                    // Roll back the shared set before skipping
                    boxPositions.delete(newBoxInt);
                    boxPositions.add(boxInt);
                    continue;
                }
                // 🎉 GENUINE STATE FOUND: Only allocate memory when absolutely necessary
                const nextBoxes = new Set(boxPositions);
                // Roll back the shared set so the next loop iteration sees the original state
                boxPositions.delete(newBoxInt);
                boxPositions.add(boxInt);
                // Log parent lineage mapping
                const moveChar = getPushChar(dr, dc);
                visited.set(nextCanonicalHash, { parentHash: currentCanonicalHash, move: moveChar });
                // Calculate goal counter tracking adjustments
                let dRawBoxCount = 0;
                if (this.goalPositions.has(boxInt))
                    dRawBoxCount++;
                if (this.goalPositions.has(newBoxInt))
                    dRawBoxCount--;
                let nextRawBoxCount = currentRawBoxCount + dRawBoxCount;
                // Push clean state to the frontier
                queue.pushBack([nextCanonicalInt, nextBoxes, nextRawBoxCount, nextCanonicalHash]);
            }
        }
        return { type: 'error', message: "Error: No solution found", nodesSearched: nodesSearched };
    }
    // =========== SOLVE METHODS HANDLER =============
    solve(method, progressCallback) {
        // Catch the missing player error cleanly right here
        if (!this.initialPlayerPos) {
            return { type: "error", message: "Error: No player found on the board", nodesSearched: 0 };
        }
        else if (this.initialBoxPositions.size > this.goalPositions.size) {
            return { type: "error", message: "Error: More boxes than goals", nodesSearched: 0 };
        }
        this.pushablePositions = this.getPushablePositions(this.wallPositions, this.goalPositions);
        // console.log(formatPositionSet(this.pushablePositions));
        // METHOD SELECT
        switch (method) {
            case 'bfs': return this.solveBFS(progressCallback, true);
            case 'bfs-push': return this.solveBFSPush(progressCallback, true);
            default: return { type: "error", message: "Error: Invalid solve method", nodesSearched: 0 };
        }
    }
    // DEBUGGING HELPER
    printBoard(playerPos, boxPositions) {
        let board = [];
        for (let r = 0; r < this.rows; r++) {
            let row = '';
            for (let c = 0; c < this.cols; c++) {
                const key = (r << 16) | c;
                let cell = this.board[r][c];
                if (cell === '#') {
                    row += '#';
                }
                else if (cell === '.' && boxPositions.has(key)) {
                    row += '*';
                }
                else if (cell === '.' && !boxPositions.has(key)) {
                    row += '.';
                }
                else if (boxPositions.has(key)) {
                    row += '$';
                }
                else if (cell === '.' && key === playerPos) {
                    row += '+';
                }
                else if (key === playerPos) {
                    row += '@';
                }
                else {
                    row += ' ';
                }
            }
            board.push(row);
        }
        return board.join('\n');
    }
}
