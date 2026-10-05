// The single source of truth for the studio's physical location. Every place
// that shows an address or a map/directions link must come from here — never a
// literal in a page, email or component.
export const STUDIO_LOCATION = {
  name: "Kavarna City Center",
  city: "Каварна",
  lat: 43.4359705,
  lng: 28.337232,
} as const;

export const STUDIO_ADDRESS_LINE = `${STUDIO_LOCATION.name}, ${STUDIO_LOCATION.city}`;

export const STUDIO_MAP_URL = `https://www.google.com/maps/search/?api=1&query=${STUDIO_LOCATION.lat},${STUDIO_LOCATION.lng}`;

export const STUDIO_DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${STUDIO_LOCATION.lat},${STUDIO_LOCATION.lng}`;
