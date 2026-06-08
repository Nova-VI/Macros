import { db, setApiKey, exportDatabaseJSON, importDatabaseJSON, getIncludeBranded, setIncludeBranded, getGithubApiKey, setGithubApiKey, getTheme, setTheme, getNavbar, setNavbar } from '../db.js';

export function initSettings() {
  const calcMethodSelect = document.getElementById('goal-calc-method');
  const smartCalcPanel = document.getElementById('smart-calc-panel');
  const warningEl = document.getElementById('extreme-diet-warning');
  const themeSelect = document.getElementById('settings-theme');
  const navbarSelect = document.getElementById('settings-navbar-layout');

  themeSelect.addEventListener('change', (e) => {
    const newTheme = e.target.value;
    setTheme(newTheme);
    document.documentElement.dataset.theme = newTheme;
  });

  navbarSelect.addEventListener('change', (e) => {
    const newNavbar = e.target.value;
    setNavbar(newNavbar);
    document.documentElement.dataset.navbar = newNavbar;
  });

  const calcInputs = {
    age: document.getElementById('calc-age'),
    gender: document.getElementById('calc-gender'),
    height: document.getElementById('calc-height'),
    weight: document.getElementById('calc-weight'),
    activity: document.getElementById('calc-activity'),
    goal: document.getElementById('calc-goal'),
    proteinMultiplier: document.getElementById('calc-protein-multiplier') // NEW
  };

  const macroOutputs = {
    cal: document.getElementById('prof-cal'),
    pro: document.getElementById('prof-pro'),
    carb: document.getElementById('prof-carb'),
    fat: document.getElementById('prof-fat')
  };

  calcMethodSelect.addEventListener('change', (e) => {
    const isCalculator = e.target.value === 'calculator';
    smartCalcPanel.classList.toggle('hidden', !isCalculator);
    performLiveCalculations();
  });

  Object.values(calcInputs).forEach(input => {
    input.addEventListener('input', performLiveCalculations);
    input.addEventListener('change', performLiveCalculations);
  });

  function performLiveCalculations() {
    if (calcMethodSelect.value !== 'calculator') return;

    const age = parseInt(calcInputs.age.value) || 25;
    const gender = calcInputs.gender.value;
    const height = parseFloat(calcInputs.height.value) || 175;
    const weight = parseFloat(calcInputs.weight.value) || 70;
    const activityFactor = parseFloat(calcInputs.activity.value) || 1.2;
    const goalAdjustment = parseFloat(calcInputs.goal.value) || 0;
    const proteinFactor = parseFloat(calcInputs.proteinMultiplier.value) || 2.0; // NEW

    let bmr = 0;
    if (gender === 'male') {
      bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5;
    } else {
      bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161;
    }

    const tdee = bmr * activityFactor;
    const targetCals = Math.round(tdee + goalAdjustment);

    const minSafetyLimit = gender === 'female' ? 1200 : 1500;
    warningEl.classList.toggle('hidden', targetCals >= minSafetyLimit);

    const protein = Math.round(weight * proteinFactor); // Calculated with user preference
    const fat = Math.round((targetCals * 0.25) / 9); 
    const carbs = Math.max(0, Math.round((targetCals - (protein * 4) - (fat * 9)) / 4));

    macroOutputs.cal.value = targetCals;
    macroOutputs.pro.value = protein;
    macroOutputs.carb.value = carbs;
    macroOutputs.fat.value = fat;
  }

  async function loadProfile() {
    let profile = await db.profile.get(1);
    if (profile) {
      calcMethodSelect.value = profile.goal_mode || 'calculator';
      smartCalcPanel.classList.toggle('hidden', calcMethodSelect.value !== 'calculator');

      macroOutputs.cal.value = profile.target_calories;
      macroOutputs.pro.value = profile.target_protein_g;
      macroOutputs.carb.value = profile.target_carbs_g;
      macroOutputs.fat.value = profile.target_fat_g;

      // Load persistent inputs if they exist (Fixes refresh fallback)
      if (profile.age !== undefined) calcInputs.age.value = profile.age;
      if (profile.gender !== undefined) calcInputs.gender.value = profile.gender;
      if (profile.height !== undefined) calcInputs.height.value = profile.height;
      if (profile.weight !== undefined) calcInputs.weight.value = profile.weight;
      if (profile.activity !== undefined) calcInputs.activity.value = profile.activity;
      if (profile.goal !== undefined) calcInputs.goal.value = profile.goal;
      if (profile.protein_multiplier !== undefined) calcInputs.proteinMultiplier.value = profile.protein_multiplier;
    }
    
    const ghKey = getGithubApiKey();
    if (ghKey) document.getElementById('settings-github-key').value = ghKey;

    themeSelect.value = getTheme();
    if(navbarSelect) navbarSelect.value = getNavbar();

    performLiveCalculations();
  }

  document.getElementById('btn-save-profile').addEventListener('click', async () => {
    const payload = {
      id: 1,
      goal_mode: calcMethodSelect.value,
      target_calories: parseFloat(macroOutputs.cal.value) || 2000,
      target_protein_g: parseFloat(macroOutputs.pro.value) || 150,
      target_carbs_g: parseFloat(macroOutputs.carb.value) || 200,
      target_fat_g: parseFloat(macroOutputs.fat.value) || 65,
      
      // Save input states so they persist (Fixes refresh fallback)
      age: parseInt(calcInputs.age.value) || 25,
      gender: calcInputs.gender.value,
      height: parseFloat(calcInputs.height.value) || 175,
      weight: parseFloat(calcInputs.weight.value) || 70,
      activity: calcInputs.activity.value,
      goal: calcInputs.goal.value,
      protein_multiplier: calcInputs.proteinMultiplier.value
    };

    await db.profile.put(payload);
    
    if (calcMethodSelect.value === 'calculator') {
      const weight = parseFloat(calcInputs.weight.value) || 0;
      
      const now = new Date();
      const localTodayDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
      const existingWeightLog = await db.weight_logs.get(localTodayDate);
      
      if (weight > 0 && !existingWeightLog) {
        await db.weight_logs.put({ date: localTodayDate, weight_kg: weight });
      }
    }

    window.showToast("Profile target goals saved!");
  });

  document.getElementById('btn-save-settings').addEventListener('click', () => {
    const key = document.getElementById('settings-api-key').value;
    setApiKey(key);
    window.showToast("USDA Access Key saved!");
  });
  
  document.getElementById('btn-save-github').addEventListener('click', () => {
    const key = document.getElementById('settings-github-key').value;
    setGithubApiKey(key);
    window.showToast("GitHub AI Key saved!");
  });

  const includeBrandedCheckbox = document.getElementById('settings-include-branded');
  if (includeBrandedCheckbox) {
    includeBrandedCheckbox.checked = getIncludeBranded();
    includeBrandedCheckbox.addEventListener('change', (e) => {
      setIncludeBranded(e.target.checked);
      window.showToast("Search preference saved!");
    });
  }

  document.getElementById('btn-export').addEventListener('click', () => {
    exportDatabaseJSON();
  });

  document.getElementById('btn-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const confirmed = await window.customConfirm(
      "Import JSON Database Backup",
      "This process will completely overwrite current data tables with the file contents. Proceed?",
      false
    );

    if (confirmed) {
      try {
        await importDatabaseJSON(file);
        window.showToast("Import success!");
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        window.showToast("Failed to import backup.", "error");
      }
    }
  });

  return { loadProfile };
}