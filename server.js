process.env.TZ = 'America/Sao_Paulo';

const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public')); // Mantido caso você sirva seu frontend daqui

// Configuração do Multer para MEMÓRIA (Vercel não suporta gravação em disco)
const storage = multer.memoryStorage();
const upload = multer({ storage });

function getAgoraBrasil() {
    const agora = new Date();
    const isoString = new Date(agora.getTime() - (agora.getTimezoneOffset() * 60000)).toISOString();
    return isoString.replace('T', ' ').substring(0, 19);
}

// Inicializa o banco de dados PostgreSQL usando Variável de Ambiente (Segurança)
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
            tipo TEXT DEFAULT 'comum'
        )`);
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

// --- ROTAS DE CADASTRO E GERENCIAMENTO DE USUÁRIOS ---
app.post('/api/usuarios', async (req, res) => {
    const { nome, senha, tipo } = req.body;
    const usuarioParaSalvar = (nome || req.body.usuario || '').trim();
    const tipoUsuario = (tipo || 'comum').trim();

    if (!usuarioParaSalvar || !senha) {
        return res.status(400).json({ sucesso: false, mensagem: "Usuário e senha são obrigatórios." });
    }

    try {
        await pool.query(`INSERT INTO usuarios (usuario, senha, tipo) VALUES ($1, $2, $3)`, [usuarioParaSalvar, senha, tipoUsuario]);
        return res.json({ sucesso: true, mensagem: "Usuário cadastrado com sucesso!" });
    } catch (err) {
        console.error('Erro ao cadastrar em /api/usuarios:', err.message);
        return res.status(400).json({ sucesso: false, mensagem: "Erro ao cadastrar usuário (o nome de usuário já pode estar em uso)." });
    }
});

app.get('/api/usuarios', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT id, usuario, tipo FROM usuarios`);
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.put('/api/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    const { usuario, tipo } = req.body;

    if (!usuario || !tipo) {
        return res.status(400).json({ sucesso: false, mensagem: "Usuário e tipo são obrigatórios." });
    }

    try {
        const { rowCount } = await pool.query(`UPDATE usuarios SET usuario = $1, tipo = $2 WHERE id = $3`, [usuario.trim(), tipo.trim(), id]);
        if (rowCount === 0) {
            return res.status(404).json({ sucesso: false, mensagem: "Usuário não encontrado." });
        }
        return res.json({ sucesso: true, mensagem: "Usuário atualizado com sucesso!" });
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

// --- ROTAS DE CADASTRO DE APOIO ---
app.post('/api/lojas', async (req, res) => {
    try {
        const { rows } = await pool.query(`INSERT INTO lojas (nome) VALUES ($1) RETURNING id`, [req.body.nome]);
        return res.json({ sucesso: true, id: rows[0].id });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.get('/api/lojas', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT id, nome FROM lojas`);
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ erro: err.message });
    }
});

app.post('/api/setores', async (req, res) => {
    try {
        const { rows } = await pool.query(`INSERT INTO setores (nome) VALUES ($1) RETURNING id`, [req.body.nome]);
        return res.json({ sucesso: true, id: rows[0].id });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.get('/api/setores', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT id, nome FROM setores`);
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ erro: err.message });
    }
});

app.post('/api/equipamentos', async (req, res) => {
    try {
        const { rows } = await pool.query(`INSERT INTO equipamentos (nome) VALUES ($1) RETURNING id`, [req.body.nome]);
        return res.json({ sucesso: true, id: rows[0].id });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.get('/api/equipamentos', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT id, nome FROM equipamentos`);
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ erro: err.message });
    }
});

app.post('/api/responsaveis', async (req, res) => {
    try {
        const { rows } = await pool.query(`INSERT INTO responsaveis (nome) VALUES ($1) RETURNING id`, [req.body.nome]);
        return res.json({ sucesso: true, id: rows[0].id });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.get('/api/responsaveis', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT id, nome FROM responsaveis`);
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({ erro: err.message });
    }
});

// --- ROTAS DE ATUALIZAÇÃO (PUT) DE APOIO ---
app.put('/api/lojas/:id', async (req, res) => {
    try {
        await pool.query(`UPDATE lojas SET nome = $1 WHERE id = $2`, [req.body.nome, req.params.id]);
        return res.json({ sucesso: true, mensagem: "Loja atualizada com sucesso!" });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.put('/api/setores/:id', async (req, res) => {
    try {
        await pool.query(`UPDATE setores SET nome = $1 WHERE id = $2`, [req.body.nome, req.params.id]);
        return res.json({ sucesso: true, mensagem: "Setor atualizado com sucesso!" });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.put('/api/equipamentos/:id', async (req, res) => {
    try {
        await pool.query(`UPDATE equipamentos SET nome = $1 WHERE id = $2`, [req.body.nome, req.params.id]);
        return res.json({ sucesso: true, mensagem: "Equipamento atualizado com sucesso!" });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.put('/api/responsaveis/:id', async (req, res) => {
    try {
        await pool.query(`UPDATE responsaveis SET nome = $1 WHERE id = $2`, [req.body.nome, req.params.id]);
        return res.json({ sucesso: true, mensagem: "Responsável atualizado com sucesso!" });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// --- ROTAS DE EXCLUSÃO DE APOIO ---
app.delete('/api/lojas/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM lojas WHERE id = $1`, [req.params.id]);
        return res.json({ sucesso: true, mensagem: "Loja excluída com sucesso!" });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.delete('/api/setores/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM setores WHERE id = $1`, [req.params.id]);
        return res.json({ sucesso: true, mensagem: "Setor excluído com sucesso!" });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.delete('/api/equipamentos/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM equipamentos WHERE id = $1`, [req.params.id]);
        return res.json({ sucesso: true, mensagem: "Equipamento excluído com sucesso!" });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.delete('/api/responsaveis/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM responsaveis WHERE id = $1`, [req.params.id]);
        return res.json({ sucesso: true, mensagem: "Responsável excluído com sucesso!" });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// --- ROTAS DE CHAMADOS ---
app.post('/api/chamados', upload.single('foto'), async (req, res) => {
    const { descricao, loja_id, setor_id, equipamento_id, responsavel_id, setor_responsavel_id, criado_por, urgencia } = req.body;
    
    // Converte a imagem da memória para Base64
    let fotoUrl = null;
    if (req.file) {
        const base64Data = req.file.buffer.toString('base64');
        fotoUrl = `data:${req.file.mimetype};base64,${base64Data}`;
    }

    const dataAtualLocal = getAgoraBrasil();
    const nivelUrgencia = urgencia || 'Baixa';

    const query = `INSERT INTO chamados 
        (descricao, loja_id, setor_id, equipamento_id, responsavel_id, setor_responsavel_id, criado_por, foto, urgencia, status, data_abertura) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Aberto', $10) RETURNING id`;
    
    try {
        const { rows } = await pool.query(query, [descricao, loja_id || null, setor_id || null, equipamento_id || null, responsavel_id || null, setor_responsavel_id || null, criado_por, fotoUrl, nivelUrgencia, dataAtualLocal]);
        return res.json({ sucesso: true, id: rows[0].id, mensagem: "Chamado aberto com sucesso!" });
    } catch (err) {
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
    const { id } = req.params;
    const { descricao } = req.body;

    try {
        const { rowCount } = await pool.query(`UPDATE chamados SET descricao = $1 WHERE id = $2`, [descricao, id]);
        if (rowCount === 0) {
            return res.status(404).json({ sucesso: false, mensagem: "Chamado não encontrado." });
        }
        return res.json({ sucesso: true, mensagem: "Descrição atualizada com sucesso!" });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.patch('/api/chamados/:id/status', async (req, res) => {
    try {
        await pool.query(`UPDATE chamados SET status = $1 WHERE id = $2`, [req.body.status, req.params.id]);
        return res.json({ sucesso: true });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.patch('/api/chamados/:id/urgencia', async (req, res) => {
    try {
        await pool.query(`UPDATE chamados SET urgencia = $1 WHERE id = $2`, [req.body.urgencia, req.params.id]);
        return res.json({ sucesso: true, mensagem: 'Urgência atualizada com sucesso!' });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.patch('/api/chamados/:id/responsavel', async (req, res) => {
    try {
        await pool.query(`UPDATE chamados SET responsavel_id = $1 WHERE id = $2`, [req.body.responsavel_id, req.params.id]);
        return res.json({ sucesso: true });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.patch('/api/chamados/:id/setor-responsavel', async (req, res) => {
    try {
        await pool.query(`UPDATE chamados SET setor_responsavel_id = $1 WHERE id = $2`, [req.body.setor_responsavel_id, req.params.id]);
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
        return res.status(500).json({ sucesso: false, mensagem: err.message });
    }
});

// --- ROTAS DE CHECKLISTS ---
app.post('/api/checklists', async (req, res) => {
    const { titulo, responsavel, itens, dias = 1, usuario } = req.body;
    
    if (!titulo || !itens || itens.length === 0) {
        return res.status(400).json({ sucesso: false, mensagem: "Título e itens são obrigatórios." });
    }

    const totalCriar = parseInt(dias) || 1;
    const dataAtualLocal = getAgoraBrasil();

    try {
        for (let i = 0; i < totalCriar; i++) {
            const dataAlvo = new Date();
            dataAlvo.setDate(dataAlvo.getDate() + i);
            const dataFormatada = dataAlvo.toLocaleDateString('pt-BR');
            const tituloFinal = totalCriar > 1 ? `${titulo} (${dataFormatada})` : titulo;

            const { rows } = await pool.query(
                `INSERT INTO checklists (titulo, responsavel, criado_por, data_criacao) VALUES ($1, $2, $3, $4) RETURNING id`, 
                [tituloFinal, responsavel || 'Não definido', usuario || 'Desconhecido', dataAtualLocal]
            );
            
            const checklistId = rows[0].id;

            for (const item of itens) {
                await pool.query(`INSERT INTO checklist_itens (checklist_id, descricao) VALUES ($1, $2)`, [checklistId, item]);
            }
        }
        return res.json({ sucesso: true, mensagem: `${totalCriar} checklist(s) criado(s) com sucesso!` });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

function formatarItensComFotos(itens) {
    return itens.map(item => {
        let fotosArray = [];
        try {
            if (item.fotos) {
                fotosArray = JSON.parse(item.fotos);
            }
        } catch (e) {
            if (item.fotos) fotosArray = [item.fotos];
        }
        return {
            ...item,
            fotos: fotosArray
        };
    });
}

app.get('/api/checklists', async (req, res) => {
    try {
        const { rows: checklists } = await pool.query(`SELECT id, titulo, responsavel, criado_por, concluido_por, data_criacao FROM checklists ORDER BY id DESC`);
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
    try {
        const { rows: checklistRows } = await pool.query(`SELECT * FROM checklists WHERE id = $1`, [req.params.id]);
        if (checklistRows.length === 0) return res.status(404).json({ erro: "Checklist não encontrado" });
        
        const checklist = checklistRows[0];
        const { rows: itens } = await pool.query(`SELECT * FROM checklist_itens WHERE checklist_id = $1`, [req.params.id]);
        
        return res.json({ ...checklist, itens: formatarItensComFotos(itens || []) });
    } catch (err) {
        return res.status(500).json({ erro: err.message });
    }
});

app.put('/api/checklists/:id', async (req, res) => {
    const { id } = req.params;
    const { titulo, responsavel, concluido_por } = req.body;

    try {
        const { rowCount } = await pool.query(`UPDATE checklists SET titulo = $1, responsavel = $2, concluido_por = $3 WHERE id = $4`, [titulo, responsavel, concluido_por, id]);
        if (rowCount === 0) {
            return res.status(404).json({ sucesso: false, mensagem: "Checklist não encontrado." });
        }
        return res.json({ sucesso: true, mensagem: "Checklist atualizado com sucesso!" });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.patch('/api/checklists/:id/concluir', async (req, res) => {
    try {
        await pool.query(`UPDATE checklists SET concluido_por = $1 WHERE id = $2`, [req.body.usuario, req.params.id]);
        return res.json({ sucesso: true });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// --- ROTAS PARA OS ITENS DO CHECKLIST ---
app.patch('/api/checklist-itens/:id/status', async (req, res) => {
    try {
        await pool.query(`UPDATE checklist_itens SET status = $1 WHERE id = $2`, [req.body.status, req.params.id]);
        return res.json({ sucesso: true, mensagem: 'Status atualizado com sucesso!' });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.patch('/api/checklist-itens/:id/observacao', async (req, res) => {
    try {
        await pool.query(`UPDATE checklist_itens SET observacao = $1 WHERE id = $2`, [req.body.observacao, req.params.id]);
        return res.json({ sucesso: true, mensagem: 'Observação salva com sucesso!' });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.patch('/api/checklist-itens/:id/toggle', async (req, res) => {
    try {
        await pool.query(`UPDATE checklist_itens SET concluido = $1 WHERE id = $2`, [req.body.concluido ? 1 : 0, req.params.id]);
        return res.json({ sucesso: true });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.post('/api/checklist-itens/:id/foto', upload.array('fotos'), async (req, res) => {
    const itemId = req.params.id;

    // Converte imagens da memória para Base64
    let novosArquivos = [];
    if (req.files && req.files.length > 0) {
        novosArquivos = req.files.map(f => `data:${f.mimetype};base64,${f.buffer.toString('base64')}`);
    } else if (req.file) {
        novosArquivos = [`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`];
    }

    if (novosArquivos.length === 0) {
        return res.status(400).json({ sucesso: false, mensagem: "Nenhuma foto enviada." });
    }

    try {
        const { rows } = await pool.query(`SELECT fotos FROM checklist_itens WHERE id = $1`, [itemId]);
        const row = rows[0];

        let listaAtual = [];
        try {
            if (row && row.fotos) {
                listaAtual = JSON.parse(row.fotos);
            }
        } catch (e) {
            if (row && row.fotos) listaAtual = [row.fotos];
        }

        const listaFinal = [...listaAtual, ...novosArquivos];

        await pool.query(`UPDATE checklist_itens SET fotos = $1 WHERE id = $2`, [JSON.stringify(listaFinal), itemId]);
        return res.json({ sucesso: true, fotos: listaFinal });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

app.delete('/api/checklists/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM checklists WHERE id = $1`, [req.params.id]);
        return res.json({ sucesso: true });
    } catch (err) {
        return res.status(500).json({ sucesso: false, erro: err.message });
    }
});

// --- AUTENTICAÇÃO E CADASTRO ---
app.post('/api/cadastro', async (req, res) => {
    const usuarioParaSalvar = (req.body.usuario || req.body.nome || '').trim();
    const senha = req.body.senha;
    const tipo = (req.body.tipo || 'comum').trim();

    if (!usuarioParaSalvar || !senha) {
        return res.status(400).json({ sucesso: false, mensagem: "Usuário e senha são obrigatórios." });
    }

    try {
        await pool.query(`INSERT INTO usuarios (usuario, senha, tipo) VALUES ($1, $2, $3)`, [usuarioParaSalvar, senha, tipo]);
        return res.json({ sucesso: true, mensagem: "Usuário cadastrado com sucesso!" });
    } catch (err) {
        console.error('Erro no cadastro:', err.message);
        return res.status(400).json({ sucesso: false, mensagem: "Usuário já existente ou inválido." });
    }
});

app.post('/api/login', async (req, res) => {
    const usuarioParaBuscar = (req.body.usuario || '').trim();
    const senha = req.body.senha;

    if (!usuarioParaBuscar || !senha) {
        return res.status(400).json({ sucesso: false, mensagem: "Usuário e senha são obrigatórios." });
    }

    try {
        const { rows } = await pool.query(`SELECT * FROM usuarios WHERE usuario = $1 AND senha = $2`, [usuarioParaBuscar, senha]);
        const row = rows[0];

        if (row) {
            return res.json({ sucesso: true, usuario: row.usuario, tipo: row.tipo || 'comum' });
        } else {
            return res.status(401).json({ sucesso: false, mensagem: "Usuário ou senha inválidos." });
        }
    } catch (err) {
        console.error('Erro na consulta de login:', err.message);
        return res.status(500).json({ sucesso: false, mensagem: "Erro interno no servidor." });
    }
});

// Exporta o app para o Vercel Serverless Functions
if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => {
        console.log('Servidor rodando na porta 3000 localmente');
    });
}
module.exports = app;
