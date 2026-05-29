import { db } from '../db.js';

export function initDashboard() {
  const dateInput = document.getElementById('dash-date');
  const dateDisplay = document.getElementById('dash-date-display');
  const logList = document.getElementById('dash-log-list');

  const els = {
    calTxt: document.getElementById('dash-cal-text'), calBar: document.getElementById('dash-cal-bar'),
    proTxt: document.getElementById('dash-pro-text'), proBar: document.getElementById('dash-pro-bar'),
    carbTxt: document.getElementById('dash-carb-text'), carbBar: document.getElementById('dash-carb-bar'),
    fatTxt: document.getElementById('dash-fat-text'), fatBar: document.getElementById('dash-fat-bar'),
  };

  function setToday() {
    dateInput.value = new Date().toISOString().split('T')[0];
    updateDateDisplay();
  }
  setToday();

  function updateDateDisplay() {
    const d = new Date(dateInput.value + 'T00:00:00');
    dateDisplay.innerText = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    renderDashboard();
  }

  function modifyDate(days) {
    const d = new Date(dateInput.value);
    d.setUTCDate(d.getUTCDate() + days);
    dateInput.value = d.toISOString().split('T')[0];
    updateDateDisplay();
  }

  dateInput.addEventListener('change', updateDateDisplay);
  
  // Make the text beautifully clickable via modern JS API fallback
  dateDisplay.addEventListener('click', () => {
    try { dateInput.showPicker(); } catch (e) { dateInput.focus(); }
  });

  document.getElementById('btn-prev-day').addEventListener('click', () => modifyDate(-1));
  document.getElementById('btn-next-day').addEventListener('click', () => modifyDate(1));

  async function renderDashboard() {
    const selectedDate = dateInput.value;
    if (!selectedDate) return;

    const [profile, logs] = await Promise.all([
      db.profile.get(1),
      db.logs.where('date').equals(selectedDate).toArray()
    ]);

    // SORT LOGS: Oldest to Most Recent
    logs.sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));

    const totals = { cal: 0, pro: 0, carb: 0, fat: 0 };
    logs.forEach(log => {
      totals.cal += log.macros.calories || 0; totals.pro += log.macros.protein_g || 0;
      totals.carb += log.macros.carbs_g || 0; totals.fat += log.macros.fat_g || 0;
    });

    const goals = profile || { target_calories: 2000, target_protein_g: 150, target_carbs_g: 200, target_fat_g: 65 };

    updateBar(els.calBar, els.calTxt, totals.cal, goals.target_calories, 'kcal');
    updateBar(els.proBar, els.proTxt, totals.pro, goals.target_protein_g, 'g');
    updateBar(els.carbBar, els.carbTxt, totals.carb, goals.target_carbs_g, 'g');
    updateBar(els.fatBar, els.fatTxt, totals.fat, goals.target_fat_g, 'g');

    logList.innerHTML = '';
    if (logs.length === 0) {
      logList.innerHTML = `<p class="text-muted text-sm text-center" style="padding: 20px 0;">No food logged yet for this day.</p>`;
      return;
    }

    logs.forEach(log => {
      const item = document.createElement('div');
      item.className = 'list-item';
      
      const micros = log.micros || {};
      
      // Pluralize serving unit gracefully
      let servingUnit = '';
      if (log.serving_name) {
        servingUnit = log.servings === 1 ? log.serving_name : (log.serving_name.endsWith('s') ? log.serving_name : `${log.serving_name}s`);
      } else {
        servingUnit = log.servings === 1 ? 'serving' : 'servings';
      }
      
      let timeStr = "";
      if (log.logged_at) {
        timeStr = new Date(log.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      item.innerHTML = `
        <div class="list-item-header">
          <div class="list-item-title">
            ${log.food_name} 
            <span style="font-size: 0.75rem; font-weight: 500; background: var(--surface-hover); padding: 0.15rem 0.4rem; border-radius: 4px; color: var(--text-muted);">${timeStr}</span>
            <span class="text-muted text-sm" style="font-weight: 400;">(${window.formatVal(log.servings)} ${servingUnit})</span>
          </div>
          <div class="list-item-actions">
            <button class="btn-secondary edit-log-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; border-radius: 4px;" data-id="${log.id}">✎ Edit</button>
            <button class="btn-ghost-danger delete-log-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" data-id="${log.id}">✕</button>
          </div>
        </div>
        
        <div class="macro-stats" style="cursor: pointer;" onclick="this.nextElementSibling.classList.toggle('hidden')">
          <div class="stat-col"><span class="stat-label">Calories</span><span class="stat-value cals">${Math.round(log.macros.calories)}</span></div>
          <div class="stat-col"><span class="stat-label">Protein</span><span class="stat-value">${window.formatVal(log.macros.protein_g)}g</span></div>
          <div class="stat-col"><span class="stat-label">Carbs</span><span class="stat-value">${window.formatVal(log.macros.carbs_g)}g</span></div>
          <div class="stat-col"><span class="stat-label">Fat</span><span class="stat-value">${window.formatVal(log.macros.fat_g)}g</span></div>
        </div>
        
        <div class="list-item-expandable hidden panel-transparent mt-1" style="padding: 1rem; border-top: 1px solid var(--border);">
          <div>Fiber: ${window.formatVal(micros.fiber_g)}g</div>
          <div>Sugar: ${window.formatVal(micros.sugar_g)}g</div>
          <div>Sodium: ${Math.round(micros.sodium_mg)}mg</div>
          <div>Sat Fat: ${window.formatVal(micros.saturated_fat_g)}g</div>
          <div>Chol: ${Math.round(micros.cholesterol_mg)}mg</div>
          <div>Potassium: ${Math.round(micros.potassium_mg)}mg</div>
        </div>
      `;
      logList.appendChild(item);
    });

    document.querySelectorAll('.edit-log-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.target.getAttribute('data-id'));
        if (window.editPastLog) window.editPastLog(id);
      });
    });

    document.querySelectorAll('.delete-log-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = parseInt(e.target.getAttribute('data-id'));
        await db.logs.delete(id);
        window.showToast("Log entry removed.");
        renderDashboard();
      });
    });
  }

  function updateBar(barEl, txtEl, current, max, unit) {
    const percent = Math.min((current / max) * 100, 100);
    txtEl.innerText = `${Math.round(current)}${unit} / ${Math.round(max)}${unit}`;
    barEl.style.width = `${percent}%`;
    barEl.classList.remove('warning', 'danger');
    if (current > max) barEl.classList.add('danger');
    else if (percent >= 90) barEl.classList.add('warning');
  }

  return { renderDashboard, resetDate: setToday };
}