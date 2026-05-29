import { db } from '../db.js';
import { searchUSDA, getUSDAFoodDetails } from '../usda.js';

export function initRecipeComposer() {
  const searchInput = document.getElementById('recipe-search');
  const dropdown = document.getElementById('recipe-search-dropdown');
  const listEl = document.getElementById('recipe-ingredient-list');
  const totalGEl = document.getElementById('recipe-total-g');
  const recipeNameEl = document.getElementById('recipe-name');
  const recipeUnitEl = document.getElementById('recipe-unit');
  const weightModal = document.getElementById('recipe-weight-modal');
  const weightInput = document.getElementById('recipe-weight-input');
  
  const fullNutModal = document.getElementById('full-nutrition-modal');
  const viewFullNutBtn = document.getElementById('btn-view-recipe-micros');
  const closeNutModalBtn = document.getElementById('btn-close-nutrition-modal');

  let ingredients = [];
  let searchTimeout = null;
  let targetFoodForWeight = null;
  let editingRecipeId = null;

  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length < 2) return dropdown.classList.add('hidden');

    searchTimeout = setTimeout(async () => {
      const history = await db.foods.filter(f => f.name.toLowerCase().includes(query.toLowerCase()) && f.source !== 'composite').toArray();
      const usda = await searchUSDA(query);
      
      dropdown.innerHTML = '';
      history.forEach(food => addDropdownItem(food.name, 'History', () => openWeightModal(food)));
      usda.forEach(food => addDropdownItem(food.description, 'USDA', async () => openWeightModal(await getUSDAFoodDetails(food.fdcId))));
      
      if (history.length > 0 || usda.length > 0) {
        dropdown.classList.remove('hidden');
        dropdown.scrollTop = 0; // Fixes scrollbar not resetting
      }
    }, 400);
  });

  function addDropdownItem(name, type, onClick) {
    const div = document.createElement('div');
    div.className = 'dropdown-item';
    div.innerHTML = `<span>${name}</span> <span class="badge ${type.toLowerCase()}">${type}</span>`;
    div.onclick = () => { onClick(); dropdown.classList.add('hidden'); searchInput.value = ''; };
    dropdown.appendChild(div);
  }

  function openWeightModal(foodData) {
    if (!foodData) return;
    targetFoodForWeight = foodData;
    document.getElementById('recipe-weight-title').innerText = `Amount for ${foodData.name.split(',')[0]}`;
    weightInput.value = 100;
    weightModal.classList.remove('hidden');
  }

  document.getElementById('btn-cancel-recipe-weight').onclick = () => { weightModal.classList.add('hidden'); targetFoodForWeight = null; };

  document.getElementById('btn-save-recipe-weight').onclick = () => {
    const grams = parseFloat(weightInput.value);
    if (isNaN(grams) || grams <= 0) return window.showToast("Enter a valid weight in grams", "error");
    
    const mult = grams / targetFoodForWeight.serving_size_g;
    const microsObj = {};
    if(targetFoodForWeight.micros) {
      for (const k in targetFoodForWeight.micros) microsObj[k] = targetFoodForWeight.micros[k] * mult;
    }

    ingredients.push({
      food_id: targetFoodForWeight.id || null, usda_fdc_id: targetFoodForWeight.usda_fdc_id || null,
      name: targetFoodForWeight.name, quantity_g: grams, source: targetFoodForWeight.source,
      macros: { calories: targetFoodForWeight.macros.calories * mult, protein_g: targetFoodForWeight.macros.protein_g * mult, carbs_g: targetFoodForWeight.macros.carbs_g * mult, fat_g: targetFoodForWeight.macros.fat_g * mult },
      micros: microsObj
    });
    renderIngredients();
    weightModal.classList.add('hidden'); targetFoodForWeight = null;
  };

  function renderIngredients() {
    listEl.innerHTML = '';
    let totalCals = 0, totalPro = 0, totalCarb = 0, totalFat = 0, totalGrams = 0;

    ingredients.forEach((ing, index) => {
      if (!ing.macros) ing.macros = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
      totalCals += ing.macros.calories; totalPro += ing.macros.protein_g; totalCarb += ing.macros.carbs_g; totalFat += ing.macros.fat_g; totalGrams += ing.quantity_g;

      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
        <div class="list-item-header">
          <div class="list-item-title">${ing.name} <span class="text-muted text-sm">(${ing.quantity_g}g)</span></div>
          <button class="btn-ghost-danger" onclick="window.removeRecipeIngredient(${index})" style="padding: 0.2rem 0.5rem;">✕</button>
        </div>
        <div class="macro-stats">
          <div class="stat-col"><span class="stat-label">Cals</span><span class="stat-value cals">${Math.round(ing.macros.calories)}</span></div>
          <div class="stat-col"><span class="stat-label">Pro</span><span class="stat-value">${window.formatVal(ing.macros.protein_g)}g</span></div>
          <div class="stat-col"><span class="stat-label">Carb</span><span class="stat-value">${window.formatVal(ing.macros.carbs_g)}g</span></div>
          <div class="stat-col"><span class="stat-label">Fat</span><span class="stat-value">${window.formatVal(ing.macros.fat_g)}g</span></div>
        </div>
      `;
      listEl.appendChild(div);
    });

    totalGEl.value = totalGrams;
    document.getElementById('recipe-cal').innerText = Math.round(totalCals);
    document.getElementById('recipe-pro').innerText = window.formatVal(totalPro) + 'g';
    document.getElementById('recipe-carb').innerText = window.formatVal(totalCarb) + 'g';
    document.getElementById('recipe-fat').innerText = window.formatVal(totalFat) + 'g';
  }

  window.removeRecipeIngredient = (index) => { ingredients.splice(index, 1); renderIngredients(); };

  viewFullNutBtn.addEventListener('click', () => {
    if (ingredients.length === 0) return window.showToast("Add ingredients first.", "warning");
    
    let totalCals = 0, totalPro = 0, totalCarb = 0, totalFat = 0;
    const summedMicros = { fiber_g:0, sugar_g:0, sodium_mg:0, saturated_fat_g:0, cholesterol_mg:0, potassium_mg:0, vitamin_a_ug:0, vitamin_c_mg:0, vitamin_d_ug:0, calcium_mg:0, iron_mg:0 };

    ingredients.forEach(i => {
      const macros = i.macros || { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
      totalCals += macros.calories; totalPro += macros.protein_g; totalCarb += macros.carbs_g; totalFat += macros.fat_g;
      for (const key in summedMicros) { summedMicros[key] += (i.micros?.[key] || 0); }
    });

    document.getElementById('nut-calories').value = Math.round(totalCals);
    document.getElementById('nut-protein').value = window.formatVal(totalPro) + 'g';
    document.getElementById('nut-carbs').value = window.formatVal(totalCarb) + 'g';
    document.getElementById('nut-fat').value = window.formatVal(totalFat) + 'g';
    
    document.getElementById('nut-fiber').value = window.formatVal(summedMicros.fiber_g) + 'g';
    document.getElementById('nut-sugar').value = window.formatVal(summedMicros.sugar_g) + 'g';
    document.getElementById('nut-sodium').value = Math.round(summedMicros.sodium_mg) + 'mg';
    document.getElementById('nut-satfat').value = window.formatVal(summedMicros.saturated_fat_g) + 'g';
    document.getElementById('nut-chol').value = Math.round(summedMicros.cholesterol_mg) + 'mg';
    document.getElementById('nut-potassium').value = Math.round(summedMicros.potassium_mg) + 'mg';
    document.getElementById('nut-vita').value = Math.round(summedMicros.vitamin_a_ug) + 'ug';
    document.getElementById('nut-vitc').value = window.formatVal(summedMicros.vitamin_c_mg) + 'mg';
    document.getElementById('nut-vitd').value = window.formatVal(summedMicros.vitamin_d_ug) + 'ug';
    document.getElementById('nut-calcium').value = Math.round(summedMicros.calcium_mg) + 'mg';
    document.getElementById('nut-iron').value = window.formatVal(summedMicros.iron_mg) + 'mg';

    fullNutModal.classList.remove('hidden');
  });

  closeNutModalBtn.onclick = () => fullNutModal.classList.add('hidden');

  document.getElementById('btn-save-recipe').addEventListener('click', async () => {
    const name = recipeNameEl.value.trim();
    if(!name || ingredients.length === 0) return window.showToast("Enter a recipe name and add ingredients.", "error");

    const aggregatedMicros = { fiber_g:0, sugar_g:0, sodium_mg:0, saturated_fat_g:0, cholesterol_mg:0, potassium_mg:0, vitamin_a_ug:0, vitamin_c_mg:0, vitamin_d_ug:0, calcium_mg:0, iron_mg:0 };
    ingredients.forEach(i => { for (const k in aggregatedMicros) aggregatedMicros[k] += (i.micros?.[k] || 0); });

    const payload = {
      name: name, source: 'composite', serving_size_g: parseFloat(totalGEl.value), serving_name: recipeUnitEl.value.trim(),
      ingredients: ingredients, 
      macros: { calories: parseFloat(document.getElementById('recipe-cal').innerText), protein_g: parseFloat(document.getElementById('recipe-pro').innerText), carbs_g: parseFloat(document.getElementById('recipe-carb').innerText), fat_g: parseFloat(document.getElementById('recipe-fat').innerText) },
      micros: aggregatedMicros
    };

    if (editingRecipeId) { await db.foods.update(editingRecipeId, payload); window.showToast("Recipe updated successfully!"); } 
    else { await db.foods.add(payload); window.showToast("Recipe saved to library!"); }

    resetForm();
  });

  window.editCompositeRecipe = async (id) => {
    const food = await db.foods.get(id);
    if (!food || food.source !== 'composite') return;
    editingRecipeId = id;
    recipeNameEl.value = food.name; recipeUnitEl.value = food.serving_name || '';
    ingredients = food.ingredients || [];
    renderIngredients();
    
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-target') === 'recipe-composer'));
    document.querySelectorAll('.page').forEach(page => {
      page.classList.toggle('active', page.id === 'recipe-composer');
      page.classList.toggle('hidden', page.id !== 'recipe-composer');
    });
  };

  function resetForm() {
    recipeNameEl.value = ''; recipeUnitEl.value = ''; searchInput.value = '';
    ingredients = []; editingRecipeId = null; renderIngredients();
  }

  return { renderIngredients, resetForm };
}