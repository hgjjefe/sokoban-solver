// Web Worker for Festival-Rust solver

let festivalModule = null;
let FestivalSolver = null;

// Initialize WASM module
async function init() {
    if (festivalModule) return;
    
    const wasm = await import('./festival-rust/pkg/festival_rust.js');
    await wasm.default();
    festivalModule = wasm;
    FestivalSolver = wasm.FestivalSolver;
}

// Handle messages from main thread
self.onmessage = async function(e) {
    const { type, level, timeoutMs } = e.data;
    
    if (type === 'solve') {
        try {
            await init();
            
            const solver = new FestivalSolver();
            const startTime = performance.now();
            
            // Progress callback that posts to main thread
            const progressCallback = (progress) => {
                self.postMessage({
                    type: 'progress',
                    progress: {
                        explored: progress.explored,
                        frontier: progress.frontier,
                        iterations: progress.iterations,
                        timeElapsed: progress.timeElapsed
                    }
                });
            };
            // result: SolveResult {
                // solved: true,
                // solution: Some(solution.clone()),
                // moves: solution.len(),
                // pushes,
                // nodes_searched,
                // time_ms: elapsed,
                // fail_reason: None }
            const result = solver.solve(level, timeoutMs, progressCallback);
            const endTime = performance.now();
            const timeStr = ((endTime - startTime) / 1000).toFixed(2) + ' seconds';
            
            if (result.solved) {
                self.postMessage({
                    type: 'success',
                    solution: result.solution,
                    timeStr: timeStr,
                    nodesSearched: result.nodes_searched
                });
            } else {
                self.postMessage({
                    type: 'error',
                    error: result.fail_reason || 'No solution found'
                });
            }
        } catch (error) {
            self.postMessage({
                type: 'error',
                error: error.message
            });
        }
    }
};
