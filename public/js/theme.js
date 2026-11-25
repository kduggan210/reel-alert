// Dark mode toggle. This file handles the button, saving the choice, and keeping open tabs in sync.

const root = document.documentElement;            // the <html> element holds the theme class
const toggler = document.getElementById('theme_toggler');

// Shows the current state on the button for screen readers and sighted users
function syncButton() {
    const dark = root.classList.contains('dark_mode');
    toggler.setAttribute('aria-pressed', String(dark));
    toggler.textContent = dark ? 'Light mode' : 'Dark mode';
}

// Click: flip the theme and remember it 
toggler.addEventListener('click', function () {
    root.classList.toggle('dark_mode');
    try {
        localStorage.setItem('website_theme', root.classList.contains('dark_mode') ? 'dark_mode' : 'default');
    } catch (e) {}
    syncButton();
});

// Changed themes in other tabs are copied here
window.addEventListener('storage', function (e) {
    if (e.key !== 'website_theme') return;
    root.classList.toggle('dark_mode', e.newValue === 'dark_mode');
    syncButton();
});

syncButton();
