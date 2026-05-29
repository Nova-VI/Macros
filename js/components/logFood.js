import { db } from '../db.js';
import { searchUSDA, getUSDAFoodDetails } from '../usda.js';

export function initLogFood(dashboardRef) {
  const searchInput = document.getElementById('food-search');
  const dropdown = document.getElementById('search-dropdown');
  const formTitle = document.getElementById('form-title');
  const toggleMicrosBtn = document.getElementById('btn-toggle-micros');
  const microsPanel = document.getElementById('micros-panel');
  const searchLoader = document.getElementById('search-loader');
  
  const logDateInput = document.getElementById('log-date');
  const logTimeInput = document.getElementById('log-time');
  const formContainer = document.getElementById('log-form-container');
  
  const els = {
    name: document.getElementById('log-name'),
    serving_g: document.getElementById('log-serving-g'),
    serving_unit: document.getElementById('log-serving-unit'),
    servings: document.getElementById('log-servings'),
    total_g: document.getElementById('log-total-g'),
    protein: document.getElementById('log-protein'),
    carbs: document.getElementById('log-carbs'),
    fat: document.getElementById('log-fat'),
    calories: document.getElementById('log-calories'),
    saveLibrary: document.getElementById('log-save-library'),
    submitBtn: document.getElementById('btn-submit-log'),
    
    fiber: document.getElementById('log-fiber'), sugar: document.getElementById('log-sugar'),
    sodium: document.getElementById('log-sodium'), sat_fat: document.getElementById('log-saturated-fat'),
    cholesterol: document.getElementById('log-cholesterol'), potassium: document.getElementById('log-potassium'),
    vit_a: document.getElementById('log-vitamin-a'), vit_c: document.getElementById('log-vitamin-c'),
    vit_d: document.getElementById('log-vitamin-d'), calcium: document.getElementById('log-calcium'), iron: document.getElementById('log-iron')
  };

  let searchTimeout = null;
  let abortController = null;
  let currentFood = null; 
  let manualCalories = false;
  let editingLogId = null; 
  let activeDropdownIndex = -1;

  searchInput.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.dropdown-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeDropdownIndex = (activeDropdownIndex + 1) % items.length;
      updateDropdownHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeDropdownIndex = (activeDropdownIndex - 1 + items.length) % items.length;
      updateDropdownHighlight(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const targetIdx = activeDropdownIndex === -1 ? 0 : activeDropdownIndex;
      if (items[targetIdx]) {
        items[targetIdx].click();
      }
    } else if (e.key === 'Escape') {
      clearDropdown();
    }
  });

  function updateDropdownHighlight(items) {
    items.forEach((item, index) => {
      if (index === activeDropdownIndex) {
        item.classList.add('kbd-active');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('kbd-active');
      }
    });
  }

  formContainer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!els.saveLibrary.disabled && !els.saveLibrary.closest('.custom-checkbox').classList.contains('invisible')) {
        els.saveLibrary.checked = e.ctrlKey;
      }
      els.submitBtn.click();
    }
  });

  async function renderShortcuts() {
    const [allFoods, allLogs] = await Promise.all([
      db.foods.toArray(),
      db.logs.toArray()
    ]);

    const counts = {};
    allLogs.forEach(log => {
      if (log.food_id) counts[log.food_id] = (counts[log.food_id] || 0) + 1;
    });

    allFoods.forEach(food => {
      food.logCount = counts[food.id] || 0;
    });

    const favorites = allFoods.filter(f => f.is_favorite).sort((a, b) => b.logCount - a.logCount);
    const frequents = allFoods.filter(f => !f.is_favorite && f.logCount > 0)
                              .sort((a, b) => b.logCount - a.logCount)
                              .slice(0, 10);

    const renderGrid = (containerId, items) => {
      const container = document.getElementById(containerId);
      container.innerHTML = '';
      if (items.length === 0) {
        container.innerHTML = `<div class="text-muted text-sm" style="grid-column: 1/-1;">No items to display.</div>`;
        return;
      }
      items.forEach(food => {
        const card = document.createElement('div');
        card.className = 'shortcut-card';
        card.innerHTML = `
          <div class="title" title="${food.name}">${food.name}</div>
          <div class="cal">${Math.round(food.macros.calories)} kcal</div>
          <div class="meta">${food.serving_size_g}g ${food.serving_name || ''}</div>
        `;
        card.onclick = () => { 
          selectHistoryFood(food); 
          window.scrollTo({top:0, behavior:'smooth'}); 
        };
        container.appendChild(card);
      });
    };

    renderGrid('favorites-grid', favorites);
    renderGrid('frequent-grid', frequents);
  }

  toggleMicrosBtn.addEventListener('click', () => {
    const isHidden = microsPanel.classList.toggle('hidden');
    toggleMicrosBtn.innerText = isHidden ? "Show Micronutrients ▾" : "Hide Micronutrients ▴";
  });

  searchInput.addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    if (query.length < 2) {
      clearDropdown();
      if (query.length === 0) showQuickLog();
      return;
    }

    const localMatches = await db.foods.filter(f => f.name.toLowerCase().includes(query.toLowerCase())).toArray();
    renderDropdown(localMatches, []);

    clearTimeout(searchTimeout);
    if (abortController) abortController.abort(); 

    searchLoader.classList.remove('hidden');

    searchTimeout = setTimeout(async () => {
      abortController = new AbortController();
      const usdaMatches = await searchUSDA(query, abortController.signal);
      searchLoader.classList.add('hidden');
      
      if (searchInput.value.trim().length >= 2) {
        renderDropdown(localMatches, usdaMatches);
      }
    }, 400); 
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      clearDropdown();
    }
  });

  els.name.addEventListener('input', async (e) => {
    if (editingLogId) return; 

    const typedName = e.target.value; 
    const trimmedName = typedName.trim();

    if (trimmedName.length < 2) {
      if (currentFood && currentFood.id !== undefined) {
        currentFood.id = undefined;
        currentFood.source = 'custom';
        els.serving_g.disabled = false;
        els.serving_unit.disabled = false;
        const saveLabel = els.saveLibrary.closest('.custom-checkbox');
        if (saveLabel) saveLabel.classList.remove('invisible');
        els.saveLibrary.disabled = false;
        formTitle.innerText = "Quick Log";
      }
      if (currentFood) currentFood.name = typedName;
      return;
    }

    const matchedLibraryItem = await db.foods.filter(f => f.name.toLowerCase() === trimmedName.toLowerCase()).first();
    
    if (matchedLibraryItem) {
      currentFood = JSON.parse(JSON.stringify(matchedLibraryItem));
      currentFood.name = typedName; 
      populateForm(false);
    } else {
      if (currentFood && currentFood.id !== undefined) {
        currentFood.id = undefined;
        currentFood.source = 'custom';
        currentFood.name = typedName;
        
        els.serving_g.disabled = false;
        els.serving_unit.disabled = false;
        
        const saveLabel = els.saveLibrary.closest('.custom-checkbox');
        if (saveLabel) saveLabel.classList.remove('invisible');
        els.saveLibrary.checked = false;
        els.saveLibrary.disabled = false;
        
        formTitle.innerText = "Quick Log";
      } else if (currentFood) {
        currentFood.name = typedName; 
      }
    }
  });

  function syncManualInputToModel() {
    if (!currentFood || currentFood.id !== undefined || currentFood.source !== 'custom') return;
    const mult = parseFloat(els.servings.value) || 1;
    
    currentFood.macros.protein_g = (parseFloat(els.protein.value) || 0) / mult;
    currentFood.macros.carbs_g = (parseFloat(els.carbs.value) || 0) / mult;
    currentFood.macros.fat_g = (parseFloat(els.fat.value) || 0) / mult;
    currentFood.macros.calories = (parseFloat(els.calories.value) || 0) / mult;

    currentFood.micros = currentFood.micros || {};
    ['fiber','sugar','sodium','sat_fat','cholesterol','potassium','vit_a','vit_c','vit_d','calcium','iron'].forEach(k => {
      currentFood.micros[k + (k.includes('fat') || k.includes('sugar') || k.includes('fiber') ? '_g' : '_mg')] = (parseFloat(els[k].value) || 0) / mult;
    });
  }

  function renderDropdown(history, usda) {
    dropdown.innerHTML = '';
    activeDropdownIndex = -1; 
    
    history.forEach(food => {
      const div = document.createElement('div');
      div.className = 'dropdown-item';
      let badge = food.source === 'composite' ? 'composite' : 'history';
      div.innerHTML = `<span>${food.name} ${food.serving_name ? `(${food.serving_name})` : ''}</span> <span class="badge ${badge}">${food.source}</span>`;
      div.onclick = (e) => { e.stopPropagation(); selectHistoryFood(food); };
      dropdown.appendChild(div);
    });
    usda.forEach(food => {
      const div = document.createElement('div');
      div.className = 'dropdown-item';
      div.innerHTML = `<span>${food.description}</span> <span class="badge usda">USDA</span>`;
      div.onclick = (e) => { e.stopPropagation(); selectUSDAFood(food.fdcId); };
      dropdown.appendChild(div);
    });
    
    if (history.length > 0 || usda.length > 0) {
      dropdown.classList.remove('hidden');
      dropdown.scrollTop = 0; 
    }
  }

  function clearDropdown() {
    clearTimeout(searchTimeout);
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    searchLoader.classList.add('hidden');
    dropdown.innerHTML = '';
    dropdown.classList.add('hidden');
    dropdown.scrollTop = 0;
    activeDropdownIndex = -1;
  }

  async function selectUSDAFood(fdcId) {
    clearDropdown();
    searchInput.value = '';
    const details = await getUSDAFoodDetails(fdcId);
    if (details) { currentFood = details; populateForm(true); }
  }

  function selectHistoryFood(food) {
    clearDropdown();
    searchInput.value = '';
    currentFood = JSON.parse(JSON.stringify(food));
    populateForm(true);
  }

  function showQuickLog() {
    editingLogId = null;
    currentFood = { source: 'custom', serving_size_g: 100, serving_name: '', macros: { protein_g: 0, carbs_g: 0, fat_g: 0, calories: 0 }, micros: {} };
    els.name.value = "";
    populateForm(false);
    formTitle.innerText = "Quick Log";
  }

  function populateForm(shouldFocus = false) {
    formTitle.innerText = editingLogId ? "Edit Daily Log" : (currentFood.id ? "Log Saved Food" : (currentFood.source === 'usda' ? "Log USDA Food" : "Quick Log"));
    manualCalories = false;
    document.getElementById('cal-badge').classList.add('hidden');
    
    if (currentFood.name !== undefined && els.name.value !== currentFood.name) {
      els.name.value = currentFood.name;
    }
    els.name.readOnly = false;
    
    els.serving_g.value = currentFood.serving_size_g;
    els.serving_unit.value = currentFood.serving_name || '';
    
    const isSaved = currentFood.id !== undefined;
    els.serving_g.disabled = isSaved;
    els.serving_unit.disabled = isSaved;

    els.servings.value = 1;
    els.total_g.value = currentFood.serving_size_g;
    
    const saveLabel = els.saveLibrary.closest('.custom-checkbox');
    if (isSaved || editingLogId !== null) {
      if (saveLabel) saveLabel.classList.add('invisible');
      els.saveLibrary.checked = false;
    } else {
      if (saveLabel) saveLabel.classList.remove('invisible');
      els.saveLibrary.disabled = false;
      els.saveLibrary.checked = (currentFood.source === 'usda');
    }

    const dashDateVal = document.getElementById('dash-date').value;
    
    // FIX: Timezone aware local date calculation
    const now = new Date();
    const localTodayDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    logDateInput.value = dashDateVal || localTodayDate;

    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    logTimeInput.value = `${hh}:${mm}`;

    updateLabelsAndScales();

    if (shouldFocus) {
      setTimeout(() => {
        els.servings.focus();
        els.servings.select();
      }, 50);
    }
  }

  function updateLabelsAndScales() {
    const unit = els.serving_unit.value.trim();
    const mult = parseFloat(els.servings.value) || 1;
    
    let labelText = "Servings";
    if (unit) {
      const displayUnit = mult === 1 ? unit : (unit.endsWith('s') ? unit : `${unit}s`);
      labelText = `Servings (${displayUnit})`;
    }
    document.getElementById('serving-multiplier-label').innerText = labelText;
    document.getElementById('serving-total-g-label').innerText = `Total Grams`;
    updateNutrientsFromMultiplier();
  }

  function updateNutrientsFromMultiplier() {
    const baseG = parseFloat(els.serving_g.value) || 100;
    const mult = parseFloat(els.servings.value) || 0;
    els.total_g.value = Math.round(baseG * mult);
    scaleNutrients(mult);
  }

  function updateMultiplierFromTotalG() {
    const baseG = parseFloat(els.serving_g.value) || 100;
    const totalG = parseFloat(els.total_g.value) || 0;
    const mult = totalG / baseG;
    els.servings.value = mult.toFixed(2);
    
    const unit = els.serving_unit.value.trim();
    if (unit) {
      const displayUnit = mult === 1 ? unit : (unit.endsWith('s') ? unit : `${unit}s`);
      document.getElementById('serving-multiplier-label').innerText = `Servings (${displayUnit})`;
    }
    
    scaleNutrients(mult);
  }

  function updateFromBaseServingG() {
    const newBaseG = parseFloat(els.serving_g.value) || 1;
    const oldBaseG = currentFood.serving_size_g || 1;

    if (newBaseG !== oldBaseG) {
      const ratio = newBaseG / oldBaseG;
      for (let k in currentFood.macros) currentFood.macros[k] *= ratio;
      if (currentFood.micros) {
        for (let k in currentFood.micros) currentFood.micros[k] *= ratio;
      }
      currentFood.serving_size_g = newBaseG;
    }

    const mult = parseFloat(els.servings.value) || 0;
    els.total_g.value = Math.round(newBaseG * mult);
    scaleNutrients(mult);
  }

  function scaleNutrients(mult) {
    els.protein.value = (currentFood.macros.protein_g * mult).toFixed(1);
    els.carbs.value = (currentFood.macros.carbs_g * mult).toFixed(1);
    els.fat.value = (currentFood.macros.fat_g * mult).toFixed(1);
    
    if (!manualCalories) {
      els.calories.value = Math.round((currentFood.macros.protein_g * 4 * mult) + (currentFood.macros.carbs_g * 4 * mult) + (currentFood.macros.fat_g * 9 * mult));
    }

    const micros = currentFood.micros || {};
    els.fiber.value = ((micros.fiber_g || 0) * mult).toFixed(1);
    els.sugar.value = ((micros.sugar_g || 0) * mult).toFixed(1);
    els.sodium.value = Math.round((micros.sodium_mg || 0) * mult);
    els.sat_fat.value = ((micros.saturated_fat_g || 0) * mult).toFixed(1);
    els.cholesterol.value = Math.round((micros.cholesterol_mg || 0) * mult);
    els.potassium.value = Math.round((micros.potassium_mg || 0) * mult);
    els.vit_a.value = Math.round((micros.vitamin_a_ug || 0) * mult);
    els.vit_c.value = ((micros.vitamin_c_mg || 0) * mult).toFixed(1);
    els.vit_d.value = ((micros.vitamin_d_ug || 0) * mult).toFixed(1);
    els.calcium.value = Math.round((micros.calcium_mg || 0) * mult);
    els.iron.value = ((micros.iron_mg || 0) * mult).toFixed(1);
  }

  els.servings.addEventListener('input', updateLabelsAndScales);
  els.total_g.addEventListener('input', updateMultiplierFromTotalG);
  els.serving_unit.addEventListener('input', updateLabelsAndScales);
  els.serving_g.addEventListener('input', updateFromBaseServingG);

  document.querySelectorAll('.macro-input').forEach(input => {
    input.addEventListener('input', () => {
      syncManualInputToModel();
      if (!manualCalories) {
        const p = parseFloat(els.protein.value) || 0;
        const c = parseFloat(els.carbs.value) || 0;
        const f = parseFloat(els.fat.value) || 0;
        els.calories.value = Math.round((p * 4) + (c * 4) + (f * 9));
      }
    });
  });

  ['fiber', 'sugar', 'sodium', 'sat_fat', 'cholesterol', 'potassium', 'vit_a', 'vit_c', 'vit_d', 'calcium', 'iron'].forEach(key => {
    els[key].addEventListener('input', syncManualInputToModel);
  });

  els.calories.addEventListener('input', (e) => {
    manualCalories = e.target.value !== "";
    document.getElementById('cal-badge').classList.toggle('hidden', !manualCalories);
    syncManualInputToModel();
  });

  els.submitBtn.addEventListener('click', async () => {
    const mult = parseFloat(els.servings.value) || 1;
    const name = els.name.value.trim();
    if (!name) return window.showToast("Please enter a name.", "error");

    let finalSource = currentFood.source;
    if (currentFood.source === 'usda') {
      const p = parseFloat(els.protein.value);
      const expectedP = parseFloat((currentFood.macros.protein_g * mult).toFixed(1));
      
      if (p !== expectedP) {
        const confirmed = await window.customConfirm(
          "USDA Nutrients Modified",
          "You modified USDA nutrients. Update food definition in library for future logs too?",
          false
        );
        if (confirmed) {
          finalSource = 'usda_modified';
        }
      }
    }

    let foodId = currentFood.id || null;
    const macroObj = { protein_g: parseFloat(els.protein.value)/mult, carbs_g: parseFloat(els.carbs.value)/mult, fat_g: parseFloat(els.fat.value)/mult, calories: parseFloat(els.calories.value)/mult };
    
    if (!foodId && els.saveLibrary.checked && !editingLogId) {
      foodId = await db.foods.add({
        name, source: finalSource, usda_fdc_id: currentFood.usda_fdc_id || null,
        serving_size_g: parseFloat(els.serving_g.value), serving_name: els.serving_unit.value.trim(),
        macros: macroObj, micros: currentFood.micros
      });
    }

    const logDate = logDateInput.value;
    const logTime = logTimeInput.value || "12:00";
    const loggedAtISO = new Date(`${logDate}T${logTime}:00`).toISOString();

    const logPayload = {
      date: logDate, logged_at: loggedAtISO,
      food_id: foodId, food_name: name, serving_name: els.serving_unit.value.trim(),
      servings: mult, serving_size_g: parseFloat(els.total_g.value),
      macros: { protein_g: parseFloat(els.protein.value), carbs_g: parseFloat(els.carbs.value), fat_g: parseFloat(els.fat.value), calories: parseFloat(els.calories.value) },
      micros: {
        fiber_g: parseFloat(els.fiber.value), sugar_g: parseFloat(els.sugar.value), sodium_mg: parseFloat(els.sodium.value),
        saturated_fat_g: parseFloat(els.sat_fat.value), cholesterol_mg: parseFloat(els.cholesterol.value), potassium_mg: parseFloat(els.potassium.value),
        vitamin_a_ug: parseFloat(els.vit_a.value), vitamin_c_mg: parseFloat(els.vit_c.value), vitamin_d_ug: parseFloat(els.vit_d.value),
        calcium_mg: parseFloat(els.calcium.value), iron_mg: parseFloat(els.iron.value)
      }
    };

    if (editingLogId) {
      await db.logs.update(editingLogId, logPayload);
      window.showToast("Daily log saved!");
    } else {
      await db.logs.add(logPayload);
      window.showToast("Food logged successfully!");
    }

    showQuickLog();
    renderShortcuts();
    dashboardRef.renderDashboard();
  });

  window.editPastLog = async (id) => {
    const log = await db.logs.get(id);
    if (!log) return;
    editingLogId = id;
    
    currentFood = {
      source: 'custom', serving_size_g: log.serving_size_g / log.servings, serving_name: log.serving_name || '', name: log.food_name,
      macros: { protein_g: log.macros.protein_g / log.servings, carbs_g: log.macros.carbs_g / log.servings, fat_g: log.macros.fat_g / log.servings, calories: log.macros.calories / log.servings },
      micros: {}
    };
    for(let k in log.micros) currentFood.micros[k] = (log.micros[k] || 0) / log.servings;

    populateForm(false);
    els.servings.value = log.servings;
    els.total_g.value = log.serving_size_g;

    logDateInput.value = log.date;
    if (log.logged_at) {
      const dateObj = new Date(log.logged_at);
      const hh = String(dateObj.getHours()).padStart(2, '0');
      const mm = String(dateObj.getMinutes()).padStart(2, '0');
      logTimeInput.value = `${hh}:${mm}`;
    }

    updateLabelsAndScales();

    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-target') === 'log-food'));
    document.querySelectorAll('.page').forEach(page => {
      page.classList.toggle('active', page.id === 'log-food');
      page.classList.toggle('hidden', page.id !== 'log-food');
    });
  };

  showQuickLog();
  renderShortcuts();
  return { resetForm: showQuickLog, refreshShortcuts: renderShortcuts };
}