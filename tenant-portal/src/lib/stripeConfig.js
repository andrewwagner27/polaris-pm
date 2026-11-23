// Publishable keys only. A preview build must never load a live Stripe account.
export function stripePublishableKey(key, deployment = "development") {
  const value = String(key || "").trim();
  if (!/^pk_(test|live)_[A-Za-z0-9]+$/.test(value)) return null;
  if (deployment !== "production" && value.startsWith("pk_live_")) {
    console.warn(
      `[stripeConfig] Live Stripe key blocked: VITE_DEPLOYMENT_ENV="${deployment}" (expected "production"). Set VITE_DEPLOYMENT_ENV=production in your production build.`
    );
    return null;
  }
  return value;
}
