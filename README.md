# OtherSpace Builder

<img src="https://raw.githubusercontent.com/otherspace/builder/refs/heads/main/screenshot.png">

A web-based 3D visual editor for creating game space layouts for a specific game engine that uses a defined JSON format. Built with HTML, CSS, JavaScript, and the Three.js library.

This tool allows designers or developers to visually construct game levels by adding, positioning, scaling, and configuring objects within a 3D space, and then exporting the layout to the required JSON structure.

## Features

- **3D Viewport:** Renders the game space using Three.js.
- **Navigation:** Uses OrbitControls for panning, zooming, and rotating the view.
- **Object Creation:** Add new box-shaped objects with default properties.
- **Object Selection:** Select objects by clicking in the 3D view or the object list.
- **Transformation:** Move and Scale selected objects using interactive gizmos (TransformControls).
- **Property Editing:** Modify selected object's `name`, `height`, `color`, `material`, and `shape` (XZ coordinates) via a sidebar panel. Changes can be applied via button or Enter key.
- **Stacking Logic:** Objects are placed vertically based on the highest point of objects below them within their XZ footprint during initial load and when adding new objects (mimicking the implied game engine behavior).
- **Coordinate System:** Enforces non-negative X and Z coordinates, assuming a top-left origin (0,0) on the XZ plane.
- **Material Representation:**
  - `solid`, `liquid`, `vapor` materials are visually represented with appropriate colors and transparency.
  - `null` material objects are rendered as **invisible** in the editor but can still be selected via the object list for editing (useful for defining volumes like spawn points).
- **JSON Import:** Load existing game space definitions from compatible JSON files.
- **JSON Export:** Generate the final JSON output matching the specific structure required by the target game engine.
- **Undo/Redo:** Basic history tracking for major actions (add, delete, property apply, gizmo transform) with keyboard shortcuts (Ctrl+Z / Cmd+Z, Ctrl+Y / Cmd+Y / Ctrl+Shift+Z / Cmd+Shift+Z) and UI buttons.

## Technology Stack

- HTML5
- CSS3
- JavaScript (ES Modules)
- Three.js (r162+)
  - `OrbitControls`
  - `TransformControls`

## Getting Started

### Prerequisites

You need a local web server to run this project because ES Modules have security restrictions that prevent them from loading directly from the `file:///` protocol.

Common options include:

1.  **Node.js with `http-server`:**
    - Install Node.js (if you haven't already).
    - Open your terminal or command prompt.
    - Install `http-server` globally: `npm install -g http-server`
    - Navigate to the project directory: `cd path/to/otherspace-builder`
    - Start the server: `http-server -c-1` (the `-c-1` disables caching, useful for development)
2.  **Python's built-in server:**
    - Make sure Python is installed.
    - Open your terminal or command prompt.
    - Navigate to the project directory: `cd path/to/otherspace-builder`
    - Start the server:
      - Python 3: `python -m http.server`
      - Python 2: `python -m SimpleHTTPServer`
3.  **VS Code Live Server Extension:** If you use Visual Studio Code, the "Live Server" extension is a convenient option.

### Running

1.  Download or clone this project's files (`index.html`, `style.css`, `editor.js`) into a directory.
2.  Start your chosen local web server in that directory (see Prerequisites).
3.  Open your web browser and navigate to the address provided by your server (e.g., `http://localhost:8080` or `http://127.0.0.1:8080`).

## How to Use

1.  **Load/Start:**
    - Click "Import JSON" to load an existing level file.
    - Or, start building from an empty space.
2.  **Navigate:** Use the mouse (Left-drag: rotate, Right-drag: pan, Wheel: zoom) to explore the 3D space.
3.  **Tools:**
    - **Select:** Click objects in the scene or list to select them. Use the gizmo (Move/Scale modes selectable in toolbar) to transform.
    - **Add Box:** Adds a new default cube, automatically placing it on top of existing objects based on the stacking logic.
    - **Delete:** Removes the currently selected object.
4.  **Properties:**
    - When an object is selected, its properties appear in the right sidebar.
    - Modify Name, Height, Color, Material, or the Shape coordinates (`[[x1,z1],[x2,z1],[x2,z2],[x1,z2]]` format).
    - Press Enter in the input fields or click "Apply Changes" to update the object.
5.  **Undo/Redo:** Use the toolbar buttons or keyboard shortcuts (Ctrl+Z, Ctrl+Y) to step through changes.
6.  **Export:** Click "Generate JSON" to see the output, then "Download JSON" to save the file.

## Target JSON Format

The editor is designed to import and export JSON files adhering to a specific structure, including:

- `space`: Defines the overall boundaries (e.g., `[[0,0],[100,0],[100,100],[0,100]]`).
- `materials`: An array defining available material types (`null`, `solid`, `liquid`, `vapor`).
- `defaults`: Default values for `height`, `color`, `material`.
- `shapes`: An array of objects, each defining a part of the game space. Crucially, each shape has:
  - `name` (string)
  - `shape` (array of 4 [X, Z] coordinates defining a rectangular footprint)
  - `height` (number)
  - `color` (string, hex format) - Optional
  - `material` (string, referencing a name in `materials`) - Optional

**Important:** The _order_ of shapes in the exported `shapes` array is crucial, as the game engine likely relies on this order for its stacking logic. The editor preserves the order from import and appends new shapes to the end.

## Limitations & Known Issues

- **Box Geometry Only:** The editor currently represents all shapes as simple boxes (`BoxGeometry`) based on the bounding box of their `shape` coordinates. It does not render complex extruded polygons.
- **Stacking Map on Delete:** The internal `surfaceHeightMap` used for placing objects is _not_ rebuilt when an object is deleted. This means adding new objects after deleting might place them lower than expected until the next full import/load.
- **Manual Placement vs. Stacking:** While the initial load respects stacking, you can manually move objects anywhere using the gizmo, visually breaking the strict stacking order within the editor. The exported JSON relies purely on the shape/height data and order; the game engine will re-apply stacking.
- **No Rotation:** Object rotation is not supported by the gizmo or properties panel to simplify the calculation of the axis-aligned `shape` array for export.
- **Null Material:** Rendered as invisible. Selection requires using the object list.
- **Error Handling:** Basic validation is present, but more robust error handling could be added (e.g., for complex invalid JSON during import).
- **Performance:** May slow down with a very large number of objects.
- **History Limit:** Undo history is capped (currently at 50 steps).

## Future Development Ideas

- Implement drawing tools for defining arbitrary polygon `shape` footprints.
- Render shapes using `ExtrudeGeometry` based on the actual `shape` polygon for a more accurate preview.
- Add support for object rotation (requires more complex `shape` calculation on export).
- More sophisticated handling/visualization of the stacking logic, potentially rebuilding the map on delete or providing visual cues.
- Improve UI/UX (e.g., visual material previews, better object list filtering/sorting).
- Saving/Loading editor project files (distinct from the game JSON export).
- More advanced material property editing.
- Constructive Solid Geometry (CSG) operations for visually representing `null` voids carving into other objects.
