/**
 * io.js
 * XML save/load helpers.
 * Split from the original monolithic main.js for readability.
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

