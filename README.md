# UroDecide — pacote para publicação (v1.0.0)

Conteúdo desta pasta:

| Arquivo | Para quê |
|---|---|
| `index.html` | Aplicativo completo e autônomo (HTML + CSS + JS + imagens embutidas), funciona offline |
| `manifest.webmanifest` | Manifesto PWA (nome, ícones, cor, orientação retrato, modo standalone) |
| `sw.js` | Service worker: cache de todos os arquivos para uso sem internet |
| `privacidade.html`, `termos.html` | Política de privacidade e termos de uso (dados do responsável preenchidos; revisar com advogado) |
| `content/` | Pacote de conteúdo assinado (`content.js` + `content.json`) para atualização de regras sem passar pelas lojas |
| `icons/` | Ícones 192/512, maskable 512 (Android), apple-touch 180 (iOS), favicon, `play-store-512.png`, `ios-1024.png`, `feature-1024x500.png` (gráfico de destaque do Google Play) |

## Revisão final (05/11/2026)
App 1.0.0 · regras 2026.11 · pacote de conteúdo 2026.11.5. Suíte executada sem falhas: testes do motor (5 módulos), smokes de todas as áreas, varredura aleatória de todos os fluxos e calculadoras (15.200 execuções, 0 falhas), auditoria de interface em 320/390/768/1280 px, build de loja (service worker offline), navegação com botão "voltar" do sistema e atualização OTA assinada (instalação, pacote adulterado rejeitado, pacote quebrado com autorrecuperação, offline).

## Como publicar

### 1. Hospedar (obrigatório para as duas lojas)
Publique a pasta inteira em um endereço HTTPS seu (ex.: GitHub Pages, Netlify, Vercel ou o site da clínica). Esse endereço é a origem do app no Android (TWA) e a URL da política de privacidade exigida pelas duas lojas.

### 2. Google Play (Trusted Web Activity)
1. Instale o PWABuilder (https://www.pwabuilder.com) ou o Bubblewrap (`npm i -g @bubblewrap/cli`).
2. Informe a URL hospedada; gere o pacote Android (AAB) com nome `br.com.<seu-dominio>.urodecide`.
3. Publique o arquivo `assetlinks.json` gerado em `https://<seu-dominio>/.well-known/assetlinks.json` (vincula o app ao site e remove a barra do navegador).
4. No Play Console: categoria **Medicina**, classificação de conteúdo, formulário de **Segurança dos dados** (marque: não coleta nem compartilha dados), URL da política de privacidade, ícone 512 e gráfico de destaque 1024×500 (em `icons/`), 4–8 capturas de tela (telefone 1080×1920 ou proporção 9:16).
5. Declaração de app de saúde: "ferramenta de referência para profissionais de saúde; não é dispositivo médico".

### 3. App Store (iOS)
1. Gere o projeto iOS com PWABuilder (iOS package) ou Capacitor (`npm init @capacitor/app`, `npx cap add ios`, apontando `webDir` para esta pasta).
2. Abra no Xcode (Mac com conta Apple Developer, US$ 99/ano), ajuste bundle ID e ícone 1024 (`icons/ios-1024.png`), compile e envie pelo App Store Connect.
3. Metadados exigidos: categoria **Medicina**, política de privacidade (URL), **Privacy Nutrition Label** (nenhum dado coletado), capturas 6,7" e 6,5" (iPhone) e 12,9" (iPad, se suportar tablet).
4. Diretriz 5.1.1 e 1.4.1 da Apple (apps médicos): o texto da tela "Sobre" e o termo na primeira abertura já declaram público-alvo (profissionais de saúde), fontes e que não é dispositivo de diagnóstico; mantenha isso na descrição da loja.

### 4. Antes de enviar
- Responsável, CRM, cidade e e-mail já preenchidos (Ricardo Sozo Vitor · CRM/RS 36053 · Santa Maria/RS · drsozosg@gmail.com) em `privacidade.html`, `termos.html` e na tela "Sobre"; foro: Santa Maria/RS. Revisar os textos com advogado.
- Licença do fundo: a imagem atual (glitter/bokeh azul) veio de banco de imagens; confirmar a licença ou trocar pelo fundo original gerado (`bg_glass_backup.b64`).
- Fontes: a versão de loja usa fontes do sistema (sem Google Fonts) para funcionar offline; o visual muda levemente em relação à prévia web.
- Capturas de tela: tela inicial, um fluxo (pergunta), um resultado, uma calculadora, guia cirúrgico.

### 5. Atualizar as regras SEM republicar o app (pacote de conteúdo)
O conteúdo clínico (regras, doses, tabelas, calculadoras, CID, SIGTAP, APAC, seguimento, toxicidade) é um pacote separado em `content/` (`content.js` + `content.json`), **assinado** com a chave privada que fica em `../keys/content_private.pem` (fora desta pasta — nunca publique nem perca essa chave; a chave pública está embutida no app e só pacotes assinados por ela são aceitos).

Fluxo de uma atualização:
1. Edite as regras no projeto (ex.: `engine.js`, `doses.js`, `sigtap.js`).
2. Em `content_meta.js`, aumente `version` (ex.: `2026.12.1`), `date` e `notas`.
3. Rode `./build_content.sh` (gera `store/content/content.js` e `content.json` com sha256 + assinatura ECDSA P-256). Se o pacote exigir uma versão mínima do app, rode `MIN_APP=0.9.0 ./build_content.sh`.
4. Publique só a pasta `content/` no mesmo endereço do app (`https://<seu-dominio>/content/`).
5. Nos aparelhos, o app verifica `content.json` ao abrir (no máximo 1×/dia, ou pelo botão em "Sobre → Verificar atualização"), baixa o pacote, confere hash e assinatura, guarda no aparelho e pede para "Aplicar" (recarrega). Tudo continua funcionando offline com o último pacote instalado; se um pacote falhar ao carregar, o app volta sozinho ao conteúdo embutido.

Mudanças de interface (telas, novas ferramentas) continuam exigindo nova versão do app nas lojas (`./build_store.sh` + envio). Ao publicar uma nova versão do app, o conteúdo embutido já vem atualizado e substitui o pacote baixado se for mais novo.

### 6. Atualizar o app
Rodar `./build_store.sh` na pasta do projeto gera tudo de novo com a versão de `APP_VERSION`; o service worker usa a versão como nome de cache, então cada publicação substitui a anterior nos aparelhos.
