// this is just to make it clear that we are using a 1-based array; changing it to zero won't work without code changes
const ROOT_INDEX = 1;
export class MinQueue {
    _capacity;
    _keys;
    _priorities;
    length;
    _hasPoppedElement;
    constructor(capacity = 64, keys = [], priorities = [], KeysBackingArrayType = Uint32Array, PrioritiesBackingArrayType = Uint32Array) {
        this._capacity = capacity;
        this._keys = new KeysBackingArrayType(capacity + ROOT_INDEX);
        this._priorities = new PrioritiesBackingArrayType(capacity + ROOT_INDEX);
        // to keep track of whether the first element is a deleted one
        this._hasPoppedElement = false;
        if (keys.length !== priorities.length) {
            throw new Error("Number of keys does not match number of priorities provided.");
        }
        if (capacity < keys.length) {
            throw new Error("Capacity less than number of provided keys.");
        }
        // copy data from user
        for (let i = 0; i < keys.length; i++) {
            this._keys[i + ROOT_INDEX] = keys[i];
            this._priorities[i + ROOT_INDEX] = priorities[i];
        }
        this.length = keys.length;
        for (let i = keys.length >>> 1; i >= ROOT_INDEX; i--) {
            this.bubbleDown(i);
        }
    }
    get capacity() {
        return this._capacity;
    }
    clear() {
        this.length = 0;
        this._hasPoppedElement = false;
    }
    /**
     * Bubble an item up until its heap property is satisfied.
     */
    bubbleUp(index) {
        const key = this._keys[index];
        const priority = this._priorities[index];
        while (index > ROOT_INDEX) {
            // get its parent item
            const parentIndex = index >>> 1;
            if (this._priorities[parentIndex] <= priority) {
                break; // if parent priority is smaller, heap property is satisfied
            }
            // bubble parent down so the item can go up
            this._keys[index] = this._keys[parentIndex];
            this._priorities[index] = this._priorities[parentIndex];
            // repeat for the next level
            index = parentIndex;
        }
        // we finally found the place where the initial item should be; write it there
        this._keys[index] = key;
        this._priorities[index] = priority;
    }
    /**
     * Bubble an item down until its heap property is satisfied.
     */
    bubbleDown(index) {
        const key = this._keys[index];
        const priority = this._priorities[index];
        const halfLength = ROOT_INDEX + (this.length >>> 1); // no need to check the last level
        const lastIndex = this.length + ROOT_INDEX;
        while (index < halfLength) {
            const left = index << 1;
            // pick the left child
            let childPriority = this._priorities[left];
            let childKey = this._keys[left];
            let childIndex = left;
            // if there's a right child, choose the child with the smallest priority
            const right = left + 1;
            if (right < lastIndex) {
                const rightPriority = this._priorities[right];
                if (rightPriority < childPriority) {
                    childPriority = rightPriority;
                    childKey = this._keys[right];
                    childIndex = right;
                }
            }
            if (childPriority >= priority) {
                break; // if children have higher priority, heap property is satisfied
            }
            // bubble the child up to where the parent is
            this._keys[index] = childKey;
            this._priorities[index] = childPriority;
            // repeat for the next level
            index = childIndex;
        }
        // we finally found the place where the initial item should be; write it there
        this._keys[index] = key;
        this._priorities[index] = priority;
    }
    /**
     * @param key the identifier of the object to be pushed into the heap
     * @param priority the priority associated with the key
     */
    push(key, priority) {
        if (this.length === this._capacity) {
            throw new Error("Heap has reached capacity, can't push new items");
        }
        if (this._hasPoppedElement) {
            // replace root element (which was deleted from the last pop)
            this._keys[ROOT_INDEX] = key;
            this._priorities[ROOT_INDEX] = priority;
            this.length++;
            this.bubbleDown(ROOT_INDEX);
            this._hasPoppedElement = false;
        }
        else {
            const pos = this.length + ROOT_INDEX;
            this._keys[pos] = key;
            this._priorities[pos] = priority;
            this.length++;
            this.bubbleUp(pos);
        }
    }
    /**
     * @return the key with the highest priority, or undefined if the heap is empty
     */
    pop() {
        if (this.length === 0) {
            return undefined;
        }
        this.removePoppedElement();
        this.length--;
        this._hasPoppedElement = true;
        return this._keys[ROOT_INDEX];
    }
    peekPriority() {
        this.removePoppedElement();
        return this._priorities[ROOT_INDEX];
    }
    peek() {
        this.removePoppedElement();
        return this._keys[ROOT_INDEX];
    }
    removePoppedElement() {
        if (this._hasPoppedElement) {
            // since root element was already deleted from pop, replace with last and bubble down
            this._keys[ROOT_INDEX] = this._keys[this.length + ROOT_INDEX];
            this._priorities[ROOT_INDEX] = this._priorities[this.length + ROOT_INDEX];
            this.bubbleDown(ROOT_INDEX);
            this._hasPoppedElement = false;
        }
    }
    get size() {
        return this.length;
    }
    dumpRawPriorities() {
        this.removePoppedElement();
        const result = Array(this.length - ROOT_INDEX);
        for (let i = 0; i < this.length; i++) {
            result[i] = this._priorities[i + ROOT_INDEX];
        }
        return `[${result.join(" ")}]`;
    }
}
class MinHeap {
    // Stride of 2: [stateId, fScore, stateId, fScore, ...]
    data;
    size = 0;
    constructor(maxCapacity) {
        // Allocate twice the capacity because of the 2-integer stride
        this.data = new Int32Array(maxCapacity * 2);
    }
    get length() {
        return this.size;
    }
    clear() {
        this.size = 0;
    }
    push(stateId, fScore) {
        let i = this.size;
        this.size++;
        let writeIdx = i * 2;
        this.data[writeIdx] = stateId;
        this.data[writeIdx + 1] = fScore;
        this.bubbleUp(i);
    }
    pop() {
        if (this.size === 0)
            return -1; // Heap is empty
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
    bubbleUp(i) {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            // Compare fScores (stored at odd indices)
            if (this.data[i * 2 + 1] >= this.data[parent * 2 + 1])
                break;
            this.swap(i, parent);
            i = parent;
        }
    }
    bubbleDown(i) {
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
            if (this.data[i * 2 + 1] <= this.data[best * 2 + 1])
                break;
            this.swap(i, best);
            i = best;
        }
    }
    swap(i, j) {
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
