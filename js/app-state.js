/**
 * app-state.js
 * Application state, shared globals, attachments, snapshots, and history.
 */

var link = new Linkage();
var allVelocities = [];
var curVertex;
var curEdge;
var attractor;
var tracks = {};
var view = 0;
var VIEWS = 8;
var info = 0;
var INFOS = 2;

// zoom state (simple scaling around origin)
var scale = 1.0; // 1 = 100%

// pan state (translation)
var panX = 0;
var panY = 0;

function screenToWorld(x, y) {
    // Convert canvas (screen) coords to linkage (world) coords.
    // Account for both scale and pan offset
    return [(x - panX) / scale, (y - panY) / scale];
}

// Phase 1 features
var showLabels = true; // Toggle for showing node/edge labels
var showEdgeLengths = false; // Toggle for showing edge lengths
var nodeStyle = 'filled'; // 'filled' or 'open' (hollow circles) - global default
var traceBackMode = false; // Whether we're in trace-back mode
var traceBackIndex = {}; // Store current playback position for each tracked vertex
var traceDirection = -1; // -1 for backward, 1 for forward
var traceLoopMode = true; // true = loop/bounce, false = play once

// Tool mode
var currentTool = 'add-select'; // 'add-node', 'select', 'add-edge', etc.
var appMode = 'edit'; // 'edit' or 'play' mode

// Custom label names
var nodeNames = {}; // Custom names for nodes {index: "name"}
var nextAutoNodeNameIndex = 0;
var edgeNames = {}; // Custom names for edges {index: "name"}

// Individual node styles
var openNodes = {}; // Track which specific nodes are open {index: true/false}


//Keeps track of which nodes are attached
var solidToOpen = {}; // solid index -> open index : where is solid attached
var openToSolid = {}; // open index -> solid index : which solid is currently occupying open node
//distance nodes can be near before they snap together
var ATTACH_DIST2 = 225; // 15 px squared

// Drag state
var isDragging = false;
var dragVertex = -1;

// Pan drag state (for space+drag panning)
var isPanDragging = false;
var lastPanMouseX = 0;
var lastPanMouseY = 0;
var spacePressed = false;

// Edge creation state (for add-edge mode)
var edgeStartNode = -1;        // First node selected for edge (-1 = none)
var edgePreviewEnd = null;     // [x, y] mouse position or snapped node position
var edgeSnapNode = -1;         // Node index mouse is hovering over (-1 = none)

// Transparent/preview node for addnode mode
var previewNodePosition = null;

// Snap distance for edge creation
var EDGE_SNAP_DIST2 = 400; // 20 pixels squared

// Undo/Redo history stack
var undoStack = [];
var redoStack = [];
var MAX_UNDO = 50;

//helps nodes/vertices snap together
function dist2(a, b) {
    var dx = a[0] - b[0];
    var dy = a[1] - b[1];
    return dx * dx + dy * dy;
}
function findAttachTarget(solidIndex) {
    var best = -1;
    var bestD2 = ATTACH_DIST2;

    _.each(link.vertices, function(v, j) {
        if (j === solidIndex) return;
        if (!canAttachPair(solidIndex, j)) return;
        if (!isOpenNode(j)) return; // target must be open node

        var d2 = dist2(link.vertices[solidIndex], link.vertices[j]);
        if (d2 <= bestD2) {
            bestD2 = d2;
            best = j;
        }
    });

    return best;
}

function detachSolid(solidIndex) {
    var openIndex = solidToOpen[solidIndex];
    if (openIndex !== undefined) {
        delete openToSolid[openIndex];
        delete solidToOpen[solidIndex];
    }
}

function attachSolidToOpen(solidIndex, openIndex) {
    var previousSolid = openToSolid[openIndex];

    // If another solid is already in this open node, force it out
    if (previousSolid !== undefined && previousSolid !== solidIndex) {
        delete solidToOpen[previousSolid];
    
        // Push the old solid slightly away
        var openPos = link.vertices[openIndex];
        link.vertices[previousSolid] = [
            openPos[0] + 10,
            openPos[1] + 10
        ];
    }

    // If this solid was attached somewhere else, clear that old socket
    var previousOpen = solidToOpen[solidIndex];
    if (previousOpen !== undefined && previousOpen !== openIndex) {
        delete openToSolid[previousOpen];
    }

    solidToOpen[solidIndex] = openIndex;
    openToSolid[openIndex] = solidIndex;

    // Snap solid directly into the open node
    link.vertices[solidIndex] = [
        link.vertices[openIndex][0],
        link.vertices[openIndex][1]
    ];
}
function findAttachTargetForOpen(openIndex) {
    var best = -1;
    var bestD2 = ATTACH_DIST2;
    _.each(link.vertices, function(v, j) {
        if (j === openIndex) return;
        if (!canAttachPair(openIndex, j)) return;
        if (isOpenNode(j)) return; // target must be solid node
        var d2 = dist2(link.vertices[openIndex], link.vertices[j]);
        if (d2 <= bestD2) {
            bestD2 = d2;
            best = j;
        }
    });
    return best;
}
function attachOpenToSolid(openIndex, solidIndex) {
    var previousOpen = solidToOpen[solidIndex];
    // If another open is already attached to this solid, displace it
    if (previousOpen !== undefined && previousOpen !== openIndex) {
        delete openToSolid[previousOpen];
        // Push the old open slightly away
        var solidPos = link.vertices[solidIndex];
        link.vertices[previousOpen] = [
            solidPos[0] + 20,
            solidPos[1] + 20
        ];
    }
    // If this open was attached somewhere else, clear that old socket
    var previousSolid = openToSolid[openIndex];
    if (previousSolid !== undefined && previousSolid !== solidIndex) {
        delete solidToOpen[previousSolid];
    }
    solidToOpen[solidIndex] = openIndex;
    openToSolid[openIndex] = solidIndex;
    // Snap open directly into the solid node
    link.vertices[openIndex] = [
        link.vertices[solidIndex][0],
        link.vertices[solidIndex][1]
    ];
}

function syncAttachedVertices() {
    enforceAttachments();
}

function enforceAttachments() {
    _.each(solidToOpen, function(openIndex, solidIndex) {
        solidIndex = parseInt(solidIndex, 10);
        openIndex = parseInt(openIndex, 10); // Ensure this is also an integer

        var openPos = link.vertices[openIndex];
        var solidPos = link.vertices[solidIndex];

        // Check if either of the attached nodes are pinned
        var openFixed = link.fixed.indexOf(openIndex) !== -1;
        var solidFixed = link.fixed.indexOf(solidIndex) !== -1;

        if (solidFixed && !openFixed) {
            // Solid is fixed, force open to snap to solid
            link.vertices[openIndex] = [solidPos[0], solidPos[1]];
        } else if (openFixed && !solidFixed) {
            // Open is fixed, force solid to snap to open
            link.vertices[solidIndex] = [openPos[0], openPos[1]];
        } else {
            // Neither is fixed (or both are), average them so both constraints are respected
            var mid = [
                0.5 * (openPos[0] + solidPos[0]),
                0.5 * (openPos[1] + solidPos[1])
            ];

            link.vertices[openIndex] = [mid[0], mid[1]];
            link.vertices[solidIndex] = [mid[0], mid[1]];
        }
    });
}

function solveJointedSystem(iterations) {
    iterations = iterations || 10;

    for (var k = 0; k < iterations; k++) {
        link.correctEdgeLengths();  // enforce edge lengths
        enforceAttachments();       // enforce joint coincidence
    }
}

function getDragGroup(i) {
    if (solidToOpen[i] !== undefined) {
        // dragging solid -> move its open partner too
        return {
            solid: i,
            open: solidToOpen[i]
        };
    }

    if (openToSolid[i] !== undefined) {
        // dragging open -> move its solid partner too
        return {
            solid: openToSolid[i],
            open: i
        };
    }

    return null;
}

//helps keep names static and does not change when deleted previous node
function getNextAutoNodeName() {
    var name = String.fromCharCode(65 + nextAutoNodeNameIndex);
    nextAutoNodeNameIndex++;
    return name;
}

//compares vertice names with star and without
function getBaseNodeName(i) {
    return nodeNames[i] || '?';
}

//open and solid with the same name
function isOpenNode(i) {
    return (i in openNodes) ? openNodes[i] : (nodeStyle === 'open');
}
function canAttachPair(i, j) {
    if (getBaseNodeName(i) !== getBaseNodeName(j)) return false;

    var iOpen = isOpenNode(i);
    var jOpen = isOpenNode(j);

    return iOpen !== jOpen; // exactly one open and one solid
}


function makeSnapshot() {
    return {
        vertices  : link.vertices.map(function(v) { return [v[0], v[1]]; }),
        fixed     : link.fixed.slice(),
        edges     : link.edges.map(function(e) { 
            var edgeCopy = {i: e.i, j: e.j};
            if (typeof e.length !== 'undefined') {
                edgeCopy.length = e.length;
            }
            return edgeCopy;
        }),
        angles    : link.angles.map(function(a) { return {i: a.i, j: a.j, k: a.k}; }),
        nodeNames : $.extend({}, nodeNames),
        edgeNames : $.extend({}, edgeNames),
        openNodes : $.extend({}, openNodes),
        solidToOpen : $.extend({}, solidToOpen),
        openToSolid : $.extend({}, openToSolid)
    };
}

function restoreSnapshot(snapshot) {
    link.vertices = snapshot.vertices;
    link.fixed    = snapshot.fixed;
    link.edges    = snapshot.edges;
    link.angles   = snapshot.angles;
    nodeNames     = snapshot.nodeNames;
    edgeNames     = snapshot.edgeNames;
    openNodes     = snapshot.openNodes;
    solidToOpen   = snapshot.solidToOpen || {};
    openToSolid   = snapshot.openToSolid || {};
    curVertex = undefined;
    curEdge   = undefined;
}

//helps fix edges length
function getEdgeTargetLength(e) {
    if (typeof e.length !== 'undefined') return e.length;
    return numeric.norm2(numeric.sub(link.vertices[e.j], link.vertices[e.i]));
}

function getFixedNeighborConstraints(i) {
    var constraints = [];

    _.each(link.edges, function(e) {
        var fixedIndex = -1;

        if (e.i === i && link.fixed.indexOf(e.j) >= 0) {
            fixedIndex = e.j;
        } else if (e.j === i && link.fixed.indexOf(e.i) >= 0) {
            fixedIndex = e.i;
        }

        if (fixedIndex >= 0) {
            constraints.push({
                center: [link.vertices[fixedIndex][0], link.vertices[fixedIndex][1]],
                radius: getEdgeTargetLength(e)
            });
        }
    });

    return constraints;
}

function projectToCircle(center, radius, point) {
    var dx = point[0] - center[0];
    var dy = point[1] - center[1];
    var d = Math.sqrt(dx * dx + dy * dy);

    if (d > 1e-9) {
        return [
            center[0] + dx * radius / d,
            center[1] + dy * radius / d
        ];
    }

    return [center[0] + radius, center[1]];
}

function constrainToFixedNeighbors(indices, desiredPos) {
    var constrained = [desiredPos[0], desiredPos[1]];
    var constraints = [];

    _.each(indices, function(i) {
        constraints = constraints.concat(getFixedNeighborConstraints(i));
    });

    if (constraints.length === 0) {
        return constrained;
    }

    // Iterate a few times so the point satisfies all fixed-neighbor circles
    for (var iter = 0; iter < 6; iter++) {
        _.each(constraints, function(c) {
            constrained = projectToCircle(c.center, c.radius, constrained);
        });
    }

    return constrained;
}

function saveHistory() {
    undoStack.push(makeSnapshot());
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    // any new action clears the redo stack
    redoStack = [];
    refreshHistoryButtons();
}

function undo() {
    if (undoStack.length === 0) return;
    // save current state to redo stack before going back
    redoStack.push(makeSnapshot());
    restoreSnapshot(undoStack.pop());
    refreshHistoryButtons();
    update();
}

function redo() {
    if (redoStack.length === 0) return;
    // save current state to undo stack before going forward
    undoStack.push(makeSnapshot());
    restoreSnapshot(redoStack.pop());
    refreshHistoryButtons();
    update();
}

function refreshHistoryButtons() {
    if (undoStack.length === 0) {
        $('#btn-undo').prop('disabled', true).css('opacity', '0.4');
    } else {
        $('#btn-undo').prop('disabled', false).css('opacity', '1');
    }
    if (redoStack.length === 0) {
        $('#btn-redo').prop('disabled', true).css('opacity', '0.4');
    } else {
        $('#btn-redo').prop('disabled', false).css('opacity', '1');
    }
}

function reset() {
    allVelocities = [];
    curVertex = undefined;
    curEdge = undefined;
    attractor = undefined;
    solidToOpen = {};
    openToSolid = {};
    tracks = {};
    nodeNames = {}; // Clear custom node names
    edgeNames = {}; // Clear custom edge names
    openNodes = {}; // Clear individual node open/closed states
    edgeStartNode = -1; // Clear edge creation state
    edgePreviewEnd = null;
    edgeSnapNode = -1;
}

function shiftNodeData(deletedIndex) {
    // Helper to shift standard maps (keys are indices)
    function shiftDict(dict) {
        var newDict = {};
        _.each(dict, function(val, key) {
            var idx = parseInt(key, 10);
            if (idx !== deletedIndex) {
                newDict[idx < deletedIndex ? idx : idx - 1] = val;
            }
        });
        return newDict;
    }

    // Apply to our state objects
    tracks = shiftDict(tracks);
    nodeNames = shiftDict(nodeNames);
    openNodes = shiftDict(openNodes);

    // Helper to shift paired attachment maps (both keys AND values are indices)
    function shiftPairs(dict) {
        var newDict = {};
        _.each(dict, function(val, key) {
            var idx = parseInt(key, 10);
            var targetIdx = parseInt(val, 10);
            
            // If either node in the pair was deleted, drop the connection
            if (idx !== deletedIndex && targetIdx !== deletedIndex) {
                var newIdx = idx < deletedIndex ? idx : idx - 1;
                var newTarget = targetIdx < deletedIndex ? targetIdx : targetIdx - 1;
                newDict[newIdx] = newTarget;
            }
        });
        return newDict;
    }

    solidToOpen = shiftPairs(solidToOpen);
    openToSolid = shiftPairs(openToSolid);
}

var VELOCITY_COEFF = 1;
