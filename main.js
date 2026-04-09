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
var currentTool = 'select'; // 'add-node', 'select', 'add-edge', etc.
var appMode = 'edit'; // 'edit' or 'play' mode

// Custom label names
var nodeNames = {}; // Custom names for nodes {index: "name"}
var edgeNames = {}; // Custom names for edges {index: "name"}

// Individual node styles
var openNodes = {}; // Track which specific nodes are open {index: true/false}

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
        openNodes : $.extend({}, openNodes)
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
    curVertex = undefined;
    curEdge   = undefined;
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
    tracks = {};
    nodeNames = {}; // Clear custom node names
    edgeNames = {}; // Clear custom edge names
    openNodes = {}; // Clear individual node open/closed states
    edgeStartNode = -1; // Clear edge creation state
    edgePreviewEnd = null;
    edgeSnapNode = -1;
}

var VELOCITY_COEFF = 1;
var VELOCITY_MAG = 1;
var playSpeed = 1.0; // slider-driven speed multiplier

var VERTEX_SIZE = 10;
var LINE_WIDTH = 4;
var ANGLE_DIST = 25;
var VECTOR_LENGTH = 50;
var PICK_DIST2 = 100;
var ATTRACT_DIST2 = 25;
var TRACK_LENGTH = 1024;
var TRACK_DIST2 = 4;

function normalized(v) {
    return numeric.div(v, numeric.norm2(v));
}

function strokeLine(c, u, v) {
    c.beginPath();
    c.moveTo(u[0], u[1]);
    c.lineTo(v[0], v[1]);
    c.stroke();
}

function fillPoint(c, v, style) {
    // Use individual node style if specified, otherwise use global nodeStyle
    var drawStyle = style || nodeStyle;
    
    if (drawStyle === 'open') {
        // Draw hollow circle
        c.beginPath();
        c.arc(v[0], v[1], VERTEX_SIZE/2, 0, 2 * Math.PI);
        c.stroke();
    } else {
        // Draw filled circle
        c.beginPath();
        c.arc(v[0], v[1], VERTEX_SIZE/2, 0, 2 * Math.PI);
        c.fill();
    }
}

function colorComponent(x) {
    x = Math.round(255 * x).toString(16);
    if (x.length < 2) x = '0' + x;
    return x;
}

function colorString(r, g, b) {
    return '#' + colorComponent(r) + colorComponent(g) + colorComponent(b);
}


function display() {
    console.log('display called, vertices:', link.vertices.length);
    var num = numeric;
    var canvas = $('#canvas');
    canvas.attr('width', canvas.width());
    canvas.attr('height', canvas.height());
    var c = canvas[0].getContext('2d');
    c.clearRect(0, 0, canvas.width, canvas.height);

    // draw DOF text unscaled so it remains legible
    if (!(info & 1)) {
        c.fillStyle = colorString(0, 0, 0);
        c.font = '10pt Helvetica';
        c.fillText(allVelocities.length + ' degrees of freedom',
                   50, 50);
    }

    // apply uniform scale and pan for drawing linkage
    c.save();
    c.translate(panX, panY);
    c.scale(scale, scale);

    _.each(link.edges, function(e, k) {
        if (k == curEdge) c.strokeStyle = colorString(1, 0.3, 1);
        else c.strokeStyle = colorString(1, 0.3, 0);
        strokeLine(c, link.vertices[e.i], link.vertices[e.j]);
        
        // Draw edge label (use custom name if available)
        if (showLabels) {
            var midpoint = numeric.mul(0.5, numeric.add(link.vertices[e.i], link.vertices[e.j]));
            c.fillStyle = colorString(1, 1, 0.5); // Light yellow for edge labels
            c.font = '10px Arial';
            var edgeLabel = edgeNames[k] || ('E' + (k + 1));
            c.fillText(edgeLabel, midpoint[0] + 5, midpoint[1] - 5);
        }

        if (showEdgeLengths) {
            var u = link.vertices[e.i];
            var v2 = link.vertices[e.j];
            var mid = numeric.mul(0.5, numeric.add(u, v2));
            var len = numeric.norm2(numeric.sub(v2, u));
            c.fillStyle = colorString(1, 1, 0.5);
            c.font = '10px Arial';
            c.fillText(len.toFixed(2), mid[0] + 5, mid[1] + 10);
        }
    });

    // Draw edge preview line (in add-edge mode)
    if (currentTool === 'add-edge' && edgeStartNode >= 0 && edgePreviewEnd) {
        c.save();
        c.strokeStyle = colorString(0, 1, 1); // Cyan for preview
        c.lineWidth = 3;
        c.setLineDash([5, 5]); // Dashed line
        strokeLine(c, link.vertices[edgeStartNode], edgePreviewEnd);
        c.setLineDash([]); // Reset line dash
        c.restore();
    }

    if (!(view & 4)) {
        c.strokeStyle = colorString(1, 0.7, 0);
        _.each(link.angles, function(a) {
            var u = link.vertices[a.i];
            var v = link.vertices[a.j];
            var w = link.vertices[a.k];
            strokeLine(c, num.add(u, num.mul(ANGLE_DIST, normalized(num.sub(v, u)))),
                       num.add(u, num.mul(ANGLE_DIST, normalized(num.sub(w, u)))));
        });
    }

    c.strokeStyle = colorString(0, 0.5, 0);
    _.each(tracks, function(track) {
        c.beginPath();
        _.each(track, function(v, i) {
            if (i == 0) c.moveTo(v[0], v[1]);
            else c.lineTo(v[0], v[1]);
        });
        c.stroke();
    });

    if (!(view & 1)) {
        var n = allVelocities.length;
        _.each(allVelocities, function(velocities, k) {
            velocities = num.mul(VECTOR_LENGTH, velocities);
            c.strokeStyle = colorString(0, (k + 1) / n, 0);
            _.each(link.vertices, function(v, i) {
                strokeLine(c, v, num.add(v, velocities[i]));
            });
        });
    }

    _.each(link.vertices, function(v, i) {
        var b = i == curVertex ? 1 : 0;
        var isFixed = link.fixed.indexOf(i) != -1;
        var r = isFixed ? 1 : 0;
        var g = i in tracks ? 1 : 0;
        
        if (i == curVertex || !(view & 2)) {
            // Determine node style (individual or global)
            var thisNodeStyle = (i in openNodes) ? (openNodes[i] ? 'open' : 'filled') : nodeStyle;
            
            
            // Highlight nodes in add-edge mode
            if (currentTool == 'add-edge'){
                if (i == edgeStartNode){
                    // Start node -> SUPER BRIGHT glow (multiple layers)
                    c.save();
                    
                    
                    // Outer glow layer
                    c.shadowBlur = 30;
                    c.shadowColor = '#00ff00';
                    c.fillStyle = colorString(0, 1, 0);
                    c.strokeStyle = colorString(0, 1, 0);
                    fillPoint(c, v, thisNodeStyle);
                    
                    // Middle glow layer
                    c.shadowBlur = 20;
                    c.shadowColor = '#00ff00';
                    fillPoint(c, v, thisNodeStyle);
                    
                    // Inner bright core
                    c.shadowBlur = 10;
                    c.shadowColor = '#00ff00';
                    fillPoint(c, v, thisNodeStyle);
                    
                    c.restore();
                    
                    // Skip the normal fillPoint below
                    var skipNormalFill = true;

                    // Add glow effect
                    c.shadowBlur = 40;
                    c.shadowColor = 'rgba(0, 255, 0, 1)';
                } else if (i === edgeSnapNode) {
                    // Hover node - cyan
                    c.fillStyle = colorString(0, 1, 1);
                    c.strokeStyle = colorString(0, 1, 1);
                } else {
                    c.fillStyle = colorString (1, 1, 1); //white
                    c.strokeStyle = colorString (1, 1, 1);
                } 
            } else if (i == curVertex){
                c.fillStyle = colorString (0, 0.5, 1); //blue when selected
                c.strokeStyle = colorString(0, 0.5, 1);
            }
            else{
                c.fillStyle = colorString(1,1,1); // white for normal nodes
                c.strokeStyle = colorString(1,1,1);
            }

            if(i == curVertex){
                c.fillStyle = colorString(0, 0.5, 1); // blue when selected
                c.strokeStyle = colorString(0, 0.5, 1);
            }
            else{
                c.fillStyle = colorString(1,1,1); // white for normal nodes
                c.strokeStyle = colorString(1,1,1);
            }
            
            if (thisNodeStyle === 'open') {
                c.lineWidth = 2;
            }
            
            fillPoint(c, v, thisNodeStyle);
            // Reset shadow after drawing
            c.shadowBlur = 0;

            // Draw fixed point indicator (pin icon)
            if (isFixed && showLabels) {
                c.fillStyle = colorString(1, 0.2, 0.2); // Red for fixed
                c.font = 'bold 16px Arial';
                c.fillText('📍', v[0] + 8, v[1] - 8);
            }
            
            // Draw node label (use custom name if available)
            if (showLabels) {
                c.fillStyle = colorString(1, 1, 1); // White labels
                c.font = 'bold 12px Arial';
                var label = nodeNames[i] || String.fromCharCode(65 + i); // Custom or A, B, C, etc.
                c.fillText(label, v[0] - 15, v[1] - 15);
                
                // Store label position for click detection (invisible)
                // We'll handle this in mouse events
            }
        }
    });

    if (attractor) {
        c.fillStyle = colorString(0.5, 0.5, 0.5)
        fillPoint(c, attractor);
    }

    // Transperent preview node when in add node mode
    if(currentTool == 'add-node' && previewNodePosition){
        c.save();
        c.globalAlpha = 0.4; // Makes it transparent
        c.fillStyle = colorString(0.7, 0.7, 1); //Color of transperent node
        c.strokeStyle = colorString(0.7, 0.7, 1);

        fillPoint(c, previewNodePosition, nodeStyle);  // ✅ Use nodeStyle instead
        c.restore();
    }
    // undo scale transform
    c.restore();
}

// XML SAVE / LOAD
function saveLinkageAsXML() {
    var lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<linkage>');

    // Vertices
    lines.push('  <vertices>');
    _.each(link.vertices, function(v, i) {
        var name  = nodeNames[i] ? ' name="' + escXML(nodeNames[i]) + '"' : '';
        var open  = (i in openNodes) ? ' open="' + openNodes[i] + '"' : '';
        lines.push('    <vertex id="' + i + '" x="' + v[0] + '" y="' + v[1] + '"' + name + open + '/>');
    });
    lines.push('  </vertices>');

    // Fixed
    lines.push('  <fixed>');
    _.each(link.fixed, function(i) {
        lines.push('    <pin vertex="' + i + '"/>');
    });
    lines.push('  </fixed>');

    // Edges
    lines.push('  <edges>');
    _.each(link.edges, function(e, k) {
        var name = edgeNames[k] ? ' name="' + escXML(edgeNames[k]) + '"' : '';
        var length = (typeof e.length !== 'undefined') ? ' length="' + e.length + '"' : '';
        lines.push('    <edge id="' + k + '" i="' + e.i + '" j="' + e.j + '"' + length + name + '/>');
    });
    lines.push('  </edges>');

    // Angles
    lines.push('  <angles>');
    _.each(link.angles, function(a) {
        lines.push('    <angle i="' + a.i + '" j="' + a.j + '" k="' + a.k + '"/>');
    });
    lines.push('  </angles>');

    lines.push('</linkage>');

    var xml  = lines.join('\n');
    var blob = new Blob([xml], { type: 'application/xml' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = 'linkage.xml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function loadLinkageFromXML(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var parser  = new DOMParser();
            var xmlDoc  = parser.parseFromString(e.target.result, 'application/xml');

            // Check for parse errors
            var errs = xmlDoc.getElementsByTagName('parsererror');
            if (errs.length) throw new Error('XML parse error');

            saveHistory();
            reset();
            link.clear();

            // Vertices
            var vNodes = xmlDoc.querySelectorAll('vertices > vertex');
            link.vertices = [];
            vNodes.forEach(function(v) {
                var idx  = parseInt(v.getAttribute('id'));
                link.vertices[idx] = [parseFloat(v.getAttribute('x')),
                                      parseFloat(v.getAttribute('y'))];
                if (v.hasAttribute('name'))
                    nodeNames[idx] = v.getAttribute('name');
                if (v.hasAttribute('open'))
                    openNodes[idx] = v.getAttribute('open') === 'true';
            });

            // Fixed
            xmlDoc.querySelectorAll('fixed > pin').forEach(function(p) {
                link.fixed.push(parseInt(p.getAttribute('vertex')));
            });

            // Edges
            link.edges = [];
            xmlDoc.querySelectorAll('edges > edge').forEach(function(ed) {
                var idx = parseInt(ed.getAttribute('id'));
                link.edges[idx] = {
                    i: parseInt(ed.getAttribute('i')),
                    j: parseInt(ed.getAttribute('j'))
                };
                if (ed.hasAttribute('length')) {
                    link.edges[idx].length = parseFloat(ed.getAttribute('length'));
                } else {
                    // Fallback: calculate from vertex positions
                    var vi = link.vertices[link.edges[idx].i];
                    var vj = link.vertices[link.edges[idx].j];
                    if (vi && vj) {
                        link.edges[idx].length = numeric.norm2(numeric.sub(vj, vi));
                    }
                }
                if (ed.hasAttribute('name'))
                    edgeNames[idx] = ed.getAttribute('name');
            });

            // Angles
            xmlDoc.querySelectorAll('angles > angle').forEach(function(a) {
                link.angles.push({
                    i: parseInt(a.getAttribute('i')),
                    j: parseInt(a.getAttribute('j')),
                    k: parseInt(a.getAttribute('k'))
                });
            });

            update();
        } catch(err) {
            alert('Failed to load XML: ' + err.message);
        }
    };
    reader.readAsText(file);
}

// Escape special XML characters in attribute values
function escXML(str) {
    return str.replace(/&/g,'&amp;')
              .replace(/"/g,'&quot;')
              .replace(/</g,'&lt;')
              .replace(/>/g,'&gt;');
}

function pick(x, y) {
    // Use screenToWorld to properly handle both scale AND pan
    var w = screenToWorld(x, y);
    var wx = w[0];
    var wy = w[1];
    
    var i = link.findVertex(wx, wy);
    if (i >= 0 && link.vertexDist2(wx, wy, i) < PICK_DIST2)
        return {vertex: i};

    var k = link.findEdge(wx, wy);
    if (k >= 0 && link.edgeDist2(wx, wy, k) < PICK_DIST2)
        return {edge: k};

    return {};
}

// Find nearest node to a world position
function findNearestNode(wx, wy) {
    var nearest = -1;
    var minDist = EDGE_SNAP_DIST2;
    _.each(link.vertices, function(v, i) {
        var dist2 = link.vertexDist2(wx, wy, i);
        if (dist2 < minDist) {
            minDist = dist2;
            nearest = i;
        }
    });
    return nearest;
}

function makeEdge(i, j) {
    var edge = i < j ? {i: i, j: j} : {i: j, j: i};
    // Store the edge length to maintain it during movement
    var vi = link.vertices[edge.i];
    var vj = link.vertices[edge.j];
    edge.length = numeric.norm2(numeric.sub(vj, vi));
    return edge;
}

function makeAngle(i, j, k) {
    if (j < k) return {i: i, j: j, k: k};
    else return {i: i, j: k, k: j};
}

function makeAngle2(i1, j1, i2, j2) {
    if (i1 == i2) return makeAngle(i1,j1,j2);
    if (i1 == j2) return makeAngle(i1,j1,i2);
    if (j1 == i2) return makeAngle(j1,i1,j2);
    if (j1 == j2) return makeAngle(j1,i1,i2);
}

function mouseleft(x, y) {
    console.log('mouseleft called with x:', x, 'y:', y, 'currentTool:', currentTool);
    // convert to world coordinates before use
    var w = screenToWorld(x, y);
    var wx = w[0];
    var wy = w[1];
    console.log('world coords:', wx, wy);
    var picked = pick(x, y); // pick now handles conversion itself
    console.log('picked:', picked);
    
        // In add-edge mode, ignore clicks (we handle mousedown/mouseup instead)
    if (currentTool === 'add-edge') {
        return;
    }

    if (picked.vertex >= 0 || picked.edge >= 0) {
        console.log('picked vertex or edge');
        if (picked.vertex == curVertex)
            delete picked.vertex; // clicking cur deselects
        if (picked.edge == curEdge)
            delete picked.edge;
        curVertex = picked.vertex;
        curEdge = picked.edge;
        display();
    }
    else {
        console.log('no pick, currentTool:', currentTool);
        // Only add node if in add-node mode
        if (currentTool === 'add-node') {
            console.log('adding node');
            saveHistory();
            link.vertices.push([wx, wy]);
            update();
        }
        // Otherwise just deselect
        else {
            curVertex = undefined;
            curEdge = undefined;
            display();
        }
    }
}

function mousemiddle(x, y) {
    var picked = pick(x, y);  // pick now handles conversion
    var i = picked.vertex, k = picked.edge;

    if (i >= 0 && curVertex >= 0 && i != curVertex) {
        var edge = makeEdge(i, curVertex);
        var k = link.getEdge(edge);
        saveHistory();
        if (k >= 0) link.removeEdge(k);
        else link.edges.push(edge);
        update();
    }

    else if (k >= 0 && curEdge >= 0 && k != curEdge) {
        var ij = link.edges[curEdge];
        var jk = link.edges[k];
        var angle = makeAngle2(ij.i, ij.j, jk.i, jk.j);
        if (angle) {
            var a = link.getAngle(angle);
            saveHistory();
            if (a >= 0) link.angles.splice(a, 1);
            else link.angles.push(angle);
            update();
        }
    }
}

function mouseright(x, y) {
    // world coordinates
    var w = screenToWorld(x, y);
    var wx = w[0];
    var wy = w[1];
    if (attractor && numeric.norm2Squared(numeric.sub([wx, wy], attractor)) < PICK_DIST2)
        attractor = undefined;
    else
        attractor = [wx, wy];
    display();
}

function keypress(key) {
    if (key == 'f' && curVertex >= 0) {
        var i = link.fixed.indexOf(curVertex);
        if (i >= 0) link.fixed.splice(i, 1);
        else link.fixed.push(curVertex);
        update();
    }

    else if (key == 't' && curVertex >= 0) {
        if (curVertex in tracks) delete tracks[curVertex];
        else tracks[curVertex] = [];
        display();
    }

    else if (key == 'd') {
        if (curVertex >= 0) {
            if (curVertex in tracks) {
                var oldTracks = tracks;
                tracks = {};
                _.each(oldTracks, function(track, i) {
                    if (i != curVertex)
                        tracks[i < curVertex ? i : i-1] = track;
                });
            }

            link.removeVertex(curVertex);
            curVertex = undefined;
            update();
        }
        else if (curEdge >= 0) {
            link.removeEdge(curEdge);
            curEdge = undefined;
            update();
        }
    }

    else if (key == 'c') {
        reset();
        link.clear();
        update();
    }

    else if (key == 'v') {
        view = (view + 1) % VIEWS;
        display();
    }

    else if (key == 'i') {
        info = (info + 1) % INFOS;
        display();
    }

    else if (key == 'l') { // toggle edge length display
        showEdgeLengths = !showEdgeLengths;
        display();
    }

    else if ((key - '1') in PRESETS) {
        reset();
        link = PRESETS[key - '1'].copy();
        update();
    }
}


var resized = false;
function idle() {
    // Trace back mode - move nodes along their traces (forward or backward)
    if (traceBackMode) {
        var stillPlaying = false;
        var reachedEnd = false;
        var reachedStart = false;
        
        _.each(tracks, function(track, i) {
            if (track.length > 0) {
                if (!(i in traceBackIndex)) {
                    // Initialize based on direction
                    traceBackIndex[i] = traceDirection === -1 ? track.length - 1 : 0;
                }
                
                var idx = traceBackIndex[i];
                
                // Check bounds
                if (idx >= 0 && idx < track.length) {
                    link.vertices[i] = track[idx];
                    traceBackIndex[i] += traceDirection;
                    stillPlaying = true;
                }
                
                // Check if we've reached the end or start
                if (traceDirection === -1 && idx <= 0) reachedStart = true;
                if (traceDirection === 1 && idx >= track.length - 1) reachedEnd = true;
            }
        });
        
        // Handle end conditions based on loop mode
        if (traceLoopMode) {
            // Loop mode: bounce back and forth
            if (reachedStart && traceDirection === -1) {
                traceDirection = 1;
                stillPlaying = true;
            } else if (reachedEnd && traceDirection === 1) {
                traceDirection = -1;
                stillPlaying = true;
            }
        } else {
            // Play once mode: stop when reaching the start
            if (reachedStart && traceDirection === -1) {
                traceBackMode = false;
                traceBackIndex = {};
                traceDirection = -1;
                $('#btn-trace-back').removeClass('active');
                $('#btn-trace-back').find('.btn-label').text('Trace Back');
                $('#btn-trace-back').find('.btn-icon').text('⏮');
                stillPlaying = false;
            }
        }
        
        // Only stop if explicitly turned off or no tracks exist
        if (!stillPlaying && Object.keys(tracks).length === 0) {
            traceBackMode = false;
            traceBackIndex = {};
            traceDirection = -1;
        }
        
        update();
    }
    // Normal attractor mode
    else if (attractor && curVertex >= 0 && allVelocities.length && link.fixed.indexOf(curVertex) < 0) {
        var num = numeric;
        var velocity0 = num.sub(attractor, link.vertices[curVertex]);

        if (num.norm2Squared(velocity0) < ATTRACT_DIST2) { // turn off attractor
            attractor = undefined;
            display();
        }
        else {
            velocity0 = num.mul(VELOCITY_MAG, normalized(velocity0));
            _.each(allVelocities, function(velocities) {
                var velocity = velocities[curVertex];
                var d = num.norm2Squared(velocity);
                if (d < 1e-9) return;

                var c = num.dot(velocity0, velocity) / d;
                if (c < -VELOCITY_COEFF) c = -VELOCITY_COEFF;
                if (c > VELOCITY_COEFF) c = VELOCITY_COEFF;

                velocity0 = num.sub(velocity0, num.mul(c, velocity));

                for (var i in link.vertices) {
                    link.vertices[i] = num.add(link.vertices[i],
                                               num.mul(c, velocities[i]));
                }
            });

            _.each(tracks, function(track, i) {
                var last = track[track.length - 1];
                if (!last || link.vertexDist2(last[0], last[1], i) > TRACK_DIST2) {
                    track.push(link.vertices[i]);

                    if (track.length > TRACK_LENGTH)
                        track.splice(0, track.length - TRACK_LENGTH);
                }
            });

            // Correct edge length drift from finite step integration
            link.correctEdgeLengths();
            
            update();
        }
    }
    else if (resized) {
        display();
        resized = false;
    }

    setTimeout(idle, 10);
}

function update() {
    if (link.vertices.length)
        allVelocities = link.computeRigidity();
    else
        allVelocities = [];
    display();
}

link = PRESETS[0].copy();

$(function() {
    // Mouse down - start dragging
    $('#canvas').mousedown(function(event) {
        var offset = $(this).offset();
        var x = event.pageX - offset.left;
        var y = event.pageY - offset.top;

        // Right-click drag for panning
        if (event.button === 2) {
            isPanDragging = true;
            lastPanMouseX = x;
            lastPanMouseY = y;
            return;
        }

        // Handle add-edge mode - start edge on mousedown
        if (currentTool === 'add-edge') {
            var picked = pick(x, y);  // pick() now handles conversion
            if (picked.vertex >= 0) {
                edgeStartNode = picked.vertex;
                edgePreviewEnd = link.vertices[edgeStartNode];
                display();
            }
            return;
        }

        // Start constrained drag ONLY in select/play mode.
        // Other tools (add-node/add-edge/delete/label) rely on mouseup handlers.
        if (currentTool === 'select' || appMode === 'play') {
            var picked = pick(x, y); // pick() already accounts for scale
            if (picked.vertex >= 0) {
                // Don't drag fixed vertices
                if (link.fixed.indexOf(picked.vertex) >= 0) {
                    curVertex = picked.vertex;
                    curEdge = undefined;
                    display();
                    return;
                }
                isDragging = true;
                dragVertex = picked.vertex;
                curVertex = picked.vertex;

                // Attractor lives in world coordinates (same space as link.vertices)
                var w = screenToWorld(x, y);
                attractor = [w[0], w[1]];

                display();
                return;
            } else if (picked.edge >= 0) {
                curEdge = picked.edge;
                curVertex = undefined;
                display();
                return;
            }

            // Click-and-hold on empty space for panning
            isPanDragging = true;
            lastPanMouseX = x;
            lastPanMouseY = y;
            return;
        }

        // Click-and-hold anywhere for panning (non-select/play modes)
        isPanDragging = true;
        lastPanMouseX = x;
        lastPanMouseY = y;
        return;
    });

// Mouse up - stop dragging or handle clicks
    $('#canvas').mouseup(function(event) {
        console.log('canvas mouseup event, button:', event.button, 'isPanDragging:', isPanDragging, 'isDragging:', isDragging);
        // Reset pan dragging on left click to allow normal clicks even after accidental right click
        if (event.button !== 2) {
            isPanDragging = false;
        }
        var offset = $(this).offset();
        var x = event.pageX - offset.left;
        var y = event.pageY - offset.top;
        console.log('offset:', offset.left, offset.top, 'x:', x, 'y:', y);
        
        // Handle add-edge mode - complete edge on mouseup
        if (currentTool === 'add-edge' && edgeStartNode >= 0) {
            var picked = pick(x, y);  // pick() now handles conversion
            
            // Only create edge if released on a different node
            if (picked.vertex >= 0 && picked.vertex !== edgeStartNode) {
                var edge = makeEdge(edgeStartNode, picked.vertex);
                var k = link.getEdge(edge);
                saveHistory();
                if (k >= 0) {
                    link.removeEdge(k);
                } else {
                    link.edges.push(edge);
                }
                update();
            }
            
            // Reset edge creation state
            edgeStartNode = -1;
            edgePreviewEnd = null;
            edgeSnapNode = -1;
            display();
            return;
        }
        
        if (isPanDragging) {
            // End pan drag
            isPanDragging = false;
            display();
        } else if (isDragging) {
            // End drag
            isDragging = false;
            dragVertex = -1;
            attractor = undefined;
            update(); // recompute DOF and redraw
        } else if (event.button !== 2) {
            // Normal click behavior (skip for right-click which is used for panning)
            if (event.shiftKey)
                mouseright(x, y);
            else if (event.altKey)
                mousemiddle(x, y);
            else
                mouseleft(x, y);
        }
    });

    // Mouse move - drag node or show preview
    $('#canvas').mousemove(function(event){
        var offset = $(this).offset();
        var x = event.pageX - offset.left;
        var y = event.pageY - offset.top;

        // Pan dragging with space+drag
        if (isPanDragging) {
            var dx = x - lastPanMouseX;
            var dy = y - lastPanMouseY;
            panX += dx;
            panY += dy;
            lastPanMouseX = x;
            lastPanMouseY = y;
            display();
            return;
        }

        // Dragging a node: set an attractor at the cursor and let the
        // rigidity projection in idle() move the linkage along allowed DOF.
        if (isDragging && dragVertex >= 0) {
            var w = screenToWorld(x, y);
            attractor = [w[0], w[1]];
            curVertex = dragVertex;
            display();
        }

        // Edge creation preview
        else if (currentTool === 'add-edge' && edgeStartNode >= 0) {
            var w = screenToWorld(x, y);
            var wx = w[0];
            var wy = w[1];
            // Find nearest node to snap to
            var nearestNode = findNearestNode(wx, wy);
            
            if (nearestNode >= 0 && nearestNode !== edgeStartNode) {
                // Snap to node
                edgePreviewEnd = link.vertices[nearestNode];
                edgeSnapNode = nearestNode;
            } else {
                // Follow mouse
                edgePreviewEnd = [wx, wy];
                edgeSnapNode = -1;
            }
            display();
        }

        // Preview node in add-node mode
        else if(currentTool === 'add-node'){
            var w = screenToWorld(x, y);
            previewNodePosition = [w[0], w[1]];
            display();
        }
        else{
            if(previewNodePosition !== null){
                previewNodePosition = null;
                display();
            }
        }
    });
    
    // Clear preview node when mouse leaves canvas
    $('#canvas').mouseleave(function(){
        if(previewNodePosition !== null){
            previewNodePosition = null;
            display();
        }

        // Clear edge preview
        if (edgePreviewEnd !== null) {
            edgePreviewEnd = null;
            edgeSnapNode = -1;
            display();
        }

        // Stop pan dragging if mouse leaves
        if (isPanDragging) {
            isPanDragging = false;
            display();
        }
        // Also stop dragging if mouse leaves
        if (isDragging) {
            isDragging = false;
            dragVertex = -1;
            attractor = undefined;
            update();
        }
    });
    
    // Prevent context menu on canvas (since right-click is used for panning)
    $('#canvas').contextmenu(function(event) {
        event.preventDefault();
        return false;
    });
    
    // Double-click to rename nodes or edges
    $('#canvas').dblclick(function(event) {
        var rect = this.getBoundingClientRect();
        var x = event.clientX - rect.left;
        var y = event.clientY - rect.top;
        var w = screenToWorld(x, y);
        x = w[0]; y = w[1];
        
        // Check if clicked near a node
        var nodeIndex = -1;
        var minDist = PICK_DIST2;
        _.each(link.vertices, function(v, i) {
            var dist2 = link.vertexDist2(x, y, i);
            if (dist2 < minDist) {
                minDist = dist2;
                nodeIndex = i;
            }
        });
        
        if (nodeIndex >= 0) {
            // Rename node
            var currentName = nodeNames[nodeIndex] || String.fromCharCode(65 + nodeIndex);
            var newName = prompt('Enter new name for node:', currentName);
            if (newName !== null && newName.trim() !== '') {
                nodeNames[nodeIndex] = newName.trim();
                display();
            }
            return;
        }
        
        // Check if clicked near an edge
        var edgeIndex = -1;
        var minEdgeDist = 15; // pixels
        _.each(link.edges, function(e, k) {
            var v1 = link.vertices[e.i];
            var v2 = link.vertices[e.j];
            var midpoint = numeric.mul(0.5, numeric.add(v1, v2));
            var dx = x - midpoint[0];
            var dy = y - midpoint[1];
            var dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < minEdgeDist) {
                minEdgeDist = dist;
                edgeIndex = k;
            }
        });
        
if (edgeIndex >= 0) {
            event.preventDefault();
            
            // Store current edge being edited
            window.currentEditEdge = edgeIndex;
            
            var edge = link.edges[edgeIndex];
            var currentName = edgeNames[edgeIndex] || ('E' + (edgeIndex + 1));
            var currentLength = edge.length ? edge.length : numeric.norm2(numeric.sub(link.vertices[edge.j], link.vertices[edge.i]));
            
            // Position menu near cursor
            var menuX = event.clientX;
            var menuY = event.clientY;
            
            // Keep menu on screen
            var menu = $('#edge-context-menu');
            var menuWidth = 220;
            var menuHeight = 200;
            
            if (menuX + menuWidth > window.innerWidth) {
                menuX = window.innerWidth - menuWidth - 10;
            }
            if (menuY + menuHeight > window.innerHeight) {
                menuY = window.innerHeight - menuHeight - 10;
            }
            
            // Fill in menu
            $('#menu-edge-name').text(currentName);
            $('#menu-current-length').text(currentLength.toFixed(2));
            $('#menu-length-input').val('');
            
            // Show menu at cursor position
            menu.css({
                left: menuX + 'px',
                top: menuY + 'px',
                display: 'block'
            });
            
            // Focus input
            setTimeout(function() {
                $('#menu-length-input').focus();
            }, 100);
        }
    });

    // Scroll wheel to zoom
    $('#canvas').on('wheel', function(event) {
        event.preventDefault();
        
        // Get scroll direction (negative = scroll down/zoom out, positive = scroll up/zoom in)
        var delta = event.originalEvent.deltaY < 0 ? 1.1 : 0.833; // 1/1.1 ≈ 0.909
        
        scale = Math.max(0.1, Math.min(10, scale * delta));
        display();
    });
    

    // Limited keyboard controls - only backspace for delete
    $(window).keydown(function(event) {
        // Escape key - cancel edge creation
        if (event.key === 'Escape' && currentTool === 'add-edge') {
            edgeStartNode = -1;
            edgePreviewEnd = null;
            edgeSnapNode = -1;
            display();
        }
        // Space for panning (press to enable)
        if (event.key === ' ') {
            event.preventDefault();
            spacePressed = true;
            return;
        }

        // Arrow keys for panning
        var panSpeed = 20; // pixels per keystroke
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            panY += panSpeed;
            display();
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            panY -= panSpeed;
            display();
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            panX += panSpeed;
            display();
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            panX -= panSpeed;
            display();
        }

        // Backspace or Delete key
        if (event.keyCode === 8 || event.keyCode === 46) {
            event.preventDefault(); // Prevent browser back navigation
            
            if (curVertex !== undefined && curVertex >= 0) {
                // Delete vertex
                saveHistory();
                if (curVertex in tracks) {
                    var oldTracks = tracks;
                    tracks = {};
                    _.each(oldTracks, function(track, i) {
                        if (i != curVertex)
                            tracks[i < curVertex ? i : i-1] = track;
                    });
                }
                link.removeVertex(curVertex);
                curVertex = undefined;
                update();
            } else if (curEdge !== undefined && curEdge >= 0) {
                // Delete edge
                saveHistory();
                link.removeEdge(curEdge);
                curEdge = undefined;
                update();
            }
        }

        // Ctrl+Z / Cmd+Z — undo
        if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
            event.preventDefault();
            undo();
        }

        // Ctrl+Y / Cmd+Y  or  Ctrl+Shift+Z / Cmd+Shift+Z — redo
        if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.shiftKey && event.key === 'z'))) {
            event.preventDefault();
            redo();
        }
    });
    
    // Track when space key is released
    $(window).keyup(function(event) {
        if (event.key === ' ') {
            event.preventDefault();
            spacePressed = false;
            if (isPanDragging) {
                isPanDragging = false;
                display();
            }
        }
    });
    
    $(window).resize(function() {
        resized = true;
    });

    // Toolbar button handlers
    
    // Zoom buttons (scale around center of canvas)
    $('#btn-zoom-in').click(function() {
        scale = Math.min(10, scale * 1.2);
        display();
    });
    $('#btn-zoom-out').click(function() {
        scale = Math.max(0.1, scale / 1.2);
        display();
    });

    // Mode Toggle Button - Switch between Edit and Play mode
    $('#btn-mode-toggle').click(function() {
        if (appMode === 'edit') {
            // Switch to Play mode
            appMode = 'play';
            $(this).find('.btn-icon').text('▶️');
            $(this).find('.btn-label').text('PLAY MODE');
            $('.edit-mode-section').hide();
            $('.play-mode-section').show();
            
            // Disable adding nodes in play mode
            currentTool = 'select';
             // Clear edge creation state
            edgeStartNode = -1;
            edgePreviewEnd = null;
            edgeSnapNode = -1;
        } else {
            // Switch to Edit mode
            appMode = 'edit';
            $(this).find('.btn-icon').text('✏️');
            $(this).find('.btn-label').text('EDIT MODE');
            $('.edit-mode-section').show();
            $('.play-mode-section').hide();
            
            // Default to select mode in edit
            setToolMode('select');
        }
    });

    $('#play-speed-slider').on('input change', function() {
        var newSpeed = parseFloat($(this).val());
        if (isNaN(newSpeed) || newSpeed <= 0) newSpeed = 1.0;

        playSpeed = newSpeed;
        VELOCITY_COEFF = playSpeed;
        VELOCITY_MAG = 1.0;
        $('#play-speed-value').text(playSpeed.toFixed(1));
    });

    // Initialize slider display in case the default is changed above
    $('#play-speed-slider').val(playSpeed);
    $('#play-speed-value').text(playSpeed.toFixed(1));
    
    function setToolMode(mode) {
        console.log('setToolMode called with mode:', mode);
        currentTool = mode;
        // Clear edge creation state when switching tools
        edgeStartNode = -1;
        edgePreviewEnd = null;
        edgeSnapNode = -1;
        
        // Clear preview node when leaving add-node mode
        previewNodePosition = null;
        
        // Update button active states - remove active from ALL tool buttons
        $('#btn-select').removeClass('active');
        $('#btn-add-node').removeClass('active');
        $('#btn-add-edge').removeClass('active');
        $('#btn-delete').removeClass('active');
        $('#btn-label').removeClass('active');
        $('#btn-attractor').removeClass('active');
        
        // Add active to current tool
        $('#btn-' + mode).addClass('active');
        console.log('set active to #btn-' + mode);
        
        display();
    }

    // Undo button
    $('#btn-undo').click(function() {
        undo();
    });

    // Redo button
    $('#btn-redo').click(function() {
        redo();
    });
    
    // Tool buttons
    $('#btn-select').click(function() {
        setToolMode('select');
    });

    $('#btn-add-node').click(function() {
        setToolMode('add-node');
    });
    
    $('#btn-add-edge').click(function() {
        setToolMode('add-edge');
    });
    
    $('#btn-label').click(function() {
        setToolMode('label');
        alert('Label feature: Double-click on any node or edge to rename it!');
    });

    $('#btn-save-xml').click(function() {
    saveLinkageAsXML();
    });

    // Load — open hidden file input
    $('#btn-load-xml').click(function() {
        $('#xml-file-input').click();
    });

    // File input change → parse XML
    $('#xml-file-input').change(function(event) {
        var file = event.target.files[0];
        if (file) {
            loadLinkageFromXML(file);
            // Reset input so the same file can be reloaded if needed
            $(this).val('');
        }
    });
    
    $('#btn-fix').click(function() {
        if (curVertex !== undefined && curVertex >= 0) {
            // Toggle fix state
            var i = link.fixed.indexOf(curVertex);
            saveHistory();
            if (i >= 0) {
                link.fixed.splice(i, 1);
            } else {
                link.fixed.push(curVertex);
            }
            update();
        } else {
            alert('Please select a node first by clicking on it.');
        }
    });
    
    $('#btn-trace').click(function() {
        if (curVertex !== undefined && curVertex >= 0) {
            // Toggle trace
            if (curVertex in tracks) {
                delete tracks[curVertex];
            } else {
                tracks[curVertex] = [];
            }
            display();
        } else {
            alert('Please select a node first by clicking on it.');
        }
    });
    
    $('#btn-trace-back').click(function() {
        // Check if we have any traces
        var hasTraces = Object.keys(tracks).length > 0;
        
        if (!hasTraces) {
            alert('No traces available. Enable tracing on a node first and let it move.');
            return;
        }
        
        // Check if any trace has recorded points
        var hasPoints = false;
        _.each(tracks, function(track) {
            if (track.length > 1) hasPoints = true;
        });
        
        if (!hasPoints) {
            alert('Traces are empty or too short. Move the linkage to record a trace path first.');
            return;
        }
        
        // Toggle trace back mode
        if (traceBackMode) {
            // Stop playback
            traceBackMode = false;
            traceBackIndex = {};
            traceDirection = -1;
            $(this).removeClass('active');
            $(this).find('.btn-label').text('Trace Back');
            $(this).find('.btn-icon').text('⏮');
        } else {
            // Start playback (backward)
            traceBackMode = true;
            traceBackIndex = {};
            traceDirection = -1; // Start going backward
            attractor = undefined; // Turn off attractor
            $(this).addClass('active');
            $(this).find('.btn-label').text('Playing');
            $(this).find('.btn-icon').text('⏸');
        }
    });
    
    // Toggle loop mode
    $('#btn-trace-loop').click(function() {
        traceLoopMode = !traceLoopMode;
        if (traceLoopMode) {
            $(this).addClass('active');
            $(this).find('.btn-label').text('Loop Mode');
            $(this).find('.btn-icon').text('🔁');
        } else {
            $(this).removeClass('active');
            $(this).find('.btn-label').text('Play Once');
            $(this).find('.btn-icon').text('▶');
        }
    });
    
    $('#btn-attractor').click(function() {
        setToolMode('attractor');
        if (curVertex === undefined || curVertex < 0) {
            alert('Please select a node first, then shift-click to place attractor.');
        }
    });
    
    $('#btn-delete').click(function() {
        if (curVertex !== undefined && curVertex >= 0) {
            // Delete vertex
            saveHistory();
            if (curVertex in tracks) {
                var oldTracks = tracks;
                tracks = {};
                _.each(oldTracks, function(track, i) {
                    if (i != curVertex)
                        tracks[i < curVertex ? i : i-1] = track;
                });
            }
            link.removeVertex(curVertex);
            curVertex = undefined;
            update();
        } else if (curEdge !== undefined && curEdge >= 0) {
            // Delete edge
            saveHistory();
            link.removeEdge(curEdge);
            curEdge = undefined;
            update();
        }
        // silently do nothing if nothing selected
    });
    
    $('#btn-clear').click(function() {
        if (confirm('Clear everything? This cannot be undone.')) {
            saveHistory();
            reset();
            link.clear();
            update();
        }
    });
    
    // Preset buttons
    $('.preset-btn').click(function() {
        var presetIndex = parseInt($(this).attr('data-preset'));
        if (presetIndex >= 0 && presetIndex < PRESETS.length) {
            saveHistory();
            reset();
            link = PRESETS[presetIndex].copy();
            update();
        }
    });
    
    // Display toggle buttons
    $('#btn-toggle-labels').click(function() {
        showLabels = !showLabels;
        if (showLabels) {
            $(this).addClass('active');
            $(this).find('.btn-label').text('Show Labels');
        } else {
            $(this).removeClass('active');
            $(this).find('.btn-label').text('Hide Labels');
        }
        display();
    });

    // edge length toggle
    $('#btn-toggle-lengths').click(function() {
        showEdgeLengths = !showEdgeLengths;
        if (showEdgeLengths) {
            $(this).addClass('active');
            $(this).find('.btn-label').text('Hide Lengths');
        } else {
            $(this).removeClass('active');
            $(this).find('.btn-label').text('Show Lengths');
        }
        display();
    });

    
    $('#btn-toggle-style').click(function() {
        if (nodeStyle === 'filled') {
            nodeStyle = 'open';
            $(this).addClass('active');
            $(this).find('.btn-label').text('Open Nodes');
            $(this).find('.btn-icon').text('○');
        } else {
            nodeStyle = 'filled';
            $(this).removeClass('active');
            $(this).find('.btn-label').text('Filled Nodes');
            $(this).find('.btn-icon').text('●');
        }
        display();
    });
    
    // Toggle individual node open/closed
    $('#btn-toggle-node-open').click(function() {
        if (curVertex !== undefined && curVertex >= 0) {
            // Toggle the selected node's open/closed state
            if (curVertex in openNodes) {
                openNodes[curVertex] = !openNodes[curVertex];
            } else {
                // If not set, toggle from current global default
                openNodes[curVertex] = (nodeStyle === 'filled');
            }
            display();
        } else {
            alert('Please select a node first by clicking on it.');
        }
    });

// Edge context menu handlers
    $('#menu-set-length-btn').click(function() {
        var edgeIndex = window.currentEditEdge;
        if (edgeIndex >= 0 && edgeIndex < link.edges.length) {
            var newLength = parseFloat($('#menu-length-input').val());
            
            if (!isNaN(newLength) && newLength > 0) {
                saveHistory();
                link.edges[edgeIndex].length = newLength;
                link.correctEdgeLengths();
                update();
                $('#edge-context-menu').hide();
            } else {
                alert('❌ Please enter a valid positive number!');
                $('#menu-length-input').focus();
            }
        }
    });
    
    $('#menu-rename-btn').click(function() {
        $('#edge-context-menu').hide();
        
        var edgeIndex = window.currentEditEdge;
        if (edgeIndex >= 0 && edgeIndex < link.edges.length) {
            var currentName = edgeNames[edgeIndex] || ('E' + (edgeIndex + 1));
            var newName = prompt('Enter new name for edge:', currentName);
            
            if (newName !== null && newName.trim() !== '') {
                edgeNames[edgeIndex] = newName.trim();
                display();
            }
        }
    });
    
    $('#menu-cancel-btn').click(function() {
        $('#edge-context-menu').hide();
    });
    
    // Press Enter to set length
    $('#menu-length-input').keypress(function(e) {
        if (e.which === 13) { // Enter key
            $('#menu-set-length-btn').click();
        }
    });
    
    // Click anywhere else to close menu
    $(document).click(function(e) {
        if (!$(e.target).closest('#edge-context-menu').length) {
            $('#edge-context-menu').hide();
        }
    });
    
    // Prevent menu from closing when clicking inside it
    $('#edge-context-menu').click(function(e) {
        e.stopPropagation();
    });
    update();
    idle();
});