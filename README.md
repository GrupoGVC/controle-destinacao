# Controle de Destinação · Retec

App web para lançar as destinações de resíduos (custo), as vendas de recicláveis (receita) e a locação de veículos de cada mês. Cada viagem entra com o seu MTR. O app calcula sozinho o painel de indicadores e faz a conferência automática: MTR repetido, MTR fora do padrão, viagem sem peso, sem placa ou sem data, data fora do mês, valor zerado e veículo alugado sem viagem.

- **Tela (front-end):** `index.html`, publicado de graça no **GitHub Pages**.
- **Banco de dados:** uma **planilha Google** com as abas `Lancamentos`, `Destinadores`, `Precos`, `Locacao`, `Usuarios` e `Log`.
- **Acesso:** cada pessoa entra com o **e-mail da empresa** e uma **senha própria**. A alçada (leitor, editor ou administrador) é definida na aba `Usuarios` ou na tela Usuários do app.
- **Ponte entre os dois:** o script `apps-script/Codigo.gs`, publicado como App da Web do Google Apps Script.

Não há mês para duplicar: tudo fica na mesma planilha, e o app separa por mês.

---

## 1. Criar a planilha (5 min)

1. No Google Drive, clique em **Novo › Upload de arquivo** e envie `dados-iniciais/Controle_Destinacao_Base.xlsx`. Esse arquivo já traz janeiro a outubro de 2026: 1.409 lançamentos, 23 destinadores com a tabela de preços e a locação de cada mês. A aba "Removidos na importacao" lista as 58 linhas duplicadas que ficaram de fora.
2. Abra o arquivo e vá em **Arquivo › Salvar como Planilhas Google**. A partir daqui, use **só a cópia em formato Google**. O .xlsx enviado pode ir para a lixeira.
3. Renomeie a planilha para algo como **Controle de Destinação – Base**.

## 2. Instalar o script na planilha (5 min)

1. Na planilha, abra **Extensões › Apps Script**.
2. Apague o conteúdo do arquivo `Código.gs` e cole todo o conteúdo de `apps-script/Codigo.gs`. Salve (ícone de disquete).
3. No seletor de funções do topo, escolha **`configurar`** e clique em **Executar**.
   - O Google vai pedir autorização. Clique em **Revisar permissões**, escolha sua conta, depois **Avançado › Acessar (não seguro)** e **Permitir**. O aviso aparece porque o script é seu e não passou por revisão do Google; isso é normal.
   - A função cria as abas que faltam (inclusive `Usuarios`), coloca **você como administrador** e pede permissão para enviar e-mail, usada para mandar o código do primeiro acesso.
   - No *Registro de execução* aparecem as linhas `Pronto. Administrador: seu-email`.
   - Se o Google mostrar "Não foi possível abrir o arquivo" ao abrir o Apps Script, use uma janela anônima só com a conta dona da planilha.
4. **Opcional:** para aceitar só e-mails da empresa, edite no topo do código `const DOMINIOS_PERMITIDOS = ['retec.com.br'];` (com o seu domínio), salve e rode `configurar` de novo.

## 3. Publicar a API (3 min)

1. No Apps Script, clique em **Implantar › Nova implantação**.
2. Em *Selecione o tipo*, clique na engrenagem e escolha **App da Web**.
3. Configure:
   - **Executar como:** *Eu (seu e-mail)*
   - **Quem pode acessar:** *Qualquer pessoa*

   Sem isso o app não consegue falar com a planilha. Os dados continuam protegidos: sem login, a API não devolve nada.
4. Clique em **Implantar** e copie o **URL do app da Web**, que termina em `/exec`.

> **Mudou o script depois?** Vá em **Implantar › Gerenciar implantações › ✏️ Editar › Versão: Nova versão › Implantar**. Assim o URL continua o mesmo.

## 4. Colocar o app no GitHub Pages (5 min)

1. No GitHub, crie um repositório, por exemplo `controle-destinacao`. No plano gratuito, o GitHub Pages exige repositório **público**. Não há problema: nenhum dado fica no repositório, só a tela. Sem login, ninguém lê nem altera nada.
2. Envie os arquivos desta pasta (**Add file › Upload files**): `index.html`, `config.js`, `README.md` e as pastas `img/` (logos), `apps-script/` e `dados-iniciais/`.
3. Edite o `config.js` e cole o URL do passo 3 entre as aspas:
   ```js
   window.CONFIG = { API_URL: "https://script.google.com/macros/s/XXXX/exec" };
   ```
   Se deixar vazio, o app pede o endereço na primeira vez que for aberto em cada aparelho.
4. Vá em **Settings › Pages**. Em *Build and deployment*, escolha **Deploy from a branch**, depois o branch **main** e a pasta **/ (root)**, e clique em **Save**.
5. Em 1 ou 2 minutos o app estará em `https://SEU-USUARIO.github.io/controle-destinacao/`.

## 5. Usuários e primeiro acesso

**Cadastrar alguém** (só administrador): no app, aba **Usuários**, informe e-mail, nome e alçada e clique em **Cadastrar usuário**. Também dá para preencher direto a aba `Usuarios` da planilha (`email`, `nome`, `nivel` = leitor/editor/admin, `ativo` = SIM/NÃO); deixe as colunas de senha em branco.

| Alçada | O que pode fazer |
|---|---|
| Leitor | Ver painel, lançamentos e conferência; baixar CSV |
| Editor | Tudo do leitor + lançar, editar, excluir, frota e preços |
| Administrador | Tudo do editor + cadastrar usuários, mudar alçadas, desativar e apagar senhas |

**Primeiro acesso da pessoa:** abrir o link do app › **Primeiro acesso ou esqueci a senha** › informar o e-mail › receber um código de 6 dígitos no e-mail › criar a senha (mínimo 8 caracteres). O mesmo caminho serve para quem esqueceu a senha.

- O aparelho fica conectado por 30 dias (ajustável em `DIAS_SESSAO` no topo do código).
- Cada lançamento e cada alteração ficam registrados com o nome de quem fez (coluna `atualizadoPor` e aba `Log`).
- **Alguém saiu da equipe:** mude `ativo` para NÃO (ou "Não" na tela Usuários). O acesso cai na hora, mesmo com o app aberto.
- 5 senhas erradas seguidas bloqueiam o login daquele e-mail por 15 minutos.
- Menu da planilha **Controle de Destinação › Desconectar todos os aparelhos** obriga todo mundo a entrar de novo.

---

## Rotina do mês

| Quando | O que fazer |
|---|---|
| Virada do mês | Na aba **Locação de veículos**, avance para o mês novo, clique em **Copiar frota do mês anterior**, ajuste o que mudou e salve. |
| A cada viagem | Em **Lançamentos**, preencha um registro por MTR. O preço vem da tabela do destinador. Use *Valor fechado* quando o preço não for por kg. |
| Fechamento | Abra **Conferência** e resolva tudo que estiver marcado como *Corrigir*. Baixe o CSV do mês para o financeiro. |
| Preço mudou | Atualize em **Destinadores e preços**. Vale para os próximos lançamentos; os antigos mantêm o preço da época. |

## Mexendo direto na planilha

A planilha é o banco de dados, então dá para filtrar, montar tabela dinâmica e gráficos nela à vontade. Alguns cuidados:

- **Não renomeie as abas nem os cabeçalhos da linha 1.** Novas colunas só à direita da última.
- Um lançamento digitado direto na aba `Lancamentos` precisa de um **`id` único** na coluna A (qualquer código, por exemplo `M-0001`), da `data` e do `destinador` igual ao `id` da aba `Destinadores`. Se a coluna `valor` ficar vazia, o app calcula kg × preço.
- `tipo` na aba `Destinadores` é `custo` (a Retec paga) ou `receita` (o comprador de reciclável paga).
- Faça uma cópia da planilha de vez em quando (**Arquivo › Fazer uma cópia**). Além disso, o próprio Google guarda o histórico em **Arquivo › Histórico de versões**.

## Problemas comuns

- **"Este e-mail não tem acesso ao app":** o e-mail não está na aba `Usuarios`, está com outra grafia, ou está fora de `DOMINIOS_PERMITIDOS`.
- **O código não chega:** confira o spam. O e-mail sai da conta dona da planilha, com o assunto "Código de acesso – Controle de Destinação". Contas Google gratuitas enviam até 100 e-mails por dia; contas Workspace, 1.500.
- **"Sem conexão com a planilha":** confira o `API_URL` no `config.js` (tem que terminar em `/exec`) e se a implantação está com acesso *Qualquer pessoa*.
- **Alterei o script e nada mudou:** publique uma *Nova versão* da implantação (veja o passo 3).
- **Lentidão:** cada leitura leva de 1 a 3 segundos, que é o tempo normal do Apps Script. O app atualiza sozinho a cada 90 segundos e também quando você volta para a aba; o botão **Atualizar** força a atualização na hora.

## Estrutura

```
index.html                 app (HTML + CSS + JS, sem dependências)
config.js                  endereço da API
img/                       logos Retec e Grupo GVC
apps-script/Codigo.gs      API da planilha (colar no Apps Script)
dados-iniciais/…xlsx       base com jan–out/2026 para importar no Drive
```
