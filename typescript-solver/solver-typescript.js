export function solveTypescript(gridText, progressCallback, timeoutMs = 60000, signal) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('https://github.com/hgjjefe/sokoban-solver/blob/main/typescript-solver/solver-typescript-worker.js', { type: 'module' });
        worker.onmessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'DEBUG') {
                let { text, data } = payload;
                console.log(`${type}: ${text}`, data);
            }
            else if (type === 'PROGRESS')
                progressCallback(payload);
            else if (type === 'SUCCESS') {
                worker.terminate();
                resolve(payload);
            }
            else if (type === 'ERROR') {
                worker.terminate();
                reject(["Error", payload]);
            }
            else if (type === 'TIMEOUT') {
                worker.terminate();
                reject(["Timeout", payload]);
            }
            else {
                console.log(`Error: unknown message type "${type}" from worker`);
            }
        };
        if (signal) {
            if (signal.aborted) {
                worker.terminate();
                return reject(new DOMException("Aborted", "AbortError"));
            }
            signal.addEventListener('abort', () => { worker.terminate(); reject(new DOMException("Aborted", "AbortError")); });
        }
        worker.postMessage({ gridText, timeoutMs });
    });
}
