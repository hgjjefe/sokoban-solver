class MinHeap {
    // Stride of 2: [stateId, fScore, stateId, fScore, ...]
    private data: Int32Array;
    private size: number = 0;

    constructor(maxCapacity: number) {
        // Allocate twice the capacity because of the 2-integer stride
        this.data = new Int32Array(maxCapacity * 2);
    }

    public get length(): number {
        return this.size;
    }

    public clear(): void {
        this.size = 0;
    }

    public push(stateId: number, fScore: number): void {
        let i = this.size;
        this.size++;

        let writeIdx = i * 2;
        this.data[writeIdx] = stateId;
        this.data[writeIdx + 1] = fScore;

        this.bubbleUp(i);
    }

    public pop(): number {
        if (this.size === 0) return -1; // Heap is empty

        const rootStateId = this.data[0];

        // Move the last element to the root
        this.size--;
        if (this.size > 0) {
            this.data[0] = this.data[this.size * 2];
            this.data[1] = this.data[this.size * 2 + 1];
            this.bubbleDown(0);
        }

        return rootStateId;
    }

    private bubbleUp(i: number): void {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            // Compare fScores (stored at odd indices)
            if (this.data[i * 2 + 1] >= this.data[parent * 2 + 1]) break;

            this.swap(i, parent);
            i = parent;
        }
    }

    private bubbleDown(i: number): void {
        const halfSize = this.size >> 1; // Nodes past halfSize have no children
        while (i < halfSize) {
            let left = (i << 1) + 1;
            let right = left + 1;
            let best = left;

            // If right child exists and has a lower fScore, pick it instead
            if (right < this.size && this.data[right * 2 + 1] < this.data[left * 2 + 1]) {
                best = right;
            }

            // If the parent is already smaller than the best child, we are done
            if (this.data[i * 2 + 1] <= this.data[best * 2 + 1]) break;

            this.swap(i, best);
            i = best;
        }
    }

    private swap(i: number, j: number): void {
        const iIdx = i * 2;
        const jIdx = j * 2;

        // Swap stateId
        const tempId = this.data[iIdx];
        this.data[iIdx] = this.data[jIdx];
        this.data[jIdx] = tempId;

        // Swap fScore
        const tempScore = this.data[iIdx + 1];
        this.data[iIdx + 1] = this.data[jIdx + 1];
        this.data[jIdx + 1] = tempScore;
    }
}
// How this hooks into your A* Loop
// const queue = new MinHeap(100000);
// // gScore map: stateId -> cost to reach
// const gScores = new Map<number, number>(); 

// // Push initial state: g = 0, h = heuristic(start)
// gScores.set(startStateId, 0);
// queue.push(startStateId, heuristic(startStateId));

// while (queue.length > 0) {
//     const curStateId = queue.pop();
//     const curG = gScores.get(curStateId)!;

//     // If goal state, terminate!
//     if (isGoal(curStateId)) return success;

//     // Run your ultra-fast floodRoom to get next pushes
//     const { pushes } = this.floodRoom(...); 
    
//     for (let i = 0; i < this.pushCount; i++) {
//         const nextStateId = getNextStateId(curStateId, i);
//         const nextG = curG + 1; // Each push costs 1 step

//         if (!gScores.has(nextStateId) || nextG < gScores.get(nextStateId)!) {
//             gScores.set(nextStateId, nextG);
            
//             // fScore = gScore + Manhattan/Box-distance heuristic
//             const fScore = nextG + calculateHeuristic(nextStateId);
//             queue.push(nextStateId, fScore);
//         }
//     }
// }