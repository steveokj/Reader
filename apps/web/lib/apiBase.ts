export function getClientApiBase() {
  const envBase = process.env.NEXT_PUBLIC_API_URL;
  if (envBase) {
    return envBase;
  }
  if (typeof window === "undefined") {
    return "http://localhost:8000";
  }
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8000`;
}
