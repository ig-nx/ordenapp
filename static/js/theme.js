(() => {
    "use strict";

    const root = document.documentElement;
    const button = document.getElementById("theme-toggle");
    const icon = document.getElementById("theme-icon");

    if (!button || !icon) {
        return;
    }

    function setTheme(theme) {
        root.setAttribute("data-theme", theme);
        localStorage.setItem("ordenapp-theme", theme);
        updateIcon(theme);
    }

    function updateIcon(theme) {
        if (theme === "dark") {
            icon.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 15.8A8.3 8.3 0 1 1 8.2 4a7 7 0 1 0 11.8 11.8Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
            `;
            button.setAttribute("aria-label", "Cambiar a modo claro");
            return;
        }

        icon.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8"></circle>
                <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3 5.6 5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            </svg>
        `;
        button.setAttribute("aria-label", "Cambiar a modo oscuro");
    }

    const initialTheme = root.getAttribute("data-theme") || "light";
    updateIcon(initialTheme);

    button.addEventListener("click", () => {
        const current = root.getAttribute("data-theme") || "light";
        setTheme(current === "dark" ? "light" : "dark");
    });
})();
