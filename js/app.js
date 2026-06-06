import { requestPersistentStorage, getApiKey, setApiKey } from './db.js';
import { initDashboard } from './components/dashboard.js';
import { initLogFood } from './components/logFood.js';
import { initRecipeComposer } from './components/recipeComposer.js';
import { initLibrary } from './components/library.js';
import { initSettings } from './components/settings.js';
import { initWeightTracker } from './components/weightTracker.js';
import { initStats } from './components/stats.js';

window.formatVal = function(val) {
  if (val === undefined || val === null || isNaN(val)) return '0';
  const num = Number(val);
  return num % 1 === 0 ? num.toString() : num.toFixed(1);
};

window.showToast = function(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.4s ease forwards';
    setTimeout(() => toast.remove(), 400);
  }, 2600);
};

window.customConfirm = function(title, message, isDanger = false) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const msgEl = document.getElementById('confirm-message');
    const cancelBtn = document.getElementById('btn-confirm-cancel');
    const okBtn = document.getElementById('btn-confirm-ok');

    titleEl.innerText = title;
    msgEl.innerText = message;
    okBtn.className = isDanger ? 'btn btn-danger' : 'btn';
    modal.classList.remove('hidden');

    const cleanUp = (result) => {
      modal.classList.add('hidden');
      cancelBtn.onclick = null; okBtn.onclick = null;
      resolve(result);
    };

    cancelBtn.onclick = () => cleanUp(false);
    okBtn.onclick = () => cleanUp(true);
  });
};

// --- GLOBAL EMOJI PICKER ---
const EMOJI_CATEGORIES = [
  { name: 'Common', emojis: ['🍽️','🍲','🥣','🥗','🥪','🥩','🍗','🍔','🍕','🍣'] },
  { name: 'Fruits', emojis: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅'] },
  { name: 'Vegetables', emojis: ['🍆','🥑','🫛','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠'] },
  { name: 'Meat & Poultry', emojis: ['🥩','🍗','🍖','🥓'] },
  { name: 'Seafood', emojis: ['🐟','🐠','🐡','🦐','🦑','🐙','🦞','🦀','🦪'] },
  { name: 'Dairy & Eggs', emojis: ['🥚','🍳','🧀','🧈','🥛'] },
  { name: 'Prepared Foods', emojis: ['🍞','🥐','🥖','🫓','🥨','🥯','🥞','🧇','🍔','🌭','🍟','🍕','🥪','🥙','🧆','🌮','🌯','🥗','🥘','🫔','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟'] },
  { name: 'Asian Foods', emojis: ['🍚','🍙','🍘','🍢','🍡','🍧','🍨','🥮','🥠'] },
  { name: 'Sweets & Desserts', emojis: ['🍦','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯'] },
  { name: 'Beverages', emojis: ['🍼','☕','🫖','🍵','🍶','🍾','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🥤','🧋','🧃','🧉','🧊'] },
  { name: 'Other', emojis: ['🧂','🍿','🥜','🌰','🍄'] }
];

window.openEmojiPicker = function(callback) {
  const modal = document.getElementById('emoji-picker-modal');
  const container = document.getElementById('emoji-picker-container');
  const cancelBtn = document.getElementById('btn-close-emoji-picker');

  container.innerHTML = '';
  EMOJI_CATEGORIES.forEach(cat => {
    const title = document.createElement('div');
    title.className = 'emoji-category-title';
    title.innerText = cat.name;
    container.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'emoji-grid';
    cat.emojis.forEach(emj => {
      const btn = document.createElement('button');
      btn.className = 'emoji-btn-item';
      btn.innerText = emj;
      btn.onclick = () => {
        modal.classList.add('hidden');
        callback(emj);
      };
      grid.appendChild(btn);
    });
    container.appendChild(grid);
  });

  cancelBtn.onclick = () => modal.classList.add('hidden');
  modal.classList.remove('hidden');
};

document.addEventListener('DOMContentLoaded', async () => {
  await requestPersistentStorage();

  const apiKey = getApiKey();
  const modal = document.getElementById('api-key-modal');
  
  if (!apiKey && modal) {
    modal.classList.remove('hidden');
    document.getElementById('save-api-key').addEventListener('click', () => {
      const input = document.getElementById('api-key-input').value.trim();
      if (input.length > 20) { 
        setApiKey(input); modal.classList.add('hidden');
        window.showToast("USDA Access Granted!"); window.location.reload(); 
      } else { window.showToast("API Key invalid.", "error"); }
    });
  } else if (apiKey && modal) { 
    document.getElementById('settings-api-key').value = apiKey; 
  }

  const dashboard = initDashboard(); dashboard.renderDashboard();       
  const recipeComposer = initRecipeComposer();
  const logFood = initLogFood(dashboard);            
  const library = initLibrary(recipeComposer);
  const weightTracker = initWeightTracker();
  const stats = initStats();
  const settings = initSettings();

  const navBtns = document.querySelectorAll('.nav-btn');
  const pages = document.querySelectorAll('.page');

  navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      navBtns.forEach(b => b.classList.remove('active'));
      pages.forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });

      const targetId = e.target.getAttribute('data-target');
      e.target.classList.add('active');
      
      const targetPage = document.getElementById(targetId);
      if (targetPage) { targetPage.classList.remove('hidden'); targetPage.classList.add('active'); }
      
      if (targetId === 'dashboard') { dashboard.resetDate(); dashboard.renderDashboard(); }
      if (targetId === 'log-food') { logFood.resetForm(); document.getElementById('food-search').value = ''; logFood.refreshShortcuts(); }
      if (targetId === 'recipe-composer') { recipeComposer.resetForm(); }
      if (targetId === 'weight-tracker') { weightTracker.renderPage(); }
      if (targetId === 'stats') { stats.renderPage(); }
      if (targetId === 'library') { document.getElementById('library-search').value = ''; library.renderLibrary(); }
      if (targetId === 'settings') { settings.loadProfile(); }
    });
  });

  // --- GLOBAL MODAL OVERLAY CLICK AND DIRTY TRACKING ---
  function hasModalChanges(modalEl) {
    const inputs = modalEl.querySelectorAll('input, select, textarea');
    const initial = modalEl._initialValuesSnapshot || [];
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const currentVal = (input.type === 'checkbox' || input.type === 'radio') ? input.checked : input.value;
      if (currentVal !== initial[i]) {
        return true;
      }
    }
    return false;
  }

  const modalObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        const target = mutation.target;
        const isHidden = target.classList.contains('hidden');
        if (!isHidden) {
          // Modal opened: snapshot input values
          const inputs = target.querySelectorAll('input, select, textarea');
          target._initialValuesSnapshot = Array.from(inputs).map(input => {
            return (input.type === 'checkbox' || input.type === 'radio') ? input.checked : input.value;
          });
        }
      }
    });
  });

  document.querySelectorAll('.modal').forEach(modalEl => {
    modalObserver.observe(modalEl, { attributes: true, attributeFilter: ['class'] });
  });

  document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('modal') && !e.target.classList.contains('hidden')) {
      const modalEl = e.target;
      if (modalEl.id === 'confirm-modal') return;

      if (hasModalChanges(modalEl)) {
        const confirmed = await window.customConfirm("Unsaved Changes", "You have unsaved changes. Are you sure you want to discard them?", true);
        if (!confirmed) return;
      }

      const cancelBtn = modalEl.querySelector('#btn-close-emoji-picker, #btn-cancel-weight-edit, #btn-cancel-custom-date, #btn-cancel-recipe-weight, #btn-close-nutrition-modal, #btn-cancel-lib-edit, #btn-confirm-cancel');
      if (cancelBtn) {
        cancelBtn.click();
      } else {
        modalEl.classList.add('hidden');
      }
    }
  });
});