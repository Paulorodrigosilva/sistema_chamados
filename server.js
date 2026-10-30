process.env.TZ = 'America/Sao_Paulo';

const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();

// Ativa o CORS para evitar bloqueios de requisição na Vercel
app.use(cors());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configura o caminho absoluto para a pasta 'public' (onde fica o front-end e o index.html)
app.use(express.static(path.join(__dirname, 'public')));

// Configuração do Multer para MEMÓRIA (Vercel não suporta gravação em disco)
const storage = multer.memoryStorage();
const upload = multer({ storage });

function getAgoraBrasil() {
    const agora = new Date();
    const isoString = new Date(agora.getTime() - (agora.getTimezoneOffset() * 60000)).toISOString();
    return isoString.replace('T', ' ').substring(0, 19);
}

// Inicializa o banco de dados PostgreSQL usando Variável de Ambiente
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

pool.connect((err, client, release) => {
    if (err) {
        return console.error('Erro ao conectar ao banco de dados PostgreSQL:', err.stack);
    }
    console.log('Conectado ao banco de dados PostgreSQL.');
    if (release) release();
});

// Criação automática de tabelas
const initDb = async () => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY, 
            usuario TEXT UNIQUE, 
            senha TEXT, 
            tipo TEXT DEFAULT 'comum',
            validado BOOLEAN DEFAULT FALSE
        )`);

        // Garante a coluna 'validado' caso a tabela já exista sem ela
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

        // Tabela de Planos de Ação (com suporte a tarefas/etapas em JSON)
        await pool.query(`CREATE TABLE IF NOT EXISTS planos_acao (
            id SERIAL PRIMARY KEY,
            titulo TEXT,
            descricao TEXT,
            responsavel TEXT,
            tarefas TEXT,
            status TEXT DEFAULT 'Pendente',
            data_criacao TIMESTAMP
        )`);
        
        // Garante a coluna 'tarefas' caso a tabela já exista sem ela
        await pool.query(`ALTER TABLE planos_acao ADD COLUMN IF NOT EXISTS tarefas TEXT`);

        await pool.query(`CREATE TABLE IF NOT EXISTS checklists (
            id SERIAL PRIMARY KEY,
            titulo TEXT,
            responsavel TEXT,
            criado_por TEXT,
            concluido_por TEXT,
            data_criacao TIMESTAMP
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS checklist_itens (
            id SERIAL PRIMARY KEY,
            checklist_id INTEGER REFERENCES checklists(id) ON DELETE CASCADE,
            descricao TEXT,
            concluido INTEGER DEFAULT 0,
            status TEXT,
            observacao TEXT,
            fotos TEXT
        )`);
        console.log('Tabelas verificadas/criadas com sucesso.');
    } catch (err) {
        console.error('Erro ao criar tabelas:', err);
    }
};

initDb();

// --- ROTA RAIZ (Resolve o erro "Cannot GET /" na Vercel) ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- ROTAS DE CADASTRO E GERENCIAMENTO DE USUÁRIOS ---
app.post('/api/usuarios', async (req, res) => {
    const { nome, senha, tipo } = req.body;
    const usuarioParaSalvar = (nome || req.body.usuario || '').trim().toLowerCase();
    const tipoUsuario = (tipo || 'comum').trim();
    
    const validado = req.body.validado !== undefined ? req.body.validado : (tipoUsuario === 'master' || tipoUsuario === 'administrador');

    if (!usuarioParaSalvar || !senha) {
        return res.status(400).json({ sucesso: false, mensagem: "Usuário e senha são obrigatórios." });
    }

    try {
        await pool.query(
            `INSERT INTO usuarios (usuario, senha, tipo, validado) VALUES ($1, $2, $3, $4)`, 
            [usuarioParaSalvar, senha, tipoUsuario, validado]
        );
        return res.json({ sucesso: true, mensagem: "Usuário cadastrado com sucesso! " + (!validado ? "Aguardando validação do Master." : "") });
    } catch (err) {
        return res.status(400).json({ sucesso: false, mensagem: "Erro ao cadastrar usuário (já existente ou inválido)." });
    }
});

app.get('/api/usuarios', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT id, usuario, tipo, validado FROM usuarios`);
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.put('/api/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    const { usuario, tipo } = req.body;
    try {
        const { rowCount } = await pool.query(`UPDATE usuarios SET usuario = $1, tipo = $2 WHERE id = $3`, [usuario.trim().toLowerCase(), tipo.trim(), id]);
        if (rowCount === 0) return res.status(404).json({ sucesso: false, mensagem: "Usuário não encontrado." });
        return res.json({ sucesso: true, mensagem: "Usuário atualizado com sucesso!" });
    } catch (err) {
        return res.status(500).json({ sucesso: false, mensagem: err.message });
    }
});

app.put('/api/usuarios/:id/validar', async (req, res) => {
    const { id } = req.params;
    try {
        const { rowCount } = await pool.query(`UPDATE usuarios SET validado = TRUE WHERE id = $1`, [id]);
        if (rowCount === 0) return res.status(404).json({ sucesso: false, mensagem: "Usuário não encontrado." });
        return res.json({ sucesso: true, mensagem: "Usuário validado com sucesso!" });
    } catch (err) {
        return res.status(500).json({ sucesso: false, mensagem: err.message });
    }
});

app.put('/api/usuarios/:id/senha', async (req, res) => {
    const { id } = req.params;
    const { senha } = req.body;

    if (!senha) {
        return res.status(400).json({ sucesso: false, mensagem: "A nova senha é obrigatória." });
    }

    try {
        const { rowCount } = await pool.query(`UPDATE usuarios SET senha = $1 WHERE id = $2`, [senha, id]);
        if (rowCount === 0) return res.status(404).json({ sucesso: false, mensagem: "Usuário não encontrado." });
        return res.json({ sucesso: true, mensagem: "Senha alterada com sucesso!" });
    } catch (err) {
        return res.status(500).json({ sucesso: false, mensagem: err.message });
    }
});

app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        const { rowCount } = await pool.query(`DELETE FROM usuarios WHERE id = $1`, [req.params.id]);
        if (rowCount === 0) return res.status(404).json({ sucesso: false, mensagem: "Usuário não encontrado." });
        return res.json({ sucesso: true, mensagem: "Usuário excluído com sucesso!" });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// --- ROTAS DE APOIO (Lojas, Setores, Equipamentos, Responsáveis) ---
const criarRotaApoio = (caminho, tabela) => {
    app.post(caminho, async (req, res) => {
        try {
            const { rows } = await pool.query(`INSERT INTO ${tabela} (nome) VALUES ($1) RETURNING id`, [req.body.nome]);
            return res.json({ sucesso: true, id: rows[0].id });
        } catch (err) {
            return res.status(500).json({ sucesso: false, erro: err.message });
        }
    });

    app.get(caminho, async (req, res) => {
        try {
            const { rows } = await pool.query(`SELECT id, nome FROM ${tabela}`);
            return res.json(rows);
        } catch (err) {
            return res.status(500).json({ erro: err.message });
        }
    });

    app.put(`${caminho}/:id`, async (req, res) => { 
        try { 
            await pool.query(`UPDATE ${tabela} SET nome = $1 WHERE id = $2`, [req.body.nome, req.params.id]); 
            return res.json({ sucesso: true, mensagem: "Atualizado com sucesso!" }); 
        } catch (err) { 
            return res.status(500).json({ sucesso: false, erro: err.message }); 
        } 
    });  
    
    app.delete(`${caminho}/:id`, async (req, res) => {
        try {
            await pool.query(`DELETE FROM ${tabela} WHERE id = $1`, [req.params.id]);
            return res.json({ sucesso: true, mensagem: "Excluído com sucesso!" });
        } catch (err) {
            return res.status(500).json({ sucesso: false, erro: err.message });
        }
    });
};

criarRotaApoio('/api/lojas', 'lojas');
criarRotaApoio('/api/setores', 'setores');
criarRotaApoio('/api/equipamentos', 'equipamentos');
criarRotaApoio('/api/responsaveis', 'responsaveis');

// --- ROTAS DE CHAMADOS ---
app.post('/api/chamados', upload.single('foto'), async (req, res) => {
    let { descricao, loja_id, setor_id, equipamento_id, responsavel_id, setor_responsavel_id, criado_por, urgencia } = req.body;
    
    let fotoUrl = null;
    if (req.file) {
        const base64Data = req.file.buffer.toString('base64');
        fotoUrl = `data:${req.file.mimetype};base64,${base64Data}`;
    }

    const dataAtualLocal = getAgoraBrasil();
    const nivelUrgencia = urgencia || 'Baixa';
    const parseId = (val) => (!val || isNaN(val)) ? null : parseInt(val);

    const query = `INSERT INTO chamados 
        (descricao, loja_id, setor_id, equipamento_id, responsavel_id, setor_responsavel_id, criado_por, foto, urgencia, status, data_abertura) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Aberto', $10) RETURNING id`;
    
    try {
        const { rows } = await pool.query(query, [
            descricao || 'Sem descrição', 
            parseId(loja_id), 
            parseId(setor_id), 
            parseId(equipamento_id), 
            parseId(responsavel_id), 
            parseId(setor_responsavel_id), 
            criado_por || 'Sistema', 
            fotoUrl, 
            nivelUrgencia, 
            dataAtualLocal
        ]);
        return res.json({ sucesso: true, id: rows[0].id, mensagem: "Chamado aberto com sucesso!" });
    } catch (err) {
        console.error("Erro ao inserir chamado:", err.message);
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.get('/api/chamados', async (req, res) => {
    const query = `
        SELECT c.id, c.descricao, c.status, c.urgencia, c.data_abertura, c.criado_por, c.foto as foto_url,
               l.nome as loja, s.nome as setor, e.nome as equipamento, r.nome as responsavel, sr.nome as setor_responsavel
        FROM chamados c
        LEFT JOIN lojas l ON c.loja_id = l.id
        LEFT JOIN setores s ON c.setor_id = s.id
        LEFT JOIN equipamentos e ON c.equipamento_id = e.id
        LEFT JOIN responsaveis r ON c.responsavel_id = r.id
        LEFT JOIN setores sr ON c.setor_responsavel_id = sr.id
        ORDER BY c.data_abertura DESC
    `;
    try {
        const { rows } = await pool.query(query);
        const ajustados = rows.map(row => {
            if (row.data_abertura) {
                const dt = new Date(row.data_abertura);
                if (!isNaN(dt.getTime())) {
                    row.data_abertura = dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                }
            }
            return row;
        });
        return res.json(ajustados);
    } catch (err) {
        return res.status(500).json({ erro: err.message });
    }
});

app.patch('/api/chamados/:id/descricao', async (req, res) => {
    try {
        const { rowCount } = await pool.query(`UPDATE chamados SET descricao = $1 WHERE id = $2`, [req.body.descricao, req.params.id]);
        if (rowCount === 0) return res.status(404).json({ sucesso: false, mensagem: "Chamado não encontrado." });
        return res.json({ sucesso: true, mensagem: "Descrição atualizada com sucesso!" });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.patch('/api/chamados/:id/:campo', async (req, res) => {
    const camposPermitidos = ['status', 'urgencia', 'responsavel_id', 'setor_responsavel_id'];
    const { campo } = req.params;
    
    if (!camposPermitidos.includes(campo)) return res.status(400).json({ sucesso: false, erro: "Campo inválido" });
    
    const valor = req.body[campo] || req.body.status || req.body.urgencia; 

    try {
        await pool.query(`UPDATE chamados SET ${campo} = $1 WHERE id = $2`, [valor, req.params.id]);
        return res.json({ sucesso: true });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.delete('/api/chamados/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM chamados WHERE id = $1', [req.params.id]);
        return res.json({ sucesso: true, mensagem: "Chamado excluído com sucesso!" });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// --- ROTAS DE ORDENS DE SERVIÇO (O.S.) ---
app.post('/api/ordens-servico', async (req, res) => {
    const { cliente, equipamento, prioridade, tecnico, defeito } = req.body;
    const dataAtualLocal = getAgoraBrasil();

    const query = `INSERT INTO ordens_servico 
        (cliente, equipamento, prioridade, tecnico, defeito, status, data_abertura) 
        VALUES ($1, $2, $3, $4, $5, 'Aberta', $6) RETURNING id`;
    
    try {
        const { rows } = await pool.query(query, [
            cliente || 'Não informado',
            equipamento || 'Não informado',
            prioridade || 'Média',
            tecnico || 'Sistema',
            defeito || 'Sem descrição',
            dataAtualLocal
        ]);
        return res.json({ sucesso: true, id: rows[0].id, mensagem: "Ordem de Serviço aberta com sucesso!" });
    } catch (err) {
        console.error("Erro ao inserir O.S.:", err.message);
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});
