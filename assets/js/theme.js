/**
 * ============================================
 * THEME TOGGLE - DGAC Drones
 * Manejo de tema claro/oscuro con persistencia
 * ============================================
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'dgac-theme-preference';
  const THEME_ATTR = 'data-theme';

  // Detectar preferencia del sistema
  function getSystemPreference() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // Obtener tema guardado o del sistema
  function getTheme() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return stored;
    } catch (e) {
      // localStorage no disponible
    }
    return getSystemPreference();
  }

  // Aplicar tema
  function applyTheme(theme) {
    document.documentElement.setAttribute(THEME_ATTR, theme);
    updateToggleIcon(theme);
  }

  // Guardar preferencia
  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      // Ignorar errores de localStorage
    }
  }

  // Actualizar icono del toggle
  function updateToggleIcon(theme) {
    const toggle = document.querySelector('.theme-toggle');
    if (!toggle) return;

    const sunIcon = toggle.querySelector('.sun-icon');
    const moonIcon = toggle.querySelector('.moon-icon');

    if (sunIcon && moonIcon) {
      if (theme === 'dark') {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
      } else {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
      }
    }
  }

  // Toggle tema
  function toggleTheme() {
    const current = document.documentElement.getAttribute(THEME_ATTR) || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    saveTheme(next);
  }

  // Inicializar
  function init() {
    const theme = getTheme();
    applyTheme(theme);

    // Event listener para el botón
    const toggleBtn = document.querySelector('.theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleTheme);
    }

    // Escuchar cambios en preferencia del sistema
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
      // Solo cambiar si no hay preferencia guardada
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
          applyTheme(e.matches ? 'dark' : 'light');
        }
      } catch (e) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  // Ejecutar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
