function pascalCaseLocatorKey(key: string): string {
  if (key.length === 0) return key;
  return `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

function appendMethodsBeforeClassClose(content: string, methods: string): string {
  const trimmed = content.trimEnd();
  if (!trimmed.endsWith("}")) {
    return content;
  }
  return `${trimmed.slice(0, -1)}\n${methods}\n}\n`;
}

/** Adds composed flows (e.g. performLogin) when atomic steps already exist. */
export function enrichPageObjectWithFlowMethods(content: string): string {
  let out = content;

  if (
    !/\bperformLogin\s*\(/.test(out) &&
    /\bfillUsername\s*\(/.test(out) &&
    /\bfillPassword\s*\(/.test(out) &&
    /\btapLogin\s*\(/.test(out)
  ) {
    const includesAssert = /\bassertOnLoginScreen\s*\(/.test(out);
    const body = includesAssert
      ? [
          `  async performLogin(username: string, password: string): Promise<void> {`,
          `    await this.assertOnLoginScreen();`,
          `    await this.fillUsername(username);`,
          `    await this.fillPassword(password);`,
          `    await this.tapLogin();`,
          `  }`,
          ``,
        ].join("\n")
      : [
          `  async performLogin(username: string, password: string): Promise<void> {`,
          `    await this.fillUsername(username);`,
          `    await this.fillPassword(password);`,
          `    await this.tapLogin();`,
          `  }`,
          ``,
        ].join("\n");
    out = appendMethodsBeforeClassClose(out, body);
  }

  if (!/\bperformLogout\s*\(/.test(out) && /\btapLogout\s*\(/.test(out)) {
    const body = [
      `  async performLogout(): Promise<void> {`,
      `    await this.tapLogout();`,
      `  }`,
      ``,
    ].join("\n");
    out = appendMethodsBeforeClassClose(out, body);
  }

  return out;
}

/** Adds expectOpenMenuVisible-style helpers for each locator in `L` when missing. */
export function enrichPageObjectWithExpectVisibilityMethods(content: string): string {
  const classMatch = content.match(/export class (\w+)/);
  const lBlockMatch = content.match(/private static readonly L = \{([\s\S]*?)\} as const/);
  if (classMatch === null || lBlockMatch === null) {
    return content;
  }

  const className = classMatch[1];
  const entryPattern = /(\w+):\s*\{[^}]*value:\s*(['"])(.*?)\2/g;
  const methods: string[] = [];

  for (const match of lBlockMatch[1].matchAll(entryPattern)) {
    const key = match[1];
    const methodName = `expect${pascalCaseLocatorKey(key)}Visible`;
    if (new RegExp(`\\basync\\s+${methodName}\\s*\\(`).test(content)) {
      continue;
    }
    methods.push(
      [
        `  async ${methodName}(timeoutMs = 30_000): Promise<void> {`,
        `    await expectLocatorVisible(locate(this.screen, ${className}.L.${key}), timeoutMs);`,
        `  }`,
        ``,
      ].join("\n"),
    );
  }

  if (methods.length === 0) {
    return content;
  }

  return appendMethodsBeforeClassClose(content, methods.join("\n"));
}

export function appendFlowMethodsToMethodSummary(
  methodSummary: string,
  content: string,
): string {
  const extra: string[] = [];
  if (/\bperformLogin\s*\(/.test(content)) extra.push("performLogin(username, password)");
  if (/\bperformLogout\s*\(/.test(content)) extra.push("performLogout()");
  if (extra.length === 0) return methodSummary;
  const base = methodSummary.trim();
  if (base.length === 0) return extra.join(", ");
  return `${base}, ${extra.join(", ")}`;
}
