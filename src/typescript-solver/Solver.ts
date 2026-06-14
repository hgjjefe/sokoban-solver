// import { range } from "./utils";
// import { Deque } from "./Deque";

class Deque<T> {
    private data: (T | null)[] = []; // 👈 Use a fast native array
    private head = 0;
    private tail = 0;
    pushBack(item: T): void {
        this.data[this.tail] = item;
        this.tail++;
    }
    popFront(): T | undefined {
        if (this.head === this.tail) return undefined;
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
    constructor(arr: T[]= undefined){
        if (arr === undefined) return;
        for (let item of arr)
            this.pushBack(item);
    }
    get length(): number {
        return this.tail - this.head;
    }
}
// GridText formatting Helpers
const range = (n:number) => [...Array(n).keys()] 
function stripEmptyRowsCols(gridText:string[]){
    const res = gridText.filter(row => /\S/.test(row));
    const gridWidth = res[0].length; const rangeW = range(gridWidth);
    const minCol = rangeW.findIndex(i =>/\S/.test( res.map(row => row[i]).join('') ) );
    const maxCol = rangeW.findLastIndex(i =>/\S/.test( res.map(row => row[i]).join('') ) );
    return res.map( row => row.slice(minCol, maxCol+1) );
}

type PosTup = [number, number];
type PosInt = number;   // use (r << 16 | c) format for potential performance boost
type PositionSet = Set<PosInt>;
type BoxPositions = Uint32Array;
type StateHash = bigint;
interface GameState {
    playerPos: PosTup;
    boxPositions: Set<PosInt>;
}
type Path = string[]; type BoxCount = number;
export type SolveResult = 
    | { type: "success"; path: string; nodesSearched: number }
    | { type: "error"; message: string; nodesSearched: number };


type Move = 'U' | 'D' | 'L' | 'R' //| 'u' | 'd' | 'l' | 'r';
type CasedMove = Move | 'u' | 'd' | 'l' | 'r';
const MOVES: Record<Move, [number, number]> = {
            'U': [-1, 0], 'D': [1, 0], 'L': [0, -1], 'R': [0, 1],
          //  'u': [-1, 0], 'd': [1, 0], 'l': [0, -1], 'r': [0, 1]
};

// =========== SOME HELPERS ==============
// Convert [r,c] into a packed PosInt
function posInt(r:number,c:number): PosInt {
    return (r << 16) | c;
} // Unpack PosInt into [r,c]
function getRC(posInt: PosInt){
    return [posInt >> 16, posInt & 0xFFFF ];
}
// Get packed positions orthogonally adjacent to the currentPos
function getAdjPos(currentPos: PosInt): PosInt[] {
    let [r,c] = getRC(currentPos);
    return [ posInt(r-1,c), posInt(r+1,c), posInt(r,c-1), posInt(r,c+1) ];
}
function getAdjPosWithMove(currentPos: PosInt): [PosInt, number,number][] {
    let [r,c] = getRC(currentPos);
    return [ [posInt(r-1,c), -1, 0], [posInt(r+1,c),1, 0], [posInt(r,c-1),0, -1], [posInt(r,c+1),0, 1] ];
}
function formatPositionSet(posSet: PositionSet){
    let posTups = [];
    for (let posInt of posSet) posTups.push( getRC(posInt) );
    let posStrings = posTups.map(p=> `(${p[0]},${p[1]})` ).join(' ')
    return "Positions: " + posStrings;
}
function vectorAdd(posInt: PosInt, dr: number, dc: number): PosInt {
    // 1. Extract, add, and re-mask the column so it stays within 16 bits
    const nextC = ((posInt & 0xFFFF) + dc) & 0xFFFF;
    // 2. Extract and add the row (arithmetic right shift preserves negative signs)
    const nextR = (posInt >> 16) + dr;
    // 3. Re-pack them seamlessly
    return (nextR << 16) | nextC;
}


// ========= THE SOLVER CLASS ==========

export class Solver {
    private board: string[][];
    private rows: number;
    private cols: number;
    private initialPlayerPos: PosInt | null = null; // Changed to allow null
    private initialBoxPositionSet: PositionSet = new Set<PosInt>();
    private initialBoxPositions: BoxPositions // Store boxPos in array to reduce Set() overhead
    private boxGridLookup: Uint8Array;       // For looking up if a position is a box
    private initialRawBoxCount : BoxCount = 0;
    private wallPositions: PositionSet = new Set<PosInt>();
    private goalPositions: PositionSet = new Set<PosInt>();
    private goalCount : number;
    private pushablePositions: PositionSet = new Set<PosInt>();

    private playerZobristTable: bigint[][] = [];  // For Zobrist Hashing
    private boxZobristTable: bigint[][] = [];
    // // FLOODFILL BUFFER DURING RUNNING
    // private floodPositions: BoxPositions;
    private floodQueue: Uint32Array;
    private floodedGrid: Uint32Array; // A fixed size array for storing each pos is flooded or not
    private floodToken: number;  // The current number indicating flood, can be 1,2,...,
    private pushActions; 
    private pushCount = 0;
    private canonicalPlayerPos: PosInt = 0;

    constructor(board: string[]) {
        // board = stripEmptyRowsCols(board);
        this.board = board.map(row => row.split(''));
        this.rows = this.board.length;
        this.cols = this.board[0].length;
        for (let r = 0; r < this.rows; r++) {
            this.playerZobristTable[r] = [];
            this.boxZobristTable[r] = [];
            for (let c = 0; c < this.cols; c++) {
                const cell = this.board[r][c];
                const key = posInt(r,c);
                switch (cell){
                    case '#': this.wallPositions.add(key); break;
                    case '@': this.initialPlayerPos = key; break;
                    case '$': this.initialBoxPositionSet.add(key); 
                              this.initialRawBoxCount++; break;
                    case '.': this.goalPositions.add(key); break;
                    case '*': this.initialBoxPositionSet.add(key);
                              this.goalPositions.add(key); break;
                    case '+': this.initialPlayerPos = key;
                              this.goalPositions.add(key); break;
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
        this.initialBoxPositions = new Uint32Array(this.initialBoxPositionSet);
        this.boxGridLookup = new Uint8Array(this.rows * this.cols);
        this.updateBoxGridLookup(this.initialBoxPositions);
        // Initialize flood queue for storing flooded tiles during by-push solving
        this.floodQueue = new Uint32Array(this.rows * this.cols);
        this.floodedGrid = new Uint32Array(this.rows * this.cols);
        this.floodToken = 0;
        this.floodedGrid.fill(0);  // Initialize grid cell values
        this.pushActions = new Int32Array(this.initialBoxPositions.length);
    }
    // ========== boxGridLookup Helpers ==============
    // for boxGridLookup index, general the index of 1D grid
    private lookupIndex(packedPos: PosInt): number {
        return ((packedPos >> 16) * this.cols) + (packedPos & 0xFFFF);
    } // Helper for boxGridLookup index
    private boxGridLookupHas(index: number){
        return this.boxGridLookup[index] === 1
    }  // Another helper for accepting posInt directly
    private boxPositionsHas(boxPos: PosInt){
        return this.boxGridLookup[this.lookupIndex(boxPos)] === 1
    }
    private updateBoxGridLookup(boxPositions: BoxPositions){
        this.boxGridLookup.fill(0); // Wipe the grid instantly
        for (let i = 0; i < boxPositions.length; i++) {
            this.boxGridLookup[this.lookupIndex(boxPositions[i])] = 1;
        }
    }
    // ========== Other Helpers ==============
    // Call this once at the very start of solve() to get your baseline hash
    private getInitialHash(playerInt: PosInt, boxes: BoxPositions): StateHash {
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
    private isSolved(boxPositions: BoxPositions): boolean {
        for (const box of boxPositions) {
            if (!this.goalPositions.has(box)) return false;
        }
        return true;
    }
    private isInBound(playerPos: PosInt): boolean {
        let [playerR, playerC] = getRC(playerPos);
        return 0 <= playerR && playerR < this.rows && 0 <= playerC && playerC < this.cols
    }

    // Static Analysis using naive flood fill, called at start of solve()
    private getPushablePositions(wallPositions: PositionSet, goalPositions: PositionSet): PositionSet{
        let flooded: PositionSet = new Set();
        let queue = new Deque<PosInt>();
        for (let goalPos of this.goalPositions) {
            flooded.add(goalPos);
            queue.pushBack(goalPos);
        }
            while (queue.length) {
                let curPos = queue.popFront(); let [r,c] = getRC(curPos);       
                for (let nPos of getAdjPos(curPos)) { // FIXED
                    let [nr, nc] = getRC(nPos);
                    if (!flooded.has(nPos) && !this.wallPositions.has(nPos)
                     && !this.wallPositions.has( posInt(r+2*(nr-r), c+2*(nc-c)) )
                    ) {
                        flooded.add(nPos);
                        queue.pushBack(nPos);
                    }
                }
            }
        return flooded;
    }
    // Dynamic 2x2 Freeze detection
    private isValidPush(boxPos: PosInt, dr: number, dc: number, boxPositions: BoxPositions){
        const newBoxPos = vectorAdd(boxPos, dr, dc);
        const newBoxIdx = this.lookupIndex(newBoxPos);
        // Box cannot be pushed to another box or a wall or non-pushable positions
        if (this.wallPositions.has(newBoxPos)|| this.boxGridLookupHas(newBoxIdx)
            || !this.pushablePositions.has(newBoxPos) ) return false;
        // 2x2 freeze
        // $ $  becomes  $$    OR      $$  becomes  $$
        //  $$           $$           $ $           $$
        const secondPos = vectorAdd(newBoxPos, dr, dc);
        const secondPosIsBox = this.boxPositionsHas(secondPos);
        if (!(this.wallPositions.has(secondPos)|| secondPosIsBox)) return true;
        const newBoxIsRaw = !this.goalPositions.has(newBoxPos);
        // --- QUADRANT 1 CHECK ---
        let thirdPos = vectorAdd(newBoxPos, -dc, dr);
        let fourthPos = vectorAdd(secondPos, -dc, dr);
        let thirdPosIsBox = this.boxPositionsHas(thirdPos);
        let fourthPosIsBox = this.boxPositionsHas(fourthPos);
        if ((this.wallPositions.has(thirdPos) || thirdPosIsBox) &&
            (this.wallPositions.has(fourthPos) || fourthPosIsBox)) {
            const hasRawBox = newBoxIsRaw ||
                          (secondPosIsBox && !this.goalPositions.has(secondPos)) ||
                          (thirdPosIsBox && !this.goalPositions.has(thirdPos)) ||
                          (fourthPosIsBox && !this.goalPositions.has(fourthPos));
            if (hasRawBox) return false;
        }
        // --- QUADRANT 2 CHECK ---
        thirdPos = vectorAdd(newBoxPos, dc, -dr);
        fourthPos = vectorAdd(secondPos, dc, -dr);
        thirdPosIsBox = this.boxPositionsHas(thirdPos);
        fourthPosIsBox = this.boxPositionsHas(fourthPos);
        if ((this.wallPositions.has(thirdPos) || thirdPosIsBox) &&
            (this.wallPositions.has(fourthPos) || fourthPosIsBox)) {
            const hasRawBox = newBoxIsRaw ||
                          (secondPosIsBox && !this.goalPositions.has(secondPos)) ||
                          (thirdPosIsBox && !this.goalPositions.has(thirdPos)) ||
                          (fourthPosIsBox && !this.goalPositions.has(fourthPos));
            if (hasRawBox) return false;
        }
        return true;
    }
    // Flood fill with simple bfs, identifying pushable box positions
    private floodRoom(playerPos: PosInt, boxPositions: BoxPositions, generatePushes:boolean=true) {
        this.updateBoxGridLookup(boxPositions);
        this.floodToken++;  //Use a new floodToken, logically turning previous flooded tiles into unflooded
        // Initial reusable queue
        let head = 0; let tail = 0;
        this.floodQueue[tail++] = playerPos;
        this.floodedGrid[this.lookupIndex(playerPos)] = this.floodToken; // Mark visited
        let pushableBoxes: [PosInt, number,number][] = []
        let minPlayerPos = playerPos;
        let [minR, minC] = getRC(playerPos);
        while (head < tail) {  // meaning floodQueue.length > 0
            let curPos = this.floodQueue[head++];  if (curPos === undefined) break;
            for (let [nPos, dr,dc] of getAdjPosWithMove(curPos)) { 
                let [nr, nc] = getRC(nPos); let nIdx = this.lookupIndex(nPos);
                // Flood to a floor
                if (this.floodedGrid[nIdx] !== this.floodToken && !this.wallPositions.has(nPos)&& !this.boxPositionsHas(nPos)) { 
                    this.floodedGrid[nIdx] = this.floodToken;  // Mark flooded
                    this.floodQueue[tail++] = nPos;      // floodQueue.pushBack(nPos)
                    // Compare and update canonical tile instantly (reading order: top-to-bottom, left-to-right)
                    if (nr < minR || (nr === minR && nc < minC)) {
                        minR = nr;
                        minC = nc;
                        minPlayerPos = nPos;
                    }
                }else if (generatePushes && this.boxPositionsHas(nPos)){ // Flood water finds a box
                    let landingRow = nr + dr;
                    let landingCol = nc + dc;
                    let landingPosInt = posInt(landingRow, landingCol);
                    // A push is only valid if the landing tile is NOT a wall and NOT another box
                    if (!this.wallPositions.has(landingPosInt) && !this.boxPositionsHas(landingPosInt)) {
                        pushableBoxes.push([nPos, dr,dc]);
                    }
                }
            }
        }    // The top left corner floor, list of [boxes, dr, dc] where dr,dc is move
        return { playerPos: minPlayerPos, pushes: pushableBoxes};
    }
    // 🔥 Fixed getNextPushes engine
    private getNextPushes(rawPlayerPos: PosInt, boxPositions: BoxPositions, currentHash: StateHash) {
        const res: [PosInt, BoxPositions, StateHash, [number, number] ][] = [];
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
            const newBoxPositions: BoxPositions = new Uint32Array(boxPositions);
            let pushedBoxIndex = newBoxPositions.indexOf(boxInt);
            newBoxPositions[pushedBoxIndex] = posInt(newBoxR, newBoxC);
            // Incrementally update Zobrist hash for this specific push event
            let nextHash = baseBoxHash
                ^ this.boxZobristTable[boxR][boxC]       // Remove box from old spot
                ^ this.boxZobristTable[newBoxR][newBoxC] // Place box in new spot
                ^ this.playerZobristTable[boxR][boxC];   // Place player rawly where the box used to stand
            // Pass the raw player landing coordinate down to the child state
            // Inside the for-loop of getNextPushes, update your res.push to pass direction and old box position:
            res.push([boxInt, newBoxPositions, nextHash, [dr, dc] ]);
        }
        return { canonicalHash, transitions: res };
    }

    private getNeighbors(playerPos: PosInt, boxPositions: BoxPositions, currentHash: StateHash): Array<[PosInt, BoxPositions, CasedMove, -1|0|1, StateHash]> {
        const neighbors: Array<[PosInt, BoxPositions, CasedMove, -1|0|1, StateHash]> = [];
        const [r, c] = getRC(playerPos);

        for (const [moveChar, [dr, dc]] of Object.entries(MOVES) as [Move, [number, number]][]) {
            const newPlayerR = r + dr;  const newPlayerC = c + dc;
            const newPlayerPos = posInt(newPlayerR, newPlayerC)
            // Move making player out of boound or hit a wall is not valid
            if ( this.board[newPlayerR][newPlayerC] === '#' ) {
                continue;
            }
            // ZOBRIST HASHING
            let nextHash = currentHash;
            // 1. Erase old player position, apply new player position
            nextHash ^= this.playerZobristTable[r][c];                 // Remove old player
            nextHash ^= this.playerZobristTable[newPlayerR][newPlayerC]; // Add new player

            // Push a box => Outputs capital move letters
            if (this.boxPositionsHas(newPlayerPos)) {
                const newBoxR = newPlayerR + dr; const newBoxC = newPlayerC + dc;
                const newBoxPos = posInt(newBoxR, newBoxC);
                // Box cannot be pushed to out of bounds OR another box OR a wall
                //   OR to non-pushable positions
                if ( !this.isValidPush(newPlayerPos, dr, dc, boxPositions) ) {
                    continue;
                }
                let dRawBoxCount: -1|0|1 = this.goalPositions.has(newPlayerPos)?1:0;
                dRawBoxCount += this.goalPositions.has(newBoxPos)?-1:0;
                const newBoxPositions: BoxPositions = new Uint32Array(boxPositions);
                let pushedBoxIndex = newBoxPositions.indexOf(newPlayerPos);
                newBoxPositions[pushedBoxIndex] = newBoxPos;
                // ZOBRIST HASHING
                // 2. Erase old box position, apply new box position
                nextHash ^= this.boxZobristTable[newPlayerR][newPlayerC]; // Remove box from its old spot
                nextHash ^= this.boxZobristTable[newBoxR][newBoxC];       // Add box to its new spot

                neighbors.push([ newPlayerPos, newBoxPositions, moveChar, dRawBoxCount as -1|0|1, nextHash]);


            } else {  // Just a move, no pushes
                neighbors.push([newPlayerPos, boxPositions, moveChar.toLowerCase() as CasedMove, 0, nextHash]);
            }
        }
        return neighbors;
    }
    // ============ BFS on move basis (naive) ===============
    private solveBFS(progressCallback, isPrintBoard=false): SolveResult{
        // THE QUEUE IS THE FRONTIER,[playerPos, boxPositions, BoxCount, StateHash]
        const queue = new Deque<[PosInt, BoxPositions, BoxCount, StateHash]>();
        const visited = new Map<StateHash, {parentHash: StateHash|null, move: CasedMove|''}>();
        let nodesSearched = 0;
        // const initialState: GameState = {
        //     playerPos: this.initialPlayerPos,
        //     boxPositions: this.initialBoxPositions
        // };
        const initialHash = this.getInitialHash(this.initialPlayerPos, this.initialBoxPositions);
        queue.pushBack([this.initialPlayerPos, this.initialBoxPositions, this.initialRawBoxCount, initialHash]);
        visited.set(initialHash, { parentHash: null, move: ''});
        // THE QUEUE LOOP
        while (queue.length > 0) {
            const popped = queue.popFront();  if (!popped) break;
            nodesSearched++;  if (nodesSearched % 1000 === 0) progressCallback({explored: nodesSearched});

            const [playerPos, boxPositions, currentRawBoxCount, currentHash] = popped;
            if (isPrintBoard && 1 <=nodesSearched && nodesSearched <= 1000)
                console.log(`node ${nodesSearched}:\n${this.printBoard(playerPos, boxPositions)}` ); 
            // Check if solved   // Legacy check: this.isSolved(boxPositions)
            if (  currentRawBoxCount === 0 ) {
                // Reconstruct the path from the visited Map
                const finalPath: string[] = [];
                let curr = currentHash;
                while (curr !== null) {
                    const step = visited.get(curr)!;
                    if (step.move) finalPath.push(step.move);
                    curr = step.parentHash!;
                }
                return {type:'success', path: finalPath.reverse().join(''), nodesSearched: nodesSearched};
            }

            // --- UNPACK BOXES ONCE ---
            this.updateBoxGridLookup(boxPositions);

            for (const [nextPlayer, nextBoxes, move, dRawBoxCount, nextHash] of this.getNeighbors(playerPos, boxPositions, currentHash)) {
                if ( visited.has(nextHash) ) continue;
                // If not yet seen this next state then add to queue
                visited.set(nextHash, { parentHash: currentHash, move: move });
                let nextRawBoxCount = currentRawBoxCount + dRawBoxCount;
                queue.pushBack([nextPlayer, nextBoxes, nextRawBoxCount, nextHash]);
            }
        }
        return {type:'error', message: "Error: No solution found", nodesSearched: nodesSearched};
    }
    // ============ BFS on push basis ===============
    private solveBFSPush(progressCallback, isPrintBoard=false): SolveResult {
        const queue = new Deque<[PosInt, BoxPositions, number, StateHash]>();
        const visited = new Map<StateHash, { parentHash: StateHash | null, move: string }>();
        let nodesSearched = 0;

        // 1. Compute the true canonical starting state
        const { playerPos: initialCanonicalInt } = this.floodRoom(this.initialPlayerPos, this.initialBoxPositions, false);
        const initialCanonicalHash = this.getInitialHash(initialCanonicalInt, this.initialBoxPositions);
        
        queue.pushBack([initialCanonicalInt, this.initialBoxPositions, this.initialRawBoxCount, initialCanonicalHash]);
        visited.set(initialCanonicalHash, { parentHash: null, move: '' });

        const getPushChar = (dr: number, dc: number): string => {
            if (dr === -1) return 'U';
            if (dr === 1) return 'D';
            if (dc === -1) return 'L';
            if (dc === 1) return 'R';
            return '';
        };

        // THE MAIN SOLVER LOOP
        while (queue.length > 0) {
            const popped = queue.popFront();   if (!popped) break;
            nodesSearched++;
            if (nodesSearched % 1000 === 0) progressCallback({ explored: nodesSearched });
            
            const [canonicalPlayerPos, boxPositions, currentRawBoxCount, currentCanonicalHash] = popped;
             // if(nodesSearched===8) console.log(`playPos at node ${nodesSearched}:`, getRC(canonicalPlayerPos))
            if (isPrintBoard && 1 <=nodesSearched && nodesSearched <= 1000)
                console.log(`node ${nodesSearched}:\n${this.printBoard(canonicalPlayerPos, boxPositions)}` ); 
            // 🚀 OPTIMIZATION: Unpack the current canonical player row/col OUTSIDE the loop
            // This fixes the primitive indexing crash and saves thousands of redundant operations.
            const [canR, canC] = getRC(canonicalPlayerPos);
            // 2. WIN CONDITION => Reconstruct the path
            if ( currentRawBoxCount === 0) {
                const finalPath: string[] = [];
                let curr: StateHash | null = currentCanonicalHash;
                
                while (curr !== null) {
                    const step = visited.get(curr)!;
                    if (step.move) finalPath.push(step.move);
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

                const newBoxPositions: BoxPositions = new Uint32Array(boxPositions);
                let pushedBoxIndex = newBoxPositions.indexOf(boxInt);
                newBoxPositions[pushedBoxIndex] = newBoxInt;

                // Run the flood fill directly on the shared set
                const { playerPos: nextCanonicalInt } = this.floodRoom(boxInt, newBoxPositions, false);
                const nextCanonicalPos = getRC(nextCanonicalInt);

                // Calculate the Zobrist hash 
                let nextCanonicalHash = currentCanonicalHash
                    ^ this.boxZobristTable[boxR][boxC]       
                    ^ this.boxZobristTable[newBoxR][newBoxC] 
                    ^ this.playerZobristTable[canR][canC]   
                    ^ this.playerZobristTable[nextCanonicalPos[0]][nextCanonicalPos[1]];

                // 🚀 OPTIMIZATION 2: Check visited early!
                if (visited.has(nextCanonicalHash)|| !this.pushablePositions.has(newBoxInt)) {
                    // Roll back the shared set before skipping
                    // boxPositions.delete(newBoxInt);
                    // boxPositions.add(boxInt);
                    continue;
                }

                // Log parent lineage mapping
                const moveChar = getPushChar(dr, dc);
                visited.set(nextCanonicalHash, { parentHash: currentCanonicalHash, move: moveChar });

                // Calculate goal counter tracking adjustments
                let dRawBoxCount = 0;
                if (this.goalPositions.has(boxInt)) dRawBoxCount++;    
                if (this.goalPositions.has(newBoxInt)) dRawBoxCount--; 
                let nextRawBoxCount = currentRawBoxCount + dRawBoxCount;

                // Push clean state to the frontier
                queue.pushBack([nextCanonicalInt, newBoxPositions, nextRawBoxCount, nextCanonicalHash]);
            }
        }

        return { type: 'error', message: "Error: No solution found", nodesSearched: nodesSearched };
    }

    // ============ Astar on move basis (naive) ===============
    private solveAstar(progressCallback, isPrintBoard=false): SolveResult{
        // THE QUEUE IS THE FRONTIER,[playerPos, boxPositions, BoxCount, StateHash]
        const queue = new Deque<[PosInt, BoxPositions, BoxCount, StateHash]>();
        const visited = new Map<StateHash, {parentHash: StateHash|null, move: CasedMove|''}>();
        let nodesSearched = 0;
        // const initialState: GameState = {
        //     playerPos: this.initialPlayerPos,
        //     boxPositions: this.initialBoxPositions
        // };
        const initialHash = this.getInitialHash(this.initialPlayerPos, this.initialBoxPositions);
        queue.pushBack([this.initialPlayerPos, this.initialBoxPositions, this.initialRawBoxCount, initialHash]);
        visited.set(initialHash, { parentHash: null, move: ''});
        // THE QUEUE LOOP
        while (queue.length > 0) {
            const popped = queue.popFront();  if (!popped) break;
            nodesSearched++;  if (nodesSearched % 1000 === 0) progressCallback({explored: nodesSearched});

            const [playerPos, boxPositions, currentRawBoxCount, currentHash] = popped;
            if (isPrintBoard && 1 <=nodesSearched && nodesSearched <= 1000)
                console.log(`node ${nodesSearched}:\n${this.printBoard(playerPos, boxPositions)}` ); 
            // Check if solved   // Legacy check: this.isSolved(boxPositions)
            if (  currentRawBoxCount === 0 ) {
                // Reconstruct the path from the visited Map
                const finalPath: string[] = [];
                let curr = currentHash;
                while (curr !== null) {
                    const step = visited.get(curr)!;
                    if (step.move) finalPath.push(step.move);
                    curr = step.parentHash!;
                }
                return {type:'success', path: finalPath.reverse().join(''), nodesSearched: nodesSearched};
            }

            // --- UNPACK BOXES ONCE ---
            this.updateBoxGridLookup(boxPositions);

            for (const [nextPlayer, nextBoxes, move, dRawBoxCount, nextHash] of this.getNeighbors(playerPos, boxPositions, currentHash)) {
                if ( visited.has(nextHash) ) continue;
                // If not yet seen this next state then add to queue
                visited.set(nextHash, { parentHash: currentHash, move: move });
                let nextRawBoxCount = currentRawBoxCount + dRawBoxCount;
                queue.pushBack([nextPlayer, nextBoxes, nextRawBoxCount, nextHash]);
            }
        }
        return {type:'error', message: "Error: No solution found", nodesSearched: nodesSearched};
    }
    // =========== SOLVE METHODS HANDLER =============
    public solve(method:string, progressCallback): SolveResult {
        // Catch the missing player error cleanly right here
        if (!this.initialPlayerPos) {
            return {type:"error", message:"Error: No player found on the board", nodesSearched: 0};
        } else if (this.initialBoxPositions.length > this.goalPositions.size){
            return {type:"error", message:"Error: More boxes than goals", nodesSearched: 0};
        }
        this.pushablePositions = this.getPushablePositions(this.wallPositions, this.goalPositions);
        // console.log(formatPositionSet(this.pushablePositions));
        // METHOD SELECT
        switch (method){
            case 'bfs': return this.solveBFS(progressCallback, true);
            case 'bfs-push': return this.solveBFSPush(progressCallback, true);
            default: return {type:"error", message:"Error: Invalid solve method", nodesSearched: 0};
        }
    }
    // DEBUGGING HELPER
    private printBoard(playerPos: PosInt, boxPositions: BoxPositions){
        let board = []
        let boxPositionSet = new Set(boxPositions)
        for (let r = 0; r < this.rows; r++) {
            let row = ''
            for (let c = 0; c < this.cols; c++) {

                const key = posInt(r,c);
                let cell = this.board[r][c]
                if (cell === '#'){
                    row += '#'
                }else if (cell === '.'  && boxPositionSet.has(key)){
                    row += '*'
                }else if (cell === '.' && key === playerPos){
                    row += '+'
                }else if (cell ==='.' ){
                    row += '.'
                }else if (boxPositionSet.has(key)){
                    row += '$'
                }else if (key === playerPos){
                    row += '@'
                }else{
                    row += ' '
                }
            }
            board.push(row)
        }
        return board.join('\n')
    }
}