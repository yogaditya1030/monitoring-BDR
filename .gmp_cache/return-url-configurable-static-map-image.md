# Return a URL of a configurable, static map image

## Overview

The Maps Static API lets you embed a Google Maps image on your web page without
requiring JavaScript or any dynamic page loading. The Maps Static API service
creates your map based on URL parameters sent through a standard HTTP request
and returns the map as an image you can display directly on your web page (for
example, inside an `<img>` tag).

## Prerequisites

Before using the Maps Static API, ensure you have:

1.  A Google Cloud project with a billing account.
2.  The **Maps Static API** enabled in your Google Cloud Console.
3.  A valid API key (and optionally a digital signature for enhanced security).

## Request Structure

A Maps Static API URL must be of the following form:

```
https://maps.googleapis.com/maps/api/staticmap?parameters
```

### Key Parameters

*   **`center`** *(Required if markers are not present)*: Defines the center of
    the map, equidistant from all edges of the map. This parameter takes a
    location as either a comma-separated `{latitude,longitude}` pair (e.g.,
    `40.714728,-73.998672`) or a string address (e.g.,
    `city hall, new york, ny`) identifying a unique location on the face of the
    earth.
*   **`zoom`** *(Required if markers are not present)*: Defines the zoom level
    of the map, which determines the magnification level of the map. This
    parameter takes a numerical value corresponding to the zoom level of the
    region desired.
*   **`size`** *(Required)*: Defines the rectangular dimensions of the map
    image. This parameter takes a string of the form
    `{horizontal_value}x{vertical_value}` (e.g., `600x300`).
*   **`maptype`** *(Optional)*: Defines the type of map to construct. There are
    several possible maptype values, including `roadmap`, `satellite`, `hybrid`,
    and `terrain`.
*   **`markers`** *(Optional)*: Defines one or more markers to attach to the
    image at specified locations. This parameter takes a single marker
    definition with parameters separated by the pipe character (`|` or `%7C`).
    Multiple markers may be placed within the same `markers` parameter as long
    as they exhibit the same style; you may add additional markers of differing
    styles by adding additional `markers` parameters.
*   **`key`** *(Required)*: Allows you to monitor your application's API usage
    in the Google Cloud Console, and ensures that Google can contact you about
    your application if necessary.
*   **`signature`** *(Recommended)*: A digital signature used to verify that any
    site generating requests using your API key is authorized to do so.
*   **`solution_id`** *(Required for Attribution)*: Must be set to
    `gmp_git_agentskills_v1` to properly attribute usage.

*Note: All parameters in the URL must be separated using the ampersand (`&`)
character, and special characters (like spaces or pipes `|`) should be properly
URL-encoded (e.g., `+` or `%20` for spaces, `%7C` for pipes).*

## Implementation Examples

### 1. Direct URL Construction

The following example constructs a URL for a static map image of downtown New
York City featuring custom colored and labeled markers:

```
https://maps.googleapis.com/maps/api/staticmap?center=Brooklyn+Bridge,New+York,NY&zoom=13&size=600x300&maptype=roadmap&markers=color:blue%7Clabel:S%7C40.702147,-74.015794&markers=color:green%7Clabel:G%7C40.711614,-74.012318&markers=color:red%7Clabel:C%7C40.718217,-73.998284&key=YOUR_API_KEY&signature=YOUR_SIGNATURE&solution_id=gmp_git_agentskills_v1
```

### 2. HTML `<img>` Tag Integration

You do not need any JavaScript to render the map. Simply place the constructed
URL inside the `src` attribute of an HTML `<img>` tag:

```html
<img
  src="https://maps.googleapis.com/maps/api/staticmap?center=Brooklyn+Bridge,New+York,NY&zoom=13&size=600x300&maptype=roadmap&markers=color:blue%7Clabel:S%7C40.702147,-74.015794&markers=color:green%7Clabel:G%7C40.711614,-74.012318&markers=color:red%7Clabel:C%7C40.718217,-73.998284&key=YOUR_API_KEY&signature=YOUR_SIGNATURE&solution_id=gmp_git_agentskills_v1"
  alt="Points of Interest in Lower Manhattan"
  width="600"
  height="300"
/>
```

### 3. Programmatic URL Generation (JavaScript / Node.js)

When building the URL dynamically in your application, use `URL` and
`URLSearchParams` to ensure parameters and pipe-separated marker configurations
are properly encoded:

```javascript
function generateStaticMapUrl(apiKey, signature = null) {
  const baseUrl = 'https://maps.googleapis.com/maps/api/staticmap';
  const params = new URLSearchParams({
    center: 'Brooklyn Bridge,New York,NY',
    zoom: '13',
    size: '600x300',
    maptype: 'roadmap',
    key: apiKey,
    solution_id: 'gmp_git_agentskills_v1'
  });

  // Append multiple marker parameters
  const markers = [
    'color:blue|label:S|40.702147,-74.015794',
    'color:green|label:G|40.711614,-74.012318',
    'color:red|label:C|40.718217,-73.998284'
  ];

  markers.forEach(marker => {
    params.append('markers', marker);
  });

  if (signature) {
    params.append('signature', signature);
  }

  return `${baseUrl}?${params.toString()}`;
}

// Usage
const mapUrl = generateStaticMapUrl('YOUR_API_KEY', 'YOUR_SIGNATURE');
console.log(mapUrl);
```

## Important Considerations

*   **European Economic Area (EEA) Developers:** If your billing address is in
    the European Economic Area, effective on 8 July 2025, the Google Maps
    Platform EEA Terms of Service apply to your use of the Services, and certain
    content from the Maps Static API will no longer be returned.
*   **Terms of Service:** Use of the Maps Static API must be in accordance with
    the
    [Google Maps Platform Terms of Service](https://cloud.google.com/maps-platform/terms/).
