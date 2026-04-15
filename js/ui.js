/**
 * ui.js
 * DOM event handlers and toolbar wiring.
 *
 * This second-pass cleanup keeps behavior the same, but groups repeated UI
 * logic into small helpers so the file reads more like app flow and less like
 * one long list of handlers.
 */

var TOOL_BUTTON_IDS = [
    '#btn-select',
    '#btn-add-node',
    '#btn-add-edge',
    '#btn-delete',
    '#btn-label',
    '#btn-attractor'
];

function getCanvasPosition(event, element) {
    var offset = $(element).offset();
    return {
        x: event.pageX - offset.left,
        y: event.pageY - offset.top
    };
}

function getCanvasPositionFromClient(event, element) {
    var rect = element.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function clearEdgeCreationState() {
    edgeStartNode = -1;
    edgePreviewEnd = null;
    edgeSnapNode = -1;
}

function clearPreviewState() {
    previewNodePosition = null;
    clearEdgeCreationState();
}

function startPanDrag(x, y) {
    isPanDragging = true;
    lastPanMouseX = x;
    lastPanMouseY = y;
}

function stopPanDrag() {
    if (!isPanDragging) return;
    isPanDragging = false;
    display();
}

function stopNodeDrag(shouldRefresh) {
    if (!isDragging) return;
    isDragging = false;
    dragVertex = -1;
    attractor = undefined;

    if (shouldRefresh) {
        update();
    }
}

function beginVertexDrag(vertexIndex) {
    if (link.fixed.indexOf(vertexIndex) >= 0) {
        curVertex = vertexIndex;
        curEdge = undefined;
        display();
        return;
    }

    isDragging = true;
    dragVertex = vertexIndex;
    curVertex = vertexIndex;
    curEdge = undefined;
    display();
}

function moveDraggedVertex(mouseWorldPos) {
    var vertexIndex = dragVertex;
    var dragGroup = getDragGroup(vertexIndex);

    curVertex = vertexIndex;

    if (dragGroup) {
        link.vertices[dragGroup.open] = [mouseWorldPos[0], mouseWorldPos[1]];
        link.vertices[dragGroup.solid] = [mouseWorldPos[0], mouseWorldPos[1]];
    } else if (isOpenNode(vertexIndex)) {
        link.vertices[vertexIndex] = [mouseWorldPos[0], mouseWorldPos[1]];

        var solidTarget = findAttachTargetForOpen(vertexIndex);
        if (solidTarget >= 0) {
            attachOpenToSolid(vertexIndex, solidTarget);
        }
    } else {
        link.vertices[vertexIndex] = [mouseWorldPos[0], mouseWorldPos[1]];

        var openTarget = findAttachTarget(vertexIndex);
        if (openTarget >= 0) {
            attachSolidToOpen(vertexIndex, openTarget);
        }
    }

    solveJointedSystem(10);
    update();
}

function updateEdgePreview(mouseWorldPos) {
    var nearestNode = findNearestNode(mouseWorldPos[0], mouseWorldPos[1]);

    if (nearestNode >= 0 && nearestNode !== edgeStartNode) {
        edgePreviewEnd = link.vertices[nearestNode];
        edgeSnapNode = nearestNode;
    } else {
        edgePreviewEnd = [mouseWorldPos[0], mouseWorldPos[1]];
        edgeSnapNode = -1;
    }

    display();
}

function updateAddNodePreview(mouseWorldPos) {
    previewNodePosition = [mouseWorldPos[0], mouseWorldPos[1]];
    display();
}

function clearHoverPreviews() {
    var shouldRedraw = previewNodePosition !== null || edgePreviewEnd !== null;
    previewNodePosition = null;
    edgePreviewEnd = null;
    edgeSnapNode = -1;

    if (shouldRedraw) {
        display();
    }
}

function setButtonState(buttonSelector, isActive, labelText, iconText) {
    var button = $(buttonSelector);
    button.toggleClass('active', !!isActive);

    if (typeof labelText !== 'undefined') {
        button.find('.btn-label').text(labelText);
    }

    if (typeof iconText !== 'undefined') {
        button.find('.btn-icon').text(iconText);
    }
}

function setToolMode(mode) {
    currentTool = mode;
    clearPreviewState();

    _.each(TOOL_BUTTON_IDS, function(selector) {
        $(selector).removeClass('active');
    });

    $('#btn-' + mode).addClass('active');
    display();
}

function toggleBooleanDisplay(buttonSelector, currentValue, activeConfig, inactiveConfig) {
    var nextValue = !currentValue;
    setButtonState(
        buttonSelector,
        nextValue,
        nextValue ? activeConfig.label : inactiveConfig.label,
        nextValue ? activeConfig.icon : inactiveConfig.icon
    );
    return nextValue;
}

function requireSelectedVertex(message) {
    if (curVertex === undefined || curVertex < 0) {
        alert(message || 'Please select a node first by clicking on it.');
        return false;
    }
    return true;
}

function deleteCurrentSelection() {
    if (curVertex !== undefined && curVertex >= 0) {
        saveHistory();
        shiftNodeData(curVertex);
        link.removeVertex(curVertex);
        curVertex = undefined;
        update();
        return true;
    }

    if (curEdge !== undefined && curEdge >= 0) {
        saveHistory();
        link.removeEdge(curEdge);
        curEdge = undefined;
        update();
        return true;
    }

    return false;
}

function toggleFixedVertex() {
    if (!requireSelectedVertex()) return;

    var fixedIndex = link.fixed.indexOf(curVertex);
    saveHistory();

    if (fixedIndex >= 0) {
        link.fixed.splice(fixedIndex, 1);
    } else {
        link.fixed.push(curVertex);
    }

    update();
}

function toggleTraceForCurrentVertex() {
    if (!requireSelectedVertex()) return;

    if (curVertex in tracks) {
        delete tracks[curVertex];
    } else {
        tracks[curVertex] = [];
    }

    display();
}

function hasRecordedTracePoints() {
    var hasPoints = false;
    _.each(tracks, function(track) {
        if (track.length > 1) hasPoints = true;
    });
    return hasPoints;
}

function stopTracePlayback() {
    traceBackMode = false;
    traceBackIndex = {};
    traceDirection = -1;
    setButtonState('#btn-trace-back', false, 'Trace Back', '⏮');
}

function startTracePlayback() {
    traceBackMode = true;
    traceBackIndex = {};
    traceDirection = -1;
    attractor = undefined;
    setButtonState('#btn-trace-back', true, 'Playing', '⏸');
}

function toggleTracePlayback() {
    if (Object.keys(tracks).length === 0) {
        alert('No traces available. Enable tracing on a node first and let it move.');
        return;
    }

    if (!hasRecordedTracePoints()) {
        alert('Traces are empty or too short. Move the linkage to record a trace path first.');
        return;
    }

    if (traceBackMode) {
        stopTracePlayback();
    } else {
        startTracePlayback();
    }
}

function toggleGlobalNodeStyle() {
    nodeStyle = (nodeStyle === 'filled') ? 'open' : 'filled';
    setButtonState(
        '#btn-toggle-style',
        nodeStyle === 'open',
        nodeStyle === 'open' ? 'Open Nodes' : 'Filled Nodes',
        nodeStyle === 'open' ? '○' : '●'
    );
    display();
}

function toggleSelectedNodeOpenState() {
    if (!requireSelectedVertex()) return;

    if (curVertex in openNodes) {
        openNodes[curVertex] = !openNodes[curVertex];
    } else {
        openNodes[curVertex] = (nodeStyle === 'filled');
    }

    display();
}

function renameNode(nodeIndex) {
    var currentName = nodeNames[nodeIndex] || String.fromCharCode(65 + nodeIndex);
    var newName = prompt('Enter new name for node:', currentName);

    if (newName !== null && newName.trim() !== '') {
        nodeNames[nodeIndex] = newName.trim();
        display();
    }
}

function findNodeNearWorldPoint(wx, wy) {
    var nearestNode = -1;
    var minDist = PICK_DIST2;

    _.each(link.vertices, function(v, i) {
        var distanceSquared = link.vertexDist2(wx, wy, i);
        if (distanceSquared < minDist) {
            minDist = distanceSquared;
            nearestNode = i;
        }
    });

    return nearestNode;
}

function findEdgeNearWorldPoint(wx, wy) {
    var nearestEdge = -1;
    var minEdgeDistance = 15;

    _.each(link.edges, function(edge, edgeIndex) {
        var v1 = link.vertices[edge.i];
        var v2 = link.vertices[edge.j];
        var midpoint = numeric.mul(0.5, numeric.add(v1, v2));
        var dx = wx - midpoint[0];
        var dy = wy - midpoint[1];
        var distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < minEdgeDistance) {
            minEdgeDistance = distance;
            nearestEdge = edgeIndex;
        }
    });

    return nearestEdge;
}

function showEdgeContextMenu(edgeIndex, clientX, clientY) {
    window.currentEditEdge = edgeIndex;

    var edge = link.edges[edgeIndex];
    var currentName = edgeNames[edgeIndex] || ('E' + (edgeIndex + 1));
    var currentLength = edge.length ? edge.length : numeric.norm2(numeric.sub(link.vertices[edge.j], link.vertices[edge.i]));

    var menu = $('#edge-context-menu');
    var menuX = clientX;
    var menuY = clientY;
    var menuWidth = 220;
    var menuHeight = 200;

    if (menuX + menuWidth > window.innerWidth) {
        menuX = window.innerWidth - menuWidth - 10;
    }
    if (menuY + menuHeight > window.innerHeight) {
        menuY = window.innerHeight - menuHeight - 10;
    }

    $('#menu-edge-name').text(currentName);
    $('#menu-current-length').text(currentLength.toFixed(2));
    $('#menu-length-input').val('');

    menu.css({
        left: menuX + 'px',
        top: menuY + 'px',
        display: 'block'
    });

    setTimeout(function() {
        $('#menu-length-input').focus();
    }, 100);
}

function renameCurrentContextEdge() {
    $('#edge-context-menu').hide();

    var edgeIndex = window.currentEditEdge;
    if (!(edgeIndex >= 0 && edgeIndex < link.edges.length)) return;

    var currentName = edgeNames[edgeIndex] || ('E' + (edgeIndex + 1));
    var newName = prompt('Enter new name for edge:', currentName);

    if (newName !== null && newName.trim() !== '') {
        edgeNames[edgeIndex] = newName.trim();
        display();
    }
}

function setCurrentContextEdgeLength() {
    var edgeIndex = window.currentEditEdge;
    if (!(edgeIndex >= 0 && edgeIndex < link.edges.length)) return;

    var newLength = parseFloat($('#menu-length-input').val());

    if (isNaN(newLength) || newLength <= 0) {
        alert('❌ Please enter a valid positive number!');
        $('#menu-length-input').focus();
        return;
    }

    saveHistory();
    link.edges[edgeIndex].length = newLength;
    solveJointedSystem(10);
    update();
    $('#edge-context-menu').hide();
}

function handleCanvasDoubleClick(event) {
    var canvasPos = getCanvasPositionFromClient(event, event.currentTarget);
    var worldPos = screenToWorld(canvasPos.x, canvasPos.y);
    var nodeIndex = findNodeNearWorldPoint(worldPos[0], worldPos[1]);

    if (nodeIndex >= 0) {
        renameNode(nodeIndex);
        return;
    }

    var edgeIndex = findEdgeNearWorldPoint(worldPos[0], worldPos[1]);
    if (edgeIndex >= 0) {
        event.preventDefault();
        showEdgeContextMenu(edgeIndex, event.clientX, event.clientY);
    }
}

function handleCanvasMouseDown(event) {
    var canvasPos = getCanvasPosition(event, event.currentTarget);
    var picked;

    if (event.button === 2) {
        startPanDrag(canvasPos.x, canvasPos.y);
        return;
    }

    if (currentTool === 'add-edge') {
        picked = pick(canvasPos.x, canvasPos.y);
        if (picked.vertex >= 0) {
            edgeStartNode = picked.vertex;
            edgePreviewEnd = link.vertices[edgeStartNode];
            display();
        }
        return;
    }

    if (spacePressed) {
        startPanDrag(canvasPos.x, canvasPos.y);
        return;
    }

    if (currentTool !== 'select' && appMode !== 'play') return;

    picked = pick(canvasPos.x, canvasPos.y);

    if (picked.vertex >= 0) {
        beginVertexDrag(picked.vertex);
    } else if (picked.edge >= 0) {
        curEdge = picked.edge;
        curVertex = undefined;
        display();
    }
}

function handleCanvasMouseUp(event) {
    var canvasPos = getCanvasPosition(event, event.currentTarget);
    var picked;

    if (currentTool === 'add-edge' && edgeStartNode >= 0) {
        picked = pick(canvasPos.x, canvasPos.y);

        if (picked.vertex >= 0 && picked.vertex !== edgeStartNode) {
            var edge = makeEdge(edgeStartNode, picked.vertex);
            var existingEdgeIndex = link.getEdge(edge);

            saveHistory();
            if (existingEdgeIndex >= 0) {
                link.removeEdge(existingEdgeIndex);
            } else {
                link.edges.push(edge);
            }
            update();
        }

        clearEdgeCreationState();
        display();
        return;
    }

    if (isPanDragging) {
        stopPanDrag();
        return;
    }

    if (isDragging) {
        stopNodeDrag(true);
        return;
    }

    if (event.button === 2) return;

    if (event.shiftKey) {
        mouseright(canvasPos.x, canvasPos.y);
    } else if (event.altKey) {
        mousemiddle(canvasPos.x, canvasPos.y);
    } else {
        mouseleft(canvasPos.x, canvasPos.y);
    }
}

function handleCanvasMouseMove(event) {
    var canvasPos = getCanvasPosition(event, event.currentTarget);
    var worldPos = screenToWorld(canvasPos.x, canvasPos.y);

    if (isPanDragging) {
        panX += canvasPos.x - lastPanMouseX;
        panY += canvasPos.y - lastPanMouseY;
        lastPanMouseX = canvasPos.x;
        lastPanMouseY = canvasPos.y;
        display();
        return;
    }

    if (isDragging && dragVertex >= 0) {
        moveDraggedVertex([worldPos[0], worldPos[1]]);
        return;
    }

    if (currentTool === 'add-edge' && edgeStartNode >= 0) {
        updateEdgePreview([worldPos[0], worldPos[1]]);
        return;
    }

    if (currentTool === 'add-node') {
        updateAddNodePreview([worldPos[0], worldPos[1]]);
        return;
    }

    if (previewNodePosition !== null) {
        previewNodePosition = null;
        display();
    }
}

function handleCanvasMouseLeave() {
    clearHoverPreviews();
    stopPanDrag();
    stopNodeDrag(true);
}

function handleCanvasWheel(event) {
    event.preventDefault();
    var zoomFactor = event.originalEvent.deltaY < 0 ? 1.2 : 0.833;
    scale = Math.max(0.1, Math.min(10, scale * zoomFactor));
    display();
}

function handleWindowKeyDown(event) {
    var panSpeed = 20;

    if (event.key === 'Escape' && currentTool === 'add-edge') {
        clearEdgeCreationState();
        display();
    }

    if (event.key === ' ') {
        event.preventDefault();
        spacePressed = true;
        return;
    }

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

    if (event.keyCode === 8 || event.keyCode === 46) {
        event.preventDefault();
        deleteCurrentSelection();
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        event.preventDefault();
        undo();
    }

    if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.shiftKey && event.key === 'z'))) {
        event.preventDefault();
        redo();
    }
}

function handleWindowKeyUp(event) {
    if (event.key !== ' ') return;

    event.preventDefault();
    spacePressed = false;

    if (isPanDragging) {
        stopPanDrag();
    }
}

function toggleAppMode() {
    if (appMode === 'edit') {
        appMode = 'play';
        setButtonState('#btn-mode-toggle', false, 'PLAY MODE', '▶️');
        $('.edit-mode-section').hide();
        $('.play-mode-section').show();
        currentTool = 'select';
        clearEdgeCreationState();
        return;
    }

    appMode = 'edit';
    setButtonState('#btn-mode-toggle', false, 'EDIT MODE', '✏️');
    $('.edit-mode-section').show();
    $('.play-mode-section').hide();
    setToolMode('select');
}

function loadPresetFromButton(button) {
    var presetIndex = parseInt($(button).attr('data-preset'), 10);

    if (!(presetIndex >= 0 && presetIndex < PRESETS.length)) return;

    saveHistory();
    reset();
    link = PRESETS[presetIndex].copy();
    update();
}

$(function() {
    $('#canvas').mousedown(handleCanvasMouseDown);
    $('#canvas').mouseup(handleCanvasMouseUp);
    $('#canvas').mousemove(handleCanvasMouseMove);
    $('#canvas').mouseleave(handleCanvasMouseLeave);
    $('#canvas').contextmenu(function(event) {
        event.preventDefault();
        return false;
    });
    $('#canvas').dblclick(handleCanvasDoubleClick);
    $('#canvas').on('wheel', handleCanvasWheel);

    $(window).keydown(handleWindowKeyDown);
    $(window).keyup(handleWindowKeyUp);
    $(window).resize(function() {
        resized = true;
    });

    $('#btn-zoom-in').click(function() {
        scale = Math.min(10, scale * 1.2);
        display();
    });

    $('#btn-zoom-out').click(function() {
        scale = Math.max(0.1, scale / 1.2);
        display();
    });

    $('#btn-mode-toggle').click(toggleAppMode);
    $('#btn-undo').click(undo);
    $('#btn-redo').click(redo);

    $('#btn-select').click(function() { setToolMode('select'); });
    $('#btn-add-node').click(function() { setToolMode('add-node'); });
    $('#btn-add-edge').click(function() { setToolMode('add-edge'); });
    $('#btn-label').click(function() {
        setToolMode('label');
        alert('Label feature: Double-click on any node or edge to rename it!');
    });
    $('#btn-attractor').click(function() {
        setToolMode('attractor');
        if (!requireSelectedVertex('Please select a node first, then shift-click to place attractor.')) {
            return;
        }
    });

    $('#btn-save-xml').click(saveLinkageAsXML);
    $('#btn-load-xml').click(function() {
        $('#xml-file-input').click();
    });
    $('#xml-file-input').change(function(event) {
        var file = event.target.files[0];
        if (!file) return;

        loadLinkageFromXML(file);
        $(this).val('');
    });

    $('#btn-fix').click(toggleFixedVertex);
    $('#btn-trace').click(toggleTraceForCurrentVertex);
    $('#btn-trace-back').click(toggleTracePlayback);
    $('#btn-trace-loop').click(function() {
        traceLoopMode = toggleBooleanDisplay(
            '#btn-trace-loop',
            traceLoopMode,
            { label: 'Loop Mode', icon: '🔁' },
            { label: 'Play Once', icon: '▶' }
        );
    });

    $('#btn-delete').click(deleteCurrentSelection);
    $('#btn-clear').click(function() {
        if (!confirm('Clear everything? This cannot be undone.')) return;

        saveHistory();
        reset();
        link.clear();
        update();
    });

    $('.preset-btn').click(function() {
        loadPresetFromButton(this);
    });

    $('#btn-toggle-labels').click(function() {
        showLabels = toggleBooleanDisplay(
            '#btn-toggle-labels',
            showLabels,
            { label: 'Show Labels' },
            { label: 'Hide Labels' }
        );
        display();
    });

    $('#btn-toggle-lengths').click(function() {
        showEdgeLengths = toggleBooleanDisplay(
            '#btn-toggle-lengths',
            showEdgeLengths,
            { label: 'Hide Lengths' },
            { label: 'Show Lengths' }
        );
        display();
    });

    $('#btn-toggle-style').click(toggleGlobalNodeStyle);
    $('#btn-toggle-node-open').click(toggleSelectedNodeOpenState);

    $('#menu-set-length-btn').click(setCurrentContextEdgeLength);
    $('#menu-rename-btn').click(renameCurrentContextEdge);
    $('#menu-cancel-btn').click(function() {
        $('#edge-context-menu').hide();
    });
    $('#menu-length-input').keypress(function(event) {
        if (event.which === 13) {
            setCurrentContextEdgeLength();
        }
    });
    $(document).click(function(event) {
        if (!$(event.target).closest('#edge-context-menu').length) {
            $('#edge-context-menu').hide();
        }
    });
    $('#edge-context-menu').click(function(event) {
        event.stopPropagation();
    });

    update();
    idle();
});
