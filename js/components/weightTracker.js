import { db } from '../db.js';

export function initWeightTracker() {
  const logDateInput = document.getElementById('weight-log-date');
  const weightInput = document.getElementById('weight-input');
  const btnLogWeight = document.getElementById('btn-log-weight');
  const historyList = document.getElementById('weight-history-list');
  const ctx = document.getElementById('weightChart').getContext('2d');
  
  // Date Filters
  const btnFilterWeek = document.getElementById('btn-filter-week');
  const btnFilterMonth = document.getElementById('btn-filter-month');
  const btnFilterAll = document.getElementById('btn-filter-all');
  const btnFilterCustom = document.getElementById('btn-filter-custom');
  const customDateModal = document.getElementById('custom-date-modal');
  const btnCancelCustomDate = document.getElementById('btn-cancel-custom-date');
  const btnApplyCustomDate = document.getElementById('btn-apply-custom-date');
  const filterStartDate = document.getElementById('filter-start-date');
  const filterEndDate = document.getElementById('filter-end-date');
  
  // Edit Modal
  const modal = document.getElementById('edit-weight-modal');
  const editDateInput = document.getElementById('edit-weight-date');
  const editValueInput = document.getElementById('edit-weight-value');
  const btnCancelEdit = document.getElementById('btn-cancel-weight-edit');
  const btnSaveEdit = document.getElementById('btn-save-weight-edit');

  let chartInstance = null;
  let activePreset = 'all'; // 'week', 'month', 'all', 'custom'

  function setDefaultDate() {
    const now = new Date();
    const localTodayDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    logDateInput.value = localTodayDate;
  }

  function getFilterBounds(allWeightsAsc) {
    const now = new Date();
    const toLocalISOString = (d) => {
      return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    };
    const todayStr = toLocalISOString(now);

    if (activePreset === 'week') {
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      return { start: toLocalISOString(start), end: todayStr };
    }
    if (activePreset === 'month') {
      const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      return { start: toLocalISOString(start), end: todayStr };
    }
    if (activePreset === 'custom') {
      let start = filterStartDate.value;
      let end = filterEndDate.value;
      if (!start && allWeightsAsc.length > 0) start = allWeightsAsc[0].date;
      if (!end && allWeightsAsc.length > 0) end = allWeightsAsc[allWeightsAsc.length - 1].date;
      return { start: start || todayStr, end: end || todayStr };
    }

    // Default 'all': earliest log to latest log (or today if empty)
    const start = allWeightsAsc.length > 0 ? allWeightsAsc[0].date : todayStr;
    const end = allWeightsAsc.length > 0 ? allWeightsAsc[allWeightsAsc.length - 1].date : todayStr;
    return { start, end };
  }

  async function renderPage() {
    const allWeightsAsc = await db.weight_logs.orderBy('date').toArray();
    const { start: filterStart, end: filterEnd } = getFilterBounds(allWeightsAsc);

    // Sidebar history shows strictly within [filterStart, filterEnd]
    const historyLogs = allWeightsAsc
      .filter(w => w.date >= filterStart && w.date <= filterEnd)
      .reverse();

    // Find nearest off-screen logs to draw connecting line
    let preLog = null;
    let postLog = null;

    for (let i = 0; i < allWeightsAsc.length; i++) {
      const log = allWeightsAsc[i];
      if (log.date < filterStart) {
        preLog = log;
      }
      if (log.date > filterEnd && !postLog) {
        postLog = log;
      }
    }

    const chartLogs = allWeightsAsc.filter(w => w.date >= filterStart && w.date <= filterEnd);

    renderChart(chartLogs, preLog, postLog, filterStart, filterEnd);
    renderHistory(historyLogs);
  }

  function getDatesInRange(startDateStr, endDateStr) {
    const dates = [];
    const start = new Date(startDateStr + 'T00:00:00');
    const end = new Date(endDateStr + 'T00:00:00');
    let current = new Date(start);
    while (current <= end) {
      const yyyy = current.getFullYear();
      const mm = String(current.getMonth() + 1).padStart(2, '0');
      const dd = String(current.getDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  function renderChart(chartLogs, preLog, postLog, filterStart, filterEnd) {
    let labels = [];
    let data = [];

    const chartMin = preLog ? preLog.date : filterStart;
    const chartMax = postLog ? postLog.date : filterEnd;

    if (chartMin && chartMax && chartMin <= chartMax) {
      const allDates = getDatesInRange(chartMin, chartMax);

      const weightMap = new Map();
      if (preLog) weightMap.set(preLog.date, preLog.weight_kg);
      chartLogs.forEach(w => weightMap.set(w.date, w.weight_kg));
      if (postLog) weightMap.set(postLog.date, postLog.weight_kg);

      labels = allDates.map(dStr => {
        const parts = dStr.split('-');
        return `${parts[1]}/${parts[2]}`; // MM/DD
      });

      data = allDates.map(dStr => weightMap.has(dStr) ? weightMap.get(dStr) : null);

      const minIndex = allDates.indexOf(filterStart);
      const maxIndex = allDates.indexOf(filterEnd);

      const xMin = minIndex !== -1 ? minIndex : undefined;
      const xMax = maxIndex !== -1 ? maxIndex : undefined;

      if (chartInstance) chartInstance.destroy();

      chartInstance = new window.Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Weight (kg)', data: data, borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 2, fill: true,
            tension: 0.3, pointBackgroundColor: '#10b981',
            spanGaps: true
          }]
        },
        options: {
          responsive: true, 
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { 
              min: xMin,
              max: xMax,
              ticks: { color: '#9ca3af' }, 
              grid: { color: '#374151' } 
            },
            y: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' } }
          }
        }
      });
    } else {
      if (chartInstance) chartInstance.destroy();
    }
  }

  function renderHistory(weightsDesc) {
    historyList.innerHTML = '';
    if (weightsDesc.length === 0) {
      historyList.innerHTML = '<p class="text-muted text-sm text-center mt-1">No weight logs found.</p>';
      return;
    }

    weightsDesc.forEach(log => {
      const item = document.createElement('div');
      item.className = 'list-item flex-between';
      item.style.padding = '0.75rem 1rem';
      item.style.marginBottom = '0.5rem';
      
      const dObj = new Date(log.date + 'T00:00:00');
      const formatString = dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      item.innerHTML = `
        <div>
          <div style="font-weight: 600; color: var(--primary); font-size: 1.1rem;">${log.weight_kg} kg</div>
          <div class="text-muted text-sm">${formatString}</div>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn-icon edit-wt-btn" style="width:30px;height:30px;font-size:0.85rem;" data-date="${log.date}" title="Edit log">✎</button>
          <button class="btn-icon delete-wt-btn" style="width:30px;height:30px;font-size:0.85rem;color:var(--danger);" data-date="${log.date}" title="Delete log">✕</button>
        </div>
      `;
      historyList.appendChild(item);
    });

    // Attach Event Listeners to generated buttons
    document.querySelectorAll('.edit-wt-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const date = e.currentTarget.getAttribute('data-date');
        const log = await db.weight_logs.get(date);
        if (log) {
          editDateInput.value = log.date;
          editValueInput.value = log.weight_kg;
          modal.classList.remove('hidden');
        }
      });
    });

    document.querySelectorAll('.delete-wt-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const date = e.currentTarget.getAttribute('data-date');
        const confirmed = await window.customConfirm("Delete Weight Log", `Are you sure you want to delete the weight log for ${date}?`, true);
        if (confirmed) {
          await db.weight_logs.delete(date);
          window.showToast("Weight log deleted.");
          renderPage();
        }
      });
    });
  }

  // Handle logging a new weight
  btnLogWeight.addEventListener('click', async () => {
    const weightVal = parseFloat(weightInput.value);
    const dateVal = logDateInput.value;
    
    if (!weightVal || !dateVal) return window.showToast("Enter a valid date and weight.", "error");
    
    await db.weight_logs.put({ date: dateVal, weight_kg: weightVal });
    
    weightInput.value = '';
    setDefaultDate();
    window.showToast("Weight logged successfully!");
    renderPage();
  });

  function updatePresetButtons(activeBtn) {
    [btnFilterWeek, btnFilterMonth, btnFilterAll, btnFilterCustom].forEach(btn => {
      btn.classList.remove('active');
    });
    activeBtn.classList.add('active');
  }

  btnFilterWeek.addEventListener('click', () => {
    activePreset = 'week';
    updatePresetButtons(btnFilterWeek);
    renderPage();
  });

  btnFilterMonth.addEventListener('click', () => {
    activePreset = 'month';
    updatePresetButtons(btnFilterMonth);
    renderPage();
  });

  btnFilterAll.addEventListener('click', () => {
    activePreset = 'all';
    updatePresetButtons(btnFilterAll);
    renderPage();
  });

  btnFilterCustom.addEventListener('click', () => {
    customDateModal.classList.remove('hidden');
  });

  btnCancelCustomDate.addEventListener('click', () => {
    customDateModal.classList.add('hidden');
  });

  btnApplyCustomDate.addEventListener('click', () => {
    activePreset = 'custom';
    updatePresetButtons(btnFilterCustom);
    customDateModal.classList.add('hidden');
    renderPage();
  });

  // Modal Handlers
  btnCancelEdit.addEventListener('click', () => modal.classList.add('hidden'));
  btnSaveEdit.addEventListener('click', async () => {
    const date = editDateInput.value;
    const weightVal = parseFloat(editValueInput.value);
    
    if (!weightVal) return window.showToast("Enter a valid weight.", "error");

    await db.weight_logs.put({ date: date, weight_kg: weightVal });
    window.showToast("Weight log updated!");
    modal.classList.add('hidden');
    renderPage();
  });

  // Initialization
  setDefaultDate();
  
  return { renderPage };
}