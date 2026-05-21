/** Align generated page objects with Mobilewright APIs (locator actions, not screen.tap). */
export function sanitizePageObjectFileContent(content: string): string {
  let out = content;

  if (!/import\s+\{\s*expect\s*\}\s+from\s+['"]@mobilewright\/test['"]/.test(out)) {
    out = out.replace(
      /^(import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"]\s*;?\n)/m,
      `$1import { expect } from '@mobilewright/test';\n`,
    );
  }

  out = out.replace(
    /await\s+this\.screen\.tap\s*\(\s*locate\s*\(\s*this\.screen\s*,/g,
    "await locate(this.screen,",
  );
  out = out.replace(
    /await\s+locate\s*\(\s*this\.screen\s*,\s*([^)]+)\)\s*\)\s*;/g,
    "await locate(this.screen, $1).tap();",
  );

  out = out.replace(
    /await\s+this\.screen\.fill\s*\(\s*locate\s*\(\s*this\.screen\s*,\s*([^)]+)\)\s*,\s*/g,
    "await locate(this.screen, $1).fill(",
  );

  out = out.replace(
    /await\s+this\.screen\.expect\s*\(\s*locate\s*\(\s*this\.screen\s*,\s*([^)]+)\)\s*\)/g,
    "await expect(locate(this.screen, $1))",
  );

  out = out.replace(
    /await\s+this\.screen\.queryAllByRole\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    "await this.screen.getByRole('$1').all()",
  );

  out = out.replace(/\.findByLabelText\s*\(/g, ".getByLabel(");
  out = out.replace(/await\s+(\w+)\.textContent\s*\(\s*\)/g, "await $1.getText()");
  out = out.replace(/await\s+(\w+Label)\.textContent\s*\(\s*\)/g, "await $1.getText()");

  out = out.replace(
    /\{\s*strategy:\s*['"]role['"]\s*,\s*value:\s*['"]([^'"]+)['"]\s*\}/g,
    "{ strategy: 'role', role: '$1', value: '' }",
  );

  return out.trim() + "\n";
}
