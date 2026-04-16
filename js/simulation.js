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

