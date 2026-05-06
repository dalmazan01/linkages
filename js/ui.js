/**
 * ui.js
 * Canvas, keyboard, and toolbar event wiring.
 */

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

		// Space+click for panning
		if (spacePressed) {
			isPanDragging = true;
			lastPanMouseX = x;
			lastPanMouseY = y;
			return;
		}

		// Start constrained drag ONLY in select/play mode.
		// Other tools (add-node/add-edge/delete/label) rely on mouseup handlers.
		if (currentTool === 'select' || appMode === 'play') {
			picked = pick(x, y); // pick() already accounts for scale
			if (picked.vertex >= 0) {
				
				// BUG FIX: Check if this node OR its attached partner is pinned
				var isNodeFixed = link.fixed.indexOf(picked.vertex) >= 0;
				var group = getDragGroup(picked.vertex);
				if (group) {
					if (link.fixed.indexOf(parseInt(group.solid, 10)) >= 0 || 
					    link.fixed.indexOf(parseInt(group.open, 10)) >= 0) {
						isNodeFixed = true;
					}
				}
				// Don't drag if the node (or its partner) is fixed
				if (isNodeFixed) {
					return;
				}
                
				isDragging = true;
				dragVertex = picked.vertex;
				curVertex = picked.vertex;
				display();
			} else if (picked.edge >= 0) {
				curEdge = picked.edge;
				curVertex = undefined;
				display();
			}
		}
	});

	// Mouse up - stop dragging or handle clicks
	$('#canvas').mouseup(function(event) {
		var offset = $(this).offset();
		var x = event.pageX - offset.left;
		var y = event.pageY - offset.top;

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

		// Drag attached/free nodes
		if (isDragging && dragVertex >= 0) {
			var w = screenToWorld(x, y);
			var mousePos = [w[0], w[1]];
			var i = dragVertex;

			curVertex = i;

			var group = getDragGroup(i);

			if (group) {
				// BUG FIX: Check if either node in the attached group is pinned
				var isGroupFixed = link.fixed.indexOf(parseInt(group.solid, 10)) >= 0 || 
				                   link.fixed.indexOf(parseInt(group.open, 10)) >= 0;

				if (isGroupFixed) {
					// The group contains a pinned node! 
					// Force the drag to stop immediately so it locks securely in place.
					isDragging = false;
					dragVertex = -1;
				} else {
					// Neither is pinned, move BOTH together freely
					link.vertices[group.open] = [mousePos[0], mousePos[1]];
					link.vertices[group.solid] = [mousePos[0], mousePos[1]];
				}
			}
			else if (isOpenNode(i)) {
				link.vertices[i] = [mousePos[0], mousePos[1]];
				var target = findAttachTargetForOpen(i);
				if (target >= 0) {
					attachOpenToSolid(i, target);
				}
			}
			else {
				link.vertices[i] = mousePos;
				target = findAttachTarget(i);
				if (target >= 0) {
					attachSolidToOpen(i, target);
				}
			}

			solveJointedSystem(10);
			update();
		}
		// Edge creation preview
		else if (currentTool === 'add-edge' && edgeStartNode >= 0) {
			w = screenToWorld(x, y);
			var wx = w[0];
			var wy = w[1];

			var nearestNode = findNearestNode(wx, wy);

			if (nearestNode >= 0 && nearestNode !== edgeStartNode) {
				edgePreviewEnd = link.vertices[nearestNode];
				edgeSnapNode = nearestNode;
			} else {
				edgePreviewEnd = [wx, wy];
				edgeSnapNode = -1;
			}
			display();
		}

		// Preview node in add-node mode
		else if (currentTool === 'add-node') {
			w = screenToWorld(x, y);
			previewNodePosition = [w[0], w[1]];
			display();
		}

		else {
			if (previewNodePosition !== null) {
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
			var currentName = nodeNames[nodeIndex] || '?';
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
			var dist = Math.sqrt(dx * dx + dy * dy);
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
			currentName = edgeNames[edgeIndex] || ('E' + (edgeIndex + 1));
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

		// 1. Get the mouse position relative to the canvas
		var rect = this.getBoundingClientRect();
		var mouseX = event.originalEvent.clientX - rect.left;
		var mouseY = event.originalEvent.clientY - rect.top;

		// 2. Determine the zoom multiplier
		var delta = event.originalEvent.deltaY < 0 ? 1.2 : 0.833; // 1/1.2 ~= 0.833
		var oldScale = scale;
		var newScale = Math.max(0.1, Math.min(10, scale * delta));

		// 3. Adjust pan to keep the world point under the cursor stationary
		if (oldScale !== newScale) {
			var ratio = newScale / oldScale;
			
			panX = mouseX - (mouseX - panX) * ratio;
			panY = mouseY - (mouseY - panY) * ratio;
			
			scale = newScale;
			display();
		}
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
				shiftNodeData(curVertex); // Use our new helper
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

		// Ctrl+Z / Cmd+Z - undo
		if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
			event.preventDefault();
			undo();
		}

		// Ctrl+Y / Cmd+Y or Ctrl+Shift+Z / Cmd+Shift+Z - redo
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

	// Helper function for button zooming into the center of the canvas
	function zoomCentered(delta) {
		var canvas = $('#canvas')[0];
		var centerX = canvas.width / 2;
		var centerY = canvas.height / 2;

		var oldScale = scale;
		var newScale = Math.max(0.1, Math.min(10, scale * delta));

		if (oldScale !== newScale) {
			var ratio = newScale / oldScale;
			panX = centerX - (centerX - panX) * ratio;
			panY = centerY - (centerY - panY) * ratio;
			scale = newScale;
			display();
		}
	}

	// Zoom buttons (scale around center of canvas)
	$('#btn-zoom-in').click(function() {
		zoomCentered(1.2);
	});

	$('#btn-zoom-out').click(function() {
		zoomCentered(0.833);
	});

	$('#btn-theme-toggle').click(function() {
		const btn = this;
	
		const isDark = currentTheme === 'dark';

		currentTheme = isDark ? 'light' : 'dark';
	
		document.body.setAttribute('data-theme', currentTheme);
	
		btn.classList.toggle("active", currentTheme ==="dark");

		display();
	});

	$('#btn-sidebar-toggle').click(function() {
		document.body.classList.toggle('sidebar-collapsed');
	
		if (document.body.classList.contains('sidebar-collapsed')) {
			$(this).text('☰');
			$(this).attr('title', 'Expand sidebar');
		} else {
			$(this).text('✕');
			$(this).attr('title', 'Collapse sidebar');
		}
	
		resized = true;
		display();
	});

	// Initialize the theme when the page loads
	document.body.setAttribute('data-theme', currentTheme);

	const btn = document.getElementById("btn-theme-toggle");

	if (currentTheme === "dark") {
		btn.classList.add("active");
	}

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

	function setToolMode(mode) {
		currentTool = mode;

		if (mode !== 'select-multiple') {
			selectedVertices = [];
		}
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

	$('#btn-select-multi').click(function() {
		setToolMode('select-multiple');
	});

	$('#btn-label').click(function() {
		setToolMode('label');
		alert('Label feature: Double-click on any node or edge to rename it!');
	});

	$('#btn-save-xml').click(function() {
		saveLinkageAsXML();
	});

	// Load - open hidden file input
	$('#btn-load-xml').click(function() {
		$('#xml-file-input').click();
	});

	// File input change -> parse XML
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
			// Toggle trace for selected vertex
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
		if (selectedVertices.length > 0) {
			// BULK DELETE
			saveHistory();
			// Sort descending to avoid index shifting issues during deletion
			var sorted = selectedVertices.slice().sort(function(a, b){ return b - a; });
			_.each(sorted, function(v) {
				shiftNodeData(v);
				link.removeVertex(v);
			});
			selectedVertices = [];
			curVertex = undefined;
			update();
		} else if (curVertex !== undefined && curVertex >= 0) {
			// Delete single vertex
			saveHistory();
			shiftNodeData(curVertex); 
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
            
			// NEW FIX: Restore the global node names and styles if the preset has them
			nodeNames = $.extend({}, PRESETS[presetIndex].presetNodeNames || {});
			openNodes = $.extend({}, PRESETS[presetIndex].presetOpenNodes || {});
            
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

	// Edge length toggle
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

	// Toggle individual node open/closed
	$('#btn-toggle-node-open').click(function() {
		if (selectedVertices.length > 0) {
			// BULK TOGGLE
			_.each(selectedVertices, function(v) {
				if (v in openNodes) {
					openNodes[v] = !openNodes[v];
				} else {
					openNodes[v] = (nodeStyle === 'filled');
				}
			});
			display();
		} else if (curVertex !== undefined && curVertex >= 0) {
			// Single toggle
			if (curVertex in openNodes) {
				openNodes[curVertex] = !openNodes[curVertex];
			} else {
				openNodes[curVertex] = (nodeStyle === 'filled');
			}
			display();
		} else {
			alert('Please select a node first.');
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
				solveJointedSystem(10);
				update();
				$('#edge-context-menu').hide();
			} else {
				alert('Please enter a valid positive number.');
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