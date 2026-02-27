agro-portal

Portal Web (frontend) do projeto AgroSolutions IoT (FIAP Tech Challenge – Fase 5).

Responsável por:
- Tela de login (JWT via agro-identity-api)
- Dashboard (propriedades/talhões)
- Envio de telemetria (leituras de sensor)
- Visualização de histórico (gráfico)
- Visualização e gestão de alertas (ack)

STACK
- HTML + CSS + JavaScript puro (sem framework)
- NGINX (container) servindo arquivos estáticos
- Consumo das APIs via fetch (Identity/Properties/Telemetry/Alerts)
- Chart.js para gráfico de histórico

ARQUIVOS IMPORTANTES
- login.html         -> tela de login
- app.html           -> dashboard
- auth.js            -> fluxo de autenticação (login e armazenamento do token)
- app.js             -> lógica do dashboard (calls, gráficos, alertas etc.)
- config.js          -> endpoints base para as APIs (prefixos do Ingress)

CONFIGURAÇÃO (config.js)
O portal espera que as APIs sejam acessíveis via Ingress com prefixos, por exemplo:
- /identity
- /properties
- /telemetry
- /alerts

Exemplo (padrão):
window.APP_CONFIG = {
  IDENTITY_BASE_URL: '/identity',
  PROPERTIES_BASE_URL: '/properties',
  TELEMETRY_BASE_URL: '/telemetry',
  ALERTS_BASE_URL: '/alerts',
  LOGIN_PATH: '/auth/login'
};

IMPORTANTE (Ingress / Rewrite)
Quando o Ingress usa rewrite, as rotas podem ficar duplicadas (ex.: /properties/properties).
O app.js precisa construir as URLs respeitando o comportamento do rewrite.
Se aparecer erro 404 ou retorno HTML (Unexpected token '<'), normalmente é rota errada ou falta de token.

RODAR LOCALMENTE (Nginx simples)
Opção 1: abrir direto no browser
- Abrir login.html (pode haver bloqueio de CORS dependendo da forma de acesso)

Opção 2: servir com Nginx (recomendado)
docker build -t agro-portal .
docker run --rm -p 8080:80 agro-portal
Acesse: http://localhost:8080

DEPLOY NO AKS (RESUMO)
1) Deploy + Service
- Container expõe porta 80
- Service ClusterIP porta 80

2) Ingress
- Rota / aponta para agro-portal
- Prefixos /identity /properties /telemetry /alerts apontam para as APIs correspondentes

TROUBLESHOOTING
- Login falha com 404 HTML:
  geralmente o caminho do login está errado (ex.: /identity/auth/login vs /auth/login atrás do rewrite)
- "Failed to construct 'URL': Invalid URL":
  base URL relativa/absoluta construída incorretamente no app.js
- "Unexpected token '<' ... is not valid JSON":
  o backend respondeu HTML (normalmente 404/502/504 do nginx ingress), ou request sem Authorization.

TESTE RÁPIDO (SAÚDE DAS APIS)
EXTERNAL_IP="SEU_IP"
curl -i http://$EXTERNAL_IP/identity/health
curl -i http://$EXTERNAL_IP/properties/health
curl -i http://$EXTERNAL_IP/telemetry/health
curl -i http://$EXTERNAL_IP/alerts/health