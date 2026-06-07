// Classic Levenshtein Distance
export function levenshteinDistance(s1: string, s2: string): number {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    
    // Some cleaning: strip excessive punctuation to normalize
    const clean = (str: string) => str.replace(/[^a-z0-9]/g, '');
    s1 = clean(s1);
    s2 = clean(s2);

    const len1 = s1.length;
    const len2 = s2.length;
    
    const matrix: number[][] = [];

    // Increment along the first column of each row
    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }

    // Increment each column in the first row
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            if (s1.charAt(i - 1) === s2.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, // substitution
                                        Math.min(matrix[i][j - 1] + 1, // insertion
                                                 matrix[i - 1][j] + 1)); // deletion
            }
        }
    }

    return matrix[len1][len2];
}

// Convert column index (0-based) to letter (A, B, C...)
export function colIndexToLetter(index: number): string {
    let letter = "";
    while (index >= 0) {
        letter = String.fromCharCode((index % 26) + 65) + letter;
        index = Math.floor(index / 26) - 1;
    }
    return letter;
}

export function pickBestMatch(searchStr: string, candidates: string[]): { name: string, score: number } {
    if (!candidates || candidates.length === 0) {
        return { name: "", score: Infinity };
    }
    let best = candidates[0];
    let bestScore = Infinity;

    for (const c of candidates) {
        const score = levenshteinDistance(searchStr, c);
        // Bonus: if one string directly contains the other, artificially lower the distance
        let finalScore = score;
        const s1C = searchStr.toLowerCase().replace(/[^a-z0-9]/g, '');
        const s2C = c.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (s1C.includes(s2C) || s2C.includes(s1C)) {
             finalScore = finalScore / 2;
        }

        if (finalScore < bestScore) {
            best = c;
            bestScore = finalScore;
        }
    }
    return { name: best, score: bestScore };
}
