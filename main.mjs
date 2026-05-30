import { config } from "./config.mjs";
import { icePuzzleMap } from "./base_map.mjs";
import { green_body } from "./green_body.mjs";
import { green_fixture } from "./green_fixture.mjs";
import { green_shape } from "./green_shape.mjs";
import { gray_body } from "./gray_body.mjs";
import { gray_fixture } from "./gray_fixture.mjs";
import { gray_shape } from "./gray_shape.mjs";
import { Map } from "./Map/Map.mjs";
import { Shape } from "./Map/Shape.mjs";
import { Body } from "./Map/Body.mjs";
import { Fixture } from "./Map/Fixture.mjs";
import { Polygon } from "./Map/Polygon.mjs";
import { generatePuzzle, Cell, Move } from "./ice_puzzle.mjs";


function getConfig() {
    return config;
}

function setConfig(newConfig) {
    config.SIZE = newConfig.SIZE;
    config.MIN_MOVES = newConfig.MIN_MOVES;
    config.MAX_MOVES = newConfig.MAX_MOVES;
    config.SEED = newConfig.SEED;
    config.MAX_ATTEMPTS = newConfig.MAX_ATTEMPTS;
    config.MAP_NAME = newConfig.MAP_NAME;
    config.MAP_AUTHOR = newConfig.MAP_AUTHOR;
}

function add(map, x, y, scale, body, fixture, shape) {
    let newId = map.physics.fixtures.length;
    let clonedBody = Body.fromJSON(JSON.parse(JSON.stringify(body.toJSON())));
    let clonedFixture = Fixture.fromJSON(JSON.parse(JSON.stringify(fixture.toJSON())));
    let clonedShape = Polygon.fromJSON(JSON.parse(JSON.stringify(shape.toJSON())));
    map.physics.bodies.push(clonedBody);
    map.physics.fixtures.push(clonedFixture);
    map.physics.shapes.push(clonedShape);
    clonedFixture.shapeIndex = newId;
    clonedBody.fixtureIndices[0] = newId;
    clonedBody.position.x = x;
    clonedBody.position.y = y;
    clonedShape.scale = scale;
    map.physics.bodyRenderOrder.splice(6, 0, map.physics.bodies.length - 1);
}

function generateMap() {
    let map = Map.fromJSON(icePuzzleMap);

    let greenBody = Body.fromJSON(green_body);
    let greenFixture = Fixture.fromJSON(green_fixture);
    let greenShape = Polygon.fromJSON(green_shape);
    let grayBody = Body.fromJSON(gray_body);
    let grayFixture = Fixture.fromJSON(gray_fixture);
    let grayShape = Polygon.fromJSON(gray_shape);
    let boxSize = 450 / config.SIZE;
    let scale = (boxSize - 1) / 450;
    let generatedPuzzle = generatePuzzle({
        size: config.SIZE,
        minMoves: config.MIN_MOVES,
        maxMoves: config.MAX_MOVES,
        seed: config.SEED,
        maxAttempts: config.MAX_ATTEMPTS
    });
    for (let yi = 0; yi < generatedPuzzle.grid.length; yi++) {
        for (let xi = 0; xi < generatedPuzzle.grid[yi].length; xi++) {
            let cell = generatedPuzzle.grid[yi][xi];
            let x = -225 + boxSize / 2 + xi * boxSize;
            let y = -225 + boxSize / 2 + yi * boxSize;
            if (cell === Cell.WALL) {
                add(map, x, y, scale, grayBody, grayFixture, grayShape);
            } else if (cell === Cell.PLAYER) {
                add(map, x, y, scale, greenBody, greenFixture, greenShape);
            }
            else if (cell == Cell.GOAL) {
                for (const b of map.physics.bodies) {
                    if (b.name == "WIN CZ") {
                        b.position.x = x;
                        b.position.y = y;
                        b.name = generatedPuzzle.solution.map(y => y[0]).join("");
                        break;
                    }
                }
            }
        }
    }
    map.mapInfo.name = `${config.MAP_NAME} (${config.SIZE}x${config.SIZE})`;
    map.mapInfo.author = config.MAP_AUTHOR;
    map.mapInfo.creators = [config.MAP_AUTHOR];
    return map.toJSON();
}

export { generateMap, getConfig, setConfig };