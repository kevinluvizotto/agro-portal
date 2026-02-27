// auth.js
const cfg = window.APP_CONFIG;

const msg = document.getElementById("msg");
const btn = document.getElementById("btnLogin");

function showError(text) {
    msg.textContent = text;
    msg.classList.remove("d-none");
}

btn.addEventListener("click", async () => {
    msg.classList.add("d-none");

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
        showError("Informe e-mail e senha.");
        return;
    }

    // Login REAL (identity api)
    try {
        const res = await fetch(cfg.IDENTITY_BASE_URL + cfg.LOGIN_PATH, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        if (!res.ok) {
            const t = await res.text();
            showError("Falha no login: " + (t || res.status));
            return;
        }

        const data = await res.json();
        const token = data.token || data.access_token || data.jwt;

        if (!token) {
            showError("Login OK, mas não encontrei token no retorno. Ajuste o parser (token/access_token/jwt).");
            return;
        }

        localStorage.setItem("agro_token", token);
        localStorage.setItem("agro_email", email);
        window.location.href = "app.html";
    } catch (e) {
        showError("Erro ao conectar no identity api. Verifique URL/porta no config.js.");
    }
});