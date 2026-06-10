export class Deque<T> {
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