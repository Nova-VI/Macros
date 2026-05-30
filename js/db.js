export const db = new window.Dexie("MacroTrackerDB");

db.version(1).stores({
  foods: '++id, name, source, usda_fdc_id',
  logs: '++id, date, food_id',              
  weight_logs: 'date',                      
  profile: 'id'                             
});

db.on('populate', async () => {
  await db.profile.add({
    id: 1,
    target_calories: 2000,
    target_protein_g: 150,
    target_carbs_g: 200,
    target_fat_g: 65,
    goal_mode: 'calculator'
  });
});

export async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    await navigator.storage.persist();
  }
}

export function getApiKey() {
  return localStorage.getItem('usda_api_key');
}
export function setApiKey(key) {
  localStorage.setItem('usda_api_key', key.trim());
}

export function getIncludeBranded() {
  return localStorage.getItem('usda_include_branded') === 'true';
}
export function setIncludeBranded(isIncluded) {
  localStorage.setItem('usda_include_branded', isIncluded ? 'true' : 'false');
}

// NEW: GitHub Models API Key for Emoji AI
export function getGithubApiKey() {
  return localStorage.getItem('github_api_key');
}
export function setGithubApiKey(key) {
  localStorage.setItem('github_api_key', key.trim());
}

export async function exportDatabaseJSON() {
  const data = {
    foods: await db.foods.toArray(),
    logs: await db.logs.toArray(),
    weight_logs: await db.weight_logs.toArray(),
    profile: await db.profile.toArray()
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `macro_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importDatabaseJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        await db.transaction('rw', db.foods, db.logs, db.weight_logs, db.profile, async () => {
          await db.foods.clear(); await db.foods.bulkAdd(data.foods || []);
          await db.logs.clear(); await db.logs.bulkAdd(data.logs || []);
          await db.weight_logs.clear(); await db.weight_logs.bulkAdd(data.weight_logs || []);
          await db.profile.clear(); await db.profile.bulkAdd(data.profile || []);
        });
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsText(file);
  });
}