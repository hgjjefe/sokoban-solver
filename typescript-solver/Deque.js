export class Deque {
    data = {};
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
        delete this.data[this.head]; // Avoid memory leaks
        this.head++;
        return item;
    }
    get length() {
        return this.tail - this.head;
    }
}
