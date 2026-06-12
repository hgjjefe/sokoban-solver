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
function formatPositionSet(posSet: PositionSet){
    let posTups = [];
    for (let posInt of posSet) posTups.push( getRC(posInt) );
    let posStrings = posTups.map(p=> `(${p[0]},${p[1]})` ).join(' ')
    return "Positions: " + posStrings;
}


// ========= THE SOLVER CLASS ==========

export class Solver {
    private board: string[][];
    private rows: number;
    private cols: number;
    private initialPlayerPos: PosTup | null = null; // Changed to allow null
    private initialBoxPositions: PositionSet = new Set<PosInt>();
    private initialRawBoxCount : BoxCount = 0;
    private wallPositions: PositionSet = new Set<PosInt>();
    private goalPositions: PositionSet = new Set<PosInt>();
    private goalCount : number;
    private pushablePositions: PositionSet = new Set<PosInt>();

    private playerZobristTable: bigint[][] = [];  // For Zobrist Hashing
    private boxZobristTable: bigint[][] = [];

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
                const key = (r << 16) | c;
                switch (cell){
                    case '#': this.wallPositions.add(key); break;
                    case '@': this.initialPlayerPos = [r, c]; break;
                    case '$': this.initialBoxPositions.add(key); 
                              this.initialRawBoxCount++; break;
                    case '.': this.goalPositions.add(key); break;
                    case '*': this.initialBoxPositions.add(key);
                              this.goalPositions.add(key); break;
                    case '+': this.initialPlayerPos = [r, c];
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
    }
    // Call this once at the very start of solve() to get your baseline hash
    private getInitialHash(player: [number, number], boxes: PositionSet): StateHash {
        let hash = this.playerZobristTable[player[0]][player[1]];
        for (const packedPos of boxes) {
            const r = packedPos >> 16;
            const c = packedPos & 0xFFFF;
            hash ^= this.boxZobristTable[r][c]; // XOR the box position in
        }
        return hash;
    }

    // Static Analysis
    private getPushablePositions(wallPositions: PositionSet, goalPositions: PositionSet): PositionSet{
        let flooded: PositionSet = new Set();
        for (let goalPos of this.goalPositions) {
            if (flooded.has(goalPos)) continue;
            let queue = new Deque<PosInt>([goalPos]);
            while (queue.length) {
                let curPos = queue.popFront(); let [r,c] = getRC(curPos);
                flooded.add(curPos);
                for (let nPos of getAdjPos(curPos)) { // FIXED
                    let [nr, nc] = getRC(nPos);
                    if (!flooded.has(nPos) && !this.wallPositions.has(nPos)
                     && !this.wallPositions.has( posInt(r+2*(nr-r), c+2*(nc-c)) )
                    ) {
                        queue.pushBack(nPos);
                    }
                }
            }
        }
        return flooded;
    }

    private getStateKey(playerPos: PosTup, boxPositions: PositionSet): string {
        const sortedBoxes = Array.from(boxPositions).sort().join(';');
        return `${playerPos[0]},${playerPos[1]}|${sortedBoxes}`;
    }

    private isSolved(boxPositions: PositionSet): boolean {
        for (const box of boxPositions) {
            if (!this.goalPositions.has(box)) return false;
        }
        return true;
    }
    private isInBound(playerPos: PosTup): boolean {
        return 0 <= playerPos[0] && playerPos[0] < this.rows && 0 <=playerPos[1] && playerPos[1] < this.cols
    }
    private getNeighbors(playerPos: PosTup, boxPositions: PositionSet, currentHash: StateHash): Array<[PosTup, PositionSet, CasedMove, -1|0|1, StateHash]> {
        const neighbors: Array<[PosTup, PositionSet, CasedMove, -1|0|1, StateHash]> = [];
        const [r, c] = playerPos;

        for (const [moveChar, [dr, dc]] of Object.entries(MOVES) as [Move, [number, number]][]) {
            const newPlayerR = r + dr;  const newPlayerC = c + dc;
            const newPlayerKey = (newPlayerR << 16) | newPlayerC;
            const newPlayerPos = [ newPlayerR, newPlayerC ] as PosTup;
            // Move making player out of boound or hit a wall is not valid
            if (!this.isInBound(newPlayerPos) || this.board[newPlayerR][newPlayerC] === '#' ) {
                continue;
            }
            // ZOBRIST HASHING
            let nextHash = currentHash;
            // 11. Erase old player position, apply new player position
            nextHash ^= this.playerZobristTable[r][c];                 // Remove old player
            nextHash ^= this.playerZobristTable[newPlayerR][newPlayerC]; // Add new player

            // Push a box => Outputs capital move letters
            if (boxPositions.has(newPlayerKey)) {
                const newBoxR = newPlayerR + dr; const newBoxC = newPlayerC + dc;
                const newBoxKey = (newBoxR << 16) | newBoxC;
                const newBoxPos: PosTup = [newBoxR, newBoxC];
                // Box cannot be pushed to out of bounds OR another box OR a wall
                //   OR to non-pushable positions
                if ( !this.isInBound( newBoxPos ) || boxPositions.has(newBoxKey)
                 || this.board[newBoxR][newBoxC] === '#' || !this.pushablePositions.has(newBoxKey) ) {
                    continue;
                }
                let dRawBoxCount: -1|0|1 = this.goalPositions.has(newPlayerKey)?1:0;
                dRawBoxCount += this.goalPositions.has(newBoxKey)?-1:0;
                const newBoxPositions: PositionSet = new Set(boxPositions);
                newBoxPositions.delete(newPlayerKey);
                newBoxPositions.add(newBoxKey);
                // ZOBRIST HASHING
                // 2. Erase old box position, apply new box position
                nextHash ^= this.boxZobristTable[newPlayerR][newPlayerC]; // Remove box from its old spot
                nextHash ^= this.boxZobristTable[newBoxR][newBoxC];       // Add box to its new spot

                neighbors.push([[newPlayerR, newPlayerC], newBoxPositions, moveChar, dRawBoxCount as -1|0|1, nextHash]);


            } else {  // Just a move, no pushes
                neighbors.push([[newPlayerR, newPlayerC], boxPositions, moveChar.toLowerCase() as CasedMove, 0, nextHash]);
            }
        }
        return neighbors;
    }

    // Now returns string[] for a win, or a string message for an error/failure
    public solve(progressCallback): SolveResult {
        // Catch the missing player error cleanly right here
        if (!this.initialPlayerPos) {
            return {type:"error", message:"Error: No player found on the board", nodesSearched: 0};
        } else if (this.initialBoxPositions.size > this.goalPositions.size){
            return {type:"error", message:"Error: More boxes than goals", nodesSearched: 0};
        }
        this.pushablePositions = this.getPushablePositions(this.wallPositions, this.goalPositions);
        // console.log(formatPositionSet(this.pushablePositions));

        // THE QUEUE IS THE FRONTIER OF THE EXPLORED STATE SPACE
        const queue = new Deque<[GameState, Path, BoxCount, StateHash]>();
        const visited = new Set<StateHash>();
        let nodesSearched = 0;
        const initialState: GameState = {
            playerPos: this.initialPlayerPos,
            boxPositions: this.initialBoxPositions
        };
        const initialHash = this.getInitialHash(this.initialPlayerPos, this.initialBoxPositions);

        queue.pushBack([initialState, [], this.initialRawBoxCount, initialHash]);
        visited.add(initialHash);
        // THE QUEUE LOOP
        while (queue.length > 0) {
            const popped = queue.popFront();
            if (!popped) break;
            nodesSearched++;
            if (nodesSearched % 1000 === 0) progressCallback({explored: nodesSearched});
            const [{ playerPos, boxPositions }, path, currentRawBoxCount, currentHash] = popped;
            // Check if solved   // Legacy check: this.isSolved(boxPositions)
            if (  currentRawBoxCount === 0 ) {
                return {type:'success', path: path.join(''), nodesSearched: nodesSearched};
            }

            for (const [nextPlayer, nextBoxes, move, dRawBoxCount, nextHash] of this.getNeighbors(playerPos, boxPositions, currentHash)) {
                if ( visited.has(nextHash) ) continue;
                
                // If not yet seen this next state then add to queue
                visited.add(nextHash);
                let nextRawBoxCount = currentRawBoxCount + dRawBoxCount;

                queue.pushBack([{ playerPos: nextPlayer, boxPositions: nextBoxes }, [...path, move], nextRawBoxCount, nextHash]);
            }
        }

        return {type:'error', message: "Error: No solution found", nodesSearched: nodesSearched};
    }
}