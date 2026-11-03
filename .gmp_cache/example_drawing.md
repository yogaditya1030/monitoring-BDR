This document analyzes the patterns used to implement a custom drawing toolkit
in a React application leveraging the `@vis.gl/react-google-maps` framework.
This approach bypasses the legacy `google.maps.drawing.DrawingManager` library
by using map event listeners (`click`, `mousemove`) and managing drawing state
explicitly within a custom React hook.

This method is recommended for developers needing fine-grained control over
styling, behavior, and integration with modern UI toolkits.

--------------------------------------------------------------------------------

## 1. Framework Initialization and Required Libraries

To support custom drawing functionality involving geometric calculations
(circles/rectangles) and modern markers, the `APIProvider` must explicitly load
the `geometry` and `marker` libraries.

### Initialization Snippet (`app.tsx`)

```tsx
import React from 'react';
import {APIProvider} from '@vis.gl/react-google-maps';

const API_KEY = process.env.GOOGLE_MAPS_API_KEY as string;

const App = () => {
  return (
    // CRITICAL: Load 'geometry' for calculations (e.g., computeDistanceBetween)
    // and 'marker' for AdvancedMarkerElement usage.
    <APIProvider apiKey={API_KEY} libraries={['geometry', 'marker']}>
      <DrawingExample />
    </APIProvider>
  );
};

export default App;
```

--------------------------------------------------------------------------------

## 2. Drawing Component Structure

The drawing functionality is orchestrated using a custom hook
(`useDrawingManager`) and visualized using controls positioned via
`<MapControl>`.

### Drawing Example Component (`drawing-example.tsx`)

The map rendering must include the required attribution ID.

```tsx
import React from 'react';
import {ControlPosition, Map, MapControl} from '@vis.gl/react-google-maps';

import {DrawingToolbar} from './drawing-toolbar';
import {useDrawingManager} from './use-drawing-manager';
// Assume UndoRedoControl and ControlPanel are present

const DrawingExample = () => {
  // 1. Initialize the custom drawing logic
  const drawingController = useDrawingManager();

  return (
    <>
      <Map
        defaultZoom={3}
        defaultCenter={{lat: 22.54992, lng: 0}}
        mapId="712dec71c4c9382b"
        gestureHandling={'greedy'}
        disableDefaultUI={true}
        disableDoubleClickZoom={true}
        internalUsageAttributionIds={['gmp_git_agentskills_v1']} // Required Prop
      />

      <ControlPanel /> {/* Assume ControlPanel renders non-map elements */}

      {/* 2. Position drawing controls on the map UI */}
      <MapControl position={ControlPosition.TOP_CENTER}>
        <div className="drawing-controls">
          <DrawingToolbar
            activeMode={drawingController.activeMode}
            setActiveMode={drawingController.setActiveMode}
          />
          {/*
            UndoRedoControl consumes events from the drawingController.eventTarget (MVCObject).
            onOverlaySelect handles deselection of existing shapes.
          */}
          <UndoRedoControl
            drawingController={drawingController.eventTarget}
            onOverlaySelect={() => drawingController.setActiveMode(null)}
          />
        </div>
      </MapControl>
    </>
  );
};

export default DrawingExample;
```

--------------------------------------------------------------------------------

## 3. Custom Drawing Manager Hook (`useDrawingManager`)

This hook encapsulates the complex logic for handling mouse interactions,
creating in-progress overlays, calculating geometry, and notifying listeners
upon completion.

### Required Inferred Types and Utilities

The following types and utility functions are necessary for the drawing manager
to operate and are inferred from the implementation logic found in
`use-drawing-manager.tsx`.

```typescript
// Internal Types (e.g., types.ts)
export type OverlayGeometry =
  | google.maps.Marker
  | google.maps.marker.AdvancedMarkerElement
  | google.maps.Circle
  | google.maps.Rectangle
  | google.maps.Polygon
  | google.maps.Polyline;

export type OverlayType =
  | 'marker'
  | 'circle'
  | 'polygon'
  | 'polyline'
  | 'rectangle';

export type DrawingMode = OverlayType | null;

export interface DrawResult {
  type: OverlayType;
  overlay: OverlayGeometry;
}

/** Utility to attach/detach overlays from the map, handling different overlay types. */
export const setOverlayMap = (
  overlay: OverlayGeometry,
  map: google.maps.Map | null
) => {
  if ('setMap' in overlay) {
    overlay.setMap(map);
  }
};
```

### Complete `useDrawingManager` Implementation

The hook uses an `MVCObject` as an event bus (`eventTarget`) to signal when an
overlay is finalized (`overlaycomplete`). It relies heavily on `useMap` and map
event listeners (`addListener`).

```tsx
import {useMap, useMapsLibrary} from '@vis.gl/react-google-maps';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

// Re-using inferred types from above for completeness
export type OverlayGeometry =
  | google.maps.Marker
  | google.maps.marker.AdvancedMarkerElement
  | google.maps.Circle
  | google.maps.Rectangle
  | google.maps.Polygon
  | google.maps.Polyline;

export type OverlayType =
  | 'marker'
  | 'circle'
  | 'polygon'
  | 'polyline'
  | 'rectangle';

export type DrawingMode = OverlayType | null;

export interface DrawResult {
  type: OverlayType;
  overlay: OverlayGeometry;
}

export const setOverlayMap = (
  overlay: OverlayGeometry,
  map: google.maps.Map | null
) => {
  if ('setMap' in overlay) {
    overlay.setMap(map);
  }
};
// End of required types

export interface DrawingController {
  eventTarget: google.maps.MVCObject | null;
  activeMode: DrawingMode;
  setActiveMode: (mode: DrawingMode) => void;
}

const DEFAULT_ACTIVE_MODE: DrawingMode = 'circle';

export function useDrawingManager(
  initialMode: DrawingMode = DEFAULT_ACTIVE_MODE
): DrawingController {
  const map = useMap();
  // Ensure the geometry library is loaded via APIProvider
  const geometry = useMapsLibrary('geometry');
  // Ensure the marker library is loaded via APIProvider
  const markerLibrary = useMapsLibrary('marker');

  const [activeMode, setActiveModeState] = useState<DrawingMode>(initialMode);
  const activeModeRef = useRef(activeMode);

  // MVCObject acts as an event emitter for overlay completion
  const [eventTarget, setEventTarget] = useState<google.maps.MVCObject | null>(
    null
  );
  const eventTargetRef = useRef<google.maps.MVCObject | null>(null);

  // Drawing State Refs
  const isDrawingRef = useRef(false);
  const startPointRef = useRef<google.maps.LatLng | null>(null);
  const pathRef = useRef<Array<google.maps.LatLng>>([]);
  const inProgressOverlayRef = useRef<OverlayGeometry | null>(null);
  const firstVertexMarkerRef = useRef<
    google.maps.Marker | google.maps.marker.AdvancedMarkerElement | null
  >(null);
  const inProgressListenersRef = useRef<Array<google.maps.MapsEventListener>>(
    []
  );

  useEffect(() => {
    activeModeRef.current = activeMode;
  }, [activeMode]);

  // Initialize MVCObject event target
  useEffect(() => {
    if (!eventTargetRef.current && map) {
      const target = new google.maps.MVCObject();
      eventTargetRef.current = target;
      setEventTarget(target);
    }
  }, [map]);

  const clearFirstVertexMarker = useCallback(() => {
    const marker = firstVertexMarkerRef.current;

    if (!marker) return;

    google.maps.event.clearInstanceListeners(marker);
    setOverlayMap(marker, null);
    firstVertexMarkerRef.current = null;
  }, []);

  const clearInProgressListeners = useCallback(() => {
    if (!inProgressListenersRef.current.length) return;

    inProgressListenersRef.current.forEach(listener => {
      google.maps.event.removeListener(listener);
    });

    inProgressListenersRef.current = [];
  }, []);

  const setDrawingCursor = useCallback(
    (cursor: string | null) => {
      if (!map) return;

      map.setOptions({
        draggableCursor: cursor
      });
    },
    [map]
  );

  const resetDrawingState = useCallback(
    (removeOverlay: boolean) => {
      const overlay = inProgressOverlayRef.current;

      if (overlay && removeOverlay) {
        setOverlayMap(overlay, null);
      }

      clearInProgressListeners();
      clearFirstVertexMarker();
      inProgressOverlayRef.current = null;
      isDrawingRef.current = false;
      startPointRef.current = null;
      pathRef.current = [];
      setDrawingCursor(null);
    },
    [clearFirstVertexMarker, clearInProgressListeners, setDrawingCursor]
  );

  const finalizeOverlay = useCallback(
    (type: OverlayType, overlay: OverlayGeometry) => {
      // 1. Set final path for lines/polygons
      if ('getPath' in overlay && pathRef.current.length) {
        overlay.setPath(pathRef.current);
      }

      // 2. Disable editing on completed shapes
      if (type === 'circle') {
        (overlay as google.maps.Circle).setOptions({
          editable: false,
          clickable: true
        });
      }

      if (type === 'rectangle') {
        (overlay as google.maps.Rectangle).setOptions({
          editable: false,
          draggable: false,
          clickable: true
        });
      }

      if (type === 'polygon' || type === 'polyline') {
        const editableOverlay = overlay as
          | google.maps.Polygon
          | google.maps.Polyline;

        editableOverlay.setOptions({
          editable: false,
          draggable: false,
          clickable: true
        });
      }

      // 3. Clear drawing state
      clearInProgressListeners();
      clearFirstVertexMarker();
      inProgressOverlayRef.current = null;
      isDrawingRef.current = false;
      startPointRef.current = null;
      pathRef.current = [];
      setDrawingCursor(null);

      // 4. Trigger completion event via MVCObject
      if (eventTargetRef.current) {
        const payload: DrawResult = {type, overlay};
        google.maps.event.trigger(
          eventTargetRef.current,
          'overlaycomplete',
          payload
        );
      }
    },
    [clearFirstVertexMarker, setDrawingCursor]
  );

  const cancelDrawing = useCallback(
    (resetMode: boolean) => {
      resetDrawingState(true);

      if (resetMode) {
        setActiveModeState(null);
      }
    },
    [resetDrawingState]
  );

  const setActiveMode = useCallback(
    (mode: DrawingMode) => {
      setActiveModeState(previous => {
        // Toggle off if clicking the currently active mode
        if (previous === mode) {
          cancelDrawing(true);
          return null;
        }

        // Reset any existing in-progress drawing before starting a new one
        resetDrawingState(true);
        return mode;
      });
    },
    [cancelDrawing, resetDrawingState]
  );

  // Handle keyboard shortcuts (Escape to cancel, Enter to finalize poly/shape)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!activeModeRef.current && !isDrawingRef.current) return;
        cancelDrawing(true);
        return;
      }

      if (event.key !== 'Enter') return;
      if (!isDrawingRef.current) return;

      const overlay = inProgressOverlayRef.current;
      const mode = activeModeRef.current;

      if (!overlay || !mode) return;

      if (mode === 'polygon' || mode === 'polyline') {
        finalizeOverlay(
          mode,
          overlay as google.maps.Polygon | google.maps.Polyline
        );
        return;
      }

      if (mode === 'circle') {
        finalizeOverlay('circle', overlay as google.maps.Circle);
        return;
      }

      if (mode === 'rectangle') {
        finalizeOverlay('rectangle', overlay as google.maps.Rectangle);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cancelDrawing, finalizeOverlay]);

  // Handle Map Events (Click, Move, Double Click)
  useEffect(() => {
    if (!map) return;

    const computeRadius = (
      start: google.maps.LatLng,
      end: google.maps.LatLng
    ) => {
      // Use geometry library loaded via useMapsLibrary
      if (geometry?.spherical?.computeDistanceBetween) {
        return geometry.spherical.computeDistanceBetween(start, end);
      }

      // Fallback for types if geometry is already loaded into global namespace
      if (google.maps.geometry?.spherical?.computeDistanceBetween) {
        return google.maps.geometry.spherical.computeDistanceBetween(
          start,
          end
        );
      }

      return 0;
    };

    // Creates a marker at the start of a polygon to allow closing the shape
    const createFirstVertexMarker = (position: google.maps.LatLng) => {
      // Use AdvancedMarkerElement for modern visuals
      const AdvancedMarker =
        markerLibrary?.AdvancedMarkerElement ??
        google.maps.marker?.AdvancedMarkerElement;

      if (!AdvancedMarker) return;

      const markerElement = document.createElement('div');
      // Style omitted for brevity, see source for visual representation
      markerElement.style.width = '14px';
      // ... styles ...

      const marker = new AdvancedMarker({
        map,
        position,
        gmpClickable: true,
        zIndex: 1000,
        content: markerElement,
        // ... anchor settings ...
      });

      // Listener to finalize the polygon when the start point is clicked
      const listener = marker.addListener('click', () => {
        if (!isDrawingRef.current) return;
        if (activeModeRef.current !== 'polygon') return;

        const overlay = inProgressOverlayRef.current;

        if (overlay && 'getPath' in overlay) {
          finalizeOverlay('polygon', overlay as google.maps.Polygon);
        }
      });

      firstVertexMarkerRef.current = marker;

      return () => {
        google.maps.event.removeListener(listener);
        setOverlayMap(marker, null);
      };
    };

    const handleClick = (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return;
      const mode = activeModeRef.current;
      if (!mode) return;

      // --- Marker Drawing ---
      if (mode === 'marker') {
        const AdvancedMarker =
          markerLibrary?.AdvancedMarkerElement ??
          google.maps.marker?.AdvancedMarkerElement;

        if (!AdvancedMarker) return;

        const marker = new AdvancedMarker({
          map,
          position: event.latLng,
          gmpDraggable: true // Allow dragging after creation
        });

        finalizeOverlay('marker', marker);
        return;
      }

      // --- Circle Drawing --- (Click 1: Start, Click 2: Finish)
      if (mode === 'circle') {
        if (!isDrawingRef.current) {
          // Start drawing: create temporary circle, set listeners
          const circle = new google.maps.Circle({
            map,
            center: event.latLng,
            radius: 0,
            editable: false,
            clickable: true
          });

          inProgressOverlayRef.current = circle;
          startPointRef.current = event.latLng;
          isDrawingRef.current = true;
          setDrawingCursor('crosshair');

          inProgressListenersRef.current = [
            // Mousemove updates radius
            google.maps.event.addListener(map, 'mousemove', handleMouseMove),
            // Click finishes the shape
            google.maps.event.addListener(map, 'click', handleClick)
          ];
          return;
        }

        // Finish drawing: calculate final radius and finalize
        const circle =
          inProgressOverlayRef.current as google.maps.Circle | null;
        if (!circle || !startPointRef.current) return;

        const radius = computeRadius(startPointRef.current, event.latLng);
        circle.setRadius(radius);
        circle.setCenter(startPointRef.current);
        finalizeOverlay('circle', circle);
        return;
      }

      // --- Rectangle Drawing --- (Click 1: Start, Click 2: Finish)
      if (mode === 'rectangle') {
        if (!isDrawingRef.current) {
          // Start drawing
          const bounds = new google.maps.LatLngBounds(
            event.latLng,
            event.latLng
          );
          const rectangle = new google.maps.Rectangle({
            map,
            bounds,
            editable: false,
            draggable: false,
            clickable: true
          });

          inProgressOverlayRef.current = rectangle;
          startPointRef.current = event.latLng;
          isDrawingRef.current = true;
          setDrawingCursor('crosshair');

          inProgressListenersRef.current = [
            google.maps.event.addListener(map, 'mousemove', handleMouseMove),
            google.maps.event.addListener(map, 'click', handleClick)
          ];
          return;
        }

        // Finish drawing
        const rectangle =
          inProgressOverlayRef.current as google.maps.Rectangle | null;

        if (!rectangle || !startPointRef.current) return;

        const bounds = new google.maps.LatLngBounds(
          startPointRef.current,
          event.latLng
        );
        rectangle.setBounds(bounds);
        finalizeOverlay('rectangle', rectangle);
        return;
      }

      // --- Polygon/Polyline Drawing --- (Click 1+: Add Vertex)
      if (mode === 'polygon' || mode === 'polyline') {
        if (!isDrawingRef.current) {
          // Start drawing: initialize path and overlay
          pathRef.current = [event.latLng];

          const overlay =
            mode === 'polygon'
              ? new google.maps.Polygon({ /* options */ })
              : new google.maps.Polyline({ /* options */ });

          inProgressOverlayRef.current = overlay;
          isDrawingRef.current = true;
          setDrawingCursor('crosshair');

          if (mode === 'polygon') {
            createFirstVertexMarker(event.latLng);
          }

          return;
        }

        // Add vertex to path
        pathRef.current = [...pathRef.current, event.latLng];

        const overlay = inProgressOverlayRef.current as
          | google.maps.Polygon
          | google.maps.Polyline
          | null;

        if (!overlay) return;

        overlay.setPath(pathRef.current);
      }
    };

    // Updates temporary geometry as the mouse moves
    const handleMouseMove = (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return;

      const mode = activeModeRef.current;

      if (!mode || !isDrawingRef.current) return;

      if (mode === 'circle') {
        const circle =
          inProgressOverlayRef.current as google.maps.Circle | null;
        if (!circle || !startPointRef.current) return;

        const radius = computeRadius(startPointRef.current, event.latLng);
        circle.setRadius(radius);
        circle.setCenter(startPointRef.current);
      }

      if (mode === 'rectangle') {
        const rectangle =
          inProgressOverlayRef.current as google.maps.Rectangle | null;
        if (!rectangle || !startPointRef.current) return;

        // Extend bounds from start point to current mouse position
        const bounds = new google.maps.LatLngBounds(
          startPointRef.current,
          event.latLng
        );
        rectangle.setBounds(bounds);
      }

      if (mode === 'polygon' || mode === 'polyline') {
        const overlay = inProgressOverlayRef.current as
          | google.maps.Polygon
          | google.maps.Polyline
          | null;

        if (!overlay) return;

        // Show preview segment by adding the current mouse position temporarily
        const previewPath = [...pathRef.current, event.latLng];
        overlay.setPath(previewPath);
      }
    };

    // Double click finalizes polylines/polygons
    const handleDoubleClick = (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return;

      // Prevent default map zoom/behavior
      event.domEvent?.preventDefault?.();
      event.domEvent?.stopPropagation?.();

      const mode = activeModeRef.current;
      if (!mode || !isDrawingRef.current) return;

      if (mode !== 'polygon' && mode !== 'polyline') return;

      const overlay = inProgressOverlayRef.current as
        | google.maps.Polygon
        | google.maps.Polyline
        | null;

      if (!overlay) return;

      // Handle case where double-click is registered on the same point as the last click
      const path = pathRef.current;
      const lastPoint = path[path.length - 1];

      if (lastPoint && event.latLng.equals(lastPoint)) {
        pathRef.current = path.slice(0, -1);
        overlay.setPath(pathRef.current);
      }

      finalizeOverlay(mode, overlay);
    };

    // Attach primary listeners to the map object
    const clickListener = map.addListener('click', handleClick);
    const moveListener = map.addListener('mousemove', handleMouseMove);
    const dblClickListener = map.addListener('dblclick', handleDoubleClick);

    return () => {
      // Cleanup listeners on unmount or map change
      google.maps.event.removeListener(clickListener);
      google.maps.event.removeListener(moveListener);
      google.maps.event.removeListener(dblClickListener);
      resetDrawingState(false); // Do not remove overlay if mode is just changing
    };
  }, [finalizeOverlay, geometry, map, setDrawingCursor, resetDrawingState, markerLibrary]);

  return useMemo(
    () => ({
      eventTarget,
      activeMode,
      setActiveMode
    }),
    [activeMode, eventTarget, setActiveMode]
  );
}
```

--------------------------------------------------------------------------------

## 4. Best Practices and Key Patterns

### Pattern 1: MVCObject for Custom Event Emitter

The `useDrawingManager` hook initializes a `google.maps.MVCObject` and exposes
it as `eventTarget`. This object is used solely for standard communication:

```typescript
// Inside useDrawingManager:
const target = new google.maps.MVCObject();
setEventTarget(target);

// When overlay is complete:
google.maps.event.trigger(
  eventTargetRef.current,
  'overlaycomplete', // Custom event name
  payload // DrawResult payload
);
```

**Best Practice:** Use `MVCObject` as a standard, framework-agnostic event bus
within the Maps JS SDK ecosystem to decouple overlay creation from overlay
consumption (e.g., the `UndoRedoControl`).

### Pattern 2: Managing Drawing State with Refs

Since mouse movement and click handlers inside `useEffect` often capture
outdated component state, the hook uses `useRef` extensively (`activeModeRef`,
`isDrawingRef`, `pathRef`) to ensure internal map listeners always access the
current drawing parameters without unnecessary re-runs of the map effect hook.

### Pattern 3: Explicitly Handling Geometry and Libraries

Drawing circles and rectangles requires calculating distances and bounds. The
hook correctly utilizes the `geometry` library:

```typescript
const geometry = useMapsLibrary('geometry');

const computeRadius = (start: google.maps.LatLng, end: google.maps.LatLng) => {
  if (geometry?.spherical?.computeDistanceBetween) {
    return geometry.spherical.computeDistanceDistanceBetween(start, end);
  }
  return 0;
};
```

This ensures that the required calculations are performed only after the
`geometry` library is loaded.

### Pattern 4: Using Modern Advanced Markers

The implementation prioritizes the modern `AdvancedMarkerElement` for placing
points (both final markers and temporary polygon vertex indicators). It uses
optional chaining (`markerLibrary?.AdvancedMarkerElement`) to gracefully handle
scenarios where the library might be loading or unavailable, ensuring
compatibility with the modern marker stack.
