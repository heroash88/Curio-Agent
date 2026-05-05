import React, { useMemo, useState, useRef, useEffect } from "react";
import { useGoogleApiKey } from "../../utils/settingsStorage";

export interface PreviewLocation {
  latitude: number;
  longitude: number;
}

interface LegacyImagePreviewProps {
  src: string;
  alt: string;
  className?: string;
}

interface DirectionsPreviewProps {
  encodedPolyline?: string;
  destination: string;
  travelMode?: string;
  staticMapUrl?: string;
  zoomOffset?: number;
  className?: string;
}

interface LocationPreviewProps {
  location?: PreviewLocation;
  label: string;
  staticMapUrl?: string;
  className?: string;
}

interface TileDescriptor {
  key: string;
  offsetX: number;
  offsetY: number;
  url: string;
}

interface TileScene {
  tiles: TileDescriptor[];
  width: number;
  height: number;
  attribution: string;
}

interface RouteScene extends TileScene {
  path: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

interface MarkerScene extends TileScene {
  marker: { x: number; y: number };
}

const TILE_SIZE = 256;
const MAX_LATITUDE = 85.05112878;
const ROUTE_VIEWPORT = { width: 1000, height: 500, padding: 48 };

const modeStroke: Record<string, string> = {
  walking: "#2563EB",
  bicycling: "#059669",
  transit: "#D97706",
  driving: "#DC2626",
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const useContainerSize = (ref: React.RefObject<HTMLDivElement | null>) => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;
    let frame = 0;
    let hasMeasured = false;

    const commitSize = (nextWidth: number, nextHeight: number) => {
      setSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }
        return { width: nextWidth, height: nextHeight };
      });
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextWidth = Math.round(entry.contentRect.width);
      const nextHeight = Math.round(entry.contentRect.height);

      if (!hasMeasured) {
        hasMeasured = true;
        commitSize(nextWidth, nextHeight);
        return;
      }

      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        commitSize(nextWidth, nextHeight);
      });
    });

    observer.observe(ref.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ref]);

  return size;
};

export const decodePolyline = (encoded: string): PreviewLocation[] => {
  if (!encoded) {
    return [];
  }

  const points: PreviewLocation[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length + 1);

    latitude += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length + 1);

    longitude += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    points.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5,
    });
  }

  return points;
};

const toWorldPixels = (
  { latitude, longitude }: PreviewLocation,
  zoom: number,
) => {
  const scale = TILE_SIZE * 2 ** zoom;
  const clampedLatitude = clamp(latitude, -MAX_LATITUDE, MAX_LATITUDE);
  const sinLatitude = Math.sin((clampedLatitude * Math.PI) / 180);

  return {
    x: ((longitude + 180) / 360) * scale,
    y:
      (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) *
      scale,
  };
};

const wrapTileX = (tileX: number, zoom: number) => {
  const tileCount = 2 ** zoom;
  return ((tileX % tileCount) + tileCount) % tileCount;
};

const buildTileScene = (
  center: PreviewLocation,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
  useGoogleTiles: boolean = false,
): TileScene => {
  const tileCount = 2 ** zoom;
  const centerPixels = toWorldPixels(center, zoom);
  const worldHeight = tileCount * TILE_SIZE;
  const topOffset = clamp(
    centerPixels.y - viewportHeight / 2,
    0,
    Math.max(worldHeight - viewportHeight, 0),
  );
  const leftOffset = centerPixels.x - viewportWidth / 2;

  const minTileX = Math.floor(leftOffset / TILE_SIZE);
  const maxTileX = Math.floor((leftOffset + viewportWidth) / TILE_SIZE);
  const minTileY = Math.floor(topOffset / TILE_SIZE);
  const maxTileY = Math.floor((topOffset + viewportHeight) / TILE_SIZE);

  const centerX = leftOffset + viewportWidth / 2;
  const centerY = topOffset + viewportHeight / 2;

  const tiles: TileDescriptor[] = [];
  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    if (tileY < 0 || tileY >= tileCount) {
      continue;
    }

    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      const url = useGoogleTiles
        ? `https://mt1.google.com/vt/lyrs=m&x=${tileX}&y=${tileY}&z=${zoom}`
        : `https://tile.openstreetmap.org/${zoom}/${wrapTileX(tileX, zoom)}/${tileY}.png`;

      tiles.push({
        key: `${zoom}-${tileX}-${tileY}`,
        offsetX: tileX * TILE_SIZE - centerX,
        offsetY: tileY * TILE_SIZE - centerY,
        url,
      });
    }
  }

  return {
    tiles,
    width: viewportWidth,
    height: viewportHeight,
    attribution: useGoogleTiles ? "Google" : "OpenStreetMap",
  };
};

const computeRouteZoom = (
  points: PreviewLocation[],
  viewportWidth: number,
  viewportHeight: number,
  padding: number,
) => {
  if (points.length <= 1) {
    return 15;
  }

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const northWest = {
    latitude: Math.max(...latitudes),
    longitude: Math.min(...longitudes),
  };
  const southEast = {
    latitude: Math.min(...latitudes),
    longitude: Math.max(...longitudes),
  };

  for (let zoom = 16; zoom >= 2; zoom -= 1) {
    const northWestPixels = toWorldPixels(northWest, zoom);
    const southEastPixels = toWorldPixels(southEast, zoom);
    const pixelWidth = Math.abs(southEastPixels.x - northWestPixels.x);
    const pixelHeight = Math.abs(southEastPixels.y - northWestPixels.y);

    if (
      pixelWidth <= viewportWidth - padding * 2 &&
      pixelHeight <= viewportHeight - padding * 2
    ) {
      return zoom;
    }
  }

  return 2;
};

const buildRouteScene = (
  points: PreviewLocation[],
  viewportWidth: number,
  viewportHeight: number,
  zoomOffset: number = 0,
  useGoogleTiles: boolean = false,
): RouteScene | null => {
  if (points.length === 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return null;
  }

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const center = {
    latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
  };

  const zoom = clamp(
    computeRouteZoom(
      points,
      viewportWidth,
      viewportHeight,
      ROUTE_VIEWPORT.padding,
    ) + Math.round(zoomOffset),
    2,
    18,
  );
  const tileScene = buildTileScene(
    center,
    zoom,
    viewportWidth,
    viewportHeight,
    useGoogleTiles,
  );
  const centerPixels = toWorldPixels(center, zoom);
  const leftOffset = centerPixels.x - viewportWidth / 2;
  const topOffset = clamp(
    centerPixels.y - viewportHeight / 2,
    0,
    Math.max(TILE_SIZE * 2 ** zoom - viewportHeight, 0),
  );

  const projected = points.map((point) => {
    const worldPixels = toWorldPixels(point, zoom);
    return {
      x: worldPixels.x - leftOffset,
      y: worldPixels.y - topOffset,
    };
  });

  const path = projected
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");

  return {
    ...tileScene,
    path,
    start: projected[0],
    end: projected[projected.length - 1],
  };
};

const buildMarkerScene = (
  location: PreviewLocation,
  width: number,
  height: number,
  useGoogleTiles: boolean = false,
): MarkerScene => {
  const zoom = 14;
  const tileScene = buildTileScene(
    location,
    zoom,
    width,
    height,
    useGoogleTiles,
  );
  const centerPixels = toWorldPixels(location, zoom);
  const leftOffset = centerPixels.x - width / 2;
  const topOffset = clamp(
    centerPixels.y - height / 2,
    0,
    Math.max(TILE_SIZE * 2 ** zoom - height, 0),
  );
  const markerPixels = toWorldPixels(location, zoom);

  return {
    ...tileScene,
    marker: {
      x: markerPixels.x - leftOffset,
      y: markerPixels.y - topOffset,
    },
  };
};

const PreviewShell: React.FC<{
  title: string;
  className?: string;
  children: React.ReactNode;
}> = ({ title, className = "", children }) => (
  <div
    className={`relative overflow-hidden rounded-xl border border-white/5 bg-slate-950/85 shadow-inner ${className}`.trim()}
    aria-label={title}
  >
    {children}
  </div>
);

const PreviewFallback: React.FC<{
  title: string;
  subtitle: string;
  className?: string;
}> = ({ title, subtitle, className }) => (
  <PreviewShell title={title} className={className}>
    <div className="flex aspect-[2/1] items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.25),transparent_45%),linear-gradient(180deg,rgba(15,23,42,0.95),rgba(30,41,59,0.92))] px-4 text-center">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
          Map Preview
        </div>
        <div className="mt-1 text-sm font-semibold text-white/80">
          {subtitle}
        </div>
      </div>
    </div>
  </PreviewShell>
);

const LegacyImagePreview: React.FC<LegacyImagePreviewProps> = ({
  src,
  alt,
  className,
}) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <PreviewFallback
        title={alt}
        subtitle="Preview unavailable"
        className={className}
      />
    );
  }

  return (
    <PreviewShell title={alt} className={className}>
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </PreviewShell>
  );
};

const TileBackdrop: React.FC<{
  title: string;
  scene: TileScene;
  overlay: React.ReactNode;
  className?: string;
  aspectClassName: string;
  attributionClassName?: string;
}> = ({
  title,
  scene,
  overlay,
  className,
  aspectClassName,
  attributionClassName = "bottom-2 right-2",
}) => {
  const isGoogle = scene.attribution === "Google";

  return (
    <PreviewShell title={title} className={className}>
      <div className={`relative overflow-hidden ${aspectClassName}`}>
        {!isGoogle && (
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.08),rgba(15,23,42,0.22))]" />
        )}
        {scene.tiles.map((tile) => (
          <img
            key={tile.key}
            src={tile.url}
            alt=""
            aria-hidden="true"
            className="absolute max-w-none select-none"
            style={{
              left: `calc(50% + ${tile.offsetX}px)`,
              top: `calc(50% + ${tile.offsetY}px)`,
              width: `${TILE_SIZE}px`,
              height: `${TILE_SIZE}px`,
            }}
            draggable={false}
            loading="lazy"
            decoding="async"
            referrerPolicy={isGoogle ? "no-referrer" : "origin"}
            crossOrigin={isGoogle ? "anonymous" : undefined}
          />
        ))}
        {!isGoogle && (
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.10),rgba(15,23,42,0.32))]" />
        )}
        {overlay}
        <div
          className={`pointer-events-none absolute rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-white/70 ${attributionClassName}`}
        >
          © {scene.attribution}
        </div>
      </div>
    </PreviewShell>
  );
};

export const DirectionsPreview: React.FC<DirectionsPreviewProps> = ({
  encodedPolyline,
  destination,
  travelMode = "driving",
  staticMapUrl,
  zoomOffset = 0,
  className = "mb-4 aspect-[2/1]",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(containerRef);
  const googleApiKey = useGoogleApiKey();
  const useGoogleTiles = !!googleApiKey;

  const scene = useMemo(() => {
    if (!encodedPolyline || size.width <= 0) {
      return null;
    }

    try {
      return buildRouteScene(
        decodePolyline(encodedPolyline),
        size.width,
        size.height,
        zoomOffset,
        useGoogleTiles,
      );
    } catch {
      return null;
    }
  }, [encodedPolyline, size.width, size.height, useGoogleTiles, zoomOffset]);

  if (!scene) {
    if (staticMapUrl) {
      return (
        <div ref={containerRef} className={className}>
          <LegacyImagePreview
            src={staticMapUrl}
            alt={`Map to ${destination}`}
            className="h-full w-full"
          />
        </div>
      );
    }

    return (
      <div ref={containerRef} className={className}>
        <PreviewFallback
          title={`Map to ${destination}`}
          subtitle="Route preview unavailable"
          className="h-full w-full"
        />
      </div>
    );
  }

  const stroke = modeStroke[travelMode] || modeStroke.driving;

  return (
    <div ref={containerRef} className={className}>
      <TileBackdrop
        title={`Map to ${destination}`}
        scene={scene}
        className="h-full w-full"
        aspectClassName="h-full w-full"
        overlay={
          <svg
            viewBox={`0 0 ${scene.width} ${scene.height}`}
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label={`Route preview to ${destination}`}
            data-testid="directions-preview"
          >
            <path
              d={scene.path}
              fill="none"
              stroke="rgba(15,23,42,0.40)"
              strokeWidth="18"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={scene.path}
              fill="none"
              stroke="rgba(255,255,255,0.45)"
              strokeWidth="11"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={scene.path}
              fill="none"
              stroke={stroke}
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx={scene.start.x}
              cy={scene.start.y}
              r="10"
              fill="rgba(255,255,255,0.92)"
            />
            <circle
              cx={scene.start.x}
              cy={scene.start.y}
              r="4.5"
              fill={stroke}
            />
            <circle
              cx={scene.end.x}
              cy={scene.end.y}
              r="11"
              fill="rgba(255,255,255,0.96)"
            />
            <circle cx={scene.end.x} cy={scene.end.y} r="4.5" fill="#DC2626" />
          </svg>
        }
      />
    </div>
  );
};

export const LocationPreview: React.FC<LocationPreviewProps> = ({
  location,
  label,
  staticMapUrl,
  className = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(containerRef);
  const googleApiKey = useGoogleApiKey();
  const useGoogleTiles = !!googleApiKey;

  const scene = useMemo(() => {
    if (!location || size.width <= 0) return null;
    return buildMarkerScene(location, size.width, size.height, useGoogleTiles);
  }, [location, size.width, size.height, useGoogleTiles]);

  if (!scene) {
    if (staticMapUrl) {
      return (
        <div ref={containerRef} className={className}>
          <LegacyImagePreview
            src={staticMapUrl}
            alt={label}
            className="h-full w-full"
          />
        </div>
      );
    }

    return (
      <div ref={containerRef} className={className}>
        <PreviewFallback
          title={label}
          subtitle="Preview unavailable"
          className="h-full w-full"
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={className}>
      <TileBackdrop
        title={label}
        scene={scene}
        className="h-full w-full"
        aspectClassName="h-full w-full"
        attributionClassName="bottom-1 right-1"
        overlay={
          <svg
            viewBox={`0 0 ${scene.width} ${scene.height}`}
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label={label}
            data-testid="location-preview"
          >
            <circle
              cx={scene.marker.x}
              cy={scene.marker.y}
              r="14"
              fill="rgba(239,68,68,0.18)"
            />
            <path
              d={`M ${scene.marker.x} ${scene.marker.y - 16} C ${scene.marker.x + 7} ${scene.marker.y - 16}, ${scene.marker.x + 12} ${scene.marker.y - 10}, ${scene.marker.x + 12} ${scene.marker.y - 2} C ${scene.marker.x + 12} ${scene.marker.y + 7}, ${scene.marker.x} ${scene.marker.y + 18}, ${scene.marker.x} ${scene.marker.y + 18} C ${scene.marker.x} ${scene.marker.y + 18}, ${scene.marker.x - 12} ${scene.marker.y + 7}, ${scene.marker.x - 12} ${scene.marker.y - 2} C ${scene.marker.x - 12} ${scene.marker.y - 10}, ${scene.marker.x - 7} ${scene.marker.y - 16}, ${scene.marker.x} ${scene.marker.y - 16} Z`}
              fill="#EF4444"
              stroke="rgba(15,23,42,0.25)"
              strokeWidth="1.5"
            />
            <circle
              cx={scene.marker.x}
              cy={scene.marker.y - 3}
              r="5"
              fill="#F8FAFC"
            />
          </svg>
        }
      />
    </div>
  );
};
