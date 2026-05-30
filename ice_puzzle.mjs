/**
 * ice-puzzle.js
 * Generates solvable ice-sliding puzzles on an NxN grid.
 *
 * Rules:
 *   - The player slides in a chosen direction until hitting a wall or grid edge.
 *   - The player wins if they pass through OR land on the goal cell during a slide.
 *   - Only the 4 cardinal directions are valid moves.
 *
 * Usage:
 *   const { generatePuzzle, Cell, Move } = require("./ice-puzzle");
 *   const { grid, solution } = generatePuzzle({ size: 8, minMoves: 6 });
 */


// ─── Enums ────────────────────────────────────────────────────────────────────

/** Contents of a grid cell. */
const Cell = Object.freeze({
  EMPTY:  "EMPTY",
  WALL:   "WALL",
  PLAYER: "PLAYER",
  GOAL:   "GOAL",
});

/** Valid player moves. */
const Move = Object.freeze({
  UP:    "UP",
  DOWN:  "DOWN",
  LEFT:  "LEFT",
  RIGHT: "RIGHT",
});

// ─── Internal constants ───────────────────────────────────────────────────────

const MOVE_DELTAS = {
  [Move.UP]:    { dr: -1, dc:  0 },
  [Move.DOWN]:  { dr:  1, dc:  0 },
  [Move.LEFT]:  { dr:  0, dc: -1 },
  [Move.RIGHT]: { dr:  0, dc:  1 },
};

const DEFAULT_OPTIONS = {
  size:        8,
  minMoves:    5,
  maxMoves:    null,   // defaults to size * 2
  seed:        null,   // null = random
  maxAttempts: 500,
};

// ─── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────

function createRng(seed) {
  let s = (seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;

  return function next() {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cellKey(r, c) {
  return `${r},${c}`;
}

function randomInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function randomCell(rng, size) {
  return [randomInt(rng, 0, size - 1), randomInt(rng, 0, size - 1)];
}

function cellsEqual([r1, c1], [r2, c2]) {
  return r1 === r2 && c1 === c2;
}

function inBounds(r, c, size) {
  return r >= 0 && r < size && c >= 0 && c < size;
}

// ─── Sliding physics ──────────────────────────────────────────────────────────

/**
 * Slides a piece from (r, c) in direction (dr, dc), stepping one cell at a
 * time until the next cell is a wall or out of bounds.
 *
 * With pass-through win rules, the goal is not a physical obstacle — the piece
 * glides straight through it. This function therefore returns both the final
 * resting position AND whether the goal was crossed during the slide.
 *
 * @returns {{ landR: number, landC: number, crossedGoal: boolean }}
 */
function slide(r, c, dr, dc, walls, goal, size) {
  const [goalR, goalC] = goal;
  let crossedGoal = false;

  while (true) {
    const nextR = r + dr;
    const nextC = c + dc;

    if (!inBounds(nextR, nextC, size) || walls.has(cellKey(nextR, nextC))) break;

    r = nextR;
    c = nextC;

    if (r === goalR && c === goalC) crossedGoal = true;
  }

  return { landR: r, landC: c, crossedGoal };
}

// ─── BFS solver ───────────────────────────────────────────────────────────────

/**
 * Finds the shortest sequence of moves that causes the player to pass through
 * or land on the goal. Returns an array of Move values, or null if unsolvable.
 *
 * State space: every distinct resting position the player can occupy.
 * A resting position is where the piece stops after a slide — the goal is NOT
 * a wall, so a piece slides through it and only stops at a true obstacle.
 * However, touching the goal mid-slide immediately wins, so we check for a
 * goal crossing on each step before enqueueing the landing position.
 */
function bfsSolve(start, goal, walls, size) {
  const queue   = [{ r: start[0], c: start[1], path: [] }];
  const visited = new Set([cellKey(...start)]);

  while (queue.length > 0) {
    const { r, c, path } = queue.shift();

    for (const move of Object.values(Move)) {
      const { dr, dc } = MOVE_DELTAS[move];
      const { landR, landC, crossedGoal } = slide(r, c, dr, dc, walls, goal, size);

      // The piece didn't move at all — this direction is blocked immediately
      if (landR === r && landC === c) continue;

      const nextPath = [...path, move];

      // Win condition: goal was anywhere along the slide path
      if (crossedGoal) return nextPath;

      // Otherwise enqueue the landing position if not yet visited
      const key = cellKey(landR, landC);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ r: landR, c: landC, path: nextPath });
      }
    }
  }

  return null;
}

// ─── Puzzle candidate generation ─────────────────────────────────────────────

function buildCandidate(rng, size) {
  const start = randomCell(rng, size);
  let goal;
  do { goal = randomCell(rng, size); }
  while (cellsEqual(start, goal));

  // Walls must not block the start or goal cell.
  // The goal doesn't need special treatment physics-wise (pieces pass through),
  // but placing a wall there would make it invisible and confusing.
  const forbidden = new Set([cellKey(...start), cellKey(...goal)]);
  const wallCount = randomInt(rng, Math.floor(size * 1.2), Math.floor(size * 2.5));
  const walls     = new Set();

  for (let i = 0; i < wallCount; i++) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const [wr, wc] = randomCell(rng, size);
      const key = cellKey(wr, wc);
      if (!forbidden.has(key)) {
        walls.add(key);
        break;
      }
    }
  }

  return { start, goal, walls };
}

/**
 * Score a candidate puzzle. Higher = better.
 * Solution length is the dominant factor; wall density breaks ties.
 */
function scorePuzzle(solutionLength, wallCount, size) {
  const lengthScore = solutionLength * 10;
  const wallScore   = Math.min(wallCount, size * 2) * 2;
  return lengthScore + wallScore;
}

// ─── Grid builder ─────────────────────────────────────────────────────────────

/**
 * Converts the internal puzzle representation into a 2D grid of Cell values.
 * @returns {string[][]} 2D array indexed as grid[row][col]
 */
function buildGrid(size, start, goal, walls) {
  const grid = Array.from({ length: size }, () => Array(size).fill(Cell.EMPTY));

  for (const key of walls) {
    const [r, c] = key.split(",").map(Number);
    grid[r][c] = Cell.WALL;
  }

  grid[goal[0]][goal[1]]   = Cell.GOAL;
  grid[start[0]][start[1]] = Cell.PLAYER;

  return grid;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates an ice-sliding puzzle.
 *
 * @param {object} options
 * @param {number} [options.size=8]          Grid dimension (size × size).
 * @param {number} [options.minMoves=5]      Minimum moves in the optimal solution.
 * @param {number} [options.maxMoves]        Maximum moves allowed (default: size * 2).
 * @param {number} [options.seed]            RNG seed for reproducibility.
 * @param {number} [options.maxAttempts=500] How many candidates to evaluate.
 *
 * @returns {{
 *   grid:     string[][],  2D array of Cell values representing the initial board
 *   solution: string[],    Ordered array of Move values (optimal path to goal)
 *   start:    number[],    [row, col] of the player's starting position
 *   goal:     number[],    [row, col] of the goal cell
 *   seed:     number,      The seed used (pass back in to reproduce this puzzle)
 * }}
 *
 * @throws {Error} If no valid puzzle can be found within maxAttempts.
 */
function generatePuzzle(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const size        = opts.size;
  const minMoves    = opts.minMoves;
  const maxMoves    = opts.maxMoves ?? size * 2;
  const maxAttempts = opts.maxAttempts;
  const seed        = opts.seed ?? Math.floor(Math.random() * 2 ** 32);

  if (size < 3)            throw new Error("size must be at least 3.");
  if (minMoves < 1)        throw new Error("minMoves must be at least 1.");
  if (minMoves > maxMoves) throw new Error("minMoves cannot exceed maxMoves.");

  const rng = createRng(seed);

  let bestPuzzle = null;
  let bestScore  = -Infinity;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { start, goal, walls } = buildCandidate(rng, size);
    const solution = bfsSolve(start, goal, walls, size);

    if (!solution) continue;
    if (solution.length < minMoves || solution.length > maxMoves) continue;

    const score = scorePuzzle(solution.length, walls.size, size);
    if (score > bestScore) {
      bestScore  = score;
      bestPuzzle = { start, goal, walls, solution };
    }
  }

  if (!bestPuzzle) {
    throw new Error(
      `Could not generate a puzzle with minMoves=${minMoves} in ${maxAttempts} attempts. ` +
      `Try lowering minMoves, increasing maxAttempts, or using a larger grid.`
    );
  }

  const { start, goal, walls, solution } = bestPuzzle;

  return {
    grid: buildGrid(size, start, goal, walls),
    solution,
    start,
    goal,
    seed,
  };
}

export { generatePuzzle, Cell, Move };