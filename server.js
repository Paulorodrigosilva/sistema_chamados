process.env.TZ = 'America/Sao_Paulo';

const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.memoryStorage();
const upload = multer({ storage });

function getAgoraBrasil() {
  const agora = new Date();
  const isoString = new Date(agora.getTime() - (agora.getTimezoneOffset() * 60000)).toISOString();
  return isoString.replace('T', ' ').substring(0, 19);
}

const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

if (pool) {
  pool.connect((err) => {
    if (err) {
      console.error('Erro ao conectar ao banco PostgreSQL:', err.message);
      return;
    }
    console.log('Conectado ao banco PostgreSQL.');
  });
}

const initDb = async () => {
  if (!pool) {
    console.log('DATABASE_URL não configurado. O app ficará em modo local-only.');
    return;
  }

  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      usuario TEXT UNIQUE,
      senha TEXT,
      tipo TEXT DEFAULT 'comum',
      validado BOOLEAN DEFAULT FALSE
    )`);

    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS validado BOOLEAN DEFAULT FALSE`);

    await pool.query(`CREATE TABLE IF NOT EXISTS lojas (id SERIAL PRIMARY KEY, nome TEXT)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS setores (id SERIAL PRIMARY KEY, nome TEXT)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS equipamentos (id SERIAL PRIMARY KEY, nome TEXT)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS responsaveis (id SERIAL PRIMARY KEY, nome TEXT)`);

    await pool.query(`CREATE TABLE IF NOT EXISTS chamados (
      id SERIAL PRIMARY KEY,
      descricao TEXT,
      loja_id INTEGER,
      setor_id INTEGER,
      equipamento_id INTEGER,
      responsavel_id INTEGER,
      setor_responsavel_id INTEGER,
      criado_por TEXT,
      foto TEXT,
      urgencia TEXT DEFAULT 'Baixa',
      status TEXT DEFAULT 'Aberto',
      data_abertura TIMESTAMP
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS ordens_servico (
      id SERIAL PRIMARY KEY,
      cliente TEXT,
      equipamento TEXT,
      prioridade TEXT DEFAULT 'Média',
      tecnico TEXT,
      defeito TEXT,
      laudo TEXT,
      status TEXT DEFAULT 'Aberta',
      data_abertura TIMESTAMP
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS planos_acao (
      id SERIAL PRIMARY KEY,
      titulo TEXT,
      descricao TEXT,
      responsavel TEXT,
      tarefas TEXT,
      status TEXT DEFAULT 'Pendente',
      data_criacao TIMESTAMP
    )`);

    await pool.query(`ALTER TABLE planos_acao ADD COLUMN IF NOT EXISTS tarefas TEXT`);

    await pool.query(`CREATE TABLE IF NOT EXISTS checklists (
      id SERIAL PRIMARY KEY,
      titulo TEXT,
      responsavel TEXT,
      criado_por TEXT,
      concluido_por TEXT,
      data DATE,
      data_criacao TIMESTAMP
    )`);

    await pool.query(`ALTER TABLE checklists ADD COLUMN IF NOT EXISTS data DATE`);

    await pool.query(`CREATE TABLE IF NOT EXISTS checklist_itens (
      id SERIAL PRIMARY KEY,
      checklist_id INTEGER REFERENCES checklists(id) ON DELETE CASCADE,
      descricao TEXT,
      concluido INTEGER DEFAULT 0,
      status TEXT,
      observacao TEXT,
      fotos TEXT
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS plantas (
      id SERIAL PRIMARY KEY,
      nome TEXT,
      dados JSONB DEFAULT '{}'::jsonb,
      usuario TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    console.log('Tabelas verificadas/criadas com sucesso.');
  } catch (err) {
    console.error('Erro ao criar tabelas:', err.message || err);
  }
};

initDb();

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/plantas', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'plantas', 'index.html'));
});

app.get('/plantas/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'plantas', 'index.html'));
});

const criarRotaApoio = (caminho, tabela) => {
  app.post(caminho, async (req, res) => {
    if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
    try {
      const { rows } = await pool.query(`INSERT INTO ${tabela} (nome) VALUES ($1) RETURNING id`, [req.body.nome]);
      return res.json({ sucesso: true, id: rows[0].id });
    } catch (err) {
      return res.status(500).json({ sucesso: false, erro: err.message });
    }
  });

  app.get(caminho, async (req, res) => {
    if (!pool) return res.json([]);
    try {
      const { rows } = await pool.query(`SELECT id, nome FROM ${tabela}`);
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ erro: err.message });
    }
  });

  app.put(`${caminho}/:id`, async (req, res) => {
    if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
    try {
      await pool.query(`UPDATE ${tabela} SET nome = $1 WHERE id = $2`, [req.body.nome, req.params.id]);
      return res.json({ sucesso: true, mensagem: 'Atualizado com sucesso!' });
    } catch (err) {
      return res.status(500).json({ sucesso: false, erro: err.message });
    }
  });

  app.delete(`${caminho}/:id`, async (req, res) => {
    if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
    try {
      await pool.query(`DELETE FROM ${tabela} WHERE id = $1`, [req.params.id]);
      return res.json({ sucesso: true, mensagem: 'Excluído com sucesso!' });
    } catch (err) {
      return res.status(500).json({ sucesso: false, erro: err.message });
    }
  });
};

criarRotaApoio('/api/lojas', 'lojas');
criarRotaApoio('/api/setores', 'setores');
criarRotaApoio('/api/equipamentos', 'equipamentos');
criarRotaApoio('/api/responsaveis', 'responsaveis');

app.post('/api/usuarios', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, mensagem: 'Banco de dados não configurado.' });
  const { nome, senha, tipo } = req.body;
  const usuarioParaSalvar = (nome || req.body.usuario || '').trim().toLowerCase();
  const tipoUsuario = (tipo || 'comum').trim();
  const validado = req.body.validado !== undefined ? req.body.validado : (tipoUsuario === 'master' || tipoUsuario === 'administrador');

  if (!usuarioParaSalvar || !senha) {
    return res.status(400).json({ sucesso: false, mensagem: 'Usuário e senha são obrigatórios.' });
  }

  try {
    await pool.query(
      `INSERT INTO usuarios (usuario, senha, tipo, validado) VALUES ($1, $2, $3, $4)`,
      [usuarioParaSalvar, senha, tipoUsuario, validado]
    );
    return res.json({ sucesso: true, mensagem: 'Usuário cadastrado com sucesso!' });
  } catch (err) {
    return res.status(400).json({ sucesso: false, mensagem: 'Erro ao cadastrar usuário.' });
  }
});

app.get('/api/usuarios', async (req, res) => {
  if (!pool) return res.json([]);
  try {
    const { rows } = await pool.query(`SELECT id, usuario, tipo, validado FROM usuarios`);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.put('/api/usuarios/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, mensagem: 'Banco de dados não configurado.' });
  const { usuario, tipo } = req.body;
  try {
    await pool.query(`UPDATE usuarios SET usuario = $1, tipo = $2 WHERE id = $3`, [usuario.trim().toLowerCase(), tipo.trim(), req.params.id]);
    return res.json({ sucesso: true, mensagem: 'Usuário atualizado com sucesso!' });
  } catch (err) {
    return res.status(500).json({ sucesso: false, mensagem: err.message });
  }
});

app.put('/api/usuarios/:id/validar', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, mensagem: 'Banco de dados não configurado.' });
  try {
    await pool.query(`UPDATE usuarios SET validado = TRUE WHERE id = $1`, [req.params.id]);
    return res.json({ sucesso: true, mensagem: 'Usuário validado com sucesso!' });
  } catch (err) {
    return res.status(500).json({ sucesso: false, mensagem: err.message });
  }
});

app.put('/api/usuarios/:id/senha', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, mensagem: 'Banco de dados não configurado.' });
  try {
    await pool.query(`UPDATE usuarios SET senha = $1 WHERE id = $2`, [req.body.senha, req.params.id]);
    return res.json({ sucesso: true, mensagem: 'Senha alterada com sucesso!' });
  } catch (err) {
    return res.status(500).json({ sucesso: false, mensagem: err.message });
  }
});

app.delete('/api/usuarios/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, mensagem: 'Banco de dados não configurado.' });
  try {
    await pool.query(`DELETE FROM usuarios WHERE id = $1`, [req.params.id]);
    return res.json({ sucesso: true, mensagem: 'Usuário excluído com sucesso!' });
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.post('/api/chamados', upload.single('foto'), async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
  let { descricao, loja_id, setor_id, equipamento_id, responsavel_id, setor_responsavel_id, criado_por, urgencia } = req.body;
  let fotoUrl = null;
  if (req.file) {
    fotoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  }
  const dataAtualLocal = getAgoraBrasil();
  const parseId = (val) => (!val || isNaN(val)) ? null : parseInt(val);

  try {
    const { rows } = await pool.query(
      `INSERT INTO chamados (descricao, loja_id, setor_id, equipamento_id, responsavel_id, setor_responsavel_id, criado_por, foto, urgencia, status, data_abertura)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Aberto', $10) RETURNING id`,
      [descricao || 'Sem descrição', parseId(loja_id), parseId(setor_id), parseId(equipamento_id), parseId(responsavel_id), parseId(setor_responsavel_id), criado_por || 'Sistema', fotoUrl, urgencia || 'Baixa', dataAtualLocal]
    );
    return res.json({ sucesso: true, id: rows[0].id, mensagem: 'Chamado aberto com sucesso!' });
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.get('/api/chamados', async (req, res) => {
  if (!pool) return res.json([]);
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.descricao, c.status, c.urgencia, c.data_abertura, c.criado_por, c.foto as foto_url,
             l.nome as loja, s.nome as setor, e.nome as equipamento, r.nome as responsavel, sr.nome as setor_responsavel
      FROM chamados c
      LEFT JOIN lojas l ON c.loja_id = l.id
      LEFT JOIN setores s ON c.setor_id = s.id
      LEFT JOIN equipamentos e ON c.equipamento_id = e.id
      LEFT JOIN responsaveis r ON c.responsavel_id = r.id
      LEFT JOIN setores sr ON c.setor_responsavel_id = sr.id
      ORDER BY c.data_abertura DESC
    `);
    const ajustados = rows.map((row) => {
      if (row.data_abertura) {
        const dt = new Date(row.data_abertura);
        if (!isNaN(dt.getTime())) row.data_abertura = dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      }
      return row;
    });
    return res.json(ajustados);
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
});

app.patch('/api/chamados/:id/descricao', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
  try {
    await pool.query(`UPDATE chamados SET descricao = $1 WHERE id = $2`, [req.body.descricao, req.params.id]);
    return res.json({ sucesso: true, mensagem: 'Descrição atualizada!' });
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.patch('/api/chamados/:id/:campo', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
  const camposPermitidos = ['status', 'urgencia', 'responsavel_id', 'setor_responsavel_id'];
  const { campo } = req.params;
  if (!camposPermitidos.includes(campo)) return res.status(400).json({ sucesso: false, erro: 'Campo inválido' });
  const valor = req.body[campo] || req.body.status || req.body.urgencia;

  try {
    await pool.query(`UPDATE chamados SET ${campo} = $1 WHERE id = $2`, [valor, req.params.id]);
    return res.json({ sucesso: true });
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.delete('/api/chamados/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
  try {
    await pool.query('DELETE FROM chamados WHERE id = $1', [req.params.id]);
    return res.json({ sucesso: true });
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.post('/api/ordens-servico', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
  const { cliente, equipamento, prioridade, tecnico, defeito } = req.body;
  const dataAtualLocal = getAgoraBrasil();
  try {
    const { rows } = await pool.query(
      `INSERT INTO ordens_servico (cliente, equipamento, prioridade, tecnico, defeito, status, data_abertura) VALUES ($1, $2, $3, $4, $5, 'Aberta', $6) RETURNING id`,
      [cliente || 'Não informado', equipamento || 'Não informado', prioridade || 'Média', tecnico || 'Sistema', defeito || 'Sem descrição', dataAtualLocal]
    );
    return res.json({ sucesso: true, id: rows[0].id });
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.get('/api/ordens-servico', async (req, res) => {
  if (!pool) return res.json([]);
  try {
    const { rows } = await pool.query(`SELECT * FROM ordens_servico ORDER BY data_abertura DESC`);
    const ajustados = rows.map((row) => {
      if (row.data_abertura) {
        const dt = new Date(row.data_abertura);
        if (!isNaN(dt.getTime())) row.data_abertura = dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      }
      return row;
    });
    return res.json(ajustados);
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
});

app.patch('/api/ordens-servico/:id/status', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
  try {
    const { status, laudo } = req.body;
    await pool.query(`UPDATE ordens_servico SET status = $1, laudo = COALESCE($2, laudo) WHERE id = $3`, [status, laudo, req.params.id]);
    return res.json({ sucesso: true });
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.delete('/api/ordens-servico/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
  try {
    await pool.query('DELETE FROM ordens_servico WHERE id = $1', [req.params.id]);
    return res.json({ sucesso: true });
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.post('/api/planos-acao', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
  const { titulo, descricao, responsavel, tarefas, status } = req.body;
  const dataAtualLocal = getAgoraBrasil();

  try {
    const { rows } = await pool.query(
      `INSERT INTO planos_acao (titulo, descricao, responsavel, tarefas, status, data_criacao) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [titulo || 'Sem título', descricao || 'Sem descrição', responsavel || 'Não definido', JSON.stringify(tarefas || []), status || 'Pendente', dataAtualLocal]
    );
    return res.json({ sucesso: true, id: rows[0].id });
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.get('/api/planos-acao', async (req, res) => {
  if (!pool) return res.json([]);
  try {
    const { rows } = await pool.query(`SELECT * FROM planos_acao ORDER BY data_criacao DESC`);
    const ajustados = rows.map((row) => {
      if (row.data_criacao) {
        const dt = new Date(row.data_criacao);
        if (!isNaN(dt.getTime())) row.data_criacao = dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      }
      return row;
    });
    return res.json(ajustados);
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
});

app.put('/api/planos-acao/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
  const { titulo, descricao, responsavel, tarefas, status } = req.body;
  try {
    await pool.query(
      `UPDATE planos_acao SET titulo = $1, descricao = $2, responsavel = $3, tarefas = $4, status = $5 WHERE id = $6`,
      [titulo, descricao, responsavel, JSON.stringify(tarefas || []), status, req.params.id]
    );
    return res.json({ sucesso: true });
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.patch('/api/planos-acao/:id/status', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
  try {
    await pool.query(`UPDATE planos_acao SET status = $1 WHERE id = $2`, [req.body.status, req.params.id]);
    return res.json({ sucesso: true });
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.delete('/api/planos-acao/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
  try {
    await pool.query('DELETE FROM planos_acao WHERE id = $1', [req.params.id]);
    return res.json({ sucesso: true });
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.post('/api/checklists', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
  const { titulo, responsavel, data, itens, usuario } = req.body;
  if (!titulo || !itens || itens.length === 0) {
    return res.status(400).json({ sucesso: false, mensagem: 'Título e itens são obrigatórios.' });
  }

  const dataAtualLocal = getAgoraBrasil();
  const dataRealizacao = data || new Date().toISOString().split('T')[0];

  try {
    const { rows } = await pool.query(
      `INSERT INTO checklists (titulo, responsavel, criado_por, data, data_criacao) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [titulo, responsavel || 'Não definido', usuario || 'Desconhecido', dataRealizacao, dataAtualLocal]
    );

    const checklistId = rows[0].id;
    for (const item of itens) { await pool.query(`INSERT INTO checklist_itens (checklist_id, descricao) VALUES ($1, $2)`, [checklistId, item]); }

    return res.json({ sucesso: true, mensagem: 'Checklist criado com sucesso!' });
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

function formatarItensComFotos(itens) {
  return itens.map((item) => {
    let fotosArray = [];
    if (item.fotos) {
      if (Array.isArray(item.fotos)) {
        fotosArray = item.fotos;
      } else {
        try {
          const parsed = JSON.parse(item.fotos);
          if (Array.isArray(parsed)) fotosArray = parsed;
          else if (parsed) fotosArray = [parsed];
        } catch (e) {
          fotosArray = [item.fotos];
        }
      }
    }
    return { ...item, fotos: fotosArray };
  });
}

app.get('/api/checklists', async (req, res) => {
  if (!pool) return res.json([]);
  try {
    const { rows: checklists } = await pool.query(`SELECT id, titulo, responsavel, criado_por, concluido_por, data, data_criacao FROM checklists ORDER BY id DESC`);
    if (!checklists || checklists.length === 0) return res.json([]);

    const resultados = await Promise.all(checklists.map(async (cl) => {
      const { rows: itens } = await pool.query(`SELECT * FROM checklist_itens WHERE checklist_id = $1`, [cl.id]);
      return { ...cl, itens: formatarItensComFotos(itens || []) };
    }));

    return res.json(resultados);
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
});

app.get('/api/checklists/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
  try {
    const { rows: checklistRows } = await pool.query(`SELECT * FROM checklists WHERE id = $1`, [req.params.id]);
    if (checklistRows.length === 0) return res.status(404).json({ sucesso: false, erro: 'Checklist não encontrado' });

    const checklist = checklistRows[0];
    const { rows: itens } = await pool.query(`SELECT * FROM checklist_itens WHERE checklist_id = $1`, [req.params.id]);

    return res.json({ ...checklist, itens: formatarItensComFotos(itens || []) });
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
});

app.patch('/api/checklists/:id/concluir', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
  try {
    await pool.query(`UPDATE checklists SET concluido_por = $1 WHERE id = $2`, [req.body.usuario, req.params.id]);
    return res.json({ sucesso: true });
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.delete('/api/checklists/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
  try {
    await pool.query(`DELETE FROM checklists WHERE id = $1`, [req.params.id]);
    return res.json({ sucesso: true });
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.patch('/api/checklist-itens/:id/status', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
  try {
    await pool.query(`UPDATE checklist_itens SET status = $1 WHERE id = $2`, [req.body.status, req.params.id]);
    return res.json({ sucesso: true });
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.patch('/api/checklist-itens/:id/observacao', async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
  try {
    await pool.query(`UPDATE checklist_itens SET observacao = $1 WHERE id = $2`, [req.body.observacao, req.params.id]);
    return res.json({ sucesso: true });
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.post('/api/checklist-itens/:id/foto', upload.array('fotos'), async (req, res) => {
  if (!pool) return res.status(503).json({ sucesso: false, erro: 'Banco de dados não configurado.' });
  const itemId = req.params.id;
  let novosArquivos = [];
  if (req.files && req.files.length > 0) {
    novosArquivos = req.files.map((f) => `data:${f.mimetype};base64,${f.buffer.toString('base64')}`);
  } else if (req.file) {
    novosArquivos = [`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`];
  }

  if (novosArquivos.length === 0) {
    return res.status(400).json({ sucesso: false, mensagem: 'Nenhuma foto enviada.' });
  }

  try {
    const { rows } = await pool.query(`SELECT fotos FROM checklist_itens WHERE id = $1`, [itemId]);
    const row = rows[0];
    let listaAtual = [];
    if (row && row.fotos) {
      try {
        const parsed = JSON.parse(row.fotos);
        if (Array.isArray(parsed)) listaAtual = parsed;
        else if (parsed) listaAtual = [parsed];
      } catch (e) {
        listaAtual = [row.fotos];
      }
    }

    const listaFinal = [...listaAtual, ...novosArquivos];
    await pool.query(`UPDATE checklist_itens SET fotos = $1 WHERE id = $2`, [JSON.stringify(listaFinal), itemId]);
    return res.json({ sucesso: true, fotos: listaFinal });
  } catch (err) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  const usuarioParaBuscar = (req.body.usuario || '').trim().toLowerCase();
  const senha = req.body.senha;

  if (!usuarioParaBuscar || !senha) {
    return res.status(400).json({ sucesso: false, mensagem: 'Usuário e senha são obrigatórios.' });
  }

  if (!pool) {
    return res.status(503).json({ sucesso: false, mensagem: 'Banco de dados não configurado.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM usuarios WHERE LOWER(TRIM(usuario)) = $1 AND senha = $2`,
      [usuarioParaBuscar, senha]
    );

    if (rows[0]) {
      const user = rows[0];
      if (user.validado !== true) {
        return res.status(403).json({ sucesso: false, mensagem: 'Sua conta ainda não foi validada pelo usuário Master.' });
      }
      return res.json({ sucesso: true, usuario: user.usuario, tipo: user.tipo || 'comum' });
    }

    return res.status(401).json({ sucesso: false, mensagem: 'Usuário ou senha inválidos.' });
  } catch (err) {
    return res.status(500).json({ sucesso: false, mensagem: 'Erro interno no servidor.' });
  }
});

app.get('/api/plantas', async (req, res) => {
  if (!pool) return res.json([]);
  try {
    const { rows } = await pool.query(`SELECT * FROM plantas ORDER BY updated_at DESC`);
    return res.json(rows);
  } catch (err) {
    return res.json([]);
  }
});

app.post('/api/plantas', async (req, res) => {
  if (!pool) return res.json({ sucesso: true, local: true, mensagem: 'Sem conexão de banco, salvo localmente.' });

  try {
    const { name, data, owner } = req.body || {};
    const payload = JSON.stringify({ project: data || {} });
    const { rows } = await pool.query(
      `INSERT INTO plantas (nome, dados, usuario, updated_at) VALUES ($1, $2, $3, NOW()) RETURNING *`,
      [name || 'Projeto', payload, owner || 'demo']
    );
    return res.json({ sucesso: true, projeto: rows[0] });
  } catch (err) {
    return res.json({ sucesso: true, local: true, mensagem: 'Fallback local ativado.' });
  }
});

app.get('/api/plantas/:id', async (req, res) => {
  if (!pool) return res.status(404).json({ sucesso: false, mensagem: 'Projeto não encontrado no servidor.' });
  try {
    const { rows } = await pool.query(`SELECT * FROM plantas WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ sucesso: false, mensagem: 'Projeto não encontrado.' });
    return res.json(rows[0]);
  } catch (err) {
    return res.status(404).json({ sucesso: false, mensagem: 'Projeto não encontrado.' });
  }
});

app.put('/api/plantas/:id', async (req, res) => {
  if (!pool) return res.json({ sucesso: true, local: true });
  try {
    const { name, data, owner } = req.body || {};
    const payload = JSON.stringify({ project: data || {} });
    await pool.query(`UPDATE plantas SET nome = $1, dados = $2, usuario = $3, updated_at = NOW() WHERE id = $4`, [name || 'Projeto', payload, owner || 'demo', req.params.id]);
    return res.json({ sucesso: true });
  } catch (err) {
    return res.json({ sucesso: true, local: true });
  }
});

app.delete('/api/plantas/:id', async (req, res) => {
  if (!pool) return res.json({ sucesso: true, local: true });
  try {
    await pool.query(`DELETE FROM plantas WHERE id = $1`, [req.params.id]);
    return res.json({ sucesso: true });
  } catch (err) {
    return res.json({ sucesso: true, local: true });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, database: Boolean(pool), mode: pool ? 'database' : 'local-only' });
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(3000, () => {
    console.log('Servidor rodando na porta 3000 localmente');
  });
}

module.exports = app;
