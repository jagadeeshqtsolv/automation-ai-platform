function appendMethodsBeforeClassClose(content: string, methods: string): string {
  const trimmed = content.trimEnd();
  if (!trimmed.endsWith("}")) {
    return content;
  }
  return `${trimmed.slice(0, -1)}\n${methods}\n}\n`;
}

/** Web page-object flows (click/fill naming — not mobile tap). */
export function enrichWebPageObjectWithFlowMethods(content: string): string {
  let out = content;

  if (
    !/\bperformLogin\s*\(/.test(out) &&
    /\bfill(?:UserName|Username)\s*\(/.test(out) &&
    /\bfillPassword\s*\(/.test(out) &&
    /\bclick(?:Login|LoginButton|SignIn)\s*\(/.test(out)
  ) {
    const fillUserMethod = /\bfillUserName\s*\(/.test(out)
      ? "fillUserName"
      : /\bfillUsername\s*\(/.test(out)
        ? "fillUsername"
        : "fillUserName";
    const loginMethod = /\bclickSignIn\s*\(/.test(out)
      ? "clickSignIn"
      : /\bclickLoginButton\s*\(/.test(out)
        ? "clickLoginButton"
        : "clickLogin";
    const body = [
      `  async performLogin(username: string, password: string): Promise<void> {`,
      `    await this.${fillUserMethod}(username);`,
      `    await this.fillPassword(password);`,
      `    await this.${loginMethod}();`,
      `  }`,
      ``,
    ].join("\n");
    out = appendMethodsBeforeClassClose(out, body);
  }

  if (!/\bperformLogout\s*\(/.test(out) && /\bclickLogout\s*\(/.test(out)) {
    const body = [
      `  async performLogout(): Promise<void> {`,
      `    await this.clickLogout();`,
      `  }`,
      ``,
    ].join("\n");
    out = appendMethodsBeforeClassClose(out, body);
  }

  return out;
}

export function appendWebFlowMethodsToMethodSummary(
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
