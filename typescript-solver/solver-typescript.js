// export async function solveTypescript(gridText: string[], progressCallback: (progress: any)=> void, timeoutMs: number) : Promise<[string, number]>{
//     let exploredCount = 69420;
//     return ["No solution", exploredCount];
// }
export function solveTypescript(gridText, progressCallback, timeoutMs = 60000, signal) {
    return new Promise((resolve, reject) => {
        // COMBINED FIX: Absolute path + No module flag
        const worker = new Worker('/typescript-solver/solver-typescript-worker.js', { type: 'module' });

        // CRITICAL FIX: Catch loading errors (404) or initial compilation crashes
        worker.onerror = (err) => {
            console.error("!!! WORKER CRASHED ON STARTUP OR LINEx !!!");
            console.error(err);
            worker.terminate();
            reject(err);
        };

        worker.onmessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'DEBUG'){
                let {text,data} = payload;
                console.log(`${type}: ${text}`, data);
            }
            else if (type === 'PROGRESS')
                progressCallback(payload);
            else if (type === 'SUCCESS') {
                worker.terminate();
                resolve(payload);
            }
            else if (type === 'TIMEOUT') {
                worker.terminate();
                resolve(["Timeout", payload]);
            }else{
                console.log(`Error: unknown message type "${type}" from worker`)
            }
        };

        if (signal) {
            if (signal.aborted) {
                worker.terminate();
                return reject(new DOMException("Aborted", "AbortError"));
            }
            signal.addEventListener('abort', () => { worker.terminate(); reject(new DOMException("Aborted", "AbortError")); });
        }

        console.log("AAAAAAAAAAAAAA");
        worker.postMessage({ gridText, timeoutMs });
    });
}