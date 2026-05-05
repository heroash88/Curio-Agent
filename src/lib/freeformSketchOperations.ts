export type SketchOperationPoint = { x: number; y: number };
export type SketchLayerItem = { id: string };

export const shouldEditSelectedConnectorFromControl = (
  activeTool: string,
  selectedConnectorId: string | null | undefined,
) => Boolean(selectedConnectorId && activeTool !== 'connector');

export const appendSmoothedSketchPoint = <Point extends SketchOperationPoint>(
  points: Point[],
  rawPoint: Point,
  smoothing = 0.16,
): Point[] => {
  if (points.length < 2) {
    return [...points, rawPoint];
  }

  const previous = points[points.length - 1];
  const beforePrevious = points[points.length - 2];
  const projected = {
    x: previous.x + (previous.x - beforePrevious.x) * 0.35,
    y: previous.y + (previous.y - beforePrevious.y) * 0.35,
  };
  const eased = {
    ...rawPoint,
    x: rawPoint.x * (1 - smoothing) + projected.x * smoothing,
    y: rawPoint.y * (1 - smoothing) + projected.y * smoothing,
  };

  return [...points, eased];
};

export const moveSketchItemToFront = <Item extends SketchLayerItem>(
  items: Item[],
  itemId: string,
): Item[] => {
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0 || index === items.length - 1) return items;
  const next = items.slice();
  const [item] = next.splice(index, 1);
  next.push(item);
  return next;
};

export const moveSketchItemToBack = <Item extends SketchLayerItem>(
  items: Item[],
  itemId: string,
): Item[] => {
  const index = items.findIndex((item) => item.id === itemId);
  if (index <= 0) return items;
  const next = items.slice();
  const [item] = next.splice(index, 1);
  next.unshift(item);
  return next;
};
