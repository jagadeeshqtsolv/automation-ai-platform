/** Shared locate helper — scaffolded into each framework under support/locate.ts */
export const LOCATE_HELPER_SOURCE = `import type { Screen } from "@mobilewright/core";
import type { Locator } from "@mobilewright/core";

export type LocatorDef =
  | { strategy: "testId"; value: string }
  | { strategy: "label"; value: string }
  | { strategy: "text"; value: string }
  | { strategy: "placeholder"; value: string }
  | { strategy: "role"; value: string; role: string };

export function locate(screen: Screen, def: LocatorDef): Locator {
  switch (def.strategy) {
    case "testId":
      return screen.getByTestId(def.value);
    case "label":
      return screen.getByLabel(def.value);
    case "text":
      return screen.getByText(def.value);
    case "placeholder":
      return screen.getByPlaceholder(def.value);
    case "role":
      return def.value.length > 0
        ? screen.getByRole(def.role, { name: def.value })
        : screen.getByRole(def.role);
    default: {
      const _exhaustive: never = def;
      return _exhaustive;
    }
  }
}
`;
