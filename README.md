# Controle de Destinação · Retec

App web para lançar as destinações de resíduos (custo), as vendas de recicláveis (receita) e a locação de veículos de cada mês. Cada viagem entra com o seu MTR. O app calcula sozinho o painel de indicadores e faz a conferência automática: MTR repetido, MTR fora do padrão, viagem sem peso, sem placa ou sem data, data fora do mês, valor zerado e veículo alugado sem viagem.

- **Tela (front-end):** `index.html`, publicado de graça no **GitHub Pages**.
- **Banco de dados:** uma **planilha Google** com as abas `Lancamentos`, `Destinadores`, `Precos`, `Locacao` e `Log`.
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
   - A função confere as abas e gera **duas chaves de acesso**: **EDIÇÃO** (para quem lança) e **LEITURA** (para quem só acompanha). As chaves aparecem no *Registro de execução*. Depois, também dá para vê-las pelo menu **Controle de Destinação › Mostrar chaves de acesso**, dentro da planilha (recarregue a planilha para o menu aparecer).

## 3. Publicar a API (3 min)

1. No Apps Script, clique em **Implantar › Nova implantação**.
2. Em *Selecione o tipo*, clique na engrenagem e escolha **App da Web**.
3. Configure:
   - **Executar como:** *Eu (seu e-mail)*
   - **Quem pode acessar:** *Qualquer pessoa*

   Sem isso o app não consegue falar com a planilha. Os dados continuam protegidos pela chave de acesso.
4. Clique em **Implantar** e copie o **URL do app da Web**, que termina em `/exec`.

> **Mudou o script depois?** Vá em **Implantar › Gerenciar implantações › ✏️ Editar › Versão: Nova versão › Implantar**. Assim o URL continua o mesmo.

## 4. Colocar o app no GitHub Pages (5 min)

1. No GitHub, crie um repositório, por exemplo `controle-destinacao`. No plano gratuito, o GitHub Pages exige repositório **público**. Não há problema: nenhum dado fica no repositório, só a tela. Sem a chave, ninguém lê nem altera nada.
2. Envie os arquivos desta pasta (**Add file › Upload files**): `index.html`, `config.js`, `README.md` e as pastas `apps-script/` e `dados-iniciais/`.
3. Edite o `config.js` e cole o URL do passo 3 entre as aspas:
   ```js
   window.CONFIG = { API_URL: "https://script.google.com/macros/s/XXXX/exec" };
   ```
   Se deixar vazio, o app pede o endereço na primeira vez que for aberto em cada aparelho.
4. Vá em **Settings › Pages**. Em *Build and deployment*, escolha **Deploy from a branch**, depois o branch **main** e a pasta **/ (root)**, e clique em **Save**.
5. Em 1 ou 2 minutos o app estará em `https://SEU-USUARIO.github.io/controle-destinacao/`.

## 5. Primeiro acesso de cada pessoa

Abra o link e informe a **chave** (de edição ou de leitura) e o seu nome. O aparelho lembra os dois. O nome fica registrado em cada lançamento e na aba `Log`.

Para tirar o acesso de todo mundo (por exemplo, quando alguém sai da equipe), use o menu **Controle de Destinação › Gerar novas chaves** e passe as novas chaves para quem continua.

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

- **"A chave de acesso não foi aceita":** confira a chave pelo menu da planilha. Se você gerou chaves novas, as antigas deixaram de valer.
- **"Sem conexão com a planilha":** confira o `API_URL` no `config.js` (tem que terminar em `/exec`) e se a implantação está com acesso *Qualquer pessoa*.
- **Alterei o script e nada mudou:** publique uma *Nova versão* da implantação (veja o passo 3).
- **Lentidão:** cada leitura leva de 1 a 3 segundos, que é o tempo normal do Apps Script. O app atualiza sozinho a cada 90 segundos e também quando você volta para a aba; o botão **Atualizar** força a atualização na hora.

## Estrutura

```
index.html                 app (HTML + CSS + JS, sem dependências)
config.js                  endereço da API
apps-script/Codigo.gs      API da planilha (colar no Apps Script)
dados-iniciais/…xlsx       base com setembro/2026 para importar no Drive
```
