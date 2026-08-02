'use strict';

/** Adds the "Install app" affordance. Android/desktop get the native prompt; iOS gets the manual hint. */
(function () {
  let deferred = null;
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

  function button(label, onClick) {
    const b = document.createElement('button');
    b.className = 'install-cta';
    b.textContent = label;
    b.addEventListener('click', onClick);
    document.body.appendChild(b);
    return b;
  }

  function hint() {
    const tip = document.createElement('div');
    tip.className = 'install-tip';
    tip.innerHTML =
      'Add PulseDesk to your home screen: tap <b>Share</b> then <b>Add to Home Screen</b>. ' +
      '<button class="install-close">got it</button>';
    document.body.appendChild(tip);
    tip.querySelector('.install-close').addEventListener('click', () => {
      tip.remove();
      localStorage.setItem('pulse.installhint', '1');
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    const cta = button('Install app', async () => {
      cta.remove();
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
    });
  });

  window.addEventListener('appinstalled', () => {
    document.querySelectorAll('.install-cta, .install-tip').forEach((el) => el.remove());
  });

  if (isIOS() && !isStandalone() && !localStorage.getItem('pulse.installhint')) {
    window.addEventListener('load', () => setTimeout(hint, 2500));
  }
})();
