# Mobile Sheet Calendar - Sistema de Agendamento

## 📋 Sobre o Projeto

O **Mobile Sheet Calendar** é uma aplicação web completa para gerenciamento de agendas e slots de horários. O sistema permite a visualização de calendário, criação de slots de atendimento (simples, duplos e recorrentes), agendamento de pacientes e gestão de status de atendimentos (confirmado, realizado, cancelado, etc.).

O projeto foi arquitetado separando claramente as responsabilidades entre Frontend (interface do usuário) e Backend (API de regras de negócios), utilizando o Supabase como banco de dados.

---

## 🚀 Tecnologias Utilizadas

### Frontend (Client)
A interface foi construída visando performance e uma experiência de usuário fluida e moderna.

*   **Linguagem & Framework**:
    *   [React](https://react.dev/) (`^18.3.1`)
    *   [TypeScript](https://www.typescriptlang.org/) (`^5.8.3`)
    *   [Vite](https://vitejs.dev/) (`^7.2.6`) - Build tool e servidor de desenvolvimento.
*   **Estilização & UI**:
    *   [Tailwind CSS](https://tailwindcss.com/) (`^3.4.17`)
    *   [Shadcn/UI](https://ui.shadcn.com/) (baseado em [Radix UI](https://www.radix-ui.com/)) - Componentes acessíveis e customizáveis.
    *   `lucide-react` (`^0.462.0`) - Ícones.
*   **Gerenciamento de Estado & Dados**:
    *   [TanStack Query (React Query)](https://tanstack.com/query/latest) (`^5.83.0`) - Gerenciamento de estado assíncrono e cache.
    *   [React Router DOM](https://reactrouter.com/) (`^6.30.1`) - Roteamento.
    *   [Zod](https://zod.dev/) (`^3.25.76`) - Validação de schemas.
    *   [React Hook Form](https://react-hook-form.com/) (`^7.61.1`) - Gerenciamento de formulários.
*   **Utilitários**:
    *   `date-fns` (`^3.6.0`) - Manipulação de datas.
    *   `@supabase/supabase-js` (`^2.86.0`) - Cliente Supabase.

### Backend (Server)
O servidor atua como uma camada intermediária para validação e lógica de negócios antes de persistir no banco de dados.

*   **Core**:
    *   [Node.js](https://nodejs.org/) (Ambiente de execução)
    *   [Express](https://expressjs.com/) (`^4.18.2`) - Framework web.
    *   [TypeScript](https://www.typescriptlang.org/) (`^5.3.3`)
*   **Banco de Dados & Integração**:
    *   [Supabase](https://supabase.com/) (PostgreSQL)
    *   `@supabase/supabase-js` (`^2.39.1`)
*   **Utilitários**:
    *   `zod` (`^3.22.4`) - Validação de dados na API.
    *   `date-fns` (`^4.1.0`)
    *   `tsx` (`^4.7.0`) - Execução de TypeScript em desenvolvimento.
    *   `cors` (`^2.8.5`) - Configuração de Cross-Origin Resource Sharing.

---

## 🔄 Arquitetura e Comunicação

O projeto segue uma arquitetura **Client-Server**.

1.  **Frontend**: Responsável por renderizar a interface, capturar interações do usuário e realizar chamadas HTTP para o Backend. Utiliza o `React Query` para buscar dados (GET) e realizar mutações (POST, PUT, DELETE), mantendo o cache local sincronizado.
2.  **Backend**: Uma API RESTful construída com Express. Ela recebe as requisições do frontend, executa validações (usando Zod), aplica regras de negócio (ex: verificar conflitos de horário, lógica de recorrência) e interage com o Supabase para persistir ou recuperar dados.
3.  **Banco de Dados**: O Supabase (PostgreSQL) armazena todas as informações de slots, pacientes e atendimentos.

### Fluxo de Comunicação (Exemplo: Criação de Slot)

1.  **Usuário**: Clica em um horário no calendário para criar um novo slot.
2.  **Frontend**:
    *   Coleta os dados (data, hora, tipo).
    *   Valida inputs básicos.
    *   Envia uma requisição `POST /api/slots` para o backend.
3.  **Backend**:
    *   Recebe a requisição no endpoint `routes/slots.ts`.
    *   O `slotsController` processa a entrada.
    *   O serviço verifica se já existe um slot naquele horário (conflito).
    *   Se válido, chama o cliente do Supabase para inserir o registro na tabela `slots`.
    *   Retorna o objeto criado (status 201) ou erro (400/500).
4.  **Frontend**:
    *   Recebe a confirmação.
    *   O `React Query` invalida o cache da lista de slots (`queryKey: ['slots']`), forçando uma atualização automática da visualização do calendário.
    *   Exibe uma notificação de sucesso (Toast).

---

## 🛠️ Como Implementar e Rodar o Projeto

Siga os passos abaixo para rodar o projeto localmente.

### Pré-requisitos
*   Node.js instalado (v18+ recomendado).
*   Conta no Supabase e um projeto criado.

### 1. Configuração do Banco de Dados (Supabase)

#### 1.1. Criar Projeto no Supabase
1. Acesse [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Crie um novo projeto (ou use um existente)
3. Anote a **URL** e **Service Role Key** (em Settings > API)

#### 1.2. Executar Script de Setup

**Opção A: Via Dashboard (Recomendado)** ⭐
1. No dashboard do Supabase, vá em **SQL Editor** (menu lateral)
2. Clique em **New Query**
3. Abra o arquivo [`SUPABASE_SETUP.sql`](./SUPABASE_SETUP.sql) deste repositório
4. Copie **TODO** o conteúdo do arquivo
5. Cole no SQL Editor
6. Clique em **Run** (ou pressione Ctrl+Enter)
7. Aguarde a execução (deve mostrar "Setup concluído com sucesso!")

**Opção B: Via CLI**
```bash
# Instalar Supabase CLI
npm install -g supabase

# Fazer login
supabase login

# Linkar ao projeto
supabase link --project-ref SEU_PROJECT_REF

# Executar script
supabase db execute --file SUPABASE_SETUP.sql
```

**O que o script cria:**
- ✅ 3 ENUMs (event_type, price_category, commercial_status)
- ✅ 2 Tabelas (patients, time_slots)
- ✅ 6 Índices para performance
- ✅ 3 Triggers (updated_at, sync_patient_info)
- ✅ 2 Views úteis (week_slots, time_slots_grouped)
- ✅ Row Level Security (RLS) habilitado
- ✅ Realtime habilitado para time_slots

### 2. Configuração do Backend

1.  Navegue até a pasta do backend:
    ```bash
    cd backend
    ```
2.  Instale as dependências:
    ```bash
    npm install
    ```
3.  Crie um arquivo `.env` na pasta `backend` com as seguintes variáveis:
    ```env
    PORT=3001
    FRONTEND_URL=http://localhost:8080 # Ou a porta que seu frontend rodar
    SUPABASE_URL=sua_url_do_supabase
    SUPABASE_KEY=sua_service_role_key_ou_anon_key # Service Role para backend é ideal
    ```
4.  Inicie o servidor de desenvolvimento:
    ```bash
    npm run dev
    ```
    *O backend estará rodando em `http://localhost:3001`.*

### 3. Configuração do Frontend

1.  Em um novo terminal, navegue até a raiz do projeto (frontend):
    ```bash
    cd .. # Se estiver na pasta backend
    ```
2.  Instale as dependências:
    ```bash
    npm install
    ```
3.  Crie um arquivo `.env` na raiz com as chaves do Supabase (para funcionalidades que ainda usem client-side auth ou realtime):
    ```env
    VITE_SUPABASE_URL=sua_url_do_supabase
    VITE_SUPABASE_KEY=sua_anon_key
    VITE_API_URL=http://localhost:3001/api # URL do seu backend local
    ```
4.  Inicie o servidor de desenvolvimento:
    ```bash
    npm run dev
    ```
5.  Acesse a aplicação no navegador (geralmente em `http://localhost:8080` ou porta indicada).

---

## 📂 Estrutura de Pastas Simplificada

```
mobile-sheet-calendar/
├── backend/                # Servidor Express
│   ├── src/
│   │   ├── controllers/    # Lógica de controle das requisições
│   │   ├── routes/         # Definição das rotas da API
│   │   ├── services/       # Regras de negócio
│   │   ├── db/             # Conexão com Supabase
│   │   └── index.ts        # Entry point
│   ├── package.json
│   └── tsconfig.json
│
├── src/                    # App React (Frontend)
│   ├── components/         # Componentes UI (botões, cards, dialogs)
│   ├── pages/              # Páginas da aplicação
│   ├── hooks/              # Custom hooks (React Query)
│   ├── lib/                # Utilitários (Supabase client, utils)
│   ├── App.tsx             # Componente raiz
│   └── main.tsx            # Entry point React
│
├── package.json            # Deps do Frontend
├── vite.config.ts          # Configuração do Vite
└── README.md               # Documentação do Projeto
```
