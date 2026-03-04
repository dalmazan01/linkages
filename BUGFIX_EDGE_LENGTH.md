# Bug Fix: Edge Length Drift During Node Movement

## Problem
When dragging a node in the linkage mechanism, edge lengths would continuously increase instead of remaining constant. This was a numerical integration issue where finite step movements violated the nonlinear distance constraints.

## Root Cause
The system uses velocity constraints to maintain edge distances. These velocity constraints are satisfied instantaneously but are only approximate over finite time steps. When moving vertices by:
```
p_i' = p_i + c * v_i
p_j' = p_j + c * v_j
```

The actual distance change is:
```
|p_i' - p_j'|² = |p_i - p_j|² + c² * |v_i - v_j|²
```

This results in distance increasing by ~c² per step, causing edge lengths to drift upward.

## Solution
Implemented constraint correction (projection) that is applied after each movement step:

### Changes Made:

1. **linkage.js**
   - Added `correctEdgeLengths(maxIterations)` method that:
     - Iteratively checks each edge against its target length
     - Adjusts vertex positions to restore exact constraint distances
     - Respects fixed vertices (doesn't move them)
     - Uses iterative refinement for accuracy

2. **main.js - makeEdge() function**
   - Modified to store edge length when edge is created
   - Length is calculated from current vertex positions: `edge.length = numeric.norm2(numeric.sub(vj, vi))`

3. **main.js - makeSnapshot()/restoreSnapshot()**
   - Updated to preserve edge lengths in undo/redo history

4. **main.js - XML Export/Import**
   - Modified exporting to save edge lengths as `length` attribute
   - Modified importing to load edge lengths from XML
   - Falls back to calculating from vertex positions if not stored

5. **linkage.js - copy() method**
   - Updated to preserve edge lengths when copying linkage

6. **main.js - idle() function**
   - Added call to `link.correctEdgeLengths()` before `update()`
   - This ensures constraint surfaces are maintained after each movement

## How It Works
After each movement step during attractor-based dragging:
1. Vertices are moved along valid degrees of freedom
2. `correctEdgeLengths()` is called to project positions back onto the constraint surface
3. The updated positions are used to recalculate rigidity matrix with `update()`

The constraint projection algorithm:
- For each edge, calculates current distance vs target distance
- If error exceeds tolerance (1e-6):
  - Computes scaling factor to restore target distance
  - Moves free vertices equally (if both free) or only free vertex (if one fixed)
  - Never moves fixed vertices

This iterative approach (up to 5 iterations) ensures edge constraints are satisfied to floating-point precision.

## Testing
To verify the fix:
1. Load a preset linkage (e.g., Peaucellier)
2. Enable edge length display (press 'l')
3. Drag a node
4. Edge lengths should now remain constant while moving

Edge lengths will only change if:
- A new edge is explicitly created
- The mechanism configuration is reset
- Fixed points are changed
