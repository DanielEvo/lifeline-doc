# LifeLine · Documento de Referência — Integração Memed

> Consolidado a partir de 24 arquivos `.md` extraídos da documentação Memed, pasta `lilife_memed`. Nenhuma informação dos arquivos originais foi omitida ou resumida — apenas reorganizada por tema. Data de consolidação: 15/08/2026.

---

## Índice

1. [Primeiros Passos / Fluxo de Integração](#1-primeiros-passos--fluxo-de-integração)
2. [Backend — Configurações](#2-backend--configurações)
3. [Backend — Cidades](#3-backend--cidades)
4. [Backend — Especialidades](#4-backend--especialidades)
5. [Backend — Par de Chaves](#5-backend--par-de-chaves)
6. [Backend — Usuário Prescritor](#6-backend--usuário-prescritor)
7. [Backend — Prescrição](#7-backend--prescrição)
8. [Backend — Protocolos](#8-backend--protocolos)
9. [Backend — Impressão](#9-backend--impressão)
10. [Modos de Carregamento do Script](#10-modos-de-carregamento-do-script)
11. [Autorização para Credenciais de Produção](#11-autorização-para-credenciais-de-produção)
12. [Frontend — Comandos MdHub](#12-frontend--comandos-mdhub)
    - [12.1 setPaciente](#121-setpaciente)
    - [12.2 setAllergy](#122-setallergy)
    - [12.3 categoriesConditions (alertas de condição)](#123-categoriesconditions-alertas-de-condição)
    - [12.4 setWorkplace](#124-setworkplace)
    - [12.5 setFeatureToggle](#125-setfeaturetoggle)
    - [12.6 setAdditionalData](#126-setadditionaldata)
    - [12.7 addItem](#127-additem)
    - [12.8 setDictionary](#128-setdictionary)
    - [12.9 Opções de Receituário (find)](#129-opções-de-receituário-find)
    - [12.10 Nova Prescrição (newPrescription)](#1210-nova-prescrição-newprescription)
    - [12.11 Reimpressão e edição (viewPrescription)](#1211-reimpressão-e-edição-viewprescription)
    - [12.12 Esconder o módulo (hide)](#1212-esconder-o-módulo-hide)
    - [12.13 Sair do sistema (logout)](#1213-sair-do-sistema-logout)

---

## 1. Primeiros Passos / Fluxo de Integração

*Fonte: `lifeline_memed_1_Primeiros-passos.md`*

Integrar com a prescrição digital Memed é simples e rápido. Seguindo o passo a passo, ao final do módulo de primeiros passos já é possível utilizar vários recursos da prescrição digital.

> ⚠️ **Atenção:** Todo o passo a passo da documentação aponta para o **ambiente de homologação (testes)** da Memed. Ao obter as **chaves de produção (api-key e secret-key)**, é necessário reconfigurar os endpoints de [BACKEND](https://doc.memed.com.br/docs/backend/configuracoes#urls-de-produ%C3%A7%C3%A3o) e [FRONTEND](https://doc.memed.com.br/docs/frontend/configuracoes#urls-de-produ%C3%A7%C3%A3o) para apontar para o **ambiente de produção**.

### Fluxo de integração

Desenho do fluxo simplificado da integração com a prescrição digital Memed (imagem de referência: `primeiros-passos/simplified-integration-flux.png`).

### Configurações básicas

> ⚠️ **Atenção:** O ambiente de **homologação** fica **indisponível** das 0h às 6h, de segunda a sexta-feira, e ao longo de **todo o fim de semana**.

#### Obtendo o par de chaves (homologação)

O par de chaves do ambiente de **homologação** é fixo:

**API_KEY**
```
iJGiB4kjDGOLeDFPWMG3no9VnN7Abpqe3w1jEFm6olkhkZD6oSfSmYCm
```

**SECRET_KEY**
```
Xe8M5GvBGCr4FStKfxXKisRo3SfYKI7KrTMkJpCAstzu2yXVN4av5nmL
```

> ⚠️ **Atenção:** **Nunca** deixe o par de chaves **visível** no **front-end**.

#### URLs Memed (homologação)

**API URL** — usada para requisições `HTTP Rest` ao back-end da API Memed.

**MEMED_API_URL**
```
https://integrations.api.memed.com.br/v1
```

**Script URL** — usada para baixar os scripts da Memed.

**MEMED_SCRIPT_URL**
```
https://integrations.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js
```

> 💡 Recomenda-se consultar em detalhe as configurações de [**backend**](https://doc.memed.com.br/docs/backend/configuracoes) e [**frontend**](https://doc.memed.com.br/docs/frontend/configuracoes) para uma integração mais completa.

### Backend

A integração com a prescrição digital Memed é baseada na perspectiva do usuário prescritor (profissional de saúde). Para renderizar a prescrição digital dentro do software, é preciso cadastrar o prescritor e obter o token de acesso dele.

#### Cadastrando o prescritor via API

Para obter o Token do usuário prescritor (`data-token`):

- [Cadastrar um usuário prescritor novo](https://doc.memed.com.br/docs/como-fazer/cadastrar-prescritor)
- [Obter dados do usuário prescritor](https://doc.memed.com.br/docs/como-fazer/obter-dados-usuario)

> Nota: o exemplo de integração não utiliza todas as funcionalidades disponíveis na API Memed. Para todas as ações disponíveis entre backend e API Memed, ver [Funções Backend - API](https://doc.memed.com.br/docs/backend-api).

### Frontend

Com o token do usuário (`data-token`) em mãos, segue-se a implementação no frontend.

#### Configurando o Frontend

Primeira etapa: carregar o script de prescrição digital informando a **MEMED_SCRIPT_URL** junto com o **TOKEN** de acesso do usuário prescritor (obtidos via backend).

> ⚠️ A `MEMED_SCRIPT_URL` do exemplo é a **URL de homologação** da Memed.

Atributos passados na tag `<script>`:
```
src="MEMED_SCRIPT_URL"
data-token="TOKEN_DO_USUARIO_OBTIDO_NO_CADASTRO_VIA_API"
```

**Exemplo de página completa:**
```html
<!DOCTYPE html>
<html lang="pt-br">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Meu sistema de Saúde</title>
  </head>
  <body>
    <script
      type="text/javascript"
      src="https://integrations.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js"
      data-token="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.WzM2MzE3LCI2MTA0NGVkZThiMDg4YzdmMmIwMDlkNWM3NmJiMzJjMiIsIjIwMjItMTItMTciLCJzaW5hcHNlLnByZXNjcmljYW8iLCJwYXJ0bmVyLjMuMzE2NDkiXQ.Kv-VSTmXqCI-q6GPiPHF7Q8Prhz2RKy0sL0BWYfoM2I"
    ></script>
    <!-- Proximo passo é acionar os comandos do modulo da prescrição -->
  </body>
</html>
```

Resultado: tela em branco disponível para executar comandos do módulo de prescrição (imagem de referência: `primeiros-passos/integracao_exemplo_page_0.png`).

O console avisa em qual ambiente a integração da Memed está rodando:
```
ENVIRONMENT integrations
we are all set!!!
```

> 💡 O script também pode ser carregado dinamicamente — ver [carregamento dinâmico](https://doc.memed.com.br/docs/modos-de-carregamento#carregamento-din%C3%A2mico).

#### Exibindo a prescrição digital

Para mostrar a prescrição na tela do usuário, usa-se o método `show` do módulo `plataforma.prescricao`. Acessar propriedades do módulo antes de ele estar completamente disponível causa vários erros.

> Em caso de problemas, consultar [erros comuns](https://doc.memed.com.br/docs/erros-comuns).

Antes de utilizar qualquer comando do módulo de prescrição, é necessário garantir que ele esteja carregado, usando o evento `core:moduleInit`:

```js
MdSinapsePrescricao.event.add("core:moduleInit", callbackFunction);
```

> 💡 Existem vários eventos disponíveis durante a interação com a prescrição Memed — ver [eventos da prescrição digital](https://doc.memed.com.br/docs/frontend/eventos-mdhub).

Exemplo de estrutura com o evento e verificação do módulo carregado:

```js
// Evento que fica escutando o carregamento do core:moduleInit
// que contém o dentre outros o módulo de prescrição
MdSinapsePrescricao.event.add("core:moduleInit", function (module) {
  // aqui você verifica se o módulo que retornou nesse callback é o 'plataforma.prescricao'
  if (module.name === "plataforma.prescricao") {
    // aqui você aciona os comandos
    // ativa e desativa funcionalidades
    // renderiza a prescrição na tela do usuário
  }
});
```

> ⚠️ **Fique atento!** Dados de paciente enviados via MdHub **não podem ser alterados na prescrição manualmente**. Ver seção [dados do paciente](https://doc.memed.com.br/docs/frontend/comandos-mdhub/set-patient) para mais detalhes.

**Fluxo completo de integração:** este snippet cobre apenas o comando `setPaciente`. Para a implementação de referência completa — carregamento do script, eventos LGPD e abertura do módulo — consultar [Boas Práticas de Integração](https://doc.memed.com.br/docs/boas-praticas-integracao).

```js
// Enviar dados do paciente (await obrigatório — comando assíncrono)
await MdHub.command.send("plataforma.prescricao", "setPaciente", {
  // Campos obrigatórios
  idExterno: "parceiro-demo-pac-a1b2c3d4",
  nome: "Maria Souza",
  sexo: "Feminino",

  // Campos opcionais (obrigatórios para LME)
  cpf: "39053344705",
  data_nascimento: "15/05/1985",
  telefone: "11987654321",
  email: "paciente.exemplo@email.com",
  raca: "branca",
  peso: 75,
  altura: 1.75,
  endereco: "Rua das Flores, 100",
  cidade: "São Paulo",
  nome_mae: "Nome da mãe",
  dificuldade_locomocao: false,
});
```

Após `setPaciente`, abrir o módulo com `await MdHub.module.show("plataforma.prescricao")` — preferencialmente no clique do botão, e não dentro de `core:moduleInit`.

> **Implementação de referência:** o exemplo acima cobre apenas `setPaciente`. Para o fluxo completo — carregamento do script, eventos LGPD, `setWorkplace` e abertura do módulo — consultar [Boas Práticas de Integração](https://doc.memed.com.br/docs/boas-praticas-integracao).

> 💡 No exemplo, usa-se apenas o comando `setPaciente` e a função `show` do módulo de prescrição. Existem vários outros comandos e funções — ver [comandos e módulos da prescrição Memed](https://doc.memed.com.br/docs/frontend/comandos-mdhub/set-patient).

#### Veja como ficaria o seu frontend após implementar a prescrição Memed

> 💡 O exemplo simplificado não utiliza todas as funcionalidades disponíveis no frontend da Memed — ver [guia completo](https://doc.memed.com.br/docs/frontend).

### Garantindo uma integração robusta

A Memed disponibiliza documentação completa sobre APIs e scripts, além de tutoriais e exemplos de implementação em algumas linguagens.

Checklist de funcionalidades e caminhos de implantação:

- **Ao cadastrar o prescritor**, os principais dados definidos são:
  - ID Externo do prescritor
  - Nome
  - Sobrenome
  - CPF
  - Registro profissional + UF
  - Especialidade
  - Cidade
- **Ao informar o paciente**, os principais dados definidos são:
  - Nome completo
  - ID Externo do paciente
  - CPF
  - Telefone
  - Data de nascimento
- Recuperar o retorno de informações da prescrição gerada
- Setar alergias do paciente
- Setar alertas de condições
- Definir configurações de impressão
- Definir cores conforme o sistema
- Salvar uma cópia do PDF gerado na prescrição
- Salvar o link da receita digital
- Definir locais de atendimento do profissional
- Setar Feature Toggles no atendimento
- Cadastrar protocolos
- Campos adicionais no documento de impressão

### O que fazer a seguir?

- Aprofundar-se nas [funcionalidades da API Memed](https://doc.memed.com.br/docs/backend-api)
- Entender as diferentes formas de [renderizar a prescrição Memed](https://doc.memed.com.br/docs/modos-de-carregamento)
- Saber como [habilitar e desabilitar funcionalidades da prescrição](https://doc.memed.com.br/docs/frontend/comandos-mdhub)
- Garantir agilidade e segurança com [alertas de alergias](https://doc.memed.com.br/docs/frontend/comandos-mdhub/set-allergy) e [condições](https://doc.memed.com.br/docs/docs/frontend/comandos-mdhub/categories-condition)

---

## 2. Backend — Configurações

*Fonte: `lifeline_memed_2_config.md`*

As configurações propostas são sugestões para facilitar a integração com a prescrição digital Memed.

> 💡 Ver também detalhes das configurações do [**frontend**](https://doc.memed.com.br/docs/frontend/configuracoes).

### Variáveis de ambiente

Sugestão de criação de variáveis de ambiente para facilitar a alteração de chaves e URLs entre homologação e produção:

```
#envs
API_KEY=
SECRET_KEY=
MEMED_API_URL=
```

### Par de chaves

#### Ambiente de homologação

**API_KEY**
```
iJGiB4kjDGOLeDFPWMG3no9VnN7Abpqe3w1jEFm6olkhkZD6oSfSmYCm
```

**SECRET_KEY**
```
Xe8M5GvBGCr4FStKfxXKisRo3SfYKI7KrTMkJpCAstzu2yXVN4av5nmL
```

#### Ambiente de produção

> **Nota:** o par de chaves de produção só é obtido após o preenchimento da Autorização para Credenciais de Produção. Concluída a integração, é possível solicitar a [Autorização para Credenciais de Produção](https://doc.memed.com.br/docs/obter-credenciais).

### URLs

#### URLs de homologação

**MEMED_API_URL**
```
https://integrations.api.memed.com.br/v1
```

#### URLs de produção

**MEMED_API_URL**
```
https://api.memed.com.br/v1
```

---

## 3. Backend — Cidades

*Fonte: `lifeline_memed_2_Cidades-Memed-Docs.md`*

### Onde é usado?

A cidade é necessária para identificação do usuário prescritor no cadastro, auxiliando em campos de LME e na identificação do conselho regional ao qual o prescritor está vinculado.

### Como usar

Para consultar as cidades disponíveis, basta fazer uma requisição **GET** na API Memed na rota de cidades. A autenticação **não é necessária** neste método.

> ⚠️ É possível filtrar utilizando o parâmetro **filter**.
> - Filtrar cidades com a palavra "Campinas": `filter[q]=Campinas`
> - Filtrar por estado 'RJ': `filter[uf]=RJ`

### Rota para consultar cidades

```
GET: MEMED_API_URL/cidades
```

### cURL para consultar cidades

```bash
curl --request GET \
--url 'https://integrations.api.memed.com.br/v1/cidades' \
--header 'Accept: application/vnd.api+json' \
--header 'Cache-Control: no-cache' \
--header 'Content-Type: application/json'
```

---

## 4. Backend — Especialidades

*Fonte: `lifeline_memed_2_Especialidades.md`*

### Onde é usado?

As especialidades identificam, no cadastro do usuário prescritor, sua principal área de atuação. Essa informação também é emitida no receituário gerado pela Memed (imagem de referência: `especialidades/speciality-example.png`) e é exibida na receita digital.

### Como usar

Para consultar as especialidades disponíveis, basta fazer uma requisição **GET** na rota de consulta de especialidades. A autenticação **não é necessária** neste método.

> ⚠️ É possível filtrar utilizando o parâmetro **filter**.
> - Filtrar especialidades com a palavra "Generalista": `filter[q]=Generalista`

### Rota para consultar especialidades

```
GET: MEMED_API_URL/especialidades
```

### cURL para consultar especialidades

```bash
curl --request GET \
--url 'https://integrations.api.memed.com.br/v1/especialidades' \
--header 'Accept: application/vnd.api+json' \
--header 'Cache-Control: no-cache' \
--header 'Content-Type: application/json'
```

---

## 5. Backend — Par de Chaves

*Fonte: `lifeline_memed_2_Par-de-Chaves.md`*

### Sobre pares de chaves

Os pares de chave são o principal atributo para realizar a integração Memed; sem eles, não é possível cadastrar um prescritor nem iniciar as integrações com a plataforma. Há um endpoint de validação para entender se a chave de produção recebida é válida para realizar uma integração.

### Consultar se o par de chaves está ativo e funcional

```
PATCH: MEMED_API_URL/v1/sinapse-prescricao/check-key
```

**Requisição GET** — Query Parameters:
- `api-key`
- `secret-key`

Exemplo apontando para o ambiente de **integrations** (QA/Testes) — nessa rota é possível consultar se a chave está funcional:

```bash
curl --request GET \
--url 'https://integrations.api.memed.com.br/v1/sinapse-prescricao/check-key?api-key=iJGiB4kjDGOLeDFPWMG3no9VnN7Abpqe3w1jEFm6olkhkZD6oSfSmYCm&secret-key=Xe8M5GvBGCr4FStKfxXKisRo3SfYKI7KrTMkJpCAstzu2yXVN4av5nmL' \
--header 'Accept: application/json' \
--header 'Content-Type: application/json'
```

Navegação original: Anterior → [Cidades](https://doc.memed.com.br/docs/backend/cidades) | Próxima → [Funções Frontend](https://doc.memed.com.br/docs/frontend)

---

## 6. Backend — Usuário Prescritor

*Fonte: `lifeline_memed_2_Usuário_Prescritor.md`*

> ⚠️ **Atenção: Obrigatoriedade de Dados (RDC n° 1000/25)**
> A partir de **13/02/2026**, conforme exigência da **RDC n° 1000/25**, passará a ser **obrigatório** informar o CPF (ou passaporte, no caso de estrangeiros) e a Data de Nascimento nas emissões de prescrições.
> Além disso, a data da prescrição considerada será sempre a **data da assinatura digital**. É preciso garantir que a integração já esteja enviando esses parâmetros corretamente para evitar erros de validação na emissão.

### Tipos de usuário prescritor

A plataforma Memed permite a emissão de prescrições por diversos tipos de profissionais de saúde devidamente habilitados pelos seus respectivos conselhos:

- **Médicos** (CRM)
- **Dentistas** (CRO)
- **Enfermeiros** (COREN)
- **Médicos Veterinários** (CRMV)
- **Farmacêuticos** (CRF)
- **Nutricionistas** (CRN)
- **Fisioterapeutas** (CREFITO)
- **Psicólogos** (CRP)
- **Fonoaudiólogos** (CRFa)
- **Profissionais de Educação Física** (CREF)

A identificação do tipo de prescritor é automática, com base no registro profissional informado (CRM, CRO, COREN, etc.).

> **Base de Medicamentos Unificada:** a base de medicamentos da Memed é **única e compartilhada** entre todas as categorias profissionais. Cabe ao sistema integrado implementar o controle e validação dos medicamentos que podem ser prescritos por cada categoria profissional, respeitando suas competências e legislações vigentes.

### Status do usuário prescritor

Cada prescritor cadastrado possui um **status** que determina se está autorizado a emitir prescrições.

> **Importante:** prescritores com status "Inativo" **não podem** emitir prescrições e receberão um [erro de autenticação](https://doc.memed.com.br/docs/erros-comuns/ocorreu-erro-autenticacao) ao tentarem acessar a plataforma.

**Status possíveis:**

| Status | Descrição | Pode prescrever? |
|---|---|---|
| Ativo | Cadastro validado e aprovado | ✅ |
| Em análise | Cadastro em processo de validação interna | ✅ |
| Inativo | Cadastro bloqueado ou desativado | ❌ |

### Obtendo o token do usuário (prescritor)

O token de acesso do prescritor é retornado junto com todos os outros dados do usuário.

> ⚠️ O **token** não é estático — sempre que for fazer uma requisição na API Memed, é preciso recuperar o último token válido do usuário.

### Obtendo os dados do usuário prescritor

Para consultar os dados completos de um prescritor, incluindo seu **token de acesso**, realizar uma requisição **GET** na rota de usuários.

**Parâmetros necessários:**
- Identificador do usuário (opções abaixo)
- Par de chaves (API Key + Secret Key)

**Identificadores válidos:**
- **CPF:** apenas números (11 dígitos)
- **External ID:** identificador único definido pelo sistema
- **Registro + UF:** número do registro profissional seguido da sigla do estado (ex: `12345SP`, `01234MG`)

> Tipos de registro aceitos: CRM, CRO, COREN, CRMV, CRF, CRN, CREFITO, CRP, CRFa, CREF

### Rota para obter os dados do usuário

```
GET: MEMED_API_URL/sinapse-prescricao/usuarios/{ID_USUARIO}?api-key=API_KEY&secret-key=SECRET_KEY
```

### Exemplo de requisição (obter dados)

```bash
curl --request GET \
--url 'https://integrations.api.memed.com.br/v1/sinapse-prescricao/usuarios/1234?api-key=iJGiB4kjDGOLeDFPWMG3no9VnN7Abpqe3w1jEFm6olkhkZD6oSfSmYCm&secret-key=Xe8M5GvBGCr4FStKfxXKisRo3SfYKI7KrTMkJpCAstzu2yXVN4av5nmL'\
--header 'Accept: application/vnd.api+json' \
--header 'Cache-Control: no-cache' \
--header 'Content-Type: application/json'
```

### Cadastrando o prescritor

Requisição **POST** na rota de usuários, enviando os dados do profissional no corpo da requisição.

> **Formato obrigatório:** os dados devem ser enviados no corpo (body) da requisição seguindo rigorosamente a estrutura de payload especificada pela API.
>
> **Relacionamentos opcionais:** ao incluir as propriedades `cidade` e/ou `especialidade` no objeto `relationships`, os campos `type` e `id` dentro delas tornam-se **obrigatórios**.

**APIs de consulta:**
- **Cidades:** `https://integrations.api.memed.com.br/v1/cidades`
- **Especialidades:** `https://integrations.api.memed.com.br/v1/especialidades`

> 💡 **Dica:** consultar essas APIs previamente e armazenar os IDs mais utilizados em cache para otimizar o desempenho do cadastro.

### Rota de cadastro do usuário

```
POST: MEMED_API_URL/sinapse-prescricao/usuarios?api-key={API_KEY}&secret-key={SECRET_KEY}
```

### Estrutura do payload de cadastro

> A requisição deve seguir **exatamente** a estrutura de payload especificada. Qualquer desvio resulta em erro de validação.

```json
{
  // obrigatório
  "data": {
    "type": "usuarios",
    "attributes": {
      "external_id": "0753879b-362d-4126-9146-a16cf6eb14bd", // Obrigatório
      "nome": "Gustavo", // Obrigatório
      "sobrenome": "Ribeiro Sousa", // Obrigatório
      "cpf": "53076220403", // Obrigatório
      "board": {
            "board_code": "CRM", // Obrigatório
            "board_number": "315435435", // Obrigatório
            "board_state": "SP"}, // Obrigatório
      "email": "gustavo.ribeiro@meuhospital.com", // Opcional
      "telefone": "19938742708", // Opcional
      "sexo": "M", // Opcional
      "data_nascimento": "05/09/1972" // Obrigatório
    },

    // opcional
    "relationships": {
      "cidade": {
        "data": {
          "type": "cidades", // Obrigatório
          "id": 1 // Obrigatório
        }
      },
      "especialidade": {
        "data": {
          "type": "especialidades", // Obrigatório
          "id": 1 // Obrigatório
        }
      }
    }
  }
}
```

### Dados do prescritor

| Propriedade | Tipo | Obrigatório | Observações |
|---|---|---|---|
| external_id | int/string(255) | ✅ | Recomendável ser do tipo UUID, pois é um campo único |
| nome | string(255) | ✅ | |
| sobrenome | string(255) | ✅ | |
| cpf | string(11) | ✅ | Apenas dígitos |
| board_code | string(5) | ✅ | CRM / CRO / COREN / CRMV / CRF / CRN / CREFITO / CRP / CRFa / CREF |
| board_number | string(255) | ✅ | Apenas dígitos |
| board_state | string(2) | ✅ | Siglas dos estados brasileiros |
| email | string(255) | | |
| telefone | string(16) | | Apenas dígitos ou formatado (DDD) XXXXX-XXXX |
| sexo | string(1) | | M / F |
| data_de_nascimento | date(10) | ✅ | dd/mm/YYYY |
| cidade | int(10) | | O id da API `https://integrations.api.memed.com.br/v1/cidades` |
| especialidade | int(10) | | O id da API `https://integrations.api.memed.com.br/v1/especialidades` |

> **Melhores Práticas para Experiência do Usuário:** embora diversos campos sejam opcionais, quanto mais completo for o cadastro inicial, melhor será a experiência do prescritor na plataforma.
>
> Dados não preenchidos precisarão ser completados posteriormente pelo próprio usuário dentro da plataforma, o que pode gerar interrupções no fluxo de trabalho e frustração.
>
> **Recomendação:** enviar o máximo de informações disponíveis (CPF, e-mail, telefone, sexo, data de nascimento, cidade e especialidade). Isso resulta em:
> - Acesso imediato e completo às funcionalidades da plataforma
> - Redução de etapas para o prescritor após o primeiro login
> - Onboarding mais ágil e sem interrupções
> - Dados mais completos para análises e relatórios

### Exemplo de requisição de cadastro

```bash
curl --location 'https://integrations.api.memed.com.br/v1/sinapse-prescricao/usuarios?api-key=iJGiB4kjDGOLeDFPWMG3no9VnN7Abpqe3w1jEFm6olkhkZD6oSfSmYCm&secret-key=Xe8M5GvBGCr4FStKfxXKisRo3SfYKI7KrTMkJpCAstzu2yXVN4av5nmL' \
--header 'Accept: application/vnd.api+json' \
--header 'Content-Type: application/json' \
--data-raw '{
  "data": {
    "type": "usuarios",
    "attributes": {
      "external_id": "0753879b-362d-4126-9146-a16cf6eb14bd",
      "nome": "Gustavo",
      "sobrenome": "Ribeiro Sousa",
      "cpf": "53076220403",
      "board": {
            "board_code": "CRM",
            "board_number": "315435435",
            "board_state": "SP"},
      "email": "gustavo.ribeiro@meuhospital.com",
      "telefone": "19938742708",
      "sexo": "M",
      "data_nascimento": "05/09/1972"
    },
    "relationships": {
      "cidade": {
        "data": {
          "type": "cidades",
          "id": 1
        }
      },
      "especialidade": {
        "data": {
          "type": "especialidades",
          "id": 1
        }
      }
    }
  }
}'
```

> **Tratamento de Erros:** as mensagens de erro são específicas para cada situação. Analisar cuidadosamente o campo `detail` do erro retornado para identificar e corrigir o problema antes de reenviar a requisição.

**Principais causas de erro:**
- Dados em formato inválido (ex: CPF com letras, data mal formatada)
- Registro profissional não encontrado nos conselhos oficiais
- CPF inválido ou não cadastrado
- E-mail em formato inválido
- Campos obrigatórios ausentes ou vazios
- `external_id` já cadastrado para outro usuário

### Atualizando os dados do usuário prescritor

Requisição **PATCH** na rota de usuários, informando:
- Identificador do usuário (CPF, External ID ou Registro+UF)
- Par de chaves (API Key + Secret Key)
- Dados a atualizar no corpo da requisição

> **Importante:** só incluir o campo `external_id` no payload se realmente for **alterar** seu valor.
>
> Se enviado com o **mesmo valor atual**, a API retorna o erro: `"Prescritor já cadastrado para o parceiro com esse id externo"`
>
> **Recomendação:** para atualizações comuns (nome, e-mail, telefone, etc.), **não incluir** o campo `external_id` no payload.

### Rota para atualizar os dados do usuário prescritor

```
PATCH: MEMED_API_URL/sinapse-prescricao/usuarios/{EXTERNAL_ID}?api-key=API_KEY&secret-key=SECRET_KEY
```

### Exemplo de requisição de atualização

Exemplo: atualizar o CPF de um prescritor existente.

```bash
curl --request PATCH \
--url 'https://integrations.api.memed.com.br/v1/sinapse-prescricao/usuarios/EXTERNAL_ID?api-key=iJGiB4kjDGOLeDFPWMG3no9VnN7Abpqe3w1jEFm6olkhkZD6oSfSmYCm&secret-key=Xe8M5GvBGCr4FStKfxXKisRo3SfYKI7KrTMkJpCAstzu2yXVN4av5nmL' \
--header 'Accept: application/vnd.api+json' \
--header 'Cache-Control: no-cache' \
--header 'Content-Type: application/json' \
--data '{
    "data": {
        "type": "usuarios",
        "attributes": {
            "cpf": "84587617008"
        }
    }
}'
```

### Excluindo usuário prescritor

Requisição **DELETE** na rota de usuários, informando o identificador do usuário e o par de chaves.

> ⚠️ **Ação Irreversível.** Ao excluir um prescritor:
> - Remove **permanentemente** todo o histórico de atividades
> - Exclui **todas as prescrições** associadas
> - Apaga **todos os dados e configurações** do usuário
>
> Mesmo recriando o cadastro com os mesmos dados, **não será possível** recuperar o histórico, prescrições ou configurações anteriores.

### Rota para excluir o usuário prescritor

```
DELETE: MEMED_API_URL/sinapse-prescricao/usuarios/{ID_USUARIO}?api-key=API_KEY&secret-key=SECRET_KEY
```

### Exemplo de requisição de exclusão

```bash
curl --request DELETE \
    --url 'https://integrations.api.memed.com.br/v1/sinapse-prescricao/usuarios/1234?api-key=iJGiB4kjDGOLeDFPWMG3no9VnN7Abpqe3w1jEFm6olkhkZD6oSfSmYCm&secret-key=Xe8M5GvBGCr4FStKfxXKisRo3SfYKI7KrTMkJpCAstzu2yXVN4av5nmL'\
    --header 'Accept: application/vnd.api+json' \
    --header 'Cache-Control: no-cache' \
    --header 'Content-Type: application/json'
```

---

## 7. Backend — Prescrição

*Fonte: `lifeline_memed_2_Prescrição.md`*

### Capturar histórico de prescrições

É possível recuperar o histórico de prescrições do usuário prescritor. A requisição abaixo retorna as 10 últimas prescrições:

```bash
curl --request GET \
--url 'https://integrations.api.memed.com.br/v1/prescricoes?token=user_token' \
--header 'Accept: application/vnd.api+json' \
--header 'Content-Type: application/json'
```

> **Nota:** é possível recuperar histórico além das últimas 10 prescrições. O exemplo abaixo permite consultar qualquer período e aplicar paginação caso o limite de 100 registros seja atingido.

**Exemplo com paginação:**

```bash
curl --request GET \
--url 'https://integrations.api.memed.com.br/v1/prescricoes/?page%5Blimit%5D=100&page%5Boffset%5D=0&token=<TOKEN-DO-MEDICO>&initialDate=2024-09-23&finalDate=2024-09-23' \
--header 'Accept: application/vnd.api+json' \
--header 'Content-Type: application/json'
```

> **Importante:** para recuperar a prescrição com a estruturação de documentos (documentos estruturados) via API, é necessário passar o parâmetro `structuredDocuments=true` na requisição. Isso garante que a resposta traga os dados estruturados dos documentos associados à prescrição.

**Exemplo de requisição com `structuredDocuments=true`:**

```bash
curl --request GET \
--url 'https://integrations.api.memed.com.br/v1/prescricoes/<id_prescription>?structuredDocuments=true' \
--header 'Accept: application/vnd.api+json' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer <seu_token_aqui>'
```

### Remover uma prescrição

Remover via API uma prescrição informando o id da prescrição e o token do usuário prescritor:

```bash
curl --request DELETE \
--url 'https://integrations.api.memed.com.br/v1/prescricoes/{id_prescription}?token=user_token' \
--header 'Accept: application/vnd.api+json' \
--header 'Content-Type: application/json'
```

### Consultar princípios ativos

É possível buscar/listar os princípios ativos dos medicamentos informando `api-key` e `secret-key` como Query Parameters:

```bash
curl --request GET \
--url 'https://integrations.api.memed.com.br/v1/drugs/ingredients?api-key=iJGiB4kjDGOLeDFPWMG3no9VnN7Abpqe3w1jEFm6olkhkZD6oSfSmYCm&secret-key=Xe8M5GvBGCr4FStKfxXKisRo3SfYKI7KrTMkJpCAstzu2yXVN4av5nmL
&terms=dipirona&limit=10&order[field]=name&order[sort]=ASC' \
--header 'Accept: application/vnd.api+json' \
--header 'Content-Type: application/json'
```

### Recuperar o link da Receita Digital

Informar o id da prescrição e o token do usuário:

```bash
curl --request GET \
--url 'https://integrations.api.memed.com.br/v1/prescricoes/{id_prescription}/get-digital-prescription-link?token=user_token' \
--header 'Accept: application/vnd.api+json' \
--header 'Content-Type: application/json'
```

> **Nota:**
> - O link da receita e o código de desbloqueio são fixos. Podem ser armazenados em banco de dados.
> - Ao implementar essa opção, **SEMPRE** informar o código de desbloqueio para o paciente no local em que for exibido o link.

### Salvar o PDF da prescrição

Informar o id da prescrição e o token do usuário:

```bash
curl --request GET \
--url 'https://integrations.api.memed.com.br/v1/prescricoes/{id_prescription}/url-document/full?token=user_token' \
--header 'Accept: application/vnd.api+json' \
--header 'Content-Type: application/json'
```

---

## 8. Backend — Protocolos

*Fonte: `lifeline_memed_2_Protocolos.md`*

### Medicamentos, exames e documentos

Para cadastrar um modelo de prescrição padrão (a nível de profissional prescritor ou instituição de saúde), deve-se considerar principalmente o uso do array de medicamento nas requisições de cadastro (POST). Ele define comportamentos no pós-prescrição, como uso do marketplace e dispensação correta de medicamentos.

> **Obs:** o ID do medicamento/exame deve possuir correspondência correta com a Memed, caso contrário ocorrerá a mensagem: `Apresentação especificada no medicamento não encontrada`

> 💡 **Fica a dica!** Para facilitar o uso e criação, um protocolo pode ser cadastrado via frontend e recuperado com as rotas abaixo para replicar para outros profissionais.

#### Medicamentos

Para o cadastro correto, informar todas as medidas necessárias:

```json
"medicamentos": [
{
  "id": "a1046503030027106379",
  "posologia": "Tomar de 6 em 6h",
  "nome": "Dipirona"
},
```

#### Exames

Para exames, informar somente os campos de ID e nome do exame, conforme catálogo da Memed:

```json
"medicamentos": [
{
  "id": "e10",
  "posologia": "Jejum de 8 a 10 horas",
  "nome": "Hemograma"
},
```

#### Documentos

Para documentos, os campos de id são removidos do array — toda inserção sem um campo de ID é considerada texto livre:

```json
"medicamentos": [
{
  "nome": "Atestado",
  "posologia": "<p>ATESTADO<br> Atesto que o(a) Sr.(a) ___________________________________________________________________<br> encontra-se sob meus cuidados profissionais ...."
}
```

> **Sobre os IDs:** a Memed não possui uma rota direta para captura dos IDs de medicamento/exames — é necessário contatar a Memed sobre como adquiri-los.

### Cadastrar protocolos para o usuário prescritor

Cadastro via API, informando o token do usuário prescritor e, dentro do array de medicamentos, os dados do medicamento:

```bash
curl --request POST \
--url 'https://integrations.api.memed.com.br/v1/protocolos?token=user_token' \
--header 'Accept: application/vnd.api+json' \
--header 'Content-Type: application/json' \
--data '{
  "data": {
    "type": "protocolos",
    "attributes": {
      "nome": "string",
      "medicamentos": [
        {
          "nome": "string",
          "posologia": "string",
          "quantidade": 0,
          "composicao": "string",
          "fabricante": "string",
          "titularidade": "string",
          "preco": 0
        }
      ]
    }
  }
}'
```

> **Info:**
> - O campo `data.attributes.nome` possui limite de 500 caracteres;
> - Caso não haja o ID, o item/medicamento será adicionado como texto livre na prescrição.

Após inserido, o usuário visualiza o protocolo no menu Protocolos (imagem de referência: `protocols-list.png`).

### Recuperar protocolos de um prescritor

Enviando o token do usuário prescritor como parâmetro (Query Parameters):

```bash
curl --request GET \
--url 'https://integrations.api.memed.com.br/v1/protocolos?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.WzMxNTc5LCIwOTZiZDY5MDBhYjYxMTMyZTkzNzUzYjU2NDA5NWM0MSIsIjIwMjMtMDItMDkiLCJzaW5hcHNlLnByZXNjcmljYW8iLCJwYXJ0bmVyLjI1LjI2OTgxIl0.3i20Y7OZ3RSuyajuBlxGLxsjsMKqMB3egbNmjeKz5Y8' \
--header 'Accept: application/vnd.api+json' \
--header 'Content-Type: application/json'
```

### Excluir protocolo de um prescritor

```bash
curl --request DELETE \
--url 'https://integrations.api.memed.com.br/v1/protocolos/1367?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.WzMxNTc5LCIwOTZiZDY5MDBhYjYxMTMyZTkzNzUzYjU2NDA5NWM0MSIsIjIwMjMtMDItMDkiLCJzaW5hcHNlLnByZXNjcmljYW8iLCJwYXJ0bmVyLjI1LjI2OTgxIl0.3i20Y7OZ3RSuyajuBlxGLxsjsMKqMB3egbNmjeKz5Y8' \
--header 'Accept: application/vnd.api+json' \
--header 'Content-Type: application/json'
```

### Criar protocolo para todos os prescritores

Dentro de uma instituição/hospital é comum a padronização de protocolos para certo tipo de tratamento/doença. A Memed disponibiliza aos parceiros integrados a possibilidade de criar e gerenciar protocolos que aparecerão a todos os seus prescritores.

Para criar um protocolo é preciso informar:
- Nome do protocolo;
- Lista de itens do protocolo, cada item podendo ser:
  - Medicamento
  - Exame
  - Texto Livre

No exemplo abaixo, o protocolo `NomeQueVaiAparecerParaTodosMedicos` inclui um medicamento (dipirona) e um exame (hemograma), exibidos automaticamente para todos os prescritores do hospital.

> **Info:** os protocolos cadastrados a nível de instituição são exibidos para todos os profissionais prescritores do par de chaves utilizado.

```bash
curl --request POST \
--url 'https://integrations.api.memed.com.br/v1/protocolos/parceiros?api-key=NWJhMzEwNWUtYjJmMC00M2M0LWFlNmMtY2FjZDRhOTViMzNi&secret-key=YjdmNjUwZTUtZmE3My00OTJkLTkzNWMtMjg5NTRlMGU1MjIw' \
--header 'Accept: application/vnd.api+json' \
--header 'Content-Type: application/json' \
--data '{
  "data": {
    "type": "protocolos",
    "attributes": {
      "nome": string,
      "medicamentos": [
        {
          "id": string,
          "posologia": string,
          "nome": string
        },
        {
          "id": string,
          "nome": string
        }
      ]
    }
  }
}'
```

> **Obs:** o id do medicamento deve ser utilizado do ambiente correspondente (integrations ou produção), caso contrário ocorrerá a mensagem de erro: `Apresentação especificada no medicamento não encontrada`

### Consultar todos os protocolos

Consultar todos os protocolos de um determinado parceiro, enviando `api-key` e `secret-key` como parâmetro (Query Parameters):

```bash
curl --request GET \
--url 'https://integrations.api.memed.com.br/v1/protocolos/parceiros?api-key=NWJhMzEwNWUtYjJmMC00M2M0LWFlNmMtY2FjZDRhOTViMzNi&secret-key=YjdmNjUwZTUtZmE3My00OTJkLTkzNWMtMjg5NTRlMGU1MjIw' \
--header 'Accept: application/vnd.api+json' \
--header 'Content-Type: application/json'
```

Retorna todos os protocolos criados e exibidos aos prescritores do parceiro.

### Consultar/Excluir protocolo por ID

Para exclusão e consulta de um protocolo específico, é necessário informar o ID deste protocolo. Esse ID pode ser recuperado de duas formas:
- Após a criação de um protocolo, o sistema retorna todos os dados de forma estruturada, inclusive o ID;
- Consultando todos os protocolos do parceiro.

**Consultar:**

```bash
curl --request GET \
--url 'https://integrations.api.memed.com.br/v1/protocolos/parceiros/{protocolo_id}?api-key=NWJhMzEwNWUtYjJmMC00M2M0LWFlNmMtY2FjZDRhOTViMzNi&secret-key=YjdmNjUwZTUtZmE3My00OTJkLTkzNWMtMjg5NTRlMGU1MjIw' \
--header 'Accept: application/vnd.api+json' \
--header 'Content-Type: application/json'
```

**Excluir:**

```bash
curl --request DELETE \
--url 'https://integrations.api.memed.com.br/v1/protocolos/parceiros/{protocolo_id}?api-key=NWJhMzEwNWUtYjJmMC00M2M0LWFlNmMtY2FjZDRhOTViMzNi&secret-key=YjdmNjUwZTUtZmE3My00OTJkLTkzNWMtMjg5NTRlMGU1MjIw' \
--header 'Accept: application/vnd.api+json' \
--header 'Content-Type: application/json'
```

### Cadastrar múltiplos protocolos para o usuário

É possível cadastrar vários protocolos de tratamento para o usuário com apenas um REQUEST à API:

```bash
curl --request POST \
--url 'https://integrations.api.memed.com.br/v1/protocolos/multiplos?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.WzMxNTc5LCIwOTZiZDY5MDBhYjYxMTMyZTkzNzUzYjU2NDA5NWM0MSIsIjIwMjMtMDItMDkiLCJzaW5hcHNlLnByZXNjcmljYW8iLCJwYXJ0bmVyLjI1LjI2OTgxIl0.3i20Y7OZ3RSuyajuBlxGLxsjsMKqMB3egbNmjeKz5Y8' \
--header 'Accept: application/vnd.api+json' \
--header 'Content-Type: application/json' \
--data '{
  "data": {
    "type": "protocolos",
    "attributes": {
      "nome": "string",
      "medicamentos": [
        {
          "nome": "string",
          "posologia": "string",
          "quantidade": 0,
          "composicao": "string",
          "fabricante": "string",
          "titularidade": "string",
          "preco": 0
        }
      ]
    }
  }
}'
```

> **Info:** o campo `data[].attributes.nome` possui limite de 250 caracteres.

---

## 9. Backend — Impressão

*Fonte: `lifeline_memed_2_Impressão-Memed-Docs.md`*

Quando um usuário é criado, são adicionados 4 (quatro) temas padrão para o usuário. Esses temas podem ser customizados via API.

### Configurar Impressão

A Memed permite personalizar configurações relacionadas à impressão (margens, cabeçalho, rodapé, fonte, entre outros). É possível capturar as configurações de impressão atuais e o PDF da prescrição para visualização.

```bash
curl --request POST \
  --url 'https://integrations.api.memed.com.br/v1/opcoes-receituario?token=user_token' \
  --header 'Accept: application/vnd.api+json' \
  --header 'Content-Type: application/json' \
  --data '{
    "data": {
            "type": "configuracoes-prescricao",
            "attributes": {
                "medicos_id": 123456,
                "indice": 1,
                "mostrar_label_nome_paciente": true,
                "mostrar_label_paciente_especial": 1,
                "mostrar_data": 1,
                "mostrar_data_controle_especial": 1,
                "fonte": "Helvetica",
                "tamanho_fonte": 14,
                "espacamento": 30,
                "mostrar_unidades": true,
                "mostrar_unidades_especial": true,
                "separar_por_uso": false,
                "mostrar_nome_fabricante": true,
                "separador_uso": 0,
                "separador_medicamento": 0,
                "largura_papel": 21,
                "altura_papel": 29.7,
                "margem_esquerda": 1.5,
                "margem_direita": 1.5,
                "margem_superior": 1,
                "margem_inferior": 1,
                "titulo_fonte": "Droid Serif Italic",
                "titulo_tamanho_fonte": 22,
                "titulo": "Dr. Teste da Silva Teste",
                "titulo_cor": "#20afd6",
                "subtitulo_fonte": "Proxima Nova",
                "subtitulo_tamanho_fonte": 14,
                "subtitulo": "CRM: 12345MG - Ginecologia e obstetrícia",
                "subtitulo_cor": "#8c8c8c",
                "tamanho_cabecalho": 2,
                "rodape_fonte": "Proxima Nova",
                "rodape_tamanho_fonte": 14,
                "rodape": "",
                "rodape_cor": "#8c8c8c",
                "tamanho_rodape": 8,
                "modelo_cabecalho_rodape": 1,
                "ativo": true,
                "imprimir_controle_especial": false,
                "imprimir_controle_especial_antibioticos": true,
                "imprimir_controle_especial_c4": false,
                "imprimir_lme": false,
                "nome_medico": "Teste da Silva Teste",
                "endereco_medico": "RUA MATO GROSSO, 1100 - SANTO AGOSTINHO",
                "cidade_medico": "São Paulo - MG",
                "telefone_medico": "(11) 99999-9999",
                "mostrar_cabecalho_rodape_simples": 1,
                "modelo_rodape": 0,
                "width_logo": 0,
                "height_logo": 0,
                "mostrar_cabecalho_rodape_especial": 1,
                "logo_nome": "",
                "logo_src": "",
                "zoom_logo": 0,
                "header_image": "parceiros/templates/parceiro-template-teste-header.jpeg",
                "footer_image": "parceiros/templates/parceiro-template-teste-footer.jpeg",
                "number_of_lme_copies": 1
            }
     }
}'
```

### Dados de impressão adicionais

É possível colocar dados extras no cabeçalho e rodapé da prescrição, como endereço, nome e registro do prescritor. Ver [Gestão de prescritor](https://doc.memed.com.br/docs/como-fazer/gestao-do-prescritor).

### Recuperar as configurações das opções de receituário

```bash
curl --request GET \
  --url 'https://integrations.api.memed.com.br/v1/opcoes-receituario?token=user_token' \
  --header 'Accept: application/vnd.api+json' \
  --header 'Content-Type: application/json' \
```

### Importar cabeçalho/rodapé de um PDF

Muitas ferramentas já possuem opção de customização de impressão que nem sempre se encaixam nas opções disponibilizadas pela Memed. É possível importar o cabeçalho/rodapé com base em um template (PDF) enviado para a Memed, que será usado como imagem de fundo na prescrição.

Fluxo (imagem de referência: `exemplo-importar-cabecalho.webp`):
- O PDF é enviado para a API contendo somente o cabeçalho e rodapé do prescritor;
- A Memed converte para imagem e faz o recorte, identificando automaticamente onde começa e termina o cabeçalho/rodapé;
- As imagens são usadas como fundo da receita médica.

```bash
curl --request POST \
  --url 'https://integrations.api.memed.com.br/v1/opcoes-receituario/upload-template?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.WzQ0MTQ2LCI0NDhkZDQyZDcwYTM2NjQ3ZmRmZDRlY2I0OGQzOWM5YyIsIjIwMjMtMDItMDkiLCJzaW5hcHNlLnByZXNjcmljYW8iLCJwYXJ0bmVyLjU1Mi4zOTQ1NiJd.8Ap9NOH_M5o5XGbkf1-cb5wjo4ufCaiq0utFkr22cuE' \
  --header 'Accept: application/vnd.api+json' \
  --header 'Content-Type: multipart/form-data' \
  --form 'template=@'
```

> Também é possível enviar apenas um template contendo header ou footer — útil em casos de prescritor com papel timbrado. Nesse caso, a requisição retorna apenas o caminho do header ou do footer encontrado no template.

> ⚠️ **Perigo:** o PDF importado será cadastrado na configuração de impressão com índice 1 do prescritor. Caso essa configuração não possua os atributos **mostrar_cabecalho_rodape_simples** e **mostrar_cabecalho_rodape_especial** com valor igual a 1, as imagens recuperadas na requisição **não** aparecerão no PDF, pois a configuração não permite exibição de cabeçalho e rodapé.

> **Info:** é importante lembrar que o processo acima precisa ser feito (uma única vez) para cada prescritor que utilizará o Sinapse Prescrição.

> **Info:** ter certeza de que o tamanho do container onde ficará a imagem recortada tem o espaço necessário nos atributos **tamanho_cabecalho** e **tamanho_rodape** das opções de receituário cadastradas.

> Vídeo demonstrando como fazer o upload do arquivo PDF: `https://www.youtube.com/embed/FFod9QHkbTE`

---

## 10. Modos de Carregamento do Script

*Fonte: `lifeline_memed_3_Modos-de-carregamento-prescricao.md`*

Existem duas formas de carregar o script da prescrição digital na aplicação:

- [**Estático**](https://doc.memed.com.br/docs/modos-de-carregamento#carregamento-est%C3%A1tico): carrega o script Memed diretamente pela tag `<script>` no HTML
- [**Dinâmico**](https://doc.memed.com.br/docs/modos-de-carregamento#carregamento-din%C3%A2mico): carrega o script Memed dinamicamente a partir de outro script

### Carregamento Estático

Basta criar uma tag `<script>` passando os dois principais atributos: **src** com a URL [MEMED_SCRIPT_URL](https://doc.memed.com.br/docs/frontend/configuracoes#urls) e **data-token** com o [token do usuário prescritor](https://doc.memed.com.br/docs/backend/usuario-prescritor#obtendo-o-token-do-usu%C3%A1rio-prescritor).

```html
<script
  src="{MEMED_SCRIPT_URL}"
  data-token="{TOKEN_ACESSO_USUARIO_PRESCRITOR}"
></script>
```

### Carregamento Dinâmico

Também é possível carregar o script Memed dinamicamente: criar um elemento de script e injetá-lo dinamicamente na página HTML, passando exatamente os mesmos atributos do carregamento estático.

```js
// Cria um elemento de script
var script = document.createElement("script");

// Adiciona o atributo src com a url do script Memed
script.src = "MEMED_SCRIPT_URL";

// Adiciona o atributo token com o token de acesso do usuário prescritor
script.dataset.token = "TOKEN_ACESSO_USUARIO_PRESCRITOR";

//Injeta no html o elemento que foi criado dinamicamente
document.body.appendChild(script);
```

> Para evitar problemas com o carregamento dinâmico, recomenda-se realizar qualquer lógica relacionada à prescrição Memed apenas após a garantia de que o script foi completamente carregado — via evento `load` atrelado ao elemento criado. Assim o HTML informa quando esse elemento foi completamente carregado.

Exemplo de implementação:

```js
var script = document.createElement("script");
script.src = "MEMED_SCRIPT_URL";
script.dataset.token = "TOKEN_ACESSO_USUARIO_PRESCRITOR";

// Quando o script terminar de carregar retorna uma função de callback
script.addEventListener("load", function () {
  // Aqui você pode performar qualquer lógica relacionado a prescrição Memed.
});

document.body.appendChild(script);
```

> 💡 Boa prática do carregamento dinâmico: colocar tudo dentro de uma (ou mais) funções para organizar melhor o código.

---

## 11. Autorização para Credenciais de Produção

*Fonte: `lifeline_memed_4_Autorização-para-Credenciais-prod.md`*

**Último passo antes de colocar a integração em produção.**

Neste [formulário](https://forms.gle/Z3M6TGhf2GMVmzH56), procede-se ao registro das informações necessárias para que a empresa se torne parceira, assegurando o cumprimento das boas práticas descritas na documentação e o seguimento dos passos essenciais para uma integração bem-sucedida.

### Requisitos Obrigatórios

> **IMPORTANTE:** antes do preenchimento do formulário, certificar-se que os seguintes passos foram implementados.

#### 1) Cadastro do Usuário Prescritor

Verificar se o cadastro do prescritor foi realizado contendo:
- Nome e Sobrenome
- Registro Profissional + UF (número de registro CRM, CRO, COREN, CRMV, CRF, CRN, CREFITO, CRP, CRFa ou CREF)
- E-mail
- Especialidade
- Data de Nascimento
- CPF

#### 2) Configurando o Paciente

O comando `setPaciente` é utilizado para enviar os dados do paciente para a prescrição da Memed. Verificar se foi implementado contendo:
- Nome e Sobrenome
- E-mail
- Telefone celular (Exemplo: 11999999999)
- Data de Nascimento
- CPF

Ver [Comandos MdHub](https://doc.memed.com.br/docs/frontend/comandos-mdhub).

#### 3) Eventos

Caso a receita gerada esteja sendo salva no prontuário do paciente, implementar os eventos:
- [`prescricaoImpressa`](https://doc.memed.com.br/docs/frontend/eventos-mdhub/prescricao-impressa) (captura o momento em que a prescrição foi emitida e recupera os dados para o prontuário)
- [`prescricaoExcluida`](https://doc.memed.com.br/docs/frontend/eventos-mdhub/prescricao-excluida) (evita que o prescritor tente acessar um documento excluído)
- **Obs:** a receita pode ser excluída pelo prescritor no histórico ou ao editá-la; se ele tentar abrir uma receita salva no prontuário que foi excluída, ocorrerá erro.

Ver [Eventos MdHub](https://doc.memed.com.br/docs/frontend/eventos-mdhub).

#### 4) Termo de Responsabilidade

A Memed se resguarda o direito de avaliar a integração em até 180 dias após a liberação das Chaves de Produção, podendo eventualmente revogá-las em caso de não cumprimento das Boas Práticas apontadas na documentação e validadas neste [formulário](https://forms.gle/mjPRJpaJ1EsKZp18A).

#### 5) A permissão será revogada caso:

- O cadastro do prescritor não esteja completo.
- Sejam identificadas falhas de segurança no front-end do parceiro, como deixar as credenciais **API-KEY** e **SECRET-KEY** visíveis.
- Features desativadas com o comando [setFeatureToggle](https://doc.memed.com.br/docs/frontend/comandos-mdhub/set-feature-toggle) estejam em funcionamento inadequado.
- O fluxo de [capturar uma prescrição](https://doc.memed.com.br/docs/frontend/eventos-mdhub/prescricao-impressa) seja revisado e reprovado.

---

## 12. Frontend — Comandos MdHub

> ⚠️ **Regra geral, válida para todos os comandos abaixo:** todos os comandos do **MdHub** são executados de forma **assíncrona**. Por esse motivo recomenda-se o uso de **async/await** como padrão de implementação para evitar problemas de assincronicidade durante a execução dos comandos. Também é possível utilizar o método `.then()` para saber quando o comando terminou sua execução.

### 12.1 setPaciente

*Fonte: `lifeline_memed_5_Configurar-Paciente-setPaciente.md`*

O comando `setPaciente` configura os dados do paciente antes de iniciar uma prescrição médica na Memed, enviando informações cadastrais e demográficas essenciais para diferentes tipos de prescrições.

**Quando usar:**
- **Prescrições digitais:** dados básicos do paciente
- **LME (Laudo Médico de Exame):** informações obrigatórias para emissão
- **Receitas de controle especial:** dados necessários para medicamentos controlados

> **Importante:** este comando deve ser executado **antes** de abrir o módulo de prescrição para garantir que todos os dados do paciente estejam disponíveis durante o processo.

**Estrutura do comando:**
```js
nome_do_modulo = "plataforma.prescricao";
nome_do_comando = "setPaciente";
parametro = { propriedade: valor };
```

**Sintaxe do comando:**
```js
await MdHub.command.send("plataforma.prescricao", "setPaciente", {
  propriedade: "valor",
});
```

**Campos Obrigatórios:**

| Propriedade | Tipo | Observações |
|---|---|---|
| idExterno | int/string(255) | Recomendável ser do tipo UUID, pois é um campo único |
| nome | string(255) | Nome completo do paciente |
| sexo | string(255) | Aceita "Masculino", "Feminino", "M", "F", "m", "f". Se ausente, preenche automaticamente com "Não informado" |

**Campos Opcionais — Dados Pessoais:**

| Propriedade | Tipo | Observações |
|---|---|---|
| nome_social | string(255) | Nome social do paciente |
| cpf | string(11) | Apenas dígitos |
| passaporte | string(15) | Apenas dígitos |
| data_nascimento | string(255) | Formatado no padrão: dd/mm/YYYY |
| nome_mae | string(255) | Nome da mãe do paciente |
| telefone | string(16) | Apenas dígitos ou formatado (DDD) XXXXX-XXXX |
| email | string(255) | Deve conter formato válido de e-mail. Utilizado no formulário LME |

**Campos Opcionais — Dados Demográficos:**

| Propriedade | Tipo | Observações |
|---|---|---|
| raca | string(255) | Aceita "branca", "preta", "parda", "amarela", "indígena". Padronizada para minúsculas com fallback entre raca e race |

**Campos Opcionais — Dados Físicos e Localização:**

| Propriedade | Tipo | Observações |
|---|---|---|
| peso | int(10) | Peso em quilogramas |
| altura | float(10) | Altura em metros |
| endereco | string(255) | Endereço completo |
| cidade | string(255) | Cidade de residência |
| dificuldade_locomocao | bool | Valor padrão: false |

**Campos Opcionais — Documentos Estruturados (Mention):**

| Propriedade | Tipo | Observações |
|---|---|---|
| historia_clinica | string(2000) | Texto livre com a história clínica do paciente. Suporta múltiplas linhas (multiline). Limite de 2000 caracteres — ao exceder, o comando rejeita o payload com erro descritivo (sem truncamento silencioso). Coexiste com outros campos de documentos estruturados/mention (ex.: `situacao`, `status_psiquico`, `endereco`, `cidade`) numa mesma chamada, sem sobrescrita entre eles |

**Campos Especiais:**

| Propriedade | Tipo | Observações |
|---|---|---|
| categoriesConditions | array | **[1]** Aeronautas, **[2]** Atletas (alerta antidoping), **[3]** Gestante, **[4]** Lactante |

**Normalização Automática de Dados:**
- **Campo Sexo:** se não informado, preenche automaticamente com "Não informado".
- **Campo Raça:** normalização — todos os valores convertidos para minúsculas; aceita tanto "raca" quanto "race" como nome da propriedade.

**História clínica e campos de documentos estruturados:**

O campo `historia_clinica` faz parte do conjunto de campos de documentos estruturados/mention que podem ser pré-populados via `setPaciente` (junto com `situacao`, `status_psiquico`, `endereco`, `cidade`, entre outros). Esses campos coexistem numa mesma chamada, sem que um sobrescreva o outro.

**Limite de caracteres:** o valor de `historia_clinica` é limitado a 2000 caracteres. Ao exceder o limite, o comando rejeita a requisição e retorna um erro descritivo, ao invés de truncar o conteúdo silenciosamente:
```
O campo história clínica excede o limite de 2000 caracteres.
```

**Normalização de quebras de linha:** quebras de linha no formato `\r\n` são normalizadas para `\n`, tanto na contagem do limite de 2000 caracteres quanto na persistência do valor. O campo aceita conteúdo multiline normalmente.

**Casos de Uso Comuns**

*Prescrição Digital Básica* — apenas os campos obrigatórios:
```js
await MdHub.command.send("plataforma.prescricao", "setPaciente", {
  idExterno: "uuid-do-paciente",
  nome: "João Silva",
  sexo: "Masculino",
  passaporte: "AB12930293345636" // ou cpf: "12345678901"
});
```

*Prescrição com LME* — todos os campos obrigatórios para LME:
```js
await MdHub.command.send("plataforma.prescricao", "setPaciente", {
  idExterno: "uuid-do-paciente",
  nome: "Maria Santos",
  cpf: "98765432100", // ou passaporte: "AB12930293345636"
  sexo: "Feminino",
  raca: "branca",
  telefone: "11999999999",
  email: "maria.santos@email.com"
});
```

*Prescrição Completa* — informações completas do paciente:
```js
await MdHub.command.send("plataforma.prescricao", "setPaciente", {
  idExterno: "uuid-do-paciente",
  nome: "Pedro Costa",
  cpf: "11122233344", // ou passaporte: "AB12930293345636"
  sexo: "Masculino",
  data_nascimento: "15/03/1985",
  telefone: "11888888888", 
  email: "pedro.costa@email.com",
  endereco: "Rua das Flores, 123",
  cidade: "São Paulo",
  peso: 75,
  altura: 1.75,
  raca: "parda"
});
```

*Prescrição com História Clínica e Documentos Estruturados* — sem que um campo sobrescreva o outro:
```js
await MdHub.command.send("plataforma.prescricao", "setPaciente", {
  idExterno: "uuid-do-paciente",
  nome: "Ana Ferreira",
  sexo: "Feminino",
  cpf: "12345678901",
  historia_clinica: "Paciente relata dor lombar há 3 semanas.\nSem histórico de cirurgias prévias.",
  situacao: "Em acompanhamento ambulatorial",
  status_psiquico: "Orientado(a) em tempo e espaço"
});
```

> **Limite de historia_clinica:** se o valor exceder 2000 caracteres, o comando **não trunca** o conteúdo — a requisição é rejeitada com o erro: `O campo história clínica excede o limite de 2000 caracteres.`

**Exemplo — Fluxo completo:** este snippet cobre apenas o payload de `setPaciente`. Para a implementação de referência completa, consultar [Boas Práticas de Integração](https://doc.memed.com.br/docs/boas-praticas-integracao).

```js
// Enviar dados do paciente (await obrigatório — comando assíncrono)
await MdHub.command.send("plataforma.prescricao", "setPaciente", {
  // Campos obrigatórios
  idExterno: "parceiro-demo-pac-a1b2c3d4",
  nome: "Maria Souza",
  sexo: "Feminino",

  // Campos opcionais (obrigatórios para LME)
  cpf: "39053344705",
  data_nascimento: "15/05/1985",
  telefone: "11987654321",
  email: "paciente.exemplo@email.com",
  raca: "branca",
  peso: 75,
  altura: 1.75,
  endereco: "Rua das Flores, 100",
  cidade: "São Paulo",
  nome_mae: "Nome da mãe",
  dificuldade_locomocao: false,
});
```

Após `setPaciente`, abrir o módulo com `await MdHub.module.show("plataforma.prescricao")` — preferencialmente no clique do botão, e não dentro de `core:moduleInit`.

**Definir alertas de condição (categoriesConditions)**

A Memed disponibiliza alertas personalizados em casos de pacientes específicos, como aeronautas e dopagem. Para utilizar estes alertas, devem ser definidos através do comando `setPaciente`, junto com as informações de paciente necessárias na prescrição.

As opções dos alertas de condição são definidas através de ids:

| ID | Condição | Descrição |
|---|---|---|
| 1 | Aeronautas | Alertas relacionados a medicamentos que podem gerar problemas ao paciente em conduzir aeronaves |
| 2 | Atletas | Alertas relacionados a medicamentos que podem gerar alterações em exames de dopagem ligados a competições esportivas |
| 3 | Gestantes | Alertas relacionados a medicamentos contraindicados ou que exigem precaução durante a gestação |
| 4 | Lactantes | Alertas relacionados a medicamentos contraindicados ou que exigem precaução durante a amamentação |

**Sintaxe do comando:**
```js
await MdHub.command.send("plataforma.prescricao", "setPaciente", {
  nome: "João Silva",
  // ...restante dos campos
  categoriesConditions: [1]
});
```

**Campos Obrigatórios para LME** (Laudo Médico de Exame):
- **nome:** nome completo do paciente
- **documento de identificação:** CPF ou passaporte (apenas dígitos)
- **sexo:** sexo do paciente ("Masculino" ou "Feminino")
- **raca:** raça/cor do paciente ("branca", "preta", "parda", "amarela" ou "indígena")
- **telefone:** telefone de contato do paciente
- **email:** e-mail válido do paciente

---

### 12.2 setAllergy

*Fonte: `lifeline_memed_5_Definir-alergia-no-paciente.md`*

Com o comando `setAllergy` é possível definir as alergias do paciente dentro da plataforma Memed, para que o prescritor usufrua da funcionalidade "Alerta de Alergias", proporcionando maior segurança ao paciente no momento de prescrever.

Imagem de referência: `exemplo-alergias.png` ("João tem 3 alergias definidas").

No exemplo, o paciente **João Silva** possui alergia às seguintes substâncias: `dipirona`, `losartana-potassica`, `amoxicilina`.

```js
await MdHub.command.send("plataforma.prescricao", "setPaciente", {
  nome: "João Silva",
  // ...restante dos campos
});

// Agora vamos definir que o paciente acima, tem alergia as alergias: `dipirona`, `losartana-potassica`, `amoxicilina`.
await MdHub.command.send("plataforma.prescricao", "setAllergy", [
  622, // Principio Ativo: (dipirona)
  2584, // Principio Ativo: (losartana-potassica)
  174, // Principio Ativo: (amoxicilina)
]);
```

> Para consultar o princípio ativo e fazer um "De/Para" com o sistema, utilizar o endpoint [Consultar princípios ativos](#7-backend--prescrição).

---

### 12.3 categoriesConditions (alertas de condição)

*Fonte: `lifeline_memed_5_Definir-alertas-de-condição.md`*

A Memed disponibiliza alertas personalizados em casos de pacientes específicos, como aeronautas e dopagem. Para utilizar estes alertas, eles devem ser definidos através do comando `setPaciente`, junto com as informações de paciente necessárias na prescrição.

As opções dos alertas de condição são definidas através de ids (ver tabela completa na [seção 12.1](#121-setpaciente)).

```js
await MdHub.command.send("plataforma.prescricao", "setPaciente", {
  nome: "João Silva",
  // ...restante dos campos
  categoriesConditions: [1]
});
```

---

### 12.4 setWorkplace

*Fonte: `lifeline_memed_5_Configurar-local-físico-de-trabalho.md`*

É comum que o prescritor atenda em diferentes lugares durante sua jornada de trabalho. Com o comando `setWorkplace` é possível preencher o endereço do prescritor que sairá no receituário.

```js
await MdHub.command.send("plataforma.prescricao", "setWorkplace", {
  city: "Cidade Teste",
  state: "TS",
  cnes: 0000,
  local_name: "Clinica Teste",
  address: "Rua teste, 123",
  phone: 0000000000,
});
```

> Caso o número do telefone seja "0800", o valor do atributo `phone` deve ser uma `string`.

---

### 12.5 setFeatureToggle

*Fonte: `lifeline_memed_5_Configurar-funcionalidades-da.md`*

Com o comando `setFeatureToggle` é possível ativar e desativar alguns recursos e características da prescrição digital.

**Estrutura do comando:**
```js
nome_do_modulo = "plataforma.prescricao";
nome_do_comando = "setFeatureToggle";
parametro = { propriedade: valor };
```

**Sintaxe do comando:**
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle", {
  propriedade: true | false,
});
```

**Funcionalidades que podem ser ativadas/desativadas:**

| Funcionalidade | Valor padrão | Descrição |
|---|---|---|
| deletePatient | false | Permite que o prescritor exclua o paciente da base de dados. |
| removePatient | false | Permite que o prescritor remova o paciente da prescrição. |
| editPatient | false | Permite que o prescritor edite os dados do paciente na base de dados. |
| setAllowedSignatureProviders | false | Permite configurar a lista de provedores de assinatura digital que ficarão disponíveis ao prescritor. |
| forceSign | false | Força que o prescritor tenha que assinar digitalmente para seguir o fluxo de prescrição. |
| historyPrescription | true | Permite a visualização do histórico na tela de prescrição. |
| optionsPrescription | true | Permite a exibição das opções de receituário no módulo. |
| removePrescription | true | Permite que o prescritor exclua a prescrição do histórico. |
| setPatientAllergy | true | Permite que o prescritor registre alergias conhecidas do paciente. |
| autocompleteManipulated | true | Permite que o prescritor visualize a lista de "Fórmulas". |
| autocompleteCompositions | true | Permite que o prescritor visualize a lista de "Nomes Genéricos". |
| autocompletePheripherals | true | Permite que o prescritor visualize a lista de produtos periféricos ("Outros"). |
| copyMedicalRecords | true | Permite que o prescritor copie os dados do receituário para o clipboard. |
| buttonClose | true | Permite que o prescritor visualize o botão de fechar o módulo. |
| newFormula | true | Permite que o prescritor adicione novas fórmulas. |
| allowShareModal | true | Permite que o prescritor seja capaz de compartilhar o link da prescrição via WhatsApp ou SMS. |
| guidesOnboarding | true | Define se o guia de apresentação do módulo será exibido na primeira vez que o prescritor acessa a plataforma. |
| conclusionModalEdit | true | Permite que o prescritor edite uma prescrição gerada. |
| dropdownSync | true | Permite que o prescritor vincule o usuário gerado via parceiro com o usuário criado na plataforma da Memed. |
| showProtocol | true | Permite que o prescritor visualize o botão de protocolos. |
| showHelpMenu | true | Permite que o prescritor visualize o botão de ajuda. |
| editIdentification | true | Controla se é permitido editar os dados já preenchidos nos campos da tela de identificação de prescritor e paciente no fluxo de prescrição. |
| addPrescriptionDrug | true | Permite que o prescritor utilize o botão de adicionar medicamentos. |
| removePrescriptionDrug | true | Permite que o prescritor utilize o botão de excluir medicamentos. |
| editPrescriptionDrugTitle | true | Permite ao prescritor a edição do nome do medicamento quando este for texto livre. |
| editPosology | true | Permite ao prescritor a edição da posologia do medicamento. |
| editQuantity | true | Permite ao prescritor a edição da quantidade do medicamento. |
| enableAlerts | true | Permite ao prescritor o aparecimento das mensagens de alertas sobre alergias e de condições. |

**Exemplos**

Ativar/desativar várias ou apenas uma funcionalidade:
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    historyPrescription: true,
    removePrescription: false,
    deletePatient: true,
    deletePatient:false,
    removePrescription: false
});
```

**deletePatient** — permite que o prescritor exclua o paciente da base de dados (imagem: `excluir-paciente.webp`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    deletePatient: true
});
```

**removePatient** — permite que o prescritor remova o paciente da prescrição (imagem: `remove-patient.webp`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    removePatient: true
});
```

**editPatient**:
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    editPatient: true
});
```

**setAllowedSignatureProviders** — lista de provedores de assinatura digital disponíveis para o prescritor:

| Nome do provedor | Valor |
|---|---|
| Certisign | 'certisign' |
| Evaltec | 'evaltec' |
| Lacuna | 'lacuna' |
| Soluti | 'soluti' |
| Dinamo | 'dinamo' |
| Vidaas | 'vidaas' |
| Safeid | 'safeid' |

Exemplo habilitando os provedores `certisign` e `vidaas`:
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    setAllowedSignatureProviders: ['certisign', 'vidaas']
});
```

> O valor padrão dessa propriedade é `false`. Para habilitar a lista de provedores de assinatura digital, é necessário enviar um array com os valores desejados.

**forceSign** — só permite seguir o fluxo de prescrição após autenticação com o provedor de assinatura digital do prescritor:
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    forceSign: true
});
```

**historyPrescription** — permite visualizar o histórico de prescrições geradas para o paciente (imagem: `history-prescription.webp`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    historyPrescription: true
});
```
> Se já existir um local habitual para armazenar o histórico de prescrições dentro do prontuário, é possível desabilitar essa opção na Memed, para que o prescritor continue a consultar o histórico em um local centralizado. Essa funcionalidade é utilizada por prescritores que usam a plataforma Stand Alone (fora do prontuário). É importante desativá-la em integrações, pois não tem função nesse contexto.

**optionsPrescription** — permite acessar e editar as opções do receituário (imagens: `options-prescription.webp`, `options-prescription-screen.webp`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    optionsPrescription: true
});
```
> Se a impressão for pré-definida e configurada via API, é possível desativar essa função para que os prescritores não possam editar as configurações.

**removePrescription** — permite remover uma prescrição do histórico do paciente (imagem: `remove-prescription.webp`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    removePrescription: true
});
```

**setPatientAllergy** — permite adicionar alergias conhecidas ao paciente (imagens: `set-patient-allergy.webp`, `set-patient-allergy-screen.webp`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    setPatientAllergy: true
});
```

**autocompleteManipulated** — permite visualizar a lista de "Fórmulas" (imagem: `autocomplete-manipulated.png`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    autocompleteManipulated: true
});
```

**autocompleteCompositions** — permite visualizar a lista de "Nomes Genéricos" (imagem: `autocomplete-compositions.webp`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    autocompleteCompositions: true
});
```

**autocompletePeripherals** — permite visualizar a lista de produtos periféricos ("Outros") (imagem: `autocomplete-peripherals.webp`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    autocompletePeripherals: true
});
```

**copyMedicalRecords** — permite copiar os dados da prescrição para a área de transferência (clipboard) (imagem: `copy-medical-records.webp`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    copyMedicalRecords: true
});
```

**buttonClose** — permite fechar o módulo da Memed (imagem: `button-close.png`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    buttonClose: true
});
```
> Se por algum motivo não for permitido que o prescritor feche a prescrição uma vez aberta, é possível desabilitar o botão.

**newFormula** — permite adicionar uma nova fórmula (imagem: `new-formula.webp`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    newFormula: true
});
```

**allowShareModal** — permite compartilhar o link da prescrição via WhatsApp e SMS (imagem: `allow-share-modal.png`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    allowShareModal: true
});
```

**guidesOnboarding** — controla se a guia de primeiro acesso será exibida na primeira vez que o prescritor acessa o módulo (imagem: `guides-onboarding.webp`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    guidesOnboarding: true
});
```

**conclusionModalEdit** — permite editar uma receita após sua emissão (imagem: `conclusion-modal-edit.png`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    conclusionModalEdit: true
});
```

**dropdownSync** — permite vincular a conta criada através do parceiro com a conta standalone (imagem: `dropdown-sync.webp`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    dropdownSync: true
});
```

**showProtocol** — permite visualizar os protocolos (imagem: `show-protocol.webp`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    showProtocol: true
});
```

**showHelpMenu** — permite visualizar o menu de ajuda (imagem: `show-help-menu.webp`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    showHelpMenu: true
});
```

**editIdentification** — controla se é permitido editar os dados já preenchidos nos campos da tela de identificação de prescritor e paciente no fluxo de prescrição (imagem: `edit-identification.webp`):
```js
await MdHub.command.send("plataforma.prescricao", "setFeatureToggle" {
    editIdentification: true
});
```
> **Valor padrão:** `true` — permite a edição dos campos já preenchidos.

---

### 12.6 setAdditionalData

*Fonte: `lifeline_memed_5_Adicionar-dados.md`*

Com o comando `setAdditionalData` é possível adicionar informações extras no cabeçalho e rodapé.

```js
await MdHub.command.send("plataforma.prescricao", "setAdditionalData", {
  propriedade: "valor",
});
```

Cada item do array do atributo `header` se transforma em 1 linha no cabeçalho da prescrição:

```js
await MdHub.command.send("plataforma.prescricao", "setAdditionalData", {
  header: [
    {
      Registro: "2911116",
    },
    {
      Sexo: "Masculino",
      "Estado Civil": "Solteiro",
      "Data de Nasc": "17/09/1991",
    },
    {
      Endereço: "Rua  Arthur prado, 513",
    },
    {
      Profissional: "Dra. Emilia Reis(CRM: 123456SP)",
    },
  ],
  footer:
    "Informações adicionais na primeira linhad do rodapé \n Segunda linha do rodapé",
});
```

---

### 12.7 addItem

*Fonte: `lifeline_memed_5_Adicionar-item-a-Prescrição.md`*

Com o comando `addItem` é possível manipular os itens da prescrição digital.

**Estrutura do comando:**
```js
nome_do_modulo = "plataforma.prescricao";
nome_do_comando = "addItem";
parametro = { propriedade: valor };
```

**Sintaxe do comando:**
```js
await MdHub.command.send("plataforma.prescricao", "addItem", {
  propriedade: "valor",
});
```

**Propriedades do comando Add Item:**

| Propriedade | Valor padrão | Obrigatório/Opcional | Descrição |
|---|---|---|---|
| id | null | opcional | ID do medicamento na Memed (quando não informado, se transforma em texto livre) |
| nome | null | opcional | Nome do medicamento (utilizado em caso de texto livre). |
| posologia | null | opcional | Posologia/descrição do uso. |
| quantidade | null | opcional | Quantidade do medicamento a ser adicionado (padrão é 1); informe quantidade 0 para uso contínuo |
| unit | null | opcional | Valores válidos para o campo unit (ver documentação Memed) |
| fabricante | null | opcional | Forma física relacionada à quantidade (opcional, valor padrão é 'embalagem') |
| titularidade | null | opcional | Titularidade do medicamento |
| preco | null | opcional | Preço do medicamento |
| descricao | null | opcional | Descrição do medicamento |

**Medicamento com ID:**
```js
await MdHub.command.send("plataforma.prescricao", "addItem", {
  id: "a123123123",
  posologia: "<p>HTML da posologia</p>",
  quantidade: 2,
  unit: "embalagens",
});
```

**Fórmulas com ID:**
```js
await MdHub.command.send("plataforma.prescricao", "addItem", {
  id: "f123123123",
  posologia: "<p>HTML da posologia</p>",
  quantidade: 2,
  unit: "embalagens",
});
```

**Exame com ID:**
```js
await MdHub.command.send("plataforma.prescricao", "addItem", {
  id: "e123123123",
  indicacoes: "<p>HTML da indicação</p>",
});
```

**Texto Livre:**
```js
await MdHub.command.send("plataforma.prescricao", "addItem", {
  nome: "Vitamina C, comprimido (100un)",
  posologia: "<p>HTML da posologia</p>",
  quantidade: 1,
  fabricante: "Nome do fabricante",
  titularidade: "Similar",
  preco: 1.99,
  descricao: "Ácido Ascórbico",
});
```

---

### 12.8 setDictionary

*Fonte: `lifeline_memed_5_Definir-o-nome-do-modulo.md`*

Com o comando `setDictionary` é possível customizar alguns textos da prescrição digital. O botão "Protocolos" pode ser personalizado com o nome desejado pelo parceiro (ex: "Modelos de Receita").

**Estrutura do comando:**
```js
nome_do_modulo = "plataforma.prescricao";
nome_do_comando = "setDictionary";
parametro = { propriedade: valor };
```

**Sintaxe do comando:**
```js
await MdHub.command.send("plataforma.prescricao", "setDictionary", {
  propriedade: "valor",
});
```

**Propriedades de dicionário modificáveis:**

| Propriedade | Tipo | Obrigatório/Opcional | Valor Padrão |
|---|---|---|---|
| protocolPlural | string(255) | opcional | 'Protocolos' |
| protocolSingular | string(255) | opcional | 'Protocolo' |
| protocolSaved | string(255) | opcional | 'Protocolo salvo com sucesso!' |

**Exemplo:**
```js
await MdSinapsePrescricao.command.send("hub", "core:setDictionary", {
  protocolPlural: "Padrões de receitas",
  protocolSingular: "Padrão de receita",
  protocolSaved: "Modelo de Receita salvo!",
});
```

Navegação original: Anterior → [Configurar local físico de trabalho do prescritor (setWorkplace)](https://doc.memed.com.br/docs/frontend/comandos-mdhub/set-workplace) | Próxima → [Adicionar item a Prescrição (addItem)](https://doc.memed.com.br/docs/frontend/comandos-mdhub/add-item)

---

### 12.9 Opções de Receituário (find)

*Fonte: `lifeline_memed_5_Opções-de-Receituario.md`*

Com o comando `find` é possível ativar um dos quatro temas configurados nas opções de receituário.

```js
await MdHub.command.send("plataforma.sdk", "find", {
  resource: "opcoes-receituario/ativar/2",
  cache: false,
});
```

---

### 12.10 Nova Prescrição (newPrescription)

*Fonte: `lifeline_memed_5_Nova-Prescrição.md`*

Com o comando `newPrescription` é possível ter a mesma ação do botão "Nova Prescrição" da plataforma da Memed.

**Estrutura do comando:**
```js
nome_do_modulo = "plataforma.prescricao";
nome_do_comando = "newPrescription";
```

**Sintaxe do comando:**
```js
await MdHub.command.send("plataforma.prescricao", "newPrescription");
```

**Exemplo:**
```js
await MdHub.command.send("plataforma.prescricao", "newPrescription");
```

Navegação original: Anterior → [Reimpressão e edição de uma prescrição (viewPrescription)](https://doc.memed.com.br/docs/frontend/comandos-mdhub/view-prescription) | Próxima → [Definir alertas de condição (categoriesConditions)](https://doc.memed.com.br/docs/frontend/comandos-mdhub/categories-condition)

---

### 12.11 Reimpressão e edição (viewPrescription)

*Fonte: `lifeline_memed_5_Reimpressão-e-edição-de-uma.md`*

Com o comando `viewPrescription` é possível implementar a reimpressão e edição de uma prescrição já gerada.

```js
await MdHub.command.send(
  "plataforma.prescricao",
  "viewPrescription",
  "ID_DA_PRESCRICAO"
);
```

---

### 12.12 Esconder o módulo (hide)

*Fonte: `lifeline_memed_5_Esconder-o-módulo.md`*

A Memed disponibiliza um comando via MdHub para fechar um módulo. A sintaxe do comando é:

```js
MdHub.module.hide('nome_do_modulo');
```

Exemplo comum de uso — fechar o módulo da plataforma prescrição:

```js
MdHub.module.hide('plataforma.prescricao');
```

> A Memed também disponibiliza uma forma de capturar o evento de quando um módulo é encerrado (fechado). Ver [artigo sobre o assunto](https://doc.memed.com.br/docs/frontend/mdsinapseprescricao-mdhub#quando-o-m%C3%B3dulo-%C3%A9-encerrado).

---

### 12.13 Sair do sistema (logout)

*Fonte: `lifeline_memed_5_Sair-do-sistema.md`*

A limpeza do local storage do navegador é necessária quando prescritores compartilham a mesma máquina (notebook/PC). Ela deve ser implementada **OBRIGATORIAMENTE** para evitar conflitos de informações entre os cadastros e, consequentemente, falhas de segurança. Com o comando `logout` é possível executar essa limpeza.

```js
await MdHub.command.send("plataforma.sdk", "logout");
```

---

## Notas de consolidação

- Fontes: 24 arquivos `.md` da pasta `C:\Users\danip\Documents\Lifeline\lilife_memed`.
- **Não incluídos neste consolidado** (não são `.md`, são imagens de apoio referenciadas nos textos acima): `lifeline_memed_1_integracao_exemplo_page_0.png`, `lifeline_memed_1_simplified-integration-flux.png`, `lifeline_memed_2_especialidade_ty-example.png`.
- A pasta continha 24 arquivos `.md` no momento da consolidação (não 27, como mencionado na solicitação) — se houver mais 3 arquivos em outro local, envie-os para inclusão.
