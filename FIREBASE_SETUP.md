# NR Finance — Guia de Configuração do Firestore

## Regras de Segurança

Copie as regras abaixo e aplique no Firebase Console:
**Firestore Database → Regras**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## Índices Compostos Necessários

Crie os índices abaixo em:
**Firestore Database → Índices → Adicionar índice**

### Índice 1 — Despesas por data (Dashboard/Histórico)
- **Coleção:** `expenses` (em subcoleção `users/*/expenses`)
- **Campos:** `data` (Crescente), `origem` (Crescente)

### Índice 2 — Despesas recorrentes por grupo
- **Coleção:** `expenses`
- **Campos:** `grupoRecorrenciaId` (Crescente), `data` (Crescente)

### Índice 3 — Despesas recorrentes do próximo mês
- **Coleção:** `expenses`
- **Campos:** `tipo` (Crescente), `data` (Crescente)

> **Nota:** O Firebase criará automaticamente links diretos para criar índices quando você abrir o app e fizer as primeiras consultas. Basta clicar no link que aparece no log do Expo.

## Configurar Login com Google (OBRIGATÓRIO para funcionar)

### Passo 1 — Obter o Web Client ID

1. Firebase Console → **Authentication** → **Sign-in method** → **Google** → clique no lápis ✏️
2. Você verá **"ID do cliente Web (ID do aplicativo cliente)"**
3. Copie esse valor (parece com: `809012952625-xxxx.apps.googleusercontent.com`)

### Passo 2 — Colar no código

Abra o arquivo `src/hooks/useGoogleAuth.ts` e substitua a linha:

```typescript
const WEB_CLIENT_ID = 'SEU_WEB_CLIENT_ID_AQUI.apps.googleusercontent.com';
```

Pelo seu Client ID real:

```typescript
const WEB_CLIENT_ID = '809012952625-xxxx.apps.googleusercontent.com';
```

### Passo 3 — Adicionar URI de redirecionamento no Google Cloud Console

1. Acesse: https://console.cloud.google.com/apis/credentials
2. Clique no **ID do cliente OAuth** do tipo **Web**
3. Em **"URIs de redirecionamento autorizados"**, adicione:
   - `https://auth.expo.io/@seu-usuario-expo/NRFinance`
   - Substitua `seu-usuario-expo` pelo seu usuário no Expo (veja com `npx expo whoami`)
4. Salve

> **Para Expo Go (desenvolvimento):** Apenas o `WEB_CLIENT_ID` já é suficiente.  
> **Para APK/build nativo:** Você precisará também dos `ANDROID_CLIENT_ID` e `IOS_CLIENT_ID`.

