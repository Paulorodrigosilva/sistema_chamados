process.env.TZ = 'America/Sao_Paulo';

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// Aumentado o limite para evitar o erro 413 (Payload Too Large) ao enviar múltiplos arquivos/fotos grandes
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// Garante que a pasta de uploads exista
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuração do Multer para salvar fotos
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Função auxiliar para obter a data/hora atual formatada no fuso do Brasil (YYYY-MM-DD HH:MM:SS)
function getAgoraBrasil() {
    const agora = new Date();
    const isoString = new Date(agora.getTime() - (agora.getTimezoneOffset() * 60000)).toISOString();
    return isoString.replace('T', ' ').substring(0, 19);
}

// Inicializa o banco de dados
const db = new sqlite3.Database('./banco.db', (err) => {
    if (err) console.error('Erro ao abrir o banco:', err.message);
    else console.log('Conectado ao banco de dados SQLite.');
});

// Criação automática de tabelas
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        usuario TEXT UNIQUE, 
        senha TEXT, 
        tipo TEXT DEFAULT 'comum'
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS lojas (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS setores (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS equipamentos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS responsaveis (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT)`);
    
    db.run(`CREATE TABLE IF NOT EXISTS chamados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        data_abertura DATETIME
    )`, () => {
        db.run(`ALTER TABLE chamados ADD COLUMN setor_responsavel_id INTEGER`, () => {});
        db.run(`ALTER TABLE chamados ADD COLUMN criado_por TEXT`, () => {});
        db.run(`ALTER TABLE chamados ADD COLUMN foto TEXT`, () => {});
        db.run(`ALTER TABLE chamados ADD COLUMN urgencia TEXT DEFAULT 'Baixa'`, () => {});
    });

    db.run(`CREATE TABLE IF NOT EXISTS checklists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT,
        responsavel TEXT,
        criado_por TEXT,
        concluido_por TEXT,
        data_criacao DATETIME
    )`, () => {
        db.run(`ALTER TABLE checklists ADD COLUMN responsavel TEXT`, () => {});
    });

    db.run(`CREATE TABLE IF NOT EXISTS checklist_itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checklist_id INTEGER,
        descricao TEXT,
        concluido INTEGER DEFAULT 0,
        status TEXT,
        observacao TEXT,
        fotos TEXT,
        FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
    )`, () => {
        db.run(`ALTER TABLE checklist_itens ADD COLUMN status TEXT`, () => {});
        db.run(`ALTER TABLE checklist_itens ADD COLUMN observacao TEXT`, () => {});
        db.run(`ALTER TABLE checklist_itens ADD COLUMN fotos TEXT`, () => {});
    });
});

// --- ROTAS DE CADASTRO E GERENCIAMENTO DE USUÁRIOS ---
app.post('/api/usuarios', (req, res) => {
    const { nome, senha, tipo } = req.body;
    const usuarioParaSalvar = (nome || req.body.usuario || '').trim();
    const tipoUsuario = (tipo || 'comum').trim();

    if (!usuarioParaSalvar || !senha) {
        return res.status(400).json({ sucesso: false, mensagem: "Usuário e senha são obrigatórios." });
    }

    db.run(`INSERT INTO usuarios (usuario, senha, tipo) VALUES (?, ?, ?)`, [usuarioParaSalvar, senha, tipoUsuario], function(err) {
        if (err) {
            console.error('Erro ao cadastrar em /api/usuarios:', err.message);
            return res.status(400).json({ sucesso: false, mensagem: "Erro ao cadastrar usuário (o nome de usuário já pode estar em uso)." });
        }
        return res.json({ sucesso: true, mensagem: "Usuário cadastrado com sucesso!" });
    });
});

app.get('/api/usuarios', (req, res) => {
    db.all(`SELECT id, usuario, tipo FROM usuarios`, [], (err, rows) => {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json(rows || []);
    });
});

app.put('/api/usuarios/:id', (req, res) => {
    const { id } = req.params;
    const { usuario, tipo } = req.body;

    if (!usuario || !tipo) {
        return res.status(400).json({ sucesso: false, mensagem: "Usuário e tipo são obrigatórios." });
    }

    db.run(`UPDATE usuarios SET usuario = ?, tipo = ? WHERE id = ?`, [usuario.trim(), tipo.trim(), id], function(err) {
        if (err) {
            return res.status(500).json({ sucesso: false, mensagem: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ sucesso: false, mensagem: "Usuário não encontrado." });
        }
        return res.json({ sucesso: true, mensagem: "Usuário atualizado com sucesso!" });
    });
});

app.delete('/api/usuarios/:id', (req, res) => {
    db.run(`DELETE FROM usuarios WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        if (this.changes === 0) return res.status(404).json({ sucesso: false, mensagem: "Usuário não encontrado." });
        return res.json({ sucesso: true, mensagem: "Usuário excluído com sucesso!" });
    });
});

// --- ROTAS DE CADASTRO DE APOIO ---
app.post('/api/lojas', (req, res) => {
    db.run(`INSERT INTO lojas (nome) VALUES (?)`, [req.body.nome], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true, id: this.lastID });
    });
});

app.get('/api/lojas', (req, res) => {
    db.all(`SELECT id, nome FROM lojas`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        return res.json(rows || []);
    });
});

app.post('/api/setores', (req, res) => {
    db.run(`INSERT INTO setores (nome) VALUES (?)`, [req.body.nome], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true, id: this.lastID });
    });
});

app.get('/api/setores', (req, res) => {
    db.all(`SELECT id, nome FROM setores`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        return res.json(rows || []);
    });
});

app.post('/api/equipamentos', (req, res) => {
    db.run(`INSERT INTO equipamentos (nome) VALUES (?)`, [req.body.nome], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true, id: this.lastID });
    });
});

app.get('/api/equipamentos', (req, res) => {
    db.all(`SELECT id, nome FROM equipamentos`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        return res.json(rows || []);
    });
});

app.post('/api/responsaveis', (req, res) => {
    db.run(`INSERT INTO responsaveis (nome) VALUES (?)`, [req.body.nome], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true, id: this.lastID });
    });
});

app.get('/api/responsaveis', (req, res) => {
    db.all(`SELECT id, nome FROM responsaveis`, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        return res.json(rows || []);
    });
});

// --- ROTAS DE ATUALIZAÇÃO (PUT) DE APOIO ---
app.put('/api/lojas/:id', (req, res) => {
    db.run(`UPDATE lojas SET nome = ? WHERE id = ?`, [req.body.nome, req.params.id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true, mensagem: "Loja atualizada com sucesso!" });
    });
});

app.put('/api/setores/:id', (req, res) => {
    db.run(`UPDATE setores SET nome = ? WHERE id = ?`, [req.body.nome, req.params.id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true, mensagem: "Setor atualizado com sucesso!" });
    });
});

app.put('/api/equipamentos/:id', (req, res) => {
    db.run(`UPDATE equipamentos SET nome = ? WHERE id = ?`, [req.body.nome, req.params.id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true, mensagem: "Equipamento atualizado com sucesso!" });
    });
});

app.put('/api/responsaveis/:id', (req, res) => {
    db.run(`UPDATE responsaveis SET nome = ? WHERE id = ?`, [req.body.nome, req.params.id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true, mensagem: "Responsável atualizado com sucesso!" });
    });
});

// --- ROTAS DE EXCLUSÃO DE APOIO ---
app.delete('/api/lojas/:id', (req, res) => {
    db.run(`DELETE FROM lojas WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true, mensagem: "Loja excluída com sucesso!" });
    });
});

app.delete('/api/setores/:id', (req, res) => {
    db.run(`DELETE FROM setores WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true, mensagem: "Setor excluído com sucesso!" });
    });
});

app.delete('/api/equipamentos/:id', (req, res) => {
    db.run(`DELETE FROM equipamentos WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true, mensagem: "Equipamento excluído com sucesso!" });
    });
});

app.delete('/api/responsaveis/:id', (req, res) => {
    db.run(`DELETE FROM responsaveis WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true, mensagem: "Responsável excluído com sucesso!" });
    });
});

// --- ROTAS DE CHAMADOS ---
app.post('/api/chamados', upload.single('foto'), (req, res) => {
    const { descricao, loja_id, setor_id, equipamento_id, responsavel_id, setor_responsavel_id, criado_por, urgencia } = req.body;
    const fotoUrl = req.file ? '/uploads/' + req.file.filename : null;
    const dataAtualLocal = getAgoraBrasil();
    const nivelUrgencia = urgencia || 'Baixa';

    const query = `INSERT INTO chamados 
        (descricao, loja_id, setor_id, equipamento_id, responsavel_id, setor_responsavel_id, criado_por, foto, urgencia, status, data_abertura) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Aberto', ?)`;
    
    db.run(query, [descricao, loja_id || null, setor_id || null, equipamento_id || null, responsavel_id || null, setor_responsavel_id || null, criado_por, fotoUrl, nivelUrgencia, dataAtualLocal], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true, id: this.lastID, mensagem: "Chamado aberto com sucesso!" });
    });
});

app.get('/api/chamados', (req, res) => {
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
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        
        const ajustados = (rows || []).map(row => {
            if (row.data_abertura) {
                const dt = new Date(row.data_abertura.includes('T') ? row.data_abertura : row.data_abertura.replace(' ', 'T') + 'Z');
                if (!isNaN(dt.getTime())) {
                    row.data_abertura = dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                }
            }
            return row;
        });

        return res.json(ajustados);
    });
});

app.patch('/api/chamados/:id/descricao', (req, res) => {
    const { id } = req.params;
    const { descricao } = req.body;

    db.run(`UPDATE chamados SET descricao = ? WHERE id = ?`, [descricao, id], function(err) {
        if (err) {
            return res.status(500).json({ sucesso: false, erro: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ sucesso: false, mensagem: "Chamado não encontrado." });
        }
        return res.json({ sucesso: true, mensagem: "Descrição atualizada com sucesso!" });
    });
});

app.patch('/api/chamados/:id/status', (req, res) => {
    const { status } = req.body;
    db.run(`UPDATE chamados SET status = ? WHERE id = ?`, [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true });
    });
});

app.patch('/api/chamados/:id/urgencia', (req, res) => {
    const { urgencia } = req.body;
    db.run(`UPDATE chamados SET urgencia = ? WHERE id = ?`, [urgencia, req.params.id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true, mensagem: 'Urgência atualizada com sucesso!' });
    });
});

app.patch('/api/chamados/:id/responsavel', (req, res) => {
    const { responsavel_id } = req.body;
    db.run(`UPDATE chamados SET responsavel_id = ? WHERE id = ?`, [responsavel_id, req.params.id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true });
    });
});

app.patch('/api/chamados/:id/setor-responsavel', (req, res) => {
    const { setor_responsavel_id } = req.body;
    db.run(`UPDATE chamados SET setor_responsavel_id = ? WHERE id = ?`, [setor_responsavel_id, req.params.id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true });
    });
});

app.delete('/api/chamados/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM chamados WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, mensagem: err.message });
        return res.json({ sucesso: true, mensagem: "Chamado excluído com sucesso!" });
    });
});

// --- ROTAS DE CHECKLISTS ---
app.post('/api/checklists', (req, res) => {
    const { titulo, responsavel, itens, dias = 1, usuario } = req.body;
    
    if (!titulo || !itens || itens.length === 0) {
        return res.status(400).json({ sucesso: false, mensagem: "Título e itens são obrigatórios." });
    }

    let checklistsCriados = 0;
    const totalCriar = parseInt(dias) || 1;
    const dataAtualLocal = getAgoraBrasil();

    for (let i = 0; i < totalCriar; i++) {
        const dataAlvo = new Date();
        dataAlvo.setDate(dataAlvo.getDate() + i);
        const dataFormatada = dataAlvo.toLocaleDateString('pt-BR');
        const tituloFinal = totalCriar > 1 ? `${titulo} (${dataFormatada})` : titulo;

        db.run(`INSERT INTO checklists (titulo, responsavel, criado_por, data_criacao) VALUES (?, ?, ?, ?)`, 
        [tituloFinal, responsavel || 'Não definido', usuario || 'Desconhecido', dataAtualLocal], function(err) {
            if (!err) {
                const checklistId = this.lastID;
                const stmt = db.prepare(`INSERT INTO checklist_itens (checklist_id, descricao) VALUES (?, ?)`);
                itens.forEach(item => stmt.run(checklistId, item));
                stmt.finalize();
            }

            checklistsCriados++;
            if (checklistsCriados === totalCriar) {
                return res.json({ sucesso: true, mensagem: `${totalCriar} checklist(s) criado(s) com sucesso!` });
            }
        });
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

app.get('/api/checklists', (req, res) => {
    db.all(`SELECT id, titulo, responsavel, criado_por, concluido_por, data_criacao FROM checklists ORDER BY id DESC`, [], (err, checklists) => {
        if (err) return res.status(500).json({ erro: err.message });
        if (!checklists || checklists.length === 0) return res.json([]);

        const promessas = checklists.map(cl => {
            return new Promise((resolve) => {
                db.all(`SELECT * FROM checklist_itens WHERE checklist_id = ?`, [cl.id], (err, itens) => {
                    resolve({ ...cl, itens: formatarItensComFotos(itens || []) });
                });
            });
        });

        Promise.all(promessas).then(resultados => res.json(resultados));
    });
});

app.get('/api/checklists/:id', (req, res) => {
    db.get(`SELECT * FROM checklists WHERE id = ?`, [req.params.id], (err, checklist) => {
        if (err || !checklist) return res.status(404).json({ erro: "Checklist não encontrado" });
        db.all(`SELECT * FROM checklist_itens WHERE checklist_id = ?`, [req.params.id], (err, itens) => {
            return res.json({ ...checklist, itens: formatarItensComFotos(itens || []) });
        });
    });
});

// Rota PUT para atualizar o checklist completo
app.put('/api/checklists/:id', (req, res) => {
    const { id } = req.params;
    const { titulo, responsavel, concluido_por } = req.body;

    const query = `UPDATE checklists SET titulo = ?, responsavel = ?, concluido_por = ? WHERE id = ?`;
    
    db.run(query, [titulo, responsavel, concluido_por, id], function(err) {
        if (err) {
            return res.status(500).json({ sucesso: false, erro: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ sucesso: false, mensagem: "Checklist não encontrado." });
        }
        return res.json({ sucesso: true, mensagem: "Checklist atualizado com sucesso!" });
    });
});

app.patch('/api/checklists/:id/concluir', (req, res) => {
    const { usuario } = req.body;
    db.run(`UPDATE checklists SET concluido_por = ? WHERE id = ?`, [usuario, req.params.id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true });
    });
});

// --- ROTAS PARA OS ITENS DO CHECKLIST ---
app.patch('/api/checklist-itens/:id/status', (req, res) => {
    const { status } = req.body;
    db.run(`UPDATE checklist_itens SET status = ? WHERE id = ?`, [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true, mensagem: 'Status atualizado com sucesso!' });
    });
});

app.patch('/api/checklist-itens/:id/observacao', (req, res) => {
    const { observacao } = req.body;
    db.run(`UPDATE checklist_itens SET observacao = ? WHERE id = ?`, [observacao, req.params.id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true, mensagem: 'Observação salva com sucesso!' });
    });
});

app.patch('/api/checklist-itens/:id/toggle', (req, res) => {
    const { concluido } = req.body;
    db.run(`UPDATE checklist_itens SET concluido = ? WHERE id = ?`, [concluido ? 1 : 0, req.params.id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        return res.json({ sucesso: true });
    });
});

app.post('/api/checklist-itens/:id/foto', upload.array('fotos'), (req, res) => {
    const itemId = req.params.id;

    let novosArquivos = [];
    if (req.files && req.files.length > 0) {
        novosArquivos = req.files.map(f => '/uploads/' + f.filename);
    } else if (req.file) {
        novosArquivos = ['/uploads/' + req.file.filename];
    }

    if (novosArquivos.length === 0) {
        return res.status(400).json({ sucesso: false, mensagem: "Nenhuma foto enviada." });
    }

    db.get(`SELECT fotos FROM checklist_itens WHERE id = ?`, [itemId], (err, row) => {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });

        let listaAtual = [];
        try {
            if (row && row.fotos) {
                listaAtual = JSON.parse(row.fotos);
            }
        } catch (e) {
            if (row && row.fotos) listaAtual = [row.fotos];
        }

        const listaFinal = [...listaAtual, ...novosArquivos];

        db.run(`UPDATE checklist_itens SET fotos = ? WHERE id = ?`, [JSON.stringify(listaFinal), itemId], function(err) {
            if (err) return res.status(500).json({ sucesso: false, erro: err.message });
            return res.json({ sucesso: true, fotos: listaFinal });
        });
    });
});

app.delete('/api/checklists/:id', (req, res) => {
    db.run(`DELETE FROM checklists WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ sucesso: false, erro: err.message });
        db.run(`DELETE FROM checklist_itens WHERE checklist_id = ?`, [req.params.id]);
        return res.json({ sucesso: true });
    });
});

// --- AUTENTICAÇÃO E CADASTRO ---
app.post('/api/cadastro', (req, res) => {
    const usuarioParaSalvar = (req.body.usuario || req.body.nome || '').trim();
    const senha = req.body.senha;
    const tipo = (req.body.tipo || 'comum').trim();

    if (!usuarioParaSalvar || !senha) {
        return res.status(400).json({ sucesso: false, mensagem: "Usuário e senha são obrigatórios." });
    }

    db.run(`INSERT INTO usuarios (usuario, senha, tipo) VALUES (?, ?, ?)`, [usuarioParaSalvar, senha, tipo], function(err) {
        if (err) {
            console.error('Erro no cadastro:', err.message);
            return res.status(400).json({ sucesso: false, mensagem: "Usuário já existente ou inválido." });
        }
        return res.json({ sucesso: true, mensagem: "Usuário cadastrado com sucesso!" });
    });
});

app.post('/api/login', (req, res) => {
    const usuarioParaBuscar = (req.body.usuario || '').trim();
    const senha = req.body.senha;

    if (!usuarioParaBuscar || !senha) {
        return res.status(400).json({ sucesso: false, mensagem: "Usuário e senha são obrigatórios." });
    }

    db.get(`SELECT * FROM usuarios WHERE usuario = ? AND senha = ?`, [usuarioParaBuscar, senha], (err, row) => {
        if (err) {
            console.error('Erro na consulta de login:', err.message);
            return res.status(500).json({ sucesso: false, mensagem: "Erro interno no servidor." });
        }

        if (row) {
            return res.json({ sucesso: true, usuario: row.usuario, tipo: row.tipo || 'comum' });
        } else {
            return res.status(401).json({ sucesso: false, mensagem: "Usuário ou senha inválidos." });
        }
    });
});

app.listen(3000, () => {
    console.log('Servidor rodando na porta 3000');
});