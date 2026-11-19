export function normalizeTenantPhone(input) {
  const value = input.trim();
  if (!/^\+?[\d(). -]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(local) || /^(\d)\1+$/.test(local)) return null;
  if (value.startsWith("+") && digits.length !== 11) return null;
  return "+1" + local;
}

const COMMON = new Set(["password", "password1", "password123", "12345678", "123456789", "1234567890", "87654321", "qwerty123", "letmein123", "iloveyou"]);

export function passwordIssue(password) {
  if ([...password].length < 8) return "Use at least 8 characters.";
  if (!password.trim() || /^(.+?)\1+$/su.test(password.toLowerCase()) || COMMON.has(password.toLowerCase())) {
    return "Choose a less predictable password. Avoid repeated patterns and common passwords.";
  }
  return "";
}

// These values only restore UI progress. They never grant access to a tenant record.
export function savedSetupStep(metadata, invitedTenantId, count) {
  const stage = metadata?.tenant_setup;
  if (stage?.tenantId !== invitedTenantId || !Number.isInteger(stage?.step)) return 0;
  return Math.min(count - 1, Math.max(0, stage.step));
}
