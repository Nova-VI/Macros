import { db } from '../db.js';

export function initStats() {

  // --- State ---
  let calorieChartInstance = null;
  let macroChartInstance = null;
  let currentRange = '30'; // '7', '30', '90', 'all'
  let currentMetric = 'calories'; // 'calories', 'protein', 'carbs', 'fat'

  // --- DOM refs (will be populated on first render) ---
  const getEl = id => document.getElementById(id);

  // --- Date helpers ---
  function todayStr() {
    const now = new Date();
    return new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  }

  function subtractDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  }

  function getDatesInRange(startStr, endStr) {
    const dates = [];
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    let current = new Date(start);
    while (current <= end) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  function formatDateLabel(dateStr) {
    const parts = dateStr.split('-');
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  }

  // --- Data Aggregation ---
  async function aggregateData() {
    const today = todayStr();
    let startDate;

    if (currentRange === 'all') {
      startDate = null; // no lower bound
    } else {
      startDate = subtractDays(today, parseInt(currentRange));
    }

    const profile = await db.profile.get(1);
    const goals = profile || { target_calories: 2000, target_protein_g: 150, target_carbs_g: 200, target_fat_g: 65 };

    let logs;
    if (startDate) {
      logs = await db.logs.where('date').between(startDate, today, true, true).toArray();
    } else {
      logs = await db.logs.toArray();
    }

    // Group logs by date
    const dailyMap = {};
    logs.forEach(log => {
      if (!dailyMap[log.date]) {
        dailyMap[log.date] = {
          calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
          fiber_g: 0, sugar_g: 0, sodium_mg: 0, saturated_fat_g: 0,
          cholesterol_mg: 0, potassium_mg: 0, vitamin_a_ug: 0,
          vitamin_c_mg: 0, vitamin_d_ug: 0, calcium_mg: 0, iron_mg: 0,
          logCount: 0
        };
      }
      const d = dailyMap[log.date];
      d.calories += log.macros?.calories || 0;
      d.protein_g += log.macros?.protein_g || 0;
      d.carbs_g += log.macros?.carbs_g || 0;
      d.fat_g += log.macros?.fat_g || 0;
      const m = log.micros || {};
      d.fiber_g += m.fiber_g || 0;
      d.sugar_g += m.sugar_g || 0;
      d.sodium_mg += m.sodium_mg || 0;
      d.saturated_fat_g += m.saturated_fat_g || 0;
      d.cholesterol_mg += m.cholesterol_mg || 0;
      d.potassium_mg += m.potassium_mg || 0;
      d.vitamin_a_ug += m.vitamin_a_ug || 0;
      d.vitamin_c_mg += m.vitamin_c_mg || 0;
      d.vitamin_d_ug += m.vitamin_d_ug || 0;
      d.calcium_mg += m.calcium_mg || 0;
      d.iron_mg += m.iron_mg || 0;
      d.logCount++;
    });

    // Build the full date range for the chart (only dates with data endpoints)
    const sortedDates = Object.keys(dailyMap).sort();
    let allDates;
    if (sortedDates.length > 0) {
      const rangeStart = startDate || sortedDates[0];
      allDates = getDatesInRange(rangeStart, today);
    } else {
      allDates = startDate ? getDatesInRange(startDate, today) : [];
    }

    // Build daily arrays (null for days with no logs)
    const dailyCalories = allDates.map(d => dailyMap[d]?.calories ?? null);
    const dailyProtein = allDates.map(d => dailyMap[d]?.protein_g ?? null);
    const dailyCarbs = allDates.map(d => dailyMap[d]?.carbs_g ?? null);
    const dailyFat = allDates.map(d => dailyMap[d]?.fat_g ?? null);

    // Calculate averages (only over days that have actual data)
    const daysWithData = sortedDates.length;
    const sum = (key) => sortedDates.reduce((acc, d) => acc + (dailyMap[d]?.[key] || 0), 0);

    const avgCalories = daysWithData > 0 ? sum('calories') / daysWithData : 0;
    const avgProtein = daysWithData > 0 ? sum('protein_g') / daysWithData : 0;
    const avgCarbs = daysWithData > 0 ? sum('carbs_g') / daysWithData : 0;
    const avgFat = daysWithData > 0 ? sum('fat_g') / daysWithData : 0;

    const avgMicros = {};
    ['fiber_g', 'sugar_g', 'sodium_mg', 'saturated_fat_g', 'cholesterol_mg', 'potassium_mg',
     'vitamin_a_ug', 'vitamin_c_mg', 'vitamin_d_ug', 'calcium_mg', 'iron_mg'].forEach(key => {
      avgMicros[key] = daysWithData > 0 ? sum(key) / daysWithData : 0;
    });

    const totalLogs = logs.length;

    return {
      allDates, dailyCalories, dailyProtein, dailyCarbs, dailyFat,
      avgCalories, avgProtein, avgCarbs, avgFat, avgMicros,
      goals, daysWithData, totalLogs
    };
  }

  // --- Rendering ---
  async function renderPage() {
    const data = await aggregateData();

    renderFilterButtons();
    renderSummaryCards(data);
    renderCalorieChart(data);
    renderMacroChart(data);
    renderMicroPanel(data);
    renderInsights(data);
  }

  function renderFilterButtons() {
    document.querySelectorAll('#stats .stats-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.range === currentRange);
    });
  }

  function renderSummaryCards(data) {
    const { avgCalories, avgProtein, avgCarbs, avgFat, goals, daysWithData, totalLogs } = data;

    let goalVal = parseFloat(goals.goal) || 0;
    let maintenance = goals.target_calories - goalVal;
    let goalType = goalVal > 0 ? 'bulk' : goalVal < 0 ? 'cut' : 'maintain';

    function getCalorieStatus(avg, target) {
      if (daysWithData === 0) return { status: 'neutral', text: 'No Data', icon: '—' };
      const margin = Math.max(100, Math.round(target * 0.05));
      
      if (avg >= target - margin && avg <= target + margin) {
        return { status: 'on-track', text: 'On Track', icon: '✓' };
      }
      
      if (goalType === 'bulk') {
        if (avg > target + margin) return { status: 'warn', text: 'Dirty Bulking', icon: '⚠' };
        if (avg <= maintenance) return { status: 'off-track', text: 'Off Track', icon: '✗' };
        return { status: 'warn', text: 'Needs Boost', icon: '⚠' };
      } else if (goalType === 'cut') {
        if (avg < target - margin) return { status: 'warn', text: 'Aggressive Cut', icon: '⚠' };
        if (avg >= maintenance) return { status: 'off-track', text: 'Off Track', icon: '✗' };
        return { status: 'warn', text: 'Over Target', icon: '⚠' };
      } else {
        return { status: 'warn', text: 'Slightly Off', icon: '⚠' };
      }
    }

    function getProteinStatus(avg, target) {
      if (daysWithData === 0) return { status: 'neutral', text: 'No Data', icon: '—' };
      const margin = Math.max(10, Math.round(target * 0.10));
      if (avg >= target - margin) return { status: 'on-track', text: 'On Track', icon: '✓' };
      return { status: 'warn', text: 'Needs Boost', icon: '⚠' };
    }

    function getNeutralStatus() {
      if (daysWithData === 0) return { status: 'neutral', text: 'No Data', icon: '—' };
      return { status: 'neutral', text: 'Tracked', icon: '📊' };
    }

    function fillPercent(avg, target) {
      return Math.min((avg / Math.max(1, target)) * 100, 100);
    }

    const cards = [
      { id: 'stat-cal', label: 'Avg Calories', value: `${Math.round(avgCalories)} kcal`, target: `Target: ${goals.target_calories} kcal`, s: getCalorieStatus(avgCalories, goals.target_calories), fill: fillPercent(avgCalories, goals.target_calories), color: '#10b981' },
      { id: 'stat-pro', label: 'Avg Protein', value: `${Math.round(avgProtein)}g`, target: `Target: ${goals.target_protein_g}g`, s: getProteinStatus(avgProtein, goals.target_protein_g), fill: fillPercent(avgProtein, goals.target_protein_g), color: '#10b981' },
      { id: 'stat-carb', label: 'Avg Carbs', value: `${Math.round(avgCarbs)}g`, target: `Target: ${goals.target_carbs_g}g`, s: getNeutralStatus(), fill: fillPercent(avgCarbs, goals.target_carbs_g), color: '#3b82f6' },
      { id: 'stat-fat', label: 'Avg Fat', value: `${Math.round(avgFat)}g`, target: `Target: ${goals.target_fat_g}g`, s: getNeutralStatus(), fill: fillPercent(avgFat, goals.target_fat_g), color: '#f59e0b' },
    ];

    const container = getEl('stats-summary-cards');
    container.innerHTML = '';

    // Meta card: days tracked and total logs
    const metaCard = document.createElement('div');
    metaCard.className = 'stats-meta-card';
    metaCard.innerHTML = `
      <div class="stats-meta-item">
        <span class="stats-meta-value">${daysWithData}</span>
        <span class="stats-meta-label">Days Tracked</span>
      </div>
      <div class="stats-meta-divider"></div>
      <div class="stats-meta-item">
        <span class="stats-meta-value">${totalLogs}</span>
        <span class="stats-meta-label">Total Logs</span>
      </div>
      <div class="stats-meta-divider"></div>
      <div class="stats-meta-item">
        <span class="stats-meta-value">${daysWithData > 0 ? Math.round(totalLogs / daysWithData) : 0}</span>
        <span class="stats-meta-label">Avg Logs/Day</span>
      </div>
    `;
    container.appendChild(metaCard);

    cards.forEach(card => {
      const el = document.createElement('div');
      el.className = `stats-card stats-card--${card.s.status}`;
      el.id = card.id;

      el.innerHTML = `
        <div class="stats-card-header">
          <span class="stats-card-label">${card.label}</span>
          <span class="stats-card-status stats-status--${card.s.status}">${card.s.icon} ${card.s.text}</span>
        </div>
        <div class="stats-card-value">${card.value}</div>
        <div class="stats-card-target">${card.target}</div>
        <div class="stats-card-bar-bg">
          <div class="stats-card-bar-fill" style="width: ${card.fill}%; background: ${card.color};"></div>
        </div>
      `;
      container.appendChild(el);
    });
  }

  function renderCalorieChart(data) {
    const { allDates, dailyCalories, dailyProtein, dailyCarbs, dailyFat, goals } = data;
    const canvas = getEl('stats-calorie-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const labels = allDates.map(formatDateLabel);
    let hoveredDatasetIndex = null;

    let datasets = [];
    let options = {};

    // Sync dropdown DOM select value
    const selectEl = getEl('stats-trend-metric-select');
    if (selectEl) selectEl.value = currentMetric;

    if (currentMetric === 'calories') {
      const proCals = dailyProtein.map(v => v !== null ? v * 4 : null);
      const carbCals = dailyCarbs.map(v => v !== null ? v * 4 : null);
      const fatCals = dailyFat.map(v => v !== null ? v * 9 : null);

      datasets = [
        {
          type: 'bar',
          label: 'Protein',
          data: proCals,
          backgroundColor: (context) => {
            if (hoveredDatasetIndex === null || hoveredDatasetIndex === 0) {
              return 'rgba(16, 185, 129, 1)';
            }
            return 'rgba(16, 185, 129, 0.15)';
          },
          borderColor: 'transparent',
          borderWidth: 0,
          stack: 'macros',
          barPercentage: 0.85,
          categoryPercentage: 0.85,
        },
        {
          type: 'bar',
          label: 'Carbs',
          data: carbCals,
          backgroundColor: (context) => {
            if (hoveredDatasetIndex === null || hoveredDatasetIndex === 1) {
              return 'rgba(59, 130, 246, 1)';
            }
            return 'rgba(59, 130, 246, 0.15)';
          },
          borderColor: 'transparent',
          borderWidth: 0,
          stack: 'macros',
          barPercentage: 0.85,
          categoryPercentage: 0.85,
        },
        {
          type: 'bar',
          label: 'Fat',
          data: fatCals,
          backgroundColor: (context) => {
            if (hoveredDatasetIndex === null || hoveredDatasetIndex === 2) {
              return 'rgba(245, 158, 11, 1)';
            }
            return 'rgba(245, 158, 11, 0.15)';
          },
          borderColor: 'transparent',
          borderWidth: 0,
          stack: 'macros',
          barPercentage: 0.85,
          categoryPercentage: 0.85,
        },
        {
          type: 'line',
          label: 'Target',
          data: allDates.map(() => goals.target_calories),
          borderColor: 'rgba(239, 68, 68, 0.65)',
          borderDash: [8, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          stacked: false,
        }
      ];

      options = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'nearest',
          intersect: true,
        },
        onHover: (event, chartElements) => {
          if (!calorieChartInstance) return;
          let newHoveredDatasetIndex = null;
          if (chartElements.length > 0) {
            const datasetIdx = chartElements[0].datasetIndex;
            if (datasetIdx < 3) {
              newHoveredDatasetIndex = datasetIdx;
            }
          }
          if (newHoveredDatasetIndex !== hoveredDatasetIndex) {
            hoveredDatasetIndex = newHoveredDatasetIndex;
            calorieChartInstance.update({
              duration: 200,
              easing: 'easeOutQuad'
            });
          }
        },
        onClick: (event, chartElements) => {
          if (chartElements.length > 0) {
            const activePoint = chartElements[0];
            const datasetIdx = activePoint.datasetIndex;
            if (datasetIdx < 3) {
              const metrics = ['protein', 'carbs', 'fat'];
              currentMetric = metrics[datasetIdx];
              
              // Sync DOM select dropdown
              const selectEl = getEl('stats-trend-metric-select');
              if (selectEl) selectEl.value = currentMetric;

              // Update description text
              const descEl = getEl('stats-trend-description');
              if (descEl) {
                descEl.innerText = `Your daily ${currentMetric} intake vs. your target over the selected period.`;
              }

              // Re-render chart with new metric
              renderCalorieChart(data);
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              color: '#9ca3af',
              font: { size: 12 },
              boxWidth: 12,
              boxHeight: 12,
              padding: 16,
            }
          },
          tooltip: {
            mode: 'nearest',
            intersect: true,
            backgroundColor: 'rgba(28, 31, 38, 0.95)',
            borderColor: '#374151',
            borderWidth: 1,
            titleColor: '#f3f4f6',
            bodyColor: '#9ca3af',
            cornerRadius: 8,
            padding: 12,
            titleFont: { weight: '600' },
            filter: (tooltipItem) => {
              if (hoveredDatasetIndex !== null && hoveredDatasetIndex < 3) {
                return tooltipItem.datasetIndex === hoveredDatasetIndex;
              }
              return tooltipItem.datasetIndex !== 3; // Hide target unless hovering it directly
            },
            callbacks: {
              title: (items) => {
                const idx = items[0].dataIndex;
                return allDates[idx];
              },
              label: (item) => {
                const idx = item.dataIndex;
                const datasetIdx = item.datasetIndex;
                if (datasetIdx === 3) {
                  return `Target: ${Math.round(item.raw)} kcal`;
                }
                const val = item.raw;
                if (val === null) return `${item.dataset.label}: No data`;
                let grams = 0;
                if (datasetIdx === 0) grams = dailyProtein[idx] || 0;
                else if (datasetIdx === 1) grams = dailyCarbs[idx] || 0;
                else if (datasetIdx === 2) grams = dailyFat[idx] || 0;
                return `${item.dataset.label}: ${Math.round(val)} kcal (${Math.round(grams)}g)`;
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { color: 'rgba(55, 65, 81, 0.3)' },
            ticks: {
              color: '#9ca3af',
              font: { size: 11 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 14
            }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: 'rgba(55, 65, 81, 0.3)' },
            ticks: {
              color: '#9ca3af',
              font: { size: 11 },
              callback: v => `${v} kcal`
            }
          }
        }
      };
    } else {
      let rawData = [];
      let targetVal = 0;
      let label = '';
      let color = '';
      let colorRgb = '';

      if (currentMetric === 'protein') {
        rawData = dailyProtein;
        targetVal = goals.target_protein_g;
        label = 'Protein';
        color = '#10b981';
        colorRgb = '16, 185, 129';
      } else if (currentMetric === 'carbs') {
        rawData = dailyCarbs;
        targetVal = goals.target_carbs_g;
        label = 'Carbs';
        color = '#3b82f6';
        colorRgb = '59, 130, 246';
      } else if (currentMetric === 'fat') {
        rawData = dailyFat;
        targetVal = goals.target_fat_g;
        label = 'Fat';
        color = '#f59e0b';
        colorRgb = '245, 158, 11';
      }

      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight || 350);
      gradient.addColorStop(0, `rgba(${colorRgb}, 0.85)`);
      gradient.addColorStop(1, `rgba(${colorRgb}, 0.15)`);

      datasets = [
        {
          type: 'bar',
          label: label,
          data: rawData,
          backgroundColor: gradient,
          borderColor: color,
          borderWidth: 1.5,
          borderRadius: 4,
          barPercentage: 0.85,
          categoryPercentage: 0.85,
        },
        {
          type: 'line',
          label: 'Target',
          data: allDates.map(() => targetVal),
          borderColor: 'rgba(239, 68, 68, 0.75)',
          borderDash: [8, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          stacked: false,
        }
      ];

      options = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              color: '#9ca3af',
              font: { size: 12 },
              boxWidth: 12,
              boxHeight: 12,
              padding: 16,
            }
          },
          tooltip: {
            backgroundColor: 'rgba(28, 31, 38, 0.95)',
            borderColor: '#374151',
            borderWidth: 1,
            titleColor: '#f3f4f6',
            bodyColor: '#9ca3af',
            cornerRadius: 8,
            padding: 12,
            titleFont: { weight: '600' },
            callbacks: {
              title: (items) => {
                const idx = items[0].dataIndex;
                return allDates[idx];
              },
              label: (item) => {
                const datasetIdx = item.datasetIndex;
                if (datasetIdx === 1) {
                  return `Target: ${Math.round(item.raw)}g`;
                }
                const val = item.raw;
                if (val === null) return `${item.dataset.label}: No data`;
                return `${item.dataset.label}: ${Math.round(val)}g`;
              }
            }
          }
        },
        scales: {
          x: {
            stacked: false,
            grid: { color: 'rgba(55, 65, 81, 0.3)' },
            ticks: {
              color: '#9ca3af',
              font: { size: 11 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 14
            }
          },
          y: {
            stacked: false,
            beginAtZero: true,
            grid: { color: 'rgba(55, 65, 81, 0.3)' },
            ticks: {
              color: '#9ca3af',
              font: { size: 11 },
              callback: v => `${v}g`
            }
          }
        }
      };
    }

    if (calorieChartInstance) {
      calorieChartInstance.data.labels = labels;
      calorieChartInstance.data.datasets = datasets;
      calorieChartInstance.options = options;
      calorieChartInstance.update({
        duration: 500,
        easing: 'easeOutQuart'
      });
    } else {
      calorieChartInstance = new window.Chart(ctx, {
        data: {
          labels,
          datasets
        },
        options
      });
    }
  }

  function renderMacroChart(data) {
    const { avgProtein, avgCarbs, avgFat } = data;
    const canvas = getEl('stats-macro-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (macroChartInstance) macroChartInstance.destroy();

    const hasData = avgProtein > 0 || avgCarbs > 0 || avgFat > 0;
    const totalGrams = avgProtein + avgCarbs + avgFat;

    macroChartInstance = new window.Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: hasData ? ['Protein', 'Carbs', 'Fat'] : ['No Data'],
        datasets: [{
          data: hasData ? [avgProtein, avgCarbs, avgFat] : [1],
          backgroundColor: hasData
            ? ['#10b981', '#3b82f6', '#f59e0b']
            : ['#374151'],
          borderWidth: 0,
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: hasData,
            backgroundColor: 'rgba(28, 31, 38, 0.95)',
            borderColor: '#374151',
            borderWidth: 1,
            titleColor: '#f3f4f6',
            bodyColor: '#9ca3af',
            cornerRadius: 8,
            padding: 12,
            callbacks: {
              label: (item) => {
                const pct = totalGrams > 0 ? Math.round((item.raw / totalGrams) * 100) : 0;
                return `${item.label}: ${Math.round(item.raw)}g (${pct}%)`;
              }
            }
          }
        }
      }
    });

    // Update legend text
    const legendContainer = getEl('stats-macro-legend');
    if (legendContainer && hasData) {
      const pPct = totalGrams > 0 ? Math.round((avgProtein / totalGrams) * 100) : 0;
      const cPct = totalGrams > 0 ? Math.round((avgCarbs / totalGrams) * 100) : 0;
      const fPct = totalGrams > 0 ? Math.round((avgFat / totalGrams) * 100) : 0;

      legendContainer.innerHTML = `
        <div class="stats-macro-legend-item">
          <div class="stats-macro-legend-dot" style="background: #10b981;"></div>
          <div>
            <div class="stats-macro-legend-label">Protein</div>
            <div class="stats-macro-legend-value">${Math.round(avgProtein)}g <span class="text-muted">(${pPct}%)</span></div>
          </div>
        </div>
        <div class="stats-macro-legend-item">
          <div class="stats-macro-legend-dot" style="background: #3b82f6;"></div>
          <div>
            <div class="stats-macro-legend-label">Carbs</div>
            <div class="stats-macro-legend-value">${Math.round(avgCarbs)}g <span class="text-muted">(${cPct}%)</span></div>
          </div>
        </div>
        <div class="stats-macro-legend-item">
          <div class="stats-macro-legend-dot" style="background: #f59e0b;"></div>
          <div>
            <div class="stats-macro-legend-label">Fat</div>
            <div class="stats-macro-legend-value">${Math.round(avgFat)}g <span class="text-muted">(${fPct}%)</span></div>
          </div>
        </div>
      `;
    } else if (legendContainer) {
      legendContainer.innerHTML = '<div class="text-muted text-sm">No data available for this period.</div>';
    }
  }

  function renderMicroPanel(data) {
    const { avgMicros, daysWithData } = data;
    const panel = getEl('stats-micro-details');
    if (!panel) return;

    if (daysWithData === 0) {
      panel.innerHTML = '<div class="text-muted text-sm" style="padding: 1rem;">No micronutrient data available for this period.</div>';
      return;
    }

    const micros = [
      { label: 'Fiber', value: avgMicros.fiber_g, unit: 'g', precision: 1 },
      { label: 'Sugar', value: avgMicros.sugar_g, unit: 'g', precision: 1 },
      { label: 'Sodium', value: avgMicros.sodium_mg, unit: 'mg', precision: 0 },
      { label: 'Saturated Fat', value: avgMicros.saturated_fat_g, unit: 'g', precision: 1 },
      { label: 'Cholesterol', value: avgMicros.cholesterol_mg, unit: 'mg', precision: 0 },
      { label: 'Potassium', value: avgMicros.potassium_mg, unit: 'mg', precision: 0 },
      { label: 'Vitamin A', value: avgMicros.vitamin_a_ug, unit: 'µg', precision: 0 },
      { label: 'Vitamin C', value: avgMicros.vitamin_c_mg, unit: 'mg', precision: 1 },
      { label: 'Vitamin D', value: avgMicros.vitamin_d_ug, unit: 'µg', precision: 1 },
      { label: 'Calcium', value: avgMicros.calcium_mg, unit: 'mg', precision: 0 },
      { label: 'Iron', value: avgMicros.iron_mg, unit: 'mg', precision: 1 },
    ];

    panel.innerHTML = micros.map(m => `
      <div class="stats-micro-row">
        <span class="stats-micro-label">${m.label}</span>
        <span class="stats-micro-value">${m.precision > 0 ? m.value.toFixed(m.precision) : Math.round(m.value)} ${m.unit}</span>
      </div>
    `).join('');
  }

  function renderInsights(data) {
    const { avgCalories, avgProtein, goals, daysWithData } = data;
    const container = getEl('stats-insights');
    if (!container) return;

    if (daysWithData < 2) {
      container.innerHTML = '<div class="text-muted text-sm">Log at least 2 days of food to see insights.</div>';
      return;
    }

    const insights = [];
    const calDiff = avgCalories - goals.target_calories;
    if (Math.abs(calDiff) < goals.target_calories * 0.05) {
      insights.push({ icon: '🎯', text: 'Your average calorie intake is right on target. Keep it up!' });
    } else if (calDiff > 0) {
      insights.push({ icon: '📈', text: `You're averaging <strong>${Math.round(Math.abs(calDiff))} kcal</strong> over your daily target. Consider reducing portion sizes.` });
    } else {
      insights.push({ icon: '📉', text: `You're averaging <strong>${Math.round(Math.abs(calDiff))} kcal</strong> under your target. Make sure you're eating enough!` });
    }

    const proteinRatio = avgProtein / Math.max(1, goals.target_protein_g);
    if (proteinRatio >= 0.95) {
      insights.push({ icon: '💪', text: 'Great job hitting your protein target consistently!' });
    } else if (proteinRatio >= 0.75) {
      insights.push({ icon: '🥩', text: `You're getting <strong>${Math.round(proteinRatio * 100)}%</strong> of your protein target. Try adding a protein-rich snack.` });
    } else {
      insights.push({ icon: '⚠️', text: `You're only hitting <strong>${Math.round(proteinRatio * 100)}%</strong> of your protein target. This could impact muscle recovery.` });
    }

    // Weekly calorie estimate (calculated relative to maintenance)
    const goalVal = parseFloat(goals.goal) || 0;
    const maintenance = goals.target_calories - goalVal;
    const calDiffMaintenance = avgCalories - maintenance;
    const weeklyCalSurplus = calDiffMaintenance * 7;
    const kgChange = weeklyCalSurplus / 7700; // ~7700 kcal per kg body fat
    if (Math.abs(kgChange) > 0.05) {
      const direction = kgChange > 0 ? 'gain' : 'lose';
      insights.push({ icon: '⚖️', text: `At this pace, you'd ${direction} about <strong>${Math.abs(kgChange).toFixed(1)} kg/week</strong>.` });
    }

    container.innerHTML = insights.map(i => `
      <div class="stats-insight-item">
        <span class="stats-insight-icon">${i.icon}</span>
        <span class="stats-insight-text">${i.text}</span>
      </div>
    `).join('');
  }

  // --- Event Listeners ---
  function bindEvents() {
    document.querySelectorAll('#stats .stats-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentRange = btn.dataset.range;
        renderPage();
      });
    });

    const metricSelect = getEl('stats-trend-metric-select');
    if (metricSelect) {
      metricSelect.addEventListener('change', () => {
        currentMetric = metricSelect.value;
        const descEl = getEl('stats-trend-description');
        if (descEl) {
          if (currentMetric === 'calories') {
            descEl.innerText = "Your daily calorie intake vs. your target over the selected period.";
          } else {
            descEl.innerText = `Your daily ${currentMetric} intake vs. your target over the selected period.`;
          }
        }
        renderPage();
      });
    }

    const microToggle = getEl('stats-micro-toggle');
    const microPanel = getEl('stats-micro-panel');
    if (microToggle && microPanel) {
      microToggle.addEventListener('click', () => {
        const isHidden = microPanel.classList.toggle('hidden');
        microToggle.innerText = isHidden ? 'Show Micronutrients ▾' : 'Hide Micronutrients ▴';
      });
    }
  }

  // Init on first call
  bindEvents();

  return { renderPage };
}
