(() => {
  const byId = id => document.getElementById(id);
  function openMenu(id) {
    const panel = byId(id);
    panel.showModal();
    (panel.querySelector('nav a') || panel.querySelector('button')).focus();
  }
  byId('start').addEventListener('click', () => openMenu('roles'));
  byId('guide').addEventListener('click', () => openMenu('help'));
  // Results and the exit action can return here directly to pick another role.
  if (new URLSearchParams(location.search).get('roles') === '1') openMenu('roles');
})();
