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
interface GameState {
    playerPos: Position;
    boxPositions: Set<string>;
}
type Path = string[]; type BoxesOnGoal = number;
export type SolveResult = 
    | { type: "success"; path: string; nodesSearched: number }
    | { type: "error"; message: string; nodesSearched: number };

const MOVES: Record<string, [number, number]> = {
            'U': [-1, 0], 'D': [1, 0], 'L': [0, -1], 'R': [0, 1]
};


// ========= THE SOLVER CLASS ==========

export class Solver {
    private board: string[][];
    private rows: number;
    private cols: number;
    private initialPlayerPos: Position | null = null; // Changed to allow null
    private initialBoxPositions = new Set<string>();
    private initialBoxesOnGoal : number = 0;
    private goalPositions = new Set<string>();
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
                    case '$': this.initialBoxPositions.add(key); break;
                    case '.': this.goalPositions.add(key); break;
                    case '*': this.initialBoxPositions.add(key);
                              this.goalPositions.add(key); 
                              this.initialBoxesOnGoal++; break;
                    case '+': this.initialPlayerPos = [r, c];
                              this.goalPositions.add(key); break;
                }
            }
        }
        this.goalCount = this.goalPositions.size;
    }

    private getStateKey(playerPos: Position, boxPositions: Set<string>): string {
        const sortedBoxes = Array.from(boxPositions).sort().join(';');
        return `${playerPos[0]},${playerPos[1]}|${sortedBoxes}`;
    }

    private isSolved(boxPositions: Set<string>): boolean {
        for (const box of boxPositions) {
            if (!this.goalPositions.has(box)) return false;
        }
        return true;
    }

    private getNeighbors(playerPos: Position, boxPositions: Set<string>): Array<[Position, Set<string>, string]> {
        const neighbors: Array<[Position, Set<string>, string]> = [];
        
        const [r, c] = playerPos;

        for (const [moveChar, [dr, dc]] of Object.entries(MOVES)) {
            const newPlayerR = r + dr;
            const newPlayerC = c + dc;
            const newPlayerKey = `${newPlayerR},${newPlayerC}`;

            if (!(0 <= newPlayerR && newPlayerR < this.rows && 0 <= newPlayerC && newPlayerC < this.cols)) {
                continue;
            }

            if (this.board[newPlayerR][newPlayerC] === '#') {
                continue;
            }

            if (boxPositions.has(newPlayerKey)) {
                const newBoxR = newPlayerR + dr;
                const newBoxC = newPlayerC + dc;
                const newBoxKey = `${newBoxR},${newBoxC}`;

                if (!(0 <= newBoxR && newBoxR < this.rows && 0 <= newBoxC && newBoxC < this.cols)) {
                    continue;
                }
                if (boxPositions.has(newBoxKey)) {
                    continue;
                }
                if (this.board[newBoxR][newBoxC] === '#') {
                    continue;
                }

                const newBoxPositions = new Set(boxPositions);
                newBoxPositions.delete(newPlayerKey);
                newBoxPositions.add(newBoxKey);
                
                neighbors.push([[newPlayerR, newPlayerC], newBoxPositions, moveChar]);
            } else {
                neighbors.push([[newPlayerR, newPlayerC], boxPositions, moveChar]);
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

        const queue = new Deque<[GameState, Path, BoxesOnGoal]>();
        const visited = new Set<string>();
        let nodesSearched = 0;
        const initialState: GameState = {
            playerPos: this.initialPlayerPos,
            boxPositions: this.initialBoxPositions
        };

        queue.pushBack([initialState, [], this.initialBoxesOnGoal]);
        visited.add(this.getStateKey(initialState.playerPos, initialState.boxPositions));

        while (queue.length > 0) {
            const popped = queue.popFront();
            if (!popped) break;
            nodesSearched++;
            const [{ playerPos, boxPositions }, path, currentBoxesOnGoal] = popped;
            // Check if solved   // Legacy check: this.isSolved(boxPositions)
            if ( this.isSolved(boxPositions) || currentBoxesOnGoal === this.goalCount ) {
                return {type:'success', path: path.join(''), nodesSearched: nodesSearched};
            }

            for (const [nextPlayer, nextBoxes, move] of this.getNeighbors(playerPos, boxPositions)) {
                const nextKey = this.getStateKey(nextPlayer, nextBoxes);
                
                if (!visited.has(nextKey)) {
                    visited.add(nextKey);

                    let nextBoxesOnGoal = currentBoxesOnGoal;
                    const [dr, dc] = MOVES[move]; 
                    const oldBoxKey = `${nextPlayer[0]},${nextPlayer[1]}`;
                    const newBoxKey = `${nextPlayer[0] + dr},${nextPlayer[1] + dc}`;

                    // If the player actually pushed a box (i.e. the box moved from oldBoxKey to newBoxKey)
                    if (boxPositions.has(oldBoxKey)) {
                        if (this.goalPositions.has(oldBoxKey)) nextBoxesOnGoal--; // Left a goal
                        if (this.goalPositions.has(newBoxKey)) nextBoxesOnGoal++; // Entered a goal
                    }
                    
                    queue.pushBack([{ playerPos: nextPlayer, boxPositions: nextBoxes }, [...path, move], 0]);
                }
            }
        }

        return {type:'error', message: "Error: No solution found", nodesSearched: nodesSearched};
    }
}