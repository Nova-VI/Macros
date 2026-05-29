import { requestPersistentStorage, getApiKey, setApiKey } from './db.js';
import { initDashboard } from './components/dashboard.js';
import { initLogFood } from './components/logFood.js';
import { initRecipeComposer } from './components/recipeComposer.js';
import { initLibrary } from './components/library.js';
import { initSettings } from './components/settings.js';

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

    if (isDanger) {
      okBtn.className = 'btn btn-danger';
    } else {
      okBtn.className = 'btn';
    }

    modal.classList.remove('hidden');

    const cleanUp = (result) => {
      modal.classList.add('hidden');
      cancelBtn.onclick = null;
      okBtn.onclick = null;
      resolve(result);
    };

    cancelBtn.onclick = () => cleanUp(false);
    okBtn.onclick = () => cleanUp(true);
  });
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
      if (targetId === 'library') { document.getElementById('library-search').value = ''; library.renderLibrary(); }
      if (targetId === 'settings') { settings.loadProfile(); setTimeout(() => settings.renderChart(), 100); }
    });
  });
});