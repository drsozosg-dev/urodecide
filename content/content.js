// Metadados do pacote de conteúdo (regras, doses, tabelas, calculadoras). Incrementar a versão a cada atualização de conteúdo.
const CONTENT_META = { version: '2026.11.5', date: '05/11/2026', notas: 'Revisão final pré-loja: CCI (Clavien) com pesos publicados; IPFSG conforme Lorch 2010; falha ao BCG aos 3 meses; mHSPC separa risco cardiovascular de quedas/cognição; textos PRE-005/006/014/024; CRPC sem valores fictícios.' };

/* Motor de regras – Apoio à decisão em câncer de próstata
   Versão das regras: 2026.10 (NCCN v5.2026 · EAU 2026 · UICC TNM 9ª ed. · SIOG 2019)
   Toda regra carrega id, força e fonte, conforme a especificação clínica (seções 3–13). */
const Engine = (() => {
  const RULES_VERSION = '2026.11';
  const REVIEW_DATE = '05/11/2026';

  /* ---------- utilidades ---------- */
  const GG_FROM = { '3+3': 1, '3+4': 2, '4+3': 3, '4+4': 4, '3+5': 4, '5+3': 4, '4+5': 5, '5+4': 5, '5+5': 5 };
  const num = (v) => (v === '' || v === null || v === undefined || isNaN(+v)) ? null : +v;
  const inT12 = (cT) => ['T1a', 'T1b', 'T1c', 'T2a', 'T2b', 'T2c'].includes(cT);
  const STRENGTH = {
    forte: { label: 'Forte', orig: '' },
    moderada: { label: 'Moderada', orig: 'NCCN 2A' },
    fraca: { label: 'Fraca', orig: '' },
    controversa: { label: 'Controversa', orig: 'NCCN 3' },
    nao: { label: 'Não recomendado', orig: '' },
    ensaio: { label: 'Só em ensaio/registro', orig: '' },
    alerta: { label: 'Alerta', orig: '' },
    padrao: { label: 'Padrão', orig: '' },
  };

  /* Tábua de mortalidade masculina – APROXIMAÇÃO da IBGE 2023 (esperança de vida à idade exata).
     Substituir pelos valores oficiais antes do lançamento (campo tabua_ibge_ano). */
  const LIFE_TABLE = { 40: 35.7, 45: 31.4, 50: 27.2, 55: 23.2, 60: 19.5, 65: 16.0, 70: 12.9, 75: 10.1, 80: 7.7, 85: 5.8, 90: 4.3, 95: 3.2, 100: 2.5 };
  const TABUA = 'IBGE 2023 (valores aproximados; substituir pela tábua oficial)';
  function baseLifeExp(age) {
    if (age === null) return null;
    const a = Math.max(40, Math.min(100, age));
    const lo = Math.floor(a / 5) * 5, hi = Math.min(100, lo + 5);
    if (lo === hi) return LIFE_TABLE[lo];
    const f = (a - lo) / 5;
    return LIFE_TABLE[lo] + (LIFE_TABLE[hi] - LIFE_TABLE[lo]) * f;
  }

  /* Disponibilidade no Brasil (seção 13) – estado em 31/10/2026 */
  const BR = {
    va:            { sus: 'ok',  ans: 'ok',  nota: '' },
    rp:            { sus: 'ok',  ans: 'ok',  nota: 'Robótica: poucos centros no SUS; cobertura contestada na ANS' },
    rt:            { sus: 'ok',  ans: 'ok',  nota: 'IMRT em centros habilitados; hipofracionamento moderado amplamente viável' },
    braqui:        { sus: 'lim', ans: 'ok',  nota: 'Poucos centros' },
    sbrt:          { sus: 'lim', ans: 'ok',  nota: 'Poucos centros' },
    adt:           { sus: 'ok',  ans: 'ok',  nota: 'Agonistas LHRH e orquiectomia; degarelix não incorporado no SUS' },
    abiraterona:   { sus: 'ok*', ans: 'ok',  nota: 'SUS: mCRPC pré e pós-docetaxel (Portaria SECTICS/MS 33/2024); mHSPC e cN1: confirmar PCDT vigente' },
    enzalutamida:  { sus: 'nao', ans: 'ok',  nota: 'Não incorporada (Portarias 32 e 33/2024)' },
    apalutamida:   { sus: 'nao', ans: 'ok',  nota: 'Não incorporada (Portarias 32 e 33/2024)' },
    darolutamida:  { sus: 'nao', ans: 'ok',  nota: 'Não incorporada (Portarias 32 e 33/2024)' },
    docetaxel:     { sus: 'ok',  ans: 'ok',  nota: '' },
    cabazitaxel:   { sus: 'conf', ans: 'ok', nota: 'Confirmar status CONITEC antes do lançamento' },
    parp:          { sus: 'nao', ans: 'ok*', nota: 'ANS: exige teste HRR/BRCA documentado' },
    niraparibe:    { sus: 'nao', ans: 'ok*', nota: 'ANS: exige BRCA documentado' },
    lu:            { sus: 'nao', ans: 'pleit', nota: 'Fora do rol; cobertura pleiteável; confirmar registro ANVISA e centros' },
    ra223:         { sus: 'nao', ans: 'ok',  nota: 'Poucos serviços de medicina nuclear' },
    psma:          { sus: 'nao', ans: 'pleit', nota: 'Fora da DUT 60 (RN 465/2021); pleiteável pela Lei 14.454/2022 e critérios do STF (ADI 7.265)' },
    conv:          { sus: 'ok',  ans: 'ok',  nota: 'Cintilografia + TC/RM' },
    rm:            { sus: 'lim', ans: 'ok',  nota: 'Centros de referência, com fila' },
    denosumabe:    { sus: 'nao', ans: 'ok',  nota: 'Ácido zoledrônico disponível no SUS' },
    zoledronico:   { sus: 'ok',  ans: 'ok',  nota: '' },
    genomico:      { sus: 'nao', ans: 'nao', nota: 'Envio ao exterior, custo privado' },
    germinativo:   { sus: 'lim', ans: 'ok*', nota: 'Centros de referência; ANS em cenários da DUT' },
    pembro:        { sus: 'nao', ans: 'pleit', nota: 'Teste MSI/dMMR raramente disponível no SUS' },
    rezvilutamida: { sus: 'reg', ans: 'reg', nota: 'Sem registro ANVISA' },
    sipuleucel:    { sus: 'reg', ans: 'reg', nota: 'Sem registro ANVISA' },
    transperineal: { sus: 'lim', ans: 'ok',  nota: 'Disponibilidade limitada; transretal ainda predomina' },
  };
  const BR_LABEL = {
    ok: 'Disponível', 'ok*': 'Disponível com condição', lim: 'Disponibilidade limitada',
    nao: 'Não disponível', conf: 'A confirmar', pleit: 'Cobertura pleiteável', reg: 'Sem registro ANVISA',
  };
  function brTag(keys, contexto) {
    if (!keys || !keys.length) return null;
    const tags = keys.map((k) => {
      const b = BR[k]; if (!b) return null;
      const st = contexto === 'sus' ? b.sus : contexto === 'ans' ? b.ans : (b.sus === 'reg' ? 'reg' : 'ok');
      return { key: k, status: st, label: BR_LABEL[st], nota: b.nota };
    }).filter(Boolean);
    // pior status manda na etiqueta principal
    const order = ['reg', 'nao', 'conf', 'pleit', 'lim', 'ok*', 'ok'];
    tags.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
    return tags;
  }

  /* ---------- derivação (Módulos 2–3) ---------- */
  function derive(p) {
    const d = {};
    d.idade = num(p.idade);
    d.psa = num(p.psa);
    d.volume = num(p.volume);
    d.psad = (d.psa !== null && d.volume) ? +(d.psa / d.volume).toFixed(3) : null;
    d.gleason = p.gleason || null;
    d.gg = d.gleason ? GG_FROM[d.gleason] : (num(p.gg) || null);
    d.prim5 = d.gleason ? d.gleason.startsWith('5') : false;
    d.pos = num(p.frag_pos); d.tot = num(p.frag_tot);
    d.pct = (d.pos !== null && d.tot) ? Math.round(d.pos / d.tot * 100) : null;
    d.maxInv = num(p.max_inv);
    d.fragGG45 = num(p.frag_gg45) ?? 0;
    d.pat4 = num(p.pat4);
    d.crib = p.cribriforme === 'sim';
    d.idc = p.idc === 'sim';
    d.cribNI = p.cribriforme === 'ni' || p.idc === 'ni';
    d.vaExcluida = d.crib || d.idc;
    d.biopsiaTipo = p.biopsia_tipo || 'sist';
    // cT pelo toque
    const t = p.toque || 'normal';
    if (p.biopsia_tipo === 'turp') d.cT = p.turp_pct === '>5' ? 'T1b' : 'T1a';
    else d.cT = t === 'normal' ? 'T1c' : t;
    d.cT12 = inT12(d.cT);
    d.cN = p.cN || 'N0'; d.cM = p.cM || 'M0';
    d.imagem = p.imagem || 'nenhuma';
    d.rmEPE = p.rm_epe === 'sim'; d.rmVS = p.rm_vs === 'sim';
    d.pirads = (p.pirads !== undefined && p.pirads !== null && p.pirads !== '') ? String(p.pirads) : null; d.lesaoMm = num(p.lesao_mm);
    d.variante = p.variante || 'acinar';
    // fatores de risco intermediário NCCN
    d.fri = [];
    if (['T2b', 'T2c'].includes(d.cT)) d.fri.push('cT2b–c');
    if (d.gg === 2 || d.gg === 3) d.fri.push('GG' + d.gg);
    if (d.psa !== null && d.psa >= 10 && d.psa <= 20) d.fri.push('PSA 10–20');
    d.nFri = d.fri.length;
    // fatores de alto risco NCCN
    d.hr = [];
    if (d.cT === 'T3a') d.hr.push('cT3a');
    if (d.gg >= 4) d.hr.push('GG' + d.gg);
    if (d.psa !== null && d.psa > 20) d.hr.push('PSA > 20');
    // STAMPEDE
    d.stampede = [];
    if (['T3a', 'T3b', 'T4'].includes(d.cT)) d.stampede.push('cT3–4');
    if (d.gg >= 4) d.stampede.push('Gleason ≥ 8');
    if (d.psa !== null && d.psa >= 40) d.stampede.push('PSA ≥ 40');
    d.stampede2 = d.stampede.length >= 2;
    return d;
  }

  /* ---------- Módulo 5 – NCCN v5.2026 ---------- */
  function nccn(d) {
    if (d.cM !== 'M0') return { group: 'm1', label: 'Doença metastática', criteria: ['cM1 – ver Módulo mHSPC'] };
    if (d.cN === 'N1') return { group: 'n1', label: 'Linfonodo regional positivo (N1)', criteria: ['cN1 M0 – fluxo próprio (muito alto risco com N1)'] };
    if (d.gg === null || d.psa === null) return { group: null, label: 'Dados insuficientes', criteria: [] };
    const vh = [];
    if (['T3b', 'T4'].includes(d.cT)) vh.push('cT3b–T4');
    if (d.prim5) vh.push('padrão primário de Gleason 5');
    if (d.hr.length >= 2) vh.push('≥ 2 fatores de alto risco (' + d.hr.join(', ') + ')');
    if (d.fragGG45 > 4) vh.push('> 4 fragmentos com GG4–5');
    if (vh.length) return { group: 'muito_alto', label: 'Muito alto risco', criteria: vh, id: 'RSK-N05' };
    if (d.hr.length === 1) return { group: 'alto', label: 'Alto risco', criteria: ['1 fator: ' + d.hr[0]], id: 'RSK-N04' };
    if (d.nFri >= 1) {
      const unf = [];
      if (d.nFri >= 2) unf.push(d.nFri + ' fatores intermediários (' + d.fri.join(', ') + ')');
      if (d.gg === 3) unf.push('GG3');
      if (d.pct !== null && d.pct >= 50) unf.push('≥ 50% dos fragmentos positivos (' + d.pct + '%)');
      if (unf.length) return { group: 'int_desf', label: 'Intermediário desfavorável', criteria: unf, id: 'RSK-N03' };
      const c = ['1 fator intermediário: ' + d.fri[0], 'GG' + d.gg];
      let note = null;
      if (d.pct === null) note = 'Percentual de fragmentos não calculável (sem biópsia sistemática): favorável/desfavorável não determinável por esse critério (DX-004).';
      else c.push('< 50% dos fragmentos (' + d.pct + '%)');
      return { group: 'int_fav', label: 'Intermediário favorável', criteria: c, id: 'RSK-N02', note };
    }
    if (['T1a', 'T1b', 'T1c', 'T2a'].includes(d.cT) && d.gg === 1 && d.psa < 10)
      return { group: 'baixo', label: 'Baixo risco', criteria: ['cT1–T2a', 'GG1', 'PSA < 10'], id: 'RSK-N01', note: 'Inclui o antigo "muito baixo risco", eliminado na v5.2026.' };
    return { group: null, label: 'Não classificável', criteria: ['Combinação fora das tabelas; revisar entradas'] };
  }

  /* ---------- Módulo 5 – EAU 2026 (5 níveis) ---------- */
  function eau(d) {
    if (d.cM !== 'M0') return { group: 'm1', label: 'Doença metastática', criteria: ['cM1 – ver Módulo mHSPC'] };
    if (d.gg === null || d.psa === null) return { group: null, label: 'Dados insuficientes', criteria: [] };
    if (!d.cT12 || d.cN === 'N1') {
      const c = []; if (!d.cT12) c.push('c' + d.cT); if (d.cN === 'N1') c.push('cN1');
      return { group: 'loc_av', label: 'Localmente avançado', criteria: c, id: 'RSK-E05', stampede: d.stampede, stampede2: d.stampede2 };
    }
    if (d.gg >= 4 || d.psa > 20) {
      const c = []; if (d.gg >= 4) c.push('GG' + d.gg); if (d.psa > 20) c.push('PSA > 20');
      return { group: 'alto_loc', label: 'Alto risco localizado', criteria: c, id: 'RSK-E04', stampede: d.stampede, stampede2: d.stampede2 };
    }
    if ((d.gg === 2 && d.psa >= 10 && d.psa <= 20) || d.gg === 3)
      return { group: 'int_desf', label: 'Intermediário desfavorável', criteria: [d.gg === 3 ? 'GG3' : 'GG2 com PSA 10–20'], id: 'RSK-E03' };
    if ((d.gg === 2 && d.psa < 10) || (d.gg === 1 && d.psa >= 10 && d.psa <= 20))
      return { group: 'int_fav', label: 'Intermediário favorável', criteria: [d.gg === 2 ? 'GG2 com PSA < 10' : 'GG1 com PSA 10–20'], id: 'RSK-E02' };
    if (d.gg === 1 && d.psa < 10) return { group: 'baixo', label: 'Baixo risco', criteria: ['GG1', 'PSA < 10', 'cT1–2'], id: 'RSK-E01' };
    return { group: null, label: 'Não classificável', criteria: [] };
  }

  function divergence(d, n, e) {
    if (!n.group || !e.group || n.group === e.group) return null;
    if (n.group === 'alto' && e.group === 'alto_loc') return null; // equivalentes
    if (['T2b', 'T2c'].includes(d.cT) && (n.group === 'int_fav' && e.group === 'baixo' || n.group === 'int_desf' && e.group === 'int_fav'))
      return 'A EAU não usa cT2b/c como critério de risco; a NCCN conta como fator intermediário.';
    if (n.group === 'int_desf' && e.group === 'int_fav' && d.pct !== null && d.pct >= 50)
      return 'A EAU não usa o percentual de fragmentos positivos; a NCCN reclassifica ≥ 50% como desfavorável.';
    if (n.group === 'alto' && e.group === 'loc_av') return 'Nomenclatura diferente (NCCN "alto risco" por cT3a; EAU "localmente avançado"); a conduta é equivalente.';
    if ((n.group === 'alto' || n.group === 'muito_alto') && e.group === 'alto_loc') return 'A EAU não separa alto de muito alto risco; o subgrupo STAMPEDE (≥ 2 de cT3–4, Gleason ≥ 8, PSA ≥ 40) cumpre esse papel.';
    if (n.group === 'n1' && e.group === 'loc_av') return 'cN1: NCCN usa fluxo próprio; EAU inclui no localmente avançado.';
    return 'Grupos diferentes por critérios próprios de cada diretriz.';
  }

  /* ---------- Módulo 3 – TNM / AJCC ---------- */
  function ajcc(d) {
    if (d.cM !== 'M0') return 'IVB';
    if (d.cN === 'N1') return 'IVA';
    if (d.gg === null || d.psa === null) return '—';
    if (d.gg === 5) return 'IIIC';
    if (!d.cT12) return 'IIIB';
    if (d.psa >= 20) return 'IIIA';
    if (d.gg === 3 || d.gg === 4) return 'IIC';
    if (d.gg === 2) return 'IIB';
    if (['T2b', 'T2c'].includes(d.cT)) return 'IIA';
    return d.psa < 10 ? 'I' : 'IIA';
  }

  /* ---------- Módulo 7 – CAPRA ---------- */
  function capra(d) {
    if (d.psa === null || !d.gleason || d.idade === null) return null;
    let s = 0;
    s += d.psa <= 6 ? 0 : d.psa <= 10 ? 1 : d.psa <= 20 ? 2 : d.psa <= 30 ? 3 : 4;
    const [p, q] = d.gleason.split('+').map(Number);
    s += p >= 4 ? 3 : q >= 4 ? 1 : 0;
    s += d.cT === 'T3a' ? 1 : 0;
    if (d.pct !== null) s += d.pct >= 34 ? 1 : 0;
    s += d.idade >= 50 ? 1 : 0;
    return { score: s, risco: s <= 2 ? 'Baixo' : s <= 5 ? 'Intermediário' : 'Alto' };
  }

  /* ---------- Módulo 4 – saúde e expectativa ---------- */
  const CHARLSON = { iam: 1, icc: 1, dvp: 1, avc: 1, demencia: 1, dpoc: 1, tc: 1, ulcera: 1, hep_leve: 1, dm: 1, dm_lesao: 2, hemiplegia: 2, drc: 2, tumor: 2, leuc: 2, linfoma: 2, hep_grave: 3, hiv: 6 };
  function charlson(list) { return (list || []).reduce((s, k) => s + (CHARLSON[k] || 0), 0); }

  function siog(h) {
    const age = num(h.idade), ecog = num(h.ecog) ?? 0, g8 = num(h.g8), cfs = num(h.cfs), adl = num(h.adl), wl = num(h.perda_peso), cirs = num(h.cirsg);
    const ch = charlson(h.comorbidades);
    const out = { charlson: ch };
    if (ecog >= 3) return Object.assign(out, { group: 'fragil', label: 'Frágil', id: 'SAU-004', why: 'ECOG ≥ 3' });
    if (age !== null && age < 70) {
      if (ecog <= 1 && ch <= 1) return Object.assign(out, { group: 'fit', label: 'Fit', id: 'SAU-001', why: 'idade < 70, ECOG 0–1, Charlson ≤ 1' });
      if (cfs !== null && cfs >= 6) return Object.assign(out, { group: 'fragil', label: 'Frágil', id: 'SAU-004', why: 'CFS ≥ 6' });
      return Object.assign(out, { group: 'vulneravel', label: 'Vulnerável', id: 'SAU-003', why: 'idade < 70 com ECOG 2 ou Charlson ≥ 2' });
    }
    if (g8 === null) return Object.assign(out, { group: 'na', label: 'Não avaliado', id: 'SAU-005', why: 'G8 não informado (obrigatório ≥ 70 anos)' });
    if (g8 > 14) return Object.assign(out, { group: 'fit', label: 'Fit', id: 'SAU-002', why: 'G8 ' + g8 + ' (> 14)' });
    const frail = (adl !== null && adl > 2) || (wl !== null && wl > 10) || (cirs !== null && cirs >= 3) || (cfs !== null && cfs >= 6);
    if (frail) return Object.assign(out, { group: 'fragil', label: 'Frágil', id: 'SAU-004', why: 'G8 ≤ 14 com critério de fragilidade' });
    const vul = (adl !== null && adl >= 1) || (wl !== null && wl >= 5) || (cirs !== null && cirs >= 1) || (cfs !== null && cfs >= 4);
    if (vul) return Object.assign(out, { group: 'vulneravel', label: 'Vulnerável', id: 'SAU-003', why: 'G8 ≤ 14 com critério de vulnerabilidade' });
    return Object.assign(out, { group: 'vulneravel', label: 'Vulnerável (provisório)', id: 'SAU-005', why: 'G8 ≤ 14 sem dados de ADL/CIRS-G: pedir avaliação geriátrica completa' });
  }

  function expectancy(h, sg) {
    const age = num(h.idade); if (age === null) return null;
    const base = baseLifeExp(age);
    const ecog = num(h.ecog) ?? 0, cfs = num(h.cfs), ch = sg.charlson;
    let q = 'medio';
    if (sg.group === 'fragil' || (cfs !== null && cfs >= 6) || ch >= 3 || ecog >= 2) q = 'pior';
    else if (sg.group === 'fit' && ch === 0 && (cfs === null || cfs <= 3)) q = 'melhor';
    const f = q === 'melhor' ? 1.5 : q === 'pior' ? 0.5 : 1.0;
    const manual = num(h.expectativa_manual);
    return { base: +base.toFixed(1), quartil: q, fator: f, anos: manual ?? +(base * f).toFixed(1), faixa: [+(base * 0.5).toFixed(1), +(base * 1.5).toFixed(1)], manual: manual !== null, tabua: TABUA };
  }

  /* ---------- Módulo 3 – imagem de estadiamento ---------- */
  function staging(d, n, e, ctx) {
    const out = [];
    const grp = [n.group, e.group];
    const low = grp.every((g) => ['baixo', 'int_fav'].includes(g));
    if (low) out.push({ id: 'EST-002', text: 'Nenhuma imagem adicional de estadiamento (baixo e intermediário favorável).', strength: 'forte', src: 'EAU 2026', br: [] });
    else {
      if (grp.includes('int_desf')) out.push({ id: 'EST-003', text: 'Intermediário desfavorável: PSMA-PET/CT se disponível; senão TC ou RM abdominopélvica + cintilografia óssea.', strength: 'fraca', src: 'EAU 2026; NCCN 2A', br: ['psma', 'conv'] });
      if (grp.some((g) => ['alto', 'muito_alto', 'alto_loc', 'loc_av', 'n1'].includes(g))) out.push({ id: 'EST-004', text: 'Alto risco ou localmente avançado: rastreamento metastático com PSMA-PET/CT se disponível e, no mínimo, TC/RM abdominopélvica + cintilografia óssea.', strength: 'forte', src: 'EAU 2026; NCCN 2A', br: ['psma', 'conv'] });
      if (ctx.contexto === 'sus') out.push({ id: 'EST-006', text: 'PSMA-PET indisponível no SUS: usar imagem convencional; em dúvida na cintilografia, RM de corpo inteiro ou PET-fluoreto onde houver.', strength: 'alerta', src: 'Camada Brasil', br: [] });
    }
    return out;
  }

  /* ---------- Módulo 5 – vigilância ativa ---------- */
  function activeSurveillance(d, n, e, le) {
    const out = [];
    const leOk = le === null || le >= 10;
    const lowExt = d.pos !== null && d.pos <= 3 && (d.maxInv === null || d.maxInv <= 50);
    if (d.gg === 3 || d.vaExcluida || (d.gg === 2 && d.psad !== null && d.psad >= 0.20)) {
      const why = [];
      if (d.gg === 3) why.push('GG3'); if (d.crib) why.push('padrão cribriforme'); if (d.idc) why.push('carcinoma intraductal');
      if (d.gg === 2 && d.psad !== null && d.psad >= 0.20) why.push('PSAd ≥ 0,20 em GG2');
      out.push({ id: 'VA-004', text: 'Excluir de vigilância ativa: ' + why.join(', ') + '.', strength: 'forte', src: 'EAU 2026', br: [] });
      return out;
    }
    const isLow = n.group === 'baixo' || e.group === 'baixo';
    if (isLow && !leOk) { out.push({ id: 'VA-005', text: 'Baixo risco com expectativa < 10 anos: observação (watchful waiting), não vigilância ativa.', strength: 'forte', src: 'EAU 2026; NCCN', br: [] }); return out; }
    if (isLow) out.push({ id: 'VA-001', text: 'Vigilância ativa recomendada como padrão (baixo risco, expectativa > 10 anos).', strength: 'forte', src: 'EAU 2026 (forte); NCCN (preferida)', br: ['va'] });
    const gg2sel = d.gg === 2 && d.psa < 10 && ['T1a', 'T1b', 'T1c', 'T2a'].includes(d.cT) && d.pat4 !== null && d.pat4 < 10 && lowExt;
    const gg1int = d.gg === 1 && d.psa >= 10 && d.psa <= 20 && lowExt;
    if ((gg2sel || gg1int) && leOk) out.push({ id: 'VA-002', text: 'Vigilância ativa em paciente selecionado de risco intermediário (' + (gg2sel ? 'GG2 com < 10% de padrão 4, PSA < 10, ≤ cT2a, ≤ 3 fragmentos, ≤ 50%/fragmento' : 'GG1 com PSA 10–20 e baixa extensão') + '), aceitando risco maior de progressão metastática.', strength: 'fraca', src: 'EAU 2026', br: ['va'] });
    if (n.group === 'int_fav' && d.gg === 2 && d.pat4 !== null && d.pat4 < 10 && d.psad !== null && d.psad < 0.15 && lowExt && leOk)
      out.push({ id: 'VA-003', text: 'NCCN: vigilância ativa pode ser considerada no intermediário favorável com GG2, baixo padrão 4, PSAd < 0,15 e poucos fragmentos; classificador genômico opcional para decidir.', strength: 'moderada', src: 'NCCN v5.2026 (2A)', br: ['va', 'genomico'] });
    if (d.gg === 2 && !gg2sel && d.pat4 === null) out.push({ id: 'DX-005', text: 'GG2 sem percentual de padrão 4 informado: solicitar ao patologista antes de decidir vigilância (critério EAU: < 10%).', strength: 'alerta', src: 'Módulo 2', br: [] });
    return out;
  }

  /* ---------- Módulo 6 – tratamento localizado ---------- */
  function treatment(d, n, e, ctx) {
    const le = ctx.le, sg = ctx.siog, guia = ctx.guia || 'ambas';
    const N = (g) => guia !== 'eau' && n.group === g, E = (g) => guia !== 'nccn' && e.group === g;
    const cN1 = d.cN === 'N1';
    const leLow = le !== null && le < 10;
    const isLow = N('baixo') || E('baixo');
    const intFav = N('int_fav') || E('int_fav');
    const intDesf = N('int_desf') || E('int_desf');
    const highLoc = (N('alto') || N('muito_alto') || E('alto_loc')) && d.cT12 && !cN1;
    const locAdv = (E('loc_av') || N('alto') || N('muito_alto')) && !d.cT12 && !cN1;
    const anyHigh = highLoc || locAdv || (guia !== 'nccn' && e.group === 'alto_loc') ;
    const vaRules = ctx.va || [];
    const vaOk = vaRules.some((r) => r.id === 'VA-001'), vaSel = vaRules.some((r) => r.id === 'VA-002' || r.id === 'VA-003');
    const urin = ctx.urinario === 'sim';
    const asaHigh = ['III', 'IV'].includes(ctx.asa);
    const O = [];
    let GRP='filtro'; const add = (o) => { o.grp = o.grp || GRP; O.push(o); };

    // Filtros de expectativa / saúde
    if (leLow && d.cM === 'M0') add({ id: 'TXF-001', text: 'Expectativa de vida < 10 anos e assintomático: observação (watchful waiting) é a conduta padrão; opções curativas abaixo ficam marcadas como não recomendadas por expectativa de vida.', strength: 'forte', src: 'EAU 2026', br: [], kind: 'padrao' });
    if (sg.group === 'fragil') add({ id: 'TXF-002', text: 'Paciente frágil: apenas observação e paliação dirigida a sintomas; ADT só se sintomático ou PSA-DT < 12 meses com PSA > 50 ou GG ≥ 4.', strength: 'forte', src: 'EAU 2026 / SIOG', br: ['adt'], kind: 'padrao' });
    if (sg.group === 'vulneravel') add({ id: 'TXF-003', text: 'Paciente vulnerável: intervenção geriátrica antes de tratamento intensivo; se as alterações forem reversíveis e a expectativa > 10 anos, tratamento padrão.', strength: 'fraca', src: 'EAU 2026 / SIOG', br: [], kind: 'padrao' });

    const cur = (o) => { o.curativo = true; if (leLow || sg.group === 'fragil') { o.excluida = leLow ? 'não recomendado por expectativa de vida < 10 anos' : 'não recomendado: paciente frágil'; } if (asaHigh && /Prostatectomia/.test(o.text)) o.aviso = 'ASA ' + ctx.asa + ': risco anestésico elevado; ponderar radioterapia'; if (urin && /(braquiterapia|SBRT|Ultra-hipofracionamento)/i.test(o.text)) o.aviso = 'Função urinária comprometida: braquiterapia/SBRT com cautela'; add(o); };

    if (isLow) { GRP='baixo';
      if (vaOk && !leLow) add({ id: 'TXL-001', text: 'Vigilância ativa (conduta padrão em baixo risco).', strength: 'forte', src: 'EAU 2026 (forte); NCCN (preferida)', br: ['va'], kind: 'padrao' });
      if (leLow) add({ id: 'TXL-002', text: 'Observação (watchful waiting).', strength: 'forte', src: 'EAU 2026; NCCN', br: [], kind: 'padrao' });
      cur({ id: 'TXL-003', text: 'Prostatectomia radical (paciente que recusa vigilância, expectativa > 10 anos).', strength: 'moderada', src: 'NCCN 2A', br: ['rp'] });
      cur({ id: 'TXL-004', text: 'Radioterapia externa ou braquiterapia LDR (alternativa à vigilância).', strength: 'moderada', src: 'NCCN 2A', br: ['rt', 'braqui'] });
      add({ id: 'TXL-005', text: 'Terapia focal ou ablação de glândula inteira: somente em ensaio clínico ou registro; a NCCN 2026 pede cautela em recém-diagnosticados.', strength: 'ensaio', src: 'EAU 2026 (forte); NCCN v5.2026', br: [] });
    }
    if (intFav) { GRP='int_fav';
      if (leLow) add({ id: 'TXI-001', text: 'Observação (assintomático, expectativa < 10 anos).', strength: 'forte', src: 'EAU 2026', br: [], kind: 'padrao' });
      if (vaSel && !leLow) add({ id: 'TXI-002', text: 'Vigilância ativa em paciente selecionado (critérios VA-002/VA-003 atendidos).', strength: 'fraca', src: 'EAU 2026; NCCN 2A', br: ['va'] });
      cur({ id: 'TXI-003', text: 'Prostatectomia radical ± linfadenectomia (PLND se risco nodal ≥ 2% no MSKCC ou > 7% no Briganti 2019).', strength: 'forte', src: 'EAU 2026; NCCN', br: ['rp'] });
      if (E('int_fav')) cur({ id: 'TXI-004', text: 'Braquiterapia LDR em monoterapia (boa função urinária).', strength: 'forte', src: 'EAU 2026', br: ['braqui'] });
      cur({ id: 'TXI-005', text: 'Radioterapia externa IMRT/VMAT + IGRT, 76–78 Gy ou hipofracionamento moderado (60 Gy/20 fx ou 70 Gy/28 fx); ADT 4–6 meses opcional.', strength: 'forte', src: 'EAU 2026 (EBRT ± ADT); NCCN', br: ['rt', 'adt'] });
      cur({ id: 'TXI-006', text: 'Ultra-hipofracionamento / SBRT 36,25 Gy/5 fx (40 Gy à próstata) ou 42,7 Gy/7 fx em dias alternados (boa função urinária).', strength: 'fraca', src: 'EAU 2026', br: ['sbrt'] });
      cur({ id: 'TXI-007', text: 'Boost focal na lesão dominante da RM com fracionamento convencional, respeitando órgãos de risco.', strength: 'fraca', src: 'EAU 2026', br: ['rt'] });
    }
    if (intDesf) { GRP='int_desf';
      if (leLow) add({ id: 'TXU-001', text: 'Observação (assintomático, expectativa < 10 anos).', strength: 'forte', src: 'EAU 2026', br: [], kind: 'padrao' });
      cur({ id: 'TXU-002', text: 'Prostatectomia radical + linfadenectomia estendida (nerve-sparing só no lado com baixo risco de extensão extracapsular).', strength: 'forte', src: 'EAU 2026; NCCN', br: ['rp'] });
      cur({ id: 'TXU-003', text: 'Radioterapia externa 76–78 Gy ou hipofracionamento moderado + ADT 4–6 meses.', strength: 'forte', src: 'EAU 2026; NCCN categoria 1', br: ['rt', 'adt'] });
      cur({ id: 'TXU-004', text: 'Radioterapia externa + boost de braquiterapia LDR ou HDR + ADT 4–6 meses (boa função urinária).', strength: 'fraca', src: 'EAU 2026; NCCN', br: ['rt', 'braqui', 'adt'] });
      cur({ id: 'TXU-005', text: 'Boost focal na lesão da RM com fracionamento convencional.', strength: 'fraca', src: 'EAU 2026', br: ['rt'] });
      add({ id: 'TXU-006', text: 'ADT isolada: não oferecer a assintomático sem tratamento local.', strength: 'nao', src: 'EAU 2026 (fraca, contra)', br: [] });
      add({ id: 'TXU-007', text: 'Ablação de glândula inteira ou focal: somente em ensaio ou registro.', strength: 'ensaio', src: 'EAU 2026 (forte)', br: [] });
    }
    if (anyHigh || locAdv) { GRP= locAdv ? 'loc_av' : 'alto';
      if (leLow) add({ id: 'TXH-001', text: 'Observação (assintomático, expectativa < 10 anos).', strength: 'forte', src: 'EAU 2026', br: [], kind: 'padrao' });
      if (highLoc) cur({ id: 'TXH-002', text: 'Prostatectomia radical + linfadenectomia estendida, como parte de tratamento multimodal (paciente selecionado; sem congelação de linfonodos para decidir abandono).', strength: 'forte', src: 'EAU 2026; NCCN', br: ['rp'] });
      if (locAdv) cur({ id: 'TXA-001', text: 'Prostatectomia radical + linfadenectomia estendida em tratamento multimodal (cT3–4 cN0, paciente selecionado).', strength: 'fraca', src: 'EAU 2026; NCCN 2A', br: ['rp'] });
      cur({ id: 'TXH-003', text: 'Radioterapia externa 76–78 Gy ou hipofracionamento moderado + ADT 2–3 anos (NCCN: 18–36 meses).', strength: 'forte', src: 'EAU 2026; NCCN categoria 1', br: ['rt', 'adt'] });
      cur({ id: 'TXH-004', text: 'Boost focal na lesão da RM com fracionamento convencional.', strength: 'forte', src: 'EAU 2026', br: ['rt'] });
      cur({ id: 'TXH-005', text: 'Radioterapia externa + boost de braquiterapia LDR/HDR + ADT 2–3 anos (boa função urinária).', strength: 'fraca', src: 'EAU 2026; NCCN', br: ['rt', 'braqui', 'adt'] });
      if (d.stampede2) cur({ id: 'TXH-006', text: 'Radioterapia externa + ADT 3 anos + abiraterona 1 g/dia com prednisona 5 mg por 2 anos (≥ 2 de cT3–4, Gleason ≥ 8, PSA ≥ 40: ' + d.stampede.join(', ') + ').', strength: 'forte', src: 'EAU 2026 (STAMPEDE); NCCN categoria 1 (muito alto risco)', br: ['rt', 'adt', 'abiraterona'] });
      else if (highLoc || locAdv) add({ id: 'TXH-006x', text: 'Abiraterona adjuvante à RT + ADT não indicada: menos de 2 fatores STAMPEDE (' + (d.stampede.join(', ') || 'nenhum') + ').', strength: 'nao', src: 'EAU 2026', br: [] });
      if (guia !== 'eau') cur({ id: 'TXH-007', text: 'Radioterapia pélvica eletiva associada, se risco nodal elevado (Briganti/Roach).', strength: 'moderada', src: 'NCCN 2A', br: ['rt'] });
      add({ id: 'TXH-008', text: 'ADT isolada apenas se o paciente recusar ou não puder receber tratamento local E PSA-DT < 12 meses E (PSA > 50 ou GG ≥ 4).', strength: 'forte', src: 'EAU 2026', br: ['adt'], condicional: true });
      add({ id: 'TXH-009', text: 'Terapia focal ou de glândula inteira: não oferecer.', strength: 'nao', src: 'EAU 2026 (forte)', br: [] });
    }
    if (cN1 && d.cM === 'M0') { GRP='n1';
      cur({ id: 'TXA-005', text: 'Radioterapia externa à próstata + pelve + ADT longa + abiraterona 2 anos (cN1 M0).', strength: 'forte', src: 'EAU 2026; NCCN categoria 1', br: ['rt', 'adt', 'abiraterona'] });
      cur({ id: 'TXA-006', text: 'Prostatectomia radical + linfadenectomia estendida em cN1 selecionado (linfonodos pequenos, poucos).', strength: 'moderada', src: 'NCCN 2A', br: ['rp'] });
      add({ id: 'TXA-007', text: 'Terapia focal ou de glândula inteira: não oferecer.', strength: 'nao', src: 'EAU 2026 (forte)', br: [] });
    }
    return O;
  }

  /* ---------- alertas e exames pendentes ---------- */
  function alerts(d, n, e, ctx) {
    const A = [], P = [];
    const h = ctx.health || {};
    if (d.variante !== 'acinar' && d.variante !== 'ductal') A.push({ id: 'DX-008', text: 'Histologia ' + d.variante + ': fora do escopo deste app; encaminhar à oncologia clínica.', strength: 'alerta' });
    if (d.vaExcluida) A.push({ id: 'RSK-M01', text: 'Padrão cribriforme ou carcinoma intraductal presente: exclui vigilância ativa (EAU, forte); considerar como desfavorável para fins de conduta.', strength: 'alerta' });
    if (d.cribNI && d.gg !== null && d.gg <= 2) P.push({ id: 'DX-003', text: 'Cribriforme/IDC-P não informado com GG ≤ 2: solicitar revisão de lâmina antes de decidir vigilância ativa.' });
    if (d.pct === null && d.gg !== null && d.biopsiaTipo === 'dirigida') A.push({ id: 'DX-004', text: 'Só biópsia dirigida: percentual de fragmentos NCCN não calculável; grupo NCCN exibido com ressalva.', strength: 'alerta' });
    if (d.tot !== null && d.tot < 10 && d.biopsiaTipo !== 'turp') A.push({ id: 'DX-006', text: 'Menos de 10 fragmentos sistemáticos: amostragem insuficiente para percentual confiável.', strength: 'alerta' });
    if (d.psad !== null && d.psad >= 0.15 && (n.group === 'baixo' || e.group === 'baixo')) A.push({ id: 'RSK-M02', text: 'PSAd ' + d.psad.toFixed(2) + ' (≥ 0,15) em baixo risco: maior risco de reclassificação; rebiópsia não dispensável durante a vigilância.', strength: 'alerta' });
    if ((d.rmEPE || d.rmVS) && d.cT12) A.push({ id: 'RSK-M04', text: 'RM sugere ' + (d.rmVS ? 'invasão de vesícula seminal (T3b)' : 'extensão extraprostática (T3a)') + '; cT mantido pelo toque retal (' + d.cT + '); discutir nerve-sparing e margens.', strength: 'alerta' });
    if (d.gg === 1 && (d.pirads === '5' || (d.lesaoMm !== null && d.lesaoMm > 15))) A.push({ id: 'RSK-M05', text: 'GG1 com PI-RADS 5 ou lesão > 15 mm: risco de subamostragem; preferir rebiópsia dirigida antes de vigilância (em GG1 com RM, PI-RADS e % de fragmentos predizem patologia adversa melhor que o grupo NCCN).', strength: 'alerta' });
    if (d.stampede2) A.push({ id: 'RSK-M06', text: 'Subgrupo STAMPEDE (' + d.stampede.join(', ') + '): habilita abiraterona 2 anos com RT + ADT 3 anos.', strength: 'alerta' });
    if (d.imagem === 'psma' && (d.cN === 'N1' || d.cM !== 'M0')) A.push({ id: 'EST-013', text: 'Doença nodal/metastática definida por PSMA-PET: a evidência de tratamento baseia-se em imagem convencional; discutir migração de estádio em reunião multidisciplinar.', strength: 'alerta' });
    // saúde
    const com = h.comorbidades || [];
    if (com.some((c) => ['iam', 'icc', 'dvp', 'avc', 'dm', 'dm_lesao'].includes(c))) A.push({ id: 'SAU-010', text: 'Doença cardiovascular ou diabetes: risco cardiovascular da ADT; preferir antagonista LHRH, otimizar fatores de risco, exercício supervisionado 12 semanas.', strength: 'alerta' });
    if ((num(h.idade) ?? 0) >= 70 || h.osteo === 'sim') A.push({ id: 'SAU-011', text: 'Idade ≥ 70 ou fator de risco ósseo: densitometria antes de ADT longa; cálcio + vitamina D; antirreabsortivo se T-score < −2,5 ou perda > 5%/ano.', strength: 'alerta' });
    if (num(h.mini_cog) !== null && num(h.mini_cog) <= 3) A.push({ id: 'SAU-012', text: 'Mini-COG ≤ 3: cautela com ARPI de maior penetração no SNC (enzalutamida, apalutamida); considerar darolutamida.', strength: 'alerta' });
    if (h.quedas === 'sim' || (num(h.cfs) ?? 0) >= 5) A.push({ id: 'SAU-013', text: 'Quedas no último ano ou CFS ≥ 5: evitar enzalutamida/apalutamida como primeira escolha; preferir abiraterona ou darolutamida.', strength: 'alerta' });
    if (ctx.siog && ctx.siog.id === 'SAU-005') P.push({ id: 'SAU-005', text: 'Avaliação geriátrica completa (ADL, IADL, CIRS-G, MNA, GDS) antes de decidir tratamento curativo.' });
    // germinativo
    if (['alto', 'muito_alto', 'n1', 'm1'].includes(n.group) || ['alto_loc', 'loc_av', 'm1'].includes(e.group) || d.crib || d.idc || ctx.ashkenazi === 'sim')
      P.push({ id: 'GEN-001', text: 'Oferecer teste germinativo (BRCA1/2, ATM, PALB2, CHEK2, MLH1, MSH2, MSH6, PMS2, HOXB13), com aconselhamento genético.' });
    return { alerts: A, pending: P };
  }

  /* ---------- Módulo 1 – pré-diagnóstico ---------- */
  function preDx(p) {
    const out = [];
    const idade = num(p.idade), psa = num(p.psa), psa2 = num(p.psa_repetido), vol = num(p.volume), le = p.expectativa || '>=15';
    const psad = (psa !== null && vol) ? +(psa / vol).toFixed(3) : null;
    const hf = p.hist_familiar === 'sim', afro = p.afro === 'sim', brca = p.brca === 'sim';
    const toque = p.toque || 'normal', pir = String(p.pirads || 'nr'), sint = p.sintomas || 'nao';
    const add = (id, text, strength, src, br) => out.push({ id, text, strength, src, br: br || [] });
    if (le === '<10' || le === '10-15') add('PRE-001', 'Expectativa de vida < 15 anos: não iniciar ou interromper detecção precoce por PSA em assintomático.', 'forte', 'EAU 2026');
    else {
      const semPsaAlto = (psa2 ?? psa) === null || (psa2 ?? psa) < 3;
      if (semPsaAlto && idade !== null && idade >= 50) add('PRE-002', 'Idade ≥ 50 anos: oferecer PSA após decisão informada.', 'forte', 'EAU 2026');
      else if (semPsaAlto && idade !== null && idade >= 45 && (hf || afro)) add('PRE-003', 'Idade ≥ 45 com história familiar de CaP < 60 anos ou afrodescendência: oferecer PSA.', 'forte', 'EAU 2026');
      else if (semPsaAlto && idade !== null && idade >= 40 && brca) add('PRE-004', 'Idade ≥ 40 com mutação BRCA2: oferecer PSA.', 'forte', 'EAU 2026');
      if (psa !== null && psa < 3 && idade !== null && ((idade < 50 && psa > 1) || (idade >= 50 && psa > 2))) add('PRE-005', 'PSA acima do corte de risco para a idade (EAU: > 1 ng/mL aos 40 anos, > 2 ng/mL aos 60; aqui: > 1 antes dos 50 e > 2 a partir dos 50): repetir PSA a cada 2 anos.', 'fraca', 'EAU 2026');
      if (psa !== null && psa < 3 && idade !== null && ((idade < 50 && psa <= 1) || (idade >= 50 && psa <= 2))) add('PRE-006', 'PSA abaixo do corte de risco para a idade (EAU: ≤ 1 ng/mL aos 40 anos, ≤ 2 ng/mL aos 60; aqui: ≤ 1 antes dos 50 e ≤ 2 a partir dos 50): reavaliar em até 8 anos.', 'fraca', 'EAU 2026');
    }
    const psaRef = psa2 ?? psa;
    if (sint === 'avancada' || ['T3a', 'T3b', 'T4'].includes(toque) || (psaRef !== null && psaRef > 20)) {
      if (le === '<10') add('PRE-014a', 'Expectativa < 10 anos: investigar apenas se o diagnóstico mudar a conduta (sintomas, suspeita de doença avançada); evitar biópsia se nada mudaria.', 'fraca', 'EAU 2026');
      add('PRE-013', 'PSA > 20, toque com suspeita de T3–T4 ou sintomas de doença avançada: biópsia limitada (sem RM obrigatória) e estadiamento direto; RM só se mudar o planejamento local.', 'fraca', 'EAU 2026', ['conv', 'psma']);
    } else if (psaRef !== null && psaRef >= 3 && le === '<10') {
      add('PRE-014', 'PSA ≥ 3 com expectativa < 10 anos, assintomático e sem suspeita de doença avançada: não biopsiar; discutir observação.', 'fraca', 'EAU 2026');
    } else if (psaRef !== null && psaRef >= 3) {
      if (psa2 === null && psa <= 10) add('PRE-010', 'PSA 3–10 na primeira dosagem: repetir PSA antes de qualquer exame (4–6 semanas, sem infecção ou manipulação).', 'fraca', 'EAU 2026');
      if (pir === 'nr') {
        add('PRE-011', 'PSA 3–20 confirmado: indicar RM multiparamétrica (PI-RADS v2.1) antes de biópsia.', 'forte', 'EAU 2026; NCCN', ['rm']);
        add('PRE-012', 'Se RM indisponível: calculadora de risco calibrada (ERSPC, PBCG) ou biomarcador (PHI, 4Kscore, PCA3, SelectMDx).', 'fraca', 'EAU 2026');
      } else if (pir === '4' || pir === '5') {
        add('PRE-020', 'PI-RADS ' + pir + ': biópsia dirigida + perilesional (3–5 fragmentos ao redor da lesão) + sistemática na primeira biópsia.', 'fraca', 'EAU 2026 (dirigida+perilesional); forte (sistemática na 1ª biópsia)', ['transperineal']);
      } else if (pir === '3') {
        if (psad !== null && psad < 0.10 && !hf) add('PRE-021', 'PI-RADS 3 com PSAd ' + psad.toFixed(2) + ' (< 0,10) e sem história familiar: omitir biópsia; PSA em 6–12 meses.', 'fraca', 'EAU 2026');
        else add('PRE-022', 'PI-RADS 3 com PSAd ' + (psad === null ? 'não calculável' : psad.toFixed(2)) + (hf ? ' e história familiar' : '') + ': considerar biópsia dirigida + perilesional.', 'fraca', 'EAU 2026', ['transperineal']);
      } else {
        if (psad !== null && psad < 0.20 && !hf) add('PRE-023', 'PI-RADS 1–2 com PSAd ' + psad.toFixed(2) + ' (< 0,20) e sem história familiar: omitir biópsia; PSA em 12 meses.', 'fraca', 'EAU 2026');
        else add('PRE-024', 'PI-RADS 1–2 com ' + (hf ? 'história familiar' : psad === null ? 'PSAd não calculável (informe o volume prostático)' : 'PSAd ≥ 0,20') + ': considerar biópsia sistemática (12 fragmentos).', 'fraca', 'EAU 2026', ['transperineal']);
        if (psad !== null) add('PRE-023n', 'Nota NCCN: com RM negativa, PSAd ' + (psad >= 0.15 ? '≥ 0,15 justifica biópsia sistemática ou biomarcador' : '< 0,15 permite seguimento com PSA') + ' (corte NCCN 0,15 vs. EAU 0,20).', 'moderada', 'NCCN Early Detection');
      }
      if (p.biopsia_previa === 'neg' && pir !== 'nr') add('PRE-025', 'Biópsia negativa prévia com PSA em ascensão: repetir RM; se PI-RADS ≥ 3, rebiopsiar dirigida; se negativa, a PSAd decide.', 'fraca', 'EAU 2026');
    } else if (psaRef !== null) {
      add('PRE-00x', 'PSA ' + psaRef + ' ng/mL abaixo do limiar de investigação (3 ng/mL): sem indicação de RM ou biópsia por PSA.', 'padrao', 'EAU 2026; NCCN');
    }
    const bx = out.some((o) => /biópsia (dirigida|sistemática|limitada)/i.test(o.text) && !/omitir/.test(o.text));
    if (bx) {
      add('PRE-030', 'Via transperineal (menor risco infeccioso, melhor uso de antibióticos); sem antibiótico profilático se sem fatores de risco; antissepsia do períneo.', 'forte', 'EAU 2026', ['transperineal']);
      add('PRE-032', 'Se transretal: limpeza retal com iodopovidona + profilaxia dirigida por swab retal ou aumentada (≥ 2 classes).', 'forte', 'EAU 2026');
    }
    const fam2 = p.familiares2 === 'sim', mort60 = p.familiar_morte60 === 'sim', mutFam = p.mut_familiar === 'sim';
    if (fam2 || mort60) add('PRE-040', '≥ 2 familiares com CaP < 60 anos ou familiar morto por CaP < 60: aconselhar teste germinativo (com aconselhamento genético).', 'fraca', 'EAU 2026', ['germinativo']);
    if (mutFam) add('PRE-041', 'História familiar de mutação germinativa de alto risco ou múltiplos cânceres no mesmo lado da família: oferecer teste germinativo.', 'forte', 'EAU 2026', ['germinativo']);
    return { out, psad };
  }

  /* ---------- Módulo 8 – recorrência bioquímica ---------- */
  function psaDT(series) {
    const pts = (series || []).filter((s) => s.psa > 0 && s.t !== null).sort((a, b) => a.t - b.t);
    if (pts.length < 2) return { dt: null, note: 'Mínimo de 2 PSAs com data.' };
    const xs = pts.map((p) => p.t), ys = pts.map((p) => Math.log(p.psa));
    const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
    let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
    const k = sxx ? sxy / sxx : 0;
    if (k <= 0) return { dt: null, note: 'PSA estável ou em queda: tempo de duplicação não calculável.' };
    const dt = Math.LN2 / k;
    const span = xs[n - 1] - xs[0];
    return { dt: +dt.toFixed(1), note: n < 3 ? 'Calculado com só 2 valores.' : span < 3 ? 'Intervalo < 3 meses: estimativa pouco confiável.' : '' };
  }
  function bcr(p) {
    const out = [], info = {};
    const add = (id, text, strength, src, br) => out.push({ id, text, strength, src, br: br || [] });
    const prim = p.primario || 'rp';
    const series = (p.psas || []).map((s) => ({ psa: num(s.psa), t: num(s.t) })).filter((s) => s.psa !== null && s.t !== null);
    const last = series.length ? series.reduce((a, b) => (b.t > a.t ? b : a)) : null;
    const lastPsa = last ? last.psa : num(p.psa_atual);
    const dtr = psaDT(series); info.psaDT = dtr.dt; info.psaDTnote = dtr.note; info.psa = lastPsa;
    const ggp = num(p.gg_pat) ?? num(p.gg_bx);
    const nadir = num(p.nadir), interval = num(p.intervalo_falha);
    const img = p.imagem || 'nenhuma', res = p.img_resultado || 'neg';
    const dtHigh = dtr.dt !== null && dtr.dt <= 12;
    if (prim === 'rp') {
      if (lastPsa !== null && lastPsa >= 0.2) info.def = 'Recorrência bioquímica pós-RP (PSA ≥ 0,2 ng/mL confirmado) – BCR-001';
      else if (p.persistente === 'sim') info.def = 'PSA persistente pós-RP (≥ 0,1 em 6–8 semanas) – BCR-002';
      else { info.def = 'Critério de recorrência pós-RP não atingido (PSA < 0,2); seguir com PSA seriado'; add('BCR-004', 'PSA < 0,2 ng/mL após prostatectomia sem persistência: ainda não é recorrência bioquímica — PSA a cada 3–6 meses nos 2 primeiros anos e depois a cada 6–12 meses; sem imagem ou tratamento por enquanto; PSA ultrassensível em ascensão (≥ 0,1) antecipa a discussão de resgate.', 'padrao', 'EAU 2026; NCCN'); }
      info.risco = (dtHigh || (ggp !== null && ggp >= 4)) ? 'Alto risco EAU (PSA-DT ≤ 12 meses ou GG 4–5) – BCR-010' : (dtr.dt !== null && ggp !== null ? 'Baixo risco EAU (PSA-DT > 12 meses e GG ≤ 3) – BCR-010' : 'Risco EAU não determinável (falta PSA-DT ou GG)');
    } else {
      info.def = (lastPsa !== null && nadir !== null && lastPsa >= nadir + 2) ? 'Recorrência bioquímica pós-RT (nadir + 2, Phoenix) – BCR-003' : 'Critério Phoenix não atingido';
      if (!(lastPsa !== null && nadir !== null && lastPsa >= nadir + 2)) add('BCR-005', 'PSA abaixo de nadir + 2 ng/mL: não é recorrência pelo critério Phoenix — repetir PSA em 3–6 meses; oscilação benigna ("bounce") é comum em 1–3 anos após braquiterapia e radioterapia, sobretudo em jovens; sem imagem ou hormonioterapia por enquanto.', 'padrao', 'EAU 2026; ASTRO-Phoenix');
      const early = interval !== null && interval <= 18;
      info.risco = (early || (ggp !== null && ggp >= 4)) ? 'Alto risco EAU (falha ≤ 18 meses ou GG 4–5) – BCR-011' : (interval !== null && ggp !== null ? 'Baixo risco EAU – BCR-011' : 'Risco EAU não determinável');
    }
    const low = /Baixo risco/.test(info.risco);
    const m1 = res === 'm1', n1 = res === 'n1', oligo = res === 'oligo';
    // imagem
    if (img === 'nenhuma') {
      if (prim === 'rp' && lastPsa !== null && lastPsa > 0.2) add('BCR-020', 'PSMA-PET/CT quando o resultado mudar a conduta; convencional só se PSMA indisponível.', 'forte', 'EAU 2026; NCCN 2A', ['psma', 'conv']);
      if (prim === 'rt') add('BCR-021', 'Candidato a resgate local: PSMA-PET/CT + RM da próstata; biópsia para confirmar recidiva antes do resgate.', 'forte', 'EAU 2026', ['psma', 'rm']);
      if (low) add('BCR-023', 'Baixo risco sem intenção de tratar: imagem dispensável.', 'fraca', 'EAU 2026');
    }
    if (m1) { add('BCR-050', 'Doença metastática em imagem convencional: sair deste módulo e abrir o módulo mHSPC com volume de doença.', 'padrao', 'Fluxo'); return { out, info }; }
    if (oligo) add('BCR-051', 'Oligometástase vista só em PSMA-PET: terapia dirigida à metástase (SBRT) somente em ensaio ou coorte prospectiva (EAU forte); NCCN permite SBRT ± ADT (2A). Ressalva de migração de estádio.', 'fraca', 'EAU 2026; NCCN', ['sbrt']);
    const emb = dtr.dt !== null && dtr.dt <= 9 && lastPsa !== null && ((prim === 'rp' && lastPsa >= 1) || (prim === 'rt' && nadir !== null && lastPsa >= nadir + 2)) && (res === 'neg' || img === 'nenhuma' || img === 'conv');
    if (prim === 'rp') {
      if (low) add('BCR-030', 'Baixo risco EAU, paciente informado: monitorização com PSA.', 'fraca', 'EAU 2026');
      if (!p.srt_previa || p.srt_previa === 'nao') {
        add('BCR-031', 'Radioterapia de resgate precoce IMRT/VMAT + IGRT ≥ 64 Gy à loja, o quanto antes, sem esperar limiar de PSA (2 elevações consecutivas).', 'forte', 'EAU 2026', ['rt']);
        add('BCR-032', 'Associar hormonioterapia à RT de resgate: ADT 6 meses (GETUG-AFU 16)' + (lastPsa !== null && lastPsa > 0.7 ? ' ou 2 anos (RTOG 9601, PSA > 0,7)' : '') + '.', 'fraca', 'EAU 2026; NCCN 2A', ['adt']);
        if (n1) add('BCR-033', 'N1 pélvico no PSMA-PET: RT de resgate à loja + pelve + ADT; discutir em reunião multidisciplinar.', 'moderada', 'NCCN 2A', ['rt', 'adt']);
      }
      if (n1 && p.srt_previa === 'sim') add('BCR-037', 'Recidiva linfonodal pélvica após radioterapia de resgate: SBRT dirigida aos linfonodos ou linfadenectomia de resgate (idealmente em ensaio ou coorte prospectiva) associadas a ADT; alternativa: tratamento sistêmico como doença de baixo volume; decidir em reunião multidisciplinar.', 'fraca', 'EAU 2026; NCCN 2A', ['sbrt', 'adt']);
      if (dtr.dt === null && !low) add('BCR-038', 'PSA-DT ainda não calculável: colher ≥ 3 PSA com ≥ 3 meses de intervalo (calculadora PSA-DT) antes de definir a intensidade do resgate; não atrasar a radioterapia de resgate precoce por isso.', 'padrao', 'EAU 2026');
      if (emb) add('BCR-035', 'Perfil EMBARK (M0 convencional, PSA-DT ≤ 9 meses, PSA ≥ 1): enzalutamida 160 mg/dia + ADT (alternativa: enzalutamida monoterapia).', 'forte', 'EAU 2026; NCCN categoria 1', ['enzalutamida', 'adt']);
      else if (dtr.dt !== null && dtr.dt > 12 && p.srt_previa === 'sim') add('BCR-034', 'Já irradiado, PSA-DT > 12 meses, M0: não iniciar ADT; observar.', 'forte', 'EAU 2026 (contra ADT)');
      else if (dtHigh && p.srt_previa === 'sim') add('BCR-036', 'PSA-DT ≤ 12 meses sem perfil EMBARK completo, M0: ADT intermitente ou contínua; discutir início precoce vs. tardio.', 'fraca', 'EAU 2026', ['adt']);
    } else {
      if (low) add('BCR-040', 'Baixo risco EAU: monitorização com PSA.', 'fraca', 'EAU 2026');
      if (res === 'local' || img === 'nenhuma') add('BCR-041', 'Recidiva local comprovada por biópsia, M0, expectativa > 10 anos, altamente selecionado: prostatectomia de resgate, braquiterapia de resgate ou SBRT de resgate em centro experiente.', 'forte', 'EAU 2026', ['rp', 'braqui', 'sbrt']);
      if (res === 'local') add('BCR-042', 'HIFU ou crioterapia de resgate dentro de ensaio ou coorte prospectiva.', 'fraca', 'EAU 2026');
      if (emb) add('BCR-043', 'Perfil EMBARK pós-RT (PSA ≥ nadir + 2, PSA-DT ≤ 9 meses, M0 convencional): enzalutamida + ADT.', 'forte', 'EAU 2026; NCCN categoria 1', ['enzalutamida', 'adt']);
      else if (dtr.dt !== null && dtr.dt > 12) add('BCR-044', 'PSA-DT > 12 meses, M0: observar; não iniciar ADT.', 'forte', 'EAU 2026');
      else if (dtr.dt !== null && dtr.dt <= 12) add('BCR-046', 'PSA-DT ≤ 12 meses sem perfil EMBARK completo e sem recidiva local tratável: ADT (intermitente ou contínua) com início precoce em PSA-DT curto ou sintomas; imagem com PSMA-PET se ainda não feita; discutir em reunião multidisciplinar.', 'fraca', 'EAU 2026', ['adt', 'psma']);
      else add('BCR-038', 'PSA-DT ainda não calculável: colher ≥ 3 PSA com ≥ 3 meses de intervalo (calculadora PSA-DT) para classificar o risco antes de definir resgate ou hormonioterapia.', 'padrao', 'EAU 2026');
      if (n1) add('BCR-045', 'Recidiva linfonodal pélvica após radioterapia: SBRT aos linfonodos ou radioterapia pélvica de resgate (se o campo não foi irradiado) ou linfadenectomia de resgate, associadas a ADT por 6–24 meses — preferencialmente em ensaio ou coorte prospectiva; alternativa: tratamento sistêmico como doença de baixo volume.', 'fraca', 'EAU 2026; NCCN 2A', ['sbrt', 'adt']);
    }
    if (p.castrado === 'sim') add('BCR-052', 'PSA subindo em castração (testosterona < 50 ng/dL): abrir o módulo CRPC.', 'padrao', 'Fluxo');
    return { out, info };
  }

  /* ---------- Módulo 9 – mHSPC ---------- */
  function mhspc(p) {
    const out = [], info = {};
    const add = (id, text, strength, src, br) => out.push({ id, text, strength, src, br: br || [] });
    const bone = num(p.ossos) ?? 0, outside = p.fora_axial === 'sim', visc = (p.visceral || 'nao') !== 'nao';
    const hv = (bone >= 4 && outside) || visc;
    const g8 = p.gleason8 === 'sim';
    const latitude = [g8, bone >= 3, visc].filter(Boolean).length >= 2;
    const sync = (p.apresentacao || 'sinc') === 'sinc';
    const fit = p.docetaxel_apto === 'sim', hrr = p.hrr === 'pos', brca = p.brca === 'sim';
    const symp = p.sintomas || 'nao';
    info.volume = hv ? 'Alto volume (CHAARTED)' : 'Baixo volume (CHAARTED)';
    info.latitude = latitude ? 'Alto risco (LATITUDE)' : 'Baixo risco (LATITUDE)';
    info.apresentacao = sync ? 'Sincrônica' : 'Metacrônica';
    if (p.imagem === 'psma') add('EST-013', 'M1 definido por PSMA-PET: os critérios de volume e os ensaios usaram imagem convencional; ressalva de migração de estádio.', 'alerta', 'EAU 2026');
    add('MH-010', 'Discutir em equipe multidisciplinar; testar HRR (somático e/ou germinativo) e MSI/dMMR.', 'forte', 'EAU 2026', ['germinativo']);
    if (symp !== 'nao') add('MH-011', 'Sintomático: iniciar ADT imediatamente; antagonista LHRH ou orquiectomia se complicação iminente (compressão medular, obstrução).', 'forte', 'EAU 2026', ['adt']);
    add('MH-012', 'Ao iniciar agonista LHRH: antiandrogênio de 1ª geração por 2–4 semanas para evitar flare.', 'fraca', 'EAU 2026', ['adt']);
    if (p.expectativa === '<1') add('MH-014x', 'Expectativa < 1 ano ou contraindicação: ADT isolada aceitável.', 'fraca', 'EAU 2026', ['adt']);
    else add('MH-014', 'Não usar ADT isolada: combinação obrigatória (expectativa ≥ 1 ano, sem contraindicação).', 'forte', 'EAU 2026; NCCN', ['adt']);
    add('MH-020', 'ADT + abiraterona 1 g + prednisona 5 mg, ou apalutamida 240 mg, ou enzalutamida 160 mg (rezvilutamida citada pela EAU, sem registro no Brasil).', 'forte', 'EAU 2026; NCCN categoria 1', ['adt', 'abiraterona', 'apalutamida', 'enzalutamida']);
    add('MH-021', 'ADT + darolutamida 600 mg 2×/dia (ARANOTE).', 'fraca', 'EAU 2026 (fraca); NCCN categoria 1', ['adt', 'darolutamida']);
    if (hv && sync && fit) add('MH-022', 'Alto volume sincrônico, apto a docetaxel: terapia tripla ADT + docetaxel 75 mg/m² × 6 + abiraterona (PEACE-1) ou + darolutamida (ARASENS).', 'forte', 'EAU 2026; NCCN categoria 1', ['adt', 'docetaxel', 'abiraterona', 'darolutamida']);
    if (!hv && !sync) add('MH-023', 'Baixo volume metacrônico: não oferecer terapia tripla.', 'nao', 'EAU 2026 (forte, contra)');
    if (hrr || brca) add('MH-024', 'HRR positivo' + (brca ? ' (BRCA)' : '') + ': ADT + abiraterona + niraparibe (AMPLITUDE) como opção adicional.', 'fraca', 'EAU 2026', ['adt', 'abiraterona', 'niraparibe']);
    add('MH-025', 'ADT + docetaxel sem ARPI: não oferecer (inferior à terapia tripla).', 'nao', 'EAU 2026 (forte, contra)');
    if (p.risco_cv === 'sim') add('MH-026', 'Risco cardiovascular/DM: preferir ARPI sem corticoide (apalutamida, enzalutamida, darolutamida) a abiraterona; antagonista LHRH.', 'alerta', 'SAU-010');
    if (p.cognicao === 'sim' || p.quedas === 'sim') add('MH-027', 'Déficit cognitivo, quedas ou fragilidade: preferir darolutamida ou abiraterona a enzalutamida/apalutamida.', 'alerta', 'SAU-012/013');
    if (!hv && sync && p.tratamento_local === 'nao') add('MH-030', 'Baixo volume sincrônico sem tratamento local prévio: RT à próstata (até 72 Gy equivalente; ex.: 55 Gy/20 fx) + terapia sistêmica.', 'forte', 'EAU 2026; NCCN categoria 1', ['rt']);
    if (hv) add('MH-031', 'Alto volume: não irradiar o primário com intenção de sobrevida (paliativo se sintomas locais).', 'nao', 'EAU 2026 (forte, contra)');
    add('MH-032', 'Prostatectomia citorredutora só em ensaio clínico.', 'ensaio', 'EAU 2026 (forte)');
    add('MH-033', 'Terapia dirigida à metástase (SBRT) só em ensaio ou coorte prospectiva.', 'ensaio', 'EAU 2026 (forte)');
    add('MH-040', 'Densitometria basal; cálcio + vitamina D; antirreabsortivo se T-score < −2,5, fator de risco adicional ou perda > 5%/ano.', 'forte', 'EAU 2026', ['zoledronico', 'denosumabe']);
    add('MH-041', 'Terapia combinada: proteção óssea para evitar fraturas (denosumabe 60 mg/6 meses ou zoledrônico em dose de osteoporose; monitorar cálcio).', 'forte', 'EAU 2026', ['denosumabe', 'zoledronico']);
    if (symp === 'dor') add('MH-042', 'Dor óssea: RT paliativa precoce + analgesia adequada.', 'forte', 'EAU 2026', ['rt']);
    if (symp === 'medular') add('MH-043', 'Compressão medular: corticoide em alta dose imediato; avaliar cirurgia, depois RT; RT isolada se cirurgia inadequada.', 'forte', 'EAU 2026', ['rt']);
    add('MH-044', 'Seguimento: PSA + testosterona a cada 3–6 meses; imagem em intervalos regulares; rastrear síndrome metabólica (Hb, creatinina, FA, lipídios, HbA1c).', 'forte', 'EAU 2026');
    add('MH-045', 'Em ADT: exercício aeróbico + resistido supervisionado por 12 semanas; peso, dieta, parar de fumar, álcool ≤ 2 unidades/dia; densitometria.', 'forte', 'EAU 2026');
    return { out, info };
  }

  /* ---------- Módulo 10 – CRPC ---------- */
  function crpc(p) {
    const out = [], info = {};
    const add = (id, text, strength, src, br) => out.push({ id, text, strength, src, br: br || [] });
    const testo = num(p.testosterona);
    if (testo === null || testo >= 50) { add('CR-001', 'Testosterona ' + (testo === null ? 'não confirmada abaixo de 50 ng/dL' : testo + ' ng/dL') + ': confirmar < 50 ng/dL (1,7 nmol/L) antes de classificar como CRPC; manter castração.', 'forte', 'EAU 2026'); return { out, info: { status: 'Castração não confirmada' } }; }
    const met = p.metastases || 'nenhuma';
    const nm = met === 'nenhuma';
    const dt = num(p.psa_dt);
    const arpi = p.arpi_previo || 'nao', doce = p.docetaxel_previo === 'sim';
    const hrr = p.hrr === 'pos', brca = p.brca === 'sim', msi = p.msi === 'sim';
    const psma = p.psma || 'nr';
    const symp = p.sintomas || 'nao', fit = p.docetaxel_apto === 'sim';
    const boneOnly = met === 'osso';
    info.status = nm ? 'nmCRPC (M0 em imagem convencional)' : 'mCRPC';
    add('CR-002', 'Equipe multidisciplinar; teste somático e/ou germinativo (HRR) + MSI/dMMR se ainda não feito; manter castração em todas as linhas.', 'forte', 'EAU 2026', ['germinativo']);
    if (nm) {
      if (dt !== null && dt <= 10) add('CR-010', 'nmCRPC com PSA-DT ' + (p.psa_dt_exato === false ? '≤ 10 meses' : dt + ' meses (≤ 10)') + ': apalutamida 240 mg, darolutamida 600 mg 2×/dia ou enzalutamida 160 mg, com ADT.', 'forte', 'EAU 2026; NCCN categoria 1', ['apalutamida', 'darolutamida', 'enzalutamida', 'adt']);
      else add('CR-011', 'nmCRPC com PSA-DT > 10 meses (ou não calculado): observação com ADT; PSMA-PET se mudar conduta (frequentemente reclassifica como mCRPC).', 'fraca', 'EAU 2026; NCCN', ['psma', 'adt']);
      return { out, info };
    }
    add('CR-003', 'Tratar com agentes que prolongam sobrevida; escolha por ECOG, sintomas, comorbidades, sítios, genômica, preferência e tratamento prévio no mHSPC.', 'forte', 'EAU 2026');
    if (arpi !== 'nao') add('CR-004', 'ARPI prévio (' + (arpi === 'mhspc' ? 'no mHSPC' : 'no mCRPC') + '): evitar sequenciar outro ARPI.', 'nao', 'EAU 2026 (fraca, contra)');
    if (!doce) {
      if (arpi === 'nao') {
        if (!hrr) add('CR-020', 'Sem ARPI prévio, HRR negativo/desconhecido: abiraterona + prednisona, ou enzalutamida.', 'forte', 'EAU 2026; NCCN categoria 1', ['abiraterona', 'enzalutamida']);
        if (fit) add('CR-021', 'Apto a quimioterapia: docetaxel 75 mg/m² a cada 3 semanas + prednisona.', 'forte', 'EAU 2026; NCCN categoria 1', ['docetaxel']);
        if (hrr) add('CR-022', 'HRR positivo, sem ARPI prévio: abiraterona + olaparibe (PROpel).', 'forte', 'EAU 2026; NCCN categoria 1', ['abiraterona', 'parp']);
        if (brca) add('CR-023', 'BRCA1/2 positivo, sem ARPI prévio: abiraterona + niraparibe (MAGNITUDE).', 'forte', 'EAU 2026; NCCN categoria 1', ['abiraterona', 'niraparibe']);
        if (hrr) add('CR-024', 'HRR positivo, sem ARPI prévio: enzalutamida + talazoparibe (TALAPRO-2).', 'forte', 'EAU 2026; NCCN categoria 1', ['enzalutamida', 'parp']);
        if (!hrr) add('CR-025', 'HRR negativo, aceita toxicidade extra: enzalutamida + talazoparibe.', 'fraca', 'EAU 2026', ['enzalutamida', 'parp']);
        if (boneOnly && symp === 'nao') add('CR-030', 'Osso apenas, assintomático ou levemente sintomático, sem ARPI prévio: enzalutamida + rádio-223 (PEACE III), com proteção óssea obrigatória.', 'forte', 'EAU 2026', ['enzalutamida', 'ra223']);
      } else {
        if (fit) add('CR-026', 'ARPI prévio no mHSPC, progressão, apto a docetaxel: docetaxel 75 mg/m² a cada 3 semanas.', 'forte', 'EAU 2026', ['docetaxel']);
        if (psma === 'avido') add('CR-027', 'ARPI prévio, PSMA-ávido sem lesões discordantes, não apto ou recusa docetaxel: Lu-177-PSMA-617 7,4 GBq a cada 6 semanas × 6 (PSMAfore).', fit ? 'fraca' : 'forte', 'EAU 2026 (fraca); NCCN categoria 1', ['lu', 'psma']);
        if (hrr) add('CR-044', 'Mutação HRR relevante: PARP em monoterapia (olaparibe, rucaparibe se BRCA, talazoparibe).', 'forte', 'EAU 2026; NCCN', ['parp']);
      }
      if (boneOnly && symp !== 'nao' && !fit) add('CR-029', 'Osso apenas, sintomático, sem visceral, não apto/recusa quimioterapia: rádio-223 55 kBq/kg × 6, com proteção óssea obrigatória.', 'forte', 'EAU 2026; NCCN categoria 1', ['ra223']);
    } else {
      add('CR-040', 'Progressão após docetaxel: opções que prolongam sobrevida: ' + (arpi === 'nao' ? 'abiraterona ou enzalutamida, ' : '') + 'cabazitaxel, rádio-223 (osso apenas), olaparibe (HRR), Lu-PSMA (PSMA-ávido).', 'forte', 'EAU 2026', ['cabazitaxel']);
      if (p.cabazitaxel_previo !== 'sim') add('CR-041', 'Docetaxel prévio: cabazitaxel 20–25 mg/m² a cada 3 semanas' + (arpi !== 'nao' && p.arpi_progressao12 === 'sim' ? ', preferido a outro ARPI (progressão ≤ 12 meses com ARPI – CARD)' : '') + '.', 'forte', 'EAU 2026; NCCN categoria 1', ['cabazitaxel']);
      if (arpi !== 'nao' && psma === 'avido') add('CR-043', 'ARPI + docetaxel prévios, PSMA-ávido sem lesões discordantes: Lu-177-PSMA-617 (VISION).', 'forte', 'EAU 2026; NCCN categoria 1', ['lu', 'psma']);
      if (hrr) add('CR-044', 'Mutação HRR relevante, pré-tratado: PARP em monoterapia (olaparibe para BRCA/ATM, rucaparibe para BRCA, talazoparibe).', 'forte', 'EAU 2026; NCCN categoria 1 (BRCA)', ['parp']);
      if (boneOnly && symp !== 'nao') add('CR-045', 'Osso apenas, sintomático, pós-docetaxel: rádio-223.', 'forte', 'EAU 2026; NCCN categoria 1', ['ra223']);
      if (p.linhas_esgotadas === 'sim') add('CR-046', 'Linhas esgotadas, ECOG ≤ 2: ensaio clínico; mitoxantrona paliativa; cuidados paliativos.', 'moderada', 'NCCN');
    }
    if (msi) add('CR-028', 'MSI-H ou dMMR: pembrolizumabe após ≥ 1 linha.', 'moderada', 'NCCN 2A', ['pembro']);
    if (psma === 'discordante') add('CR-027x', 'PSMA-PET com lesões discordantes (não ávidas): Lu-PSMA não indicado; considerar PET-FDG para caracterizar clones.', 'alerta', 'EAU 2026 / VISION');
    if (met !== 'linfonodo') add('CR-050', 'Metástase óssea: denosumabe 120 mg a cada 4 semanas ou ácido zoledrônico 4 mg a cada 3–4 semanas; avaliação odontológica prévia; cálcio + vitamina D.', 'forte', 'EAU 2026', ['denosumabe', 'zoledronico']);
    add('CR-052', 'Seguimento: PSA, testosterona, hemograma, função renal/hepática, FA a cada 3 meses; imagem por PCWG3; não suspender tratamento só por PSA nas primeiras 12 semanas.', 'forte', 'EAU 2026');
    return { out, info };
  }

  /* ---------- avaliação completa (etapas 1–5) ---------- */
  function evaluate(S) {
    const d = derive(S);
    const n = nccn(d), e = eau(d);
    const div = divergence(d, n, e);
    const sg = siog(S);
    const le = expectancy(S, sg);
    const leAnos = le ? le.anos : null;
    const va = activeSurveillance(d, n, e, leAnos);
    const ctx = { le: leAnos, siog: sg, guia: S.guia || 'ambas', va, urinario: S.urinario, asa: S.asa, health: S, contexto: S.contexto || 'privado', ashkenazi: S.ashkenazi };
    const tx = (d.cM === 'M0') ? treatment(d, n, e, ctx) : [];
    const st = staging(d, n, e, ctx);
    const al = alerts(d, n, e, ctx);
    const stage = ajcc(d);
    const cp = capra(d);
    const tnm = 'c' + d.cT + ' c' + d.cN + ' c' + d.cM;
    return { d, nccn: n, eau: e, divergence: div, siog: sg, le, va, tx, staging: st, alerts: al.alerts, pending: al.pending, ajcc: stage, capra: cp, tnm, rulesVersion: RULES_VERSION, reviewDate: REVIEW_DATE };
  }

  return { RULES_VERSION, REVIEW_DATE, STRENGTH, BR, BR_LABEL, brTag, GG_FROM, derive, nccn, eau, divergence, ajcc, capra, siog, expectancy, charlson, staging, activeSurveillance, treatment, alerts, preDx, psaDT, bcr, mhspc, crpc, evaluate, baseLifeExp };
})();

/* Posologia – doses, vias, intervalos e tempo de uso (EAU 2026, NCCN v5.2026 e bulas).
   Cada entrada: nome, esquema (dose/via/intervalo), duracao (tempo de uso), obs (monitorização e ajustes).
   Revisão clínica obrigatória antes do uso assistencial. */
const DOSES = {
  /* ---- bloqueio hormonal (ADT) ---- */
  adt_agentes: { cat: 'Bloqueio hormonal (ADT)', nome: 'Agentes de castração', esquema: 'Leuprorrelina 7,5 mg IM a cada 4 semanas, 22,5 mg a cada 12 semanas ou 45 mg a cada 24 semanas · Goserelina 3,6 mg SC a cada 4 semanas ou 10,8 mg a cada 12 semanas · Triptorrelina 3,75 mg IM a cada 4 semanas, 11,25 mg a cada 12 semanas ou 22,5 mg a cada 24 semanas · Degarelix 240 mg SC (2 × 120 mg) no dia 1, depois 80 mg SC a cada 28 dias · Relugolix 360 mg VO no dia 1, depois 120 mg VO 1×/dia · Orquiectomia bilateral', duracao: 'Conforme a indicação (ver duração em cada conduta); confirmar castração (testosterona < 50 ng/dL) em 1–3 meses', obs: 'Agonista: cobrir o flare com bicalutamida 50 mg VO 1×/dia por 2–4 semanas, iniciando junto ou até 7 dias antes. Antagonista ou orquiectomia quando há compressão medular ou obstrução iminente. Relugolix: confirmar registro ANVISA.' },
  adt_curta: { cat: 'Bloqueio hormonal (ADT)', nome: 'ADT curta com radioterapia', esquema: 'Um dos agentes de castração acima', duracao: '4–6 meses no total (NCCN: iniciar 2 meses antes da radioterapia e manter até 4–6 meses; EAU: 4–6 meses)', obs: 'Risco intermediário desfavorável; opcional no favorável.' },
  adt_longa: { cat: 'Bloqueio hormonal (ADT)', nome: 'ADT longa com radioterapia', esquema: 'Um dos agentes de castração acima', duracao: '2–3 anos (EAU); 18–36 meses (NCCN), iniciada 2–3 meses antes da radioterapia', obs: 'Alto risco localizado, localmente avançado e cN1. Densitometria basal, cálcio + vitamina D, exercício supervisionado.' },
  adt_3anos: { cat: 'Bloqueio hormonal (ADT)', nome: 'ADT 3 anos com abiraterona 2 anos', esquema: 'Agente de castração + abiraterona 1.000 mg VO 1×/dia em jejum + prednisona 5 mg VO 1×/dia', duracao: 'ADT por 3 anos; abiraterona + prednisona por 2 anos, iniciadas com a ADT (STAMPEDE)', obs: 'cN0M0 com ≥ 2 de cT3–4, Gleason ≥ 8, PSA ≥ 40; e cN1M0. Monitorar PA, potássio e transaminases.' },
  adt_srt: { cat: 'Bloqueio hormonal (ADT)', nome: 'Hormonioterapia com radioterapia de resgate', esquema: 'Agente de castração (GETUG-AFU 16: goserelina 10,8 mg SC × 2)', duracao: '6 meses (GETUG-AFU 16); 2 anos quando PSA pré-resgate > 0,7 ng/mL ou alto risco (RTOG 9601 usou bicalutamida 150 mg VO 1×/dia por 24 meses; na prática atual, ADT)', obs: 'Iniciar junto com a radioterapia.' },
  adt_continua: { cat: 'Bloqueio hormonal (ADT)', nome: 'ADT contínua', esquema: 'Um dos agentes de castração acima', duracao: 'Contínua, até progressão para resistência à castração ou toxicidade inaceitável', obs: 'Doença metastática e EMBARK. Intermitente só em recorrência bioquímica selecionada, sem metástase.' },
  bicalutamida_flare: { cat: 'Bloqueio hormonal (ADT)', nome: 'Bicalutamida (cobertura do flare)', esquema: '50 mg VO 1×/dia', duracao: '2–4 semanas, iniciando junto ou até 7 dias antes do agonista LHRH', obs: 'Não usar antiandrogênio de 1ª geração em monoterapia na doença metastática.' },
  /* ---- ARPIs ---- */
  abiraterona: { cat: 'Inibidores da via do receptor androgênico (ARPI)', nome: 'Abiraterona', esquema: '1.000 mg VO 1×/dia em jejum (≥ 1 h antes ou ≥ 2 h após refeição) + prednisona 5 mg VO 1×/dia (mHSPC e doença localizada) ou 5 mg VO 2×/dia (mCRPC)', duracao: 'Doença localizada (STAMPEDE): 2 anos. Metastática: até progressão ou toxicidade inaceitável', obs: 'PA, potássio e ALT/AST a cada 2 semanas nos 3 primeiros meses, depois mensal. Hipocalemia, hipertensão, edema, hepatotoxicidade. Reduzir para 500 mg se ALT/AST > 5× LSN até normalizar.' },
  enzalutamida: { cat: 'Inibidores da via do receptor androgênico (ARPI)', nome: 'Enzalutamida', esquema: '160 mg VO 1×/dia (4 cápsulas de 40 mg ou 2 comprimidos de 80 mg), com ou sem alimento', duracao: 'Até progressão ou toxicidade inaceitável (EMBARK: com ADT contínua, ou em monoterapia)', obs: 'Fadiga, quedas, hipertensão, risco de convulsão; forte indutor de CYP3A4 e CYP2C19 (revisar interações). Reduzir para 120 mg ou 80 mg por toxicidade grau ≥ 3.' },
  apalutamida: { cat: 'Inibidores da via do receptor androgênico (ARPI)', nome: 'Apalutamida', esquema: '240 mg VO 1×/dia (4 comprimidos de 60 mg ou 2 de 120 mg), com ou sem alimento', duracao: 'Até progressão ou toxicidade inaceitável', obs: 'Rash (suspender e retomar com 180 ou 120 mg), hipotireoidismo (TSH a cada 4 meses), fraturas e quedas; indutor de CYP3A4.' },
  darolutamida: { cat: 'Inibidores da via do receptor androgênico (ARPI)', nome: 'Darolutamida', esquema: '600 mg VO 2×/dia (2 comprimidos de 300 mg por tomada), com alimento', duracao: 'Até progressão ou toxicidade inaceitável. ARASENS: docetaxel 6 ciclos iniciados em até 6 semanas após o início da darolutamida', obs: 'Menor penetração no SNC (preferida em cognição alterada ou quedas); aumenta exposição à rosuvastatina (BCRP). Reduzir para 300 mg 2×/dia por toxicidade grau ≥ 3.' },
  /* ---- quimioterapia ---- */
  docetaxel_mhspc: { cat: 'Quimioterapia', nome: 'Docetaxel no mHSPC (terapia tripla)', esquema: '75 mg/m² IV em 1 h a cada 21 dias, sem prednisona obrigatória; pré-medicação com dexametasona 8 mg VO 12 h, 3 h e 1 h antes', duracao: '6 ciclos (18 semanas), iniciados em até 2–4 meses após o início da ADT; o ARPI segue até progressão', obs: 'Hemograma antes de cada ciclo; G-CSF profilático se risco de neutropenia febril ≥ 20% ou idade ≥ 65 com comorbidades. Neuropatia, retenção hídrica, onicopatia.' },
  docetaxel_mcrpc: { cat: 'Quimioterapia', nome: 'Docetaxel no mCRPC', esquema: '75 mg/m² IV em 1 h a cada 21 dias + prednisona 5 mg VO 2×/dia; pré-medicação com dexametasona 8 mg VO 12 h, 3 h e 1 h antes. Alternativa em frágeis: 50 mg/m² a cada 14 dias', duracao: 'Até progressão ou toxicidade; habitualmente até 10 ciclos (30 semanas)', obs: 'Hemograma antes de cada ciclo; reduzir para 60 mg/m² por neutropenia febril ou neuropatia grau 2. Não suspender só por PSA nas primeiras 12 semanas.' },
  cabazitaxel: { cat: 'Quimioterapia', nome: 'Cabazitaxel', esquema: '20 mg/m² IV em 1 h a cada 21 dias (25 mg/m² em pacientes selecionados) + prednisona 10 mg VO 1×/dia; pré-medicação 30 min antes: anti-histamínico H1, corticoide e antagonista H2', duracao: 'Até progressão ou toxicidade; habitualmente até 10 ciclos', obs: 'G-CSF profilático recomendado (neutropenia febril). Diarreia, neutropenia, hematúria. Hemograma a cada ciclo; contraindicado com neutrófilos < 1.500 ou hepatopatia grave.' },
  mitoxantrona: { cat: 'Quimioterapia', nome: 'Mitoxantrona (paliativa)', esquema: '12 mg/m² IV a cada 21 dias + prednisona 5 mg VO 2×/dia', duracao: 'Até progressão; dose cumulativa máxima 140 mg/m² (cardiotoxicidade)', obs: 'Só para paliação de sintomas após esgotar linhas com ganho de sobrevida. Ecocardiograma basal.' },
  /* ---- PARP ---- */
  olaparibe: { cat: 'Inibidores de PARP', nome: 'Olaparibe', esquema: '300 mg VO 2×/dia (2 comprimidos de 150 mg por tomada), com ou sem alimento; em combinação, abiraterona 1.000 mg/dia + prednisona 5 mg 2×/dia (PROpel)', duracao: 'Até progressão ou toxicidade inaceitável', obs: 'Anemia (hemograma mensal), náusea, fadiga, tromboembolismo, pneumonite rara. Reduzir para 250 mg e depois 200 mg 2×/dia. Ajustar com CrCl 31–50 mL/min (200 mg 2×/dia).' },
  niraparibe_abi: { cat: 'Inibidores de PARP', nome: 'Niraparibe + abiraterona', esquema: 'Niraparibe 200 mg + abiraterona 1.000 mg VO 1×/dia (2 comprimidos combinados de 100 mg/500 mg), em jejum, + prednisona 5 mg VO 2×/dia no mCRPC (MAGNITUDE) ou 5 mg 1×/dia no mHSPC (AMPLITUDE)', duracao: 'Até progressão ou toxicidade inaceitável', obs: 'Anemia, trombocitopenia, hipertensão; hemograma mensal no primeiro ano. Indicado com mutação BRCA1/2 (mCRPC) ou HRR (mHSPC).' },
  talazoparibe_enza: { cat: 'Inibidores de PARP', nome: 'Talazoparibe + enzalutamida', esquema: 'Talazoparibe 0,5 mg VO 1×/dia (0,35 mg se CrCl 30–59 mL/min) + enzalutamida 160 mg VO 1×/dia', duracao: 'Até progressão ou toxicidade inaceitável', obs: 'Anemia grau ≥ 3 em cerca de 40% (transfusão frequente); reduzir para 0,35 e 0,25 mg. Hemograma mensal.' },
  rucaparibe: { cat: 'Inibidores de PARP', nome: 'Rucaparibe', esquema: '600 mg VO 2×/dia (2 comprimidos de 300 mg por tomada)', duracao: 'Até progressão ou toxicidade inaceitável (mCRPC com BRCA1/2 após ARPI)', obs: 'Anemia, elevação de transaminases, fotossensibilidade. Reduzir para 500, 400 e 300 mg 2×/dia.' },
  parp_mono: { cat: 'Inibidores de PARP', nome: 'PARP em monoterapia (pré-tratado)', esquema: 'Olaparibe 300 mg VO 2×/dia (BRCA1/2, ATM e outros HRR) · Rucaparibe 600 mg VO 2×/dia (BRCA1/2) · Talazoparibe 1 mg VO 1×/dia (uso fora de bula em próstata)', duracao: 'Até progressão ou toxicidade inaceitável', obs: 'Testar HRR somático e germinativo antes; hemograma mensal.' },
  /* ---- radiofármacos ---- */
  lu_psma: { cat: 'Radiofármacos', nome: 'Lutécio-177-PSMA-617', esquema: '7,4 GBq (200 mCi) IV a cada 6 semanas, com hidratação', duracao: 'Até 6 ciclos (36 semanas), ou até progressão/toxicidade', obs: 'Critérios: PSMA-PET com captação acima do fígado em todas as lesões mensuráveis, sem lesões discordantes. Hemograma, creatinina e TFG antes de cada ciclo (Hb ≥ 8–9, plaquetas ≥ 75.000, TFG ≥ 30–40). Xerostomia, mielossupressão, náusea.' },
  ra223: { cat: 'Radiofármacos', nome: 'Rádio-223', esquema: '55 kBq/kg IV a cada 4 semanas', duracao: '6 ciclos (24 semanas)', obs: 'Só metástases ósseas sem visceral; obrigatório antirreabsortivo concomitante (denosumabe ou zoledrônico) para reduzir fraturas. Antes de cada dose: Hb ≥ 10 g/dL (1ª dose), neutrófilos ≥ 1.500, plaquetas ≥ 100.000 (1ª) ou ≥ 50.000 (seguintes). Não combinar com abiraterona (ERA 223).' },
  /* ---- osso e suporte ---- */
  zoledronico_met: { cat: 'Proteção óssea e suporte', nome: 'Ácido zoledrônico (metástase óssea, mCRPC)', esquema: '4 mg IV em ≥ 15 min a cada 3–4 semanas; ajuste por CrCl: 3,5 mg (50–60), 3,3 mg (40–49), 3,0 mg (30–39 mL/min); contraindicado < 30', duracao: 'Enquanto houver benefício; reavaliar após 1–2 anos (intervalo de 12 semanas aceitável)', obs: 'Avaliação odontológica prévia (osteonecrose de mandíbula); cálcio 1.000–1.200 mg/dia e vitamina D 800–1.000 UI/dia; creatinina antes de cada dose.' },
  zoledronico_osteo: { cat: 'Proteção óssea e suporte', nome: 'Ácido zoledrônico (perda óssea por ADT)', esquema: '4–5 mg IV 1×/ano', duracao: 'Durante a ADT longa; reavaliar pela densitometria a cada 1–2 anos', obs: 'Indicado com T-score < −2,5, fator de risco adicional ou perda > 5%/ano.' },
  denosumabe_met: { cat: 'Proteção óssea e suporte', nome: 'Denosumabe (metástase óssea, mCRPC)', esquema: '120 mg SC a cada 4 semanas', duracao: 'Enquanto houver benefício; reavaliar após 1–2 anos', obs: 'Hipocalcemia (dosar cálcio; repor cálcio + vitamina D), osteonecrose de mandíbula; sem ajuste renal, mas risco maior de hipocalcemia se CrCl < 30.' },
  denosumabe_osteo: { cat: 'Proteção óssea e suporte', nome: 'Denosumabe (perda óssea por ADT)', esquema: '60 mg SC a cada 6 meses', duracao: 'Durante a ADT longa; ao suspender, considerar bisfosfonato (rebote de fraturas vertebrais)', obs: 'Cálcio + vitamina D concomitantes.' },
  calcio_vitd: { cat: 'Proteção óssea e suporte', nome: 'Cálcio e vitamina D', esquema: 'Cálcio 1.000–1.200 mg/dia (dieta + suplemento) e colecalciferol 800–1.000 UI/dia', duracao: 'Durante toda a ADT e com qualquer antirreabsortivo', obs: 'Dosar 25-OH-vitamina D e cálcio sérico no início.' },
  dexametasona_medular: { cat: 'Proteção óssea e suporte', nome: 'Compressão medular', esquema: 'Dexametasona 10 mg IV em bolus, depois 16 mg/dia (4 mg a cada 6 h) com redução progressiva em 1–2 semanas após a radioterapia; proteção gástrica', duracao: 'Até o término da radioterapia, com desmame', obs: 'Cirurgia descompressiva seguida de RT se candidato; RT isolada se não.' },
  pembrolizumabe: { cat: 'Imunoterapia', nome: 'Pembrolizumabe (MSI-H/dMMR)', esquema: '200 mg IV a cada 3 semanas ou 400 mg IV a cada 6 semanas', duracao: 'Até progressão, toxicidade inaceitável ou 2 anos', obs: 'Vigiar toxicidade imunomediada (tireoide, fígado, pulmão, colite); TSH e função hepática a cada ciclo.' },
  /* ---- radioterapia ---- */
  rt_conv: { cat: 'Radioterapia', nome: 'Radioterapia externa convencional', esquema: '76–78 Gy em 38–39 frações de 1,8–2,0 Gy, IMRT/VMAT com IGRT diária', duracao: '7,5–8 semanas, 5 frações por semana', obs: 'Com ADT curta (intermediário desfavorável) ou longa (alto risco). Marcadores fiduciais ou cone-beam CT diário.' },
  rt_hipo: { cat: 'Radioterapia', nome: 'Hipofracionamento moderado', esquema: '60 Gy em 20 frações de 3 Gy, ou 70 Gy em 28 frações de 2,5 Gy, IMRT/VMAT com IGRT', duracao: '4 semanas (60 Gy/20) ou 5,5 semanas (70 Gy/28)', obs: 'Equivalente ao convencional em controle e toxicidade (CHHiP, PROFIT). Preferido pela EAU e NCCN quando disponível.' },
  sbrt: { cat: 'Radioterapia', nome: 'Ultra-hipofracionamento (SBRT)', esquema: '36,25 Gy em 5 frações de 7,25 Gy (40 Gy à próstata) ou 42,7 Gy em 7 frações de 6,1 Gy em dias alternados', duracao: '1–2 semanas (5 frações) ou 2,5 semanais (7 frações)', obs: 'Baixo risco e intermediário favorável com boa função urinária; volume prostático ≤ 80–100 cc; IGRT com marcadores ou rastreamento.' },
  boost_focal: { cat: 'Radioterapia', nome: 'Boost focal na lesão da RM', esquema: 'Boost integrado até 95 Gy na lesão dominante (FLAME), dentro de 77 Gy em 35 frações de 2,2 Gy à próstata, respeitando limites de reto, bexiga e uretra', duracao: '7 semanas', obs: 'Fracionamento convencional; não exceder restrições de órgãos de risco.' },
  braqui_ldr_mono: { cat: 'Radioterapia', nome: 'Braquiterapia LDR em monoterapia', esquema: 'Iodo-125, dose prescrita 145 Gy (ou paládio-103, 125 Gy), implante permanente único', duracao: 'Procedimento único; decaimento ao longo de meses', obs: 'Volume ≤ 50–60 cc, IPSS < 15–20, sem RTU prévia extensa. Baixo risco e intermediário favorável.' },
  braqui_ldr_boost: { cat: 'Radioterapia', nome: 'Braquiterapia LDR como boost', esquema: 'Iodo-125, 110 Gy (ou paládio-103, 90–100 Gy) + radioterapia externa 45–50 Gy em 25 frações (ou 37,5 Gy em 15)', duracao: 'Externa em 3–5 semanas + implante único (antes ou 2–4 semanas após)', obs: 'Com ADT 4–6 meses (intermediário desfavorável) ou 2–3 anos (alto risco). Toxicidade urinária maior que externa isolada.' },
  braqui_hdr_boost: { cat: 'Radioterapia', nome: 'Braquiterapia HDR como boost', esquema: 'Irídio-192, 15 Gy em 1 fração (ASCENDE-RT) ou 2 × 9–10,5 Gy, + radioterapia externa 45–46 Gy em 23–25 frações', duracao: 'Externa em 4,5–5 semanas + 1–2 sessões de HDR', obs: 'Com ADT conforme o grupo de risco; boa função urinária.' },
  rt_pelve: { cat: 'Radioterapia', nome: 'Radioterapia pélvica eletiva', esquema: '45–50,4 Gy em frações de 1,8 Gy aos linfonodos pélvicos (ou 44 Gy em 20), com boost sequencial ou integrado à próstata até a dose total', duracao: '5–5,5 semanas para a fase pélvica, dentro do curso total', obs: 'cN1 (obrigatória, EAU) e risco nodal elevado em cN0 (NCCN, considerar). Sempre com ADT longa.' },
  rt_adjuvante: { cat: 'Radioterapia', nome: 'Radioterapia adjuvante pós-prostatectomia', esquema: '60–66 Gy em 30–33 frações de 2 Gy à loja prostática, IMRT/VMAT com IGRT', duracao: '6–6,5 semanas, iniciada após continência (3–6 meses da cirurgia)', obs: 'pT3 com GG4–5 ± margem positiva (EAU, fraca); a maioria prefere resgate precoce.' },
  rt_resgate: { cat: 'Radioterapia', nome: 'Radioterapia de resgate pós-prostatectomia', esquema: '≥ 64 Gy à loja; habitualmente 66–70 Gy em 33–35 frações de 2 Gy (ou 52,5 Gy em 20 frações), ± pelve 45–50 Gy; IMRT/VMAT com IGRT', duracao: '6,5–7 semanas (ou 4 semanas no hipofracionado); iniciar logo após a decisão, sem aguardar limiar de PSA', obs: 'Com hormonioterapia 6 meses (ou 2 anos se PSA > 0,7). Incluir pelve se N1 no PSMA-PET.' },
  rt_primario_m1: { cat: 'Radioterapia', nome: 'Radioterapia da próstata no mHSPC de baixo volume', esquema: '55 Gy em 20 frações de 2,75 Gy (STAMPEDE) ou 36 Gy em 6 frações semanais de 6 Gy, sem pelve', duracao: '4 semanas (20 frações) ou 6 semanas (6 frações semanais)', obs: 'Só sincrônico de baixo volume, junto com ADT + ARPI. Sem benefício em alto volume.' },
  rt_paliativa: { cat: 'Radioterapia', nome: 'Radioterapia paliativa óssea', esquema: '8 Gy em fração única (dor sem fratura iminente; reirradiação possível) ou 20 Gy em 5 frações; 30 Gy em 10 frações se risco de fratura ou massa de partes moles', duracao: '1 dia, 1 semana ou 2 semanas', obs: 'Analgesia concomitante conforme escada da OMS; antirreabsortivo.' },
  rt_medular: { cat: 'Radioterapia', nome: 'Radioterapia na compressão medular', esquema: '20 Gy em 5 frações ou 30 Gy em 10 frações (8 Gy em fração única se expectativa curta), após dexametasona', duracao: '1–2 semanas; iniciar em até 24 h do diagnóstico', obs: 'Cirurgia descompressiva antes da RT quando candidato (déficit < 48 h, lesão única, expectativa > 3 meses).' },
  sbrt_oligo: { cat: 'Radioterapia', nome: 'SBRT em oligometástases (só em estudo)', esquema: '24 Gy em 2 frações, 30 Gy em 3 frações ou 30–35 Gy em 5 frações, conforme o sítio', duracao: '1–2 semanas', obs: 'EAU: somente em ensaio ou coorte prospectiva; NCCN: SBRT ± ADT (2A). Restrições de medula e intestino.' },
};

/* Mapa: id da regra → esquemas exibidos */
const OPT_DOSES = {
  'TXL-004': ['rt_conv', 'rt_hipo', 'braqui_ldr_mono'],
  'TXI-004': ['braqui_ldr_mono'],
  'TXI-005': ['rt_conv', 'rt_hipo', 'adt_curta', 'adt_agentes'],
  'TXI-006': ['sbrt'],
  'TXI-007': ['boost_focal'], 'TXU-005': ['boost_focal'], 'TXH-004': ['boost_focal'],
  'TXU-003': ['rt_conv', 'rt_hipo', 'adt_curta', 'adt_agentes'],
  'TXU-004': ['braqui_ldr_boost', 'braqui_hdr_boost', 'adt_curta', 'adt_agentes'],
  'TXH-003': ['rt_conv', 'rt_hipo', 'adt_longa', 'adt_agentes'],
  'TXH-005': ['braqui_ldr_boost', 'braqui_hdr_boost', 'adt_longa', 'adt_agentes'],
  'TXH-006': ['rt_conv', 'adt_3anos', 'abiraterona', 'adt_agentes'],
  'TXH-007': ['rt_pelve'],
  'TXH-008': ['adt_continua', 'adt_agentes'],
  'TXA-005': ['rt_conv', 'rt_pelve', 'adt_3anos', 'abiraterona', 'adt_agentes'],
  'TXF-002': ['adt_continua', 'adt_agentes'],
  'TXP-002': ['rt_adjuvante'], 'TXP-003': ['rt_resgate', 'adt_srt'],
  'SAU-011': ['calcio_vitd', 'denosumabe_osteo', 'zoledronico_osteo'],
  'BCR-031': ['rt_resgate'], 'BCR-032': ['adt_srt', 'adt_agentes'], 'BCR-033': ['rt_resgate', 'rt_pelve', 'adt_srt'],
  'BCR-035': ['enzalutamida', 'adt_continua', 'adt_agentes'], 'BCR-043': ['enzalutamida', 'adt_continua', 'adt_agentes'],
  'BCR-036': ['adt_continua', 'adt_agentes'], 'BCR-051': ['sbrt_oligo'],
  'MH-011': ['adt_agentes'], 'MH-012': ['bicalutamida_flare'], 'MH-014x': ['adt_continua', 'adt_agentes'],
  'MH-020': ['adt_continua', 'adt_agentes', 'abiraterona', 'apalutamida', 'enzalutamida'],
  'MH-021': ['darolutamida', 'adt_continua'],
  'MH-022': ['docetaxel_mhspc', 'abiraterona', 'darolutamida', 'adt_continua'],
  'MH-024': ['niraparibe_abi', 'adt_continua'],
  'MH-030': ['rt_primario_m1'], 'MH-040': ['calcio_vitd', 'denosumabe_osteo', 'zoledronico_osteo'], 'MH-041': ['denosumabe_osteo', 'zoledronico_osteo', 'calcio_vitd'],
  'MH-042': ['rt_paliativa'], 'MH-043': ['dexametasona_medular', 'rt_medular'],
  'CR-010': ['apalutamida', 'darolutamida', 'enzalutamida', 'adt_continua'],
  'CR-020': ['abiraterona', 'enzalutamida'], 'CR-021': ['docetaxel_mcrpc'], 'CR-022': ['olaparibe', 'abiraterona'], 'CR-023': ['niraparibe_abi'],
  'CR-024': ['talazoparibe_enza'], 'CR-025': ['talazoparibe_enza'], 'CR-026': ['docetaxel_mcrpc'], 'CR-027': ['lu_psma'], 'CR-028': ['pembrolizumabe'],
  'CR-029': ['ra223', 'denosumabe_met', 'zoledronico_met'], 'CR-030': ['enzalutamida', 'ra223', 'denosumabe_met'],
  'CR-040': ['cabazitaxel', 'abiraterona', 'enzalutamida', 'ra223', 'parp_mono', 'lu_psma'], 'CR-041': ['cabazitaxel'], 'CR-042': ['cabazitaxel'], 'CR-043': ['lu_psma'],
  'CR-044': ['parp_mono', 'olaparibe', 'rucaparibe'], 'CR-045': ['ra223'], 'CR-046': ['mitoxantrona'],
  'CR-050': ['denosumabe_met', 'zoledronico_met', 'calcio_vitd'], 'CR-053': ['dexametasona_medular', 'rt_medular'],
};
const DOSE_CATS = ['Bloqueio hormonal (ADT)', 'Inibidores da via do receptor androgênico (ARPI)', 'Quimioterapia', 'Inibidores de PARP', 'Radiofármacos', 'Imunoterapia', 'Proteção óssea e suporte', 'Radioterapia'];

/* Guia cirúrgico – técnica passo a passo, esquemas e vídeos de acesso aberto.
   Vídeos: nenhum link externo; espaço reservado para gravações próprias. Texto a revisar por cirurgião antes do uso assistencial. */
const SURG_VIDEOS = {};

const SURG = {
  rarp: {
    nome: 'Prostatectomia radical robótica com preservação neurovascular',
    resumo: 'Via transperitoneal anterior, 4 braços. Console 90–150 min; sangramento 100–300 mL; alta em 24–48 h; sonda 5–10 dias. Técnica anatômica de Walsh adaptada ao robô (Menon, Patel, Tewari).',
    indicacoes: [
      'Adenocarcinoma de próstata localizado (cT1–T2) de risco intermediário ou alto, e baixo risco em quem recusa vigilância ativa, com expectativa de vida > 10 anos.',
      'Doença localmente avançada (cT3) e cN1 selecionados, como parte de tratamento multimodal, com o paciente informado de que radioterapia adjuvante ou de resgate pode ser necessária.',
      'Pacientes com sintomas obstrutivos importantes ou lobo mediano, em que a radioterapia traria pior função urinária.',
    ],
    contraindicacoes: [
      'Absolutas: incapacidade de tolerar anestesia geral prolongada e Trendelenburg acentuado (DPOC grave, hipertensão intracraniana, glaucoma descompensado), coagulopatia não corrigida, ASA ≥ IV.',
      'Relativas: abdome hostil (múltiplas laparotomias, peritonite prévia, tela de hérnia inguinal bilateral), obesidade extrema (IMC > 45), próstata > 100 cc, RTU recente (< 3 meses), cirurgia retal prévia, pelve estreita.',
      'Oncológicas: doença metastática à distância (fora de ensaio); cN1 volumoso ou fixo.',
    ],
    preparo: [
      'Estadiamento completo conforme o grupo de risco (RM multiparamétrica sempre; PSMA-PET ou TC + cintilografia nos de maior risco); revisão da RM para extensão extraprostática, invasão de vesícula seminal, lobo mediano, volume e anatomia apical.',
      'Função basal registrada: IIEF-5 (erétil), ICIQ-SF e pad test (continência), IPSS; isso define a conversa sobre preservação neurovascular e as expectativas.',
      'Avaliação clínica e anestésica; ECG e exames conforme idade e comorbidades; tipagem sanguínea; suspensão de antiagregantes e anticoagulantes conforme protocolo (AAS pode ser mantido em alto risco cardiovascular).',
      'Fisioterapia do assoalho pélvico iniciada antes da cirurgia (reduz o tempo até a continência).',
      'Sem preparo intestinal mecânico de rotina; dieta leve na véspera, jejum de 8 h para sólidos e 2 h para líquidos claros; enema simples opcional.',
      'Profilaxia antibiótica: cefazolina 2 g IV 30–60 min antes da incisão (3 g se > 120 kg), dose única; alternativa clindamicina + gentamicina em alérgicos.',
      'Profilaxia de tromboembolismo: compressão pneumática intermitente desde a indução; heparina de baixo peso molecular no pós-operatório conforme risco (Caprini), por 7–28 dias se linfadenectomia estendida ou alto risco.',
      'Consentimento informado específico: incontinência, disfunção erétil, sangramento e transfusão, lesão retal, lesão ureteral, linfocele, hérnia, estenose de anastomose, conversão para via aberta, necessidade de tratamento adicional.',
    ],
    anestesia: [
      'Anestesia geral balanceada com bloqueio neuromuscular profundo (reduz a pressão de pneumoperitônio necessária); intubação orotraqueal; sonda orogástrica para esvaziar o estômago.',
      'Dois acessos venosos periféricos calibrosos; sem cateter central de rotina; monitorização padrão; restrição de volume até a anastomose (reduz débito urinário no campo), depois liberar.',
      'Posição: decúbito dorsal sobre colchão antiderrapante (gel ou vácuo), sem ombreiras compressivas (risco de plexo braquial); braços ao longo do corpo, acolchoados; pernas em perneiras com abdução leve ou fechadas (Xi permite docking lateral); joelhos levemente fletidos; proteção de calcâneos, cotovelos e olhos.',
      'Trendelenburg 25–30° (Xi tolera 20–25° com pneumoperitônio de 10–12 mmHg); checar deslizamento antes de preparar o campo; limitar o tempo total em Trendelenburg; atenção a edema facial e conjuntival, elevação da PIC e da PIO.',
      'Pneumoperitônio 12–15 mmHg (10–12 com insuflador de fluxo contínuo); reduzir para 6–8 mmHg na checagem final de hemostasia.',
      'Sonda vesical 16–18 Fr no campo estéril, para manipulação pelo assistente; antissepsia do abdome até o períneo.',
    ],
    instrumental: [
      'Robô: tesoura monopolar curva, pinça bipolar Maryland (ou fenestrada), ProGrasp (ou Cadiere), dois porta-agulhas grandes; óptica 0° (30° para baixo opcional no colo e no plano posterior).',
      'Assistente: aspirador-irrigador de 5 mm, pinça de preensão, aplicador de clipes Hem-o-lok (tamanhos ML e L), porta-agulhas laparoscópico, passador de suturas, saco de extração, insuflador de fluxo contínuo quando disponível.',
      'Suturas: farpada 3-0 (V-Loc ou Stratafix) de 15–23 cm para anastomose, duas unidas ou uma dupla-agulha; poliglactina ou farpada 2-0 para o complexo venoso dorsal; 3-0 para reconstrução posterior; 0 para aponeurose dos portais; hemostático tópico (matriz de gelatina-trombina) disponível.',
      'Sonda Foley siliconada 18 Fr para o final; dreno aspirativo 19 Fr (opcional); Veress ou trocarte de Hasson.',
    ],
    decisoes: [
      'Preservação neurovascular por lado: intrafascial ou interfascial quando o toque é normal nesse lado, a RM não mostra extensão extraprostática e a biópsia do lado tem GG ≤ 2 com poucos fragmentos; interfascial parcial quando há PI-RADS 5 com contato capsular amplo ou GG3 bilateral; extrafascial no lado com cT3a, invasão de vesícula ou GG ≥ 4 em vários fragmentos. Discutir com o paciente o balanço entre potência e margem.',
      'Linfadenectomia estendida quando o risco nodal supera 5–7% (Briganti) ou 2% (MSKCC/NCCN); feita antes da prostatectomia para melhor exposição da hipogástrica. Não fazer congelação para decidir abandonar a cirurgia.',
      'Preservação do colo vesical quando a base está livre na RM e na biópsia e não há lobo mediano; preservação de comprimento uretral máximo e dos ligamentos puboprostáticos quando o ápice está livre.',
      'Controle do complexo venoso dorsal: ligadura precoce (menos sangramento no ápice) ou secção com controle tardio (melhor visão do ápice, menor risco de margem apical); escolha por hábito e anatomia apical.',
      'Reconstrução posterior (Rocco) e anterior (suspensão) para continência precoce; a reconstrução total não altera a continência aos 12 meses, mas acelera a recuperação.',
      'Energia: nenhuma energia térmica junto aos pedículos e feixes; clipes ou sutura; bipolar com cautela apenas em sangramentos distantes do feixe.',
    ],
    passos: [
      { t: 'Acesso e pneumoperitônio', d: 'Agulha de Veress no ponto de Palmer ou supraumbilical, com teste de aspiração e gotejamento; insuflar a 15 mmHg para a passagem dos portais. Em paciente com laparotomia prévia, técnica aberta de Hasson. Inspeção da cavidade com a óptica: aderências, alças, sigmoide redundante, hérnias.', dica: 'Afastar o sigmoide e o epíploo do campo antes do docking; em obesos, inclinar a mesa mais cedo.', cuidado: 'Lesão de alça ou vascular na entrada: converter se instável; a maioria das lesões de alça é reparável por via robótica.' },
      { t: 'Portais e docking', d: 'Da Vinci Xi: quatro portais robóticos de 8 mm em linha reta transversa, 1–2 cm acima do umbigo, espaçados 6–8 cm (câmera no 2º ou 3º), mais um portal assistente de 12 mm à direita, 2 cm acima e lateral, e um de 5 mm no flanco direito ou na fossa ilíaca. Da Vinci Si/X: câmera 12 mm supraumbilical, dois braços em W a 8–10 cm de cada lado e 2 cm abaixo do umbigo, quarto braço à esquerda lateral, assistentes à direita. Ver esquema. Docking lateral (Xi) ou entre as pernas (Si); checar liberdade dos braços antes de iniciar.', dica: 'Mantenha ≥ 8 cm entre portais robóticos e ≥ 15–20 cm da câmera à sínfise; em pelve estreita ou paciente baixo, suba a linha 1–2 cm.', cuidado: 'Portais muito baixos limitam o alcance ao ápice; muito altos dificultam a anastomose.' },
      { t: 'Descolamento da bexiga e espaço de Retzius', d: 'Incisão do peritônio em U invertido: começar lateralmente ao ligamento umbilical medial, de cada lado, no nível do anel inguinal interno, e unir as incisões acima da cúpula vesical, seccionando o úraco. Seguir o plano avascular entre a parede abdominal e a bexiga até a sínfise púbica, expondo a gordura periprostática, os ligamentos puboprostáticos e a veia dorsal superficial. Remover e enviar a gordura periprostática (contém o linfonodo pré-prostático) com coagulação da veia dorsal superficial.', dica: 'Fique rente à parede abdominal; a bexiga cai com a gravidade quando se segue a gordura amarelada e não a parede vesical.', cuidado: 'Não lateralizar demais a incisão peritoneal (deferentes e vasos epigástricos); em hérnia inguinal com tela, dissecar com cautela ou optar por via Retzius-sparing.' },
      { t: 'Fáscia endopélvica e complexo venoso dorsal', d: 'Afastar a gordura lateral e identificar a fáscia endopélvica no sulco entre a próstata e o músculo levantador do ânus. Incisá-la com tesoura fria ou energia mínima, lateralmente à próstata, de baixo (ápice) para cima, afastando as fibras do levantador sem lesá-las. Expor o ápice e o complexo venoso dorsal (CVD). Para ligadura precoce, passar sutura 2-0 em oito (ou farpada) por baixo do CVD e acima da uretra, com o assistente retraindo a sonda para identificá-la; dar duas voltas. Alternativa: preservar a fáscia endopélvica e os ligamentos puboprostáticos e controlar o CVD apenas após a secção (técnica anterógrada com controle tardio).', dica: 'Um ponto de reparo no CVD também serve para a suspensão anterior na reconstrução.', cuidado: 'Incluir a uretra na ligadura do CVD causa estenose; passar a agulha com a sonda tracionada para sentir a uretra.' },
      { t: 'Colo vesical anterior', d: 'Identificar a junção vesicoprostática tracionando a sonda e observando o balão, e pelo pinçamento bilateral da parede (o detrusor afina na junção). Abrir a gordura na linha média até o detrusor, desenvolvendo o plano entre as fibras do detrusor e a cápsula prostática. Abrir o colo anterior no centro, esvaziar o balão e retirar a sonda para o lúmen; o assistente eleva a sonda para expor o colo posterior. Na preservação do colo, dissecar circunferencialmente as fibras do detrusor para manter um colo de 1–1,5 cm.', dica: 'Trabalhe lateral-para-medial para encontrar o plano correto; o colo está mais caudal do que parece em próstatas grandes.', cuidado: 'Lobo mediano: tracionar com a ProGrasp e identificar os meatos ureterais antes de seccionar o colo posterior; evitar lesão do trígono.' },
      { t: 'Colo posterior, deferentes e vesículas seminais', d: 'Seccionar a parede posterior do colo no plano horizontal, identificando a fáscia que cobre os deferentes e as vesículas (plano brilhante). Abrir esse plano e expor os deferentes; clipar e seccionar, tracionando-os anteriormente para expor as vesículas seminais. Dissecar as vesículas na fáscia própria, clipando as artérias vesiculares nas pontas (Hem-o-lok pequeno ou clipes de titânio) sem energia, porque os feixes neurovasculares correm lateral e posteriormente às pontas das vesículas.', dica: 'Em vesículas longas, a dissecção da ponta pode ser deixada para depois do plano posterior, quando a tração melhora.', cuidado: 'Sangramento arterial na ponta da vesícula: clipe e compressão, nunca bipolar prolongado.' },
      { t: 'Plano posterior e fáscia de Denonvilliers', d: 'Tracionar as vesículas anteriormente e expor a fáscia de Denonvilliers. Para dissecção intra/interfascial, incisá-la transversalmente logo abaixo da base da próstata e desenvolver o plano entre a fáscia e a próstata (a fáscia fica no paciente, cobrindo o reto). Para dissecção extrafascial no lado de risco, incisar posteriormente à fáscia, levando-a com a peça. Dissecção romba e com tesoura fria até o ápice, na gordura perirretal amarelada; manter a tração anterior constante e ver sempre a parede retal.', dica: 'A tração anterior firme da próstata pelo quarto braço é o que abre o plano; não force a tesoura em tecido branco aderido.', cuidado: 'Lesão retal: reconhecer, lavar, suturar em dois planos com fio absorvível, interpor gordura perirretal ou epíploo, dreno, antibiótico; colostomia só se grande, contaminada ou em paciente irradiado.' },
      { t: 'Pedículos e preservação neurovascular', d: 'Tracionar a próstata medialmente; identificar o pedículo lateral (ramos da vesical inferior) entre a base e o feixe. Aplicar clipes Hem-o-lok ML em sequência no pedículo, rente à próstata, e seccionar a frio; repetir até chegar ao feixe. Liberação retrógrada precoce (Patel): antes de controlar o pedículo, desenvolver o plano do ápice em direção à base, lateralmente à próstata, identificando o feixe e deixando-o cair posteriormente; assim o pedículo é controlado sem lesar o feixe. Abrir a fáscia periprostática no nível escolhido: intrafascial (junto à cápsula, fáscia prostática fica com o feixe), interfascial (entre fáscia prostática e fáscia do levantador) ou extrafascial (fora da fáscia do levantador, feixe vai na peça). Sem energia; sangramentos pequenos com compressão, clipe de titânio fino ou matriz hemostática.', dica: 'Use o plano venoso: pequenas veias do feixe sangram pouco e param com compressão de 1–2 minutos e pneumoperitônio elevado temporariamente.', cuidado: 'Tração excessiva ("neuropraxia por estiramento") é tão lesiva quanto o cautério; manipule o feixe o mínimo e nunca o agarre com pinça.' },
      { t: 'Ápice e uretra', d: 'Com os feixes liberados, seccionar o CVD (se ligado) ou seccioná-lo a frio e controlá-lo depois com sutura farpada 2-0 (controle tardio). Dissecar o ápice circunferencialmente, respeitando a forma apical vista na RM (ápice anterior proeminente, "lábio" posterior), para evitar margem apical. Seccionar a uretra a frio: parede anterior primeiro, visualizar a sonda, retirá-la e seccionar a parede posterior, preservando o máximo de comprimento uretral e as fibras do esfíncter estriado (rabdoesfíncter). Completar a liberação posterior residual (ligamento rectouretral) e colocar a peça no saco de extração. Reduzir o pneumoperitônio para 6–8 mmHg e checar hemostasia do leito e dos feixes.', dica: 'Secção da uretra com tesoura fria e lâmina paralela ao esfíncter; cada milímetro de uretra preservada conta para a continência precoce.', cuidado: 'Margem apical positiva é a mais comum: não "ordenhe" o ápice para dentro da próstata; em dúvida, mantenha o plano mais afastado.' },
      { t: 'Reconstrução posterior (Rocco)', d: 'Sutura farpada 3-0: primeira camada unindo o remanescente da fáscia de Denonvilliers (rafe posterior) à face posterior do rabdoesfíncter; segunda camada unindo a face posterior do colo vesical ao mesmo complexo, aproximando colo e uretra sem tensão. Isso restaura o suporte posterior e reduz a tensão na anastomose.', dica: 'Se a reconstrução deixa o colo a mais de 1 cm da uretra, afrouxe-a: a anastomose não pode ficar sob tensão.', cuidado: 'Pontos profundos atrás do rabdoesfíncter podem pegar o reto; mantenha a agulha superficial.' },
      { t: 'Anastomose vesicouretral', d: 'Técnica de van Velthoven: duas suturas farpadas 3-0 unidas pela cauda (ou uma dupla-agulha), iniciando às 5–6 h de fora para dentro no colo e de dentro para fora na uretra; correr uma metade no sentido horário e a outra no anti-horário até as 12 h, com 6–8 pontos de cada lado, e amarrar ou travar as farpas. Passar a sonda Foley 18 Fr sob visão antes de fechar a parede anterior; eversão da mucosa vesical se o colo for largo (raquete ou plicatura anterior). Reconstrução anterior opcional: suspender o colo aos ligamentos puboprostáticos ou ao periósteo do púbis. Teste de estanqueidade com 120–150 mL de soro; dreno 19 Fr se extravasamento ou linfadenectomia.', dica: 'Pontos posteriores com mordidas maiores na bexiga e menores na uretra; passe a agulha pela uretra sempre com visão da mucosa.', cuidado: 'Colo muito largo: reconstruir em raquete antes da anastomose; mucosa evertida reduz estenose.' },
      { t: 'Linfadenectomia pélvica', d: 'Quando indicada, estendida, de preferência antes da prostatectomia (melhor exposição do espaço entre ilíaca interna e externa); enviar as regiões separadas. Ver o procedimento próprio.', dica: '', cuidado: '' },
      { t: 'Extração e fechamento', d: 'Ampliar o portal da câmera (ou o de 12 mm) para extrair a peça no saco; revisar os portais com a óptica à pressão baixa; fechar a aponeurose dos portais de 12 mm e da extração com fio 0 (passador de suturas sob visão nos obesos); pele com intradérmica. Fixar a sonda, curativos.', dica: 'Pintar a peça com tinta (margens) antes de enviar à patologia, ou pedir ao patologista que o faça com orientação.', cuidado: 'Hérnia de portal ocorre nos portais ≥ 10 mm não fechados e na incisão de extração.' },
    ],
    posop: [
      'Analgesia multimodal: dipirona ou paracetamol fixo, anti-inflamatório se função renal normal, opioide só de resgate; sem opioide de rotina.',
      'Deambulação no dia da cirurgia; dieta líquida no dia 0 e livre no dia 1; goma de mascar e deambulação para o íleo; alta em 24–48 h.',
      'Dreno (se colocado): retirar com débito < 100 mL/24 h e sem creatinina elevada no líquido; se alto, dosar creatinina (urina = extravasamento; linfa = linfocele).',
      'Sonda vesical: 5–7 dias se anastomose estanque; 10–14 dias se extravasamento; cistografia antes da retirada apenas em caso de dúvida. Antibiótico profilático na retirada é opcional.',
      'Fisioterapia do assoalho pélvico a partir da retirada da sonda; absorventes nas primeiras semanas; evitar esforço e bicicleta por 4 semanas.',
      'Reabilitação peniana: inibidor da PDE5 diário ou sob demanda a partir de 2–4 semanas, em preservação uni ou bilateral; bomba a vácuo opcional.',
      'Heparina de baixo peso por 7 dias (28 dias se linfadenectomia estendida ou alto risco de tromboembolismo).',
      'Primeiro PSA em 6–8 semanas (esperado < 0,1 ng/mL); revisão da patologia (pT, GG, margens, pN, extensão da margem) para decidir radioterapia adjuvante ou resgate precoce; PSA a cada 3 meses no 1º ano, a cada 6 meses até o 5º, depois anual.',
    ],
    complicacoes: [
      'Sangramento e transfusão (1–3%): controle do CVD e dos feixes; raramente reoperação.',
      'Lesão retal (0,2–1%): reparo imediato em dois planos com interposição de gordura ou epíploo e dreno; colostomia se grande, contaminada ou pós-radioterapia; dieta zero por 48 h, antibiótico.',
      'Lesão ureteral (< 0,5%): mais comum no colo posterior ou na linfadenectomia; reimplante ou duplo-J conforme o nível.',
      'Extravasamento da anastomose (2–5%): manter a sonda por 2–3 semanas; dreno; cistografia antes de retirar.',
      'Linfocele sintomática (2–8% com linfadenectomia estendida): drenagem percutânea; marsupialização laparoscópica se recorrente.',
      'Retenção urinária após retirada da sonda (1–3%): nova sonda por 3–5 dias.',
      'Estenose ou contratura do colo vesical (1–3%): uretrotomia ou incisão do colo a frio; dilatação.',
      'Hérnia inguinal (2–5% em 2 anos) e de portal: correção eletiva.',
      'Tromboembolismo venoso (0,5–2%): profilaxia mecânica e farmacológica.',
      'Complicações posicionais: neuropraxia de plexo braquial e fibular, rabdomiólise em obesos e cirurgias longas, edema de face e conjuntiva, elevação da pressão intraocular; limitar o tempo em Trendelenburg e acolchoar.',
      'Incontinência urinária persistente (5–15% aos 12 meses): fisioterapia; sling ou esfíncter artificial após 12 meses.',
      'Disfunção erétil (30–70% conforme preservação, idade e função prévia): reabilitação precoce; injeções intracavernosas; prótese após 12–18 meses.',
    ],
    resultados: [
      'Margens cirúrgicas positivas: 10–15% no total (4–8% em pT2; 20–40% em pT3); a margem apical é a mais frequente.',
      'Continência (sem absorvente ou um de segurança): 90–95% aos 12 meses; 60–80% aos 3 meses com reconstrução posterior.',
      'Potência suficiente para penetração: 50–80% aos 12–24 meses com preservação bilateral em homens potentes com menos de 65 anos.',
      'Tempo de console 90–150 min; sangramento 100–300 mL; transfusão < 2%; internação 1–2 dias.',
    ],
    esquemas: ['portais', 'planos'],
    videos: [],
  },
  eplnd: {
    nome: 'Linfadenectomia pélvica estendida',
    resumo: 'Template obrigatório quando a linfadenectomia está indicada (EAU, forte): fossa obturatória, ilíaca externa e ilíaca interna, até a bifurcação da ilíaca comum. Mediana de 15–25 linfonodos; 20–40 min adicionais.',
    indicacoes: [
      'Risco de metástase linfonodal > 7% no nomograma de Briganti 2019 (biópsia dirigida por RM) ou > 5% no Briganti 2012/2017 (biópsia sistemática).',
      'NCCN: risco ≥ 2% no nomograma do MSKCC; na prática, todo alto e muito alto risco e o intermediário desfavorável.',
      'cN1 em cirurgia multimodal; prostatectomia de resgate.',
      'Não indicada em baixo risco e na maior parte do intermediário favorável (risco < 5%).',
    ],
    contraindicacoes: [
      'Risco nodal abaixo do limiar: a linfadenectomia só estadia; não há benefício oncológico comprovado e há morbidade (linfocele, linfedema, lesão vascular e nervosa).',
      'Relativas: tela de hérnia inguinal bilateral com fibrose extensa, radioterapia pélvica prévia, trombose venosa ilíaca recente, coagulopatia.',
    ],
    preparo: [
      'Calcular o risco nodal com o nomograma apropriado e registrar; se PSMA-PET mostrou linfonodo suspeito, marcar a região para dissecção dirigida além do template.',
      'Heparina de baixo peso no pós-operatório por 28 dias (a linfadenectomia estendida aumenta o risco de tromboembolismo).',
      'Informar o paciente sobre linfocele (até 30% assintomática), linfedema e lesão do nervo obturatório.',
    ],
    anestesia: [
      'Mesmas condições da prostatectomia; a linfadenectomia é feita de preferência antes da prostatectomia, com a bexiga já descolada, para expor o espaço entre as ilíacas.',
      'Inclinação lateral da mesa (5–10°) para o lado oposto ajuda a afastar o sigmoide à esquerda.',
    ],
    instrumental: [
      'Tesoura monopolar, bipolar Maryland, ProGrasp; clipes Hem-o-lok ML e L (ou titânio) para linfáticos; saco de extração para cada região ou frascos identificados: obturatória, ilíaca externa, ilíaca interna, de cada lado.',
    ],
    decisoes: [
      'Limites do template estendido: lateral, nervo genitofemoral sobre o psoas; medial, bexiga, ureter e ligamento umbilical; caudal, linfonodo de Cloquet e o ramo púbico (veia circunflexa ilíaca); cranial, bifurcação da ilíaca comum no cruzamento do ureter; profundo, nervo obturatório e assoalho pélvico (fáscia do obturador interno).',
      'Não estender rotineiramente à ilíaca comum e pré-sacral (super-estendida) fora de ensaio; estender só sobre linfonodo suspeito na imagem.',
      'Preservar o nervo obturatório, a veia obturatória acessória (pode sangrar muito) e os linfáticos laterais à artéria ilíaca externa (drenam o membro inferior: poupá-los reduz linfedema).',
      'Clipes nos linfáticos distais (canal femoral) e proximais (bifurcação) e fenestração ou retalho peritoneal ao final reduzem linfocele sintomática.',
      'Sem congelação: o resultado não muda a decisão de completar a prostatectomia.',
    ],
    passos: [
      { t: 'Exposição', d: 'Incisar o peritônio lateralmente ao ligamento umbilical medial, da altura do anel inguinal interno (cruzamento do deferente) até a bifurcação da ilíaca comum, seguindo a artéria ilíaca externa. Identificar o ureter no cruzamento da ilíaca comum e rebatê-lo medialmente com o peritônio. O deferente pode ser clipado e seccionado se atrapalhar.', dica: 'Tração medial do ligamento umbilical com o quarto braço abre toda a fossa.', cuidado: 'O ureter cruza a bifurcação: nunca dissecar a ilíaca comum sem tê-lo identificado.' },
      { t: 'Ilíaca externa', d: 'Abrir a bainha vascular na borda medial da artéria ilíaca externa e seguir caudalmente até a veia circunflexa ilíaca profunda (limite caudal). "Split and roll": separar o tecido linfático da artéria e da veia, rolando-o medialmente, da veia circunflexa até a bifurcação. Clipar os linfáticos distais no canal femoral (linfonodo de Cloquet) antes de seccionar. Manter o tecido lateral à artéria (nervo genitofemoral e linfáticos do membro).', dica: 'A veia ilíaca externa colapsa com o pneumoperitônio: reduza a pressão para vê-la e evite pinçá-la sem ver.', cuidado: 'Lesão da veia ilíaca externa: compressão com gaze pelo assistente, aumentar a pressão para 20 mmHg, sutura com prolene 5-0; não usar clipes grandes às cegas.' },
      { t: 'Fossa obturatória', d: 'Tracionar o pacote linfonodal medialmente, afastando-o da veia ilíaca externa, até ver o nervo obturatório emergindo sob a veia e correndo para o forame obturado; identificar a artéria e a veia obturatórias abaixo e posteriormente ao nervo. Dissecar o pacote anterior e posterior ao nervo, do canal femoral até a bifurcação, mantendo o nervo e os vasos no leito. Clipar os linfáticos proximais na bifurcação.', dica: 'Encontre o nervo primeiro, junto à parede pélvica lateral, e só então remova o tecido ao redor.', cuidado: 'Secção do nervo obturatório: reparo primário epineural imediato com fio 6-0 ou 7-0 (déficit de adução e parestesia medial da coxa se não reparado). Veia obturatória acessória (30%): clipar antes de seccionar.' },
      { t: 'Ilíaca interna (hipogástrica)', d: 'Seguir a artéria ilíaca interna da bifurcação até a origem da artéria vesical superior (ligamento umbilical), removendo o tecido linfático medial e anterior a ela e o que fica entre a ilíaca interna e a externa (fossa obturatória profunda). Não dissecar posterior ao plano das veias hipogástricas (plexo venoso pélvico).', dica: 'O tecido entre as duas ilíacas costuma conter os linfonodos positivos que o template limitado perde.', cuidado: 'Sangramento do plexo venoso pélvico lateral: compressão e hemostático; evitar clipes profundos que possam lesar o nervo obturatório na origem.' },
      { t: 'Ilíaca comum até o cruzamento do ureter', d: 'Completar a dissecção cranialmente até a bifurcação e o cruzamento do ureter, clipando os linfáticos proximais. Linfonodos da ilíaca comum e pré-sacrais só se suspeitos na imagem.', dica: '', cuidado: 'Lesão do ureter no cruzamento: reparo primário ou reimplante com duplo-J.' },
      { t: 'Hemostasia, retalho peritoneal e identificação', d: 'Hemostasia à pressão baixa; fenestração ampla do peritônio ou retalho peritoneal fixado à parede (técnica PerFix) para drenar a linfa para a cavidade e reduzir linfocele sintomática. Sem dreno de rotina. Enviar cada região em frasco separado, identificado (obturatória, ilíaca externa, ilíaca interna; direita e esquerda).', dica: 'A fixação do peritônio da bexiga à parede abdominal anterior com dois pontos mantém a fenestração aberta.', cuidado: 'Linfocele sintomática (dor, compressão venosa, infecção): drenagem percutânea com esclerose ou marsupialização laparoscópica.' },
    ],
    posop: [
      'Mesmo cuidado da prostatectomia; heparina de baixo peso por 28 dias; mobilização precoce.',
      'Dreno, se colocado, retirado com débito < 100–150 mL/24 h; se linfa persistente, retirar mesmo assim e acompanhar com ultrassom.',
      'Linfocele assintomática não se trata; sintomática: punção com esclerose ou marsupialização.',
      'Patologia: número de linfonodos, positivos, maior metástase (pNmi ≤ 0,2 cm), extensão extranodal; pN1 orienta ADT adjuvante ± radioterapia ou observação se ≤ 2 linfonodos e PSA indetectável.',
    ],
    complicacoes: [
      'Linfocele: 20–50% assintomática, 2–8% sintomática; mais com dreno fechado e menos com fenestração peritoneal.',
      'Lesão do nervo obturatório (< 1%): reparo imediato.',
      'Lesão vascular (veia ilíaca externa, veia obturatória acessória, veias hipogástricas): compressão, sutura, hemostático.',
      'Lesão ureteral (< 0,5%).',
      'Linfedema de membro inferior e genital (1–3%); tromboembolismo (1–3%).',
      'Tempo operatório e sangramento adicionais; íleo prolongado.',
    ],
    resultados: [
      'Mediana de 15–25 linfonodos; detecção de pN1 em 10–15% do alto risco e 25–35% do muito alto risco; pNmi em parte deles.',
      'Benefício oncológico direto não comprovado em ensaio randomizado; ganho está no estadiamento e na decisão de adjuvância.',
    ],
    esquemas: ['template'],
    videos: [],
  },
  retzius: {
    nome: 'Prostatectomia robótica com preservação do espaço de Retzius (Galfano)',
    resumo: 'Acesso posterior pelo fundo de saco de Douglas, sem descolar a bexiga nem abrir o espaço de Retzius; continência precoce melhor (70–90% na retirada da sonda), margens anteriores um pouco mais frequentes na curva de aprendizado.',
    indicacoes: [
      'Doença de baixo e intermediário risco; paciente que prioriza continência precoce.',
      'Pacientes com RTU ou cirurgia de HPB prévia, hérnia com tela bilateral, aderências anteriores, ou transplante renal (poupa o plano anterior).',
      'Próstata pequena e média (< 80–100 cc) na curva de aprendizado; depois, sem restrição de volume.',
    ],
    contraindicacoes: [
      'Relativas: tumor anterior volumoso ou com contato capsular anterior extenso na RM (risco de margem anterior), lobo mediano grande, próstata > 100 cc no início da curva, necessidade de linfadenectomia muito ampla (possível, mas acrescenta tempo).',
      'Mesmas contraindicações anestésicas da via anterior.',
    ],
    preparo: ['Idêntico à via anterior; a RM deve ser revista especificamente para tumor anterior e lobo mediano.'],
    anestesia: ['Idênticos à via anterior; Trendelenburg pode ser um pouco menor; útil o afastamento do sigmoide com um ponto de tração ou pinça no quarto braço.'],
    instrumental: ['Idêntico; porta-agulhas robusto para a anastomose em campo profundo; óptica 30° para baixo ajuda na dissecção anterior sob o arco do CVD.'],
    decisoes: [
      'Preservação neurovascular anterógrada, habitualmente intrafascial, facilitada pela via posterior; no lado de risco, interfascial.',
      'Preservação integral do complexo venoso dorsal, ligamentos puboprostáticos, fáscia endopélvica e nervo pudendo acessório (não se tocam).',
      'Linfadenectomia estendida possível pela mesma via, pelo peritônio lateral.',
      'Fechamento da fáscia de Denonvilliers (modificação de Tobias-Machado) e do peritônio ao final.',
    ],
    passos: [
      { t: 'Acesso posterior', d: 'Afastar o sigmoide e expor o fundo de saco de Douglas. Incisar o peritônio 1–2 cm acima da reflexão peritoneal, transversalmente, e identificar os deferentes e as vesículas seminais logo abaixo.', dica: 'Um ponto de tração no peritônio superior da incisão, fixado à parede, abre o campo.', cuidado: 'Incisão muito baixa cai sobre o reto; muito alta, sobre a bexiga.' },
      { t: 'Deferentes e vesículas seminais', d: 'Clipar e seccionar os deferentes; dissecar as vesículas na fáscia própria, clipes nas artérias das pontas, sem energia.', dica: '', cuidado: '' },
      { t: 'Plano posterior e pedículos', d: 'Incisar a fáscia de Denonvilliers e desenvolver o plano posterior até o ápice. Controlar os pedículos com clipes rente à próstata e desenvolver a preservação neurovascular anterógrada, intrafascial, da base ao ápice.', dica: 'A via posterior dá visão direta dos feixes desde o início; o quarto braço eleva a vesícula para expor o pedículo.', cuidado: 'Mesmos cuidados com reto e feixes da via anterior.' },
      { t: 'Colo vesical pela face posterior', d: 'Identificar a junção vesicoprostática posteriormente pela mudança de direção das fibras do detrusor; seccionar a parede posterior do colo, visualizar a sonda e os meatos ureterais; seccionar a parede anterior do colo por dentro, preservando o colo quando possível.', dica: 'Em lobo mediano, a dissecção do colo pela face posterior é mais difícil: tracione o lobo com a ProGrasp.', cuidado: 'Meatos ureterais próximos do colo posterior: identificá-los antes de seccionar.' },
      { t: 'Dissecção anterior sob o arco venoso', d: 'Com o colo seccionado, tracionar a próstata posteriormente e dissecar a face anterior, entre a próstata e o complexo venoso dorsal e os ligamentos puboprostáticos, sem abri-los, até o ápice.', dica: 'Óptica 30° para baixo e tração posterior constante; o plano é a gordura entre o CVD e a cápsula anterior.', cuidado: 'Sangramento do CVD: aumentar o pneumoperitônio, compressão, bipolar pontual; evitar suturas às cegas no CVD.' },
      { t: 'Ápice e uretra', d: 'Dissecar o ápice circunferencialmente e seccionar a uretra a frio, preservando o esfíncter; retirar a peça no saco pela incisão posterior.', dica: '', cuidado: 'A margem anterior/apical é a mais frequente nesta via: respeitar a anatomia apical da RM.' },
      { t: 'Anastomose', d: 'Anastomose uretrovesical contínua com sutura farpada 3-0, iniciando pela parede anterior (12 h), que é a mais profunda e difícil de alcançar, e completando a parede posterior por último; sonda 18 Fr sob visão; teste de estanqueidade.', dica: 'Trabalhar a parede anterior primeiro evita puxar a anastomose sobre a bexiga cheia de pontos posteriores.', cuidado: 'Tensão: se a uretra está longe, liberar mais a bexiga posteriormente.' },
      { t: 'Fechamento', d: 'Fechar a fáscia de Denonvilliers sobre a anastomose (modificação brasileira) e o peritônio do fundo de saco com sutura farpada; sem dreno de rotina.', dica: '', cuidado: '' },
    ],
    posop: ['Igual à via anterior; a continência costuma estar presente na retirada da sonda (5–7 dias); mesma reabilitação erétil e seguimento de PSA.'],
    complicacoes: [
      'Mesmas da via anterior; sangramento do complexo venoso dorsal um pouco mais frequente durante a dissecção anterior.',
      'Margens positivas anteriores/apicais mais frequentes na curva de aprendizado (primeiros 50–100 casos).',
      'Lesão retal e ureteral com a mesma frequência da via anterior.',
    ],
    resultados: [
      'Continência imediata na retirada da sonda 70–90%; aos 12 meses, igual à via anterior (90–95%).',
      'Margens positivas semelhantes após a curva de aprendizado; potência semelhante ou um pouco melhor.',
    ],
    esquemas: ['planos'],
    videos: [],
  },
  aberta: {
    nome: 'Prostatectomia radical retropúbica aberta (técnica anatômica de Walsh)',
    resumo: 'Incisão mediana infraumbilical de 8–10 cm, extraperitoneal; mesma lógica oncológica da robótica; sangramento 400–800 mL; internação 2–3 dias; sonda 7–14 dias.',
    indicacoes: [
      'Onde não há plataforma robótica ou laparoscópica, ou por preferência do cirurgião experiente; resultados oncológicos equivalentes.',
      'Aderências extensas, contraindicação ao pneumoperitônio ou ao Trendelenburg, pelve muito estreita.',
      'Conversão de via minimamente invasiva por sangramento ou dificuldade.',
    ],
    contraindicacoes: ['As mesmas gerais da prostatectomia; ASA ≥ IV, coagulopatia; obesidade extrema torna a exposição difícil (incisão maior).'],
    preparo: [
      'Igual à robótica; reserva de 2 unidades de concentrado de hemácias ou tipagem com prova cruzada; autotransfusão opcional.',
      'Profilaxia antibiótica com cefazolina; compressão pneumática; heparina de baixo peso no pós-operatório.',
    ],
    anestesia: [
      'Anestesia geral ou raquianestesia com sedação (peridural reduz sangramento e dor); decúbito dorsal com a mesa fletida no nível do umbigo (10–15°) e leve Trendelenburg para abrir o espaço retropúbico.',
      'Sonda 18–20 Fr no campo; luz frontal e lupas 2,5× recomendadas; afastador autostático (Balfour ou Omni-Tract).',
    ],
    instrumental: [
      'Afastador autostático com válvula maleável; tesoura de Metzenbaum longa; pinças de ângulo reto; clipes vasculares de titânio médios; porta-agulhas longos; bisturi elétrico; aspirador.',
      'Suturas: polyglactin 2-0 ou 0 (CVD, pedículos), monofilamento absorvível 2-0 ou 3-0 com agulha 5/8 (anastomose, 5–6 pontos), 0 para aponeurose; dreno de sucção 19 Fr; sonda Foley 18–20 Fr siliconada.',
    ],
    decisoes: [
      'Controle precoce do complexo venoso dorsal (sutura em bloco e secção) é o passo que define o sangramento e a visão do ápice.',
      'Preservação neurovascular retrógrada, do ápice à base, com liberação lateral do feixe sob visão direta; extrafascial no lado de risco.',
      'Linfadenectomia estendida antes da prostatectomia, pelos mesmos limites.',
      'Reconstrução do colo em raquete com eversão da mucosa; anastomose com 5–6 pontos amarrados por fora.',
    ],
    passos: [
      { t: 'Acesso', d: 'Incisão mediana infraumbilical do umbigo à sínfise; abertura da linha alba; afastar os retos; abrir a fáscia transversal e desenvolver o espaço retropúbico (Retzius) por via extraperitoneal, rebatendo o peritônio cranialmente com o dedo; colocar o afastador autostático.', dica: 'Não abrir o peritônio; se abrir, fechar para evitar alças no campo.', cuidado: 'Vasos epigástricos inferiores na borda do reto abdominal.' },
      { t: 'Linfadenectomia', d: 'Estendida quando indicada: abrir a bainha da ilíaca externa, fossa obturatória com o nervo identificado, ilíaca interna até a bifurcação; clipes nos linfáticos; frascos separados.', dica: '', cuidado: 'Mesmos riscos da via robótica; o sangramento venoso é controlado com compressão e sutura 5-0.' },
      { t: 'Fáscia endopélvica e ligamentos puboprostáticos', d: 'Remover a gordura periprostática, coagulando a veia dorsal superficial; incisar a fáscia endopélvica lateralmente à próstata, de cada lado, e afastar as fibras do levantador do ápice com dissecção romba; seccionar os ligamentos puboprostáticos rente ao púbis, apenas o necessário para expor o CVD.', dica: 'Incisar a fáscia no ponto onde fica transparente, junto ao levantador, nunca sobre a próstata.', cuidado: 'Veias do plexo de Santorini atrás dos ligamentos: seccionar os ligamentos sob visão.' },
      { t: 'Complexo venoso dorsal', d: 'Passar uma pinça de ângulo reto entre o CVD e a uretra (com a sonda tracionada para sentir a uretra) e ligar o CVD em bloco com sutura 0 ou 2-0 (técnica de Walsh); sutura de reparo na face anterior da próstata (bunching) para hemostasia retrógrada; seccionar o CVD com bisturi, completar a hemostasia com sutura em oito na borda distal. Expor a uretra apical membranosa.', dica: 'Secção do CVD com a mesa em Trendelenburg e aspirador pronto; a hemostasia do coto distal é feita com um ponto em oito que não pegue a uretra.', cuidado: 'Sangramento profuso: compressão com gaze, sutura em bloco; não cauterizar junto ao esfíncter.' },
      { t: 'Uretra e pontos da anastomose', d: 'Seccionar a parede anterior da uretra apical rente ao ápice, preservando o esfíncter estriado; passar os pontos anteriores da anastomose (2 h, 10 h e 12 h) na uretra com agulha 5/8, de dentro para fora; retirar a sonda; seccionar a parede posterior e passar os pontos posteriores (4 h, 6 h e 8 h); seccionar o músculo rectouretral.', dica: 'Passe os pontos uretrais antes de completar a secção, enquanto a uretra ainda está fixa: é muito mais fácil.', cuidado: 'Não incluir o esfíncter estriado nas mordidas uretrais; mordidas de 3–4 mm na mucosa e submucosa.' },
      { t: 'Dissecção retrógrada e preservação neurovascular', d: 'Tracionar a próstata cranialmente pela sonda passada na uretra prostática; identificar o feixe neurovascular posterolateral; liberar a fáscia periprostática lateral e deixar o feixe cair posteriormente, do ápice à base, clipando os ramos para a próstata com clipes de titânio; sem cautério.', dica: 'Lupas e luz frontal; o feixe é visto como um cordão posterolateral com veias de superfície.', cuidado: 'Tração do feixe e cautério são as causas de disfunção erétil; no lado de risco, plano extrafascial.' },
      { t: 'Pedículos, vesículas seminais e deferentes', d: 'Ligar os pedículos laterais com clipes ou sutura 2-0 rente à próstata; incisar a fáscia de Denonvilliers e expor as vesículas e os deferentes; clipar e seccionar os deferentes; dissecar as vesículas até as pontas com clipes nas artérias.', dica: '', cuidado: 'Lesão retal na dissecção posterior: reparo em dois planos, interposição de epíploo, dreno, antibiótico; colostomia se grande ou irradiado.' },
      { t: 'Colo vesical', d: 'Seccionar o colo vesical na junção, identificada pelo balão da sonda e pela mudança de textura; visualizar os meatos ureterais; remover a peça. Reconstruir o colo em raquete com sutura 2-0 posterior até deixar um calibre de 20–24 Fr e everter a mucosa com 4–6 pontos 4-0.', dica: 'Azul de metileno IV se dúvida sobre os meatos.', cuidado: 'Colo muito próximo dos meatos: duplo-J e reconstrução anterior do colo em vez de posterior.' },
      { t: 'Anastomose e fechamento', d: 'Passar os seis pontos da uretra nas posições correspondentes do colo; introduzir a sonda 18–20 Fr; aproximar a bexiga à uretra com a mesa defletida e amarrar os pontos posteriores primeiro, depois os anteriores; teste com 100 mL; dreno de sucção pré-vesical; fechamento da aponeurose com fio 0 e pele.', dica: 'Amarrar com a bexiga empurrada para o períneo pelo assistente, sem tensão nos nós.', cuidado: 'Anastomose sob tensão extravasa e estenosa: liberar mais a bexiga ou refazer os pontos.' },
    ],
    posop: [
      'Analgesia multimodal (peridural nas primeiras 24 h se usada); deambulação no dia 1; dieta progressiva; alta em 2–3 dias.',
      'Dreno retirado com débito < 100 mL/24 h; sonda 7–14 dias, cistografia opcional antes da retirada.',
      'Heparina de baixo peso por 7–28 dias; fisioterapia do assoalho pélvico; reabilitação erétil; PSA em 6–8 semanas; mesmo seguimento da robótica.',
    ],
    complicacoes: [
      'Sangramento e transfusão (5–15%); hematoma pélvico.',
      'Lesão retal (1%), lesão ureteral (< 1%), extravasamento da anastomose (5%), linfocele.',
      'Infecção de ferida e hérnia incisional (3–5%); íleo; tromboembolismo (1–2%).',
      'Incontinência (8–15% aos 12 meses) e disfunção erétil (40–70%), semelhantes à robótica em mãos experientes.',
    ],
    resultados: [
      'Controle oncológico (margens, recorrência bioquímica) equivalente à robótica em séries de alto volume; margens positivas 15–20% no total.',
      'Continência 85–95% aos 12 meses; potência 40–70% com preservação bilateral.',
      'Tempo cirúrgico 90–180 min; sangramento 400–800 mL; internação 2–3 dias.',
    ],
    esquemas: ['planos'],
    videos: [],
  },
  resgate: {
    nome: 'Prostatectomia radical de resgate após radioterapia ou terapia focal',
    resumo: 'Só em centros experientes, para recidiva local comprovada por biópsia, sem metástase ao PSMA-PET e com expectativa de vida > 10 anos. Morbidade maior: incontinência 30–50%, lesão retal 2–9%, estenose de anastomose 10–30%, disfunção erétil quase universal.',
    indicacoes: [
      'Recorrência bioquímica após radioterapia externa, braquiterapia, SBRT, HIFU ou crioterapia, com recidiva local confirmada por biópsia da próstata (e vesículas), PSMA-PET sem doença à distância e RM de próstata.',
      'Fatores favoráveis: PSA pré-resgate < 10 (ideal < 4), tempo de duplicação > 12 meses, intervalo > 2 anos desde a radioterapia, doença inicial de baixo ou intermediário risco, ausência de invasão de vesícula na RM, boa continência prévia.',
      'Alternativas a discutir antes: braquiterapia de resgate, SBRT de resgate, HIFU ou crioterapia de resgate (em ensaio), observação com ADT tardia.',
    ],
    contraindicacoes: [
      'Metástase à distância ou linfonodal extensa; expectativa de vida < 10 anos; comorbidade importante.',
      'Incontinência prévia significativa, estenose uretral complexa, fístula ou cistite actínica grave (nestes casos a cistoprostatectomia com derivação pode ser mais adequada).',
      'PSA > 10–20, tempo de duplicação < 6 meses ou doença inicial de muito alto risco: baixa chance de cura.',
    ],
    preparo: [
      'Biópsia de confirmação (sistemática + dirigida, incluindo vesículas seminais), PSMA-PET/CT, RM multiparamétrica; cistoscopia se sintomas urinários; avaliação da função retal e urinária.',
      'Preparo intestinal mecânico e antibiótico oral (risco de lesão retal) e consentimento sobre colostomia temporária.',
      'Consentimento detalhado: incontinência grave (30–50%, esfíncter artificial em 10–20%), lesão retal e fístula retouretral (2–9%), estenose de anastomose (10–30%), disfunção erétil quase certa, sangramento, necessidade de ADT adjuvante.',
      'Heparina de baixo peso e profilaxia antibiótica como na prostatectomia primária, com cobertura para anaeróbios se risco retal elevado.',
    ],
    anestesia: ['Iguais à prostatectomia robótica primária; prever tempo cirúrgico maior (3–4 h) e sangramento maior; reserva de sangue.'],
    instrumental: [
      'Igual à primária, acrescentando: sonda retal ou balão retal para identificar o reto; afastador retal; suturas para reparo retal em dois planos; material para colostomia se necessário.',
      'Em via transvesical de porta única (após HIFU ou braquiterapia), plataforma SP e acesso suprapúbico direto à bexiga.',
    ],
    decisoes: [
      'Via: anterior robótica padrão; Retzius-sparing para evitar o plano anterior fibrosado (útil após braquiterapia e HIFU); transvesical de porta única em próstatas pequenas após terapia focal.',
      'Preservação neurovascular raramente possível ou aconselhável: dissecção extrafascial, com os feixes na peça, para reduzir margem positiva em tecido fibrosado.',
      'Linfadenectomia estendida sempre (risco nodal alto após radioterapia).',
      'Colo vesical: ressecção ampla (sem preservação) com reconstrução em raquete; uretra fibrosada exige anastomose cuidadosa e sonda prolongada.',
      'Lesão retal reconhecida: reparo em dois planos com interposição de epíploo e colostomia protetora em paciente irradiado.',
    ],
    passos: [
      { t: 'Acesso e linfadenectomia', d: 'Acesso como na prostatectomia primária; esperar aderências e peritônio espessado após braquiterapia; linfadenectomia estendida bilateral.', dica: 'Comece pela linfadenectomia: os planos vasculares costumam estar preservados e ajudam a orientar a pelve fibrosada.', cuidado: 'Fibrose peri-ilíaca após radioterapia pélvica: dissecção mais lenta.' },
      { t: 'Espaço de Retzius e colo vesical', d: 'Descolar a bexiga; a gordura periprostática está substituída por fibrose e a junção vesicoprostática é indistinta: usar o balão da sonda, a visão dos meatos (azul de metileno ou indocianina se disponível) e seccionar o colo amplamente, levando o tecido fibrosado com a peça.', dica: 'Abrir a bexiga anteriormente mais cedo e trabalhar de dentro para fora ajuda a identificar os meatos.', cuidado: 'Meatos ureterais podem estar a poucos milímetros do colo fibrosado: duplo-J se dúvida.' },
      { t: 'Plano posterior (passo crítico)', d: 'Identificar precocemente o plano reto-prostático: tração anterior firme, dissecção cortante com tesoura fria rente à próstata, em pequenos movimentos; o assistente pode guiar com o dedo ou sonda retal. Se a fáscia de Denonvilliers estiver aderida, levar a fáscia com a peça e aceitar o plano mais próximo da próstata, nunca do reto. Ao final, teste do reto com ar ou azul de metileno via retal.', dica: 'Após HIFU e braquiterapia a fibrose posterior é máxima no ápice; vá da base para o ápice só depois de ter o plano claro.', cuidado: 'Lesão retal: reparo imediato em dois planos (mucosa e muscular), interposição de epíploo ou gordura, dreno, colostomia protetora em irradiados, dieta zero e antibiótico; fístula retouretral tardia exige reparo perineal ou transanal com retalho.' },
      { t: 'Pedículos e feixes', d: 'Controle dos pedículos com clipes e dissecção extrafascial ampla; os feixes vão com a peça, salvo caso selecionado unilateral.', dica: '', cuidado: 'Sangramento venoso em tecido irradiado para mal: hemostáticos tópicos e compressão.' },
      { t: 'Ápice e uretra', d: 'Ápice fibrosado e aderido ao assoalho pélvico: dissecção cortante, secção do CVD com controle tardio, secção da uretra preservando o que restar do esfíncter; uretra pode estar fina e friável.', dica: 'Mantenha um coto uretral o mais longo possível; a continência depende dele.', cuidado: 'Lesão do esfíncter e do assoalho: incontinência grave.' },
      { t: 'Reconstrução e anastomose', d: 'Reconstrução do colo em raquete, eversão da mucosa; anastomose com pontos separados (6–8) ou contínua farpada com mordidas largas, sobre sonda 20 Fr; reconstrução posterior se houver tecido; dreno sempre.', dica: 'Pontos separados dão mais segurança em tecido friável; amarre sem tensão.', cuidado: 'Estenose de anastomose (10–30%): dilatação, uretrotomia ou reconstrução; esfíncter artificial posterior exige anastomose estável.' },
      { t: 'Fechamento e drenagem', d: 'Hemostasia à pressão baixa; dreno pré-vesical; fechamento dos portais; sonda por 10–14 dias com cistografia antes da retirada.', dica: '', cuidado: '' },
    ],
    posop: [
      'Internação 2–4 dias; dieta progressiva mais lenta se reparo retal; antibiótico por 5–7 dias se lesão retal.',
      'Sonda 10–14 dias com cistografia; dreno retirado com débito baixo e sem creatinina.',
      'Fisioterapia intensiva do assoalho pélvico; esfíncter artificial após 12 meses se incontinência persistente; cistoscopia e dilatação se jato fraco (estenose).',
      'PSA em 6–8 semanas; ADT adjuvante se pN1; seguimento trimestral; prótese peniana após 12–18 meses se desejado.',
    ],
    complicacoes: [
      'Lesão retal 2–9%; fístula retouretral 1–3%; colostomia temporária quando necessária.',
      'Incontinência 30–50% aos 12 meses; esfíncter artificial em 10–20%.',
      'Estenose de anastomose 10–30%; estenose ureteral e lesão ureteral mais frequentes que na primária.',
      'Sangramento e transfusão 10–20%; linfocele; tromboembolismo; infecção.',
      'Disfunção erétil em quase todos.',
    ],
    resultados: [
      'Sobrevida livre de recorrência bioquímica 50–60% em 5 anos (70–80% se PSA pré-resgate < 4 e pT2); sobrevida câncer-específica 80–90% em 10 anos em séries selecionadas.',
      'Margens positivas 20–40%; pN1 15–25%.',
      'Continência 40–70% aos 12 meses, variando com a técnica e o tratamento prévio (pior após braquiterapia e HIFU de glândula inteira).',
    ],
    esquemas: [],
    videos: [],
  },
};
/* regra → procedimentos do guia */
const SURG_LINK = {
  'TXL-003': ['rarp', 'aberta'], 'TXI-003': ['rarp', 'eplnd', 'retzius', 'aberta'], 'TXU-002': ['rarp', 'eplnd', 'aberta'], 'TXH-002': ['rarp', 'eplnd', 'aberta'], 'TXA-001': ['rarp', 'eplnd', 'aberta'], 'TXA-006': ['eplnd', 'rarp'], 'BCR-041': ['resgate'],
};
/* esquemas desenhados (SVG, cores por token) */
const SURG_SVG = {
  portais: `<svg viewBox="0 0 320 260" role="img" aria-label="Disposição dos portais na prostatectomia robótica" class="schema"><title>Disposição dos portais</title><path d="M160 14 C230 14 262 60 262 120 C262 190 228 246 160 246 C92 246 58 190 58 120 C58 60 90 14 160 14 Z" fill="var(--surface)" stroke="var(--border)" stroke-width="2"/><circle cx="160" cy="92" r="6" fill="none" stroke="var(--muted)" stroke-width="2"/><text x="160" y="82" text-anchor="middle" font-size="10" fill="var(--muted)">umbigo</text><g fill="var(--accent)"><circle cx="160" cy="112" r="9"/><circle cx="110" cy="128" r="7"/><circle cx="210" cy="128" r="7"/><circle cx="252" cy="150" r="7"/></g><g fill="var(--warn)"><circle cx="72" cy="150" r="8"/><circle cx="86" cy="196" r="6"/></g><g font-size="10" fill="var(--fg)" text-anchor="middle"><text x="160" y="140">câmera 8–12 mm</text><text x="110" y="150">braço 8 mm</text><text x="210" y="150">braço 8 mm</text><text x="252" y="172">braço 8 mm</text><text x="72" y="172">assist. 12 mm</text><text x="86" y="214">assist. 5 mm</text></g><text x="160" y="36" text-anchor="middle" font-size="11" fill="var(--muted)">cabeça</text><text x="160" y="240" text-anchor="middle" font-size="11" fill="var(--muted)">pelve (lado direito do paciente à esquerda)</text></svg>`,
  planos: `<svg viewBox="0 0 320 244" role="img" aria-label="Planos de dissecção na preservação neurovascular" class="schema"><title>Planos de dissecção</title><g font-size="9.5" fill="var(--muted)"><text x="16" y="16">intrafascial: cápsula livre; fáscia prostática fica no paciente</text><text x="16" y="30">interfascial: entre fáscia prostática e fáscia do levantador</text><text x="16" y="44">extrafascial: feixe vai na peça (lado com risco de T3)</text></g><ellipse cx="160" cy="140" rx="104" ry="74" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="2 4"/><ellipse cx="160" cy="140" rx="86" ry="62" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 3"/><ellipse cx="160" cy="140" rx="70" ry="48" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2"/><circle cx="160" cy="140" r="8" fill="none" stroke="var(--fg)" stroke-width="1.5"/><g fill="var(--warn)"><ellipse cx="92" cy="182" rx="11" ry="8"/><ellipse cx="228" cy="182" rx="11" ry="8"/></g><rect x="120" y="218" width="80" height="16" rx="8" fill="none" stroke="var(--fg)" stroke-width="1.5"/><g font-size="10" fill="var(--fg)" text-anchor="middle"><text x="160" y="118">próstata</text><text x="160" y="160">uretra</text><text x="92" y="204">feixe NV</text><text x="228" y="204">feixe NV</text><text x="160" y="230">reto</text></g><g font-size="9" fill="var(--muted)" text-anchor="end"><text x="52" y="100">intra</text><text x="38" y="88">inter</text><text x="24" y="76">extra</text></g><line x1="56" y1="96" x2="92" y2="108" stroke="var(--accent)" stroke-width="1"/><line x1="42" y1="84" x2="78" y2="96" stroke="var(--muted)" stroke-width="1"/><line x1="28" y1="72" x2="60" y2="84" stroke="var(--muted)" stroke-width="1"/></svg>`,
  template: `<svg viewBox="0 0 360 300" role="img" aria-label="Template da linfadenectomia pélvica estendida" class="schema"><title>Template da linfadenectomia estendida</title><rect x="70" y="258" width="220" height="10" rx="5" fill="var(--neutral-soft)" stroke="var(--border)"/><path d="M244 126 L267 245 L238 258 L202 236 L212 194 Z" fill="var(--accent)" fill-opacity="0.18" stroke="var(--accent)" stroke-width="1.5"/><path d="M180 24 L180 70" stroke="var(--bad)" stroke-width="6" stroke-linecap="round"/><path d="M180 70 L120 120 L90 250" stroke="var(--bad)" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M180 70 L240 120 L270 250" stroke="var(--bad)" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M120 120 L150 190" stroke="var(--bad)" stroke-width="4" stroke-linecap="round"/><path d="M240 120 L210 190" stroke="var(--bad)" stroke-width="4" stroke-linecap="round"/><path d="M66 126 L50 258" stroke="var(--warn)" stroke-width="2" stroke-dasharray="4 3"/><path d="M136 166 L112 254" stroke="var(--good)" stroke-width="1.5"/><line x1="60" y1="114" x2="67" y2="124" stroke="var(--muted)" stroke-width="1"/><line x1="144" y1="150" x2="136" y2="150" stroke="var(--muted)" stroke-width="1"/><line x1="216" y1="150" x2="226" y2="150" stroke="var(--muted)" stroke-width="1"/><rect x="236" y="22" width="12" height="12" rx="2" fill="var(--accent)" fill-opacity="0.3" stroke="var(--accent)"/><g font-size="9.5" fill="var(--fg)"><text x="172" y="46" text-anchor="end">a. ilíaca comum</text><text x="172" y="66" text-anchor="end">bifurcação (limite cranial)</text><text x="94" y="172" text-anchor="end">a./v. ilíaca externa</text><text x="180" y="153" text-anchor="middle">ilíaca interna</text><text x="126" y="222">n. obturatório</text><text x="122" y="238" font-size="9">fossa obturatória</text><text x="8" y="110">n. genitofemoral</text><text x="8" y="122">(limite lateral)</text><text x="180" y="284" text-anchor="middle">ramo púbico · Cloquet (limite caudal)</text></g><text x="252" y="32" font-size="9.5" fill="var(--muted)">template (bilateral)</text></svg>`,
};
const SURG_CAP = { portais: 'Portais: câmera supraumbilical, três braços robóticos na linha 2 cm abaixo do umbigo, assistente à direita.', planos: 'Planos de preservação neurovascular: intrafascial (junto à cápsula), interfascial (entre as fáscias) e extrafascial (feixe removido com a peça). Escolher por lado conforme o risco de extensão extraprostática.', template: 'Template estendido (sombreado à direita, bilateral na prática): fossa obturatória, ilíaca externa e ilíaca interna, da bifurcação da ilíaca comum ao ramo púbico. Lateral: nervo genitofemoral; medial: bexiga e ureter; preservar o nervo obturatório.' };

/* Motor de regras – Câncer de bexiga (carcinoma urotelial)
   Regras 2026.11 · EAU NMIBC 2026 · EAU MIBC/metastático 2026 · NCCN v1.2026 (IBCG) · AUA/SUO 2026 · SBOC 2026
   Mesma convenção da próstata: id, text, strength (forte/moderada/fraca/nao/ensaio/alerta/padrao), src, br (chaves de disponibilidade). */
const Bladder = (() => {
  const num = (v) => (v === '' || v === null || v === undefined || isNaN(+v)) ? null : +v;
  const R = (id, text, strength, src, br, extra) => Object.assign({ id, text, strength, src, br: br || [] }, extra || {});

  /* ---------- NMIBC: risco EAU 2021 ---------- */
  function nmibcRisk(p) {
    const T = p.T || 'Ta';                   // Ta | T1 | CIS
    const hg = p.grau === 'HG' || p.grau === 'G3';
    const g2 = p.grau === 'G2';
    const lg = !hg && !g2;                   // LG ou G1
    const cis = T === 'CIS' || p.cis === 'sim';
    const primario = (p.recorrente || 'nao') !== 'sim';
    const idade = num(p.idade);
    const multiplos = p.multiplos === 'sim';
    const grande = p.tamanho === '>3';
    const nFat = [(idade !== null && idade > 70), multiplos, grande].filter(Boolean).length;
    const lvi = p.lvi === 'sim', subtipo = p.subtipo === 'sim', cisUretra = p.cis_uretra === 'sim';
    const crit = [];
    let group;
    if (lvi || subtipo || cisUretra) {
      group = 'muito_alto';
      if (lvi) crit.push('invasão linfovascular'); if (subtipo) crit.push('subtipo histológico agressivo'); if (cisUretra) crit.push('CIS na uretra prostática');
    } else if (T === 'CIS' && !p.papilar) {
      group = 'alto'; crit.push('CIS primário puro');
    } else if (hg && cis && T === 'T1' && nFat >= 1) { group = 'muito_alto'; crit.push('T1 HG/G3 + CIS + ' + nFat + ' fator(es) adicional(is)'); }
    else if (hg && cis && T === 'Ta' && nFat === 3) { group = 'muito_alto'; crit.push('Ta HG/G3 + CIS + 3 fatores adicionais'); }
    else if (g2 && cis && T === 'T1' && nFat >= 2) { group = 'muito_alto'; crit.push('T1 G2 + CIS + ' + nFat + ' fatores adicionais'); }
    else if (hg && !cis && T === 'T1' && nFat === 3) { group = 'muito_alto'; crit.push('T1 HG/G3 sem CIS com 3 fatores adicionais'); }
    else if (cis) { group = 'alto'; crit.push('CIS concomitante'); }
    else if (hg && T === 'T1') { group = 'alto'; crit.push('T1 HG/G3 sem CIS'); }
    else if (primario && nFat === 3 && ((T === 'Ta' && (lg || g2)) || (T === 'T1' && p.grau === 'G1'))) { group = 'alto'; crit.push((T === 'Ta' ? 'Ta LG/G2' : 'T1 G1') + ' sem CIS com os 3 fatores adicionais'); }
    else if (primario && nFat >= 2 && ((T === 'Ta' && hg) || (T === 'T1' && lg && p.grau !== 'G1'))) { group = 'alto'; crit.push((T === 'Ta' ? 'Ta HG/G3' : 'T1 LG') + ' sem CIS com ' + nFat + ' fatores adicionais'); }
    else if (primario && nFat >= 1 && T === 'T1' && g2) { group = 'alto'; crit.push('T1 G2 sem CIS com ' + nFat + ' fator(es) adicional(is)'); }
    else if (lg && primario && !cis && ((T === 'Ta' && nFat <= 1) || (T === 'T1' && nFat === 0 && !multiplos && !grande && (idade === null || idade <= 70)))) {
      group = 'baixo'; crit.push(T + ' LG/G1 primário' + (nFat ? ', 1 fator adicional' : ', sem fatores adicionais'));
    } else { group = 'intermediario'; crit.push(!primario ? 'tumor recorrente' : hg ? 'Ta HG/G3 sem CIS' : g2 ? 'grau G2' : 'LG com ≥ 2 fatores adicionais ou T1 com fator'); }
    const label = { baixo: 'Baixo risco', intermediario: 'Intermediário', alto: 'Alto risco', muito_alto: 'Muito alto risco' }[group];
    const who1973 = p.grau === 'G1' || p.grau === 'G2' || p.grau === 'G3';
    const prog = (who1973 ? { baixo: [0.12, 0.57, 3.0], intermediario: [0.65, 3.6, 7.4], alto: [3.8, 11, 14], muito_alto: [20, 44, 59] } : { baixo: [0.06, 0.93, 3.7], intermediario: [1.0, 4.9, 8.5], alto: [3.5, 9.6, 14], muito_alto: [16, 40, 53] })[group];
    // IBCG (só no intermediário)
    let ibcg = null;
    if (group === 'intermediario') {
      const f = [];
      if (multiplos) f.push('multifocal'); if (grande) f.push('≥ 3 cm');
      if (p.recorrente === 'sim' && p.recidiva_1ano === 'sim') f.push('recidiva < 1 ano');
      if (p.recorrente === 'sim' && p.recidivas_freq === 'sim') f.push('> 1 recidiva/ano');
      if (p.falha_intravesical === 'sim') f.push('falha intravesical prévia');
      const n = f.length;
      ibcg = { n, fatores: f, sub: n === 0 ? 'int_baixo' : n <= 2 ? 'int_medio' : 'int_alto', label: n === 0 ? 'Intermediário · 0 fatores IBCG' : n <= 2 ? 'Intermediário · ' + n + ' fator(es) IBCG' : 'Intermediário · ≥ 3 fatores IBCG (alto dentro do intermediário)', rec1: n === 0 ? 10.7 : n <= 2 ? 13.1 : 33.5, rec3: n === 0 ? 29.5 : n <= 2 ? 36.9 : 67.5 };
    }
    // AUA/NCCN
    let aua;
    if (lvi || subtipo || cisUretra || cis || (hg && T === 'T1') || (hg && (grande || multiplos)) || (hg && !primario) || (hg && (p.bcg_previo || 'nao') !== 'nao' && p.bcg_recidiva_hg !== 'nao') || p.falha_bcg_hg === 'sim') aua = 'alto';
    else if (hg || T === 'T1' || grande || multiplos || (p.recorrente === 'sim' && p.recidiva_1ano === 'sim')) aua = 'intermediario';
    else aua = 'baixo';
    const auaLabel = { baixo: 'Baixo risco', intermediario: 'Intermediário', alto: 'Alto risco' }[aua];
    let div = null;
    if (group !== aua && !(group === 'muito_alto' && aua === 'alto')) {
      if (hg && T === 'Ta' && !cis) div = 'A AUA/NCCN classifica Ta HG pelo tamanho e multiplicidade; a EAU usa idade, número e tamanho como fatores adicionais.';
      else if (T === 'T1' && lg) div = 'A AUA/NCCN não aceita T1 no baixo risco; a EAU aceita T1 LG primário, único, < 3 cm, em ≤ 70 anos.';
      else if (lg && T === 'Ta') div = 'A EAU tolera um fator adicional (idade, tamanho ou número) no baixo risco; a AUA/NCCN não.';
      else div = 'Critérios próprios de cada sistema.';
    }
    return { group, label, crit, prog, who1973, ibcg, aua, auaLabel, div, cis, hg, T, primario, nFat };
  }

  /* ---------- NMIBC: falha ao BCG ---------- */
  function bcgFailure(p) {
    if ((p.bcg_previo || 'nao') === 'nao') return null;
    const ind = num(p.bcg_inducao) ?? 0, man = num(p.bcg_manut) ?? 0, reind = num(p.bcg_reinducao) ?? 0;
    const adequado = (ind >= 5 && (man >= 2 || reind >= 2)) || (ind >= 5 && p.bcg_segunda_inducao === 'sim' && reind >= 2);
    const t = p.bcg_quando || 'na';           // '3m' | '6m' | '<6' | '6-12' | '>12' | 'na'
    const hgRec = p.bcg_recidiva_hg !== 'nao';
    const T1 = p.T === 'T1';
    const cis = p.T === 'CIS' || p.cis === 'sim';
    let cat, def;
    if (p.bcg_intolerante === 'sim') { cat = 'intolerante'; def = 'BCG-intolerante: suspensão por toxicidade antes de completar a indução; pode receber dose reduzida ou outro agente.'; }
    else if (!hgRec) { cat = 'lg', def = 'Recidiva de baixo grau após BCG: não é falha; tratar como intermediário.'; }
    else if (t === '3m' && ind < 5) { cat = 'exposto'; def = 'BCG-exposto: doença HG aos 3 meses após indução incompleta (< 5 de 6 instilações); completar a indução/novo curso antes de rotular falha.'; }
    else if (t === '3m' && T1) { cat = 'nao_respondedor'; def = 'BCG-não respondedor: T1 HG na primeira avaliação (3 meses) após indução adequada — não exige manutenção prévia (definição FDA/EAU).'; }
    else if (t === '3m' && cis) { cat = 'refratario_cis3'; def = 'CIS persistente aos 3 meses após indução: refratário provável; um segundo curso de indução (ou manutenção) é aceitável antes de declarar falha — persistência aos 6 meses define não respondedor.'; }
    else if (t === '3m') { cat = 'exposto'; def = 'Ta HG persistente aos 3 meses após indução adequada: ainda não é falha — completar manutenção ou reindução e reavaliar aos 6 meses; persistência aos 6 meses define BCG-refratário.'; }
    else if (!adequado && t !== '>12') { cat = 'exposto'; def = 'BCG-exposto: recidiva HG após BCG inadequado (< 5/6 indução ou < 2/3 manutenção); pode receber novo curso completo de BCG.'; }
    else if (t === '6m') { cat = 'nao_respondedor'; def = 'BCG-não respondedor (refratário): doença HG persistente aos 6 meses após BCG adequado (indução + manutenção ou reindução).'; }
    else if (t === '<6' || (t === '6-12' && cis)) { cat = 'nao_respondedor'; def = 'BCG-não respondedor (recidivante precoce): recidiva HG ' + (cis ? 'com CIS em até 12 meses' : 'em até 6 meses') + ' após BCG adequado.'; }
    else if (t === '6-12') { cat = 'recidivante_int'; def = 'BCG-recidivante intermediário (6–12 meses, papilífero sem CIS): fora da definição estrita de não respondedor; novo BCG ou opções de preservação em discussão multidisciplinar.'; }
    else { cat = 'recidivante_tardio'; def = 'BCG-recidivante tardio (> 12 meses): novo curso de BCG é aceitável.'; }
    return { cat, def, adequado, unresp: cat === 'nao_respondedor', continuar: cat === 'exposto' && t === '3m' && ind >= 5 };
  }

  /* ---------- NMIBC: condutas ---------- */
  function nmibc(p) {
    const r = nmibcRisk(p);
    const out = [], alerts = [], pend = [];
    const bcgOk = (p.bcg_disp || 'sim') !== 'nao';
    const bcgParcial = p.bcg_disp === 'parcial';
    const noMuscle = p.musculo === 'nao', reTur = p.re_rtu === 'sim';
    const le = p.saude || 'bom';
    // alertas de estadiamento
    if (r.T === 'T1' && !reTur) alerts.push(R('BX-DX-01', 'T1 sem re-RTU: fazer segunda ressecção em 2–6 semanas (reclassifica 20–30%; músculo-invasivo em 5–15%). Grupo provisório até o resultado.', 'alerta', 'EAU 2026 (forte)'));
    if (noMuscle && !(r.T === 'Ta' && !r.hg) && r.T !== 'CIS') alerts.push(R('BX-DX-02', 'Sem músculo detrusor no espécime: re-RTU obrigatória (exceto Ta LG e CIS primário).', 'alerta', 'EAU 2026 (forte)'));
    if (p.cis_uretra === 'sim') alerts.push(R('BX-DX-03', 'CIS na uretra prostática: RTU da uretra prostática para estadiar; se ductos ou estroma acometidos, cistoprostatectomia.', 'alerta', 'EAU 2026'));
    if (p.cis === 'ni') pend.push(R('BX-DX-04', 'Laudo sem menção a CIS concomitante: pedir revisão; CIS muda o grupo e a conduta.', 'padrao', 'Módulo'));
    const fail = bcgFailure(p);
    // falha ao BCG
    if (fail && (fail.unresp || fail.cat === 'refratario_cis3')) {
      out.push(R('BX-BCG-00', fail.def, 'padrao', 'EAU 2026 Tabela 7.5; FDA/IBCG'));
      out.push(R('BX-BCG-01', 'Cistectomia radical com linfadenectomia padrão, sem atraso: conduta preferida no BCG-não respondedor de alto risco (sobrevida câncer-específica > 90% se feita antes da invasão muscular).', 'forte', 'EAU 2026; SBOC 2026', ['cistectomia'], { kind: 'padrao' }));
      if (fail.cat === 'refratario_cis3') out.push(R('BX-BCG-02', 'CIS persistente aos 3 meses: segundo curso de indução de BCG (6 semanas) é aceitável; reavaliar aos 6 meses; persistência = não respondedor.', 'fraca', 'EAU 2026', ['bcg']));
      out.push(R('BX-BCG-03', 'Preservação vesical (recusa ou inaptidão à cistectomia): gemcitabina 1 g + docetaxel 37,5 mg intravesicais sequenciais, semanal × 6, manutenção mensal por 12–24 meses (sobrevida livre de HG 60% em 12 meses; baixo custo).', 'fraca', 'AUA/SUO 2026; SBOC 2026', ['gem_doce']));
      out.push(R('BX-BCG-04', 'Pembrolizumabe 200 mg IV a cada 3 semanas (ou 400 mg a cada 6) até 24 meses; RC 41% em CIS, 19% mantidas em 12 meses.', 'fraca', 'EAU 2026; KEYNOTE-057; ANVISA restrito a inelegíveis a cistectomia', ['pembro_nmibc']));
      out.push(R('BX-BCG-05', 'Nogapendekin alfa inbakicept 400 mcg + BCG intravesical semanal × 6, manutenção nos meses 4, 7, 10, 13 e 19 (até 37 meses); RC 62–71% em CIS; indicação ampliada a papilífero (FDA out/2026).', 'fraca', 'EAU 2026; QUILT-3.032', ['n803']));
      out.push(R('BX-BCG-06', 'TAR-200 (sistema intravesical de gemcitabina) a cada 3 semanas por 24 semanas, depois a cada 12 semanas até a semana 96; RC 82,8%, 74,6% mantidas em 12 meses.', 'fraca', 'AUA/SUO 2026; SunRISe-1', ['tar200']));
      out.push(R('BX-BCG-07', 'Nadofaragene firadenovec 75 mL intravesical a cada 3 meses; RC 53% aos 3 meses, 24% aos 12.', 'fraca', 'EAU 2026', ['nadofaragene']));
      alerts.push(R('BX-BCG-08', 'Adiar a cistectomia em BCG-não respondedor pode permitir progressão para doença metastática; definir de antemão o limite (falha a 2 linhas de preservação, T1 HG recorrente, LVI ou subtipo).', 'alerta', 'AUA 2026; bula FDA'));
      return { risk: r, fail, out, alerts, pend, followup: followup(r) };
    }
    if (fail && (fail.cat === 'exposto' || fail.cat === 'recidivante_tardio' || fail.cat === 'recidivante_int')) {
      out.push(R('BX-BCG-00', fail.def, 'padrao', 'EAU 2026 Tabela 7.5'));
      out.push(fail.continuar ? R('BX-BCG-09b', 'Completar o esquema: manutenção (3 instilações semanais aos 3, 6 e 12 meses) ou reindução de 6 semanas; reavaliar com cistoscopia + citologia aos 6 meses — persistência de HG define BCG-refratário.', 'fraca', 'EAU 2026', ['bcg']) : R('BX-BCG-09', 'Novo curso completo de BCG (indução 6 semanas + manutenção), se disponível e tolerado; discutir cistectomia precoce em T1 HG ou CIS recorrente.', 'fraca', 'EAU 2026', ['bcg']));
      if (fail.cat === 'recidivante_int') out.push(R('BX-BCG-03', 'Alternativa: gemcitabina + docetaxel intravesical sequencial, ou inclusão em ensaio de preservação vesical.', 'fraca', 'AUA/SUO 2026', ['gem_doce']));
    }
    if (fail && fail.cat === 'intolerante') { out.push(R('BX-BCG-00', fail.def, 'padrao', 'EAU 2026')); out.push(R('BX-BCG-10', 'BCG em dose reduzida (1/3) ou quimioterapia intravesical (mitomicina, gemcitabina ou gem/doce); cistectomia se alto risco com intolerância repetida.', 'fraca', 'EAU 2026', ['bcg', 'mitomicina', 'gem_doce'])); }
    if (fail && fail.cat === 'lg') out.push(R('BX-BCG-00', fail.def, 'padrao', 'EAU 2026'));
    // condutas por grupo
    const g = r.group;
    if (g === 'baixo') {
      out.push(R('BX-TX-01', 'Uma instilação imediata de quimioterápico após a RTU (mitomicina C 40 mg, epirrubicina 50 mg ou gemcitabina 2 g, nas primeiras 24 h); nenhum tratamento adicional.', 'forte', 'EAU 2026; SBOC 2026', ['mitomicina'], { kind: 'padrao' }));
      out.push(R('BX-TX-02', 'Recidivas pequenas de baixo grau: fulguração ou quimioablação em consultório, ou vigilância ativa, no lugar de nova RTU sob anestesia.', 'fraca', 'AUA/SUO 2026', []));
    }
    if (g === 'intermediario') {
      const sub = r.ibcg ? r.ibcg.sub : 'int_medio';
      out.push(R('BX-TX-03', 'Instilação imediata de quimioterápico após a RTU (salvo perfuração ou sangramento).', 'forte', 'EAU 2026', ['mitomicina']));
      if (sub === 'int_baixo') out.push(R('BX-TX-04', 'Intermediário com 0 fatores IBCG: instilação única pode bastar; alternativa: quimioterapia intravesical com manutenção até 1 ano.', 'moderada', 'NCCN v1.2026 (IBCG)', ['mitomicina']));
      if (sub !== 'int_alto') out.push(R('BX-TX-05', 'Quimioterapia intravesical: mitomicina C 40 mg (ou gemcitabina 2 g) semanal × 6, depois mensal até 12 meses.', 'forte', 'EAU 2026; SBOC 2026', ['mitomicina'], { kind: sub === 'int_medio' && !bcgOk ? 'padrao' : undefined }));
      out.push(R('BX-TX-06', 'BCG dose plena por 1 ano: indução semanal × 6, manutenção 3 semanais aos 3, 6 e 12 meses (15 doses)' + (bcgParcial || !bcgOk ? '; em escassez, dose 1/3 é aceitável no intermediário' : '') + '.', sub === 'int_alto' ? 'forte' : 'forte', 'EAU 2026; SBOC 2026 (NE alto / FR forte)', ['bcg'], { kind: sub === 'int_alto' && bcgOk ? 'padrao' : undefined, excluida: !bcgOk ? 'BCG indisponível no serviço: priorizar para alto risco (posicionamento SBOC)' : undefined }));
      if (sub === 'int_alto') out.push(R('BX-TX-07', '≥ 3 fatores IBCG (recidiva 67% em 3 anos): tratar com a intensidade do alto risco; BCG com manutenção preferido à quimioterapia.', 'moderada', 'NCCN v1.2026 (IBCG)', ['bcg']));
    }
    if (g === 'alto') {
      out.push(R('BX-TX-08', 'BCG dose plena por 1 a 3 anos: indução semanal × 6, manutenção 3 semanais aos 3, 6, 12, 18, 24, 30 e 36 meses (27 doses em 3 anos); 3 anos reduz recidiva, não progressão' + (!bcgOk ? '; BCG indisponível: priorizar este grupo, buscar outro centro' : bcgParcial ? '; em escassez, 1 ano de manutenção' : '') + '.', 'forte', 'EAU 2026; SBOC 2026 (NE alto / FR forte)', ['bcg'], { kind: 'padrao' }));
      out.push(R('BX-TX-09', 'Cistectomia radical precoce: discutir nos de maior risco dentro do alto (T1 HG com CIS, T1 HG recorrente, múltiplos fatores), pela progressão de 10% em 5 anos.', 'fraca', 'EAU 2026', ['cistectomia']));
      out.push(R('BX-TX-10', 'BCG + sasanlimabe SC a cada 4 semanas até 25 ciclos (CREST: EFS HR 0,68) ou BCG + durvalumabe (POTOMAC), em pacientes selecionados BCG-naïve; mais eventos imunomediados; sem ganho em progressão.', 'fraca', 'EAU 2026 (nova); AUA 2026 não recomenda', ['sasanlimabe']));
      if (!bcgOk) out.push(R('BX-TX-11', 'Sem BCG: gemcitabina + docetaxel intravesical sequencial é a alternativa com melhor evidência; mitomicina com manutenção é inferior no alto risco.', 'fraca', 'AUA/SUO 2026; SBOC 2023', ['gem_doce']));
    }
    if (g === 'muito_alto') {
      out.push(R('BX-TX-12', 'Cistectomia radical imediata com linfadenectomia padrão (progressão de 40% em 5 anos sem cistectomia).', 'forte', 'EAU 2026; SBOC 2026', ['cistectomia'], { kind: 'padrao' }));
      out.push(R('BX-TX-13', 'Se o paciente recusa cistectomia: BCG dose plena por 1–3 anos com aviso explícito do risco de progressão; reavaliação aos 3 meses com biópsia.', 'fraca', 'EAU 2026', ['bcg']));
      if (p.cis_uretra === 'sim') out.push(R('BX-TX-14', 'CIS da uretra prostática: RTU da uretra prostática + BCG se restrito ao epitélio; cistoprostatectomia com uretrectomia se ductos/estroma acometidos.', 'forte', 'EAU 2026', ['bcg', 'cistectomia']));
    }
    if (le === 'fragil') alerts.push(R('BX-SAU-01', 'Paciente frágil: BCG e cistectomia têm morbidade relevante; considerar quimioterapia intravesical, fulguração e vigilância, com decisão compartilhada.', 'alerta', 'Módulo saúde'));
    return { risk: r, fail, out, alerts, pend, followup: followup(r) };
  }
  function followup(r) {
    const up = r.group === 'intermediario' && r.hg;
    const g = up ? 'alto' : r.group;
    const nota = up ? 'Esquema de alto risco aplicado: tumor de alto grau (a AUA/NCCN o classifica como alto risco; a EAU 2026 recomenda vigilância mais intensa no intermediário de alto grau).' : '';
    if (g === 'baixo') return { cisto: 'Cistoscopia aos 3 e 12 meses, depois anual por 5 anos', cito: 'Citologia não necessária', img: 'Sem imagem sistemática do trato superior', dur: '5 anos' };
    if (g === 'intermediario') return { cisto: 'Cistoscopia aos 3 meses; a cada 6 meses por 2 anos; depois anual por 10 anos', cito: 'Citologia não necessária', img: 'Imagem do trato superior a cada 1–2 anos (AUA 2026); EAU: não sistemática', dur: '10 anos' };
    return { cisto: 'Cistoscopia a cada 3 meses por 2 anos; a cada 6 meses até 5 anos; depois anual, por toda a vida', cito: 'Citologia nos mesmos intervalos', img: 'Uro-TC anual até 5 anos, depois a cada 2 anos até 10 anos', dur: 'Vitalício', nota };
  }

  /* ---------- MIBC ---------- */
  function cisplatinEligible(p) {
    const tfg = num(p.tfg);
    const reasons = [];
    if ((num(p.ecog) ?? 0) >= 2) reasons.push('ECOG ≥ 2');
    if (tfg !== null && tfg < 50) reasons.push('TFG ' + tfg + ' mL/min (< 50)');
    if (p.audicao === 'sim') reasons.push('perda auditiva ≥ grau 2');
    if (p.neuropatia === 'sim') reasons.push('neuropatia ≥ grau 2');
    if (p.icc === 'sim') reasons.push('insuficiência cardíaca NYHA ≥ III');
    return { eligible: reasons.length === 0, reasons, tfg, durvaOk: reasons.filter((x) => !x.startsWith('TFG')).length === 0 && (tfg === null || tfg >= 40) };
  }
  function mibc(p) {
    const out = [], alerts = [], info = {};
    const cT = p.cT || 'T2', cN = p.cN || 'N0', cM = p.cM || 'M0';
    if (cM !== 'M0') { out.push(R('BX-MIBC-00', 'Doença metastática: seguir pelo fluxo "Metástase".', 'padrao', 'Fluxo')); return { out, alerts, info: { status: 'cM1' } }; }
    const el = cisplatinEligible(p);
    info.status = 'c' + cT + ' c' + cN + ' cM0';
    info.cis = el.eligible ? 'Elegível a cisplatina' : 'Inelegível a cisplatina (' + el.reasons.join('; ') + ')';
    const le = p.saude || 'bom';
    if (p.imagem !== 'tc') alerts.push(R('BX-MIBC-01', 'Estadiamento completo antes de decidir: TC de tórax, abdome e pelve com fase urográfica (forte); RM multiparamétrica antes da RTU se usada para estadiamento local.', 'alerta', 'EAU 2026'));
    if (p.uretra_prost === 'sim') alerts.push(R('BX-MIBC-02', 'Tumor na uretra prostática/colo: contraindica neobexiga ortotópica se margem uretral positiva; planejar conduto ileal ou uretrectomia.', 'alerta', 'EAU 2026 (forte)'));
    if (le === 'fragil') { out.push(R('BX-MIBC-03', 'Paciente frágil: cistectomia e quimioterapia têm alta morbidade; considerar radioterapia (55 Gy/20 fx) com ou sem radiossensibilizador, RTU paliativa e cuidados paliativos; decisão em equipe.', 'padrao', 'EAU 2026 (fraca)', ['rt'])); }
    // perioperatório
    if (el.durvaOk && el.eligible) out.push(R('BX-MIBC-10', 'Gemcitabina/cisplatina × 4 + durvalumabe 1.500 mg a cada 3 semanas × 4 antes da cistectomia; após, durvalumabe 1.500 mg a cada 4 semanas × 8 (NIAGARA: pCR 37% vs 27%, ganho em EFS e OS).', 'forte', 'EAU 2026; SBOC 2026 (NE alto / FR forte)', ['gc', 'durvalumabe'], { kind: 'padrao' }));
    else if (el.durvaOk && !el.eligible && el.tfg !== null && el.tfg >= 40) out.push(R('BX-MIBC-10', 'TFG 40–49: GC + durvalumabe perioperatório é permitido (NIAGARA aceitou TFG ≥ 40, com cisplatina fracionada).', 'forte', 'EAU 2026', ['gc', 'durvalumabe'], { kind: 'padrao' }));
    if (el.eligible) {
      out.push(R('BX-MIBC-11', 'Quimioterapia neoadjuvante com cisplatina: ddMVAC × 3–6 ciclos a cada 14 dias com G-CSF (preferido na NCCN) ou gemcitabina/cisplatina × 4 a cada 21 dias; cistectomia 4–8 semanas após.', 'forte', 'EAU 2026; NCCN categoria 1; SBOC', ['gc', 'ddmvac']));
      out.push(R('BX-MIBC-12', 'Enfortumabe vedotina + pembrolizumabe perioperatório (KEYNOTE-B15: pCR 57% vs 22%) também em elegíveis a cisplatina; incorporação formal em andamento.', 'fraca', 'EAU 2026 (dados de congresso)', ['ev_pembro_peri']));
    } else {
      out.push(R('BX-MIBC-13', 'Inelegível a cisplatina: enfortumabe vedotina 1,25 mg/kg D1 e D8 + pembrolizumabe 200 mg D1 a cada 3 semanas × 3 antes da cistectomia; após, EV × 6 + pembrolizumabe × 14 ciclos (KEYNOTE-905: EFS HR 0,40; OS HR 0,50).', 'forte', 'EAU 2026; NCCN categoria 1; SBOC 2026', ['ev_pembro_peri'], { kind: 'padrao' }));
      out.push(R('BX-MIBC-14', 'Não fazer neoadjuvante com carboplatina (sem benefício); se EV + pembro indisponível, ir direto à cistectomia.', 'nao', 'EAU 2026 (forte, contra)', []));
    }
    out.push(R('BX-MIBC-15', 'Cistectomia radical com linfadenectomia pélvica padrão (obturatória, ilíaca externa e interna até o cruzamento do ureter) e derivação urinária; não adiar além de 3 meses (salvo neoadjuvante); centro com ≥ 20 cistectomias/ano; ERAS; heparina de baixo peso por 4 semanas.', 'forte', 'EAU 2026', ['cistectomia']));
    out.push(R('BX-MIBC-16', 'Linfadenectomia estendida não melhora sobrevida e aumenta morbidade (LEA, SWOG S1011).', 'nao', 'EAU 2026 (forte, contra)', []));
    out.push(R('BX-MIBC-17', 'Não fazer radioterapia pré-operatória.', 'nao', 'EAU 2026 (forte, contra)', []));
    // TMT
    const tmtOk = ['T2', 'T3a'].includes(cT) && cN === 'N0' && p.hidronefrose !== 'sim' && p.cis_extenso !== 'sim' && p.unico === 'sim' && p.rtu_completa === 'sim' && p.bexiga_func !== 'nao';
    const tmtWhy = [];
    if (!['T2', 'T3a'].includes(cT)) tmtWhy.push('c' + cT); if (cN !== 'N0') tmtWhy.push('cN+'); if (p.hidronefrose === 'sim') tmtWhy.push('hidronefrose'); if (p.cis_extenso === 'sim') tmtWhy.push('CIS extenso'); if (p.unico !== 'sim') tmtWhy.push('multifocal'); if (p.rtu_completa !== 'sim') tmtWhy.push('RTU incompleta'); if (p.bexiga_func === 'nao') tmtWhy.push('bexiga disfuncional');
    info.tmt = tmtOk ? 'Candidato à trimodalidade' : 'Trimodalidade desfavorável (' + tmtWhy.join(', ') + ')';
    if (tmtOk) {
      out.push(R('BX-TMT-01', 'Preservação vesical por trimodalidade: RTU máxima + radioterapia 64 Gy/32 fx ou 55 Gy/20 fx com cisplatina 35–40 mg/m² semanal (ou 5-FU 500 mg/m² D1–5 e D16–20 + mitomicina 12 mg/m² D1, ou gemcitabina 27 mg/m² 2×/semana); reavaliação com cistoscopia e biópsia; cistectomia de resgate se doença persistente.', 'forte', 'EAU 2026 (opção curativa primária); SBOC 2026 (NE moderado / FR forte)', ['rt', 'cisplatina'], { kind: p.prefere_preservacao === 'sim' ? 'padrao' : undefined }));
      out.push(R('BX-TMT-02', 'Seguimento após TMT: cistoscopia + citologia a cada 3 meses por 2 anos, 6/6 até 5 anos, depois anual; TC a cada 6 meses por 2 anos; 10–30% precisarão de cistectomia de resgate.', 'forte', 'EAU 2026', []));
    } else if (p.prefere_preservacao === 'sim') {
      out.push(R('BX-TMT-03', 'Preservação vesical desfavorável (' + tmtWhy.join(', ') + '): resultados piores; se mantida a recusa à cistectomia, quimiorradioterapia com aviso e seguimento rigoroso.', 'fraca', 'EAU 2026', ['rt']));
    }
    out.push(R('BX-TMT-04', 'Radioterapia isolada, RTU isolada ou quimioterapia isolada não são tratamento curativo.', 'nao', 'EAU 2026 (forte, contra)', []));
    // adjuvante (submódulo): após cistectomia, só as regras adjuvantes
    if (p.pos_cistectomia === 'sim') {
      out.length = 0; alerts.length = 0;
      const pT = p.pT || 'pT2', pN = p.pN || 'pN0', neo = p.neo_feito || 'nao';
      const high = ['pT3', 'pT4'].includes(pT) || pN !== 'pN0';
      info.pat = pT + ' ' + pN + (neo !== 'nao' ? ' após neoadjuvante' : '');
      if (neo === 'gc_durva') out.push(R('BX-ADJ-01', 'Após GC + durvalumabe neoadjuvante: durvalumabe 1.500 mg a cada 4 semanas × 8 ciclos.', 'forte', 'EAU 2026; NIAGARA', ['durvalumabe'], { kind: 'padrao' }));
      else if (neo === 'ev_pembro') out.push(R('BX-ADJ-02', 'Após EV + pembrolizumabe neoadjuvante: completar EV × 6 + pembrolizumabe × 14 ciclos adjuvantes.', 'forte', 'EAU 2026; KEYNOTE-905', ['ev_pembro_peri'], { kind: 'padrao' }));
      else if (neo === 'quimio' && (['pT2', 'pT3', 'pT4'].includes(pT) || pN !== 'pN0')) out.push(R('BX-ADJ-03', 'Doença residual ≥ ypT2 ou ypN+ após quimioterapia neoadjuvante: nivolumabe 240 mg a cada 2 semanas ou 480 mg a cada 4 semanas por 1 ano (CheckMate 274).', 'forte', 'EAU 2026; NCCN categoria 1', ['nivolumabe'], { kind: 'padrao' }));
      else if (neo === 'nao' && high && el.eligible) out.push(R('BX-ADJ-04', 'pT3–4 e/ou pN+ sem neoadjuvante, elegível a cisplatina: GC × 4 ou ddMVAC × 3–4 adjuvantes.', 'forte', 'EAU 2026; SBOC (NE baixo / FR forte)', ['gc', 'ddmvac'], { kind: 'padrao' }));
      else if (neo === 'nao' && high) out.push(R('BX-ADJ-05', 'pT3–4 e/ou pN+ inelegível ou que recusa quimioterapia: nivolumabe por 1 ano (EMA exige PD-L1 ≥ 1%; FDA e ANVISA não).', 'forte', 'EAU 2026; CheckMate 274', ['nivolumabe'], { kind: 'padrao' }));
      else out.push(R('BX-ADJ-06', 'pT2 pN0 (ou ypT0–1 N0): sem tratamento adjuvante; seguimento.', 'forte', 'EAU 2026; SBOC 2026', [], { kind: 'padrao' }));
      if (['pT3b', 'pT4'].includes(pT) || pN !== 'pN0' || p.margem === 'sim') out.push(R('BX-ADJ-07', 'Radioterapia adjuvante pélvica 50–54 Gy em pT3b–4, pN+ ou margem positiva: melhora controle local, não sobrevida.', 'fraca', 'EAU 2026', ['rt']));
      out.push(R('BX-ADJ-08', 'Seguimento pós-cistectomia: TC de tórax/abdome/pelve a cada 6 meses por 2 anos, depois anual até 5; função renal, eletrólitos e B12 anual; imagem do trato superior anual; lavado uretral se uretra retida com fatores de risco.', 'forte', 'EAU 2026', []));
    }
    return { out, alerts, info };
  }

  /* ---------- Metastático ---------- */
  function metastatic(p) {
    const out = [], alerts = [], info = {};
    const linha = p.linha || '1';
    const prev = new Set(p.previos || []);          // 'platina' | 'io' | 'ev' | 'erda'
    const el = cisplatinEligible(p);
    info.status = linha === '1' ? 'Primeira linha' : 'Linha subsequente (prévios: ' + ([...prev].join(', ') || 'nenhum') + ')';
    info.cis = el.eligible ? 'Elegível a cisplatina' : 'Inelegível a cisplatina (' + el.reasons.join('; ') + ')';
    const evContra = p.ev_contra === 'sim';
    const ioContra = p.io_contra === 'sim';
    const fgfr = p.fgfr === 'sim', her2 = p.her2 || 'nt', pdl1 = p.pdl1 || 'nt';
    out.push(R('BX-MET-00', 'Antes de tratar: ECOG, função renal, HbA1c e neuropatia (toxicidades do enfortumabe), teste de FGFR2/3 e HER2 por imuno-histoquímica (SBOC recomenda quando disponíveis); PD-L1 só para monoterapia.', 'padrao', 'EAU 2026; SBOC 2026', ['fgfr_teste']));
    if (linha === '1') {
      if (!evContra && !ioContra) out.push(R('BX-MET-01', 'Enfortumabe vedotina 1,25 mg/kg IV D1 e D8 + pembrolizumabe 200 mg D1, a cada 3 semanas, até progressão (pembrolizumabe até 35 ciclos); EV-302: OS 31,5 vs 16,1 meses (HR 0,47), resposta 68%. Para elegíveis e inelegíveis a cisplatina.', 'forte', 'EAU 2026; NCCN categoria 1; SBOC (NE alto / FR forte)', ['ev_pembro'], { kind: 'padrao' }));
      if (evContra && !ioContra && el.eligible) out.push(R('BX-MET-02', 'EV contraindicado, elegível a cisplatina: gemcitabina 1.000 mg/m² D1 e D8 + cisplatina 70 mg/m² D1 a cada 3 semanas × 6 + nivolumabe 360 mg; depois nivolumabe 480 mg a cada 4 semanas até 2 anos (CheckMate 901: OS 21,7 vs 18,9).', 'forte', 'EAU 2026; SBOC', ['gc', 'nivolumabe'], { kind: 'padrao' }));
      if (evContra && !ioContra) out.push(R('BX-MET-03', 'EV contraindicado: ' + (el.eligible ? 'gemcitabina/cisplatina' : 'gemcitabina 1.000 mg/m² D1 e D8 + carboplatina AUC 4,5–5 D1') + ' a cada 3 semanas × 4–6; se doença estável ou resposta, avelumabe 800 mg a cada 2 semanas de manutenção até progressão (JAVELIN Bladder 100: OS 21,4 vs 14,3).', 'forte', 'EAU 2026; NCCN categoria 1; SBOC', ['gc', 'carbo', 'avelumabe'], { kind: el.eligible ? undefined : 'padrao' }));
      if (evContra && ioContra) out.push(R('BX-MET-04', 'EV e imunoterapia contraindicados: platina + gemcitabina × 4–6 ciclos.', 'forte', 'EAU 2026', ['gc', 'carbo'], { kind: 'padrao' }));
      if (!evContra && ioContra) out.push(R('BX-MET-05', 'Imunoterapia contraindicada: platina + gemcitabina; enfortumabe vedotina em monoterapia na progressão.', 'forte', 'EAU 2026', ['gc', 'carbo', 'ev_mono'], { kind: 'padrao' }));
      if (p.combinacao === 'nao') out.push(R('BX-MET-06', 'Não tolera combinação' + (pdl1 === 'alto' ? ', PD-L1 alto' : '') + ': pembrolizumabe 200 mg a cada 3 semanas ou atezolizumabe 1.200 mg a cada 3 semanas em monoterapia' + (pdl1 !== 'alto' ? ' (benefício restrito a PD-L1 alto)' : '') + '.', 'fraca', 'EAU 2026', ['pembro_met', 'atezolizumabe']));
    } else {
      if (prev.has('ev') && prev.has('io')) {
        if (fgfr) out.push(R('BX-MET-10', 'FGFR2/3 alterado após EV + pembrolizumabe: erdafitinibe 8 mg VO/dia, escalonar a 9 mg se fosfato < 5,5 mg/dL no dia 14–21 (THOR: OS 12,1 vs 7,8); oftalmologia mensal nos 4 primeiros meses.', 'forte', 'EAU 2026', ['erdafitinibe'], { kind: 'padrao' }));
        if (!prev.has('platina')) out.push(R('BX-MET-11', 'Após EV + pembrolizumabe: platina + gemcitabina × 4–6 (' + (el.eligible ? 'cisplatina' : 'carboplatina AUC 4,5–5') + ').', 'fraca', 'EAU 2026', ['gc', 'carbo'], { kind: fgfr ? undefined : 'padrao' }));
        out.push(R('BX-MET-12', 'Taxano em monoterapia (paclitaxel 175 mg/m² a cada 3 semanas, docetaxel 75 mg/m²) ou vinflunina 320 mg/m² a cada 3 semanas.', 'fraca', 'EAU 2026; SBOC', ['taxano']));
      } else if (prev.has('platina')) {
        if (!prev.has('ev')) out.push(R('BX-MET-13', 'Após platina' + (prev.has('io') ? ' e imunoterapia' : '') + ': enfortumabe vedotina 1,25 mg/kg D1, D8 e D15 a cada 28 dias em monoterapia (EV-301: OS 12,9 vs 9,0 meses).', 'forte', 'EAU 2026; NCCN categoria 1; SBOC (NE alto / FR forte)', ['ev_mono'], { kind: 'padrao' }));
        if (!prev.has('io') && !ioContra) out.push(R('BX-MET-14', 'Sem imunoterapia prévia: pembrolizumabe 200 mg a cada 3 semanas (KEYNOTE-045: OS 10,3 vs 7,4), ou atezolizumabe 1.200 mg / durvalumabe (SBOC).', 'forte', 'EAU 2026; SBOC', ['pembro_met', 'atezolizumabe'], { kind: prev.has('ev') ? 'padrao' : undefined }));
        if (fgfr && prev.has('io')) out.push(R('BX-MET-10', 'FGFR2/3 alterado após imunoterapia: erdafitinibe 8 mg VO/dia (escalonar a 9 mg); oftalmologia mensal nos 4 primeiros meses.', 'forte', 'EAU 2026', ['erdafitinibe']));
        else if (fgfr) out.push(R('BX-MET-15', 'FGFR2/3 alterado: erdafitinibe após imunoterapia (THOR coorte 1); antes dela, imunoterapia e EV têm prioridade.', 'fraca', 'EAU 2026', ['erdafitinibe']));
        out.push(R('BX-MET-12', 'Taxano em monoterapia ou vinflunina nas linhas posteriores.', 'fraca', 'EAU 2026; SBOC', ['taxano']));
      } else {
        out.push(R('BX-MET-16', 'Sem platina nem EV prévios: tratar como primeira linha (EV + pembrolizumabe se tolerar combinação).', 'padrao', 'EAU 2026', ['ev_pembro']));
      }
      if (her2 === '3') out.push(R('BX-MET-17', 'HER2 IHQ 3+: trastuzumabe deruxtecana 5,4 mg/kg a cada 3 semanas (DESTINY-PanTumor02); vigiar pneumonite.', 'fraca', 'EAU 2026; SBOC (NE moderado / FR forte)', ['tdxd']));
      if (her2 === '2') out.push(R('BX-MET-18', 'HER2 IHQ 2+: trastuzumabe deruxtecana pode ser considerado.', 'fraca', 'EAU 2026', ['tdxd']));
      out.push(R('BX-MET-19', 'Ensaio clínico (forte) ou melhor suporte quando não há candidatura a mais linhas (forte).', 'forte', 'EAU 2026', []));
    }
    // toxicidade
    if (p.hba1c_alta === 'sim') alerts.push(R('BX-TOX-01', 'HbA1c ≥ 8% ou glicemia > 250: enfortumabe vedotina contraindicado até controle (hiperglicemia grave).', 'alerta', 'Bula EV'));
    if (p.neuropatia === 'sim') alerts.push(R('BX-TOX-02', 'Neuropatia ≥ grau 2: enfortumabe vedotina e taxanos agravam; preferir esquemas sem neurotóxicos ou reduzir dose.', 'alerta', 'Bula EV'));
    if (p.autoimune === 'sim') alerts.push(R('BX-TOX-03', 'Doença autoimune ativa ou transplante: imunoterapia com cautela ou contraindicada; discutir com reumatologia.', 'alerta', 'EAU 2026'));
    if (p.osso === 'sim') out.push(R('BX-SUP-01', 'Metástase óssea: ácido zoledrônico 4 mg a cada 3–4 semanas ou denosumabe 120 mg a cada 4 semanas; cálcio + vitamina D; avaliação odontológica.', 'forte', 'EAU 2026', ['zoledronico']));
    out.push(R('BX-SUP-02', 'Suporte: RT paliativa para hematúria (21 Gy/3 fx) ou dor óssea (8 Gy); metastasectomia ou RT ablativa em oligometástase selecionada (fraca); cuidados paliativos precoces.', 'fraca', 'EAU 2026', ['rt']));
    return { out, alerts, info };
  }

  /* ---------- disponibilidade Brasil (bexiga) ---------- */
  const BR = {
    mitomicina: { sus: 'ok', ans: 'ok', nota: '' },
    bcg: { sus: 'ok*', ans: 'ok', nota: 'Imuno BCG (Ataulpho de Paiva) via APAC; sem PCDT; relatos de falta de estoque' },
    gem_doce: { sus: 'ok*', ans: 'ok*', nota: 'Fármacos disponíveis; uso intravesical fora de bula' },
    pembro_nmibc: { sus: 'nao', ans: 'pleit', nota: 'ANVISA: restrito a inelegíveis a cistectomia; não incorporado' },
    n803: { sus: 'reg', ans: 'reg', nota: 'Sem registro ANVISA' },
    tar200: { sus: 'reg', ans: 'reg', nota: 'Sem registro ANVISA' },
    nadofaragene: { sus: 'reg', ans: 'reg', nota: 'Sem registro ANVISA' },
    sasanlimabe: { sus: 'reg', ans: 'reg', nota: 'Sem registro ANVISA' },
    cistectomia: { sus: 'ok', ans: 'ok', nota: 'Robótica em poucos centros' },
    gc: { sus: 'ok', ans: 'ok', nota: '' },
    ddmvac: { sus: 'ok', ans: 'ok', nota: 'G-CSF necessário' },
    carbo: { sus: 'ok', ans: 'ok', nota: '' },
    cisplatina: { sus: 'ok', ans: 'ok', nota: '' },
    durvalumabe: { sus: 'nao', ans: 'pleit', nota: 'Registro ANVISA para perioperatório a confirmar; não incorporado' },
    ev_pembro_peri: { sus: 'nao', ans: 'conf', nota: 'Sem registro ANVISA para perioperatório (SBOC 2026)' },
    ev_pembro: { sus: 'nao', ans: 'ok', nota: 'Registrado ANVISA (metastático); não incorporado no SUS' },
    ev_mono: { sus: 'nao', ans: 'ok', nota: 'Registrado; não incorporado' },
    nivolumabe: { sus: 'nao', ans: 'ok', nota: 'Registrado; não incorporado' },
    avelumabe: { sus: 'nao', ans: 'ok', nota: 'Registrado; não incorporado' },
    pembro_met: { sus: 'nao', ans: 'ok', nota: 'Registrado; não incorporado' },
    atezolizumabe: { sus: 'nao', ans: 'ok', nota: 'Registrado (metastático); adjuvante sem registro' },
    erdafitinibe: { sus: 'nao', ans: 'conf', nota: 'Registro ANVISA a confirmar; teste FGFR em laboratório privado' },
    tdxd: { sus: 'nao', ans: 'ok*', nota: 'Registrado tumor-agnóstico HER2 3+ após outras opções' },
    taxano: { sus: 'ok', ans: 'ok', nota: 'Vinflunina: registro a confirmar' },
    fgfr_teste: { sus: 'nao', ans: 'ok*', nota: 'Painel molecular em laboratório privado' },
    rt: { sus: 'ok', ans: 'ok', nota: 'IMRT em centros habilitados' },
    zoledronico: { sus: 'ok', ans: 'ok', nota: 'Denosumabe não incorporado' },
  };
  return { nmibcRisk, bcgFailure, nmibc, mibc, metastatic, cisplatinEligible, BR, RULES: '2026.11' };
})();

/* Posologia – câncer de bexiga (EAU 2026, NCCN v1.2026, SBOC 2026 e bulas). Revisão clínica obrigatória antes do uso assistencial. */
const BDOSES = {
  mmc_unica: { cat: 'Intravesicais', nome: 'Mitomicina C – instilação única pós-RTU', esquema: '40 mg em 40 mL de soro fisiológico, retenção de 1–2 h', duracao: 'Dose única nas primeiras 24 h (ideal nas primeiras 6 h) após a RTU', obs: 'Contraindicada em perfuração evidente ou suspeita, ressecção extensa e sangramento com necessidade de irrigação. Alcalinizar a urina e restringir líquidos aumentam a eficácia. Alternativas: epirrubicina 50 mg ou gemcitabina 2 g.' },
  mmc_manut: { cat: 'Intravesicais', nome: 'Mitomicina C – indução e manutenção', esquema: '40 mg em 40 mL, semanal por 6 semanas, depois mensal', duracao: 'Até 12 meses', obs: 'Risco intermediário. Rash de contato (lavar mãos e genitais após urinar), cistite química.' },
  epirrubicina: { cat: 'Intravesicais', nome: 'Epirrubicina', esquema: '50 mg em 50 mL, retenção 1 h', duracao: 'Dose única pós-RTU, ou semanal × 6 e mensal até 12 meses', obs: 'Alternativa à mitomicina; cistite química.' },
  gem_iv: { cat: 'Intravesicais', nome: 'Gemcitabina intravesical', esquema: '2 g em 50–100 mL, retenção 1 h', duracao: 'Dose única pós-RTU; ou semanal × 6 e mensal × 10 (esquema SBOC)', obs: 'Melhor tolerada que mitomicina; usada em desabastecimento de BCG. Uso intravesical fora de bula.' },
  bcg_ind: { cat: 'Intravesicais', nome: 'BCG – indução', esquema: 'Dose plena em 50 mL de soro fisiológico, retenção de 2 h, semanal × 6 (TICE 81 mg / 1–8 × 10⁸ UFC; Imuno BCG 40 mg × 2 frascos = 80 mg)', duracao: '6 semanas, iniciando 2–4 semanas após a RTU (após cicatrização)', obs: 'Não instilar com hematúria macroscópica, infecção urinária sintomática, cateterismo traumático ou nas 2 primeiras semanas pós-RTU. Sem antibiótico profilático. Urinar sentado e desinfetar o vaso com água sanitária por 15 min nas primeiras 6 h.' },
  bcg_manut1: { cat: 'Intravesicais', nome: 'BCG – manutenção 1 ano', esquema: '3 instilações semanais aos 3, 6 e 12 meses após o início da indução (SWOG)', duracao: '1 ano (total 15 doses)', obs: 'Risco intermediário (e alto risco em escassez). Dose reduzida a 1/3 aceitável no intermediário.' },
  bcg_manut3: { cat: 'Intravesicais', nome: 'BCG – manutenção 3 anos', esquema: '3 instilações semanais aos 3, 6, 12, 18, 24, 30 e 36 meses (SWOG 8507)', duracao: '3 anos (total 27 doses)', obs: 'Alto risco: reduz recidiva, não progressão nem sobrevida. Suspender por toxicidade grau 3; adiar 1 semana por cistite intensa.' },
  bcgite: { cat: 'Intravesicais', nome: 'BCG-ite sistêmica (sepse por BCG, febre > 38,5 °C por > 48 h)', esquema: 'Isoniazida 300 mg + rifampicina 600 mg VO/dia (+ etambutol 1.200 mg/dia nas formas graves); corticoide se sepse', duracao: '6 meses', obs: 'Suspender BCG definitivamente. Prostatite/epididimite granulomatosa: isoniazida + rifampicina por 3 meses.' },
  gem_doce: { cat: 'Intravesicais', nome: 'Gemcitabina + docetaxel sequencial', esquema: 'Gemcitabina 1 g em 50 mL por 90 min; esvaziar; docetaxel 37,5 mg em 50 mL por 90 min; semanal × 6', duracao: 'Manutenção mensal por 12–24 meses', obs: 'BCG-não respondedor e alternativa em escassez de BCG. Uso fora de bula; descontinuação por toxicidade ~3%.' },
  nadofaragene: { cat: 'Intravesicais', nome: 'Nadofaragene firadenovec (Adstiladrin)', esquema: '75 mL (3 × 10¹¹ partículas virais/mL) intravesical, retenção 1 h', duracao: 'A cada 3 meses enquanto houver resposta completa', obs: 'Sem registro ANVISA. Reavaliar com cistoscopia e citologia a cada 3 meses; biópsia aos 12 meses.' },
  n803: { cat: 'Intravesicais', nome: 'Nogapendekin alfa inbakicept (Anktiva) + BCG', esquema: '400 mcg intravesical junto com BCG dose plena, semanal × 6; segunda indução se resíduo aos 3 meses; manutenção 3 semanais nos meses 4, 7, 10, 13 e 19; BCG de manutenção nos meses 25, 31 e 37', duracao: 'Até 37 meses', obs: 'Sem registro ANVISA; depende de BCG disponível. RC 62–71% em CIS; indicação ampliada a papilífero (FDA out/2026).' },
  tar200: { cat: 'Intravesicais', nome: 'TAR-200 (Inlexzo) – sistema intravesical de gemcitabina', esquema: 'Dispositivo com 225 mg de gemcitabina, inserido por cateter em consultório e removido por cistoscopia', duracao: 'Troca a cada 3 semanas por 24 semanas, depois a cada 12 semanas até a semana 96', obs: 'Sem registro ANVISA. Polaciúria, disúria, ITU; grau ≥ 3 em 22%.' },
  gc: { cat: 'Quimioterapia sistêmica', nome: 'Gemcitabina + cisplatina (GC)', esquema: 'Gemcitabina 1.000 mg/m² IV D1 e D8; cisplatina 70 mg/m² IV D1 (ou 35 mg/m² D1 e D2 se TFG limítrofe); ciclo de 21 dias', duracao: 'Neoadjuvante 4 ciclos; adjuvante 4; metastático 4–6', obs: 'Hidratação vigorosa; antiemese tripla; TFG ≥ 50–60 (≥ 40 com durvalumabe, cisplatina fracionada). Nefro, oto e neurotoxicidade.' },
  ddmvac: { cat: 'Quimioterapia sistêmica', nome: 'ddMVAC (dose densa)', esquema: 'Metotrexato 30 mg/m² D1; vimblastina 3 mg/m², doxorrubicina 30 mg/m² e cisplatina 70 mg/m² D2; ciclo de 14 dias com G-CSF D3–9', duracao: 'Neoadjuvante 3–6 ciclos (habitual 4); adjuvante 3–4; metastático 6', obs: 'Ecocardiograma basal (doxorrubicina); mais tóxico, resposta mais rápida; preferido pela NCCN no neoadjuvante.' },
  gcarbo: { cat: 'Quimioterapia sistêmica', nome: 'Gemcitabina + carboplatina', esquema: 'Gemcitabina 1.000 mg/m² D1 e D8; carboplatina AUC 4,5–5 D1; ciclo de 21 dias', duracao: '4–6 ciclos', obs: 'Só doença metastática inelegível a cisplatina; nunca como neoadjuvante (sem benefício).' },
  taxano: { cat: 'Quimioterapia sistêmica', nome: 'Taxanos e vinflunina (linhas posteriores)', esquema: 'Paclitaxel 175 mg/m² a cada 3 semanas (ou 80 mg/m² semanal); docetaxel 75 mg/m² a cada 3 semanas; vinflunina 320 mg/m² a cada 3 semanas (280 se PS 1 ou RT pélvica prévia)', duracao: 'Até progressão ou toxicidade', obs: 'Neuropatia (taxanos), constipação e neutropenia (vinflunina).' },
  durva_peri: { cat: 'Imunoterapia', nome: 'Durvalumabe perioperatório (NIAGARA)', esquema: '1.500 mg IV a cada 3 semanas × 4, junto com GC, antes da cistectomia; após, 1.500 mg a cada 4 semanas × 8', duracao: '≈ 10–12 meses no total', obs: 'Eventos imunomediados (tireoide, cólon, fígado, pulmão, hipófise); registro ANVISA para esta indicação a confirmar.' },
  ev_pembro_peri: { cat: 'Conjugados anticorpo-droga e imunoterapia', nome: 'Enfortumabe vedotina + pembrolizumabe perioperatório', esquema: 'EV 1,25 mg/kg (máx 125 mg) IV D1 e D8 + pembrolizumabe 200 mg D1, ciclo de 21 dias × 3 antes da cistectomia; após, EV × 6 ciclos + pembrolizumabe × 14 ciclos', duracao: '≈ 12 meses', obs: 'Sem registro ANVISA para perioperatório (SBOC 2026). Glicemia antes de cada dose; suspender EV por rash grau 3, neuropatia grau 2 ou hiperglicemia.' },
  ev_pembro: { cat: 'Conjugados anticorpo-droga e imunoterapia', nome: 'Enfortumabe vedotina + pembrolizumabe (metastático, 1ª linha)', esquema: 'EV 1,25 mg/kg IV D1 e D8 + pembrolizumabe 200 mg D1, ciclo de 21 dias', duracao: 'Até progressão ou toxicidade; pembrolizumabe até 35 ciclos (2 anos)', obs: 'Contraindicado com HbA1c ≥ 8% ou glicemia > 250. Rash (pode ser grave: SJS/NET raras), neuropatia periférica, hiperglicemia, pneumonite, alterações oculares. Reduzir EV para 1,0 e 0,75 mg/kg.' },
  ev_mono: { cat: 'Conjugados anticorpo-droga e imunoterapia', nome: 'Enfortumabe vedotina monoterapia', esquema: '1,25 mg/kg IV D1, D8 e D15, ciclo de 28 dias', duracao: 'Até progressão ou toxicidade', obs: 'Após platina e imunoterapia (EV-301).' },
  gc_nivo: { cat: 'Imunoterapia', nome: 'GC + nivolumabe (1ª linha, elegível a cisplatina)', esquema: 'GC × 6 ciclos + nivolumabe 360 mg IV a cada 3 semanas; depois nivolumabe 480 mg a cada 4 semanas', duracao: 'Nivolumabe até 2 anos ou progressão', obs: 'CheckMate 901; quando EV está contraindicado.' },
  avelumabe: { cat: 'Imunoterapia', nome: 'Avelumabe – manutenção', esquema: '800 mg IV a cada 2 semanas, iniciando 4–10 semanas após o fim da platina', duracao: 'Até progressão ou toxicidade', obs: 'Só com doença estável ou resposta à platina. Pré-medicar com anti-histamínico e paracetamol nos 4 primeiros ciclos (reações infusionais).' },
  nivo_adj: { cat: 'Imunoterapia', nome: 'Nivolumabe adjuvante', esquema: '240 mg IV a cada 2 semanas ou 480 mg a cada 4 semanas', duracao: '1 ano', obs: '≥ ypT2/ypN+ após neoadjuvante, ou pT3–4/pN+ sem quimioterapia. EMA exige PD-L1 ≥ 1%; FDA e ANVISA não.' },
  pembro: { cat: 'Imunoterapia', nome: 'Pembrolizumabe', esquema: '200 mg IV a cada 3 semanas ou 400 mg a cada 6 semanas', duracao: 'NMIBC BCG-não respondedor: até 24 meses; metastático: até progressão ou 35 ciclos', obs: 'TSH, transaminases, glicemia e creatinina a cada ciclo; corticoide em eventos imunomediados grau ≥ 2.' },
  atezo: { cat: 'Imunoterapia', nome: 'Atezolizumabe', esquema: '1.200 mg IV a cada 3 semanas', duracao: 'Até progressão', obs: '2ª linha após platina ou 1ª linha em PD-L1 alto inelegível a cisplatina; adjuvante sem registro ANVISA.' },
  erdafitinibe: { cat: 'Terapia-alvo', nome: 'Erdafitinibe', esquema: '8 mg VO 1×/dia; aumentar para 9 mg se fosfato sérico < 5,5 mg/dL no dia 14–21 e sem toxicidade', duracao: 'Até progressão ou toxicidade', obs: 'Só com mutação FGFR3 ou fusão FGFR2/3. Exame oftalmológico mensal nos 4 primeiros meses (retinopatia serosa central); fosfato sérico; onicólise, estomatite, boca seca, hiperfosfatemia (quelante se > 7 mg/dL).' },
  tdxd: { cat: 'Terapia-alvo', nome: 'Trastuzumabe deruxtecana', esquema: '5,4 mg/kg IV a cada 3 semanas', duracao: 'Até progressão ou toxicidade', obs: 'HER2 IHQ 3+ (2+ a considerar). Pneumonite intersticial: TC se dispneia ou tosse; suspender definitivamente se grau ≥ 2. Antiemese de alto risco.' },
  zoledronico: { cat: 'Suporte', nome: 'Ácido zoledrônico / denosumabe (metástase óssea)', esquema: 'Zoledrônico 4 mg IV a cada 3–4 semanas (ajuste renal; contraindicado com CrCl < 30) ou denosumabe 120 mg SC a cada 4 semanas', duracao: 'Enquanto houver benefício; reavaliar em 1–2 anos', obs: 'Avaliação odontológica prévia; cálcio 1.000–1.200 mg/dia + vitamina D 800–1.000 UI/dia.' },
  rt_tmt64: { cat: 'Radioterapia', nome: 'Trimodalidade – protocolo britânico', esquema: '64 Gy em 32 frações de 2 Gy à bexiga inteira (± reforço no tumor), IMRT com imagem diária', duracao: '6,5 semanas', obs: 'Com cisplatina 35–40 mg/m² semanal, ou 5-FU 500 mg/m²/dia IV contínuo D1–5 e D16–20 + mitomicina C 12 mg/m² D1 (BC2001), ou gemcitabina 27 mg/m² 2×/semana.' },
  rt_tmt55: { cat: 'Radioterapia', nome: 'Trimodalidade – hipofracionada', esquema: '55 Gy em 20 frações de 2,75 Gy', duracao: '4 semanas', obs: 'Não inferior ao 64 Gy/32 (BC2001 + BCON); preferida em idosos. Mesmos radiossensibilizadores.' },
  rt_split: { cat: 'Radioterapia', nome: 'Trimodalidade – esquema dividido (americano)', esquema: '40–45 Gy em 1,8–2 Gy em bexiga, próstata/uretra proximal e linfonodos pélvicos; reavaliação com cistoscopia e biópsia; reforço até 64–65 Gy se resposta', duracao: '6,5–7 semanas com pausa para reavaliação', obs: 'Permite cistectomia precoce se não houver resposta após a primeira fase.' },
  rt_adj: { cat: 'Radioterapia', nome: 'Radioterapia adjuvante pós-cistectomia', esquema: '50–54 Gy em 25–27 frações ao leito cirúrgico e linfonodos pélvicos', duracao: '5–5,5 semanas', obs: 'pT3b–4, pN+ ou margem positiva; melhora controle local, não sobrevida (fraca).' },
  rt_pal_vesical: { cat: 'Radioterapia', nome: 'Radioterapia paliativa vesical (hematúria, dor, polaciúria)', esquema: '21 Gy em 3 frações em dias alternados, ou 35 Gy em 10 frações (BA09)', duracao: '1–2 semanas', obs: 'Paciente não candidato a tratamento curativo.' },
  rt_pal_osso: { cat: 'Radioterapia', nome: 'Radioterapia paliativa óssea', esquema: '8 Gy em fração única ou 20 Gy em 5 frações', duracao: '1 dia ou 1 semana', obs: 'Metástase dolorosa; reirradiação possível com 8 Gy.' },
};
const BOPT_DOSES = {
  'BX-TX-01': ['mmc_unica'], 'BX-TX-03': ['mmc_unica'], 'BX-TX-04': ['mmc_unica', 'mmc_manut'], 'BX-TX-05': ['mmc_manut', 'gem_iv'], 'BX-TX-06': ['bcg_ind', 'bcg_manut1'], 'BX-TX-07': ['bcg_ind', 'bcg_manut1'],
  'BX-TX-08': ['bcg_ind', 'bcg_manut3', 'bcgite'], 'BX-TX-10': ['bcg_ind', 'bcg_manut3'], 'BX-TX-11': ['gem_doce'], 'BX-TX-13': ['bcg_ind', 'bcg_manut3'], 'BX-TX-14': ['bcg_ind'],
  'BX-BCG-02': ['bcg_ind'], 'BX-BCG-03': ['gem_doce'], 'BX-BCG-04': ['pembro'], 'BX-BCG-05': ['n803'], 'BX-BCG-06': ['tar200'], 'BX-BCG-07': ['nadofaragene'], 'BX-BCG-09': ['bcg_ind', 'bcg_manut3'], 'BX-BCG-10': ['bcg_manut1', 'mmc_manut', 'gem_doce'],
  'BX-MIBC-10': ['gc', 'durva_peri'], 'BX-MIBC-11': ['ddmvac', 'gc'], 'BX-MIBC-12': ['ev_pembro_peri'], 'BX-MIBC-13': ['ev_pembro_peri'], 'BX-MIBC-03': ['rt_tmt55', 'rt_pal_vesical'],
  'BX-TMT-01': ['rt_tmt64', 'rt_tmt55', 'rt_split'], 'BX-TMT-03': ['rt_tmt55'],
  'BX-ADJ-01': ['durva_peri'], 'BX-ADJ-02': ['ev_pembro_peri'], 'BX-ADJ-03': ['nivo_adj'], 'BX-ADJ-04': ['gc', 'ddmvac'], 'BX-ADJ-05': ['nivo_adj'], 'BX-ADJ-07': ['rt_adj'],
  'BX-MET-01': ['ev_pembro'], 'BX-MET-02': ['gc_nivo', 'gc'], 'BX-MET-03': ['gc', 'gcarbo', 'avelumabe'], 'BX-MET-04': ['gc', 'gcarbo'], 'BX-MET-05': ['gc', 'gcarbo', 'ev_mono'], 'BX-MET-06': ['pembro', 'atezo'],
  'BX-MET-10': ['erdafitinibe'], 'BX-MET-11': ['gc', 'gcarbo'], 'BX-MET-12': ['taxano'], 'BX-MET-13': ['ev_mono'], 'BX-MET-14': ['pembro', 'atezo'], 'BX-MET-15': ['erdafitinibe'], 'BX-MET-16': ['ev_pembro'], 'BX-MET-17': ['tdxd'], 'BX-MET-18': ['tdxd'],
  'BX-SUP-01': ['zoledronico'], 'BX-SUP-02': ['rt_pal_vesical', 'rt_pal_osso'],
};
const BDOSE_CATS = ['Intravesicais', 'Quimioterapia sistêmica', 'Imunoterapia', 'Conjugados anticorpo-droga e imunoterapia', 'Terapia-alvo', 'Suporte', 'Radioterapia'];

/* Guia cirúrgico – bexiga. Texto a revisar por cirurgião antes do uso assistencial. */
const BSURG = {
  turbt: {
    nome: 'Ressecção transuretral de tumor vesical (RTU-B)',
    resumo: 'Diagnóstico e tratamento inicial de todo tumor vesical; qualidade da ressecção (músculo no espécime, ressecção completa, re-RTU quando indicada) define o estadiamento. 20–60 min; alta em 24 h; sonda 1–3 dias.',
    indicacoes: ['Todo tumor vesical visível à cistoscopia ou à imagem: ressecção completa para diagnóstico, estadiamento e tratamento do NMIBC.', 'Re-RTU em 2–6 semanas: T1, ausência de músculo no espécime (exceto Ta LG e CIS primário), ressecção incompleta ou duvidosa.', 'RTU máxima antes da trimodalidade no MIBC; RTU paliativa (hematúria) em doença avançada.'],
    contraindicacoes: ['Infecção urinária não tratada; coagulopatia não corrigida; incapacidade de posição de litotomia (relativa).', 'Tumor claramente ≥ T3 com indicação de cistectomia: RTU limitada à biópsia profunda, sem tentar ressecção completa.'],
    preparo: ['Urocultura e tratamento prévio de infecção; suspensão de anticoagulantes conforme risco (AAS pode ser mantido em tumores pequenos).', 'Uro-TC ou RM antes da RTU em suspeita de MIBC ou tumor de trato superior; citologia urinária.', 'Profilaxia antibiótica dose única (cefalosporina de 1ª geração ou conforme antibiograma); não necessária em cistoscopia simples.', 'Preparar a instilação imediata de quimioterápico (mitomicina 40 mg) para o fim do procedimento, quando o tumor parecer NMIBC e não houver perfuração.', 'Consentimento: perfuração (1–5%), sangramento, infecção, reflexo obturador, estenose uretral, necessidade de re-RTU.'],
    anestesia: ['Raquianestesia ou geral; bloqueio do nervo obturador (ou relaxamento neuromuscular sob geral) em tumores da parede lateral, para evitar a contração do adutor e a perfuração.', 'Litotomia com proteção dos membros; mesa com possibilidade de Trendelenburg; campo estéril com acesso ao abdome inferior (perfuração).'],
    instrumental: ['Ressectoscópio 24–26 Fr com alça monopolar ou bipolar (bipolar permite soro fisiológico e menos reflexo obturador); óptica 30° e 70° (cúpula e colo); cistoscópio flexível para inspeção.', 'Luz branca e, quando disponível, PDD (hexaminolevulinato) ou NBI para detectar CIS e tumores planos; pinças de biópsia a frio; evacuador de Ellik.', 'Alça para ressecção em bloco (alça em J, laser de túlio/hólmio) em tumores exofíticos ≤ 3 cm; sonda de 3 vias 20–22 Fr; frascos identificados (tumor, base, biópsias, uretra prostática).'],
    decisoes: ['Técnica em etapas: inspeção sistemática (mapa da bexiga), ressecção da parte exofítica, depois da base com músculo, e envio separado da base em tumores grandes ou multifocais; evitar cauterização excessiva que destrói o espécime.', 'Em bloco (ressecção circunferencial com margem de 5–10 mm e base com músculo) em tumores exofíticos ≤ 3 cm: melhor avaliação histológica; superioridade clínica ainda debatida.', 'Biópsias de mucosa normal só com citologia positiva ou PDD/NBI anormal; biópsia da uretra prostática em tumor do colo, suspeita de CIS, citologia positiva sem tumor vesical ou T1 (fraca).', 'Perfuração: extraperitoneal pequena é tratada com sonda por 5–7 dias; intraperitoneal exige laparotomia ou laparoscopia e sutura; não instilar quimioterápico.', 'Instilação imediata de mitomicina C 40 mg nas primeiras 24 h (ideal 6 h) salvo perfuração, ressecção extensa ou sangramento.'],
    passos: [
      { t: 'Cistoscopia diagnóstica', d: 'Inspecionar uretra e próstata na entrada; encher a bexiga até 150–250 mL; mapear número, tamanho, localização e aspecto (papilífero, séssil, plano) de cada lesão; registrar no diagrama; PDD ou NBI se disponível.', dica: 'Não encher demais: a parede fina aumenta o risco de perfuração e afasta tumores da cúpula.', cuidado: 'Lesões planas avermelhadas podem ser CIS: biopsiar.' },
      { t: 'Ressecção do tumor exofítico', d: 'Ressecar a porção exofítica em fatias até o nível da mucosa, com corrente de corte pura, mantendo o campo limpo com irrigação; evacuar fragmentos com Ellik periodicamente.', dica: 'Comece pelo tumor mais difícil (cúpula, parede anterior) enquanto a visão é melhor.', cuidado: 'Parede lateral: bloqueio obturador ou bipolar; ressecar em cortes curtos.' },
      { t: 'Ressecção da base com músculo', d: 'Ressecar a base e a parede subjacente até ver fibras do detrusor (aspecto fibrilar, mais pálido); enviar separadamente ("base do tumor") em tumores > 1 cm ou multifocais; coagular pontos de sangramento com cautela.', dica: 'Sem músculo no espécime, o patologista não pode excluir T2: a re-RTU será obrigatória.', cuidado: 'Gordura amarelada no fundo da ressecção = perfuração: parar, avaliar, sonda prolongada.' },
      { t: 'Ressecção em bloco (alternativa)', d: 'Marcar a margem a 5–10 mm do tumor com a alça ou laser; incisar circunferencialmente até o detrusor; descolar o tumor da parede em bloco com a base muscular; retirar inteiro pelo ressectoscópio ou com Ellik.', dica: 'Tumores de 1–3 cm em paredes laterais e posterior são os melhores candidatos.', cuidado: 'Tumor > 3 cm ou de cúpula: risco de perfuração maior; preferir fracionada.' },
      { t: 'Biópsias complementares', d: 'Biópsias a frio de áreas suspeitas, mapeamento se citologia positiva com mucosa normal, e biópsia da uretra prostática (às 5 e 7 h, pré-colicular) quando indicada; frascos separados.', dica: 'Biópsia a frio preserva a arquitetura para avaliar CIS.', cuidado: 'Não biopsiar mucosa normal de rotina: aumenta risco de implante e não muda conduta.' },
      { t: 'Hemostasia e revisão', d: 'Reduzir a pressão de irrigação e coagular sangramentos ativos; revisar toda a bexiga e os meatos ureterais (se ressecção periureteral, deixar duplo-J opcional); esvaziar coágulos.', dica: 'Hemostasia com a bexiga semicheia; coagular com a bexiga vazia pode perfurar.', cuidado: 'Meato ureteral ressecado: corte puro sem coagulação para evitar estenose.' },
      { t: 'Sonda e instilação imediata', d: 'Sonda de 3 vias 20–22 Fr; se sem perfuração e tumor presumivelmente NMIBC, instilar mitomicina C 40 mg/40 mL (ou gemcitabina 2 g) na recuperação, pinçar por 1–2 h, depois irrigar; registrar no prontuário.', dica: 'Prepare a instilação antes da cirurgia para não perder a janela das 6 h.', cuidado: 'Instilação com perfuração causa necrose perivesical grave.' },
    ],
    posop: ['Irrigação contínua até urina clara; retirar a sonda em 1–3 dias (5–7 se perfuração pequena); alta em 24 h; analgesia simples e anticolinérgico para espasmos.', 'Laudo: T, grau (OMS 2004/2022 e 1973), CIS, LVI, subtipo, presença de músculo; calcular o grupo de risco e agendar re-RTU (2–6 semanas) se indicada.', 'Iniciar BCG ou quimioterapia de indução 2–4 semanas após a RTU (ou após a re-RTU); primeira cistoscopia de controle aos 3 meses.'],
    complicacoes: ['Sangramento com retenção por coágulos (2–5%): irrigação, evacuação, revisão endoscópica.', 'Perfuração (1–5%; intraperitoneal < 1%): sonda prolongada ou cirurgia.', 'Infecção urinária e sepse (1–3%); estenose uretral (1–2%); lesão de meato ureteral com estenose ou refluxo; síndrome de RTU rara com bipolar.', 'Reflexo obturador com perfuração da parede lateral.'],
    resultados: ['Tumor residual na re-RTU em 30–50% dos T1; subestadiamento para T2 em 5–15%; músculo ausente em 30–50% das RTUs sem técnica sistemática.', 'Recidiva em 1 ano: 15% (baixo) a 60% (alto); a instilação imediata reduz recidiva em ~35%.'],
    esquemas: ['mapa_bexiga'],
    videos: [],
  },
  cistectomia: {
    nome: 'Cistectomia radical com linfadenectomia pélvica e derivação urinária',
    resumo: 'Padrão curativo do MIBC e do NMIBC de muito alto risco ou BCG-não respondedor; cistoprostatectomia no homem, exenteração anterior na mulher; aberta ou robótica; 4–7 h; internação 7–12 dias; mortalidade 1–3% em centros com ≥ 20 casos/ano.',
    indicacoes: ['MIBC cT2–T4a cN0–1 M0, após tratamento perioperatório quando indicado.', 'NMIBC de muito alto risco (T1 HG + CIS com fatores, LVI, subtipo, CIS prostático) e BCG-não respondedor.', 'Recidiva músculo-invasiva após trimodalidade (resgate); cistectomia paliativa em hematúria intratável ou fístula.'],
    contraindicacoes: ['Metástase à distância fora de ensaio; cT4b fixo à parede pélvica (relativa, após quimioterapia).', 'Comorbidade proibitiva (ASA IV, expectativa < 1–2 anos): preferir trimodalidade ou paliação.', 'Neobexiga: contraindicada com margem uretral positiva, CIS da uretra prostática, incontinência prévia, creatinina > 1,5–2 mg/dL, cognição ou destreza insuficientes, doença intestinal inflamatória, RT pélvica prévia extensa (relativa).'],
    preparo: ['Estadiamento com TC de tórax/abdome/pelve e fase urográfica; função renal (TFG), hemograma, coagulação, albumina; avaliação geriátrica (G8) em ≥ 70 anos; cessação de tabagismo.', 'Pré-habilitação: nutrição (imunonutrição 5–7 dias), exercício, correção de anemia; marcação do estoma pelo estomaterapeuta em pé e sentado, bilateral.', 'ERAS: sem preparo intestinal mecânico; carboidrato oral até 2 h antes; profilaxia antibiótica (cefalosporina 2ª geração + metronidazol ou amoxicilina-clavulanato) na indução, repetida a cada 4 h; compressão pneumática; heparina de baixo peso do dia 1 por 4 semanas.', 'Consentimento: mortalidade 1–3%, complicações 50–65% (Clavien ≥ III 15–25%), íleo, infecção, fístula, estenose ureteroentérica, disfunção erétil e vaginal, incontinência (neobexiga), acidose e B12 (intestino).'],
    anestesia: ['Anestesia geral com peridural torácica (analgesia e menor íleo) ou bloqueio TAP; monitorização invasiva conforme comorbidade; restrição de volume guiada por metas; manter normotermia.', 'Decúbito dorsal com Trendelenburg leve (aberta) ou 25–30° (robótica), pernas em perneiras baixas; sonda vesical 20 Fr e sonda nasogástrica retirada ao fim.'],
    instrumental: ['Aberta: afastador autostático (Bookwalter/Omni), pinças vasculares longas, grampeadores lineares (GIA 60–75 mm) para intestino, clipes, suturas absorvíveis 3-0 e 4-0 (anastomoses), cateteres ureterais 7–8 Fr (simples J ou duplo-J), sonda 20–22 Fr.', 'Robótica: Xi com 4 braços, portais em arco alto (câmera 3–5 cm acima do umbigo), grampeador robótico ou do assistente, suturas farpadas 3-0 para neobexiga intracorpórea, indocianina para perfusão ureteral e intestinal.', 'Linfadenectomia: clipes Hem-o-lok e bipolar; saco de extração; frascos por região.'],
    decisoes: ['Linfadenectomia padrão (obturatória, ilíaca externa e interna até o cruzamento do ureter com a ilíaca comum) é o padrão (EAU forte); a estendida até a bifurcação aórtica não melhora sobrevida e aumenta morbidade (LEA, SWOG S1011); ≥ 10–15 linfonodos indicam qualidade.', 'Derivação: conduto ileal (mais simples, menor complicação tardia) vs neobexiga ortotópica ileal (Studer, Hautmann; continência diurna 85–90%, noturna 60–70%, cateterismo em 10–30%) vs reservatório continente cutâneo (Indiana); decidir com o paciente e pela margem uretral de congelação.', 'Preservação de nervos, próstata ou vesículas (homem) e de útero, vagina anterior e feixes (mulher) só em paciente motivado, sem tumor na área preservada e com baixa carga tumoral; melhora continência e função sexual.', 'Uretrectomia concomitante quando margem uretral positiva ou CIS difuso da uretra prostática; na mulher, preservar uretra para neobexiga apenas com colo vesical livre.', 'Ureteres: margem de congelação opcional; anastomose antirrefluxo não é necessária (mais estenose); stents por 7–14 dias.', 'Aberta vs robótica: resultados oncológicos equivalentes (RAZOR, iROC); robótica com menos sangramento e transfusão, tempo maior; escolher pela experiência do centro.'],
    passos: [
      { t: 'Acesso e exploração', d: 'Aberta: incisão mediana infraumbilical estendida 3–5 cm acima do umbigo; robótica: 6 portais em arco. Inspeção da cavidade, fígado e peritônio; liberar aderências; identificar os ureteres no cruzamento dos vasos ilíacos.', dica: 'Comece pela linfadenectomia: expõe os ureteres e os vasos e orienta toda a dissecção.', cuidado: 'Carcinomatose ou linfonodo fixo na aorta: considerar abortar e tratar sistemicamente.' },
      { t: 'Linfadenectomia pélvica padrão bilateral', d: 'Abrir o peritônio lateral ao ligamento umbilical até a bifurcação; dissecar ilíaca externa (split and roll), fossa obturatória preservando o nervo, ilíaca interna até o cruzamento do ureter com a ilíaca comum; clipes nos linfáticos; frascos por região.', dica: 'Nervo obturatório identificado antes de remover o pacote; veia obturatória acessória clipada.', cuidado: 'Lesão da veia ilíaca externa: compressão, aumento de pressão (robótica) e sutura com prolene 5-0.' },
      { t: 'Ureteres', d: 'Dissecar os ureteres com o tecido periureteral (preservar vascularização), do cruzamento ilíaco até a bexiga; clipar e seccionar junto à bexiga; enviar margem distal para congelação se CIS ou suspeita; manter os cotos reparados.', dica: 'Não esqueletizar: a estenose ureteroentérica (5–15%) vem da isquemia.', cuidado: 'Ureter esquerdo passa sob o mesossigmoide para o conduto: criar o túnel amplo, acima da artéria mesentérica inferior.' },
      { t: 'Dissecção posterior', d: 'Incisar o peritônio do fundo de saco; no homem, seccionar os deferentes, dissecar as vesículas seminais e abrir a fáscia de Denonvilliers desenvolvendo o plano pré-retal até o ápice prostático; na mulher, dissecar o septo retovaginal (ou incluir a parede vaginal anterior se tumor posterior).', dica: 'Plano entre a fáscia de Denonvilliers e a gordura perirretal; tração anterior da bexiga pelo quarto braço.', cuidado: 'Lesão retal (1–2%): reparo em dois planos, interposição de epíploo, considerar colostomia se irradiado.' },
      { t: 'Pedículos vesicais e prostáticos', d: 'Identificar as artérias vesicais superiores na origem (ligamento umbilical) e controlar os pedículos laterais com clipes, grampeador vascular ou selador bipolar, da base da bexiga até a próstata (ou útero/vagina), lateral ao reto; preservação neurovascular quando indicada, com clipes e sem energia junto aos feixes.', dica: 'Pedículo posterior é onde mais sangra: controle passo a passo com visão do reto.', cuidado: 'Energia térmica junto ao reto e aos feixes: lesão tardia e disfunção erétil.' },
      { t: 'Dissecção anterior, complexo venoso dorsal e uretra', d: 'Descolar a bexiga do espaço de Retzius, seccionar os ligamentos puboprostáticos (ou preservá-los), ligar e seccionar o complexo venoso dorsal; dissecar o ápice e seccionar a uretra; retirar a sonda; enviar margem uretral para congelação quando há plano de neobexiga; na mulher, seccionar a uretra distal ao colo (neobexiga) ou em bloco com uretrectomia.', dica: 'Secção da uretra com a sonda tracionada; preservar o máximo de comprimento se neobexiga.', cuidado: 'Margem uretral positiva na congelação: converter a derivação para conduto e fazer uretrectomia.' },
      { t: 'Retirada da peça e hemostasia', d: 'Peça em saco; extração pela incisão mediana (aberta), por minilaparotomia infraumbilical ou pela vagina (mulher, robótica); hemostasia do leito à pressão baixa; revisão do reto (teste com ar se dúvida).', dica: 'Checar a peça: ureteres, uretra e linfonodos devem estar identificados para o patologista.', cuidado: '' },
      { t: 'Derivação: conduto ileal (Bricker)', d: 'Isolar 15–20 cm de íleo a 15–20 cm da válvula ileocecal, preservando a arcada vascular; restabelecer o trânsito com grampeador látero-lateral; fechar a extremidade proximal do conduto; anastomoses ureteroileais separadas (Bricker) ou em placa (Wallace) com sutura absorvível 4-0 sobre stents 7–8 Fr exteriorizados pelo estoma; estoma na marca pré-operatória, evertido (rosebud), 2–3 cm de altura.', dica: 'Conduto curto e reto evita estase; indocianina confirma perfusão das extremidades.', cuidado: 'Estenose ureteroentérica (5–15%) e hérnia paraestomal (10–30%) são as complicações tardias mais comuns; fixar o mesentério e evitar estoma na cicatriz.' },
      { t: 'Derivação: neobexiga ortotópica ileal (Studer / Hautmann)', d: 'Isolar 50–60 cm de íleo (Studer: 40 cm destubulizados em U/W + 10–15 cm de segmento aferente tubular); destubulizar na borda antimesentérica, dobrar e suturar em reservatório esférico (sutura contínua absorvível 3-0 ou farpada); anastomose uretral de 6 pontos sobre sonda 20–22 Fr no ponto mais declive; ureteres no segmento aferente (Studer) ou direto no reservatório (Hautmann) sobre stents; cistostomia suprapúbica opcional; teste de estanqueidade.', dica: 'Reservatório esférico de capacidade inicial 150 mL cresce para 400–500 mL em 6–12 meses; orientar micção por relaxamento pélvico e prensa.', cuidado: 'Candidatos com cognição ou destreza limitadas não conseguem o autocateterismo que 10–30% precisarão; acidose hiperclorêmica e hipercontinência noturna.' },
      { t: 'Derivação: reservatório continente cutâneo (Indiana)', d: 'Ceco e cólon ascendente destubulizados como reservatório, íleo terminal afilado (tapering) com a válvula ileocecal como mecanismo de continência, estoma umbilical ou no quadrante inferior direito para cateterismo a cada 4–6 h.', dica: 'Alternativa para quem quer continência sem uretra utilizável (uretrectomia, mulher com tumor no colo).', cuidado: 'Cálculos no reservatório, estenose do estoma, necessidade de cateterismo vitalício.' },
      { t: 'Fechamento e drenagem', d: 'Dreno pélvico de sucção; fechamento da aponeurose com sutura contínua de absorção lenta; sonda uretral (neobexiga) e stents fixados; curativo do estoma com bolsa transparente.', dica: '', cuidado: 'Evisceração em obesos e desnutridos: considerar sutura de reforço.' },
    ],
    posop: ['ERAS: sem sonda nasogástrica, goma de mascar, alopurinol/alvimopan onde disponível, dieta líquida D1 e progressiva; deambulação D1; analgesia multimodal com peridural ou TAP e mínimo de opioide; heparina de baixo peso por 4 semanas.', 'Dreno retirado com débito baixo e creatinina do líquido igual à sérica; stents retirados em 7–14 dias (ou na alta com cistografia nas neobexigas); sonda da neobexiga por 14–21 dias com irrigação de muco 2–3×/dia e cistografia antes da retirada.', 'Neobexiga: treinamento miccional (horário, a cada 2–3 h de dia e despertar noturno), fisioterapia, autocateterismo se resíduo > 100–150 mL; bicarbonato se acidose; B12 anual após 3–5 anos.', 'Patologia (pT, pN, margens, LVI) define adjuvância (ver resultado); TC de tórax/abdome/pelve a cada 6 meses por 2 anos, depois anual; função renal e eletrólitos a cada 3–6 meses no 1º ano; imagem do trato superior anual; lavado uretral se uretra retida com fatores de risco.'],
    complicacoes: ['Precoces (50–65%; Clavien ≥ III 15–25%): íleo prolongado (20–30%), infecção urinária/pielonefrite (10–20%), infecção de ferida, deiscência, fístula urinária (3–5%), fístula intestinal (1–2%), sangramento e transfusão (15–30% na aberta), tromboembolismo (3–5%), linfocele, lesão retal (1–2%).', 'Mortalidade em 90 dias: 1–3% em centros de alto volume; até 5–8% em idosos e centros de baixo volume.', 'Tardias: estenose ureteroentérica (5–15%), hérnia paraestomal (10–30%), estenose do estoma, cálculos, acidose metabólica hiperclorêmica, deficiência de B12, deterioração da função renal (15–25% em 10 anos), incontinência noturna e hipercontinência (neobexiga), disfunção erétil (70–90% sem preservação), encurtamento vaginal e dispareunia.'],
    resultados: ['Sobrevida câncer-específica em 5 anos: pT2 N0 65–80%; pT3 N0 45–60%; pN+ 25–35%; melhorada em 5–8% absolutos pelo neoadjuvante com cisplatina e mais pelos esquemas com imunoterapia (NIAGARA, KEYNOTE-905).', 'Recidiva local 5–15%; recidiva uretral 4–8% (menor com neobexiga); recidiva de trato superior 2–6%.', 'Qualidade de vida semelhante entre conduto e neobexiga aos 12 meses; neobexiga com melhor imagem corporal, pior continência noturna.'],
    esquemas: ['derivacoes'],
    videos: [],
  },
  resgate_bexiga: {
    nome: 'Cistectomia de resgate após trimodalidade ou radioterapia',
    resumo: 'Indicada em 10–30% dos pacientes tratados com preservação vesical, por recidiva músculo-invasiva ou bexiga não funcional; morbidade maior que a primária (complicações 60–70%; fístula e lesão retal mais frequentes); sobrevida câncer-específica 40–60% em 5 anos.',
    indicacoes: ['Doença músculo-invasiva persistente após 40–45 Gy (esquema dividido) ou recidiva músculo-invasiva após resposta completa à trimodalidade (forte, EAU).', 'Recidiva NMIBC de alto risco refratária a intravesical após trimodalidade; bexiga contraída, dolorosa ou com hematúria intratável pós-RT.', 'Resgate após radioterapia isolada ou quimiorradioterapia paliativa, em paciente que se tornou candidato à cirurgia.'],
    contraindicacoes: ['Metástase à distância; expectativa < 1–2 anos; comorbidade proibitiva.', 'Neobexiga: desaconselhada após RT pélvica (uretra e intestino irradiados: fístula e incontinência); preferir conduto ileal com segmento não irradiado (íleo proximal ou cólon transverso).'],
    preparo: ['Reestadiamento com TC de tórax/abdome/pelve (e PET-FDG se dúvida); cistoscopia com biópsia confirmando invasão; avaliar reto (retossigmoidoscopia se sintomas) e função renal.', 'Preparo intestinal mecânico e antibiótico oral (risco de lesão retal e de uso de cólon); imunonutrição; marcação do estoma; consentimento sobre colostomia temporária, fístula e mortalidade (3–5%).'],
    anestesia: ['Iguais à cistectomia primária, com reserva de sangue (sangramento maior em tecido irradiado) e previsão de tempo maior (5–8 h).'],
    instrumental: ['Igual à cistectomia primária; sonda retal para teste de ar; material para colostomia; segmento intestinal não irradiado (íleo proximal, cólon transverso) para o conduto.'],
    decisoes: ['Via aberta ou robótica conforme experiência; a fibrose pélvica torna a robótica mais difícil, mas é factível em centros experientes.', 'Linfadenectomia padrão quando factível; em fibrose intensa, limitar à remoção de linfonodos palpáveis.', 'Derivação com intestino fora do campo irradiado: conduto de íleo proximal ou cólon transverso; evitar neobexiga.', 'Plano retal: dissecção cortante, identificação precoce, teste de ar; interposição de epíploo entre reto e leito; colostomia protetora se lesão retal em campo irradiado.', 'Ureteres irradiados: anastomose em segmento não irradiado, stents prolongados (3–4 semanas).'],
    passos: [
      { t: 'Acesso e avaliação da pelve', d: 'Incisão mediana ampla; liberar aderências de alças à pelve com cuidado (alças irradiadas são friáveis); avaliar mobilidade da bexiga e do reto; decidir pela ressecção.', dica: 'Mobilizar o epíploo no início para a interposição final.', cuidado: 'Enterotomia em alça irradiada: reparar e considerar ressecção do segmento.' },
      { t: 'Linfadenectomia e ureteres', d: 'Linfadenectomia padrão quando os planos permitem; ureteres dissecados proximalmente, fora da fibrose, com margem de congelação; mantê-los longos para anastomose em segmento não irradiado.', dica: 'Comece pelos ureteres acima da bifurcação, onde a fibrose é menor.', cuidado: 'Ureteres irradiados estenosam mais: anastomose ampla e stents por 3–4 semanas.' },
      { t: 'Dissecção posterior', d: 'Plano reto-vesical fibrosado: dissecção cortante com tesoura, em pequenos passos, com sonda retal e dedo do assistente como guia; em dúvida, deixar parte da parede vesical posterior aderida ao reto não é aceitável oncologicamente, mas aceitar o plano mais próximo da bexiga.', dica: 'Abrir a bexiga anteriormente e trabalhar de dentro para fora ajuda a localizar o plano posterior em fibrose extrema.', cuidado: 'Lesão retal (5–10%): reparo em dois planos, epíploo interposto, colostomia protetora.' },
      { t: 'Pedículos, uretra e retirada', d: 'Pedículos controlados com clipes ou selador, passo a passo; uretra seccionada com margem (uretrectomia frequentemente indicada no homem irradiado com tumor prostático); peça retirada; hemostasia à pressão baixa com hemostáticos tópicos.', dica: 'Sangramento venoso difuso é comum: compressão e paciência antes de suturas às cegas.', cuidado: '' },
      { t: 'Derivação com segmento não irradiado', d: 'Conduto de íleo proximal (a 40–60 cm da válvula) ou de cólon transverso; anastomoses ureterointestinais sobre stents; estoma na marcação; interposição de epíploo na pelve; dreno.', dica: 'Cólon transverso é a escolha quando todo o íleo distal foi irradiado.', cuidado: 'Fístula urinária e deiscência de anastomose são mais frequentes: stents e dreno prolongados.' },
    ],
    posop: ['Como na primária, com dreno e stents por mais tempo (3–4 semanas), nutrição parenteral se íleo prolongado, vigilância de fístula (creatinina do dreno) e de infecção.', 'Colostomia protetora, se feita, revertida em 3–6 meses após enema opaco normal.', 'Seguimento oncológico igual ao da cistectomia primária.'],
    complicacoes: ['Complicações em 60–70%; Clavien ≥ III 25–35%; mortalidade 3–5%.', 'Lesão retal 5–10%; fístula urinária 10–15%; estenose ureteroentérica 15–25%; deiscência e evisceração; íleo prolongado; infecção.'],
    resultados: ['Sobrevida câncer-específica em 5 anos 40–60% (melhor quando o resgate é feito por recidiva NMIBC ou por persistência precoce, pior em recidiva invasiva tardia com pT3–4).'],
    esquemas: [],
    videos: [],
  },
};
const BSURG_LINK = { 'BX-TX-09': ['cistectomia'], 'BX-TX-12': ['cistectomia'], 'BX-TX-14': ['cistectomia'], 'BX-BCG-01': ['cistectomia'], 'BX-MIBC-15': ['cistectomia', 'turbt'], 'BX-TMT-01': ['turbt', 'resgate_bexiga'], 'BX-TMT-02': ['resgate_bexiga'], 'BX-DX-01': ['turbt'], 'BX-DX-02': ['turbt'], 'BX-TX-01': ['turbt'], 'BX-TX-03': ['turbt'] };
const BSURG_SVG = {
  mapa_bexiga: `<svg viewBox="0 0 320 260" role="img" aria-label="Mapa da bexiga para registro de tumores na RTU" class="schema"><title>Mapa da bexiga</title><ellipse cx="160" cy="118" rx="118" ry="92" fill="var(--surface)" stroke="var(--border)" stroke-width="2"/><path d="M160 26 V210" stroke="var(--chart-grid, var(--border))" stroke-dasharray="3 3"/><path d="M42 118 H278" stroke="var(--chart-grid, var(--border))" stroke-dasharray="3 3"/><ellipse cx="160" cy="118" rx="60" ry="46" fill="none" stroke="var(--border)" stroke-dasharray="3 3"/><circle cx="128" cy="166" r="5" fill="var(--accent)"/><circle cx="192" cy="166" r="5" fill="var(--accent)"/><path d="M128 166 L160 206 L192 166" fill="none" stroke="var(--accent)" stroke-width="1.5"/><rect x="146" y="206" width="28" height="28" rx="6" fill="none" stroke="var(--fg)" stroke-width="1.5"/><g font-size="10" fill="var(--fg)" text-anchor="middle"><text x="160" y="42">cúpula</text><text x="72" y="100">parede lateral D</text><text x="248" y="100">parede lateral E</text><text x="160" y="92">anterior</text><text x="160" y="150">posterior</text><text x="160" y="178">trígono</text><text x="160" y="248">colo / uretra prostática</text><text x="118" y="160" text-anchor="end" font-size="9" fill="var(--muted)">meato D</text><text x="202" y="160" text-anchor="start" font-size="9" fill="var(--muted)">meato E</text></g><g font-size="9.5" fill="var(--muted)"><text x="18" y="20">Registrar cada tumor: localização, nº, tamanho, aspecto</text></g></svg>`,
  derivacoes: `<svg viewBox="0 0 360 240" role="img" aria-label="Três derivações urinárias após cistectomia" class="schema"><title>Derivações urinárias</title><g font-size="10.5" fill="var(--fg)" text-anchor="middle" font-weight="600"><text x="60" y="22">Conduto ileal</text><text x="180" y="22">Neobexiga ortotópica</text><text x="300" y="22">Reservatório continente</text></g><g stroke="var(--accent)" stroke-width="3" fill="none" stroke-linecap="round"><path d="M40 60 V120 Q40 150 60 150 L90 150"/><path d="M80 60 V110 Q80 140 70 150"/><path d="M160 60 V120 M200 60 V120"/><path d="M280 60 V120 M320 60 V120"/></g><rect x="56" y="128" width="40" height="44" rx="10" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2"/><circle cx="104" cy="150" r="7" fill="var(--warn)"/><ellipse cx="180" cy="150" rx="34" ry="30" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2"/><path d="M180 180 V214" stroke="var(--fg)" stroke-width="3" stroke-linecap="round"/><ellipse cx="300" cy="150" rx="34" ry="30" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2"/><path d="M334 150 L350 150" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/><circle cx="352" cy="150" r="6" fill="var(--warn)"/><g font-size="9.5" fill="var(--muted)" text-anchor="middle"><text x="60" y="198">15–20 cm de íleo</text><text x="60" y="211">estoma com bolsa</text><text x="180" y="226">reservatório ileal 50–60 cm</text><text x="180" y="238">anastomose à uretra</text><text x="300" y="198">ceco/cólon + íleo afilado</text><text x="300" y="211">estoma cateterizável</text></g><g font-size="9" fill="var(--muted)"><text x="22" y="52">ureteres</text><text x="142" y="52">ureteres</text><text x="262" y="52">ureteres</text></g></svg>`,
};
const BSURG_CAP = { mapa_bexiga: 'Mapa da bexiga usado na RTU: cada tumor é registrado por localização, número, tamanho e aspecto; a biópsia da uretra prostática é feita às 5 e 7 h, pré-colicular.', derivacoes: 'As três derivações: conduto ileal (estoma incontinente com bolsa), neobexiga ortotópica ileal (micção pela uretra) e reservatório continente cutâneo (estoma cateterizável). A escolha depende da margem uretral, função renal, cognição, destreza e preferência.' };

/* Motor de regras – Câncer de rim (carcinoma de células renais)
   Regras 2026.11 · EAU RCC 2026 (atualização limitada mar/2026) · NCCN Kidney v1.2026 + atualizações 2026 · AUA Renal Mass 2021 · DDT MS 2022 · ANS RN 550/2022
   Mesma convenção da próstata e da bexiga: id, text, strength (forte/moderada/fraca/nao/ensaio/alerta/padrao), src, br (chaves de disponibilidade). */
const Kidney = (() => {
  const num = (v) => (v === '' || v === null || v === undefined || isNaN(+v)) ? null : +v;
  const R = (id, text, strength, src, br, extra) => Object.assign({ id, text, strength, src, br: br || [] }, extra || {});
  const RULES = '2026.11';

  /* ---------- expectativa de vida (tábua IBGE masculina do motor de próstata, ajustada) ---------- */
  function expectancy(p) {
    const age = num(p.idade); if (age === null || typeof Engine === 'undefined') return null;
    let base = Engine.baseLifeExp(age);
    if (p.sexo === 'f') base += age < 70 ? 3 : 2;            // IBGE 2023: mulheres vivem ~3 anos a mais aos 65, ~2 aos 75
    const f = p.saude === 'bom' ? 1.5 : p.saude === 'fragil' ? 0.5 : 1.0;
    const cap = (v) => Math.min(v, 100 - age);
    return { base: +base.toFixed(1), fator: f, anos: +cap(base * f).toFixed(1), faixa: [+(base * 0.5).toFixed(1), +cap(base * 1.5).toFixed(1)] };
  }

  /* ---------- estádio clínico a partir de tamanho, trombo e extensão ---------- */
  function cStage(p) {
    const size = num(p.tamanho);
    const trombo = p.trombo || 'nao';
    const ext = p.extensao || 'confinado';   // confinado | gordura | gerota | adrenal_contigua
    let cT;
    if (ext === 'gerota' || ext === 'adrenal_contigua') cT = 'T4';
    else if (trombo === 'mayo4' || trombo === 'parede') cT = 'T3c';
    else if (trombo === 'mayo1' || trombo === 'mayo2' || trombo === 'mayo3') cT = 'T3b';
    else if (trombo === 'renal' || ext === 'gordura') cT = 'T3a';
    else if (size === null) cT = p.cT || 'T1a';
    else if (size <= 4) cT = 'T1a'; else if (size <= 7) cT = 'T1b'; else if (size <= 10) cT = 'T2a'; else cT = 'T2b';
    const cN = p.cN || 'N0', cM = p.cM || 'M0';
    const stage = cM !== 'M0' ? 'IV' : cT === 'T4' ? 'IV' : (cN === 'N1' || cT.startsWith('T3')) ? 'III' : cT.startsWith('T2') ? 'II' : 'I';
    return { cT, cN, cM, stage, size, trombo };
  }

  /* ---------- Módulo 1 – massa renal localizada ---------- */
  function localized(p) {
    const out = [], alerts = [], pend = [], info = {};
    const s = cStage(p);
    const size = s.size;
    const saude = p.saude || 'medio';
    const fragil = saude === 'fragil';
    const le = expectancy(p);
    const curta = fragil || (le && le.anos < 5);
    const rimUnico = p.contralateral === 'unico' || p.contralateral === 'anormal';
    const tfg = num(p.tfg);
    const drc = (tfg !== null && tfg < 45) || rimUnico;
    const cistico = (p.aspecto || 'solido') !== 'solido';
    const bx = p.biopsia || 'nao';          // nao | ccrcc | papilar | cromofobo | oncocitoma | indeterminada | outro
    const complex = p.complexidade || 'ni';  // baixa | media | alta | ni
    const pref = p.preferencia || 'ni';      // cirurgia | preservar | observar | ni
    info.status = `c${s.cT} c${s.cN} c${s.cM}` + (size !== null ? ` · ${size} cm` : '') + ` · estádio ${s.stage}`;
    if (le) info.le = `Expectativa de vida ≈ ${le.anos} anos (faixa ${le.faixa[0]}–${le.faixa[1]}; tábua IBGE ajustada pela saúde${p.sexo === 'f' ? ', corrigida para sexo feminino' : ''})`;

    if (s.cM !== 'M0') { out.push(R('RN-LOC-00', 'Doença metastática: seguir pelo fluxo "Metastático – primeira linha".', 'padrao', 'Fluxo')); return { out, alerts, pend, info, le }; }

    // lesão cística
    if (p.aspecto === 'bosniak2f') {
      out.push(R('RN-CYS-01', 'Bosniak IIF: seguimento por imagem (TC ou RM com contraste) aos 6 e 12 meses e depois anual por 5 anos; tratar só se progredir para III/IV. Malignidade ~5–10%.', 'forte', 'Bosniak 2019; EAU 2026'));
      return { out, alerts, pend, info, le };
    }
    if (p.aspecto === 'bosniak3') {
      out.push(R('RN-CYS-02', 'Bosniak III (~50% malignos): nefrectomia parcial é a conduta padrão no paciente apto; vigilância ativa é aceitável no idoso ou comórbido, pois a maioria dos malignos é de baixo grau e crescimento lento.', 'moderada', 'Bosniak 2019; EAU 2026 (fraca)', ['parcial']));
      out.push(R('RN-CYS-03', 'Não biopsiar lesão cística sem componente sólido visível; a biópsia tem baixa acurácia e risco de disseminação é mínimo mas o rendimento é pobre.', 'forte', 'EAU 2026'));
    }
    if (p.aspecto === 'bosniak4') out.push(R('RN-CYS-04', 'Bosniak IV (~90% malignos): tratar como tumor sólido do mesmo tamanho; parcial preferida; evitar ablação por risco de ruptura cística.', 'forte', 'Bosniak 2019; EAU 2026', ['parcial']));

    // estadiamento pendente
    if (p.imagem !== 'tc_completa') {
      if (s.cT === 'T1a' && !cistico && p.incidental === 'sim') pend.push(R('RN-DX-01', 'cT1a incidental: TC de tórax pode ser omitida (risco de metástase pulmonar < 1%); abdome com fase arterial e nefrográfica é suficiente.', 'padrao', 'EAU 2026 (fraca)'));
      else pend.push(R('RN-DX-02', 'Completar estadiamento com TC multifásica de abdome e TC de tórax antes de decidir.', 'padrao', 'EAU 2026 (forte)'));
    }
    if (s.trombo !== 'nao') pend.push(R('RN-DX-03', 'Trombo venoso: RM (ou TC multifásica com reconstrução) para definir o nível (Mayo) e a invasão de parede; repetir a imagem em até 2 semanas da cirurgia, pois o trombo cresce.', 'padrao', 'EAU 2026 (fraca)'));
    pend.push(R('RN-DX-04', 'Não pedir cintilografia óssea nem PET-FDG de rotina; TC/RM de crânio só se sintomas ou doença metastática.', 'padrao', 'EAU 2026 (fraca)'));
    if (tfg !== null && tfg < 45) alerts.push(R('RN-DX-05', `TFG ${tfg} mL/min: consulta nefrológica antes do tratamento; priorizar preservação de néfrons; risco de diálise após nefrectomia radical.`, 'alerta', 'EAU 2026 (fraca)'));
    if (rimUnico) alerts.push(R('RN-DX-06', 'Rim único ou contralateral doente: toda decisão deve preservar parênquima (parcial, ablação ou vigilância); radical só sem alternativa e com plano para diálise.', 'alerta', 'EAU 2026'));
    if (num(p.idade) !== null && num(p.idade) <= 46 || p.multifocal === 'sim') alerts.push(R('RN-GEN-01', 'Idade ≤ 46 anos, tumores bilaterais ou multifocais: encaminhar aconselhamento e teste genético germinativo (VHL, FH, SDH, BHD, MET).', 'alerta', 'AUA 2021; NCCN v1.2026', ['teste_germinativo']));
    if (p.tabagismo === 'sim') alerts.push(R('RN-DX-07', 'Cessar tabagismo: reduz recidiva e mortalidade por outras causas.', 'alerta', 'EAU 2026 (forte)'));
    if (saude !== 'bom' && num(p.idade) !== null && num(p.idade) >= 70) alerts.push(R('RN-DX-08', 'Idoso com comorbidade: triagem de fragilidade (G8, CFS) e avaliação geriátrica ampla nos de risco antes de indicar cirurgia.', 'alerta', 'EAU 2026 (novo subcapítulo, fraca)'));

    // biópsia
    if (bx === 'oncocitoma') { out.push(R('RN-LOC-01', 'Biópsia com oncocitoma: vigilância ativa com imagem anual; cirurgia só se crescimento rápido ou sintomas (até 10–20% dos "oncocitomas" na biópsia são cromófobos híbridos, mas indolentes).', 'moderada', 'EAU 2026; AUA 2021')); }
    if (bx === 'indeterminada') pend.push(R('RN-DX-09', 'Biópsia não diagnóstica: repetir biópsia (core coaxial, 2–3 fragmentos) antes de ablação ou vigilância baseada em histologia.', 'padrao', 'EAU 2026'));

    // trombo venoso
    if (s.trombo !== 'nao') {
      out.push(R('RN-LOC-02', `Nefrectomia radical com trombectomia (${s.trombo === 'renal' ? 'veia renal' : s.trombo === 'mayo1' ? 'Mayo I, cava infra-hepática < 2 cm' : s.trombo === 'mayo2' ? 'Mayo II, cava abaixo das veias hepáticas' : s.trombo === 'mayo3' ? 'Mayo III, retro-hepático: equipe hepatobiliar, manobra de Pringle, possível bypass venovenoso' : 'Mayo IV, supradiafragmático/atrial: equipe cardiovascular, circulação extracorpórea'}): sobrevida câncer-específica 5 anos 40–65% sem metástase.`, 'forte', 'EAU 2026 (forte)', ['nefrectomia_aberta'], { kind: 'padrao' }));
      if (s.trombo === 'mayo3' || s.trombo === 'mayo4') alerts.push(R('RN-LOC-03', 'Trombo Mayo III–IV: encaminhar a centro de referência; embolização pré-operatória não reduz complicações e pode piorar (fraca contra).', 'alerta', 'EAU 2026'));
      if (s.cN === 'N1') out.push(R('RN-LOC-04', 'Linfonodos aumentados na imagem: ressecar durante a nefrectomia (estadiamento e controle local); linfadenectomia estendida não melhora sobrevida.', 'fraca', 'EAU 2026 (fraca)'));
      out.push(R('RN-LOC-05', 'Adjuvância após a cirurgia: reavaliar pelo fluxo "Pós-nefrectomia" com a patologia (pT3b–c é critério KEYNOTE-564).', 'padrao', 'EAU 2026'));
      return { out, alerts, pend, info, le, stage: s };
    }

    // frágil / expectativa curta
    if (curta && (size === null || size <= 7)) {
      out.push(R('RN-LOC-06', `Observação (watchful waiting) sem imagem seriada rigorosa: ${fragil ? 'paciente frágil' : 'expectativa de vida < 5 anos'}; tratar só se sintomas (hematúria, dor) ou crescimento sintomático. Massas ≤ 4 cm metastatizam em < 2% e raramente mudam o desfecho nesse grupo.`, 'forte', 'EAU 2026 (fraca); AUA 2021', [], { kind: 'padrao' }));
      if (size !== null && size > 4) out.push(R('RN-LOC-07', 'Se precisar tratar: ablação percutânea ou SABR (sem anestesia geral prolongada), em vez de cirurgia.', 'fraca', 'EAU 2026 (fraca)', ['ablacao', 'sabr']));
      if (p.sintomas === 'sim') out.push(R('RN-LOC-08', 'Hematúria ou dor em paciente inapto à cirurgia: embolização seletiva da artéria renal.', 'fraca', 'EAU 2026 (fraca)'));
      return { out, alerts, pend, info, le, stage: s };
    }

    // cT1a
    if (s.cT === 'T1a') {
      const peq = size !== null && size < 2;
      if (peq) {
        out.push(R('RN-LOC-10', 'Vigilância ativa: imagem (US, TC ou RM) aos 3–6 meses e depois a cada 6–12 meses; metástase em vigilância < 2%; cerca de 1/3 será tratado em 5 anos. Gatilhos para tratar: crescimento > 5 mm/ano, tamanho > 3–4 cm, mudança de aspecto, sintomas ou histologia agressiva na biópsia.', 'forte', 'AUA 2021 (preferida < 2 cm); EAU 2026 (fraca)', [], { kind: 'padrao' }));
        out.push(R('RN-LOC-11', 'Nefrectomia parcial se o paciente prefere tratamento definitivo ou é jovem com longa expectativa (acumula risco de progressão).', 'moderada', 'EAU 2026 (forte para T1 quando se trata)', ['parcial']));
        out.push(R('RN-LOC-12', 'Biópsia percutânea opcional antes de decidir vigilância: 20–30% das massas < 2 cm são benignas (oncocitoma, angiomiolipoma pobre em gordura).', 'fraca', 'EAU 2026 (fraca); AUA 2021'));
      } else {
        out.push(R('RN-LOC-13', `Nefrectomia parcial (robótica, laparoscópica ou aberta): padrão para cT1a de ${size ?? '2–4'} cm no paciente apto; controle oncológico igual à radical com melhor função renal.${complex === 'alta' ? ' Complexidade alta (RENAL 10–12): cirurgião experiente, considerar clampeamento seletivo ou aberta.' : ''}`, 'forte', 'EAU 2026 (forte); AUA 2021', ['parcial'], { kind: 'padrao' }));
        out.push(R('RN-LOC-14', 'Vigilância ativa é alternativa se não há indicação de tratamento imediato (idoso, comorbidade, preferência): mesma regra de imagem e gatilhos da massa pequena; biópsia prévia ajuda a selecionar.', (saude === 'medio' || pref === 'observar') ? 'moderada' : 'fraca', 'EAU 2026 (fraca); AUA 2021'));
        if (size !== null && size <= 3) out.push(R('RN-LOC-15', 'Ablação térmica percutânea (radiofrequência, crioablação ou micro-ondas) para tumor ≤ 3 cm em paciente inapto, com rim único ou que prefere evitar cirurgia; biópsia antes (não concomitante); recidiva local 5–10%, re-ablável.', (saude !== 'bom' || drc || pref === 'preservar') ? 'moderada' : 'fraca', 'EAU 2026 (fraca); AUA 2021', ['ablacao']));
        else out.push(R('RN-LOC-16', 'Ablação para 3–4 cm: crioablação é preferível à radiofrequência (não usar RF de rotina > 3 cm); reservar a inaptos.', 'fraca', 'EAU 2026 (fraca)', ['ablacao']));
        out.push(R('RN-LOC-17', 'SABR renal (26 Gy fração única ou 42 Gy em 3 frações) para inapto à cirurgia e à ablação: controle local > 95% (IROCK), queda de TFG 5–10 mL/min.', 'fraca', 'EAU 2026 (novo, fraca)', ['sabr']));
        out.push(R('RN-LOC-18', 'Não fazer nefrectomia radical minimamente invasiva quando a parcial é factível por qualquer via.', 'nao', 'EAU 2026 (forte contra)'));
      }
    }
    // cT1b
    if (s.cT === 'T1b') {
      const parcialOk = complex !== 'alta';
      out.push(R('RN-LOC-20', `Nefrectomia parcial quando tecnicamente factível (${complex === 'ni' ? 'avaliar complexidade RENAL/PADUA' : 'complexidade ' + complex}): equivalente em sobrevida câncer-específica à radical no T1b, com menos doença renal crônica.`, parcialOk ? 'forte' : 'moderada', 'EAU 2026 (forte para T1)', ['parcial'], { kind: 'padrao' }));
      out.push(R('RN-LOC-21', 'Nefrectomia radical laparoscópica ou robótica se a parcial comprometer margem, função residual ou segurança (tumor hilar, endofítico complexo).', parcialOk ? 'moderada' : 'forte', 'EAU 2026', ['nefrectomia_lap']));
      if (saude !== 'bom' || drc) out.push(R('RN-LOC-22', 'Inapto à cirurgia: SABR (controle local > 90% em T1b) ou crioablação (até 4–5 cm, taxa de recidiva maior); biópsia antes.', 'fraca', 'EAU 2026 (fraca)', ['sabr', 'ablacao']));
      else out.push(R('RN-LOC-23', 'Vigilância ativa não é padrão para T1b (crescimento e metástase mais frequentes); só em comorbidade significativa com reavaliação a cada 3–6 meses.', 'fraca', 'AUA 2021'));
    }
    // cT2
    if (s.cT === 'T2a' || s.cT === 'T2b') {
      if (drc) {
        out.push(R('RN-LOC-30', 'Rim único ou DRC: nefrectomia parcial se tecnicamente factível, mesmo em T2 (aberta ou robótica em centro experiente).', 'moderada', 'EAU 2026 (fraca)', ['parcial'], { kind: 'padrao' }));
        out.push(R('RN-LOC-31', 'Nefrectomia radical com plano de terapia renal substitutiva se a parcial for impossível.', 'moderada', 'EAU 2026', ['nefrectomia_lap', 'nefrectomia_aberta']));
      } else {
        out.push(R('RN-LOC-32', 'Nefrectomia radical laparoscópica ou robótica: padrão para T2 não passível de parcial; aberta se > 10–12 cm, aderências ou suspeita de T3.', 'forte', 'EAU 2026 (forte)', ['nefrectomia_lap', 'nefrectomia_aberta'], { kind: 'padrao' }));
        out.push(R('RN-LOC-33', 'Parcial é opção em T2a selecionado (exofítico, polar) em centro experiente; não é padrão.', 'fraca', 'EAU 2026'));
      }
    }
    // cT3a sem trombo (gordura) / T4
    if (s.cT === 'T3a') out.push(R('RN-LOC-40', 'cT3a (gordura perirrenal/seio): nefrectomia radical, via aberta ou robótica conforme experiência; ressecar a gordura em bloco; adrenalectomia só se invasão na imagem.', 'forte', 'EAU 2026', ['nefrectomia_aberta', 'nefrectomia_lap'], { kind: 'padrao' }));
    if (s.cT === 'T4') {
      out.push(R('RN-LOC-41', 'cT4 (além da Gerota, adrenal contígua ou órgãos vizinhos): discussão multidisciplinar para definir objetivo; ressecção em bloco se resseção completa (R0) é viável; caso contrário terapia sistêmica (como metastático) e reavaliação para cirurgia.', 'forte', 'EAU 2026 (forte)', ['nefrectomia_aberta'], { kind: 'padrao' }));
      out.push(R('RN-LOC-42', 'Neoadjuvância (TKI ou imunoterapia) fora de ensaio clínico não é recomendada.', 'ensaio', 'EAU 2026 (fraca contra)'));
    }
    if (s.cN === 'N1' && s.trombo === 'nao') out.push(R('RN-LOC-04', 'Linfonodos aumentados na imagem: ressecar durante a nefrectomia (estadiamento e controle local); linfadenectomia estendida não melhora sobrevida.', 'fraca', 'EAU 2026 (fraca)'));
    // comuns a toda cirurgia
    if (s.cT !== 'T1a' || size === null || size >= 2) {
      out.push(R('RN-LOC-50', 'Não fazer adrenalectomia ipsilateral sem evidência de invasão na imagem ou no intraoperatório; não fazer linfadenectomia de rotina no órgão-confinado.', 'nao', 'EAU 2026 (forte / fraca)'));
      out.push(R('RN-LOC-51', 'Após a cirurgia: calcular Leibovich e critérios KEYNOTE-564 no fluxo "Pós-nefrectomia" (adjuvância e seguimento).', 'padrao', 'EAU 2026'));
    }
    if (bx === 'nao' && (s.cT === 'T1a' || s.cT === 'T1b')) pend.push(R('RN-DX-10', 'Biópsia percutânea (core coaxial, nunca aspirativa) é obrigatória antes de ablação e recomendada antes de vigilância; dispensável se a cirurgia será feita de qualquer forma.', 'padrao', 'EAU 2026 (forte)'));
    return { out, alerts, pend, info, le, stage: s };
  }

  /* ---------- Módulo 2 – pós-nefrectomia: Leibovich, KEYNOTE-564, adjuvância, seguimento ---------- */
  function leibovich2003(p) {
    const pT = p.pT || 'pT1a';
    const grau = num(p.grau) ?? 2;
    const size = num(p.tamanho);
    let pts = 0; const f = [];
    const tPts = pT === 'pT1a' ? 0 : pT === 'pT1b' ? 2 : (pT === 'pT2a' || pT === 'pT2b') ? 3 : 4;
    pts += tPts; if (tPts) f.push(`${pT} (+${tPts})`);
    if (p.pN === 'pN1') { pts += 2; f.push('pN1 (+2)'); }
    if (size !== null && size >= 10) { pts += 1; f.push('≥ 10 cm (+1)'); }
    if (grau === 3) { pts += 1; f.push('grau 3 (+1)'); } else if (grau >= 4) { pts += 3; f.push('grau 4 (+3)'); }
    if (p.necrose === 'sim') { pts += 1; f.push('necrose (+1)'); }
    const group = pts <= 2 ? 'baixo' : pts <= 5 ? 'intermediario' : 'alto';
    const mfs = { baixo: [97.1, 92.5], intermediario: [85.5, 74.0], alto: [36.0, 23.6] }[group]; // sobrevida livre de metástase 5 e 10 anos (Leibovich 2003)
    return { pts, f, group, label: { baixo: 'Risco baixo (Leibovich 0–2)', intermediario: 'Risco intermediário (Leibovich 3–5)', alto: 'Risco alto (Leibovich ≥ 6)' }[group], met5: +(100 - mfs[0]).toFixed(1), met10: +(100 - mfs[1]).toFixed(1) };
  }
  function eauFollowRisk(p, lb) {
    const ccrcc = (p.histologia || 'ccrcc') === 'ccrcc';
    if (ccrcc) return lb.group;
    const grau = num(p.grau) ?? 2; const pT = p.pT || 'pT1a';
    if (p.pN === 'pN1' || !(pT === 'pT1a' || pT === 'pT1b')) return 'alto';
    if (grau >= 3) return 'intermediario';
    return 'baixo';
  }
  function k564(p) {
    const ccrcc = (p.histologia || 'ccrcc') === 'ccrcc' || p.componente_cc === 'sim';
    const pT = p.pT || 'pT1a', pN = p.pN || 'pN0', grau = num(p.grau) ?? 2, sarc = p.sarcomatoide === 'sim';
    const m1ned = p.m1ned === 'sim_1ano';
    let cat = null, why = '';
    if (m1ned) { cat = 'M1 NED'; why = 'metástase ressecada em até 1 ano da nefrectomia, sem doença residual'; }
    else if (pT === 'pT4' || pN === 'pN1') { cat = 'alto'; why = pN === 'pN1' ? 'pN1' : 'pT4'; }
    else if (pT.startsWith('pT3')) { cat = 'intermediario_alto'; why = pT + ' qualquer grau'; }
    else if ((pT === 'pT2a' || pT === 'pT2b') && (grau >= 4 || sarc)) { cat = 'intermediario_alto'; why = 'pT2 ' + (sarc ? 'sarcomatoide' : 'grau 4'); }
    return { elegivel: !!cat && ccrcc, cat, why, ccrcc, label: !cat ? 'Fora dos critérios KEYNOTE-564' : !ccrcc ? 'Critérios anatômicos do KEYNOTE-564 presentes, mas histologia não células claras (sem evidência)' : `KEYNOTE-564: risco ${cat === 'intermediario_alto' ? 'intermediário-alto' : cat} (${why})` };
  }
  const FU = {
    baixo: { img: 'TC de tórax e abdome aos 6 meses e aos 2 anos; depois a cada 2 anos se mantida', lab: 'Creatinina/TFG, proteinúria e PA anuais', stop: 'Considerar encerrar imagem oncológica aos 3 anos', aua: 'AUA baixo risco (pT1 G1–2, margem negativa): TC/RM de abdome em 12 meses e anual até 3–5 anos; radiografia de tórax anual' },
    intermediario: { img: 'TC de tórax e abdome aos 6 meses, 1, 2 e 3 anos; anual até 5 anos; depois a cada 2 anos', lab: 'Creatinina/TFG, proteinúria e PA anuais', stop: 'Considerar encerrar imagem oncológica aos 5 anos', aua: 'AUA intermediário/alto (pT2–3, G3–4, margem positiva): TC de tórax e abdome a cada 6 meses por 2–3 anos, depois anual até 5 anos' },
    alto: { img: 'TC de tórax e abdome a cada 6 meses por 2–3 anos; anual até 5 anos; depois a cada 2 anos', lab: 'Creatinina/TFG, proteinúria e PA anuais; TSH/cortisol/glicemia/transaminases se em imunoterapia adjuvante', stop: 'Seguimento prolongado conforme comorbidade; parar quando o risco de morte por outra causa for o dobro do risco de recidiva', aua: 'AUA alto (pT3–4, pN+): TC de tórax e abdome a cada 6 meses por 3 anos, anual até 5 anos e além, individualizado' },
  };
  function postop(p) {
    const out = [], alerts = [], pend = [], info = {};
    const lb = leibovich2003(p);
    const k = k564(p);
    const hist = p.histologia || 'ccrcc';
    const fr = eauFollowRisk(p, lb);
    const ioContra = p.io_contra === 'sim';
    info.status = `${p.pT || 'pT1a'} ${p.pN || 'pN0'} · grau ${num(p.grau) ?? '?'}${p.sarcomatoide === 'sim' ? ' · sarcomatoide' : ''}${p.necrose === 'sim' ? ' · necrose' : ''}${p.margem === 'sim' ? ' · margem positiva' : ''}`;
    info.lb = hist === 'ccrcc' ? `${lb.label} · ${lb.pts} pontos${lb.f.length ? ' (' + lb.f.join(', ') + ')' : ''} · metástase em 5/10 anos ≈ ${lb.met5}% / ${lb.met10}%` : `Não células claras (${hist}): risco de seguimento EAU ${fr} (UISS/VENUSS)`;
    info.k = k.label;
    // adjuvância
    if (k.elegivel && !ioContra) {
      out.push(R('RN-ADJ-01', 'Pembrolizumabe adjuvante 200 mg a cada 3 semanas (ou 400 mg a cada 6) por 1 ano, iniciando em 12–16 semanas da cirurgia após reestadiamento com TC de tórax e abdome: KEYNOTE-564 reduziu recidiva (HR 0,63) e morte (OS HR 0,62; 91% vs 86% em 4 anos).', 'forte', 'EAU 2026 (forte); NCCN categoria 1 preferido', ['pembro_adj'], { kind: 'padrao' }));
      out.push(R('RN-ADJ-02', 'Pembrolizumabe + belzutifano 120 mg/dia por até 54 semanas: LITESPARK-022 reduziu recidiva além do pembrolizumabe isolado (DFS HR 0,72; 80,7% vs 73,7% em 2 anos), sobrevida global ainda imatura, toxicidade grau ≥ 3 52% vs 30% (anemia 12%, hipóxia 4,6%). FDA jun/2026 e ANVISA jul/2026; ainda fora das diretrizes publicadas.', 'moderada', 'LITESPARK-022; FDA 12/06/2026; ANVISA 21/07/2026', ['belzu_adj', 'pembro_adj']));
      alerts.push(R('RN-ADJ-03', 'Discutir com o paciente: 1/3 dos tratados nunca recidivaria; eventos imunomediados permanentes (tireoide 10–15%, adrenal, diabetes) ocorrem em ~5–10%; com belzutifano, anemia e hipóxia exigem hemoglobina e oximetria a cada visita.', 'alerta', 'EAU 2026 (forte)'));
      out.push(R('RN-ADJ-04', 'Observação é alternativa válida para quem recusa imunoterapia ou tem risco intermediário-alto com pT3a de baixo grau (benefício absoluto menor).', 'fraca', 'EAU 2026'));
    } else if (k.elegivel && ioContra) {
      out.push(R('RN-ADJ-05', 'Critérios para adjuvância presentes, mas imunoterapia contraindicada (autoimune ativa, transplante, corticoide ≥ 10 mg): observação com seguimento de alto risco; nenhum TKI adjuvante é recomendado (S-TRAC sem ganho de sobrevida; ASSURE negativo).', 'forte', 'EAU 2026', [], { kind: 'padrao' }));
    } else if (k.cat && !k.ccrcc) {
      out.push(R('RN-ADJ-06', 'Não células claras com critérios anatômicos de alto risco: sem adjuvância fora de ensaio clínico (KEYNOTE-564 incluiu apenas células claras); observação com seguimento de alto risco; sequenciamento tumoral para elegibilidade a ensaios.', 'forte', 'EAU 2026; NCCN v1.2026', [], { kind: 'padrao' }));
      if (hist === 'coletor' || hist === 'medular') out.push(R('RN-ADJ-06b', (hist === 'coletor' ? 'Carcinoma de ductos coletores' : 'Carcinoma medular renal') + ': comportamento agressivo com recidiva precoce; estadiar com TC de tórax/abdome já no pós-operatório, encaminhar à oncologia para discutir quimioterapia com platina (gemcitabina + cisplatina/carboplatina, como no urotelial) adjuvante ou na recidiva, e ensaio clínico; imagem a cada 3 meses no 1º ano.', 'fraca', 'EAU 2026; NCCN v1.2026', ['gem_cis']));
    } else {
      out.push(R('RN-ADJ-07', 'Sem indicação de adjuvância (pT1–pT2 grau 1–3, N0, sem sarcomatoide): observação com seguimento por risco.', 'forte', 'EAU 2026; KEYNOTE-564', [], { kind: 'padrao' }));
    }
    out.push(R('RN-ADJ-08', 'Não oferecer sunitinibe, sorafenibe, pazopanibe, axitinibe, everolimo, atezolizumabe, nivolumabe ± ipilimumabe ou durvalumabe como adjuvantes.', 'nao', 'EAU 2026 (fraca/forte contra); ASSURE, PROTECT, ATLAS, IMmotion010, CheckMate 914, RAMPART'));
    if (p.margem === 'sim') alerts.push(R('RN-ADJ-09', 'Margem positiva após parcial: não reoperar nem converter em radical; intensificar seguimento com imagem contrastada aos 3–6 meses e anual.', 'alerta', 'EAU 2026 (fraca)'));
    if (p.m1ned === 'sim_mais1ano') alerts.push(R('RN-ADJ-10', 'Metástase ressecada após mais de 1 ano da nefrectomia: fora do critério M1 NED do KEYNOTE-564; não dar TKI após metastasectomia completa (forte contra); seguimento intensivo ou ensaio.', 'alerta', 'EAU 2026'));
    const idade = num(p.idade);
    if ((idade !== null && idade <= 46) || p.multifocal === 'sim' || ['papilar_fh', 'cromofobo_multiplo', 'translocacao', 'sdh', 'outro_sindromico'].includes(p.histologia_detalhe)) alerts.push(R('RN-GEN-01', 'Idade ≤ 46 anos, tumores bilaterais/multifocais ou histologia sindrômica (FH-deficiente, SDH, translocação, cromófobo/oncocitário múltiplo): aconselhamento e teste genético germinativo.', 'alerta', 'AUA 2021; NCCN v1.2026', ['teste_germinativo']));
    const tfg = num(p.tfg);
    if (tfg !== null && tfg < 45) alerts.push(R('RN-ADJ-11', `TFG ${tfg} mL/min após a cirurgia: acompanhamento nefrológico; controlar PA e proteinúria; evitar nefrotóxicos e contraste iodado desnecessário (RM pode substituir TC de abdome).`, 'alerta', 'EAU 2026'));
    const fu = FU[fr];
    return { out, alerts, pend, info, lb, k, fr, followup: { grupo: fr, img: fu.img, lab: fu.lab, stop: fu.stop, aua: fu.aua } };
  }

  /* ---------- Módulo 3 – metastático: IMDC e primeira linha ---------- */
  function imdc(p) {
    const f = [];
    if (p.kps_baixo === 'sim') f.push('Karnofsky < 80%');
    if (p.tempo_dx === 'sim') f.push('< 1 ano do diagnóstico ao tratamento');
    if (p.hb_baixa === 'sim') f.push('hemoglobina baixa');
    if (p.ca_alto === 'sim') f.push('cálcio corrigido alto');
    if (p.neutro_alto === 'sim') f.push('neutrófilos altos');
    if (p.plaq_alta === 'sim') f.push('plaquetas altas');
    const n = f.length;
    const group = n === 0 ? 'favoravel' : n <= 2 ? 'intermediario' : 'desfavoravel';
    const os = { favoravel: '~55 meses', intermediario: '~33 meses', desfavoravel: '~13 meses' }[group];
    return { n, f, group, label: { favoravel: 'IMDC favorável (0 fatores)', intermediario: `IMDC intermediário (${n} fator${n > 1 ? 'es' : ''})`, desfavoravel: `IMDC desfavorável (${n} fatores)` }[group], os };
  }
  const SITES_LABEL = { pulmao: 'pulmão', osso: 'osso', figado: 'fígado', cerebro: 'cérebro', linfonodo: 'linfonodo', adrenal: 'adrenal', pancreas: 'pâncreas', outro: 'outro' };
  function metastatic(p) {
    const out = [], alerts = [], pend = [], info = {};
    const r = imdc(p);
    const hist = p.histologia || 'ccrcc';
    const sarc = p.sarcomatoide === 'sim';
    const sites = p.sitios || [];
    const ioContra = p.io_contra === 'sim', tkiContra = p.tki_contra === 'sim';
    const carga = p.carga || 'moderada';           // indolente | moderada | crise
    const oligo = p.oligo === 'sim';
    const primario = p.primario === 'sim';
    const adj = p.adj_pembro || 'nao';              // nao | em_uso_6m | mais_6m
    const tfg = num(p.tfg), ecog = num(p.ecog) ?? 0;
    info.status = r.label + ' · sobrevida mediana ' + r.os + ' (aproximada, era IO)';
    info.fat = r.f.length ? 'Fatores: ' + r.f.join(', ') : 'Nenhum fator IMDC';
    info.hist = (hist === 'ccrcc' ? 'Células claras' : hist === 'papilar' ? 'Papilífero' : hist === 'cromofobo' ? 'Cromófobo' : hist === 'coletor' ? 'Ducto coletor' : hist === 'medular' ? 'Medular' : hist === 'translocacao' ? 'Translocação TFE3/TFEB' : 'Outra histologia') + (sarc ? ' com diferenciação sarcomatoide' : '') + (sites.length ? ' · sítios: ' + sites.map((x) => SITES_LABEL[x] || x).join(', ') : '');

    pend.push(R('RN-MET-00', 'Antes de tratar: TC de tórax/abdome/pelve, RM ou TC de crânio (antes de sistêmico ou citorredutora), hemograma, cálcio corrigido, função renal e hepática, TSH, glicemia, cortisol basal; biópsia se não há histologia (define células claras vs não).', 'padrao', 'EAU 2026 (fraca); NCCN v1.2026'));
    const sup = [];
    if (sites.includes('cerebro')) sup.push(R('RN-SUP-01', 'Metástase cerebral: radiocirurgia (SRS) preferida; cirurgia em lesão única volumosa ou com efeito de massa; radioterapia de crânio total só em doença difusa; corticoide pode reduzir a eficácia da imunoterapia — menor dose possível.', 'moderada', 'EAU 2026 (fraca)', ['srs']));
    if (sites.includes('osso')) sup.push(R('RN-SUP-02', 'Metástase óssea: ácido zoledrônico 4 mg a cada 4–12 semanas (ajuste renal) ou denosumabe 120 mg a cada 4 semanas; radioterapia 8 Gy única ou SBRT na lesão dolorosa ou com risco de fratura; fixação cirúrgica em fratura iminente.', 'moderada', 'EAU 2026 (fraca)', ['zoledronico', 'denosumabe', 'rt_osso']));

    // nefrectomia citorredutora
    if (primario) {
      if (r.group === 'desfavoravel') out.push(R('RN-MET-01', 'Não fazer nefrectomia citorredutora no IMDC desfavorável: CARMENA mostrou que sunitinibe isolado não é inferior e a cirurgia atrasa o sistêmico.', 'nao', 'EAU 2026 (forte contra)'));
      else if (r.group === 'intermediario' && carga !== 'indolente') out.push(R('RN-MET-02', 'Primário assintomático no IMDC intermediário que precisa de sistêmico: iniciar terapia sistêmica e discutir nefrectomia citorredutora diferida nos que respondem (SURTIME; PROBE em andamento).', 'moderada', 'EAU 2026 (fraca)', ['citorredutora']));
      else out.push(R('RN-MET-03', `Nefrectomia citorredutora imediata: ${oligo ? 'oligometastático com tratamento local completo possível' : 'bom performance e sem necessidade imediata de sistêmico'}; remove o maior volume tumoral e permite observação ou tratamento local das metástases.`, 'moderada', 'EAU 2026 (fraca)', ['citorredutora']));
      if (p.sintomas_primario === 'sim') out.push(R('RN-MET-04', 'Primário sintomático (hematúria, dor): nefrectomia paliativa ou embolização, independentemente do IMDC.', 'fraca', 'EAU 2026'));
    }
    // oligometastático
    if (oligo) {
      out.push(R('RN-MET-05', 'Oligometastático (≤ 3–5 lesões ressecáveis ou tratáveis): metastasectomia ou SBRT em todas as lesões quando o controle completo é possível, especialmente pulmão, adrenal, pâncreas e tireoide; confirmar com imagem axial antes; sem TKI após ressecção completa.', 'moderada', 'EAU 2026 (fraca); forte contra TKI pós-metastasectomia', ['sbrt_met']));
      if (carga === 'indolente') out.push(R('RN-MET-06', 'Doença indolente e assintomática: vigilância ativa com imagem a cada 3 meses antes de iniciar sistêmico é aceitável (mediana até o início ~15 meses em séries selecionadas).', 'fraca', 'EAU 2026 (fraca)'));
      if (p.ned_pos_local === 'sim') out.push(R('RN-MET-07', 'Sem evidência de doença após ressecção de metástases até 1 ano da nefrectomia (M1 NED): pembrolizumabe adjuvante por 1 ano (subgrupo do KEYNOTE-564).', 'moderada', 'EAU 2026 (forte, critério M1 NED)', ['pembro_adj']));
    }
    // recidiva após adjuvante
    if (adj === 'em_uso_6m') {
      out.push(R('RN-MET-08', 'Recidiva durante ou até 6 meses após pembrolizumabe adjuvante: TKI anti-VEGF (cabozantinibe, lenvatinibe + everolimo, axitinibe ou sunitinibe/pazopanibe); não repetir imunoterapia isolada ou em combinação.', 'forte', 'EAU 2026 (fraca); NCCN v1.2026', ['cabo_mono', 'lenva_eve', 'axitinibe', 'sunitinibe'], { kind: 'padrao' }));
      out.push(R('RN-MET-09', 'Nova imunoterapia neste cenário não é recomendada (resistência primária provável).', 'nao', 'EAU 2026 (fraca contra)'));
      { out.push(...sup); return { out, alerts, pend, info, imdc: r }; }
    }
    // não células claras
    if (hist !== 'ccrcc') {
      if (hist === 'papilar') {
        out.push(R('RN-NCC-01', 'Papilífero: cabozantinibe 60 mg/dia (PAPMET: PFS 9 vs 5,6 meses vs sunitinibe).', 'moderada', 'EAU 2026 (fraca, único RCT positivo)', ['cabo_mono'], { kind: 'padrao' }));
        if (!ioContra) out.push(R('RN-NCC-02', 'Pembrolizumabe + lenvatinibe (KEYNOTE-B61, resposta ~50%) ou nivolumabe + cabozantinibe (resposta 47%): opções baseadas em estudos de braço único.', 'fraca', 'EAU 2026 (fraca); NCCN 2A', ['pembro_lenva', 'nivo_cabo']));
        pend.push(R('RN-NCC-03', 'Testar FH (imuno-histoquímica) e MET: FH-deficiente responde a bevacizumabe + erlotinibe ou IO + TKI; indica aconselhamento genético.', 'padrao', 'NCCN v1.2026'));
      } else if (hist === 'cromofobo') {
        out.push(R('RN-NCC-04', 'Cromófobo: sunitinibe 50 mg (4/2) ou pembrolizumabe + lenvatinibe; everolimo ± lenvatinibe é alternativa; pouca resposta a imunoterapia isolada.', 'fraca', 'EAU 2026 (fraca)', ['sunitinibe', 'pembro_lenva', 'lenva_eve'], { kind: 'padrao' }));
        out.push(R('RN-NCC-05', 'Não usar nivolumabe + cabozantinibe no cromófobo (sem resposta nos estudos).', 'nao', 'EAU 2026'));
      } else if (hist === 'translocacao') {
        out.push(R('RN-NCC-06', 'Carcinoma de translocação TFE3/TFEB: imunoterapia + TKI (pembrolizumabe + lenvatinibe ou nivolumabe + cabozantinibe); curso agressivo em jovens; ensaio clínico se disponível.', 'fraca', 'EAU 2026; NCCN', ['pembro_lenva', 'nivo_cabo'], { kind: 'padrao' }));
      } else if (hist === 'coletor') {
        out.push(R('RN-NCC-07', 'Ducto coletor (Bellini): quimioterapia tipo urotelial — gemcitabina + cisplatina (ou carboplatina) ± cabozantinibe (BONSAI); prognóstico reservado.', 'fraca', 'EAU 2026; NCCN', ['gem_cis', 'cabo_mono'], { kind: 'padrao' }));
      } else if (hist === 'medular') {
        out.push(R('RN-NCC-08', 'Carcinoma medular (SMARCB1, traço falciforme): quimioterapia com platina (gemcitabina + cisplatina ou MVAC); considerar bortezomibe; não responde a TKI; ensaio clínico.', 'fraca', 'NCCN v1.2026', ['gem_cis'], { kind: 'padrao' }));
      } else {
        out.push(R('RN-NCC-09', 'Histologia não classificada ou rara: pembrolizumabe + lenvatinibe, nivolumabe + cabozantinibe (exceto cromófobo) ou nivolumabe + ipilimumabe; sunitinibe se imunoterapia contraindicada.', 'fraca', 'EAU 2026 (fraca)', ['pembro_lenva', 'nivo_cabo', 'ipi_nivo', 'sunitinibe'], { kind: 'padrao' }));
      }
      out.push(R('RN-NCC-10', 'Todo não células claras: ensaio clínico é preferível; sequenciamento genômico tumoral para elegibilidade (NCCN 2026); STELLAR-304 (zanzalintinibe + nivolumabe) aguarda resultado.', 'ensaio', 'NCCN v1.2026; EAU 2026'));
      if (sarc && !ioContra) out.push(R('RN-NCC-11', 'Diferenciação sarcomatoide em não células claras: preferir combinação com imunoterapia (ipilimumabe + nivolumabe ou IO + TKI).', 'moderada', 'EAU 2026', ['ipi_nivo']));
      { out.push(...sup); return { out, alerts, pend, info, imdc: r }; }
    }
    // células claras – primeira linha
    if (ioContra && tkiContra) alerts.push(R('RN-MET-10', 'Imunoterapia e TKI contraindicados: rever contraindicações (HAS e proteinúria são manejáveis; doença autoimune leve não impede IO); discutir em reunião multidisciplinar; suporte exclusivo é opção.', 'alerta', 'Módulo'));
    if (!ioContra) {
      const favor = r.group === 'favoravel';
      const prefIOIO = sarc || tkiContra || (carga === 'indolente' && !favor);
      const ipiNivo = R('RN-MET-11', `Nivolumabe 3 mg/kg + ipilimumabe 1 mg/kg a cada 3 semanas × 4, depois nivolumabe 240 mg a cada 2 semanas ou 480 mg a cada 4 (até 2 anos): CheckMate 214 — sobrevida mediana ~56 meses no intermediário/desfavorável, respostas completas 11–12%, 1/3 dos respondedores vivos sem tratamento aos 8 anos.${sarc ? ' Sarcomatoide: preferido (RC 23%, OS HR 0,45).' : ''}`, favor ? 'fraca' : 'forte', favor ? 'EAU 2026 (fraca no favorável)' : 'EAU 2026 (forte); NCCN categoria 1 preferido (2026)', ['ipi_nivo']);
      const pembroAxi = R('RN-MET-12', 'Pembrolizumabe 200 mg a cada 3 semanas (até 35 ciclos) + axitinibe 5 mg 2×/dia (escalonar a 7 e 10 mg): KEYNOTE-426 — OS HR 0,84 em 5 anos, resposta 60%, progressão primária 11%.', favor ? 'fraca' : 'forte', favor ? 'EAU 2026 (fraca no favorável)' : 'EAU 2026 (forte); NCCN categoria 1', ['pembro_axi']);
      const pembroLenva = R('RN-MET-13', 'Pembrolizumabe 200 mg a cada 3 semanas + lenvatinibe 20 mg/dia: CLEAR — PFS 23,9 vs 9,2 meses (HR 0,47), resposta 71%, RC 18%, OS HR 0,79; maior toxicidade (redução de dose em 70%).', favor ? 'fraca' : 'forte', favor ? 'EAU 2026 (fraca no favorável)' : 'EAU 2026 (forte); NCCN categoria 1', ['pembro_lenva']);
      const nivoCabo = R('RN-MET-14', 'Nivolumabe 240 mg a cada 2 semanas + cabozantinibe 40 mg/dia: CheckMate 9ER — PFS 16,6 vs 8,4 meses, OS HR 0,77, resposta 56%, boa qualidade de vida relatada.', favor ? 'fraca' : 'forte', favor ? 'EAU 2026 (fraca no favorável)' : 'EAU 2026 (forte); NCCN categoria 1', ['nivo_cabo']);
      let order;
      if (tkiContra) order = [ipiNivo];
      else if (prefIOIO) order = [ipiNivo, nivoCabo, pembroAxi, pembroLenva];
      else order = carga === 'crise' ? [pembroLenva, nivoCabo, pembroAxi, ipiNivo] : [pembroAxi, nivoCabo, pembroLenva, ipiNivo];
      order.forEach((o, i) => { o.kind = (i === 0 && !favor) ? 'padrao' : undefined; out.push(o); });
      if (favor) {
        out.push(R('RN-MET-15', 'IMDC favorável: nenhuma combinação demonstrou ganho de sobrevida global sobre sunitinibe; IO + TKI melhora resposta e PFS; nivolumabe + ipilimumabe não melhorou PFS neste grupo. Vigilância inicial é aceitável em doença indolente e assintomática.', 'padrao', 'EAU 2026 (todas fracas); NCCN'));
        if (!tkiContra) out.push(R('RN-MET-16', 'Sunitinibe 50 mg/dia (4 semanas sim / 2 não, ou 2/1) ou pazopanibe 800 mg/dia isolados: opção no favorável, especialmente quando imunoterapia não é desejada ou disponível (única opção no SUS).', 'fraca', 'EAU 2026 (fraca); DDT MS 2022', ['sunitinibe', 'pazopanibe']));
      }
      if (carga === 'crise') alerts.push(R('RN-MET-17', 'Crise visceral ou doença sintomática volumosa: preferir IO + TKI (resposta rápida, progressão primária 5–6% vs ~18% com ipilimumabe + nivolumabe).', 'alerta', 'EAU 2026; NCCN'));
      if (sarc) alerts.push(R('RN-MET-18', 'Diferenciação sarcomatoide: ipilimumabe + nivolumabe é a combinação com maior taxa de resposta completa; IO + TKI também é eficaz; TKI isolado tem resposta pobre.', 'alerta', 'EAU 2026 (forte para IO)'));
      out.push(R('RN-MET-19', 'Quem interrompe ipilimumabe + nivolumabe por toxicidade na indução pode seguir com nivolumabe isolado quando seguro; TKI intermitente é aceitável após resposta ou doença estável > 6 meses.', 'fraca', 'EAU 2026 (fraca)'));
      out.push(R('RN-MET-20', 'Triplete nivolumabe + ipilimumabe + cabozantinibe (COSMIC-313): PFS melhor sem ganho de sobrevida e mais toxicidade — não recomendado.', 'nao', 'EAU 2026; COSMIC-313'));
    } else {
      if (r.group !== 'favoravel') out.push(R('RN-MET-21', 'Imunoterapia contraindicada, IMDC intermediário/desfavorável: cabozantinibe 60 mg/dia (CABOSUN: PFS 8,6 vs 5,3 meses vs sunitinibe).', 'forte', 'EAU 2026 (forte, baseado em fase II)', ['cabo_mono'], { kind: 'padrao' }));
      out.push(R('RN-MET-22', 'Sunitinibe 50 mg/dia (4/2 ou 2/1) ou pazopanibe 800 mg/dia (COMPARZ: não inferioridade; pazopanibe melhor tolerado).', r.group === 'favoravel' ? 'forte' : 'moderada', 'EAU 2026 (forte)', ['sunitinibe', 'pazopanibe'], { kind: r.group === 'favoravel' ? 'padrao' : undefined }));
      out.push(R('RN-MET-23', 'Não usar imunoterapia em doença autoimune ativa grave, transplante de órgão sólido ou corticoide ≥ 10 mg de prednisona; revisar com reumatologia se a contraindicação for relativa.', 'nao', 'EAU 2026 (forte)'));
    }
    out.push(R('RN-MET-24', 'Quimioterapia citotóxica, interferon e interleucina-2 não têm papel no carcinoma de células claras metastático.', 'nao', 'EAU 2026 (forte contra)'));
    if (tfg !== null && tfg < 30) alerts.push(R('RN-TOX-01', `TFG ${tfg} mL/min: imunoterapia não precisa de ajuste; TKI com cautela (iniciar dose reduzida e vigiar proteinúria e PA); evitar ácido zoledrônico (preferir denosumabe).`, 'alerta', 'Bulas'));
    if (p.has_grave === 'sim' || p.proteinuria === 'sim') alerts.push(R('RN-TOX-02', 'Hipertensão não controlada ou proteinúria: otimizar antes de TKI (IECA/BRA, bloqueador de canal de cálcio); hipertensão sob TKI é marcador de resposta e se trata sem suspender.', 'alerta', 'Bulas; EAU 2026'));
    if (ecog >= 3) alerts.push(R('RN-TOX-03', 'ECOG 3–4: benefício de terapia sistêmica incerto (excluídos dos ensaios); cuidados paliativos precoces e decisão compartilhada.', 'alerta', 'EAU 2026'));
    { out.push(...sup); return { out, alerts, pend, info, imdc: r }; }
  }

  /* ---------- Módulo 4 – linhas subsequentes ---------- */
  function later(p) {
    const out = [], alerts = [], pend = [], info = {};
    const prev = new Set(p.previos || []);   // ipi_nivo | io_tki | tki_mono | cabo | lenva | belzu | eve | axi | pembro_adj
    const motivo = p.motivo || 'progressao'; // progressao | tox_io | tox_tki
    const hist = p.histologia || 'ccrcc';
    const hadIO = prev.has('ipi_nivo') || prev.has('io_tki') || prev.has('pembro_adj');
    const hadCabo = prev.has('cabo'), hadLenva = prev.has('lenva'), hadBelzu = prev.has('belzu'), hadEve = prev.has('eve'), hadAxi = prev.has('axi');
    const linhas = num(p.n_linhas) ?? prev.size;
    const hb = num(p.hb), spo2 = num(p.spo2);
    const belzuCaution = (hb !== null && hb < 10) || (spo2 !== null && spo2 < 92);
    const ioContra = p.io_contra === 'sim';
    info.status = `Linha ${Math.max(2, linhas + 1)} · prévios: ${linhas ? [...prev].map((k) => ({ ipi_nivo: 'ipilimumabe + nivolumabe', io_tki: 'imunoterapia + TKI', tki_mono: 'TKI isolado', cabo: 'cabozantinibe', lenva: 'lenvatinibe', belzu: 'belzutifano', eve: 'everolimo', axi: 'axitinibe', pembro_adj: 'pembrolizumabe adjuvante' })[k] || k).join(', ') : 'nenhum'}`;
    info.motivo = motivo === 'progressao' ? 'Troca por progressão' : motivo === 'tox_io' ? 'Troca por toxicidade imunomediada' : 'Troca por toxicidade do TKI';
    if (hist !== 'ccrcc') { out.push(R('RN-SEQ-00', 'Não células claras em linha subsequente: cabozantinibe (se não usado), lenvatinibe + everolimo, sunitinibe ou ensaio clínico; nivolumabe isolado tem resposta baixa fora do papilífero FH-deficiente.', 'fraca', 'EAU 2026; NCCN v1.2026', ['cabo_mono', 'lenva_eve', 'sunitinibe'], { kind: 'padrao' })); return { out, alerts, pend, info }; }

    if (hadIO) {
      // após imunoterapia
      if (!hadCabo) out.push(R('RN-SEQ-02', 'Cabozantinibe 60 mg/dia: padrão após imunoterapia (METEOR: OS 21,4 vs 16,5 meses vs everolimo; séries pós-IO com PFS 8–12 meses).', 'forte', 'EAU 2026 (forte); NCCN preferido', ['cabo_mono'], { kind: 'padrao' }));
      if (!hadLenva && !hadBelzu) out.push(R('RN-SEQ-01', 'Belzutifano 120 mg + lenvatinibe 20 mg/dia: LITESPARK-011 — PFS 14,6 vs 10,6 meses vs cabozantinibe (HR 0,74), resposta 53% vs 40%, OS 33,7 vs 28,6 meses (não significativa). FDA set/2026; sem registro ANVISA da combinação (fármacos registrados separadamente).' + (belzuCaution ? ' Cautela: anemia/hipóxia basal.' : ''), belzuCaution ? 'fraca' : 'moderada', 'LITESPARK-011; FDA 24/09/2026', ['belzu_lenva']));
      if (!hadLenva && !hadEve) out.push(R('RN-SEQ-03', 'Lenvatinibe 18 mg + everolimo 5 mg/dia: PFS 14,6 meses vs 5,5 com everolimo (fase II); LenCabo (fase II, pós-PD-1): PFS 15,7 vs 10,2 meses vs cabozantinibe; toxicidade maior (diarreia, fadiga, hipertensão).', 'moderada', 'EAU 2026; NCCN 2A; LenCabo ESMO 2025', ['lenva_eve']));
      if (!hadAxi) out.push(R('RN-SEQ-04', 'Axitinibe 5 mg 2×/dia com titulação até 10 mg: opção com melhor tolerabilidade; PFS 6–8 meses pós-IO.', 'fraca', 'EAU 2026 (2b)', ['axitinibe']));
      out.push(R('RN-SEQ-05', 'Tivozanibe 1,34 mg/dia (3 semanas sim / 1 não): TIVO-3 vs sorafenibe em 3ª linha; sem registro ANVISA.', 'fraca', 'NCCN 2A; sem registro no Brasil', ['tivozanibe']));
      if (hadCabo && (hadLenva || hadEve)) out.push(R('RN-SEQ-06', 'Belzutifano 120 mg/dia isolado: LITESPARK-005 vs everolimo — PFS HR 0,75, resposta 22% vs 4%, sem ganho de OS; alternativa a everolimo da 2ª à 4ª linha.' + (belzuCaution ? ' Cautela: anemia/hipóxia basal.' : ''), 'fraca', 'EAU 2026 (fraca); FDA 2023', ['belzu_mono']));
      if (hadCabo && !hadLenva) out.push(R('RN-SEQ-07', 'Lenvatinibe 18 mg isolado (NCCN 2A, 2026) ou com everolimo.', 'fraca', 'NCCN v1.2026', ['lenva_eve']));
      if (hadCabo && hadLenva && !hadEve) out.push(R('RN-SEQ-08', 'Everolimo 10 mg/dia: opção tardia com resposta baixa (RECORD-1); preferir belzutifano quando disponível.', 'fraca', 'EAU 2026', ['everolimo']));
      out.push(R('RN-SEQ-09', 'Não repetir imunoterapia (anti-PD-1/PD-L1 isolada ou com TKI) após progressão em combinação com imunoterapia: CONTACT-03 e TiNivo-2 negativos.', 'nao', 'EAU 2026 (fraca contra); NCCN rebaixou a 2B (2026)'));
    } else {
      // após TKI isolado, sem IO prévia
      if (!ioContra) out.push(R('RN-SEQ-10', 'Nivolumabe 240 mg a cada 2 semanas ou 480 mg a cada 4: CheckMate 025 — OS 25 vs 19,6 meses vs everolimo após 1–2 TKIs.', 'forte', 'EAU 2026 (forte); NCCN categoria 1', ['nivolumabe'], { kind: 'padrao' }));
      if (!hadCabo) out.push(R('RN-SEQ-11', 'Cabozantinibe 60 mg/dia: METEOR — PFS 7,4 vs 3,9 meses e OS 21,4 vs 16,5 meses vs everolimo após TKI.', 'forte', 'EAU 2026 (forte); NCCN categoria 1', ['cabo_mono'], { kind: ioContra ? 'padrao' : undefined }));
      if (!hadLenva && !hadEve) out.push(R('RN-SEQ-12', 'Lenvatinibe 18 mg + everolimo 5 mg/dia: alternativa após TKI (NCCN categoria 1 neste cenário).', 'moderada', 'NCCN v1.2026', ['lenva_eve']));
      if (!hadAxi) out.push(R('RN-SEQ-13', 'Axitinibe após sunitinibe/pazopanibe (AXIS): PFS 6,7 vs 4,7 meses vs sorafenibe; opção quando TKI mais potente não é tolerado.', 'fraca', 'EAU 2026', ['axitinibe']));
      out.push(R('RN-SEQ-14', 'Terceira linha: o agente não usado em segunda (nivolumabe ou cabozantinibe); depois belzutifano isolado, lenvatinibe ± everolimo.', 'fraca', 'EAU 2026 (fraca)', ['belzu_mono', 'lenva_eve']));
    }
    if (motivo === 'tox_io') alerts.push(R('RN-SEQ-15', 'Toxicidade imunomediada grave prévia: não reexpor a imunoterapia sem apoio de centro especializado (forte); seguir com TKI.', 'alerta', 'EAU 2026 (forte)'));
    if (motivo === 'tox_tki') alerts.push(R('RN-SEQ-16', 'Troca por toxicidade de TKI com doença controlada: reduzir dose ou trocar por TKI de perfil diferente (axitinibe, tivozanibe) antes de mudar de classe; pausa de tratamento é aceitável em resposta prolongada.', 'alerta', 'EAU 2026 (fraca)'));
    if (belzuCaution) alerts.push(R('RN-TOX-04', `Hemoglobina ${hb ?? '?'} g/dL / SpO2 ${spo2 ?? '?'}%: belzutifano causa anemia (grau ≥ 3 em ~30%) e hipóxia (~15%); corrigir anemia, monitorar oximetria e hemoglobina a cada ciclo; contraindicado na gestação.`, 'alerta', 'Bula Welireg'));
    if (p.has_grave === 'sim' || p.proteinuria === 'sim') alerts.push(R('RN-TOX-02', 'Hipertensão não controlada ou proteinúria: otimizar antes de TKI; proteinúria > 2 g/24 h exige pausa e redução de dose.', 'alerta', 'Bulas'));
    out.push(R('RN-SEQ-17', 'Ensaio clínico em qualquer linha (casdatifan + cabozantinibe – PEAK-1; zanzalintinibe; vacinas; CBM588); tratamento além da progressão em doença lenta com SBRT na lesão oligoprogressiva (fraca).', 'ensaio', 'EAU 2026 (fraca); NCCN'));
    const ecog = num(p.ecog) ?? 0;
    if (ecog >= 3 || linhas >= 3) alerts.push(R('RN-SEQ-18', `${ecog >= 3 ? 'ECOG 3–4' : 'Quarta linha ou além'}: benefício marginal; cuidados paliativos integrados e discussão de objetivos antes de nova linha.`, 'alerta', 'EAU 2026'));
    return { out, alerts, pend, info };
  }

  /* ---------- Disponibilidade no Brasil ---------- */
  const BR = {
    parcial: { sus: 'ok', ans: 'ok', nota: 'Robótica sem remuneração específica no SUS; no convênio depende do contrato' },
    nefrectomia_lap: { sus: 'ok', ans: 'ok', nota: '' },
    nefrectomia_aberta: { sus: 'ok', ans: 'ok', nota: 'Trombo Mayo III–IV exige centro de referência' },
    citorredutora: { sus: 'ok', ans: 'ok', nota: '' },
    ablacao: { sus: 'lim', ans: 'ok', nota: 'Poucos centros SUS com crio/RF percutânea' },
    sabr: { sus: 'lim', ans: 'ok', nota: 'Radioterapia estereotáxica disponível em poucos centros SUS' },
    sbrt_met: { sus: 'lim', ans: 'ok', nota: '' },
    srs: { sus: 'lim', ans: 'ok', nota: 'Radiocirurgia em centros de referência' },
    rt_osso: { sus: 'ok', ans: 'ok', nota: '' },
    pembro_adj: { sus: 'nao', ans: 'ok', nota: 'Registrado ANVISA; não incorporado ao SUS; venoso em bula → cobertura obrigatória' },
    belzu_adj: { sus: 'nao', ans: 'pleit', nota: 'ANVISA 21/07/2026 para adjuvância; oral fora do rol ANS; CONITEC não avaliou' },
    ipi_nivo: { sus: 'nao', ans: 'ok*', nota: 'CONITEC 2021 não incorporou; convênio: venoso em bula (intermediário/desfavorável)' },
    pembro_axi: { sus: 'nao', ans: 'ok*', nota: 'CONITEC 2021 (relatório 660) não incorporou; rol ANS RN 550/2022 (DUT 64) para IMDC intermediário/desfavorável' },
    pembro_lenva: { sus: 'nao', ans: 'conf', nota: 'Não incorporado; lenvatinibe oral: confirmar DUT 64 para CCR' },
    nivo_cabo: { sus: 'nao', ans: 'ok', nota: 'Rol ANS RN 550/2022 (DUT 64), qualquer IMDC' },
    sunitinibe: { sus: 'ok', ans: 'ok', nota: '1ª linha pela DDT MS 2022 (Portaria Conjunta 20/2022); APAC' },
    pazopanibe: { sus: 'ok', ans: 'ok', nota: '1ª linha pela DDT MS 2022; APAC' },
    cabo_mono: { sus: 'nao', ans: 'ok*', nota: 'Não incorporado; rol ANS após anti-VEGF (confirmar redação da DUT)' },
    nivolumabe: { sus: 'nao', ans: 'ok', nota: 'Não incorporado; venoso em bula' },
    axitinibe: { sus: 'nao', ans: 'ok', nota: 'DUT 64 (2ª linha)' },
    lenva_eve: { sus: 'nao', ans: 'conf', nota: 'Everolimo no rol; lenvatinibe a confirmar' },
    everolimo: { sus: 'ok*', ans: 'ok', nota: 'Citado na DDT 2022 como opção; APAC' },
    belzu_lenva: { sus: 'nao', ans: 'pleit', nota: 'Sem registro ANVISA da combinação (FDA set/2026); fármacos registrados separadamente' },
    belzu_mono: { sus: 'nao', ans: 'pleit', nota: 'Registro ANVISA confirmado para VHL e adjuvância; monoterapia em CCR avançado a confirmar' },
    tivozanibe: { sus: 'reg', ans: 'reg', nota: 'Sem registro ANVISA' },
    gem_cis: { sus: 'ok', ans: 'ok', nota: '' },
    zoledronico: { sus: 'ok', ans: 'ok', nota: '' },
    denosumabe: { sus: 'nao', ans: 'ok', nota: 'Não incorporado para oncologia' },
    teste_germinativo: { sus: 'lim', ans: 'ok*', nota: 'Painel hereditário no rol com critérios; raro no SUS' },
  };

  return { RULES, expectancy, cStage, localized, leibovich2003, k564, postop, imdc, metastatic, later, BR, FU };
})();

/* Posologia – câncer de rim (EAU 2026, NCCN v1.2026, bulas FDA/ANVISA). Revisão clínica obrigatória antes do uso assistencial. */
const KDOSES = {
  /* Imunoterapia e combinações de 1ª linha */
  ipi_nivo: { cat: 'Imunoterapia e combinações', nome: 'Nivolumabe + ipilimumabe (1ª linha, IMDC intermediário/desfavorável)', esquema: 'Nivolumabe 3 mg/kg IV + ipilimumabe 1 mg/kg IV a cada 3 semanas × 4 doses; depois nivolumabe 240 mg a cada 2 semanas ou 480 mg a cada 4 semanas', duracao: 'Indução 12 semanas; manutenção até progressão, toxicidade ou 2 anos', obs: 'Eventos imunomediados grau 3–4 em ~45% (colite, hepatite, hipofisite, tireoide); 22% suspendem por toxicidade. Quem interrompe na indução pode seguir com nivolumabe isolado. CheckMate 214.' },
  pembro_axi: { cat: 'Imunoterapia e combinações', nome: 'Pembrolizumabe + axitinibe (1ª linha)', esquema: 'Pembrolizumabe 200 mg IV a cada 3 semanas (ou 400 mg a cada 6) + axitinibe 5 mg VO 2×/dia; escalonar axitinibe para 7 e 10 mg 2×/dia se tolerado por 2 semanas sem HAS > grau 2', duracao: 'Pembrolizumabe até 35 ciclos (~2 anos); axitinibe até progressão ou toxicidade', obs: 'Hepatotoxicidade combinada (ALT/AST grau ≥ 3 em 20%): dosar transaminases a cada ciclo; diarreia, HAS, síndrome mão-pé. KEYNOTE-426.' },
  pembro_lenva: { cat: 'Imunoterapia e combinações', nome: 'Pembrolizumabe + lenvatinibe (1ª linha; não células claras)', esquema: 'Pembrolizumabe 200 mg IV a cada 3 semanas + lenvatinibe 20 mg VO 1×/dia (reduções: 14 → 10 → 8 mg)', duracao: 'Pembrolizumabe até 35 ciclos; lenvatinibe até progressão ou toxicidade', obs: 'Redução de dose de lenvatinibe em ~70%: HAS, diarreia, proteinúria, hipotireoidismo, fadiga, perda de peso. Monitorar PA semanal no 1º mês, proteinúria e TSH a cada ciclo. CLEAR.' },
  nivo_cabo: { cat: 'Imunoterapia e combinações', nome: 'Nivolumabe + cabozantinibe (1ª linha)', esquema: 'Nivolumabe 240 mg IV a cada 2 semanas (ou 480 mg a cada 4) + cabozantinibe 40 mg VO 1×/dia em jejum (reduções: 20 mg/dia → 20 mg em dias alternados)', duracao: 'Nivolumabe até 2 anos; cabozantinibe até progressão ou toxicidade', obs: 'Síndrome mão-pé, diarreia, HAS, hipotireoidismo, elevação de transaminases; cabozantinibe: evitar inibidores fortes de CYP3A4 e toranja. CheckMate 9ER.' },
  nivolumabe: { cat: 'Imunoterapia e combinações', nome: 'Nivolumabe isolado (2ª linha após TKI; manutenção)', esquema: '240 mg IV a cada 2 semanas ou 480 mg a cada 4 semanas', duracao: 'Até progressão ou toxicidade (2 anos nos ensaios)', obs: 'Sem ajuste renal/hepático; eventos imunomediados grau 3–4 em ~20%. Formulação subcutânea (nivolumabe + hialuronidase) registrada pela FDA/EMA. CheckMate 025.' },
  /* Adjuvância */
  pembro_adj: { cat: 'Adjuvância', nome: 'Pembrolizumabe adjuvante', esquema: '200 mg IV a cada 3 semanas ou 400 mg a cada 6 semanas; iniciar em 12 (até 16) semanas da nefrectomia após TC de tórax e abdome sem doença', duracao: '1 ano (17 ciclos de 3 semanas ou 9 de 6 semanas)', obs: 'Células claras, risco intermediário-alto/alto ou M1 NED (KEYNOTE-564). Hipo/hipertireoidismo 20%, insuficiência adrenal e diabetes imunomediados ~2% cada, pneumonite 2%. TSH, cortisol, glicemia e transaminases a cada ciclo; imagem a cada 12 semanas.' },
  belzu_adj: { cat: 'Adjuvância', nome: 'Belzutifano + pembrolizumabe adjuvante', esquema: 'Belzutifano 120 mg VO 1×/dia (reduções 80 → 40 mg) + pembrolizumabe 200 mg a cada 3 semanas ou 400 mg a cada 6', duracao: 'Até 54 semanas de belzutifano e 1 ano de pembrolizumabe', obs: 'LITESPARK-022; FDA 12/06/2026, ANVISA 21/07/2026. Anemia grau ≥ 3 12% (hemoglobina antes de cada ciclo; transfusão/eritropoetina conforme protocolo), hipóxia 4,6% (oximetria em repouso e ao esforço; suspender se SpO2 < 88% ou necessidade de O2). Teratogênico: contracepção não hormonal (reduz etinilestradiol). Evita indutores fortes de CYP3A4; UGT2B17/CYP2C19 metabolizadores pobres têm exposição maior.' },
  /* TKI e terapia-alvo */
  sunitinibe: { cat: 'TKI anti-VEGF', nome: 'Sunitinibe', esquema: '50 mg VO 1×/dia, 4 semanas sim / 2 semanas não (esquema 2/1 reduz toxicidade com mesma eficácia); reduções 37,5 → 25 mg', duracao: 'Até progressão ou toxicidade; intermitente após resposta prolongada é aceitável', obs: 'Fadiga, diarreia, síndrome mão-pé, mucosite, HAS, hipotireoidismo (TSH a cada ciclo), cardiotoxicidade (FEVE basal), mielossupressão. Única opção com pazopanibe no SUS (DDT 2022).' },
  pazopanibe: { cat: 'TKI anti-VEGF', nome: 'Pazopanibe', esquema: '800 mg VO 1×/dia em jejum (1 h antes ou 2 h após refeição); reduções 600 → 400 mg', duracao: 'Até progressão ou toxicidade', obs: 'Hepatotoxicidade (ALT a cada 2 semanas nos 2 primeiros meses, depois mensal por 4 meses), HAS, diarreia, descoloração de cabelos, QT. Melhor qualidade de vida que sunitinibe (COMPARZ/PISCES).' },
  cabo_mono: { cat: 'TKI anti-VEGF', nome: 'Cabozantinibe isolado', esquema: '60 mg VO 1×/dia em jejum (reduções 40 → 20 mg)', duracao: 'Até progressão ou toxicidade', obs: '1ª linha IMDC intermediário/desfavorável sem IO (CABOSUN), 2ª linha após IO ou TKI (METEOR), papilífero (PAPMET). Diarreia, fadiga, síndrome mão-pé, HAS, hipotireoidismo, fístula/perfuração GI e tromboembolismo raros; suspender 3 semanas antes de cirurgia.' },
  axitinibe: { cat: 'TKI anti-VEGF', nome: 'Axitinibe isolado', esquema: '5 mg VO 2×/dia; titular a 7 e 10 mg 2×/dia se tolerado; reduzir a 3 e 2 mg', duracao: 'Até progressão ou toxicidade', obs: 'HAS (marcador de resposta), diarreia, disfonia, fadiga, proteinúria, hipotireoidismo. Meia-vida curta: toxicidade reverte rápido. AXIS.' },
  lenva_eve: { cat: 'TKI anti-VEGF', nome: 'Lenvatinibe + everolimo (2ª linha)', esquema: 'Lenvatinibe 18 mg VO 1×/dia + everolimo 5 mg VO 1×/dia (reduções lenvatinibe 14 → 10 → 8 mg)', duracao: 'Até progressão ou toxicidade', obs: 'Diarreia grau 3 em 20%, fadiga, HAS, proteinúria, hipertrigliceridemia, estomatite (bochechos com dexametasona), pneumonite por everolimo. Fase II vs everolimo; LenCabo (2025) vs cabozantinibe.' },
  everolimo: { cat: 'Inibidores de HIF-2α e mTOR', nome: 'Everolimo isolado', esquema: '10 mg VO 1×/dia (redução 5 mg)', duracao: 'Até progressão ou toxicidade', obs: 'Estomatite (bochecho com dexametasona 0,5 mg/5 mL), pneumonite não infecciosa, hiperglicemia, dislipidemia, infecções; resposta objetiva < 5%. RECORD-1; linha tardia.' },
  belzu_mono: { cat: 'Inibidores de HIF-2α e mTOR', nome: 'Belzutifano isolado (CCR avançado 2ª–4ª linha; VHL)', esquema: '120 mg VO 1×/dia com ou sem alimento (reduções 80 → 40 mg)', duracao: 'Até progressão ou toxicidade', obs: 'LITESPARK-005 (vs everolimo): PFS HR 0,75, resposta 22%; anemia grau ≥ 3 ~30% (Hb a cada ciclo; eritropoetina permitida), hipóxia ~15% (SpO2 em repouso e esforço; O2 ou suspensão se < 88%), fadiga, tontura, náusea. Teratogênico; contracepção não hormonal. VHL: LITESPARK-004 (resposta renal 49%).' },
  belzu_lenva: { cat: 'Inibidores de HIF-2α e mTOR', nome: 'Belzutifano + lenvatinibe (após anti-PD-(L)1)', esquema: 'Belzutifano 120 mg VO 1×/dia + lenvatinibe 20 mg VO 1×/dia (reduções independentes: belzutifano 80 → 40; lenvatinibe 14 → 10 → 8 mg)', duracao: 'Até progressão ou toxicidade', obs: 'LITESPARK-011: PFS 14,6 vs 10,6 meses vs cabozantinibe (HR 0,74), resposta 53%; eventos grau ≥ 3 relacionados 72%: anemia, HAS, hipóxia, proteinúria, diarreia, disfunção cardíaca (ecocardiograma basal). FDA 24/09/2026; sem registro ANVISA da combinação.' },
  tivozanibe: { cat: 'TKI anti-VEGF', nome: 'Tivozanibe', esquema: '1,34 mg VO 1×/dia, 3 semanas sim / 1 semana não (redução 0,89 mg)', duracao: 'Até progressão ou toxicidade', obs: 'TIVO-3 (≥ 3ª linha, vs sorafenibe): PFS 5,6 vs 3,9 meses; HAS, disfonia, fadiga; menos síndrome mão-pé e diarreia. Sem registro ANVISA.' },
  gem_cis: { cat: 'Quimioterapia (histologias raras)', nome: 'Gemcitabina + cisplatina (ducto coletor, medular)', esquema: 'Gemcitabina 1.000 mg/m² IV D1 e D8 + cisplatina 70 mg/m² IV D1 (carboplatina AUC 5 se TFG < 50 ou medular com disfunção renal); ciclo de 21 dias', duracao: '4–6 ciclos; reavaliar a cada 2 ciclos', obs: 'Ducto coletor: considerar cabozantinibe associado ou sequencial (BONSAI). Medular: considerar bortezomibe; sem resposta a TKI. Hidratação, antiemese tripla, audiometria se cisplatina.' },
  /* Suporte */
  zoledronico: { cat: 'Suporte ósseo', nome: 'Ácido zoledrônico', esquema: '4 mg IV em 15 min a cada 4 semanas (a cada 12 semanas é não inferior após 1 ano); ajustar: TFG 50–60 → 3,5 mg; 40–49 → 3,3 mg; 30–39 → 3 mg; < 30 → não usar', duracao: 'Enquanto houver metástase óssea e benefício', obs: 'Cálcio 1.000–1.200 mg + vitamina D 800–1.000 UI/dia; avaliação odontológica antes (osteonecrose 1–3%); febre e mialgia na 1ª dose; creatinina antes de cada dose.' },
  denosumabe: { cat: 'Suporte ósseo', nome: 'Denosumabe', esquema: '120 mg SC a cada 4 semanas', duracao: 'Enquanto houver metástase óssea e benefício', obs: 'Sem ajuste renal (preferido se TFG < 30), mas hipocalcemia grave na DRC: cálcio e vitamina D obrigatórios, dosar cálcio em 2 semanas. Osteonecrose de mandíbula 1–3%; fraturas vertebrais múltiplas após suspensão (considerar bisfosfonato ao parar).' },
  /* Radioterapia */
  sabr: { cat: 'Radioterapia', nome: 'SABR do tumor renal primário', esquema: '26 Gy em fração única (tumor ≤ 4 cm) ou 42 Gy em 3 frações / 40 Gy em 5 frações (> 4 cm); marcadores fiduciais ou controle respiratório', duracao: '1–5 sessões em 1–2 semanas', obs: 'Inapto à cirurgia e à ablação. Controle local > 95% (IROCK); queda de TFG média 5–10 mL/min; náusea, fadiga e dermatite leves; resposta radiológica lenta (massa pode persistir estável por anos).' },
  sbrt_met: { cat: 'Radioterapia', nome: 'SBRT de metástase (oligometastático / oligoprogressão)', esquema: 'Pulmão 30–34 Gy em 1 fração ou 48–60 Gy em 3–5; coluna 24 Gy em 2 ou 27 Gy em 3; adrenal/linfonodo 30–45 Gy em 3–5 frações', duracao: '1–5 sessões por lesão', obs: 'CCR é radiorresistente a fracionamento convencional, mas sensível a doses ablativas: controle local 85–95%. Permite adiar o sistêmico no oligometastático ou mantê-lo na oligoprogressão.' },
  srs: { cat: 'Radioterapia', nome: 'Radiocirurgia cerebral (SRS)', esquema: 'Dose única 15–24 Gy conforme diâmetro (24 Gy ≤ 2 cm; 18 Gy 2–3 cm; 15 Gy 3–4 cm) ou 27 Gy em 3 frações para lesões maiores/próximas a áreas eloquentes', duracao: '1–3 sessões', obs: 'Preferida à radioterapia de crânio total (preserva cognição); controle local ~90%. Corticoide na menor dose possível (reduz eficácia da IO); RM de crânio a cada 3 meses no 1º ano.' },
  rt_osso: { cat: 'Radioterapia', nome: 'Radioterapia paliativa óssea', esquema: '8 Gy em fração única (dor sem fratura iminente) ou 20 Gy em 5 / 30 Gy em 10 frações; SBRT 24 Gy em 2 frações na coluna sem compressão', duracao: '1–10 sessões', obs: 'Alívio da dor em 60–80%; retratamento possível. Compressão medular: cirurgia descompressiva + RT se candidato, ou RT 20 Gy em 5 frações em até 24 h.' },
};
const KOPT_DOSES = {
  'RN-LOC-07': ['sabr'], 'RN-LOC-17': ['sabr'], 'RN-LOC-22': ['sabr'],
  'RN-ADJ-01': ['pembro_adj'], 'RN-ADJ-02': ['belzu_adj'],
  'RN-SUP-01': ['srs'], 'RN-SUP-02': ['zoledronico', 'denosumabe', 'rt_osso'],
  'RN-MET-05': ['sbrt_met'], 'RN-MET-07': ['pembro_adj'],
  'RN-MET-08': ['cabo_mono', 'lenva_eve', 'axitinibe', 'sunitinibe'],
  'RN-MET-11': ['ipi_nivo'], 'RN-MET-12': ['pembro_axi'], 'RN-MET-13': ['pembro_lenva'], 'RN-MET-14': ['nivo_cabo'],
  'RN-MET-16': ['sunitinibe', 'pazopanibe'], 'RN-MET-21': ['cabo_mono'], 'RN-MET-22': ['sunitinibe', 'pazopanibe'],
  'RN-NCC-01': ['cabo_mono'], 'RN-NCC-02': ['pembro_lenva', 'nivo_cabo'], 'RN-NCC-04': ['sunitinibe', 'pembro_lenva', 'lenva_eve'],
  'RN-NCC-06': ['pembro_lenva', 'nivo_cabo'], 'RN-NCC-07': ['gem_cis', 'cabo_mono'], 'RN-NCC-08': ['gem_cis'],
  'RN-NCC-09': ['pembro_lenva', 'nivo_cabo', 'ipi_nivo', 'sunitinibe'], 'RN-NCC-11': ['ipi_nivo'],
  'RN-SEQ-00': ['cabo_mono', 'lenva_eve', 'sunitinibe'], 'RN-SEQ-01': ['belzu_lenva'], 'RN-SEQ-02': ['cabo_mono'], 'RN-SEQ-03': ['lenva_eve'],
  'RN-SEQ-04': ['axitinibe'], 'RN-SEQ-05': ['tivozanibe'], 'RN-SEQ-06': ['belzu_mono'], 'RN-SEQ-07': ['lenva_eve'], 'RN-SEQ-08': ['everolimo'],
  'RN-SEQ-10': ['nivolumabe'], 'RN-SEQ-11': ['cabo_mono'], 'RN-SEQ-12': ['lenva_eve'], 'RN-SEQ-13': ['axitinibe'], 'RN-SEQ-14': ['belzu_mono', 'lenva_eve'],
};
const KDOSE_CATS = ['Imunoterapia e combinações', 'Adjuvância', 'TKI anti-VEGF', 'Inibidores de HIF-2α e mTOR', 'Quimioterapia (histologias raras)', 'Suporte ósseo', 'Radioterapia'];

/* Guia cirúrgico – rim. Texto a revisar por cirurgião antes do uso assistencial. */
const KSURG = {
  parcial: {
    nome: 'Nefrectomia parcial robótica (transperitoneal)',
    resumo: 'Padrão para cT1 e para T2 selecionado em rim único/DRC; remove o tumor com margem mínima de parênquima sadio e reconstrói o rim. 120–240 min; sangramento 100–300 mL; internação 1–3 dias; isquemia quente ideal ≤ 20–25 min; trifecta (margem negativa, isquemia ≤ 25 min, sem complicação maior) em 70–85%.',
    indicacoes: ['Todo tumor cT1 (≤ 7 cm) tecnicamente ressecável, independentemente da função do rim contralateral (EAU forte).', 'T2 em rim único, DRC, tumores bilaterais ou síndromes hereditárias, quando factível (EAU fraca).', 'Lesões císticas Bosniak III–IV, oncocitoma ou angiomiolipoma sintomático com indicação cirúrgica.', 'Imperativa: rim único anatômico ou funcional, insuficiência renal, doença contralateral.'],
    contraindicacoes: ['Tumor que envolve o hilo de forma a impedir reconstrução com margem; trombo venoso; invasão de gordura extensa ou linfonodos (preferir radical).', 'Coagulopatia não corrigida; incapacidade de tolerar pneumoperitônio (relativa: retroperitoneal ou aberta).', 'Expectativa de vida curta ou fragilidade em tumor pequeno (preferir vigilância).'],
    preparo: ['TC multifásica (arterial, nefrográfica, excretora) com reconstrução 3D: número e trajeto das artérias segmentares, relação com o sistema coletor, escore RENAL/PADUA.', 'TFG, proteinúria, hemograma, coagulograma, tipagem; suspender antiagregantes/anticoagulantes conforme risco; estatinas e IECA podem ser mantidos.', 'Antibiótico profilático (cefazolina 2 g) na indução; profilaxia de TEV (compressão pneumática ± heparina de baixo peso após 12–24 h).', 'Consentimento específico: possibilidade de conversão para radical (2–5%), reoperação por sangramento, fístula urinária, perda de função renal.'],
    anestesia: ['Anestesia geral com relaxamento completo; cateter vesical; acesso venoso calibroso; evitar hiperidratação antes do clampeamento e dar manitol 12,5 g ou furosemida antes do desclampeamento (uso tradicional, benefício não comprovado).', 'Manter PAM > 65 mmHg durante a isquemia; evitar hipotermia.'],
    instrumental: ['Plataforma robótica com 3–4 braços; tesoura monopolar, pinça bipolar fenestrada, porta-agulhas × 2, ProGrasp; clipes Hem-o-lok (L e XL), bulldogs laparoscópicos (ou robóticos), clipes de 10 mm para desvascularização segmentar.', 'Ultrassom intraoperatório (drop-in) para delimitar tumores endofíticos; fluorescência com verde de indocianina para clampeamento seletivo (opcional).', 'Fios: V-Loc 3-0 ou poliglactina 3-0 para camada interna; V-Loc 2-0 ou poliglactina 0 para renorrafia externa com Hem-o-lok deslizantes (técnica sliding-clip); Surgicel/Floseal para hemostasia adjuvante.'],
    decisoes: ['Via transperitoneal (mais espaço, tumores anteriores/laterais) ou retroperitoneal (tumores posteriores, cirurgia abdominal prévia, obesidade): mesma segurança oncológica.', 'Clampeamento: artéria principal (padrão), seletivo/superseletivo de ramo segmentar (tumores polares; menor perda funcional) ou off-clamp em exofíticos pequenos; a EAU recomenda não tentar off-clamp sem indicação.', 'Enucleação (plano da pseudocápsula) ou ressecção com margem fina: margem positiva em ambas ~2–5%; enucleação preserva mais parênquima e tem controle equivalente em tumores de baixo grau.', 'Converter para radical quando: margem comprometida irrecuperável, sangramento incontrolável, isquemia > 40 min sem reconstrução viável, invasão do hilo.'],
    passos: [
      { t: 'Posicionamento e acessos', d: 'Decúbito lateral 60–70° com flexão leve da mesa; coxins em axila, joelhos e tornozelos. Pneumoperitônio por Veress ou Hasson (12–15 mmHg). Trocartes: câmera 8 mm pararretal supraumbilical; braços 8 mm no epigástrio e fossa ilíaca em linha com o rebordo, 8–10 cm entre si; 4º braço opcional; assistente 12 mm medial. À direita, 5 mm subxifoide para afastar o fígado.', dica: 'Alinhar os trocartes paralelos ao rebordo costal, apontando para o hilo.', cuidado: 'Veress em cirurgia abdominal prévia: preferir Hasson ou trocarte óptico.' },
      { t: 'Mobilização do cólon e exposição do rim', d: 'Incisar a linha de Toldt do ângulo hepático/esplênico até os vasos ilíacos; rebater o cólon medialmente preservando a fáscia de Gerota anterior. À esquerda, liberar o ligamento esplenorrenal e mobilizar baço e pâncreas em bloco; à direita, manobra de Kocher para expor a veia cava se necessário.', dica: 'Manter o plano entre a fáscia de Gerota e o mesocólon (avascular); a gordura perirrenal fica com o rim.', cuidado: 'Lesão pancreática ou esplênica à esquerda; duodeno à direita.' },
      { t: 'Identificação do ureter e gonadal, e dissecção do hilo', d: 'Localizar o ureter e a veia gonadal sobre o psoas, elevá-los e seguir cranialmente até o hilo. Dissecar a veia renal (e tributárias: gonadal, lombar, adrenal à esquerda) e a artéria renal posterior à veia; isolar com laços vasculares. Identificar artérias segmentares ou polares acessórias previstas na TC.', dica: 'A artéria é mais fácil de isolar pela face posterior do hilo, elevando o rim.', cuidado: 'Veia lombar posterior à veia renal esquerda: ligar antes de tracionar o hilo.' },
      { t: 'Desgorduramento e delimitação do tumor', d: 'Abrir a Gerota e remover a gordura sobre o tumor e ao redor (margem de 1–2 cm de parênquima exposto), preservando a gordura sobre o tumor para envio em bloco. Ultrassom intraoperatório para marcar os limites, profundidade e relação com cálices; marcar a linha de ressecção com monopolar a 0,5 cm da borda.', dica: 'Mobilizar o rim o suficiente para trazer o tumor ao centro do campo.', cuidado: 'Não violar a pseudocápsula ao desgordurar (risco de margem).' },
      { t: 'Clampeamento', d: 'Administrar manitol (opcional); clampear a artéria principal com bulldog (ou ramo segmentar, confirmando a área isquêmica com verde de indocianina); em tumores centrais/hilares clampear também a veia para reduzir sangramento retrógrado. Iniciar o cronômetro de isquemia.', dica: 'Clampeamento arterial isolado é suficiente na maioria; a veia só quando há sangramento venoso significativo.', cuidado: 'Bulldog mal posicionado em artéria calcificada: sangramento pulsátil ao incisar → verificar antes de cortar.' },
      { t: 'Ressecção do tumor', d: 'Incisar o parênquima com tesoura fria (ou monopolar baixo) ao longo da marca, seguindo a pseudocápsula (enucleação) ou com margem fina de 2–5 mm; o assistente aspira e expõe. Em tumores endofíticos, repetir o ultrassom; identificar e cortar nitidamente o sistema coletor quando aberto. Colocar o espécime em bolsa imediatamente.', dica: 'Tração suave do tumor com a 4ª pinça, cortando sempre no plano visível; sangramento difuso é controlado pelo clampeamento, não pela coagulação.', cuidado: 'Evitar fragmentar o tumor; se a pseudocápsula for violada, ampliar a margem no leito.' },
      { t: 'Renorrafia interna (leito)', d: 'Sutura contínua do leito com V-Loc 3-0 ou poliglactina 3-0: fechar o sistema coletor aberto e ligar vasos segmentares visíveis com pontos em X; passar em ambas as bordas da base para hemostasia. Testar vazamento do coletor com azul de metileno pelo cateter ureteral é opcional.', dica: 'Agulha de 17 mm facilita em leitos profundos; fio farpado evita afrouxamento.', cuidado: 'Não pegar grandes vasos interlobares no ponto (infarto segmentar).' },
      { t: 'Renorrafia externa (sliding-clip) e desclampeamento', d: 'Pontos em U ou contínuo com V-Loc 2-0 / poliglactina 0 atravessando a cápsula e o parênquima a 1 cm da borda, fixados com Hem-o-lok deslizantes e travados com clipe secundário; aproximar sem estrangular. Opcional: Surgicel enrolado no leito antes de apertar. Desclampear (desclampeamento precoce após a camada interna reduz isquemia); verificar hemostasia a 5 mmHg de pneumoperitônio e ajustar os clipes.', dica: 'Apertar os clipes progressivamente até parar o sangramento, não mais que isso: isquemia por sutura reduz função.', cuidado: 'Sangramento arterial pulsátil após desclampear: ponto adicional em X no leito; se incontrolável, reclampar.' },
      { t: 'Revisão, Gerota e drenagem', d: 'Hemostasia da gordura e do hilo; colocar selante de fibrina se desejado; reaproximar a fáscia de Gerota sobre a renorrafia; fixar o rim se mobilizado amplamente (evitar torção do pedículo). Dreno aspirativo opcional (tumores centrais, abertura do coletor); retirar o espécime em bolsa pela incisão do trocarte ampliada; fechar aponeurose dos trocartes ≥ 10 mm.', dica: 'Reposicionar o cólon e verificar o baço antes de desinsuflar.', cuidado: 'Dreno com débito alto de líquido claro: dosar creatinina do dreno (fístula urinária).' },
    ],
    posop: ['Deambulação e dieta no dia 0–1; analgesia multimodal; sonda vesical retirada no dia 1; dreno retirado com débito < 100 mL/24 h e sem fístula.', 'Hemograma e creatinina no dia 1; manter PA controlada (hipertensão aumenta sangramento tardio); evitar esforço por 3–4 semanas.', 'Sangramento tardio (pseudoaneurisma/fístula AV, 1–2%, dias 7–14): hematúria maciça ou dor → angio-TC e embolização seletiva.', 'TC ou RM com contraste em 3–6 meses como base para seguimento; imagem anual depois conforme risco; TFG e proteinúria anuais.'],
    complicacoes: ['Sangramento com transfusão 3–8%; pseudoaneurisma 1–2% (embolização); fístula urinária 1–4% (cateter duplo J + sonda); conversão para radical 2–5%; margem positiva 2–8% (seguimento, sem reoperação); lesão de baço/cólon/pleura < 1%; perda de função do rim operado 10–20% em média (mais com isquemia > 25–30 min).', 'Complicação Clavien ≥ 3 em 5–10%; mortalidade < 0,5%.'],
    resultados: ['Sobrevida câncer-específica 95–98% em T1a e 90–95% em T1b, igual à radical; recidiva local 1–3%.', 'TFG preservada melhor que radical (queda média 10% vs 30%); menor incidência de DRC estágio 3b+ e de eventos cardiovasculares em estudos observacionais.'],
    esquemas: ['clampeamento'],
    videos: [],
  },
  nefrectomia_lap: {
    nome: 'Nefrectomia radical laparoscópica/robótica',
    resumo: 'Remoção do rim com a gordura perirrenal dentro da Gerota, sem adrenalectomia ou linfadenectomia de rotina. Indicada em T2 e T1 não passível de parcial, e em T3a sem trombo em centros experientes. 90–180 min; sangramento < 200 mL; internação 1–3 dias.',
    indicacoes: ['cT2 (> 7 cm) não passível de parcial (EAU forte); cT1 quando a parcial é inviável (hilar complexo, múltiplos tumores).', 'cT3a com invasão de gordura ou veia renal sem trombo de cava, em mãos experientes.', 'Rim não funcionante com tumor; tumor com hemorragia incontrolável.'],
    contraindicacoes: ['Trombo de veia cava (preferir aberta ou robótica em centro de referência); tumor > 12–15 cm com aderências ou invasão de órgãos (T4); linfadenopatia volumosa.', 'Não fazer minimamente invasiva quando compromete oncologia, função ou segurança (EAU forte); não fazer radical minimamente invasiva em T1 com parcial factível (EAU forte).'],
    preparo: ['TC multifásica com avaliação da veia renal e cava (trombo), artérias acessórias, adrenal e linfonodos; TC de tórax.', 'TFG e cintilografia renal (DMSA/DTPA) se dúvida sobre a função do contralateral; aconselhar sobre DRC pós-operatória (TFG cai ~30%).', 'Reserva de sangue; profilaxia de TEV; antibiótico na indução.'],
    anestesia: ['Geral com relaxamento; acesso calibroso; cateter vesical; sonda nasogástrica durante a cirurgia.'],
    instrumental: ['Laparoscopia: ótica 30°, 4–5 trocartes (12 mm × 2, 5 mm × 2–3), grampeador vascular linear 45 mm (cargas brancas/vasculares) ou Hem-o-lok XL, selador bipolar (LigaSure) ou ultrassônico, afastador hepático, bolsa de extração grande (15 mm).', 'Robótica: mesmos passos; clipes e grampeador pelo assistente.'],
    decisoes: ['Transperitoneal (padrão) vs retroperitoneal (rins posteriores, cirurgia abdominal prévia; menos espaço).', 'Adrenalectomia só se adrenal anormal na imagem ou tumor de polo superior com suspeita de invasão (EAU forte contra a rotina).', 'Linfadenectomia: só linfonodos aumentados; estendida não melhora sobrevida (EAU fraca).', 'Controle vascular: artéria primeiro, depois a veia; grampeador na veia renal (margem de 1 cm da cava); se trombo na veia renal, grampear proximal ao trombo após confirmar com ultrassom.', 'Extração: incisão de Pfannenstiel ou ampliação do trocarte; sem morcelamento.'],
    passos: [
      { t: 'Posicionamento e trocartes', d: 'Decúbito lateral 60–90°; trocarte de câmera pararretal, dois trocartes de trabalho em triângulo apontando para o hilo, um de assistência (afastador hepático à direita; afastamento esplênico à esquerda).', dica: 'Trocartes mais mediais em tumores grandes (o rim empurra o cólon).', cuidado: 'Tumores > 10 cm: espaço limitado; considerar mão-assistida.' },
      { t: 'Mobilização colônica', d: 'Incisão da linha de Toldt do rebordo até os ilíacos; rebater o cólon medialmente; à esquerda, liberar ligamentos esplenorrenal e frenocólico e deixar baço e pâncreas caírem medialmente; à direita, Kocher do duodeno para expor a cava.', dica: 'Preservar a Gerota posterior e lateral até o controle do hilo (evita sangramento de tumores grandes).', cuidado: 'Veias mesentéricas em tração excessiva do mesocólon.' },
      { t: 'Ureter e gonadal', d: 'Identificar o ureter e a veia gonadal na borda inferior; elevar o pacote ureterogonadal e dissecar cranialmente sobre o psoas até o hilo; à esquerda a gonadal drena na veia renal (clipar); à direita a gonadal drena na cava (preservar ou clipar).', dica: 'Elevar o polo inferior do rim pelo pacote ureteral traz o hilo em tensão.', cuidado: 'Não confundir a gonadal com o ureter; não seccionar o ureter antes de ter o hilo controlado (perde a alavanca).' },
      { t: 'Hilo: artéria', d: 'Dissecar a veia renal e identificar a artéria posterior/superior a ela; isolar circunferencialmente 1,5–2 cm; clipar com 2–3 Hem-o-lok proximais e 1 distal, ou grampear; artérias acessórias (20–30%) são ligadas separadamente.', dica: 'Pulsação visível guia a dissecção; à esquerda, ligar a veia lombar e a adrenal antes de rodar a veia renal.', cuidado: 'Ligar a veia antes da artéria causa congestão e sangramento; artéria calcificada: grampeador em vez de clipe.' },
      { t: 'Hilo: veia', d: 'Após a artéria, a veia esvazia e colapsa; grampear com carga vascular deixando coto de 0,5–1 cm da cava (à direita, veia curta: cuidado com a cava). Em trombo de veia renal, palpar/ultrassom e grampear proximal ao trombo (milking do trombo para o rim se necessário).', dica: 'Verificar que nenhum clipe está na linha do grampeador (falha de grampeamento).', cuidado: 'Sangramento da cava: compressão com gaze, aumentar pneumoperitônio, sutura 4-0 ou conversão.' },
      { t: 'Polo superior e adrenal', d: 'Dissecar o polo superior entre o rim (com Gerota) e a adrenal, selando pequenos vasos; adrenalectomia em bloco apenas se indicada (ligar a veia adrenal: na veia renal à esquerda; na cava à direita).', dica: 'Plano entre a gordura perirrenal e a adrenal é identificável pelo tom amarelo mais claro da adrenal.', cuidado: 'Lesão do diafragma/pleura em dissecção alta.' },
      { t: 'Liberação posterior e lateral; ureter', d: 'Completar a mobilização lateral e posterior do rim com a Gerota; clipar e seccionar o ureter distalmente (acima dos ilíacos; mais baixo se tumor de pelve); inspecionar o leito.', dica: 'Trabalhar de medial para lateral mantendo tração no rim.', cuidado: 'Lesão de psoas/nervo genitofemoral ao dissecar posteriormente.' },
      { t: 'Extração e fechamento', d: 'Colocar o espécime em bolsa resistente; extrair por Pfannenstiel (melhor cosmética e menos hérnia) ou ampliação do trocarte periumbilical; revisar hemostasia a 5 mmHg; fechar aponeuroses ≥ 10 mm; dreno raramente necessário.', dica: 'Orientar o espécime para o patologista (fio no polo superior).', cuidado: 'Não morcelar: perde estadiamento e dissemina.' },
    ],
    posop: ['Dieta e deambulação no dia 0–1; sonda retirada no dia 1; alta em 1–3 dias.', 'Creatinina no dia 1 e em 4–6 semanas (nova linha de base); PA; encaminhar à nefrologia se TFG < 45.', 'Patologia define Leibovich/KEYNOTE-564 e adjuvância (fluxo pós-nefrectomia).'],
    complicacoes: ['Sangramento/transfusão 2–5%; lesão de órgãos adjacentes (baço, pâncreas, cólon, duodeno, pleura) 1–2%; conversão 2–5%; íleo prolongado; hérnia incisional 1–3%; DRC de novo 20–30%.', 'Mortalidade 0,5–1%.'],
    resultados: ['Sobrevida câncer-específica 5 anos: T1 90–97%, T2 75–90%, T3a 60–75%.', 'Equivalente à aberta em controle oncológico, com menos dor, sangramento e internação.'],
    esquemas: [],
    videos: [],
  },
  nefrectomia_aberta: {
    nome: 'Nefrectomia radical aberta com trombectomia de veia cava',
    resumo: 'Cirurgia de grande porte para tumor com trombo venoso (T3b–c) ou localmente avançado (T4, tumores volumosos). O nível do trombo (Mayo 0–IV) define acesso, controle vascular e equipe (hepatobiliar, cardiovascular). Cura em 40–65% dos pacientes sem metástase; mortalidade 2–10% conforme o nível.',
    indicacoes: ['Trombo de veia renal/cava com doença M0 (EAU forte): nefrectomia + trombectomia.', 'T4 ressecável em bloco; tumores > 12–15 cm com aderências; linfadenopatia volumosa.', 'Paciente M1 selecionado (bom performance, IMDC não desfavorável, trombo sintomático) após discussão multidisciplinar.'],
    contraindicacoes: ['IMDC desfavorável com metástases (não fazer citorredutora); invasão de parede da cava extensa com circulação colateral exuberante pode exigir ressecção/reconstrução da cava — avaliar viabilidade.', 'Comorbidade cardiopulmonar proibitiva para bypass ou clampeamento supra-hepático.'],
    preparo: ['RM ou TC multifásica com reconstrução até 2 semanas antes: nível do trombo (Mayo), invasão de parede (perda do plano, realce do trombo, diâmetro da cava > 24 mm sugere), oclusão completa, trombo blando (não tumoral) infrarrenal, colaterais.', 'Ecocardiograma (transesofágico intraoperatório no nível III–IV); avaliação cardiológica; reserva de 4–6 concentrados de hemácias, plasma e plaquetas; cell saver é controverso (contaminação tumoral).', 'Equipe: hepatobiliar (Mayo III, manobra de Pringle, mobilização hepática), cirurgia cardiovascular/perfusão (Mayo IV, circulação extracorpórea ± parada circulatória hipotérmica ou bypass venovenoso).', 'Embolização pré-operatória da artéria renal não é recomendada de rotina (sem benefício, mais dor e síndrome pós-embolização); anticoagulação se trombo blando infrarrenal.', 'Filtro de cava supra-renal não é rotina.'],
    anestesia: ['Geral com monitorização invasiva (PA invasiva, PVC/cateter de artéria pulmonar ou ETE no nível III–IV), 2 acessos calibrosos acima do diafragma (o clampeamento da cava reduz o retorno), aquecimento ativo, protocolo de transfusão maciça disponível.', 'Antecipar hipotensão ao clampear a cava supra-hepática: volume e vasopressor; comunicar cada clampeamento.'],
    instrumental: ['Afastador fixo (Omni/Bookwalter); clamps vasculares (Satinsky, Rummel, bulldogs), laços vasculares, fios de polipropileno 4-0/5-0 para a cava, patch de pericárdio bovino ou PTFE para reconstrução, grampeadores vasculares.', 'Ultrassom intraoperatório para confirmar o limite proximal do trombo antes do clampeamento.'],
    decisoes: ['Incisão: subcostal bilateral (Chevron) ou Makuuchi para nível I–III; toracoabdominal ou esternotomia associada para nível IV.', 'Nível 0–I: clampeamento lateral da cava (Satinsky) após ligadura da artéria renal; abertura ao redor do óstio da veia renal.', 'Nível II: controle da cava infrarrenal, suprarrenal (infra-hepática) e veia renal contralateral; lombares ligadas; cavotomia e extração; fechar com 4-0 contínuo.', 'Nível III: mobilização hepática (ligamentos triangular e coronário), ligadura das veias hepáticas curtas, Pringle (≤ 20–30 min), clampeamento supra-hepático infradiafragmático; considerar bypass venovenoso.', 'Nível IV: circulação extracorpórea com parada circulatória hipotérmica (trombo atrial fixo) ou abordagem transdiafragmática com clampeamento intrapericárdico e ETE se trombo móvel sem invasão atrial.', 'Invasão de parede: ressecção parcial com fechamento primário (se estenose < 50%) ou patch; ressecção segmentar com interposição de PTFE anelado ou ligadura (se oclusão crônica com colaterais) em casos selecionados.'],
    passos: [
      { t: 'Incisão e exposição', d: 'Chevron ou Makuuchi; afastador fixo; manobra de Kocher ampla e mobilização do cólon direito e do duodeno (manobra de Cattell–Braasch) para expor cava, veias renais, aorta e, se necessário, o fígado.', dica: 'Expor a cava desde a bifurcação até o diafragma antes de tocar o tumor.', cuidado: 'Colaterais lombares e gonadais dilatadas sangram facilmente.' },
      { t: 'Controle arterial precoce', d: 'Identificar e ligar a artéria renal (à direita, entre cava e aorta por via interaortocava; à esquerda, após mobilização do mesocólon) antes de manipular a veia, reduzindo o fluxo venoso e às vezes o tamanho do trombo.', dica: 'Ligadura dupla + sutura-ligadura.', cuidado: 'Artérias acessórias polares previstas na TC.' },
      { t: 'Controle venoso', d: 'Laços na cava infrarrenal, na veia renal contralateral e na cava suprarrenal acima do trombo (confirmado por ultrassom/ETE); ligar veias lombares no segmento a ser aberto; nos níveis III–IV, mobilizar o fígado, ligar hepáticas curtas e preparar Pringle/clampeamento supra-hepático.', dica: 'Sequência de clampeamento: cava infrarrenal → veia renal contralateral → cava suprarrenal (reduz embolia).', cuidado: 'Hipotensão ao clampear a cava alta: avisar a anestesia; se instável, bypass venovenoso.' },
      { t: 'Cavotomia e extração do trombo', d: 'Incisar a cava ao redor do óstio da veia renal, estendendo cranialmente conforme necessário; extrair o trombo em bloco com o rim, dissecando-o da parede com espátula; inspecionar e irrigar a luz; ressecar parede aderida/invadida com margem.', dica: 'Trombo flutuante livre sai inteiro com tração suave; fixo exige ressecção de parede.', cuidado: 'Fragmentos de trombo → embolia pulmonar: nunca manipular o trombo sem o controle proximal.' },
      { t: 'Reconstrução da cava', d: 'Fechar a cavotomia com polipropileno 4-0 contínuo (duas linhas), com descompressão de ar antes do último ponto (desclampear a veia renal contralateral/infrarrenal para preencher); patch se o fechamento estreitar > 50%; interposição ou ligadura em ressecção segmentar com colaterais.', dica: 'Heparina sistêmica (5.000 UI) antes do clampeamento prolongado, se sem sangramento ativo.', cuidado: 'Estenose da cava → trombose e edema de membros inferiores; anticoagular no pós-operatório se reconstrução extensa.' },
      { t: 'Nefrectomia e revisão', d: 'Completar a nefrectomia radical com Gerota (adrenalectomia se envolvida; linfonodos aumentados), hemostasia do leito, revisão do fígado e diafragma; drenos; fechamento por planos.', dica: 'Marcar o espécime e o trombo para o patologista (invasão de parede muda pT3c).', cuidado: 'Coagulopatia dilucional após transfusão maciça: corrigir ativamente.' },
    ],
    posop: ['UTI 1–3 dias; vigiar sangramento, função renal (lesão renal aguda em 20–30%), função hepática (após Pringle), TEV e embolia pulmonar; anticoagulação profilática precoce (24 h) e plena se reconstrução protética ou trombo blando residual.', 'Dieta progressiva; íleo é frequente (3–5 dias); analgesia peridural ou bloqueios.', 'Patologia: pT3b/c é critério KEYNOTE-564 → pembrolizumabe adjuvante (± belzutifano) em 12–16 semanas após TC sem doença.'],
    complicacoes: ['Mortalidade perioperatória: nível 0–I 1–3%, II 3–5%, III 5–8%, IV 8–12%. Transfusão 50–80%; embolia pulmonar intraoperatória 1–3% (fatal em metade); lesão hepática/biliar; quilotórax; insuficiência renal aguda; síndrome compartimental abdominal; infecção de ferida.', 'Complicação Clavien ≥ 3 em 25–40% nos níveis III–IV.'],
    resultados: ['Sobrevida câncer-específica 5 anos em M0: nível 0–I 60–70%, II–III 45–60%, IV 30–45%; invasão de parede da cava e linfonodos positivos pioram muito o prognóstico.', 'Em M1, mediana de sobrevida 12–24 meses; benefício só em selecionados.'],
    esquemas: ['niveis_trombo'],
    videos: [],
  },
  ablacao: {
    nome: 'Ablação percutânea (crioablação, radiofrequência, micro-ondas)',
    resumo: 'Destruição térmica do tumor guiada por TC ou US sob sedação/anestesia, para massas ≤ 3 cm (crio até 4 cm) em pacientes inaptos à cirurgia, com rim único, múltiplos tumores ou preferência. Biópsia antes. Recidiva local 5–10%, re-ablável; função renal preservada.',
    indicacoes: ['cT1a ≤ 3 cm em paciente inapto, idoso ou com comorbidade; rim único ou DRC; tumores múltiplos/hereditários (VHL, BHD) para preservar néfrons; recidiva pequena após parcial.', 'Preferência do paciente após discussão da evidência limitada (EAU forte sobre informar).'],
    contraindicacoes: ['Tumor > 4 cm (crio) ou > 3 cm (RF/micro-ondas) de rotina (EAU fraca contra); tumor central junto ao hilo ou à pelve renal (estenose ureteral, hemorragia); lesão cística Bosniak IV volumosa.', 'Coagulopatia não corrigida (INR > 1,5, plaquetas < 50.000); infecção ativa; impossibilidade de janela segura mesmo com hidrodissecção.'],
    preparo: ['Biópsia percutânea prévia (não concomitante) com histologia confirmada — EAU forte; 20–30% das massas pequenas são benignas.', 'TC multifásica para planejamento: trajeto, relação com cólon, ureter, pleura e vasos; cistoscopia e cateter ureteral para pieloperfusão fria/morna em tumores próximos do sistema coletor.', 'Suspensão de anticoagulantes; antibiótico profilático; jejum.'],
    anestesia: ['Sedação consciente ou anestesia geral (preferida em crio com múltiplas sondas, posição prona prolongada e apneia controlada para guiar a punção).'],
    instrumental: ['Crioablação: sondas de argônio/hélio 17 G (1–4 por tumor, 1–1,5 cm entre si), cobrindo a bola de gelo com margem de 5–10 mm além do tumor; monitorização por TC da bola de gelo.', 'Radiofrequência: eletrodo expansível ou refrigerado, 1–2 ciclos de 8–12 min por posição, alvo de 60–100 °C; micro-ondas: antena 14–17 G, 5–10 min a 60–100 W, menos efeito heat-sink.', 'Hidrodissecção com soro glicosado 5% ou CO2 para afastar cólon/ureter; termopares; material para embolização de emergência disponível.'],
    decisoes: ['Crioablação: visualização direta da zona de ablação, menos dor, melhor para tumores ≥ 3 cm e centrais; mais sangramento. Radiofrequência: barata, rápida, melhor em exofíticos ≤ 3 cm; heat-sink junto a vasos. Micro-ondas: mais rápida e menos heat-sink; menos dados de longo prazo.', 'Margem de ablação 5–10 mm além do tumor; tumores próximos ao coletor: pieloperfusão; próximos ao cólon: hidrodissecção/reposicionamento.', 'Falha técnica (realce residual na 1ª imagem) → repetir ablação; recidiva local tardia → repetir ou cirurgia.'],
    passos: [
      { t: 'Posicionamento e planejamento', d: 'Decúbito prono ou lateral conforme o tumor; TC de planejamento sem/com contraste; escolha do trajeto evitando pleura (abaixo da 12ª costela), cólon e vasos; marcação cutânea.', dica: 'Apneia expiratória padronizada em cada aquisição reduz erro de posicionamento.', cuidado: 'Trajeto intercostal alto → pneumotórax.' },
      { t: 'Proteção de estruturas', d: 'Hidrodissecção (200–1.000 mL de glicosado 5% com contraste diluído) entre o rim e o cólon/duodeno/baço; cateter ureteral com perfusão para proteger o coletor em tumores centrais; termopar na borda de estruturas em risco.', dica: 'Reavaliar a posição do líquido a cada aquisição; ele se dispersa.', cuidado: 'Soro fisiológico conduz corrente em RF: usar glicosado.' },
      { t: 'Posicionamento das sondas', d: 'Inserir a(s) sonda(s) sob TC/US em passos, confirmando a ponta no plano axial e coronal; distribuir para cobrir o tumor e a margem (crio: regra do 1 cm de espaçamento; RF: centro do tumor).', dica: 'Primeira sonda através do centro do tumor; as demais em volta.', cuidado: 'Atravessar o tumor e sair do parênquima aumenta sangramento.' },
      { t: 'Ablação', d: 'Crio: 2 ciclos de congelamento (10 min) com descongelamento ativo/passivo (5–8 min) entre eles; monitorar a bola de gelo cobrindo o tumor + 5–10 mm. RF/micro-ondas: ciclos até impedância/temperatura alvo, reposicionando se necessário; ablação do trajeto ao retirar (RF/MO).', dica: 'Bola de gelo hipodensa é visível na TC: o limite letal fica ~3–5 mm dentro da borda visível, daí a margem.', cuidado: 'Bola de gelo tocando o cólon ou ureter → interromper e reposicionar/hidrodissecar.' },
      { t: 'Controle imediato e retirada', d: 'TC com contraste ao fim (ou em 24 h) para verificar ausência de realce e hematoma; retirar sondas com ablação do trajeto (térmicas) ou após descongelamento completo (crio); curativo compressivo.', dica: 'Hematoma perirrenal pequeno é esperado em crio; só intervir se instabilidade.', cuidado: 'Sangramento ativo no controle → angiografia/embolização.' },
    ],
    posop: ['Observação 6–24 h; analgesia; hematúria leve é comum em tumores centrais; alta no mesmo dia ou dia seguinte.', 'TC ou RM com contraste em 1–3 meses (base), 6 e 12 meses, depois anual por 5 anos; recidiva = realce nodular ou crescimento da zona de ablação; a zona involui lentamente (crio) ou permanece estável (RF).', 'Creatinina em 1 mês: perda de função mínima (< 5%).'],
    complicacoes: ['Hemorragia com transfusão 1–3% (mais na crio); lesão de cólon/duodeno 0,5–1% (fístula, exige cirurgia); estenose ureteral 1–2% em tumores centrais; pneumotórax 1–2%; neuropatia intercostal/dor crônica 2–5%; síndrome pós-ablação (febre, mal-estar) 10–20%; disseminação pelo trajeto < 0,1%.', 'Complicação maior 3–6%; mortalidade < 0,1%.'],
    resultados: ['Controle local após um procedimento 85–95% (≤ 3 cm); após repetição 95–98%; sobrevida câncer-específica 5 anos 95–98% em T1a; metástase 1–2%.', 'Em tumores > 3–4 cm a recidiva local sobe para 10–20%; a evidência comparativa com parcial é observacional (EAU: informar o paciente).'],
    esquemas: [],
    videos: [],
  },
  citorredutora: {
    nome: 'Nefrectomia citorredutora e metastasectomia',
    resumo: 'Remoção do rim primário em doença metastática, imediata (bom performance, oligometastático ou sem necessidade de sistêmico imediato) ou diferida após resposta à terapia sistêmica (IMDC intermediário). Metastasectomia completa em oligometastático selecionado pode dar sobrevida longa sem terapia sistêmica. Técnica = nefrectomia radical, com mais aderências, neovascularização e sangramento.',
    indicacoes: ['IMDC favorável/intermediário com bom performance (ECOG 0–1) sem necessidade imediata de sistêmico, ou oligometastático em que o tratamento local completo é viável (EAU fraca).', 'Diferida: IMDC intermediário após resposta ou estabilidade com terapia sistêmica (SURTIME; prática atual com IO).', 'Paliativa: hematúria incontrolável, dor, síndrome paraneoplásica refratária (alternativa: embolização).', 'Metastasectomia: lesões ressecáveis em pulmão, adrenal, pâncreas, tireoide, osso ou partes moles, intervalo livre > 12 meses, número limitado, ressecção completa possível; confirmar com imagem axial recente (EAU fraca).'],
    contraindicacoes: ['IMDC desfavorável (EAU forte contra); ECOG ≥ 2; metástases cerebrais não tratadas; invasão de órgãos vizinhos irressecável; sarcomatoide extenso com progressão rápida.', 'Progressão sob terapia sistêmica (nefrectomia diferida não indicada).'],
    preparo: ['Reestadiamento completo (TC tórax/abdome/pelve, crânio) nas 4 semanas anteriores; IMDC; discussão multidisciplinar.', 'Suspender TKI 1–2 semanas antes (cicatrização, sangramento) e retomar 2–4 semanas depois; imunoterapia pode ser mantida até a cirurgia (sem impacto em cicatrização), avaliando cortisol se suspeita de insuficiência adrenal imunomediada.', 'Reserva de sangue; profilaxia de TEV; nutrição; embolização pré-operatória só em tumores muito vascularizados com hemorragia.'],
    anestesia: ['Geral com monitorização invasiva em tumores volumosos ou com trombo; protocolos de transfusão.'],
    instrumental: ['Mesmo da nefrectomia radical aberta ou laparoscópica/robótica (minimamente invasiva é segura em casos selecionados após terapia sistêmica, com conversão mais frequente por fibrose).', 'Metastasectomia pulmonar: toracoscopia (VATS) ou toracotomia com ressecção em cunha; adrenal: laparoscópica; pâncreas: enucleação ou pancreatectomia conforme localização.'],
    decisoes: ['Imediata vs diferida: CARMENA (sunitinibe isolado não inferior à nefrectomia + sunitinibe em intermediário/desfavorável) e SURTIME (diferida com melhor OS exploratória) apoiam começar o sistêmico no intermediário sintomático de doença; PROBE testa isso na era IO.', 'Após resposta completa das metástases à IO: nefrectomia "de consolidação" pode permitir pausa do tratamento; resposta patológica completa no rim é rara.', 'Via: aberta em tumores > 10–12 cm, aderências pós-tratamento, trombo; laparoscópica/robótica nos demais.', 'Metastasectomia: ressecção completa (R0) é o único cenário com benefício; incompleta não melhora sobrevida; após R0 não dar TKI (EAU forte contra) — pembrolizumabe adjuvante se M1 NED ≤ 1 ano da nefrectomia.'],
    passos: [
      { t: 'Acesso e exposição', d: 'Como na nefrectomia radical; esperar aderências do tumor ao cólon, duodeno, baço e psoas, neovasos parasitas (lombares, gonadal, adrenal, frênica inferior) e linfonodos aumentados; mobilizar amplamente antes do hilo.', dica: 'Ligar neovasos parasitas progressivamente com selador ou clipes; eles sangram muito.', cuidado: 'Invasão de cólon ou duodeno exige ressecção em bloco planejada com cirurgia geral.' },
      { t: 'Controle vascular', d: 'Artéria primeiro (acesso interaortocava à direita; por trás da veia à esquerda); veia renal com grampeador; linfadenectomia regional dos linfonodos aumentados (estadiamento e controle; estendida não melhora sobrevida).', dica: 'Em tumores grandes do polo inferior, ligar a gonadal e o ureter cedo para rodar o rim medialmente e expor o hilo.', cuidado: 'Fibrose pós-IO/TKI torna os planos do hilo mais difíceis: conversão mais frequente.' },
      { t: 'Ressecção em bloco', d: 'Rim com Gerota, adrenal se envolvida, linfonodos aumentados; órgão vizinho invadido ressecado em bloco quando R0 é viável; trombo venoso conforme o capítulo específico.', dica: 'Marcar margens para o patologista; tecido sarcomatoide ou necrótico extenso muda o prognóstico.', cuidado: 'Ressecção incompleta (R2) não beneficia: planejar antes.' },
      { t: 'Metastasectomia (mesmo tempo ou separada)', d: 'Pulmão: ressecções em cunha múltiplas por VATS, preservando parênquima; adrenal contralateral: laparoscópica; pâncreas: enucleação ou ressecção; osso: ressecção/fixação com RT adjuvante; partes moles: margem ampla.', dica: 'Tratar primeiro a lesão que define o prognóstico ou a sintomática; SBRT substitui a cirurgia em lesões de difícil acesso.', cuidado: 'Metástases pancreáticas e tireoidianas têm bom prognóstico; hepáticas e ósseas múltiplas, não.' },
      { t: 'Fechamento e plano pós-operatório', d: 'Drenos conforme ressecções associadas; definir com a oncologia o momento de retomar ou iniciar o sistêmico (2–4 semanas); imagem de base 6–8 semanas após.', dica: 'Reavaliar IMDC após a cirurgia (Hb, cálcio, plaquetas mudam).', cuidado: 'Atraso do sistêmico por complicação é o maior risco da citorredutora imediata.' },
    ],
    posop: ['Como na nefrectomia radical; retomar TKI após cicatrização (2–4 semanas); imunoterapia pode reiniciar em 2 semanas.', 'Após metastasectomia completa: seguimento com TC a cada 3–4 meses no 1º ano, depois a cada 6 meses; pembrolizumabe adjuvante se critério M1 NED ≤ 1 ano da nefrectomia.'],
    complicacoes: ['Complicações maiores 15–25% (mais que na radical por tumor localizado): sangramento, lesão de órgãos, íleo, infecção, TEV; mortalidade 1–3%; 10–20% não conseguem iniciar o sistêmico no tempo previsto após citorredutora imediata.'],
    resultados: ['Era IO: séries de nefrectomia diferida após resposta mostram OS mediana > 40 meses em selecionados; citorredutora imediata em IMDC favorável/oligometastático: OS 30–50 meses; em desfavorável não há benefício.', 'Metastasectomia completa: sobrevida 5 anos 40–50% (pulmão isolado 50–60%); incompleta: 10–15%.'],
    esquemas: ['niveis_trombo'],
    videos: [],
  },
};
const KSURG_LINK = {
  'RN-LOC-11': ['parcial'], 'RN-LOC-13': ['parcial'], 'RN-LOC-15': ['ablacao'], 'RN-LOC-16': ['ablacao'], 'RN-LOC-07': ['ablacao'],
  'RN-LOC-20': ['parcial'], 'RN-LOC-21': ['nefrectomia_lap'], 'RN-LOC-22': ['ablacao'],
  'RN-LOC-30': ['parcial'], 'RN-LOC-31': ['nefrectomia_lap', 'nefrectomia_aberta'], 'RN-LOC-32': ['nefrectomia_lap', 'nefrectomia_aberta'],
  'RN-LOC-02': ['nefrectomia_aberta'], 'RN-LOC-40': ['nefrectomia_aberta', 'nefrectomia_lap'], 'RN-LOC-41': ['nefrectomia_aberta'],
  'RN-CYS-02': ['parcial'], 'RN-CYS-04': ['parcial'],
  'RN-MET-02': ['citorredutora'], 'RN-MET-03': ['citorredutora'], 'RN-MET-04': ['citorredutora'], 'RN-MET-05': ['citorredutora'],
};
const KSURG_SVG = {
  niveis_trombo: `<svg viewBox="0 0 740 400" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Sans, system-ui, sans-serif" font-size="13">
  <defs><marker id="arrK" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker></defs>
  <!-- diafragma -->
  <path d="M40 90 Q200 40 360 90" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4"/>
  <text x="44" y="78" fill="currentColor" opacity=".8">diafragma</text>
  <!-- átrio -->
  <ellipse cx="200" cy="50" rx="46" ry="26" fill="none" stroke="currentColor" stroke-width="2"/>
  <text x="200" y="54" text-anchor="middle" fill="currentColor">átrio direito</text>
  <!-- cava -->
  <rect x="178" y="76" width="44" height="290" rx="12" fill="#4CB7D1" fill-opacity=".18" stroke="#0E6B85" stroke-width="2.5"/>
  <text x="200" y="384" text-anchor="middle" fill="currentColor">veia cava inferior</text>
  <!-- fígado e veias hepáticas -->
  <path d="M100 120 Q150 100 178 130 L178 200 Q140 215 100 190 Z" fill="currentColor" fill-opacity=".10" stroke="currentColor" stroke-width="1.5"/>
  <text x="112" y="162" fill="currentColor">fígado</text>
  <path d="M150 128 L178 128 M150 150 L178 150" stroke="#0E6B85" stroke-width="3"/>
  <text x="60" y="140" fill="currentColor" font-size="11.5">v. hepáticas</text>
  <!-- rim e veia renal direita -->
  <ellipse cx="330" cy="268" rx="34" ry="52" fill="currentColor" fill-opacity=".10" stroke="currentColor" stroke-width="1.5"/>
  <text x="330" y="330" text-anchor="middle" fill="currentColor">rim</text>
  <rect x="222" y="252" width="80" height="24" rx="10" fill="#4CB7D1" fill-opacity=".18" stroke="#0E6B85" stroke-width="2"/>
  <text x="262" y="294" text-anchor="middle" fill="currentColor" font-size="11.5">veia renal</text>
  <!-- trombo tumoral -->
  <path d="M300 264 Q260 262 226 262 L200 262 L200 150" fill="none" stroke="#E8A33D" stroke-width="12" stroke-linecap="round" opacity=".9"/>
  <!-- níveis (linhas à esquerda) -->
  <g stroke="currentColor" stroke-width="1.2" fill="currentColor">
    <line x1="222" y1="264" x2="400" y2="264" stroke-dasharray="4 3"/><text x="406" y="268">0 · veia renal</text>
    <line x1="222" y1="240" x2="400" y2="240" stroke-dasharray="4 3"/><text x="406" y="244">I · cava &lt; 2 cm acima da renal</text>
    <line x1="222" y1="200" x2="400" y2="200" stroke-dasharray="4 3"/><text x="406" y="204">II · abaixo das v. hepáticas</text>
    <line x1="222" y1="140" x2="400" y2="140" stroke-dasharray="4 3"/><text x="406" y="144">III · retro-hepático, até o diafragma</text>
    <line x1="222" y1="82" x2="400" y2="82" stroke-dasharray="4 3"/><text x="406" y="86">IV · acima do diafragma / átrio</text>
  </g>
  <!-- legenda -->
  <g font-size="11.5" fill="currentColor">
    <rect x="406" y="300" width="14" height="14" fill="#E8A33D"/><text x="426" y="312">trombo tumoral (nível II no esquema)</text>
    <rect x="406" y="322" width="14" height="14" fill="#4CB7D1" fill-opacity=".3" stroke="#0E6B85"/><text x="426" y="334">sistema venoso</text>
    <text x="406" y="356">Clampear: cava infrarrenal → v. renal contralateral →</text>
    <text x="406" y="372">cava suprarrenal. III: Pringle + mobilização hepática. IV: CEC.</text>
  </g>
</svg>`,
  clampeamento: `<svg viewBox="0 0 640 380" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Sans, system-ui, sans-serif" font-size="13">
  <!-- rim -->
  <path d="M250 60 C160 60 120 130 120 200 C120 275 165 340 250 340 C300 340 320 300 300 270 C285 250 285 230 300 210 C320 180 300 60 250 60 Z" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-width="2"/>
  <!-- hilo: artéria (vermelha tracejada) e veia -->
  <path d="M300 236 L420 236" stroke="#B03A3A" stroke-width="7" stroke-linecap="round"/>
  <text x="430" y="240" fill="currentColor">artéria renal</text>
  <path d="M300 262 L420 262" stroke="#0E6B85" stroke-width="10" stroke-linecap="round" opacity=".8"/>
  <text x="430" y="266" fill="currentColor">veia renal</text>
  <!-- ramos segmentares -->
  <path d="M300 236 L262 150 M300 236 L250 236 M300 236 L262 300" stroke="#B03A3A" stroke-width="3.5" fill="none"/>
  <!-- bulldog na artéria principal -->
  <rect x="340" y="222" width="18" height="28" rx="4" fill="#E8A33D" stroke="currentColor" stroke-width="1.5"/>
  <text x="332" y="212" fill="currentColor" font-size="11.5">bulldog (clampeamento principal)</text>
  <!-- bulldog seletivo no ramo polar inferior -->
  <rect x="272" y="268" width="12" height="20" rx="3" fill="#E8A33D" stroke="currentColor" stroke-width="1.5" transform="rotate(-55 278 278)"/>
  <text x="300" y="300" fill="currentColor" font-size="11.5">seletivo: ramo polar inferior</text>
  <!-- tumor polo inferior -->
  <circle cx="205" cy="300" r="26" fill="#E8A33D" fill-opacity=".35" stroke="#E8A33D" stroke-width="2"/>
  <text x="205" y="304" text-anchor="middle" fill="currentColor" font-size="11.5">tumor</text>
  <!-- linha de ressecção -->
  <circle cx="205" cy="300" r="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3"/>
  <!-- legenda renorrafia -->
  <g font-size="11.5" fill="currentColor">
    <text x="20" y="40" font-weight="600">Renorrafia em duas camadas</text>
    <path d="M20 60 q10 -7 20 0 q10 7 20 0 q10 -7 20 0 q10 7 20 0" fill="none" stroke="#0E6B85" stroke-width="2"/><text x="112" y="64">interna: V-Loc 3-0 no leito (coletor + vasos)</text>
    <path d="M20 90 L28 78 L36 90 L44 78 L52 90 L60 78 L68 90 L76 78 L84 90 L92 78 L100 90" fill="none" stroke="#0E6B85" stroke-width="2"/><rect x="104" y="76" width="8" height="14" fill="#E8A33D"/><text x="118" y="88">externa: pontos em U com Hem-o-lok deslizante</text>
    <text x="20" y="114">Isquemia quente alvo ≤ 20–25 min; desclampear após a camada interna.</text>
  </g>
</svg>`,
};
const KSURG_CAP = {
  niveis_trombo: 'Níveis do trombo tumoral (classificação Mayo): 0 veia renal; I até 2 cm na cava; II abaixo das veias hepáticas; III retro-hepático até o diafragma; IV supradiafragmático/atrial. A sequência de clampeamento (infrarrenal → renal contralateral → suprarrenal) evita embolização; níveis III–IV exigem equipe hepatobiliar e cardiovascular.',
  clampeamento: 'Nefrectomia parcial: clampeamento da artéria principal com bulldog ou seletivo de ramo segmentar (tumores polares), linha de ressecção com margem fina ao redor do tumor e renorrafia em duas camadas — interna contínua no leito e externa com clipes deslizantes.',
};

/* Motor de regras – Tumores da adrenal
   Regras 2026.11 · ESE/ENSAT 2023 (incidentaloma) · ESE/ENSAT 2018 e ESMO-EURACAN 2020 (ACC) · Endocrine Society 2014 (PPGL) e 2025 (aldosteronismo) · NCCN Neuroendocrine and Adrenal v1.2026
   Mesma convenção dos outros módulos: id, text, strength (forte/moderada/fraca/nao/ensaio/alerta/padrao), src, br (chaves de disponibilidade). */
const Adrenal = (() => {
  const num = (v) => (v === '' || v === null || v === undefined || isNaN(+v)) ? null : +v;
  const R = (id, text, strength, src, br, extra) => Object.assign({ id, text, strength, src, br: br || [] }, extra || {});
  const RULES = '2026.11';

  /* ---------- Módulo 1 – massa adrenal ---------- */
  function imgClass(p) {
    const size = num(p.tamanho);
    const uh = p.uh || 'ni';                       // '<=10' | '11-20' | '>20' | 'ni'
    const homog = (p.homogenea || 'sim') === 'sim';
    if (p.gordura === 'mielolipoma') return { cls: 'benigna', label: 'Mielolipoma (gordura macroscópica)', why: 'gordura macroscópica na TC' };
    if (p.gordura === 'cisto') return { cls: 'benigna', label: 'Cisto adrenal simples', why: 'densidade de água, sem realce' };
    if (p.rm_washout === 'benigno') return { cls: 'benigna', label: 'Benigna (RM/washout compatível com adenoma)', why: 'queda de sinal fora de fase ou washout ≥ 60%' };
    if (uh === 'ni') return { cls: 'sem_tc', label: 'Sem TC sem contraste', why: 'densidade não medida' };
    if (uh === '<=10' && homog) return { cls: 'benigna', label: 'Adenoma rico em lipídio (≤ 10 UH, homogênea)', why: '≤ 10 UH homogênea' };
    if (uh === '>20' || (size !== null && size >= 4 && !homog)) return { cls: 'suspeita', label: 'Suspeita (' + (uh === '>20' ? '> 20 UH' : '≥ 4 cm heterogênea') + ')', why: uh === '>20' ? '> 20 UH sem contraste' : '≥ 4 cm e heterogênea' };
    if (uh === '11-20' && homog && (size === null || size < 4)) return { cls: 'indeterminada_baixa', label: 'Indeterminada de baixo risco (11–20 UH, homogênea, < 4 cm)', why: '11–20 UH homogênea < 4 cm' };
    return { cls: 'indeterminada', label: 'Indeterminada (' + (uh === '<=10' ? '≤ 10 UH mas heterogênea' : '11–20 UH, ≥ 4 cm') + ')', why: 'imagem não conclusiva' };
  }
  function hormClass(p) {
    const dex = p.dex || 'ni';                    // '<=1.8' | '1.9-5' | '>5' | 'ni'
    const met = p.metanefrinas || 'ni';           // 'normal' | '1-3x' | '>3x' | 'ni'
    const h = [];
    if (met === '>3x') h.push('feo');
    if (met === '1-3x') h.push('feo_duvida');
    if (p.cushing_clinico === 'sim') h.push('cushing');
    else if (dex === '>5') h.push('macs_conf');
    else if (dex === '1.9-5') h.push('macs_poss');
    if (p.arr === 'positivo') h.push('aldo');
    if (p.dheas === 'alto') h.push('androgeno');
    return h;
  }
  function mass(p) {
    const out = [], alerts = [], pend = [], info = {};
    const size = num(p.tamanho), idade = num(p.idade);
    const img = imgClass(p);
    const horm = hormClass(p);
    const bilateral = p.bilateral === 'sim';
    const cancer = p.cancer_conhecido === 'sim';
    const fragil = p.saude === 'fragil';
    const jovem = (idade !== null && idade < 40) || p.gestante === 'sim';
    const cresc = p.crescimento || 'primeira';    // 'primeira' | 'nao' | '<20' | '>20'
    const accProvavel = img.cls === 'suspeita' && (horm.includes('androgeno') || (horm.includes('macs_conf') && size !== null && size >= 4) || (size !== null && size >= 6));
    const funcionante = horm.some((x) => ['feo', 'cushing', 'macs_conf', 'aldo'].includes(x));
    info.status = img.label + (size !== null ? ' · ' + size + ' cm' : '') + (bilateral ? ' · bilateral' : '');
    const hl = [];
    if (horm.includes('feo')) hl.push('metanefrinas > 3× = feocromocitoma');
    if (horm.includes('feo_duvida')) hl.push('metanefrinas 1–3×: repetir');
    if (horm.includes('cushing')) hl.push('Cushing clínico');
    if (horm.includes('macs_conf')) hl.push('secreção autônoma de cortisol confirmada (MACS, > 5 µg/dL)');
    if (horm.includes('macs_poss')) hl.push('MACS possível (1,9–5 µg/dL)');
    if (horm.includes('aldo')) hl.push('aldosteronismo primário');
    if (horm.includes('androgeno')) hl.push('DHEA-S/andrógenos elevados');
    info.horm = hl.length ? 'Hormonal: ' + hl.join(' · ') : (p.dex === '<=1.8' && (p.metanefrinas === 'normal' || p.metanefrinas === 'ni') ? 'Não funcionante' : 'Avaliação hormonal incompleta');
    if (accProvavel) info.acc = 'Carcinoma adrenocortical provável: seguir pelo fluxo "Carcinoma adrenocortical"';

    // pendências hormonais
    if ((p.dex || 'ni') === 'ni' && p.gordura !== 'mielolipoma' && p.gordura !== 'cisto') pend.push(R('AD-HORM-00', 'Teste de supressão com 1 mg de dexametasona (23 h) com cortisol às 8 h: obrigatório em todo incidentaloma; ≤ 1,8 µg/dL exclui; 1,9–5 possível MACS; > 5 MACS confirmada (repetir e dosar ACTH).', 'padrao', 'ESE/ENSAT 2023 (forte)'));
    if ((p.metanefrinas || 'ni') === 'ni' && img.cls !== 'benigna') pend.push(R('AD-HORM-01', 'Metanefrinas plasmáticas livres (ou fracionadas em urina de 24 h): obrigatórias em toda lesão que não é adenoma típico, e antes de qualquer biópsia ou cirurgia.', 'padrao', 'ESE/ENSAT 2023 (forte)', ['metanefrinas_plasma']));
    if (p.has_hipok === 'sim' && (p.arr || 'ni') === 'ni') pend.push(R('AD-HORM-02', 'Aldosterona e renina (relação ARR) em hipertenso ou hipocalêmico; a diretriz 2025 recomenda rastrear todo hipertenso; corrigir potássio e suspender espironolactona 4 semanas antes.', 'padrao', 'ESE/ENSAT 2023; Endocrine Society 2025'));
    if ((img.cls === 'suspeita' || (size !== null && size >= 4)) && (p.dheas || 'ni') === 'ni') pend.push(R('AD-HORM-03', 'DHEA-S, androstenediona, testosterona, 17-OH-progesterona (e estradiol no homem): secreção mista ou de andrógenos sugere carcinoma adrenocortical; perfil de esteroides urinários por espectrometria quando disponível.', 'padrao', 'ESE/ENSAT 2023 (sugestão)', ['perfil_esteroides']));
    if (horm.includes('feo_duvida')) pend.push(R('AD-HORM-04', 'Metanefrinas 1–3× o limite: repetir em posição supina após 30 min, sem tricíclicos, ISRS, labetalol ou levodopa; teste de supressão com clonidina se persistir dúvida.', 'padrao', 'Endocrine Society 2014'));
    if (bilateral) { pend.push(R('AD-HORM-05', 'Massas bilaterais: 17-OH-progesterona (hiperplasia congênita), cortisol às 8 h e ACTH (insuficiência adrenal por metástase, linfoma, hemorragia ou infiltração), e avaliação individual de cada lesão.', 'padrao', 'ESE/ENSAT 2023')); }

    // feocromocitoma manda em tudo
    if (horm.includes('feo')) {
      out.push(R('AD-HORM-10', 'Feocromocitoma: preparo com alfa-bloqueio por 7–14 dias e adrenalectomia (laparoscópica se < 6 cm sem invasão); genética germinativa para todos. Detalhes no fluxo "Feocromocitoma e paraganglioma".', 'forte', 'Endocrine Society 2014; ESE/ENSAT 2023', ['adrenalectomia_lap', 'doxazosina'], { kind: 'padrao' }));
      alerts.push(R('AD-HORM-11', 'Nunca biopsiar, ablacionar ou operar sem alfa-bloqueio; evitar beta-bloqueador isolado, metoclopramida e corticoide (crise adrenérgica).', 'alerta', 'Endocrine Society 2014'));
      return { out, alerts, pend, info, img, horm };
    }
    // ACC provável
    if (accProvavel) {
      out.push(R('AD-IMG-10', 'Massa suspeita com perfil hormonal de carcinoma adrenocortical: adrenalectomia aberta em bloco por cirurgião de alto volume, sem biópsia; estadiar com TC de tórax e FDG-PET antes. Detalhes no fluxo "Carcinoma adrenocortical".', 'forte', 'ESE/ENSAT 2018 (forte); ESE/ENSAT 2023', ['adrenalectomia_aberta'], { kind: 'padrao' }));
      alerts.push(R('AD-IMG-11', 'Laparoscopia em carcinoma adrenocortical suspeito aumenta recidiva peritoneal; não biopsiar (dissemina e não distingue adenoma de carcinoma).', 'alerta', 'ESE/ENSAT 2018'));
      if (horm.includes('macs_conf') || horm.includes('cushing')) alerts.push(R('AD-CIR-01', 'Hipercortisolismo: hidrocortisona de estresse no perioperatório e reposição com desmame lento após a cirurgia (adrenal contralateral suprimida).', 'alerta', 'ESE/ENSAT 2023 (forte)', ['hidrocortisona']));
      return { out, alerts, pend, info, img, horm };
    }
    // imagem
    if (img.cls === 'sem_tc') {
      out.push(R('AD-IMG-00', 'Fazer TC sem contraste (medir UH em região de interesse de 2/3 da lesão): define 70% dos casos como adenoma e dispensa seguimento.', 'forte', 'ESE/ENSAT 2023 (forte)', [], { kind: 'padrao' }));
    } else if (img.cls === 'benigna') {
      if (!funcionante && !horm.includes('macs_poss')) {
        out.push(R('AD-IMG-01', 'Lesão benigna e não funcionante: alta, sem nova imagem (em qualquer tamanho) e sem repetir avaliação hormonal, salvo novo sinal clínico ou piora de comorbidade.', 'forte', 'ESE/ENSAT 2023 (forte; o corte de 4 cm de 2016 foi removido)', [], { kind: 'padrao' }));
        if (p.gordura === 'mielolipoma' && size !== null && size >= 6) out.push(R('AD-IMG-12', 'Mielolipoma ≥ 6 cm: cirurgia só se sintomático ou com hemorragia; crescimento é raro.', 'fraca', 'ESE/ENSAT 2023'));
      }
    } else if (img.cls === 'indeterminada_baixa') {
      out.push(R('AD-IMG-02', 'Indeterminada de baixo risco (11–20 UH, homogênea, < 4 cm): imagem adicional imediata (RM com desvio químico, TC com washout ou FDG-PET) ou repetir TC/RM sem contraste em 12 meses; operar se crescer > 20% e ≥ 5 mm.', 'moderada', 'ESE/ENSAT 2023 (sugestão)', [], { kind: 'padrao' }));
    } else if (img.cls === 'suspeita') {
      out.push(R('AD-IMG-03', 'Massa suspeita (≥ 4 cm heterogênea ou > 20 UH): discussão multidisciplinar; cirurgia é a regra (aberta se carcinoma provável, minimamente invasiva se < 6 cm sem sinais de invasão e benigna provável); imagem adicional (FDG-PET, perfil esteroide) em casos selecionados.', 'forte', 'ESE/ENSAT 2023 (sugestão forte para MDT)', ['adrenalectomia_aberta', 'adrenalectomia_lap'], { kind: 'padrao' }));
      pend.push(R('AD-IMG-13', 'Antes de operar massa suspeita: TC de tórax, avaliação hormonal completa (cortisol, andrógenos, metanefrinas, aldosterona) e FDG-PET/CT se disponível.', 'padrao', 'ESE/ENSAT 2018'));
    } else if (img.cls === 'indeterminada') {
      out.push(R('AD-IMG-04', 'Indeterminada: individualizar em reunião multidisciplinar — RM com desvio químico ou FDG-PET; se persistir indeterminada, cirurgia em paciente apto ou nova imagem em 6–12 meses no idoso/comórbido.', 'moderada', 'ESE/ENSAT 2023', [], { kind: 'padrao' }));
    }
    if (cresc === '>20') out.push(R('AD-IMG-05', 'Crescimento > 20% e ≥ 5 mm desde a imagem anterior: indicar cirurgia.', 'forte', 'ESE/ENSAT 2023 (sugestão)', ['adrenalectomia_lap']));
    else if (cresc === '<20' && img.cls !== 'benigna') out.push(R('AD-IMG-06', 'Crescimento menor que 20% ou < 5 mm: repetir imagem em 6–12 meses.', 'moderada', 'ESE/ENSAT 2023'));
    if (cancer && img.cls !== 'benigna') out.push(R('AD-IMG-07', 'Câncer extra-adrenal conhecido com lesão não benigna: FDG-PET/CT; biópsia só se não funcionante, imagem não conclusiva e resultado mudar a conduta — sempre após excluir feocromocitoma. Metástase isolada: ver fluxo "Aldosteronoma, Cushing e metástase".', 'moderada', 'ESE/ENSAT 2023'));
    else if (img.cls !== 'benigna') out.push(R('AD-IMG-08', 'Não biopsiar massa adrenal sem câncer extra-adrenal conhecido: não distingue adenoma de carcinoma e pode disseminar.', 'nao', 'ESE/ENSAT 2023 (forte contra)'));
    // hormônios
    if (horm.includes('cushing')) out.push(R('AD-HORM-12', 'Cushing clínico ACTH-independente com lesão unilateral: adrenalectomia minimamente invasiva com hidrocortisona de estresse e desmame por 6–18 meses. Detalhes no fluxo "Aldosteronoma, Cushing e metástase".', 'forte', 'ESE/ENSAT 2023 (forte)', ['adrenalectomia_lap', 'hidrocortisona'], { kind: 'padrao' }));
    if (horm.includes('aldo')) out.push(R('AD-HORM-13', 'Aldosteronismo primário: TC + cateterismo de veias adrenais antes de adrenalectomia unilateral; antagonista mineralocorticoide se não lateraliza ou inapto. Detalhes no fluxo "Aldosteronoma, Cushing e metástase".', 'forte', 'Endocrine Society 2025', ['avs', 'adrenalectomia_lap', 'espironolactona'], { kind: 'padrao' }));
    if (horm.includes('macs_conf')) {
      if (p.comorb === 'sim' && !bilateral) out.push(R('AD-HORM-14', 'MACS confirmada com comorbidade atribuível (hipertensão, diabetes, osteoporose, obesidade) em lesão unilateral: discutir adrenalectomia minimamente invasiva considerando idade, cortisol pós-dexametasona e gravidade; hidrocortisona de estresse e seguimento endocrinológico até recuperar o eixo.', 'moderada', 'ESE/ENSAT 2023 (sugestão)', ['adrenalectomia_lap', 'hidrocortisona'], { kind: 'padrao' }));
      else out.push(R('AD-HORM-15', 'MACS confirmada sem comorbidade atribuível ou bilateral: não operar; reavaliar comorbidades (PA, glicemia, densitometria) anualmente; pode receber alta do especialista para a atenção primária.', 'forte', 'ESE/ENSAT 2023'));
    }
    if (horm.includes('macs_poss')) out.push(R('AD-HORM-16', 'MACS possível (1,9–5 µg/dL): repetir o teste de dexametasona, dosar ACTH e cortisol livre urinário; avaliar comorbidades; falsos positivos com estrogênio, antiepilépticos e absorção variável.', 'moderada', 'ESE/ENSAT 2023'));
    if (bilateral) out.push(R('AD-HORM-17', 'Não fazer adrenalectomia bilateral sem Cushing clínico; em hiperplasia macronodular com MACS, individualizar (adrenalectomia unilateral da maior glândula é opção).', 'nao', 'ESE/ENSAT 2023 (forte contra)'));
    // populações especiais
    if (jovem && img.cls !== 'benigna') alerts.push(R('AD-IMG-09', (p.gestante === 'sim' ? 'Gestante' : 'Menor de 40 anos') + ': avaliação urgente, RM em vez de TC e ressecção se a lesão permanecer indeterminada.', 'alerta', 'ESE/ENSAT 2023'));
    if (fragil) alerts.push(R('AD-IMG-14', 'Fragilidade ou expectativa limitada: investigação e tratamento proporcionais ao benefício; observar lesões indeterminadas pequenas.', 'alerta', 'ESE/ENSAT 2023'));
    if (out.some((o) => (o.br || []).includes('adrenalectomia_lap') || (o.br || []).includes('adrenalectomia_aberta'))) {
      alerts.push(R('AD-CIR-02', 'Toda adrenalectomia por cirurgião de alto volume (> 6–12/ano); via minimamente invasiva para lesão benigna funcionante; aberta se carcinoma provável.', 'alerta', 'ESE/ENSAT 2023 (forte)'));
      if (p.dex === '1.9-5' || p.dex === '>5' || horm.includes('cushing')) alerts.push(R('AD-CIR-01', 'Cortisol pós-dexametasona > 1,8 µg/dL: hidrocortisona 100 mg IV na indução e reposição com desmame até recuperação do eixo (6–18 meses); educar sobre crise adrenal.', 'alerta', 'ESE/ENSAT 2023 (forte)', ['hidrocortisona']));
    }
    return { out, alerts, pend, info, img, horm };
  }

  /* ---------- Módulo 2 – carcinoma adrenocortical ---------- */
  function ensat(p) {
    const size = num(p.tamanho);
    const inv = p.invasao || 'nao';              // nao | gordura | orgaos | trombo
    const N = p.cN === 'N1' || p.pN === 'pN1', M = p.cM === 'M1';
    let st;
    if (M) st = 'IV'; else if (inv !== 'nao' || N) st = 'III'; else if (size !== null && size > 5) st = 'II'; else st = 'I';
    const os = { I: '80–85%', II: '60–75%', III: '40–50%', IV: '10–15%' }[st];
    return { st, os, label: `ENSAT ${st}` + (st === 'IV' ? ' (metastático)' : st === 'III' ? (N ? ' (N1' + (inv !== 'nao' ? ' + invasão local)' : ')') : ' (invasão local' + (inv === 'trombo' ? ' / trombo venoso' : '') + ')') : size !== null ? ` (${size} cm, confinado)` : '') + ` · sobrevida 5 anos ≈ ${os}` };
  }
  function acc(p) {
    const out = [], alerts = [], pend = [], info = {};
    const momento = p.momento || 'preop';       // preop | posop | avancado
    const e = ensat(p);
    const func = p.funcionante || 'nao';         // nao | cortisol | androgeno | misto | aldosterona
    const cortisol = func === 'cortisol' || func === 'misto' || p.hipercortisolismo === 'sim';
    info.status = momento === 'avancado' ? 'Carcinoma adrenocortical avançado, recidivado ou metastático' + (p.cM === 'M1' ? ' (ENSAT IV · sobrevida 5 anos ≈ 10–15%)' : '') : e.label;
    if (func !== 'nao') info.func = 'Funcionante: ' + ({ cortisol: 'cortisol', androgeno: 'andrógenos', misto: 'cortisol + andrógenos (típico de ACC)', aldosterona: 'aldosterona' })[func];
    const mitAlert = R('AD-BR-01', 'Mitotano sem registro ativo na ANVISA (Lisodren descontinuado em 2022, registro cancelado em 2025): importação simplificada autorizada pela ANVISA em jul/2025 e fornecimento no SUS determinado pelo TRF2 em jan/2026; prever 4–8 semanas para obter e laboratório para dosagem sérica.', 'alerta', 'ANVISA jul/2025; TRF2 jan/2026');
    if (momento === 'preop') {
      pend.push(R('AD-ACC-00', 'Estadiamento pré-operatório: TC de tórax, TC/RM de abdome com contraste (RM se trombo), FDG-PET/CT; hormonal completo (dexametasona 1 mg, cortisol urinário, ACTH, DHEA-S, androstenediona, testosterona, 17-OHP, estradiol, aldosterona/renina) e metanefrinas para excluir feocromocitoma. Não biopsiar.', 'padrao', 'ESE/ENSAT 2018 (forte)', ['perfil_esteroides']));
      if (e.st === 'IV') { out.push(R('AD-ACC-01', 'Doença metastática ao diagnóstico: seguir pelo momento "Avançado"; cirurgia do primário só se > 90% da doença for ressecável ou para controle hormonal.', 'padrao', 'ESE/ENSAT 2018')); return { out, alerts, pend, info, ensat: e }; }
      if (p.ressecavel === 'nao') {
        out.push(R('AD-ACC-02', 'Localmente avançado irressecável: mitotano + EDP (ou mitotano isolado em doença lenta) por 3–4 meses e reavaliar ressecabilidade; cirurgia se boa resposta.', 'fraca', 'ESE/ENSAT 2018; séries', ['mitotano', 'edp'], { kind: 'padrao' }));
        alerts.push(mitAlert);
        return { out, alerts, pend, info, ensat: e };
      }
      out.push(R('AD-ACC-03', 'Adrenalectomia aberta em bloco com gordura periadrenal e órgãos aderidos (rim, baço, cauda do pâncreas, parede da cava), sem ruptura capsular, visando R0: única chance de cura; cirurgião de alto volume.', 'forte', 'ESE/ENSAT 2018 (forte); ESMO 2020', ['adrenalectomia_aberta'], { kind: 'padrao' }));
      out.push(R('AD-ACC-04', 'Linfadenectomia regional (hilo renal, periaórtica/pericaval ipsilateral; ≥ 5 linfonodos): melhora estadiamento e reduz recidiva em séries.', 'moderada', 'ESE/ENSAT 2018 (sugestão)'));
      if (p.invasao === 'trombo') out.push(R('AD-ACC-05', 'Trombo em veia renal/cava: trombectomia como no carcinoma renal, com equipe vascular; RM pré-operatória para nível.', 'forte', 'ESE/ENSAT 2018', ['adrenalectomia_aberta']));
      if (num(p.tamanho) !== null && num(p.tamanho) <= 6 && p.invasao === 'nao') out.push(R('AD-ACC-06', 'Laparoscopia é aceitável apenas em tumor ≤ 6 cm sem qualquer sinal de invasão, em centro de alto volume, com conversão imediata se houver aderência; a maioria das séries mostra mais carcinomatose com laparoscopia.', 'fraca', 'ESE/ENSAT 2018', ['adrenalectomia_lap']));
      else out.push(R('AD-ACC-07', 'Não operar por laparoscopia: tumor > 6 cm ou com sinais de invasão.', 'nao', 'ESE/ENSAT 2018 (forte contra)'));
      out.push(R('AD-ACC-08', 'Nefrectomia ipsilateral só se invasão renal; não ressecar a adrenal contralateral.', 'padrao', 'ESE/ENSAT 2018'));
      if (cortisol) alerts.push(R('AD-CIR-01', 'Hipercortisolismo: hidrocortisona de estresse no perioperatório, profilaxia de tromboembolismo e reposição com desmame lento (meses); considerar bloqueio pré-operatório (cetoconazol, osilodrostat) se Cushing grave.', 'alerta', 'ESE/ENSAT 2018', ['hidrocortisona', 'cetoconazol']));
      out.push(R('AD-ACC-09', 'Após a cirurgia: Weiss, Ki-67, margem e estádio definem adjuvância no momento "Pós-operatório"; iniciar mitotano, se indicado, em até 3 meses — providenciar importação desde já.', 'padrao', 'ESE/ENSAT 2018'));
      return { out, alerts, pend, info, ensat: e };
    }
    if (momento === 'posop') {
      const ki = p.ki67 || 'ni';                // '<=10' | '11-19' | '>=20' | 'ni'
      const margem = p.margem || 'R0';          // R0 | R1 | Rx | R2
      const ruptura = p.ruptura === 'sim';
      const alto = ki === '11-19' || ki === '>=20' || e.st === 'III' || margem !== 'R0' || ruptura;
      const muitoAlto = ki === '>=20' || margem === 'R2';
      info.risco = alto ? `Risco alto de recidiva (${[ki !== '<=10' && ki !== 'ni' ? 'Ki-67 ' + ki.replace('>=', '≥ ').replace('<=', '≤ ') + '%' : null, e.st === 'III' ? 'estádio III' : null, margem !== 'R0' ? margem : null, ruptura ? 'ruptura capsular' : null].filter(Boolean).join(', ')})` : (ki === 'ni' ? 'Ki-67 não informado: pedir ao patologista (decide a adjuvância)' : 'Risco baixo-intermediário (R0, Ki-67 ≤ 10%, estádio I–II)');
      if (ki === 'ni') pend.push(R('AD-ACC-10', 'Solicitar Ki-67 (e escore de Weiss ou Helsinki) ao patologista: Ki-67 > 10% é o principal critério para mitotano adjuvante.', 'padrao', 'ESE/ENSAT 2018'));
      if (margem === 'R2') {
        out.push(R('AD-ACC-11', 'Ressecção incompleta (R2): tratar como doença avançada — mitotano + EDP e reavaliar cirurgia de resgate; radioterapia do leito para controle local.', 'forte', 'ESE/ENSAT 2018', ['mitotano', 'edp', 'rt_leito'], { kind: 'padrao' }));
        alerts.push(mitAlert);
      } else if (alto) {
        out.push(R('AD-ACC-12', `Mitotano adjuvante por 2 anos (até 5), alvo sérico 14–20 mg/L, iniciar em até 3 meses da cirurgia, com hidrocortisona de reposição (30–50 mg/dia): recomendado no alto risco${ki === '<=10' && e.st === 'III' ? ' (estádio III mesmo com Ki-67 baixo)' : ''}.`, 'forte', 'ESE/ENSAT 2018 (recomendação); Terzolo 2007 (RFS 42 vs 10 meses, retrospectivo); ADIUVO-2 em andamento', ['mitotano', 'hidrocortisona'], { kind: 'padrao' }));
        if (margem === 'R1' || margem === 'Rx' || (e.st === 'III' && p.invasao !== 'nao')) out.push(R('AD-ACC-13', 'Radioterapia adjuvante do leito tumoral (50–60 Gy em 25–30 frações) além do mitotano: reduz recidiva local em R1/Rx e invasão local; sem ganho de sobrevida comprovado.', 'moderada', 'ESE/ENSAT 2018 (sugestão); Sabolch 2015', ['rt_leito']));
        if (muitoAlto) out.push(R('AD-ACC-14', 'Ki-67 ≥ 20%: discutir mitotano + EDP adjuvante (como no avançado) em reunião multidisciplinar ou ensaio (ADIUVO-2).', 'ensaio', 'Opinião de especialistas; ADIUVO-2', ['mitotano', 'edp']));
        out.push(R('AD-ACC-15', 'Observação é alternativa se o paciente recusa mitotano ou não tolera: seguimento trimestral rigoroso.', 'fraca', 'ESE/ENSAT 2018'));
        alerts.push(mitAlert);
      } else {
        out.push(R('AD-ACC-16', 'Risco baixo-intermediário (R0, Ki-67 ≤ 10%, estádio I–II): observação com seguimento trimestral; mitotano adjuvante não reduziu recidiva neste grupo (ADIUVO: HR 1,3, NS) e tem toxicidade relevante.', 'forte', 'ADIUVO 2023; ESE/ENSAT 2018', [], { kind: 'padrao' }));
        out.push(R('AD-ACC-17', 'Mitotano é opção se o paciente prefere tratamento ativo após discussão de risco/benefício.', 'fraca', 'ESE/ENSAT 2018'));
      }
      if (cortisol) alerts.push(R('AD-ACC-18', 'Tumor produtor de cortisol: desmame lento de hidrocortisona (6–18 meses) com cortisol basal e teste de ACTH; dose maior (30–50 mg/dia) enquanto em mitotano; fludrocortisona se hipotensão ou hiponatremia.', 'alerta', 'ESE/ENSAT 2018', ['hidrocortisona']));
      out.push(R('AD-ACC-19', 'Não usar quimioterapia adjuvante fora de ensaio, nem imunoterapia adjuvante.', 'nao', 'ESE/ENSAT 2018'));
      return { out, alerts, pend, info, ensat: e, followup: { img: 'TC de tórax + TC/RM de abdome a cada 3 meses por 2 anos; a cada 3–6 meses até 5 anos; depois anual até 10 anos', lab: (func !== 'nao' ? 'Marcadores que estavam elevados (cortisol, DHEA-S, andrógenos) a cada visita' : 'Hormonal só se nova clínica') + (alto && margem !== 'R2' ? '; mitotano sérico a cada 2–4 semanas até o alvo, depois mensal; TSH, lipídios, transaminases, testosterona' : ''), stop: 'Mínimo 10 anos (recidivas tardias)' } };
    }
    // avançado
    const ritmo = p.ritmo || 'rapido';            // indolente | rapido
    const volume = p.volume || 'alto';            // baixo | alto
    const prev = new Set(p.previos || []);        // mitotano | edp | gemcape | strepto | io | cabo
    const nivel = p.mitotano_nivel || 'nao';      // nao | baixo | alvo
    const msi = p.msi || 'nt';
    const ecog = num(p.ecog) ?? 0;
    info.ritmo = (ritmo === 'indolente' ? 'Progressão lenta' : 'Progressão rápida ou sintomática') + ' · volume ' + volume + (prev.size ? ' · prévios: ' + [...prev].map((k) => ({ mitotano: 'mitotano', edp: 'EDP', gemcape: 'gemcitabina/capecitabina', strepto: 'estreptozocina', io: 'imunoterapia', cabo: 'cabozantinibe' })[k] || k).join(', ') : ' · sem tratamento sistêmico prévio');
    if (p.ressecavel_rec === 'sim') out.push(R('AD-ACC-20', `Recidiva ou oligometástase ressecável${p.intervalo === '>12' ? ' com intervalo livre > 12 meses' : ''}: ressecção completa (± mitotano após), ou ablação/SBRT nas lesões não ressecáveis; sobrevida mediana 50–70 meses após R0 em séries${p.intervalo === '<12' ? '. Intervalo < 12 meses prediz falha: preferir sistêmico primeiro' : ''}.`, p.intervalo === '<12' ? 'fraca' : 'moderada', 'ESE/ENSAT 2018; ESMO 2020', ['adrenalectomia_aberta', 'sbrt_adrenal'], { kind: p.intervalo !== '<12' ? 'padrao' : undefined }));
    if (cortisol) out.push(R('AD-ACC-21', 'Controlar o hipercortisolismo antes ou junto do antitumoral: cetoconazol 400–1.200 mg/dia, osilodrostat 2–30 mg 2×/dia ou metirapona (importação), com hidrocortisona em bloqueio-e-reposição; profilaxia de TEV; corrigir potássio e glicemia. Pré-requisito para imunoterapia.', 'forte', 'ESE/ENSAT 2018; ESMO 2020', ['cetoconazol', 'osilodrostat', 'metirapona', 'hidrocortisona'], { kind: 'padrao' }));
    if (!prev.has('edp')) {
      if (ritmo === 'indolente' && volume === 'baixo' && !prev.has('mitotano')) {
        out.push(R('AD-ACC-22', 'Doença indolente de baixo volume: mitotano isolado (titular até 14–20 mg/L; demora 2–3 meses para agir) com reavaliação em 3 meses e tratamento local das lesões dominantes; resposta 20–25% com nível terapêutico.', 'moderada', 'ESE/ENSAT 2018 (sugestão)', ['mitotano', 'hidrocortisona'], { kind: 'padrao' }));
        out.push(R('AD-ACC-23', 'EDP-M é alternativa imediata se preferência por resposta mais rápida ou se progredir no mitotano.', 'moderada', 'ESE/ENSAT 2018', ['edp', 'mitotano']));
      } else {
        const resseca = p.ressecavel_rec === 'sim' && p.intervalo !== '<12';
        if (p.cisplatina_apta !== 'nao') out.push(R('AD-ACC-24', 'EDP-M: etoposide 100 mg/m² D2–4, doxorrubicina 40 mg/m² D1, cisplatina 40 mg/m² D3–4 a cada 28 dias, até 6–8 ciclos, com mitotano contínuo (manter 14–20 mg/L): FIRM-ACT — resposta 23% vs 9%, PFS 5,0 vs 2,1 meses vs estreptozocina-M; padrão de primeira linha' + (resseca ? ' quando a ressecção não é possível ou após ela, se recidiva precoce' : '') + '.', resseca ? 'moderada' : 'forte', 'FIRM-ACT 2012; ESE/ENSAT 2018 (forte); ESMO 2020', ['edp', 'mitotano', 'hidrocortisona'], { kind: resseca ? undefined : 'padrao' }));
        else out.push(R('AD-ACC-25', 'Inapto a cisplatina/antraciclina: etoposide + carboplatina + mitotano, ou mitotano isolado.', 'fraca', 'Séries', ['carbo_eto', 'mitotano'], { kind: 'padrao' }));
        if (nivel === 'baixo' || nivel === 'nao') alerts.push(R('AD-ACC-26', 'Mitotano abaixo do alvo: dosar a cada 2–4 semanas e titular até 14–20 mg/L (acima de 20: neurotoxicidade); repor hidrocortisona 30–50 mg/dia; induz CYP3A4 (ajustar anticoagulante, estatina, macrolídeo).', 'alerta', 'ESE/ENSAT 2018'));
      }
    } else {
      // segunda linha
      out.push(R('AD-ACC-27', 'Segunda linha após EDP-M: gemcitabina 800 mg/m² D1 e D8 + capecitabina 1.500 mg/dia contínua a cada 21 dias (resposta 5–7%, controle 30–45%, PFS ~3 meses); ou estreptozocina 1 g/dia × 5 e depois 2 g a cada 3 semanas com mitotano (resposta 9%; sem registro ANVISA); temozolomida é alternativa.', 'moderada', 'ESE/ENSAT 2018; ESMO 2020; FIRM-ACT (crossover)', ['gemcape', 'estreptozocina', 'temozolomida'], { kind: prev.has('gemcape') ? undefined : 'padrao' }));
      out.push(R('AD-ACC-28', `Imunoterapia (pembrolizumabe 200 mg a cada 3 semanas): resposta 14–23%, duradoura numa minoria; ${msi === 'sim' ? 'MSI-H/dMMR presente: maior chance de resposta — preferir' : msi === 'nt' ? 'testar MSI/dMMR (3–5% dos ACC, síndrome de Lynch)' : 'MSS: benefício menor'}; controlar o hipercortisolismo antes (reduz eficácia).`, msi === 'sim' ? 'moderada' : 'fraca', 'Raj 2020; Habra 2019; NCCN v1.2026', ['pembro_acc'], { kind: msi === 'sim' && !prev.has('io') ? 'padrao' : undefined }));
      if (!prev.has('cabo')) out.push(R('AD-ACC-29', 'Cabozantinibe 60 mg/dia: fase II (n = 18) — resposta 11%, controle de doença 78%, PFS 6 meses; mitotano prévio reduz a concentração (considerar 60 mg e vigiar); combinação com cemiplimabe em estudo (A092204).', 'fraca', 'Lancet Oncol 2024; NCCN v1.2026', ['cabo_acc']));
      if (prev.has('mitotano') && nivel !== 'alvo') alerts.push(R('AD-ACC-26', 'Manter ou otimizar mitotano (14–20 mg/L) junto da segunda linha quando tolerado.', 'alerta', 'ESE/ENSAT 2018'));
    }
    out.push(R('AD-ACC-30', 'Ensaio clínico em qualquer linha (cabozantinibe + cemiplimabe, ivonescimabe, ADCs, vacinas); tratamento local (SBRT, ablação, quimio/radioembolização hepática, RT óssea) para lesões sintomáticas ou oligoprogressivas.', 'ensaio', 'NCCN v1.2026; ESMO 2020', ['sbrt_adrenal']));
    alerts.push(mitAlert);
    if (ecog >= 3) alerts.push(R('AD-ACC-31', 'ECOG 3–4: quimioterapia com benefício improvável; cuidados paliativos e controle hormonal.', 'alerta', 'ESMO 2020'));
    return { out, alerts, pend, info, ensat: e };
  }

  /* ---------- Módulo 3 – feocromocitoma e paraganglioma ---------- */
  function ppgl(p) {
    const out = [], alerts = [], pend = [], info = {};
    const momento = p.momento || 'preop';        // preop | metastatico
    const fen = p.fenotipo || 'noradren';         // adren | noradren | dopa | normal
    const local = p.local || 'adrenal';           // adrenal | extra | bilateral
    const size = num(p.tamanho);
    const gen = p.genetica || 'nt';               // sdhb | vhl | ret | nf1 | max | outra | negativa | nt
    const hered = ['sdhb', 'vhl', 'ret', 'nf1', 'max', 'outra'].includes(gen);
    info.status = (local === 'adrenal' ? 'Feocromocitoma' : local === 'bilateral' ? 'Feocromocitoma bilateral' : 'Paraganglioma') + (size !== null ? ` · ${size} cm` : '') + ' · fenótipo ' + ({ adren: 'adrenérgico (metanefrina)', noradren: 'noradrenérgico (normetanefrina)', dopa: 'dopaminérgico (3-metoxitiramina)', normal: 'bioquimicamente silencioso' })[fen];
    info.gen = gen === 'nt' ? 'Genética não testada' : gen === 'negativa' ? 'Painel germinativo negativo' : 'Mutação germinativa: ' + ({ sdhb: 'SDHB (risco metastático 30–40%)', vhl: 'VHL', ret: 'RET (MEN2)', nf1: 'NF1', max: 'MAX', outra: 'outra (SDHD/C/A, TMEM127, FH, EPAS1)' })[gen];
    if (gen === 'nt') pend.push(R('AD-PPGL-00', 'Teste genético germinativo para todos (painel: SDHB, SDHD, SDHC, SDHA, SDHAF2, VHL, RET, NF1, MAX, TMEM127, FH, EPAS1): 30–40% têm mutação; define risco metastático, bilateralidade, imagem e rastreio familiar.', 'padrao', 'Endocrine Society 2014 (forte); NCCN v1.2026', ['teste_germinativo']));
    if (momento === 'preop') {
      pend.push(R('AD-PPGL-01', 'Localização: TC com contraste ou RM (T2 brilhante; preferir RM em gestante, criança e SDH). Imagem funcional (Ga-68 DOTATATE PET preferida; FDOPA; MIBG se radioterapia com MIBG planejada) se tumor > 5 cm, paraganglioma, multifocal, hereditário ou suspeita de metástase.', 'padrao', 'Endocrine Society 2014; EANM 2019', ['dotatate_pet']));
      pend.push(R('AD-PPGL-02', 'Ecocardiograma se cardiomiopatia suspeita; glicemia; anestesista experiente com nitroprussiato, fentolamina, esmolol e magnésio disponíveis.', 'padrao', 'Endocrine Society 2014'));
      if (fen !== 'normal') {
        out.push(R('AD-PPGL-03', 'Preparo por 7–14 dias: alfa-bloqueio (doxazosina 2 → 16–32 mg/dia, prazosina 1 mg 2–3×/dia → 15 mg/dia ou fenoxibenzamina 10 mg 2×/dia → 1 mg/kg/dia, esta por importação), metas PA sentado < 130/80 e em pé sistólica > 90 mmHg, FC 60–70 sentado / 70–80 em pé; dieta rica em sal e líquidos nos 3 dias anteriores; bloqueador de cálcio como adjuvante.', 'forte', 'Endocrine Society 2014 (forte)', ['doxazosina'], { kind: 'padrao' }));
        alerts.push(R('AD-PPGL-04', 'Beta-bloqueador só após 3–4 dias de alfa-bloqueio e apenas se taquicardia; nunca antes (crise por alfa sem oposição). Evitar metoclopramida, glucagon, corticoide e opioides liberadores de histamina.', 'alerta', 'Endocrine Society 2014'));
        if (p.cardiomiopatia === 'sim' || p.secrecao_alta === 'sim') out.push(R('AD-PPGL-05', 'Secreção muito alta ou cardiomiopatia: acrescentar metirosina 250 mg–1 g 4×/dia (importação) e estender o preparo; recuperar a função ventricular antes da cirurgia se possível.', 'fraca', 'Endocrine Society 2014', ['metirosina']));
        if (p.pa_controlada === 'nao') alerts.push(R('AD-PPGL-06', 'Metas de PA/FC não atingidas: aumentar alfa-bloqueio e adiar a cirurgia; a crise intraoperatória e a hipotensão pós-clampeamento são as principais causas de morbidade.', 'alerta', 'Endocrine Society 2014'));
      } else alerts.push(R('AD-PPGL-07', 'Tumor bioquimicamente silencioso (dopaminérgico ou não secretor): ainda assim alfa-bloqueio profilático é prudente em paraganglioma com captação funcional; confirmar diagnóstico por imagem funcional.', 'alerta', 'Endocrine Society 2014'));
      // via cirúrgica
      if (local === 'extra') out.push(R('AD-PPGL-09', `Paraganglioma${size !== null && size > 6 ? ' > 6 cm' : ''}: ressecção aberta ou laparoscópica conforme tamanho e relação vascular (órgão de Zuckerkandl, para-aórtico, bexiga — RTU contraindicada sem preparo); linfadenectomia regional se suspeita de malignidade.`, 'forte', 'Endocrine Society 2014', ['adrenalectomia_aberta', 'adrenalectomia_lap'], { kind: 'padrao' }));
      else if (local === 'bilateral' || hered) out.push(R('AD-PPGL-08', 'Bilateral ou hereditário (VHL, MEN2, MAX, NF1): adrenalectomia poupadora de córtex (deixar ~1/3 de uma glândula, com veia preservada) para evitar insuficiência adrenal permanente; recidiva ipsilateral 10–15% é aceita; laparoscópica ou retroperitoneoscópica.', 'moderada', 'Endocrine Society 2014; ESE 2016', ['adrenalectomia_lap', 'hidrocortisona'], { kind: 'padrao' }));
      else if ((size !== null && size > 6) || p.invasao === 'sim') out.push(R('AD-PPGL-10', 'Feocromocitoma > 6 cm ou com sinais de invasão: adrenalectomia aberta em bloco, com linfadenectomia regional, para evitar ruptura e carcinomatose.', 'forte', 'Endocrine Society 2014 (sugestão)', ['adrenalectomia_aberta'], { kind: 'padrao' }));
      else out.push(R('AD-PPGL-11', 'Feocromocitoma < 6 cm sem invasão: adrenalectomia laparoscópica transperitoneal ou retroperitoneoscópica, com manipulação mínima e ligadura precoce da veia adrenal.', 'forte', 'Endocrine Society 2014 (forte)', ['adrenalectomia_lap'], { kind: 'padrao' }));
      out.push(R('AD-PPGL-12', 'Pós-operatório: UTI/semi-intensiva 24 h (hipotensão, hipoglicemia de rebote); metanefrinas em 2–6 semanas para confirmar cura; hidrocortisona se bilateral ou poupadora com dúvida de função.', 'padrao', 'Endocrine Society 2014', ['hidrocortisona']));
      if (gen === 'sdhb') alerts.push(R('AD-PPGL-13', 'SDHB: maior risco metastático (até 40%) e de paraganglioma extra-adrenal; imagem funcional (DOTATATE ou FDG) antes da cirurgia e seguimento vitalício.', 'alerta', 'Endocrine Society 2014; ESE 2016'));
      if (p.gestante === 'sim') alerts.push(R('AD-PPGL-14', 'Gestante: alfa-bloqueio (fenoxibenzamina ou doxazosina) e cirurgia no 2º trimestre se diagnóstico < 24 semanas; após, cesárea eletiva com ressecção no mesmo tempo ou após; RM, sem TC nem MIBG.', 'alerta', 'Endocrine Society 2014'));
      out.push(R('AD-PPGL-15', 'Não existe critério histológico confiável de malignidade (PASS/GAPP não recomendados): "metastático" é doença onde não há tecido cromafim; todo paciente precisa de seguimento bioquímico anual.', 'padrao', 'OMS 2022; ESE 2016'));
      return { out, alerts, pend, info, followup: { img: hered || gen === 'nt' || (size !== null && size > 5) || local !== 'adrenal' || (num(p.idade) !== null && num(p.idade) < 20) ? 'Vitalício: metanefrinas anuais; imagem (RM corporal ou DOTATATE) a cada 1–2 anos se SDHB, ou se tumor não secretor' : 'Mínimo 10 anos: metanefrinas anuais; imagem só se bioquímica alterada', lab: 'Metanefrinas plasmáticas ou urinárias 2–6 semanas após a cirurgia e depois anualmente; PA', stop: hered ? 'Nunca (hereditário); rastrear familiares de 1º grau com teste genético e bioquímica anual' : 'Após 10 anos em esporádico, adrenal, < 5 cm, > 20 anos' } };
    }
    // metastático
    const sstr = p.sstr || 'nt', mibg = p.mibg || 'nt';
    const ritmo = p.ritmo || 'lento', volume = p.volume || 'baixo';
    const prev = new Set(p.previos || []);       // prrt | mibg | cvd | tmz | suni | belzu | cabo
    const sites = p.sitios || [];
    info.met = 'Metastático · ' + (ritmo === 'lento' ? 'progressão lenta' : 'progressão rápida') + ' · volume ' + volume + (sstr === 'pos' ? ' · SSTR positivo' : sstr === 'neg' ? ' · SSTR negativo' : '') + (mibg === 'pos' ? ' · MIBG positivo' : '') + (prev.size ? ' · prévios: ' + [...prev].map((k) => ({ prrt: 'Lu-177 DOTATATE', mibg: 'I-131 MIBG', cvd: 'CVD', tmz: 'temozolomida', suni: 'sunitinibe', belzu: 'belzutifano', cabo: 'cabozantinibe' })[k] || k).join(', ') : '');
    if (sstr === 'nt') pend.push(R('AD-PPGL-20', 'Ga-68 DOTATATE PET/CT (preferida) e, se radioterapia com MIBG for cogitada, cintilografia I-123/I-131 MIBG com SPECT; FDG-PET em SDHB ou doença óssea.', 'padrao', 'EANM 2019; NCCN v1.2026', ['dotatate_pet']));
    if (fen !== 'normal') out.push(R('AD-PPGL-21', 'Alfa-bloqueio contínuo (doxazosina ou fenoxibenzamina) ± metirosina em todo metastático secretor; ajustar antes de qualquer procedimento, radiofármaco ou quimioterapia (liberação de catecolaminas).', 'forte', 'Endocrine Society 2014; NCCN', ['doxazosina', 'metirosina'], { kind: 'padrao' }));
    if (ritmo === 'lento' && volume === 'baixo') out.push(R('AD-PPGL-22', 'Doença indolente de baixo volume: vigilância ativa com imagem a cada 3–6 meses e tratamento local (ressecção, SBRT, ablação, embolização) das lesões dominantes ou sintomáticas; muitos vivem > 10 anos.', 'moderada', 'NCCN v1.2026; ESE 2016', ['sbrt_adrenal'], { kind: 'padrao' }));
    if (sstr === 'pos' && !prev.has('prrt') && ritmo === 'lento') out.push(R('AD-PPGL-23', 'Lu-177 DOTATATE 7,4 GBq × 4 a cada 8 semanas (SSTR positivo, progressão lenta a moderada): resposta 20–40%, controle > 80%, PFS 2–3 anos em séries; registrado na ANVISA para TNE (off-label em PPGL).', 'moderada', 'NCCN v1.2026; ESE 2016; séries', ['lutathera'], { kind: volume === 'alto' || ritmo !== 'lento' ? 'padrao' : undefined }));
    if (mibg === 'pos' && !prev.has('mibg')) out.push(R('AD-PPGL-24', 'I-131 MIBG em dose alta (MIBG-ávido): resposta 20–30%, controle hormonal em ~50%; o MIBG de alta atividade específica (Azedra) foi descontinuado em 2024; disponibilidade irregular no Brasil (IPEN).', 'fraca', 'NCCN v1.2026', ['mibg']));
    if (ritmo === 'rapido' || volume === 'alto' || gen === 'sdhb') {
      if (!prev.has('cvd') && !prev.has('tmz')) out.push(R('AD-PPGL-25', 'Progressão rápida, alto volume ou SDHB: quimioterapia CVD (ciclofosfamida 750 mg/m² D1, vincristina 1,4 mg/m² D1, dacarbazina 600 mg/m² D1–2 a cada 21–28 dias) ou temozolomida 150–200 mg/m² D1–5 a cada 28 dias (melhor em SDHB): resposta 25–40%, controle hormonal 60–70%.', 'moderada', 'NCCN v1.2026; ESE 2016', ['cvd', 'temozolomida'], { kind: 'padrao' }));
    }
    if (!prev.has('suni')) out.push(R('AD-PPGL-26', 'Sunitinibe 37,5 mg/dia contínuo: FIRSTMAPPP (fase II randomizado) — PFS 8,9 vs 3,6 meses vs placebo, resposta 36%; HAS e fadiga; alfa-bloqueio antes.', 'moderada', 'FIRSTMAPPP 2024; NCCN v1.2026', ['sunitinibe_ppgl'], { kind: (ritmo === 'rapido' && (prev.has('cvd') || prev.has('tmz'))) || (sstr === 'neg' && ritmo !== 'lento') ? 'padrao' : undefined }));
    if (!prev.has('belzu')) out.push(R('AD-PPGL-27', `Belzutifano 120 mg/dia (80 mg se < 40 kg; ≥ 12 anos)${gen === 'vhl' || gen === 'outra' ? ' — preferido em VHL/EPAS1' : ''}: LITESPARK-015 — resposta 26%, duração mediana 20,4 meses, 32% reduziram anti-hipertensivo ≥ 50%; anemia e hipóxia (Hb e oximetria a cada ciclo). FDA mai/2025; sem registro ANVISA para PPGL (registrado para VHL).`, gen === 'vhl' ? 'moderada' : 'fraca', 'LITESPARK-015; FDA 14/05/2025; NCCN v1.2026', ['belzu_ppgl'], { kind: gen === 'vhl' ? 'padrao' : undefined }));
    if (!prev.has('cabo')) out.push(R('AD-PPGL-28', 'Cabozantinibe 60 mg/dia: NATALIE (fase II) — resposta 25%, PFS 16,6 meses; alternativa após sunitinibe.', 'fraca', 'NATALIE 2024; NCCN v1.2026', ['cabo_acc']));
    if (sites.includes('osso')) out.push(R('AD-PPGL-29', 'Metástase óssea (70% dos metastáticos): ácido zoledrônico ou denosumabe, radioterapia paliativa ou SBRT, fixação em fratura iminente; alfa-bloqueio antes de procedimentos.', 'moderada', 'NCCN v1.2026', ['zoledronico']));
    if (!out.some((o) => !['nao', 'ensaio'].includes(o.strength))) out.push(R('AD-PPGL-32', 'Todas as linhas disponíveis já foram usadas: ensaio clínico; retratamento com a terapia de melhor e mais longa resposta prévia; tratamento local das lesões dominantes (SBRT, embolização, ablação, cirurgia de citorredução); cuidados paliativos e controle hormonal (alfa-bloqueio, metirosina) se secretor.', 'fraca', 'NCCN v1.2026', [], { kind: 'padrao' }));
    out.push(R('AD-PPGL-30', 'Ensaio clínico em qualquer linha; inibidores de HIF-2α de nova geração, PRRT com alfa-emissores e combinações estão em estudo.', 'ensaio', 'NCCN v1.2026'));
    alerts.push(R('AD-PPGL-31', 'Antes de radiofármaco, quimioterapia ou embolização: alfa-bloqueio otimizado e, se secreção alta, metirosina; hidratação; monitorar crise nas 24–72 h.', 'alerta', 'NCCN v1.2026'));
    return { out, alerts, pend, info };
  }

  /* ---------- Módulo 4 – aldosteronoma, Cushing, MACS e metástase ---------- */
  function benign(p) {
    const out = [], alerts = [], pend = [], info = {};
    const tipo = p.tipo || 'aldo';               // aldo | cushing | macs | met
    const idade = num(p.idade), tfg = num(p.tfg);
    if (tipo === 'aldo') {
      const avs = p.avs || 'nao_feito';         // lateraliza | bilateral | nao_feito
      const apto = p.saude !== 'fragil' && p.candidato !== 'nao';
      const fav = [idade !== null && idade <= 50, (num(p.has_anos) ?? 99) <= 10, (num(p.n_drogas) ?? 9) <= 2, p.sexo === 'f', tfg === null || tfg >= 60].filter(Boolean).length;
      const cura = fav >= 4 ? 'alta (~60–75%)' : fav >= 2 ? 'intermediária (~35–50%)' : 'baixa (~15–30%)';
      info.status = 'Aldosteronismo primário' + (avs === 'lateraliza' ? ' lateralizado (unilateral)' : avs === 'bilateral' ? ' bilateral' : ', lateralização não definida');
      if (avs !== 'bilateral') info.cura = `Probabilidade de cura clínica da hipertensão com adrenalectomia: ${cura} (${fav}/5 fatores favoráveis: idade ≤ 50, HAS ≤ 10 anos, ≤ 2 drogas, sexo feminino, TFG ≥ 60); cura bioquímica ~95%`;
      if (avs === 'nao_feito') {
        const jovem = idade !== null && idade < 35 && p.hipok === 'sim' && p.aldo_alta === 'sim' && p.adenoma_tc === 'unilateral';
        if (jovem) out.push(R('AD-ALDO-00', 'Menor de 35 anos com hipocalemia, aldosterona > 30 ng/dL e adenoma unilateral > 1 cm com contralateral normal: cateterismo de veias adrenais pode ser omitido e a adrenalectomia indicada pela TC.', 'fraca', 'Endocrine Society 2016/2025 (exceção clássica)', ['adrenalectomia_lap']));
        else pend.push(R('AD-ALDO-01', 'Cateterismo de veias adrenais (AVS) com ou sem estímulo com ACTH antes de qualquer adrenalectomia: a TC erra a lateralização em até 40%; adenoma na TC pode ser não funcionante e a hiperplasia bilateral é frequente após os 40 anos.', 'padrao', 'Endocrine Society 2025 (forte)', ['avs']));
        out.push(R('AD-ALDO-02', 'Enquanto aguarda a lateralização: espironolactona 25–50 mg/dia (ou eplerenona 50 mg 2×/dia) com potássio e creatinina em 1 e 4 semanas; suspender 4 semanas antes do AVS se for repetir dosagens.', 'moderada', 'Endocrine Society 2025', ['espironolactona']));
      }
      if (avs === 'lateraliza' && apto) {
        out.push(R('AD-ALDO-03', 'Adrenalectomia laparoscópica (ou retroperitoneoscópica) unilateral: cura bioquímica ~95%, cura clínica da hipertensão 30–50% (melhor em jovens, HAS curta, poucas drogas); suspender espironolactona e potássio no pós-operatório; aldosterona/renina em 1–3 meses.', 'forte', 'Endocrine Society 2025 (forte); critérios PASO', ['adrenalectomia_lap'], { kind: 'padrao' }));
        out.push(R('AD-ALDO-04', 'Antagonista mineralocorticoide é alternativa para quem prefere não operar: espironolactona titulada até renina detectável (não suprimida), que normaliza o risco cardiovascular.', 'moderada', 'Endocrine Society 2025', ['espironolactona']));
        alerts.push(R('AD-ALDO-05', 'Hipoaldosteronismo transitório pós-operatório (hipercalemia, hipotensão) em 5–10%: dosar potássio e creatinina na 1ª semana; evitar potássio e MRA após a cirurgia; fludrocortisona breve se necessário.', 'alerta', 'Endocrine Society 2016'));
      } else if (avs === 'lateraliza' && !apto) {
        out.push(R('AD-ALDO-06', 'Lateralizado mas inapto ou não desejando cirurgia: espironolactona 25–100 mg/dia (ou eplerenona 50–200 mg/dia, menos ginecomastia) titulada até renina detectável; potássio e creatinina em 1 e 4 semanas.', 'forte', 'Endocrine Society 2025 (forte)', ['espironolactona'], { kind: 'padrao' }));
      } else if (avs === 'bilateral') {
        out.push(R('AD-ALDO-07', 'Hiperaldosteronismo bilateral: espironolactona 25–100 mg/dia (ou eplerenona) titulada até renina detectável; adrenalectomia não indicada; rastrear hiperaldosteronismo familiar se < 20 anos ou história familiar.', 'forte', 'Endocrine Society 2025 (forte)', ['espironolactona'], { kind: 'padrao' }));
        out.push(R('AD-ALDO-08', 'Não fazer adrenalectomia unilateral ou bilateral em doença bilateral.', 'nao', 'Endocrine Society 2025'));
      }
      if (tfg !== null && tfg < 45) alerts.push(R('AD-ALDO-09', `TFG ${tfg} mL/min: a queda aparente de TFG após cura do aldosteronismo (desmascarar DRC pela perda da hiperfiltração) é esperada; MRA com cautela (hipercalemia).`, 'alerta', 'Endocrine Society 2025'));
      return { out, alerts, pend, info, followup: { img: 'Nenhuma imagem de rotina após cirurgia', lab: 'Aldosterona, renina e potássio em 1–3 meses (cura bioquímica); PA e número de drogas em 6–12 meses (cura clínica, PASO); se em MRA, renina anual como meta', stop: 'Alta após cura bioquímica confirmada e PA controlada' } };
    }
    if (tipo === 'cushing' || tipo === 'macs') {
      const grave = p.cushing_grave === 'sim';
      info.status = tipo === 'cushing' ? 'Cushing clínico ACTH-independente' + (p.bilateral === 'sim' ? ', bilateral (hiperplasia macronodular provável)' : ', adenoma unilateral') : 'Secreção autônoma leve de cortisol (MACS)' + (p.comorb === 'sim' ? ' com comorbidade atribuível' : ' sem comorbidade atribuível');
      if (tipo === 'cushing') {
        if (p.bilateral !== 'sim') out.push(R('AD-CUSH-01', 'Adrenalectomia laparoscópica unilateral: cura do hipercortisolismo em > 95%; hidrocortisona 100 mg IV na indução, 50 mg 8/8 h no 1º dia, depois 20–30 mg/dia VO com desmame por 6–18 meses até cortisol basal > 10 µg/dL ou teste de ACTH normal.', 'forte', 'ESE/ENSAT 2023; Endocrine Society 2015', ['adrenalectomia_lap', 'hidrocortisona'], { kind: 'padrao' }));
        else out.push(R('AD-CUSH-02', 'Hiperplasia macronodular bilateral (ARMC5): adrenalectomia unilateral da glândula maior controla a maioria; bilateral só em Cushing grave, com reposição vitalícia de hidrocortisona 15–25 mg + fludrocortisona 0,05–0,2 mg.', 'moderada', 'Endocrine Society 2015; séries', ['adrenalectomia_lap', 'hidrocortisona'], { kind: 'padrao' }));
        if (grave) out.push(R('AD-CUSH-03', 'Cushing grave (hipocalemia, infecção, psicose, TEV, cortisol urinário > 5× o limite): bloqueio pré-operatório por 4–12 semanas com cetoconazol 400–1.200 mg/dia, osilodrostat 2–30 mg 2×/dia ou metirapona (importação), em bloqueio-e-reposição; profilaxia de tromboembolismo; controle de glicemia e potássio.', 'forte', 'Endocrine Society 2015; ESE/ENSAT 2023', ['cetoconazol', 'osilodrostat', 'metirapona']));
        alerts.push(R('AD-CUSH-04', 'Risco perioperatório do Cushing: tromboembolismo (profilaxia estendida 2–4 semanas), infecção, má cicatrização, crise adrenal no desmame; educar paciente e família sobre dose de estresse e injeção de emergência.', 'alerta', 'Endocrine Society 2015', ['hidrocortisona']));
      } else {
        if (p.comorb === 'sim' && p.bilateral !== 'sim') out.push(R('AD-CUSH-05', 'MACS com comorbidade atribuível em lesão unilateral: discutir adrenalectomia laparoscópica (melhora de PA e glicemia em 50–70% nas séries; ensaio randomizado pequeno favorável), pesando idade, cortisol pós-dexametasona e gravidade; hidrocortisona de estresse e seguimento até recuperar o eixo.', 'moderada', 'ESE/ENSAT 2023 (sugestão)', ['adrenalectomia_lap', 'hidrocortisona'], { kind: 'padrao' }));
        else out.push(R('AD-CUSH-06', 'MACS sem comorbidade atribuível ou bilateral: tratamento clínico das comorbidades e reavaliação anual (PA, glicemia, densitometria); sem cirurgia.', 'forte', 'ESE/ENSAT 2023', [], { kind: 'padrao' }));
        out.push(R('AD-CUSH-07', 'Não repetir imagem se a lesão é benigna; não repetir dexametasona de rotina — só se piora clínica.', 'padrao', 'ESE/ENSAT 2023'));
      }
      return { out, alerts, pend, info, followup: { img: 'Nenhuma imagem de rotina', lab: 'Cortisol basal às 8 h durante o desmame de hidrocortisona (mensal a cada redução); teste de ACTH ao final; comorbidades anuais', stop: 'Até recuperação do eixo (6–18 meses) e controle das comorbidades' } };
    }
    // metástase adrenal
    const isolada = p.isolada === 'sim', controlado = p.primario_controlado === 'sim', intervalo = p.intervalo || '>12';
    const ps = num(p.ecog) ?? 0;
    info.status = 'Metástase adrenal' + (p.primario_tipo ? ' de ' + p.primario_tipo : '') + (isolada ? ', isolada' : ', com outras metástases') + (p.bilateral === 'sim' ? ', bilateral' : '');
    if (p.feo_excluido !== 'sim') pend.push(R('AD-MET-00', 'Excluir feocromocitoma (metanefrinas) antes de biópsia, ablação ou cirurgia; a biópsia só se o resultado mudar a conduta (FDG-PET pode bastar).', 'padrao', 'ESE/ENSAT 2023 (forte)', ['metanefrinas_plasma']));
    if (p.bilateral === 'sim') alerts.push(R('AD-MET-01', 'Metástases bilaterais: avaliar insuficiência adrenal (cortisol às 8 h, ACTH, teste de estímulo) e repor hidrocortisona se necessário.', 'alerta', 'ESE/ENSAT 2023', ['hidrocortisona']));
    if (isolada && controlado && intervalo === '>12' && ps <= 1) {
      out.push(R('AD-MET-02', 'Metástase adrenal isolada com primário controlado, intervalo livre > 6–12 meses e bom performance: adrenalectomia (laparoscópica se < 6 cm sem invasão; aberta se invasiva) — sobrevida 5 anos 25–40%, melhor em pulmão não pequenas células e carcinoma renal.', 'moderada', 'ESE/ENSAT 2023; séries', ['adrenalectomia_lap', 'adrenalectomia_aberta'], { kind: 'padrao' }));
      out.push(R('AD-MET-03', 'SBRT 30–45 Gy em 3–5 frações (controle local 80–90%) ou ablação percutânea (com alfa-bloqueio profilático) como alternativa não cirúrgica.', 'moderada', 'NCCN; séries', ['sbrt_adrenal']));
    } else if (isolada) {
      out.push(R('AD-MET-04', `Metástase isolada mas ${!controlado ? 'primário não controlado' : intervalo !== '>12' ? 'intervalo livre curto' : 'performance limitado'}: terapia sistêmica do tumor primário; SBRT ou adrenalectomia só se oligoprogressão ou sintomas.`, 'moderada', 'NCCN; ESE/ENSAT 2023', ['sbrt_adrenal'], { kind: 'padrao' }));
    } else {
      out.push(R('AD-MET-05', 'Múltiplas metástases: tratamento sistêmico conforme o primário; a adrenal só se sintomática (dor, hemorragia) ou oligoprogressiva — SBRT preferida.', 'forte', 'NCCN', ['sbrt_adrenal'], { kind: 'padrao' }));
    }
    return { out, alerts, pend, info };
  }

  /* ---------- Disponibilidade no Brasil ---------- */
  const BR = {
    adrenalectomia_lap: { sus: 'ok', ans: 'ok', nota: 'Robótica sem remuneração específica' },
    adrenalectomia_aberta: { sus: 'ok', ans: 'ok', nota: '' },
    avs: { sus: 'lim', ans: 'ok*', nota: 'Poucos centros com radiologia intervencionista experiente em cateterismo adrenal' },
    metanefrinas_plasma: { sus: 'lim', ans: 'ok', nota: 'Urinárias fracionadas mais acessíveis no SUS' },
    perfil_esteroides: { sus: 'nao', ans: 'lim', nota: 'Espectrometria em laboratórios de referência' },
    dotatate_pet: { sus: 'lim', ans: 'ok', nota: 'Poucos centros SUS; FDOPA raro' },
    mitotano: { sus: 'lim', ans: 'pleit', nota: 'Sem registro ANVISA ativo; importação simplificada (jul/2025); fornecimento SUS por decisão TRF2 (jan/2026)' },
    edp: { sus: 'ok', ans: 'ok', nota: 'Etoposide, doxorrubicina e cisplatina via APAC' },
    carbo_eto: { sus: 'ok', ans: 'ok', nota: '' },
    gemcape: { sus: 'ok*', ans: 'ok*', nota: 'Off-label em ACC' },
    estreptozocina: { sus: 'reg', ans: 'reg', nota: 'Sem registro ANVISA; importação' },
    temozolomida: { sus: 'ok*', ans: 'ok*', nota: 'Off-label em ACC e PPGL' },
    pembro_acc: { sus: 'nao', ans: 'pleit', nota: 'Off-label; MSI-H pode ter cobertura' },
    cabo_acc: { sus: 'nao', ans: 'pleit', nota: 'Off-label (registrado para CCR e TNE)' },
    rt_leito: { sus: 'ok', ans: 'ok', nota: '' },
    sbrt_adrenal: { sus: 'lim', ans: 'ok', nota: 'Estereotaxia em poucos centros SUS' },
    cetoconazol: { sus: 'ok*', ans: 'ok*', nota: 'Off-label para hipercortisolismo' },
    osilodrostat: { sus: 'nao', ans: 'conf', nota: 'Registro ANVISA para Cushing a confirmar; alto custo' },
    metirapona: { sus: 'reg', ans: 'reg', nota: 'Sem registro; importação para uso pessoal' },
    metirosina: { sus: 'reg', ans: 'reg', nota: 'Sem registro; importação' },
    doxazosina: { sus: 'ok', ans: 'ok', nota: 'Fenoxibenzamina sem registro (importação)' },
    hidrocortisona: { sus: 'ok', ans: 'ok', nota: '' },
    espironolactona: { sus: 'ok', ans: 'ok', nota: 'Eplerenona disponível no convênio; não no SUS' },
    lutathera: { sus: 'nao', ans: 'ok*', nota: 'Registrado para TNE gastroenteropancreáticos; off-label em PPGL; poucos centros' },
    mibg: { sus: 'lim', ans: 'ok*', nota: 'I-131 MIBG terapêutico (IPEN) com oferta irregular' },
    sunitinibe_ppgl: { sus: 'nao', ans: 'pleit', nota: 'Off-label (registrado para CCR, GIST, TNE)' },
    belzu_ppgl: { sus: 'nao', ans: 'pleit', nota: 'Registrado para VHL e adjuvância de CCR; PPGL sem registro (FDA mai/2025)' },
    cvd: { sus: 'ok', ans: 'ok', nota: '' },
    zoledronico: { sus: 'ok', ans: 'ok', nota: '' },
    teste_germinativo: { sus: 'lim', ans: 'ok*', nota: 'Painel hereditário no rol com critérios (a confirmar)' },
  };

  return { RULES, imgClass, hormClass, mass, ensat, acc, ppgl, benign, BR };
})();

/* Posologia – tumores da adrenal (ESE/ENSAT 2018/2023, ESMO 2020, Endocrine Society 2014/2015/2025, NCCN v1.2026, bulas). Revisão clínica obrigatória antes do uso assistencial. */
const ADOSES = {
  /* ACC */
  mitotano: { cat: 'Carcinoma adrenocortical', nome: 'Mitotano', esquema: 'Esquema rápido: 1,5 g/dia e aumentar 0,5–1 g a cada 4–7 dias até 4–6 g/dia (dividido em 2–3 tomadas com alimento gorduroso); esquema lento: 3 g/dia e titular. Dosar nível sérico a cada 2–4 semanas até 14–20 mg/L, depois mensal; reduzir se > 20 mg/L ou toxicidade', duracao: 'Adjuvante: 2 anos (até 5); avançado: enquanto houver benefício', obs: 'Sem registro ANVISA ativo (importação simplificada; decisão TRF2). Repor hidrocortisona 30–50 mg/dia (aumenta CBG e clearance) e fludrocortisona se hipotensão/hiponatremia; TSH/T4L, lipídios, transaminases, testosterona (homem) a cada 3 meses. Indutor de CYP3A4: ajustar varfarina, estatinas, macrolídeos, anticoncepcional (usar não hormonal). Náusea, diarreia, ataxia, confusão, ginecomastia, rash. Meia-vida longa (semanas): nível cai lentamente após suspensão.' },
  edp: { cat: 'Carcinoma adrenocortical', nome: 'EDP-M (etoposide, doxorrubicina, cisplatina + mitotano)', esquema: 'Etoposide 100 mg/m² IV D2, D3 e D4; doxorrubicina 40 mg/m² IV D1; cisplatina 40 mg/m² IV D3 e D4; ciclo de 28 dias; mitotano contínuo (alvo 14–20 mg/L)', duracao: '6–8 ciclos (reavaliar a cada 2–3)', obs: 'FIRM-ACT: resposta 23%, PFS 5 meses. Hidratação e antiemese para cisplatina; FEVE basal e a cada 2 ciclos (dose cumulativa de doxorrubicina ≤ 450 mg/m²); G-CSF se neutropenia febril; audiometria e creatinina.' },
  carbo_eto: { cat: 'Carcinoma adrenocortical', nome: 'Etoposide + carboplatina + mitotano (inapto a cisplatina/antraciclina)', esquema: 'Carboplatina AUC 5 D1 + etoposide 100 mg/m² D1–3 a cada 21 dias, com mitotano', duracao: '4–6 ciclos', obs: 'Séries pequenas; menos nefro/ototoxicidade; mielossupressão.' },
  gemcape: { cat: 'Carcinoma adrenocortical', nome: 'Gemcitabina + capecitabina (2ª linha)', esquema: 'Gemcitabina 800 mg/m² IV D1 e D8 + capecitabina 1.500 mg/dia VO contínua; ciclo de 21 dias', duracao: 'Até progressão ou toxicidade; reavaliar a cada 3 ciclos', obs: 'Resposta 5–7%, controle de doença 30–45%, PFS ~3 meses. Síndrome mão-pé, mielossupressão; ajustar capecitabina pela TFG.' },
  estreptozocina: { cat: 'Carcinoma adrenocortical', nome: 'Estreptozocina + mitotano', esquema: 'Estreptozocina 1 g/dia IV × 5 dias; depois 2 g IV a cada 3 semanas, com mitotano', duracao: 'Até progressão', obs: 'FIRM-ACT (braço comparador): resposta 9%. Nefrotoxicidade (creatinina e proteinúria antes de cada dose), náusea intensa, hiperglicemia. Sem registro ANVISA.' },
  temozolomida: { cat: 'Carcinoma adrenocortical', nome: 'Temozolomida', esquema: '150–200 mg/m² VO D1–5 a cada 28 dias (ACC: séries; PPGL: melhor em SDHB/MGMT metilado)', duracao: 'Até progressão; reavaliar a cada 3 ciclos', obs: 'Mielossupressão tardia (plaquetas D21–28), náusea; profilaxia de Pneumocystis se linfopenia prolongada.' },
  pembro_acc: { cat: 'Carcinoma adrenocortical', nome: 'Pembrolizumabe (ACC, off-label)', esquema: '200 mg IV a cada 3 semanas ou 400 mg a cada 6 semanas', duracao: 'Até progressão, toxicidade ou 2 anos', obs: 'Resposta 14–23% (maior em MSI-H/dMMR); controlar hipercortisolismo antes (cortisol alto reduz eficácia e aumenta infecção). Eventos imunomediados: TSH, cortisol, glicemia, transaminases a cada ciclo.' },
  cabo_acc: { cat: 'Carcinoma adrenocortical', nome: 'Cabozantinibe (ACC / PPGL, off-label)', esquema: '60 mg VO 1×/dia em jejum (reduções 40 → 20 mg)', duracao: 'Até progressão ou toxicidade', obs: 'ACC fase II: resposta 11%, controle 78%, PFS 6 meses; mitotano prévio reduz a concentração. PPGL (NATALIE): resposta 25%, PFS 16,6 meses. HAS, diarreia, síndrome mão-pé, lipase, transaminases.' },
  rt_leito: { cat: 'Radioterapia', nome: 'Radioterapia adjuvante do leito (ACC R1/Rx ou estádio III)', esquema: '50–60 Gy em 25–30 frações no leito tumoral e margens, IMRT/VMAT', duracao: '5–6 semanas, iniciar em até 3 meses da cirurgia (junto do mitotano)', obs: 'Reduz recidiva local (séries); sem ganho de sobrevida comprovado. Toxicidade renal, hepática e intestinal conforme lado.' },
  sbrt_adrenal: { cat: 'Radioterapia', nome: 'SBRT adrenal (metástase ou recidiva)', esquema: '30–45 Gy em 3–5 frações (ex.: 36 Gy em 3; 40 Gy em 5); gating respiratório', duracao: '1–2 semanas', obs: 'Controle local 80–90%. Em feocromocitoma ou metástase de feocromocitoma: alfa-bloqueio antes (crise). Toxicidade: náusea, gastrite/duodenite (esquerda/direita), insuficiência adrenal se bilateral.' },
  /* Bloqueio de cortisol e reposição */
  cetoconazol: { cat: 'Hipercortisolismo', nome: 'Cetoconazol (off-label)', esquema: '200 mg VO 2–3×/dia, aumentar a cada 3–7 dias até 400–1.200 mg/dia (cortisol urinário ou sérico como alvo)', duracao: 'Pré-operatório 4–12 semanas ou enquanto necessário', obs: 'Hepatotoxicidade: transaminases semanais no 1º mês, depois mensais; suspender se > 3× o limite. Precisa de acidez gástrica (evitar IBP). Inibe CYP3A4 (interações). Hipogonadismo no homem. Reposição com hidrocortisona em bloqueio-e-reposição.' },
  osilodrostat: { cat: 'Hipercortisolismo', nome: 'Osilodrostat', esquema: '2 mg VO 2×/dia; titular a cada 1–2 semanas (até 30 mg 2×/dia) pelo cortisol urinário/sérico', duracao: 'Enquanto necessário', obs: 'Potente inibidor da 11β-hidroxilase: hipocalemia, HAS e edema por acúmulo de precursores; prolongamento de QT (ECG basal); hirsutismo. Registro ANVISA para Cushing a confirmar; alto custo. Risco de insuficiência adrenal: bloqueio-e-reposição.' },
  metirapona: { cat: 'Hipercortisolismo', nome: 'Metirapona (importação)', esquema: '250 mg–1 g VO 3–4×/dia (até 6 g/dia), titulando pelo cortisol', duracao: 'Enquanto necessário', obs: 'Ação rápida (horas); hipocalemia, HAS, hirsutismo/acne (andrógenos), náusea. Sem registro ANVISA. Bloqueio-e-reposição com hidrocortisona.' },
  mifepristona: { cat: 'Hipercortisolismo', nome: 'Mifepristona (importação)', esquema: '300 mg/dia VO, aumentar 300 mg a cada 2–4 semanas até 1.200 mg/dia', duracao: 'Enquanto necessário', obs: 'Bloqueia o receptor: cortisol e ACTH sobem (não servem de monitor; usar glicemia, PA, potássio e clínica); hipocalemia, endométrio espesso, insuficiência adrenal clínica tratada com dexametasona. Sem registro ANVISA.' },
  etomidato: { cat: 'Hipercortisolismo', nome: 'Etomidato (Cushing grave, UTI)', esquema: 'Bolus 0,03 mg/kg IV, depois 0,03–0,1 mg/kg/h em infusão contínua, titulando cortisol a cada 4–6 h (alvo 10–20 µg/dL)', duracao: 'Dias, até ponte para cirurgia ou oral', obs: 'Em UTI com monitorização; sedação em doses maiores; mioclonias; propilenoglicol (acidose) em formulações.' },
  hidrocortisona: { cat: 'Hipercortisolismo', nome: 'Hidrocortisona – estresse cirúrgico e reposição', esquema: 'Indução: 100 mg IV; 50 mg IV 8/8 h no 1º dia; 20–30 mg/dia VO (2/3 manhã, 1/3 tarde) a partir do 2º–3º dia; desmame de 2,5–5 mg a cada 2–4 semanas até 10–15 mg/dia, depois testar eixo (cortisol basal às 8 h > 10 µg/dL ou teste de ACTH) antes de suspender. Em uso de mitotano: 30–50 mg/dia. Dose de estresse: dobrar/triplicar em doença intercorrente; 100 mg IM/IV se vômitos', duracao: 'Desmame 6–18 meses após adrenalectomia por Cushing/MACS; vitalício após adrenalectomia bilateral (15–25 mg + fludrocortisona 0,05–0,2 mg)', obs: 'Educar paciente e família sobre crise adrenal (cartão, injeção de emergência). Quem fez teste de dexametasona > 1,8 µg/dL recebe dose de estresse na cirurgia (ESE/ENSAT 2023).' },
  /* PPGL */
  doxazosina: { cat: 'Feocromocitoma e paraganglioma', nome: 'Alfa-bloqueio pré-operatório', esquema: 'Doxazosina 2 mg/dia, aumentar 2–4 mg a cada 2–3 dias até 16–32 mg/dia (dividido); ou prazosina 1 mg 2–3×/dia até 15 mg/dia; ou fenoxibenzamina 10 mg 2×/dia até 1 mg/kg/dia (importação; mais hipotensão pós-operatória). Metas: PA sentado < 130/80, sistólica em pé > 90 mmHg; FC 60–70 sentado, 70–80 em pé', duracao: '7–14 dias antes da cirurgia; contínuo no metastático', obs: 'Dieta rica em sal (> 5 g) e líquidos nos 3 dias anteriores; bloqueador de cálcio (anlodipino 5–10 mg) como adjuvante. Hipotensão ortostática e congestão nasal esperadas.' },
  betabloq: { cat: 'Feocromocitoma e paraganglioma', nome: 'Beta-bloqueio (só após alfa)', esquema: 'Propranolol 10–40 mg 3×/dia ou atenolol 25–50 mg/dia, iniciando 3–4 dias após o alfa-bloqueio, se FC > 80–90 ou arritmia', duracao: 'Até a cirurgia', obs: 'Nunca antes do alfa-bloqueio (crise hipertensiva por alfa sem oposição, edema pulmonar). Labetalol não é substituto adequado (alfa fraco).' },
  metirosina: { cat: 'Feocromocitoma e paraganglioma', nome: 'Metirosina (alfa-metil-paratirosina; importação)', esquema: '250 mg VO 4×/dia, aumentar 250–500 mg/dia a cada 2–3 dias até 1–4 g/dia', duracao: '1–3 semanas antes da cirurgia; contínuo no metastático secretor', obs: 'Inibe a síntese de catecolaminas; sedação, depressão, diarreia, cristalúria (hidratar), sintomas extrapiramidais. Sem registro ANVISA.' },
  cvd: { cat: 'Feocromocitoma e paraganglioma', nome: 'CVD (ciclofosfamida, vincristina, dacarbazina)', esquema: 'Ciclofosfamida 750 mg/m² IV D1; vincristina 1,4 mg/m² (máx. 2 mg) IV D1; dacarbazina 600 mg/m² IV D1 e D2; ciclo de 21–28 dias', duracao: '6 ciclos; manter se resposta e tolerância', obs: 'Resposta 25–40%, controle hormonal 60–70%; melhor em SDHB e doença rápida. Alfa-bloqueio otimizado antes (liberação de catecolaminas nas primeiras 24–72 h); neuropatia (vincristina), mielossupressão, cistite (mesna/hidratação).' },
  sunitinibe_ppgl: { cat: 'Feocromocitoma e paraganglioma', nome: 'Sunitinibe (PPGL, off-label)', esquema: '37,5 mg VO 1×/dia contínuo (reduções 25 mg)', duracao: 'Até progressão ou toxicidade', obs: 'FIRSTMAPPP: PFS 8,9 vs 3,6 meses vs placebo; resposta 36%. HAS (ajustar alfa-bloqueio), fadiga, síndrome mão-pé, hipotireoidismo, mielossupressão.' },
  belzu_ppgl: { cat: 'Feocromocitoma e paraganglioma', nome: 'Belzutifano (PPGL)', esquema: '120 mg VO 1×/dia (≥ 12 anos e ≥ 40 kg; 80 mg se < 40 kg); reduções 80 → 40 mg', duracao: 'Até progressão ou toxicidade', obs: 'LITESPARK-015: resposta 26%, duração 20,4 meses, 32% reduziram anti-hipertensivo ≥ 50%. Anemia (Hb a cada ciclo; eritropoetina permitida) e hipóxia (SpO2 em repouso/esforço; suspender se < 88%); teratogênico (contracepção não hormonal). FDA mai/2025; sem registro ANVISA para PPGL.' },
  lutathera: { cat: 'Feocromocitoma e paraganglioma', nome: 'Lu-177 DOTATATE (PRRT, off-label em PPGL)', esquema: '7,4 GBq (200 mCi) IV a cada 8 semanas × 4 ciclos, com infusão de aminoácidos (lisina/arginina) para proteção renal', duracao: '4 ciclos em ~6 meses; reciclo possível', obs: 'Requer SSTR positivo (captação ≥ fígado no DOTATATE PET). Resposta 20–40%, controle > 80%. Mielossupressão, nefrotoxicidade (TFG ≥ 50), náusea; crise catecolaminérgica em 24–72 h (alfa-bloqueio otimizado, internação). Registrado na ANVISA para TNE gastroenteropancreáticos.' },
  mibg: { cat: 'Feocromocitoma e paraganglioma', nome: 'I-131 MIBG terapêutico', esquema: '3,7–11,1 GBq (100–300 mCi) por dose, 1–3 doses com intervalo de 3–6 meses; bloqueio tireoidiano com iodeto de potássio 48 h antes a 10–15 dias depois', duracao: 'Conforme resposta', obs: 'Requer captação em cintilografia MIBG; suspender fármacos que bloqueiam captação (labetalol, tricíclicos, bloqueadores de cálcio) 1–2 semanas antes. Resposta 20–30%; mielossupressão (plaquetas), hipotireoidismo. Azedra (alta atividade específica) descontinuado em 2024; oferta nacional irregular (IPEN).' },
  /* Aldosteronismo */
  espironolactona: { cat: 'Aldosteronismo primário', nome: 'Antagonista mineralocorticoide', esquema: 'Espironolactona 25 mg/dia, aumentar 25 mg a cada 2–4 semanas até 100 mg/dia (raramente 200); ou eplerenona 25–50 mg 2×/dia até 200 mg/dia (menos ginecomastia). Meta 2025: renina não suprimida (detectável), PA e potássio normais', duracao: 'Contínuo (doença bilateral ou inapto/recusa à cirurgia)', obs: 'Potássio e creatinina em 1 e 4 semanas e após cada ajuste; hipercalemia se TFG < 45 ou com IECA/BRA; ginecomastia e disfunção erétil (espironolactona) em 10–30%. Suspender 4 semanas antes de dosagens diagnósticas ou AVS.' },
  /* Suporte */
  zoledronico: { cat: 'Suporte', nome: 'Ácido zoledrônico / denosumabe (metástase óssea)', esquema: 'Ácido zoledrônico 4 mg IV a cada 4–12 semanas (ajuste renal) ou denosumabe 120 mg SC a cada 4 semanas', duracao: 'Enquanto houver metástase óssea', obs: 'Cálcio e vitamina D; avaliação odontológica (osteonecrose 1–3%); em PPGL, alfa-bloqueio antes de procedimentos ósseos.' },
};
const AOPT_DOSES = {
  'AD-HORM-10': ['doxazosina', 'betabloq'], 'AD-HORM-12': ['hidrocortisona'], 'AD-HORM-14': ['hidrocortisona'], 'AD-CIR-01': ['hidrocortisona'],
  'AD-IMG-10': ['hidrocortisona'],
  'AD-ACC-02': ['mitotano', 'edp'], 'AD-ACC-11': ['mitotano', 'edp', 'rt_leito'], 'AD-ACC-12': ['mitotano', 'hidrocortisona'], 'AD-ACC-13': ['rt_leito'], 'AD-ACC-14': ['mitotano', 'edp'],
  'AD-ACC-18': ['hidrocortisona'], 'AD-ACC-20': ['sbrt_adrenal'], 'AD-ACC-21': ['cetoconazol', 'osilodrostat', 'metirapona', 'hidrocortisona'], 'AD-ACC-22': ['mitotano', 'hidrocortisona'], 'AD-ACC-23': ['edp', 'mitotano'],
  'AD-ACC-24': ['edp', 'mitotano', 'hidrocortisona'], 'AD-ACC-25': ['carbo_eto', 'mitotano'], 'AD-ACC-27': ['gemcape', 'estreptozocina', 'temozolomida'], 'AD-ACC-28': ['pembro_acc'], 'AD-ACC-29': ['cabo_acc'], 'AD-ACC-30': ['sbrt_adrenal'],
  'AD-PPGL-03': ['doxazosina', 'betabloq'], 'AD-PPGL-05': ['metirosina'], 'AD-PPGL-08': ['hidrocortisona'], 'AD-PPGL-12': ['hidrocortisona'], 'AD-PPGL-21': ['doxazosina', 'metirosina'],
  'AD-PPGL-22': ['sbrt_adrenal'], 'AD-PPGL-23': ['lutathera'], 'AD-PPGL-24': ['mibg'], 'AD-PPGL-25': ['cvd', 'temozolomida'], 'AD-PPGL-26': ['sunitinibe_ppgl'], 'AD-PPGL-27': ['belzu_ppgl'], 'AD-PPGL-28': ['cabo_acc'], 'AD-PPGL-29': ['zoledronico'],
  'AD-ALDO-02': ['espironolactona'], 'AD-ALDO-04': ['espironolactona'], 'AD-ALDO-06': ['espironolactona'], 'AD-ALDO-07': ['espironolactona'],
  'AD-CUSH-01': ['hidrocortisona'], 'AD-CUSH-02': ['hidrocortisona'], 'AD-CUSH-03': ['cetoconazol', 'osilodrostat', 'metirapona', 'etomidato'], 'AD-CUSH-04': ['hidrocortisona'], 'AD-CUSH-05': ['hidrocortisona'],
  'AD-MET-01': ['hidrocortisona'], 'AD-MET-03': ['sbrt_adrenal'], 'AD-MET-04': ['sbrt_adrenal'], 'AD-MET-05': ['sbrt_adrenal'],
};
const ADOSE_CATS = ['Carcinoma adrenocortical', 'Hipercortisolismo', 'Feocromocitoma e paraganglioma', 'Aldosteronismo primário', 'Radioterapia', 'Suporte'];

/* Guia cirúrgico – adrenal. Texto a revisar por cirurgião antes do uso assistencial. */
const ASURG = {
  lap_transperitoneal: {
    nome: 'Adrenalectomia laparoscópica transperitoneal lateral',
    resumo: 'Via padrão para tumores benignos funcionantes, feocromocitoma < 6 cm e metástase isolada; decúbito lateral, 3–4 trocartes, controle precoce da veia adrenal. 60–150 min; sangramento < 100 mL; internação 1–2 dias. Lado direito: veia curta direto na cava, fígado a afastar; lado esquerdo: veia na renal, baço/pâncreas a mobilizar.',
    indicacoes: ['Aldosteronoma lateralizado; adenoma com Cushing ou MACS com comorbidade; feocromocitoma < 6 cm sem invasão (após preparo); lesão indeterminada < 6 cm em paciente apto; metástase isolada < 6 cm sem invasão.', 'Tumores até 8–10 cm benignos prováveis em centro experiente (mielolipoma sintomático, cisto).'],
    contraindicacoes: ['Carcinoma adrenocortical provável (> 6 cm heterogêneo, invasão, trombo): aberta.', 'Feocromocitoma sem alfa-bloqueio adequado; coagulopatia não corrigida; incapacidade de tolerar pneumoperitônio (relativa).', 'Cirurgia abdominal extensa prévia ou obesidade mórbida: considerar via retroperitoneoscópica posterior.'],
    preparo: ['Confirmação hormonal e, se feocromocitoma, 7–14 dias de alfa-bloqueio com metas atingidas; se cortisol pós-dexametasona > 1,8 µg/dL, hidrocortisona 100 mg IV na indução.', 'TC com fase venosa para anatomia da veia adrenal, veia renal, cava e artérias; identificar veia adrenal direita curta/posterolateral e variantes (veia hepática acessória).', 'Jejum, profilaxia de TEV (estendida no Cushing), antibiótico na indução; no aldosteronoma corrigir potássio.'],
    anestesia: ['Geral; PA invasiva em feocromocitoma e Cushing grave; drogas para crise (nitroprussiato, fentolamina, esmolol, magnésio) e para hipotensão pós-ligadura (volume, noradrenalina) prontas; comunicar a ligadura da veia.', 'Cateter vesical; sonda gástrica durante o ato; evitar hipotermia.'],
    instrumental: ['Ótica 30°; 3–4 trocartes (12 mm câmera, 5–12 mm trabalho); selador bipolar ou ultrassônico; clipes Hem-o-lok/titânio para a veia; afastador hepático (direita); bolsa de extração.', 'Robótica opcional: mesmos passos, útil em obesos e tumores maiores.'],
    decisoes: ['Direita: dividir o ligamento triangular e afastar o fígado; abrir o peritônio ao longo da borda lateral da cava; a veia adrenal (curta, 0,5–1 cm) sai posterolateral da cava — clipar com 2 clipes do lado da cava.', 'Esquerda: mobilizar flexura esplênica e ligamento esplenorrenal, deixar baço e cauda pancreática caírem medialmente; identificar a veia renal e a veia adrenal esquerda (recebe a frênica inferior) na borda superior da renal.', 'Feocromocitoma: veia primeiro ("vein first") quando anatomicamente possível, manipulação mínima; se a veia for inacessível antes, dissecar de lateral para medial com cuidado, pedindo à anestesia para antecipar surtos.', 'Converter se sangramento da cava/veia renal não controlável, aderências densas, suspeita intraoperatória de carcinoma (invasão) ou ruptura capsular iminente.', 'Poupadora de córtex (bilateral/hereditário): deixar ~1/3 da glândula com a veia, ressecando o nódulo com margem fina; ultrassom intraoperatório ajuda.'],
    passos: [
      { t: 'Posicionamento e acessos', d: 'Decúbito lateral 60–70° com o lado da lesão para cima, mesa flexionada; pneumoperitônio 12–15 mmHg. Trocartes subcostais: câmera na linha hemiclavicular, trabalho na linha axilar anterior e epigástrio/pararretal; 4º trocarte lateral para afastador (direita: fígado; esquerda: baço) quando necessário.', dica: 'Trocartes 2 dedos abaixo do rebordo costal, 6–8 cm entre si, apontando para a adrenal.', cuidado: 'Em feocromocitoma, insuflar devagar (o pneumoperitônio libera catecolaminas).' },
      { t: 'Exposição — direita', d: 'Secção do ligamento triangular direito e elevação do lobo direito do fígado com afastador; incisão do peritônio posterior ao longo da borda lateral da cava, do fígado até a veia renal; identificar a cava e a face medial da adrenal.', dica: 'Manter a dissecção na face lateral da cava, sem rodá-la; a adrenal fica atrás e lateral ao fígado.', cuidado: 'Veias hepáticas acessórias curtas drenando na cava podem ser confundidas com a adrenal.' },
      { t: 'Exposição — esquerda', d: 'Incisão da linha de Toldt e dos ligamentos esplenocólico e esplenorrenal até o diafragma; baço e cauda do pâncreas caem medialmente expondo a Gerota; abrir a Gerota sobre o polo superior do rim e identificar a veia renal esquerda e a veia adrenal (vertical, entrando na borda superior da renal).', dica: 'Seguir a veia frênica inferior para encontrar a adrenal; a veia adrenal esquerda fica medial ao polo superior do rim.', cuidado: 'Cauda do pâncreas e vasos esplênicos na dissecção medial; a artéria adrenal inferior sai da renal.' },
      { t: 'Controle da veia adrenal', d: 'Dissecar a veia circunferencialmente e clipar com 2 clipes proximais (lado da cava/renal) e 1 distal, ou selar se calibre fino; avisar a anestesia antes (queda de PA em feocromocitoma). Direita: veia curta e larga — clipe deslizante ou clipe-sutura; esquerda: ligar também a frênica inferior se confluir.', dica: 'Se a veia direita for muito curta, deixar manguito de 2–3 mm na cava para o clipe; alternativa: grampeador vascular na parede lateral da cava.', cuidado: 'Avulsão da veia da cava: compressão com gaze, aumentar pneumoperitônio, sutura 4-0 ou conversão.' },
      { t: 'Dissecção da glândula', d: 'Mobilizar a adrenal de medial para lateral e de superior para inferior, selando as artérias adrenais (superiores da frênica inferior, médias da aorta, inferiores da renal) e mantendo a gordura periadrenal junto ao espécime; não pinçar a glândula (friável) — tracionar pela gordura.', dica: 'Plano entre a adrenal e o polo superior do rim é avascular na maioria; preservar a cápsula.', cuidado: 'Ruptura da glândula em feocromocitoma e em carcinoma: implantes; em Cushing, fragmentos deixados causam persistência.' },
      { t: 'Retirada e revisão', d: 'Colocar em bolsa e retirar pelo trocarte ampliado; revisar hemostasia a 5 mmHg; dreno raramente; fechar aponeurose ≥ 10 mm.', dica: 'Pesar e orientar o espécime (veia marcada) para o patologista.', cuidado: 'Hipotensão após retirada em feocromocitoma: volume e vasopressor; hipoglicemia de rebote.' },
    ],
    posop: ['Feocromocitoma: 24 h em semi-intensiva (PA, glicemia); suspender alfa-bloqueio; metanefrinas em 2–6 semanas.', 'Cushing/MACS: hidrocortisona 50 mg 8/8 h D1, depois 20–30 mg/dia e desmame por meses; cortisol basal mensal; cartão de emergência.', 'Aldosteronoma: suspender espironolactona e potássio; potássio e creatinina em 1 semana; aldosterona/renina em 1–3 meses.', 'Alta em 1–2 dias; retorno em 2–4 semanas com patologia.'],
    complicacoes: ['Sangramento/transfusão 1–3%; lesão de cava ou veia renal < 1%; lesão de baço (esquerda) 1–2%, pâncreas (fístula) 1%, fígado/diafragma; conversão 2–5%; crise hipertensiva ou hipotensão grave em feocromocitoma 5–10%; insuficiência adrenal não reconhecida após Cushing (prevenir com reposição).', 'Mortalidade < 0,5%.'],
    resultados: ['Cura bioquímica: aldosteronoma ~95%, Cushing adenoma > 95%, feocromocitoma > 95% (recidiva 5–15% em 10 anos, maior em hereditários).', 'Metástase isolada: sobrevida 5 anos 25–40%.'],
    esquemas: ['veias_adrenais'],
    videos: [],
  },
  retroperitoneoscopica: {
    nome: 'Adrenalectomia retroperitoneoscópica posterior (PRA, técnica de Walz)',
    resumo: 'Acesso direto à adrenal pelo dorso, em decúbito ventral, sem entrar na cavidade peritoneal: ideal para tumores ≤ 6–7 cm, bilaterais (sem reposicionar), cirurgia abdominal prévia e obesos. 40–90 min; sangramento mínimo; alta em 1 dia.',
    indicacoes: ['Mesmas indicações benignas da transperitoneal com tumor ≤ 6–7 cm; adrenalectomia bilateral ou poupadora; antecedentes de cirurgia abdominal; obesidade (espaço retroperitoneal é mais previsível).'],
    contraindicacoes: ['Tumor > 7–8 cm; carcinoma adrenocortical provável; distância pele–adrenal muito grande (> 8–10 cm na TC); cifose ou impossibilidade de decúbito ventral; paciente que não tolera pressão de insuflação de 20–25 mmHg (cardiopatia grave, hipertensão intracraniana).'],
    preparo: ['Idênticos à transperitoneal (alfa-bloqueio, hidrocortisona, TC com anatomia); medir na TC a distância da pele à adrenal e a relação com a 12ª costela e o polo superior do rim.'],
    anestesia: ['Geral com relaxamento; decúbito ventral em posição de "canivete" (quadris fletidos 90°) com apoios no tórax e pelve, abdome livre; a pressão de insuflação alta (20–28 mmHg) é bem tolerada porque comprime pouco a cava, mas aumenta a PaCO2 — ventilação ajustada.'],
    instrumental: ['Ótica 30° ou 45°; 3 trocartes (12 mm central, 5 mm × 2) com balão opcional para o espaço; selador bipolar ou ultrassônico; clipes; pressão 20–28 mmHg.'],
    decisoes: ['Lado direito: adrenal fica medial e superior ao polo renal, atrás da cava; a veia adrenal é identificada no ápice da dissecção entre cava e glândula, curta — clipar com cuidado.', 'Lado esquerdo: veia adrenal mais longa, identificada na borda inferomedial, caminhando para a veia renal.', 'Bilateral: operar os dois lados sem reposicionar (vantagem principal).', 'Converter para transperitoneal/aberta em sangramento não controlável, tumor maior que o previsto ou ausência de progresso em 30–45 min.'],
    passos: [
      { t: 'Posição e acesso inicial', d: 'Decúbito ventral, canivete; incisão de 1,5 cm logo abaixo da ponta da 12ª costela; dissecção romba com o dedo através da fáscia toracolombar até o espaço retroperitoneal; criar espaço com o dedo guiando a colocação dos trocartes laterais: 5 mm medial (4–5 cm, abaixo da 11ª costela, lateral aos paravertebrais) e 5 mm lateral (4–5 cm, abaixo da 11ª costela, linha axilar posterior).', dica: 'O trocarte central é de balão (12 mm) para vedar; insuflar a 20–25 mmHg.', cuidado: 'Trocarte medial muito próximo da coluna lesa nervo/vasos paravertebrais; lateral muito alto → pleura.' },
      { t: 'Criação do espaço e identificação do rim', d: 'Dissecar romba e com selador a gordura retroperitoneal até identificar o polo superior do rim (de lateral para medial) e o músculo psoas medialmente; abrir a Gerota posterior; empurrar o rim inferiormente.', dica: 'A face posterior do rim é o marco mais confiável; a adrenal fica acima e medial.', cuidado: 'Manter-se fora do peritônio (anterior); lesão peritoneal reduz o espaço (pneumoperitônio) — pode-se compensar aumentando a pressão.' },
      { t: 'Mobilização do polo superior e dissecção inferomedial', d: 'Separar o polo superior do rim da gordura periadrenal com selador, criando o plano entre rim e adrenal; dissecar a face inferomedial da adrenal, identificando vasos adrenais inferiores (da renal) e, à esquerda, a veia adrenal descendo para a renal; à direita, a cava medialmente.', dica: 'Trabalhar de inferior para superior deixando a adrenal "pendurada" pela parte superior até o final (evita que caia no campo).', cuidado: 'Veia renal e seus ramos no limite inferior; cava à direita.' },
      { t: 'Controle da veia adrenal', d: 'Direita: identificar a veia adrenal no ângulo entre cava e glândula, dissecar e clipar (2 clipes) ou selar; esquerda: clipar a veia adrenal perto da veia renal (preservar a frênica inferior se não confluir). Avisar a anestesia em feocromocitoma.', dica: 'Visão posterior oferece acesso direto à veia direita, uma das vantagens da PRA.', cuidado: 'Sangramento da cava: compressão, aumentar pressão a 28–30 mmHg, clipe ou conversão.' },
      { t: 'Liberação superior e retirada', d: 'Dividir os vasos adrenais superiores e a gordura periadrenal ao diafragma com selador; colocar em bolsa e retirar pelo trocarte central ampliado; revisar hemostasia a 8–10 mmHg; fechar fáscia.', dica: 'Poupadora de córtex: manter a porção da glândula com a veia principal e ressecar o nódulo com 2–3 mm de margem, hemostasia com bipolar.', cuidado: 'Lesão pleural (pneumotórax) na dissecção superior: radiografia pós-operatória se dúvida.' },
    ],
    posop: ['Como na transperitoneal; menos íleo e dor; alta em 1 dia (ambulatorial em centros experientes).', 'Hipercapnia pós-operatória transitória; enfisema subcutâneo comum e benigno.'],
    complicacoes: ['Sangramento 1–2%; lesão pleural 1–3%; lesão peritoneal (sem consequência) 5–10%; neuralgia transitória da parede (nervo subcostal/ílio-hipogástrico) 3–5%; conversão 1–3%.', 'Mortalidade < 0,3%.'],
    resultados: ['Equivalente à transperitoneal em cura e complicações, com menor tempo cirúrgico, dor e internação em séries de alto volume.'],
    esquemas: ['acesso_posterior'],
    videos: [],
  },
  aberta_acc: {
    nome: 'Adrenalectomia aberta em bloco para carcinoma adrenocortical',
    resumo: 'Única chance de cura do ACC: ressecção R0 da glândula com gordura periadrenal e órgãos aderidos, sem ruptura capsular, com linfadenectomia regional e, se preciso, trombectomia. Incisão subcostal ampla ou toracoabdominal; 3–6 h; transfusão em 20–40%; internação 5–10 dias.',
    indicacoes: ['Massa adrenal suspeita de ACC (> 4–6 cm heterogênea, > 20 UH, invasão, secreção mista); ACC confirmado ENSAT I–III ressecável; recidiva local ressecável com intervalo livre > 12 meses; doença metastática com > 90% ressecável ou hipercortisolismo incontrolável (seleção).'],
    contraindicacoes: ['Doença metastática extensa não ressecável; invasão vascular/orgânica irressecável (indicar neoadjuvância e reavaliar); performance ou comorbidade proibitivas; feocromocitoma não preparado (excluir antes).'],
    preparo: ['Estadiamento (TC tórax, TC/RM abdome com fase venosa, FDG-PET), avaliação hormonal completa e metanefrinas; nunca biopsiar.', 'Hipercortisolismo: bloqueio pré-operatório (cetoconazol/osilodrostat) se grave, hidrocortisona de estresse na indução, profilaxia de TEV estendida, controle de glicemia/potássio, nutrição.', 'Planejar com cirurgia vascular (trombo), hepatobiliar (invasão hepática à direita) ou geral (esplenopancreatectomia à esquerda); reserva de sangue 4 unidades; UTI.', 'Discutir mitotano adjuvante e iniciar o processo de importação antes da cirurgia.'],
    anestesia: ['Geral com PA invasiva, acesso central, aquecimento; peridural para analgesia; antibiótico; hidrocortisona 100 mg IV se cortisol elevado ou MACS.'],
    instrumental: ['Afastador fixo; selador e bisturi ultrassônico; clamps vasculares e fios de polipropileno 4-0/5-0 (cava); grampeadores (baço/pâncreas, veia renal); ultrassom intraoperatório.'],
    decisoes: ['Incisão: subcostal bilateral (Chevron) ou Makuuchi para a maioria; toracoabdominal para tumores grandes do lado direito com envolvimento hepático ou trombo alto; mediana ampla em tumores bilaterais/recidiva.', 'Ressecção em bloco de órgãos aderidos sem tentar separar planos (rim, baço, cauda do pâncreas, parede da cava, segmento hepático, diafragma, cólon): aderência é tratada como invasão.', 'Nefrectomia só se invasão renal ou do hilo; preservar o rim quando a gordura permite plano livre.', 'Linfadenectomia regional: hilo renal, periaórtica/pericaval ipsilateral do diafragma à artéria mesentérica inferior; ≥ 5 linfonodos.', 'Trombo: como no carcinoma renal (nível Mayo define controle); invasão de parede da cava: ressecção com patch.', 'Hemorragia maciça de neovasos: ligar precocemente artérias adrenais e frênica inferior, embolização pré-operatória só em casos excepcionais.'],
    passos: [
      { t: 'Incisão e exposição', d: 'Chevron/Makuuchi; afastador fixo; à direita manobra de Kocher ampla e mobilização do lobo direito do fígado (ligamentos triangular e coronário); à esquerda mobilização da flexura esplênica, baço e cauda do pâncreas em bloco medialmente (manobra de Mattox parcial) ou ressecção em bloco se aderidos.', dica: 'Expor cava (direita) ou aorta/veia renal (esquerda) e o diafragma antes de tocar o tumor.', cuidado: 'Neovasos parasitas do fígado, diafragma e parede abdominal sangram muito; ligar antes de tracionar.' },
      { t: 'Controle vascular precoce', d: 'Identificar e ligar a veia adrenal (direita na cava; esquerda na renal) e as artérias adrenais (frênica inferior, aorta, renal); em tumores que envolvem a veia renal esquerda, preparar para ressecá-la (drenagem colateral pela gonadal/lombar) ou reconstruir.', dica: 'Ligadura da veia adrenal direita com clamp lateral de Satinsky na cava e sutura 5-0 se o manguito for curto.', cuidado: 'Trombo na veia adrenal/cava: controle proximal e distal antes da ligadura, ultrassom.' },
      { t: 'Dissecção em bloco', d: 'Circunferir o tumor fora da gordura periadrenal, levando a Gerota superior, diafragma aderido (ressecar e fechar), segmento hepático VI/VII se aderido (com hepatobiliar), rim se invadido (nefrectomia em bloco), baço/pâncreas distal à esquerda; nunca "descolar" o tumor de uma estrutura aderida.', dica: 'Tração pela gordura e órgãos, não pela cápsula; se a cápsula romper, irrigar amplamente e registrar (muda estádio/prognóstico).', cuidado: 'Lesão de duodeno (direita) e cólon; pancreatite/fístula se cauda pancreática manipulada.' },
      { t: 'Linfadenectomia e trombectomia', d: 'Dissecar os linfonodos do hilo renal e periaórticos/pericavais ipsilaterais em bloco; trombectomia conforme nível (ver capítulo de trombo renal), com reconstrução da cava.', dica: 'Linfonodos positivos mudam para estádio III e indicam mitotano adjuvante.', cuidado: 'Lesão de cisterna do quilo/linfáticos: ligar (quiloperitônio).' },
      { t: 'Revisão, drenagem e fechamento', d: 'Hemostasia com selante se necessário, revisão de órgãos ressecados (anastomoses, coto pancreático com grampeador + sutura), drenos junto ao leito e ao pâncreas, fechamento por planos; enviar o espécime inteiro, orientado e com os linfonodos separados.', dica: 'Registrar no laudo operatório ruptura capsular, aderências e completude (R0/R1/R2).', cuidado: 'Insuficiência adrenal no pós-operatório: manter hidrocortisona de estresse e desmamar pela clínica.' },
    ],
    posop: ['UTI 24–48 h; hidrocortisona 50 mg IV 8/8 h D1–2, depois 20–30 mg/dia VO se produtor de cortisol (desmame por meses; 30–50 mg/dia se iniciar mitotano); glicemia; profilaxia de TEV 4 semanas no Cushing.', 'Amilase do dreno se pâncreas manipulado; dieta progressiva; íleo 3–5 dias.', 'Patologia (Weiss, Ki-67, margens, linfonodos) em 2–3 semanas → fluxo pós-operatório do ACC: mitotano em até 3 meses se alto risco; RT do leito se R1/Rx.'],
    complicacoes: ['Transfusão 20–40%; fístula pancreática 5–10% (esquerda com pancreatectomia); lesão/ressecção de cava; pneumonia, TEV (Cushing), infecção de ferida; insuficiência adrenal/crise; mortalidade 2–5% (maior em tumores > 15 cm e trombo alto).'],
    resultados: ['Sobrevida 5 anos após R0: estádio I–II 60–85%, III 40–50%; R1/R2 ou ruptura capsular reduzem a sobrevida pela metade; recidiva em 50–80% dos estádios II–III (daí a adjuvância).'],
    esquemas: ['veias_adrenais'],
    videos: [],
  },
  feo_perioperatorio: {
    nome: 'Manejo perioperatório do feocromocitoma e paraganglioma',
    resumo: 'Protocolo que acompanha qualquer via cirúrgica: 7–14 dias de alfa-bloqueio com metas, expansão volêmica, beta-bloqueio só depois, anestesia preparada para crise e hipotensão, e cuidados nas 24 h seguintes. Reduz a mortalidade operatória de 20–45% (era pré-bloqueio) para < 1%.',
    indicacoes: ['Todo feocromocitoma ou paraganglioma secretor; paraganglioma não secretor com captação funcional (bloqueio profilático é prudente); metástase de feocromocitoma antes de procedimentos (embolização, SBRT, PRRT, quimioterapia).'],
    contraindicacoes: ['Beta-bloqueador antes do alfa-bloqueio; metoclopramida, glucagon, corticoide em dose alta, cetamina, efedrina, succinilcolina, droperidol, opioides liberadores de histamina (morfina em bolus) — podem precipitar crise.'],
    preparo: ['Alfa-bloqueio: doxazosina 2 mg/dia, subir 2–4 mg a cada 2–3 dias até 16–32 mg (ou prazosina até 15 mg/dia; fenoxibenzamina 10 mg 2×/dia até 1 mg/kg/dia por importação — mais hipotensão prolongada no pós-op). Metas (critérios de Roizen adaptados): PA < 130/80 sentado, sistólica > 90 em pé, FC 60–70 sentado / 70–80 em pé, sem extrassístoles > 1/5 min, sem alterações de ST.', 'Expansão: dieta rica em sal (> 5 g/dia) e 2–3 L de líquidos nos 3 dias anteriores; soro 1–2 L na véspera se internado.', 'Bloqueador de cálcio (anlodipino 5–10 mg) como adjuvante quando a PA não atinge a meta ou alfa-bloqueio limita por hipotensão ortostática.', 'Beta-bloqueio (propranolol 10–40 mg 3×/dia, atenolol 25–50 mg) só após 3–4 dias de alfa e se FC > 80–90 ou arritmia.', 'Metirosina 250 mg–1 g 4×/dia (importação) em secreção muito alta, cardiomiopatia ou tumor metastático; ecocardiograma em todos com sintomas cardíacos; glicemia e hematócrito (hemoconcentração).'],
    anestesia: ['Pré-medicação ansiolítica; indução suave (propofol, etomidato), evitar cetamina e succinilcolina; PA invasiva antes da indução, acesso central, ETE se cardiomiopatia.', 'Crise hipertensiva: nitroprussiato 0,5–10 µg/kg/min, fentolamina 1–5 mg em bolus, nicardipina 5–15 mg/h, sulfato de magnésio 2–4 g bolus + 1–2 g/h; taquiarritmia: esmolol após alfa.', 'Após a ligadura da veia: hipotensão esperada — volume (cristaloide/coloide), noradrenalina ou vasopressina; evitar vasopressor profilático antes da ligadura; glicemia a cada 30 min nas 2 h seguintes (hipoglicemia de rebote).'],
    instrumental: ['Monitorização invasiva; bombas de infusão com drogas preparadas (nitroprussiato, fentolamina ou nicardipina, esmolol, noradrenalina, magnésio); glicosímetro.'],
    decisoes: ['Via: laparoscópica/retroperitoneoscópica < 6 cm; aberta > 6 cm ou invasivo; poupadora em bilateral/hereditário.', 'Sequência "veia primeiro" vs dissecção lateral: escolher pela anatomia; comunicar cada manipulação à anestesia.', 'Adiar a cirurgia se metas não atingidas, cardiomiopatia descompensada (recuperar FEVE com 4–8 semanas de bloqueio) ou infecção.', 'Gestante: alfa-bloqueio e cirurgia no 2º trimestre se < 24 semanas; após, cesárea e ressecção combinada ou posterior.'],
    passos: [
      { t: 'D-14 a D-7', d: 'Iniciar alfa-bloqueio e titular a cada 2–3 dias com PA e FC sentado e em pé registradas pelo paciente; dieta rica em sal e líquidos; ecocardiograma se indicado; teste genético solicitado.', dica: 'Orientar levantar devagar (ortostatismo) e sinais de crise.', cuidado: 'Não iniciar beta-bloqueador ainda.' },
      { t: 'D-4 a D-1', d: 'Acrescentar beta-bloqueador se taquicardia; bloqueador de cálcio se PA ainda acima da meta; confirmar metas em 2 medidas; internar na véspera para hidratação IV se possível; última dose de alfa-bloqueio na manhã da cirurgia (fenoxibenzamina: alguns suspendem 24–48 h antes para reduzir hipotensão).', dica: 'Checar potássio, glicemia, hematócrito e ECG.', cuidado: 'Metas não atingidas: adiar.' },
      { t: 'Intraoperatório', d: 'PA invasiva antes da indução; comunicação contínua cirurgião–anestesista; tratar picos com nitroprussiato/fentolamina/magnésio e taquicardia com esmolol; antecipar a ligadura da veia com volume; após a ligadura, suspender vasodilatadores e iniciar vasopressor se preciso.', dica: 'Manipulação mínima do tumor e ligadura venosa precoce reduzem os picos.', cuidado: 'Hipotensão refratária após ligadura: considerar vasopressina (dessensibilização alfa pelo bloqueio).' },
      { t: 'Pós-operatório imediato (24 h)', d: 'Semi-intensiva: PA, FC, glicemia a cada 1–2 h nas primeiras 6 h; suspender alfa-bloqueio (ou reduzir se fenoxibenzamina de meia-vida longa); hidratação; dieta precoce; hidrocortisona se bilateral ou poupadora com dúvida.', dica: 'Hipertensão persistente nas primeiras 24–48 h pode ser dor, volume ou tumor residual.', cuidado: 'Hipoglicemia (rebote de insulina) nas 4–24 h; sonolência inexplicada = glicemia.' },
      { t: 'Seguimento', d: 'Metanefrinas em 2–6 semanas (cura bioquímica); genética e aconselhamento; metanefrinas anuais (vitalício em hereditários, SDHB, paraganglioma, jovens e tumores > 5 cm; ≥ 10 anos nos demais); imagem só se bioquímica alterada ou tumor não secretor.', dica: 'Educar sobre sintomas de recidiva e evitar fármacos que precipitam crise.', cuidado: 'Metástases podem surgir após 10–20 anos.' },
    ],
    posop: ['Ver passos "Pós-operatório imediato" e "Seguimento".'],
    complicacoes: ['Crise hipertensiva intraoperatória 10–20% (controlada com protocolo), hipotensão pós-ligadura 20–50%, hipoglicemia 5–10%, arritmia, infarto/AVC/edema pulmonar raros com preparo adequado; mortalidade < 1% em centros experientes.'],
    resultados: ['Normalização bioquímica > 95% após ressecção completa; hipertensão residual em 20–30% (hipertensão essencial coexistente, lesão vascular crônica).'],
    esquemas: [],
    videos: [],
  },
};
const ASURG_LINK = {
  'AD-HORM-10': ['lap_transperitoneal', 'feo_perioperatorio'], 'AD-HORM-12': ['lap_transperitoneal', 'retroperitoneoscopica'], 'AD-HORM-13': ['lap_transperitoneal'], 'AD-HORM-14': ['lap_transperitoneal', 'retroperitoneoscopica'],
  'AD-IMG-03': ['aberta_acc', 'lap_transperitoneal'], 'AD-IMG-05': ['lap_transperitoneal'], 'AD-IMG-10': ['aberta_acc'],
  'AD-ACC-03': ['aberta_acc'], 'AD-ACC-05': ['aberta_acc'], 'AD-ACC-06': ['lap_transperitoneal'], 'AD-ACC-20': ['aberta_acc'],
  'AD-PPGL-03': ['feo_perioperatorio'], 'AD-PPGL-08': ['retroperitoneoscopica', 'lap_transperitoneal', 'feo_perioperatorio'], 'AD-PPGL-09': ['aberta_acc', 'feo_perioperatorio'], 'AD-PPGL-10': ['aberta_acc', 'feo_perioperatorio'], 'AD-PPGL-11': ['lap_transperitoneal', 'retroperitoneoscopica', 'feo_perioperatorio'],
  'AD-ALDO-00': ['lap_transperitoneal'], 'AD-ALDO-03': ['lap_transperitoneal', 'retroperitoneoscopica'],
  'AD-CUSH-01': ['lap_transperitoneal', 'retroperitoneoscopica'], 'AD-CUSH-02': ['retroperitoneoscopica', 'lap_transperitoneal'], 'AD-CUSH-05': ['lap_transperitoneal', 'retroperitoneoscopica'],
  'AD-MET-02': ['lap_transperitoneal', 'aberta_acc'],
};
const ASURG_SVG = {
  veias_adrenais: `<svg viewBox="0 0 720 400" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Sans, system-ui, sans-serif" font-size="13">
  <!-- diafragma -->
  <path d="M60 70 Q360 20 660 70" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4"/>
  <text x="330" y="40" text-anchor="middle" fill="currentColor" opacity=".8">diafragma</text>
  <!-- cava e aorta -->
  <rect x="300" y="60" width="40" height="320" rx="12" fill="#4CB7D1" fill-opacity=".18" stroke="#0E6B85" stroke-width="2.5"/>
  <text x="320" y="396" text-anchor="middle" fill="currentColor">veia cava</text>
  <rect x="372" y="60" width="30" height="320" rx="10" fill="#B03A3A" fill-opacity=".15" stroke="#B03A3A" stroke-width="2"/>
  <text x="387" y="396" text-anchor="middle" fill="currentColor">aorta</text>
  <!-- rins -->
  <ellipse cx="170" cy="250" rx="46" ry="70" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-width="1.5"/>
  <ellipse cx="540" cy="250" rx="46" ry="70" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-width="1.5"/>
  <text x="170" y="335" text-anchor="middle" fill="currentColor">rim direito</text>
  <text x="540" y="335" text-anchor="middle" fill="currentColor">rim esquerdo</text>
  <!-- veias renais -->
  <path d="M216 250 L300 250" stroke="#0E6B85" stroke-width="9" stroke-linecap="round" opacity=".8"/>
  <path d="M494 250 L340 250" stroke="#0E6B85" stroke-width="9" stroke-linecap="round" opacity=".8"/>
  <text x="258" y="272" text-anchor="middle" fill="currentColor" font-size="11.5">v. renal D</text>
  <text x="417" y="272" text-anchor="middle" fill="currentColor" font-size="11.5">v. renal E (cruza anterior à aorta)</text>
  <!-- adrenais -->
  <path d="M190 100 L150 120 L160 170 L205 160 Z" fill="#E8A33D" fill-opacity=".35" stroke="#E8A33D" stroke-width="2"/>
  <text x="120" y="108" fill="currentColor">adrenal D</text>
  <path d="M520 100 L560 120 L550 175 L505 160 Z" fill="#E8A33D" fill-opacity=".35" stroke="#E8A33D" stroke-width="2"/>
  <text x="566" y="108" fill="currentColor">adrenal E</text>
  <!-- veia adrenal direita: curta, posterolateral, direto na cava -->
  <path d="M205 150 L300 140" stroke="#0E6B85" stroke-width="6" stroke-linecap="round"/>
  <text x="200" y="135" fill="currentColor" font-size="11.5">v. adrenal D: curta (0,5–1 cm), direto na cava</text>
  <!-- veia adrenal esquerda: longa, desce para a veia renal; recebe frênica inferior -->
  <path d="M525 175 Q520 215 500 250" stroke="#0E6B85" stroke-width="6" stroke-linecap="round" fill="none"/>
  <path d="M480 95 Q500 130 522 150" stroke="#0E6B85" stroke-width="3.5" fill="none"/>
  <text x="430" y="92" fill="currentColor" font-size="11.5">v. frênica inferior E</text>
  <text x="560" y="215" fill="currentColor" font-size="11.5">v. adrenal E: longa,</text>
  <text x="560" y="230" fill="currentColor" font-size="11.5">entra na v. renal</text>
  <!-- artérias adrenais (3 fontes) -->
  <path d="M372 110 L205 125" stroke="#B03A3A" stroke-width="2" stroke-dasharray="3 3"/>
  <path d="M402 110 L505 125" stroke="#B03A3A" stroke-width="2" stroke-dasharray="3 3"/>
  <text x="330" y="300" text-anchor="middle" fill="currentColor" font-size="11.5" opacity=".9">artérias adrenais: superior (frênica inferior),</text>
  <text x="330" y="315" text-anchor="middle" fill="currentColor" font-size="11.5" opacity=".9">média (aorta) e inferior (renal) — tracejadas</text>
  <!-- legenda -->
  <g font-size="11.5" fill="currentColor">
    <rect x="30" y="360" width="14" height="14" fill="#E8A33D" fill-opacity=".5" stroke="#E8A33D"/><text x="50" y="372">adrenal</text>
    <rect x="110" y="360" width="14" height="14" fill="#4CB7D1" fill-opacity=".3" stroke="#0E6B85"/><text x="130" y="372">veias</text>
    <rect x="180" y="360" width="14" height="14" fill="#B03A3A" fill-opacity=".3" stroke="#B03A3A"/><text x="200" y="372">artérias</text>
  </g>
</svg>`,
  acesso_posterior: `<svg viewBox="0 0 720 400" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Sans, system-ui, sans-serif" font-size="13">
  <!-- texto à esquerda -->
  <g font-size="12" fill="currentColor">
    <text x="24" y="36" font-weight="600" font-size="13">Acesso retroperitoneoscópico posterior (Walz)</text>
    <text x="24" y="58">Decúbito ventral em canivete; visão por trás do paciente.</text>
    <text x="24" y="76">Pressão de insuflação 20–28 mmHg; o polo superior do rim</text>
    <text x="24" y="94">é o marco: a adrenal fica acima e medial a ele.</text>
    <circle cx="32" cy="130" r="8" fill="#0E6B85"/><text x="48" y="134">1 · 12 mm com balão, abaixo da ponta da 12ª costela</text>
    <circle cx="32" cy="156" r="7" fill="#4CB7D1" stroke="#0E6B85"/><text x="48" y="160">2 · 5 mm medial, 4–5 cm, lateral aos paravertebrais</text>
    <circle cx="32" cy="182" r="7" fill="#4CB7D1" stroke="#0E6B85"/><text x="48" y="186">3 · 5 mm lateral, 4–5 cm, linha axilar posterior</text>
    <text x="24" y="222">Vantagens: não entra no peritônio; bilateral sem</text>
    <text x="24" y="240">reposicionar; acesso direto à veia adrenal direita.</text>
    <text x="24" y="266">Limites: tumor ≤ 6–7 cm; distância pele–adrenal</text>
    <text x="24" y="284">≤ 8–10 cm na TC; decúbito ventral tolerado.</text>
  </g>
  <!-- dorso: coluna à direita do bloco de texto, lado esquerdo do paciente desenhado -->
  <rect x="420" y="30" width="36" height="340" rx="10" fill="currentColor" fill-opacity=".10" stroke="currentColor" stroke-width="1.5"/>
  <text x="438" y="390" text-anchor="middle" fill="currentColor">coluna</text>
  <path d="M456 95 Q560 85 680 125" fill="none" stroke="currentColor" stroke-width="3"/>
  <path d="M456 140 Q560 135 660 180" fill="none" stroke="currentColor" stroke-width="3"/>
  <text x="640" y="112" fill="currentColor" font-size="11.5">11ª costela</text>
  <text x="640" y="200" fill="currentColor" font-size="11.5">12ª costela</text>
  <path d="M456 330 Q560 310 700 345" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="6 4"/>
  <text x="600" y="368" fill="currentColor" font-size="11.5" opacity=".8">crista ilíaca</text>
  <!-- rim e adrenal projetados -->
  <ellipse cx="560" cy="265" rx="40" ry="62" fill="currentColor" fill-opacity=".06" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 3"/>
  <text x="560" y="300" text-anchor="middle" fill="currentColor" font-size="11.5" opacity=".8">rim (projeção)</text>
  <path d="M535 190 L572 200 L566 226 L530 218 Z" fill="#E8A33D" fill-opacity=".4" stroke="#E8A33D" stroke-width="1.5"/>
  <text x="580" y="222" fill="currentColor" font-size="11.5">adrenal</text>
  <!-- trocartes numerados -->
  <circle cx="548" cy="236" r="10" fill="#0E6B85"/><text x="548" y="240" text-anchor="middle" fill="#fff" font-size="11" font-weight="600">1</text>
  <circle cx="492" cy="212" r="8" fill="#4CB7D1" stroke="#0E6B85"/><text x="492" y="216" text-anchor="middle" fill="#06202A" font-size="10.5" font-weight="600">2</text>
  <circle cx="618" cy="236" r="8" fill="#4CB7D1" stroke="#0E6B85"/><text x="618" y="240" text-anchor="middle" fill="#06202A" font-size="10.5" font-weight="600">3</text>
</svg>`,
};
const ASURG_CAP = {
  veias_adrenais: 'Anatomia venosa das adrenais: a veia adrenal direita é curta e drena direto na face posterolateral da cava (ponto crítico da adrenalectomia direita); a esquerda é longa, recebe a frênica inferior e entra na veia renal esquerda. As artérias vêm de três fontes (frênica inferior, aorta, renal) e são seladas durante a dissecção.',
  acesso_posterior: 'Adrenalectomia retroperitoneoscópica posterior: paciente em decúbito ventral, três trocartes abaixo da 11ª/12ª costela, pressão de insuflação alta; o polo superior do rim orienta a dissecção até a adrenal.',
};

/* Motor de regras – Câncer de testículo (tumores de células germinativas)
   Regras 2026.11 · EAU Testicular Cancer 2026 · NCCN v1.2026 · IGCCCG 2021 · IPFSG · SWENOTECA
   Mesma convenção dos outros módulos: id, text, strength (forte/moderada/fraca/nao/ensaio/alerta/padrao), src, br (chaves de disponibilidade). */
const Testis = (() => {
  const num = (v) => (v === '' || v === null || v === undefined || isNaN(+v)) ? null : +v;
  const R = (id, text, strength, src, br, extra) => Object.assign({ id, text, strength, src, br: br || [] }, extra || {});
  const RULES = '2026.11';

  /* ---------- categoria S (marcadores após orquiectomia, no início da quimioterapia) ---------- */
  function sCat(p) {
    const afp = num(p.afp), hcg = num(p.hcg), ldh = num(p.ldh_x);   // AFP ng/mL, hCG UI/L, LDH em múltiplos do limite superior
    if (afp === null && hcg === null && ldh === null) return { s: 'Sx', label: 'Sx (marcadores não informados)' };
    const a = afp ?? 0, h = hcg ?? 0, l = ldh ?? 0;
    let s;
    if (l > 10 || h > 50000 || a > 10000) s = 'S3';
    else if (l >= 1.5 || h >= 5000 || a >= 1000) s = 'S2';
    else if (l > 1 || h > 5 || a > 10) s = 'S1';
    else s = 'S0';
    return { s, label: s + (s === 'S0' ? ' (normais)' : s === 'S1' ? ' (LDH < 1,5×, hCG < 5.000, AFP < 1.000)' : s === 'S2' ? ' (LDH 1,5–10× ou hCG 5.000–50.000 ou AFP 1.000–10.000)' : ' (LDH > 10× ou hCG > 50.000 ou AFP > 10.000)') };
  }
  /* ---------- IGCCCG (3 grupos) ---------- */
  function igcccg(p) {
    const hist = p.histologia === 'seminoma' ? 'seminoma' : 'nao_seminoma';
    const sites = p.sitios || [];
    const visc = sites.some((x) => ['figado', 'osso', 'cerebro', 'outro'].includes(x));
    const S = sCat(p);
    let group;
    if (hist === 'seminoma') group = visc ? 'intermediario' : 'bom';
    else if (p.primario === 'mediastinal' || visc || S.s === 'S3') group = 'pobre';
    else if (S.s === 'S2') group = 'intermediario';
    else group = 'bom';
    const os = hist === 'seminoma' ? { bom: '95%', intermediario: '88%' }[group] : { bom: '96%', intermediario: '89%', pobre: '67%' }[group];
    const pfs = hist === 'seminoma' ? { bom: '89%', intermediario: '79%' }[group] : { bom: '90%', intermediario: '78%', pobre: '54%' }[group];
    const why = [hist === 'seminoma' ? 'seminoma' : 'não seminoma', p.primario === 'mediastinal' ? 'primário mediastinal' : p.primario === 'retroperitoneal' ? 'primário retroperitoneal' : 'primário testicular', visc ? 'metástase visceral não pulmonar' : 'sem metástase visceral não pulmonar', S.s].join(' · ');
    return { group, label: { bom: 'IGCCCG bom prognóstico', intermediario: 'IGCCCG prognóstico intermediário', pobre: 'IGCCCG prognóstico pobre' }[group], os, pfs, why, S, visc, hist };
  }
  /* ---------- IPFSG (recidiva após 1ª linha) ---------- */
  function ipfsg(p) {
    let pts = 0; const f = [];
    if (p.histologia === 'seminoma') { pts -= 1; f.push('seminoma (−1)'); } else f.push('não seminoma (0)');
    if (p.primario === 'retroperitoneal') { pts += 1; f.push('primário retroperitoneal (+1)'); }
    if (p.primario === 'mediastinal') { pts += 3; f.push('primário mediastinal (+3)'); }
    if (p.resposta_1l === 'rp_marc') { pts += 1; f.push('RP com marcadores positivos / doença estável (+1)'); }
    if (p.resposta_1l === 'prog') { pts += 2; f.push('progressão na 1ª linha (+2)'); }
    if (p.intervalo_livre === '<=3') { pts += 1; f.push('intervalo livre ≤ 3 meses (+1)'); }
    if (p.afp_rec === '<=1000') { pts += 1; f.push('AFP ≤ 1.000 (+1)'); }
    if (p.afp_rec === '>1000') { pts += 2; f.push('AFP > 1.000 (+2)'); }
    if (p.hcg_rec === '>1000') { pts += 1; f.push('hCG > 1.000 (+1)'); }
    if (p.visceral_rec === 'sim') { pts += 1; f.push('metástase hepática/óssea/cerebral (+1)'); }
    const group = pts <= -1 ? 'muito_baixo' : pts === 0 ? 'baixo' : pts <= 2 ? 'intermediario' : pts <= 4 ? 'alto' : 'muito_alto';
    const pfs = { muito_baixo: '~75%', baixo: '~50%', intermediario: '~40%', alto: '~25%', muito_alto: '~6%' }[group];
    return { pts, f, group, label: { muito_baixo: 'IPFSG muito baixo risco', baixo: 'IPFSG baixo risco', intermediario: 'IPFSG risco intermediário', alto: 'IPFSG alto risco', muito_alto: 'IPFSG muito alto risco' }[group] + ` (${pts} ponto${Math.abs(pts) === 1 ? '' : 's'}; PFS 2 anos ${pfs})` };
  }

  /* ---------- Módulo 1 – massa testicular e estádio I ---------- */
  function stage1(p) {
    const out = [], alerts = [], pend = [], info = {};
    const momento = p.momento || 'posop';
    const idade = num(p.idade);
    if (momento === 'preop') {
      info.status = 'Massa testicular suspeita' + (num(p.tamanho) !== null ? ` · ${p.tamanho} cm` : '') + (p.testiculo_unico === 'sim' ? ' · testículo único/bilateral' : '');
      pend.push(R('TS-DX-00', 'Antes da cirurgia: ultrassom bilateral com Doppler, AFP, hCG e LDH, exame de mamas, linfonodos supraclaviculares/inguinais e abdome; TC de tórax, abdome e pelve pode ser feita antes ou logo após a orquiectomia.', 'padrao', 'EAU 2026 (forte)'));
      if (p.met_grave === 'sim') { out.push(R('TS-DX-01', 'Doença metastática extensa com risco de vida (dispneia, hemorragia, hCG muito alta): iniciar quimioterapia (BEP) antes da orquiectomia, que é feita após o término.', 'forte', 'EAU 2026 (forte)', ['bep'], { kind: 'padrao' })); return { out, alerts, pend, info }; }
      out.push(R('TS-DX-02', 'Banco de sêmen (1–3 coletas) antes da orquiectomia ou, no mínimo, antes de qualquer quimioterapia/radioterapia; dosar testosterona, LH e FSH basais.', 'forte', 'EAU 2026 (forte)', ['banco_semen'], { kind: 'padrao' }));
      const benigna = p.suspeita_benigna === 'sim';
      if (benigna || p.testiculo_unico === 'sim') out.push(R('TS-DX-03', (benigna ? 'Lesão pequena (< 2 cm), hipoecoica/avascular, marcadores normais: provável benigna (Leydig, Sertoli, epidermoide, 20–30% dos < 1 cm)' : 'Testículo único ou tumor bilateral com volume preservado') + ': discutir cirurgia poupadora de testículo por via inguinal com congelação; orquiectomia se maligno não enucleável ou congelação inconclusiva. Se GCNIS na periferia: RT 18–20 Gy no remanescente (infertilidade, hipogonadismo) ou vigilância.', 'moderada', 'EAU 2026 (forte para discutir)', ['poupadora', 'orquiectomia']));
      out.push(R('TS-DX-04', 'Orquiectomia radical por via inguinal com ligadura alta do cordão no anel interno; nunca via escrotal (recidiva local e drenagem inguinal). Colocar prótese testicular no mesmo tempo, oferecida a todos.', 'forte', 'EAU 2026 (forte; prótese é recomendação nova 2026)', ['orquiectomia', 'protese'], { kind: benigna ? undefined : 'padrao' }));
      const riscoContra = p.contralateral_risco === 'sim';
      if (riscoContra && (idade === null || idade < 40)) out.push(R('TS-DX-05', 'Testículo contralateral com volume < 12 mL e/ou criptorquidia, em paciente < 40 anos: discutir biópsia contralateral (GCNIS em ~5%; até 34% se atrofia + criptorquidia); se positiva, RT 18–20 Gy ou vigilância se deseja filhos.', 'moderada', 'EAU 2026 (forte para discutir)'));
      else out.push(R('TS-DX-06', 'Biópsia do testículo contralateral não é necessária (sem fatores de risco ou > 40 anos); orientar autoexame.', 'padrao', 'EAU 2026'));
      pend.push(R('TS-DX-07', 'Após a orquiectomia: repetir AFP, hCG e LDH até normalizar ou atingir nadir, respeitando as meias-vidas (AFP 5–7 dias, hCG 24–36 h); TC de tórax, abdome e pelve com contraste; nada de PET ou cintilografia óssea para estadiar.', 'padrao', 'EAU 2026 (forte)'));
      alerts.push(R('TS-DX-08', 'Fertilidade: a orquiectomia isolada reduz a espermatogênese em 10–15% e a quimioterapia em até 50% nos 2 primeiros anos; registrar desejo de filhos e encaminhar ao banco de sêmen antes de qualquer tratamento.', 'alerta', 'EAU 2026'));
      return { out, alerts, pend, info };
    }
    // pós-orquiectomia
    let hist = p.histologia || 'seminoma';
    const afpAlta = p.afp_elevada === 'sim';
    if (hist === 'seminoma' && afpAlta) { hist = 'nao_seminoma'; alerts.push(R('TS-DX-10', 'AFP elevada com histologia de seminoma puro: tratar como não seminoma (componente de saco vitelino ou carcinoma embrionário não amostrado); pedir revisão de lâminas.', 'alerta', 'EAU 2026')); }
    const marc = p.marcadores_pos || 'normal';   // normal | caindo | persistente
    const tc = p.tc || 'normal';                 // normal | equivoco | n2 | met
    const size = num(p.tamanho);
    const rete = p.rete === 'sim', lvi = p.lvi === 'sim', ce = p.ce_pred === 'sim';
    const adesao = p.adesao || 'boa';
    if (tc === 'n2' || tc === 'met') { info.status = 'Doença metastática na imagem'; out.push(R('TS-I-00', 'Linfonodo ≥ 2 cm ou metástase à distância: seguir pelo fluxo "Doença metastática – primeira linha" (IGCCCG).', 'padrao', 'Fluxo', [], { kind: 'padrao' })); return { out, alerts, pend, info }; }
    if (marc === 'persistente') { info.status = `Estádio IS (${hist === 'seminoma' ? 'seminoma' : 'não seminoma'}): marcadores não normalizam após a orquiectomia`; out.push(R('TS-I-01', 'Estádio IS: marcadores persistentemente elevados (ou subindo) após a orquiectomia indicam doença metastática oculta; tratar como bom prognóstico com BEP × 3 (seminoma: confirmar que a hCG não é de outra origem). Repetir TC se dúvida.', 'forte', 'EAU 2026 (forte)', ['bep'], { kind: 'padrao' })); out.push(R('TS-I-02', 'Não fazer RPLND primária nem radioterapia no estádio IS.', 'nao', 'EAU 2026')); return { out, alerts, pend, info }; }
    if (marc === 'caindo') pend.push(R('TS-I-03', 'Marcadores ainda em queda dentro da meia-vida esperada: repetir semanalmente até normalizar antes de definir o estádio; se platô ou subida, tratar como IS.', 'padrao', 'EAU 2026'));
    if (tc === 'equivoco') pend.push(R('TS-I-04', 'Linfonodo retroperitoneal de 1–1,5 cm: repetir TC em 6–8 semanas antes de rotular como estádio II (ou miR-371a-3p onde disponível); crescimento ou marcador positivo → estádio II.', 'padrao', 'EAU 2026', ['mir371']));
    if (p.banco_semen !== 'sim') pend.push(R('TS-DX-02', 'Banco de sêmen antes de qualquer quimioterapia, radioterapia ou RPLND; testosterona, LH e FSH basais.', 'padrao', 'EAU 2026 (forte)', ['banco_semen']));
    const pT = p.pT || 'pT1';
    const stageLabel = (pT === 'pT1' && !lvi) ? 'IA' : 'IB';
    if (hist === 'teratoma_puro') {
      info.status = 'Teratoma puro pós-puberal (ou com transformação somática maligna), estádio I';
      out.push(R('TS-I-10', 'Teratoma puro pós-puberal ou com transformação somática maligna: RPLND primária poupadora de nervos (1/3 têm metástase nodal quimiorresistente); vigilância só se o paciente recusar, com TC frequente.', 'forte', 'EAU 2026 (recomendada)', ['rplnd'], { kind: 'padrao' }));
      out.push(R('TS-I-11', 'Quimioterapia adjuvante não tem papel no teratoma (quimiorresistente).', 'nao', 'EAU 2026'));
      return { out, alerts, pend, info, followup: fu('ns_rplnd') };
    }
    if (hist === 'estroma') {
      const mal = p.estroma_maligno === 'sim';
      info.status = 'Tumor do cordão/estroma (Leydig/Sertoli)' + (mal ? ' com fatores de malignidade' : ' sem fatores de malignidade');
      if (mal) out.push(R('TS-I-12', 'Fatores de malignidade (> 5 cm, necrose, invasão vascular, mitoses > 3/10 CGA, atipia, infiltração): RPLND poupadora de nervos e TC de tórax/abdome; tumores metastáticos são quimiorresistentes (sobrevida curta).', 'moderada', 'EAU 2026', ['rplnd'], { kind: 'padrao' }));
      else out.push(R('TS-I-13', 'Sem fatores de malignidade: orquiectomia (ou cirurgia poupadora) é suficiente; seguimento clínico e com ultrassom contralateral; hormônios (testosterona, estradiol) se sintomas.', 'forte', 'EAU 2026', [], { kind: 'padrao' }));
      return { out, alerts, pend, info, followup: { img: 'TC de abdome e tórax anual por 5 anos se fatores de malignidade; sem imagem de rotina nos demais', lab: 'Testosterona, estradiol e LH/FSH anuais; marcadores não se aplicam', stop: '5 anos' } };
    }
    if (hist === 'seminoma') {
      const fat = [size !== null && size >= 4 ? 'tamanho ≥ 4 cm' : null, rete ? 'invasão da rete testis' : null, lvi ? 'invasão linfovascular' : null, p.hcg_ldh_alta === 'sim' ? 'hCG/LDH elevados pré-operatórios' : null].filter(Boolean);
      info.status = `Seminoma estádio ${stageLabel} (${pT}${lvi ? ', LVI' : ''})`;
      info.risco = fat.length ? `Fatores de risco: ${fat.join(', ')} · recidiva em vigilância ≈ 15–20% em 5 anos` : 'Sem fatores de risco · recidiva em vigilância ≈ 4–8% em 5 anos';
      if (!fat.length) {
        out.push(R('TS-SEM-01', 'Vigilância ativa: sobrevida câncer-específica > 99%; recidiva 4–8%, quase sempre retroperitoneal, curável com RT, RPLND ou BEP/EP.', 'forte', 'EAU 2026 (forte: vigilância preferida)', ['tc_seguimento'], { kind: 'padrao' }));
        out.push(R('TS-SEM-02', 'Não dar tratamento adjuvante (carboplatina ou radioterapia) a pacientes sem fatores de risco.', 'nao', 'EAU 2026 (forte contra)'));
      } else {
        const dub = adesao === 'duvidosa';
        out.push(R('TS-SEM-03', `Vigilância ativa é a opção preferida${dub ? ', mas exige calendário rigoroso de TC e marcadores' : ''}: recidiva 15–20% com 1–2 fatores, curável em > 99%.`, 'forte', 'EAU 2026 (forte)', ['tc_seguimento'], { kind: dub ? undefined : 'padrao' }));
        out.push(R('TS-SEM-04', `Carboplatina AUC 7 em dose única (reduz recidiva para ~5%; 1/3 das recidivas fora do retroperitônio): opção se o paciente prefere adjuvância${dub ? ' ou tem adesão duvidosa à vigilância' : ''}; não inferior à radioterapia com menos segundo câncer.`, dub ? 'forte' : 'moderada', 'EAU 2026 (forte se adjuvância for escolhida); MRC TE19', ['carbo'], { kind: dub ? 'padrao' : undefined }));
        out.push(R('TS-SEM-05', 'Radioterapia adjuvante (20 Gy para-aórtica) não é rotina: segundo câncer e risco cardiovascular; reservar a casos muito selecionados.', 'nao', 'EAU 2026 (forte contra a rotina)', ['rt']));
      }
      return { out, alerts, pend, info, followup: fu('sem_vig') };
    }
    // não seminoma
    info.status = `Não seminoma estádio ${stageLabel} (${pT}${lvi ? ', invasão linfovascular' : ', sem invasão linfovascular'}${ce ? ', carcinoma embrionário predominante' : ''})`;
    info.risco = lvi ? 'Alto risco: recidiva em vigilância ≈ 50% (52% no SWENOTECA); ≤ 3% após BEP × 1' : `Baixo risco: recidiva em vigilância ≈ 15%${ce ? ' (até 20% com carcinoma embrionário predominante)' : ''}`;
    const dub = adesao === 'duvidosa';
    if (!lvi) {
      out.push(R('TS-NS-01', 'Vigilância ativa (baixo risco): recidiva ~15%, quase toda nos 2 primeiros anos, curável com BEP × 3 (bom prognóstico) ou RPLND.', dub ? 'moderada' : 'forte', 'EAU 2026 (forte)', ['tc_seguimento'], { kind: dub ? undefined : 'padrao' }));
      out.push(R('TS-NS-02', 'BEP × 1 (cisplatina 20 mg/m² + etoposide 100 mg/m² D1–5, bleomicina 30 UI D1, 8, 15): opção para quem não quer ou não pode cumprir a vigilância (recidiva ≤ 3%).', dub ? 'forte' : 'moderada', 'EAU 2026 (forte para quem não adere)', ['bep'], { kind: dub ? 'padrao' : undefined }));
    } else {
      out.push(R('TS-NS-03', 'BEP × 1 adjuvante: reduz recidiva de ~50% para ≤ 3%, com toxicidade de um único ciclo (SWENOTECA); preferir 1 ciclo a 2 (mesma eficácia, menos toxicidade).', 'forte', 'EAU 2026 (forte); SWENOTECA', ['bep'], { kind: 'padrao' }));
      out.push(R('TS-NS-04', 'Vigilância ativa é alternativa válida (decisão compartilhada): metade recidiva e precisa de BEP × 3, mas metade nunca recebe quimioterapia; exige TC a cada 3–4 meses no 1º ano.', dub ? 'fraca' : 'forte', 'EAU 2026 (forte, após discutir prós e contras)', ['tc_seguimento']));
      out.push(R('TS-NS-05', 'RPLND primária poupadora de nervos: só em contraindicação à quimioterapia com recusa de vigilância, em centro de alto volume (pN1 → vigilância ou BEP × 2; pN2–3 → BEP × 2).', 'fraca', 'EAU 2026 (forte para "apenas selecionados")', ['rplnd']));
      out.push(R('TS-NS-06', 'BEP × 2 adjuvante não é mais recomendado (toxicidade adicional sem ganho).', 'nao', 'EAU 2026; SWENOTECA'));
    }
    if (p.deseja_filhos === 'sim') alerts.push(R('TS-NS-07', 'Deseja filhos: banco de sêmen antes de BEP; a RPLND não poupadora causa ejaculação retrógrada; a espermatogênese recupera em ~50% em 2 anos após BEP × 1.', 'alerta', 'EAU 2026'));
    return { out, alerts, pend, info, followup: fu(lvi ? 'ns_vig_alto' : 'ns_vig') };
  }
  function fu(k) {
    return {
      sem_vig: { img: 'TC de abdome/pelve aos 6 e 12 meses, 24, 36 e 60 meses; radiografia de tórax aos 12 meses; após carboplatina, incluir pelve (recidivas atípicas)', lab: 'AFP, hCG, LDH e consulta a cada 6 meses por 2 anos, depois anual', stop: '5 anos; alta se sem recidiva' },
      ns_vig: { img: 'TC de abdome/pelve aos 3–4 e 12 meses, depois 24, 36 e 60 meses; radiografia de tórax aos 6 e 12 meses, depois anual até 3 anos', lab: 'AFP, hCG, LDH e consulta a cada 3 meses no 1º e 2º anos, a cada 6 meses no 3º, depois anual', stop: '5 anos' },
      ns_vig_alto: { img: 'TC de abdome/pelve aos 3, 6 (alto risco) e 12 meses, depois 24, 36 e 60 meses; radiografia de tórax aos 6 e 12 meses, depois anual', lab: 'AFP, hCG, LDH e consulta a cada 3 meses nos 2 primeiros anos, a cada 6 meses no 3º, depois anual', stop: '5 anos; após BEP × 1: marcadores a cada 3 meses no 1º ano, TC aos 12, 24 e 60 meses' },
      ns_rplnd: { img: 'TC de abdome/pelve aos 12 e 24 meses, depois anual até 5 anos; radiografia de tórax semestral no 1º ano', lab: 'Marcadores a cada 3 meses por 2 anos, depois semestral', stop: '5 anos (teratoma: recidiva tardia possível, TC anual prolongada)' },
      met: { img: 'TC de tórax/abdome/pelve aos 3–6 e 12 meses, 24, 36 e 60 meses; depois anual até 10 anos (recidiva tardia, teratoma)', lab: 'AFP, hCG, LDH e consulta a cada 3 meses por 2 anos, a cada 6 meses no 3º, depois anual', stop: '10 anos; toxicidade (testosterona, PA, lipídios, audição) vitalícia' },
    }[k];
  }

  /* ---------- Módulo 2 – doença metastática, primeira linha ---------- */
  function metastatic(p) {
    const out = [], alerts = [], pend = [], info = {};
    const g = igcccg(p);
    const sites = p.sitios || [];
    const rpOnly = sites.length === 1 && sites[0] === 'rp';
    const rpSize = num(p.rp_tamanho);
    const bleoContra = p.bleo_contra === 'sim';
    const tfg = num(p.tfg), idadeM = num(p.idade);
    info.status = g.label + ` · sobrevida 5 anos ≈ ${g.os} (PFS ${g.pfs})`;
    if (idadeM !== null && idadeM > 50 && !bleoContra) alerts.push(R('TS-MET-25', `Idade ${idadeM} anos (> 50): maior risco de toxicidade pulmonar por bleomicina — medir DLCO antes do 1º ciclo e preferir EP × 4 (bom prognóstico) ou VIP (intermediário/pobre) se DLCO reduzida.`, 'alerta', 'EAU 2026'));
    if (idadeM !== null && idadeM < 18) alerts.push(R('TS-MET-26', 'Paciente < 18 anos: tratar em centro de oncologia pediátrica/AYA (protocolos e doses pediátricas; preservação de fertilidade).', 'alerta', 'EAU 2026; COG'));
    info.why = g.why;
    if (p.orquiectomia === 'nao') pend.push(R('TS-MET-00', 'Orquiectomia inguinal ainda não feita: realizar antes da quimioterapia, salvo risco de vida (então após o término); marcadores pós-orquiectomia definem o S.', 'padrao', 'EAU 2026 (forte)', ['orquiectomia']));
    if (p.banco_semen !== 'sim') pend.push(R('TS-DX-02', 'Banco de sêmen antes do primeiro ciclo (1–3 coletas em 48–72 h não atrasam o tratamento).', 'padrao', 'EAU 2026 (forte)', ['banco_semen']));
    if ((sites.includes('pulmao') && p.pulmao_multiplas === 'sim') || num(p.hcg) > 5000 || g.group === 'pobre' || p.sintomas_neuro === 'sim') pend.push(R('TS-MET-01', 'RM de crânio (ou TC com contraste) antes de iniciar: múltiplas metástases pulmonares, hCG muito alta, prognóstico pobre ou sintomas neurológicos.', 'padrao', 'EAU 2026 (forte)'));
    pend.push(R('TS-MET-02', 'Antes do 1º ciclo: hemograma, TFG (cisplatina exige ≥ 60; VIP se < 60 com ajuste), audiometria basal, DLCO/espirometria se bleomicina, ECG; profilaxia antiemética tripla; hidratação e magnésio; sem redução de dose nem atraso por neutropenia sem febre.', 'padrao', 'EAU 2026; ESMO 2022'));
    // seminoma IIA/B de baixo volume
    if (g.hist === 'seminoma' && rpOnly && rpSize !== null && rpSize <= 3.5 && (g.S.s === 'S0' || g.S.s === 'S1')) {
      info.iia = `Seminoma ${rpSize <= 2 ? 'IIA' : 'IIB'} de baixo volume (linfonodo ${rpSize} cm, marcadores ${g.S.s})`;
      const centro = p.centro_rplnd === 'sim';
      out.push(R('TS-SII-01', `RPLND poupadora de nervos primária (template modificado, aberta ou robótica) em centro de excelência: candidato ideal com linfonodo ${rpSize <= 2 ? '~2 cm (IIA)' : '≤ 3–3,5 cm (IIB)'}, marcadores negativos; SEMS/PRIMETEST/COTRIMS — sobrevida livre de recidiva em 2 anos 70–90% sem adjuvância, recidivas curadas com BEP/EP, complicações 4–9%.`, 'moderada', 'EAU 2026 (fraca; só em centros de alto volume); NCCN v1.2026', ['rplnd'], { kind: centro ? 'padrao' : undefined }));
      out.push(R('TS-SII-02', `Radioterapia ${rpSize <= 2 ? '30 Gy (IIA)' : '36 Gy (IIB)'} para-aórtica e ilíaca ipsilateral: recidiva ${rpSize <= 2 ? '5–10%' : '10–15%'}; risco tardio de segundo câncer e cardiovascular.`, 'moderada', 'EAU 2026', ['rt'], { kind: !centro && rpSize <= 3 ? 'padrao' : undefined }));
      out.push(R('TS-SII-03', 'BEP × 3 ou EP × 4: cura > 95%; padrão para IIB > 3 cm e IIC; mais toxicidade aguda que RT.', rpSize > 3 ? 'forte' : 'moderada', 'EAU 2026', [bleoContra ? 'ep' : 'bep'], { kind: rpSize > 3 ? 'padrao' : undefined }));
      out.push(R('TS-SII-04', 'Carboplatina AUC 7 × 1 + radioterapia focal 30 Gy no linfonodo (SAKK 01/10): PFS 3 anos 93,7%, 10 anos 92,8%; evidência ainda insuficiente para rotina.', 'fraca', 'EAU 2026 (fraca)', ['carbo', 'rt']));
      alerts.push(R('TS-SII-05', (centro ? '' : 'Sem centro com experiência em RPLND de seminoma: preferir radioterapia (IIA/IIB pequeno) ou quimioterapia. ') + 'Desescalonamento (RPLND, carboplatina + RT) só em centros especializados de alto volume; volume cirúrgico baixo associa-se a mais recidiva.', 'alerta', 'EAU 2026 (fraca)'));
      return { out, alerts, pend, info, igcccg: g, followup: fu('met') };
    }
    // por grupo
    if (g.group === 'bom') {
      if (!bleoContra) out.push(R('TS-MET-10', 'BEP × 3 (cisplatina 20 mg/m² D1–5, etoposide 100 mg/m² D1–5, bleomicina 30 UI D1, D8, D15; ciclos de 21 dias): padrão do bom prognóstico; esquema de 5 dias, sem redução de dose.', 'forte', 'EAU 2026 (nível 1b, fortemente recomendado)', ['bep'], { kind: 'padrao' }));
      out.push(R('TS-MET-11', 'EP × 4 (sem bleomicina): apenas com contraindicação clara a bleomicina (DLCO reduzida, doença pulmonar, tabagismo pesado, idade > 50, TFG < 60).', bleoContra ? 'forte' : 'fraca', 'EAU 2026', ['ep'], { kind: bleoContra ? 'padrao' : undefined }));
    } else if (g.group === 'intermediario') {
      if (!bleoContra) out.push(R('TS-MET-12', 'BEP × 4: padrão do prognóstico intermediário (seminoma e não seminoma).', 'forte', 'EAU 2026 (nível 1b)', ['bep'], { kind: 'padrao' }));
      out.push(R('TS-MET-13', 'VIP × 4 (etoposide 75 mg/m² D1–5, ifosfamida 1,2 g/m² D1–5 com mesna, cisplatina 20 mg/m² D1–5) com G-CSF primário: se bleomicina contraindicada; mesma eficácia, mais mielotóxico.', bleoContra ? 'forte' : 'fraca', 'EAU 2026', ['vip', 'gcsf'], { kind: bleoContra ? 'padrao' : undefined }));
    } else {
      if (!bleoContra) out.push(R('TS-MET-14', 'BEP × 4 em centro de referência (alto volume melhora sobrevida no prognóstico pobre): padrão.', 'forte', 'EAU 2026 (nível 1b)', ['bep'], { kind: 'padrao' }));
      out.push(R('TS-MET-15', 'VIP × 4 com G-CSF: alternativa equivalente em eficácia e mais mielotóxica; preferida se bleomicina contraindicada.', bleoContra ? 'forte' : 'fraca', 'EAU 2026', ['vip', 'gcsf'], { kind: bleoContra ? 'padrao' : undefined }));
      out.push(R('TS-MET-16', `Marcadores com queda desfavorável após o 1º ciclo${p.queda === 'desfavoravel' ? ' (presente)' : ''}: intensificar para esquema de dose densa (GETUG-13: T-BEP/oxaliplatina-ifosfamida com G-CSF) em centro de referência — melhora PFS.`, p.queda === 'desfavoravel' ? 'moderada' : 'fraca', 'EAU 2026 (RCT); GETUG-13', ['vip', 'gcsf'], { kind: p.queda === 'desfavoravel' ? 'padrao' : undefined }));
      out.push(R('TS-MET-17', 'Altas doses com transplante autólogo em primeira linha não são superiores a BEP × 4 (fora de ensaio).', 'nao', 'EAU 2026'));
      alerts.push(R('TS-MET-18', 'Prognóstico pobre: tratar em centro de alto volume com oncologia, cirurgia de RPLND e UTI; discutir ensaio clínico.', 'alerta', 'EAU 2026'));
    }
    if (p.hcg_alta_pulmao === 'sim') alerts.push(R('TS-MET-19', 'hCG muito alta (> 50.000) com metástases pulmonares extensas (coriocarcinoma): 1º ciclo reduzido (EP por 3 dias) para evitar hemorragia pulmonar/ARDS, depois dose plena; UTI de prontidão.', 'alerta', 'EAU 2026; NCCN'));
    if (sites.includes('cerebro')) out.push(R('TS-MET-20', 'Metástase cerebral ao diagnóstico: quimioterapia BEP × 4 (primeira linha), com radioterapia ou cirurgia da lesão residual; sobrevida 5 anos 30–40%.', 'moderada', 'EAU 2026', ['bep', 'srs']));
    if (sites.includes('osso')) out.push(R('TS-MET-21', 'Metástase óssea (rara, pior prognóstico): quimioterapia sistêmica; RT para dor ou instabilidade; cirurgia em fratura iminente; sem bisfosfonato de rotina.', 'moderada', 'EAU 2026 (nova seção)', ['rt']));
    alerts.push(R('TS-MET-22', 'Tromboprofilaxia: avaliar risco individual (massa retroperitoneal > 5 cm, cateter central, Khorana ≥ 3); evitar cateter venoso central sempre que possível.', 'alerta', 'EAU 2026 (fraca)'));
    if (!bleoContra) alerts.push(R('TS-MET-23', 'Bleomicina: pneumonite em 1–3% (fatal em até 1%); suspender a bleomicina (manter o resto) se tosse seca, dispneia, estertores ou queda de DLCO; cuidado com O2 em alta fração na anestesia posterior. Raynaud em 20–30%.', 'alerta', 'EAU 2026; bula'));
    if (tfg !== null && tfg < 60) alerts.push(R('TS-MET-24', `TFG ${tfg} mL/min: cisplatina exige função renal preservada; hidratar, dividir doses ou considerar VIP/EP com ajuste em centro de referência; nunca substituir por carboplatina em doença metastática (inferior).`, 'alerta', 'EAU 2026'));
    out.push(R('TS-MET-25', 'Após o último ciclo: reestadiar com TC e marcadores em 3–4 semanas e seguir pelo fluxo "Massa residual após quimioterapia".', 'padrao', 'EAU 2026'));
    out.push(R('TS-MET-26', 'Não reduzir dose, não atrasar ciclos por neutropenia sem febre e não trocar cisplatina por carboplatina.', 'nao', 'EAU 2026 (forte)'));
    return { out, alerts, pend, info, igcccg: g, followup: fu('met') };
  }

  /* ---------- Módulo 3 – massa residual após quimioterapia ---------- */
  function residual(p) {
    const out = [], alerts = [], pend = [], info = {};
    const hist = p.histologia === 'seminoma' ? 'seminoma' : 'nao_seminoma';
    const marc = p.marcadores || 'normal';   // normal | caindo | subindo
    const massa = num(p.massa_rp) ?? 0;
    const extra = p.extra_rp === 'sim';
    const pet = p.pet || 'nao';              // nao | neg | pos | ni
    const meses = num(p.meses_pos_quimio);
    info.status = (hist === 'seminoma' ? 'Seminoma' : 'Não seminoma') + ' após quimioterapia · massa retroperitoneal ' + (massa ? massa + ' cm' : 'ausente') + (extra ? ' · massa extra-retroperitoneal' : '') + ' · marcadores ' + ({ normal: 'normais', caindo: 'em queda', subindo: 'em elevação' })[marc];
    if (marc === 'subindo') {
      out.push(R('TS-RES-00', 'Marcadores em elevação após a quimioterapia: doença viável — não operar; quimioterapia de resgate pelo fluxo "Recidiva e refratário" (TIP/VeIP ou altas doses). Cirurgia "de desespero" só em lesão única ressecável com marcador em platô.', 'forte', 'EAU 2026', [], { kind: 'padrao' }));
      return { out, alerts, pend, info };
    }
    if (marc === 'caindo') pend.push(R('TS-RES-01', 'Marcadores ainda em queda: aguardar normalização (ou platô) com dosagens semanais antes de decidir a cirurgia; a RPLND exige marcadores normais ou em platô baixo.', 'padrao', 'EAU 2026'));
    if (hist === 'seminoma') {
      if (massa <= 3) {
        out.push(R('TS-RES-10', `Seminoma com massa residual ${massa ? '≤ 3 cm' : 'ausente'}: vigilância com TC e marcadores; sem PET e sem cirurgia (necrose/fibrose em > 90%).`, 'forte', 'EAU 2026', ['tc_seguimento'], { kind: 'padrao' }));
      } else {
        if (pet === 'nao' || pet === 'ni') { pend.push(R('TS-RES-11', `Massa > 3 cm: FDG-PET/CT não antes de 2 meses (ideal 3) após o último ciclo${meses !== null && meses < 2 ? ' — ainda cedo (' + meses + ' meses): aguardar' : ''}; VPN > 90%, VPP 23–69%.`, 'padrao', 'EAU 2026', ['pet'])); out.push(R('TS-RES-12', 'Enquanto aguarda o PET: vigilância com marcadores; não indicar RPLND só pelo tamanho.', 'moderada', 'EAU 2026', [], { kind: 'padrao' })); }
        else if (pet === 'neg') out.push(R('TS-RES-13', 'PET negativo em massa > 3 cm: vigilância (valor preditivo negativo > 90%); TC em 3 e 6 meses, depois conforme calendário.', 'forte', 'EAU 2026', ['tc_seguimento'], { kind: 'padrao' }));
        else { out.push(R('TS-RES-14', 'PET positivo: não decidir só pelo PET (VPP 23–69%, fibrose inflamatória): repetir PET em 6–8 semanas ou biopsiar; massa em crescimento com marcadores normais → biópsia antes de resgatar; tumor viável confirmado → resgate (TIP) ou RPLND em centro experiente (cirurgia difícil, fibrose desmoplásica).', 'forte', 'EAU 2026', ['pet', 'rplnd_pos', 'tip'], { kind: 'padrao' })); out.push(R('TS-RES-15', 'Não fazer RPLND baseada apenas no PET.', 'nao', 'EAU 2026')); }
      }
      return { out, alerts, pend, info, followup: fu('met') };
    }
    // não seminoma
    if (p.rplnd_feita === 'sim') { /* histologia abaixo */ } else if (massa > 1 || extra) {
      out.push(R('TS-RES-20', `Não seminoma com residual ${massa > 1 ? '> 1 cm (' + massa + ' cm)' : ''}${extra ? (massa > 1 ? ' e ' : '') + 'extra-retroperitoneal' : ''} e marcadores normais: RPLND bilateral poupadora de nervos em 6–8 semanas após o último ciclo (obrigatória); template ipsilateral aceitável se residual < 5 cm e sem doença contralateral; nunca "lumpectomia".`, 'forte', 'EAU 2026 (forte)', ['rplnd_pos'], { kind: 'padrao' }));
      if (extra) out.push(R('TS-RES-21', 'Ressecar também as massas extra-retroperitoneais (pulmão, mediastino, fígado, pescoço): histologia discordante em 30–50%; pulmão bilateral → ressecar o lado maior e vigiar o outro se necrose.', 'forte', 'EAU 2026', ['rplnd_pos']));
      if (massa >= 5 || p.igcccg_inicial === 'pobre') alerts.push(R('TS-RES-22', 'Massa volumosa ou prognóstico pobre inicial: cirurgia complexa (vasos, rim, ureter); planejar em centro de referência com cirurgia vascular; ressecção completa é o fator prognóstico principal.', 'alerta', 'EAU 2026'));
    } else {
      out.push(R('TS-RES-23', 'Residual < 1 cm com marcadores normais: vigilância (recidiva 6–9%, teratoma em ~20% das peças) e RPLND são ambas aceitáveis; vigilância é a prática mais comum, com TC anual prolongada.', 'moderada', 'EAU 2026', ['tc_seguimento'], { kind: 'padrao' }));
      out.push(R('TS-RES-24', 'RPLND bilateral poupadora de nervos é opção em prognóstico intermediário/pobre, teratoma no primário ou paciente que prefere evitar vigilância longa.', 'fraca', 'EAU 2026', ['rplnd_pos']));
    }
    // histologia da RPLND
    if (p.rplnd_feita === 'sim') {
      const h = p.histo_rplnd || 'necrose';
      info.histo = 'Histologia da RPLND: ' + ({ necrose: 'necrose/fibrose (40–50% dos casos)', teratoma: 'teratoma maduro/imaturo (35–40%)', 'viavel<10': 'tumor viável < 10%', 'viavel>=10': 'tumor viável ≥ 10%' })[h] + (p.margem_rplnd === 'R1' ? ' · R1' : ' · R0');
      if (h === 'necrose' || h === 'teratoma') out.push(R('TS-RES-30', 'Necrose ou teratoma na peça: sem tratamento adicional; seguimento prolongado (teratoma pode recidivar tardiamente ou transformar).', 'forte', 'EAU 2026', [], { kind: 'padrao' }));
      else if (h === 'viavel<10' && p.margem_rplnd !== 'R1' && p.igcccg_inicial === 'bom') out.push(R('TS-RES-31', 'Tumor viável < 10%, R0 e bom prognóstico inicial: vigilância (consolidação não melhora sobrevida).', 'forte', 'EAU 2026', [], { kind: 'padrao' }));
      else out.push(R('TS-RES-32', 'Tumor viável ≥ 10%, R1 ou prognóstico intermediário/pobre inicial: discutir 2 ciclos de consolidação (EP ou VIP) em reunião multidisciplinar (benefício incerto; retrospectivo).', 'fraca', 'EAU 2026', ['ep', 'vip'], { kind: 'padrao' }));
    }
    alerts.push(R('TS-RES-25', 'Residual após quimioterapia de resgate: ressecar sempre, mesmo < 1 cm (tumor viável em ~50%).', 'alerta', 'EAU 2026'));
    return { out, alerts, pend, info, followup: fu('met') };
  }

  /* ---------- Módulo 4 – recidiva e refratário ---------- */
  function relapse(p) {
    const out = [], alerts = [], pend = [], info = {};
    const tipo = p.tipo || 'pos_1l';   // pos_I | pos_1l | segunda | tardia | refratario
    const prev = new Set(p.previos || []);
    const ecog = num(p.ecog) ?? 0;
    if (tipo === 'pos_I') {
      info.status = 'Recidiva após estádio I (vigilância ou adjuvância)';
      out.push(R('TS-REC-01', 'Recidiva após estádio I: estadiar e tratar como doença metastática de primeira linha pelo IGCCCG (fluxo "Doença metastática"); quase sempre bom prognóstico → BEP × 3; seminoma com linfonodo pequeno → RT ou RPLND em centro experiente.', 'forte', 'EAU 2026', ['bep', 'rt', 'rplnd'], { kind: 'padrao' }));
      if (prev.has('carbo')) alerts.push(R('TS-REC-02', 'Após carboplatina adjuvante, 1/3 das recidivas são extra-retroperitoneais (pelve, mediastino): estadiar com TC de tórax/abdome/pelve.', 'alerta', 'EAU 2026'));
      return { out, alerts, pend, info };
    }
    if (tipo === 'tardia') {
      info.status = 'Recidiva tardia (> 2 anos após remissão completa)';
      out.push(R('TS-REC-10', 'Recidiva tardia: cirurgia radical de toda doença ressecável é a primeira escolha (quimiorresistente; teratoma e saco vitelino com AFP); quimioterapia (TIP) só se irressecável ou marcadores muito altos, seguida de cirurgia de tudo que restar.', 'forte', 'EAU 2026', ['rplnd_pos'], { kind: 'padrao' }));
      out.push(R('TS-REC-11', 'Se irressecável: TIP × 4 e reavaliar cirurgia; sobrevida 5 anos ~50% com R0 e ~20% sem ressecção.', 'moderada', 'EAU 2026', ['tip']));
      return { out, alerts, pend, info };
    }
    if (tipo === 'refratario') {
      info.status = 'Refratário a cisplatina (progressão durante ou até 4 semanas após platina)';
      out.push(R('TS-REC-20', 'Refratário a cisplatina: gemcitabina + oxaliplatina ± paclitaxel (GOP) com intenção de tornar ressecável; cirurgia de qualquer residual; ensaio clínico. Imunoterapia não demonstrou benefício.', 'fraca', 'EAU 2026; fase II', ['gop'], { kind: 'padrao' }));
      out.push(R('TS-REC-21', 'Altas doses com transplante podem ser consideradas em refratário selecionado jovem com boa função orgânica (remissão 10–20%).', 'fraca', 'EAU 2026', ['hdct']));
      alerts.push(R('TS-REC-22', 'Discutir objetivos e cuidados paliativos integrados; marcadores em platô baixo com lesão única → cirurgia de desespero pode curar.', 'alerta', 'EAU 2026'));
      return { out, alerts, pend, info };
    }
    const s = ipfsg(p);
    info.status = (tipo === 'segunda' ? 'Segunda recidiva ou além' : 'Primeira recidiva após quimioterapia de 1ª linha');
    info.ipfsg = s.label + (s.f.length ? ' — ' + s.f.join(', ') : '');
    const altoRisco = ['intermediario', 'alto', 'muito_alto'].includes(s.group) || tipo === 'segunda';
    const hdOk = p.transplante !== 'nao' && ecog <= 2;
    pend.push(R('TS-REC-30', 'Antes do resgate: confirmar recidiva (marcadores em 2 dosagens ou biópsia de massa crescente com marcadores normais — pode ser teratoma, cirurgia); TC de tórax/abdome/pelve; RM de crânio; hemograma, TFG, audiometria; banco de sêmen se não feito.', 'padrao', 'EAU 2026'));
    if (!altoRisco) {
      out.push(R('TS-REC-31', 'TIP × 4 (paclitaxel 250 mg/m² D1, ifosfamida 1,5 g/m² D2–5 com mesna, cisplatina 25 mg/m² D2–5; G-CSF; 21 dias) ou VeIP/VIP × 4: remissão duradoura ~50% no baixo risco.', 'forte', 'EAU 2026; IPFSG', ['tip', 'gcsf'], { kind: 'padrao' }));
      if (hdOk) out.push(R('TS-REC-32', 'Altas doses (TI-CE: paclitaxel + ifosfamida × 2, depois carboplatina AUC 8 + etoposide 400 mg/m² D1–3 × 3 com resgate de células-tronco) é alternativa; a análise IPFSG sugere +10–15% de sobrevida em todos os grupos, mas o TIGER (TIP × 4 vs TI-CE) ainda não foi publicado.', 'moderada', 'EAU 2026; Lorch/IPFSG', ['hdct', 'gcsf']));
    } else {
      if (hdOk) out.push(R('TS-REC-33', `${tipo === 'segunda' ? 'Segunda recidiva' : 'IPFSG intermediário a muito alto'}: quimioterapia de altas doses com transplante autólogo (TI-CE ou CE × 2–3) em centro de transplante — análise IPFSG: +10–15% de sobrevida; TIGER aguardado.`, 'moderada', 'EAU 2026; IPFSG; NCCN v1.2026', ['hdct', 'gcsf'], { kind: 'padrao' }));
      out.push(R('TS-REC-34', 'TIP × 4 (ou VeIP/VIP/GIP) em dose convencional com G-CSF: padrão quando altas doses não são viáveis; remissão duradoura 25–40% no alto risco.', hdOk ? 'forte' : 'forte', 'EAU 2026', ['tip', 'gcsf'], { kind: hdOk ? undefined : 'padrao' }));
      if (!hdOk) alerts.push(R('TS-REC-35', 'Transplante autólogo indisponível ou paciente inapto (ECOG > 2): encaminhar a centro de referência; no SUS a indicação é reconhecida, mas há fila.', 'alerta', 'Regulamento técnico de transplante (a confirmar)'));
    }
    out.push(R('TS-REC-36', 'Ressecar toda massa residual após o resgate, mesmo < 1 cm (tumor viável em ~50%); até 20% alcançam remissão duradoura com cirurgia.', 'forte', 'EAU 2026', ['rplnd_pos']));
    if (p.cerebro === 'sim') out.push(R('TS-REC-37', 'Metástase cerebral na recidiva: quimioterapia de resgate + radioterapia (SRS ou crânio total) ± cirurgia de lesão única; sobrevida 5 anos ~20%.', 'moderada', 'EAU 2026', ['srs']));
    out.push(R('TS-REC-38', 'Ensaio clínico e centro de alto volume em qualquer recidiva; evitar esquemas sem cisplatina fora do refratário.', 'ensaio', 'EAU 2026'));
    if (p.hist_rec === 'seminoma') alerts.push(R('TS-REC-39', 'Seminoma recidivado tem prognóstico melhor (IPFSG −1 ponto): dose convencional costuma bastar; altas doses só em alto risco.', 'alerta', 'IPFSG'));
    return { out, alerts, pend, info, ipfsg: s };
  }

  /* ---------- Disponibilidade no Brasil ---------- */
  const BR = {
    orquiectomia: { sus: 'ok', ans: 'ok', nota: '' },
    protese: { sus: 'lim', ans: 'ok*', nota: 'Prótese registrada; raramente fornecida no SUS; convênio conforme contrato' },
    poupadora: { sus: 'lim', ans: 'ok', nota: 'Exige congelação disponível e cirurgião experiente' },
    banco_semen: { sus: 'lim', ans: 'nao', nota: 'Poucos serviços públicos (universitários); convênios em geral não cobrem; custo privado R$ 1.000–3.000 + anuidade' },
    tc_seguimento: { sus: 'ok*', ans: 'ok', nota: 'Filas podem comprometer o calendário da vigilância' },
    mir371: { sus: 'nao', ans: 'nao', nota: 'Sem registro; apenas pesquisa' },
    pet: { sus: 'nao', ans: 'conf', nota: 'Não incorporado para tumor germinativo no SUS; rol ANS a confirmar' },
    rplnd: { sus: 'lim', ans: 'ok', nota: 'Centros universitários; volume baixo na maioria — encaminhar a referência' },
    rplnd_pos: { sus: 'lim', ans: 'ok', nota: 'RPLND pós-quimioterapia em centro de referência com cirurgia vascular' },
    rt: { sus: 'ok', ans: 'ok', nota: '' },
    srs: { sus: 'lim', ans: 'ok', nota: 'Radiocirurgia em centros de referência' },
    bep: { sus: 'ok', ans: 'ok', nota: 'APAC de quimioterapia curativa; bleomicina com desabastecimento pontual' },
    ep: { sus: 'ok', ans: 'ok', nota: '' },
    vip: { sus: 'ok', ans: 'ok', nota: 'Ifosfamida com desabastecimento pontual' },
    carbo: { sus: 'ok', ans: 'ok', nota: '' },
    tip: { sus: 'ok*', ans: 'ok', nota: 'Paclitaxel off-label em tumor germinativo, uso consolidado' },
    gop: { sus: 'ok*', ans: 'ok', nota: 'Off-label' },
    hdct: { sus: 'lim', ans: 'ok*', nota: 'Transplante autólogo: indicação reconhecida no regulamento (a confirmar); poucos centros e fila' },
    gcsf: { sus: 'ok', ans: 'ok', nota: '' },
    testosterona: { sus: 'ok', ans: 'ok', nota: '' },
  };

  return { RULES, sCat, igcccg, ipfsg, stage1, metastatic, residual, relapse, BR };
})();

/* Posologia – câncer de testículo (EAU 2026, NCCN v1.2026, ESMO 2022, bulas). Revisão clínica obrigatória antes do uso assistencial. */
const TDOSES = {
  carbo_auc7: { cat: 'Estádio I', nome: 'Carboplatina AUC 7 (seminoma estádio I)', esquema: 'Dose (mg) = 7 × (TFG + 25), com TFG medida (EDTA/iotalamato) ou estimada; infusão IV de 1 h; dose única', duracao: '1 ciclo (1 dia)', obs: 'Não inferior à radioterapia (MRC TE19) com menos segundo câncer; AUC 7 (não AUC 5–6). Mielossupressão leve (hemograma em 2–3 semanas), náusea. Recidivas em 1/3 fora do retroperitônio: seguimento com TC de pelve.' },
  bep1: { cat: 'Estádio I', nome: 'BEP × 1 adjuvante (não seminoma estádio I de alto risco)', esquema: 'Cisplatina 20 mg/m² IV D1–5; etoposide 100 mg/m² IV D1–5; bleomicina 30 UI IV/IM D1, D8 e D15', duracao: '1 ciclo de 21 dias', obs: 'Reduz recidiva de ~50% para ≤ 3% (SWENOTECA); 1 ciclo preferido a 2. Banco de sêmen antes; hidratação e antiemese da cisplatina; DLCO basal.' },
  /* Metastático 1ª linha */
  bep: { cat: 'Doença metastática', nome: 'BEP (× 3 bom prognóstico; × 4 intermediário/pobre)', esquema: 'Cisplatina 20 mg/m² IV D1–5 (hidratação 1–2 L antes e depois, magnésio, manitol opcional); etoposide 100 mg/m² IV D1–5; bleomicina 30 UI IV D1, D8, D15; ciclos de 21 dias, sem redução de dose nem atraso por neutropenia sem febre', duracao: '3 ciclos (bom) ou 4 ciclos (intermediário/pobre); 9–12 semanas', obs: 'Esquema de 5 dias é o padrão (o de 3 dias é aceitável só no bom prognóstico, com mais toxicidade). Antiemese tripla (aprepitanto, 5-HT3, dexametasona). Bleomicina: pneumonite 1–3% — suspender só a bleomicina se sintomas/queda de DLCO; dose cumulativa ≤ 360 UI. Cisplatina: ototoxicidade, neuropatia, nefrotoxicidade (TFG antes de cada ciclo), Raynaud. G-CSF secundário após neutropenia febril (primário se intermediário/pobre em centros).' },
  ep: { cat: 'Doença metastática', nome: 'EP × 4 (bleomicina contraindicada)', esquema: 'Cisplatina 20 mg/m² IV D1–5 + etoposide 100 mg/m² IV D1–5; ciclos de 21 dias', duracao: '4 ciclos', obs: 'Bom prognóstico com contraindicação clara a bleomicina (DLCO < 60–70%, doença pulmonar, tabagismo pesado, > 50 anos, TFG < 60). Equivalente a BEP × 3 no bom prognóstico; não usar em intermediário/pobre.' },
  vip: { cat: 'Doença metastática', nome: 'VIP × 4 (etoposide, ifosfamida, cisplatina)', esquema: 'Etoposide 75 mg/m² IV D1–5; ifosfamida 1,2 g/m² IV D1–5 com mesna (20% da dose antes e 4 e 8 h depois, ou infusão contínua); cisplatina 20 mg/m² IV D1–5; G-CSF primário (filgrastim 5 µg/kg/dia D6–15 ou pegfilgrastim D6); ciclos de 21 dias', duracao: '4 ciclos', obs: 'Intermediário/pobre com bleomicina contraindicada; mesma eficácia que BEP × 4, mais mielotóxico. Ifosfamida: encefalopatia (azul de metileno), cistite hemorrágica (mesna, hidratação), nefrotoxicidade tubular.' },
  tbep: { cat: 'Doença metastática', nome: 'Intensificação por queda desfavorável de marcadores (GETUG-13)', esquema: 'Após BEP × 1 com queda desfavorável de AFP/hCG: esquema de dose densa — paclitaxel-BEP com oxaliplatina + ifosfamida alternados e G-CSF, em centro de referência (protocolo GETUG-13)', duracao: 'Ciclos 2–4 (total ~12 semanas)', obs: 'Melhora PFS no prognóstico pobre; toxicidade neurológica e hematológica alta; só em centro com experiência.' },
  /* Resgate */
  tip: { cat: 'Resgate', nome: 'TIP × 4 (paclitaxel, ifosfamida, cisplatina)', esquema: 'Paclitaxel 250 mg/m² IV em 24 h D1; ifosfamida 1,5 g/m² IV D2–5 com mesna; cisplatina 25 mg/m² IV D2–5; G-CSF D6–15 (ou pegfilgrastim); ciclos de 21 dias', duracao: '4 ciclos', obs: 'Resgate convencional padrão (MSKCC: remissão duradoura ~60% em selecionados; ~50% em geral). Neuropatia (paclitaxel + cisplatina), mielossupressão grave, encefalopatia por ifosfamida. Ressecar toda massa residual após.' },
  veip: { cat: 'Resgate', nome: 'VeIP × 4 (vinblastina, ifosfamida, cisplatina)', esquema: 'Vinblastina 0,11 mg/kg IV D1–2; ifosfamida 1,2 g/m² IV D1–5 com mesna; cisplatina 20 mg/m² IV D1–5; G-CSF; ciclos de 21 dias', duracao: '4 ciclos', obs: 'Alternativa ao TIP quando paclitaxel não é tolerado; remissão duradoura 25–50%.' },
  gip: { cat: 'Resgate', nome: 'GIP × 4 (gemcitabina, ifosfamida, cisplatina)', esquema: 'Gemcitabina 1.000 mg/m² IV D1 e D5; ifosfamida 1,2 g/m² D1–5 com mesna; cisplatina 20 mg/m² D1–5; G-CSF; ciclos de 21 dias', duracao: '4 ciclos', obs: 'Opção francesa (GETUG) com eficácia semelhante ao TIP em fase II; menos neuropatia.' },
  tice: { cat: 'Resgate', nome: 'TI-CE — altas doses com transplante autólogo (MSKCC)', esquema: 'Indução: paclitaxel 200 mg/m² D1 + ifosfamida 2 g/m² D2–4 com mesna, × 2 ciclos a cada 14 dias, com coleta de células-tronco (G-CSF/leucaférese); depois carboplatina AUC 8/dia D1–3 + etoposide 400 mg/m²/dia D1–3, × 3 ciclos a cada 14–21 dias, cada um seguido de reinfusão de células-tronco', duracao: '~10–12 semanas', obs: 'Remissão duradoura ~50% na primeira recidiva (Feldman); mortalidade do tratamento 2–3%; só em centro de transplante. TIGER (TIP × 4 vs TI-CE) aguardado. Alternativa: CE × 2–3 (Indiana: carboplatina 700 mg/m² + etoposide 750 mg/m² D1–3, × 2 ciclos com transplante).' },
  gop: { cat: 'Resgate', nome: 'GOP (gemcitabina, oxaliplatina, paclitaxel) — refratário', esquema: 'Gemcitabina 800 mg/m² IV D1 e D8; oxaliplatina 130 mg/m² IV D1; paclitaxel 80 mg/m² IV D1 e D8; ciclos de 21 dias', duracao: 'Até 6 ciclos ou até ressecabilidade', obs: 'Refratário a cisplatina: resposta 25–50%, remissão duradoura 10–15% quando seguida de cirurgia; neuropatia (oxaliplatina + paclitaxel).' },
  gcsf: { cat: 'Suporte', nome: 'Filgrastim / pegfilgrastim', esquema: 'Filgrastim 5 µg/kg/dia SC do D6 até recuperação (ou pegfilgrastim 6 mg SC única 24 h após o fim do ciclo)', duracao: 'A cada ciclo de VIP, TIP, VeIP, GIP e altas doses; secundário em BEP após neutropenia febril', obs: 'Não atrasar ciclos por neutropenia sem febre; dor óssea.' },
  cis_suporte: { cat: 'Suporte', nome: 'Suporte da cisplatina', esquema: 'Hidratação 1–2 L de soro fisiológico com KCl e MgSO4 antes e depois de cada dose; diurese > 100 mL/h; antiemese: aprepitanto 125/80 mg + ondansetrona/palonosetrona + dexametasona (+ olanzapina 5–10 mg à noite); magnésio e potássio séricos diários', duracao: 'D1–5 de cada ciclo', obs: 'TFG ≥ 60 antes de cada ciclo; audiometria basal e se zumbido; neuropatia cumulativa. Evitar AINE e contraste iodado nos dias da cisplatina.' },
  tromboprofilaxia: { cat: 'Suporte', nome: 'Tromboprofilaxia durante quimioterapia', esquema: 'Enoxaparina 40 mg SC/dia (ou apixabana 2,5 mg 2×/dia) durante a quimioterapia em pacientes de risco (massa retroperitoneal > 5 cm, cateter central, Khorana ≥ 3, imobilidade)', duracao: 'Durante a quimioterapia (12 semanas)', obs: 'EAU 2026 (fraca): ponderar risco individual; evitar cateter venoso central sempre que possível. Trombose em 10–20% dos metastáticos.' },
  /* Radioterapia */
  rt_sem_ii: { cat: 'Radioterapia', nome: 'Radioterapia no seminoma IIA/IIB', esquema: '30 Gy (IIA) ou 36 Gy (IIB) em frações de 2 Gy, campo para-aórtico + ilíaco ipsilateral ("dog-leg"), IMRT; boost no linfonodo', duracao: '3–3,5 semanas', obs: 'Recidiva 5–10% (IIA) e 10–15% (IIB); segundo câncer (gastrointestinal, bexiga) e cardiovascular tardios; proteção testicular. Não indicar no estádio I de rotina.' },
  rt_cerebro: { cat: 'Radioterapia', nome: 'Radioterapia cerebral (metástase)', esquema: 'Radiocirurgia (SRS) 18–24 Gy em lesão única/poucas ≤ 3–4 cm, ou crânio total 30 Gy em 10 frações em doença múltipla, após/junto da quimioterapia; cirurgia em lesão única residual ou com efeito de massa', duracao: '1–10 sessões', obs: 'Sobrevida 5 anos 30–40% ao diagnóstico, ~20% na recidiva; corticoide e anticonvulsivante conforme sintomas.' },
  /* Sobrevivência */
  testosterona: { cat: 'Sobrevivência', nome: 'Reposição de testosterona (hipogonadismo pós-tratamento)', esquema: 'Cipionato/enantato 200–250 mg IM a cada 2–3 semanas, undecanoato 1.000 mg IM a cada 10–14 semanas, ou gel transdérmico 50 mg/dia; só com testosterona matinal baixa confirmada em 2 dosagens e sintomas', duracao: 'Contínua, com reavaliação anual', obs: 'Hipogonadismo em 10–15% após orquiectomia e até 25% após quimioterapia; monitorar hematócrito, PSA (> 40 anos), lipídios e PA. Não repor se deseja fertilidade (suprime espermatogênese) — considerar hCG/clomifeno com endocrinologia.' },
};
const TOPT_DOSES = {
  'TS-DX-01': ['bep', 'cis_suporte'], 'TS-I-01': ['bep', 'cis_suporte'],
  'TS-SEM-04': ['carbo_auc7'], 'TS-NS-02': ['bep1'], 'TS-NS-03': ['bep1'],
  'TS-SII-02': ['rt_sem_ii'], 'TS-SII-03': ['bep', 'ep'], 'TS-SII-04': ['carbo_auc7', 'rt_sem_ii'],
  'TS-MET-10': ['bep', 'cis_suporte'], 'TS-MET-11': ['ep', 'cis_suporte'], 'TS-MET-12': ['bep', 'cis_suporte'], 'TS-MET-13': ['vip', 'gcsf'], 'TS-MET-14': ['bep', 'cis_suporte'], 'TS-MET-15': ['vip', 'gcsf'], 'TS-MET-16': ['tbep'],
  'TS-MET-20': ['bep', 'rt_cerebro'], 'TS-MET-21': ['rt_sem_ii'], 'TS-MET-22': ['tromboprofilaxia'],
  'TS-RES-14': ['tip'], 'TS-RES-32': ['ep', 'vip'],
  'TS-REC-01': ['bep', 'rt_sem_ii'], 'TS-REC-11': ['tip'], 'TS-REC-20': ['gop'], 'TS-REC-21': ['tice'], 'TS-REC-31': ['tip', 'veip', 'gip', 'gcsf'], 'TS-REC-32': ['tice'], 'TS-REC-33': ['tice', 'gcsf'], 'TS-REC-34': ['tip', 'veip', 'gip', 'gcsf'], 'TS-REC-37': ['rt_cerebro'],
};
const TDOSE_CATS = ['Estádio I', 'Doença metastática', 'Resgate', 'Suporte', 'Radioterapia', 'Sobrevivência'];

/* Guia cirúrgico – testículo. Texto a revisar por cirurgião antes do uso assistencial. */
const TSURG = {
  orquiectomia: {
    nome: 'Orquiectomia radical inguinal com prótese testicular',
    resumo: 'Primeiro passo de todo tumor testicular: exposição inguinal, clampeamento do cordão antes da manipulação do testículo, ligadura alta no anel inguinal interno e retirada em bloco com a túnica vaginal; prótese colocada no mesmo tempo. 30–60 min; ambulatorial ou 1 dia.',
    indicacoes: ['Massa testicular sólida suspeita no ultrassom, com ou sem marcadores elevados.', 'Após quimioterapia inicial em doença metastática com risco de vida (orquiectomia diferida, sempre necessária: a barreira hemato-testicular protege o tumor primário).'],
    contraindicacoes: ['Lesão provavelmente benigna pequena ou testículo único: considerar cirurgia poupadora com congelação (capítulo próprio).', 'Coagulopatia não corrigida (relativa).'],
    preparo: ['Ultrassom bilateral, AFP/hCG/LDH, hormônios (testosterona, LH, FSH); banco de sêmen antes (1–3 coletas), ou imediatamente após se urgente.', 'Discutir prótese (tamanho pelo testículo contralateral), consentimento para orquiectomia mesmo que a congelação não seja feita.', 'Antibiótico profilático (cefazolina) na indução; tricotomia inguinal.'],
    anestesia: ['Raquianestesia ou geral; bloqueio ilioinguinal/ílio-hipogástrico para analgesia; decúbito dorsal.'],
    instrumental: ['Caixa de hérnia; clamp vascular atraumático ou laço (Penrose) para o cordão; fio inabsorvível 0 ou 2-0 para a ligadura do cordão (marcador para RPLND futura: fio longo ou clipe); prótese de silicone (tamanhos pequeno/médio/grande/extra).'],
    decisoes: ['Via inguinal sempre; nunca escrotal (altera a drenagem linfática para inguinal, recidiva local, exige ressecção da cicatriz se feita).', 'Clampear o cordão antes de exteriorizar o testículo (reduz disseminação teórica); biópsia/congelação só na cirurgia poupadora.', 'Prótese: oferecer a todos (EAU 2026); contraindicada em infecção ativa; colocar via inguinal fixando ao dartos no polo inferior.', 'Biópsia contralateral (via escrotal ou inguinal, 2 fragmentos) no mesmo tempo se < 40 anos com volume < 12 mL ou criptorquidia, após discussão.'],
    passos: [
      { t: 'Incisão inguinal', d: 'Incisão de 5–7 cm sobre o canal inguinal, 2 cm acima e paralela ao ligamento inguinal, do anel interno até o púbis; abrir a aponeurose do oblíquo externo no sentido das fibras até o anel externo, preservando o nervo ilioinguinal.', dica: 'Incisão mais ampla em tumores grandes (> 6–8 cm) para não fragmentar.', cuidado: 'Nervo ilioinguinal e ramo genital do genitofemoral (dor crônica).' },
      { t: 'Isolamento e clampeamento do cordão', d: 'Identificar o cordão espermático na emergência do anel interno, dissecá-lo circunferencialmente e passar um laço ou clamp atraumático no nível do anel interno antes de qualquer manipulação do testículo.', dica: 'Abrir a fáscia espermática externa e cremastérica em bloco com o cordão.', cuidado: 'Não lesar o ducto deferente nem os vasos em caso de futura cirurgia poupadora contralateral.' },
      { t: 'Liberação do testículo', d: 'Tracionar o cordão e liberar o testículo do escroto por dissecção romba e com cautério do gubernáculo (ligar vasos gubernaculares), trazendo-o em bloco com a túnica vaginal fechada para o campo inguinal; proteger o campo com compressa.', dica: 'Escroto redundante: pressão externa pelo auxiliar ajuda a exteriorizar.', cuidado: 'Não abrir a túnica vaginal nem o tumor no campo; invasão de escroto (pT4) muda o seguimento.' },
      { t: 'Ligadura alta do cordão', d: 'Separar os componentes do cordão (vasos e ducto deferente) no anel interno; ligar vasos e deferente separadamente com fio inabsorvível, deixando fio longo ou clipe metálico no coto vascular como referência para RPLND futura; seccionar e enviar o espécime orientado (fio no coto do cordão).', dica: 'Ligadura dupla dos vasos (transfixante); marcar o nível da ligadura no laudo (margem do cordão).', cuidado: 'Sangramento retroperitoneal se a ligadura escapar: controle pelo anel interno ampliado.' },
      { t: 'Prótese e biópsia contralateral', d: 'Prótese de silicone de tamanho semelhante ao contralateral, introduzida pelo canal inguinal e fixada ao dartos no fundo do escroto com ponto absorvível; se indicada, biópsia contralateral de 2 fragmentos (3 mm) com fechamento da albugínea. Hemostasia rigorosa do escroto.', dica: 'Irrigar com solução antibiótica antes da prótese; evitar tocar a prótese com luvas de talco.', cuidado: 'Hematoma escrotal (3–5%) e extrusão/infecção da prótese (1–3%).' },
      { t: 'Fechamento', d: 'Fechar a aponeurose do oblíquo externo com fio absorvível 2-0 sem estrangular o anel externo; subcutâneo e pele; curativo compressivo e suspensório escrotal.', dica: 'Infiltração anestésica da ferida.', cuidado: 'Hérnia inguinal tardia rara; dor crônica 2–5%.' },
    ],
    posop: ['Alta no mesmo dia ou em 24 h; analgesia simples; suspensório por 1–2 semanas; evitar esforço por 2–3 semanas.', 'Marcadores semanais até normalizar (AFP meia-vida 5–7 dias; hCG 1–1,5 dia); TC de tórax/abdome/pelve se não feita; patologia em 7–10 dias → fluxos de estádio I ou metastático.', 'Testosterona em 3–6 meses; banco de sêmen se ainda não feito e tratamento adicional planejado.'],
    complicacoes: ['Hematoma inguinal/escrotal 3–5%; infecção de ferida 1–2%; dor crônica inguinal 2–5%; complicações da prótese 1–5% (hematoma, infecção, extrusão, posição alta, insatisfação); lesão do nervo ilioinguinal.'],
    resultados: ['Cura isolada em 80–85% dos estádios I; padrão-ouro para diagnóstico e estadiamento local.'],
    esquemas: [],
    videos: [],
  },
  poupadora: {
    nome: 'Cirurgia poupadora de testículo (enucleação com congelação)',
    resumo: 'Enucleação de lesão pequena por via inguinal com clampeamento do cordão, isquemia fria opcional e congelação intraoperatória; preserva função endócrina e fertilidade em lesão benigna, testículo único ou tumor bilateral. Conversão para orquiectomia se maligno não enucleável.',
    indicacoes: ['Lesão < 2 cm (ideal < 1 cm), hipoecoica/hipovascular, marcadores normais, provável benigna (Leydig, Sertoli, cisto epidermoide, adenomatoide) — 20–30% das lesões < 1 cm são benignas.', 'Testículo único ou tumores bilaterais sincrônicos/metacrônicos com testosterona normal e lesão ≤ 2 cm (< 30% do volume), em centro experiente.'],
    contraindicacoes: ['Marcadores elevados (AFP) ou lesão > 2 cm com testículo contralateral normal: orquiectomia radical.', 'Ausência de congelação confiável; atrofia testicular com testosterona baixa (perda da função de qualquer forma).'],
    preparo: ['Ultrassom com Doppler e, se disponível, ultrassom com contraste ou RM para caracterizar; marcadores; testosterona/LH/FSH; banco de sêmen.', 'Consentimento para orquiectomia radical no mesmo ato se a congelação mostrar tumor germinativo não enucleável ou se a lesão for maior.'],
    anestesia: ['Geral ou raquianestesia; via inguinal.'],
    instrumental: ['Caixa inguinal; clamp vascular atraumático para o cordão; gelo/soro gelado para isquemia fria (opcional); ultrassom intraoperatório com transdutor linear estéril para lesões não palpáveis; lupas; fio 5-0/6-0 absorvível para albugínea.'],
    decisoes: ['Clampear o cordão (isquemia quente ≤ 30 min ou fria) antes de abrir a albugínea; exteriorizar o testículo em campo protegido.', 'Enuclear no plano da pseudocápsula com margem de 2–3 mm; biópsias da borda do leito (4 quadrantes) para GCNIS e margem.', 'Congelação: benigno → fechar; tumor germinativo com margem livre e testículo único/bilateral → manter (discutir RT 18–20 Gy se GCNIS nas biópsias, após prole); tumor germinativo em testículo contralateral normal → orquiectomia radical.', 'Lesão não palpável: localizar com ultrassom intraoperatório; incisão da albugínea sobre a lesão evitando vasos subalbugíneos.'],
    passos: [
      { t: 'Via inguinal e controle do cordão', d: 'Como na orquiectomia: incisão inguinal, isolamento e clampeamento atraumático do cordão no anel interno; exteriorizar o testículo com a vaginal.', dica: 'Resfriar o testículo com soro gelado (isquemia fria) se prever > 20–30 min.', cuidado: 'Não abrir a vaginal antes do clampeamento.' },
      { t: 'Abertura da vaginal e localização', d: 'Abrir a túnica vaginal; inspecionar e palpar; ultrassom intraoperatório para lesões não palpáveis, marcando o ponto de incisão na albugínea longe dos vasos.', dica: 'Incisão da albugínea transversal/equatorial reduz lesão dos vasos subalbugíneos longitudinais.', cuidado: 'Lesão extensa dos vasos → atrofia.' },
      { t: 'Enucleação', d: 'Incisar a albugínea sobre a lesão; enuclear no plano da pseudocápsula com tesoura fina e bipolar, margem de 2–3 mm; enviar para congelação; biópsias do leito nos 4 quadrantes.', dica: 'Manter a lesão íntegra para o patologista.', cuidado: 'Sangramento do parênquima: compressão e bipolar; não usar monopolar.' },
      { t: 'Decisão pela congelação', d: 'Benigno: fechar albugínea com 5-0 contínuo e vaginal; desclampear. Tumor germinativo: orquiectomia radical (contralateral normal) ou preservação com margem livre (testículo único/bilateral), discutindo RT adjuvante do GCNIS.', dica: 'Registrar tempo de isquemia e histologia da congelação no laudo.', cuidado: 'Congelação inconclusiva: preferir orquiectomia se contralateral normal.' },
      { t: 'Fechamento', d: 'Reposicionar o testículo no escroto, fechar a vaginal e a aponeurose; curativo e suspensório.', dica: 'Orquidopexia não é necessária.', cuidado: 'Hematocele e atrofia (5–10%).' },
    ],
    posop: ['Patologia definitiva em 7–10 dias; marcadores; ultrassom em 3–6 meses e depois anual (recidiva local 5–10% em tumor germinativo preservado); testosterona e espermograma em 6–12 meses.', 'Se GCNIS nas biópsias e tumor germinativo: RT 18–20 Gy (infertilidade; 25% precisam de testosterona) ou vigilância com ultrassom até prole completa.'],
    complicacoes: ['Atrofia testicular 5–10%; hematocele; infecção; recidiva local em tumor germinativo preservado 5–10% (tratada com orquiectomia).'],
    resultados: ['Lesões benignas: evita orquiectomia desnecessária em 20–30% das massas < 1 cm. Tumor germinativo em testículo único: sobrevida câncer-específica equivalente, 85–90% mantêm testosterona normal, 50% mantêm fertilidade sem RT.'],
    esquemas: [],
    videos: [],
  },
  rplnd_primaria: {
    nome: 'Linfadenectomia retroperitoneal primária poupadora de nervos (templates modificados)',
    resumo: 'Dissecção dos linfonodos retroperitoneais em paciente sem quimioterapia prévia (seminoma IIA/B de baixo volume, teratoma puro, não seminoma selecionado), com identificação e preservação das fibras simpáticas pós-ganglionares e do plexo hipogástrico para manter a ejaculação. Aberta (laparotomia mediana) ou robótica em centro de alto volume. 3–5 h; sangramento 200–500 mL; internação 3–6 dias.',
    indicacoes: ['Seminoma IIA (linfonodo ~2 cm) ou IIB ≤ 3–3,5 cm, marcadores negativos, em centro de excelência (SEMS/PRIMETEST/COTRIMS); inclui recidiva nodal de estádio I em vigilância.', 'Teratoma puro pós-puberal ou transformação somática maligna no estádio I–II.', 'Não seminoma estádio I de alto risco com contraindicação à quimioterapia e recusa de vigilância; estádio IIA marcador-negativo (opção, principalmente nos EUA).', 'Tumores do cordão/estroma com fatores de malignidade.'],
    contraindicacoes: ['Marcadores elevados (doença sistêmica: quimioterapia primeiro); linfonodo > 3,5 cm no seminoma ou doença extrarretroperitoneal; centro sem volume (EAU: "só em centros de excelência").'],
    preparo: ['TC de tórax/abdome/pelve recente (≤ 4 semanas); marcadores normais confirmados; banco de sêmen (ejaculação pode ser perdida mesmo com técnica poupadora); hemograma, tipagem; preparo intestinal não obrigatório; profilaxia de TEV e antibiótica.', 'Robótica: posicionamento supino ou lateral conforme plataforma; experiência em RPLND aberta é pré-requisito.'],
    anestesia: ['Geral; peridural torácica (aberta) ou bloqueios; acesso venoso calibroso; sonda vesical; sonda nasogástrica intraoperatória.'],
    instrumental: ['Aberta: afastador fixo (Omni/Bookwalter), clipes, selador bipolar, laços vasculares, clamps vasculares de Satinsky/bulldog, fios de polipropileno 4-0/5-0; lupas para identificação dos nervos.', 'Robótica: 4 braços, tesoura monopolar, bipolar, clipes, selador; estimulador de nervos opcional.'],
    decisoes: ['Template direito modificado: linfonodos interaortocavais, pré-cavais, paracavais, retrocavais, pré-aórticos acima da artéria mesentérica inferior (AMI) e ilíacos comuns direitos; limite superior nos vasos renais, inferior na bifurcação ilíaca direita; preserva fibras simpáticas esquerdas e o plexo hipogástrico abaixo da AMI.', 'Template esquerdo modificado: para-aórticos, pré-aórticos, retroaórticos, interaortocavais acima da AMI, ilíacos comuns esquerdos; preserva fibras paracavais e o plexo hipogástrico.', 'Dissecção bilateral completa (ambos os templates) se doença bilateral ou grande; identificar e preservar as fibras simpáticas (L1–L4) que emergem dos gânglios paravertebrais e cruzam a aorta/cava para formar o plexo hipogástrico superior abaixo da AMI.', 'Técnica split-and-roll: abrir o tecido linfático sobre a cava e a aorta no eixo longitudinal, rolar lateralmente ligando lombares conforme necessário, até o psoas e o diafragma.', 'Seminoma: ressecar o tecido linfático com o linfonodo suspeito em bloco; a inflamação desmoplásica dificulta a dissecção; nunca "picking" do linfonodo isolado.', 'Adjuvância após RPLND primária: seminoma pN1–2 → vigilância (SEMS) ou carboplatina/BEP × 2 em pN2 extenso; não seminoma pN1 → vigilância ou BEP × 2; pN2–3 → BEP × 2.'],
    passos: [
      { t: 'Acesso e exposição', d: 'Aberta: laparotomia mediana xifopúbica; mobilizar o cólon direito e o duodeno (Kocher–Cattell–Braasch) ou o cólon esquerdo e o ângulo esplênico conforme o lado, expondo cava, aorta e vasos renais; afastador fixo. Robótica: 4 trocartes em linha pararretal (ou configuração lateral), docking, mobilização colônica semelhante.', dica: 'Marcar a AMI: abaixo dela ficam o plexo hipogástrico e a maior parte das fibras a preservar.', cuidado: 'Pâncreas e vasos mesentéricos durante a mobilização.' },
      { t: 'Identificação dos vasos gonadais e do coto do cordão', d: 'Identificar a veia gonadal ipsilateral (direita na cava; esquerda na veia renal) e segui-la até o anel interno; ressecar o coto do cordão com o clipe/fio da orquiectomia em bloco com a veia gonadal (recidiva em cordão residual).', dica: 'Fio longo deixado na orquiectomia facilita achar o coto.', cuidado: 'Ureter cruza os vasos ilíacos: identificar e afastar.' },
      { t: 'Dissecção do template (split-and-roll)', d: 'Incisar o tecido linfático longitudinalmente sobre a face anterior da cava (direita) ou da aorta (esquerda), rolar o tecido medial e lateralmente, ligando/clipando as veias lombares que impedem a mobilização; dissecar o interaortocaval até a coluna, limitado acima pelos vasos renais e abaixo pela AMI/ilíaca comum; levar o tecido lateral até o psoas e o ureter.', dica: 'Trabalhar de cima (vasos renais) para baixo; ligar 1–2 lombares de cada lado basta na maioria.', cuidado: 'Sangramento de veia lombar avulsionada: compressão, clipe no coto na cava/aorta, sutura 5-0.' },
      { t: 'Identificação e preservação dos nervos', d: 'Identificar as fibras simpáticas pós-ganglionares emergindo lateralmente aos corpos vertebrais (abaixo das lombares), cruzando atrás da cava/aorta e convergindo para o plexo hipogástrico superior na bifurcação aórtica; dissecá-las com lupas e preservá-las entre laços; evitar cautério próximo.', dica: 'No template direito, preservar sobretudo as fibras esquerdas (L2–L4) e o plexo; no esquerdo, as fibras direitas.', cuidado: 'Secção bilateral das fibras ou do plexo → anejaculação (ejaculação retrógrada/aspermia) em 20–50% sem técnica poupadora, < 5% com ela.' },
      { t: 'Ressecção do bloco e linfonodo-alvo', d: 'Remover o tecido linfático em bloco com o linfonodo aumentado, sem fragmentação; separar os pacotes (interaortocaval, paracaval/para-aórtico, ilíaco) para o patologista; clipar vasos linfáticos (ascite quilosa) principalmente acima dos vasos renais.', dica: 'Clipar todo linfático visível junto à cisterna do quilo (retrocrural direita).', cuidado: 'Ascite quilosa (2–7%): dieta sem gordura/TCM, octreotida, raramente reoperação.' },
      { t: 'Revisão e fechamento', d: 'Hemostasia; verificar ureter e vasos renais; reposicionar o cólon; sem dreno de rotina; fechamento da parede.', dica: 'Registrar o template e os nervos preservados no laudo.', cuidado: 'Íleo prolongado 5–10%.' },
    ],
    posop: ['Dieta precoce e deambulação (ERAS); internação 2–4 dias (robótica 1–3); profilaxia de TEV por 2–4 semanas; dieta pobre em gordura por 2 semanas se linfáticos extensos.', 'Patologia: número de linfonodos e maior diâmetro, extensão extranodal (pN); decidir adjuvância (ver decisões); marcadores e TC conforme seguimento.', 'Avaliar ejaculação em 3 meses; espermograma se deseja filhos.'],
    complicacoes: ['Ascite quilosa 2–7%; íleo 5–10%; lesão vascular com transfusão 2–5%; lesão ureteral < 1%; anejaculação < 5% (poupadora) a 20–50% (não poupadora); infecção, hérnia incisional, pancreatite rara; mortalidade < 0,5%.', 'Robótica: conversão 2–5%; complicações equivalentes em centros experientes.'],
    resultados: ['Seminoma IIA/B: sobrevida livre de recidiva 2 anos 70–90% sem adjuvância (SEMS 81%, COTRIMS ~90%), todas as recidivas curadas com quimioterapia; evita RT/quimio em 70–80%.', 'Não seminoma I: pN0 recidiva ~10% (quase só pulmonar), pN1 sem adjuvância ~30%; teratoma: remove metástases quimiorresistentes.'],
    esquemas: ['templates', 'plexo'],
    videos: [],
  },
  rplnd_posquimio: {
    nome: 'RPLND pós-quimioterapia (dissecção bilateral completa)',
    resumo: 'Ressecção de toda massa residual retroperitoneal após quimioterapia no não seminoma (> 1 cm com marcadores normais) e, raramente, no seminoma PET-positivo confirmado. Dissecção bilateral completa dos vasos renais à bifurcação ilíaca, com manejo de fibrose desmoplásica, aderências a grandes vasos e necessidade eventual de ressecção/reconstrução vascular, nefrectomia ou ressecção de outros órgãos. 4–8 h; transfusão 10–30%; internação 5–10 dias; centro de referência.',
    indicacoes: ['Não seminoma: residual > 1 cm (eixo axial longo) com marcadores normais, em 6–8 semanas após o último ciclo (obrigatória); residual < 1 cm em prognóstico intermediário/pobre, teratoma no primário ou preferência; residual após resgate sempre (mesmo < 1 cm).', 'Massas extra-retroperitoneais (pulmão, mediastino, pescoço, fígado) ressecadas no mesmo tempo ou em etapas, a começar pela maior/retroperitônio.', 'Seminoma: massa > 3 cm PET-positiva confirmada por repetição/biópsia, em centro experiente (fibrose intensa).', 'Recidiva tardia (> 2 anos): cirurgia primeiro.'],
    contraindicacoes: ['Marcadores em elevação (quimioterapia de resgate primeiro; exceção: lesão única ressecável com marcador em platô — "desperation surgery").', 'Doença irressecável (envolvimento extenso de aorta/cava sem possibilidade de reconstrução, invasão de raízes mesentéricas); performance proibitivo.'],
    preparo: ['TC de tórax/abdome/pelve 3–4 semanas após o último ciclo (e angio-TC se massa junto aos grandes vasos); marcadores normais ou em platô; DLCO se bleomicina (anestesia com FiO2 baixa); hemograma, TFG, reserva de 2–4 unidades; cirurgia vascular e torácica de sobreaviso; banco de sêmen se não feito.', 'Operar em 6–8 semanas (fibrose piora com o tempo; recuperação medular).'],
    anestesia: ['Geral com PA invasiva, acesso central (com cuidado: trombose) e peridural; FiO2 mínima necessária e restrição de volume em quem recebeu bleomicina (risco de ARDS); aquecimento.'],
    instrumental: ['Afastador fixo; instrumentos vasculares completos (clamps, Satinsky, fios 4-0/5-0, patch, prótese de PTFE/Dacron para substituição de aorta/cava), selador, clipes; afastador costal/toracoabdominal se extensão supra-renal ou torácica; cell saver é controverso (teratoma).'],
    decisoes: ['Dissecção bilateral completa (padrão): template infra-hilar bilateral dos vasos renais à bifurcação ilíaca, incluindo retrocaval, retroaórtico e interaortocaval; template ipsilateral modificado aceitável se residual < 5 cm, unilateral, bom prognóstico e sem doença contralateral na TC pré-quimio (EAU: "pode ser considerado"); nunca "lumpectomia".', 'Preservar nervos quando a fibrose permite (ejaculação preservada em 60–80% com técnica poupadora; menos em massas grandes).', 'Aderência à cava/aorta: dissecção subadventicial; ressecção de cava com ou sem reconstrução (ligadura tolerada se colaterais) em 5–10%; substituição aórtica com prótese em 1–3%; nefrectomia em 5–10% (envolvimento hilar ou ureteral); ressecção hepática ou de parede diafragmática raras.', 'Massa supra-hilar/retrocrural: acesso toracoabdominal ou mobilização hepática (direita) / esplenopancreática (esquerda).', 'Teratoma crescente ("growing teratoma syndrome") durante a quimioterapia: operar antes de completar os ciclos se marcadores normais.', 'Histologia da peça: necrose/fibrose 40–50%, teratoma 35–40%, tumor viável 10–15% — viável ≥ 10% ou R1 ou prognóstico não bom → discutir 2 ciclos de consolidação.'],
    passos: [
      { t: 'Acesso e exposição ampla', d: 'Laparotomia mediana xifopúbica (ou toracoabdominal/Chevron em massas altas); mobilização completa do cólon direito e duodeno (Cattell–Braasch) e, se bilateral/esquerda, do cólon esquerdo, expondo aorta, cava, vasos renais, ureteres e massa; afastador fixo.', dica: 'Expor os vasos renais e a aorta acima da massa antes de dissecá-la: controle proximal.', cuidado: 'Duodeno e pâncreas aderidos à massa; vasos mesentéricos superiores.' },
      { t: 'Controle vascular e plano subadventicial', d: 'Laços na aorta infrarrenal (ou suprarrenal se necessário), na cava e nas artérias/veias renais; iniciar o split-and-roll pela face anterior da aorta e da cava no plano subadventicial quando a fibrose impede o plano habitual; ligar lombares sistematicamente.', dica: 'Nas massas esquerdas, começar pela cava (menos envolvida) e progredir para a aorta; direita, o inverso.', cuidado: 'Lesão de parede vascular fibrosada: sutura imediata com 5-0; ter patch/prótese disponível.' },
      { t: 'Dissecção retrovascular e dos pilares', d: 'Elevar aorta e cava sobre laços e dissecar o tecido retroaórtico/retrocaval até a coluna e os pilares do diafragma; identificar a cisterna do quilo (retrocrural direita) e clipar linfáticos; ligar a artéria mesentérica inferior se envolvida (colaterais pela arcada de Riolan, se o cólon estiver bem perfundido).', dica: 'Com os vasos elevados, o tecido retrovascular sai em bloco; preservar fibras simpáticas se visíveis.', cuidado: 'Ascite quilosa (5–10% nas dissecções altas): clipar, dieta com TCM.' },
      { t: 'Ressecção em bloco e órgãos adjacentes', d: 'Ressecar a massa em bloco com o tecido linfático do template bilateral, da altura dos vasos renais à bifurcação ilíaca; nefrectomia se hilo/ureter envolvidos sem plano (rim contralateral funcional); ressecção segmentar de cava (ligadura ou reconstrução) ou substituição aórtica se invadidas; ureterólise com stent se necessário.', dica: 'Massas de teratoma volumosas podem ser esvaziadas (cistos) para facilitar, sem fragmentar tumor viável.', cuidado: 'Ressecção incompleta (R1/R2) piora a sobrevida: planejar com vascular.' },
      { t: 'Massas extra-retroperitoneais', d: 'Ressecar no mesmo tempo (mediastino inferior, fígado, pescoço) ou em segundo tempo (pulmão por VATS/toracotomia, bilateral se necessário); histologia discordante em 30–50%: ressecar todas.', dica: 'Começar pelo retroperitônio (maior probabilidade de teratoma/viável).', cuidado: 'Pulmão bilateral com necrose na primeira peça: vigiar o lado contralateral é aceitável se pequeno.' },
      { t: 'Revisão e fechamento', d: 'Hemostasia, revisão de reconstruções vasculares (Doppler), ureteres e intestino; dreno se ressecção pancreática/hepática ou linfáticos extensos; fechamento por planos; enviar peças orientadas por compartimento.', dica: 'Registrar completude (R0/R1/R2) e compartimentos no laudo: define consolidação e seguimento.', cuidado: 'Síndrome compartimental abdominal em ressecções maciças.' },
    ],
    posop: ['UTI 24–48 h em ressecções vasculares/grandes; profilaxia de TEV 4 semanas; dieta progressiva (TCM se linfáticos); anticoagulação se reconstrução de cava/aorta.', 'Histologia em 2–3 semanas: necrose/teratoma → seguimento; viável → discutir consolidação (EP/VIP × 2); marcadores em 4 semanas.', 'Ejaculação: avaliar em 3 meses; testosterona em 6 meses; espermograma.'],
    complicacoes: ['Transfusão 10–30%; lesão/ressecção vascular 5–15%; nefrectomia 5–10%; ascite quilosa 5–10%; íleo 10–15%; lesão intestinal/pancreática 1–3%; ARDS pós-bleomicina 1–2%; anejaculação 20–40% (menor com poupadora); embolia pulmonar 2–3%; mortalidade 1–2% (maior em cirurgias de desespero e resgate).'],
    resultados: ['Necrose/fibrose: sobrevida > 95%; teratoma: 90–95% (recidiva tardia possível); tumor viável R0 < 10% e bom prognóstico: ~85%; viável ≥ 10% ou R1: 50–70% com consolidação. Após resgate, cirurgia cura até 20% adicionais.'],
    esquemas: ['templates'],
    videos: [],
  },
};
const TSURG_LINK = {
  'TS-DX-03': ['poupadora', 'orquiectomia'], 'TS-DX-04': ['orquiectomia'],
  'TS-I-10': ['rplnd_primaria'], 'TS-I-12': ['rplnd_primaria'], 'TS-NS-05': ['rplnd_primaria'],
  'TS-SII-01': ['rplnd_primaria'], 'TS-MET-00': ['orquiectomia'],
  'TS-RES-14': ['rplnd_posquimio'], 'TS-RES-20': ['rplnd_posquimio'], 'TS-RES-21': ['rplnd_posquimio'], 'TS-RES-24': ['rplnd_posquimio'],
  'TS-REC-01': ['rplnd_primaria'], 'TS-REC-10': ['rplnd_posquimio'], 'TS-REC-36': ['rplnd_posquimio'],
};
const TSURG_SVG = {
  templates: `<svg viewBox="0 0 740 420" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Sans, system-ui, sans-serif" font-size="13">
  <!-- dois painéis: template direito (esq.) e esquerdo (dir.); paciente visto de frente: cava à esquerda da imagem (direita do paciente) -->
  <g transform="translate(20,0)">
    <text x="150" y="26" text-anchor="middle" fill="currentColor" font-weight="600">Template direito modificado</text>
    <!-- rins -->
    <ellipse cx="60" cy="110" rx="26" ry="40" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-width="1.2"/>
    <ellipse cx="240" cy="110" rx="26" ry="40" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-width="1.2"/>
    <!-- vasos renais -->
    <path d="M86 108 L128 108" stroke="#0E6B85" stroke-width="6" opacity=".8"/><path d="M214 108 L170 108" stroke="#0E6B85" stroke-width="6" opacity=".8"/>
    <!-- cava e aorta -->
    <rect x="128" y="60" width="22" height="300" rx="8" fill="#4CB7D1" fill-opacity=".18" stroke="#0E6B85" stroke-width="2"/>
    <rect x="160" y="60" width="18" height="260" rx="7" fill="#B03A3A" fill-opacity=".15" stroke="#B03A3A" stroke-width="2"/>
    <path d="M169 320 L135 390 M169 320 L203 390" stroke="#B03A3A" stroke-width="5" fill="none"/>
    <path d="M139 360 L110 395" stroke="#0E6B85" stroke-width="5" fill="none"/>
    <!-- AMI -->
    <path d="M178 250 L205 275" stroke="#B03A3A" stroke-width="3"/><text x="208" y="282" fill="currentColor" font-size="11">AMI</text>
    <!-- template direito: área sombreada -->
    <path d="M96 118 L96 300 L140 345 L150 345 L178 250 L178 118 Z" fill="#E8A33D" fill-opacity=".35" stroke="#E8A33D" stroke-width="2"/>
    <text x="100" y="140" fill="currentColor" font-size="11">paracaval</text>
    <text x="150" y="200" fill="currentColor" font-size="11" text-anchor="middle">interaortocaval</text>
    <text x="100" y="330" fill="currentColor" font-size="11">ilíaco D</text>
    <!-- plexo preservado -->
    <circle cx="169" cy="330" r="9" fill="none" stroke="#5FCB8C" stroke-width="2.5"/><text x="182" y="334" fill="currentColor" font-size="11">plexo hipogástrico</text>
    <text x="6" y="406" fill="currentColor" font-size="11">Preserva fibras simpáticas esquerdas e pré-aórticos abaixo da AMI</text>
  </g>
  <g transform="translate(390,0)">
    <text x="150" y="26" text-anchor="middle" fill="currentColor" font-weight="600">Template esquerdo modificado</text>
    <ellipse cx="60" cy="110" rx="26" ry="40" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-width="1.2"/>
    <ellipse cx="240" cy="110" rx="26" ry="40" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-width="1.2"/>
    <path d="M86 108 L128 108" stroke="#0E6B85" stroke-width="6" opacity=".8"/><path d="M214 108 L170 108" stroke="#0E6B85" stroke-width="6" opacity=".8"/>
    <rect x="128" y="60" width="22" height="300" rx="8" fill="#4CB7D1" fill-opacity=".18" stroke="#0E6B85" stroke-width="2"/>
    <rect x="160" y="60" width="18" height="260" rx="7" fill="#B03A3A" fill-opacity=".15" stroke="#B03A3A" stroke-width="2"/>
    <path d="M169 320 L135 390 M169 320 L203 390" stroke="#B03A3A" stroke-width="5" fill="none"/>
    <path d="M139 360 L110 395" stroke="#0E6B85" stroke-width="5" fill="none"/>
    <path d="M178 250 L205 275" stroke="#B03A3A" stroke-width="3"/><text x="208" y="282" fill="currentColor" font-size="11">AMI</text>
    <path d="M150 118 L150 250 L178 250 L178 320 L203 345 L212 345 L212 300 L212 118 Z" fill="#E8A33D" fill-opacity=".35" stroke="#E8A33D" stroke-width="2"/>
    <text x="182" y="140" fill="currentColor" font-size="11">para-aórtico</text>
    <text x="150" y="200" fill="currentColor" font-size="11" text-anchor="middle">interaortocaval</text>
    <text x="216" y="330" fill="currentColor" font-size="11">ilíaco E</text>
    <circle cx="169" cy="330" r="9" fill="none" stroke="#5FCB8C" stroke-width="2.5"/>
    <text x="6" y="406" fill="currentColor" font-size="11">Preserva fibras simpáticas direitas e paracavais abaixo da AMI</text>
  </g>
  <g font-size="11" fill="currentColor">
    <rect x="300" y="46" width="12" height="12" fill="#E8A33D" fill-opacity=".5" stroke="#E8A33D"/><text x="316" y="56">área ressecada</text>
    <circle cx="306" cy="74" r="6" fill="none" stroke="#5FCB8C" stroke-width="2"/><text x="316" y="78">preservado</text>
  </g>
</svg>`,
  plexo: `<svg viewBox="0 0 820 400" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Sans, system-ui, sans-serif" font-size="13">
  <g transform="translate(110,0)">
  <!-- coluna e cadeias simpáticas -->
  <rect x="340" y="30" width="40" height="330" rx="10" fill="currentColor" fill-opacity=".10" stroke="currentColor" stroke-width="1.5"/>
  <text x="360" y="382" text-anchor="middle" fill="currentColor">coluna (L1–L5)</text>
  <path d="M300 50 L300 330" stroke="#5FCB8C" stroke-width="3"/><path d="M420 50 L420 330" stroke="#5FCB8C" stroke-width="3"/>
  <text x="250" y="44" fill="currentColor" font-size="11.5">cadeia simpática D</text><text x="402" y="44" fill="currentColor" font-size="11.5">cadeia simpática E</text>
  <!-- gânglios -->
  <g fill="#5FCB8C"><circle cx="300" cy="90" r="5"/><circle cx="300" cy="150" r="5"/><circle cx="300" cy="210" r="5"/><circle cx="300" cy="270" r="5"/><circle cx="420" cy="90" r="5"/><circle cx="420" cy="150" r="5"/><circle cx="420" cy="210" r="5"/><circle cx="420" cy="270" r="5"/></g>
  <!-- cava e aorta (anterior, translúcidas) -->
  <rect x="318" y="60" width="26" height="250" rx="8" fill="#4CB7D1" fill-opacity=".18" stroke="#0E6B85" stroke-width="1.5"/>
  <rect x="356" y="60" width="22" height="230" rx="7" fill="#B03A3A" fill-opacity=".12" stroke="#B03A3A" stroke-width="1.5"/>
  <text x="331" y="76" text-anchor="middle" fill="currentColor" font-size="11">cava</text><text x="367" y="76" text-anchor="middle" fill="currentColor" font-size="11">aorta</text>
  <!-- fibras pós-ganglionares convergindo para o plexo hipogástrico superior -->
  <g stroke="#5FCB8C" stroke-width="2" fill="none">
    <path d="M300 150 Q330 230 360 300"/><path d="M300 210 Q330 260 360 305"/><path d="M300 270 Q335 290 360 310"/>
    <path d="M420 150 Q390 230 364 300"/><path d="M420 210 Q392 260 364 305"/><path d="M420 270 Q388 290 364 310"/>
  </g>
  <ellipse cx="362" cy="318" rx="22" ry="12" fill="#5FCB8C" fill-opacity=".35" stroke="#5FCB8C" stroke-width="2"/>
  <text x="362" y="352" text-anchor="middle" fill="currentColor" font-size="11.5">plexo hipogástrico superior</text>
  <!-- AMI -->
  <path d="M378 240 L410 262" stroke="#B03A3A" stroke-width="3"/><text x="414" y="268" fill="currentColor" font-size="11.5">AMI</text>
  </g>
  <!-- legenda -->
  <g font-size="12" fill="currentColor">
    <text x="24" y="80" font-weight="600" font-size="13">Nervos a preservar na RPLND</text>
    <text x="24" y="104">Fibras simpáticas pós-ganglionares L1–L4 saem dos</text>
    <text x="24" y="122">gânglios paravertebrais, cruzam atrás/ao lado dos</text>
    <text x="24" y="140">grandes vasos e convergem abaixo da AMI no plexo</text>
    <text x="24" y="158">hipogástrico superior: controlam a emissão seminal</text>
    <text x="24" y="176">e o fechamento do colo vesical (ejaculação).</text>
    <text x="24" y="210">Lesão bilateral → anejaculação / ejaculação</text>
    <text x="24" y="228">retrógrada. Técnica poupadora: &lt; 5% (primária),</text>
    <text x="24" y="246">20–40% (pós-quimio com massas grandes).</text>
    <text x="24" y="280">Regra prática: no template direito preservar as</text>
    <text x="24" y="298">fibras esquerdas; no esquerdo, as direitas; sempre</text>
    <text x="24" y="316">o plexo abaixo da AMI; evitar cautério perto delas.</text>
  </g>
</svg>`,
};
const TSURG_CAP = {
  templates: 'Templates modificados de RPLND primária poupadora de nervos (paciente visto de frente; cava à esquerda da imagem). Direito: paracaval, interaortocaval, pré-aórtico acima da AMI e ilíaco comum direito. Esquerdo: para-aórtico, pré/retroaórtico, interaortocaval acima da AMI e ilíaco comum esquerdo. Em verde, o plexo hipogástrico preservado; a dissecção bilateral completa (pós-quimioterapia) une os dois templates dos vasos renais à bifurcação ilíaca.',
  plexo: 'Anatomia simpática da ejaculação: cadeias paravertebrais, fibras pós-ganglionares L1–L4 e plexo hipogástrico superior abaixo da artéria mesentérica inferior — o que a técnica poupadora de nervos identifica e protege.',
};

/* Calculadoras – UroDecide. Cada calculadora: id, nome, origem, resumo, campos, compute(v) → { headline, rows, interp, notas }, fontes. Revisão clínica obrigatória. */
const CALCS = {
  pcpt: {
    nome: 'PCPT Risk Calculator 2.0',
    origem: 'Prostate Cancer Prevention Trial (SWOG) · UT Health San Antonio (Thompson, Ankerst) — Urology 2014',
    resumo: 'Estima, antes da biópsia, a probabilidade de não ter câncer, de ter câncer de baixo grau (Gleason < 7) ou de alto grau (Gleason ≥ 7) a partir de PSA, toque retal, idade, história familiar, biópsia prévia e ascendência africana. Desenvolvida com 6.664 biópsias do braço placebo do PCPT (homens ≥ 55 anos, PSA ≤ 10 ng/mL); validada em 10 coortes (25.772 biópsias): AUC 0,74 para alto grau.',
    campos: [
      { id: 'psa', l: 'PSA total', tipo: 'num', unit: 'ng/mL', step: 0.1, min: 0.1, max: 50, help: 'Modelo desenvolvido com PSA ≤ 10; acima disso o resultado é extrapolação.' },
      { id: 'idade', l: 'Idade', tipo: 'num', unit: 'anos', min: 40, max: 95, help: 'Validado para 55–90 anos.' },
      { id: 'dre', l: 'Toque retal', tipo: 'seg', opts: [{ v: 0, l: 'Normal' }, { v: 1, l: 'Alterado', s: 'nódulo, endurecimento ou assimetria' }] },
      { id: 'fam', l: 'História familiar de câncer de próstata (pai, irmão ou filho)', tipo: 'seg', opts: [{ v: 0, l: 'Não' }, { v: 1, l: 'Sim' }] },
      { id: 'bx', l: 'Biópsia prévia negativa', tipo: 'seg', opts: [{ v: 0, l: 'Não' }, { v: 1, l: 'Sim' }] },
      { id: 'aa', l: 'Ascendência africana (afro-americano no estudo original)', tipo: 'seg', opts: [{ v: 0, l: 'Não' }, { v: 1, l: 'Sim' }], help: 'No PCPT a variável foi "African American"; a transposição para a população brasileira miscigenada é incerta.' },
    ],
    compute(v) {
      const psa = +v.psa, idade = +v.idade;
      if (!(psa > 0) || !(idade > 0)) return null;
      const l2 = Math.log(psa) / Math.LN2;
      const dre = +v.dre || 0, fam = +v.fam || 0, bx = +v.bx || 0, aa = +v.aa || 0;
      const l1 = -3.002 + 0.256 * l2 + 0.016 * idade + 0.122 * aa - 0.455 * bx - 0.039 * dre + 0.272 * fam;   // baixo grau vs sem câncer
      const l2h = -7.053 + 0.705 * l2 + 0.048 * idade + 1.042 * aa - 0.214 * bx + 0.401 * dre + 0.225 * fam;  // alto grau vs sem câncer
      const e1 = Math.exp(l1), e2 = Math.exp(l2h), den = 1 + e1 + e2;
      if (!isFinite(den)) return null;
      const p0 = 1 / den, pLG = e1 / den, pHG = e2 / den;
      const pct = (x) => (Math.round(x * 1000) / 10).toFixed(1).replace('.', ',');
      const avisos = [];
      if (psa > 10) avisos.push('PSA > 10 ng/mL: fora da faixa de desenvolvimento (PSA ≤ 10); o risco real de alto grau tende a ser maior que o estimado.');
      if (idade < 55) avisos.push('Idade < 55 anos: fora da faixa de desenvolvimento (≥ 55); usar com cautela.');
      if (idade > 90) avisos.push('Idade > 90 anos: fora da faixa validada.');
      let interp;
      if (pHG >= 0.20) interp = 'Risco de câncer de alto grau ≥ 20%: a maioria das diretrizes considera biópsia (idealmente após ressonância multiparamétrica) claramente indicada.';
      else if (pHG >= 0.10) interp = 'Risco de alto grau entre 10 e 20%: zona de decisão compartilhada; ressonância multiparamétrica, PSA livre, PSA-densidade ou biomarcadores ajudam a refinar antes da biópsia.';
      else interp = 'Risco de alto grau < 10%: a biópsia imediata evita poucos cânceres clinicamente significativos; considerar repetir PSA, ressonância ou seguimento conforme preferência e expectativa de vida.';
      return {
        headline: `Alto grau ${pct(pHG)}% · Baixo grau ${pct(pLG)}% · Sem câncer ${pct(p0)}%`,
        rows: [
          { l: 'Câncer de alto grau (Gleason ≥ 7)', p: pHG, cls: 'bad' },
          { l: 'Câncer de baixo grau (Gleason < 7)', p: pLG, cls: 'warn' },
          { l: 'Sem câncer na biópsia', p: p0, cls: 'good' },
          { l: 'Qualquer câncer', p: pLG + pHG, cls: 'neutral' },
        ],
        interp, avisos,
        detalhe: `logit(baixo grau) = −3,002 + 0,256·log₂(PSA) + 0,016·idade + 0,122·AA − 0,455·biópsia prévia − 0,039·TR + 0,272·família = ${l1.toFixed(3)}; logit(alto grau) = −7,053 + 0,705·log₂(PSA) + 0,048·idade + 1,042·AA − 0,214·biópsia prévia + 0,401·TR + 0,225·família = ${l2h.toFixed(3)}; P = e^logit / (1 + e^logit₁ + e^logit₂).`,
      };
    },
    notas: [
      'Probabilidade refere-se ao resultado de uma biópsia sextante/estendida de 6–12 fragmentos na era pré-ressonância; biópsias guiadas por RM detectam mais câncer significativo.',
      'A versão 2.0 aceita PSA livre (% livre) como variável opcional, derivada da coorte SABOR; esta implementação usa o modelo sem PSA livre.',
      'Não substitui o julgamento clínico nem considera expectativa de vida, comorbidade, ressonância (PI-RADS) ou PSA-densidade — para isso use o fluxo "PSA alterado, ainda sem biópsia" do módulo de próstata.',
    ],
    fontes: [
      { t: 'Ankerst DP et al. Prostate Cancer Prevention Trial Risk Calculator 2.0 for the prediction of low- vs high-grade prostate cancer. Urology 2014;83:1362–8', u: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4035700' },
      { t: 'Calculadora oficial (UT Health San Antonio)', u: 'https://riskcalc.org/PCPTRC/' },
      { t: 'Fórmula com interceptos reproduzida em Park JY et al. PLOS ONE 2017 (validação coreana)', u: 'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0168917' },
    ],
  },
  erspc: {
    nome: 'ERSPC / Rotterdam Risk Calculator (3 + DRE e 4 + DRE)',
    origem: 'European Randomized Study of Screening for Prostate Cancer, braço de Roterdã · Erasmus MC / SWOP (Roobol, Schröder, Steyerberg, Kranse) — Eur Urol 2012;61:577 (versões com volume pelo toque); World J Urol 2012 (validação PBCG)',
    resumo: 'Estima a probabilidade de a biópsia detectar câncer de próstata a partir de PSA, toque retal e volume prostático (estimado pelo toque em 25, 40 ou 60 mL, ou medido pelo ultrassom), separando homens nunca rastreados (calculadora 3) de rastreados antes ou com biópsia prévia negativa (calculadora 4). Desenvolvida em 6.288 homens rastreados em Roterdã; a estratégia baseada em risco evitou 33% das biópsias perdendo 13% dos cânceres, 70–80% deles indolentes. AUC 0,71–0,80 nas validações.',
    campos: [
      { id: 'psa', l: 'PSA total', tipo: 'num', unit: 'ng/mL', step: 0.1, min: 0.4, max: 50, help: 'Faixa do estudo: 0,4–50 ng/mL (desenvolvida sobretudo com PSA ≥ 3).' },
      { id: 'dre', l: 'Toque retal', tipo: 'seg', opts: [{ v: 0, l: 'Normal' }, { v: 1, l: 'Alterado', s: 'nódulo, endurecimento ou assimetria' }] },
      { id: 'volmodo', l: 'Volume prostático', tipo: 'seg', opts: [{ v: 'dre', l: 'Estimado pelo toque', s: '25, 40 ou 60 mL' }, { v: 'trus', l: 'Medido (ultrassom ou RM)', s: 'mL' }] },
      { id: 'volcls', l: 'Estimativa pelo toque', tipo: 'seg', opts: [{ v: 25, l: 'Pequena (≈ 25 mL)', s: 'cabe sob o dedo' }, { v: 40, l: 'Média (≈ 40 mL)' }, { v: 60, l: 'Grande (≈ 60 mL)', s: 'não se alcançam os limites' }], show: (v) => v.volmodo !== 'trus' },
      { id: 'vol', l: 'Volume medido', tipo: 'num', unit: 'mL', step: 1, min: 10, max: 250, show: (v) => v.volmodo === 'trus', help: 'O modelo usa classes: < 30 mL → 25; 30–49 → 40; ≥ 50 → 60.' },
      { id: 'previo', l: 'Rastreamento prévio', tipo: 'seg', opts: [{ v: 'nao', l: 'Nunca rastreado', s: 'primeiro PSA/biópsia — calculadora 3' }, { v: 'psa', l: 'PSA prévio normal, sem biópsia', s: 'calculadora 4' }, { v: 'bx', l: 'Biópsia prévia negativa', s: 'calculadora 4' }] },
    ],
    compute(v) {
      const psa = +v.psa; if (!(psa > 0)) return null;
      const modo = v.volmodo || 'dre';
      let cls;
      if (modo === 'trus') { const vol = +v.vol; if (!(vol > 0)) return null; cls = vol < 30 ? 25 : vol < 50 ? 40 : 60; }
      else { cls = +v.volcls; if (![25, 40, 60].includes(cls)) return null; }
      const dre = +v.dre || 0;
      const previo = v.previo || 'nao';
      const bx = previo === 'bx' ? 1 : 0;
      const l2psa = Math.log(psa) / Math.LN2, l2vol = Math.log(cls) / Math.LN2;
      let lp, calc;
      if (previo === 'nao') { lp = -1.826 + 1.024 * (l2psa - 2) - 1.50 * (l2vol - 5.4) + 0.992 * dre; calc = 'Calculadora 3 + DRE (nunca rastreado)'; }
      else { lp = -1.470 - 0.677 * bx + (0.576 - 0.423 * bx) * (l2psa - 2) - 1.043 * (l2vol - 5.5) + 0.68 * dre; calc = bx ? 'Calculadora 4 + DRE (biópsia prévia negativa)' : 'Calculadora 4 + DRE (rastreado antes, sem biópsia)'; }
      const pAny = 1 / (1 + Math.exp(-lp));
      const pct = (x) => (Math.round(x * 1000) / 10).toFixed(1).replace('.', ',');
      const avisos = [];
      if (psa < 3) avisos.push('PSA < 3 ng/mL: a calculadora foi desenvolvida em homens biopsiados por PSA ≥ 3; abaixo disso o resultado é extrapolação.');
      if (psa > 50) avisos.push('PSA > 50 ng/mL: fora da faixa permitida pela calculadora oficial.');
      avisos.push('Câncer clinicamente significativo (ISUP ≥ 2): a fórmula desse desfecho na calculadora de Roterdã não é publicada em forma aberta (modelo da Erasmus MC) — para obtê-la use a calculadora oficial (link em "Notas e fontes"). Com ressonância disponível, o modelo de Heidelberg (Radtke), nesta seção, estima o câncer significativo com fórmula publicada e foi validado contra o ERSPC-RC3.');
      let interp;
      if (pAny >= 0.20) interp = 'Risco ≥ 20%: biópsia indicada (limiar do aplicativo oficial); idealmente após ressonância multiparamétrica para biópsia dirigida.';
      else if (pAny >= 0.125) interp = 'Risco entre 12,5% e 20%: zona de decisão compartilhada — a estratégia ERSPC de 2010 já indicaria biópsia a partir de 12,5%; ressonância, PSA-densidade e PSA livre refinam.';
      else interp = 'Risco < 12,5%: a estratégia ERSPC evitaria a biópsia (perda quase só de cânceres indolentes); repetir PSA em 1 ano ou conforme o fluxo "PSA alterado" do módulo de próstata.';
      return {
        headline: `Câncer na biópsia ${pct(pAny)}% · ${calc}`,
        rows: [
          { l: 'Qualquer câncer de próstata na biópsia', p: pAny, cls: 'warn' },
          { l: 'Biópsia negativa', p: 1 - pAny, cls: 'good' },
        ],
        interp, avisos,
        detalhe: previo === 'nao'
          ? `lp = −1,826 + 1,024·(log₂PSA − 2) − 1,50·(log₂classe de volume − 5,4) + 0,992·TR = ${lp.toFixed(3)}; P = 1/(1 + e^−lp). Classe de volume usada: ${cls} mL.`
          : `lp = −1,470 − 0,677·biópsia prévia + (0,576 − 0,423·biópsia prévia)·(log₂PSA − 2) − 1,043·(log₂classe de volume − 5,5) + 0,68·TR = ${lp.toFixed(3)}; P = 1/(1 + e^−lp). Classe de volume usada: ${cls} mL.`,
      };
    },
    notas: [
      'Fórmulas das versões "3 + DRE" e "4 + DRE" publicadas no apêndice de Roobol et al. (World J Urol 2012) e no estudo do Prostate Biopsy Collaborative Group (Eur Urol 2012): predizem o resultado de biópsia sextante lateralizada na era pré-ressonância; biópsias por RM e de 12 fragmentos detectam mais.',
      'A calculadora oficial 3/4 usa o volume contínuo por ultrassom, o achado do ultrassom (e opcionalmente PI-RADS ou PHI) e estima também o câncer clinicamente significativo; essas fórmulas não estão disponíveis em forma aberta, por isso aqui só o risco de qualquer câncer é calculado.',
      'Limiares: o estudo original de estratégia baseada em risco usou 12,5% para qualquer câncer; o aplicativo oficial sugere biópsia a partir de 20% de qualquer câncer ou de 4% de câncer de alto grau (confirmar na versão atual).',
      'Validada em coortes europeias, americanas e asiáticas (AUC 0,71–0,88, com superestimação em asiáticos); sem validação brasileira publicada.',
    ],
    fontes: [
      { t: 'Roobol MJ et al. Prediction of prostate cancer risk: the role of prostate volume and digital rectal examination in the ERSPC risk calculators. Eur Urol 2012;61:577–83 (desenvolvimento das versões 3 + DRE e 4 + DRE)', u: 'https://doi.org/10.1016/j.eururo.2011.11.012' },
      { t: 'Roobol MJ et al. Importance of prostate volume in the ERSPC risk calculators: results from the Prostate Biopsy Collaborative Group. World J Urol 2012;30:149–55 (validação em 15.300 homens; apêndice com as fórmulas)', u: 'https://doi.org/10.1007/s00345-011-0804-y' },
      { t: 'Roobol MJ et al. A risk-based strategy improves PSA-driven detection of prostate cancer. Eur Urol 2010 (limiar de 12,5%)', u: 'https://read.qxmd.com/read/19733959/a-risk-based-strategy-improves-prostate-specific-antigen-driven-detection-of-prostate-cancer' },
      { t: 'Calculadoras oficiais SWOP/ERSPC (3, 4, MRI, PHI)', u: 'https://www.prostatecancer-riskcalculator.com/seven-prostate-cancer-risk-calculators' },
    ],
  },
  radtke: {
    nome: 'Modelo de Heidelberg com ressonância (Radtke) — câncer significativo',
    origem: 'Universitätsklinikum Heidelberg / DKFZ (Radtke, Wiesenfarth, Bonekamp, Hohenfellner, Hadaschik) — Eur Urol 2017;72:888; validação externa com UCLH e ajuste de prevalência: PLoS One 2019',
    resumo: 'Estima a probabilidade de câncer de próstata clinicamente significativo (ISUP ≥ 2) na biópsia dirigida por ressonância mais sistemática, em homens nunca biopsiados, a partir de PSA, volume prostático, idade, toque retal e PI-RADS. Desenvolvido em 670 homens e validado em Heidelberg e em Londres (AUC 0,86 nas duas coortes, contra 0,77 do ERSPC-RC3 e 0,79–0,82 do PI-RADS isolado), com benefício líquido acima do limiar de 10%. A fórmula é publicada e o intercepto é ajustado à prevalência de câncer significativo do serviço (padrão: 24,5%, a da coorte ERSPC-RC3).',
    campos: [
      { id: 'psa', l: 'PSA total', tipo: 'num', unit: 'ng/mL', step: 0.1, min: 0.5, max: 100, help: 'Coortes de desenvolvimento e validação: mediana 7 ng/mL (quartis 5–11).' },
      { id: 'vol', l: 'Volume prostático (RM ou ultrassom)', tipo: 'num', unit: 'mL', step: 1, min: 10, max: 250 },
      { id: 'idade', l: 'Idade', tipo: 'num', unit: 'anos', step: 1, min: 40, max: 90 },
      { id: 'dre', l: 'Toque retal', tipo: 'seg', opts: [{ v: 0, l: 'Normal' }, { v: 1, l: 'Suspeito', s: '≥ cT2: nódulo ou endurecimento' }] },
      { id: 'pirads', l: 'PI-RADS (maior lesão)', tipo: 'seg', opts: [{ v: 1, l: '1 ou sem lesão' }, { v: 2, l: '2' }, { v: 3, l: '3' }, { v: 4, l: '4' }, { v: 5, l: '5' }], help: 'Desenvolvido com PI-RADS v1; na validação, a leitura por v2 manteve ou melhorou a discriminação.' },
      { id: 'prevmodo', l: 'Prevalência de câncer significativo entre os biopsiados', tipo: 'seg', opts: [{ v: 'erspc', l: '24,5% — ERSPC-RC3', s: 'ajuste padrão publicado' }, { v: 'heid', l: '45,6% — Heidelberg', s: 'modelo original, centro terciário' }, { v: 'local', l: 'Informar a do serviço' }] },
      { id: 'prev', l: 'Prevalência local de câncer significativo', tipo: 'num', unit: '%', step: 1, min: 5, max: 80, show: (v) => v.prevmodo === 'local', help: 'Fração de biópsias com ISUP ≥ 2 no seu serviço (ex.: 30–40% em serviços com ressonância prévia).' },
    ],
    compute(v) {
      const psa = +v.psa, vol = +v.vol, idade = +v.idade;
      if (!(psa > 0) || !(vol > 0) || !(idade > 0)) return null;
      const dre = +v.dre || 0;
      const pirads = +v.pirads; if (!(pirads >= 1 && pirads <= 5)) return null;
      const modo = v.prevmodo || 'erspc';
      let prev = modo === 'heid' ? 0.456 : modo === 'local' ? (+v.prev) / 100 : 0.245;
      if (modo === 'local' && !(prev > 0.01 && prev < 0.95)) return null;
      const logit = (p) => Math.log(p / (1 - p));
      const b0 = -3.623 - logit(0.456) + logit(prev);
      const bp = { 1: 0, 2: 0.299, 3: 1.198, 4: 1.841, 5: 3.094 }[pirads];
      const lp = b0 + 0.550 * Math.log(psa) - 0.020 * vol + 0.034 * idade + 0.712 * dre + bp;
      const p = 1 / (1 + Math.exp(-lp));
      const pct = (x) => (Math.round(x * 1000) / 10).toFixed(1).replace('.', ',');
      const avisos = [];
      if (psa > 20) avisos.push('PSA > 20 ng/mL: acima da faixa habitual das coortes; o risco tende a ser alto independentemente do modelo.');
      if (vol > 120) avisos.push('Volume > 120 mL: extrapolação; o efeito protetor do volume é linear no modelo e pode subestimar o risco.');
      if (pirads <= 2 && p >= 0.10) avisos.push('PI-RADS 1–2 com risco ≥ 10%: o modelo foi desenvolvido com biópsia sistemática transperineal de saturação; a biópsia sistemática ainda detecta câncer significativo nessa situação, sobretudo com PSA-densidade ≥ 0,15.');
      avisos.push('Válido apenas para homens nunca biopsiados; após biópsia prévia negativa o modelo é outro (Eur Urol 2017, RC4-MRI de Heidelberg, não reproduzido aqui) — use a calculadora de Roterdã com ressonância.');
      let interp;
      if (p >= 0.20) interp = 'Risco ≥ 20%: biópsia indicada — dirigida à(s) lesão(ões) e sistemática.';
      else if (p >= 0.10) interp = 'Risco entre 10% e 20%: faixa em que o modelo mostrou benefício líquido sobre biopsiar todos; decisão compartilhada, considerando PSA-densidade, PSA livre e comorbidades.';
      else interp = 'Risco < 10%: abaixo do limiar em que o modelo traz benefício — biópsia pode ser evitada com seguimento de PSA e repetição da ressonância em 12 meses (ou antes se PSA-densidade ≥ 0,15 ou toque suspeito).';
      const prevTxt = modo === 'local' ? `${pct(prev)}% (local)` : modo === 'heid' ? '45,6% (Heidelberg)' : '24,5% (ERSPC-RC3)';
      return {
        headline: `Câncer significativo (ISUP ≥ 2) ${pct(p)}% · prevalência ${prevTxt}`,
        rows: [
          { l: 'Câncer clinicamente significativo (ISUP ≥ 2) na biópsia', p, cls: p >= 0.20 ? 'bad' : p >= 0.10 ? 'warn' : 'good' },
          { l: 'Sem câncer significativo', p: 1 - p, cls: 'neutral' },
        ],
        interp, avisos,
        detalhe: `logit = −3,623 − logit(0,456) + logit(${pct(prev)}%) + 0,550·ln(PSA) − 0,020·volume + 0,034·idade + 0,712·toque suspeito + PI-RADS (2: 0,299; 3: 1,198; 4: 1,841; 5: 3,094; 1: referência) = ${lp.toFixed(3)}; P = 1/(1 + e^−logit). Com prevalência de 24,5% o intercepto vale −4,572.`,
      };
    },
    notas: [
      'Modelo logístico publicado integralmente (Radtke et al., Eur Urol 2017; PLoS One 2019): desfecho câncer significativo = Gleason ≥ 3+4 (ISUP ≥ 2) na biópsia de fusão RM/US mais sistemática transperineal estendida (mediana 24–27 fragmentos), em 670 homens nunca biopsiados de Heidelberg (2012–2015).',
      'Validação: 160 homens de Heidelberg (2016–2017) e 133 do University College London Hospital — AUC 0,86 em ambas; ERSPC-RC3 0,77; ERSPC-RC3 + PI-RADS 0,82–0,84; PI-RADS isolado 0,79–0,82. Validação independente em Salzburgo (2023–2025): AUC 0,77, igual à calculadora de Roterdã com RM.',
      'Calibração depende da prevalência: o modelo original superestimou o risco em Londres (prevalência 29% vs 46%). Os autores propõem corrigir o intercepto pela prevalência local (método de Prentice-Pyke), o que não altera a discriminação; a opção "ERSPC-RC3 24,5%" reproduz o ajuste publicado.',
      'PI-RADS v1 no desenvolvimento; a leitura por v2 na coorte de Londres melhorou a AUC (0,89). Não foi desenvolvido para biópsia transretal de 12 fragmentos, que detecta menos câncer significativo.',
      'Limiares: benefício líquido demonstrado para probabilidades-limite de 10% a cerca de 50%; o corte de 20% segue o uso habitual das calculadoras de Roterdã. Sem validação brasileira publicada.',
    ],
    fontes: [
      { t: 'Radtke JP et al. Combined clinical parameters and multiparametric MRI for advanced risk modeling of prostate cancer — patient-tailored risk stratification can reduce unnecessary biopsies. Eur Urol 2017;72:888–96', u: 'https://doi.org/10.1016/j.eururo.2017.03.039' },
      { t: 'Radtke JP, Giganti F, Wiesenfarth M et al. Prediction of significant prostate cancer in biopsy-naïve men: validation of a novel risk model combining MRI and clinical parameters and comparison to an ERSPC risk calculator and PI-RADS. PLoS One 2019;14:e0221350 (fórmula e ajuste de prevalência)', u: 'https://doi.org/10.1371/journal.pone.0221350' },
      { t: 'External validation of MRI-based prostate cancer risk calculators in a contemporary pre-biopsy mpMRI cohort. J Clin Med 2026;15:8146', u: 'https://www.mdpi.com/2077-0383/15/20/8146' },
      { t: 'Osses DF, Roobol MJ, Schoots IG. Prediction medicine: biomarkers, risk calculators and MRI as risk stratification tools in prostate cancer diagnosis. Int J Mol Sci 2019;20:1637', u: 'https://doi.org/10.3390/ijms20071637' },
    ],
  },
  capra: {
    nome: 'Escore CAPRA (UCSF) — risco de recidiva, metástase e morte',
    origem: 'University of California, San Francisco · registro CaPSURE (Cooperberg, Carroll) — J Urol 2005; validação SEARCH Cancer 2006; metástase e mortalidade JNCI 2009',
    resumo: 'Soma de 0 a 10 pontos a partir de PSA, padrão de Gleason na biópsia, estádio clínico, porcentagem de fragmentos positivos e idade, atribuída ao diagnóstico de câncer localizado. O risco de recidiva dobra a cada 2 pontos (HR 1,39–1,50 por ponto). Desenvolvido em 1.439 homens operados, validado em 1.346 (SEARCH, 41% não brancos) e, para metástase óssea e mortalidade, em 10.627 homens tratados com prostatectomia, radioterapia, hormonioterapia ou vigilância (c-index 0,78 para metástase e 0,80 para morte pelo câncer).',
    campos: [
      { id: 'psa', l: 'PSA ao diagnóstico', tipo: 'num', unit: 'ng/mL', step: 0.1, min: 0.1, max: 500, help: '≤ 6: 0 · 6,1–10: 1 · 10,1–20: 2 · 20,1–30: 3 · > 30: 4 pontos.' },
      { id: 'gleason', l: 'Gleason da biópsia (primário + secundário)', tipo: 'seg', opts: [{ v: 'g33', l: '≤ 3+3', s: 'ISUP 1 · 0 pontos' }, { v: 'g34', l: '3+4', s: 'ISUP 2 · 1 ponto' }, { v: 'g43', l: '4+3', s: 'ISUP 3 · 3 pontos' }, { v: 'g35', l: '3+5', s: 'ISUP 4 · 1 ponto (secundário 5)' }, { v: 'g4x', l: '4+4, 4+5, 5+3, 5+4, 5+5', s: 'ISUP 4–5 · 3 pontos' }], help: 'O escore pontua pelo padrão primário (4 ou 5 → 3 pontos) e secundário (4 ou 5 → 1 ponto), não pelo grupo ISUP.' },
      { id: 'ct', l: 'Estádio clínico (toque retal)', tipo: 'seg', opts: [{ v: 't12', l: 'cT1–cT2', s: '0 pontos' }, { v: 't3a', l: 'cT3a', s: '1 ponto' }, { v: 't3b', l: 'cT3b–cT4', s: 'fora do escore original' }], help: 'Use o estádio pelo toque; o escore foi desenvolvido antes da ressonância.' },
      { id: 'cores_tot', l: 'Fragmentos de biópsia colhidos', tipo: 'num', unit: 'n', step: 1, min: 1, max: 60 },
      { id: 'cores_pos', l: 'Fragmentos positivos', tipo: 'num', unit: 'n', step: 1, min: 0, max: 60, help: '≥ 34% positivos: 1 ponto. Em biópsia dirigida por RM, conte sistemáticos e dirigidos juntos (a validade se manteve com fragmentos dirigidos).' },
      { id: 'idade', l: 'Idade ao diagnóstico', tipo: 'num', unit: 'anos', step: 1, min: 35, max: 95, help: '≥ 50 anos: 1 ponto.' },
    ],
    compute(v) {
      const psa = +v.psa, tot = +v.cores_tot, pos = +v.cores_pos, idade = +v.idade;
      if (!(psa > 0) || !(tot > 0) || !(pos >= 0) || !(idade > 0) || !v.gleason || !v.ct) return null;
      if (pos > tot) return null;
      const pPSA = psa <= 6 ? 0 : psa <= 10 ? 1 : psa <= 20 ? 2 : psa <= 30 ? 3 : 4;
      const pGl = { g33: 0, g34: 1, g35: 1, g43: 3, g4x: 3 }[v.gleason];
      const pT = v.ct === 't12' ? 0 : 1;
      const pctPos = pos / tot;
      const pCores = pctPos >= 0.34 ? 1 : 0;
      const pAge = idade >= 50 ? 1 : 0;
      const score = pPSA + pGl + pT + pCores + pAge;
      const grupo = score <= 2 ? 'baixo' : score <= 5 ? 'intermediário' : 'alto';
      const k = Math.min(score, 8);
      // Sobrevida livre de recidiva bioquímica em 5 anos após PR (%)
      const RFS_DEV = { 0: 85, 1: 85, 2: 81, 3: 66, 4: 59, 5: 60, 6: 34, 7: 8, 8: 8 };
      const RFS_VAL = { 0: 86, 1: 86, 2: 75, 3: 65, 4: 60, 5: 52, 6: 29, 7: 20, 8: 20 };
      // JNCI 2009, todos os tratamentos (%)
      const BMFS10 = { 0: 100, 1: 99.0, 2: 96.9, 3: 95.5, 4: 92.7, 5: 88.7, 6: 84.7, 7: 84.6, 8: 79.2 };
      const PCSS10 = { 0: 100, 1: 98.2, 2: 96.7, 3: 94.4, 4: 89.7, 5: 87.4, 6: 79.3, 7: 78.6, 8: 78.9 };
      const OS10 = { 0: 100, 1: 76.7, 2: 69.1, 3: 64.1, 4: 57.9, 5: 52.1, 6: 45.7, 7: 36.3, 8: 41.5 };
      const PCSS5 = { 0: 100, 1: 99.7, 2: 99.8, 3: 99.1, 4: 98.4, 5: 97.8, 6: 95.3, 7: 94.1, 8: 88.7 };
      // Patologia na PR por escore (SEARCH): margem+, extensão extraprostática, vesícula seminal, linfonodo (%)
      const PATH = { 0: [23.5, 13.7, 1.2, 0], 1: [23.5, 13.7, 1.2, 0], 2: [25.8, 18.8, 3.7, 1.1], 3: [31.0, 22.8, 4.1, 2.4], 4: [41.7, 25.8, 9.0, 1.4], 5: [43.5, 43.5, 13.0, 2.9], 6: [52.6, 50.7, 22.4, 4.0], 7: [58.3, 68.3, 42.4, 3.4], 8: [58.3, 68.3, 42.4, 3.4] };
      const pct = (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
      const pct0 = (x) => String(Math.round(x));
      const cls = grupo === 'baixo' ? 'good' : grupo === 'intermediário' ? 'warn' : 'bad';
      const avisos = [];
      if (v.ct === 't3b') avisos.push('cT3b–cT4 não fazia parte do escore original (desenvolvido até cT3a); pontuado como 1, mas trate como alto risco/localmente avançado independentemente da soma.');
      if (score === 0) avisos.push('Poucos pacientes com escore 0 nas coortes (78 de 10.627); use os desfechos do grupo 0–2 (recidiva em 5 anos ≈ 15%, metástase óssea em 10 anos 2,5%, morte pelo câncer em 10 anos 2,9%).');
      if (score >= 8) avisos.push('Escores 8–10 foram agrupados nas publicações (330 pacientes, a maioria tratada com hormonioterapia isolada); intervalos amplos.');
      if (psa <= 2) avisos.push('PSA ≤ 2 ng/mL foi pontuado como 0 no desenvolvimento; com Gleason ≥ 4+3 e PSA baixo, considere carcinoma pouco secretor (PSMA PET pode ser útil).');
      if (v.gleason === 'g35') avisos.push('3+5 (ISUP 4) recebe só 1 ponto pela regra original (padrão primário 3); clinicamente trate como ISUP 4.');
      avisos.push('Desfechos de 5 anos após prostatectomia (biópsia sextante/era pré-RM, PSA ≥ 0,2 em 2 medidas ou tratamento adicional); metástase e mortalidade em 10 anos incluem todos os tratamentos primários (51% prostatectomia, 25% radioterapia, 14% hormonioterapia isolada, 6% vigilância). Mortalidade geral reflete idade e comorbidade.');
      let interp;
      if (grupo === 'baixo') interp = 'CAPRA 0–2 (baixo risco): recidiva bioquímica em 5 anos ≈ 15–25% após prostatectomia; metástase óssea em 10 anos 2,5% e morte pelo câncer 2,9% com qualquer tratamento. Se ISUP 1 (ou ISUP 2 com baixo volume), vigilância ativa é a conduta preferida; o fluxo "Novo diagnóstico" do módulo de próstata detalha.';
      else if (grupo === 'intermediário') interp = 'CAPRA 3–5 (risco intermediário): recidiva em 5 anos 35–50% após prostatectomia; metástase óssea em 10 anos 6,7% e morte pelo câncer 8,4%. Tratamento local (prostatectomia com linfadenectomia conforme nomograma, ou radioterapia ± 4–6 meses de ADT se desfavorável).';
      else interp = 'CAPRA 6–10 (alto risco): recidiva em 5 anos 66–92% após prostatectomia isolada; metástase óssea em 10 anos 16,6% e morte pelo câncer 20,9%. Estadiamento com PSMA PET ou TC + cintilografia; tratamento multimodal (radioterapia + ADT 18–36 meses ± abiraterona, ou prostatectomia com linfadenectomia estendida e terapia adjuvante/resgate precoce).';
      const path = PATH[k];
      const detalhe = `Pontos: PSA ${String(psa).replace('.', ',')} → ${pPSA}; Gleason → ${pGl}; estádio → ${pT}; ${pos}/${tot} fragmentos (${pct0(pctPos * 100)}%) → ${pCores}; idade ${idade} → ${pAge}. Total ${score}/10. Patologia esperada na prostatectomia para este escore (SEARCH): margem positiva ${pct(path[0])}%, extensão extraprostática ${pct(path[1])}%, invasão de vesícula seminal ${pct(path[2])}%, linfonodo positivo ${pct(path[3])}%.`;
      return {
        headline: `CAPRA ${score} · risco ${grupo}${grupo === 'baixo' ? ' (0–2)' : grupo === 'intermediário' ? ' (3–5)' : ' (6–10)'}`,
        rows: [
          { l: 'Recidiva bioquímica em 5 anos após prostatectomia — CaPSURE (desenvolvimento)', p: (100 - RFS_DEV[k]) / 100, cls },
          { l: 'Recidiva bioquímica em 5 anos após prostatectomia — SEARCH (validação externa)', p: (100 - RFS_VAL[k]) / 100, cls },
          { l: 'Metástase óssea em 10 anos (todos os tratamentos)', p: (100 - BMFS10[k]) / 100, cls },
          { l: 'Morte por câncer de próstata em 10 anos', p: (100 - PCSS10[k]) / 100, cls },
          { l: 'Morte por câncer de próstata em 5 anos', p: (100 - PCSS5[k]) / 100, cls: 'neutral' },
          { l: 'Morte por qualquer causa em 10 anos', p: (100 - OS10[k]) / 100, cls: 'neutral' },
        ],
        interp, avisos, detalhe,
      };
    },
    notas: [
      'Pontuação (Cooperberg et al., J Urol 2005; Tabela 1): PSA ≤ 6 → 0, 6,1–10 → 1, 10,1–20 → 2, 20,1–30 → 3, > 30 → 4; Gleason primário 1–3/secundário 1–3 → 0, primário 1–3/secundário 4–5 → 1, primário 4–5 → 3; cT1–cT2 → 0, cT3a → 1; fragmentos positivos < 34% → 0, ≥ 34% → 1; idade < 50 → 0, ≥ 50 → 1. Grupos: 0–2 baixo, 3–5 intermediário, 6–10 alto.',
      'Sobrevida livre de recidiva em 5 anos por escore — CaPSURE (n = 1.439; c-index 0,66): 0–1: 85%, 2: 81%, 3: 66%, 4: 59%, 5: 60%, 6: 34%, ≥ 7: 8%. SEARCH (n = 1.346, 5 hospitais de veteranos e militares, 41% não brancos; c-index 0,68; HR 1,39/ponto): 0–1: 86%, 2: 75%, 3: 65%, 4: 60%, 5: 52%, 6: 29%, 7–10: 20%.',
      'Metástase óssea, mortalidade específica e geral em 5 e 10 anos por escore (Cooperberg, Broering, Carroll, JNCI 2009, Tabela 4; 10.627 homens, seguimento mediano 6 anos): HR por ponto 1,47 (metástase), 1,39 (morte pelo câncer; 1,48 após prostatectomia, 1,34 após radioterapia, 1,63 com hormonioterapia isolada) e 1,13 (morte geral).',
      'Validações externas em 13 coortes (revisão Eur Urol 2017): c-index 0,66–0,81 para recidiva após prostatectomia ou radioterapia; o escore também prediz patologia adversa e reclassificação em vigilância ativa (cada ponto de aumento, OR 1,6 para patologia adversa). CAPRA-S (pós-operatório, com Gleason patológico, margens, extensão extraprostática, vesículas e linfonodos) tem c-index 0,77 e pode ser a próxima calculadora.',
      'Limites: coortes norte-americanas da era pré-ressonância com biópsia sextante a 12 fragmentos; ressonância e biópsia dirigida elevam o Gleason e a porcentagem de fragmentos positivos, e as curvas de recidiva com técnica atual tendem a ser melhores para o mesmo escore. Sem validação brasileira publicada.',
    ],
    fontes: [
      { t: 'Cooperberg MR, Pasta DJ, Elkin EP et al. The UCSF Cancer of the Prostate Risk Assessment (CAPRA) score: a straightforward and reliable preoperative predictor of disease recurrence after radical prostatectomy. J Urol 2005;173:1938–42', u: 'https://doi.org/10.1097/01.ju.0000158155.33890.e7' },
      { t: 'Cooperberg MR, Freedland SJ, Pasta DJ et al. Multiinstitutional validation of the UCSF CAPRA for prediction of recurrence after radical prostatectomy (SEARCH). Cancer 2006;107:2384–91', u: 'https://doi.org/10.1002/cncr.22262' },
      { t: 'Cooperberg MR, Broering JM, Carroll PR. Risk assessment for prostate cancer metastasis and mortality at the time of diagnosis. J Natl Cancer Inst 2009;101:878–87', u: 'https://doi.org/10.1093/jnci/djp122' },
      { t: 'Brajtbord JS, Leapman MS, Cooperberg MR. The CAPRA score at 10 years: contemporary perspectives and analysis of supporting studies. Eur Urol 2017;71:705–9', u: 'https://doi.org/10.1016/j.eururo.2016.08.065' },
      { t: 'Cooperberg MR, Hilton JF, Carroll PR. The CAPRA-S score: a straightforward tool for improved prediction of outcomes after radical prostatectomy. Cancer 2011;117:5039–46', u: 'https://doi.org/10.1002/cncr.26169' },
      { t: 'UCSF Department of Urology — Prostate cancer risk assessment and the UCSF-CAPRA score', u: 'https://urology.ucsf.edu/research/cancer/prostate-cancer-risk-assessment-and-the-ucsf-capra-score' },
    ],
  },
  lni: {
    nome: 'Invasão linfonodal antes da prostatectomia — Partin 2017, Yale, Roach (e dados para o Briganti)',
    origem: 'Tabelas de Partin contemporâneas (Johns Hopkins, Tosoian et al., BJU Int 2017) · fórmula de Yale (Yu, Makarov, Gross — SEER, IJROBP 2011) · fórmula de Roach (UCSF, IJROBP 1994) · limiares dos nomogramas de Briganti (Eur Urol 2012/2017/2019) e do MSKCC',
    resumo: 'Estima a probabilidade de linfonodo positivo na prostatectomia radical a partir de PSA, estádio clínico e Gleason, com três ferramentas de fórmula pública: as Tabelas de Partin 2017 (4.459 prostatectomias com linfadenectomia na Johns Hopkins, 2010–2015; AUC 0,92 para linfonodo), a fórmula de Yale (2.930 homens do SEER com ≥ 10 linfonodos examinados) e a fórmula de Roach (1994). Também mostra, pelas Tabelas de Partin, doença confinada, extensão extraprostática e invasão de vesícula seminal. O nomograma de Briganti — padrão da EAU para indicar a linfadenectomia estendida — usa coeficientes não publicados; a tela organiza os dados para a calculadora oficial.',
    campos: [
      { id: 'psa', l: 'PSA pré-operatório', tipo: 'num', unit: 'ng/mL', step: 0.1, min: 0.1, max: 200 },
      { id: 'ct', l: 'Estádio clínico pelo toque', tipo: 'seg', opts: [{ v: 't1c', l: 'cT1c', s: 'não palpável' }, { v: 't2a', l: 'cT2a', s: '≤ metade de um lobo' }, { v: 't2b', l: 'cT2b', s: '> metade de um lobo' }, { v: 't2c', l: 'cT2c', s: 'ambos os lobos' }, { v: 't3', l: 'cT3a–cT3b', s: 'extraprostático ao toque' }], help: 'Partin e Yale foram desenvolvidos para cT1c–cT2; em cT3 só a fórmula de Roach se aplica e o risco é alto por definição.' },
      { id: 'gleason', l: 'Gleason da biópsia', tipo: 'seg', opts: [{ v: '33', l: '3+3', s: 'ISUP 1' }, { v: '34', l: '3+4', s: 'ISUP 2' }, { v: '43', l: '4+3', s: 'ISUP 3' }, { v: '44', l: '4+4', s: 'ISUP 4' }, { v: '35', l: '3+5 ou 5+3', s: 'ISUP 4' }, { v: '45', l: '4+5 ou 5+4', s: 'ISUP 5' }, { v: '55', l: '5+5', s: 'ISUP 5' }] },
      { id: 'cores_tot', l: 'Fragmentos colhidos (opcional, para o Briganti)', tipo: 'num', unit: 'n', step: 1, min: 1, max: 60 },
      { id: 'cores_pos', l: 'Fragmentos positivos (opcional)', tipo: 'num', unit: 'n', step: 1, min: 0, max: 60, help: 'Os nomogramas de Briganti 2012/2017 usam a porcentagem de fragmentos positivos (2017: separada por maior e menor grau); o de 2019 usa a porcentagem de fragmentos sistemáticos com ISUP ≥ 2, o estádio na RM e o diâmetro da lesão índice.' },
    ],
    compute(v) {
      const psa = +v.psa; if (!(psa > 0) || !v.ct || !v.gleason) return null;
      const GS = { '33': 6, '34': 7, '43': 7, '44': 8, '35': 8, '45': 9, '55': 10 }[v.gleason];
      const gg = { '33': 0, '34': 1, '43': 2, '44': 2, '35': 2, '45': 3, '55': 3 }[v.gleason];
      const ggLabel = ['ISUP 1', 'ISUP 2', 'ISUP 3–4', 'ISUP 5'][gg];
      // Partin 2017 (Johns Hopkins): [GG1, GG2, GG3-4, GG5] em %
      const PARTIN = {
        t1c: { b0: { oc: [92, 77, 67, 50], ece: [8, 20, 24, 31], sv: [1, 2, 7, 13], ln: [0, 1, 2, 6] }, b1: { oc: [90, 74, 64, 47], ece: [9, 23, 28, 35], sv: [1, 2, 6, 12], ln: [0, 1, 2, 5] }, b2: { oc: [87, 67, 53, 35], ece: [12, 28, 32, 36], sv: [1, 4, 11, 19], ln: [0, 1, 4, 9] }, b3: { oc: [80, 52, 35, 19], ece: [17, 34, 33, 30], sv: [3, 8, 20, 28], ln: [1, 5, 11, 22] } },
        t2a: { b0: { oc: [88, 70, 58, 41], ece: [11, 27, 31, 38], sv: [1, 2, 7, 13], ln: [0, 1, 3, 7] }, b1: { oc: [87, 66, 55, 38], ece: [12, 30, 35, 42], sv: [1, 2, 7, 12], ln: [0, 1, 3, 6] }, b2: { oc: [82, 58, 45, 28], ece: [16, 36, 39, 42], sv: [1, 4, 11, 18], ln: [0, 2, 4, 10] }, b3: { oc: [73, 43, 28, 14], ece: [22, 42, 39, 34], sv: [3, 9, 20, 26], ln: [1, 6, 13, 24] } },
        t2bc: { b0: { oc: [79, 52, 37, 21], ece: [19, 40, 40, 40], sv: [1, 5, 12, 18], ln: [1, 4, 10, 21] }, b1: { oc: [76, 48, 35, 20], ece: [22, 44, 44, 44], sv: [1, 4, 11, 17], ln: [0, 4, 9, 19] }, b2: { oc: [69, 38, 25, 13], ece: [27, 48, 44, 38], sv: [3, 7, 17, 22], ln: [1, 6, 14, 26] }, b3: { oc: [54, 23, 12, 5], ece: [34, 46, 33, 23], sv: [6, 12, 22, 23], ln: [5, 18, 32, 48] } },
      };
      const band = psa <= 4 ? 'b0' : psa <= 6 ? 'b1' : psa <= 10 ? 'b2' : 'b3';
      const bandLabel = { b0: '0–4', b1: '4,1–6', b2: '6,1–10', b3: '> 10' }[band];
      const pKey = v.ct === 't1c' ? 't1c' : v.ct === 't2a' ? 't2a' : (v.ct === 't2b' || v.ct === 't2c') ? 't2bc' : null;
      const partin = pKey ? PARTIN[pKey][band] : null;
      const T = v.ct === 't1c' ? 0 : v.ct === 't2a' ? 1 : (v.ct === 't2b' || v.ct === 't2c') ? 2 : null;
      const yale = T === null ? null : Math.max(0, Math.min(100, (GS - 5) * (psa / 3 + 1.5 * T)));
      const roach = Math.max(0, Math.min(65, (2 / 3) * psa + (GS - 6) * 10));
      const pct = (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
      const tot = +v.cores_tot, pos = +v.cores_pos;
      const temCores = tot > 0 && pos >= 0 && pos <= tot;
      const pctCores = temCores ? Math.round(100 * pos / tot) : null;
      const avisos = [];
      avisos.push('Nomograma de Briganti (2012: PSA, cT, Gleason primário/secundário, % de fragmentos positivos — limiar 5%; 2017: + % de fragmentos com maior e menor grau — limiar 7%; 2019, para biópsia dirigida por RM: estádio na RM, diâmetro da lesão índice, ISUP na biópsia dirigida, % de fragmentos sistemáticos com ISUP ≥ 2 — limiar 7%; 2023, para PSMA PET miN0): os coeficientes não são públicos. Calcule na ferramenta oficial (link em "Notas e fontes") com os dados desta tela.' + (temCores ? ` Fragmentos positivos: ${pos}/${tot} = ${pctCores}%.` : ''));
      if (T === null) avisos.push('cT3: Tabelas de Partin e fórmula de Yale não se aplicam; o risco de linfonodo positivo é alto (≥ 15–20% na maioria das séries) e a linfadenectomia estendida está indicada.');
      if (psa >= 26 && T !== null) avisos.push('PSA ≥ 26 ng/mL: fora da faixa de desenvolvimento da fórmula de Yale.');
      if (psa > 40) avisos.push('PSA > 40 ng/mL: a fórmula de Roach foi limitada a 65% e PSA ≤ 40.');
      avisos.push('As Tabelas de Partin vêm de centro terciário com linfadenectomia limitada em parte dos casos e tendem a subestimar o linfonodo positivo em relação à linfadenectomia estendida; a fórmula de Roach superestima na era atual. A PSMA PET tem sensibilidade de ~50% para linfonodo e não substitui a linfadenectomia quando o risco é relevante.');
      const rows = [];
      const ctLabel = { t1c: 'cT1c', t2a: 'cT2a', t2b: 'cT2b/c', t2c: 'cT2b/c' }[v.ct];
      if (partin) rows.push({ l: `Linfonodo positivo — Tabelas de Partin 2017 (${ctLabel}, PSA ${bandLabel}, ${ggLabel})`, p: partin.ln[gg] / 100, cls: partin.ln[gg] >= 7 ? 'bad' : partin.ln[gg] >= 5 ? 'warn' : 'good' });
      if (yale !== null) rows.push({ l: 'Linfonodo positivo — fórmula de Yale', p: yale / 100, cls: yale >= 7 ? 'bad' : yale >= 5 ? 'warn' : 'good' });
      rows.push({ l: 'Linfonodo positivo — fórmula de Roach (1994)', p: roach / 100, cls: 'neutral' });
      if (partin) {
        rows.push({ l: 'Doença confinada ao órgão (Partin)', p: partin.oc[gg] / 100, cls: 'neutral' });
        rows.push({ l: 'Extensão extraprostática (Partin)', p: partin.ece[gg] / 100, cls: 'neutral' });
        rows.push({ l: 'Invasão de vesícula seminal (Partin)', p: partin.sv[gg] / 100, cls: 'neutral' });
      }
      const est = T === null ? null : Math.max(partin.ln[gg], yale);
      let interp;
      if (T === null) interp = 'Linfadenectomia pélvica estendida indicada (cT3). Estadiar com PSMA PET antes da cirurgia.';
      else if (est >= 7) interp = `Risco estimado ${pct(est)}% (maior entre Partin e Yale): acima dos limiares de 5% (Briganti 2012/MSKCC) e 7% (Briganti 2017/2019) — linfadenectomia pélvica estendida indicada (ilíaca externa, obturatória e ilíaca interna; ≥ 10–12 linfonodos).`;
      else if (est >= 5) interp = `Risco estimado ${pct(est)}%: entre 5% e 7% — zona em que os nomogramas divergem; a EAU aceita omitir abaixo de 7% (Briganti 2017/2019) e a NCCN indica linfadenectomia a partir de 2%. Confirme no Briganti oficial e decida com o paciente.`;
      else if (est >= 2) interp = `Risco estimado ${pct(est)}%: abaixo de 5% — a EAU permite omitir a linfadenectomia (perda esperada de < 1,5% de pN1); a NCCN ainda indicaria pelo limiar de 2%.`;
      else interp = `Risco estimado ${pct(est)}%: < 2% — linfadenectomia dispensável por qualquer limiar (EAU, NCCN).`;
      const detalhe = `Yale: (Gleason ${GS} − 5) × (PSA ${String(psa).replace('.', ',')}/3 + 1,5 × T${T === null ? ' — não aplicável' : '=' + T}) = ${yale === null ? '—' : pct(yale) + '%'}. Roach: ⅔ × PSA + (Gleason − 6) × 10 = ${pct(roach)}% (limitado a 0–65%). Partin 2017: leitura direta da tabela (estádio × faixa de PSA × grupo ISUP).`;
      return { headline: T === null ? `Linfonodo positivo: alto risco (cT3) · Roach ${pct(roach)}%` : `Linfonodo positivo ${pct(partin.ln[gg])}% (Partin) · ${pct(yale)}% (Yale)`, rows, interp, avisos, detalhe };
    },
    notas: [
      'Tabelas de Partin contemporâneas (Tosoian et al., BJU Int 2017; 4.459 prostatectomias com linfadenectomia na Johns Hopkins, 2010–2015; mediana de PSA 4,9): probabilidade de doença confinada, extensão extraprostática, vesícula seminal e linfonodo positivo por estádio clínico (cT1c, cT2a, cT2b/c), faixa de PSA (0–4, 4,1–6, 6,1–10, > 10) e grupo ISUP (1, 2, 3–4, 5). AUC 0,92 para linfonodo. Valores reproduzidos da página oficial do Brady Urological Institute.',
      'Fórmula de Yale (Yu, Makarov, Gross, IJROBP 2011): % linfonodo positivo = (Gleason − 5) × (PSA/3 + 1,5 × T), com T = 0 para cT1c, 1 para cT2a e 2 para cT2b/c; derivada em 2.930 homens do SEER (2004–2006) com ≥ 10 linfonodos examinados, cT1c–cT2 e PSA < 26; melhor calibração que Roach e Nguyen; limiar de 15% para alto risco.',
      'Fórmula de Roach (Roach et al., IJROBP 1994): % linfonodo positivo = ⅔ × PSA + (Gleason − 6) × 10, limitada a 0–65% e PSA ≤ 40; derivada das Tabelas de Partin originais; usada em radioterapia para decidir irradiação pélvica, superestima o risco em séries contemporâneas.',
      'Nomogramas de Briganti: 2012 (Eur Urol 61:480; 588 pacientes com linfadenectomia estendida; AUC 0,88; limiar 5% evita 60% das linfadenectomias perdendo 1,5% de pN1); 2017 (Gandaglia, Eur Urol 72:632; 681 pacientes; AUC 0,91; limiar 7% evita 69% perdendo 1,5%); 2019 para biópsia dirigida por RM (Gandaglia, Eur Urol 75:506; 497 pacientes; AUC 0,86; limiar 7% evita 57% perdendo 1,6%; validação externa em 487 pacientes, Eur Urol 2020); 2023 para PSMA PET miN0 (Eur Urol Oncol 6:543). Validações externas: AUC 0,73–0,88 (2012); 0,76–0,86 (2019). Coeficientes disponíveis apenas na plataforma Evidencio (modelos 670 e 1555).',
      'Limiares em diretrizes: EAU 2026 — linfadenectomia estendida quando o risco de pN1 excede 7% (Briganti 2017/2019) ou 5% (Briganti 2012/MSKCC); NCCN — linfadenectomia quando o risco ≥ 2% por nomograma. A ePLND tem valor de estadiamento; benefício terapêutico não demonstrado em ensaios randomizados.',
    ],
    fontes: [
      { t: 'Johns Hopkins Brady Urological Institute — Partin Tables (contemporary era)', u: 'https://hopkinsmedicine.org/brady-urology-institute/conditions-and-treatments/prostate-cancer/risk-assessment-tools/partin-tables' },
      { t: 'Tosoian JJ et al. Prediction of pathological stage based on clinical stage, serum PSA and biopsy Gleason score: Partin Tables in the contemporary era. BJU Int 2017;119:676–83', u: 'https://doi.org/10.1111/bju.13573' },
      { t: 'Yu JB, Makarov DV, Gross C. A new formula for prostate cancer lymph node risk. Int J Radiat Oncol Biol Phys 2011;80:69–75', u: 'https://doi.org/10.1016/j.ijrobp.2010.01.068' },
      { t: 'Roach M et al. Predicting the risk of lymph node involvement using the pre-treatment PSA and Gleason score. Int J Radiat Oncol Biol Phys 1994;28:33–7', u: 'https://doi.org/10.1016/0360-3016(94)90138-4' },
      { t: 'Briganti A et al. Updated nomogram predicting lymph node invasion in patients with prostate cancer undergoing extended pelvic lymph node dissection. Eur Urol 2012;61:480–7', u: 'https://doi.org/10.1016/j.eururo.2011.10.044' },
      { t: 'Gandaglia G et al. Development and internal validation of a novel model to identify the candidates for extended pelvic lymph node dissection in prostate cancer. Eur Urol 2017;72:632–40', u: 'https://doi.org/10.1016/j.eururo.2017.03.049' },
      { t: 'Gandaglia G et al. A novel nomogram to identify candidates for ePLND among patients diagnosed with MRI-targeted and systematic biopsies. Eur Urol 2019;75:506–14', u: 'https://doi.org/10.1016/j.eururo.2018.10.012' },
      { t: 'Calculadora oficial — Briganti 2012 (Evidencio, modelo 670)', u: 'https://www.evidencio.com/models/show/670' },
      { t: 'Calculadora oficial — Briganti 2017/2019/2023 (Evidencio, modelo 1555)', u: 'https://www.evidencio.com/models/show/1555' },
      { t: 'Hueting TA et al. External validation of models predicting the probability of lymph node involvement in prostate cancer patients. Eur Urol Oncol 2018;1:411–7', u: 'https://doi.org/10.1016/j.euo.2018.04.016' },
    ],
  },
  psadt: {
    nome: 'Tempo de duplicação do PSA (PSA-DT) e velocidade do PSA',
    origem: 'Método do PSA Working Group (Arlen et al., J Urol 2008) e da calculadora do MSKCC: regressão linear do logaritmo natural do PSA contra o tempo; PSA-DT = ln 2 ÷ inclinação. Interpretação: Pound 1999, Freedland 2005, Trock 2008, EAU 2026, SPARTAN/PROSPER/ARAMIS, EMBARK',
    resumo: 'Informe as dosagens de PSA com data (2 a 8 valores). A calculadora ajusta uma reta a ln(PSA) × tempo com todos os pontos — o método recomendado para ensaios e para as calculadoras de referência —, devolve o tempo de duplicação em meses, a velocidade do PSA em ng/mL/ano, a qualidade do ajuste (R²) e a data projetada para o PSA atingir um valor-alvo. A interpretação muda com o cenário: recidiva após prostatectomia, após radioterapia, doença resistente à castração não metastática ou vigilância ativa.',
    campos: [
      { id: 'serie', l: 'Dosagens de PSA', tipo: 'serie', n: 8, help: 'Use só valores após a recidiva (≥ 0,1–0,2 ng/mL após prostatectomia; acima do nadir após radioterapia), no mesmo laboratório e sem terapia hormonal entre eles. Idealmente ≥ 3 valores ao longo de ≥ 3 meses; o mínimo é 2 valores com ≥ 3 meses de intervalo.' },
      { id: 'contexto', l: 'Cenário', tipo: 'seg', opts: [{ v: 'pos_pr', l: 'Recidiva após prostatectomia', s: 'PSA ≥ 0,2 confirmado' }, { v: 'pos_rt', l: 'Recidiva após radioterapia', s: 'nadir + 2 ng/mL' }, { v: 'nmcrpc', l: 'Resistente à castração, sem metástase', s: 'testosterona < 50 com PSA subindo' }, { v: 'va', l: 'Vigilância ativa' }] },
      { id: 'isup', l: 'ISUP (patológico ou da biópsia)', tipo: 'seg', opts: [{ v: 'baixo', l: 'ISUP 1–3' }, { v: 'alto', l: 'ISUP 4–5' }, { v: 'ni', l: 'Não sei' }], show: (v) => v.contexto === 'pos_pr' || v.contexto === 'pos_rt', help: 'Entra na classificação de risco da recidiva bioquímica da EAU.' },
      { id: 'tempo_rec', l: 'Tempo do tratamento até a recidiva', tipo: 'seg', opts: [{ v: 'curto', l: '≤ 18 meses' }, { v: 'longo', l: '> 18 meses' }, { v: 'ni', l: 'Não sei' }], show: (v) => v.contexto === 'pos_rt' },
      { id: 'tempo_rec_pr', l: 'Tempo da cirurgia até a recidiva', tipo: 'seg', opts: [{ v: 'curto', l: '≤ 3 anos' }, { v: 'longo', l: '> 3 anos' }, { v: 'ni', l: 'Não sei' }], show: (v) => v.contexto === 'pos_pr', help: 'Entra na tabela de Freedland (mortalidade em 15 anos).' },
      { id: 'alvo', l: 'PSA-alvo para projeção (opcional)', tipo: 'num', unit: 'ng/mL', step: 0.1, min: 0.1, max: 1000, help: 'Ex.: 2,0 (critério dos ensaios em nmCRPC e do EMBARK após radioterapia), 1,0 (EMBARK após prostatectomia), 0,5 (PSMA PET e radioterapia de resgate).' },
    ],
    compute(v) {
      const pts = [];
      for (let k = 1; k <= 8; k++) {
        const d = v['d' + k], p = v['p' + k];
        if (!d || p === undefined || p === '' || !(+p > 0)) continue;
        const t = Date.parse(d + 'T12:00:00'); if (!isFinite(t)) continue;
        pts.push({ t, psa: +p, d });
      }
      pts.sort((a, b) => a.t - b.t);
      const uniq = []; pts.forEach((q) => { if (!uniq.length || q.t !== uniq[uniq.length - 1].t) uniq.push(q); else uniq[uniq.length - 1] = q; });
      if (uniq.length < 2) return null;
      const t0 = uniq[0].t;
      const xs = uniq.map((q) => (q.t - t0) / (1000 * 3600 * 24 * 30.4375)); // meses
      const ys = uniq.map((q) => Math.log(q.psa));
      const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
      let sxx = 0, sxy = 0, syy = 0; for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2; }
      if (!(sxx > 0)) return null;
      const slope = sxy / sxx; // ln(PSA) por mês
      const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 1;
      const span = xs[n - 1];
      const dt = slope > 0 ? Math.LN2 / slope : null; // meses
      // velocidade linear (ng/mL/ano)
      const ysL = uniq.map((q) => q.psa); const myL = ysL.reduce((a, b) => a + b, 0) / n; let sxyL = 0; for (let i = 0; i < n; i++) sxyL += (xs[i] - mx) * (ysL[i] - myL);
      const vel = (sxyL / sxx) * 12;
      const dt2 = (() => { const a = uniq[n - 2], b = uniq[n - 1]; const m = (b.t - a.t) / (1000 * 3600 * 24 * 30.4375); const dl = Math.log(b.psa) - Math.log(a.psa); return dl > 0 ? Math.LN2 * m / dl : null; })();
      const fmt = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
      const fmtDate = (ms) => { const D = new Date(ms); return `${String(D.getDate()).padStart(2, '0')}/${String(D.getMonth() + 1).padStart(2, '0')}/${D.getFullYear()}`; };
      const ctx = v.contexto || '';
      const isup = v.isup || 'ni';
      const avisos = [];
      if (n === 2) avisos.push('Só 2 valores: a estimativa é frágil (variação analítica de 10–20% entre dosagens muda muito o resultado); confirme com um terceiro valor.');
      if (Math.round(span * 10) / 10 < 3) avisos.push(`Intervalo total de ${fmt(span)} mês(es): recomenda-se ≥ 3 meses entre o primeiro e o último valor.`);
      if (uniq.some((q) => q.psa < 0.1)) avisos.push('Há valores < 0,1 ng/mL: abaixo disso o ruído analítico domina; para PSA-DT use valores ≥ 0,1–0,2 ng/mL.');
      if (r2 < 0.8 && n >= 3 && slope > 0) avisos.push(`Ajuste irregular (R² ${fmt(r2, 2)}): PSA não sobe de forma exponencial constante — flutuação, mudança de laboratório, prostatite ou terapia intercorrente; interprete com cautela e repita.`);
      if (slope <= 0) avisos.push('PSA estável ou em queda no período: o tempo de duplicação não se aplica (inclinação ≤ 0).');
      const last = uniq[n - 1];
      let proj = '';
      const alvo = +v.alvo;
      if (alvo > 0 && slope > 0) {
        if (last.psa >= alvo) proj = `PSA já ≥ ${fmt(alvo)} ng/mL.`;
        else { const meses = (Math.log(alvo) - Math.log(last.psa)) / slope; proj = `PSA atinge ${fmt(alvo)} ng/mL em ≈ ${fmt(meses)} meses (${fmtDate(last.t + meses * 30.4375 * 86400000)}), mantida a cinética.`; }
      }
      const rows = [];
      let headline, interp;
      if (slope <= 0) {
        headline = `PSA sem ascensão (velocidade ${fmt(vel, 2)} ng/mL/ano)`;
        interp = `${n} valores em ${fmt(span)} meses; último PSA ${fmt(last.psa, 2)} ng/mL em ${fmtDate(last.t)}. Sem duplicação mensurável.`;
      } else {
        headline = `PSA-DT ${fmt(dt)} meses · velocidade ${fmt(vel, 2)} ng/mL/ano`;
        const base = `${n} valores em ${fmt(span)} meses (R² ${fmt(r2, 2)}); último PSA ${fmt(last.psa, 2)} ng/mL em ${fmtDate(last.t)}; PSA-DT pelos 2 últimos valores: ${dt2 ? fmt(dt2) + ' meses' : 'não calculável'}. ${proj}`;
        let cl = '';
        if (ctx === 'pos_pr') {
          const altoRisco = dt <= 12 || isup === 'alto';
          cl = altoRisco ? `Recidiva bioquímica de ALTO risco (EAU: PSA-DT ≤ 12 meses ou ISUP 4–5${dt <= 12 ? '; aqui PSA-DT ' + fmt(dt) + ' meses' : ''}): PSMA PET e radioterapia de resgate precoce (PSA < 0,5) com hormonioterapia de 6–24 meses; se PSA-DT ≤ 9 meses e PSA ≥ 1 sem metástase convencional, considerar enzalutamida ± ADT (EMBARK). ` : `Recidiva bioquímica de BAIXO risco (EAU: PSA-DT > 12 meses e ISUP < 4): observação ou radioterapia de resgate, com decisão compartilhada; PSMA PET se PSA ≥ 0,2–0,5. `;
          const fc = dt < 3 ? '< 3 meses' : dt < 9 ? '3–8,9 meses' : dt < 15 ? '9–14,9 meses' : '≥ 15 meses';
          cl += `Faixa de Freedland (mortalidade específica em 15 anos, com Gleason patológico e tempo até a recidiva ${v.tempo_rec_pr === 'curto' ? '≤ 3 anos' : v.tempo_rec_pr === 'longo' ? '> 3 anos' : '—'}): PSA-DT ${fc}. ${dt < 6 ? 'PSA-DT < 6 meses foi o grupo em que a radioterapia de resgate (iniciada em até 2 anos da recidiva) aumentou a sobrevida específica (Trock 2008). ' : ''}${dt < 10 ? 'PSA-DT < 10 meses marca risco maior de metástase (Pound 1999).' : 'PSA-DT ≥ 10 meses: progressão mais lenta (Pound 1999).'}`;
        } else if (ctx === 'pos_rt') {
          const altoRisco = v.tempo_rec === 'curto' || isup === 'alto';
          cl = altoRisco ? 'Recidiva bioquímica de ALTO risco (EAU: intervalo até a recidiva ≤ 18 meses ou ISUP 4–5): PSMA PET; tratamento local de resgate (prostatectomia, braquiterapia, HIFU/crioterapia) se recidiva local comprovada e expectativa > 10 anos; ' : 'Recidiva bioquímica de BAIXO risco (EAU: intervalo > 18 meses e ISUP < 4): PSMA PET e decisão compartilhada entre observação e resgate local; ';
          cl += dt <= 9 ? `PSA-DT ${fmt(dt)} meses (≤ 9) com PSA ≥ 2 acima do nadir e sem metástase convencional preenche o critério do EMBARK (enzalutamida ± ADT).` : `PSA-DT ${fmt(dt)} meses: hormonioterapia pode esperar se PSA-DT > 12 meses e sem metástase.`;
        } else if (ctx === 'nmcrpc') {
          cl = dt <= 10 ? `PSA-DT ${fmt(dt)} meses (≤ 10) ${last.psa >= 2 ? 'com PSA ≥ 2 ng/mL ' : ''}— critério de SPARTAN, PROSPER e ARAMIS: apalutamida, enzalutamida ou darolutamida + ADT (ganho de sobrevida livre de metástase e global). PSMA PET costuma mostrar metástase nessa situação e não deve atrasar o tratamento.` : `PSA-DT ${fmt(dt)} meses (> 10): fora dos critérios dos ensaios; manter ADT e repetir PSA em 3 meses; PSMA PET se PSA subindo.`;
        } else if (ctx === 'va') {
          cl = `Vigilância ativa: PSA-DT ${fmt(dt)} meses${dt < 36 ? ' (< 3 anos)' : ''}. A cinética do PSA isolada não deve disparar tratamento (EAU); PSA-DT curto ou PSA-densidade ≥ 0,15 indicam repetir ressonância e biópsia.`;
        }
        interp = `${base}${cl ? ' ' + cl : ''}`;
      }
      rows.length = 0;
      const detalhe = `Pontos (data · PSA · ln): ${uniq.map((q) => `${fmtDate(q.t)} · ${fmt(q.psa, 2)} · ${fmt(Math.log(q.psa), 3)}`).join('; ')}. Inclinação de ln(PSA) = ${fmt(slope, 4)}/mês; PSA-DT = 0,693 ÷ inclinação${dt ? ' = ' + fmt(dt, 2) + ' meses' : ''}. Tempo em meses de 30,44 dias.`;
      return { headline, rows, interp, avisos, detalhe };
    },
    notas: [
      'Cálculo: regressão linear de ln(PSA) sobre o tempo usando todos os valores; PSA-DT = ln 2 ÷ inclinação (PSA Working Group, Arlen et al., J Urol 2008; método da calculadora do MSKCC). Com apenas 2 valores, PSA-DT = ln 2 × intervalo ÷ [ln(PSA₂) − ln(PSA₁)]. A velocidade é a inclinação linear do PSA em ng/mL/ano.',
      'Quais valores usar: após a recidiva, ≥ 0,1–0,2 ng/mL, mesmo laboratório, sem terapia hormonal ou intercorrência (prostatite, instrumentação) no intervalo; ≥ 3 valores em ≥ 3 meses dão estimativa estável — Freedland 2005 exigiu ≥ 2 valores com ≥ 3 meses de intervalo.',
      'Interpretação após prostatectomia: EAU classifica a recidiva bioquímica em baixo risco (PSA-DT > 12 meses e ISUP < 4) e alto risco (PSA-DT ≤ 12 meses ou ISUP 4–5) — Van den Broeck et al., Eur Urol 2019. Pound 1999 (JAMA): PSA-DT < 10 meses, Gleason 8–10 e recidiva ≤ 2 anos predizem metástase. Freedland 2005 (JAMA): PSA-DT (< 3; 3–8,9; 9–14,9; ≥ 15 meses), Gleason (≤ 7 vs 8–10) e tempo até a recidiva (≤ 3 vs > 3 anos) estratificam a mortalidade específica em 15 anos; PSA-DT < 3 meses é o grupo mais letal. Trock 2008 (JAMA): radioterapia de resgate aumentou a sobrevida específica apenas com PSA-DT < 6 meses e quando iniciada em até 2 anos da recidiva.',
      'nmCRPC: SPARTAN (apalutamida), PROSPER (enzalutamida) e ARAMIS (darolutamida) incluíram PSA-DT ≤ 10 meses e PSA ≥ 2 ng/mL com imagem convencional negativa; EMBARK (enzalutamida ± leuprolida) incluiu recidiva bioquímica de alto risco com PSA-DT ≤ 9 meses (PSA ≥ 1 após prostatectomia ou ≥ 2 acima do nadir após radioterapia). Valores acima de 10 meses ficam fora da evidência.',
      'Limites: assume crescimento exponencial constante; valores muito baixos ou muito próximos no tempo geram estimativas instáveis; laboratórios diferentes e o mesmo valor repetido distorcem; PSA-DT não substitui o estadiamento por PSMA PET.',
    ],
    fontes: [
      { t: 'Arlen PM et al. Prostate Specific Antigen Working Group guidelines on PSA doubling time. J Urol 2008;179:2181–6', u: 'https://doi.org/10.1016/j.juro.2008.01.099' },
      { t: 'MSKCC — PSA doubling time calculator', u: 'https://www.mskcc.org/nomograms/prostate/psa_doubling_time' },
      { t: 'Pound CR et al. Natural history of progression after PSA elevation following radical prostatectomy. JAMA 1999;281:1591–7', u: 'https://doi.org/10.1001/jama.281.17.1591' },
      { t: 'Freedland SJ et al. Risk of prostate cancer-specific mortality following biochemical recurrence after radical prostatectomy. JAMA 2005;294:433–9', u: 'https://doi.org/10.1001/jama.294.4.433' },
      { t: 'Trock BJ et al. Prostate cancer-specific survival following salvage radiotherapy vs observation in men with biochemical recurrence after radical prostatectomy. JAMA 2008;299:2760–9', u: 'https://doi.org/10.1001/jama.299.23.2760' },
      { t: 'Van den Broeck T et al. Prognostic value of biochemical recurrence following treatment with curative intent for prostate cancer: a systematic review. Eur Urol 2019;75:967–87', u: 'https://doi.org/10.1016/j.eururo.2018.10.011' },
      { t: 'Howard LE et al. Thresholds for PSA doubling time in men with non-metastatic castration-resistant prostate cancer. BJU Int 2017;120:E80–6', u: 'https://doi.org/10.1111/bju.13856' },
      { t: 'Freedland SJ et al. Improved outcomes with enzalutamide in biochemically recurrent prostate cancer (EMBARK). N Engl J Med 2023;389:1453–65', u: 'https://doi.org/10.1056/NEJMoa2303974' },
    ],
  },
  nmibc: {
    nome: 'Câncer de bexiga não músculo-invasivo — grupos de risco EAU 2021, tabelas EORTC 2006 e escore CUETO',
    origem: 'EAU NMIBC Guidelines Panel (Sylvester et al., Eur Urol 2021) · EORTC (Sylvester et al., Eur Urol 2006, 2.596 pacientes de 7 ensaios) · CUETO (Fernandez-Gomez et al., J Urol 2009, 1.062 pacientes tratados com BCG)',
    resumo: 'Após a RTU, estratifica o tumor Ta/T1/CIS pelos grupos de risco da EAU 2021 (baixo, intermediário, alto e muito alto, com a probabilidade de progressão para músculo-invasivo em 1, 5 e 10 anos nos sistemas WHO 2004/2016 e WHO 1973) e calcula as tabelas EORTC 2006 de recorrência e progressão (escores 0–17 e 0–23) e, para quem recebe BCG, o escore CUETO. É a mesma função usada no fluxo "Não músculo-invasivo" do módulo de bexiga, que traz a conduta completa.',
    campos: [
      { id: 'T', l: 'Estádio na RTU', tipo: 'seg', opts: [{ v: 'Ta', l: 'Ta', s: 'papilar, lâmina própria livre' }, { v: 'T1', l: 'T1', s: 'invade lâmina própria' }, { v: 'CIS', l: 'CIS puro', s: 'sem tumor papilar' }] },
      { id: 'grau04', l: 'Grau WHO 2004/2016', tipo: 'seg', opts: [{ v: 'LG', l: 'Baixo grau (LG)' }, { v: 'HG', l: 'Alto grau (HG)' }], show: (v) => v.T !== 'CIS' },
      { id: 'grau73', l: 'Grau WHO 1973 (se o laudo informar)', tipo: 'seg', opts: [{ v: 'G1', l: 'G1' }, { v: 'G2', l: 'G2' }, { v: 'G3', l: 'G3' }, { v: 'ni', l: 'Não informado' }], show: (v) => v.T !== 'CIS', help: 'As tabelas EORTC e CUETO usam o grau de 1973; sem ele, elas não são calculadas (LG ≈ G1–G2 e HG ≈ G2–G3 não têm conversão exata).' },
      { id: 'cis', l: 'CIS concomitante', tipo: 'seg', opts: [{ v: 'nao', l: 'Não' }, { v: 'sim', l: 'Sim' }], show: (v) => v.T !== 'CIS' },
      { id: 'n', l: 'Número de tumores', tipo: 'seg', opts: [{ v: '1', l: 'Único' }, { v: '2-3', l: '2–3' }, { v: '4-7', l: '4–7' }, { v: '8+', l: '≥ 8' }], show: (v) => v.T !== 'CIS' },
      { id: 'tam', l: 'Maior diâmetro', tipo: 'seg', opts: [{ v: '<3', l: '< 3 cm' }, { v: '3', l: '3 cm' }, { v: '>3', l: '> 3 cm' }], show: (v) => v.T !== 'CIS', help: 'EAU conta > 3 cm como fator adicional; EORTC pontua ≥ 3 cm.' },
      { id: 'rec', l: 'História', tipo: 'seg', opts: [{ v: 'prim', l: 'Tumor primário' }, { v: 'rec1', l: 'Recorrente, ≤ 1 recidiva/ano' }, { v: 'rec2', l: 'Recorrente, > 1 recidiva/ano' }] },
      { id: 'idade', l: 'Idade', tipo: 'num', unit: 'anos', step: 1, min: 18, max: 100, help: 'EAU: > 70 anos é fator adicional; CUETO pontua 60–70 e > 70.' },
      { id: 'sexo', l: 'Sexo', tipo: 'seg', opts: [{ v: 'm', l: 'Masculino' }, { v: 'f', l: 'Feminino' }], help: 'Só entra no escore CUETO de recorrência.' },
      { id: 'agress', l: 'Invasão linfovascular, subtipo histológico agressivo ou CIS na uretra prostática', tipo: 'seg', opts: [{ v: 'nao', l: 'Nenhum' }, { v: 'sim', l: 'Pelo menos um' }], help: 'Qualquer um deles coloca o paciente no grupo de muito alto risco da EAU.' },
      { id: 'bcg', l: 'Tratamento intravesical previsto', tipo: 'seg', opts: [{ v: 'nao', l: 'Sem BCG', s: 'instilação única ou quimioterapia' }, { v: 'sim', l: 'BCG (≥ 5–6 meses)', s: 'calcula o CUETO' }] },
    ],
    compute(v) {
      if (!v.T || !v.rec || !(+v.idade > 0) || !v.agress || !v.bcg) return null;
      const isCIS = v.T === 'CIS';
      if (!isCIS && (!v.grau04 || !v.cis || !v.n || !v.tam)) return null;
      if (typeof Bladder === 'undefined') return null;
      const g73 = v.grau73 && v.grau73 !== 'ni' ? v.grau73 : null;
      const idade = +v.idade;
      const multi = v.n !== '1';
      const p = { T: isCIS ? 'CIS' : v.T, grau: g73 || v.grau04 || 'HG', cis: isCIS ? 'sim' : v.cis, recorrente: v.rec === 'prim' ? 'nao' : 'sim', idade, multiplos: multi ? 'sim' : 'nao', tamanho: v.tam === '>3' ? '>3' : '<3', lvi: v.agress === 'sim' ? 'sim' : 'nao', papilar: false };
      const pMain = Object.assign({}, p, { grau: v.grau04 || (g73 === 'G3' ? 'HG' : 'LG') });
      const eau = Bladder.nmibcRisk(pMain);
      const eau73 = g73 ? Bladder.nmibcRisk(Object.assign({}, p, { grau: g73 })) : null;
      const pct = (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
      const cls = { baixo: 'good', intermediario: 'warn', alto: 'bad', muito_alto: 'bad' }[eau.group];
      const rows = [];
      rows.push({ l: `Progressão em 1 ano — EAU 2021 (${eau.label}, WHO 2004/2016, sem BCG)`, p: eau.prog[0] / 100, cls });
      rows.push({ l: 'Progressão em 5 anos — EAU 2021', p: eau.prog[1] / 100, cls });
      rows.push({ l: 'Progressão em 10 anos — EAU 2021', p: eau.prog[2] / 100, cls });
      if (eau73) rows.push({ l: `Progressão em 5 anos — EAU 2021 pelo grau WHO 1973 (${eau73.label})`, p: eau73.prog[1] / 100, cls: 'neutral' });
      // EORTC 2006
      let eortc = null;
      if (!isCIS && g73) {
        const nR = v.n === '1' ? 0 : v.n === '8+' ? 6 : 3, nP = v.n === '1' ? 0 : 3;
        const sR = v.tam === '<3' ? 0 : 3, sP = sR;
        const rR = v.rec === 'prim' ? 0 : v.rec === 'rec1' ? 2 : 4, rP = v.rec === 'prim' ? 0 : 2;
        const tR = v.T === 'T1' ? 1 : 0, tP = v.T === 'T1' ? 4 : 0;
        const cR = v.cis === 'sim' ? 1 : 0, cP = v.cis === 'sim' ? 6 : 0;
        const gR = g73 === 'G1' ? 0 : g73 === 'G2' ? 1 : 2, gP = g73 === 'G3' ? 5 : 0;
        const rec = nR + sR + rR + tR + cR + gR, prog = nP + sP + rP + tP + cP + gP;
        const recP = rec === 0 ? [15, 31] : rec <= 4 ? [24, 46] : rec <= 9 ? [38, 62] : [61, 78];
        const progP = prog === 0 ? [0.2, 0.8] : prog <= 6 ? [1, 6] : prog <= 13 ? [5, 17] : [17, 45];
        eortc = { rec, prog, recP, progP, det: `EORTC recorrência ${rec}/17 (tumores ${nR}, tamanho ${sR}, recidivas ${rR}, T ${tR}, CIS ${cR}, grau ${gR}); progressão ${prog}/23 (tumores ${nP}, tamanho ${sP}, recidivas ${rP}, T ${tP}, CIS ${cP}, grau ${gP}).` };
        rows.push({ l: `Recorrência em 1 ano — EORTC 2006 (escore ${rec}/17)`, p: recP[0] / 100, cls: 'neutral' });
        rows.push({ l: 'Recorrência em 5 anos — EORTC 2006', p: recP[1] / 100, cls: 'neutral' });
        rows.push({ l: `Progressão em 1 ano — EORTC 2006 (escore ${prog}/23)`, p: progP[0] / 100, cls: 'neutral' });
        rows.push({ l: 'Progressão em 5 anos — EORTC 2006', p: progP[1] / 100, cls: 'neutral' });
      }
      // CUETO (BCG)
      let cueto = null;
      if (!isCIS && g73 && v.bcg === 'sim') {
        const sexR = v.sexo === 'f' ? 3 : 0;
        const ageR = idade < 60 ? 0 : idade <= 70 ? 1 : 2, ageP = idade > 70 ? 2 : 0;
        const recR = v.rec === 'prim' ? 0 : 4, recP2 = v.rec === 'prim' ? 0 : 2;
        const nR = (v.n === '4-7' || v.n === '8+') ? 2 : 0, nP = (v.n === '4-7' || v.n === '8+') ? 1 : 0;
        const tP = v.T === 'T1' ? 2 : 0;
        const cR = v.cis === 'sim' ? 2 : 0, cP = v.cis === 'sim' ? 1 : 0;
        const gR = g73 === 'G1' ? 0 : g73 === 'G2' ? 1 : 3, gP = g73 === 'G1' ? 0 : g73 === 'G2' ? 2 : 6;
        const rec = sexR + ageR + recR + nR + cR + gR, prog = ageP + recP2 + nP + tP + cP + gP;
        const recP = rec <= 4 ? [8.2, 21] : rec <= 6 ? [12, 36] : rec <= 9 ? [25, 48] : [42, 68];
        const progP = prog <= 4 ? [1.2, 3.7] : prog <= 6 ? [3, 12] : prog <= 9 ? [5.5, 21] : [14, 34];
        cueto = { rec, prog, recP, progP, det: `CUETO recorrência ${rec}/16 (sexo ${sexR}, idade ${ageR}, recidiva ${recR}, tumores ${nR}, CIS ${cR}, grau ${gR}); progressão ${prog}/14 (idade ${ageP}, recidiva ${recP2}, tumores ${nP}, T ${tP}, CIS ${cP}, grau ${gP}).` };
        rows.push({ l: `Recorrência em 1 ano com BCG — CUETO (escore ${rec}/16)`, p: recP[0] / 100, cls: 'neutral' });
        rows.push({ l: 'Recorrência em 5 anos com BCG — CUETO', p: recP[1] / 100, cls: 'neutral' });
        rows.push({ l: `Progressão em 1 ano com BCG — CUETO (escore ${prog}/14)`, p: progP[0] / 100, cls: 'neutral' });
        rows.push({ l: 'Progressão em 5 anos com BCG — CUETO', p: progP[1] / 100, cls: 'neutral' });
      }
      const avisos = [];
      if (!g73 && !isCIS) avisos.push('Sem o grau WHO 1973 as tabelas EORTC 2006 e CUETO não foram calculadas; peça ao patologista o grau em ambos os sistemas (a EAU recomenda laudar os dois).');
      if (v.rec !== 'prim') avisos.push('Os grupos EAU 2021 foram desenvolvidos em tumores primários; em recorrentes, a EAU indica a tabela EORTC 2006 para recorrência e classifica pelo menos como intermediário.');
      if (v.bcg === 'sim') avisos.push(`As probabilidades de progressão da EAU 2021 valem para quem não recebe BCG: em 529 pacientes do MD Anderson com BCG adequado, a progressão em 5 anos foi 5,3% no alto risco e 14,9% no muito alto (vs 9,6% e 40% previstos).${cueto ? ' Escore CUETO: valores das faixas de probabilidade a conferir no artigo original (J Urol 2009;182:2195).' : ''}`);
      if (eau.div) avisos.push('Divergência com AUA/NCCN (' + eau.auaLabel + '): ' + eau.div);
      if (eau.ibcg) avisos.push('Dentro do intermediário, o IBCG conta fatores (multifocal, ≥ 3 cm, recidiva < 1 ano, > 1 recidiva/ano, falha intravesical prévia): ' + eau.ibcg.label + ' — recorrência em 1/3 anos ' + eau.ibcg.rec1 + '% / ' + eau.ibcg.rec3 + '%.');
      const cond = {
        baixo: 'Instilação única de quimioterapia nas primeiras 24 h após a RTU (mitomicina, epirrubicina ou gemcitabina); cistoscopia aos 3 e 12 meses e depois anual por 5 anos.',
        intermediario: 'BCG por 1 ano (indução + manutenção) ou quimioterapia intravesical por até 1 ano; cistoscopia aos 3 meses, a cada 6 meses por 2 anos e depois anual até 10 anos; imagem do trato superior se multifocal/recorrente.',
        alto: 'Re-RTU em 2–6 semanas (T1, HG sem músculo); BCG dose plena por 1–3 anos; discutir cistectomia precoce nos de maior risco (T1 HG com CIS ou recorrente); cistoscopia a cada 3 meses por 2 anos, a cada 6 até 5 anos e depois anual, com imagem anual do trato superior.',
        muito_alto: 'Cistectomia radical imediata com linfadenectomia (progressão de 40% em 5 anos sem cistectomia); se o paciente recusa, BCG 1–3 anos com reavaliação aos 3 meses.',
      }[eau.group];
      const interp = `EAU 2021: ${eau.label} (${eau.crit.join('; ')}). Progressão sem BCG: ${pct(eau.prog[0])}% em 1 ano, ${pct(eau.prog[1])}% em 5 e ${pct(eau.prog[2])}% em 10 anos.${eortc ? ` EORTC 2006: recorrência ${eortc.recP[0]}% / ${eortc.recP[1]}% e progressão ${eortc.progP[0]}% / ${eortc.progP[1]}% em 1 / 5 anos.` : ''}${cueto ? ` CUETO (com BCG): recorrência ${cueto.recP[0]}% / ${cueto.recP[1]}% e progressão ${cueto.progP[0]}% / ${cueto.progP[1]}% em 1 / 5 anos.` : ''} Conduta de referência: ${cond} O fluxo "Não músculo-invasivo" do módulo de bexiga detalha doses, falha ao BCG e alternativas.`;
      const detalhe = `Fatores adicionais EAU (idade > 70, múltiplos, > 3 cm): ${eau.nFat}. ${eortc ? eortc.det + ' ' : ''}${cueto ? cueto.det : ''}`;
      return { headline: `EAU 2021: ${eau.label} · progressão em 5 anos ${pct(eau.prog[1])}%`, rows, interp, avisos, detalhe };
    },
    notas: [
      'Grupos EAU 2021 (Sylvester et al., Eur Urol 2021; 3.401 pacientes primários tratados com RTU ± quimioterapia intravesical, sem BCG): fatores adicionais = idade > 70 anos, múltiplos tumores papilares e diâmetro > 3 cm. Baixo: TaT1 LG/G1 primário único < 3 cm sem CIS em ≤ 70 anos, ou Ta LG/G1 primário sem CIS com ≤ 1 fator. Intermediário: os demais sem CIS. Alto: T1 HG/G3 sem CIS; qualquer CIS; Ta LG/G2 ou T1 G1 sem CIS com os 3 fatores; Ta HG/G3 ou T1 LG sem CIS com ≥ 2 fatores; T1 G2 sem CIS com ≥ 1 fator. Muito alto: Ta HG/G3 + CIS com 3 fatores; T1 G2 + CIS com ≥ 2; T1 HG/G3 + CIS com ≥ 1; T1 HG/G3 sem CIS com 3 fatores; além de LVI, subtipos histológicos e CIS na uretra prostática (pela diretriz).',
      'Progressão (Tabela 6.3 da diretriz EAU, pacientes sem BCG) — WHO 2004/2016: baixo 0,06 / 0,93 / 3,7%; intermediário 1,0 / 4,9 / 8,5%; alto 3,5 / 9,6 / 14%; muito alto 16 / 40 / 53% em 1 / 5 / 10 anos. WHO 1973: baixo 0,12 / 0,57 / 3,0%; intermediário 0,65 / 3,6 / 7,4%; alto 3,8 / 11 / 14%; muito alto 20 / 44 / 59%. Calculadora oficial: nmibc.net. Com BCG os valores superestimam (Lobo, Kamat et al., Eur Urol Oncol 2022).',
      'EORTC 2006 (Sylvester et al., Eur Urol 2006): pesos recorrência/progressão — tumores único 0/0, 2–7 3/3, ≥ 8 6/3; diâmetro ≥ 3 cm 3/3; recidivas ≤ 1/ano 2/2, > 1/ano 4/2; T1 1/4; CIS 1/6; G2 1/0; G3 2/5. Recorrência: escore 0 → 15% / 31%; 1–4 → 24% / 46%; 5–9 → 38% / 62%; 10–17 → 61% / 78% em 1 / 5 anos. Progressão: 0 → 0,2% / 0,8%; 2–6 → 1% / 6%; 7–13 → 5% / 17%; 14–23 → 17% / 45%. Desenvolvido em pacientes sem BCG de manutenção (78% com quimioterapia intravesical).',
      'CUETO (Fernandez-Gomez et al., J Urol 2009; 1.062 pacientes com BCG em 4 ensaios): pesos recorrência/progressão — sexo feminino 3/0; idade 60–70 1/0, > 70 2/2; tumor recorrente 4/2; > 3 tumores 2/1; T1 0/2; CIS 2/1; G2 1/2; G3 3/6. Faixas: recorrência 0–4, 5–6, 7–9, 10–16 → 8,2 / 12 / 25 / 42% em 1 ano e 21 / 36 / 48 / 68% em 5 anos; progressão 0–4, 5–6, 7–9, 10–14 → 1,2 / 3 / 5,5 / 14% em 1 ano e 3,7 / 12 / 21 / 34% em 5 anos (valores das faixas a confirmar no artigo original; os pesos somam 16 e 14, como publicado). A EAU recomenda, para quem recebe BCG, o modelo EORTC 2016 (1–3 anos de manutenção) ou o CUETO.',
      'Validações: c-index 0,55–0,61 para recorrência e 0,72–0,82 para progressão (EORTC e CUETO, validação internacional em tumores primários, PLoS One 2014); ambos subestimam ou superestimam conforme o uso de BCG. As decisões de re-RTU, BCG e cistectomia precoce seguem o grupo EAU; a AUA/NCCN usam critérios próprios (mostrados quando divergem).',
    ],
    fontes: [
      { t: 'Sylvester RJ et al. EAU prognostic factor risk groups for NMIBC incorporating the WHO 2004/2016 and WHO 1973 classification systems for grade. Eur Urol 2021;79:480–8', u: 'https://doi.org/10.1016/j.eururo.2020.12.033' },
      { t: 'EAU Guidelines on Non-muscle-invasive Bladder Cancer — capítulo "Predicting disease recurrence and progression" (Tabela 6.3)', u: 'https://uroweb.org/guidelines/non-muscle-invasive-bladder-cancer/chapter/predicting-disease-recurrence-and-progression' },
      { t: 'Calculadora oficial EAU 2021 NMIBC risk calculator', u: 'https://nmibc.net/' },
      { t: 'Sylvester RJ et al. Predicting recurrence and progression in individual patients with stage Ta T1 bladder cancer using EORTC risk tables. Eur Urol 2006;49:466–77', u: 'https://doi.org/10.1016/j.eururo.2005.12.031' },
      { t: 'Fernandez-Gomez J et al. Predicting NMIBC recurrence and progression in patients treated with BCG: the CUETO scoring model. J Urol 2009;182:2195–203', u: 'https://doi.org/10.1016/j.juro.2009.07.016' },
      { t: 'Lobo N, Kamat AM et al. Updated EAU prognostic factor risk groups overestimate the risk of progression in NMIBC treated with BCG. Eur Urol Oncol 2022;5:84–91', u: 'https://doi.org/10.1016/j.euo.2021.11.006' },
      { t: 'Vedder MM et al. Risk prediction scores for recurrence and progression of NMIBC: an international validation in primary tumours. PLoS One 2014;9:e96849', u: 'https://doi.org/10.1371/journal.pone.0096849' },
    ],
  },
  rcc: {
    nome: 'Câncer de rim após nefrectomia — SSIGN (Mayo), UISS (UCLA) e Leibovich',
    origem: 'SSIGN: Frank, Blute, Cheville et al., Mayo Clinic — J Urol 2002 (1.801 nefrectomias radicais por células claras, 1970–1998), reavaliado por Parker et al., Eur Urol 2017 · UISS: Zisman, Pantuck, Belldegrun et al., UCLA — J Clin Oncol 2001/2002; validação internacional Patard et al., J Clin Oncol 2004 (4.202 pacientes) · Leibovich et al., Cancer 2003',
    resumo: 'Com o laudo da nefrectomia (estádio pT/pN/M, tamanho, grau nuclear e necrose) e o estado funcional, calcula o escore SSIGN (0–15) com a sobrevida câncer-específica em 5 anos por escore, o grupo UISS para doença localizada (estádio, grau de Fuhrman e ECOG) com a sobrevida específica em 5 anos da coorte original e da validação multicêntrica e, para carcinoma de células claras sem metástase, o escore de Leibovich com o risco de metástase em 5 e 10 anos — o mesmo usado no fluxo "Pós-nefrectomia" do módulo de rim, que define seguimento e adjuvância.',
    campos: [
      { id: 'hist', l: 'Histologia', tipo: 'seg', opts: [{ v: 'cc', l: 'Células claras' }, { v: 'outro', l: 'Papilífero, cromófobo ou outro', s: 'só o UISS se aplica' }] },
      { id: 'pT', l: 'Estádio patológico (TNM 2017)', tipo: 'seg', opts: [{ v: 'pT1a', l: 'pT1a', s: '≤ 4 cm' }, { v: 'pT1b', l: 'pT1b', s: '4–7 cm' }, { v: 'pT2a', l: 'pT2a', s: '7–10 cm' }, { v: 'pT2b', l: 'pT2b', s: '> 10 cm' }, { v: 'pT3a', l: 'pT3a', s: 'veia renal, gordura perirrenal/sinusal, pelve' }, { v: 'pT3b', l: 'pT3b', s: 'cava infradiafragmática' }, { v: 'pT3c', l: 'pT3c', s: 'cava supradiafragmática' }, { v: 'pT4', l: 'pT4', s: 'além de Gerota ou adrenal ipsilateral' }] },
      { id: 'pN', l: 'Linfonodos', tipo: 'seg', opts: [{ v: 'pN0', l: 'pNx / pN0' }, { v: 'pN1', l: 'pN1' }] },
      { id: 'M', l: 'Metástase à distância', tipo: 'seg', opts: [{ v: 'M0', l: 'M0' }, { v: 'M1', l: 'M1', s: 'sincrônica' }] },
      { id: 'tam', l: 'Maior diâmetro do tumor', tipo: 'num', unit: 'cm', step: 0.1, min: 0.5, max: 40 },
      { id: 'grau', l: 'Grau nuclear (WHO/ISUP ≡ Fuhrman)', tipo: 'seg', opts: [{ v: 1, l: '1' }, { v: 2, l: '2' }, { v: 3, l: '3' }, { v: 4, l: '4' }] },
      { id: 'necrose', l: 'Necrose tumoral coagulativa', tipo: 'seg', opts: [{ v: 'nao', l: 'Ausente' }, { v: 'sim', l: 'Presente' }] },
      { id: 'sarc', l: 'Diferenciação sarcomatoide', tipo: 'seg', opts: [{ v: 'nao', l: 'Não' }, { v: 'sim', l: 'Sim' }] },
      { id: 'ecog', l: 'ECOG', tipo: 'seg', opts: [{ v: 0, l: '0' }, { v: 1, l: '≥ 1' }], help: 'Entra só no UISS.' },
    ],
    compute(v) {
      if (!v.hist || !v.pT || !v.pN || !v.M || !(+v.tam > 0) || !v.grau || !v.necrose || !v.sarc || v.ecog === undefined || v.ecog === '') return null;
      const cc = v.hist === 'cc', pT = v.pT, grau = +v.grau, tam = +v.tam, necr = v.necrose === 'sim', ecog = +v.ecog, n1 = v.pN === 'pN1', m1 = v.M === 'M1';
      const pct = (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
      const rows = []; const avisos = [];
      // ---- SSIGN (ccRCC)
      let ssign = null;
      if (cc) {
        const tPts = pT.startsWith('pT1') ? 0 : pT.startsWith('pT2') ? 1 : pT.startsWith('pT3') ? 2 : 0;
        const nPts = n1 ? 2 : 0, mPts = m1 ? 4 : 0, sPts = tam >= 5 ? 2 : 0, gPts = grau >= 4 ? 3 : grau === 3 ? 1 : 0, necPts = necr ? 2 : 0;
        const score = tPts + nPts + mPts + sPts + gPts + necPts;
        const CSS5 = { 0: 99.4, 1: 99.4, 2: 94.8, 3: 87.8, 4: 79.1, 5: 65.4, 6: 54.0, 7: 41.0, 8: 23.6, 9: 19.6 };
        const css5 = score >= 10 ? 7.4 : CSS5[score];
        const grp = score <= 2 ? 'baixo (0–2)' : score <= 4 ? 'intermediário (3–4)' : score <= 6 ? 'intermediário-alto (5–6)' : score <= 9 ? 'alto (7–9)' : 'muito alto (≥ 10)';
        ssign = { score, css5, grp, det: `SSIGN: estádio ${tPts} + linfonodo ${nPts} + metástase ${mPts} + tamanho ${sPts} + grau ${gPts} + necrose ${necPts} = ${score}/15.` };
        rows.push({ l: `Sobrevida câncer-específica em 5 anos — SSIGN ${score} (Mayo, nefrectomia radical 1970–1998)`, p: css5 / 100, cls: score <= 2 ? 'good' : score <= 6 ? 'warn' : 'bad' });
        if (pT === 'pT4') avisos.push('pT4 recebeu 0 ponto no modelo original (poucos casos; quase todos com linfonodo ou metástase, que já pontuam); interprete como alto risco independentemente da soma.');
      }
      // ---- UISS (localizado)
      let uiss = null;
      if (!n1 && !m1) {
        const T = pT.startsWith('pT1') ? 1 : pT.startsWith('pT2') ? 2 : pT.startsWith('pT3') ? 3 : 4;
        let g;
        if (T === 1 && grau <= 2 && ecog === 0) g = 'baixo';
        else if ((T === 3 && grau >= 2 && ecog >= 1) || T === 4) g = 'alto';
        else g = 'intermediario';
        const dss = { baixo: [91.1, 92], intermediario: [80.4, 67], alto: [54.7, 44] }[g];
        uiss = { g, label: { baixo: 'Baixo risco', intermediario: 'Risco intermediário', alto: 'Alto risco' }[g], dss };
        rows.push({ l: `Sobrevida específica em 5 anos — UISS localizado: ${uiss.label} (UCLA, Zisman 2002)`, p: dss[0] / 100, cls: g === 'baixo' ? 'good' : g === 'intermediario' ? 'warn' : 'bad' });
        rows.push({ l: 'Sobrevida em 5 anos — UISS, validação multicêntrica (Patard 2004, 8 centros)', p: dss[1] / 100, cls: 'neutral' });
      } else {
        avisos.push('UISS para doença N1 ou M1 (grupos metastáticos; sobrevida em 3 anos 37 / 23 / 12% na validação multicêntrica) usa outra tabela de decisão, não reproduzida aqui; para metástase, use o IMDC no fluxo "Metastático" do módulo de rim.');
      }
      // ---- Leibovich (ccRCC, M0)
      let lb = null;
      if (cc && !m1 && typeof Kidney !== 'undefined') {
        lb = Kidney.leibovich2003({ pT, pN: v.pN, grau, tamanho: tam, necrose: v.necrose });
        rows.push({ l: `Metástase em 5 anos — ${lb.label}, ${lb.pts} pontos`, p: lb.met5 / 100, cls: lb.group === 'baixo' ? 'good' : lb.group === 'intermediario' ? 'warn' : 'bad' });
        rows.push({ l: 'Metástase em 10 anos — Leibovich', p: lb.met10 / 100, cls: 'neutral' });
      }
      // ---- KEYNOTE-564
      let k564 = '';
      if (cc && !m1) {
        if (pT === 'pT4' || n1) k564 = 'alto risco (pT4 ou pN1)';
        else if (pT.startsWith('pT3')) k564 = 'intermediário-alto (pT3, qualquer grau)';
        else if (pT.startsWith('pT2') && (grau >= 4 || v.sarc === 'sim')) k564 = 'intermediário-alto (pT2 com grau 4 ou sarcomatoide)';
      }
      if (!cc) avisos.push('SSIGN e Leibovich foram desenvolvidos só para carcinoma de células claras; para papilífero/cromófobo a EAU usa o UISS (ou VENUSS no papilífero) para definir o seguimento.');
      if (v.sarc === 'sim') avisos.push('Diferenciação sarcomatoide: fator adverso independente (não entra no SSIGN/UISS); pontue como grau 4 e considere adjuvância/ensaio.');
      avisos.push('As sobrevidas do SSIGN vêm de 1970–1998: em pacientes contemporâneos (1999–2010) a mortalidade pelo câncer para o mesmo escore foi 47% menor (HR 0,53), e o escore manteve c-index 0,84 (nefrectomia radical) e 0,82 (parcial). Use os valores como ordem de grandeza e para estratificar seguimento, não como prognóstico individual exato.');
      const grpTxt = ssign ? `SSIGN ${ssign.score}/15 — grupo ${ssign.grp}: sobrevida câncer-específica em 5 anos ${pct(ssign.css5)}% na coorte original. ` : '';
      const uissTxt = uiss ? `UISS localizado: ${uiss.label} (5 anos ${pct(uiss.dss[0])}% na UCLA; ${uiss.dss[1]}% na validação em 8 centros). ` : '';
      const lbTxt = lb ? `${lb.label}, ${lb.pts} pontos: metástase em 5/10 anos ${String(lb.met5).replace('.', ',')}% / ${String(lb.met10).replace('.', ',')}%. ` : '';
      const kTxt = k564 ? `Elegível a pembrolizumabe adjuvante pelo KEYNOTE-564 — ${k564} (DFS HR 0,63; OS HR 0,62): discutir 1 ano de pembrolizumabe. ` : (cc && !m1 ? 'Fora dos critérios do KEYNOTE-564 (pembrolizumabe adjuvante): seguimento conforme o risco. ' : '');
      const fu = lb ? (lb.group === 'baixo' ? 'Seguimento EAU baixo risco: TC/US aos 6 meses, depois anual até 5 anos.' : lb.group === 'intermediario' ? 'Seguimento EAU intermediário: TC aos 6 meses, anual até 5 anos e a cada 2 anos depois.' : 'Seguimento EAU alto risco: TC a cada 6 meses por 2–3 anos, anual até 5 anos e a cada 2 anos depois; considerar imagem precoce (3 meses).') : (uiss ? (uiss.g === 'baixo' ? 'Seguimento EAU baixo risco: imagem aos 6 meses e anual até 5 anos.' : uiss.g === 'intermediario' ? 'Seguimento EAU intermediário: TC aos 6 meses, anual até 5 anos.' : 'Seguimento EAU alto risco: TC semestral por 2–3 anos, depois anual.') : '');
      const interp = `${grpTxt}${uissTxt}${lbTxt}${kTxt}${fu}`;
      const detalhe = `${ssign ? ssign.det + ' ' : ''}UISS: T${pT.startsWith('pT1') ? 1 : pT.startsWith('pT2') ? 2 : pT.startsWith('pT3') ? 3 : 4} · grau ${grau} · ECOG ${ecog}. ${lb ? 'Leibovich: ' + (lb.f.join(', ') || 'sem pontos') + '.' : ''}`;
      const headline = ssign ? `SSIGN ${ssign.score} · ${uiss ? 'UISS ' + uiss.label.toLowerCase() : 'N1/M1'}${lb ? ' · Leibovich ' + lb.pts : ''}` : (uiss ? `UISS: ${uiss.label}` : 'Doença N1/M1');
      return { headline, rows, interp, avisos, detalhe };
    },
    notas: [
      'SSIGN (Frank et al., J Urol 2002): pontuação — pT1 0, pT2 1, pT3a/b/c 2, pT4 0 (coeficiente não significativo no modelo original); pNx/pN0 0, pN1–2 2; M0 0, M1 4; tamanho < 5 cm 0, ≥ 5 cm 2; grau nuclear 1–2 0, 3 → 1, 4 → 3; necrose histológica 2. Total 0–15; c-index 0,84. Sobrevida câncer-específica em 5 anos por escore: 0–1 99,4%; 2 94,8%; 3 87,8%; 4 79,1%; 5 65,4%; 6 54,0%; 7 41,0%; 8 23,6%; 9 19,6%; ≥ 10 7,4%. Exemplo publicado: escore 4 → 95,4 / 87,1 / 79,1 / 70,8 / 66,2% em 1 / 3 / 5 / 7 / 10 anos. O TNM de 1997 foi reestadiado para o atual sem mudar os pontos (todos os pT3 valem 2; pN1 e pN2 valem 2).',
      'Parker et al. (Eur Urol 2017; 3.600 pacientes): com 20 anos de seguimento o SSIGN manteve c-index 0,82; em nefrectomia radical contemporânea (1999–2010) 0,84 e em parcial 0,82; mortalidade pelo câncer 47% menor na era contemporânea para o mesmo escore (HR 0,53). Validações externas (Itália, Japão, Áustria) confirmaram a acurácia; o SSIGN foi mais acurado que o UISS para sobrevida específica em células claras (Ficarra, BJU Int 2009).',
      'UISS (Zisman et al., J Clin Oncol 2001 e 2002; 814 pacientes): doença localizada (N0M0) — baixo risco: T1, Fuhrman 1–2, ECOG 0; alto risco: T3 com Fuhrman 2–4 e ECOG ≥ 1, ou qualquer T4; intermediário: os demais. Sobrevida específica em 5 anos 91,1% / 80,4% / 54,7% na UCLA; 92% / 67% / 44% na validação internacional de 4.202 pacientes (Patard et al., J Clin Oncol 2004). Para N1–2 ou M1 existem grupos próprios (sobrevida em 3 anos 37 / 23 / 12%), que não foram reproduzidos. A EAU usa o UISS para o seguimento dos não células claras.',
      'Leibovich (Cancer 2003; 1.671 pacientes M0 de células claras): pT1a 0, pT1b 2, pT2 3, pT3–4 4; pN1 2; ≥ 10 cm 1; grau 3 → 1, grau 4 → 3; necrose 1. Baixo 0–2, intermediário 3–5, alto ≥ 6; sobrevida livre de metástase em 5/10 anos 97,1 / 92,5%, 85,5 / 74,0% e 36,0 / 23,6%. É o escore que a EAU recomenda para o seguimento do células claras.',
      'Adjuvância: KEYNOTE-564 (pembrolizumabe 200 mg a cada 3 semanas por 1 ano) incluiu células claras pT2 grau 4 ou sarcomatoide, pT3–pT4 qualquer grau, pN1 ou M1 ressecado em até 1 ano; DFS HR 0,63 e sobrevida global HR 0,62 (NEJM 2024). Grau WHO/ISUP 2016 equivale ao grau nuclear usado no SSIGN/Leibovich (Mayo).',
    ],
    fontes: [
      { t: 'Frank I, Blute ML, Cheville JC et al. An outcome prediction model for patients with clear cell RCC treated with radical nephrectomy based on tumor stage, size, grade and necrosis: the SSIGN score. J Urol 2002;168:2395–400', u: 'https://doi.org/10.1016/S0022-5347(05)64153-5' },
      { t: 'Parker WP et al. Application of the SSIGN score for clear cell RCC in contemporary patients. Eur Urol 2017;71:665–73', u: 'https://doi.org/10.1016/j.eururo.2016.05.034' },
      { t: 'Zisman A et al. Improved prognostication of RCC using an integrated staging system. J Clin Oncol 2001;19:1649–57', u: 'https://doi.org/10.1200/JCO.2001.19.6.1649' },
      { t: 'Zisman A et al. Risk group assessment and clinical outcome algorithm to predict the natural history of patients with surgically resected RCC. J Clin Oncol 2002;20:4559–66', u: 'https://doi.org/10.1200/JCO.2002.05.111' },
      { t: 'Patard JJ et al. Use of the UCLA integrated staging system to predict survival in RCC: an international multicenter study. J Clin Oncol 2004;22:3316–22', u: 'https://doi.org/10.1200/JCO.2004.09.104' },
      { t: 'Leibovich BC et al. Prediction of progression after radical nephrectomy for patients with clear cell RCC. Cancer 2003;97:1663–71', u: 'https://doi.org/10.1002/cncr.11234' },
      { t: 'Ficarra V et al. The SSIGN score is more accurate than the UISS for predicting cancer-specific survival in clear cell RCC. BJU Int 2009;103:165–70', u: 'https://doi.org/10.1111/j.1464-410X.2008.07901.x' },
      { t: 'Thomas et al. Appraisal and use of a prognostic study from the urological literature (exemplo com o SSIGN). Indian J Urol 2011;27:498–502', u: 'https://doi.org/10.4103/0970-1591.91443' },
    ],
  },
};
const CALC_ORDER = ['pcpt', 'erspc', 'radtke', 'capra', 'lni', 'psadt', 'nmibc', 'rcc'];

// Estadiamento TNM/AJCC 8ª ed. (2017) interativo, com grupos prognósticos; nefrometria R.E.N.A.L. e PADUA; Bosniak 2019.
// Cada item segue o contrato das calculadoras (campos / compute) e é mesclado em CALCS.
const AJCC8 = { t: 'AJCC Cancer Staging Manual, 8ª ed. (Amin MB et al., Springer, 2017) — capítulos de próstata, bexiga, pelve renal/ureter, uretra, rim, testículo, pênis e adrenal', u: 'https://www.facs.org/quality-programs/cancer-programs/american-joint-committee-on-cancer/' };
const EAU_SRC = { t: 'EAU Guidelines 2026 — tabelas TNM reproduzidas em cada diretriz', u: 'https://uroweb.org/guidelines' };
const Y = (v) => v !== undefined && v !== '';
const seg = (id, l, opts, extra) => Object.assign({ id, l, tipo: 'seg', opts, col: 1 }, extra || {});
const o = (v, l, s) => ({ v, l, s });
const NM = (id, l, opts) => seg(id, l, opts);

const STAGING = {
  tnm_prostata: {
    nome: 'TNM próstata — AJCC 8ª ed.',
    origem: 'AJCC 8ª ed. (2017) · grupos prognósticos com PSA e grupo de grau ISUP · grupos de risco NCCN',
    resumo: 'Informe T (clínico ou patológico), N, M, PSA e grupo de grau: o app devolve o grupo prognóstico AJCC 8 (I a IVB) e o grupo de risco NCCN/EAU para doença localizada.',
    campos: [
      seg('tipo', 'Estadiamento', [o('c', 'Clínico (cT)', 'toque retal e imagem'), o('p', 'Patológico (pT)', 'peça de prostatectomia')]),
      seg('ct', 'Tumor primário (cT)', [o('T1a', 'T1a', 'achado incidental ≤ 5% do tecido ressecado'), o('T1b', 'T1b', 'achado incidental > 5% do tecido ressecado'), o('T1c', 'T1c', 'identificado por biópsia por PSA elevado; não palpável'), o('T2a', 'T2a', 'palpável, ≤ metade de um lobo'), o('T2b', 'T2b', 'palpável, > metade de um lobo, unilateral'), o('T2c', 'T2c', 'palpável, ambos os lobos'), o('T3a', 'T3a', 'extensão extraprostática uni ou bilateral'), o('T3b', 'T3b', 'invade vesícula(s) seminal(is)'), o('T4', 'T4', 'fixo ou invade estruturas adjacentes: esfíncter externo, reto, levantador do ânus, parede pélvica')], { show: (v) => v.tipo !== 'p', help: 'Na 8ª ed., o T clínico é definido só pelo toque retal; a RM não muda o cT (mas orienta o tratamento).' }),
      seg('pt', 'Tumor primário (pT)', [o('pT2', 'pT2', 'confinado à próstata (sem subdivisão na 8ª ed.)'), o('pT3a', 'pT3a', 'extensão extraprostática ou invasão microscópica do colo vesical'), o('pT3b', 'pT3b', 'invade vesícula(s) seminal(is)'), o('pT4', 'pT4', 'fixo ou invade reto, levantador do ânus ou parede pélvica')], { show: (v) => v.tipo === 'p' }),
      NM('n', 'Linfonodos regionais (N)', [o('N0', 'N0', 'sem metástase em linfonodo regional'), o('N1', 'N1', 'metástase em linfonodo(s) regional(is) — pélvicos abaixo da bifurcação das ilíacas comuns'), o('NX', 'NX', 'não avaliado')]),
      NM('m', 'Metástase à distância (M)', [o('M0', 'M0'), o('M1a', 'M1a', 'linfonodo(s) não regional(is)'), o('M1b', 'M1b', 'osso'), o('M1c', 'M1c', 'outros sítios, com ou sem osso')]),
      { id: 'psa', l: 'PSA ao diagnóstico', tipo: 'num', unit: 'ng/mL', step: 0.1, min: 0, max: 10000 },
      seg('gg', 'Grupo de grau (ISUP)', [o('1', 'GG 1', 'Gleason ≤ 6'), o('2', 'GG 2', '3+4 = 7'), o('3', 'GG 3', '4+3 = 7'), o('4', 'GG 4', 'Gleason 8'), o('5', 'GG 5', 'Gleason 9–10')], { col: 0 }),
    ],
    compute(v) {
      const T = v.tipo === 'p' ? v.pt : v.ct; if (!Y(T) || !Y(v.n) || !Y(v.m) || !Y(v.gg)) return null;
      const psa = Y(v.psa) ? +v.psa : null; const gg = +v.gg; const avisos = [];
      const t34 = /T3|T4/.test(T), t2bc = /T2[bc]/.test(T), t1_2a = /T1|T2a$|^pT2$/.test(T);
      let st, why;
      if (v.m !== 'M0') { st = 'IVB'; why = 'qualquer T, qualquer N, M1'; }
      else if (v.n === 'N1') { st = 'IVA'; why = 'qualquer T, N1, M0'; }
      else if (gg === 5) { st = 'IIIC'; why = 'qualquer T, N0, M0, grupo de grau 5'; }
      else if (t34) { st = 'IIIB'; why = 'T3–T4, N0, M0, grupo de grau 1–4'; }
      else if (psa === null) { st = null; }
      else if (psa >= 20) { st = 'IIIA'; why = 'T1–T2, N0, M0, PSA ≥ 20, grupo de grau 1–4'; }
      else if (gg >= 3) { st = 'IIC'; why = 'T1–T2, N0, M0, PSA < 20, grupo de grau 3–4'; }
      else if (gg === 2) { st = 'IIB'; why = 'T1–T2, N0, M0, PSA < 20, grupo de grau 2'; }
      else if (psa < 10 && t1_2a) { st = 'I'; why = 'cT1–cT2a ou pT2, N0, M0, PSA < 10, grupo de grau 1'; }
      else { st = 'IIA'; why = t2bc ? 'cT2b–c, N0, M0, PSA < 20, grupo de grau 1' : 'cT1–cT2a ou pT2, N0, M0, PSA 10–< 20, grupo de grau 1'; }
      if (st === null) return { headline: 'Informe o PSA para fechar o grupo prognóstico', rows: [], interp: 'Com T1–T2, N0, M0 e grupo de grau 1–4, o grupo prognóstico depende do PSA (< 10, 10–20 ou ≥ 20).', avisos: [], detalhe: `${T} ${v.n} ${v.m} · GG ${gg}` };
      if (v.n === 'NX') avisos.push('NX: o grupo prognóstico assume N0; se houver suspeita de linfonodo, completar o estadiamento (PSMA-PET, RM ou linfadenectomia).');
      let risco = null;
      if (v.m === 'M0' && v.n !== 'N1' && psa !== null && v.tipo !== 'p') {
        const alto = /T3a/.test(T) || gg >= 4 || psa > 20; const muitoAlto = /T3b|T4/.test(T);
        const inter = t2bc || gg === 2 || gg === 3 || (psa >= 10 && psa <= 20);
        risco = muitoAlto ? 'Muito alto risco (NCCN: cT3b–T4; também se padrão primário 5 ou ≥ 2 fatores de alto risco)' : alto ? 'Alto risco (cT3a, ou GG 4–5, ou PSA > 20)' : inter ? (gg === 1 && psa < 20 ? 'Risco intermediário favorável (1 fator intermediário, GG 1–2, < 50% dos fragmentos)' : gg === 3 ? 'Risco intermediário desfavorável (GG 3)' : 'Risco intermediário (favorável × desfavorável conforme nº de fatores, GG e % de fragmentos)') : 'Baixo risco (cT1–T2a, GG 1, PSA < 10)';
        if (risco.startsWith('Baixo') && psa < 10 && gg === 1 && /T1c/.test(T)) risco += ' — muito baixo risco se < 3 fragmentos positivos, ≤ 50% por fragmento e densidade de PSA < 0,15';
      }
      const tabela = [['T', T], ['N', v.n], ['M', v.m], ['PSA', psa !== null ? psa + ' ng/mL' : '—'], ['Grupo de grau', 'GG ' + gg]];
      if (risco) tabela.push(['Grupo de risco', risco]);
      return { headline: `Estádio ${st} (AJCC 8ª ed.)`, rows: [], tabela, interp: `Critério: ${why}.`, avisos, detalhe: `${v.tipo === 'p' ? 'p' : 'c'}TNM ${T} ${v.n} ${v.m} · PSA ${psa ?? '—'} · GG ${gg} → ${st}` };
    },
    notas: ['Na 8ª ed. o pT2 não é mais subdividido; a invasão microscópica do colo vesical é pT3a; o grupo prognóstico incorpora PSA e grupo de grau (ISUP 2014).', 'Linfonodos regionais são os pélvicos abaixo da bifurcação das ilíacas comuns; acima disso é M1a.', 'O grupo de risco NCCN/EAU mostrado é aproximado: favorável × desfavorável e muito alto risco dependem do número de fatores, padrão primário e porcentagem de fragmentos positivos (ver fluxo de próstata).'],
    fontes: [AJCC8, EAU_SRC, { t: 'NCCN Prostate Cancer v5.2026 — risk groups', u: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1459' }],
  },

  tnm_bexiga: {
    nome: 'TNM bexiga — AJCC 8ª ed.',
    origem: 'AJCC 8ª ed. (2017) · carcinoma urotelial e outros carcinomas da bexiga',
    resumo: 'Informe T, N e M: o app devolve o estádio (0a a IVB) e a leitura clínica (não músculo-invasivo, músculo-invasivo, localmente avançado, metastático).',
    campos: [
      seg('t', 'Tumor primário (T)', [o('Ta', 'Ta', 'carcinoma papilífero não invasivo'), o('Tis', 'Tis', 'carcinoma in situ ("tumor plano")'), o('T1', 'T1', 'invade a lâmina própria (tecido conjuntivo subepitelial)'), o('T2a', 'T2a', 'invade a muscular própria — metade interna'), o('T2b', 'T2b', 'invade a muscular própria — metade externa'), o('T3a', 'T3a', 'invade o tecido perivesical — microscópico'), o('T3b', 'T3b', 'invade o tecido perivesical — macroscópico (massa extravesical)'), o('T4a', 'T4a', 'invade estroma prostático, vesículas seminais, útero ou vagina'), o('T4b', 'T4b', 'invade parede pélvica ou parede abdominal')]),
      NM('n', 'Linfonodos regionais (N)', [o('N0', 'N0'), o('N1', 'N1', 'um linfonodo na pelve verdadeira (perivesical, obturador, ilíaco interno/externo, sacral)'), o('N2', 'N2', 'múltiplos linfonodos na pelve verdadeira'), o('N3', 'N3', 'linfonodo(s) ilíaco(s) comum(ns)')]),
      NM('m', 'Metástase à distância (M)', [o('M0', 'M0'), o('M1a', 'M1a', 'linfonodo(s) além das ilíacas comuns'), o('M1b', 'M1b', 'metástase à distância não linfonodal')]),
    ],
    compute(v) {
      if (!Y(v.t) || !Y(v.n) || !Y(v.m)) return null;
      const t = v.t, n = v.n, m = v.m; let st, why, leitura;
      if (m === 'M1b') { st = 'IVB'; why = 'qualquer T, qualquer N, M1b'; leitura = 'Doença metastática à distância.'; }
      else if (m === 'M1a') { st = 'IVA'; why = 'qualquer T, qualquer N, M1a'; leitura = 'Metástase linfonodal além das ilíacas comuns (retroperitoneal): tratada como doença metastática, com possível papel de tratamento consolidativo em resposta.'; }
      else if (t === 'T4b') { st = 'IVA'; why = 'T4b, qualquer N, M0'; leitura = 'Tumor fixo à parede pélvica/abdominal: irressecável; tratamento sistêmico ± radioterapia.'; }
      else if (n === 'N2' || n === 'N3') { st = 'IIIB'; why = 'T1–T4a, N2–N3, M0'; leitura = 'Doença linfonodal regional múltipla ou ilíaca comum: quimioterapia sistêmica de indução; cistectomia consolidativa em respondedores.'; }
      else if (n === 'N1') { st = 'IIIA'; why = 'T1–T4a, N1, M0'; leitura = 'Linfonodo regional único: quimioterapia baseada em cisplatina + cistectomia com linfadenectomia estendida em candidatos.'; }
      else if (/T3|T4a/.test(t)) { st = 'IIIA'; why = `${t}, N0, M0`; leitura = 'Localmente avançado (extravesical): quimioterapia neoadjuvante à base de cisplatina + cistectomia radical; adjuvância conforme pT/pN e PD-L1/ctDNA.'; }
      else if (/T2/.test(t)) { st = 'II'; why = `${t}, N0, M0`; leitura = 'Músculo-invasivo confinado ao órgão: cistectomia radical com quimioterapia neoadjuvante (cisplatina) ou preservação vesical trimodal em selecionados.'; }
      else if (t === 'T1') { st = 'I'; why = 'T1, N0, M0'; leitura = 'Não músculo-invasivo de alto risco: re-RTU e BCG de indução + manutenção; cistectomia precoce nos de muito alto risco.'; }
      else if (t === 'Tis') { st = '0is'; why = 'Tis, N0, M0'; leitura = 'Carcinoma in situ: BCG de indução + manutenção (alto risco).'; }
      else { st = '0a'; why = 'Ta, N0, M0'; leitura = 'Papilífero não invasivo: estratificar pelo risco EAU 2021 (grau, tamanho, número, recorrência) — ver calculadora NMIBC.'; }
      return { headline: `Estádio ${st} (AJCC 8ª ed.)`, rows: [], tabela: [['T', t], ['N', n], ['M', m]], interp: `Critério: ${why}. ${leitura}`, avisos: [], detalhe: `TNM ${t} ${n} ${m} → ${st}` };
    },
    notas: ['Vale para carcinoma urotelial, escamoso, adenocarcinoma e outros carcinomas da bexiga; não se aplica a tumores do úraco com classificação própria nem a sarcomas.', 'A subdivisão pT2a/pT2b só é possível na peça de cistectomia; na RTU registra-se T2 (ou "pelo menos T2").', 'Divergente de pelve renal/ureter (tabela própria) e da uretra.'],
    fontes: [AJCC8, EAU_SRC],
  },

  tnm_tus: {
    nome: 'TNM pelve renal e ureter — AJCC 8ª ed.',
    origem: 'AJCC 8ª ed. (2017) · carcinoma urotelial do trato urinário superior',
    resumo: 'Informe T, N e M para o carcinoma urotelial de pelve renal ou ureter: o app devolve o estádio (0a a IV).',
    campos: [
      seg('local', 'Localização', [o('pelve', 'Pelve renal'), o('ureter', 'Ureter')], { col: 0 }),
      seg('t', 'Tumor primário (T)', [o('Ta', 'Ta', 'carcinoma papilífero não invasivo'), o('Tis', 'Tis', 'carcinoma in situ'), o('T1', 'T1', 'invade o tecido conjuntivo subepitelial'), o('T2', 'T2', 'invade a muscular'), o('T3', 'T3', 'pelve renal: além da muscular, na gordura peripélvica ou no parênquima renal · ureter: além da muscular, na gordura periureteral'), o('T4', 'T4', 'invade órgãos adjacentes ou, através do rim, a gordura perirrenal')]),
      NM('n', 'Linfonodos regionais (N)', [o('N0', 'N0'), o('N1', 'N1', 'um linfonodo ≤ 2 cm'), o('N2', 'N2', 'um linfonodo > 2 cm ou múltiplos linfonodos')]),
      NM('m', 'Metástase à distância (M)', [o('M0', 'M0'), o('M1', 'M1')]),
    ],
    compute(v) {
      if (!Y(v.t) || !Y(v.n) || !Y(v.m)) return null;
      const t = v.t, n = v.n, m = v.m; let st, why, leitura;
      if (m === 'M1') { st = 'IV'; why = 'qualquer T, qualquer N, M1'; leitura = 'Metastático: tratamento sistêmico (como no carcinoma urotelial avançado).'; }
      else if (n !== 'N0') { st = 'IV'; why = `qualquer T, ${n}, M0`; leitura = 'Linfonodo positivo: quimioterapia sistêmica; nefroureterectomia com linfadenectomia em casos selecionados.'; }
      else if (t === 'T4') { st = 'IV'; why = 'T4, N0, M0'; leitura = 'Invasão de órgão adjacente: multimodal.'; }
      else if (t === 'T3') { st = 'III'; why = 'T3, N0, M0'; leitura = 'Nefroureterectomia radical com linfadenectomia por template e quimioterapia adjuvante à base de platina (POUT); considerar neoadjuvância se função renal limitar a adjuvância.'; }
      else if (t === 'T2') { st = 'II'; why = 'T2, N0, M0'; leitura = 'Nefroureterectomia radical com excisão do cuff vesical e linfadenectomia; instilação intravesical única pós-operatória; quimioterapia adjuvante (pT2–T4 ou N+).'; }
      else if (t === 'T1') { st = 'I'; why = 'T1, N0, M0'; leitura = 'Nefroureterectomia radical; tratamento conservador (ureteroscópico/segmentar) apenas em doença de baixo risco.'; }
      else if (t === 'Tis') { st = '0is'; why = 'Tis, N0, M0'; leitura = 'Carcinoma in situ do trato superior: nefroureterectomia ou BCG percutâneo/ureteral em rim único ou selecionados.'; }
      else { st = '0a'; why = 'Ta, N0, M0'; leitura = 'Papilífero não invasivo: manejo conservador se baixo risco (unifocal, < 2 cm, baixo grau, sem invasão na TC).'; }
      return { headline: `Estádio ${st} (AJCC 8ª ed.)`, rows: [], tabela: [['Local', v.local === 'ureter' ? 'Ureter' : v.local === 'pelve' ? 'Pelve renal' : '—'], ['T', t], ['N', n], ['M', m]], interp: `Critério: ${why}. ${leitura}`, avisos: [], detalhe: `TNM ${t} ${n} ${m} → ${st}` };
    },
    notas: ['Linfonodos regionais: hilares renais, para-aórticos/paracavais e, para o ureter, pélvicos ipsilaterais; lateralidade não afeta o N.', 'A estratificação de risco EAU (baixo × alto) para tratamento conservador usa grau na citologia/biópsia, tamanho, multifocalidade, hidronefrose e invasão na TC.'],
    fontes: [AJCC8, EAU_SRC],
  },

  tnm_uretra: {
    nome: 'TNM uretra — AJCC 8ª ed.',
    origem: 'AJCC 8ª ed. (2017) · carcinoma da uretra masculina (peniana/bulbar), feminina e prostática',
    resumo: 'Informe a localização, T, N e M: o app devolve o estádio (0a a IV).',
    campos: [
      seg('local', 'Localização', [o('pen', 'Uretra peniana/bulbar (homem) ou uretra feminina'), o('pros', 'Uretra prostática')]),
      seg('t', 'Tumor primário (T)', [o('Ta', 'Ta', 'carcinoma papilífero, polipoide ou verrucoso não invasivo'), o('Tis', 'Tis', 'carcinoma in situ'), o('T1', 'T1', 'invade o tecido conjuntivo subepitelial'), o('T2', 'T2', 'invade corpo esponjoso ou músculo periuretral'), o('T3', 'T3', 'invade corpo cavernoso ou parede anterior da vagina'), o('T4', 'T4', 'invade outros órgãos adjacentes (ex.: bexiga)')], { show: (v) => v.local !== 'pros' }),
      seg('tp', 'Tumor primário (T) — uretra prostática', [o('Tis', 'Tis', 'carcinoma in situ da uretra prostática ou dos ductos periuretrais/prostáticos sem invasão estromal'), o('T1', 'T1', 'invade o tecido conjuntivo subepitelial da uretra'), o('T2', 'T2', 'invade o estroma prostático'), o('T3', 'T3', 'invade gordura periprostática'), o('T4', 'T4', 'invade órgãos adjacentes (bexiga, reto)')], { show: (v) => v.local === 'pros' }),
      NM('n', 'Linfonodos regionais (N)', [o('N0', 'N0'), o('N1', 'N1', 'um linfonodo regional (inguinal ou pélvico verdadeiro)'), o('N2', 'N2', 'múltiplos linfonodos regionais')]),
      NM('m', 'Metástase à distância (M)', [o('M0', 'M0'), o('M1', 'M1')]),
    ],
    compute(v) {
      const t = v.local === 'pros' ? v.tp : v.t; if (!Y(v.local) || !Y(t) || !Y(v.n) || !Y(v.m)) return null;
      let st, why;
      if (v.m === 'M1') { st = 'IV'; why = 'qualquer T, qualquer N, M1'; }
      else if (v.n === 'N2') { st = 'IV'; why = 'qualquer T, N2, M0'; }
      else if (t === 'T4') { st = 'IV'; why = 'T4, qualquer N, M0'; }
      else if (t === 'T3' || v.n === 'N1') { st = 'III'; why = t === 'T3' ? 'T3, N0–N1, M0' : `${t}, N1, M0`; }
      else if (t === 'T2') { st = 'II'; why = 'T2, N0, M0'; }
      else if (t === 'T1') { st = 'I'; why = 'T1, N0, M0'; }
      else if (t === 'Tis') { st = '0is'; why = 'Tis, N0, M0'; }
      else { st = '0a'; why = 'Ta, N0, M0'; }
      return { headline: `Estádio ${st} (AJCC 8ª ed.)`, rows: [], tabela: [['Local', v.local === 'pros' ? 'Uretra prostática' : 'Uretra peniana/bulbar ou feminina'], ['T', t], ['N', v.n], ['M', v.m]], interp: `Critério: ${why}.`, avisos: [], detalhe: `TNM ${t} ${v.n} ${v.m} → ${st}` };
    },
    notas: ['Linfonodos regionais: inguinais e pélvicos (obturador, ilíacos interno/externo); os para-aórticos são M1.', 'Tumor da uretra distal masculina: histologia escamosa predomina; uretra prostática: urotelial. O tratamento segue EAU Urethral Carcinoma.'],
    fontes: [AJCC8, EAU_SRC],
  },

  tnm_rim: {
    nome: 'TNM rim — AJCC 8ª ed.',
    origem: 'AJCC 8ª ed. (2017) · carcinoma de células renais',
    resumo: 'Informe T (com tamanho e extensão venosa/perirrenal), N e M: o app devolve o estádio (I a IV).',
    campos: [
      seg('t', 'Tumor primário (T)', [o('T1a', 'T1a', '≤ 4 cm, limitado ao rim'), o('T1b', 'T1b', '> 4 a 7 cm, limitado ao rim'), o('T2a', 'T2a', '> 7 a 10 cm, limitado ao rim'), o('T2b', 'T2b', '> 10 cm, limitado ao rim'), o('T3a', 'T3a', 'invade veia renal ou seus ramos segmentares, ou o sistema pielocalicial, ou a gordura perirrenal/do seio renal, sem ultrapassar a fáscia de Gerota'), o('T3b', 'T3b', 'trombo na veia cava abaixo do diafragma'), o('T3c', 'T3c', 'trombo na veia cava acima do diafragma ou invasão da parede da cava'), o('T4', 'T4', 'invade além da fáscia de Gerota, inclusive a adrenal ipsilateral por contiguidade')]),
      NM('n', 'Linfonodos regionais (N)', [o('N0', 'N0'), o('N1', 'N1', 'metástase em linfonodo(s) regional(is) — hilar, para-aórtico, paracaval')]),
      NM('m', 'Metástase à distância (M)', [o('M0', 'M0'), o('M1', 'M1')]),
    ],
    compute(v) {
      if (!Y(v.t) || !Y(v.n) || !Y(v.m)) return null;
      const t = v.t; let st, why, leitura;
      if (v.m === 'M1') { st = 'IV'; why = 'qualquer T, qualquer N, M1'; leitura = 'Metastático: estratificar por IMDC e tratar com imunoterapia-based (ver fluxo de rim metastático); nefrectomia citorredutora em selecionados.'; }
      else if (t === 'T4') { st = 'IV'; why = 'T4, qualquer N, M0'; leitura = 'Localmente avançado além de Gerota: nefrectomia radical ampliada quando ressecável; adjuvância com pembrolizumabe (KEYNOTE-564) em células claras.'; }
      else if (v.n === 'N1') { st = 'III'; why = `${t}, N1, M0`; leitura = 'Linfonodo positivo: nefrectomia com linfadenectomia; alto risco de recidiva — adjuvância com pembrolizumabe (células claras).'; }
      else if (/T3/.test(t)) { st = 'III'; why = `${t}, N0, M0`; leitura = 'pT3: nefrectomia radical (trombectomia se T3b–c); vigilância intensificada; pembrolizumabe adjuvante se risco intermediário-alto/alto (KEYNOTE-564).'; }
      else if (/T2/.test(t)) { st = 'II'; why = `${t}, N0, M0`; leitura = 'Nefrectomia radical (parcial se tecnicamente viável); adjuvância se grau 4 ou sarcomatoide (critério KEYNOTE-564).'; }
      else { st = 'I'; why = `${t}, N0, M0`; leitura = t === 'T1a' ? 'Massa renal pequena: nefrectomia parcial preferencial; vigilância ativa ou ablação em idosos/comórbidos; biópsia quando mudar a conduta.' : 'Nefrectomia parcial quando viável (nefrometria), senão radical.'; }
      const adj = (v.m === 'M0') && (v.n === 'N1' || t === 'T4' || /T3/.test(t) || /T2/.test(t));
      return { headline: `Estádio ${st} (AJCC 8ª ed.)`, rows: [], tabela: [['T', t], ['N', v.n], ['M', v.m], ['Risco pós-nefrectomia', adj ? 'Avaliar SSIGN/UISS/Leibovich (calculadora de rim) e elegibilidade a adjuvância' : 'Baixo (estádio I): vigilância conforme EAU']], interp: `Critério: ${why}. ${leitura}`, avisos: [], detalhe: `TNM ${t} ${v.n} ${v.m} → ${st}` };
    },
    notas: ['Na 8ª ed., invasão do sistema pielocalicial passou a ser T3a e a adrenal ipsilateral invadida por contiguidade é T4 (a adrenal não contígua é M1).', 'A classificação não substitui os modelos prognósticos pós-operatórios (SSIGN, UISS, Leibovich) disponíveis na calculadora de rim.'],
    fontes: [AJCC8, EAU_SRC],
  },

  tnm_testiculo: {
    nome: 'TNM testículo — AJCC 8ª ed.',
    origem: 'AJCC 8ª ed. (2017) · tumores de células germinativas, com marcadores séricos (S)',
    resumo: 'Informe pT, N, M e a categoria de marcadores (S): o app devolve o estádio (0 a IIIC). Para doença metastática, use também o prognóstico IGCCCG (fluxo de testículo).',
    campos: [
      seg('hist', 'Histologia', [o('sem', 'Seminoma puro'), o('nsem', 'Não seminoma / misto')], { col: 0 }),
      seg('pt', 'Tumor primário (pT)', [o('pTis', 'pTis', 'neoplasia de células germinativas in situ (GCNIS)'), o('pT1', 'pT1', 'limitado ao testículo (pode invadir a albugínea), sem invasão linfovascular'), o('pT1a', 'pT1a', 'seminoma puro < 3 cm, sem invasão linfovascular'), o('pT1b', 'pT1b', 'seminoma puro ≥ 3 cm, sem invasão linfovascular'), o('pT2', 'pT2', 'invasão linfovascular, ou invade tecido mole hilar, epidídimo ou atravessa a camada mesotelial visceral da albugínea'), o('pT3', 'pT3', 'invade o cordão espermático (não apenas por via linfovascular)'), o('pT4', 'pT4', 'invade o escroto')]),
      NM('n', 'Linfonodos regionais (N) — retroperitoneais', [o('N0', 'N0'), o('N1', 'N1', 'massa linfonodal ≤ 2 cm, ou ≤ 5 linfonodos nenhum > 2 cm'), o('N2', 'N2', 'massa > 2 a 5 cm, ou > 5 linfonodos nenhum > 5 cm, ou extensão extranodal'), o('N3', 'N3', 'massa linfonodal > 5 cm')]),
      NM('m', 'Metástase à distância (M)', [o('M0', 'M0'), o('M1a', 'M1a', 'linfonodo não regional ou pulmão'), o('M1b', 'M1b', 'outros sítios (fígado, osso, cérebro…)')]),
      seg('s', 'Marcadores séricos pós-orquiectomia (S)', [o('S0', 'S0', 'LDH, hCG e AFP normais'), o('S1', 'S1', 'LDH < 1,5 × LSN e hCG < 5.000 mUI/mL e AFP < 1.000 ng/mL'), o('S2', 'S2', 'LDH 1,5–10 × LSN ou hCG 5.000–50.000 ou AFP 1.000–10.000'), o('S3', 'S3', 'LDH > 10 × LSN ou hCG > 50.000 ou AFP > 10.000'), o('SX', 'SX', 'não disponíveis ou não realizados')], { help: 'Usar o nadir após a orquiectomia (meia-vida: AFP 5–7 dias; hCG 1–3 dias). Qualquer marcador elevado define a categoria mais alta.' }),
    ],
    compute(v) {
      if (!Y(v.pt) || !Y(v.n) || !Y(v.m) || !Y(v.s)) return null;
      const n = v.n, m = v.m, s = v.s; let st, why; const avisos = [];
      if (m === 'M1b') { st = 'IIIC'; why = 'M1b, qualquer S'; }
      else if (m === 'M1a') { st = s === 'S3' ? 'IIIC' : s === 'S2' ? 'IIIB' : s === 'SX' ? 'III' : 'IIIA'; why = `M1a, ${s}`; }
      else if (n !== 'N0') { if (s === 'S3') { st = 'IIIC'; why = `${n}, M0, S3`; } else if (s === 'S2') { st = 'IIIB'; why = `${n}, M0, S2`; } else if (s === 'SX') { st = 'II'; why = `${n}, M0, SX`; } else { st = n === 'N1' ? 'IIA' : n === 'N2' ? 'IIB' : 'IIC'; why = `${n}, M0, S0–S1`; } }
      else if (v.pt === 'pTis') { st = '0'; why = 'pTis, N0, M0, S0'; }
      else if (s === 'SX') { st = 'I'; why = 'pT1–4, N0, M0, SX'; }
      else if (s !== 'S0') { st = 'IS'; why = `pT1–4, N0, M0, ${s} — marcadores persistentemente elevados após a orquiectomia`; avisos.push('Estádio IS: marcadores elevados sem doença visível — tratar como doença disseminada (quimioterapia conforme IGCCCG), não como estádio I.'); }
      else { st = /pT1/.test(v.pt) ? 'IA' : 'IB'; why = `${v.pt}, N0, M0, S0`; }
      if (v.hist === 'sem' && /pT1[ab]/.test(v.pt) === false && v.pt === 'pT1') avisos.push('Seminoma puro: na 8ª ed. o pT1 é subdividido em pT1a (< 3 cm) e pT1b (≥ 3 cm).');
      if (v.hist === 'nsem' && /pT1[ab]/.test(v.pt)) avisos.push('As subcategorias pT1a/pT1b só existem para seminoma puro; em não seminoma usar pT1.');
      const risco = st.startsWith('I') && !st.startsWith('II') && !st.startsWith('III') && st !== 'IS' ? (v.hist === 'sem' ? (/pT1b|pT2|pT3|pT4/.test(v.pt) ? 'Seminoma estádio I: fatores de risco (tamanho ≥ 3–4 cm, invasão da rete testis) orientam vigilância × carboplatina' : 'Seminoma estádio I de baixo risco: vigilância preferencial') : (/pT2|pT3|pT4/.test(v.pt) ? 'Não seminoma estádio I com invasão linfovascular (pT2+): alto risco (~50% de recidiva) — BEP ×1 ou vigilância informada' : 'Não seminoma estádio I sem invasão linfovascular: baixo risco — vigilância preferencial')) : null;
      const tabela = [['Histologia', v.hist === 'sem' ? 'Seminoma' : v.hist === 'nsem' ? 'Não seminoma' : '—'], ['pT', v.pt], ['N', n], ['M', m], ['S', s]]; if (risco) tabela.push(['Leitura', risco]);
      return { headline: `Estádio ${st} (AJCC 8ª ed.)`, rows: [], tabela, interp: `Critério: ${why}.${st.startsWith('III') || st.startsWith('II') ? ' Em doença metastática, o prognóstico e a escolha do esquema seguem a classificação IGCCCG (bom, intermediário, pobre), não o estádio.' : ''}`, avisos, detalhe: `pTNM ${v.pt} ${n} ${m} ${s} → ${st}` };
    },
    notas: ['Linfonodos regionais: retroperitoneais (interaortocavais, paracavais, para-aórticos, pré-aórticos, retrocavais, retroaórticos); após cirurgia escrotal/inguinal, os inguinais e pélvicos ipsilaterais também são regionais.', 'O estádio IS exige marcadores persistentemente elevados após a orquiectomia (não a elevação pré-operatória).', 'A 8ª ed. acrescentou: invasão do tecido mole hilar e do epidídimo como pT2; invasão descontínua do cordão por via vascular é M1, não pT3.'],
    fontes: [AJCC8, EAU_SRC, { t: 'IGCCCG Update Consortium — J Clin Oncol 2021', u: 'https://pubmed.ncbi.nlm.nih.gov/33822655/' }],
  },

  tnm_penis: {
    nome: 'TNM pênis — AJCC 8ª ed.',
    origem: 'AJCC 8ª ed. (2017) · carcinoma escamoso do pênis',
    resumo: 'Informe T, N (clínico ou patológico) e M: o app devolve o estádio (0is a IV). O T1 é subdividido pelo grau e pela invasão linfovascular/perineural.',
    campos: [
      seg('t', 'Tumor primário (T)', [o('Ta', 'Ta', 'carcinoma escamoso localizado não invasivo (verrucoso)'), o('Tis', 'Tis', 'carcinoma in situ (PeIN)'), o('T1a', 'T1a', 'invade tecido conjuntivo subepitelial sem invasão linfovascular/perineural e não pouco diferenciado'), o('T1b', 'T1b', 'invade tecido conjuntivo subepitelial com invasão linfovascular ou perineural, ou pouco diferenciado (G3) / sarcomatoide'), o('T2', 'T2', 'invade corpo esponjoso (glande ou ventral), com ou sem invasão uretral'), o('T3', 'T3', 'invade corpo cavernoso (inclusive albugínea), com ou sem invasão uretral'), o('T4', 'T4', 'invade estruturas adjacentes (escroto, próstata, osso púbico)')]),
      seg('ntipo', 'Linfonodos: avaliação', [o('c', 'Clínica (cN)', 'exame físico/imagem'), o('p', 'Patológica (pN)', 'linfadenectomia ou biópsia')], { col: 0 }),
      NM('cn', 'cN', [o('N0', 'cN0', 'sem linfonodo inguinal palpável ou visível'), o('N1', 'cN1', 'linfonodo inguinal unilateral, móvel, palpável'), o('N2', 'cN2', 'linfonodos inguinais múltiplos ou bilaterais, móveis'), o('N3', 'cN3', 'massa inguinal fixa ou linfonodo pélvico, uni ou bilateral')]),
      NM('pn', 'pN', [o('N0', 'pN0', 'sem metástase linfonodal'), o('N1', 'pN1', '≤ 2 linfonodos inguinais unilaterais, sem extensão extranodal'), o('N2', 'pN2', '≥ 3 linfonodos inguinais unilaterais ou bilaterais'), o('N3', 'pN3', 'extensão extranodal ou linfonodo pélvico')]),
      NM('m', 'Metástase à distância (M)', [o('M0', 'M0'), o('M1', 'M1')]),
    ].map((f) => f.id === 'cn' ? Object.assign(f, { show: (v) => v.ntipo !== 'p' }) : f.id === 'pn' ? Object.assign(f, { show: (v) => v.ntipo === 'p' }) : f),
    compute(v) {
      const n = v.ntipo === 'p' ? v.pn : v.cn; if (!Y(v.t) || !Y(n) || !Y(v.m)) return null;
      const t = v.t; let st, why, leitura;
      if (v.m === 'M1') { st = 'IV'; why = 'qualquer T, qualquer N, M1'; leitura = 'Metastático: quimioterapia à base de platina (TIP); ensaio clínico.'; }
      else if (n === 'N3') { st = 'IV'; why = 'qualquer T, N3, M0'; leitura = 'Massa inguinal fixa, extensão extranodal ou linfonodo pélvico: quimioterapia neoadjuvante (TIP) seguida de linfadenectomia inguinal + pélvica em respondedores; radioquimioterapia como alternativa.'; }
      else if (t === 'T4') { st = 'IV'; why = 'T4, qualquer N, M0'; leitura = 'Invasão de estruturas adjacentes: neoadjuvância e cirurgia ampliada quando viável.'; }
      else if (n === 'N2') { st = 'IIIB'; why = 'T1–T3, N2, M0'; leitura = 'Linfadenectomia inguinal radical bilateral; linfadenectomia pélvica se ≥ 2 linfonodos inguinais positivos ou extensão extranodal; quimioterapia adjuvante (pN2–3).'; }
      else if (n === 'N1') { st = 'IIIA'; why = 'T1–T3, N1, M0'; leitura = 'Linfadenectomia inguinal radical do lado acometido (modificada contralateral se cN0 com risco).'; }
      else if (t === 'T3') { st = 'IIB'; why = 'T3, N0, M0'; leitura = 'Amputação parcial/total com margem; estadiamento inguinal invasivo (linfonodo sentinela ou linfadenectomia modificada) se cN0, pois o risco linfonodal é alto.'; }
      else if (t === 'T2' || t === 'T1b') { st = 'IIA'; why = `${t}, N0, M0`; leitura = 'Cirurgia conservadora quando possível (glandectomia, amputação parcial); cN0: estadiamento inguinal invasivo (sentinela/linfadenectomia modificada).'; }
      else if (t === 'T1a') { st = 'I'; why = 'T1a, N0, M0'; leitura = 'Baixo risco linfonodal: cirurgia conservadora; cN0: vigilância inguinal (ou sentinela se não aderente).'; }
      else if (t === 'Tis') { st = '0is'; why = 'Tis, N0, M0'; leitura = 'PeIN: tratamento tópico (5-FU, imiquimode), laser ou resurfacing da glande.'; }
      else { st = '0a'; why = 'Ta, N0, M0'; leitura = 'Carcinoma verrucoso: excisão local/laser; praticamente sem potencial metastático.'; }
      return { headline: `Estádio ${st} (AJCC 8ª ed.)`, rows: [], tabela: [['T', t], ['N', `${v.ntipo === 'p' ? 'p' : 'c'}${n}`], ['M', v.m]], interp: `Critério: ${why}. ${leitura}`, avisos: [], detalhe: `TNM ${t} ${v.ntipo === 'p' ? 'p' : 'c'}${n} ${v.m} → ${st}` };
    },
    notas: ['Na 8ª ed., T2 passou a ser invasão do corpo esponjoso e T3 do corpo cavernoso (invertido em relação à 7ª ed.); a invasão uretral deixou de definir T.', 'T1b inclui grau 3, subtipos sarcomatoide/basaloide e invasão linfovascular ou perineural.', 'pN3: qualquer extensão extranodal ou linfonodo pélvico; cN3: massa fixa ou linfonodo pélvico na imagem.'],
    fontes: [AJCC8, EAU_SRC],
  },

  tnm_acc: {
    nome: 'TNM carcinoma adrenocortical — AJCC 8ª ed. / ENSAT',
    origem: 'AJCC 8ª ed. (2017), idêntico ao ENSAT 2008 · carcinoma do córtex adrenal',
    resumo: 'Informe T (tamanho e invasão local), N e M: o app devolve o estádio ENSAT/AJCC (I a IV).',
    campos: [
      seg('t', 'Tumor primário (T)', [o('T1', 'T1', '≤ 5 cm, sem invasão extra-adrenal'), o('T2', 'T2', '> 5 cm, sem invasão extra-adrenal'), o('T3', 'T3', 'qualquer tamanho, com invasão local (gordura periadrenal), sem invadir órgãos adjacentes'), o('T4', 'T4', 'qualquer tamanho, invade órgãos adjacentes (rim, diafragma, pâncreas, baço, fígado) ou grandes vasos (veia renal, cava)')]),
      NM('n', 'Linfonodos regionais (N)', [o('N0', 'N0'), o('N1', 'N1', 'metástase em linfonodo regional (hilar, para-aórtico, paracaval)')]),
      NM('m', 'Metástase à distância (M)', [o('M0', 'M0'), o('M1', 'M1')]),
    ],
    compute(v) {
      if (!Y(v.t) || !Y(v.n) || !Y(v.m)) return null;
      let st, why, leitura;
      if (v.m === 'M1') { st = 'IV'; why = 'qualquer T, qualquer N, M1'; leitura = 'Metastático: mitotano ± EDP; cirurgia só se ressecção completa de todas as lesões for possível.'; }
      else if (v.n === 'N1' || /T3|T4/.test(v.t)) { st = 'III'; why = v.n === 'N1' ? `${v.t}, N1, M0` : `${v.t}, N0, M0`; leitura = 'Localmente avançado: adrenalectomia aberta em bloco com linfadenectomia locorregional em centro de referência; mitotano adjuvante (alto risco: Ki-67 > 10%, R1, ruptura).'; }
      else if (v.t === 'T2') { st = 'II'; why = 'T2, N0, M0'; leitura = 'Adrenalectomia R0 (aberta preferida se > 6 cm ou suspeita de invasão); mitotano adjuvante se Ki-67 > 10% ou R1 (ADIUVO: observação em baixo risco).'; }
      else { st = 'I'; why = 'T1, N0, M0'; leitura = 'Adrenalectomia R0; vigilância se Ki-67 ≤ 10%, R0 e sem ruptura (baixo risco).'; }
      return { headline: `Estádio ${st} (ENSAT / AJCC 8ª ed.)`, rows: [], tabela: [['T', v.t], ['N', v.n], ['M', v.m]], interp: `Critério: ${why}. ${leitura}`, avisos: [], detalhe: `TNM ${v.t} ${v.n} ${v.m} → ${st}` };
    },
    notas: ['Estádio III inclui invasão de veia renal/cava e de órgãos adjacentes (T4 sem M1) — classificação ENSAT adotada integralmente pela AJCC 8.', 'Fatores prognósticos além do estádio: Ki-67, status de margem (R), ruptura tumoral, status hormonal (cortisol) — ver fluxo de carcinoma adrenocortical.'],
    fontes: [AJCC8, { t: 'ESE/ENSAT Clinical Practice Guidelines on ACC — Eur J Endocrinol 2018', u: 'https://pubmed.ncbi.nlm.nih.gov/30299884/' }],
  },

  tnm_ppgl: {
    nome: 'TNM feocromocitoma / paraganglioma — AJCC 8ª ed.',
    origem: 'AJCC 8ª ed. (2017) · primeira classificação TNM para feocromocitoma e paraganglioma',
    resumo: 'Informe T, N e M: o app devolve o estádio (I a IV). Não existe critério histológico de malignidade — metástase define doença metastática.',
    campos: [
      seg('t', 'Tumor primário (T)', [o('T1', 'T1', 'feocromocitoma < 5 cm, limitado à adrenal, sem invasão extra-adrenal'), o('T2', 'T2', 'feocromocitoma ≥ 5 cm limitado à adrenal, ou paraganglioma simpático funcionante de qualquer tamanho, sem invasão extra-adrenal'), o('T3', 'T3', 'qualquer tamanho, com invasão dos tecidos adjacentes (fígado, pâncreas, baço, rim)')]),
      NM('n', 'Linfonodos regionais (N)', [o('N0', 'N0'), o('N1', 'N1', 'metástase em linfonodo regional')]),
      NM('m', 'Metástase à distância (M)', [o('M0', 'M0'), o('M1a', 'M1a', 'somente osso'), o('M1b', 'M1b', 'somente linfonodos distantes, fígado ou pulmão'), o('M1c', 'M1c', 'osso + múltiplos outros sítios')]),
    ],
    compute(v) {
      if (!Y(v.t) || !Y(v.n) || !Y(v.m)) return null;
      let st, why, leitura;
      if (v.m !== 'M0') { st = 'IV'; why = `qualquer T, qualquer N, ${v.m}`; leitura = 'Feocromocitoma/paraganglioma metastático: controle hormonal (alfabloqueio), cirurgia citorredutora, terapia com radionuclídeo (131I-MIBG ou 177Lu-DOTATATE), TKI ou quimioterapia (CVD) conforme carga e cinética.'; }
      else if (v.n === 'N1' || v.t === 'T3') { st = 'III'; why = v.n === 'N1' ? `${v.t}, N1, M0` : 'T3, N0, M0'; leitura = 'Invasão local ou linfonodo: ressecção em bloco com preparo alfa-bloqueador; vigilância prolongada (metanefrinas anuais, vida toda se síndrome hereditária).'; }
      else if (v.t === 'T2') { st = 'II'; why = 'T2, N0, M0'; leitura = 'Adrenalectomia (laparoscópica se < 6 cm, sem sinais de invasão) após preparo; teste genético germinativo recomendado a todos.'; }
      else { st = 'I'; why = 'T1, N0, M0'; leitura = 'Adrenalectomia laparoscópica após alfabloqueio; seguimento com metanefrinas por ≥ 10 anos.'; }
      return { headline: `Estádio ${st} (AJCC 8ª ed.)`, rows: [], tabela: [['T', v.t], ['N', v.n], ['M', v.m]], interp: `Critério: ${why}. ${leitura}`, avisos: ['O escore PASS/GAPP e a genética (SDHB) estimam risco de metástase; não há "feocromocitoma benigno" — a OMS 2022 usa "metastático × não metastático".'], detalhe: `TNM ${v.t} ${v.n} ${v.m} → ${st}` };
    },
    notas: ['Paragangliomas parassimpáticos (cabeça e pescoço) não são classificados por esta tabela.', 'Metástase = tumor em sítio onde não há tecido cromafim (osso, fígado, pulmão, linfonodo).'],
    fontes: [AJCC8, { t: 'Endocrine Society — Pheochromocytoma and Paraganglioma guideline 2025', u: 'https://academic.oup.com/jcem' }],
  },

  renal_score: {
    nome: 'Nefrometria R.E.N.A.L.',
    origem: 'Kutikov & Uzzo — J Urol 2009 · escore de complexidade anatômica da massa renal',
    resumo: 'Cinco componentes anatômicos (R, E, N, A, L) e o sufixo hilar (h) somam 4 a 12 pontos: baixa (4–6), moderada (7–9) ou alta complexidade (10–12), que se correlaciona com dificuldade da nefrectomia parcial, tempo de isquemia e complicações.',
    campos: [
      seg('r', 'R — Raio (diâmetro máximo)', [o('1', '≤ 4 cm', '1 ponto'), o('2', '> 4 a 7 cm', '2 pontos'), o('3', '> 7 cm', '3 pontos')], { col: 0 }),
      seg('e', 'E — Exofítico / endofítico', [o('1', '≥ 50% exofítico', '1 ponto'), o('2', '< 50% exofítico', '2 pontos'), o('3', 'Totalmente endofítico', '3 pontos')], { col: 0 }),
      seg('n', 'N — Proximidade do sistema coletor ou seio renal', [o('1', '≥ 7 mm', '1 ponto'), o('2', '> 4 a < 7 mm', '2 pontos'), o('3', '≤ 4 mm', '3 pontos')], { col: 0 }),
      seg('a', 'A — Face anterior / posterior', [o('a', 'Anterior', 'sufixo a'), o('p', 'Posterior', 'sufixo p'), o('x', 'Indeterminada', 'sufixo x')], { col: 0, help: 'Não pontua; entra como sufixo (ex.: 7p).' }),
      seg('l', 'L — Localização em relação às linhas polares', [o('1', 'Totalmente acima da linha polar superior ou abaixo da inferior', '1 ponto'), o('2', 'Cruza uma linha polar', '2 pontos'), o('3', '> 50% da massa cruza a linha polar, ou cruza a linha média axial do rim, ou está totalmente entre as linhas polares', '3 pontos')]),
      seg('h', 'Hilar (h)', [o('0', 'Não'), o('1', 'Sim', 'toca a artéria ou a veia renal principal')], { col: 0 }),
    ],
    compute(v) {
      if (!Y(v.r) || !Y(v.e) || !Y(v.n) || !Y(v.l)) return null;
      const tot = +v.r + +v.e + +v.n + +v.l; const suf = (v.a || 'x') + (v.h === '1' ? 'h' : '');
      const cls = tot <= 6 ? 'Baixa complexidade (4–6)' : tot <= 9 ? 'Moderada complexidade (7–9)' : 'Alta complexidade (10–12)';
      const leitura = tot <= 6 ? 'Nefrectomia parcial (minimamente invasiva) com baixa taxa de complicações; candidata a ablação ou vigilância se pequena.' : tot <= 9 ? 'Nefrectomia parcial factível por cirurgião experiente (robótica preferencial); maior tempo de isquemia e risco de fístula urinária.' : 'Alta probabilidade de abertura do coletor e de conversão/nefrectomia radical; planejar com imagem 3D, considerar centro de referência.';
      return { headline: `R.E.N.A.L. ${tot}${suf} — ${cls}`, rows: [], tabela: [['R', v.r + ' pt'], ['E', v.e + ' pt'], ['N', v.n + ' pt'], ['A', v.a === 'a' ? 'anterior' : v.a === 'p' ? 'posterior' : 'x'], ['L', v.l + ' pt'], ['h', v.h === '1' ? 'hilar' : 'não hilar']], interp: leitura, avisos: [], detalhe: `Soma R+E+N+L = ${tot}; sufixo ${suf}` };
    },
    notas: ['O sufixo "h" não soma pontos, mas tumores hilares têm maior risco de sangramento e de nefrectomia radical.', 'Concordância interobservador boa (κ ≈ 0,8 para o total); as maiores discordâncias estão em N e L.'],
    fontes: [{ t: 'Kutikov A, Uzzo RG. The R.E.N.A.L. nephrometry score. J Urol 2009;182:844-53', u: 'https://pubmed.ncbi.nlm.nih.gov/19616235/' }, EAU_SRC],
  },

  padua: {
    nome: 'Escore PADUA',
    origem: 'Ficarra et al. — Eur Urol 2009 · Preoperative Aspects and Dimensions Used for an Anatomical classification',
    resumo: 'Seis componentes somam 6 a 14 pontos: baixo (6–7), intermediário (8–9) ou alto risco (≥ 10) de complicações na nefrectomia parcial.',
    campos: [
      seg('polar', 'Localização longitudinal (polar)', [o('1', 'Polo superior ou inferior', '1 ponto'), o('2', 'Terço médio', '2 pontos')], { col: 0 }),
      seg('exo', 'Taxa exofítica', [o('1', '≥ 50% exofítico', '1 ponto'), o('2', '< 50% exofítico', '2 pontos'), o('3', 'Endofítico', '3 pontos')], { col: 0 }),
      seg('rim', 'Borda renal', [o('1', 'Lateral', '1 ponto'), o('2', 'Medial', '2 pontos')], { col: 0 }),
      seg('seio', 'Envolvimento do seio renal', [o('1', 'Não', '1 ponto'), o('2', 'Sim', '2 pontos')], { col: 0 }),
      seg('col', 'Envolvimento do sistema coletor', [o('1', 'Não', '1 ponto'), o('2', 'Sim', '2 pontos')], { col: 0 }),
      seg('tam', 'Tamanho máximo', [o('1', '≤ 4 cm', '1 ponto'), o('2', '4,1 a 7 cm', '2 pontos'), o('3', '> 7 cm', '3 pontos')], { col: 0 }),
      seg('face', 'Face', [o('a', 'Anterior'), o('p', 'Posterior')], { col: 0, help: 'Não pontua.' }),
    ],
    compute(v) {
      const ks = ['polar', 'exo', 'rim', 'seio', 'col', 'tam']; if (!ks.every((k) => Y(v[k]))) return null;
      const tot = ks.reduce((s, k) => s + +v[k], 0);
      const cls = tot <= 7 ? 'Baixo risco (6–7)' : tot <= 9 ? 'Risco intermediário (8–9)' : 'Alto risco (≥ 10)';
      const leitura = tot <= 7 ? 'Nefrectomia parcial com baixo risco de complicações; isquemia curta.' : tot <= 9 ? 'Risco intermediário: planejar clampeamento seletivo e reconstrução do coletor; robótica preferencial.' : 'Alto risco de complicações (fístula, sangramento, conversão); discutir nefrectomia radical × parcial em centro de referência.';
      return { headline: `PADUA ${tot}${v.face ? v.face : ''} — ${cls}`, rows: [], tabela: [['Polar', v.polar + ' pt'], ['Exofítico', v.exo + ' pt'], ['Borda', v.rim + ' pt'], ['Seio', v.seio + ' pt'], ['Coletor', v.col + ' pt'], ['Tamanho', v.tam + ' pt']], interp: leitura, avisos: [], detalhe: `Soma = ${tot}` };
    },
    notas: ['PADUA e R.E.N.A.L. têm acurácia semelhante para predizer complicações; use o que a sua equipe padronizou.', 'O escore SPARE (simplificado) deriva do PADUA.'],
    fontes: [{ t: 'Ficarra V et al. PADUA classification. Eur Urol 2009;56:786-93', u: 'https://pubmed.ncbi.nlm.nih.gov/19665284/' }, EAU_SRC],
  },

  bosniak: {
    nome: 'Bosniak 2019 (v2019)',
    origem: 'Silverman SG et al. — Radiology 2019 · classificação de massas renais císticas na TC/RM',
    resumo: 'Descreva parede, septos, nódulos e conteúdo: o app devolve a classe Bosniak (I, II, IIF, III ou IV), o risco aproximado de malignidade e a conduta sugerida (EAU/ACR).',
    campos: [
      seg('mod', 'Método', [o('tc', 'TC com contraste (protocolo de massa renal)'), o('rm', 'RM com contraste')], { col: 0, help: 'Os critérios de espessura e realce valem para TC e RM; os critérios de atenuação (HU) são da TC.' }),
      seg('nod', 'Nódulo realçante', [o('0', 'Não'), o('1', 'Sim', 'protrusão convexa ≥ 4 mm com margens obtusas, ou de qualquer tamanho com margens agudas')], { col: 0 }),
      seg('parede', 'Parede', [o('fina', 'Fina (≤ 2 mm), lisa', 'pode realçar'), o('min', 'Minimamente espessada (3 mm), lisa, realçante'), o('esp', 'Espessa (≥ 4 mm) ou irregular (protrusão ≤ 3 mm com margens obtusas), realçante')]),
      seg('septos', 'Septos', [o('0', 'Nenhum'), o('poucos', 'Poucos (1–3), finos (≤ 2 mm), lisos', 'podem realçar'), o('muitos', 'Muitos (≥ 4), finos (≤ 2 mm), lisos, realçantes'), o('min', 'Minimamente espessados (3 mm), lisos, realçantes (um ou mais)'), o('esp', 'Espessos (≥ 4 mm) ou irregulares, realçantes')]),
      seg('cont', 'Conteúdo (quando parede fina e sem septos)', [o('simples', 'Líquido simples homogêneo (−9 a 20 HU)'), o('hiper', 'Homogêneo hiperatenuante (≥ 70 HU) na TC sem contraste'), o('semrealce', 'Homogêneo, > 20 HU, sem realce no protocolo de massa renal'), o('portal', 'Homogêneo, 21–30 HU na fase portal'), o('pequena', 'Homogêneo, hipoatenuante, pequena demais para caracterizar'), o('hetero', 'Heterogêneo ou atenuação indeterminada')], { show: (v) => v.parede === 'fina' && (v.septos === '0' || v.septos === undefined) && v.nod !== '1' }),
    ],
    compute(v) {
      if (!Y(v.nod) || !Y(v.parede) || !Y(v.septos)) return null;
      let cls, why; const avisos = [];
      if (v.nod === '1') { cls = 'IV'; why = 'nódulo realçante (≥ 4 mm com margens obtusas ou qualquer tamanho com margens agudas)'; }
      else if (v.parede === 'esp' || v.septos === 'esp') { cls = 'III'; why = 'parede ou septo espesso (≥ 4 mm) ou irregular, realçante'; }
      else if (v.parede === 'min' || v.septos === 'min' || v.septos === 'muitos') { cls = 'IIF'; why = v.septos === 'muitos' ? 'muitos (≥ 4) septos finos lisos realçantes' : 'parede ou septo minimamente espessado (3 mm), liso, realçante'; }
      else if (v.septos === 'poucos') { cls = 'II'; why = 'poucos (1–3) septos finos lisos, com ou sem calcificação'; }
      else {
        if (!Y(v.cont)) return { headline: 'Descreva o conteúdo para fechar a classe', rows: [], interp: 'Parede fina sem septos nem nódulo: a classe depende do conteúdo (I se líquido simples; II nos demais padrões homogêneos).', avisos: [], detalhe: '' };
        if (v.cont === 'simples') { cls = 'I'; why = 'parede fina e lisa, líquido simples homogêneo, sem septos, calcificação ou nódulo'; }
        else if (v.cont === 'hetero') { cls = 'Indeterminada'; why = 'conteúdo heterogêneo ou atenuação indeterminada'; avisos.push('Massa não classificável pelos critérios: complementar com RM (ou TC com protocolo de massa renal) antes de definir conduta.'); }
        else { cls = 'II'; why = v.cont === 'hiper' ? 'homogênea ≥ 70 HU sem contraste (cisto hemorrágico/proteináceo)' : v.cont === 'semrealce' ? 'homogênea > 20 HU sem realce' : v.cont === 'portal' ? 'homogênea 21–30 HU na fase portal' : 'homogênea hipoatenuante pequena demais para caracterizar'; }
      }
      const info = { I: ['≈ 0%', 'Benigna: sem seguimento.'], II: ['≈ 0% (< 1–3%)', 'Benigna: sem seguimento.'], IIF: ['≈ 5–10%', 'Seguimento por imagem (TC ou RM) em 6 e 12 meses e depois anualmente por 5 anos (ACR); mudança de classe indica tratamento.'], III: ['≈ 50%', 'Tratar como carcinoma (nefrectomia parcial preferencial) ou vigilância ativa em pacientes selecionados/idosos; biópsia tem baixa acurácia em cistos.'], IV: ['≈ 85–90%', 'Tratar como carcinoma de células renais (nefrectomia parcial quando viável).'], Indeterminada: ['—', 'Complementar a imagem.'] }[cls];
      const tabela = [['Classe', 'Bosniak ' + cls], ['Risco de malignidade', info[0]], ['Conduta', info[1]]];
      if (v.mod === 'rm') avisos.push('RM: cistos com conteúdo marcadamente hiperintenso em T1 ou T2 homogêneo (semelhante ao LCR) sem realce são classe II; conteúdo heterogêneo em T1 com saturação de gordura, sem realce, é IIF.');
      return { headline: `Bosniak ${cls}`, rows: [], tabela, interp: `Critério: ${why}.`, avisos, detalhe: `nódulo ${v.nod === '1' ? 'sim' : 'não'} · parede ${v.parede} · septos ${v.septos}${Y(v.cont) ? ' · conteúdo ' + v.cont : ''}` };
    },
    notas: ['Calcificação de qualquer tipo não altera a classe na v2019.', 'Massa cística = < 25% de componente sólido realçante; se ≥ 25% sólido, classificar como massa renal sólida (não Bosniak).', 'Riscos de malignidade aproximados a partir de séries cirúrgicas (viés de seleção); IIF raramente progride (≈ 10% mudam de classe).'],
    fontes: [{ t: 'Silverman SG et al. Bosniak Classification of Cystic Renal Masses, Version 2019. Radiology 2019;292:475-88', u: 'https://pubmed.ncbi.nlm.nih.gov/31210616/' }, EAU_SRC, { t: 'ACR — Management of incidental renal masses (Herts 2018)', u: 'https://pubmed.ncbi.nlm.nih.gov/29101923/' }],
  },
};
const STAGING_ORDER = ['tnm_prostata', 'tnm_bexiga', 'tnm_tus', 'tnm_uretra', 'tnm_rim', 'tnm_testiculo', 'tnm_penis', 'tnm_acc', 'tnm_ppgl', 'renal_score', 'padua', 'bosniak'];
const KIDNEY_TOOLS = ['tnm_rim', 'renal_score', 'padua', 'bosniak'];

// Seguimento: cronogramas de vigilância por tumor e tratamento (EAU 2026, EAU-ASCO 2026, ESE/ENSAT), com datas geradas a partir da data da cirurgia/tratamento.
// Cada item segue o contrato das calculadoras (campos / compute) e é mesclado em CALCS.
const FU_EAU = (g, u) => ({ t: `EAU Guidelines 2026 — ${g} (capítulo de follow-up)`, u });
const FU = {
  pros: FU_EAU('Prostate Cancer', 'https://uroweb.org/guidelines/prostate-cancer/chapter/followup'),
  nmibc: FU_EAU('Non-muscle-invasive Bladder Cancer', 'https://uroweb.org/guidelines/non-muscle-invasive-bladder-cancer/chapter/followup-of-patients-with-nmibc'),
  mibc: FU_EAU('Muscle-invasive and Metastatic Bladder Cancer', 'https://uroweb.org/guidelines/muscle-invasive-and-metastatic-bladder-cancer/chapter/followup'),
  utuc: FU_EAU('Upper Urinary Tract Urothelial Carcinoma', 'https://uroweb.org/guidelines/upper-urinary-tract-urothelial-cell-carcinoma/chapter/followup'),
  rcc: FU_EAU('Renal Cell Carcinoma', 'https://uroweb.org/guidelines/renal-cell-carcinoma/chapter/followup-in-rcc'),
  tc: FU_EAU('Testicular Cancer (tabelas 8–10)', 'https://uroweb.org/guidelines/testicular-cancer/chapter/followup-after-curative-therapy'),
  pen: { t: 'EAU-ASCO Guidelines on Penile Cancer 2026 — follow-up', u: 'https://uroweb.org/guidelines/penile-cancer/chapter/followup' },
  nccn: { t: 'NCCN Guidelines 2026 — Prostate, Bladder, Kidney, Testicular, Penile (surveillance)', u: 'https://www.nccn.org/guidelines/category_1' },
  acc: { t: 'ESE/ENSAT Clinical Practice Guidelines on adrenocortical carcinoma — Eur J Endocrinol 2018', u: 'https://pubmed.ncbi.nlm.nih.gov/30299884/' },
  inc: { t: 'ESE/ENSAT Guidelines on adrenal incidentalomas 2023 — Eur J Endocrinol', u: 'https://pubmed.ncbi.nlm.nih.gov/37318239/' },
  ppgl: { t: 'ESE — Follow-up of patients with pheochromocytoma/paraganglioma 2016; Endocrine Society 2025', u: 'https://pubmed.ncbi.nlm.nih.gov/27048283/' },
};
const fuY = (v) => v !== undefined && v !== '';
const fuSeg = (id, l, opts, extra) => Object.assign({ id, l, tipo: 'seg', opts, col: 1 }, extra || {});
const fuO = (v, l, s) => ({ v, l, s });
const range = (from, to, step) => { const a = []; for (let m = from; m <= to; m += step) a.push(m); return a; };
const pad2 = (n) => String(n).padStart(2, '0');
function fuParseDate(s) { if (!s) return null; const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return null; const d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d.getTime()) ? null : d; }
function fuAddMonths(d, m) { const r = new Date(d.getTime()); const day = r.getDate(); r.setDate(1); r.setMonth(r.getMonth() + m); const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate(); r.setDate(Math.min(day, last)); return r; }
function fuFmt(d) { return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`; }
function fuMes(m) { return m === 0 ? 'basal' : m % 12 === 0 ? `${m / 12} ano${m / 12 > 1 ? 's' : ''}` : `${m} meses`; }
// monta o cronograma a partir de linhas {ex:'PSA', meses:[...]} e devolve o resultado padrão das calculadoras
function fuBuild(v, titulo, linhas, opts) {
  const base = fuParseDate(v.data); if (!base) return null;
  const byM = new Map();
  linhas.forEach((ln) => ln.meses.forEach((m) => { if (!byM.has(m)) byM.set(m, []); if (!byM.get(m).includes(ln.ex)) byM.get(m).push(ln.ex); }));
  const meses = [...byM.keys()].sort((a, b) => a - b);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0); let marcado = false;
  const eventos = [];
  const tabela = meses.map((m) => { const d = fuAddMonths(base, m); const ex = byM.get(m).join(' + '); let flag = ''; if (!marcado && d >= hoje) { flag = '▶ '; marcado = true; } eventos.push({ d, t: ex, m }); return [`${flag}${fuFmt(d)} · ${fuMes(m)}`, ex]; });
  const avisos = (opts && opts.avisos) || [];
  return { headline: `${titulo} — ${meses.length} visitas, de ${fuFmt(fuAddMonths(base, meses[0]))} a ${fuFmt(fuAddMonths(base, meses[meses.length - 1]))}`, rows: [], tabela, interp: (opts && opts.interp) || '', avisos, detalhe: `Base: ${fuFmt(base)} · "▶" marca a próxima visita a partir de hoje · as datas são contadas em meses a partir da data informada`, eventos, ics: titulo };
}
const DATA = (l) => ({ id: 'data', l: l || 'Data da cirurgia / início do tratamento', tipo: 'date' });

const FOLLOWUP = {
  seg_prostata: {
    nome: 'Seguimento — próstata',
    origem: 'EAU 2026 · NCCN 2026 · vigilância ativa, pós-prostatectomia, pós-radioterapia e hormonioterapia',
    resumo: 'Escolha o cenário e informe a data: o app gera o calendário de consultas, PSA, imagem e exames de segurança, com a regra de recidiva correspondente.',
    campos: [
      fuSeg('cen', 'Cenário', [fuO('rp', 'Após prostatectomia radical'), fuO('rt', 'Após radioterapia (± hormonioterapia)'), fuO('as', 'Vigilância ativa'), fuO('adt', 'Hormonioterapia / doença avançada')]),
      fuSeg('arpi', 'Usa inibidor da via androgênica (abiraterona, enzalutamida, apalutamida, darolutamida)?', [fuO('0', 'Não'), fuO('1', 'Sim')], { col: 0, show: (v) => v.cen === 'adt' }),
      fuSeg('m1', 'Doença metastática (M1)?', [fuO('0', 'Não (M0 / recidiva bioquímica)'), fuO('1', 'Sim')], { col: 0, show: (v) => v.cen === 'adt' }),
      fuSeg('rmdx', 'Diagnóstico com RM multiparamétrica + biópsia dirigida e sistemática?', [fuO('1', 'Sim', 'dispensa a biópsia confirmatória de 12 meses'), fuO('0', 'Não', 'biópsia confirmatória em 12 meses')], { col: 0, show: (v) => v.cen === 'as' }),
      DATA(),
    ],
    compute(v) {
      if (!fuY(v.cen)) return null;
      if (v.cen === 'rp') return fuBuild(v, 'Pós-prostatectomia radical', [
        { ex: 'PSA + consulta (continência, função erétil)', meses: [3] }, { ex: 'PSA + consulta', meses: [6, 12, 18, 24, 30, 36] }, { ex: 'PSA anual', meses: range(48, 120, 12) },
      ], { interp: 'EAU 2026: PSA a cada 6 meses por 3 anos e depois anual; o PSA deve estar indetectável ~2 meses após a cirurgia. Recidiva bioquímica = PSA detectável em elevação (limiar que melhor prediz metástase: > 0,4 ng/mL). Imagem (PSMA-PET) só na recidiva ou com sintomas.', avisos: ['Pode-se encerrar o seguimento oncológico se a expectativa de vida for < 10 anos.', 'NCCN: PSA a cada 6–12 meses por 5 anos e depois anual; toque retal anual (dispensável com PSA indetectável).', 'pT3, margem positiva ou GG 4–5: discutir radioterapia adjuvante × de resgate precoce (PSA > 0,2) — ver fluxo de recidiva bioquímica.'] });
      if (v.cen === 'rt') return fuBuild(v, 'Pós-radioterapia', [
        { ex: 'PSA + consulta (toxicidade GU/GI)', meses: [3] }, { ex: 'PSA + consulta', meses: [6, 12, 18, 24, 30, 36] }, { ex: 'PSA anual', meses: range(48, 120, 12) }, { ex: 'Testosterona (se hormonioterapia associada)', meses: [6, 12, 24] },
      ], { interp: 'EAU 2026: mesmo esquema da prostatectomia (6/6 meses por 3 anos, depois anual). O nadir pode levar ≥ 3 anos; nadir < 0,5 ng/mL é favorável. Falha = Phoenix (nadir + 2 ng/mL), também sob ADT. Não pedir imagem de rotina sem elevação do PSA.', avisos: ['Hormonioterapia associada: dosar testosterona para distinguir recuperação hormonal de recidiva; após o término, o PSA pode subir com a recuperação da testosterona.', 'Vigiar cistite/proctite actínica, hematúria e estenose; encaminhar para reabilitação sexual.'] });
      if (v.cen === 'as') { const bx = v.rmdx === '1' ? [] : [12]; return fuBuild(v, 'Vigilância ativa', [
        { ex: 'PSA + consulta', meses: range(6, 120, 6) }, { ex: 'Toque retal', meses: range(12, 120, 12) }, { ex: 'RM multiparamétrica', meses: [12, 36, 60, 84, 108] }, { ex: 'Biópsia confirmatória', meses: bx }, { ex: 'Biópsia de repetição (ou antes, se gatilho)', meses: [48, 84, 120] },
      ], { interp: 'EAU 2026: PSA a cada 6 meses, toque retal anual, RM e biópsias de repetição; biópsia confirmatória em 12 meses quando o diagnóstico não incluiu RM com biópsia dirigida. Gatilhos para reclassificar: GG ≥ 2 (ou ≥ 3 conforme protocolo), PSA-DT < 3 anos, progressão na RM (PRECISE 4–5) ou no toque.', avisos: ['Não tratar por elevação isolada de PSA: confirmar com RM e biópsia.', 'Expectativa de vida < 10 anos ou preferência do paciente: migrar para observação (watchful waiting).', 'Intervalos de RM e biópsia variam entre protocolos (PRIAS, Johns Hopkins, NCCN); ajuste ao serviço.'] }); }
      // adt
      const arpi = v.arpi === '1', m1 = v.m1 === '1';
      const linhas = [
        { ex: 'Basal: PSA, testosterona, ECG, glicemia/HbA1c, lipídios, Hb, creatinina, FA, transaminases, DEXA, cálcio/vitamina D', meses: [0] },
        { ex: 'Consulta + PSA + testosterona', meses: arpi ? [1, 2, 3, 6, 9, 12] : [3, 6, 9, 12] },
        { ex: 'Consulta + PSA + testosterona', meses: m1 ? range(15, 60, 3) : range(18, 60, 6) },
        { ex: 'Consulta + PSA (3–6 meses)', meses: range(66, 120, 6) },
        { ex: 'Hb, creatinina, FA, glicemia/HbA1c, lipídios', meses: range(6, 120, 6) },
        { ex: 'Transaminases', meses: arpi ? [1, 2, 3, 6, 12] : [6, 12] },
        { ex: 'Transaminases anual', meses: range(24, 120, 12) },
        { ex: 'DEXA (se sem proteção óssea)', meses: [24, 48, 72, 96, 120] },
      ];
      if (m1) linhas.push({ ex: 'Imagem (TC + cintilografia ou PSMA-PET) mesmo com PSA estável', meses: range(6, 120, 6) });
      return fuBuild(v, m1 ? 'Hormonioterapia — doença metastática' : 'Hormonioterapia — M0', linhas, { interp: `EAU 2026: avaliar a cada 3–6 meses após iniciar ADT${arpi ? ' (mensal nos 3 primeiros meses com inibidor da via androgênica: pressão, transaminases, fadiga, quedas)' : ''}; em M1, a cada 3–6 meses com imagem regular; em M0, ao menos a cada 6 meses. Castração = testosterona < 50 ng/dL (ideal < 20). PSA em elevação: dosar testosterona e reestadiar antes de declarar resistência à castração.`, avisos: ['Saúde óssea: DEXA antes/ao iniciar ADT; proteção óssea (denosumabe/ácido zoledrônico) nas combinações; repetir DEXA a cada 2 anos sem proteção; cálcio e vitamina D.', 'Orientar sinais de compressão medular (M1b); monitorar humor, cognição, fadiga, função sexual.', 'Cardiologia se doença cardiovascular prévia; glicemia/HbA1c e lipídios periódicos.'] });
    },
    notas: ['Datas contadas a partir da data informada (cirurgia, fim da radioterapia, início da vigilância ou da hormonioterapia).', 'O calendário é um ponto de partida: adapte a comorbidades, expectativa de vida e protocolo do serviço.'],
    fontes: [FU.pros, FU.nccn],
  },

  seg_bexiga: {
    nome: 'Seguimento — bexiga',
    origem: 'EAU 2026 · NMIBC por grupo de risco, pós-cistectomia radical e preservação vesical (trimodal)',
    resumo: 'Escolha o cenário e a data da RTU/cistectomia/fim da quimiorradioterapia: o app gera as cistoscopias, citologias, imagem do trato superior e exames funcionais.',
    campos: [
      fuSeg('cen', 'Cenário', [fuO('nm_baixo', 'NMIBC de baixo risco (EAU 2021)'), fuO('nm_int', 'NMIBC de risco intermediário'), fuO('nm_alto', 'NMIBC de alto / muito alto risco (inclui CIS)'), fuO('rc', 'Após cistectomia radical'), fuO('tmt', 'Preservação vesical (trimodal)')]),
      fuSeg('deriv', 'Derivação urinária', [fuO('ileal', 'Conduto ileal / neobexiga (segmento intestinal)'), fuO('ureter', 'Ureterostomia cutânea (sem intestino)')], { col: 0, show: (v) => v.cen === 'rc' }),
      fuSeg('risco_rc', 'Risco de recidiva na uretra / trato superior', [fuO('0', 'Padrão'), fuO('1', 'Alto', 'CIS, multifocalidade, margem ureteral positiva, uretra prostática acometida')], { col: 0, show: (v) => v.cen === 'rc' }),
      DATA('Data da RTU (última), cistectomia ou fim da quimiorradioterapia'),
    ],
    compute(v) {
      if (!fuY(v.cen)) return null;
      if (v.cen === 'nm_baixo') return fuBuild(v, 'NMIBC baixo risco', [{ ex: 'Cistoscopia', meses: [3, 12, 24, 36, 48, 60] }], { interp: 'EAU 2026: cistoscopia aos 3 e 12 meses e depois anual até 5 anos; sem citologia nem imagem do trato superior de rotina. Após 5 anos, considerar suspender ou substituir por métodos menos invasivos (fita de hematúria/marcadores).', avisos: ['Recidiva ou grau alto reclassifica o paciente — reiniciar o esquema do novo grupo de risco.'] });
      if (v.cen === 'nm_int') return fuBuild(v, 'NMIBC risco intermediário', [{ ex: 'Cistoscopia', meses: [3, 6, 12, 18, 24] }, { ex: 'Cistoscopia anual', meses: range(36, 120, 12) }], { interp: 'EAU 2026: cistoscopia aos 3 meses, depois a cada 6 meses por 2 anos e anual até 10 anos; citologia e imagem do trato superior não são sistemáticas. Tumor HG/G3 dentro do grupo intermediário: seguir como alto risco.', avisos: ['Quimioterapia intravesical de manutenção ou BCG 1 ano conforme o fluxo de bexiga.', 'Marcadores urinários podem substituir/adiar cistoscopias em baixo e intermediário risco (evidência de não inferioridade).'] });
      if (v.cen === 'nm_alto') return fuBuild(v, 'NMIBC alto / muito alto risco', [{ ex: 'Cistoscopia + citologia', meses: range(3, 24, 3) }, { ex: 'Cistoscopia + citologia', meses: range(30, 60, 6) }, { ex: 'Cistoscopia + citologia anual (vitalício)', meses: range(72, 180, 12) }, { ex: 'TC urografia (trato superior)', meses: [12, 24, 36, 48, 60] }, { ex: 'TC urografia a cada 2 anos', meses: [84, 108] }], { interp: 'EAU 2026: cistoscopia e citologia a cada 3 meses por 2 anos, a cada 6 meses até 5 anos e depois anual, por toda a vida; TC urografia anual até 5 anos e a cada 2 anos até 10 anos. Citologia positiva com bexiga normal: biópsias de mapeamento (± fotodiagnóstico) e investigação de uretra prostática e trato superior.', avisos: ['BCG de manutenção por 1–3 anos conforme o fluxo; falha ao BCG → cistectomia.', 'Muito alto risco: discutir cistectomia precoce.'] });
      if (v.cen === 'rc') { const lin = [
        { ex: 'Consulta + TC tórax/abdome/pelve + creatinina/eTFG, eletrólitos (acidose), hemograma', meses: [6, 12, 18, 24, 30, 36] },
        { ex: 'Consulta + TC tórax/abdome/pelve + função renal', meses: range(48, 120, 12) },
        { ex: 'Avaliação do estoma / neobexiga (esvaziamento, continência, estenose)', meses: [3, 12, 24] },
      ];
      if (v.deriv !== 'ureter') lin.push({ ex: 'Vitamina B12 (segmento intestinal)', meses: range(12, 120, 12) });
      if (v.risco_rc === '1') lin.push({ ex: 'Citologia de lavado uretral (uretra remanescente) e atenção ao trato superior', meses: range(6, 60, 6) });
      return fuBuild(v, 'Pós-cistectomia radical', lin, { interp: 'EAU 2026: TC de tórax/abdome/pelve a cada 6 meses até 3 anos e depois anual; trato superior obrigatório na imagem quando havia CIS, multifocalidade ou margem ureteral positiva (risco tardio de UTUC > 3 anos). Funcional: vitamina B12 anual com derivação intestinal (deficiência em 17%), função renal (DRC em até 29% em 1 ano), acidose metabólica, estenose ureteroentérica (até 20%) e complicações do estoma (até 24%).', avisos: ['pN+ ou localmente avançado: seguimento pode exceder 10–20 anos; pT0/NMIBC na peça ou idosos: pode ser reduzido.', 'Uretrectomia ou vigilância uretral em homens com derivação cutânea e uretra prostática acometida.', 'NCCN: imagem a cada 3–6 meses por 2 anos e depois anual até 5 anos; B12 anual.'] }); }
      return fuBuild(v, 'Preservação vesical (trimodal)', [{ ex: 'Cistoscopia', meses: range(3, 24, 3) }, { ex: 'Cistoscopia', meses: range(30, 60, 6) }, { ex: 'Cistoscopia anual', meses: range(72, 120, 12) }, { ex: 'Citologia + TC/RM (inclui trato superior)', meses: [6, 12, 18, 24, 30, 36, 48, 60] }], { interp: 'EAU 2026 (consenso de especialistas): cistoscopia a cada 3 meses por 2 anos, a cada 6 meses até 5 anos e anual depois; citologia e imagem a cada 6–12 meses nos primeiros 3–5 anos, depois conforme indicação. Avaliar função vesical e toxicidade tardia.', avisos: ['Recidiva músculo-invasiva → cistectomia de resgate; NMIBC recidivado → RTU ± intravesical.'] });
    },
    notas: ['Grupos de risco conforme EAU 2021 (calculadora NMIBC do app).', 'Datas contadas a partir da última RTU (NMIBC), da cistectomia ou do término da quimiorradioterapia.'],
    fontes: [FU.nmibc, FU.mibc, FU.nccn],
  },

  seg_tus: {
    nome: 'Seguimento — pelve renal e ureter (UTUC)',
    origem: 'EAU 2026 · após nefroureterectomia ou tratamento conservador, por risco e história de NMIBC',
    resumo: 'Escolha o tratamento, o risco e a história de tumor vesical: o app gera cistoscopias, citologias, TC urografia/TC de tórax e ureteroscopias.',
    campos: [
      fuSeg('tx', 'Tratamento', [fuO('rnu', 'Nefroureterectomia radical'), fuO('cons', 'Tratamento conservador (ureteroscópico / segmentar)')]),
      fuSeg('risco', 'Risco do tumor', [fuO('baixo', 'Baixo risco', 'unifocal, < 2 cm, baixo grau, sem invasão na TC'), fuO('alto', 'Alto risco')], { col: 0 }),
      fuSeg('nmibc', 'História prévia de tumor de bexiga (NMIBC)?', [fuO('0', 'Não'), fuO('1', 'Sim')], { col: 0, show: (v) => v.risco === 'alto' }),
      DATA(),
    ],
    compute(v) {
      if (!fuY(v.tx) || !fuY(v.risco)) return null;
      const prev = v.nmibc === '1';
      if (v.tx === 'rnu') {
        if (v.risco === 'baixo') return fuBuild(v, 'Pós-nefroureterectomia — baixo risco', [{ ex: 'Cistoscopia', meses: [3, 12, 24, 36, 48, 60] }], { interp: 'EAU 2026: cistoscopia aos 3 meses, depois aos 12 meses e anual até 5 anos; citologia, TC urografia e TC de tórax não são rotina (discutir imagem do trato contralateral caso a caso).', avisos: ['Instilação intravesical única pós-operatória reduz recidiva vesical.'] });
        return fuBuild(v, `Pós-nefroureterectomia — alto risco${prev ? ' (com NMIBC prévio)' : ''}`, [
          { ex: 'Cistoscopia + citologia', meses: prev ? range(3, 24, 3) : [3, 6, 12, 18, 24] }, { ex: 'Cistoscopia + citologia', meses: prev ? range(30, 60, 6) : [36, 48, 60] }, { ex: 'Cistoscopia + citologia anual', meses: prev ? range(72, 120, 12) : [] },
          { ex: 'TC urografia + TC de tórax', meses: [6, 12, 18, 24] }, { ex: 'TC urografia + TC de tórax anual', meses: range(36, 120, 12) },
        ], { interp: prev ? 'EAU 2026 (alto risco com NMIBC prévio): cistoscopia e citologia aos 3 meses e, se negativas, a cada 3 meses por 2 anos, a cada 6 meses até 5 anos e depois anual; TC urografia e TC de tórax a cada 6 meses por 2 anos e depois anual.' : 'EAU 2026 (alto risco sem NMIBC prévio): cistoscopia e citologia aos 3 meses e, se negativas, a cada 6 meses por 2 anos e depois anual até 5 anos; TC urografia e TC de tórax a cada 6 meses por 2 anos e depois anual.', avisos: ['pT2–T4 ou pN+: quimioterapia adjuvante à base de platina (POUT) — ver fluxo.', 'Função renal após a nefroureterectomia define elegibilidade a cisplatina.'] });
      }
      if (v.risco === 'baixo') return fuBuild(v, 'Tratamento conservador — baixo risco', [{ ex: 'Ureteroscopia de reavaliação (second look)', meses: [3] }, { ex: 'Cistoscopia + TC urografia', meses: [3, 6] }, { ex: 'Cistoscopia + TC urografia (± ureteroscopia)', meses: [12, 24, 36, 48, 60] }], { interp: 'EAU 2026: cistoscopia e TC urografia aos 3 e 6 meses e depois anual até 5 anos, com ou sem ureteroscopia, após uma ureteroscopia de reavaliação negativa.', avisos: ['O valor da ureteroscopia de seguimento frente à TC urografia e à citologia é desconhecido.'] });
      return fuBuild(v, `Tratamento conservador — alto risco${prev ? ' (com NMIBC prévio)' : ''}`, [
        { ex: 'Cistoscopia + citologia', meses: prev ? range(3, 24, 3) : [3, 6, 12, 18, 24] }, { ex: 'Cistoscopia + citologia', meses: prev ? range(30, 60, 6) : [36, 48, 60] }, { ex: 'Cistoscopia + citologia anual', meses: prev ? range(72, 120, 12) : [] },
        { ex: 'Ureteroscopia + urografia por imagem em cortes', meses: [3, 6] }, { ex: 'TC urografia (± ureteroscopia)', meses: [12, 18, 24] }, { ex: 'TC urografia anual', meses: [36, 48, 60] },
      ], { interp: 'EAU 2026: após ureteroscopia de reavaliação negativa, imagem e ureteroscopia aos 3 e 6 meses; TC urografia a cada 6 meses por 2 anos e anual até 5 anos; cistoscopia e citologia conforme a história de NMIBC.', avisos: ['Tratamento conservador em alto risco só por necessidade (rim único, DRC) — discutir nefroureterectomia.'] });
    },
    notas: ['Risco EAU: baixo = unifocal, < 2 cm, citologia/biópsia de baixo grau, sem invasão na TC urografia; qualquer outro = alto.'],
    fontes: [FU.utuc],
  },

  seg_rim: {
    nome: 'Seguimento — rim',
    origem: 'EAU 2026 · após cirurgia por risco de recidiva (Leibovich / UISS) e após ablação',
    resumo: 'Escolha o risco de recidiva (ou ablação) e a data da cirurgia: o app gera a TC de tórax e abdome (ou RM) nos intervalos da tabela EAU 2026, com função renal.',
    campos: [
      fuSeg('cen', 'Cenário', [fuO('baixo', 'Baixo risco', 'ccRCC Leibovich 0–2 · não-ccRCC pT1a–b N0 grau 1–2'), fuO('int', 'Risco intermediário', 'ccRCC Leibovich 3–5 · não-ccRCC pT1b e/ou grau 3–4'), fuO('alto', 'Alto risco', 'ccRCC Leibovich ≥ 6 · não-ccRCC pT2–T4 ou pN1'), fuO('abl', 'Após ablação (crio/radiofrequência/micro-ondas)')]),
      fuSeg('margem', 'Margem cirúrgica positiva na nefrectomia parcial?', [fuO('0', 'Não'), fuO('1', 'Sim')], { col: 0, show: (v) => v.cen !== 'abl' }),
      DATA(),
    ],
    compute(v) {
      if (!fuY(v.cen)) return null;
      const fr = { ex: 'Creatinina/eTFG, pressão arterial, risco cardiovascular', meses: [] };
      let lin, interp, avisos = [];
      if (v.cen === 'baixo') { lin = [{ ex: 'TC tórax + abdome (ou RM abdome)', meses: [6, 18, 30] }, { ex: 'TC a cada 2 anos (se seguimento mantido)', meses: [54, 78] }]; interp = 'EAU 2026 (baixo risco): TC aos 6, 18 e 30 meses e depois a cada 2 anos; a tabela sugere avaliar a interrupção da imagem após 3 anos, conforme idade, comorbidades e preferência.'; }
      else if (v.cen === 'int') { lin = [{ ex: 'TC tórax + abdome (ou RM abdome)', meses: [6, 12, 24, 36] }, { ex: 'TC anual', meses: [48, 60] }, { ex: 'TC a cada 2 anos', meses: [84, 108] }]; interp = 'EAU 2026 (risco intermediário): TC aos 6, 12, 24 e 36 meses, anual até 5 anos e depois a cada 2 anos; avaliar interrupção após 5 anos.'; }
      else if (v.cen === 'alto') { lin = [{ ex: 'TC tórax + abdome (ou RM abdome)', meses: [3, 6, 12, 18, 24, 36] }, { ex: 'TC anual', meses: [48, 60] }, { ex: 'TC a cada 2 anos', meses: [84, 108] }]; interp = 'EAU 2026 (alto risco): TC aos 3, 6, 12, 18, 24 e 36 meses, anual até 5 anos e depois a cada 2 anos. Candidatos a pembrolizumabe adjuvante (KEYNOTE-564) em células claras.'; }
      else { lin = [{ ex: 'TC ou RM com contraste (zona de ablação)', meses: [3, 6, 12] }, { ex: 'TC/RM anual', meses: [24, 36, 48, 60] }]; interp = 'A EAU 2026 não propõe esquema específico após ablação. Esquema prático (AUA 2021/consenso): imagem com contraste em 3, 6 e 12 meses e depois anual por 5 anos; realce nodular na zona ablada indica recidiva (rebiópsia/retratamento).'; avisos.push('Ablação sem biópsia prévia dificulta o seguimento: biópsia antes ou durante o procedimento.'); }
      fr.meses = [...new Set(lin.flatMap((l) => l.meses))]; lin.push(fr);
      if (v.margem === '1') avisos.push('Margem positiva na nefrectomia parcial: intensificar o seguimento (recomendação fraca) — considerar imagem a cada 6 meses nos 2 primeiros anos.');
      avisos.push('Encerrar o seguimento oncológico quando o risco de morte por outras causas for o dobro do risco de recidiva; manter seguimento funcional (renal/cardiovascular).', 'Encaminhar à nefrologia se eTFG < 45 mL/min, DRC prévia ou comorbidades que afetem a função renal.', 'Radiografia de tórax e US têm baixa sensibilidade; PET-CT e cintilografia óssea não são rotina.');
      return fuBuild(v, { baixo: 'Pós-cirurgia — baixo risco', int: 'Pós-cirurgia — risco intermediário', alto: 'Pós-cirurgia — alto risco', abl: 'Pós-ablação' }[v.cen], lin, { interp, avisos });
    },
    notas: ['Risco calculado por Leibovich 2003 (células claras) ou UISS (não-células claras) — calculadora de rim do app.', 'Datas contadas a partir da nefrectomia/ablação.'],
    fontes: [FU.rcc, FU.nccn],
  },

  seg_testiculo: {
    nome: 'Seguimento — testículo',
    origem: 'EAU 2026 (tabelas 8–10) · seminoma e não seminoma estádio I, doença avançada em remissão',
    resumo: 'Escolha o cenário e a data da orquiectomia (ou do fim da quimioterapia): o app gera marcadores, radiografia de tórax e TC/RM nos pontos exatos das tabelas EAU 2026.',
    campos: [
      fuSeg('cen', 'Cenário', [fuO('sem1', 'Seminoma estádio I — vigilância ou após carboplatina/radioterapia'), fuO('ns1', 'Não seminoma estádio I — vigilância'), fuO('adv', 'Doença avançada após quimioterapia (± adjuvante) em remissão completa', 'exclui prognóstico desfavorável e ausência de remissão')]),
      fuSeg('lvi', 'Invasão linfovascular (LVI)?', [fuO('0', 'Não'), fuO('1', 'Sim', 'alto risco: TC extra aos 18 meses; radiografia aos 60 meses')], { col: 0, show: (v) => v.cen === 'ns1' }),
      fuSeg('pulm', 'Metástases pulmonares ao diagnóstico?', [fuO('0', 'Não'), fuO('1', 'Sim', 'TC de tórax junto com a TC de abdome')], { col: 0, show: (v) => v.cen === 'adv' }),
      DATA('Data da orquiectomia (ou do fim da quimioterapia)'),
    ],
    compute(v) {
      if (!fuY(v.cen)) return null;
      if (v.cen === 'sem1') return fuBuild(v, 'Seminoma estádio I', [{ ex: 'Marcadores (AFP, hCG, LDH) + consulta', meses: [6, 12, 18, 24, 30, 36, 48, 60] }, { ex: 'TC ou RM abdome-pelve', meses: [6, 12, 18, 24, 36, 60] }], { interp: 'EAU 2026, tabela 8: marcadores 2×/ano nos anos 1–3 e 1×/ano nos anos 4–5; TC/RM de abdome-pelve 2× no ano 1, 2× no ano 2, aos 36 e aos 60 meses; sem radiografia de tórax. Após 5 anos: plano de sobrevivência (sem imagem).', avisos: ['RM é alternativa à TC para reduzir radiação (vigilância longa em jovens).', 'Fatores de risco (≥ 4 cm, rete testis) orientam vigilância × carboplatina, não o esquema de seguimento.'] });
      if (v.cen === 'ns1') { const lvi = v.lvi === '1'; return fuBuild(v, `Não seminoma estádio I — vigilância${lvi ? ' (LVI+)' : ''}`, [
        { ex: 'Marcadores (AFP, hCG, LDH) + consulta', meses: [3, 6, 9, 12, 15, 18, 21, 24, 30, 36, 48, 60] }, { ex: 'Radiografia de tórax', meses: lvi ? [6, 12, 18, 24, 60] : [6, 12, 18, 24] }, { ex: 'TC ou RM abdome-pelve', meses: lvi ? [6, 12, 18, 24, 36, 60] : [6, 12, 24, 36, 60] },
      ], { interp: 'EAU 2026, tabela 9: marcadores 4×/ano nos anos 1–2, 2× no ano 3, 1–2×/ano nos anos 4–5; radiografia de tórax 2×/ano nos anos 1–2; TC/RM de abdome-pelve 2× no ano 1, aos 24, 36 e 60 meses' + (lvi ? ' — em LVI+ a maioria do painel acrescenta TC aos 18 meses e radiografia aos 60 meses.' : '.'), avisos: ['LVI+ (≈ 50% de recidiva): alternativa de BEP ×1; a maioria das recidivas ocorre nos 2 primeiros anos.', 'Marcadores em elevação sem imagem: repetir em 1–2 semanas e PET/RM antes de tratar.'] }); }
      const pulm = v.pulm === '1';
      return fuBuild(v, 'Doença avançada em remissão', [{ ex: 'Marcadores + consulta', meses: [3, 6, 9, 12, 15, 18, 21, 24, 30, 36, 42, 48, 54, 60] }, { ex: 'Radiografia de tórax', meses: [6, 12, 24, 36, 48, 60] }, { ex: pulm ? 'TC abdome-pelve + TC de tórax' : 'TC ou RM abdome-pelve', meses: [6, 12, 24, 36, 60] }], { interp: 'EAU 2026, tabela 10 (adjuvante ou resposta completa, exceto prognóstico desfavorável): marcadores 4×/ano nos anos 1–2 e 2×/ano nos anos 3–5; radiografia de tórax 1–2× no ano 1 e anual; TC/RM de abdome-pelve 1–2× no ano 1, aos 24, 36 e 60 meses' + (pulm ? ', com TC de tórax junto (metástase pulmonar ao diagnóstico).' : '.'), avisos: ['Teratoma em massa residual ressecada: manter com o uro-oncologista (recidiva tardia).', 'Prognóstico desfavorável ou sem remissão completa: seguimento individualizado, mais intenso.'] });
    },
    notas: ['Marcadores: AFP, hCG e LDH; usar o nadir pós-orquiectomia como referência.', 'Datas contadas a partir da orquiectomia (estádio I) ou do término da quimioterapia (doença avançada).'],
    fontes: [FU.tc, FU.nccn],
  },

  seg_penis: {
    nome: 'Seguimento — pênis',
    origem: 'EAU-ASCO 2026 · tumor primário (preservador × amputação) e linfonodos (cN0, pN0, pN+)',
    resumo: 'Escolha o tratamento do primário e a situação linfonodal: o app gera o calendário de exame físico, ultrassom inguinal ± PAAF e TC.',
    campos: [
      fuSeg('prim', 'Tratamento do tumor primário', [fuO('pres', 'Preservador do pênis (tópico, laser, glandectomia, parcial com reconstrução)'), fuO('amp', 'Amputação parcial/total')]),
      fuSeg('ln', 'Linfonodos inguinais', [fuO('cn0', 'cN0 em vigilância (sem estadiamento invasivo)'), fuO('pn0', 'pN0 após linfonodo sentinela ou linfadenectomia'), fuO('pnp', 'pN+ (após linfadenectomia ± adjuvância)')]),
      DATA(),
    ],
    compute(v) {
      if (!fuY(v.prim) || !fuY(v.ln)) return null;
      const lin = [];
      if (v.prim === 'pres') { lin.push({ ex: 'Exame físico do pênis (± autoexame)', meses: range(3, 24, 3) }, { ex: 'Exame físico do pênis', meses: range(30, 60, 6) }); }
      else { lin.push({ ex: 'Exame físico do coto / autoexame', meses: range(3, 24, 3) }, { ex: 'Exame físico anual', meses: [36, 48, 60] }); }
      if (v.ln === 'cn0') lin.push({ ex: 'Exame inguinal + US inguinal ± PAAF', meses: [3, 6, 9, 12] }, { ex: 'Exame inguinal', meses: [18, 24] }, { ex: 'Exame inguinal', meses: range(30, 60, 6) });
      else if (v.ln === 'pn0') lin.push({ ex: 'Exame inguinal + US ± PAAF', meses: [3, 6, 9, 12] }, { ex: 'Exame inguinal (± US)', meses: [18, 24] });
      else lin.push({ ex: 'Exame inguinal + TC tórax/abdome/pelve (ou PET/TC)', meses: [3, 6, 9, 12, 15, 18, 21, 24] }, { ex: 'Exame inguinal + imagem', meses: range(30, 60, 6) });
      const interp = `EAU-ASCO 2026: primário ${v.prim === 'pres' ? 'preservado — a cada 3 meses por 2 anos e a cada 6 meses até 5 anos (biópsia de repetição opcional após tópico/laser para PeIN)' : 'amputado — a cada 3 meses por 2 anos e anual até 5 anos'}; linfonodos ${v.ln === 'cn0' ? 'cN0 em vigilância — a cada 3 meses no 1º ano (US ± PAAF), a cada 6 meses no 2º e até 5 anos' : v.ln === 'pn0' ? 'pN0 — a cada 3 meses no 1º ano e a cada 6 meses no 2º; depois, sem seguimento linfonodal se o paciente faz autoexame' : 'pN+ — a cada 3 meses por 2 anos com TC ou PET/TC, depois a cada 6 meses até 5 anos'}.`;
      return fuBuild(v, 'Câncer de pênis', lin, { interp, avisos: ['Seguimento regular pode ser encerrado após 5 anos se o paciente souber relatar alterações; manter mais tempo se baixa adesão ao autoexame.', 'Periodicidade exata da TC em pN+ não é fixada pela diretriz; o esquema semestral é prático.', 'Recidiva local é tratável; a recidiva inguinal tardia tem prognóstico ruim — por isso a vigilância inguinal intensa nos 2 primeiros anos.'] });
    },
    notas: ['Datas contadas a partir da cirurgia do primário (ou da linfadenectomia, se posterior).'],
    fontes: [FU.pen, FU.nccn],
  },

  seg_adrenal: {
    nome: 'Seguimento — adrenal',
    origem: 'ESE/ENSAT 2018 (carcinoma adrenocortical) · ESE 2023 (incidentaloma) · ESE 2016 / Endocrine Society 2025 (feocromocitoma e paraganglioma)',
    resumo: 'Escolha o cenário e a data: o app gera imagem, marcadores hormonais e consultas conforme a diretriz correspondente.',
    campos: [
      fuSeg('cen', 'Cenário', [fuO('acc', 'Carcinoma adrenocortical após ressecção R0'), fuO('ppgl', 'Feocromocitoma / paraganglioma após ressecção'), fuO('inc', 'Incidentaloma não operado')]),
      fuSeg('sec', 'Tumor secretor (cortisol/andrógenos) antes da cirurgia?', [fuO('0', 'Não'), fuO('1', 'Sim', 'marcadores hormonais a cada visita')], { col: 0, show: (v) => v.cen === 'acc' }),
      fuSeg('mit', 'Em uso de mitotano adjuvante?', [fuO('0', 'Não'), fuO('1', 'Sim')], { col: 0, show: (v) => v.cen === 'acc' }),
      fuSeg('hered', 'Risco alto de recidiva/novo tumor (hereditário, paraganglioma, < 20 anos, > 5 cm, multifocal)?', [fuO('0', 'Não'), fuO('1', 'Sim')], { col: 0, show: (v) => v.cen === 'ppgl' }),
      fuSeg('inctipo', 'Característica do incidentaloma', [fuO('ben', 'Benigno e não funcionante (≤ 10 HU, homogêneo, ≤ 4 cm)'), fuO('ind', 'Indeterminado na imagem (> 10 HU ou > 4 cm, não operado)'), fuO('macs', 'Secreção autônoma leve de cortisol (MACS) sem cirurgia')], { show: (v) => v.cen === 'inc' }),
      DATA('Data da cirurgia / da imagem inicial'),
    ],
    compute(v) {
      if (!fuY(v.cen)) return null;
      if (v.cen === 'acc') { const lin = [{ ex: 'TC de tórax + TC/RM de abdome', meses: range(3, 24, 3) }, { ex: 'TC de tórax + TC/RM de abdome', meses: range(30, 60, 6) }, { ex: 'Imagem anual (até 10 anos)', meses: range(72, 120, 12) }];
        if (v.sec === '1') lin.push({ ex: 'Marcadores hormonais (cortisol/DHEA-S/andrógenos, esteroides urinários)', meses: [...range(3, 24, 3), ...range(30, 60, 6), ...range(72, 120, 12)] });
        if (v.mit === '1') lin.push({ ex: 'Mitotanemia (alvo 14–20 mg/L) + TSH/T4L, lipídios, transaminases, cortisol/ACTH (reposição)', meses: [1, 2, 3, 4, 6, 9, 12, 15, 18, 21, 24] });
        return fuBuild(v, 'Carcinoma adrenocortical pós-R0', lin, { interp: 'ESE/ENSAT 2018: imagem (TC de tórax e TC/RM de abdome) a cada 3 meses por 2 anos, depois a cada 3–6 meses até 5 anos; após 5 anos, intervalos maiores até pelo menos 10 anos. Tumores secretores: marcadores hormonais a cada visita (recidiva bioquímica precede a imagem).', avisos: ['Mitotano adjuvante por ≥ 2 anos em alto risco (Ki-67 > 10%, R1, ruptura); observação pode ser aceitável em baixo risco (ADIUVO).', 'Com mitotano: reposição de glicocorticoide em dose maior (indução de CYP3A4/CBG) e monitorar hipotireoidismo, dislipidemia e neurotoxicidade.'] }); }
      if (v.cen === 'ppgl') { const long = v.hered === '1'; return fuBuild(v, 'Feocromocitoma / paraganglioma pós-ressecção', [{ ex: 'Metanefrinas plasmáticas ou urinárias (confirmar ressecção completa)', meses: [1] }, { ex: 'Metanefrinas + consulta (pressão, sintomas)', meses: range(12, long ? 240 : 120, 12) }, { ex: 'Imagem (TC/RM) se metanefrinas alteradas ou tumor não secretor', meses: long ? [12, 36, 60, 84, 108] : [] }], { interp: `ESE 2016 / Endocrine Society: metanefrinas 2–8 semanas após a cirurgia e depois anualmente por pelo menos 10 anos${long ? ' — vitalícias em síndromes hereditárias, paraganglioma, pacientes jovens ou tumores grandes/multifocais, com imagem periódica' : ''}; imagem só quando a bioquímica alterar (ou em tumores não secretores).`, avisos: ['Teste genético germinativo para todos (SDHx, VHL, RET, NF1, MAX, TMEM127); SDHB tem o maior risco de doença metastática.', 'Novos tumores contralaterais ou extra-adrenais ocorrem em formas hereditárias — considerar adrenalectomia poupadora de córtex.'] }); }
      // incidentaloma
      if (!fuY(v.inctipo)) return null;
      if (v.inctipo === 'ben') return fuBuild(v, 'Incidentaloma benigno não funcionante', [{ ex: 'Sem imagem de seguimento (apenas reavaliar se novos sintomas ou sinais de hipercortisolismo)', meses: [0] }], { interp: 'ESE/ENSAT 2023: massa ≤ 4 cm, homogênea, ≤ 10 HU, sem secreção: não repetir imagem nem testes hormonais, salvo surgimento de comorbidades sugestivas (hipertensão, diabetes, osteoporose).', avisos: ['Teste de supressão com 1 mg de dexametasona e metanefrinas devem ter sido feitos na avaliação inicial.'] });
      if (v.inctipo === 'ind') return fuBuild(v, 'Incidentaloma indeterminado (não operado)', [{ ex: 'Repetir imagem (TC sem contraste ou RM com shift químico)', meses: [6, 12] }, { ex: 'Reavaliação hormonal se crescimento ou clínica', meses: [12] }], { interp: 'ESE/ENSAT 2023: lesão indeterminada que não vai à cirurgia — repetir imagem em 6–12 meses; crescimento > 20% (e ≥ 5 mm) ou mudança de características indica cirurgia; alternativa: outro método (RM, PET-FDG) ou discussão multidisciplinar.', avisos: ['Lesões > 4 cm indeterminadas: considerar ressecção, sobretudo em jovens.'] });
      return fuBuild(v, 'Incidentaloma com MACS (secreção autônoma leve de cortisol)', [{ ex: 'Consulta anual: pressão, glicemia/HbA1c, lipídios, densidade óssea, peso', meses: range(12, 60, 12) }, { ex: 'DEXA', meses: [0, 24, 48] }], { interp: 'ESE/ENSAT 2023: MACS (cortisol pós-dexametasona > 1,8 µg/dL) sem cirurgia — reavaliação clínica anual das comorbidades relacionadas ao cortisol; não repetir testes hormonais de rotina, salvo mudança clínica; cirurgia individualizada se comorbidades progressivas em < 60–70 anos.', avisos: ['Imagem não precisa ser repetida se a lesão for benigna na avaliação inicial.'] });
    },
    notas: ['Datas contadas a partir da cirurgia (ACC, feocromocitoma) ou da imagem inicial (incidentaloma).'],
    fontes: [FU.acc, FU.inc, FU.ppgl],
  },
};
const FOLLOWUP_ORDER = ['seg_prostata', 'seg_bexiga', 'seg_tus', 'seg_rim', 'seg_testiculo', 'seg_penis', 'seg_adrenal'];

// Toxicidade e ajustes: irAE por grau CTCAE (imunoterapia), toxicidade de TKI, elegibilidade à cisplatina/Calvert, ajustes renais/hepáticos e interações.
const TOX_SRC = {
  asco: { t: 'ASCO Guideline — Management of immune-related adverse events (Schneider BJ et al., J Clin Oncol 2021;39:4073)', u: 'https://pubmed.ncbi.nlm.nih.gov/34724392/' },
  nccn: { t: 'NCCN Guidelines — Management of Immunotherapy-Related Toxicities v1.2026', u: 'https://www.nccn.org/guidelines/guidelines-detail?category=3&id=1486' },
  esmo: { t: 'ESMO Clinical Practice Guideline — Management of toxicities from immunotherapy (Haanen J et al., Ann Oncol 2022)', u: 'https://pubmed.ncbi.nlm.nih.gov/36270461/' },
  ctcae: { t: 'CTCAE v5.0 (NCI, 2017)', u: 'https://ctep.cancer.gov/protocoldevelopment/electronic_applications/ctc.htm' },
  bula: { t: 'Bulas ANVISA / FDA Prescribing Information dos fármacos citados (ajustes de dose e interações)', u: 'https://consultas.anvisa.gov.br/#/bulario/' },
  galsky: { t: 'Galsky MD et al. Treatment of patients with metastatic urothelial cancer "unfit" for cisplatin. Lancet Oncol 2011;12:211', u: 'https://pubmed.ncbi.nlm.nih.gov/21376284/' },
  ckd: { t: 'Inker LA et al. New creatinine- and cystatin C–based equations (CKD-EPI 2021). N Engl J Med 2021;385:1737', u: 'https://pubmed.ncbi.nlm.nih.gov/34554658/' },
  calvert: { t: 'Calvert AH et al. Carboplatin dosage: prospective evaluation of a simple formula based on renal function. J Clin Oncol 1989;7:1748', u: 'https://pubmed.ncbi.nlm.nih.gov/2681557/' },
  eau: { t: 'EAU Guidelines 2026 (próstata, bexiga, rim — seções de tratamento sistêmico)', u: 'https://uroweb.org/guidelines' },
};
const tY = (v) => v !== undefined && v !== '';
const tSeg = (id, l, opts, extra) => Object.assign({ id, l, tipo: 'seg', opts, col: 1 }, extra || {});
const tO = (v, l, s) => ({ v, l, s });
const GRAUS = [tO('1', 'Grau 1', 'leve'), tO('2', 'Grau 2', 'moderado'), tO('3', 'Grau 3', 'grave'), tO('4', 'Grau 4', 'ameaça à vida')];
const TAPER = 'Desmame do corticoide em ≥ 4–6 semanas após melhora para ≤ grau 1; com prednisona ≥ 20 mg/dia por > 4 semanas: profilaxia de Pneumocystis (SMX-TMP), proteção gástrica, cálcio/vitamina D e vigilância de glicemia.';

// ——— irAE: definições CTCAE e manejo por grau (ASCO 2021 / NCCN / ESMO) ———
const IRAE = {
  pele: { nome: 'Pele — rash maculopapular / prurido', ctcae: ['< 10% da superfície corporal, sem sintomas', '10–30% da superfície corporal ou prurido com sintomas, limita atividades instrumentais', '> 30% da superfície corporal ou limita autocuidado; prurido intenso', 'Reação bolhosa / SJS-NET / DRESS: descamação, mucosas, ameaça à vida'],
    g: [
      { io: 'Manter', cort: 'Corticoide tópico de média potência + anti-histamínico oral; emoliente', obs: 'Fotoproteção. Excluir outras causas (fármacos, infecção).' },
      { io: 'Manter (considerar suspender se persistente)', cort: 'Corticoide tópico de alta potência; se sem melhora em 1–2 semanas, prednisona 0,5–1 mg/kg/dia', obs: 'Dermatologia se dúvida; biópsia se atípico. Lesões bolhosas ou acometimento de mucosa: tratar como grau 3.' },
      { io: 'Suspender até ≤ grau 1', cort: 'Prednisona/metilprednisolona 1 mg/kg/dia com desmame em 4 semanas', obs: 'Dermatologia; biópsia. Retomar a imunoterapia após resolução, com dermatologia de apoio.' },
      { io: 'Descontinuar definitivamente', cort: 'Metilprednisolona IV 1–2 mg/kg/dia; internação (unidade de queimados se SJS/NET)', obs: 'Dermatologia urgente; suspender outros fármacos suspeitos; IVIG/ciclosporina em SJS-NET conforme especialista.' },
    ] },
  colite: { nome: 'Colite / diarreia', ctcae: ['< 4 evacuações/dia acima do basal', '4–6 evacuações/dia acima do basal; dor abdominal, muco ou sangue', '≥ 7 evacuações/dia, incontinência, hospitalização, limita autocuidado', 'Perfuração, megacólon, risco de vida'],
    g: [
      { io: 'Manter (ou suspender temporariamente)', cort: 'Não; hidratação, dieta; loperamida só após excluir infecção', obs: 'Coprocultura, C. difficile, calprotectina; monitorar diariamente — a progressão pode ser rápida.' },
      { io: 'Suspender; retomar após ≤ grau 1', cort: 'Prednisona 1 mg/kg/dia se sem melhora em 2–3 dias (ou de imediato se sangue/dor); budesonida é alternativa em casos leves', obs: 'Colonoscopia/sigmoidoscopia com biópsia; excluir CMV. Com anti-CTLA-4: descontinuar o anti-CTLA-4 definitivamente.' },
      { io: 'Suspender; anti-CTLA-4 definitivamente', cort: 'Metilprednisolona IV 1–2 mg/kg/dia; sem resposta em 3 dias → infliximabe 5 mg/kg (repetir em 2 semanas) ou vedolizumabe', obs: 'Internar; TC de abdome se dor; colonoscopia precoce. Anti-PD-1 pode ser retomado após resolução em casos selecionados.' },
      { io: 'Descontinuar definitivamente', cort: 'Metilprednisolona IV 1–2 mg/kg/dia + infliximabe/vedolizumabe precoce', obs: 'Cirurgia se perfuração/megacólon; nutrição; gastroenterologia.' },
    ] },
  hepatite: { nome: 'Hepatite (AST/ALT ± bilirrubina)', ctcae: ['AST/ALT > LSN a 3× LSN', 'AST/ALT > 3–5× LSN', 'AST/ALT > 5–20× LSN ou bilirrubina > 3× LSN', 'AST/ALT > 20× LSN; insuficiência hepática'],
    g: [
      { io: 'Manter', cort: 'Não', obs: 'Repetir provas hepáticas 1–2×/semana; excluir hepatites virais, álcool, outros fármacos, metástase.' },
      { io: 'Suspender; retomar após ≤ grau 1', cort: 'Prednisona 0,5–1 mg/kg/dia se persistente (> 3–5 dias) ou em elevação', obs: 'Provas hepáticas 2–3×/semana; sorologias, autoanticorpos, US/TC. Hepatologia se bilirrubina alterada.' },
      { io: 'Descontinuar (anti-CTLA-4 sempre); retomada de anti-PD-1 só em casos selecionados', cort: 'Metilprednisolona IV 1–2 mg/kg/dia; sem resposta em 3 dias → micofenolato 1 g 2×/dia (NÃO usar infliximabe: hepatotóxico)', obs: 'Internar; biópsia hepática se dúvida; hepatologia. Provas diárias.' },
      { io: 'Descontinuar definitivamente', cort: 'Metilprednisolona IV 2 mg/kg/dia + micofenolato; tacrolimo/ATG em refratários', obs: 'UTI/hepatologia; transplante excepcional.' },
    ] },
  pneumonite: { nome: 'Pneumonite', ctcae: ['Alteração radiológica assintomática', 'Sintomática, limita atividades instrumentais', 'Grave, limita autocuidado; necessidade de oxigênio', 'Insuficiência respiratória; intubação'],
    g: [
      { io: 'Suspender; retomar se resolução radiológica', cort: 'Não', obs: 'Repetir TC em 3–4 semanas; oximetria; excluir infecção/progressão.' },
      { io: 'Suspender; retomar após ≤ grau 1 com cautela', cort: 'Prednisona 1–2 mg/kg/dia; sem melhora em 48–72 h → tratar como grau 3', obs: 'Broncoscopia com lavado se dúvida; antibiótico empírico até excluir infecção; pneumologia.' },
      { io: 'Descontinuar definitivamente', cort: 'Metilprednisolona IV 1–2 mg/kg/dia; sem melhora em 48 h → infliximabe, micofenolato ou IVIG', obs: 'Internar; oxigênio; broncoscopia; pneumologia e UTI.' },
      { io: 'Descontinuar definitivamente', cort: 'Metilprednisolona IV 2 mg/kg/dia + imunossupressão adicional', obs: 'UTI; ventilação.' },
    ] },
  tireoide: { nome: 'Tireoide — hipotireoidismo / tireoidite', ctcae: ['TSH alterado assintomático', 'Sintomático; limita atividades instrumentais', 'Grave; limita autocuidado; hospitalização', 'Mixedema / tempestade tireoidiana'],
    g: [
      { io: 'Manter', cort: 'Não', obs: 'TSH e T4 livre a cada 4–6 semanas. Levotiroxina se TSH > 10 ou sintomas. Hipertireoidismo transitório da tireoidite: betabloqueador; tende a evoluir para hipotireoidismo.' },
      { io: 'Manter (suspender se muito sintomático)', cort: 'Não (prednisona 1 mg/kg apenas na tireoidite dolorosa)', obs: 'Levotiroxina 1,6 µg/kg/dia (menos em idosos/cardiopatas); excluir hipofisite (TSH baixo com T4 livre baixo → cortisol antes de repor).' },
      { io: 'Suspender até estabilizar', cort: 'Não (metimazol/betabloqueador no hipertireoidismo persistente)', obs: 'Endocrinologia; internar se instável.' },
      { io: 'Suspender até estabilizar', cort: 'Hidrocortisona IV se suspeita de insuficiência adrenal concomitante', obs: 'UTI; endocrinologia.' },
    ] },
  hipofisite: { nome: 'Hipofisite / insuficiência adrenal', ctcae: ['Assintomático ou leve (laboratorial)', 'Sintomas moderados (cefaleia, fadiga)', 'Sintomas graves; hiponatremia; hospitalização', 'Crise adrenal; hipotensão; risco de vida'],
    g: [
      { io: 'Manter (suspender até reposição ajustada)', cort: 'Hidrocortisona 10–20 mg manhã + 5–10 mg tarde (reposição fisiológica)', obs: 'Dosar cortisol 8 h, ACTH, TSH/T4L, LH/FSH/testosterona; RM de sela. Repor cortisol ANTES da levotiroxina.' },
      { io: 'Suspender até ajuste; retomar com reposição', cort: 'Reposição fisiológica; prednisona 1 mg/kg só se cefaleia intensa/efeito de massa', obs: 'Endocrinologia; educar sobre dose de estresse; cartão de alerta.' },
      { io: 'Suspender', cort: 'Hidrocortisona IV 100 mg + 50 mg 6/6 h; corrigir sódio', obs: 'Internar; endocrinologia. A deficiência de ACTH costuma ser permanente — reposição vitalícia.' },
      { io: 'Suspender', cort: 'Hidrocortisona IV 100 mg bolus + 200 mg/24 h; volume', obs: 'UTI; excluir sepse concomitante.' },
    ] },
  diabetes: { nome: 'Diabetes mellitus imune (tipo 1 fulminante)', ctcae: ['Glicemia de jejum > LSN a 160 mg/dL', '160–250 mg/dL', '> 250–500 mg/dL; hospitalização', '> 500 mg/dL; cetoacidose; risco de vida'],
    g: [
      { io: 'Manter', cort: 'Não', obs: 'Glicemia e HbA1c; orientar sinais de cetoacidose.' },
      { io: 'Manter (suspender se cetose)', cort: 'Não (corticoide piora a glicemia)', obs: 'Iniciar insulina; peptídeo C e anticorpos (GAD) para confirmar DM1; endocrinologia.' },
      { io: 'Suspender até controle', cort: 'Não', obs: 'Insulina basal-bolus; internar se cetoacidose; retomar a imunoterapia após controle (o diabetes é permanente).' },
      { io: 'Suspender até controle', cort: 'Não', obs: 'Protocolo de cetoacidose; UTI; retomar após estabilização.' },
    ] },
  nefrite: { nome: 'Nefrite (elevação de creatinina)', ctcae: ['Creatinina > LSN a 1,5× o basal', '1,5–3× o basal', '> 3–6× o basal', '> 6× o basal; diálise'],
    g: [
      { io: 'Manter (ou suspender se em elevação)', cort: 'Não', obs: 'Excluir desidratação, contraste, AINE, IBP, obstrução, outros nefrotóxicos; sedimento urinário, proteinúria.' },
      { io: 'Suspender; retomar após ≤ grau 1', cort: 'Prednisona 0,5–1 mg/kg/dia se sem outra causa; se sem melhora em 1 semana → 1–2 mg/kg', obs: 'Nefrologia; biópsia renal se dúvida (nefrite intersticial é o padrão típico).' },
      { io: 'Descontinuar definitivamente (retomada excepcional)', cort: 'Metilprednisolona IV 1–2 mg/kg/dia; micofenolato se refratário', obs: 'Internar; nefrologia; biópsia.' },
      { io: 'Descontinuar definitivamente', cort: 'Metilprednisolona IV 1–2 mg/kg/dia + micofenolato', obs: 'UTI; diálise se necessário.' },
    ] },
  miocardite: { nome: 'Miocardite', ctcae: ['Troponina/ECG alterados assintomáticos', 'Sintomas leves ao esforço', 'Sintomas graves em repouso; arritmia; insuficiência cardíaca', 'Choque cardiogênico; arritmia maligna'],
    g: [
      { io: 'Suspender (qualquer grau); descontinuar se confirmada', cort: 'Metilprednisolona IV 1–2 mg/kg/dia; se troponina em elevação, pulso 1 g/dia por 3–5 dias', obs: 'Troponina, BNP, ECG, ecocardiograma, RM cardíaca; cardiologia urgente; monitorização; miosite e miastenia associadas (CK, anti-AChR).' },
      { io: 'Descontinuar definitivamente', cort: 'Metilprednisolona IV pulso 1 g/dia por 3–5 dias, depois 1–2 mg/kg', obs: 'Internar em unidade monitorizada; sem resposta em 24–48 h → abatacepte, ATG, micofenolato ou IVIG.' },
      { io: 'Descontinuar definitivamente', cort: 'Pulso 1 g/dia por 3–5 dias + abatacepte/ATG', obs: 'UTI cardiológica; suporte circulatório; mortalidade alta (até 50%).' },
      { io: 'Descontinuar definitivamente', cort: 'Pulso 1 g/dia + abatacepte/ATG; plasmaférese', obs: 'UTI; suporte mecânico.' },
    ] },
  neuro: { nome: 'Neurológica — miastenia, Guillain-Barré, encefalite, neuropatia', ctcae: ['Assintomático ou sintomas leves', 'Sintomas moderados; limita atividades instrumentais', 'Grave; limita autocuidado; fraqueza bulbar/respiratória', 'Risco de vida; insuficiência respiratória'],
    g: [
      { io: 'Manter com monitorização (neuropatia leve); suspender se miastenia/GBS', cort: 'Não', obs: 'Neurologia; anti-AChR, EMG, RM de encéfalo/líquor conforme síndrome; excluir metástase e infecção.' },
      { io: 'Suspender', cort: 'Prednisona 0,5–1 mg/kg/dia (miastenia: piridostigmina + prednisona; GBS: IVIG ou plasmaférese — corticoide isolado não é eficaz)', obs: 'Internar se miastenia/GBS; capacidade vital e deglutição; evitar fármacos que agravam miastenia.' },
      { io: 'Descontinuar definitivamente', cort: 'Metilprednisolona IV 1–2 mg/kg/dia + IVIG 2 g/kg em 5 dias ou plasmaférese', obs: 'UTI se bulbar/respiratório; rituximabe em refratários; encefalite: aciclovir empírico até excluir HSV.' },
      { io: 'Descontinuar definitivamente', cort: 'Pulso de metilprednisolona + IVIG/plasmaférese', obs: 'UTI; ventilação.' },
    ] },
  artrite: { nome: 'Artrite / reumatológica', ctcae: ['Dor leve com inflamação', 'Dor moderada; limita atividades instrumentais', 'Dor intensa; dano articular; limita autocuidado', '—'],
    g: [
      { io: 'Manter', cort: 'AINE (se não contraindicado); analgesia', obs: 'FAN, FR, anti-CCP, VHS/PCR; reumatologia se persistente.' },
      { io: 'Manter; suspender se não controlar', cort: 'Prednisona 10–20 mg/dia (ou intra-articular); escalonar se sem resposta', obs: 'Reumatologia; se precisar de corticoide por > 6–8 semanas, iniciar poupador (metotrexato, sulfassalazina).' },
      { io: 'Suspender; retomar após controle', cort: 'Prednisona 1 mg/kg/dia; sem resposta em 2 semanas → anti-TNF (infliximabe) ou anti-IL-6 (tocilizumabe)', obs: 'Reumatologia; fisioterapia; a artrite pode persistir após parar a imunoterapia.' },
      { io: '—', cort: '—', obs: 'Grau 4 não se aplica a artrite no CTCAE.' },
    ] },
  hemato: { nome: 'Hematológica — anemia hemolítica, plaquetopenia, neutropenia imunes', ctcae: ['Hb < LIN a 10 g/dL; plaquetas < LIN a 75.000; neutrófilos < LIN a 1.500', 'Hb 8–10; plaquetas 50–75.000; neutrófilos 1.000–1.500', 'Hb < 8 ou transfusão; plaquetas 25–50.000; neutrófilos 500–1.000', 'Risco de vida; plaquetas < 25.000; neutrófilos < 500'],
    g: [
      { io: 'Manter', cort: 'Não', obs: 'Hemograma, reticulócitos, Coombs, haptoglobina, LDH, B12/folato; excluir infiltração medular e outros fármacos.' },
      { io: 'Suspender; retomar após ≤ grau 1', cort: 'Prednisona 0,5–1 mg/kg/dia (hemólise/plaquetopenia imunes)', obs: 'Hematologia; mielograma se citopenias combinadas.' },
      { io: 'Suspender; descontinuar se recorrente', cort: 'Metilprednisolona IV 1–2 mg/kg/dia; IVIG na plaquetopenia; rituximabe em refratários', obs: 'Transfusão conforme indicação; G-CSF na neutropenia; investigar HLH (ferritina, triglicerídeos, fibrinogênio).' },
      { io: 'Descontinuar definitivamente', cort: 'Metilprednisolona IV 1–2 mg/kg/dia + IVIG/rituximabe', obs: 'UTI; hematologia; HLH: etoposídeo/anakinra conforme protocolo.' },
    ] },
  infusao: { nome: 'Reação infusional', ctcae: ['Leve, transitória; não precisa interromper', 'Interrupção da infusão com resposta rápida ao tratamento sintomático', 'Prolongada; recorre após tratamento; hospitalização', 'Anafilaxia; risco de vida'],
    g: [
      { io: 'Manter; reduzir velocidade', cort: 'Anti-histamínico; antitérmico', obs: 'Observar.' },
      { io: 'Interromper; retomar a 50% da velocidade após resolução', cort: 'Anti-histamínico + corticoide IV (hidrocortisona 100 mg); pré-medicação nas próximas infusões', obs: 'Monitorização.' },
      { io: 'Descontinuar definitivamente', cort: 'Adrenalina se broncoespasmo/hipotensão; corticoide e anti-histamínico IV', obs: 'Suporte; considerar troca de agente da mesma classe com dessensibilização apenas com especialista.' },
      { io: 'Descontinuar definitivamente', cort: 'Adrenalina IM 0,5 mg; protocolo de anafilaxia', obs: 'UTI.' },
    ] },
};
const IRAE_ORDER = ['pele', 'colite', 'hepatite', 'pneumonite', 'tireoide', 'hipofisite', 'diabetes', 'nefrite', 'miocardite', 'neuro', 'artrite', 'hemato', 'infusao'];

// ——— TKI / terapia-alvo: toxicidades e manejo ———
const TKIS = {
  cabozantinibe: { nome: 'Cabozantinibe', dose: '60 mg 1×/dia em jejum (40 mg com nivolumabe)', escala: '60 → 40 → 20 mg', renal: 'Leve/moderada: sem ajuste; grave (ClCr < 30): não estudado — usar com cautela', hepatico: 'Leve: sem ajuste; moderada (Child B): 40 mg; grave: evitar', inter: ['Inibidores fortes de CYP3A4 (cetoconazol, itraconazol, claritromicina, ritonavir): reduzir 20 mg (ex.: 60 → 40); evitar toranja', 'Indutores fortes de CYP3A4 (rifampicina, fenitoína, carbamazepina, erva-de-são-joão): aumentar 20 mg (máx. 80) ou evitar', 'Bifosfonato/denosumabe: risco de osteonecrose de mandíbula — avaliação odontológica', 'Anticoagulantes: maior risco de sangramento (não é interação metabólica, é aditiva)'], cir: 'Suspender ≥ 3 semanas antes de cirurgia eletiva; retomar após cicatrização completa', tox: ['hipertensao', 'hfs', 'diarreia', 'hepato', 'proteinuria', 'mucosite', 'fadiga', 'tireoide_tki', 'sangramento', 'cardio'] },
  sunitinibe: { nome: 'Sunitinibe', dose: '50 mg 1×/dia, 4 semanas sim / 2 não (alternativa 2/1 para tolerância)', escala: '50 → 37,5 → 25 mg', renal: 'Sem ajuste (incluindo diálise — menor exposição)', hepatico: 'Child A/B: sem ajuste; Child C: não estudado', inter: ['Inibidores fortes de CYP3A4: reduzir para 37,5 mg', 'Indutores fortes de CYP3A4: aumentar até 87,5 mg ou evitar', 'Fármacos que prolongam QT: ECG; evitar associação', 'Toranja: evitar'], cir: 'Suspender ≥ 1 semana antes; retomar após cicatrização', tox: ['hipertensao', 'hfs', 'diarreia', 'hepato', 'mucosite', 'fadiga', 'tireoide_tki', 'cardio', 'sangramento', 'hemato_tki'] },
  pazopanibe: { nome: 'Pazopanibe', dose: '800 mg 1×/dia em jejum (1 h antes ou 2 h após refeição)', escala: '800 → 600 → 400 mg', renal: 'Sem ajuste (ClCr ≥ 30); < 30: não estudado', hepatico: 'Leve: sem ajuste; moderada (Child B ou bilirrubina 1,5–3× LSN): 200 mg/dia; grave: não recomendado', inter: ['Inibidores fortes de CYP3A4: reduzir para 400 mg', 'Indutores fortes de CYP3A4: evitar', 'Inibidores de bomba de prótons / antiácidos reduzem a absorção: evitar IBP; se inevitável, tomar pazopanibe com alimento à noite ou separar de antiácido ≥ 2 h', 'Sinvastatina: maior risco de elevação de ALT', 'Fármacos que prolongam QT: ECG; evitar'], cir: 'Suspender ≥ 7 dias antes; retomar após cicatrização', tox: ['hipertensao', 'hepato', 'diarreia', 'hfs', 'fadiga', 'tireoide_tki', 'cardio', 'sangramento', 'proteinuria'] },
  axitinibe: { nome: 'Axitinibe', dose: '5 mg 2×/dia (com pembrolizumabe ou avelumabe: 5 mg 2×/dia); titular para 7 e 10 mg 2×/dia se tolerado por 2 semanas (PA ≤ 150/90, sem EA > grau 2, sem anti-hipertensivo)', escala: '10 → 7 → 5 → 3 → 2 mg 2×/dia', renal: 'Sem ajuste (ClCr ≥ 15); terminal: cautela', hepatico: 'Leve: sem ajuste; moderada (Child B): reduzir à metade; grave: não estudado', inter: ['Inibidores fortes de CYP3A4: reduzir à metade; toranja', 'Indutores fortes de CYP3A4: evitar', 'Com pembrolizumabe: hepatotoxicidade mais frequente — provas hepáticas a cada ciclo; na elevação, distinguir irAE (corticoide) de TKI (suspender/reduzir)'], cir: 'Suspender ≥ 2 dias antes (meia-vida curta); retomar após cicatrização', tox: ['hipertensao', 'diarreia', 'hfs', 'hepato', 'fadiga', 'tireoide_tki', 'proteinuria', 'mucosite', 'sangramento'] },
  lenvatinibe: { nome: 'Lenvatinibe', dose: '20 mg 1×/dia com pembrolizumabe; 18 mg 1×/dia com everolimo 5 mg', escala: 'Com pembrolizumabe: 20 → 14 → 10 → 8 mg; com everolimo: 18 → 14 → 10 → 8 mg', renal: 'Leve/moderada: sem ajuste; grave (ClCr < 30): 10 mg/dia (com pembrolizumabe); terminal: não estudado', hepatico: 'Leve/moderada: sem ajuste; grave (Child C): 10 mg/dia', inter: ['Pouca interação metabólica clinicamente relevante (CYP3A4/P-gp menores); fármacos que prolongam QT: ECG', 'Com everolimo: somar interações do everolimo (CYP3A4/P-gp)'], cir: 'Suspender ≥ 1 semana antes; retomar após cicatrização', tox: ['hipertensao', 'diarreia', 'proteinuria', 'hfs', 'fadiga', 'hepato', 'tireoide_tki', 'mucosite', 'cardio', 'sangramento'] },
  tivozanibe: { nome: 'Tivozanibe', dose: '1,34 mg 1×/dia, 3 semanas sim / 1 não', escala: '1,34 → 0,89 mg', renal: 'Sem ajuste (leve/moderada); grave: cautela', hepatico: 'Leve: sem ajuste; moderada: 0,89 mg 1×/dia; grave: evitar', inter: ['Indutores fortes de CYP3A4: evitar', 'Inibidores de CYP3A4: sem ajuste formal; monitorar'], cir: 'Suspender ≥ 1 semana antes', tox: ['hipertensao', 'fadiga', 'diarreia', 'hfs', 'proteinuria', 'tireoide_tki', 'mucosite'] },
  everolimo: { nome: 'Everolimo (com lenvatinibe)', dose: '5 mg 1×/dia com lenvatinibe (10 mg em monoterapia)', escala: '5 → 2,5 mg', renal: 'Sem ajuste', hepatico: 'Child A: 7,5 mg (mono) ; Child B: 5 mg; Child C: 2,5 mg se benefício superar risco', inter: ['Inibidores fortes de CYP3A4/P-gp (cetoconazol, claritromicina, ritonavir): evitar; moderados (verapamil, diltiazem, fluconazol): reduzir a 2,5 mg', 'Indutores fortes: aumentar (até 20 mg) ou evitar', 'Vacinas vivas: evitar'], cir: 'Suspender ≥ 1 semana antes (cicatrização)', tox: ['mucosite', 'pneumonite_tki', 'hiperglicemia', 'infeccao', 'fadiga', 'hemato_tki'] },
  belzutifano: { nome: 'Belzutifano', dose: '120 mg 1×/dia', escala: '120 → 80 → 40 mg', renal: 'Leve/moderada: sem ajuste; grave: não estudado', hepatico: 'Leve: sem ajuste; moderada/grave: não estudado', inter: ['Inibidores de UGT2B17 e CYP2C19 aumentam a exposição (monitorar anemia/hipóxia)', 'Reduz a exposição de substratos de CYP3A4 — contraceptivos hormonais podem falhar; usar método não hormonal', 'Embriotoxicidade: contracepção'], cir: 'Sem recomendação específica; suspender se hipóxia', tox: ['anemia_hif', 'hipoxia', 'fadiga'] },
};
const TKI_TOX = {
  hipertensao: { nome: 'Hipertensão', ctcae: ['PAS 120–139 ou PAD 80–89', 'PAS 140–159 ou PAD 90–99; ou necessidade de 1 anti-hipertensivo', 'PAS ≥ 160 ou PAD ≥ 100; > 1 fármaco ou aumento de dose', 'Crise hipertensiva; risco de vida (encefalopatia, dissecção)'],
    g: ['Manter; medir PA semanalmente nas 6 primeiras semanas', 'Manter; iniciar/otimizar anti-hipertensivo (IECA/BRA ou anlodipino; evitar diltiazem/verapamil com TKI metabolizados por CYP3A4); reavaliar em 1–2 semanas', 'Suspender até PA controlada (< 150/90) com ajuste de anti-hipertensivos; retomar com 1 nível de redução; se recorrer, reduzir novamente', 'Descontinuar definitivamente; internar'] },
  hfs: { nome: 'Síndrome mão-pé (eritrodisestesia palmo-plantar)', ctcae: ['Alterações mínimas (eritema, edema, hiperceratose) sem dor', 'Alterações com dor; limita atividades instrumentais', 'Alterações graves (descamação, bolhas, fissuras) com dor; limita autocuidado', '—'],
    g: ['Manter; emolientes/ureia 10–20%, remover calosidades, evitar atrito/calor, calçados confortáveis', 'Suspender até ≤ grau 1 (ou manter com dose reduzida); corticoide tópico de alta potência, lidocaína tópica, analgesia; retomar na mesma dose ou 1 nível abaixo', 'Suspender até ≤ grau 1; retomar com 1 nível de redução; se recorrer grau 3, nova redução ou descontinuar', '—'] },
  diarreia: { nome: 'Diarreia', ctcae: ['< 4 evacuações/dia acima do basal', '4–6 evacuações/dia acima do basal', '≥ 7/dia; incontinência; hospitalização; limita autocuidado', 'Risco de vida'],
    g: ['Manter; loperamida 4 mg + 2 mg a cada evacuação (máx. 16 mg/dia), dieta pobre em resíduos, hidratação', 'Manter com loperamida; se persistir > 48 h, suspender até ≤ grau 1 e retomar na mesma dose ou reduzida', 'Suspender até ≤ grau 1; hidratação IV se necessário; excluir infecção; retomar com 1 nível de redução', 'Descontinuar; internar'] },
  hepato: { nome: 'Hepatotoxicidade (AST/ALT, bilirrubina)', ctcae: ['AST/ALT > LSN a 3× LSN', '> 3–5× LSN', '> 5–20× LSN', '> 20× LSN'],
    g: ['Manter; provas hepáticas semanais (pazopanibe/axitinibe+pembro: a cada 2 semanas nos 2 primeiros meses)', 'Manter com provas semanais; se bilirrubina > 2× LSN junto com ALT > 3× (lei de Hy): descontinuar definitivamente', 'Suspender até ≤ grau 1; retomar com redução (pazopanibe 400 mg); se recorrer ALT > 3×, descontinuar. Com imunoterapia associada: considerar irAE (corticoide) após excluir TKI', 'Descontinuar definitivamente'] },
  proteinuria: { nome: 'Proteinúria', ctcae: ['1+ na fita ou < 1 g/24 h', '2+ ou 1–3,4 g/24 h', '≥ 3,5 g/24 h (nefrótica)', '—'],
    g: ['Manter; relação proteína/creatinina urinária a cada ciclo', 'Manter se < 2 g/24 h; ≥ 2 g/24 h: suspender até < 2 g e retomar com 1 nível de redução', 'Suspender; se síndrome nefrótica, descontinuar definitivamente; nefrologia', '—'] },
  mucosite: { nome: 'Mucosite / estomatite', ctcae: ['Assintomática ou leve', 'Dor moderada; dieta modificada', 'Dor intensa; interfere na ingestão oral', 'Risco de vida'],
    g: ['Manter; higiene oral, bochecho com bicarbonato, evitar álcool/pimenta', 'Manter; enxaguatório com dexametasona 0,5 mg/5 mL (everolimo) ou lidocaína viscosa; analgesia; se persistir, suspender até ≤ grau 1', 'Suspender até ≤ grau 1; retomar com 1 nível de redução', 'Descontinuar'] },
  fadiga: { nome: 'Fadiga', ctcae: ['Leve', 'Moderada; limita atividades instrumentais', 'Grave; limita autocuidado', '—'],
    g: ['Manter; excluir hipotireoidismo, anemia, depressão, hipogonadismo', 'Manter; tratar causas; considerar esquema 2/1 (sunitinibe) ou redução de dose', 'Suspender até ≤ grau 1; retomar com 1 nível de redução', '—'] },
  tireoide_tki: { nome: 'Hipotireoidismo induzido por TKI', ctcae: ['TSH elevado assintomático', 'Sintomático', 'Grave', 'Mixedema'],
    g: ['Manter; TSH a cada 4 semanas nos 4 primeiros meses, depois a cada 2–3 meses', 'Manter; levotiroxina (não é motivo de suspender)', 'Suspender até compensar; endocrinologia', 'Suspender; UTI'] },
  sangramento: { nome: 'Sangramento / fístula / perfuração', ctcae: ['Leve, sem intervenção', 'Moderado; intervenção mínima', 'Transfusão; intervenção invasiva', 'Risco de vida'],
    g: ['Manter; investigar fonte', 'Suspender até resolver; avaliar retomada com redução', 'Suspender; retomar só após resolução completa e avaliação de risco (fístula/perfuração: descontinuar)', 'Descontinuar definitivamente'] },
  cardio: { nome: 'Cardiotoxicidade (queda de FEVE, QT longo, isquemia)', ctcae: ['FEVE 50–55% assintomático / QTc 450–480 ms', 'FEVE 40–50% / QTc 481–500 ms', 'FEVE < 40% ou sintomático / QTc > 500 ms', 'Insuficiência cardíaca refratária; torsades'],
    g: ['Manter; ecocardiograma/ECG seriados; corrigir K/Mg', 'Suspender até avaliação; cardiologia; retomar com redução se recuperar', 'Suspender; cardiologia; retomar só com recuperação e redução (QTc > 500: suspender até < 480)', 'Descontinuar definitivamente'] },
  hemato_tki: { nome: 'Mielotoxicidade (neutropenia, plaquetopenia)', ctcae: ['Neutrófilos 1.500–LIN; plaquetas 75.000–LIN', '1.000–1.500 / 50–75.000', '500–1.000 / 25–50.000', '< 500 / < 25.000'],
    g: ['Manter', 'Manter; hemograma semanal', 'Suspender até ≤ grau 2; retomar com 1 nível de redução', 'Suspender; retomar com redução após recuperação; descontinuar se recorrente'] },
  pneumonite_tki: { nome: 'Pneumonite não infecciosa (inibidor de mTOR)', ctcae: ['Radiológica assintomática', 'Sintomática; limita atividades instrumentais', 'Grave; oxigênio', 'Risco de vida'],
    g: ['Manter; TC em 4 semanas', 'Suspender até ≤ grau 1; considerar corticoide; retomar com redução', 'Suspender; corticoide; descontinuar se recorrer', 'Descontinuar'] },
  hiperglicemia: { nome: 'Hiperglicemia (mTOR)', ctcae: ['> LSN–160 mg/dL', '160–250', '> 250–500', '> 500'],
    g: ['Manter; otimizar antidiabético', 'Manter; endocrinologia; metformina/insulina', 'Suspender até < 250; retomar com redução', 'Descontinuar; internar'] },
  infeccao: { nome: 'Infecção (imunossupressão por mTOR)', ctcae: ['Localizada', 'Oral/sistêmica, tratamento ambulatorial', 'IV; hospitalização', 'Sepse; risco de vida'],
    g: ['Manter; tratar', 'Manter; tratar; reavaliar', 'Suspender até resolução; profilaxia (PJP se corticoide); reativação de hepatite B — sorologia basal', 'Descontinuar'] },
  anemia_hif: { nome: 'Anemia (inibidor de HIF-2α)', ctcae: ['Hb < LIN a 10 g/dL', '8–10 g/dL', '< 8 g/dL; transfusão', 'Risco de vida'],
    g: ['Manter; hemograma a cada 2–4 semanas', 'Manter; investigar ferro/B12; eritropoetina não é recomendada de rotina (ESA só se Hb < 8 e benefício claro)', 'Suspender até Hb ≥ 8; transfusão; retomar com redução (80 mg)', 'Descontinuar'] },
  hipoxia: { nome: 'Hipóxia (inibidor de HIF-2α)', ctcae: ['SpO2 < 92% ao esforço', '< 92% em repouso; oxigênio intermitente', 'Oxigênio contínuo; hospitalização', 'Risco de vida'],
    g: ['Manter; oximetria a cada visita', 'Suspender até resolução; retomar com redução', 'Suspender; retomar com redução ou descontinuar', 'Descontinuar'] },
};

// ——— fármacos hormonais, quimioterápicos, ADC/PARP/radioligante: ajustes e interações ———
const DRUGS = [
  { g: 'Hormonioterapia (próstata)', itens: [
    { nome: 'Abiraterona (+ prednisona 5 mg/dia)', dose: '1.000 mg 1×/dia em jejum (ou 500 mg com alimento, formulação de absorção otimizada); 1.000 mg + prednisona 5 mg 2×/dia no mCRPC, 5 mg 1×/dia no sensível à castração', renal: 'Sem ajuste', hepatico: 'Leve (Child A): sem ajuste; moderada (Child B): 250 mg/dia com provas hepáticas semanais no 1º mês e depois mensais; grave (Child C): não usar. ALT/AST > 5× LSN ou bilirrubina > 3×: suspender até ≤ grau 1 e retomar com 750 mg (depois 500); se recorrer com 500 mg, descontinuar', inter: ['Inibidor forte de CYP2D6: evitar substratos de janela estreita (tioridazina); cautela com metoprolol, tramadol, codeína, antidepressivos tricíclicos, dextrometorfano', 'Inibidor de CYP2C8: pioglitazona, repaglinida (↑ exposição)', 'Indutores fortes de CYP3A4 (rifampicina, fenitoína, carbamazepina): evitar; se inevitável, 1.000 mg 2×/dia durante a coadministração', 'Inibidores fortes de CYP3A4: sem ajuste, mas monitorar', 'Alimento aumenta a exposição até 10× (formulação convencional): sempre em jejum, 1 h antes ou 2 h após'], monitor: 'Pressão arterial, potássio e provas hepáticas a cada 2 semanas nos 3 primeiros meses e depois mensais (excesso de mineralocorticoide: hipertensão, hipocalemia, edema — eplerenona ou aumentar prednisona); glicemia; não suspender a prednisona abruptamente (insuficiência adrenal)', obs: 'Radio-223 + abiraterona: contraindicado (fraturas e óbito, ERA 223).' },
    { nome: 'Enzalutamida', dose: '160 mg 1×/dia', renal: 'Leve/moderada: sem ajuste; grave/terminal: não estudado (cautela)', hepatico: 'Leve a grave (Child A–C): sem ajuste', inter: ['Indutor FORTE de CYP3A4 e moderado de CYP2C9/2C19: reduz varfarina, apixabana/rivaroxabana, atorvastatina/sinvastatina, anlodipino, midazolam, fenitoína, contraceptivos — evitar substratos de janela estreita ou monitorar de perto (INR)', 'Inibidores fortes de CYP2C8 (gemfibrozila): reduzir para 80 mg', 'Inibidores fortes de CYP3A4 (itraconazol, cetoconazol): ↑ exposição — monitorar; redução não obrigatória', 'Indutores fortes de CYP3A4 (rifampicina): evitar (↓ enzalutamida)', 'Opioides metabolizados por CYP3A4 (fentanil, oxicodona, metadona): efeito reduzido'], monitor: 'Fadiga, hipertensão, quedas/fraturas, convulsão (evitar em epilepsia/lesão cerebral; dose ≤ 160 mg), disfunção cognitiva; PRES (raro)', obs: 'Toxicidade grau 3 ou intolerável: suspender 1 semana ou até ≤ grau 2 e retomar com 120 mg (depois 80).' },
    { nome: 'Apalutamida', dose: '240 mg 1×/dia', renal: 'Leve/moderada: sem ajuste; grave: não estudado', hepatico: 'Leve/moderada: sem ajuste; grave: não estudado', inter: ['Indutor forte de CYP3A4 e CYP2C19, moderado de CYP2C9; induz P-gp, BCRP, OATP1B1: reduz exposição de rivaroxabana/apixabana, varfarina, estatinas, anlodipino, fexofenadina, rosuvastatina — monitorar ou evitar', 'Inibidores fortes de CYP2C8 (gemfibrozila) e de CYP3A4: ↑ apalutamida — sem ajuste inicial; reduzir se intolerância', 'Fármacos que prolongam QT: ECG se risco'], monitor: 'Rash (até 25%: anti-histamínico/corticoide tópico; grau 3 → suspender até ≤ grau 1 e retomar com 180 mg, depois 120), hipotireoidismo (TSH a cada 3–4 meses), fraturas/quedas (DEXA, cálcio/vitamina D), convulsão', obs: 'Escala de redução: 240 → 180 → 120 mg.' },
    { nome: 'Darolutamida', dose: '600 mg 2×/dia com alimento', renal: 'Leve/moderada: sem ajuste; grave (eTFG 15–29): 300 mg 2×/dia', hepatico: 'Leve: sem ajuste; moderada (Child B): 300 mg 2×/dia; grave: não estudado', inter: ['Indutores combinados de P-gp e CYP3A4 fortes (rifampicina, carbamazepina, fenitoína, erva-de-são-joão): evitar (↓ darolutamida)', 'Inibidores combinados de P-gp e CYP3A4 fortes (itraconazol, ritonavir): ↑ exposição — monitorar', 'Inibe BCRP/OATP1B1/1B3: rosuvastatina ↑ 5× — usar a menor dose ou trocar de estatina; cautela com metotrexato, sulfassalazina'], monitor: 'Fadiga; menor penetração no SNC (menos convulsão/queda); provas hepáticas', obs: 'Toxicidade grau ≥ 3: suspender até melhora e retomar com 300 mg 2×/dia.' },
    { nome: 'Agonistas de LHRH (leuprorrelina, goserrelina, triptorrelina)', dose: 'Depósito mensal, trimestral ou semestral', renal: 'Sem ajuste', hepatico: 'Sem ajuste', inter: ['Fármacos que prolongam QT (metadona, amiodarona, antipsicóticos): ADT prolonga QT — ECG basal', 'Sem interações metabólicas relevantes'], monitor: 'Flare nas 2 primeiras semanas (cobrir com antiandrogênio em M1 sintomático/alto volume); testosterona em 3–6 meses (alvo < 50, ideal < 20 ng/dL); DEXA, glicemia/HbA1c, lipídios, PA; fogachos (venlafaxina, medroxiprogesterona); anemia, sarcopenia', obs: 'Antagonista injetável (degarelix) e relugolix evitam o flare.' },
    { nome: 'Relugolix', dose: '360 mg no 1º dia, depois 120 mg 1×/dia', renal: 'Leve/moderada: sem ajuste; grave: não estudado', hepatico: 'Leve/moderada: sem ajuste; grave: não estudado', inter: ['Inibidores de P-gp orais (eritromicina, claritromicina, verapamil, ciclosporina, cetoconazol): evitar; se inevitável, tomar relugolix primeiro e o inibidor ≥ 6 h depois (ou suspender o relugolix por até 2 semanas)', 'Indutores combinados de P-gp e CYP3A4 fortes (rifampicina): evitar; se inevitável, 240 mg/dia durante a coadministração e retomar 120 mg depois'], monitor: 'Mesmos efeitos da castração; QT; menor evento cardiovascular que leuprorrelina (HERO)', obs: 'Esquecimento > 7 dias: reiniciar com dose de ataque de 360 mg.' },
  ] },
  { g: 'Quimioterapia e radioligante', itens: [
    { nome: 'Docetaxel', dose: '75 mg/m² a cada 3 semanas + prednisona 5 mg 2×/dia (próstata); 75 mg/m² em MVAC/dose-densa (bexiga) — ver doses', renal: 'Sem ajuste', hepatico: 'Bilirrubina > LSN, ou AST/ALT > 1,5× LSN com fosfatase alcalina > 2,5× LSN: NÃO administrar (risco de morte tóxica); AST/ALT 1,5–3,5× LSN com FA 2,5–6×: reduzir para 60 mg/m²', inter: ['Inibidores fortes de CYP3A4 (cetoconazol, itraconazol, claritromicina, ritonavir): evitar; se inevitável, reduzir 50%', 'Indutores fortes: ↓ eficácia'], monitor: 'Hemograma antes de cada ciclo (neutrófilos ≥ 1.500); neuropatia (reduzir a 60 mg/m² se grau 2 persistente; descontinuar grau 3); retenção hídrica (dexametasona 8 mg 2×/dia por 3 dias desde a véspera); lacrimejamento; onicólise', obs: 'Neutropenia febril ou grau 4 > 7 dias: reduzir a 60 mg/m² ou G-CSF profilático; idoso/frágil: 50 mg/m² quinzenal é alternativa (PROSTY).' },
    { nome: 'Cabazitaxel', dose: '20 mg/m² a cada 3 semanas + prednisona 10 mg/dia (25 mg/m² em selecionados) com G-CSF profilático', renal: 'Leve/moderada: sem ajuste; grave (ClCr < 30)/terminal: cautela', hepatico: 'Leve (bilirrubina 1–1,5× LSN ou AST > 1,5×): 20 mg/m²; moderada (bilirrubina 1,5–3×): 15 mg/m²; grave (> 3×): contraindicado', inter: ['Inibidores fortes de CYP3A4: evitar (↑ 25% exposição)', 'Indutores fortes: evitar', 'Hipersensibilidade: pré-medicação com anti-histamínico, corticoide e anti-H2'], monitor: 'Hemograma semanal no 1º ciclo e antes de cada ciclo; diarreia (loperamida precoce; hidratação); hematúria; neuropatia; insuficiência renal (relatos com sepse/desidratação)', obs: 'Neutropenia febril ou grau ≥ 3 prolongada apesar de G-CSF: reduzir a 15 mg/m²; diarreia grau ≥ 3 persistente: reduzir.' },
    { nome: 'Cisplatina (GC, MVAC dose-densa; BEP/EP no testículo)', dose: '70 mg/m² d1 ou 35 mg/m² d1+d8 (urotelial); 20 mg/m² d1–5 (BEP)', renal: 'ClCr ≥ 60: dose plena; 40–60: fracionar (35 mg/m² d1+d8) ou trocar por carboplatina (urotelial); < 40–50: contraindicada. No testículo, a cisplatina não deve ser substituída por carboplatina (menor cura) — priorizar hidratação e ajustes de dose com oncologista', hepatico: 'Sem ajuste', inter: ['Aminoglicosídeos, AINE, contraste, anfotericina, vancomicina: nefrotoxicidade aditiva — evitar', 'Diuréticos de alça: ototoxicidade aditiva', 'Fenitoína: ↓ níveis'], monitor: 'Creatinina/ClCr, Mg, K antes de cada ciclo (hidratação ≥ 1–2 L + reposição de Mg); audiometria se sintomas; neuropatia; antiemese de alto risco (NK1 + 5-HT3 + dexametasona ± olanzapina)', obs: 'Elegibilidade pelos critérios de Galsky — usar a calculadora de cisplatina.' },
    { nome: 'Carboplatina', dose: 'AUC 4,5–5 a cada 3 semanas (com gemcitabina)', renal: 'Dose pela fórmula de Calvert: mg = AUC × (TFG + 25); TFG limitada a 125 mL/min; ClCr < 20: não recomendada', hepatico: 'Sem ajuste', inter: ['Nefrotóxicos e mielotóxicos: aditivos', 'Fenitoína: ↓ níveis'], monitor: 'Hemograma (plaquetopenia é o limitante); creatinina para recalcular a dose a cada ciclo', obs: 'Usar a calculadora de cisplatina/Calvert.' },
    { nome: 'Gemcitabina', dose: '1.000 mg/m² d1 e d8 a cada 3 semanas (GC); 1.250 mg/m² com cisplatina 4 semanas', renal: 'Sem ajuste formal; cautela se ClCr < 30 (síndrome hemolítico-urêmica rara)', hepatico: 'Bilirrubina elevada: sem regra fixa de ajuste — usar com cautela e monitorar provas hepáticas', inter: ['Radioterapia concomitante: radiossensibilizante potente (usar doses baixas, 27 mg/m² 2×/semana, na preservação vesical)', 'Varfarina: ↑ INR'], monitor: 'Hemograma antes de cada dose (plaquetas ≥ 100.000 e neutrófilos ≥ 1.500 para dose plena; 50–75% se abaixo); provas hepáticas; dispneia/pneumonite; edema; síndrome gripal', obs: '' },
    { nome: 'Bleomicina (BEP)', dose: '30 U d1, d8, d15 (BEP ×3–4)', renal: 'ClCr 50–80: 70% da dose; 40–50: 60%; 30–40: 55%; < 30: evitar — alternativa EP ×4 ou VIP', hepatico: 'Sem ajuste', inter: ['Oxigênio em altas frações (anestesia): toxicidade pulmonar — avisar o anestesista por toda a vida (FiO2 mínima)', 'Cisplatina (↓ depuração renal): ↑ risco pulmonar', 'G-CSF: relatos de toxicidade pulmonar'], monitor: 'Ausculta e dispneia antes de cada dose; DLCO basal e se sintomas; suspender definitivamente em pneumonite; evitar em > 40 anos, tabagistas pesados, DPOC ou ClCr < 60 (usar EP ou VIP)', obs: 'Dose cumulativa máxima 400 U (BEP ×4 = 360 U).' },
    { nome: 'Etoposídeo (BEP/EP/VIP)', dose: '100 mg/m² d1–5', renal: 'ClCr 15–50: 75% da dose; < 15: 50% ou evitar', hepatico: 'Bilirrubina 1,5–3× LSN: 50%; > 3×: evitar', inter: ['Ciclosporina (↑ etoposídeo); varfarina (↑ INR); indutores de CYP3A4 (↓)'], monitor: 'Hemograma (nadir d10–14); mucosite; leucemia secundária (dose cumulativa)', obs: '' },
    { nome: 'Enfortumabe vedotina', dose: '1,25 mg/kg (máx. 125 mg) d1, 8, 15 a cada 28 dias (com pembrolizumabe: d1 e d8 a cada 21 dias)', renal: 'Leve a grave: sem ajuste; terminal: não estudado', hepatico: 'Leve: sem ajuste; moderada/grave: evitar (↑ MMAE)', inter: ['Inibidores fortes de CYP3A4 (cetoconazol, claritromicina): ↑ MMAE — monitorar toxicidade de perto', 'Indutores fortes: ↓ MMAE'], monitor: 'Pele (exantema/SJS-NET: suspender em grau ≥ 2 com bolhas ou grau 3; descontinuar em grau 4 ou SJS/NET), glicemia (suspender se > 250 mg/dL), neuropatia periférica (grau 2: suspender até ≤ 1 e reduzir; grau ≥ 3: descontinuar), olhos (lubrificante; oftalmologia), pneumonite', obs: 'Escala: 1,25 → 1,0 → 0,75 → 0,5 mg/kg.' },
    { nome: 'Erdafitinibe (FGFR3)', dose: '8 mg/dia, aumentar para 9 mg se fosfato < 5,5 mg/dL e sem toxicidade em 14–21 dias', renal: 'Leve/moderada: sem ajuste; grave: não estudado', hepatico: 'Leve: sem ajuste; moderada/grave: não estudado', inter: ['Inibidores fortes de CYP2C9 (fluconazol) e CYP3A4 (itraconazol): ↑ exposição — monitorar/reduzir', 'Indutores fortes de CYP3A4: evitar', 'Substratos sensíveis de P-gp (digoxina): ↑', 'Fármacos que elevam fosfato (vitamina D, fosfato): evitar'], monitor: 'Fosfato (hiperfosfatemia: restrição dietética, quelante se > 7 mg/dL; suspender se > 10), oftalmologia mensal nos 4 primeiros meses (retinopatia serosa central — lágrima artificial; suspender se sintomas), unhas, estomatite, pele seca', obs: 'Escala: 9 → 8 → 6 → 5 → 4 mg.' },
    { nome: 'Olaparibe (BRCA1/2, ± abiraterona)', dose: '300 mg 2×/dia', renal: 'ClCr 51–80: sem ajuste; 31–50: 200 mg 2×/dia; < 30: não recomendado', hepatico: 'Leve/moderada: sem ajuste; grave: não estudado', inter: ['Inibidores fortes de CYP3A4: evitar; se inevitável, 100 mg 2×/dia; moderados (fluconazol, diltiazem, verapamil): 150 mg 2×/dia', 'Indutores fortes/moderados: evitar (↓ olaparibe)', 'Toranja/laranja-de-sevilha: evitar'], monitor: 'Hemograma mensal (anemia é o principal EA: transfusão, suspender se Hb < 8); síndrome mielodisplásica/LMA (citopenias persistentes > 4 semanas → hematologia); pneumonite; náusea (antiemético)', obs: 'Escala: 300 → 250 → 200 mg 2×/dia.' },
    { nome: 'Lutécio-177 PSMA-617', dose: '7,4 GBq a cada 6 semanas, até 6 ciclos', renal: 'Reduzir/atrasar se ClCr < 30–50 ou creatinina em elevação (> 40% do basal); hidratação', hepatico: 'Sem ajuste', inter: ['Sem interações farmacocinéticas; evitar nefrotóxicos concomitantes'], monitor: 'Hemograma e função renal antes de cada ciclo (plaquetas ≥ 75.000, neutrófilos ≥ 1.500, Hb ≥ 8); xerostomia (gelo/sialogogos); náusea; fadiga; radioproteção domiciliar 2–3 dias', obs: 'Atrasar o ciclo até recuperação hematológica; descontinuar se toxicidade grau 4 recorrente.' },
    { nome: 'Rádio-223', dose: '55 kBq/kg a cada 4 semanas, 6 ciclos', renal: 'Sem ajuste (excreção fecal)', hepatico: 'Sem ajuste', inter: ['Abiraterona + prednisona: contraindicado (ERA 223); usar após ou com outros agentes', 'Quimioterapia concomitante: evitar (mielotoxicidade)'], monitor: 'Hemograma antes de cada ciclo (neutrófilos ≥ 1.500 no 1º ciclo e ≥ 1.000 depois; plaquetas ≥ 100.000 / 50.000); fraturas (proteção óssea obrigatória); diarreia', obs: 'Só para metástases ósseas sintomáticas sem doença visceral.' },
  ] },
  { g: 'Imunoterapia e proteção óssea', itens: [
    { nome: 'Pembrolizumabe / nivolumabe / avelumabe / atezolizumabe / durvalumabe / ipilimumabe', dose: 'Pembrolizumabe 200 mg q3s ou 400 mg q6s; nivolumabe 240 mg q2s ou 480 mg q4s (3 mg/kg com ipilimumabe 1 mg/kg q3s ×4); avelumabe 800 mg q2s; atezolizumabe 1.200 mg q3s; durvalumabe 1.500 mg q3–4s', renal: 'Sem ajuste', hepatico: 'Leve: sem ajuste; moderada/grave: não estudado', inter: ['Sem interações farmacocinéticas', 'Corticoide sistêmico ou imunossupressor basal: pode reduzir eficácia — evitar antes do início quando possível; corticoide para irAE não compromete o benefício', 'Antibióticos de amplo espectro nas semanas prévias: associados a pior resposta (observacional)'], monitor: 'Antes de cada ciclo: TSH/T4L (a cada 6 semanas), provas hepáticas, creatinina, glicemia, cortisol se sintomas; troponina/ECG basal (com ipilimumabe); orientar o paciente a relatar diarreia, dispneia, rash, cefaleia, fraqueza', obs: 'Manejo das irAE: usar a ferramenta "irAE por grau".' },
    { nome: 'Denosumabe', dose: '120 mg SC a cada 4 semanas (metástase óssea); 60 mg a cada 6 meses (osteoporose por ADT)', renal: 'Sem ajuste; ClCr < 30: risco alto de hipocalcemia — suplementar e monitorar', hepatico: 'Sem ajuste', inter: ['Sem interação farmacocinética'], monitor: 'Cálcio e vitamina D (suplementar); cálcio sérico antes de cada dose; avaliação odontológica antes (osteonecrose de mandíbula: evitar extrações); fraturas atípicas de fêmur; rebote de reabsorção ao suspender (osteoporose: transição para bifosfonato)', obs: 'Hipocalcemia grave: corrigir antes de iniciar.' },
    { nome: 'Ácido zoledrônico', dose: '4 mg IV em 15 min a cada 4 semanas (metástase óssea; a cada 12 semanas é não inferior)', renal: 'ClCr 50–60: 3,5 mg; 40–49: 3,3 mg; 30–39: 3 mg; < 30: não recomendado', hepatico: 'Sem ajuste', inter: ['Nefrotóxicos (AINE, aminoglicosídeos): aditivos', 'Diuréticos de alça: hipocalcemia'], monitor: 'Creatinina antes de cada dose (suspender se ↑ ≥ 0,5 mg/dL com basal normal ou ≥ 1,0 com basal alterado); cálcio, fósforo, magnésio; odontologia prévia; reação de fase aguda na 1ª dose (paracetamol)', obs: '' },
  ] },
];

const TOX = {
  irae: {
    nome: 'irAE por grau — imunoterapia',
    origem: 'ASCO 2021 · NCCN 2026 · ESMO 2022 · CTCAE v5.0 · eventos adversos imunomediados de anti-PD-1/PD-L1 e anti-CTLA-4',
    resumo: 'Escolha o órgão e o grau CTCAE: o app devolve a conduta com a imunoterapia (manter, suspender, descontinuar), o corticoide/imunossupressor, a investigação e o especialista.',
    campos: [
      tSeg('org', 'Órgão / síndrome', IRAE_ORDER.map((k) => tO(k, IRAE[k].nome))),
      tSeg('g', 'Grau CTCAE v5', GRAUS, { col: 0 }),
      tSeg('combo', 'Esquema', [tO('pd1', 'Anti-PD-1/PD-L1 isolado'), tO('combo', 'Com anti-CTLA-4 (ipilimumabe + nivolumabe)')], { col: 0 }),
    ],
    compute(v) {
      if (!tY(v.org) || !tY(v.g)) return null;
      const o = IRAE[v.org]; const gi = +v.g - 1; const m = o.g[gi]; if (!m) return null;
      const avisos = [];
      if (v.combo === 'combo') avisos.push('Com ipilimumabe: toxicidade mais frequente e precoce; em grau ≥ 3 de colite, hepatite ou pneumonite o ipilimumabe é descontinuado definitivamente — a retomada posterior de anti-PD-1 isolado pode ser considerada após resolução.');
      if (gi >= 1) avisos.push(TAPER);
      if (gi >= 2 && !/endócr|tireoid|hipofis|diabet/i.test(o.nome)) avisos.push('Retomada após grau 3: em geral não (exceções: endocrinopatias controladas e casos selecionados com tumor em resposta); após grau 4: nunca, exceto endocrinopatias com reposição.');
      if (v.org === 'colite' || v.org === 'hepatite') avisos.push('Imunossupressor de 2ª linha: infliximabe (colite, não na hepatite — usar micofenolato); testar hepatite B/C e tuberculose antes do infliximabe quando o tempo permitir.');
      const tabela = [['Definição CTCAE (grau ' + v.g + ')', o.ctcae[gi]], ['Imunoterapia', m.io], ['Corticoide / imunossupressão', m.cort], ['Investigação e suporte', m.obs]];
      return { headline: `${o.nome} — grau ${v.g}`, rows: [], tabela, interp: 'Toda irAE grau ≥ 2 deve ter outras causas excluídas (infecção, progressão, outros fármacos) e ser registrada; escalar o corticoide se não houver melhora em 48–72 h. Prednisona 1 mg/kg ≈ metilprednisolona 0,8 mg/kg.', avisos, detalhe: `${o.nome} · grau ${v.g} · ${v.combo === 'combo' ? 'anti-CTLA-4 + anti-PD-1' : 'anti-PD-1/PD-L1'}` };
    },
    notas: ['Corticoide não reduz a eficácia antitumoral quando usado para tratar irAE; usar a menor dose eficaz pelo menor tempo.', 'Endocrinopatias (tireoide, hipófise, diabetes) são em geral permanentes: repor e manter a imunoterapia.', 'Miocardite, miosite e miastenia podem coexistir (síndrome de sobreposição) — dosar CK e troponina em qualquer fraqueza.'],
    fontes: [TOX_SRC.asco, TOX_SRC.nccn, TOX_SRC.esmo, TOX_SRC.ctcae],
  },
  tki: {
    nome: 'Toxicidade de TKI e terapia-alvo — rim',
    origem: 'Bulas (ANVISA/FDA) · CTCAE v5.0 · cabozantinibe, sunitinibe, pazopanibe, axitinibe, lenvatinibe, tivozanibe, everolimo, belzutifano',
    resumo: 'Escolha o fármaco, a toxicidade e o grau: o app devolve a conduta (manter, suspender, reduzir), a escala de redução de dose do fármaco e os cuidados de suporte.',
    campos: [
      tSeg('drug', 'Fármaco', Object.keys(TKIS).map((k) => tO(k, TKIS[k].nome, TKIS[k].dose)), { col: 1 }),
      tSeg('tox', 'Toxicidade', Object.keys(TKI_TOX).map((k) => tO(k, TKI_TOX[k].nome)), { show: (v) => tY(v.drug) }),
      tSeg('g', 'Grau CTCAE v5', GRAUS, { col: 0, show: (v) => tY(v.tox) }),
    ],
    compute(v) {
      if (!tY(v.drug) || !tY(v.tox) || !tY(v.g)) return null;
      const d = TKIS[v.drug], t = TKI_TOX[v.tox]; const gi = +v.g - 1; const cond = t.g[gi]; if (!cond || cond === '—') return { headline: `${t.nome} — grau ${v.g} não se aplica`, rows: [], interp: 'Este grau não existe no CTCAE para esta toxicidade.', avisos: [], detalhe: '' };
      const avisos = [];
      if (!d.tox.includes(v.tox)) avisos.push(`${t.nome} não é toxicidade típica de ${d.nome}: excluir outras causas (fármacos associados, progressão, imunoterapia concomitante).`);
      if (v.drug === 'axitinibe' || v.drug === 'cabozantinibe' || v.drug === 'lenvatinibe') avisos.push('Com imunoterapia associada (pembrolizumabe/nivolumabe): diarreia, hepatite e fadiga podem ser do TKI ou irAE — suspender primeiro o TKI (meia-vida curta) e, se não melhorar em 1–2 semanas, tratar como irAE com corticoide.');
      avisos.push(`Cirurgia: ${d.cir}.`);
      const tabela = [['Definição CTCAE (grau ' + v.g + ')', t.ctcae[gi]], ['Conduta', cond], ['Escala de redução', d.escala], ['Dose padrão', d.dose]];
      return { headline: `${d.nome} · ${t.nome} — grau ${v.g}`, rows: [], tabela, interp: 'Regra geral dos TKI anti-VEGF: grau 1–2 manter com suporte; grau 3 suspender até ≤ grau 1 e retomar 1 nível abaixo; grau 4 ou recorrência em dose mínima descontinuar. Interrupções curtas preservam a eficácia; reduções permanentes só após falha do manejo de suporte.', avisos, detalhe: `${d.nome} · ${t.nome} · grau ${v.g}` };
    },
    notas: ['Pressão arterial em casa nas 6 primeiras semanas (TKI anti-VEGF); TSH basal e periódico; proteinúria por fita/relação proteína-creatinina a cada ciclo.', 'Ajustes renais/hepáticos e interações completas: ferramenta "Ajustes e interações".'],
    fontes: [TOX_SRC.bula, TOX_SRC.ctcae, TOX_SRC.eau],
  },
  cispl: {
    nome: 'Cisplatina: elegibilidade (Galsky), CKD-EPI 2021 e Calvert',
    origem: 'Galsky 2011 · CKD-EPI 2021 · Cockcroft-Gault · Calvert 1989 — função renal e dose de platina',
    resumo: 'Informe creatinina, idade, sexo e peso: o app calcula eTFG (CKD-EPI 2021) e ClCr (Cockcroft-Gault), aplica os critérios de Galsky para cisplatina e a dose de carboplatina pela fórmula de Calvert.',
    campos: [
      { id: 'cr', l: 'Creatinina sérica', tipo: 'num', unit: 'mg/dL', step: 0.01, min: 0.2, max: 20 },
      { id: 'idade', l: 'Idade', tipo: 'num', unit: 'anos', min: 18, max: 110 },
      tSeg('sexo', 'Sexo', [tO('m', 'Masculino'), tO('f', 'Feminino')], { col: 0 }),
      { id: 'peso', l: 'Peso', tipo: 'num', unit: 'kg', min: 20, max: 300, help: 'Cockcroft-Gault usa o peso real; em obesos, considerar peso ajustado.' },
      tSeg('ecog', 'ECOG', [tO('0', '0–1'), tO('2', '≥ 2')], { col: 0 }),
      tSeg('aud', 'Perda auditiva ≥ grau 2 (audiometria)', [tO('0', 'Não'), tO('1', 'Sim')], { col: 0 }),
      tSeg('neuro', 'Neuropatia periférica ≥ grau 2', [tO('0', 'Não'), tO('1', 'Sim')], { col: 0 }),
      tSeg('ic', 'Insuficiência cardíaca NYHA ≥ III', [tO('0', 'Não'), tO('1', 'Sim')], { col: 0 }),
      tSeg('auc', 'AUC alvo da carboplatina', [tO('4', 'AUC 4'), tO('4.5', 'AUC 4,5'), tO('5', 'AUC 5'), tO('6', 'AUC 6')], { col: 0 }),
    ],
    compute(v) {
      const cr = +v.cr, idade = +v.idade, peso = +v.peso; if (!(cr > 0) || !(idade > 0) || !tY(v.sexo)) return null;
      const fem = v.sexo === 'f'; const k = fem ? 0.7 : 0.9, a = fem ? -0.241 : -0.302;
      const r = cr / k; const egfr = 142 * Math.pow(Math.min(r, 1), a) * Math.pow(Math.max(r, 1), -1.2) * Math.pow(0.9938, idade) * (fem ? 1.012 : 1);
      const cg = peso > 0 ? ((140 - idade) * peso) / (72 * cr) * (fem ? 0.85 : 1) : null;
      const clcr = cg !== null ? cg : egfr;
      const crit = [];
      if (clcr < 60) crit.push(`ClCr ${clcr.toFixed(0)} mL/min (< 60)`);
      if (v.ecog === '2') crit.push('ECOG ≥ 2'); if (v.aud === '1') crit.push('perda auditiva ≥ grau 2'); if (v.neuro === '1') crit.push('neuropatia ≥ grau 2'); if (v.ic === '1') crit.push('insuficiência cardíaca NYHA ≥ III');
      const inel = crit.length > 0;
      const auc = tY(v.auc) ? +v.auc : null; const gfrCalv = Math.min(clcr, 125); const dose = auc ? Math.round(auc * (gfrCalv + 25)) : null;
      const tabela = [['eTFG CKD-EPI 2021', `${egfr.toFixed(0)} mL/min/1,73 m²`]];
      if (cg !== null) tabela.push(['ClCr Cockcroft-Gault', `${cg.toFixed(0)} mL/min`]);
      tabela.push(['Critérios de Galsky presentes', inel ? crit.join('; ') : 'nenhum']);
      tabela.push(['Cisplatina', inel ? (clcr >= 40 && clcr < 60 && crit.length === 1 ? 'Inelegível pelos critérios; alternativa: cisplatina fracionada 35 mg/m² d1 + d8 (ClCr 40–59) em centro experiente, ou carboplatina' : 'Inelegível (unfit): carboplatina + gemcitabina ou enfortumabe + pembrolizumabe (urotelial); no testículo, não substituir — discutir com oncologia') : 'Elegível (fit): dose plena 70 mg/m² (GC) com hidratação e magnésio']);
      if (dose) tabela.push([`Carboplatina AUC ${String(v.auc).replace('.', ',')} (Calvert)`, `${dose} mg (TFG ${gfrCalv.toFixed(0)} mL/min${clcr > 125 ? ', limitada a 125' : ''})`]);
      const avisos = [];
      if (idade >= 70) avisos.push('Idoso: Cockcroft-Gault pode subestimar e CKD-EPI superestimar a função renal; medir ClCr em urina de 24 h ou cistatina C se decisão limítrofe.');
      if (cg !== null && Math.abs(cg - egfr) > 15) avisos.push('Diferença > 15 mL/min entre as fórmulas: usar a medida direta (ClCr de 24 h) para decidir elegibilidade.');
      avisos.push('Reavaliar a função renal antes de cada ciclo; hidratação IV e reposição de magnésio reduzem a nefrotoxicidade.');
      return { headline: inel ? 'Inelegível à cisplatina (Galsky)' : 'Elegível à cisplatina', rows: [], tabela, interp: 'Critérios de Galsky (consenso 2011): ClCr < 60 mL/min, ECOG ≥ 2, perda auditiva ≥ grau 2, neuropatia ≥ grau 2 ou insuficiência cardíaca NYHA ≥ III — qualquer um define "unfit". Calvert: dose (mg) = AUC × (TFG + 25), com TFG limitada a 125 mL/min (FDA).', avisos, detalhe: `Cr ${cr} · ${idade} a · ${fem ? 'F' : 'M'}${peso ? ' · ' + peso + ' kg' : ''}` };
    },
    notas: ['CKD-EPI 2021 não usa raça; o valor é indexado por 1,73 m² — para Calvert, prefira ClCr não indexado (Cockcroft-Gault) ou TFG medida.', 'No carcinoma urotelial, o fracionamento da cisplatina (35 mg/m² d1 e d8) é alternativa em ClCr 40–59 e ECOG 0–1, sem evidência randomizada.'],
    fontes: [TOX_SRC.galsky, TOX_SRC.ckd, TOX_SRC.calvert, TOX_SRC.eau],
  },
};
const TOX_ORDER = ['irae', 'tki', 'cispl'];

// Calculadoras práticas adicionais: densidade de PSA e relação livre/total, nomograma pré-biópsia (Karakiewicz–Kattan 2005),
// CAPRA-S (pós-prostatectomia), expectativa de vida (IBGE 2022) ajustada à saúde, Charlson/ECOG, Clavien-Dindo + CCI.
const c2Y = (v) => v !== undefined && v !== '';
const c2Seg = (id, l, opts, extra) => Object.assign({ id, l, tipo: 'seg', opts, col: 0 }, extra || {});
const c2O = (v, l, s) => ({ v, l, s });
const pct1 = (x) => (Math.round(x * 1000) / 10).toFixed(1).replace('.', ',');

// IBGE — Tábuas completas de mortalidade 2022, e(x) por idade (homens / mulheres), idades pares de 40 a 90+
const IBGE_EX = { m: { 40: 36.3, 42: 34.6, 44: 32.9, 46: 31.2, 48: 29.5, 50: 27.8, 52: 26.2, 54: 24.6, 56: 23.0, 58: 21.5, 60: 20.0, 62: 18.6, 64: 17.2, 66: 15.9, 68: 14.6, 70: 13.4, 72: 12.2, 74: 11.0, 76: 10.0, 78: 9.0, 80: 8.0, 82: 7.2, 84: 6.4, 86: 5.7, 88: 5.1, 90: 4.7 },
  f: { 40: 41.3, 42: 39.4, 44: 37.6, 46: 35.8, 48: 34.0, 50: 32.2, 52: 30.4, 54: 28.7, 56: 26.9, 58: 25.2, 60: 23.5, 62: 21.9, 64: 20.3, 66: 18.8, 68: 17.3, 70: 15.8, 72: 14.4, 74: 13.0, 76: 11.7, 78: 10.5, 80: 9.4, 82: 8.3, 84: 7.4, 86: 6.5, 88: 5.8, 90: 5.2 } };
function ibgeEx(sexo, idade) { const t = IBGE_EX[sexo]; if (idade <= 40) return t[40] + (40 - idade); if (idade >= 90) return Math.max(2, t[90] - (idade - 90) * 0.35); const lo = Math.floor(idade / 2) * 2, hi = lo + 2; const f = (idade - lo) / 2; return t[lo] + (t[hi] - t[lo]) * f; }

const CHARLSON = [
  ['im', 'Infarto do miocárdio prévio', 1], ['icc', 'Insuficiência cardíaca', 1], ['dvp', 'Doença vascular periférica (claudicação, aneurisma ≥ 6 cm, revascularização)', 1], ['avc', 'AVC ou AIT', 1], ['dem', 'Demência', 1], ['dpoc', 'Doença pulmonar crônica', 1], ['tc', 'Doença do tecido conjuntivo (lúpus, AR, polimiosite)', 1], ['ulc', 'Úlcera péptica', 1], ['hep1', 'Hepatopatia leve (sem hipertensão portal)', 1], ['dm1', 'Diabetes sem lesão de órgão-alvo', 1],
  ['hemi', 'Hemiplegia / paraplegia', 2], ['drc', 'Doença renal moderada/grave (creatinina > 3, diálise, transplante)', 2], ['dm2', 'Diabetes com lesão de órgão-alvo (retinopatia, nefropatia, neuropatia)', 2], ['tum', 'Outro tumor sólido sem metástase (nos últimos 5 anos; não contar o tumor urológico em avaliação)', 2], ['leuc', 'Leucemia', 2], ['linf', 'Linfoma', 2],
  ['hep3', 'Hepatopatia moderada/grave (cirrose com hipertensão portal, varizes)', 3], ['meta', 'Tumor sólido metastático', 6], ['aids', 'AIDS (não apenas HIV+)', 6],
];
const ECOG = [['0', 'ECOG 0', 'totalmente ativo, sem restrições (Karnofsky 90–100)'], ['1', 'ECOG 1', 'restrito a atividades extenuantes; ambulatorial, trabalho leve (Karnofsky 70–80)'], ['2', 'ECOG 2', 'ambulatorial, autocuidado, incapaz de trabalhar; de pé > 50% do dia (Karnofsky 50–60)'], ['3', 'ECOG 3', 'autocuidado limitado; cama/cadeira > 50% do dia (Karnofsky 30–40)'], ['4', 'ECOG 4', 'completamente incapaz; acamado (Karnofsky 10–20)']];
const CLAVIEN = [['I', 'Grau I', 'qualquer desvio do pós-operatório normal sem necessidade de tratamento farmacológico, cirúrgico, endoscópico ou radiológico; permitidos: antieméticos, antipiréticos, analgésicos, diuréticos, eletrólitos, fisioterapia; inclui infecção de ferida aberta à beira do leito', 300], ['II', 'Grau II', 'tratamento farmacológico além do permitido no grau I (antibiótico, transfusão, nutrição parenteral)', 1750], ['IIIa', 'Grau IIIa', 'intervenção cirúrgica, endoscópica ou radiológica sem anestesia geral (ex.: nefrostomia, duplo J sob sedação, drenagem percutânea)', 2750], ['IIIb', 'Grau IIIb', 'intervenção sob anestesia geral (reoperação)', 4550], ['IVa', 'Grau IVa', 'complicação com risco de vida exigindo UTI — disfunção de um órgão (diálise, ventilação)', 7200], ['IVb', 'Grau IVb', 'disfunção de múltiplos órgãos', 8550], ['V', 'Grau V', 'óbito', 40000]];

const CALC2 = {
  psad: {
    nome: 'Densidade de PSA e relação livre/total',
    origem: 'EAU 2026 · densidade (PSA ÷ volume) com corte 0,15–0,20 ng/mL/mL; PSA livre/total com cortes de 10–25%',
    resumo: 'Informe PSA total, volume prostático (RM ou US) e, se disponível, PSA livre: o app calcula a densidade e a fração livre e lê os resultados conforme a EAU (sobretudo na RM negativa ou PI-RADS 3).',
    campos: [
      { id: 'psa', l: 'PSA total', tipo: 'num', unit: 'ng/mL', step: 0.01, min: 0.1, max: 500 },
      { id: 'vol', l: 'Volume prostático', tipo: 'num', unit: 'mL', step: 1, min: 5, max: 400, help: 'Elipsoide: comprimento × largura × altura × 0,52 (RM é mais reprodutível que o US).' },
      { id: 'livre', l: 'PSA livre (opcional)', tipo: 'num', unit: 'ng/mL', step: 0.01, min: 0, max: 100, help: 'Válido para PSA total 4–10 ng/mL; colher antes de toque/biópsia e processar em até 3 h (instabilidade do PSA livre).' },
      c2Seg('pirads', 'RM multiparamétrica (opcional)', [c2O('neg', 'PI-RADS 1–2'), c2O('3', 'PI-RADS 3'), c2O('45', 'PI-RADS 4–5'), c2O('nr', 'Não realizada')]),
    ],
    compute(v) {
      const psa = +v.psa, vol = +v.vol; if (!(psa > 0) || !(vol > 0)) return null;
      const d = psa / vol; const livre = c2Y(v.livre) ? +v.livre : null; const fl = livre !== null && livre >= 0 ? livre / psa : null;
      const tabela = [['Densidade de PSA', `${d.toFixed(2).replace('.', ',')} ng/mL/mL`]];
      let leitD = d < 0.10 ? 'baixa (< 0,10): risco baixo de câncer clinicamente significativo' : d < 0.15 ? '0,10–0,14: intermediária' : d < 0.20 ? '0,15–0,19: elevada' : '≥ 0,20: alta';
      tabela.push(['Leitura da densidade', leitD]);
      const avisos = [];
      if (fl !== null) { tabela.push(['PSA livre / total', `${pct1(fl)}%`]); tabela.push(['Leitura da fração livre', fl < 0.10 ? '< 10%: probabilidade de câncer ≈ 50–56% (PSA 4–10)' : fl <= 0.15 ? '10–15%: ≈ 28%' : fl <= 0.20 ? '15–20%: ≈ 20%' : fl <= 0.25 ? '20–25%: ≈ 16%' : '> 25%: ≈ 8% (Catalona 1998)']); if (psa < 4 || psa > 10) avisos.push('Fração livre validada apenas para PSA total 4–10 ng/mL.'); }
      let cond;
      if (v.pirads === 'neg') cond = d >= 0.20 ? 'RM negativa com densidade ≥ 0,20: a EAU recomenda biópsia sistemática mesmo com RM negativa (risco de câncer significativo ≈ 10–15%); com 0,15–0,19 discutir com o paciente.' : d >= 0.15 ? 'RM negativa com densidade 0,15–0,19: decisão compartilhada — biópsia sistemática ou vigilância com PSA em 6–12 meses; outros fatores de risco (história familiar, germinativo) pesam a favor da biópsia.' : 'RM negativa com densidade < 0,15: pode-se omitir a biópsia (valor preditivo negativo > 90%); repetir PSA em 6–12 meses.';
      else if (v.pirads === '3') cond = d >= 0.15 ? 'PI-RADS 3 com densidade ≥ 0,15: biópsia dirigida + sistemática (risco de câncer significativo ≈ 20–30%).' : 'PI-RADS 3 com densidade < 0,15: risco de câncer significativo ≈ 5–10% — biópsia ou vigilância com PSA/RM em 6–12 meses, conforme preferência e fatores de risco.';
      else if (v.pirads === '45') cond = 'PI-RADS 4–5: biópsia dirigida + sistemática independentemente da densidade (a densidade refina o risco: ≥ 0,15 aumenta a probabilidade de câncer significativo para > 50%).';
      else cond = d >= 0.15 ? 'Densidade ≥ 0,15 sem RM: solicitar RM multiparamétrica antes da biópsia (EAU); se indisponível, biópsia sistemática.' : 'Densidade < 0,15 sem RM: RM antes de decidir; a densidade isolada não exclui câncer significativo.';
      tabela.push(['Conduta sugerida (EAU)', cond]);
      return { headline: `Densidade ${d.toFixed(2).replace('.', ',')}${fl !== null ? ` · PSA livre ${pct1(fl)}%` : ''}`, rows: [], tabela, interp: 'A densidade de PSA integra os modelos de risco pós-RM; combine com a calculadora de Heidelberg/Radtke (RM) e com ERSPC/PCPT. Volume por RM reduz a variabilidade.', avisos, detalhe: `PSA ${psa} / volume ${vol} mL${livre !== null ? ' · livre ' + livre : ''}` };
    },
    notas: ['Densidade ≥ 0,15 ng/mL/mL é critério de risco em vigilância ativa (exclui "muito baixo risco" NCCN) e na decisão de biópsia com RM negativa/PI-RADS 3 (EAU).', 'Fração livre < 10% com PSA 4–10: risco ≈ 56%; > 25%: ≈ 8% (Catalona, JAMA 1998). Não usar com inibidores de 5-alfa-redutase sem correção.'],
    fontes: [{ t: 'EAU Guidelines on Prostate Cancer 2026 — diagnostic evaluation (PSA density, MRI pathway)', u: 'https://uroweb.org/guidelines/prostate-cancer' }, { t: 'Catalona WJ et al. Use of the percentage of free PSA to enhance differentiation of prostate cancer from benign prostatic disease. JAMA 1998;279:1542', u: 'https://pubmed.ncbi.nlm.nih.gov/9605898/' }],
  },

  kkbx: {
    nome: 'Nomograma pré-biópsia (Karakiewicz–Kattan 2005)',
    origem: 'Karakiewicz PI, Kattan MW et al. — J Urol 2005 · idade, toque retal, PSA e %PSA livre · base dos nomogramas pré-biópsia MSKCC',
    resumo: 'Calcula a probabilidade de câncer na biópsia com os coeficientes publicados: modelo 1 (idade, toque, PSA; AUC 0,70) e modelo 2 com %PSA livre (AUC 0,78). O nomograma atual do site MSKCC usa dados mais recentes e não publica coeficientes — o link está nas fontes.',
    campos: [
      { id: 'idade', l: 'Idade', tipo: 'num', unit: 'anos', min: 35, max: 95 },
      { id: 'psa', l: 'PSA total', tipo: 'num', unit: 'ng/mL', step: 0.1, min: 0.1, max: 50, help: 'Desenvolvido com PSA ≤ 50 ng/mL.' },
      c2Seg('dre', 'Toque retal', [c2O('0', 'Normal'), c2O('1', 'Suspeito')]),
      { id: 'livre', l: 'PSA livre (opcional — ativa o modelo 2)', tipo: 'num', unit: 'ng/mL', step: 0.01, min: 0, max: 50 },
    ],
    compute(v) {
      const idade = +v.idade, psa = +v.psa; if (!(idade > 0) || !(psa > 0) || !c2Y(v.dre)) return null;
      const dre = +v.dre; const lp1 = -3.01038 + 0.02071 * idade + 1.24486 * dre + 0.05563 * psa; const p1 = 1 / (1 + Math.exp(-lp1));
      const rows = [{ l: 'Modelo 1 — câncer na biópsia (idade, toque, PSA)', p: p1, cls: p1 >= 0.5 ? 'bad' : p1 >= 0.25 ? 'warn' : 'ok' }];
      let p2 = null; const avisos = [];
      if (c2Y(v.livre) && +v.livre >= 0) { const fl = +v.livre / psa; const lp2 = -1.01469 + 0.02436 * idade + 1.82162 * dre + 0.02858 * psa - 8.68001 * fl; p2 = 1 / (1 + Math.exp(-lp2)); rows.push({ l: `Modelo 2 — com %PSA livre (${pct1(fl)}%)`, p: p2, cls: p2 >= 0.5 ? 'bad' : p2 >= 0.25 ? 'warn' : 'ok' }); if (fl > 0.5) avisos.push('Fração livre > 50%: verificar as unidades (PSA livre deve ser menor que o total).'); }
      if (psa > 50) avisos.push('PSA > 50 ng/mL: fora da faixa de desenvolvimento.');
      avisos.push('Desenvolvido com biópsia sextante (1990–2000), antes da RM e das biópsias de 12 fragmentos: subestima o câncer total atual e não distingue grau — use PCPT 2.0/ERSPC para alto grau e a calculadora de RM.');
      const p = p2 !== null ? p2 : p1;
      return { headline: `Probabilidade de câncer na biópsia: ${pct1(p)}%${p2 !== null ? ' (modelo 2)' : ' (modelo 1)'}`, rows, interp: 'Logística publicada: modelo 1 = −3,01038 + 0,02071·idade + 1,24486·toque + 0,05563·PSA; modelo 2 = −1,01469 + 0,02436·idade + 1,82162·toque + 0,02858·PSA − 8,68001·(PSA livre/total). Validação externa: AUC 0,69 (modelo 1) e 0,77 (modelo 2).', avisos, detalhe: `${idade} anos · PSA ${psa} · toque ${dre ? 'suspeito' : 'normal'}${c2Y(v.livre) ? ' · livre ' + v.livre : ''}` };
    },
    notas: ['Os nomogramas pré-biópsia do site MSKCC (nomograms.mskcc.org) derivam dessa linha de trabalho (Kattan), mas foram reestimados com dados mais recentes e não têm coeficientes publicados — por isso o app reproduz a versão de 2005.', 'O modelo prediz qualquer câncer (não apenas clinicamente significativo).'],
    fontes: [{ t: 'Karakiewicz PI, Benayoun S, Kattan MW et al. Development and validation of a nomogram predicting the outcome of prostate biopsy based on patient age, DRE and serum PSA. J Urol 2005;173:1930', u: 'https://pubmed.ncbi.nlm.nih.gov/15879784/' }, { t: 'MSKCC Prostate Cancer Nomograms — pre-biopsy (calculadora oficial)', u: 'https://www.mskcc.org/nomograms/prostate/pre_biopsy' }],
  },

  capra_s: {
    nome: 'CAPRA-S — recidiva após prostatectomia',
    origem: 'Cooperberg MR et al. — Cancer 2011 (UCSF/CaPSURE) · escore patológico 0–12 com sobrevida livre de recidiva bioquímica em 3 e 5 anos · alternativa publicada ao nomograma pós-operatório de Kattan/Stephenson (MSKCC)',
    resumo: 'PSA pré-operatório, Gleason da peça, margem, extensão extracapsular, vesícula seminal e linfonodos → CAPRA-S (0–12), grupo de risco e sobrevida livre de recidiva (Kaplan-Meier da coorte original, c-index 0,77).',
    campos: [
      c2Seg('psa', 'PSA pré-operatório', [c2O('0', '≤ 6'), c2O('1', '6,01–10'), c2O('2', '10,01–20'), c2O('3', '> 20')]),
      c2Seg('gl', 'Gleason patológico', [c2O('0', '≤ 6 (GG 1)'), c2O('1', '3+4 (GG 2)'), c2O('2', '4+3 (GG 3)'), c2O('3', '8–10 (GG 4–5)')]),
      c2Seg('mg', 'Margem cirúrgica', [c2O('0', 'Negativa'), c2O('2', 'Positiva', '+2')]),
      c2Seg('epe', 'Extensão extracapsular (pT3a)', [c2O('0', 'Não'), c2O('1', 'Sim', '+1')]),
      c2Seg('svi', 'Invasão de vesícula seminal (pT3b)', [c2O('0', 'Não'), c2O('2', 'Sim', '+2')]),
      c2Seg('ln', 'Linfonodo positivo (pN1)', [c2O('0', 'Não'), c2O('1', 'Sim', '+1')]),
    ],
    compute(v) {
      const ks = ['psa', 'gl', 'mg', 'epe', 'svi', 'ln']; if (!ks.every((k) => c2Y(v[k]))) return null;
      const s = ks.reduce((a, k) => a + +v[k], 0);
      const KM = { 0: [96.3, 94.5], 1: [95.3, 91.0], 2: [89.8, 83.3], 3: [80.7, 72.8], 4: [74.9, 70.2], 5: [63.1, 42.5], 6: [49.2, 25.9], 7: [50.9, 26.9], 8: [26.9, 12.3] };
      const km = s >= 9 ? [7.3, 0] : KM[s];
      const grupo = s <= 2 ? 'Baixo risco (0–2)' : s <= 5 ? 'Risco intermediário (3–5)' : 'Alto risco (6–12)';
      const cond = s <= 2 ? 'PSA a cada 6 meses por 3 anos e depois anual; radioterapia de resgate precoce se PSA detectável em elevação (> 0,2).' : s <= 5 ? 'Vigilância próxima do PSA; discutir radioterapia adjuvante × resgate precoce conforme margem/pT3 (RADICALS, RAVES, GETUG-17 favorecem resgate precoce) e Decipher se disponível.' : 'Alto risco: considerar radioterapia adjuvante/resgate muito precoce ± hormonioterapia (pN1: ADT ± RT), PSMA-PET ao primeiro PSA detectável; discutir em reunião multidisciplinar.';
      const rows = [{ l: 'Livre de recidiva bioquímica em 3 anos', p: km[0] / 100, cls: 'ok' }, { l: 'Livre de recidiva bioquímica em 5 anos', p: km[1] / 100, cls: 'ok' }];
      return { headline: `CAPRA-S ${s} — ${grupo}`, rows, tabela: [['Pontos', `PSA ${v.psa} · Gleason ${v.gl} · margem ${v.mg} · EPE ${v.epe} · VS ${v.svi} · LN ${v.ln}`], ['Conduta', cond]], interp: `Sobrevida livre de recidiva bioquímica (Kaplan-Meier, CaPSURE): ${km[0]}% em 3 anos e ${km[1]}% em 5 anos para o escore ${s >= 9 ? '≥ 9' : s}. HR 1,54 por ponto; c-index 0,77 (nomograma de Stephenson na mesma coorte: 0,76).`, avisos: s >= 9 ? ['Escores ≥ 9 agrupados por escassez de pacientes (n = 39).'] : [], detalhe: `CAPRA-S = ${s}` };
    },
    notas: ['CAPRA-S prediz também mortalidade específica (subHR 1,42/ponto) e foi validado em coortes multi-institucionais.', 'O nomograma pós-prostatectomia de Kattan/Stephenson (MSKCC) tem desempenho semelhante mas coeficientes não publicados; use o link oficial para comparar.'],
    fontes: [{ t: 'Cooperberg MR, Hilton JF, Carroll PR. The CAPRA-S score: a straightforward tool for improved prediction of outcomes after radical prostatectomy. Cancer 2011;117:5039', u: 'https://pubmed.ncbi.nlm.nih.gov/21647869/' }, { t: 'MSKCC — Post-radical prostatectomy nomogram (Stephenson/Kattan)', u: 'https://www.mskcc.org/nomograms/prostate/post_op' }],
  },

  vida: {
    nome: 'Expectativa de vida ajustada à saúde',
    origem: 'IBGE — Tábuas completas de mortalidade 2022 (homens e mulheres) · ajuste por quartil de saúde (método NCCN/AUA: +50% / −50%)',
    resumo: 'Idade e sexo dão a expectativa de vida média brasileira; o estado de saúde (melhor quartil, mediano, pior quartil) ajusta o valor. Use para decisões que dependem de 10 anos (rastreamento, vigilância ativa × tratamento, nefrectomia parcial × vigilância).',
    campos: [
      { id: 'idade', l: 'Idade', tipo: 'num', unit: 'anos', min: 18, max: 105 },
      c2Seg('sexo', 'Sexo', [c2O('m', 'Masculino'), c2O('f', 'Feminino')]),
      c2Seg('saude', 'Estado de saúde', [c2O('melhor', 'Melhor quartil', 'sem comorbidades relevantes, ativo, não fumante'), c2O('med', 'Mediano', 'comorbidades controladas'), c2O('pior', 'Pior quartil', 'múltiplas comorbidades, fragilidade, ECOG ≥ 2, Charlson ≥ 3')], { col: 1 }),
    ],
    compute(v) {
      const idade = +v.idade; if (!(idade > 0) || !c2Y(v.sexo) || !c2Y(v.saude)) return null;
      const base = ibgeEx(v.sexo, idade); const f = v.saude === 'melhor' ? 1.5 : v.saude === 'pior' ? 0.5 : 1; const ev = base * f;
      const tabela = [['Expectativa média (IBGE 2022)', `${base.toFixed(1).replace('.', ',')} anos (até ≈ ${(idade + base).toFixed(0)} anos)`], ['Ajustada à saúde', `${ev.toFixed(1).replace('.', ',')} anos (até ≈ ${(idade + ev).toFixed(0)} anos)`], ['Limiar de 10 anos', ev >= 10 ? 'Expectativa ≥ 10 anos: tratamento com intenção curativa e rastreamento tendem a beneficiar' : 'Expectativa < 10 anos: priorizar observação/vigilância e tratamentos de menor morbidade; rastreamento de PSA não recomendado'], ['Limiar de 15 anos', ev >= 15 ? '≥ 15 anos: considerar tratamento radical mesmo em risco intermediário favorável' : '< 15 anos']];
      const avisos = ['Os quartis de saúde são aproximações (NCCN/AUA, a partir de tábuas americanas); o Charlson e o ECOG ajudam a enquadrar.'];
      if (idade > 90) avisos.push('Acima de 90 anos a tábua do IBGE agrupa as idades; valor extrapolado.');
      return { headline: `Expectativa de vida ≈ ${ev.toFixed(1).replace('.', ',')} anos`, rows: [], tabela, interp: 'Tábua IBGE 2022 (e(x) por idade exata, interpolada): homens 60 anos = 20,0; 70 = 13,4; 80 = 8,0 anos. Ajuste: melhor quartil ×1,5; pior quartil ×0,5 (NCCN Prostate Cancer, "Principles of life expectancy estimation").', avisos, detalhe: `${idade} anos · ${v.sexo === 'm' ? 'masculino' : 'feminino'} · ${v.saude}` };
    },
    notas: ['As tábuas de 2023 (IBGE) mostram pequena melhora (homens aos 60: 20,7 anos); a tábua completa de 2022 foi usada por estar disponível por idade.', 'Ferramentas americanas (SSA/Walz) superestimam a expectativa de brasileiros; a tábua nacional é mais adequada.'],
    fontes: [{ t: 'IBGE — Tábuas Completas de Mortalidade 2022 (Brasil, homens e mulheres)', u: 'https://www.ibge.gov.br/estatisticas/sociais/populacao/9126-tabuas-completas-de-mortalidade.html' }, { t: 'NCCN Guidelines Prostate Cancer 2026 — Principles of life expectancy estimation', u: 'https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1459' }],
  },

  charlson: {
    nome: 'Charlson (idade) e ECOG',
    origem: 'Charlson ME et al. 1987 · ajuste por idade (Charlson 1994) · sobrevida estimada em 10 anos · escala ECOG/Karnofsky',
    resumo: 'Marque as comorbidades e a idade: o app soma o índice de Charlson ajustado por idade, estima a sobrevida em 10 anos e registra o ECOG com a descrição.',
    campos: [
      { id: 'idade', l: 'Idade', tipo: 'num', unit: 'anos', min: 18, max: 110 },
      ...CHARLSON.map(([k, l, w]) => c2Seg(k, `${l} (+${w})`, [c2O('0', 'Não'), c2O(String(w), 'Sim')])),
      c2Seg('ecog', 'ECOG', ECOG.map(([v, l, s]) => c2O(v, l, s)), { col: 1 }),
    ],
    compute(v) {
      const idade = +v.idade; if (!(idade > 0)) return null;
      const com = CHARLSON.reduce((a, [k]) => a + (c2Y(v[k]) ? +v[k] : 0), 0);
      const ag = idade >= 80 ? 4 : idade >= 70 ? 3 : idade >= 60 ? 2 : idade >= 50 ? 1 : 0;
      const cci = com + ag; const surv = Math.pow(0.983, Math.exp(cci * 0.9));
      const lista = CHARLSON.filter(([k]) => c2Y(v[k]) && +v[k] > 0).map(([, l]) => l.replace(/ \(.*\)$/, ''));
      const tabela = [['Comorbidades', `${com} ponto${com !== 1 ? 's' : ''}${lista.length ? ': ' + lista.join(', ') : ''}`], ['Idade', `+${ag} (${idade} anos)`], ['Charlson ajustado por idade', String(cci)], ['Sobrevida estimada em 10 anos', `${pct1(surv)}% (0,983^e^(CCI×0,9))`]];
      if (c2Y(v.ecog)) { const e = ECOG.find((x) => x[0] === v.ecog); tabela.push(['Performance status', `${e[1]} — ${e[2]}`]); }
      const avisos = [];
      if (c2Y(v.ecog) && +v.ecog >= 2) avisos.push('ECOG ≥ 2: inelegível à cisplatina (Galsky) e fator de pior prognóstico em quase todos os modelos (IMDC, IGCCCG, mCRPC).');
      if (cci >= 3) avisos.push('Charlson ≥ 3: enquadra no pior quartil de saúde para a estimativa de expectativa de vida; em próstata localizada de baixo/intermediário risco favorece vigilância/observação.');
      return { headline: `Charlson ${cci} · sobrevida em 10 anos ≈ ${pct1(surv)}%`, rows: [{ l: 'Sobrevida estimada em 10 anos', p: surv, cls: surv >= 0.7 ? 'ok' : surv >= 0.4 ? 'warn' : 'bad' }], tabela, interp: 'Índice de Charlson (1987) com ajuste por idade (+1 por década a partir dos 50). A fórmula de sobrevida é a original (população hospitalar dos anos 1980) e tende a subestimar a sobrevida atual — use como ordem de grandeza.', avisos, detalhe: `CCI ${cci}${c2Y(v.ecog) ? ' · ECOG ' + v.ecog : ''}` };
    },
    notas: ['Não contar o tumor urológico em avaliação como "outro tumor sólido".', 'Karnofsky: 100 normal; 90 sintomas mínimos; 80 atividade normal com esforço; 70 cuida de si, incapaz de trabalhar; 60 assistência ocasional; 50 assistência considerável; 40 incapacitado; 30 hospitalização indicada; 20 muito doente; 10 moribundo.'],
    fontes: [{ t: 'Charlson ME et al. A new method of classifying prognostic comorbidity. J Chronic Dis 1987;40:373', u: 'https://pubmed.ncbi.nlm.nih.gov/3558716/' }, { t: 'Charlson M et al. Validation of a combined comorbidity index. J Clin Epidemiol 1994;47:1245', u: 'https://pubmed.ncbi.nlm.nih.gov/7722560/' }, { t: 'Oken MM et al. Toxicity and response criteria of the ECOG. Am J Clin Oncol 1982;5:649', u: 'https://pubmed.ncbi.nlm.nih.gov/7165009/' }],
  },

  clavien: {
    nome: 'Clavien-Dindo e CCI (complicações)',
    origem: 'Dindo, Demartines, Clavien — Ann Surg 2004 · Comprehensive Complication Index (Slankamenac 2013) para múltiplas complicações',
    resumo: 'Classifique até 5 complicações pós-operatórias pelo grau de Clavien-Dindo: o app devolve a definição, o grau mais alto e o CCI (0–100), que integra todas as complicações do mesmo paciente.',
    campos: [
      c2Seg('c1', 'Complicação 1', CLAVIEN.map(([v, l, s]) => c2O(v, l, s)), { col: 1 }),
      c2Seg('c2', 'Complicação 2 (opcional)', [c2O('', 'Nenhuma'), ...CLAVIEN.map(([v, l]) => c2O(v, l))], { show: (v) => c2Y(v.c1) }),
      c2Seg('c3', 'Complicação 3 (opcional)', [c2O('', 'Nenhuma'), ...CLAVIEN.map(([v, l]) => c2O(v, l))], { show: (v) => c2Y(v.c2) }),
      c2Seg('c4', 'Complicação 4 (opcional)', [c2O('', 'Nenhuma'), ...CLAVIEN.map(([v, l]) => c2O(v, l))], { show: (v) => c2Y(v.c3) }),
      c2Seg('c5', 'Complicação 5 (opcional)', [c2O('', 'Nenhuma'), ...CLAVIEN.map(([v, l]) => c2O(v, l))], { show: (v) => c2Y(v.c4) }),
      c2Seg('d', 'Sufixo "d" (disability): sequela persistente à alta?', [c2O('0', 'Não'), c2O('1', 'Sim')]),
    ],
    compute(v) {
      const gs = ['c1', 'c2', 'c3', 'c4', 'c5'].map((k) => v[k]).filter((x) => c2Y(x)); if (!gs.length) return null;
      const order = CLAVIEN.map((c) => c[0]); const w = (g) => CLAVIEN.find((c) => c[0] === g)[3];
      const cci = Math.min(100, Math.sqrt(gs.reduce((a, g) => a + w(g), 0)) / 2);
      const maior = gs.reduce((a, g) => order.indexOf(g) > order.indexOf(a) ? g : a, gs[0]);
      const def = CLAVIEN.find((c) => c[0] === maior);
      const tabela = [['Complicações', gs.map((g) => 'Clavien-Dindo ' + g).join(' · ')], ['Grau mais alto', `${maior}${v.d === '1' ? '-d' : ''} — ${def[2]}`], ['CCI (Comprehensive Complication Index)', `${cci.toFixed(1).replace('.', ',')} / 100`], ['Leitura', order.indexOf(maior) >= 2 ? 'Complicação maior (≥ IIIa): exige intervenção — registrar na notificação de eventos e no banco de qualidade' : 'Complicação menor (I–II)']];
      return { headline: `Clavien-Dindo ${maior}${v.d === '1' ? 'd' : ''} · CCI ${cci.toFixed(1).replace('.', ',')}`, rows: [], tabela, interp: 'CCI (Slankamenac 2013) = √(Σ pesos)/2, pesos I 300 · II 1.750 · IIIa 2.750 · IIIb 4.550 · IVa 7.200 · IVb 8.550 · V 40.000: uma complicação isolada vale I 8,7 · II 20,9 · IIIa 26,2 · IIIb 33,7 · IVa 42,4 · IVb 46,2 · V 100 (óbito = 100, teto da escala); duas de grau I somam 12,2 e grau II + IIIa, 33,5. Complicações "maiores" = grau ≥ IIIa (algumas séries, ≥ IIIb).', avisos: ['Classificar cada complicação pelo tratamento mais invasivo que ela exigiu, no período de 30 (ou 90) dias; reoperação planejada não é complicação.'], detalhe: gs.join(', ') };
    },
    notas: ['Grau I inclui abertura de ferida à beira do leito e uso de antieméticos, antipiréticos, analgésicos, diuréticos e eletrólitos; antibiótico ou transfusão já são grau II.', 'O sufixo "d" marca sequela presente na alta e exige seguimento da complicação.'],
    fontes: [{ t: 'Dindo D, Demartines N, Clavien PA. Classification of surgical complications. Ann Surg 2004;240:205', u: 'https://pubmed.ncbi.nlm.nih.gov/15273542/' }, { t: 'Slankamenac K et al. The Comprehensive Complication Index. Ann Surg 2013;258:1', u: 'https://pubmed.ncbi.nlm.nih.gov/23728278/' }, { t: 'EAU Guidelines — reporting and grading of complications (Mitropoulos 2012)', u: 'https://pubmed.ncbi.nlm.nih.gov/22421850/' }],
  },
};
const CALC2_ORDER = ['psad', 'kkbx', 'capra_s', 'cispl', 'vida', 'charlson', 'clavien'];

// CID-10 — códigos usados em uro-oncologia (descrições oficiais da versão em português, OMS/DATASUS; consulta: cid10.com.br)
const CID10 = {
  versao: 'CID-10 (OMS), versão em português — DATASUS 2008',
  fontes: [{ t: 'CID-10 — Código Internacional de Doenças (cid10.com.br)', u: 'https://cid10.com.br/' }, { t: 'DATASUS — CID-10 versão 2008', u: 'http://www.datasus.gov.br/cid10/V2008/cid10.htm' }],
  grupos: [
    { id: 'prostata', nome: 'Próstata', itens: [
      ['C61', 'Neoplasia maligna da próstata'],
      ['D07.5', 'Carcinoma in situ da próstata'],
      ['D40.0', 'Neoplasia de comportamento incerto ou desconhecido da próstata'],
      ['D29.1', 'Neoplasia benigna da próstata'],
      ['Z12.5', 'Exame especial de rastreamento de neoplasia da próstata'],
    ] },
    { id: 'bexiga', nome: 'Bexiga', itens: [
      ['C67', 'Neoplasia maligna da bexiga'],
      ['C67.0', 'Neoplasia maligna do trígono da bexiga'],
      ['C67.1', 'Neoplasia maligna da cúpula da bexiga'],
      ['C67.2', 'Neoplasia maligna da parede lateral da bexiga'],
      ['C67.3', 'Neoplasia maligna da parede anterior da bexiga'],
      ['C67.4', 'Neoplasia maligna da parede posterior da bexiga'],
      ['C67.5', 'Neoplasia maligna do colo da bexiga'],
      ['C67.6', 'Neoplasia maligna do orifício uretérico'],
      ['C67.7', 'Neoplasia maligna do úraco'],
      ['C67.8', 'Neoplasia maligna da bexiga com lesão invasiva'],
      ['C67.9', 'Neoplasia maligna da bexiga, sem outra especificação'],
      ['D09.0', 'Carcinoma in situ da bexiga'],
      ['D41.4', 'Neoplasia de comportamento incerto ou desconhecido da bexiga'],
      ['D30.3', 'Neoplasia benigna da bexiga'],
      ['Z12.6', 'Exame especial de rastreamento de neoplasia da bexiga'],
    ] },
    { id: 'rim', nome: 'Rim, pelve renal e ureter', itens: [
      ['C64', 'Neoplasia maligna do rim, exceto pelve renal'],
      ['C65', 'Neoplasia maligna da pelve renal'],
      ['C66', 'Neoplasia maligna dos ureteres'],
      ['D41.0', 'Neoplasia de comportamento incerto ou desconhecido do rim'],
      ['D41.1', 'Neoplasia de comportamento incerto ou desconhecido da pelve renal'],
      ['D41.2', 'Neoplasia de comportamento incerto ou desconhecido do ureter'],
      ['D30.0', 'Neoplasia benigna do rim'],
      ['D30.1', 'Neoplasia benigna da pelve renal'],
      ['D30.2', 'Neoplasia benigna do ureter'],
    ] },
    { id: 'uretra', nome: 'Uretra e outros órgãos urinários', itens: [
      ['C68', 'Neoplasia maligna de outros órgãos urinários e dos não especificados'],
      ['C68.0', 'Neoplasia maligna da uretra'],
      ['C68.1', 'Neoplasia maligna da glândula parauretral'],
      ['C68.8', 'Neoplasia maligna dos órgãos urinários com lesão invasiva'],
      ['C68.9', 'Neoplasia maligna de órgão urinário, não especificado'],
      ['D09.1', 'Carcinoma in situ de outros órgãos urinários e os não especificados'],
      ['D41.3', 'Neoplasia de comportamento incerto ou desconhecido da uretra'],
      ['D41.7', 'Neoplasia de comportamento incerto ou desconhecido de outros órgãos urinários'],
      ['D41.9', 'Neoplasia de comportamento incerto ou desconhecido de órgão urinário, não especificado'],
      ['D30.4', 'Neoplasia benigna da uretra'],
      ['D30.7', 'Neoplasia benigna de outros órgãos urinários'],
      ['D30.9', 'Neoplasia benigna de órgão urinário, não especificado'],
    ] },
    { id: 'testiculo', nome: 'Testículo', itens: [
      ['C62', 'Neoplasia maligna dos testículos'],
      ['C62.0', 'Neoplasia maligna do testículo criptorquídico'],
      ['C62.1', 'Neoplasia maligna do testículo tópico'],
      ['C62.9', 'Neoplasia maligna do testículo, sem outras especificações'],
      ['D40.1', 'Neoplasia de comportamento incerto ou desconhecido do testículo'],
      ['D29.2', 'Neoplasia benigna dos testículos'],
    ] },
    { id: 'penis', nome: 'Pênis, escroto e outros órgãos genitais masculinos', itens: [
      ['C60', 'Neoplasia maligna do pênis'],
      ['C60.0', 'Neoplasia maligna do prepúcio'],
      ['C60.1', 'Neoplasia maligna da glande'],
      ['C60.2', 'Neoplasia maligna do corpo do pênis'],
      ['C60.8', 'Neoplasia maligna do pênis com lesão invasiva'],
      ['C60.9', 'Neoplasia maligna do pênis, não especificado'],
      ['C63', 'Neoplasia maligna de outros órgãos genitais masculinos e dos não especificados'],
      ['C63.0', 'Neoplasia maligna do epidídimo'],
      ['C63.1', 'Neoplasia maligna do cordão espermático'],
      ['C63.2', 'Neoplasia maligna do escroto'],
      ['C63.7', 'Neoplasia maligna de outros órgãos genitais masculinos especificados'],
      ['C63.8', 'Neoplasia maligna dos órgãos genitais masculinos com lesão invasiva'],
      ['C63.9', 'Neoplasia maligna de órgão genital masculino, não especificado'],
      ['D07.4', 'Carcinoma in situ do pênis'],
      ['D07.6', 'Carcinoma in situ de outros órgãos genitais masculinos e os não especificados'],
      ['D40.7', 'Neoplasia de comportamento incerto ou desconhecido de outros órgãos genitais masculinos'],
      ['D40.9', 'Neoplasia de comportamento incerto ou desconhecido de órgão genital masculino, não especificado'],
      ['D29.0', 'Neoplasia benigna do pênis'],
      ['D29.3', 'Neoplasia benigna do epidídimo'],
      ['D29.4', 'Neoplasia benigna do escroto'],
      ['D29.7', 'Neoplasia benigna de outros órgãos genitais masculinos'],
      ['D29.9', 'Neoplasia benigna de órgão genital masculino, não especificado'],
    ] },
    { id: 'adrenal', nome: 'Adrenal e paragânglios', itens: [
      ['C74', 'Neoplasia maligna da glândula supra-renal [glândula adrenal]'],
      ['C74.0', 'Neoplasia maligna do córtex da supra-renal'],
      ['C74.1', 'Neoplasia maligna da medula da supra-renal'],
      ['C74.9', 'Neoplasia maligna da glândula supra-renal, não especificada'],
      ['C75.5', 'Neoplasia maligna do corpo aórtico e outros paragânglios'],
      ['D44.1', 'Neoplasia de comportamento incerto ou desconhecido da glândula supra-renal (adrenal)'],
      ['D44.7', 'Neoplasia de comportamento incerto ou desconhecido dos corpos aórticos e outros paragânglios'],
      ['D35.0', 'Neoplasia benigna da glândula supra-renal (adrenal)'],
      ['D35.6', 'Neoplasia benigna dos corpos aórticos e outros paragânglios'],
    ] },
    { id: 'retro', nome: 'Retroperitônio e partes moles', itens: [
      ['C48.0', 'Neoplasia maligna do retroperitônio'],
      ['C49.4', 'Neoplasia maligna do tecido conjuntivo e dos tecidos moles do abdome'],
      ['C49.5', 'Neoplasia maligna do tecido conjuntivo e dos tecidos moles da pelve'],
    ] },
    { id: 'meta', nome: 'Metástases e linfonodos (neoplasia secundária)', itens: [
      ['C77.2', 'Neoplasia maligna secundária e não especificada dos gânglios linfáticos intra-abdominais'],
      ['C77.4', 'Neoplasia maligna secundária e não especificada dos gânglios linfáticos inguinais e dos membros inferiores'],
      ['C77.5', 'Neoplasia maligna secundária e não especificada dos gânglios linfáticos intrapélvicos'],
      ['C78.0', 'Neoplasia maligna secundária dos pulmões'],
      ['C78.7', 'Neoplasia maligna secundária do fígado'],
      ['C79.0', 'Neoplasia maligna secundária do rim e da pelve renal'],
      ['C79.1', 'Neoplasia maligna secundária da bexiga, de outro órgão urinário e não especificado'],
      ['C79.3', 'Neoplasia maligna secundária do encéfalo e das meninges cerebrais'],
      ['C79.5', 'Neoplasia maligna secundária dos ossos e da medula óssea'],
      ['C79.7', 'Neoplasia maligna secundária das glândulas supra-renais (adrenais)'],
      ['C79.8', 'Neoplasia maligna secundária de outra localização especificada'],
    ] },
    { id: 'z', nome: 'Rastreamento, seguimento, tratamento e história', itens: [
      ['Z12.5', 'Exame especial de rastreamento de neoplasia da próstata'],
      ['Z12.6', 'Exame especial de rastreamento de neoplasia da bexiga'],
      ['Z08.0', 'Exame de seguimento após cirurgia por neoplasia maligna'],
      ['Z08.1', 'Exame de seguimento após radioterapia por neoplasia maligna'],
      ['Z08.2', 'Exame de seguimento após quimioterapia por neoplasia maligna'],
      ['Z08.7', 'Exame de seguimento após tratamento combinado por neoplasia maligna'],
      ['Z08.8', 'Exame de seguimento após outro tratamento por neoplasia maligna'],
      ['Z08.9', 'Exame de seguimento após tratamento não especificado por neoplasia maligna'],
      ['Z51.0', 'Sessão de radioterapia'],
      ['Z51.1', 'Sessão de quimioterapia por neoplasia'],
      ['Z85.4', 'História pessoal de neoplasia maligna de órgãos genitais'],
      ['Z85.5', 'História pessoal de neoplasia maligna de trato urinário'],
      ['Z80.4', 'História familiar de neoplasia maligna de órgãos genitais'],
      ['Z80.5', 'História familiar de neoplasia maligna do trato urinário'],
      ['Z90.5', 'Ausência adquirida de rim'],
      ['Z90.6', 'Ausência adquirida de outros órgãos do trato urinário'],
      ['Z90.7', 'Ausência adquirida de órgão(s) genital(is)'],
      ['Z93.5', 'Cistostomia'],
      ['Z93.6', 'Outros estomas das vias urinárias'],
    ] },
  ],
};

// SIGTAP — procedimentos cirúrgicos oncológicos urológicos (Tabela de Procedimentos do SUS), com compatibilidades
// Fonte: SIGTAP/DATASUS competência 10/2026 (consultada via espelho UniSUS) e Portaria GM/MS nº 11.842/2026 (prostatectomia robótica).
const SIGTAP = {
  competencia: '10/2026',
  fontes: [
    { t: 'SIGTAP — Sistema de Gerenciamento da Tabela de Procedimentos do SUS (DATASUS)', u: 'https://sigtap.datasus.gov.br/' },
    { t: 'UniSUS — espelho da SIGTAP, subgrupo 04.16 Cirurgia em oncologia (competência 10/2026)', u: 'https://unisus.com.br/sigtap/sub-grupo/0416-cirurgia-em-oncologia' },
    { t: 'Portaria GM/MS nº 11.842, de 2/7/2026 — prostatectomia radical assistida por robô (Conass Informa 120/2026)', u: 'https://www.conass.org.br/conass-informa-n-120-2026-publicada-portaria-gm-n-11-842-que-inclui-procedimentos-de-prostatectomia-radical-assistida-por-robo-na-tabela-de-procedimentos-medicamentos-orteses-proteses-e/' },
  ],
  habOnco: 'UNACON (17.06–17.11), CACON (17.12–17.13) ou Hospital Geral com cirurgia oncológica (17.14); incremento de 0,20% em SH e SP para Oncologia Cirúrgica Porte A/B (17.17–17.18)',
  cbo: { 225225: 'cirurgião geral', 225230: 'cirurgião pediátrico', 225285: 'urologista', 225290: 'cancerologista cirúrgico', 225220: 'cirurgião do aparelho digestivo', 225250: 'ginecologista e obstetra', 225280: 'coloproctologista' },
  grupos: [
    { id: 'prostata', nome: 'Próstata', itens: [
      { cod: '04.16.01.013-0', nome: 'Prostatovesiculectomia radical em oncologia', desc: 'Ressecção total da próstata e vesículas seminais, com ou sem ressecção de outras estruturas pélvicas, por tumor maligno. Admite procedimento sequencial.', total: 4416.26, sh: 3466.31, sp: 949.95, perm: 4, qmax: 1, idade: '≥ 40 anos', mod: 'Hospitalar', cbo: [225225, 225285, 225290],
        cid: [['C61', 'Neoplasia maligna da próstata']],
        compat: [['04.16.02.002-0', 'Linfadenectomia pélvica em oncologia', 'ilimitada']], leito: 'Cirúrgico' },
      { cod: '04.16.01.012-1', nome: 'Prostatectomia em oncologia', desc: 'Retirada total ou parcial da próstata, com ou sem outras estruturas pélvicas, por tumor maligno. Admite procedimento sequencial.', total: 3983.29, sh: 2790.07, sp: 1193.22, perm: 4, qmax: 1, idade: '≥ 40 anos', mod: 'Hospitalar', cbo: [225225, 225285, 225290],
        cid: [['C61', 'Neoplasia maligna da próstata']],
        compat: [['04.09.04.014-2', 'Orquiectomia subcapsular bilateral', 'ilimitada']], leito: 'Cirúrgico' },
      { cod: '04.16.01.023-7', nome: 'Prostatectomia radical assistida por robô em oncologia', desc: 'Incluído pela Portaria GM/MS nº 11.842/2026. Exclusivo para UNACON e CACON habilitados em Prostatectomia Robótica (39.01), com serviço 175/001 (Cirurgia Robótica) e equipamento 16.01 registrado no CNES. Financiamento FAEC.', total: 15065.65, sh: 12052.52, sp: 3013.13, perm: 3, qmax: 1, idade: '18 a 130 anos', mod: 'Hospitalar', cbo: [225225, 225285, 225290],
        cid: [['C61', 'Neoplasia maligna da próstata']],
        compat: [['04.15.02.005-0', 'Procedimento sequencial (Anexo II da portaria)', '—'], ['04.06.02.019-1', 'Linfadenectomia pélvica', '—'], ['04.16.01.002-4', 'Cistectomia com derivação em 1 só tempo em oncologia', '—']], leito: 'Cirúrgico', hab: 'UNACON ou CACON + habilitação 39.01 Prostatectomia Robótica', novo: true },
      { cod: '04.09.03.005-8', nome: 'Prostatectomia radical assistida por robô', desc: 'Incluído pela Portaria GM/MS nº 11.842/2026. Exclusivo para hospital geral habilitado em Prostatectomia Robótica (39.01), com serviço 175/001 e equipamento 16.01. Exclui os demais procedimentos de prostatectomia na mesma AIH. Financiamento FAEC.', total: 15065.65, sh: 12052.52, sp: 3013.13, perm: 3, qmax: 1, idade: '18 a 130 anos', mod: 'Hospitalar', cbo: [225225, 225285, 225290],
        cid: [['C61', 'Neoplasia maligna da próstata']],
        compat: [['04.15.02.005-0', 'Procedimento sequencial (Anexo II da portaria)', '—'], ['04.06.02.019-1', 'Linfadenectomia pélvica', '—'], ['04.16.01.002-4', 'Cistectomia com derivação em 1 só tempo em oncologia', '—']], leito: 'Cirúrgico', hab: 'Hospital geral + habilitação 39.01 Prostatectomia Robótica', novo: true },
    ] },
    { id: 'bexiga', nome: 'Bexiga e trato urinário', itens: [
      { cod: '04.16.01.017-2', nome: 'Ressecção endoscópica de tumor vesical em oncologia', desc: 'Ressecção de tumor único ou múltiplo superficial da bexiga urinária por meio endoscópico.', total: 1040.42, sh: 830.31, sp: 210.11, perm: 3, qmax: 1, idade: '≥ 12 anos', mod: 'Hospitalar · Hospital-dia', cbo: [225225, 225230, 225285, 225290],
        cid: [['C67.0', 'Neoplasia maligna do trígono da bexiga'], ['C67.1', 'Neoplasia maligna da cúpula da bexiga'], ['C67.2', 'Neoplasia maligna da parede lateral da bexiga'], ['C67.3', 'Neoplasia maligna da parede anterior da bexiga'], ['C67.4', 'Neoplasia maligna da parede posterior da bexiga'], ['C67.5', 'Neoplasia maligna do colo da bexiga'], ['C67.6', 'Neoplasia maligna do orifício uretérico'], ['C67.7', 'Neoplasia maligna do úraco'], ['C67.8', 'Neoplasia maligna da bexiga com lesão invasiva'], ['C79.1', 'Neoplasia maligna secundária da bexiga, de outro órgão urinário e não especificado'], ['D09.0', 'Carcinoma in situ da bexiga']],
        compat: [], leito: 'Cirúrgico · Pediátrico · Leito-dia' },
      { cod: '04.16.01.002-4', nome: 'Cistectomia com derivação em 1 só tempo em oncologia', desc: 'Ressecção completa ou parcial da bexiga, com ou sem ureteroenterostomia. Na derivação simples admite ou não nefrostomia ou ureterostomia. Pode ser seguida de procedimentos sequenciais.', total: 4062.45, sh: 3167.58, sp: 894.87, perm: 10, qmax: 1, idade: 'qualquer', mod: 'Hospitalar', cbo: [225225, 225230, 225285, 225290],
        cid: [['C67.0', 'Neoplasia maligna do trígono da bexiga'], ['C67.1', 'Neoplasia maligna da cúpula da bexiga'], ['C67.2', 'Neoplasia maligna da parede lateral da bexiga'], ['C67.3', 'Neoplasia maligna da parede anterior da bexiga'], ['C67.4', 'Neoplasia maligna da parede posterior da bexiga'], ['C67.5', 'Neoplasia maligna do colo da bexiga'], ['C67.6', 'Neoplasia maligna do orifício uretérico'], ['C67.7', 'Neoplasia maligna do úraco'], ['C67.8', 'Neoplasia maligna da bexiga com lesão invasiva']],
        compat: [['04.16.01.004-0', 'Cistoenteroplastia em oncologia', 'ilimitada'], ['04.16.01.019-9', 'Reimplante ureteral em oncologia — ureteroenterostomia', 'ilimitada'], ['04.16.02.002-0', 'Linfadenectomia pélvica em oncologia', 'ilimitada'], ['04.16.05.007-7', 'Retossigmoidectomia abdominal em oncologia', 'ilimitada'], ['04.16.06.011-0', 'Histerectomia com ou sem anexectomia em oncologia', 'ilimitada'], ['07.02.06.001-1', 'Cateter duplo J (OPM)', '2']], leito: 'Cirúrgico · Pediátrico', obs: 'C67.9 (bexiga, sem outra especificação) não consta entre os CIDs compatíveis: codificar a topografia.' },
      { cod: '04.16.01.004-0', nome: 'Cistoenteroplastia em oncologia', desc: 'Reconstrução da bexiga com alça intestinal após ressecção vesical por tumor primário ou por invasão de tumor de órgão contínuo ou contíguo.', total: 4083.73, sh: 3184.82, sp: 898.91, perm: 10, qmax: 1, idade: 'qualquer', mod: 'Hospitalar', cbo: [225225, 225230, 225285, 225290],
        cid: [['C61', 'Neoplasia maligna da próstata'], ['C67.0', 'Neoplasia maligna do trígono da bexiga'], ['C67.1', 'Neoplasia maligna da cúpula da bexiga'], ['C67.2', 'Neoplasia maligna da parede lateral da bexiga'], ['C67.3', 'Neoplasia maligna da parede anterior da bexiga'], ['C67.5', 'Neoplasia maligna do colo da bexiga'], ['C67.6', 'Neoplasia maligna do orifício uretérico'], ['C67.7', 'Neoplasia maligna do úraco'], ['C67.8', 'Neoplasia maligna da bexiga com lesão invasiva'], ['C68.0', 'Neoplasia maligna da uretra'], ['C19', 'Neoplasia maligna da junção retossigmoide'], ['C20', 'Neoplasia maligna do reto'], ['C18.x', 'Neoplasia maligna do cólon (C18.0, C18.1, C18.2, C18.6, C18.7)'], ['C17.x', 'Neoplasia maligna do intestino delgado (C17.0–C17.3, C17.8)'], ['C52', 'Neoplasia maligna da vagina'], ['C53.x', 'Neoplasia maligna do colo do útero (C53.1, C53.8)'], ['C54.x', 'Neoplasia maligna do corpo do útero (C54.0–C54.3, C54.8)'], ['C56', 'Neoplasia maligna do ovário']],
        compat: [['07.02.05.028-8', 'Grampeador linear cortante (OPM)', '1'], ['07.02.05.004-0', 'Carga para grampeador linear cortante (OPM)', '1'], ['07.02.06.001-1', 'Cateter duplo J (OPM)', '2']], leito: 'Cirúrgico · Pediátrico', obs: 'C67.4 (parede posterior) e C67.9 não constam na lista de CIDs compatíveis deste procedimento.' },
      { cod: '04.16.01.016-4', nome: 'Ressecção de tumores múltiplos e simultâneos do trato urinário em oncologia', desc: 'Ressecção cirúrgica de tumores malignos múltiplos e simultâneos, em mais de um local do trato urinário superior e inferior.', total: 4280.18, sh: 3381.17, sp: 899.01, perm: 5, qmax: 1, idade: 'qualquer', mod: 'Hospitalar', cbo: [225225, 225230, 225285, 225290],
        cid: [['C65', 'Neoplasia maligna da pelve renal'], ['C66', 'Neoplasia maligna dos ureteres'], ['C67.0', 'Neoplasia maligna do trígono da bexiga'], ['C67.1', 'Neoplasia maligna da cúpula da bexiga'], ['C67.2', 'Neoplasia maligna da parede lateral da bexiga'], ['C67.3', 'Neoplasia maligna da parede anterior da bexiga'], ['C67.4', 'Neoplasia maligna da parede posterior da bexiga'], ['C67.5', 'Neoplasia maligna do colo da bexiga'], ['C67.6', 'Neoplasia maligna do orifício uretérico'], ['C67.7', 'Neoplasia maligna do úraco'], ['C67.8', 'Neoplasia maligna da bexiga com lesão invasiva'], ['C67.9', 'Neoplasia maligna da bexiga, sem outra especificação'], ['C80', 'Neoplasia maligna, sem especificação de localização']],
        compat: [], leito: 'Cirúrgico · Pediátrico' },
      { cod: '04.16.01.018-0', nome: 'Reimplante ureteral em oncologia — ureterocistoneostomia', desc: 'Reimplante ureteral na bexiga quando há invasão tumoral vesical, primária ou secundária a tumor de órgão genital, intestinal ou retroperitoneal.', total: 3850.04, sh: 2976.86, sp: 873.18, perm: 5, qmax: 2, idade: 'qualquer', mod: 'Hospitalar', cbo: [225225, 225230, 225285, 225290],
        cid: [['C66', 'Neoplasia maligna dos ureteres'], ['C67.7', 'Neoplasia maligna do úraco'], ['C79.1', 'Neoplasia maligna secundária da bexiga, de outro órgão urinário e não especificado'], ['D41.4', 'Neoplasia de comportamento incerto ou desconhecido da bexiga']],
        compat: [['07.02.06.001-1', 'Cateter duplo J (OPM)', '1']], leito: 'Cirúrgico · Pediátrico' },
      { cod: '04.16.01.019-9', nome: 'Reimplante ureteral em oncologia — ureteroenterostomia', desc: 'Reimplante ureteral em segmento de alça intestinal, por invasão tumoral vesical primária ou secundária a tumor genital, intestinal ou retroperitoneal.', total: 3950.93, sh: 3057.98, sp: 892.95, perm: 5, qmax: 2, idade: 'qualquer', mod: 'Hospitalar', cbo: [225225, 225230, 225285, 225290],
        cid: [['C66', 'Neoplasia maligna dos ureteres'], ['C67.7', 'Neoplasia maligna do úraco'], ['C79.1', 'Neoplasia maligna secundária da bexiga, de outro órgão urinário e não especificado'], ['D41.4', 'Neoplasia de comportamento incerto ou desconhecido da bexiga']],
        compat: [['07.02.05.028-8', 'Grampeador linear cortante (OPM)', '1'], ['07.02.05.004-0', 'Carga para grampeador linear cortante (OPM)', '3'], ['07.02.06.001-1', 'Cateter duplo J (OPM)', '1']], leito: 'Cirúrgico · Pediátrico' },
    ] },
    { id: 'rim', nome: 'Rim e trato urinário superior', itens: [
      { cod: '04.16.01.007-5', nome: 'Nefrectomia total em oncologia', desc: 'Remoção total do rim por tumor maligno, tumor de comportamento incerto ou angiomiolipoma. Admite procedimento sequencial.', total: 1753.30, sh: 1316.39, sp: 436.91, perm: 4, qmax: 1, idade: 'qualquer', mod: 'Hospitalar', cbo: [225225, 225230, 225285, 225290],
        cid: [['C64', 'Neoplasia maligna do rim, exceto pelve renal'], ['C65', 'Neoplasia maligna da pelve renal'], ['C74.0', 'Neoplasia maligna do córtex da supra-renal'], ['C74.1', 'Neoplasia maligna da medula da supra-renal'], ['C74.9', 'Neoplasia maligna da glândula supra-renal, não especificada'], ['C79.7', 'Neoplasia maligna secundária das glândulas supra-renais'], ['D17.7', 'Neoplasia lipomatosa benigna de outras localizações (angiomiolipoma)'], ['D41.0', 'Neoplasia de comportamento incerto ou desconhecido do rim'], ['D41.1', 'Neoplasia de comportamento incerto ou desconhecido da pelve renal']],
        compat: [['04.16.02.022-4', 'Linfadenectomia retroperitoneal em oncologia', 'ilimitada'], ['04.07.03.012-3', 'Esplenectomia', 'ilimitada'], ['04.07.03.018-2', 'Pancreatectomia parcial', 'ilimitada'], ['04.16.05.002-6', 'Colectomia parcial (hemicolectomia) em oncologia', 'ilimitada']], leito: 'Cirúrgico · Pediátrico' },
      { cod: '04.16.01.021-0', nome: 'Nefrectomia parcial em oncologia', desc: 'Ressecção parcial do rim por tumor maligno, tumor de comportamento incerto ou angiomiolipoma. A linfadenectomia retroperitoneal sequencial só é compatível com CID de tumor maligno.', total: 2279.28, sh: 1711.30, sp: 567.98, perm: 4, qmax: 1, idade: 'qualquer', mod: 'Hospitalar', cbo: [225225, 225230, 225285, 225290],
        cid: [['C64', 'Neoplasia maligna do rim, exceto pelve renal'], ['C65', 'Neoplasia maligna da pelve renal'], ['C74.0', 'Neoplasia maligna do córtex da supra-renal'], ['C74.1', 'Neoplasia maligna da medula da supra-renal'], ['C74.9', 'Neoplasia maligna da glândula supra-renal, não especificada'], ['C79.7', 'Neoplasia maligna secundária das glândulas supra-renais'], ['D17.7', 'Neoplasia lipomatosa benigna de outras localizações (angiomiolipoma)'], ['D41.0', 'Neoplasia de comportamento incerto ou desconhecido do rim'], ['D41.1', 'Neoplasia de comportamento incerto ou desconhecido da pelve renal']],
        compat: [['04.16.02.022-4', 'Linfadenectomia retroperitoneal em oncologia', 'ilimitada'], ['07.02.06.001-1', 'Cateter duplo J (OPM)', '1']], leito: 'Cirúrgico · Pediátrico' },
      { cod: '04.16.01.009-1', nome: 'Nefroureterectomia total em oncologia', desc: 'Retirada total do rim e do ureter até a bexiga, por tumor maligno ou de comportamento incerto. A linfadenectomia retroperitoneal sequencial só é compatível com CID de tumor maligno.', total: 2279.28, sh: 1711.30, sp: 567.98, perm: 5, qmax: 1, idade: 'qualquer', mod: 'Hospitalar', cbo: [225225, 225230, 225285, 225290],
        cid: [['C65', 'Neoplasia maligna da pelve renal'], ['C66', 'Neoplasia maligna dos ureteres'], ['D41.0', 'Neoplasia de comportamento incerto ou desconhecido do rim'], ['D41.1', 'Neoplasia de comportamento incerto ou desconhecido da pelve renal']],
        compat: [['04.16.02.022-4', 'Linfadenectomia retroperitoneal em oncologia', 'ilimitada'], ['04.07.03.012-3', 'Esplenectomia', 'ilimitada'], ['04.07.03.018-2', 'Pancreatectomia parcial', 'ilimitada'], ['04.16.05.002-6', 'Colectomia parcial (hemicolectomia) em oncologia', 'ilimitada']], leito: 'Cirúrgico · Pediátrico' },
    ] },
    { id: 'testiculo', nome: 'Testículo', itens: [
      { cod: '04.16.01.011-3', nome: 'Orquiectomia unilateral em oncologia', desc: 'Ressecção total do testículo por tumor maligno, secundário ou de comportamento incerto.', total: 852.49, sh: 588.09, sp: 264.40, perm: 1, qmax: 2, idade: 'qualquer', mod: 'Hospitalar · Hospital-dia', cbo: [225225, 225230, 225285, 225290],
        cid: [['C62.0', 'Neoplasia maligna do testículo criptorquídico'], ['C62.1', 'Neoplasia maligna do testículo tópico'], ['C62.9', 'Neoplasia maligna do testículo, sem outras especificações'], ['C79.8', 'Neoplasia maligna secundária de outra localização especificada'], ['D40.1', 'Neoplasia de comportamento incerto ou desconhecido do testículo']],
        compat: [['07.02.06.003-8', 'Prótese testicular em gel de silicone (OPM)', '1']], leito: 'Cirúrgico · Pediátrico · Leito-dia', obs: 'Quantidade máxima 2 (bilateral). A linfadenectomia retroperitoneal (04.16.02.022-4) é registrada como procedimento principal próprio, com CID C78.6.' },
    ] },
    { id: 'penis', nome: 'Pênis', itens: [
      { cod: '04.16.01.001-6', nome: 'Amputação de pênis em oncologia', desc: 'Remoção parcial ou total do pênis por tumor maligno.', total: 839.28, sh: 639.36, sp: 199.92, perm: 5, qmax: 1, idade: '≥ 12 anos', mod: 'Hospitalar', cbo: [225225, 225285, 225290],
        cid: [['C60.0', 'Neoplasia maligna do prepúcio'], ['C60.1', 'Neoplasia maligna da glande'], ['C60.2', 'Neoplasia maligna do corpo do pênis'], ['C60.8', 'Neoplasia maligna do pênis com lesão invasiva'], ['C60.9', 'Neoplasia maligna do pênis, não especificado']],
        compat: [['04.16.02.002-0', 'Linfadenectomia pélvica em oncologia', '1'], ['04.16.02.023-2', 'Linfadenectomia inguinal unilateral em oncologia', 'ilimitada'], ['04.16.02.025-9', 'Linfadenectomia inguino-ilíaca unilateral em oncologia', 'ilimitada'], ['04.09.02.016-8', 'Uretrostomia perineal/cutânea/externa', 'ilimitada'], ['04.09.05.009-1', 'Restauração da função erétil do pênis', 'ilimitada'], ['07.02.06.002-0', 'Prótese peniana maleável (OPM)', '1']], leito: 'Cirúrgico · Pediátrico' },
      { cod: '04.16.01.022-9', nome: 'Amputação total ampliada de pênis em oncologia', desc: 'Ressecção total do pênis com bolsa escrotal, com ou sem orquiectomia, por tumor maligno.', total: 1091.07, sh: 831.17, sp: 259.90, perm: 5, qmax: 1, idade: '≥ 12 anos', mod: 'Hospitalar', cbo: [225225, 225230, 225285, 225290],
        cid: [['C60.0', 'Neoplasia maligna do prepúcio'], ['C60.1', 'Neoplasia maligna da glande'], ['C60.2', 'Neoplasia maligna do corpo do pênis'], ['C60.8', 'Neoplasia maligna do pênis com lesão invasiva'], ['C60.9', 'Neoplasia maligna do pênis, não especificado']],
        compat: [['04.16.02.002-0', 'Linfadenectomia pélvica em oncologia', 'ilimitada'], ['04.16.02.023-2', 'Linfadenectomia inguinal unilateral em oncologia', 'ilimitada'], ['04.16.02.025-9', 'Linfadenectomia inguino-ilíaca unilateral em oncologia', 'ilimitada'], ['04.09.02.016-8', 'Uretrostomia perineal/cutânea/externa', 'ilimitada'], ['04.01.02.003-7', 'Enxerto livre de pele total', 'ilimitada'], ['04.16.08.008-1', 'Reconstrução com retalho miocutâneo em oncologia', 'ilimitada']], leito: 'Cirúrgico · Pediátrico' },
    ] },
    { id: 'adrenal', nome: 'Adrenal', itens: [
      { cod: '04.16.01.020-2', nome: 'Suprarrenalectomia em oncologia', desc: 'Ressecção da suprarrenal por tumor primário maligno, de comportamento incerto ou metastático.', total: 2711.10, sh: 2130.18, sp: 580.92, perm: 6, qmax: 2, idade: 'qualquer', mod: 'Hospitalar', cbo: [225225, 225230, 225285, 225290],
        cid: [['C74.0', 'Neoplasia maligna do córtex da supra-renal'], ['C74.1', 'Neoplasia maligna da medula da supra-renal'], ['C74.9', 'Neoplasia maligna da glândula supra-renal, não especificada'], ['C79.7', 'Neoplasia maligna secundária das glândulas supra-renais'], ['D44.1', 'Neoplasia de comportamento incerto ou desconhecido da glândula supra-renal']],
        compat: [['04.16.01.007-5', 'Nefrectomia total em oncologia', 'ilimitada'], ['04.16.01.021-0', 'Nefrectomia parcial em oncologia', 'ilimitada'], ['04.16.02.022-4', 'Linfadenectomia retroperitoneal em oncologia', 'ilimitada'], ['04.07.03.012-3', 'Esplenectomia', 'ilimitada'], ['04.07.03.018-2', 'Pancreatectomia parcial', 'ilimitada'], ['04.16.05.002-6', 'Colectomia parcial (hemicolectomia) em oncologia', 'ilimitada']], leito: 'Cirúrgico · Pediátrico', obs: 'Adenoma (D35.0) e feocromocitoma benigno não constam: para lesão benigna usar o procedimento não oncológico correspondente.' },
    ] },
    { id: 'linfo', nome: 'Linfadenectomias (04.16.02)', itens: [
      { cod: '04.16.02.002-0', nome: 'Linfadenectomia pélvica em oncologia', desc: 'Esvaziamento de cadeias linfáticas pélvicas em tumores malignos ou de natureza incerta do aparelho genital, urinário, digestivo inferior ou partes moles pélvicas, para estadiamento ou tratamento.', total: 1673.40, sh: 1218.56, sp: 454.84, perm: 3, qmax: 1, idade: '≥ 12 anos', mod: 'Hospitalar', cbo: [225225, 225230, 225285, 225290, 225220, 225250, 225280],
        cid: [['C77.5', 'Neoplasia maligna secundária e não especificada dos gânglios linfáticos intrapélvicos']],
        compat: [], leito: 'Cirúrgico · Pediátrico', obs: 'Como procedimento principal exige CID C77.5; como sequencial da prostatovesiculectomia, cistectomia ou amputação de pênis entra pela compatibilidade do procedimento principal.' },
      { cod: '04.16.02.022-4', nome: 'Linfadenectomia retroperitoneal em oncologia', desc: 'Esvaziamento de cadeias linfáticas retroperitoneais em tumor maligno ou de natureza incerta do aparelho genital, urinário, digestivo ou partes moles, para estadiamento ou tratamento.', total: 4577.36, sh: 3505.95, sp: 1071.41, perm: 5, qmax: 1, idade: 'qualquer', mod: 'Hospitalar', cbo: [225225, 225230, 225285, 225290, 225220, 225250, 225280],
        cid: [['C78.6', 'Neoplasia maligna secundária do retroperitônio e do peritônio']],
        compat: [], leito: 'Cirúrgico · Pediátrico', obs: 'Como principal (ex.: massa residual pós-quimioterapia em tumor de testículo) exige CID C78.6; como sequencial de nefrectomia, nefroureterectomia ou suprarrenalectomia, só com CID de tumor maligno.' },
      { cod: '04.16.02.023-2', nome: 'Linfadenectomia inguinal unilateral em oncologia', desc: 'Esvaziamento da cadeia linfática inguinal em tumor maligno ou de natureza incerta, para estadiamento ou tratamento.', total: 1809.05, sh: 1331.36, sp: 477.69, perm: 4, qmax: 2, idade: '≥ 12 anos', mod: 'Hospitalar', cbo: [225225, 225230, 225285, 225290, 225250],
        cid: [['C77.4', 'Neoplasia maligna secundária e não especificada dos gânglios linfáticos inguinais e dos membros inferiores']],
        compat: [], leito: 'Cirúrgico · Pediátrico', obs: 'Quantidade máxima 2 (bilateral).' },
      { cod: '04.16.02.025-9', nome: 'Linfadenectomia inguino-ilíaca unilateral em oncologia', desc: 'Esvaziamento dos linfonodos inguinais e ilíacos em tumores malignos ou de natureza incerta do aparelho genital, urinário, digestivo inferior ou da pele, para estadiamento ou tratamento.', total: 4303.05, sh: 3303.63, sp: 999.42, perm: 5, qmax: 2, idade: '≥ 12 anos', mod: 'Hospitalar', cbo: [225225, 225230, 225285, 225290, 225250, 225280],
        cid: [['C77.4', 'Neoplasia maligna secundária e não especificada dos gânglios linfáticos inguinais e dos membros inferiores'], ['C77.5', 'Neoplasia maligna secundária e não especificada dos gânglios linfáticos intrapélvicos']],
        compat: [], leito: 'Cirúrgico · Pediátrico', obs: 'Quantidade máxima 2 (bilateral). A linfadenectomia seletiva guiada/linfonodo sentinela (04.16.02.024-0) não aceita CID de pênis (só melanoma e mama).' },
    ] },
  ],
};

// APAC — tratamento oncológico ambulatorial no SUS (SIGTAP 03.04): quimioterapia, hormonioterapia, imunoterapia e radioterapia em uro-oncologia
// Fonte: SIGTAP/DATASUS competência 10/2026 (via espelho UniSUS); Portaria SAS/MS nº 498/2016 (hormonioterapia prévia/adjuvante à RT de próstata); Manual de Bases Técnicas da Oncologia (INCA/MS).
const APAC = {
  competencia: '10/2026',
  fontes: [
    { t: 'SIGTAP — DATASUS', u: 'https://sigtap.datasus.gov.br/' },
    { t: 'UniSUS — espelho da SIGTAP, subgrupo 03.04 Tratamento em oncologia (10/2026)', u: 'https://unisus.com.br/sigtap/sub-grupo/0304-tratamento-em-oncologia' },
    { t: 'Portaria SAS/MS nº 498/2016 — hormonioterapia prévia e adjuvante à radioterapia (próstata)', u: 'https://saude.campinas.sp.gov.br/saude/lista_legislacoes/legis_2016/U_PT-MS-SAS-498_110516.pdf' },
    { t: 'Manual de Bases Técnicas da Oncologia — SIA/SUS (INCA/MS)', u: 'https://www.inca.gov.br/sites/ufu.sti.inca.local/files/media/document/manual_oncologia_29a_edicao_-_junho_2022.pdf' },
  ],
  habQt: 'UNACON (17.06–17.09) ou CACON (17.12–17.13), ou Serviço de Oncologia Clínica de complexo hospitalar (17.16); CBO 225121 oncologista clínico (a quimioterapia intravesical também aceita 225285 urologista)',
  habRt: 'Serviço de radioterapia: isolado (17.04), UNACON com radioterapia (17.07), CACON (17.12–17.13) ou de complexo hospitalar (17.15); CBO 225330 radioterapeuta',
  docs: [
    ['Laudo de solicitação de APAC (oncologia)', 'Preenchido pelo médico assistente e autorizado pelo gestor: identificação (CPF, preferencialmente, ou CNS), CID-10 principal compatível com o procedimento, data e número do laudo cito/histopatológico, estadiamento TNM e estádio (que não mudam depois de definidos), grau histológico, finalidade (prévia, adjuvante, curativa, paliativa, controle), esquema terapêutico (fármacos, doses, ciclos ou meses previstos), linha de tratamento e tratamentos anteriores (cirurgia, radioterapia, quimioterapia, com datas), condição clínica (Zubrod/Karnofsky).'],
    ['Laudo cito/histopatológico', 'Cópia obrigatória para autorizar quimioterapia e radioterapia: não há tratamento oncológico no SUS sem confirmação de malignidade. Para metástase, pode ser o laudo do tumor primário.'],
    ['Dados complementares da APAC (detalhe 022)', 'Quimioterapia/hormonioterapia: data do diagnóstico patológico, TNM e estádio, grau, finalidade, esquema, data de início, número de ciclos/meses. Radioterapia: região irradiada, campos, dose total e número de frações, datas de início e fim, finalidade.'],
    ['Validade e continuidade', 'A APAC inicial vale por até 3 competências; tratamentos contínuos (hormonioterapia, quimioterapia paliativa) seguem em APACs de continuidade (detalhe 014), também de até 3 competências cada, enquanto durar a indicação. Um procedimento principal por APAC; os secundários (inibidor da osteólise, G-CSF, narcose, alojamento) entram na mesma APAC dentro da quantidade permitida.'],
    ['Termo de esclarecimento', 'Na hormonioterapia de próstata (Portaria 498/2016, art. 2º) é obrigatório informar o paciente ou responsável sobre riscos e efeitos colaterais; registrar no prontuário.'],
    ['LME não se aplica', 'Os fármacos oncológicos (hormonioterapia, quimioterapia, imunoterapia) são fornecidos pelo hospital habilitado e ressarcidos pela APAC — não há dispensação em farmácia do Componente Especializado. O LME (Laudo de Solicitação, Avaliação e Autorização de Medicamentos) só é usado para medicamentos do CEAF, fora da oncologia.'],
  ],
  grupos: [
    { id: 'prostata', nome: 'Próstata', itens: [
      { cod: '03.04.02.007-9', nome: 'Hormonioterapia do adenocarcinoma de próstata avançado — 1ª linha', fin: 'Paliativa', desc: 'Hormonioterapia paliativa de primeira linha para adenocarcinoma de próstata localmente avançado, metastático ou recidivado, sem supressão androgênica prévia.', total: 301.50, qmax: 1, idade: '≥ 19 anos', tipo: 'qt',
        cid: [['C61', 'Neoplasia maligna da próstata']], compat: [['03.04.08.007-1', 'Inibidor da osteólise (secundário, se metástase óssea)', '1']], obs: 'APAC mensal de continuidade enquanto durar o bloqueio androgênico. Se o paciente for castrado cirurgicamente e tiver metástase óssea, o inibidor da osteólise pode ser o procedimento principal.' },
      { cod: '03.04.02.006-0', nome: 'Hormonioterapia do adenocarcinoma de próstata avançado — 2ª linha', fin: 'Paliativa', desc: 'Hormonioterapia paliativa de segunda linha para adenocarcinoma de próstata localmente avançado, metastático ou recidivado, com supressão androgênica prévia.', total: 147.10, qmax: 1, idade: '≥ 19 anos', tipo: 'qt',
        cid: [['C61', 'Neoplasia maligna da próstata']], compat: [['03.04.08.007-1', 'Inibidor da osteólise', '1']], obs: 'Cobre a manipulação hormonal após a primeira linha (antiandrogênio, troca de agente); não é o código da quimioterapia.' },
      { cod: '03.04.02.008-7', nome: 'Quimioterapia do adenocarcinoma de próstata resistente a hormonioterapia', fin: 'Paliativa', desc: 'Quimioterapia paliativa para adenocarcinoma de próstata avançado, metastático ou recidivado, refratário à hormonioterapia.', total: 1062.65, qmax: 1, idade: '≥ 19 anos', tipo: 'qt',
        cid: [['C61', 'Neoplasia maligna da próstata']], compat: [['03.04.08.007-1', 'Inibidor da osteólise', '1']], obs: 'Código da doença resistente à castração (docetaxel, cabazitaxel e, conforme PCDT/DDT vigente, os novos agentes hormonais).' },
      { cod: '03.04.04.020-7', nome: 'Hormonioterapia prévia à radioterapia externa do adenocarcinoma de próstata', fin: 'Prévia', desc: 'Hormonioterapia prévia (máximo 3 meses) ou concomitante (máximo 6 meses) à radioterapia externa, em risco intermediário ou alto, sem supressão androgênica cirúrgica. Incluída pela Portaria SAS/MS nº 498/2016.', total: 301.50, qmax: 1, idade: '19 a 130 anos', sexo: 'masculino', tipo: 'qt',
        cid: [['C61', 'Neoplasia maligna da próstata']], compat: [], obs: 'Valor conforme a portaria de inclusão (2016); conferir na competência vigente.' },
      { cod: '03.04.05.034-2', nome: 'Hormonioterapia adjuvante à radioterapia externa do adenocarcinoma de próstata', fin: 'Adjuvante', desc: 'Hormonioterapia após a radioterapia externa, em risco intermediário ou alto, por até 36 meses (incluídos os 6 meses concomitantes), sem supressão cirúrgica. Incluída pela Portaria SAS/MS nº 498/2016.', total: 301.50, qmax: 1, idade: '19 a 130 anos', sexo: 'masculino', tipo: 'qt',
        cid: [['C61', 'Neoplasia maligna da próstata']], compat: [], obs: 'Valor conforme a portaria de inclusão (2016); conferir na competência vigente.' },
      { cod: '03.04.01.045-6', nome: 'Radioterapia de próstata', fin: 'Radioterapia', desc: 'Radioterapia de próstata, incluindo a irradiação da cadeia linfática regional quando indicada. Excludente com a braquiterapia de próstata.', total: 5838.00, qmax: 1, idade: '≥ 40 anos', tipo: 'rt',
        cid: [['C61', 'Neoplasia maligna da próstata']], compat: [['03.04.01.053-7', 'Radioterapia de metástases em outras localizações', 'ilimitada'], ['03.04.01.052-9', 'Radioterapia de metástase em sistema nervoso central', 'ilimitada'], ['08.02.01.033-4', 'Alojamento para pacientes em radioterapia', '35']], obs: 'Registrada como tratamento completo (uma APAC), independentemente do número de frações.' },
      { cod: '03.04.01.046-4', nome: 'Braquiterapia de próstata', fin: 'Radioterapia', desc: 'Braquiterapia intersticial isolada para câncer de próstata, registrada como tratamento completo, independentemente do número de inserções. Excludente com a radioterapia de próstata.', total: 5838.00, qmax: 1, idade: '≥ 40 anos', tipo: 'rt', fundo: 'FAEC',
        cid: [['C61', 'Neoplasia maligna da próstata']], compat: [['03.04.01.034-0', 'Narcose para braquiterapia', '2'], ['08.02.01.033-4', 'Alojamento para pacientes em radioterapia', '2']], obs: 'Financiamento FAEC; sujeito à regulação de alta complexidade (CNRAC).' },
    ] },
    { id: 'bexiga', nome: 'Bexiga e carcinoma urotelial', itens: [
      { cod: '03.04.05.001-6', nome: 'Quimioterapia intravesical', fin: 'Adjuvante', desc: 'Quimioterapia adjuvante após ressecção transuretral de carcinoma superficial de bexiga (Ta/T1), por instilação intravesical (BCG ou quimioterápico).', total: 1300.00, qmax: 1, idade: '≥ 19 anos', tipo: 'qt', cboExtra: 'aceita também o urologista (225285)',
        cid: [['C67.0', 'Neoplasia maligna do trígono da bexiga'], ['C67.1', 'Neoplasia maligna da cúpula da bexiga'], ['C67.2', 'Neoplasia maligna da parede lateral da bexiga'], ['C67.3', 'Neoplasia maligna da parede anterior da bexiga'], ['C67.4', 'Neoplasia maligna da parede posterior da bexiga'], ['C67.5', 'Neoplasia maligna do colo da bexiga'], ['C67.6', 'Neoplasia maligna do orifício uretérico'], ['C67.7', 'Neoplasia maligna do úraco']], compat: [], obs: 'C67.8, C67.9 e D09.0 (carcinoma in situ) não constam entre os CIDs compatíveis: codificar a topografia (C67.0–C67.7). Único procedimento de APAC que o urologista pode assinar.' },
      { cod: '03.04.04.007-0', nome: 'Quimioterapia do carcinoma de bexiga (prévia)', fin: 'Prévia', desc: 'Quimioterapia prévia (neoadjuvante) à cirurgia ou à radioterapia do carcinoma de bexiga em estádio II a IV, sem metástase à distância.', total: 1300.00, qmax: 1, idade: '≥ 19 anos', tipo: 'qt',
        cid: [['C67.0', 'Neoplasia maligna do trígono da bexiga'], ['C67.1', 'Neoplasia maligna da cúpula da bexiga'], ['C67.2', 'Neoplasia maligna da parede lateral da bexiga'], ['C67.3', 'Neoplasia maligna da parede anterior da bexiga'], ['C67.4', 'Neoplasia maligna da parede posterior da bexiga'], ['C67.5', 'Neoplasia maligna do colo da bexiga'], ['C67.6', 'Neoplasia maligna do orifício uretérico'], ['C67.7', 'Neoplasia maligna do úraco'], ['C67.8', 'Neoplasia maligna da bexiga com lesão invasiva'], ['C67.9', 'Neoplasia maligna da bexiga, sem outra especificação']], compat: [], obs: 'Código da neoadjuvância (cisplatina-based) antes da cistectomia ou da quimiorradioterapia; só bexiga (não cobre trato superior).' },
      { cod: '03.04.02.040-0', nome: 'Quimioterapia de carcinoma urotelial avançado', fin: 'Paliativa', desc: 'Quimioterapia paliativa do carcinoma de pelve renal, ureter, bexiga urinária e uretra, em doença loco-regionalmente avançada, metastática ou recidivada.', total: 1300.00, qmax: 1, idade: '≥ 19 anos', tipo: 'qt',
        cid: [['C65', 'Neoplasia maligna da pelve renal'], ['C66', 'Neoplasia maligna dos ureteres'], ['C67.0', 'Neoplasia maligna do trígono da bexiga'], ['C67.1', 'Neoplasia maligna da cúpula da bexiga'], ['C67.2', 'Neoplasia maligna da parede lateral da bexiga'], ['C67.3', 'Neoplasia maligna da parede anterior da bexiga'], ['C67.4', 'Neoplasia maligna da parede posterior da bexiga'], ['C67.5', 'Neoplasia maligna do colo da bexiga'], ['C67.6', 'Neoplasia maligna do orifício uretérico'], ['C67.7', 'Neoplasia maligna do úraco'], ['C67.8', 'Neoplasia maligna da bexiga com lesão invasiva'], ['C67.9', 'Neoplasia maligna da bexiga, sem outra especificação'], ['C68.0', 'Neoplasia maligna da uretra']], compat: [['03.04.08.007-1', 'Inibidor da osteólise', '1']], obs: 'Cobre todas as linhas da doença avançada (quimioterapia e, conforme incorporação vigente, imunoterapia); também é o código do urotelial de trato superior metastático.' },
      { cod: '03.04.01.047-2', nome: 'Radioterapia do aparelho urinário', fin: 'Radioterapia', desc: 'Radioterapia para câncer de uretra, bexiga, ureter, rim e glândula suprarrenal, incluindo a irradiação da cadeia linfática regional quando indicada.', total: 4093.00, qmax: 1, idade: 'qualquer', tipo: 'rt',
        cid: [['C64', 'Neoplasia maligna do rim, exceto pelve renal'], ['C65', 'Neoplasia maligna da pelve renal'], ['C66', 'Neoplasia maligna dos ureteres'], ['C67.1–C67.9', 'Neoplasia maligna da bexiga (cúpula, paredes, colo, orifício uretérico, úraco, lesão invasiva, SOE)'], ['C68.0', 'Neoplasia maligna da uretra'], ['C68.1', 'Neoplasia maligna da glândula parauretral'], ['C68.8', 'Neoplasia maligna dos órgãos urinários com lesão invasiva'], ['C68.9', 'Neoplasia maligna de órgão urinário, não especificado'], ['C74.0', 'Neoplasia maligna do córtex da supra-renal'], ['C74.1', 'Neoplasia maligna da medula da supra-renal'], ['C74.9', 'Neoplasia maligna da glândula supra-renal, não especificada']], compat: [['03.04.01.053-7', 'Radioterapia de metástases em outras localizações', 'ilimitada'], ['03.04.01.052-9', 'Radioterapia de metástase em sistema nervoso central', 'ilimitada'], ['08.02.01.033-4', 'Alojamento para pacientes em radioterapia', '30']], obs: 'C67.0 (trígono) não aparece na lista de CIDs compatíveis consultada — conferir na SIGTAP antes de autorizar. Usado na preservação vesical (quimiorradioterapia) e na radioterapia paliativa pélvica.' },
    ] },
    { id: 'rim', nome: 'Rim', itens: [
      { cod: '03.04.02.016-8', nome: 'Quimioterapia do carcinoma de rim avançado', fin: 'Paliativa', desc: 'Quimioterapia paliativa do carcinoma de células renais — doença metastática, recidivada ou loco-regionalmente avançada.', total: 3311.50, qmax: 1, idade: '≥ 19 anos', tipo: 'qt',
        cid: [['C64', 'Neoplasia maligna do rim, exceto pelve renal']], compat: [['03.04.08.007-1', 'Inibidor da osteólise', '1']], obs: 'Único CID aceito é C64: carcinoma urotelial de pelve renal (C65) vai no código de carcinoma urotelial avançado. Cobre terapia-alvo e imunoterapia conforme a incorporação vigente (PCDT); não há código adjuvante para rim.' },
    ] },
    { id: 'testiculo', nome: 'Testículo (tumor germinativo)', itens: [
      { cod: '03.04.06.020-8', nome: 'Quimioterapia de tumor germinativo de testículo — 1ª linha', fin: 'Curativa', desc: 'Quimioterapia curativa de primeira linha: estádio I com invasão vascular ou predomínio de carcinoma embrionário, e estádios II ou III, seminomatosos e não seminomatosos (carcinoma embrionário, teratoma, coriocarcinoma, tumor do seio endodérmico e mistos).', total: 1700.00, qmax: 1, idade: '≥ 19 anos', tipo: 'qt',
        cid: [['C62.0', 'Neoplasia maligna do testículo criptorquídico'], ['C62.1', 'Neoplasia maligna do testículo tópico'], ['C62.9', 'Neoplasia maligna do testículo, sem outras especificações']], compat: [['03.04.08.001-2', 'Fator estimulante de colônias (G-CSF)', '1'], ['03.04.08.005-5', 'Quimioterapia intratecal', '1']], obs: 'A quimioterapia adjuvante do estádio I de alto risco (BEP ×1 ou carboplatina AUC7 no seminoma) usa este mesmo código. Menores de 19 anos: códigos 03.04.07 (oncologia pediátrica).' },
      { cod: '03.04.06.021-6', nome: 'Quimioterapia de tumor germinativo de testículo — 2ª linha', fin: 'Curativa', desc: 'Quimioterapia curativa de segunda linha (resgate) para tumor germinativo de testículo, seminomatoso ou não seminomatoso.', total: 1700.00, qmax: 1, idade: '≥ 19 anos', tipo: 'qt',
        cid: [['C62.0', 'Neoplasia maligna do testículo criptorquídico'], ['C62.1', 'Neoplasia maligna do testículo tópico'], ['C62.9', 'Neoplasia maligna do testículo, sem outras especificações']], compat: [['03.04.08.001-2', 'Fator estimulante de colônias (G-CSF)', '1'], ['03.04.08.005-5', 'Quimioterapia intratecal', '1']], obs: 'Esquemas de resgate (TIP, VeIP). A quimioterapia em alta dose com resgate autólogo é registrada pelos códigos de transplante (05.05), não por este.' },
      { cod: '03.04.01.055-3', nome: 'Radioterapia de linfoma e leucemia (aceita C62.0/C62.1)', fin: 'Radioterapia', desc: 'Radioterapia por localização anatômica. É o código de radioterapia da SIGTAP cujos CIDs compatíveis incluem o testículo (C62.0 e C62.1) — usado na radioterapia do seminoma (para-aórtica ± ilíaca).', total: 3159.00, qmax: 2, idade: 'qualquer', tipo: 'rt',
        cid: [['C62.0', 'Neoplasia maligna do testículo criptorquídico'], ['C62.1', 'Neoplasia maligna do testículo tópico'], ['C63.2', 'Neoplasia maligna do escroto']], compat: [], obs: 'Não existe "radioterapia de testículo" na tabela; C62.9 não consta neste código — codificar C62.1 (testículo tópico) ou C62.0.' },
    ] },
    { id: 'penis', nome: 'Pênis', itens: [
      { cod: '03.04.02.037-0', nome: 'Quimioterapia do carcinoma de pênis avançado', fin: 'Paliativa', desc: 'Quimioterapia paliativa para carcinoma de pênis em fase loco-regionalmente avançada, metastática ou recidivada.', total: 800.00, qmax: 1, idade: '≥ 19 anos', tipo: 'qt',
        cid: [['C60.0', 'Neoplasia maligna do prepúcio'], ['C60.1', 'Neoplasia maligna da glande'], ['C60.2', 'Neoplasia maligna do corpo do pênis'], ['C60.8', 'Neoplasia maligna do pênis com lesão invasiva'], ['C60.9', 'Neoplasia maligna do pênis, não especificado']], compat: [['03.04.08.007-1', 'Inibidor da osteólise', '1']], obs: 'Não há código específico de quimioterapia neoadjuvante de pênis (linfonodos fixos/volumosos): a doença loco-regionalmente avançada é registrada neste código.' },
      { cod: '03.04.01.044-8', nome: 'Radioterapia de pênis', fin: 'Radioterapia', desc: 'Radioterapia de câncer de pênis, incluindo a irradiação das cadeias de drenagem linfática correspondentes.', total: 4630.00, qmax: 1, idade: '≥ 12 anos', tipo: 'rt',
        cid: [['C60.0', 'Neoplasia maligna do prepúcio'], ['C60.1', 'Neoplasia maligna da glande'], ['C60.2', 'Neoplasia maligna do corpo do pênis'], ['C60.8', 'Neoplasia maligna do pênis com lesão invasiva'], ['C60.9', 'Neoplasia maligna do pênis, não especificado']], compat: [['08.02.01.033-4', 'Alojamento para pacientes em radioterapia', '20']] },
    ] },
    { id: 'adrenal', nome: 'Adrenal', itens: [
      { cod: '03.04.02.012-5', nome: 'Quimioterapia do carcinoma de adrenal avançado', fin: 'Paliativa', desc: 'Quimioterapia paliativa para carcinoma de adrenal em doença metastática, recidivada ou loco-regionalmente avançada.', total: 6000.00, qmax: 6, idade: '≥ 19 anos', tipo: 'qt',
        cid: [['C74.0', 'Neoplasia maligna do córtex da supra-renal'], ['C74.1', 'Neoplasia maligna da medula da supra-renal'], ['C74.9', 'Neoplasia maligna da glândula supra-renal, não especificada']], compat: [['03.04.08.007-1', 'Inibidor da osteólise', '1']], obs: 'Quantidade máxima 6 por APAC (ciclos). Cobre mitotano ± EDP no carcinoma adrenocortical e a quimioterapia do feocromocitoma/paraganglioma maligno (C74.1).' },
    ] },
    { id: 'meta', nome: 'Metástases e suporte (qualquer tumor urológico)', itens: [
      { cod: '03.04.08.007-1', nome: 'Inibidor da osteólise', fin: 'Especial', desc: 'Bisfosfonato/denosumabe para metástase óssea. Principal apenas em mieloma, em adenocarcinoma de próstata tratado só com orquiectomia bilateral e em hipercalcemia paraneoplásica; nos demais casos é secundário à quimio/hormonioterapia na mesma APAC.', total: 449.50, qmax: 1, idade: 'qualquer', tipo: 'qt',
        cid: [['C79.5', 'Neoplasia maligna secundária dos ossos e da medula óssea'], ['C80', 'Neoplasia maligna, sem especificação de localização (hipercalcemia)'], ['C90.0', 'Mieloma múltiplo']], compat: [], obs: 'Como secundário, o CID principal continua sendo o do tumor (ex.: C61); C79.5 é exigido só quando é o procedimento principal.' },
      { cod: '03.04.01.053-7', nome: 'Radioterapia de plasmocitoma / mieloma / metástases em outras localizações', fin: 'Radioterapia', desc: 'Radioterapia paliativa de lesões metastáticas ósseas ou de outras localizações não linfonodais (exceto SNC), por localização; até duas lesões simultâneas (excepcionalmente três).', total: 1729.00, qmax: 3, idade: 'qualquer', tipo: 'rt',
        cid: [['C79.5', 'Neoplasia maligna secundária dos ossos e da medula óssea'], ['C79.0', 'Neoplasia maligna secundária do rim e da pelve renal'], ['C79.1', 'Neoplasia maligna secundária da bexiga e de outro órgão urinário'], ['C79.7', 'Neoplasia maligna secundária das glândulas supra-renais'], ['C79.8', 'Neoplasia maligna secundária de outra localização especificada'], ['C78.0', 'Neoplasia maligna secundária dos pulmões'], ['C78.6', 'Neoplasia maligna secundária do retroperitônio e do peritônio'], ['C78.7', 'Neoplasia maligna secundária do fígado']], compat: [], obs: 'Código da radioterapia antálgica de metástase óssea (8 Gy ×1 ou 20 Gy/5); compatível na mesma APAC da radioterapia do tumor primário.' },
      { cod: '03.04.01.052-9', nome: 'Radioterapia de metástase em sistema nervoso central', fin: 'Radioterapia', desc: 'Radioterapia paliativa de lesões metastáticas em crânio total ou neuroeixo (limite de dois registros, somente para neuroeixo completo).', total: 2439.00, qmax: 2, idade: 'qualquer', tipo: 'rt',
        cid: [['C79.3', 'Neoplasia maligna secundária do encéfalo e das meninges cerebrais'], ['C79.4', 'Neoplasia maligna secundária de outras partes do sistema nervoso']], compat: [] },
    ] },
  ],
};
