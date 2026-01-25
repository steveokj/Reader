const fs = require("fs");
const path = require("path");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const content = fs.readFileSync(filePath, "utf8");
  const env = {};
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      return;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  });
  return env;
}

const rootEnvPath = path.resolve(__dirname, "../../.env");
const webEnvPath = path.resolve(__dirname, "../../apps/web/.env.local");

const rootEnv = parseEnvFile(rootEnvPath);
const webEnv = parseEnvFile(webEnvPath);

const apiBase =
  webEnv.NEXT_PUBLIC_API_URL ||
  rootEnv.NEXT_PUBLIC_API_URL ||
  rootEnv.API_BASE_URL ||
  rootEnv.API_URL ||
  "";

const outputPath = path.resolve(__dirname, "../config.json");
const payload = { apiBase };
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

const suffix = apiBase ? ` (${apiBase})` : " (empty apiBase)";
console.log(`Wrote ${outputPath}${suffix}`);
