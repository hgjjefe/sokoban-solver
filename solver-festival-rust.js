// Festival-Rust WASM Solver Wrapper with Web Worker

let worker = null;

function initWorker() {
    if (!worker) {
        worker = new Worker('./solver-festival-rust-worker.js', { type: 'module' });
    }
    return worker;
}

async function solveFestivalRust(gridText, progressCallback = null, timeoutMs = 60000) {
    // Convert array to string if needed
    const levelString = Array.isArray(gridText) ? gridText.join('\n') : gridText;
    
    const worker = initWorker();
    
    return new Promise((resolve, reject) => {
        // Set up message handler
        worker.onmessage = function(e) {
            const { type, progress, solution, error, nodesSearched } = e.data;
            
            if (type === 'progress' && progressCallback) {
                progressCallback(progress);
            } else if (type === 'success') {
                resolve([solution, nodesSearched]);
            } else if (type === 'error') {
                reject(new Error(error));
            }
        };
        
        worker.onerror = function(error) {
            reject(error);
        };
        
        // Send solve request
        worker.postMessage({
            type: 'solve',
            level: levelString,
            timeoutMs: timeoutMs
        });
    });
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.solveFestivalRust = solveFestivalRust;
}
