# 💸 NR Finance

**Gestão de Despesas Inteligente** - O app perfeito para organizar suas finanças Pessoais e do seu Negócio, combinando a agilidade do Excel com dashboards automáticos.

## ✨ Funcionalidades
- **Registro Ágil:** Interface otimizada (estilo Excel) para inserção rápida de valores, datas e categorias.
- **Divisão Inteligente:** Separe com 1 clique se a despesa é **Pessoal** ou do **Negócio (NR Brownies)**.
- **Despesas Recorrentes:** Lance contas parceladas ou fixas (ex: Netflix, Aluguel) e o app projeta automaticamente para os próximos meses.
- **Dashboard Automático:** Gráficos interativos gerados em tempo real mostrando para onde seu dinheiro está indo.
- **Múltiplos Dispositivos:** Faça login com sua Conta Google e acesse de qualquer celular ou computador.
- **PWA Ready:** Pode ser instalado direto na tela inicial do celular a partir do navegador.

## 🛠️ Tecnologias Utilizadas
- **Frontend / Mobile:** React Native com [Expo](https://expo.dev/)
- **Gerenciamento de Estado:** Zustand
- **Backend / Banco de Dados:** Firebase (Firestore NoSQL)
- **Autenticação:** Firebase Auth (Google Sign-In)
- **Gráficos:** `react-native-svg` (gráficos vetoriais de alta performance customizados)
- **Navegação:** React Navigation (Bottom Tabs)

## 🚀 Como rodar o projeto localmente

### 1. Pré-requisitos
- Node.js (v18+)
- Conta ativa no Firebase

### 2. Clonando o Repositório
```bash
git clone https://github.com/RamonFerreira1/app-gest-o-despesas.git
cd app-gest-o-despesas
npm install
```

### 3. Configurando as Variáveis de Ambiente
Crie um arquivo chamado `.env` na raiz do projeto copiando o `.env.example`:
```bash
cp .env.example .env
```
Preencha as variáveis no arquivo `.env` com as credenciais do seu projeto Firebase (encontradas no Firebase Console > Project Settings).

### 4. Iniciando o App
```bash
# Iniciar o Metro Bundler do Expo
npx expo start

# Atalhos úteis no terminal:
# Pressione 'w' para abrir no Navegador Web
# Pressione 'a' para abrir no Emulador Android
# Pressione 'i' para abrir no Simulador iOS
```

## 🔒 Segurança e Deploy
- **As chaves do Firebase nunca são commitadas no repositório**. 
- O arquivo `.env` está protegido no `.gitignore`. 
- Ao fazer deploy na **Vercel** ou similar, adicione as variáveis no painel de Environment Variables do provedor.
- Para o Vercel, o projeto já inclui um `vercel.json` configurado para lidar com o routing do SPA no client-side de forma automática.

## 📄 Licença
Projeto pessoal desenvolvido por Ramon Ferreira.
