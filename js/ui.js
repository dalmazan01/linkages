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

		// Middle or right-click drag for panning
		if (event.button === 1 || event.button === 2) {
			isPanDragging = true;
			lastPanMouseX = x;
			lastPanMouseY = y;
			if (event.button === 1) event.preventDefault();
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
		if (currentTool === 'select-multiple') {
			var picked = pick(x, y);
			// Don't commit to group-drag or marquee yet — wait to see if the user
			// actually drags. A plain click will toggle the node in/out of the selection.
			pendingMarqueeStart = {x: x, y: y};
			pendingMarqueePickedVertex = picked.vertex; // may be -1 if empty space
			display();
			return;
		}

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

		// Pending marquee that never became a real drag = plain click
		if (pendingMarqueeStart) {
			pendingMarqueeStart = null;
			var clickedVertex = pendingMarqueePickedVertex;
			pendingMarqueePickedVertex = -1;
			if (clickedVertex >= 0) {
				// Toggle the clicked node in/out of the selection
				var idx = selectedVertices.indexOf(clickedVertex);
				if (idx >= 0) {
					selectedVertices.splice(idx, 1);
				} else {
					selectedVertices.push(clickedVertex);
				}
			} else {
				// Clicked empty space — clear selection
				selectedVertices = [];
			}
			display();
			return;
		}

		// Finish marquee selection
		if (isMarqueeSelecting) {
			isMarqueeSelecting = false;
			// Convert marquee screen rect to world coords
			var x1 = Math.min(marqueeStart.x, marqueeEnd.x);
			var x2 = Math.max(marqueeStart.x, marqueeEnd.x);
			var y1 = Math.min(marqueeStart.y, marqueeEnd.y);
			var y2 = Math.max(marqueeStart.y, marqueeEnd.y);
			var w1 = screenToWorld(x1, y1);
			var w2 = screenToWorld(x2, y2);
			selectedVertices = [];
			_.each(link.vertices, function(v, i) {
				if (v[0] >= w1[0] && v[0] <= w2[0] && v[1] >= w1[1] && v[1] <= w2[1]) {
					selectedVertices.push(i);
				}
			});
			marqueeStart = null;
			marqueeEnd = null;
			display();
			return;
		}

		// End group drag
		if (isGroupDragging) {
			isGroupDragging = false;
			groupDragLastPos = null;
			update();
			return;
		}

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

		// Promote a pending marquee start into a real marquee once the mouse moves
		if (pendingMarqueeStart) {
			var dx = x - pendingMarqueeStart.x;
			var dy = y - pendingMarqueeStart.y;
			if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
				var origin = pendingMarqueeStart;
				var v = pendingMarqueePickedVertex;
				pendingMarqueeStart = null;
				pendingMarqueePickedVertex = -1;
				if (v >= 0 && selectedVertices.indexOf(v) >= 0) {
					// Dragging from an already-selected node — start group drag
					var w = screenToWorld(x, y);
					isGroupDragging = true;
					groupDragLastPos = {x: w[0], y: w[1]};
				} else {
					// Dragging from empty space or unselected node — start marquee
					selectedVertices = [];
					isMarqueeSelecting = true;
					marqueeStart = {x: origin.x, y: origin.y};
					marqueeEnd = {x: x, y: y};
				}
				display();
			}
			return;
		}

		// Marquee selection update
		if (isMarqueeSelecting) {
			marqueeEnd = {x: x, y: y};
			display();
			return;
		}

		// Group drag - move all selected vertices together
		if (isGroupDragging && selectedVertices.length > 0) {
			var w = screenToWorld(x, y);
			var dx = w[0] - groupDragLastPos.x;
			var dy = w[1] - groupDragLastPos.y;
			groupDragLastPos = {x: w[0], y: w[1]};
			_.each(selectedVertices, function(vi) {
				if (link.fixed.indexOf(vi) < 0) {
					link.vertices[vi] = [link.vertices[vi][0] + dx, link.vertices[vi][1] + dy];
				}
			});
			solveJointedSystem(10);
			update();
			return;
		}

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
		if (isMarqueeSelecting) {
			isMarqueeSelecting = false;
			marqueeStart = null;
			marqueeEnd = null;
			display();
		}
		if (pendingMarqueeStart) {
			pendingMarqueeStart = null;
			pendingMarqueePickedVertex = -1;
			display();
		}
		if (isGroupDragging) {
			isGroupDragging = false;
			groupDragLastPos = null;
			update();
		}
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
		var offset = $(this).offset();
		var sx = event.pageX - offset.left;
		var sy = event.pageY - offset.top;

		var hits = pickAllVertices(sx, sy);

		if (hits.length > 1) {
			showNodePicker(hits, event.pageX, event.pageY);
			return;
		}
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
			$('#menu-color-input').val(edgeColors[edgeIndex] || '#ff7700');

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
			var tag = document.activeElement && document.activeElement.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA') return;
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

		// Ctrl+C / Cmd+C - copy selection
		if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
			var tag = document.activeElement && document.activeElement.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA') return;
			event.preventDefault();
			var copied = copySelection();
			if (copied) refreshCopyPasteButtons();
		}

		// Ctrl+V / Cmd+V - paste
		if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
			var tag = document.activeElement && document.activeElement.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA') return;
			event.preventDefault();
			pasteClipboard();
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

	$('#btn-home').click(function() {
		if (link.vertices.length === 0) {
			// No nodes — just reset to initial state
			scale = 1.0;
			panX = 0;
			panY = 0;
			display();
			return;
		}

		// Find bounding box of all nodes
		var xs = link.vertices.map(function(v) { return v[0]; });
		var ys = link.vertices.map(function(v) { return v[1]; });
		var minX = Math.min.apply(null, xs);
		var maxX = Math.max.apply(null, xs);
		var minY = Math.min.apply(null, ys);
		var maxY = Math.max.apply(null, ys);

		// Center point of all nodes
		var centerX = (minX + maxX) / 2;
		var centerY = (minY + maxY) / 2;

		// Reset zoom to initial scale (1.0)
		scale = 1.0;

		// Pan so that the center of all nodes lands at the center of the canvas
		var canvas = $('#canvas')[0];
		panX = canvas.width  / 2 - centerX * scale;
		panY = canvas.height / 2 - centerY * scale;

		display();
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

	$('#btn-save-svg').click(function() {
		saveLinkageAsSVG();
	});

	// Load - open hidden file input
	$('#btn-load-xml').click(function() {
		$('#xml-file-input').click();
	});

	// File input change -> parse XML
	$('#xml-file-input').change(function(event) {
		var file = event.target.files[0];
		if (file) {
			// Check extension to ensure it's valid
			var ext = file.name.split('.').pop().toLowerCase();
			if (ext === 'xml' || ext === 'svg') {
				loadLinkageFromXML(file);
			} else {
				alert('Please select a valid .xml or .svg file generated by this simulator.');
			}
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

	function startTracePlayback() {
		var hasTraces = Object.keys(tracks).length > 0;
		if (!hasTraces) {
			alert('No traces available. Enable tracing on a node first and let it move.');
			return;
		}
		var hasPoints = false;
		_.each(tracks, function(track) {
			if (track.length > 1) hasPoints = true;
		});
		if (!hasPoints) {
			alert('Traces are empty or too short. Move the linkage to record a trace path first.');
			return;
		}
		traceBackMode = true;
		traceBackIndex = {};
		traceDirection = -1;
		attractor = undefined;
		$('#btn-trace-play').addClass('active');
		$('#btn-trace-stop').prop('disabled', false);
	}

	function stopTracePlayback() {
		traceBackMode = false;
		traceBackIndex = {};
		traceDirection = -1;
		$('#btn-trace-play').removeClass('active');
		$('#btn-trace-stop').prop('disabled', true);
	}

	$('#btn-trace-play').click(function() {
		if (!traceBackMode) {
			startTracePlayback();
		}
	});

	$('#btn-trace-stop').click(function() {
		stopTracePlayback();
	});

	// Toggle loop mode
	$('#btn-trace-loop').click(function() {
		traceLoopMode = !traceLoopMode;
		if (traceLoopMode) {
			$(this).addClass('active');
			$(this).find('.btn-label').text('Loop');
			$(this).find('.btn-icon').text('🔁');
		} else {
			$(this).removeClass('active');
			$(this).find('.btn-label').text('Once');
			$(this).find('.btn-icon').text('▶¹');
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

	// ── Copy / Paste buttons ──────────────────────────────────────────────────
	function refreshCopyPasteButtons() {
		var hasSelection = selectedVertices.length > 0 ||
		                   (curVertex !== undefined && curVertex >= 0);
		$('#btn-copy').prop('disabled', !hasSelection).css('opacity', hasSelection ? '1' : '0.4');
		$('#btn-paste').prop('disabled', !clipboard).css('opacity', clipboard ? '1' : '0.4');
	}

	// Expose so keyboard handler can call it
	window.refreshCopyPasteButtons = refreshCopyPasteButtons;

	$('#btn-copy').click(function() {
		var copied = copySelection();
		if (copied) refreshCopyPasteButtons();
	});

	$('#btn-paste').click(function() {
		pasteClipboard();
		refreshCopyPasteButtons();
	});

	// Update copy button state whenever selection changes
	$(document).on('selectionChanged', refreshCopyPasteButtons);

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

	$('#menu-color-input').on('input', function() {
		var edgeIndex = window.currentEditEdge;
		if (edgeIndex >= 0 && edgeIndex < link.edges.length) {
			edgeColors[edgeIndex] = $(this).val();
			display();
		}
	});

	$('#menu-reset-color-btn').click(function() {
		var edgeIndex = window.currentEditEdge;
		if (edgeIndex >= 0 && edgeIndex < link.edges.length) {
			delete edgeColors[edgeIndex];
			$('#menu-color-input').val('#ff7700');
			display();
		}
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


	//Click anywhere else to close node list pop up
	$(document).click(function(e) {
		if (!$(e.target).closest('#node-picker-menu').length) {
	
			if ($('#node-picker-menu').is(':visible')) {
				curVertex = undefined;
				curEdge = undefined;
				display();
			}
	
			$('#node-picker-menu').hide();
		}
	});

	//prevents pop up closing if clicking inside the pop-up
	$('#node-picker-menu').click(function(e) {
		e.stopPropagation();
	});

	update();
	idle();
});