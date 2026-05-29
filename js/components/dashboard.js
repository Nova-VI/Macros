import { db } from '../db.js';

export function initDashboard() {
  const dateInput = document.getElementById('dash-date');
  const dateDisplay = document.getElementById('dash-date-display');
  const logList = document.getElementById('dash-log-list');
  const toggleViewBtn = document.getElementById('btn-toggle-view');

  const els = {
    calTxt: document.getElementById('dash-cal-text'), calBar: document.getElementById('dash-cal-bar'),
    proTxt: document.getElementById('dash-pro-text'), proFill: document.getElementById('dash-pro-fill'),
    carbTxt: document.getElementById('dash-carb-text'), carbFill: document.getElementById('dash-carb-fill'),
    fatTxt: document.getElementById('dash-fat-text'), fatFill: document.getElementById('dash-fat-fill'),
  };

  let displayMode = 'consumed'; 
  let macroChartInstance = null;

  toggleViewBtn.addEventListener('click', (e) => {
    displayMode = displayMode === 'consumed' ? 'remaining' : 'consumed';
    e.target.innerText = displayMode === 'consumed' ? 'Show Remaining' : 'Show Consumed';
    renderDashboard();
  });

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
  
  dateDisplay.addEventListener('click', () => {
    try { dateInput.showPicker(); } catch (e) { dateInput.focus(); }
  });

  document.getElementById('btn-prev-day').addEventListener('click', () => modifyDate(-1));
  document.getElementById('btn-next-day').addEventListener('click', () => modifyDate(1));

  function formatText(current, max, unit) {
    if (displayMode === 'consumed') {
      return `${Math.round(current)}${unit} / ${Math.round(max)}${unit}`;
    } else {
      const diff = Math.round(max - current);
      if (diff >= 0) return `${diff}${unit} left`;
      else return `${Math.abs(diff)}${unit} over`;
    }
  }

  async function renderDashboard() {
    const selectedDate = dateInput.value;
    if (!selectedDate) return;

    const [profile, logs] = await Promise.all([
      db.profile.get(1),
      db.logs.where('date').equals(selectedDate).toArray()
    ]);

    logs.sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));

    const totals = { cal: 0, pro: 0, carb: 0, fat: 0 };
    logs.forEach(log => {
      totals.cal += log.macros.calories || 0; totals.pro += log.macros.protein_g || 0;
      totals.carb += log.macros.carbs_g || 0; totals.fat += log.macros.fat_g || 0;
    });

    const goals = profile || { target_calories: 2000, target_protein_g: 150, target_carbs_g: 200, target_fat_g: 65 };

    // Linear Bar just for Calories
    els.calTxt.innerText = formatText(totals.cal, goals.target_calories, 'kcal');
    const calPercent = Math.min((totals.cal / Math.max(1, goals.target_calories)) * 100, 100);
    els.calBar.style.width = `${calPercent}%`;
    els.calBar.classList.remove('warning', 'danger');
    if (totals.cal > goals.target_calories) els.calBar.classList.add('danger');
    else if (calPercent >= 90) els.calBar.classList.add('warning');

    // Text & Custom Fill Bars for Macros
    els.proTxt.innerText = formatText(totals.pro, goals.target_protein_g, 'g');
    const proPercent = Math.min((totals.pro / Math.max(1, goals.target_protein_g)) * 100, 100);
    els.proFill.style.width = `${proPercent}%`;

    els.carbTxt.innerText = formatText(totals.carb, goals.target_carbs_g, 'g');
    const carbPercent = Math.min((totals.carb / Math.max(1, goals.target_carbs_g)) * 100, 100);
    els.carbFill.style.width = `${carbPercent}%`;

    els.fatTxt.innerText = formatText(totals.fat, goals.target_fat_g, 'g');
    const fatPercent = Math.min((totals.fat / Math.max(1, goals.target_fat_g)) * 100, 100);
    els.fatFill.style.width = `${fatPercent}%`;

    // Chart.js Doughnut
    const ctx = document.getElementById('macroPieChart').getContext('2d');
    if (macroChartInstance) macroChartInstance.destroy();

    const hasData = totals.pro > 0 || totals.carb > 0 || totals.fat > 0;

    macroChartInstance = new window.Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: hasData ? ['Protein', 'Carbs', 'Fat'] : ['No Data'],
        datasets: [{
          data: hasData ? [totals.pro, totals.carb, totals.fat] : [1],
          backgroundColor: hasData ? ['#10b981', '#3b82f6', '#f59e0b'] : ['#374151'],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '78%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: hasData }
        }
      }
    });

    // Render Logs List
    logList.innerHTML = '';
    if (logs.length === 0) {
      logList.innerHTML = `<p class="text-muted text-sm text-center" style="padding: 20px 0;">No food logged yet for this day.</p>`;
      return;
    }

    logs.forEach(log => {
      const item = document.createElement('div');
      item.className = 'list-item';
      
      const micros = log.micros || {};
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

  return { renderDashboard, resetDate: setToday };
}