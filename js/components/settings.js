import { db, setApiKey, exportDatabaseJSON, importDatabaseJSON, getIncludeBranded, setIncludeBranded } from '../db.js';

export function initSettings() {
  const calcMethodSelect = document.getElementById('goal-calc-method');
  const smartCalcPanel = document.getElementById('smart-calc-panel');
  const warningEl = document.getElementById('extreme-diet-warning');

  const calcInputs = {
    age: document.getElementById('calc-age'),
    gender: document.getElementById('calc-gender'),
    height: document.getElementById('calc-height'),
    weight: document.getElementById('calc-weight'),
    activity: document.getElementById('calc-activity'),
    goal: document.getElementById('calc-goal')
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

    const protein = Math.round(weight * 2.0); 
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
    }
    performLiveCalculations();
  }

  document.getElementById('btn-save-profile').addEventListener('click', async () => {
    const payload = {
      id: 1,
      goal_mode: calcMethodSelect.value,
      target_calories: parseFloat(macroOutputs.cal.value) || 2000,
      target_protein_g: parseFloat(macroOutputs.pro.value) || 150,
      target_carbs_g: parseFloat(macroOutputs.carb.value) || 200,
      target_fat_g: parseFloat(macroOutputs.fat.value) || 65
    };

    await db.profile.put(payload);
    
    if (calcMethodSelect.value === 'calculator') {
      const weight = parseFloat(calcInputs.weight.value) || 0;
      
      // FIX: Local timezone ISO format
      const now = new Date();
      const localTodayDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
      const existingWeightLog = await db.weight_logs.get(localTodayDate);
      
      if (weight > 0 && !existingWeightLog) {
        await db.weight_logs.put({ date: localTodayDate, weight_kg: weight });
        renderChart();
      }
    }

    window.showToast("Profile target goals saved!");
  });

  let chartInstance = null;
  async function renderChart() {
    const weights = await db.weight_logs.orderBy('date').toArray();
    const ctx = document.getElementById('weightChart').getContext('2d');

    const labels = weights.map(w => w.date.split('-').slice(1).join('/')); 
    const data = weights.map(w => w.weight_kg);

    if (chartInstance) chartInstance.destroy();

    chartInstance = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Weight (kg)', data: data, borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 2, fill: true,
          tension: 0.3, pointBackgroundColor: '#10b981'
        }]
      },
      options: {
        responsive: true, plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' } },
          y: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' } }
        }
      }
    });
  }

  document.getElementById('btn-log-weight').addEventListener('click', async () => {
    const weightVal = parseFloat(document.getElementById('weight-input').value);
    if (!weightVal) return window.showToast("Enter a valid weight.", "error");
    
    // FIX: Local timezone ISO format
    const now = new Date();
    const localTodayDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    
    await db.weight_logs.put({ date: localTodayDate, weight_kg: weightVal });
    
    document.getElementById('weight-input').value = '';
    window.showToast("Weight logged!");
    renderChart();
  });

  document.getElementById('btn-save-settings').addEventListener('click', () => {
    const key = document.getElementById('settings-api-key').value;
    setApiKey(key);
    window.showToast("USDA Access Key saved!");
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

  return { renderChart, loadProfile };
}