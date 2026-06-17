export class Deque<T> {
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
    constructor(arr: T[] | undefined = undefined){
        if (arr === undefined) return;
        for (let item of arr)
            this.pushBack(item);
    }
    get length(): number {
        return this.tail - this.head;
    }
}