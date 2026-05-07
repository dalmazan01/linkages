/**
 * rendering.js
 * Rendering constants and canvas drawing logic.
 * Split from the original monolithic main.js for readability.
 */

var VELOCITY_MAG = 1;

var VERTEX_SIZE = 10;
var LINE_WIDTH = 4;
var ANGLE_DIST = 25;
var VECTOR_LENGTH = 50;
var PICK_DIST2 = 100;
var ATTRACT_DIST2 = 25;
var TRACK_LENGTH = 1024;
var TRACK_DIST2 = 4;

var OCCUPIED_OPEN_RING_RADIUS = 9;   // bigger than filled node radius (5)
var OCCUPIED_OPEN_RING_WIDTH = 2;

function normalized(v) {
    return numeric.div(v, numeric.norm2(v));
}

function strokeLine(c, u, v) {
    c.beginPath();
    c.moveTo(u[0], u[1]);
    c.lineTo(v[0], v[1]);
    c.stroke();
}

function fillPoint(c, v, style, nodeIndex) {
    // Use individual node style if specified, otherwise use global nodeStyle
    var drawStyle = style || nodeStyle;
    
    // Check if the current node is pinned (fixed)
    var isFixed = (nodeIndex !== undefined && link.fixed.indexOf(nodeIndex) !== -1);

    if (drawStyle === 'open') {
        // If this open node currently contains a solid node,
        // draw a larger ring around it with a small gap.
        var radius = (nodeIndex !== undefined && openToSolid[nodeIndex] !== undefined)
            ? OCCUPIED_OPEN_RING_RADIUS
            : VERTEX_SIZE / 2;

        c.beginPath();
        c.lineWidth = (nodeIndex !== undefined && openToSolid[nodeIndex] !== undefined)
            ? OCCUPIED_OPEN_RING_WIDTH
            : 2;

        // Draw a square if fixed, otherwise a circle
        if (isFixed) {
            c.rect(v[0] - radius, v[1] - radius, radius * 2, radius * 2);
        } else {
            c.arc(v[0], v[1], radius, 0, 2 * Math.PI);
        }
        c.stroke();
    } else {
        // Draw filled shape
        c.beginPath();
        var radius = VERTEX_SIZE / 2;

        // Draw a square if fixed, otherwise a circle
        if (isFixed) {
            c.rect(v[0] - radius, v[1] - radius, radius * 2, radius * 2);
        } else {
            c.arc(v[0], v[1], radius, 0, 2 * Math.PI);
        }
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

function drawGrid(c, width, height) {
    c.save();

    // Background
    c.fillStyle = currentTheme === 'dark' ? '#111111' : '#eeeeee';
    c.fillRect(0, 0, width, height);

    // Determine dynamic grid size based on the current scale
    var baseGridSize = 75; 
    
    // Find the power of 2 to scale the grid by, so it subdivides cleanly
    var scaleLevel = Math.floor(Math.log(scale) / Math.log(2));
    
    // World spacing adjusts depending on zoom level to "add more grids"
    var worldBigGrid = baseGridSize / Math.pow(2, scaleLevel);
    var worldSmallGrid = worldBigGrid / 5;

    // Multiply by current scale to get actual screen pixels
    var screenBigGrid = worldBigGrid * scale;
    var screenSmallGrid = worldSmallGrid * scale;

    // Colors
    var smallGridColor = currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
    var bigGridColor = currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.18)';

    // Helper function to draw infinite grid lines that pan with the camera
    function drawGridLines(spacing, color) {
        c.strokeStyle = color;
        c.lineWidth = 1;
        c.beginPath();

        // Calculate starting offset based on pan (so the grid moves when dragging)
        var offsetX = panX % spacing;
        var offsetY = panY % spacing;
        
        // Fix negative modulo in JavaScript so panning up/left works smoothly
        if (offsetX < 0) offsetX += spacing;
        if (offsetY < 0) offsetY += spacing;

        // Vertical lines
        for (var x = offsetX; x <= width; x += spacing) {
            c.moveTo(x, 0);
            c.lineTo(x, height);
        }
        // Horizontal lines
        for (var y = offsetY; y <= height; y += spacing) {
            c.moveTo(0, y);
            c.lineTo(width, y);
        }
        c.stroke();
    }

    // Draw the grids
    drawGridLines(screenSmallGrid, smallGridColor);
    drawGridLines(screenBigGrid, bigGridColor);

    c.restore();
}

function display() {
    var num = numeric;
    var canvas = $('#canvas');
    
    // BUG FIX 1: Calculate the exact remaining screen space to prevent cutoff on large monitors
    var offsetTop = canvas.offset() ? canvas.offset().top : 0;
    var newHeight = window.innerHeight - offsetTop;
    
    // Force the CSS height to stretch to the exact bottom of the monitor
    canvas.css('height', newHeight + 'px');
    
    // Sync the internal rendering resolution to the stretched CSS size
    canvas.attr('width', canvas.width());
    canvas.attr('height', canvas.height());

    var c = canvas[0].getContext('2d');
    
    // BUG FIX 2: 'canvas' is a jQuery object, so 'canvas.width' returned a function, not a number!
    // We must use canvas[0].width and canvas[0].height to get the real pixel values.
    c.clearRect(0, 0, canvas[0].width, canvas[0].height);

    drawGrid(c, canvas[0].width, canvas[0].height);

    syncAttachedVertices();

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
        else if (edgeColors[k]) c.strokeStyle = edgeColors[k];
        else c.strokeStyle = colorString(1, 0.3, 0);
        strokeLine(c, link.vertices[e.i], link.vertices[e.j]);
        
        // Draw edge label (use custom name if available)
        if (showLabels) {
            var midpoint = numeric.mul(0.5, numeric.add(link.vertices[e.i], link.vertices[e.j]));
            c.fillStyle = currentTheme === 'dark' ? colorString(1, 1, 0.5) : colorString(0, 0.6, 0); // Yellow dark / Green light
            c.font = '10px Arial';
            var edgeLabel = edgeNames[k] || ('E' + (k + 1));
            c.fillText(edgeLabel, midpoint[0] + 5, midpoint[1] - 5);
        }

        if (showEdgeLengths) {
            var u = link.vertices[e.i];
            var v2 = link.vertices[e.j];
            var mid = numeric.mul(0.5, numeric.add(u, v2));
            var len = numeric.norm2(numeric.sub(v2, u));
            c.fillStyle = currentTheme === 'dark' ? colorString(1, 1, 0.5) : colorString(0, 0.6, 0);
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
    _.each(tracks, function(track)
    {
        c.beginPath();
        _.each(track, function(v, i)
        {
            if (i == 0) c.moveTo(v[0], v[1]);
            else c.lineTo(v[0], v[1]);
        });
        c.stroke();
    });

    if (!(view & 1))
    {
        var n = allVelocities.length;
        _.each(allVelocities, function(velocities, k)
        {
            velocities = num.mul(VECTOR_LENGTH, velocities);
            c.strokeStyle = colorString(0, (k + 1) / n, 0);
            _.each(link.vertices, function(v, i) {
                strokeLine(c, v, num.add(v, velocities[i]));
            });
        });
    }

    _.each(link.vertices, function(v, i) {
        var skipNormalFill = false;
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
                    if (!skipNormalFill) {
                        fillPoint(c, v, thisNodeStyle);
                    }
                    
                    // Middle glow layer
                    c.shadowBlur = 20;
                    c.shadowColor = '#00ff00';
                    if (!skipNormalFill) {
                        fillPoint(c, v, thisNodeStyle);
                    }
                    
                    // Inner bright core
                    c.shadowBlur = 10;
                    c.shadowColor = '#00ff00';
                    if (!skipNormalFill) {
                        fillPoint(c, v, thisNodeStyle);
                    }
                    
                    c.restore();
                    
                    // Skip the normal fillPoint below
                    skipNormalFill = true;

                    // Add glow effect
                    c.shadowBlur = 40;
                    c.shadowColor = 'rgba(0, 255, 0, 1)';
                } else if (i === edgeSnapNode) {
                    // Hover node - cyan
                    c.fillStyle = colorString(0, 1, 1);
                    c.strokeStyle = colorString(0, 1, 1);
                } else {
                    // Respect the theme during add-edge mode
                    if (currentTheme === 'light') {
                        c.fillStyle = colorString(0, 0, 0); // black
                        c.strokeStyle = colorString(0, 0, 0);
                    } else {
                        c.fillStyle = colorString(1, 1, 1); // white
                        c.strokeStyle = colorString(1, 1, 1);
                    }
                }
            } else if (i == curVertex || selectedVertices.indexOf(i) >= 0) {
                // NEW: Highlight blue if it's the curVertex OR in the selectedVertices array
                c.fillStyle = colorString(0, 0.5, 1);
                c.strokeStyle = colorString(0, 0.5, 1);
            }
            else{
                if (currentTheme === 'light') {
                    c.fillStyle = colorString(0, 0, 0);
                    c.strokeStyle = colorString(0, 0, 0);
                } else {
                    c.fillStyle = colorString(1, 1, 1);
                    c.strokeStyle = colorString(1, 1, 1);
                }
            }
            
            if (thisNodeStyle === 'open') {
                c.lineWidth = 2;
            }
            
            fillPoint(c, v, thisNodeStyle, i);
            // Reset shadow after drawing
            c.shadowBlur = 0;

            // Draw fixed point indicator (pin icon)
            //if (isFixed && showLabels) {
            //    c.fillStyle = colorString(1, 0.2, 0.2); // Red for fixed
            //    c.font = 'bold 16px Arial';
            //    c.fillText('📍', v[0] + 8, v[1] - 8);
            //}
            
            if (showLabels) {
                if (currentTheme === 'light') {
                    c.fillStyle = colorString(0, 0, 0); // Black labels
                } else {
                    c.fillStyle = colorString(1, 1, 1); // White labels
                }
                c.font = 'bold 12px Arial';
            
                // Base name only
                var baseName = nodeNames[i] || '?';
            
                // Automatically add * for open nodes
                var label = (thisNodeStyle === 'open') ? (baseName + '*') : baseName;
            
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
    // Draw marquee selection rectangle (in screen space, before restore)
    if (isMarqueeSelecting && marqueeStart && marqueeEnd) {
        c.restore(); // temporarily exit world transform
        var mx = Math.min(marqueeStart.x, marqueeEnd.x);
        var my = Math.min(marqueeStart.y, marqueeEnd.y);
        var mw = Math.abs(marqueeEnd.x - marqueeStart.x);
        var mh = Math.abs(marqueeEnd.y - marqueeStart.y);
        c.save();
        c.strokeStyle = 'rgba(0, 120, 255, 0.9)';
        c.fillStyle = 'rgba(0, 120, 255, 0.15)';
        c.lineWidth = 1.5;
        c.setLineDash([5, 3]);
        c.fillRect(mx, my, mw, mh);
        c.strokeRect(mx, my, mw, mh);
        c.setLineDash([]);
        c.restore();
        return; // skip the second c.restore() below since we already called it
    }

    // undo scale transform
    c.restore();
}