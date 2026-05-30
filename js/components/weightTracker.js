import { db } from '../db.js';

export function initWeightTracker() {
  const logDateInput = document.getElementById('weight-log-date');
  const weightInput = document.getElementById('weight-input');
  const btnLogWeight = document.getElementById('btn-log-weight');
  const historyList = document.getElementById('weight-history-list');
  const ctx = document.getElementById('weightChart').getContext('2d');
  
  // Date Filters
  const filterStartDate = document.getElementById('filter-start-date');
  const filterEndDate = document.getElementById('filter-end-date');
  const btnClearFilter = document.getElementById('btn-clear-filter');
  
  // Edit Modal
  const modal = document.getElementById('edit-weight-modal');
  const editDateInput = document.getElementById('edit-weight-date');
  const editValueInput = document.getElementById('edit-weight-value');
  const btnCancelEdit = document.getElementById('btn-cancel-weight-edit');
  const btnSaveEdit = document.getElementById('btn-save-weight-edit');

  let chartInstance = null;

  function setDefaultDate() {
    const now = new Date();
    const localTodayDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    logDateInput.value = localTodayDate;
  }

  async function renderPage() {
    // 1. Fetch all weights ordered descending (most recent first)
    let weightsDesc = await db.weight_logs.orderBy('date').reverse().toArray();
    
    // 2. Apply Date Filters if active
    const start = filterStartDate.value;
    const end = filterEndDate.value;
    
    if (start) {
      weightsDesc = weightsDesc.filter(w => w.date >= start);
    }
    if (end) {
      weightsDesc = weightsDesc.filter(w => w.date <= end);
    }

    renderChart(weightsDesc);
    renderHistory(weightsDesc);
  }

  function renderChart(weightsDesc) {
    // Reverse the filtered array so the graph renders chronologically (Left to Right)
    const weights = [...weightsDesc].reverse(); 
    const labels = weights.map(w => {
      const parts = w.date.split('-');
      return `${parts[1]}/${parts[2]}`; // MM/DD formatting
    }); 
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
        responsive: true, 
        maintainAspectRatio: false, // Prevents resizing bugs alongside the fixed height parent
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' } },
          y: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' } }
        }
      }
    });
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

  // Filter Event Listeners
  filterStartDate.addEventListener('change', renderPage);
  filterEndDate.addEventListener('change', renderPage);
  btnClearFilter.addEventListener('click', () => {
    filterStartDate.value = '';
    filterEndDate.value = '';
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