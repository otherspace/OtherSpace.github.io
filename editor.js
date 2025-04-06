import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

// --- Global Variables ---
let scene, camera, renderer, orbitControls, transformControls;
let raycaster, pointer;
let currentSelection = null; // The currently selected THREE.Mesh
let editorShapes = []; // Array of { mesh: THREE.Mesh, data: shapeJsonData }
let currentTool = "select"; // 'select', 'add', 'delete'
let currentTransformMode = "translate"; // 'translate', 'scale'
const UNIT_SIZE = 1; // For editor display purposes, keep it simple
let surfaceHeightMap = new Map(); // For stacking logic
const BASE_PLANE_Y = 0; // Define base ground level

// --- History Variables ---
const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 50; // Limit history size

// DOM Elements
const canvasContainer = document.getElementById("canvas-container");
const propertiesPanel = document.getElementById("properties-content");
const propNameInput = document.getElementById("prop-name");
const propHeightInput = document.getElementById("prop-height");
const propColorInput = document.getElementById("prop-color");
const propMaterialSelect = document.getElementById("prop-material");
const propShapeInfo = document.getElementById("prop-shape-info");
const applyPropsBtn = document.getElementById("apply-props");
const defaultHeightInput = document.getElementById("default-height");
const defaultColorInput = document.getElementById("default-color");
const defaultMaterialSelect = document.getElementById("default-material");
const objectListUL = document.getElementById("object-list");
const exportJsonBtn = document.getElementById("export-json");
const jsonOutputTextarea = document.getElementById("json-output");
const downloadJsonBtn = document.getElementById("download-json");
const toolButtons = document.querySelectorAll(".toolbar .tool-button");
const transformModeRadios = document.querySelectorAll(
  'input[name="transform-mode"]'
);
const importJsonBtn = document.getElementById("import-json-btn");
const importJsonInput = document.getElementById("import-json-input");
const undoBtn = document.getElementById("undo-btn"); // New
const redoBtn = document.getElementById("redo-btn"); // New

// Initial data structure (can be empty or loaded)
let gameData = {
  space: [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ], // Example space
  materials: [
    { name: "null", description: "Void space" },
    { name: "solid", description: "Solid object" },
    { name: "liquid", description: "Liquid volume" },
    { name: "vapor", description: "Gaseous volume" },
  ],
  defaults: {
    height: 10,
    color: "#CCCCCC",
    material: "solid",
  },
  shapes: [],
};

// --- Initialization ---
function init() {
  setupScene();
  setupLights();
  setupControls();
  setupGizmo();
  setupRaycaster();
  setupUI();
  setupEventListeners();

  loadShapesFromData(gameData.shapes);
  // Push initial state for undo AFTER the first load
  pushUndoState(true); // Pass true for initial state
  updateHistoryButtons(); // Update button states

  animate();
}

// --- Setup Functions ---
function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x333a44);

  const canvasWidth = canvasContainer.clientWidth;
  const canvasHeight = canvasContainer.clientHeight;

  camera = new THREE.PerspectiveCamera(
    60,
    canvasWidth / canvasHeight,
    0.1,
    2000
  );
  camera.position.set(40, 50, 60);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(canvasWidth, canvasHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasContainer.appendChild(renderer.domElement);

  updateGridHelper(); // Initialize grid helper
}

function setupLights() {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
  directionalLight.position.set(50, 80, 60);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 1024;
  directionalLight.shadow.mapSize.height = 1024;
  directionalLight.shadow.camera.near = 1;
  directionalLight.shadow.camera.far = 200;
  directionalLight.shadow.camera.left = -100;
  directionalLight.shadow.camera.right = 100;
  directionalLight.shadow.camera.top = 100;
  directionalLight.shadow.camera.bottom = -100;
  directionalLight.shadow.camera.updateProjectionMatrix();
  scene.add(directionalLight);
}

function setupControls() {
  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.1;
  orbitControls.screenSpacePanning = false;
  orbitControls.target.set(0, 5, 0);
  orbitControls.update();
}

function setupGizmo() {
  transformControls = new TransformControls(camera, renderer.domElement);

  let isDraggingGizmo = false;
  let preTransformState = null;

  transformControls.addEventListener("dragging-changed", (event) => {
    orbitControls.enabled = !event.value;
    isDraggingGizmo = event.value;

    if (isDraggingGizmo && currentSelection) {
      // Capture state *when dragging starts*
      preTransformState = captureState();
      // console.log("History: Captured pre-transform state");
    } else if (!isDraggingGizmo && currentSelection && preTransformState) {
      // Dragging finished
      updateShapeDataFromTransform(currentSelection); // Finalize internal data

      // Compare final state with pre-drag state
      const postTransformStateShapes = captureState()?.shapes; // Get only shapes array
      if (
        JSON.stringify(preTransformState?.shapes) !==
        JSON.stringify(postTransformStateShapes)
      ) {
        pushUndoState(); // Save state *after* the change is finalized
        // console.log("History: Pushed state after gizmo transform");
      } else {
        // console.log("History: Transform didn't change state, not pushing.");
      }
      preTransformState = null; // Reset
      updatePropertiesPanel(currentSelection.userData.shapeData, false); // Update panel
    }
  });

  // Update properties panel *live* while dragging/scaling
  transformControls.addEventListener("objectChange", () => {
    if (currentSelection && isDraggingGizmo) {
      const currentShape = calculateShapeFromMesh(currentSelection, true);
      const shapeText = formatShapeArray(currentShape);
      propShapeInfo.value = shapeText;

      if (currentTransformMode === "scale") {
        const worldScale = currentSelection.getWorldScale(new THREE.Vector3());
        if (currentSelection.geometry instanceof THREE.BoxGeometry) {
          const geomHeight = currentSelection.geometry.parameters.height;
          const liveHeight = parseFloat(
            ((geomHeight * worldScale.y) / UNIT_SIZE).toFixed(2)
          );
          propHeightInput.value = liveHeight;
        }
      }
    }
  });

  scene.add(transformControls);
  setTransformMode(currentTransformMode);
}

function setupRaycaster() {
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
}

function setupUI() {
  populateMaterialDropdown(propMaterialSelect);
  populateMaterialDropdown(defaultMaterialSelect);
  updateGameDefaultsUI();
  updateObjectListUI();
  updatePropertiesPanel(null);
  updateToolbar();
  updateHistoryButtons(); // Initial state
}

function populateMaterialDropdown(selectElement) {
  selectElement.innerHTML = "";
  gameData.materials.forEach((mat) => {
    const option = document.createElement("option");
    option.value = mat.name;
    option.textContent = mat.name.charAt(0).toUpperCase() + mat.name.slice(1);
    selectElement.appendChild(option);
  });
}

function updateGameDefaultsUI() {
  defaultHeightInput.value = gameData.defaults.height;
  defaultColorInput.value = gameData.defaults.color;
  defaultMaterialSelect.value = gameData.defaults.material;
}

let gridHelperRef = null; // Keep reference to remove old grid
function updateGridHelper() {
  if (gridHelperRef) {
    scene.remove(gridHelperRef);
    gridHelperRef.dispose();
  }
  // Use space bounds for grid size, default if space is invalid
  let gridSizeX = 100,
    gridSizeZ = 100;
  if (gameData.space && gameData.space[1] && gameData.space[2]) {
    gridSizeX = gameData.space[1][0] || 100;
    gridSizeZ = gameData.space[2][1] || 100;
  }
  const gridSize = Math.max(gridSizeX, gridSizeZ, 10); // Ensure minimum size
  gridHelperRef = new THREE.GridHelper(
    gridSize,
    gridSize / UNIT_SIZE,
    0x888888,
    0x555555
  ); // Divisions based on unit size
  gridHelperRef.position.y = -0.01;
  scene.add(gridHelperRef);
}

// --- Core Functions ---

// Load shapes sequentially, building the surface map
function loadShapesFromData(shapesDataArray) {
  selectObject(null);
  while (editorShapes.length > 0) {
    const es = editorShapes.pop();
    scene.remove(es.mesh);
    es.mesh.geometry.dispose();
    es.mesh.material.dispose();
  }
  // Update gameData.shapes with the new array *reference*
  gameData.shapes = shapesDataArray;

  surfaceHeightMap.clear();
  // console.log("Processing shapes for stacking...");

  gameData.shapes.forEach((shapeData) => {
    createEditorShape(shapeData); // Pass the direct reference from gameData.shapes
  });

  updateObjectListUI();
  updatePropertiesPanel(null);
  // console.log(`Loaded ${gameData.shapes.length} shapes with stacking.`);
}

// Create a shape, calculating its base Y from the map, and updating the map
function createEditorShape(shapeData, makeSelected = false) {
  // Merge defaults with shape-specific data
  const data = { ...gameData.defaults, ...shapeData };

  let geometry;
  let position = new THREE.Vector3(0, 0, 0);
  const color = new THREE.Color(data.color || gameData.defaults.color);
  let height = parseFloat(data.height || gameData.defaults.height) * UNIT_SIZE;
  if (isNaN(height) || height <= 0) height = UNIT_SIZE;
  const materialType = data.material || gameData.defaults.material;

  let width = UNIT_SIZE;
  let depth = UNIT_SIZE;
  let minX = 0,
    maxX = 0,
    minZ = 0,
    maxZ = 0;

  if (data.shape && data.shape.length >= 3) {
    let shapePoints = data.shape.map((p) => ({ x: p[0], z: p[1] }));
    shapePoints = shapePoints.map((p) => ({
      x: Math.max(0, p.x),
      z: Math.max(0, p.z),
    }));

    const xCoords = shapePoints.map((p) => p.x);
    const zCoords = shapePoints.map((p) => p.z);
    minX = Math.min(...xCoords);
    maxX = Math.max(...xCoords);
    minZ = Math.min(...zCoords);
    maxZ = Math.max(...zCoords);

    if (maxX < minX) maxX = minX;
    if (maxZ < minZ) maxZ = minZ;

    // Update data.shape in the *original object reference* (shapeData)
    shapeData.shape = [
      [minX, minZ],
      [maxX, minZ],
      [maxX, maxZ],
      [minX, maxZ],
    ];

    width = (maxX - minX) * UNIT_SIZE;
    depth = (maxZ - minZ) * UNIT_SIZE;

    const MIN_DIM_THRESHOLD = 0.01 * UNIT_SIZE;
    if (width < MIN_DIM_THRESHOLD) width = UNIT_SIZE;
    if (depth < MIN_DIM_THRESHOLD) depth = UNIT_SIZE;

    position.x = ((minX + maxX) / 2) * UNIT_SIZE;
    position.z = ((minZ + maxZ) / 2) * UNIT_SIZE;
  } else {
    console.warn("Invalid shape definition, creating default box:", data.name);
    minX = 0;
    maxX = 1;
    minZ = 0;
    maxZ = 1;
    shapeData.shape = [
      [minX, minZ],
      [maxX, minZ],
      [maxX, maxZ],
      [minX, maxZ],
    ];
    width = UNIT_SIZE;
    depth = UNIT_SIZE;
    position.x = ((minX + maxX) / 2) * UNIT_SIZE;
    position.z = ((minZ + maxZ) / 2) * UNIT_SIZE;
  }

  // --- Calculate Base Y using surfaceHeightMap ---
  let currentMaxBaseY = BASE_PLANE_Y;
  const startGx = Math.floor(minX);
  const endGx = Math.floor(maxX);
  const startGz = Math.floor(minZ);
  const endGz = Math.floor(maxZ);

  for (let gx = startGx; gx <= endGx; gx++) {
    const finalGz = startGz === endGz ? startGz : endGz;
    for (let gz = startGz; gz <= finalGz; gz++) {
      const lookupGx = Math.max(0, gx);
      const lookupGz = Math.max(0, gz);
      const key = `${lookupGx},${lookupGz}`;
      const surfaceY = surfaceHeightMap.get(key);
      if (surfaceY !== undefined) {
        currentMaxBaseY = Math.max(currentMaxBaseY, surfaceY);
      }
    }
    if (startGx === endGx && endGx === Math.floor(maxX)) break; // Break if single column done
  }
  const objectBaseY = currentMaxBaseY;
  const objectTopY = objectBaseY + height;
  position.y = objectBaseY + height / 2;

  // Store calculated Y levels back into the original data object
  shapeData.calculatedBaseY = objectBaseY;
  shapeData.calculatedTopY = objectTopY;

  geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.computeBoundingBox();

  // --- Material ---
  const isNullMaterial = materialType === null;
  const isTransparent =
    materialType === "liquid" || materialType === "vapor" || isNullMaterial;
  const material = new THREE.MeshStandardMaterial({
    // Color only applied if not null material
    color: !isNullMaterial ? color : 0xffffff, // Use white for null wireframe visibility if needed
    roughness: materialType === "liquid" ? 0.3 : 0.8,
    metalness: 0.1,
    transparent: isTransparent,
    opacity:
      materialType === "liquid"
        ? 0.7
        : materialType === "vapor"
        ? 0.6
        : isNullMaterial
        ? 0.0
        : 1.0, // Opacity 0 for null if invisible is desired
    depthWrite: !isTransparent,
    wireframe: false, // Let visibility handle null, don't force wireframe
    side: THREE.DoubleSide,
  });

  // --- Mesh ---
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.castShadow = !isNullMaterial; // Don't cast shadow from null/invisible
  mesh.receiveShadow = true;
  mesh.userData.isEditorShape = true;
  mesh.userData.shapeData = shapeData; // Direct reference to object in gameData.shapes

  // *** NEW: Set visibility for null material ***
  mesh.visible = !isNullMaterial;

  scene.add(mesh);
  const editorEntry = { mesh: mesh, data: shapeData };
  editorShapes.push(editorEntry);

  // --- Update surfaceHeightMap ---
  if (!isNullMaterial) {
    // Null materials don't add to surface height
    for (let gx = startGx; gx <= endGx; gx++) {
      const finalGz = startGz === endGz ? startGz : endGz;
      for (let gz = startGz; gz <= finalGz; gz++) {
        const lookupGx = Math.max(0, gx);
        const lookupGz = Math.max(0, gz);
        const key = `${lookupGx},${lookupGz}`;
        const existingY = surfaceHeightMap.get(key) || BASE_PLANE_Y;
        surfaceHeightMap.set(key, Math.max(existingY, objectTopY));
      }
      if (startGx === endGx && endGx === Math.floor(maxX)) break;
    }
  }

  if (makeSelected) {
    selectObject(mesh);
  }

  return editorEntry;
}

// Add a default box, calculating its base Y using the map
function addDefaultBox() {
  pushUndoState(); // Save state BEFORE adding
  // console.log("History: Pushed state before add");

  const defaultHeightValue = parseFloat(defaultHeightInput.value) || 10;
  const defaultColor = defaultColorInput.value || "#CCCCCC";
  const defaultMaterial = defaultMaterialSelect.value || "solid";

  const size = 10;
  const minX = 0,
    maxX = size,
    minZ = 0,
    maxZ = size;
  const shape = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ];

  const newShapeDef = {
    name: `Shape_${gameData.shapes.length + 1}`,
    shape: shape,
    height: defaultHeightValue,
    color: defaultColor,
    material: defaultMaterial,
  };

  // Add to game data *first*
  gameData.shapes.push(newShapeDef);

  // createEditorShape handles map reading/writing and adding to scene/editorShapes
  createEditorShape(newShapeDef, true); // Pass the object now in gameData.shapes

  updateObjectListUI();
  updateHistoryButtons(); // Update undo/redo state
}

function selectObject(object) {
  // Allow selecting invisible objects (like null voids) via list, but maybe not via click?
  // Current click logic already filters by visible=true, so list selection is needed for nulls.
  if (!object || !object.userData.isEditorShape) {
    if (currentSelection) {
      transformControls.detach();
    }
    currentSelection = null;
    updatePropertiesPanel(null);
    updateObjectListUIHighlights();
    return;
  }
  if (currentSelection === object) return;

  currentSelection = object;
  transformControls.attach(currentSelection);
  updatePropertiesPanel(currentSelection.userData.shapeData);
  updateObjectListUIHighlights();
  setTool("select");
}

// Deleting an object. Does NOT rebuild the surface map.
function deleteSelectedObject() {
  if (!currentSelection) return;

  pushUndoState(); // Save state BEFORE deleting
  // console.log("History: Pushed state before delete");

  const meshToRemove = currentSelection;
  const dataToRemove = meshToRemove.userData.shapeData;

  transformControls.detach();
  scene.remove(meshToRemove);

  editorShapes = editorShapes.filter((es) => es.mesh !== meshToRemove);
  const indexToRemove = gameData.shapes.findIndex((s) => s === dataToRemove);
  if (indexToRemove > -1) {
    gameData.shapes.splice(indexToRemove, 1);
  } else {
    console.warn("Could not find shape data in gameData array for deletion.");
  }

  meshToRemove.geometry.dispose();
  meshToRemove.material.dispose();

  currentSelection = null;
  updatePropertiesPanel(null);
  updateObjectListUI();
  updateHistoryButtons(); // Update undo/redo state
}

// Calculate the rectangular shape array from mesh state, clamping non-negative
function calculateShapeFromMesh(mesh, applyClamp = true) {
  if (
    !mesh ||
    !mesh.geometry ||
    !(mesh.geometry instanceof THREE.BoxGeometry)
  ) {
    return [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
  }

  mesh.updateMatrixWorld();
  const worldPosition = new THREE.Vector3();
  const worldScale = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  mesh.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);

  const geomParams = mesh.geometry.parameters;
  let calcWidth = geomParams.width * worldScale.x;
  let calcDepth = geomParams.depth * worldScale.z;

  const halfWidth = calcWidth / 2;
  const halfDepth = calcDepth / 2;

  let minX = worldPosition.x - halfWidth;
  let maxX = worldPosition.x + halfWidth;
  let minZ = worldPosition.z - halfDepth;
  let maxZ = worldPosition.z + halfDepth;

  if (applyClamp) {
    if (minX < 0) {
      const diffX = 0 - minX;
      minX = 0;
      maxX += diffX;
    }
    if (minZ < 0) {
      const diffZ = 0 - minZ;
      minZ = 0;
      maxZ += diffZ;
    }
    if (maxX < minX) maxX = minX;
    if (maxZ < minZ) maxZ = minZ;
  }

  return [
    [Math.round(minX / UNIT_SIZE), Math.round(minZ / UNIT_SIZE)],
    [Math.round(maxX / UNIT_SIZE), Math.round(minZ / UNIT_SIZE)],
    [Math.round(maxX / UNIT_SIZE), Math.round(maxZ / UNIT_SIZE)],
    [Math.round(minX / UNIT_SIZE), Math.round(maxZ / UNIT_SIZE)],
  ];
}

// Update internal data record after gizmo transform finishes
function updateShapeDataFromTransform(mesh) {
  if (!mesh || !mesh.userData.shapeData) return;
  const data = mesh.userData.shapeData;

  const newShape = calculateShapeFromMesh(mesh, true);
  if (JSON.stringify(data.shape) !== JSON.stringify(newShape)) {
    data.shape = newShape;
  }

  if (mesh.geometry instanceof THREE.BoxGeometry) {
    const worldScale = mesh.getWorldScale(new THREE.Vector3());
    const geomHeight = mesh.geometry.parameters.height;
    const newHeight = parseFloat(
      ((geomHeight * worldScale.y) / UNIT_SIZE).toFixed(2)
    );
    if (Math.abs(data.height - newHeight) > 0.001) {
      data.height = newHeight;
    }
  }
}

// Apply changes made in the properties panel
function applyPropertiesChanges() {
  if (!currentSelection) return;

  // Capture state BEFORE applying changes for potential undo
  const stateBeforeApply = captureState();

  const mesh = currentSelection;
  const currentData = mesh.userData.shapeData;
  const originalDataSignature = JSON.stringify(currentData);

  // --- Read values ---
  const newName = propNameInput.value;
  const newHeight = parseFloat(propHeightInput.value);
  const newColor = propColorInput.value;
  const newMaterial = propMaterialSelect.value;
  const newShapeString = propShapeInfo.value;

  let changed = false;
  let shapeChangedManually = false;
  let parsedShape = currentData.shape;

  // --- Parse/Validate Manual Shape ---
  const currentShapeString = formatShapeArray(currentData.shape);
  if (newShapeString !== currentShapeString) {
    try {
      // ... (parsing logic remains the same) ...
      const cleanedString = newShapeString.replace(/\s/g, "");
      let jsonString = cleanedString;
      if (!jsonString.startsWith("[[")) jsonString = `[${jsonString}]`;
      jsonString = jsonString.replace(/\]\s*,?\s*\[/g, "],[");
      if (!jsonString.endsWith("]]")) {
        if (jsonString.endsWith("]"))
          jsonString = jsonString.slice(0, -1) + "]]";
        else jsonString += "]]";
      }
      let tempParsedShape = JSON.parse(jsonString);
      if (
        !Array.isArray(tempParsedShape) ||
        tempParsedShape.length !== 4 ||
        !tempParsedShape.every(
          (p) =>
            Array.isArray(p) && p.length === 2 && !isNaN(p[0]) && !isNaN(p[1])
        )
      ) {
        throw new Error("Invalid format.");
      }
      tempParsedShape = tempParsedShape.map((p) => [
        Math.max(0, p[0]),
        Math.max(0, p[1]),
      ]);
      tempParsedShape.sort((a, b) =>
        a[1] === b[1] ? a[0] - b[0] : a[1] - b[1]
      );
      if (
        tempParsedShape[0][1] !== tempParsedShape[1][1] ||
        tempParsedShape[2][1] !== tempParsedShape[3][1] ||
        tempParsedShape[0][0] !== tempParsedShape[3][0] ||
        tempParsedShape[1][0] !== tempParsedShape[2][0]
      ) {
        console.warn("Parsed shape is not rectangular after sorting.");
      }
      const [tl, tr, bl, br] = [
        tempParsedShape[0],
        tempParsedShape[1],
        tempParsedShape[2],
        tempParsedShape[3],
      ];
      parsedShape = [tl, tr, br, bl];
      shapeChangedManually = true;
    } catch (e) {
      alert(
        `Error parsing shape input: ${e.message}\nInput was: ${newShapeString}`
      );
      propShapeInfo.value = currentShapeString;
      // NO state push occurred yet, so nothing to pop
      return;
    }
  }

  // --- Prepare Updated Data Object ---
  const updatedData = { ...currentData };
  updatedData.name = newName;
  updatedData.color = newColor;
  updatedData.material = newMaterial;
  if (!isNaN(newHeight) && newHeight > 0) updatedData.height = newHeight;
  if (shapeChangedManually) updatedData.shape = parsedShape;

  // --- Check if anything actually changed ---
  if (JSON.stringify(updatedData) === originalDataSignature) {
    // console.log("Apply Props: No changes detected.");
    // No need to push history if nothing changed
    return;
  }

  // *** If changes occurred, push the state captured BEFORE apply ***
  pushUndoState(false, stateBeforeApply); // Pass the previously captured state
  // console.log("History: Pushed state before apply props");

  // --- Apply changes to the actual data object ---
  currentData.name = updatedData.name;
  currentData.height = updatedData.height;
  currentData.color = updatedData.color;
  currentData.material = updatedData.material;
  currentData.shape = updatedData.shape;
  changed = true;

  // --- Update Mesh based on potentially changed Height or Shape ---
  const currentMeshHeight = mesh.geometry.parameters.height * mesh.scale.y;
  const heightChanged =
    Math.abs(currentMeshHeight - currentData.height * UNIT_SIZE) > 0.01;

  if (heightChanged || shapeChangedManually) {
    if (mesh.geometry instanceof THREE.BoxGeometry) {
      // ... (geometry update logic remains the same) ...
      const shapePoints = currentData.shape;
      const xCoords = shapePoints.map((p) => p[0]);
      const zCoords = shapePoints.map((p) => p[1]);
      const minX = Math.min(...xCoords);
      const maxX = Math.max(...xCoords);
      const minZ = Math.min(...zCoords);
      const maxZ = Math.max(...zCoords);
      const finalWidthValue = maxX - minX;
      const finalDepthValue = maxZ - minZ;
      const finalHeight = currentData.height * UNIT_SIZE;
      let finalWidth = finalWidthValue * UNIT_SIZE;
      let finalDepth = finalDepthValue * UNIT_SIZE;
      const MIN_DIM_THRESHOLD = 0.01 * UNIT_SIZE;
      if (finalWidth < MIN_DIM_THRESHOLD) finalWidth = UNIT_SIZE;
      if (finalDepth < MIN_DIM_THRESHOLD) finalDepth = UNIT_SIZE;
      const oldGeomHeight = mesh.geometry.parameters.height;
      const currentBaseY = mesh.position.y - (oldGeomHeight * mesh.scale.y) / 2;
      mesh.geometry.dispose();
      mesh.geometry = new THREE.BoxGeometry(
        finalWidth,
        finalHeight,
        finalDepth
      );
      mesh.geometry.computeBoundingBox();
      mesh.scale.set(1, 1, 1);
      mesh.position.x = ((minX + maxX) / 2) * UNIT_SIZE;
      mesh.position.y = currentBaseY + finalHeight / 2;
      mesh.position.z = ((minZ + maxZ) / 2) * UNIT_SIZE;
      mesh.updateMatrixWorld();
    }
  }

  // --- Update Material Appearance ---
  if (changed) {
    const colorValue = currentData.color;
    const materialType = currentData.material;
    const isNullMaterial = materialType === null;
    const isTransparent =
      materialType === "liquid" || materialType === "vapor" || isNullMaterial;

    mesh.material.color.set(!isNullMaterial ? colorValue : 0xffffff); // Use white for null wireframe/invisible placeholder if needed
    mesh.material.transparent = isTransparent;
    mesh.material.opacity =
      materialType === "liquid"
        ? 0.7
        : materialType === "vapor"
        ? 0.6
        : isNullMaterial
        ? 0.0
        : 1.0; // Opacity 0 for null
    mesh.material.wireframe = false; // No wireframe for null, use visibility
    mesh.material.depthWrite = !isTransparent;
    mesh.material.needsUpdate = true;

    // Update visibility specifically for null
    mesh.visible = !isNullMaterial;

    updateObjectListUI();
    updatePropertiesPanel(currentData, false);
    updateHistoryButtons(); // Update button states
  }
}

// Export the current state to JSON
function exportToJson() {
  const exportData = {
    space: gameData.space,
    materials: gameData.materials,
    defaults: {
      height: parseFloat(defaultHeightInput.value) || 10,
      color: defaultColorInput.value || "#CCCCCC",
      material: defaultMaterialSelect.value || "solid",
    },
    shapes: [],
  };

  // Iterate through gameData.shapes to maintain order
  gameData.shapes.forEach((shapeData) => {
    const editorShapeEntry = editorShapes.find((es) => es.data === shapeData);
    if (editorShapeEntry && editorShapeEntry.mesh.visible) {
      // Only sync visible shapes? Or all? Sync all.
      updateShapeDataFromTransform(editorShapeEntry.mesh);
    }
    // Ensure shapeData has valid 'shape' and 'height' even if mesh wasn't found/synced
    if (!Array.isArray(shapeData.shape))
      shapeData.shape = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]; // Basic fallback
    if (isNaN(shapeData.height)) shapeData.height = gameData.defaults.height; // Basic fallback

    const shapeToExport = {
      name: shapeData.name,
      shape: shapeData.shape,
      height: shapeData.height,
      // Conditionally include color/material
      ...((shapeData.color !== exportData.defaults.color ||
        shapeData.color === null) && { color: shapeData.color }),
      ...((shapeData.material !== exportData.defaults.material ||
        shapeData.material === null) && { material: shapeData.material }),
    };

    // Clean up nulls if they are default (though defaults usually aren't null)
    if (shapeToExport.color === null && exportData.defaults.color !== null) {
      /* keep null */
    } else if (shapeToExport.color === exportData.defaults.color)
      delete shapeToExport.color;

    if (
      shapeToExport.material === null &&
      exportData.defaults.material !== null
    ) {
      /* keep null */
    } else if (shapeToExport.material === exportData.defaults.material)
      delete shapeToExport.material;

    // Don't export height if it matches default
    if (shapeToExport.height === exportData.defaults.height)
      delete shapeToExport.height;

    exportData.shapes.push(shapeToExport);
  });

  const jsonString = JSON.stringify(exportData, null, 2);
  jsonOutputTextarea.value = jsonString;
  downloadJsonBtn.style.display = "inline-block";
}

function downloadJsonFile() {
  const jsonString = jsonOutputTextarea.value;
  if (!jsonString) {
    alert("Generate JSON first!");
    return;
  }
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "gameSpace_export.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Handle JSON file import
function handleJsonImport(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const importedData = JSON.parse(e.target.result);

      // Validation
      if (!importedData || typeof importedData !== "object")
        throw new Error("Invalid JSON data.");
      if (!Array.isArray(importedData.materials))
        throw new Error("Missing or invalid 'materials' array.");
      if (!importedData.defaults || typeof importedData.defaults !== "object")
        throw new Error("Missing or invalid 'defaults' object.");
      if (!Array.isArray(importedData.shapes))
        throw new Error("Missing or invalid 'shapes' array.");
      if (Array.isArray(importedData.space) && importedData.space.length >= 3) {
        gameData.space = importedData.space;
        updateGridHelper();
      } else {
        console.warn(
          "Imported JSON missing or invalid 'space'. Keeping existing."
        );
      }

      // Update Game Data
      gameData.materials = importedData.materials;
      gameData.defaults = importedData.defaults;

      // Use the imported shapes directly (loadShapesFromData will use this new gameData.shapes)
      const shapesToLoad = importedData.shapes.map((s) => ({ ...s })); // Create shallow copies for safety

      // Update UI and Scene
      populateMaterialDropdown(propMaterialSelect);
      populateMaterialDropdown(defaultMaterialSelect);
      updateGameDefaultsUI();
      loadShapesFromData(shapesToLoad); // Rebuild the 3D scene *sequentially*

      // Clear history and push imported state
      undoStack.length = 0;
      redoStack.length = 0;
      pushUndoState(true); // Save the freshly imported state
      updateHistoryButtons();
      // console.log("History: Initialized after import");

      jsonOutputTextarea.value = "";
      downloadJsonBtn.style.display = "none";
      alert(`Successfully imported ${shapesToLoad.length} shapes.`);
    } catch (error) {
      console.error("Error importing JSON:", error);
      alert(`Failed to import JSON: ${error.message}`);
    } finally {
      importJsonInput.value = null;
    }
  };
  reader.onerror = (e) => {
    alert("Error reading file.");
    importJsonInput.value = null;
  };
  reader.readAsText(file);
}

// --- History Functions ---

function captureState() {
  // Deep clone the shapes array using JSON methods
  try {
    return JSON.parse(JSON.stringify(gameData.shapes));
  } catch (e) {
    console.error("Error capturing state for history:", e);
    return null;
  }
}

// Modified pushUndoState to accept pre-captured state
function pushUndoState(isInitial = false, stateToPush = null) {
  // Prevent pushing if gizmo is active (wait for mouseUp)
  if (transformControls.dragging && !isInitial) {
    // console.log("History: Skipped push during gizmo drag");
    return;
  }

  const state = stateToPush || captureState(); // Use provided state or capture new one
  if (!state) return;

  // Prevent pushing identical states consecutively
  if (undoStack.length > 0) {
    const lastState = undoStack[undoStack.length - 1];
    if (JSON.stringify(state) === JSON.stringify(lastState)) {
      // console.log("History: Skipped push, state identical to previous.");
      return;
    }
  }

  undoStack.push(state);
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }
  // Clear redo stack only if it wasn't the initial state push
  if (!isInitial) {
    redoStack.length = 0;
  }
  updateHistoryButtons(); // Update button states after push
  // console.log("History: Pushed. Undo:", undoStack.length, "Redo:", redoStack.length);
}

function restoreState(state) {
  if (!state) {
    console.error("History: Cannot restore null state.");
    return;
  }
  // console.log("History: Attempting to restore state...");
  try {
    // state is already a deep clone from captureState
    loadShapesFromData(state); // Pass the cloned shapes array to reload
    updateHistoryButtons();
    // console.log("History: State restored successfully.");
  } catch (e) {
    console.error("Error restoring state:", e);
    alert("Error restoring history state. Check console.");
  }
}

function undo() {
  if (undoStack.length === 0) {
    // console.log("History: Nothing to undo.");
    return;
  }

  // Capture current state *before* undoing and push to redo stack
  const currentState = captureState();
  if (currentState) redoStack.push(currentState);
  // console.log("History: Pushed current state to redo stack.");

  const prevState = undoStack.pop();
  // console.log("History: Popped state for undo.");
  restoreState(prevState); // This calls loadShapesFromData internally
  updateHistoryButtons();
}

function redo() {
  if (redoStack.length === 0) {
    // console.log("History: Nothing to redo.");
    return;
  }

  // Capture current state *before* redoing and push back to undo stack
  const currentState = captureState();
  if (currentState) undoStack.push(currentState);
  // console.log("History: Pushed current state to undo stack (before redo).");

  const nextState = redoStack.pop();
  // console.log("History: Popped state for redo.");
  restoreState(nextState); // This calls loadShapesFromData internally
  updateHistoryButtons();
}

// --- Event Handling ---
function setupEventListeners() {
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("resize", onWindowResize);

  toolButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tool = button.dataset.tool;
      if (tool === "add") {
        addDefaultBox(); // Handles history push
        setTool("select");
      } else if (tool === "delete") {
        deleteSelectedObject(); // Handles history push
        setTool("select");
      } else {
        setTool(tool);
      }
    });
  });

  transformModeRadios.forEach((radio) => {
    radio.addEventListener("change", (e) => {
      setTransformMode(e.target.value);
    });
  });

  applyPropsBtn.addEventListener("click", applyPropertiesChanges); // Handles history push
  exportJsonBtn.addEventListener("click", exportToJson);
  downloadJsonBtn.addEventListener("click", downloadJsonFile);

  // Enter Key Listeners
  propNameInput.addEventListener("keydown", handleEnterApply);
  propHeightInput.addEventListener("keydown", handleEnterApply);
  propShapeInfo.addEventListener("keydown", handleEnterApply);

  // Import Button Listener
  importJsonBtn.addEventListener("click", () => {
    importJsonInput.click();
  });
  importJsonInput.addEventListener("change", handleJsonImport); // Handles history push

  // *** NEW: History Button Listeners ***
  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);

  // Global Keydown Listener for Undo/Redo
  window.addEventListener("keydown", handleGlobalKeys);
}

// Apply changes on Enter key press in specific inputs
function handleEnterApply(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    applyPropertiesChanges(); // Handles pushing state if changes occurred
  }
}

// Handle global keyboard shortcuts like Undo/Redo
function handleGlobalKeys(event) {
  const activeElement = document.activeElement;
  const isInputFocused =
    activeElement &&
    (activeElement.tagName === "INPUT" ||
      activeElement.tagName === "TEXTAREA" ||
      activeElement.isContentEditable);
  const isShapeInputFocused = activeElement === propShapeInfo;

  // Undo: Ctrl+Z (or Cmd+Z on Mac)
  if (
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    event.key.toLowerCase() === "z"
  ) {
    if (!isInputFocused || isShapeInputFocused) {
      event.preventDefault();
      undo();
    }
  }
  // Redo: Ctrl+Y (or Cmd+Y) OR Ctrl+Shift+Z (or Cmd+Shift+Z)
  else if (
    (event.ctrlKey || event.metaKey) &&
    (event.key.toLowerCase() === "y" ||
      (event.shiftKey && event.key.toLowerCase() === "z"))
  ) {
    if (!isInputFocused || isShapeInputFocused) {
      event.preventDefault();
      redo();
    }
  }
}

// Handle object selection via pointer
function onPointerDown(event) {
  if (transformControls.dragging || transformControls.axis) return;
  if (currentTool !== "select") return;

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  // Intersect with *all* editor shapes, even invisible ones,
  // but filter later if needed based on visibility for click selection
  const intersectMeshes = editorShapes.map((es) => es.mesh);
  const intersects = raycaster.intersectObjects(intersectMeshes, false);

  // Find the first *visible* intersected object for click selection
  const firstVisibleIntersect = intersects.find(
    (intersect) =>
      intersect.object.visible && intersect.object.userData.isEditorShape
  );
  if (firstVisibleIntersect) {
    selectObject(firstVisibleIntersect.object);
  } else {
    selectObject(null); // Deselect if clicking empty space or only invisible objects
  }
}

// Handle window resizing
function onWindowResize() {
  const width = canvasContainer.clientWidth;
  const height = canvasContainer.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

// --- UI Update Functions ---
function updateToolbar() {
  toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === currentTool);
  });
}

function setTool(toolName) {
  currentTool = toolName;
  updateToolbar();
}

function setTransformMode(mode) {
  currentTransformMode = mode;
  transformControls.setMode(mode);
  transformControls.showX = true;
  transformControls.showY = true;
  transformControls.showZ = true;
}

// Format shape array for display in textarea
function formatShapeArray(shape) {
  if (!Array.isArray(shape)) return "";
  return shape.map((p) => `[${p[0]},${p[1]}]`).join(",");
}

// Update the properties panel based on selection
function updatePropertiesPanel(data, isLiveUpdate = false) {
  const hasSelection = data !== null;

  propNameInput.disabled = !hasSelection;
  propHeightInput.disabled = !hasSelection;
  propColorInput.disabled = !hasSelection;
  propMaterialSelect.disabled = !hasSelection;
  applyPropsBtn.disabled = !hasSelection;
  propShapeInfo.disabled = !hasSelection;

  if (hasSelection) {
    propertiesPanel.querySelector("p").style.display = "none";

    propNameInput.value = data.name || "";
    propHeightInput.value = parseFloat(data.height || 0).toFixed(2);
    // Show default color even if data.color is null (e.g., for null material)
    propColorInput.value = data.color || gameData.defaults.color;
    propMaterialSelect.value = data.material || gameData.defaults.material;

    // Only update shape text from 'data' if not a live gizmo update
    if (!isLiveUpdate) {
      propShapeInfo.value = formatShapeArray(data.shape);
    }
  } else {
    propertiesPanel.querySelector("p").style.display = "block";
    propNameInput.value = "";
    propHeightInput.value = "";
    propColorInput.value = gameData.defaults.color;
    propMaterialSelect.value = gameData.defaults.material;
    propShapeInfo.value = "";
  }
}

// Update the list of shapes in the UI, maintaining order from gameData.shapes
function updateObjectListUI() {
  objectListUL.innerHTML = "";
  gameData.shapes.forEach((shapeData, index) => {
    const editorShapeEntry = editorShapes.find((es) => es.data === shapeData);

    const li = document.createElement("li");
    li.textContent = `${index}: ${shapeData.name || "Unnamed"}`;
    // Add a class if the material is null (e.g., to style it differently)
    if (shapeData.material === null) {
      li.classList.add("is-null-material"); // Add style for this in CSS if desired
    }
    li.dataset.index = index;

    if (editorShapeEntry && editorShapeEntry.mesh === currentSelection) {
      li.classList.add("selected");
    }
    li.addEventListener("click", () => {
      const targetData = gameData.shapes[index];
      const targetEditorShape = editorShapes.find(
        (es) => es.data === targetData
      );
      if (targetEditorShape) {
        selectObject(targetEditorShape.mesh);
      } else {
        console.warn(`Mesh not found for shape index ${index}`);
      }
    });
    objectListUL.appendChild(li);
  });
}

// Update only the highlights in the object list
function updateObjectListUIHighlights() {
  const items = objectListUL.querySelectorAll("li");
  items.forEach((item) => {
    const index = parseInt(item.dataset.index);
    if (index >= 0 && index < gameData.shapes.length) {
      const shapeData = gameData.shapes[index];
      const isSelected =
        currentSelection && currentSelection.userData.shapeData === shapeData;
      item.classList.toggle("selected", isSelected);
    } else {
      item.classList.remove("selected");
    }
  });
  const selectedLi = objectListUL.querySelector("li.selected");
  if (selectedLi) {
    selectedLi.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

// *** NEW: Update Undo/Redo Button States ***
function updateHistoryButtons() {
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}

// --- Animation Loop ---
function animate() {
  requestAnimationFrame(animate);
  orbitControls.update();
  renderer.render(scene, camera);
}

// --- Start ---
init(); // Run the initialization function
