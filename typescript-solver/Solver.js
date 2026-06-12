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
                        this.initialPlayerPos = [r, c];
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
                        this.initialPlayerPos = [r, c];
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
    getInitialHash(player, boxes) {
        let hash = this.playerZobristTable[player[0]][player[1]];
        for (const packedPos of boxes) {
            const r = packedPos >> 16;
            const c = packedPos & 0xFFFF;
            hash ^= this.boxZobristTable[r][c]; // XOR the box position in
        }
        return hash;
    }
    // Some helpers
    getStateKey(playerPos, boxPositions) {
        const sortedBoxes = Array.from(boxPositions).sort().join(';');
        return `${playerPos[0]},${playerPos[1]}|${sortedBoxes}`;
    }
    isSolved(boxPositions) {
        for (const box of boxPositions) {
            if (!this.goalPositions.has(box))
                return false;
        }
        return true;
    }
    isInBound(playerPos) {
        return 0 <= playerPos[0] && playerPos[0] < this.rows && 0 <= playerPos[1] && playerPos[1] < this.cols;
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
    floodRoom(playerPos, boxPositions) {
        let playerPosInt = posInt(playerPos[0], playerPos[1]);
        let flooded = new Set([playerPosInt]);
        let queue = new Deque([playerPosInt]);
        let pushableBoxes = [];
        while (queue.length) {
            let curPos = queue.popFront();
            let [r, c] = getRC(curPos);
            for (let [nPos, move] of getAdjPosWithMove(curPos)) { // FIXED
                let [nr, nc] = getRC(nPos);
                // Flood to a floor
                if (!flooded.has(nPos) && !this.wallPositions.has(nPos) && !boxPositions.has(nPos)) {
                    flooded.add(nPos);
                    queue.pushBack(nPos);
                }
                else if (boxPositions.has(nPos)) { // Flood water finds a box
                    let landingRow = nr + (nr - r);
                    let landingCol = nc + (nc - c);
                    let landingPosInt = posInt(landingRow, landingCol);
                    // 🛑 A push is only valid if the landing tile is NOT a wall and NOT another box
                    if (!this.wallPositions.has(landingPosInt) && !boxPositions.has(landingPosInt)) {
                        pushableBoxes.push([nPos, move]);
                    }
                }
            }
        }
        // Get the topleft position
        let normalizedPlayerPos = [...flooded].reduce((a, b) => (getRC(a)[0] - getRC(b)[0] || getRC(a)[1] - getRC(b)[1]) < 0 ? a : b);
        return { playerInt: normalizedPlayerPos, pushes: pushableBoxes };
    }
    // 🔥 Fixed getNextPushes engine
    getNextPushes(rawPlayerPos, boxPositions, currentHash) {
        const res = [];
        // 1. Analyze the current room from our raw entry point
        const { playerInt: canonicalPlayer, pushes } = this.floodRoom(rawPlayerPos, boxPositions);
        // 2. Compute the canonical hash for this room state
        let [rawR, rawC] = rawPlayerPos;
        let [canR, canC] = getRC(canonicalPlayer);
        // Swap raw player position hash out, and put the standardized canonical hash in
        let canonicalHash = currentHash
            ^ this.playerZobristTable[rawR][rawC]
            ^ this.playerZobristTable[canR][canC];
        // 3. Generate child transitions
        for (const [boxInt, [dr, dc]] of pushes) {
            let [boxR, boxC] = getRC(boxInt);
            let [newBoxR, newBoxC] = [boxR + dr, boxC + dc];
            // Create the next state's immutable box arrangement
            const newBoxPositions = new Set(boxPositions);
            newBoxPositions.delete(boxInt);
            newBoxPositions.add(posInt(newBoxR, newBoxC));
            // Incrementally update Zobrist hash for this specific push event
            let nextHash = canonicalHash
                ^ this.boxZobristTable[boxR][boxC] // Remove box from old spot
                ^ this.boxZobristTable[newBoxR][newBoxC] // Place box in new spot
                ^ this.playerZobristTable[canR][canC] // Remove old canonical player signature
                ^ this.playerZobristTable[boxR][boxC]; // Place player rawly where the box used to stand
            // Pass the raw player landing coordinate [boxR, boxC] down to the child state
            // Inside the for-loop of getNextPushes, update your res.push to pass direction and old box position:
            res.push([[boxR, boxC], newBoxPositions, nextHash, [dr, dc], boxInt]);
        }
        return { canonicalHash, transitions: res };
    }
    getNeighbors(playerPos, boxPositions, currentHash) {
        const neighbors = [];
        const [r, c] = playerPos;
        for (const [moveChar, [dr, dc]] of Object.entries(MOVES)) {
            const newPlayerR = r + dr;
            const newPlayerC = c + dc;
            const newPlayerKey = (newPlayerR << 16) | newPlayerC;
            const newPlayerPos = [newPlayerR, newPlayerC];
            // Move making player out of boound or hit a wall is not valid
            if (!this.isInBound(newPlayerPos) || this.board[newPlayerR][newPlayerC] === '#') {
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
                const newBoxPos = [newBoxR, newBoxC];
                // Box cannot be pushed to out of bounds OR another box OR a wall
                //   OR to non-pushable positions
                if (!this.isInBound(newBoxPos) || boxPositions.has(newBoxKey)
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
                neighbors.push([[newPlayerR, newPlayerC], newBoxPositions, moveChar, dRawBoxCount, nextHash]);
            }
            else { // Just a move, no pushes
                neighbors.push([[newPlayerR, newPlayerC], boxPositions, moveChar.toLowerCase(), 0, nextHash]);
            }
        }
        return neighbors;
    }
    // ============ BFS on move basis (naive) ===============
    solveBFS(progressCallback) {
        // THE QUEUE IS THE FRONTIER OF THE EXPLORED STATE SPACE
        const queue = new Deque();
        const visited = new Set();
        let nodesSearched = 0;
        const initialState = {
            playerPos: this.initialPlayerPos,
            boxPositions: this.initialBoxPositions
        };
        const initialHash = this.getInitialHash(this.initialPlayerPos, this.initialBoxPositions);
        queue.pushBack([initialState, [], this.initialRawBoxCount, initialHash]);
        visited.add(initialHash);
        // THE QUEUE LOOP
        while (queue.length > 0) {
            const popped = queue.popFront();
            if (!popped)
                break;
            nodesSearched++;
            if (nodesSearched % 1000 === 0)
                progressCallback({ explored: nodesSearched });
            const [{ playerPos, boxPositions }, path, currentRawBoxCount, currentHash] = popped;
            // Check if solved   // Legacy check: this.isSolved(boxPositions)
            if (currentRawBoxCount === 0) {
                return { type: 'success', path: path.join(''), nodesSearched: nodesSearched };
            }
            for (const [nextPlayer, nextBoxes, move, dRawBoxCount, nextHash] of this.getNeighbors(playerPos, boxPositions, currentHash)) {
                if (visited.has(nextHash))
                    continue;
                // If not yet seen this next state then add to queue
                visited.add(nextHash);
                let nextRawBoxCount = currentRawBoxCount + dRawBoxCount;
                queue.pushBack([{ playerPos: nextPlayer, boxPositions: nextBoxes }, [...path, move], nextRawBoxCount, nextHash]);
            }
        }
        return { type: 'error', message: "Error: No solution found", nodesSearched: nodesSearched };
    }
    // ============ BFS on push basis ===============
    solveBFSPush(progressCallback) {
        // 1. Initialize the frontier queue with the raw initial state
        const queue = new Deque();
        const visited = new Set();
        let nodesSearched = 0;
        const initialHash = this.getInitialHash(this.initialPlayerPos, this.initialBoxPositions);
        queue.pushBack([this.initialPlayerPos, this.initialBoxPositions, [], this.initialRawBoxCount, initialHash]);
        // Direction to string character mapping helper
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
        // THE QUEUE LOOP
        while (queue.length > 0) {
            const popped = queue.popFront();
            if (!popped)
                break;
            const [playerPos, boxPositions, path, currentRawBoxCount, currentHash] = popped;
            // 2. NORMALIZE ON POP: Let floodRoom determine this state's true canonical room identity
            const { canonicalHash, transitions } = this.getNextPushes(playerPos, boxPositions, currentHash);
            // 3. De-duplicate check against the unique room configuration
            if (visited.has(canonicalHash))
                continue;
            visited.add(canonicalHash);
            nodesSearched++;
            if (nodesSearched % 1000 === 0)
                progressCallback({ explored: nodesSearched });
            // 4. Check Win Condition
            if (currentRawBoxCount === 0) {
                return { type: 'success', path: path.join(''), nodesSearched: nodesSearched };
            }
            // 5. Expand neighbor transitions
            for (const [nextPlayerRaw, nextBoxes, nextHash, [dr, dc], oldBoxInt] of transitions) {
                // Calculate the move string character (e.g., 'U', 'D', 'L', 'R')
                const moveChar = getPushChar(dr, dc);
                // Calculate change in box count relative to goal positions
                let dRawBoxCount = 0;
                const newBoxInt = posInt(nextPlayerRaw[0] + dr, nextPlayerRaw[1] + dc);
                if (this.goalPositions.has(oldBoxInt))
                    dRawBoxCount++; // Left a goal
                if (this.goalPositions.has(newBoxInt))
                    dRawBoxCount--; // Entered a goal
                let nextRawBoxCount = currentRawBoxCount + dRawBoxCount;
                // Push raw child states into the queue
                queue.pushBack([
                    nextPlayerRaw,
                    nextBoxes,
                    [...path, moveChar],
                    nextRawBoxCount,
                    nextHash
                ]);
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
            case 'bfs': return this.solveBFS(progressCallback);
            case 'bfs-push': return this.solveBFSPush(progressCallback);
            default: return { type: "error", message: "Error: Invalid solve method", nodesSearched: 0 };
        }
    }
}
