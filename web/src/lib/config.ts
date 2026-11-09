/** Deployment settings, all optional. Set them in Vercel > Project > Environment Variables. */
export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");
export const REPO_URL = (import.meta.env.VITE_REPO_URL as string | undefined) ?? "";
export const CONTACT = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) ?? "";
export const OPERATOR = (import.meta.env.VITE_OPERATOR_NAME as string | undefined) ?? "the operator of this service";
export const PLACEHOLDER_URL = "https://YOUR-SERVICE.onrender.com";
