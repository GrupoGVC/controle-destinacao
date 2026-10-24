/**
 * Controle de Destinação Retec — API da planilha
 * ------------------------------------------------
 * Cole este arquivo em Extensões > Apps Script da planilha "Controle de Destinação".
 * Depois rode a função configurar() uma vez e publique como Aplicação Web
 * (passo a passo no README do repositório).
 *
 * Abas usadas (criadas por configurar() se não existirem):
 *   Lancamentos  – um registro por MTR/viagem
 *   Destinadores – cadastro (tipo: custo ou receita)
 *   Precos       – tabela de preço por destinador × resíduo (R$/kg)
 *   Locacao      – veículos alugados, um bloco de linhas por mês
 *   Usuarios     – quem pode entrar no app e com qual alçada (leitor, editor, admin)
 *   Log          – histórico de alterações e acessos
 *
 * ACESSO: cada pessoa entra com o e-mail da empresa e uma senha que ela mesma cadastra.
 * Só entra quem estiver na aba Usuarios com ativo = SIM. No primeiro acesso (ou ao esquecer a senha)
 * o app envia um código de 6 dígitos para o e-mail, o que prova que a pessoa é dona do endereço.
 */

/* ======================= AJUSTE AQUI ======================= */
// Domínios de e-mail aceitos. Deixe [] para aceitar qualquer domínio (a aba Usuarios continua valendo).
const DOMINIOS_PERMITIDOS = []; // ex.: ['retec.com.br', 'grupogvc.com.br']
const DIAS_SESSAO = 30;          // quanto tempo o aparelho fica conectado sem pedir senha de novo
/* =========================================================== */

const ABAS = {
  Lancamentos: ['id', 'data', 'mes', 'mtr', 'ticket', 'destinador', 'gerador', 'origem', 'residuo',
                'transportadora', 'placa', 'kg', 'preco', 'valorFixo', 'valor', 'obs', 'atualizadoEm', 'atualizadoPor'],
  Destinadores: ['id', 'nome', 'tipo', 'ativo'],
  Precos: ['destinador', 'residuo', 'preco'],
  Locacao: ['mes', 'tipo', 'placa', 'fornecedor', 'valor'],
  Usuarios: ['email', 'nome', 'nivel', 'ativo', 'senhaHash', 'salt', 'criadoEm', 'ultimoAcesso'],
  Log: ['quando', 'acao', 'registro', 'por', 'detalhe']
};
const COLUNAS_TEXTO = {
  Lancamentos: ['id', 'mes', 'mtr', 'ticket', 'placa'],
  Destinadores: ['id'],
  Precos: ['destinador'],
  Locacao: ['mes', 'placa'],
  Usuarios: ['email', 'senhaHash', 'salt']
};
const NIVEIS = ['leitor', 'editor', 'admin'];
const MESES_JANELA = 6;

/* ======================= MENU NA PLANILHA ======================= */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Controle de Destinação')
    .addItem('Configurar/verificar abas', 'configurar')
    .addItem('Como cadastrar usuários', 'ajudaUsuarios')
    .addItem('Desconectar todos os aparelhos', 'encerrarTodasSessoes')
    .addToUi();
}

/** Cria abas e cabeçalhos que faltarem, coloca você como administrador e autoriza o envio de e-mail. */
function configurar() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(ABAS).forEach(function (nome) {
    let sh = ss.getSheetByName(nome);
    if (!sh) sh = ss.insertSheet(nome);
    const cab = ABAS[nome];
    const atual = sh.getRange(1, 1, 1, cab.length).getValues()[0];
    if (atual.join('|') !== cab.join('|')) sh.getRange(1, 1, 1, cab.length).setValues([cab]);
    sh.getRange(1, 1, 1, cab.length).setFontWeight('bold').setBackground('#dcefe6');
    sh.setFrozenRows(1);
    (COLUNAS_TEXTO[nome] || []).forEach(function (c) {
      sh.getRange(2, cab.indexOf(c) + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    });
    if (nome === 'Lancamentos') {
      sh.getRange(2, cab.indexOf('data') + 1, sh.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy');
      sh.getRange(2, cab.indexOf('kg') + 1, sh.getMaxRows() - 1, 1).setNumberFormat('#,##0.##');
      sh.getRange(2, cab.indexOf('preco') + 1, sh.getMaxRows() - 1, 1).setNumberFormat('0.000');
      ['valor', 'valorFixo'].forEach(function (c) { sh.getRange(2, cab.indexOf(c) + 1, sh.getMaxRows() - 1, 1).setNumberFormat('"R$" #,##0.00'); });
    }
    if (nome === 'Usuarios') {
      const regra = SpreadsheetApp.newDataValidation().requireValueInList(NIVEIS, true).build();
      sh.getRange(2, cab.indexOf('nivel') + 1, sh.getMaxRows() - 1, 1).setDataValidation(regra);
      const regraAtivo = SpreadsheetApp.newDataValidation().requireValueInList(['SIM', 'NÃO'], true).build();
      sh.getRange(2, cab.indexOf('ativo') + 1, sh.getMaxRows() - 1, 1).setDataValidation(regraAtivo);
      sh.hideColumns(cab.indexOf('senhaHash') + 1, 2); // hash e salt ficam ocultos
    }
  });
  // quem roda o configurar vira administrador, se a aba estiver vazia
  const eu = (Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (eu && !acharUsuario_(eu)) aba_('Usuarios').appendRow([eu, eu.split('@')[0], 'admin', 'SIM', '', '', new Date(), '']);
  // pede a permissão de envio de e-mail já agora (usada para o código de primeiro acesso)
  Logger.log('E-mails que ainda podem ser enviados hoje: ' + MailApp.getRemainingDailyQuota());
  Logger.log('Pronto. Administrador: ' + eu + '. Cadastre os demais na aba Usuarios.');
  try { ajudaUsuarios(); } catch (e) { /* rodando pelo editor */ }
}

function ajudaUsuarios() {
  SpreadsheetApp.getUi().alert('Cadastro de usuários',
    'Na aba Usuarios, uma linha por pessoa:\n\n' +
    '• email: o e-mail da empresa\n• nome: como aparece no app e no Log\n' +
    '• nivel: leitor (só vê), editor (lança e altera) ou admin (também cadastra usuários)\n' +
    '• ativo: SIM ou NÃO (NÃO bloqueia na hora)\n\n' +
    'Não preencha senha. No primeiro acesso a pessoa clica em "Primeiro acesso", recebe um código no e-mail e cria a própria senha.\n' +
    'Admins também podem cadastrar pelo próprio app, na aba Usuários.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function encerrarTodasSessoes() {
  const p = PropertiesService.getScriptProperties(); const all = p.getProperties();
  Object.keys(all).forEach(function (k) { if (k.indexOf('S_') === 0) p.deleteProperty(k); });
  try { SpreadsheetApp.getUi().alert('Todos os aparelhos foram desconectados. Cada pessoa vai precisar entrar de novo com a senha.'); } catch (e) {}
}

/* ======================= API ======================= */
function doGet(e) {
  try {
    const p = e.parameter || {};
    const u = sessao_(p.token);
    if (!u) return json_({ ok: false, erro: 'nao_autenticado' });
    if ((p.acao || 'dados') === 'dados') return json_(dados_(p.mes, u));
    return json_({ ok: false, erro: 'acao_desconhecida' });
  } catch (err) {
    return json_({ ok: false, erro: 'interno', mensagem: String(err && err.message || err) });
  }
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, erro: 'corpo_invalido' }); }
  try {
    // ações sem login
    switch (body.acao) {
      case 'login': return json_(login_(body.email, body.senha));
      case 'enviarCodigo': return json_(enviarCodigo_(body.email));
      case 'definirSenha': return json_(definirSenha_(body.email, body.codigo, body.senha));
      case 'sair': if (body.token) PropertiesService.getScriptProperties().deleteProperty('S_' + body.token); return json_({ ok: true });
    }
    const u = sessao_(body.token);
    if (!u) return json_({ ok: false, erro: 'nao_autenticado' });
    const precisaAdmin = ['listarUsuarios', 'salvarUsuario', 'resetarSenha'].indexOf(body.acao) >= 0;
    if (precisaAdmin && u.nivel !== 'admin') return json_({ ok: false, erro: 'sem_permissao', mensagem: 'Só administradores podem gerenciar usuários.' });
    if (!precisaAdmin && u.nivel === 'leitor') return json_({ ok: false, erro: 'sem_permissao', mensagem: 'Seu acesso é só de leitura.' });
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return json_({ ok: false, erro: 'ocupado', mensagem: 'Planilha ocupada. Tente de novo em alguns segundos.' });
    try {
      switch (body.acao) {
        case 'salvarLancamento': return json_(salvarLancamento_(body.lanc, u));
        case 'excluirLancamento': return json_(excluirLancamento_(body.id, u));
        case 'salvarLocacao': return json_(salvarLocacao_(body.mes, body.veiculos || [], u));
        case 'salvarDestinador': return json_(salvarDestinador_(body.dest, u));
        case 'listarUsuarios': return json_(listarUsuarios_());
        case 'salvarUsuario': return json_(salvarUsuario_(body.usuario, u));
        case 'resetarSenha': return json_(resetarSenha_(body.email, u));
        default: return json_({ ok: false, erro: 'acao_desconhecida' });
      }
    } finally { lock.releaseLock(); }
  } catch (err) {
    return json_({ ok: false, erro: 'interno', mensagem: 'Erro na planilha: ' + String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ======================= LOGIN ======================= */
function normEmail_(e) { return String(e || '').trim().toLowerCase(); }
function dominioOk_(email) {
  if (!DOMINIOS_PERMITIDOS.length) return true;
  const d = email.split('@')[1] || '';
  return DOMINIOS_PERMITIDOS.some(function (x) { return d === String(x).toLowerCase(); });
}
function acharUsuario_(email) {
  const sh = aba_('Usuarios'); const n = sh.getLastRow(); if (n < 2) return null;
  const cab = ABAS.Usuarios;
  const vals = sh.getRange(2, 1, n - 1, cab.length).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (normEmail_(vals[i][0]) === email) {
      const o = { linha: i + 2 }; cab.forEach(function (c, j) { o[c] = vals[i][j]; });
      o.email = email; o.nivel = NIVEIS.indexOf(String(o.nivel).toLowerCase()) >= 0 ? String(o.nivel).toLowerCase() : 'leitor';
      o.ativo = ['SIM', 'S', 'TRUE', 'VERDADEIRO', '1'].indexOf(String(o.ativo).trim().toUpperCase()) >= 0 || o.ativo === true;
      o.nome = String(o.nome || email.split('@')[0]);
      return o;
    }
  }
  return null;
}
function hash_(senha, salt) {
  let h = salt + '|' + senha;
  for (let i = 0; i < 300; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt, Utilities.Charset.UTF_8));
  }
  return h;
}
function login_(email, senha) {
  email = normEmail_(email);
  const cache = CacheService.getScriptCache(); const kt = 'T_' + email;
  const tent = Number(cache.get(kt) || 0);
  if (tent >= 5) return { ok: false, erro: 'bloqueado', mensagem: 'Muitas tentativas. Espere 15 minutos ou use "Primeiro acesso ou esqueci a senha".' };
  const u = acharUsuario_(email);
  if (!u || !dominioOk_(email)) return { ok: false, erro: 'nao_cadastrado', mensagem: 'Este e-mail não tem acesso ao app. Fale com o administrador.' };
  if (!u.ativo) return { ok: false, erro: 'inativo', mensagem: 'Seu acesso está desativado. Fale com o administrador.' };
  if (!u.senhaHash) return { ok: false, erro: 'sem_senha', mensagem: 'Você ainda não criou sua senha. Use "Primeiro acesso".' };
  if (hash_(String(senha || ''), String(u.salt)) !== String(u.senhaHash)) {
    cache.put(kt, String(tent + 1), 900);
    return { ok: false, erro: 'senha_incorreta', mensagem: 'Senha incorreta.' + (tent + 1 >= 3 ? ' Restam ' + (5 - tent - 1) + ' tentativa(s).' : '') };
  }
  cache.remove(kt);
  return abrirSessao_(u);
}
function abrirSessao_(u) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const p = PropertiesService.getScriptProperties();
  p.setProperty('S_' + token, JSON.stringify({ email: u.email, exp: Date.now() + DIAS_SESSAO * 864e5 }));
  aba_('Usuarios').getRange(u.linha, ABAS.Usuarios.indexOf('ultimoAcesso') + 1).setValue(new Date());
  limparSessoes_();
  log_('entrou no app', u.email, u.nome, '');
  return { ok: true, token: token, usuario: { email: u.email, nome: u.nome, nivel: u.nivel } };
}
function sessao_(token) {
  if (!token) return null;
  const raw = PropertiesService.getScriptProperties().getProperty('S_' + token);
  if (!raw) return null;
  const s = JSON.parse(raw);
  if (s.exp < Date.now()) { PropertiesService.getScriptProperties().deleteProperty('S_' + token); return null; }
  const u = acharUsuario_(s.email); // alçada e status lidos a cada chamada: mudou na planilha, vale na hora
  if (!u || !u.ativo) return null;
  return u;
}
function limparSessoes_() {
  const p = PropertiesService.getScriptProperties(); const all = p.getProperties(); const agora = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('S_') !== 0) return;
    try { if (JSON.parse(all[k]).exp < agora) p.deleteProperty(k); } catch (e) { p.deleteProperty(k); }
  });
}
function enviarCodigo_(email) {
  email = normEmail_(email);
  const u = acharUsuario_(email);
  if (!u || !dominioOk_(email)) return { ok: false, erro: 'nao_cadastrado', mensagem: 'Este e-mail não tem acesso ao app. Fale com o administrador.' };
  if (!u.ativo) return { ok: false, erro: 'inativo', mensagem: 'Seu acesso está desativado. Fale com o administrador.' };
  const cache = CacheService.getScriptCache();
  if (cache.get('E_' + email)) return { ok: false, erro: 'aguarde', mensagem: 'Um código foi enviado há menos de 1 minuto. Confira sua caixa de entrada e o spam.' };
  const codigo = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('C_' + email, JSON.stringify({ codigo: codigo, tent: 0 }), 900);
  cache.put('E_' + email, '1', 60);
  MailApp.sendEmail({
    to: email,
    subject: 'Código de acesso – Controle de Destinação',
    body: 'Olá, ' + u.nome + '.\n\nSeu código para criar a senha do Controle de Destinação é: ' + codigo +
          '\n\nEle vale por 15 minutos. Se não foi você que pediu, ignore este e-mail.'
  });
  log_('pediu código de senha', email, u.nome, '');
  return { ok: true };
}
function definirSenha_(email, codigo, senha) {
  email = normEmail_(email);
  const cache = CacheService.getScriptCache(); const raw = cache.get('C_' + email);
  if (!raw) return { ok: false, erro: 'codigo_expirado', mensagem: 'Código expirado ou não solicitado. Peça um novo.' };
  const c = JSON.parse(raw);
  if (String(codigo || '').trim() !== c.codigo) {
    c.tent++; if (c.tent >= 5) cache.remove('C_' + email); else cache.put('C_' + email, JSON.stringify(c), 900);
    return { ok: false, erro: 'codigo_incorreto', mensagem: c.tent >= 5 ? 'Código incorreto 5 vezes. Peça um novo.' : 'Código incorreto.' };
  }
  senha = String(senha || '');
  if (senha.length < 8) return { ok: false, erro: 'senha_fraca', mensagem: 'A senha precisa ter pelo menos 8 caracteres.' };
  const u = acharUsuario_(email);
  if (!u || !u.ativo) return { ok: false, erro: 'nao_cadastrado', mensagem: 'Este e-mail não tem acesso ao app.' };
  const salt = Utilities.getUuid();
  const sh = aba_('Usuarios'); const cab = ABAS.Usuarios;
  sh.getRange(u.linha, cab.indexOf('senhaHash') + 1, 1, 2).setValues([[hash_(senha, salt), salt]]);
  cache.remove('C_' + email); cache.remove('T_' + email);
  log_('criou/trocou senha', email, u.nome, '');
  return abrirSessao_(u);
}

/* ======================= USUÁRIOS (admin) ======================= */
function listarUsuarios_() {
  return { ok: true, usuarios: ler_('Usuarios').filter(function (r) { return r.email; }).map(function (r) {
    const u = acharUsuario_(normEmail_(r.email));
    return { email: u.email, nome: u.nome, nivel: u.nivel, ativo: u.ativo, temSenha: !!u.senhaHash,
             ultimoAcesso: r.ultimoAcesso instanceof Date ? Utilities.formatDate(r.ultimoAcesso, tz_(), 'dd/MM/yyyy HH:mm') : '' };
  }) };
}
function salvarUsuario_(x, quem) {
  const email = normEmail_(x && x.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, erro: 'dados_invalidos', mensagem: 'E-mail inválido.' };
  if (!dominioOk_(email)) return { ok: false, erro: 'dados_invalidos', mensagem: 'Só e-mails dos domínios: ' + DOMINIOS_PERMITIDOS.join(', ') };
  const nivel = NIVEIS.indexOf(x.nivel) >= 0 ? x.nivel : 'leitor';
  if (email === quem.email && (nivel !== 'admin' || x.ativo === false)) return { ok: false, erro: 'dados_invalidos', mensagem: 'Você não pode tirar o seu próprio acesso de administrador.' };
  const sh = aba_('Usuarios'); const cab = ABAS.Usuarios; const u = acharUsuario_(email);
  const nome = String(x.nome || email.split('@')[0]).trim(); const ativo = x.ativo === false ? 'NÃO' : 'SIM';
  if (u) sh.getRange(u.linha, 1, 1, 4).setValues([[email, nome, nivel, ativo]]);
  else sh.appendRow([email, nome, nivel, ativo, '', '', new Date(), '']);
  log_(u ? 'alterou usuário' : 'cadastrou usuário', email, quem.nome, nivel + ' · ativo ' + ativo);
  return { ok: true };
}
function resetarSenha_(email, quem) {
  email = normEmail_(email); const u = acharUsuario_(email);
  if (!u) return { ok: false, erro: 'dados_invalidos', mensagem: 'Usuário não encontrado.' };
  aba_('Usuarios').getRange(u.linha, ABAS.Usuarios.indexOf('senhaHash') + 1, 1, 2).setValues([['', '']]);
  const p = PropertiesService.getScriptProperties(); const all = p.getProperties();
  Object.keys(all).forEach(function (k) { if (k.indexOf('S_') === 0 && all[k].indexOf('"' + email + '"') >= 0) p.deleteProperty(k); });
  log_('apagou senha', email, quem.nome, 'usuário vai criar nova senha no próximo acesso');
  return { ok: true };
}

/* ======================= LEITURA ======================= */
function dados_(mes, u) {
  const lanc = ler_('Lancamentos').map(normLanc_).filter(function (l) { return l.id; });
  let ultimo = '';
  lanc.forEach(function (l) { if (l.mes > ultimo) ultimo = l.mes; });
  if (!/^\d{4}-\d{2}$/.test(mes || '')) mes = ultimo || Utilities.formatDate(new Date(), tz_(), 'yyyy-MM');
  const janela = [];
  for (let i = 0; i < MESES_JANELA; i++) janela.push(addMes_(mes, -i));

  const precos = {};
  ler_('Precos').forEach(function (r) {
    const d = String(r.destinador || '').trim(); const res = String(r.residuo || '').trim().toUpperCase();
    if (!d || !res || r.preco === '') return;
    (precos[d] = precos[d] || {})[res] = num_(r.preco);
  });
  const destinadores = ler_('Destinadores').filter(function (r) { return r.id; }).map(function (r) {
    const id = String(r.id).trim();
    return { id: id, nome: String(r.nome || id), tipo: String(r.tipo).toLowerCase() === 'receita' ? 'receita' : 'custo',
             ativo: r.ativo !== false && String(r.ativo).toUpperCase() !== 'FALSE', precos: precos[id] || {} };
  });

  const locacao = {};
  ler_('Locacao').forEach(function (r) {
    const m = mesTexto_(r.mes); if (janela.indexOf(m) < 0 || !r.placa) return;
    (locacao[m] = locacao[m] || []).push({ tipo: String(r.tipo || ''), placa: String(r.placa).trim().toUpperCase(),
      fornecedor: String(r.fornecedor || ''), valor: num_(r.valor) });
  });

  return { ok: true, usuario: { email: u.email, nome: u.nome, nivel: u.nivel }, mes: mes, ultimoMes: ultimo,
           destinadores: destinadores, lancamentos: lanc.filter(function (l) { return janela.indexOf(l.mes) >= 0; }), locacao: locacao };
}

function normLanc_(r) {
  const data = dataTexto_(r.data);
  const kg = r.kg === '' || r.kg === null ? null : num_(r.kg);
  const preco = num_(r.preco);
  const fixo = r.valorFixo === '' || r.valorFixo === null ? null : num_(r.valorFixo);
  let valor = r.valor === '' || r.valor === null ? null : num_(r.valor);
  if (valor === null) valor = fixo !== null ? fixo : Math.round((kg || 0) * preco * 100) / 100;
  const o = { id: String(r.id || '').trim(), data: data, mes: mesTexto_(r.mes) || data.slice(0, 7),
    mtr: String(r.mtr || '').trim(), ticket: String(r.ticket || '').trim(), destinador: String(r.destinador || '').trim(),
    gerador: String(r.gerador || ''), origem: String(r.origem || ''), residuo: String(r.residuo || '').toUpperCase(),
    transportadora: String(r.transportadora || ''), placa: String(r.placa || '').toUpperCase(),
    kg: kg, preco: preco, valor: valor, obs: String(r.obs || ''), atualizadoPor: String(r.atualizadoPor || '') };
  if (fixo !== null) o.valorFixo = fixo;
  return o;
}

/* ======================= ESCRITA ======================= */
function salvarLancamento_(l, u) {
  if (!l || !l.id) return { ok: false, erro: 'dados_invalidos', mensagem: 'Lançamento sem identificador.' };
  l.atualizadoPor = u.nome;
  const sh = aba_('Lancamentos'); const cab = ABAS.Lancamentos;
  const linha = cab.map(function (c) {
    if (c === 'data') return l.data ? paraData_(l.data) : '';
    if (c === 'atualizadoEm') return new Date();
    const v = l[c];
    return v === undefined || v === null ? '' : v;
  });
  const idx = acharLinha_(sh, l.id);
  if (idx > 0) sh.getRange(idx, 1, 1, cab.length).setValues([linha]);
  else sh.appendRow(linha);
  log_(idx > 0 ? 'alterou lançamento' : 'novo lançamento', l.id, u.nome, (l.mtr || 's/ MTR') + ' · ' + l.destinador + ' · ' + (l.kg || 0) + ' kg · R$ ' + l.valor);
  return { ok: true };
}

function excluirLancamento_(id, u) {
  const sh = aba_('Lancamentos'); const idx = acharLinha_(sh, id);
  if (idx > 0) {
    const antes = sh.getRange(idx, 1, 1, ABAS.Lancamentos.length).getDisplayValues()[0].join(' | ');
    sh.deleteRow(idx);
    log_('excluiu lançamento', id, u.nome, antes);
  }
  return { ok: true };
}

function salvarLocacao_(mes, veiculos, u) {
  if (!/^\d{4}-\d{2}$/.test(mes || '')) return { ok: false, erro: 'dados_invalidos', mensagem: 'Mês inválido.' };
  const sh = aba_('Locacao'); const cab = ABAS.Locacao;
  const n = sh.getLastRow();
  const resto = n > 1 ? sh.getRange(2, 1, n - 1, cab.length).getValues().filter(function (r) { return mesTexto_(r[0]) !== mes && r.join('') !== ''; }) : [];
  const novos = veiculos.filter(function (v) { return v.placa; }).map(function (v) {
    return [mes, v.tipo || '', String(v.placa).toUpperCase(), v.fornecedor || '', num_(v.valor)];
  });
  const todas = resto.concat(novos).sort(function (a, b) { return String(mesTexto_(a[0])).localeCompare(String(mesTexto_(b[0]))); });
  if (n > 1) sh.getRange(2, 1, n - 1, cab.length).clearContent();
  if (todas.length) sh.getRange(2, 1, todas.length, cab.length).setValues(todas);
  log_('salvou frota', mes, u.nome, novos.length + ' veículos');
  return { ok: true };
}

function salvarDestinador_(d, u) {
  if (!d || !d.id || !d.nome) return { ok: false, erro: 'dados_invalidos', mensagem: 'Destinador sem nome.' };
  const sh = aba_('Destinadores'); const idx = acharLinha_(sh, d.id);
  const linha = [d.id, d.nome, d.tipo === 'receita' ? 'receita' : 'custo', d.ativo !== false];
  if (idx > 0) sh.getRange(idx, 1, 1, 4).setValues([linha]); else sh.appendRow(linha);
  const ps = aba_('Precos'); const n = ps.getLastRow();
  const resto = n > 1 ? ps.getRange(2, 1, n - 1, 3).getValues().filter(function (r) { return String(r[0]).trim() !== d.id && r.join('') !== ''; }) : [];
  const novos = Object.keys(d.precos || {}).map(function (res) { return [d.id, res, num_(d.precos[res])]; });
  const todas = resto.concat(novos);
  if (n > 1) ps.getRange(2, 1, n - 1, 3).clearContent();
  if (todas.length) ps.getRange(2, 1, todas.length, 3).setValues(todas);
  log_('salvou destinador', d.id, u.nome, d.nome + ' · ' + novos.length + ' preço(s)');
  return { ok: true };
}

/* ======================= UTILITÁRIOS ======================= */
function aba_(nome) {
  const sh = SpreadsheetApp.getActive().getSheetByName(nome);
  if (!sh) throw new Error('A aba "' + nome + '" não existe. Rode configurar() no Apps Script.');
  return sh;
}
function ler_(nome) {
  const sh = aba_(nome); const n = sh.getLastRow(); const cab = ABAS[nome];
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, cab.length).getValues().map(function (row) {
    const o = {}; cab.forEach(function (c, i) { o[c] = row[i]; }); return o;
  });
}
function acharLinha_(sh, id) {
  const n = sh.getLastRow(); if (n < 2) return -1;
  const ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === String(id)) return i + 2;
  return -1;
}
function log_(acao, registro, por, detalhe) {
  try { aba_('Log').appendRow([new Date(), acao, registro, por || '', detalhe || '']); } catch (e) { /* log é opcional */ }
}
function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone() || 'America/Bahia'; }
function num_(v) {
  if (typeof v === 'number') return v;
  const s = String(v || '').trim(); if (!s) return 0;
  const t = s.indexOf(',') >= 0 ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(t.replace(/[^\d.\-]/g, '')); return isNaN(n) ? 0 : n;
}
function dataTexto_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}
function mesTexto_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz_(), 'yyyy-MM');
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})/); if (m) return m[1] + '-' + ('0' + m[2]).slice(-2);
  m = s.match(/^(\d{1,2})\/(\d{4})$/); if (m) return m[2] + '-' + ('0' + m[1]).slice(-2);
  return '';
}
function paraData_(iso) { return Utilities.parseDate(iso + ' 12:00', tz_(), 'yyyy-MM-dd HH:mm'); }
function addMes_(m, d) {
  let y = Number(m.slice(0, 4)), mm = Number(m.slice(5, 7)) + d;
  while (mm < 1) { mm += 12; y--; } while (mm > 12) { mm -= 12; y++; }
  return y + '-' + ('0' + mm).slice(-2);
}
