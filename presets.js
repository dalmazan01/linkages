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

var topologicalPreset = new Linkage();

topologicalPreset.vertices = [
    [526.36, 449.78],   // Node 0 (A)
    [599.32, 449.50],   // Node 1 (B)
    [674.57, 450.50],   // Node 2 (C)
    [749.81, 449.78],   // Node 3 (D)
    [825.43, 449.32],   // Node 4 (E)
    [900.40, 451.27],   // Node 5 (F)
    [975.35, 450.48],   // Node 6 (G)
    [1051.23, 450.47],  // Node 7 (H)
    [591.75, 421.53],   // Node 8 (J)
    [668.70, 479.45],   // Node 9 (K)
    [742.95, 419.48],   // Node 10 (L)
    [819.54, 478.60],   // Node 11 (M)
    [893.89, 419.60],   // Node 12 (N)
    [969.39, 479.90],   // Node 13 (O)
    [1039.89, 414.78],  // Node 14 (P)
    [1123.37, 462.37]   // Node 15 (Q)
];

// Pins on the bottom base row
topologicalPreset.fixed = [0, 1, 2, 3, 4, 5, 6, 7];

topologicalPreset.edges = [
    { i: 0, j: 8, length: 71.23 },
    { i: 1, j: 9, length: 75.56 },
    { i: 8, j: 9, length: 96.32 },
    { i: 2, j: 10, length: 75.08 },
    { i: 9, j: 10, length: 95.44 },
    { i: 10, j: 11, length: 96.76 },
    { i: 3, j: 11, length: 75.46 },
    { i: 4, j: 12, length: 74.64 },
    { i: 11, j: 12, length: 94.91 },
    { i: 5, j: 13, length: 74.70 },
    { i: 12, j: 13, length: 96.63 },
    { i: 6, j: 14, length: 73.76 },
    { i: 13, j: 14, length: 95.97 },
    { i: 7, j: 15, length: 73.12 },
    { i: 14, j: 15, length: 96.10 }
];

// Custom Metadata for UI labels
topologicalPreset.presetNodeNames = { 
    0: "A", 1: "B", 2: "C", 3: "D", 
    4: "E", 5: "F", 6: "G", 7: "H", 
    8: "J", 9: "K", 10: "L", 11: "M", 
    12: "N", 13: "O", 14: "P", 15: "Q" 
};

// Assuming all nodes are closed by default since the XML didn't specify open states.
// You can add presetOpenNodes here if you need some to be open.

PRESETS.push(topologicalPreset);

// PRESET 3: Rigid (square with cross-bracing)
var rigidPreset = new Linkage();

rigidPreset.vertices = [
    [435.9986312971215,  208.01179918025326], // Node 0
    [835.9982392635744,  208.57246476617757], // Node 1
    [838.503389175735,   608.5646199690485],  // Node 2
    [438.50378285636464, 608.0039543728086]   // Node 3
];

rigidPreset.fixed = [];

rigidPreset.edges = [
    { i: 0, j: 1, length: 400 },
    { i: 1, j: 2, length: 400 },
    { i: 2, j: 3, length: 400 },
    { i: 0, j: 3, length: 400 },
    { i: 0, j: 2, length: 567.8491369693028 },
    { i: 1, j: 3, length: 563.5134051323317 }
];

rigidPreset.presetNodeNames = { 0: '?', 1: '?', 2: '?', 3: '?' };
rigidPreset.presetOpenNodes = {};
rigidPreset.presetName = 'Rigid';

PRESETS.push(rigidPreset);