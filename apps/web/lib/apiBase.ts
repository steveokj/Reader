export function getClientApiBase() {
  const envBase = process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === "undefined") {
    return envBase || "http://localhost:8000";
  }
  const { protocol, hostname } = window.location;
  if (envBase) {
    try {
      const envUrl = new URL(envBase);
      const envHost = envUrl.hostname;
      const isLocalEnv = envHost === "localhost" || envHost === "127.0.0.1";
      const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
      if (!isLocalEnv || isLocalHost) {
        return envBase;
      }
    } catch {
      return envBase;
    }
  }
  return `${protocol}//${hostname}:8000`;
}
