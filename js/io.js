/**
 * io.js
 * XML save/load helpers.
 */

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

function saveLinkageAsSVG() {
    var canvas = $('#canvas')[0];
    var width = canvas.width;
    var height = canvas.height;

    var lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
    lines.push('<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="' + width + '" height="' + height + '">');
    
    // 1. Draw the background to match the current theme
    var bgColor = currentTheme === 'dark' ? '#111111' : '#eeeeee';
    lines.push('  <rect width="100%" height="100%" fill="' + bgColor + '"/>');

    // 2. Wrap everything in a group that applies your current pan and zoom
    lines.push('  <g transform="translate(' + panX + ',' + panY + ') scale(' + scale + ')">');

    // 3. Draw Edges
    _.each(link.edges, function(e, k) {
        var v1 = link.vertices[e.i];
        var v2 = link.vertices[e.j];
        
        // Match the colorString(1, 0.3, 0) used in rendering.js
        var strokeColor = '#ff4d00'; 
        
        lines.push('    <line x1="' + v1[0] + '" y1="' + v1[1] + '" x2="' + v2[0] + '" y2="' + v2[1] + '" stroke="' + strokeColor + '" stroke-width="4" stroke-linecap="round"/>');
        
        // Edge Labels
        if (showLabels) {
            var midX = (v1[0] + v2[0]) / 2;
            var midY = (v1[1] + v2[1]) / 2;
            var edgeLabel = edgeNames[k] || ('E' + (k + 1));
            lines.push('    <text x="' + (midX + 5) + '" y="' + (midY - 5) + '" fill="#ffff80" font-family="Arial" font-size="10px">' + escXML(edgeLabel) + '</text>');
        }
    });

    // 4. Draw Nodes
    _.each(link.vertices, function(v, i) {
        var isFixed = link.fixed.indexOf(i) !== -1;
        var thisNodeStyle = (i in openNodes) ? (openNodes[i] ? 'open' : 'filled') : nodeStyle;
        
        var fillColor = currentTheme === 'light' ? '#000000' : '#ffffff';
        var strokeColor = fillColor;
        
        if (thisNodeStyle === 'open') {
            fillColor = 'none';
        }

        var radius = 5; // VERTEX_SIZE / 2
        
        if (isFixed) {
            // Fixed nodes are drawn as squares
            var size = radius * 2;
            var x = v[0] - radius;
            var y = v[1] - radius;
            lines.push('    <rect x="' + x + '" y="' + y + '" width="' + size + '" height="' + size + '" fill="' + fillColor + '" stroke="' + strokeColor + '" stroke-width="2"/>');
        } else {
            // Standard circles
            lines.push('    <circle cx="' + v[0] + '" cy="' + v[1] + '" r="' + radius + '" fill="' + fillColor + '" stroke="' + strokeColor + '" stroke-width="2"/>');
        }

        // Node Labels
        if (showLabels) {
            var baseName = nodeNames[i] || '?';
            var label = (thisNodeStyle === 'open') ? (baseName + '*') : baseName;
            var labelColor = currentTheme === 'light' ? '#000000' : '#ffffff';
            lines.push('    <text x="' + (v[0] - 15) + '" y="' + (v[1] - 15) + '" fill="' + labelColor + '" font-family="Arial" font-weight="bold" font-size="12px">' + escXML(label) + '</text>');
        }
    });

    lines.push('  </g>');

    lines.push('  <metadata>');
    lines.push('    <linkage>');
    
    // Vertices
    lines.push('      <vertices>');
    _.each(link.vertices, function(v, i) {
        var name  = nodeNames[i] ? ' name="' + escXML(nodeNames[i]) + '"' : '';
        var open  = (i in openNodes) ? ' open="' + openNodes[i] + '"' : '';
        lines.push('        <vertex id="' + i + '" x="' + v[0] + '" y="' + v[1] + '"' + name + open + '/>');
    });
    lines.push('      </vertices>');
    
    // Fixed
    lines.push('      <fixed>');
    _.each(link.fixed, function(i) {
        lines.push('        <pin vertex="' + i + '"/>');
    });
    lines.push('      </fixed>');
    
    // Edges
    lines.push('      <edges>');
    _.each(link.edges, function(e, k) {
        var name = edgeNames[k] ? ' name="' + escXML(edgeNames[k]) + '"' : '';
        var length = (typeof e.length !== 'undefined') ? ' length="' + e.length + '"' : '';
        lines.push('        <edge id="' + k + '" i="' + e.i + '" j="' + e.j + '"' + length + name + '/>');
    });
    lines.push('      </edges>');
    
    // Angles
    lines.push('      <angles>');
    _.each(link.angles, function(a) {
        lines.push('        <angle i="' + a.i + '" j="' + a.j + '" k="' + a.k + '"/>');
    });
    lines.push('      </angles>');
    
    lines.push('    </linkage>');
    lines.push('  </metadata>');

    lines.push('</svg>');

    // 5. Trigger the download
    var svgData = lines.join('\n');
    var blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'linkage-export.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}