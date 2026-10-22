/**
 * Controle de Destinação Retec — API da planilha
 * ------------------------------------------------
 * Cole este arquivo em Extensões > Apps Script da planilha "Controle de Destinação".
 * Depois rode a função configurar() uma vez e publique como App da Web
 * (passo a passo no README do repositório).
 *
 * Abas usadas (criadas por configurar() se não existirem):
 *   Lancamentos  – um registro por MTR/viagem
 *   Destinadores – cadastro (tipo: custo ou receita)
 *   Precos       – tabela de preço por destinador × resíduo (R$/kg)
 *   Locacao      – veículos alugados, um bloco de linhas por mês
 *   Log          – histórico de alterações feitas pelo app
 */

const ABAS = {
  Lancamentos: ['id', 'data', 'mes', 'mtr', 'ticket', 'destinador', 'gerador', 'origem', 'residuo',
                'transportadora', 'placa', 'kg', 'preco', 'valorFixo', 'valor', 'obs', 'atualizadoEm', 'atualizadoPor'],
  Destinadores: ['id', 'nome', 'tipo', 'ativo'],
  Precos: ['destinador', 'residuo', 'preco'],
  Locacao: ['mes', 'tipo', 'placa', 'fornecedor', 'valor'],
  Log: ['quando', 'acao', 'registro', 'por', 'detalhe']
};
// colunas que precisam ficar como texto (evita o Sheets virar número/científico)
const COLUNAS_TEXTO = {
  Lancamentos: ['id', 'mes', 'mtr', 'ticket', 'placa'],
  Destinadores: ['id'],
  Precos: ['destinador'],
  Locacao: ['mes', 'placa']
};
const MESES_JANELA = 6; // mês pedido + 5 anteriores (gráfico de tendência)

/* ======================= MENU NA PLANILHA ======================= */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Controle de Destinação')
    .addItem('Mostrar chaves de acesso', 'mostrarChaves')
    .addItem('Gerar novas chaves (desconecta todos)', 'gerarNovasChaves')
    .addSeparator()
    .addItem('Configurar/verificar abas', 'configurar')
    .addToUi();
}

/** Cria as abas e cabeçalhos que faltarem e gera as chaves de acesso. Pode rodar quantas vezes quiser. */
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
      const col = cab.indexOf(c) + 1;
      sh.getRange(2, col, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    });
    if (nome === 'Lancamentos') {
      sh.getRange(2, cab.indexOf('data') + 1, sh.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy');
      ['kg'].forEach(function (c) { sh.getRange(2, cab.indexOf(c) + 1, sh.getMaxRows() - 1, 1).setNumberFormat('#,##0.##'); });
      ['preco'].forEach(function (c) { sh.getRange(2, cab.indexOf(c) + 1, sh.getMaxRows() - 1, 1).setNumberFormat('0.000'); });
      ['valor', 'valorFixo'].forEach(function (c) { sh.getRange(2, cab.indexOf(c) + 1, sh.getMaxRows() - 1, 1).setNumberFormat('"R$" #,##0.00'); });
    }
  });
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CHAVE_EDICAO')) props.setProperty('CHAVE_EDICAO', novaChave_('ed'));
  if (!props.getProperty('CHAVE_LEITURA')) props.setProperty('CHAVE_LEITURA', novaChave_('le'));
  Logger.log('Chave de EDIÇÃO: ' + props.getProperty('CHAVE_EDICAO'));
  Logger.log('Chave de LEITURA: ' + props.getProperty('CHAVE_LEITURA'));
  try { mostrarChaves(); } catch (e) { /* rodando pelo editor: veja o Registro de execução */ }
}

function mostrarChaves() {
  const p = PropertiesService.getScriptProperties();
  SpreadsheetApp.getUi().alert('Chaves de acesso do app',
    'EDIÇÃO (quem lança e altera):\n' + p.getProperty('CHAVE_EDICAO') +
    '\n\nLEITURA (quem só acompanha):\n' + p.getProperty('CHAVE_LEITURA') +
    '\n\nPasse a chave certa para cada pessoa. Ela digita uma vez no app e o aparelho lembra.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function gerarNovasChaves() {
  const p = PropertiesService.getScriptProperties();
  p.setProperty('CHAVE_EDICAO', novaChave_('ed'));
  p.setProperty('CHAVE_LEITURA', novaChave_('le'));
  mostrarChaves();
}

function novaChave_(pref) {
  return pref + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

/* ======================= API ======================= */
function doGet(e) {
  try {
    const p = e.parameter || {};
    const nivel = nivel_(p.key);
    if (!nivel) return json_({ ok: false, erro: 'chave_invalida' });
    if ((p.acao || 'dados') === 'dados') return json_(dados_(p.mes, nivel));
    return json_({ ok: false, erro: 'acao_desconhecida' });
  } catch (err) {
    return json_({ ok: false, erro: 'interno', mensagem: String(err && err.message || err) });
  }
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, erro: 'corpo_invalido' }); }
  const nivel = nivel_(body.key);
  if (!nivel) return json_({ ok: false, erro: 'chave_invalida' });
  if (nivel !== 'edicao') return json_({ ok: false, erro: 'sem_permissao', mensagem: 'Sua chave é só de leitura.' });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, erro: 'ocupado', mensagem: 'Planilha ocupada. Tente de novo em alguns segundos.' });
  try {
    switch (body.acao) {
      case 'salvarLancamento': return json_(salvarLancamento_(body.lanc));
      case 'excluirLancamento': return json_(excluirLancamento_(body.id));
      case 'salvarLocacao': return json_(salvarLocacao_(body.mes, body.veiculos || []));
      case 'salvarDestinador': return json_(salvarDestinador_(body.dest));
      default: return json_({ ok: false, erro: 'acao_desconhecida' });
    }
  } catch (err) {
    return json_({ ok: false, erro: 'interno', mensagem: 'Erro na planilha: ' + String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function nivel_(key) {
  if (!key) return null;
  const p = PropertiesService.getScriptProperties();
  if (key === p.getProperty('CHAVE_EDICAO')) return 'edicao';
  if (key === p.getProperty('CHAVE_LEITURA')) return 'leitura';
  return null;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ======================= LEITURA ======================= */
function dados_(mes, nivel) {
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

  return { ok: true, nivel: nivel, mes: mes, ultimoMes: ultimo, destinadores: destinadores,
           lancamentos: lanc.filter(function (l) { return janela.indexOf(l.mes) >= 0; }), locacao: locacao };
}

function normLanc_(r) {
  const data = dataTexto_(r.data);
  const kg = r.kg === '' || r.kg === null ? null : num_(r.kg);
  const preco = num_(r.preco);
  const fixo = r.valorFixo === '' || r.valorFixo === null ? null : num_(r.valorFixo);
  let valor = r.valor === '' || r.valor === null ? null : num_(r.valor);
  if (valor === null) valor = fixo !== null ? fixo : Math.round((kg || 0) * preco * 100) / 100; // linha digitada direto na planilha
  const o = { id: String(r.id || '').trim(), data: data, mes: mesTexto_(r.mes) || data.slice(0, 7),
    mtr: String(r.mtr || '').trim(), ticket: String(r.ticket || '').trim(), destinador: String(r.destinador || '').trim(),
    gerador: String(r.gerador || ''), origem: String(r.origem || ''), residuo: String(r.residuo || '').toUpperCase(),
    transportadora: String(r.transportadora || ''), placa: String(r.placa || '').toUpperCase(),
    kg: kg, preco: preco, valor: valor, obs: String(r.obs || '') };
  if (fixo !== null) o.valorFixo = fixo;
  return o;
}

/* ======================= ESCRITA ======================= */
function salvarLancamento_(l) {
  if (!l || !l.id) return { ok: false, erro: 'dados_invalidos', mensagem: 'Lançamento sem identificador.' };
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
  log_(idx > 0 ? 'alterou lançamento' : 'novo lançamento', l.id, l.atualizadoPor, (l.mtr || 's/ MTR') + ' · ' + l.destinador + ' · ' + (l.kg || 0) + ' kg · R$ ' + l.valor);
  return { ok: true };
}

function excluirLancamento_(id) {
  const sh = aba_('Lancamentos'); const idx = acharLinha_(sh, id);
  if (idx > 0) {
    const antes = sh.getRange(idx, 1, 1, ABAS.Lancamentos.length).getDisplayValues()[0].join(' | ');
    sh.deleteRow(idx);
    log_('excluiu lançamento', id, '', antes);
  }
  return { ok: true };
}

function salvarLocacao_(mes, veiculos) {
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
  log_('salvou frota', mes, '', novos.length + ' veículos');
  return { ok: true };
}

function salvarDestinador_(d) {
  if (!d || !d.id || !d.nome) return { ok: false, erro: 'dados_invalidos', mensagem: 'Destinador sem nome.' };
  const sh = aba_('Destinadores'); const idx = acharLinha_(sh, d.id);
  const linha = [d.id, d.nome, d.tipo === 'receita' ? 'receita' : 'custo', d.ativo !== false];
  if (idx > 0) sh.getRange(idx, 1, 1, 4).setValues([linha]); else sh.appendRow(linha);
  // regrava os preços deste destinador
  const ps = aba_('Precos'); const n = ps.getLastRow();
  const resto = n > 1 ? ps.getRange(2, 1, n - 1, 3).getValues().filter(function (r) { return String(r[0]).trim() !== d.id && r.join('') !== ''; }) : [];
  const novos = Object.keys(d.precos || {}).map(function (res) { return [d.id, res, num_(d.precos[res])]; });
  const todas = resto.concat(novos);
  if (n > 1) ps.getRange(2, 1, n - 1, 3).clearContent();
  if (todas.length) ps.getRange(2, 1, todas.length, 3).setValues(todas);
  log_('salvou destinador', d.id, '', d.nome + ' · ' + novos.length + ' preço(s)');
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
  const t = s.indexOf(',') >= 0 ? s.replace(/\./g, '').replace(',', '.') : s; // aceita 1.234,56 e 1234.56
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
