import { loadStripe } from "@stripe/stripe-js";
import { stripePublishableKey } from "./stripeConfig";

const key = stripePublishableKey(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY, import.meta.env.VITE_DEPLOYMENT_ENV);
export const stripePromise = key ? loadStripe(key) : null;
