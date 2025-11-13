const fs = require('fs');
const path = require('path');

const settingsPath = path.join(__dirname, 'settings.json');

function ensureSettingsFile() {
  if (!fs.existsSync(settingsPath)) {
    const defaultSettings = { autoStartOnMeeting: false };
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2), 'utf-8');
  }
}

function getSettings() {
  ensureSettingsFile();
  try {
    const fileContent = fs.readFileSync(settingsPath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error('Failed to load settings, using defaults.', error);
    return { autoStartOnMeeting: false };
  }
}

function saveSettings(partialSettings = {}) {
  const current = getSettings();
  const merged = { ...current, ...partialSettings };
  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

module.exports = {
  ensureSettingsFile,
  getSettings,
  saveSettings
};
