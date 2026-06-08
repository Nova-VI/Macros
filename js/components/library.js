import { db } from '../db.js';

export function initLibrary() {
  const searchInput = document.getElementById('library-search');
  const listEl = document.getElementById('library-list');
  const editModal = document.getElementById('library-edit-modal');
  const toggleEditMicrosBtn = document.getElementById('btn-toggle-edit-micros');
  const editMicrosPanel = document.getElementById('edit-micros-panel');

  const editEls = {
    emojiBtn: document.getElementById('edit-lib-emoji-btn'), // Controlled Emoji Button
    name: document.getElementById('edit-lib-name'), 
    serving_g: document.getElementById('edit-lib-serving-g'),
    base_unit: document.getElementById('edit-lib-base-unit'), 
    serving_unit: document.getElementById('edit-lib-serving-unit'), 
    protein: document.getElementById('edit-lib-protein'),
    carbs: document.getElementById('edit-lib-carbs'), 
    fat: document.getElementById('edit-lib-fat'), 
    calories: document.getElementById('edit-lib-calories'),
    density: document.getElementById('edit-lib-density'),
    fiber: document.getElementById('edit-lib-fiber'), 
    sugar: document.getElementById('edit-lib-sugar'),
    sodium: document.getElementById('edit-lib-sodium'), 
    sat_fat: document.getElementById('edit-lib-sat-fat'),
    chol: document.getElementById('edit-lib-chol'), 
    potassium: document.getElementById('edit-lib-potassium'),
    vit_a: document.getElementById('edit-lib-vit-a'), 
    vit_c: document.getElementById('edit-lib-vit-c'),
    vit_d: document.getElementById('edit-lib-vit-d'), 
    calcium: document.getElementById('edit-lib-calcium'), 
    iron: document.getElementById('edit-lib-iron'),
    saveBtn: document.getElementById('btn-save-lib-edit'), 
    cancelBtn: document.getElementById('btn-cancel-lib-edit')
  };

  let activeEditId = null;

  editEls.emojiBtn.addEventListener('click', () => {
    window.openEmojiPicker((emj) => {
      editEls.emojiBtn.innerText = emj;
    });
  });

  toggleEditMicrosBtn.addEventListener('click', () => {
    const isHidden = editMicrosPanel.classList.toggle('hidden');
    toggleEditMicrosBtn.innerText = isHidden ? "Show Advanced Micronutrients ▾" : "Hide Advanced Micronutrients ▴";
  });

  async function renderLibrary(filterText = '') {
    let foods = await db.foods.toArray();
    if (filterText) foods = foods.filter(f => f.name.toLowerCase().includes(filterText.toLowerCase()));

    listEl.innerHTML = '';
    if (foods.length === 0) return listEl.innerHTML = `<p class="text-muted text-sm text-center" style="padding: 20px 0;">No foods found in your library.</p>`;

    foods.forEach(food => {
      const div = document.createElement('div');
      div.className = 'list-item';
      let badgeClass = food.source === 'custom' ? 'history' : (food.source === 'composite' ? 'composite' : 'usda');
      const unit = food.base_unit || 'g'; 
      const emj = food.emoji || '🍽️';

      div.innerHTML = `
        <div class="list-item-header">
          <div class="list-item-title">
            <button class="btn-favorite ${food.is_favorite ? 'active' : ''}" data-id="${food.id}" title="Toggle Favorite">★</button>
            ${emj} ${food.name} <span class="badge ${badgeClass}">${food.source}</span>
          </div>
          <div class="list-item-actions" style="display: flex; gap: 0.4rem;">
            <button class="btn-icon edit-food-btn" title="Edit" data-id="${food.id}" data-source="${food.source}">✎</button>
            <button class="btn-icon delete-food-btn" title="Delete" style="color: var(--danger);" data-id="${food.id}">✕</button>
          </div>
        </div>
        <div class="macro-stats mt-05">
          <div class="stat-col"><span class="stat-label">Calories</span><span class="stat-value cals">${Math.round(food.macros.calories)}</span></div>
          <div class="stat-col"><span class="stat-label">Protein</span><span class="stat-value">${window.formatVal(food.macros.protein_g)}g</span></div>
          <div class="stat-col"><span class="stat-label">Carbs</span><span class="stat-value">${window.formatVal(food.macros.carbs_g)}g</span></div>
          <div class="stat-col"><span class="stat-label">Fat</span><span class="stat-value">${window.formatVal(food.macros.fat_g)}g</span></div>
        </div>
        <div class="text-muted text-sm mt-05">Base Serving: ${food.serving_size_g}${unit} ${food.serving_name || ''}</div>
      `;
      listEl.appendChild(div);
    });

    document.querySelectorAll('.btn-favorite').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = parseInt(e.target.getAttribute('data-id'));
        const food = await db.foods.get(id);
        await db.foods.update(id, { is_favorite: !food.is_favorite });
        renderLibrary(searchInput.value);
      });
    });

    document.querySelectorAll('.delete-food-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = parseInt(e.target.getAttribute('data-id'));
        const confirmed = await window.customConfirm("Delete Food", "Delete this food from library? Past logs are safe.", true);
        if (confirmed) {
          await db.foods.delete(id);
          window.showToast("Library item deleted.");
          renderLibrary(searchInput.value);
        }
      });
    });

    document.querySelectorAll('.edit-food-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.target.getAttribute('data-id'));
        if (e.target.getAttribute('data-source') === 'composite') {
          if (window.editCompositeRecipe) window.editCompositeRecipe(id);
        } else {
          openEditModal(id);
        }
      });
    });
  }

  // Cleans up floating-point artifacts (e.g. 28.000000000000004 → 28)
  function roundVal(v, decimals = 4) {
    if (v === undefined || v === null || isNaN(v)) return 0;
    return parseFloat(Number(v).toFixed(decimals));
  }

  async function openEditModal(id) {
    const food = await db.foods.get(id);
    if (!food) return;

    activeEditId = id;
    editEls.emojiBtn.innerText = food.emoji || '🍽️';
    editEls.name.value = food.name;
    editEls.serving_g.value = roundVal(food.serving_size_g, 2);
    editEls.base_unit.value = food.base_unit || 'g'; 
    editEls.serving_unit.value = food.serving_name || '';
    editEls.protein.value = roundVal(food.macros.protein_g);
    editEls.carbs.value = roundVal(food.macros.carbs_g);
    editEls.fat.value = roundVal(food.macros.fat_g);
    editEls.calories.value = roundVal(food.macros.calories, 1);
    editEls.density.value = roundVal(food.density || 1.0, 3);

    const micros = food.micros || {};
    editEls.fiber.value    = roundVal(micros.fiber_g);
    editEls.sugar.value    = roundVal(micros.sugar_g);
    editEls.sodium.value   = roundVal(micros.sodium_mg, 1);
    editEls.sat_fat.value  = roundVal(micros.saturated_fat_g);
    editEls.chol.value     = roundVal(micros.cholesterol_mg, 1);
    editEls.potassium.value = roundVal(micros.potassium_mg, 1);
    editEls.vit_a.value    = roundVal(micros.vitamin_a_ug, 1);
    editEls.vit_c.value    = roundVal(micros.vitamin_c_mg);
    editEls.vit_d.value    = roundVal(micros.vitamin_d_ug);
    editEls.calcium.value  = roundVal(micros.calcium_mg);
    editEls.iron.value     = roundVal(micros.iron_mg);

    editMicrosPanel.classList.add('hidden');
    toggleEditMicrosBtn.innerText = "Show Advanced Micronutrients ▾";
    editModal.classList.remove('hidden');
  }

  editEls.cancelBtn.addEventListener('click', () => { editModal.classList.add('hidden'); activeEditId = null; });

  editEls.saveBtn.addEventListener('click', async () => {
    if (!activeEditId) return;
    await db.foods.update(activeEditId, {
      name: editEls.name.value.trim(), serving_size_g: parseFloat(editEls.serving_g.value) || 100, 
      base_unit: editEls.base_unit.value, 
      serving_name: editEls.serving_unit.value.trim(),
      emoji: editEls.emojiBtn.innerText,
      density: parseFloat(editEls.density.value) || 1.0,
      macros: { protein_g: parseFloat(editEls.protein.value)||0, carbs_g: parseFloat(editEls.carbs.value)||0, fat_g: parseFloat(editEls.fat.value)||0, calories: parseFloat(editEls.calories.value)||0 },
      micros: {
        fiber_g: parseFloat(editEls.fiber.value)||0, sugar_g: parseFloat(editEls.sugar.value)||0, sodium_mg: parseFloat(editEls.sodium.value)||0,
        saturated_fat_g: parseFloat(editEls.sat_fat.value)||0, cholesterol_mg: parseFloat(editEls.chol.value)||0, potassium_mg: parseFloat(editEls.potassium.value)||0,
        vitamin_a_ug: parseFloat(editEls.vit_a.value)||0, vitamin_c_mg: parseFloat(editEls.vit_c.value)||0, vitamin_d_ug: parseFloat(editEls.vit_d.value)||0,
        calcium_mg: parseFloat(editEls.calcium.value)||0, iron_mg: parseFloat(editEls.iron.value)||0
      }
    });

    editModal.classList.add('hidden'); activeEditId = null;
    window.showToast("Library item updated successfully!");
    renderLibrary(searchInput.value);
  });

  searchInput.addEventListener('input', (e) => renderLibrary(e.target.value.trim()));
  return { renderLibrary };
}