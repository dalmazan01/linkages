/**
 * actions.js
 * Core actions, picks, and keyboard-style commands.
 * Split from the original monolithic main.js for readability.
 */

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

function pickAllVertices(x, y) {
    var w = screenToWorld(x, y);
    var wx = w[0];
    var wy = w[1];

    var hits = [];

    _.each(link.vertices, function(v, i) {
        if (link.vertexDist2(wx, wy, i) < PICK_DIST2) {
            hits.push(i);
        }
    });

    return hits;
}

function showNodePicker(hits, pageX, pageY) {
    var menu = $('#node-picker-menu');
    menu.empty();

    hits.forEach(function(i) {
        var name = nodeNames[i] || ('Node ' + i);

        $('<div>')
            .addClass('node-picker-option')
            .text(name + '  (#' + i + ')')
            .click(function() {
                curVertex = i;
                curEdge = undefined;

                // Temporarily boost this node to top + enlarged so it's easy to grab
                if (highlightedVertexTimer) clearTimeout(highlightedVertexTimer);
                highlightedVertex = i;
                highlightedVertexTimer = setTimeout(function() {
                    highlightedVertex = -1;
                    highlightedVertexTimer = null;
                    display();
                }, 1200);

                menu.hide();
                display();
            })
            .appendTo(menu);
    });

    menu.css({
        left: pageX + 'px',
        top: pageY + 'px',
        display: 'block'
    });
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
    // convert to world coordinates before use
    var w = screenToWorld(x, y);
    var wx = w[0];
    var wy = w[1];
    var picked = pick(x, y); // pick now handles conversion itself
    
        // In add-edge mode, ignore clicks (we handle mousedown/mouseup instead)
    if (currentTool === 'add-edge') {
        return;
    }

    if (currentTool === 'select-multiple') {
        if (picked.vertex >= 0) {
            var idx = selectedVertices.indexOf(picked.vertex);
            if (idx >= 0) {
                // Node is already selected, remove it
                selectedVertices.splice(idx, 1);
            } else {
                // Node is not selected, add it
                selectedVertices.push(picked.vertex);
            }
            display();
        }
        return;
    }

    if (picked.vertex >= 0 || picked.edge >= 0) {
        if (picked.vertex == curVertex)
            delete picked.vertex; // clicking cur deselects
        if (picked.edge == curEdge)
            delete picked.edge;
        curVertex = picked.vertex;
        curEdge = picked.edge;
        display();
    }
    else {
        // Only add node if in add-node mode
        if (currentTool === 'add-node') {
            saveHistory();
            link.vertices.push([wx, wy]);
        
            var newIndex = link.vertices.length - 1;
            nodeNames[newIndex] = getNextAutoNodeName();
        
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

    else if (key == 'd'){
        if (curVertex >= 0){
            shiftNodeData(curVertex); // Use our new helper
            link.removeVertex(curVertex);
            curVertex = undefined;
            update();
        }
        else if (curEdge >= 0){
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