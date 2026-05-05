import {
  generateAndApplyDashboardTheme,
  resetDashboardThemeOnActivePage,
} from "../../dashboardThemeGenerator";
import { register } from "../router";

register("generate_dashboard_theme", async (args) => {
  const result = generateAndApplyDashboardTheme(args || {});
  return {
    result,
    emittedCard: false,
  };
});

register("reset_dashboard_theme", async () => {
  const result = resetDashboardThemeOnActivePage();
  return {
    result,
    emittedCard: false,
  };
});
