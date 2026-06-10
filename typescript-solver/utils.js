// Helper functions
export const range = (n) => [...Array(n).keys()]; // python style range function
export function stripEmptyRowsCols(gridText) {
    const res = gridText.filter(row => /\S/.test(row));
    const gridWidth = res[0].length;
    const rangeW = range(gridWidth);
    const minCol = rangeW.findIndex(i => /\S/.test(res.map(row => row[i]).join('')));
    const maxCol = rangeW.findLastIndex(i => /\S/.test(res.map(row => row[i]).join('')));
    return res.map(row => row.slice(minCol, maxCol + 1));
}
