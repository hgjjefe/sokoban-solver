// import { solveTypescript } from './solver-typescript.js';

// Listen for the main thread telling us to start
// self.onmessage = function (e: MessageEvent) {
//     const { gridText, timeoutMs } = e.data;

//     // Define a progress callback that ships data back to the main thread
//     const progressCallback = (progress: { explored: number; timeElapsed: number }) => {
//         self.postMessage({ type: 'PROGRESS', payload: progress });
//     };

//     // Run the solver (we can make solver-typescript synchronous again if we want,
//     // but even if it's async, we just await it here)
//     solveTypescript(gridText, progressCallback, timeoutMs).then(([solution, explored]) => {
//         // Send final result back
//         self.postMessage({ type: 'SUCCESS', payload: { solution, explored } });
//     }).catch(err => {
//         self.postMessage({ type: 'ERROR', payload: err.message });
//     });
// };
// A "macro" for printing to console
const printMessage = (text:string, data:any) => {
    self.postMessage({ type: 'DEBUG', payload: {text: text, data: data} });
}

self.onmessage = function (e: MessageEvent) {
    const { gridText, timeoutMs } = e.data;

    const progressCallback = (progress: { explored: number; timeElapsed: number }) => {
        self.postMessage({ type: 'PROGRESS', payload: progress });
    };

const startTime = Date.now();
    let exploredCount = 0;
    const data = gridText.filter(Boolean);
    const nrows = Math.max(...data.map(r => r.length));
    const maps: Record<string, string> = { ' ': ' ', '.': '.', '@': ' ', '#': '#', '$': ' ' };
    const mapd: Record<string, string> = { ' ': ' ', '.': ' ', '@': '@', '#': ' ', '$': '*' };

    let sdata = "";
    let ddata = "";
    let px = 0;
    let py = 0;

    for (let r = 0; r < data.length; r++) {
        const paddedRow = data[r].padEnd(nrows, ' ');
        for (let c = 0; c < paddedRow.length; c++) {
            const ch = paddedRow[c];
            sdata += maps[ch] ?? ' ';
            ddata += mapd[ch] ?? ' ';
            
            if (ch === '@') {
                px = c;
                py = r;
            }
        }
    }

    // 2. Local Helper Functions (Safe from external pollution)
    function push(x: number, y: number, dx: number, dy: number, currentElements: string): string | null {
        const targetIdx = (y + 2 * dy) * nrows + (x + 2 * dx);
        if (sdata[targetIdx] === '#' || currentElements[targetIdx] !== ' ') {
            return null;
        }
        
        const data2 = currentElements.split('');
        data2[y * nrows + x] = ' ';
        data2[(y + dy) * nrows + (x + dx)] = '@';
        data2[targetIdx] = '*';
        return data2.join('');
    }

    function isSolved(currentElements: string): boolean {
        for (let i = 0; i < currentElements.length; i++) {
            if ((sdata[i] === '.') !== (currentElements[i] === '*')) {
                return false;
            }
        }
        return true;
    }

    // 3. BFS State Configuration
    type QueueItem = [string, string, number, number]; // [current_layout, paths, x, y]
    const queue: QueueItem[] = [[ddata, "", px, py]];
    const visited = new Set<string>([ddata]);

    const dirs: [number, number, string, string][] = [
        [0, -1, 'u', 'U'], // Up
        [1, 0, 'r', 'R'],  // Right
        [0, 1, 'd', 'D'],  // Down
        [-1, 0, 'l', 'L']  // Left
    ];

    // 4. Main BFS Loop
    while (queue.length > 0) {
        exploredCount++;

        // Performance Optimization: Throttle the UI callback so it doesn't choke the CPU
        if (exploredCount % 2000 === 0) {
            const timeElapsed = Date.now() - startTime;
            
            // Hard timeout exit check
            if (timeElapsed >= timeoutMs) {
                return ["Timeout", exploredCount];
            }

            // Ping the UI with the required structure
            progressCallback({ explored: exploredCount, timeElapsed: timeElapsed });
        }

        const [cur, csol, x, y] = queue.shift()!;

        for (const [dx, dy, lowChar, upChar] of dirs) {
            let temp = cur;
            const nextIdx = (y + dy) * nrows + (x + dx);

            if (temp[nextIdx] === '*') {
                const pushedResult = push(x, y, dx, dy, temp);
                if (pushedResult && !visited.has(pushedResult)) {
                    if (isSolved(pushedResult)) {
                        return [csol + upChar, exploredCount];
                    }
                    queue.push([pushedResult, csol + upChar, x + dx, y + dy]);
                    visited.add(pushedResult);
                }
            } else {
                if (sdata[nextIdx] === '#' || temp[nextIdx] !== ' ') {
                    continue;
                }

                const data2 = temp.split('');
                data2[y * nrows + x] = ' ';
                data2[nextIdx] = '@';
                temp = data2.join('');

                if (!visited.has(temp)) {
                    if (isSolved(temp)) {
                        self.postMessage({ type: 'SUCCESS', payload: [csol + lowChar, exploredCount] });
                    }
                    queue.push([temp, csol + lowChar, x + dx, y + dy]);
                    visited.add(temp);
                }
            }
        }
    }
}