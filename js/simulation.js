/**
 * simulation.js
 * Animation loop, resize handling, and rigidity updates.
 */

var resized = false;
function idle() {
    // Trace back mode - move nodes along their traces (forward or backward)
    if (traceBackMode) {
        var stillPlaying = false;
        var reachedEnd = false;
        var reachedStart = false;

        _.each(tracks, function(track, i) {
            i = parseInt(i, 10);
            if (track.length > 0) {
                if (!(i in traceBackIndex)) {
                    traceBackIndex[i] = traceDirection === -1 ? track.length - 1 : 0;
                }

                var idx = traceBackIndex[i];

                if (idx >= 0 && idx < track.length) {
                    var targetPos = track[idx];

                    // Move node (and its solid/open partner if attached) to the
                    // target position, then let the constraint solver drag the
                    // rest of the linkage — exactly like manual dragging does.
                    var dragGroup = getDragGroup(i);
                    if (dragGroup) {
                        var isGroupFixed = link.fixed.indexOf(dragGroup.solid) >= 0 ||
                                           link.fixed.indexOf(dragGroup.open) >= 0;
                        if (!isGroupFixed) {
                            link.vertices[dragGroup.solid] = [targetPos[0], targetPos[1]];
                            link.vertices[dragGroup.open]  = [targetPos[0], targetPos[1]];
                        }
                    } else if (link.fixed.indexOf(i) < 0) {
                        link.vertices[i] = [targetPos[0], targetPos[1]];
                    }

                    solveJointedSystem(10);

                    traceBackIndex[i] += traceDirection;
                    stillPlaying = true;
                }

                if (traceDirection === -1 && idx <= 0) reachedStart = true;
                if (traceDirection === 1 && idx >= track.length - 1) reachedEnd = true;
            }
        });
        
        // Handle end conditions based on loop mode
        var hitBoundary = (reachedStart && traceDirection === -1) ||
                          (reachedEnd   && traceDirection === 1);

        if (hitBoundary) {
            if (traceLoopMode) {
                // Loop mode: flip direction and clamp all indices back to the
                // boundary so the next frame reads a valid position.
                traceDirection *= -1;
                _.each(tracks, function(track, i) {
                    if (track.length > 0) {
                        traceBackIndex[i] = traceDirection === -1 ? track.length - 1 : 0;
                    }
                });
                stillPlaying = true;
            } else {
                // Play once: stop at whichever end we hit
                traceBackMode = false;
                traceBackIndex = {};
                traceDirection = -1;
                $('#btn-trace-play').removeClass('active');
                $('#btn-trace-stop').prop('disabled', true);
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
            solveJointedSystem(10);
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