import { db } from '../db.js';

export function initLibrary() {
  const searchInput = document.getElementById('library-search');
  const listEl = document.getElementById('library-list');
  const editModal = document.getElementById('library-edit-modal');
  const toggleEditMicrosBtn = document.getElementById('btn-toggle-edit-micros');
  const editMicrosPanel = document.getElementById('edit-micros-panel');

  const editEls = {
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

      div.innerHTML = `
        <div class="list-item-header">
          <div class="list-item-title">
            <button class="btn-favorite ${food.is_favorite ? 'active' : ''}" data-id="${food.id}" title="Toggle Favorite">★</button>
            ${food.name} <span class="badge ${badgeClass}">${food.source}</span>
          </div>
          <div class="list-item-actions">
            <button class="btn-secondary edit-food-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" data-id="${food.id}" data-source="${food.source}">✎ Edit</button>
            <button class="btn-ghost-danger delete-food-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" data-id="${food.id}">✕</button>
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

  async function openEditModal(id) {
    const food = await db.foods.get(id);
    if (!food) return;

    activeEditId = id;
    editEls.name.value = food.name;
    editEls.serving_g.value = food.serving_size_g;
    editEls.base_unit.value = food.base_unit || 'g'; 
    editEls.serving_unit.value = food.serving_name || '';
    editEls.protein.value = food.macros.protein_g;
    editEls.carbs.value = food.macros.carbs_g;
    editEls.fat.value = food.macros.fat_g;
    editEls.calories.value = food.macros.calories;
    editEls.density.value = food.density || 1.0;

    const micros = food.micros || {};
    editEls.fiber.value = micros.fiber_g || 0;
    editEls.sugar.value = micros.sugar_g || 0;
    editEls.sodium.value = micros.sodium_mg || 0;
    editEls.sat_fat.value = micros.saturated_fat_g || 0;
    editEls.chol.value = micros.cholesterol_mg || 0;
    editEls.potassium.value = micros.potassium_mg || 0;
    editEls.vit_a.value = micros.vitamin_a_ug || 0;
    editEls.vit_c.value = micros.vitamin_c_mg || 0;
    editEls.vit_d.value = micros.vitamin_d_ug || 0;
    editEls.calcium.value = micros.calcium_mg || 0;
    editEls.iron.value = micros.iron_mg || 0;

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