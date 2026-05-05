# Changelog

## Unreleased - 2026-05-04

### Added

- Added floating Robot Face controls for much larger manual sizing, with viewport-aware clamping so oversized faces stay reachable.
- Added floating Robot Face motion modes: Still, Idle only, and Full wander.
- Added smoother autonomous Robot Face behavior with varied inspect, perch, peek, and return animations that pause during user interaction.
- Added dashboard page/background tooling, generated animated background rendering, and dashboard theme generation support.
- Added generic MCP, Notion MCP, and Zapier MCP service support for dashboard and AI workflows.
- Added native macOS prototype sources under `native-mac/`.

### Changed

- Reduced the floating Robot Face glow and tuned movement so it stays above widgets without hiding behind them.
- Expanded dashboard widget controls, settings, tests, and documentation for floating overlays, summaries, widget appearance, pages, and integrations.
- Improved text LLM tool-agent behavior, provider configuration, and tool result budgeting.
- Updated Firebase, Electron, Vite, and proxy configuration for the expanded service and deployment surface.

### Fixed

- Fixed robot return motion to use stable visual-only positions instead of persisting autonomous movement.
- Improved dashboard widget sizing, action menus, compact layouts, and freeform bounds coverage with focused tests.
