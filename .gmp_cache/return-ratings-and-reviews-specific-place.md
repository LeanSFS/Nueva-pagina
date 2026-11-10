# Return Ratings and Reviews for a Specific Place

This workflow demonstrates how to retrieve ratings, user rating counts, and
detailed reviews for a place using the Places API (New) Web Service.

## Overview

In the Places API (New), you must explicitly specify the fields you want
returned in the response by providing a **FieldMask** via the `X-Goog-FieldMask`
HTTP header. If you omit the field mask or pass an empty mask, the API returns
an error.

### Relevant Fields and Pricing Tiers (SKUs)

Field Description                               | Property Field    | Pricing Tier (SKU)
:---------------------------------------------- | :---------------- | :-----------------
**Rating** (1.0 to 5.0 average)                 | `rating`          | Place Details / Text Search / Nearby Search **Enterprise**
**User rating count** (Total number of ratings) | `userRatingCount` | Place Details / Text Search / Nearby Search **Enterprise**
**Reviews** (Array of up to 5 user reviews)     | `reviews`         | Place Details / Text Search / Nearby Search **Enterprise + Atmosphere**
**AI-powered review summary**                   | `reviewSummary`   | Place Details / Text Search / Nearby Search **Enterprise + Atmosphere**

> **Billing Note:** A request is billed at the highest SKU tier of all the
> fields included in your `X-Goog-FieldMask`. Requesting `rating` and
> `userRatingCount` triggers the **Enterprise** SKU, whereas adding `reviews` or
> `reviewSummary` elevates the request to the **Enterprise + Atmosphere** SKU.

--------------------------------------------------------------------------------

## Prerequisites

1.  **Google Cloud Project & Billing:** Ensure you have a project with an active
    billing account and the **Places API (New)** enabled.
2.  **API Key:** Obtain an API key restricted to the Places API (New).
3.  **Place ID (For Place Details):** If you are querying the Place Details
    endpoint directly (`https://places.googleapis.com/v1/places/{PLACE_ID}`),
    you need a valid Place ID (e.g., `ChIJj61dQgK6j4AR4GeTYWZsKWw`). If you do
    not have a Place ID, you can retrieve ratings and reviews directly via a
    Text Search or Nearby Search request.

--------------------------------------------------------------------------------

## Implementation

### Option 1: Using Place Details (New) with a Known Place ID

Use a `GET` request to `https://places.googleapis.com/v1/places/{PLACE_ID}`.
Note that for `Place Details`, the field mask uses top-level property names
(`rating,userRatingCount,reviews`).

#### cURL Example

```bash
curl -X GET "https://places.googleapis.com/v1/places/ChIJj61dQgK6j4AR4GeTYWZsKWw" \
  -H "Content-Type: application/json" \
  -H "X-Goog-Api-Key: YOUR_API_KEY" \
  -H "X-Goog-FieldMask: id,displayName,rating,userRatingCount,reviews,reviewSummary" \
  -H "X-Goog-Maps-Solution-ID: gmp_git_agentskills_v1"
```

#### JavaScript (`fetch`) Example

```javascript
async function getPlaceRatingsAndReviews(placeId, apiKey) {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;

  const fields = [
    'id',
    'displayName',
    'rating',
    'userRatingCount',
    'reviews',
    'reviewSummary'
  ].join(',');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fields,
      'X-Goog-Maps-Solution-ID': 'gmp_git_agentskills_v1'
    }
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(`Places API Error (${response.status}): ${errorDetails}`);
  }

  const data = await response.json();
  return data;
}
```

--------------------------------------------------------------------------------

### Option 2: Using Text Search (New) Without a Known Place ID

If you don't have a Place ID yet, you can query
`https://places.googleapis.com/v1/places:searchText` via `POST` and request the
ratings and reviews in the same call.

> **Important:** For `Text Search` and `Nearby Search`, the field paths in
> `X-Goog-FieldMask` must be prefixed with `places.` (e.g., `places.rating`,
> `places.reviews`).

#### cURL Example

```bash
curl -X POST "https://places.googleapis.com/v1/places:searchText" \
  -H "Content-Type: application/json" \
  -H "X-Goog-Api-Key: YOUR_API_KEY" \
  -H "X-Goog-FieldMask: places.id,places.displayName,places.rating,places.userRatingCount,places.reviews" \
  -H "X-Goog-Maps-Solution-ID: gmp_git_agentskills_v1" \
  -d '{
    "textQuery": "Spicy Vegetarian Food in Sydney, Australia",
    "maxResultCount": 1
  }'
```

--------------------------------------------------------------------------------

## Example Response Structure

When requesting `id,displayName,rating,userRatingCount,reviews` from Place
Details (New), the JSON response is structured as follows:

```json
{
  "id": "ChIJj61dQgK6j4AR4GeTYWZsKWw",
  "displayName": {
    "text": "Googleplex",
    "languageCode": "en"
  },
  "rating": 4.3,
  "userRatingCount": 2654,
  "reviews": [
    {
      "name": "places/ChIJj61dQgK6j4AR4GeTYWZsKWw/reviews/ChdDSUhNMG9nS0VJQ0FnSUNVck95d2pBRRAB",
      "relativePublishTimeDescription": "2 months ago",
      "rating": 5,
      "text": {
        "text": "Great campus with amazing visitor center and cafe options.",
        "languageCode": "en"
      },
      "originalText": {
        "text": "Great campus with amazing visitor center and cafe options.",
        "languageCode": "en"
      },
      "authorAttribution": {
        "displayName": "Jane Doe",
        "uri": "https://www.google.com/maps/contrib/...",
        "photoUri": "https://lh3.googleusercontent.com/a-/..."
      },
      "publishTime": "2024-11-15T18:30:12Z",
      "flagContentUri": "https://www.google.com/local/review/rap/report?...",
      "googleMapsUri": "https://www.google.com/maps/reviews/data=..."
    }
  ]
}
```

### Handling Attribution Requirements

When displaying `reviews` in your application, ensure you display the
`authorAttribution` (`displayName`, `uri`, and `photoUri` if applicable)
alongside each review to comply with Google Maps Platform Terms of Service.
