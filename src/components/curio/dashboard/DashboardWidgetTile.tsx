import React from "react";
import {
  DashboardWidgetFrame,
  type DashboardWidgetFrameProps,
} from "./DashboardWidgetFrame";

/**
 * Per-widget tile wrapper that renders a `DashboardWidgetFrame` with
 * an optional action menu alongside it.
 */
export interface DashboardWidgetTileProps
  extends DashboardWidgetFrameProps {
  /** Renders alongside the frame (the 3-dot action menu portal). */
  actionMenu?: React.ReactNode;
}

const DashboardWidgetTileImpl: React.FC<DashboardWidgetTileProps> = ({
  actionMenu,
  ...frameProps
}) => {
  return (
    <>
      <DashboardWidgetFrame {...frameProps} />
      {actionMenu}
    </>
  );
};

export const DashboardWidgetTile = React.memo(DashboardWidgetTileImpl);
