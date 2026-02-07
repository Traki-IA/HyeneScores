// Service Worker Registration avec détection de mise à jour
if ('serviceWorker' in navigator) {
  let refreshing = false;

  // Détecte quand le nouveau service worker prend le contrôle
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
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
