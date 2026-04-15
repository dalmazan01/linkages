# Refactored Structure

This project originally stored most application logic in a single `main.js` file.
It has been split into smaller files under `js/` so the code is easier to navigate.

## Files

- `js/app-state.js` — shared state, attachment helpers, undo/redo snapshot logic
- `js/rendering.js` — canvas drawing and display helpers
- `js/io.js` — XML import/export
- `js/actions.js` — picking, geometry actions, and command-style handlers
- `js/simulation.js` — idle loop, resize handling, and recomputing rigidity
- `js/ui.js` — mouse, keyboard, and toolbar event wiring
- `main.legacy.js` — untouched backup of the original monolithic file

## Why this split helps

- Rendering code is now separate from input handling
- File import/export is isolated from simulation behavior
- Shared state and history helpers are easier to find
- Future bug fixes can usually stay within one smaller file
