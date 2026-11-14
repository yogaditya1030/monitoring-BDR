---
name: maps-static-api-web-api
description: Use this skill when the user wants to generate or embed a non-interactive, static Google Map image into a web page or application using the Maps Static API via HTTP URL requests. Apply this skill to configure static map parameters including image size, scale, format, map type, markers, paths, polygons, and custom cloud-based or inline map styling.
license: Apache-2.0
metadata:
  version: 1.0.54
---

> [!IMPORTANT] **Core Dependency:** This skill requires active context from
> [google-maps-platform/SKILL.md](https://www.gstatic.com/googlemapsplatform-agent-skills/google-maps-platform/SKILL.md).

### Overview

The Maps Static API lets you embed a Google Maps image on your web page without
requiring JavaScript or any dynamic page loading. The Maps Static API service
creates your map based on URL parameters sent through a standard HTTP request
and returns the map as an image you can display on your web page.

Use this skill to construct Maps Static API URLs, configure image dimensions and
formats, add custom markers, draw polylines and polygons, and apply custom map
styles or Map IDs to control the visibility and appearance of map features such
as roads, landmarks, buildings, and labels.

## Primary Orchestration Integration Workflow

Follow this multi-phase sequential integration checklist to compose features
robustly. For each phase, read the referenced capability sub-workflow file and
satisfy its *Evidence Checkpoint* before advancing.

### Phase 1: Core Initialization & Base Setup (Primary)

-   [ ] **Step 1.1: Constructs the baseline HTTP request URL for a configurable
    static map image using required parameters like location, zoom, size, and
    authentication credentials.** Read
    [references/return-url-configurable-static-map-image.md](https://www.gstatic.com/googlemapsplatform-agent-skills/maps-static-api-web-api/references/return-url-configurable-static-map-image.md).
    *Trigger Condition*: Always consult first when generating any Maps Static
    API URL or fetching a static map image. *Evidence Checkpoint*: A valid Maps
    Static API HTTP GET URL is constructed with center/markers, zoom, size, and
    API key/signature, returning a 200 OK image response.

### Phase 2: Feature Layer & Custom Enrichment (Supplemental)

#### Feature Module: Maps (Optional - Use-Case Dependent)

-   [ ] **Embeds the constructed static map image URL directly into an HTML web
    page using an <img> element.** Read
    [references/embed-configurable-static-map-image-into-web-page.md](https://www.gstatic.com/googlemapsplatform-agent-skills/maps-static-api-web-api/references/embed-configurable-static-map-image-into-web-page.md).
    *Dependencies*:
    `["references/return-url-configurable-static-map-image.md"]` \
    *Trigger Condition*: Use when the user wants to display or embed the static
    map image inside an HTML document or web frontend. *Evidence Checkpoint*: An
    HTML <img> tag is present with its src attribute set to a properly formatted
    Maps Static API URL and appropriate alt text.
-   [ ] **Configures the pixel dimensions and high-DPI scale factor of the
    returned static map image via the size and scale URL parameters.** Read
    [references/customize-size-and-scale-static-map-image.md](https://www.gstatic.com/googlemapsplatform-agent-skills/maps-static-api-web-api/references/customize-size-and-scale-static-map-image.md).
    *Dependencies*:
    `["references/return-url-configurable-static-map-image.md"]` \
    *Trigger Condition*: Use when the user needs specific image dimensions,
    custom aspect ratios, or high-resolution (Retina/hidpi) static map output.
    *Evidence Checkpoint*: The request URL includes valid size={width}x{height}
    and optional scale=2 parameters within allowed API dimension limits.
-   [ ] **Specifies the image encoding format (such as PNG, JPEG, or GIF) for
    the static map image using the format URL parameter.** Read
    [references/customize-image-format-static-map-image.md](https://www.gstatic.com/googlemapsplatform-agent-skills/maps-static-api-web-api/references/customize-image-format-static-map-image.md).
    *Dependencies*:
    `["references/return-url-configurable-static-map-image.md"]` \
    *Trigger Condition*: Use when the user requests a specific image file format
    or compression type (e.g., png8, png32, gif, jpg, jpg-baseline). *Evidence
    Checkpoint*: The request URL includes the format parameter set to a
    supported image format identifier.
-   [ ] **Sets the visual base map layer type (roadmap, satellite, terrain, or
    hybrid) using the maptype URL parameter.** Read
    [references/change-map-type.md](https://www.gstatic.com/googlemapsplatform-agent-skills/maps-static-api-web-api/references/change-map-type.md).
    *Dependencies*:
    `["references/return-url-configurable-static-map-image.md"]` \
    *Trigger Condition*: Use when the user wants to switch between roadmap,
    satellite imagery, terrain, or hybrid views on the static map. *Evidence
    Checkpoint*: The request URL contains the maptype parameter set to roadmap,
    satellite, hybrid, or terrain.
-   [ ] **Adds one or more location pin markers onto the static map image using
    the markers URL parameter.** Read
    [references/add-marker-map.md](https://www.gstatic.com/googlemapsplatform-agent-skills/maps-static-api-web-api/references/add-marker-map.md).
    *Dependencies*:
    `["references/return-url-configurable-static-map-image.md"]` \
    *Trigger Condition*: Use when the user wants to place pins or markers at
    specific coordinates or addresses on the static map. *Evidence Checkpoint*:
    The request URL includes one or more markers parameters containing valid
    pipe-separated locations.
-   [ ] **Customizes the appearance of map markers including size, color,
    alphanumeric label, or custom icon URLs and anchor points.** Read
    [references/customize-marker-map.md](https://www.gstatic.com/googlemapsplatform-agent-skills/maps-static-api-web-api/references/customize-marker-map.md).
    *Dependencies*: `["references/return-url-configurable-static-map-image.md",
    "references/add-marker-map.md"]` \
    *Trigger Condition*: Use when the user wants to style markers with custom
    colors, labels, sizes, or custom external icon images. *Evidence
    Checkpoint*: The markers parameter in the request URL includes valid
    pipe-delimited style descriptors (size, color, label, icon, or anchor)
    before the locations.
-   [ ] **Draws polylines, polygons, or encoded paths with custom stroke weight,
    color, and fill color using the path URL parameter.** Read
    [references/add-shape-or-line-map.md](https://www.gstatic.com/googlemapsplatform-agent-skills/maps-static-api-web-api/references/add-shape-or-line-map.md).
    *Dependencies*:
    `["references/return-url-configurable-static-map-image.md"]` \
    *Trigger Condition*: Use when the user wants to draw lines, routes,
    boundaries, polygons, or encoded polylines on the static map. *Evidence
    Checkpoint*: The request URL includes a properly formatted path parameter
    with pipe-separated styling descriptors and at least two points or an enc:
    encoded polyline.
-   [ ] **Creates and applies a Map ID (`map_id` URL parameter) to link the
    static map request to cloud-based map configuration and styling settings.**
    Read
    [references/create-reusable-map-identifier-store-map-configuration-and-styling-settings.md](https://www.gstatic.com/googlemapsplatform-agent-skills/maps-static-api-web-api/references/create-reusable-map-identifier-store-map-configuration-and-styling-settings.md).
    *Dependencies*:
    `["references/return-url-configurable-static-map-image.md"]` \
    *Trigger Condition*: Use when the user wants to use a Map ID or apply Google
    Cloud Console map configurations and styles to a static map. *Evidence
    Checkpoint*: A Map ID is configured and referenced via the map_id parameter
    in the Maps Static API request URL.
-   [ ] **Creates a reusable custom map style in the Google Cloud Console or via
    URL style parameters to customize map presentation across platforms.** Read
    [references/create-reusable-cross-platform-map-style.md](https://www.gstatic.com/googlemapsplatform-agent-skills/maps-static-api-web-api/references/create-reusable-cross-platform-map-style.md).
    *Dependencies*: `["references/return-url-configurable-static-map-image.md",
    "references/create-reusable-map-identifier-store-map-configuration-and-styling-settings.md"]` \
    *Trigger Condition*: Use when the user wants to create a custom map theme or
    reusable style that can be shared across Maps Static API and other Google
    Maps platforms. *Evidence Checkpoint*: Custom map style rules or a styled
    Map ID are defined and applied to the static map URL.
-   [ ] **Controls the visibility of specific map features (such as points of
    interest, transit, or administrative boundaries) using URL style rules or
    Cloud styling.** Read
    [references/display-or-hide-map-features.md](https://www.gstatic.com/googlemapsplatform-agent-skills/maps-static-api-web-api/references/display-or-hide-map-features.md).
    *Dependencies*:
    `["references/return-url-configurable-static-map-image.md"]` \
    *Trigger Condition*: Use when the user wants to show, hide, or simplify
    specific map elements or layers on the static map. *Evidence Checkpoint*:
    Visibility styling rules (e.g., visibility:off or visibility:simplified) or
    Cloud style visibility toggles are properly applied to the target map
    features.
-   [ ] **Customizes the fill color, stroke color, weight, and visibility of
    road networks and geometric map features.** Read
    [references/change-style-roads-polylines-and-polygons-map.md](https://www.gstatic.com/googlemapsplatform-agent-skills/maps-static-api-web-api/references/change-style-roads-polylines-and-polygons-map.md).
    *Dependencies*:
    `["references/return-url-configurable-static-map-image.md"]` \
    *Trigger Condition*: Use when the user wants to change the colors, outlines,
    or styling of roads, highways, water bodies, parks, or other geometric map
    features. *Evidence Checkpoint*: Map style parameters or Cloud style
    settings targeting road or geometry elements are properly formatted and
    applied.
-   [ ] **Customizes the text fill color, text stroke outline, and icon colors
    of map labels and point-of-interest pins.** Read
    [references/change-style-icons-and-text-labels-map.md](https://www.gstatic.com/googlemapsplatform-agent-skills/maps-static-api-web-api/references/change-style-icons-and-text-labels-map.md).
    *Dependencies*:
    `["references/return-url-configurable-static-map-image.md"]` \
    *Trigger Condition*: Use when the user wants to style map text labels,
    typography colors, or POI icons on the static map. *Evidence Checkpoint*:
    Style rules targeting label text (labels.text.fill, labels.text.stroke) or
    icons (labels.icon) are properly configured.
-   [ ] **Configures zoom-level-dependent styling rules in Cloud-based maps
    styling so map features change appearance at specified zoom thresholds.**
    Read
    [references/apply-different-map-styles-different-zoom-levels.md](https://www.gstatic.com/googlemapsplatform-agent-skills/maps-static-api-web-api/references/apply-different-map-styles-different-zoom-levels.md).
    *Dependencies*: `["references/return-url-configurable-static-map-image.md",
    "references/create-reusable-map-identifier-store-map-configuration-and-styling-settings.md",
    "references/create-reusable-cross-platform-map-style.md"]` \
    *Trigger Condition*: Use when the user wants map colors, visibility, or
    styles to vary dynamically depending on the zoom level of the map. *Evidence
    Checkpoint*: Zoom-level stops and associated style values are configured in
    the Cloud-based map style and linked via map_id.
-   [ ] **Adjusts the density of displayed points of interest (POIs) and place
    labels on the map using Cloud-based map styling.** Read
    [references/change-density-places-map.md](https://www.gstatic.com/googlemapsplatform-agent-skills/maps-static-api-web-api/references/change-density-places-map.md).
    *Dependencies*: `["references/return-url-configurable-static-map-image.md",
    "references/create-reusable-map-identifier-store-map-configuration-and-styling-settings.md",
    "references/create-reusable-cross-platform-map-style.md"]` \
    *Trigger Condition*: Use when the user wants to increase or decrease the
    clutter or number of POI pins and business labels shown on the map.
    *Evidence Checkpoint*: POI density settings are configured in the
    Cloud-based map style and applied to the static map via a Map ID.
-   [ ] **Customizes the appearance, footprint colors, and 3D/2D representation
    of buildings on the map.** Read
    [references/change-style-buildings-map.md](https://www.gstatic.com/googlemapsplatform-agent-skills/maps-static-api-web-api/references/change-style-buildings-map.md).
    *Dependencies*:
    `["references/return-url-configurable-static-map-image.md"]` \
    *Trigger Condition*: Use when the user wants to style building footprints or
    change building colors and visibility on the map. *Evidence Checkpoint*:
    Building feature styling rules (such as landscape.man_made.building or Cloud
    building styles) are configured and applied.
-   [ ] **Configures the visibility and visual styling of prominent landmark
    icons and structures on the map using Cloud-based map styling.** Read
    [references/change-style-landmarks-map.md](https://www.gstatic.com/googlemapsplatform-agent-skills/maps-static-api-web-api/references/change-style-landmarks-map.md).
    *Dependencies*: `["references/return-url-configurable-static-map-image.md",
    "references/create-reusable-map-identifier-store-map-configuration-and-styling-settings.md",
    "references/create-reusable-cross-platform-map-style.md"]` \
    *Trigger Condition*: Use when the user wants to customize, highlight, or
    hide prominent landmarks on the map. *Evidence Checkpoint*: Landmark styling
    configurations are set in the Cloud-based map style and referenced via a Map
    ID in the static map request.
