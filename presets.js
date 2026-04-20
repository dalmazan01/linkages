var PRESETS = [];

var defaultPreset = new Linkage();
// ... your original default vertices and edges ...
PRESETS.push(defaultPreset);

// PRESET 1: Steric Example
var stericPreset = new Linkage();

stericPreset.vertices = [
    [538.94, 276.41],  // Node 0 
    [788.94, 275.62],  // Node 1 (Fixed)
    [1038.92, 278.99], // Node 2 
    [537.93, 551.41],  // Node 3 (Solid, "a")
    [790.11, 550.62],  // Node 4 (Open, "a")
    [1033.23, 528.92]  // Node 5 (Solid, "a")
];

stericPreset.fixed = [1];

stericPreset.edges = [
    { i: 0, j: 1, length: 250 },
    { i: 1, j: 2, length: 250 },
    { i: 2, j: 5, length: 275 },
    { i: 1, j: 4, length: 275 },
    { i: 0, j: 3, length: 275 }
];

// Custom Metadata for UI labels and open/closed states
stericPreset.presetNodeNames = { 3: "a", 4: "a", 5: "a" };
stericPreset.presetOpenNodes = { 3: false, 4: true, 5: false };

PRESETS.push(stericPreset);


// PRESET 2: Allosteric Example 
var allostericPreset = new Linkage();

allostericPreset.vertices = [
    [486.11, 419.10],  // Node 0 ("A")
    [1074.70, 430.31], // Node 1 ("C")
    [783.03, 286.95],  // Node 2 ("D")
    [777.78, 562.46],  // Node 3 ("B")
    [783.24, 486.95],  // Node 4 (Open, "B")
    [874.71, 431.72]   // Node 5 (Open, "A")
];

allostericPreset.fixed = []; // No fixed pins in this one!

allostericPreset.edges = [
    { i: 0, j: 2, length: 325 },
    { i: 0, j: 3, length: 325 },
    { i: 1, j: 2, length: 325 },
    { i: 1, j: 3, length: 325 },
    { i: 2, j: 4, length: 200 },
    { i: 1, j: 5, length: 200 }
];

// Custom Metadata for UI labels and open/closed states
allostericPreset.presetNodeNames = { 
    0: "A", 1: "C", 2: "D", 
    3: "B", 4: "B", 5: "A" 
};
allostericPreset.presetOpenNodes = { 
    0: false, 1: false, 2: false, 
    3: false, 4: true,  5: true 
};

PRESETS.push(allostericPreset);
