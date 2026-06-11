import { range, stripEmptyRowsCols } from "./utils";
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
        if (this.head > 100000) {
            this.data = this.data.slice(this.head);
            this.tail -= this.head;
            this.head = 0;
        }

        return item ?? undefined;
    }

    get length(): number {
        return this.tail - this.head;
    }
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

// Some Helpers


// Analyzer Helpers
function getDeadlockPositions(rows: number, cols:number, wallPositions: PositionSet, goalPositions: PositionSet){
    return;
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

    private playerZobristTable: bigint[][] = [];  // For Zobrist Hashing
    private boxZobristTable: bigint[][] = [];
    private initialStateHash: bigint = 0n;

    constructor(board: string[]) {
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

    private getStateKey(playerPos: PosTup, boxPositions: PositionSet): string {
        const sortedBoxes = Array.from(boxPositions).sort().join(';');
        return `${playerPos[0]},${playerPos[1]}|${sortedBoxes}`;
    }
    private getNextHash(playerPos: PosTup, move: CasedMove){
        // ...
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
                // Box cannot be pushed to out of bounds or another box or a wall
                if ( !this.isInBound( newBoxPos )
                || boxPositions.has(newBoxKey) || this.board[newBoxR][newBoxC] === '#' ) {
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
    public solve(): SolveResult {
        // Catch the missing player error cleanly right here
        if (!this.initialPlayerPos) {
            return {type:"error", message:"Error: No player found on the board", nodesSearched: 0};
        } else if (this.initialBoxPositions.size > this.goalPositions.size){
            return {type:"error", message:"Error: More boxes than goals", nodesSearched: 0};
        }

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
            const [{ playerPos, boxPositions }, path, currentRawBoxCount, currentHash] = popped;
            // Check if solved   // Legacy check: this.isSolved(boxPositions)
            if (  currentRawBoxCount === 0 ) {
                console.log("CurRawBoxCount:", currentRawBoxCount)
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