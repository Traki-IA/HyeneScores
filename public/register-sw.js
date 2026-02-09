// Service Worker Registration avec détection de mise à jour
if ('serviceWorker' in navigator) {
  let refreshing = false;

  // Détecte quand le nouveau service worker prend le contrôle
  // Différer le rechargement si l'utilisateur a des données non sauvegardées
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    if (window.__hyeneFormDirty) {
      var checkInterval = setInterval(function() {
        if (!window.__hyeneFormDirty) {
          clearInterval(checkInterval);
          refreshing = true;
          window.location.reload();
        }
      }, 1000);
      return;
    }
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        // Vérifie régulièrement les mises à jour (toutes les 60 secondes)
        setInterval(() => {
          reg.update();
        }, 60000);

        // Vérifie immédiatement s'il y a une mise à jour
        reg.update();
      })
      .catch(err => console.log('Service Worker registration failed:', err));
  });
}
