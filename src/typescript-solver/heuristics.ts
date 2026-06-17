const distanceMatrix = new Map<PosInt, Map<PosInt, number>>();

function precomputeDistances(goals: PosInt[], walls: Set<PosInt>, width: number) {
    for (const goal of goals) {
        const goalMap = new Map<PosInt, number>();
        const queue: PosInt[] = [goal];
        
        goalMap.set(goal, 0);

        while (queue.length > 0) {
            const current = queue.shift()!;
            const currentDist = goalMap.get(current)!;

            // Generate 4 neighbors using your fast bitwise offsets
            const neighbors = [current - 65536, current + 65536, current - 1, current + 1];

            for (const neighbor of neighbors) {
                if (!walls.has(neighbor) && !goalMap.has(neighbor)) {
                    goalMap.set(neighbor, currentDist + 1);
                    queue.push(neighbor);
                }
            }
        }
        distanceMatrix.set(goal, goalMap);
    }
}

function getHeuristic(boxPositions: PosInt[], goals: PosInt[]): number {
    let totalHeuristic = 0;

    for (const box of boxPositions) {
        let minPushesToAnyGoal = Infinity;

        for (const goal of goals) {
            const goalMap = distanceMatrix.get(goal)!;
            const pushes = goalMap.get(box);
            
            // If pushes is undefined, this box is in an un-reachable area (Deadlock!)
            if (pushes === undefined) {
                return Infinity; 
            }

            if (pushes < minPushesToAnyGoal) {
                minPushesToAnyGoal = pushes;
            }
        }

        totalHeuristic += minPushesToAnyGoal;
    }

    return totalHeuristic;
}