// auth.js (AKS-ready)
const cfg = window.APP_CONFIG;

const msg = document.getElementById("msg");
const btn = document.getElementById("btnLogin");

function showError(text) {
  msg.textContent = text;
  msg.classList.remove("d-none");
}

function joinUrl(base, path) {
  // garante exatamente 1 "/" entre base e path
  if (!base) return path || "";
  if (!path) return base;
  return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}

// Endpoint correto no AKS (via Ingress):
// base: /identity
// path: /auth/login
const LOGIN_PATH = "/auth/login";

btn.addEventListener("click", async () => {
  msg.classList.add("d-none");

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    showError("Informe e-mail e senha.");
    return;
  }

  try {
    const url = joinUrl(cfg.IDENTITY_BASE_URL, LOGIN_PATH);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const text = await res.text();

    // tenta parsear JSON (se vier HTML 404 do nginx, vai cair no catch)
    let data = null;
    try { data = JSON.parse(text); } catch { /* ignore */ }

    if (!res.ok) {
      const detail = data?.message || data?.error || text || res.status;
      showError(`Falha no login (${res.status}): ${detail}`);
      return;
    }

    const token = data?.token || data?.access_token || data?.jwt;
    if (!token) {
      showError("Login OK, mas não encontrei token no retorno (token/access_token/jwt).");
      return;
    }

    localStorage.setItem("agro_token", token);
    localStorage.setItem("agro_email", email);

    window.location.href = "app.html";
  } catch (e) {
    showError("Erro ao conectar no Identity API. Verifique Ingress/URLs e tente novamente.");
  }
});