import type { WebPageElement, WebPageElementActionKind } from "@automation-ai/core";

const BUTTON_KEY_RE =
  /(?:^|)(button|btn|submit|login|signin|signup|signIn|addToCart|checkout|continue|next|menu|cart|close|cancel|save|ok)(?:$|[A-Z_])/i;
const FIELD_KEY_RE =
  /(?:password|passwd|username|userName|user-?name|email|e-mail|search|field|textbox|postal|zip|phone|first-?name|last-?name|address|city|state)/i;
const BUTTON_VALUE_RE =
  /#(?:login|submit|sign|continue|next|cart|checkout|menu|add)[\w-]*|(?:button|submit|login-button|login_button)/i;

/** Refines parser actionKind using key, locator value, and role (fixes submit inputs missing type). */
export function resolveWebActionKind(el: WebPageElement): WebPageElementActionKind {
  if (el.actionKind === "checkbox" || el.actionKind === "combobox" || el.actionKind === "radio") {
    return el.actionKind;
  }

  const key = el.key;
  const value = el.value;
  const role = el.role?.toLowerCase();

  const keyLooksButton = BUTTON_KEY_RE.test(key);
  const keyLooksField = FIELD_KEY_RE.test(key) && !/(button|btn|submit)/i.test(key);
  const valueLooksButton = BUTTON_VALUE_RE.test(value);
  const valueLooksField = /#(?:password|user-name|username|email|passwd)/i.test(value);

  if (role === "link") return "link";
  if (role === "button") return "button";

  if ((keyLooksButton || valueLooksButton) && !keyLooksField && !valueLooksField) {
    return "button";
  }
  if (keyLooksField || valueLooksField) {
    return "textbox";
  }

  if (el.actionKind === "button" || el.actionKind === "link") {
    return el.actionKind;
  }

  return el.actionKind;
}
