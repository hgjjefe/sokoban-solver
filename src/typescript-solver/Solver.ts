import { range, stripEmptyRowsCols } from "./utils";
// import { Deque } from "./Deque";

class Deque<T> {
    private data: Record<number, T> = {};
    private head = 0;
    private tail = 0;

    pushBack(item: T): void {
        this.data[this.tail] = item;
        this.tail++;
    }

    popFront(): T | undefined {
        if (this.head === this.tail) return undefined;
        
        const item = this.data[this.head];
        delete this.data[this.head]; // Avoid memory leaks
        this.head++;
        return item;
    }

    get length(): number {
        return this.tail - this.head;
    }
}

type Position = [number, number];
type PositionSet = Set<string>;
interface GameState {
    playerPos: Position;
    boxPositions: Set<string>;
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


// ========= THE SOLVER CLASS ==========

export class Solver {
    private board: string[][];
    private rows: number;
    private cols: number;
    private initialPlayerPos: Position | null = null; // Changed to allow null
    private initialBoxPositions: PositionSet = new Set<string>();
    private initialRawBoxCount : BoxCount = 0;
    private goalPositions: PositionSet = new Set<string>();
    private goalCount : number;

    constructor(board: string[]) {
        this.board = board.map(row => row.split(''));
        this.rows = this.board.length;
        this.cols = this.board[0].length;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cell = this.board[r][c];
                const key = `${r},${c}`;
                switch (cell){
                    case '@': this.initialPlayerPos = [r, c]; break;
                    case '$': this.initialBoxPositions.add(key); 
                              this.initialRawBoxCount++; break;
                    case '.': this.goalPositions.add(key); break;
                    case '*': this.initialBoxPositions.add(key);
                              this.goalPositions.add(key); break;
                    case '+': this.initialPlayerPos = [r, c];
                              this.goalPositions.add(key); break;
                }
            }
        }
        this.goalCount = this.goalPositions.size;
    }

    private getStateKey(playerPos: Position, boxPositions: PositionSet): string {
        const sortedBoxes = Array.from(boxPositions).sort().join(';');
        return `${playerPos[0]},${playerPos[1]}|${sortedBoxes}`;
    }

    private isSolved(boxPositions: Set<string>): boolean {
        for (const box of boxPositions) {
            if (!this.goalPositions.has(box)) return false;
        }
        return true;
    }
    private isInBound(playerPos: Position): boolean {
        return 0 <= playerPos[0] && playerPos[0] < this.rows && 0 <=playerPos[1] && playerPos[1] < this.cols
    }
    private getNeighbors(playerPos: Position, boxPositions: PositionSet): Array<[Position, PositionSet, CasedMove, -1|0|1]> {
        const neighbors: Array<[Position, PositionSet, CasedMove, -1|0|1]> = [];
        const [r, c] = playerPos;

        for (const [moveChar, [dr, dc]] of Object.entries(MOVES) as [Move, [number, number]][]) {
            const newPlayerR = r + dr;  const newPlayerC = c + dc;
            const newPlayerKey = `${newPlayerR},${newPlayerC}`;
            const newPlayerPos = [ newPlayerR, newPlayerC ] as Position;
            // Move making player out of boound or hit a wall is not valid
            if (!this.isInBound(newPlayerPos) || this.board[newPlayerR][newPlayerC] === '#' ) {
                continue;
            }
            // Push a box
            if (boxPositions.has(newPlayerKey)) {
                const newBoxR = newPlayerR + dr; const newBoxC = newPlayerC + dc;
                const newBoxKey = `${newBoxR},${newBoxC}`;
                const newBoxPos: Position = [newBoxR, newBoxC];
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
                neighbors.push([[newPlayerR, newPlayerC], newBoxPositions, moveChar, dRawBoxCount as -1|0|1]);
            } else {  // Just a move, no pushes
                neighbors.push([[newPlayerR, newPlayerC], boxPositions, moveChar.toLowerCase() as CasedMove, 0]);
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

        const queue = new Deque<[GameState, Path, BoxCount]>();
        const visited = new Set<string>();
        let nodesSearched = 0;
        const initialState: GameState = {
            playerPos: this.initialPlayerPos,
            boxPositions: this.initialBoxPositions
        };

        queue.pushBack([initialState, [], this.initialRawBoxCount]);
        visited.add(this.getStateKey(initialState.playerPos, initialState.boxPositions));

        while (queue.length > 0) {
            const popped = queue.popFront();
            if (!popped) break;
            nodesSearched++;
            const [{ playerPos, boxPositions }, path, currentRawBoxCount] = popped;
            // Check if solved   // Legacy check: this.isSolved(boxPositions)
            if (  currentRawBoxCount === 0 ) {
                console.log("CurRawBoxCount:", currentRawBoxCount)
                return {type:'success', path: path.join(''), nodesSearched: nodesSearched};
            }

            for (const [nextPlayer, nextBoxes, move, dRawBoxCount] of this.getNeighbors(playerPos, boxPositions)) {
                const nextKey = this.getStateKey(nextPlayer, nextBoxes);
                if ( visited.has(nextKey) ) continue;
                // If not yet seen this next state then add to queue
                visited.add(nextKey);

                let nextRawBoxCount = currentRawBoxCount + dRawBoxCount;
                // const [dr, dc] = MOVES[move]; 
                // const oldBoxKey = `${nextPlayer[0]},${nextPlayer[1]}`;
                // const newBoxKey = `${nextPlayer[0] + dr},${nextPlayer[1] + dc}`;
                // // If the player actually pushed a box (i.e. the box moved from oldBoxKey to newBoxKey)
                // if (boxPositions.has(oldBoxKey)) {
                //     if (this.goalPositions.has(oldBoxKey)) nextRawBoxCount++; // Left a goal
                //     if (this.goalPositions.has(newBoxKey)) nextRawBoxCount--; // Entered a goal
                // }

                queue.pushBack([{ playerPos: nextPlayer, boxPositions: nextBoxes }, [...path, move], nextRawBoxCount]);
                
            }
        }

        return {type:'error', message: "Error: No solution found", nodesSearched: nodesSearched};
    }
}