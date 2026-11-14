// ... arquivo existente ...

// --- AUTENTICAÇÃO E LOGIN ---
app.post('/api/login', async (req, res) => {
    const usuarioParaBuscar = (req.body.usuario || '').trim().toLowerCase();
    const senha = req.body.senha;

    if (!usuarioParaBuscar || !senha) {
        return res.status(400).json({ sucesso: false, mensagem: 'Usuário e senha são obrigatórios.' });
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
        } else {
            return res.status(401).json({ sucesso: false, mensagem: 'Usuário ou senha inválidos.' });
        }
    } catch (err) {
        return res.status(500).json({ sucesso: false, mensagem: 'Erro interno no servidor.' });
    }
});

app.get('/api/plantas', async (req, res) => {
    try {
        if (!process.env.DATABASE_URL) {
            return res.json([]);
        }
        const { rows } = await pool.query(`SELECT * FROM plantas ORDER BY updated_at DESC`);
        return res.json(rows);
    } catch (err) {
        return res.json([]);
    }
});

app.post('/api/plantas', async (req, res) => {
    try {
        if (!process.env.DATABASE_URL) {
            return res.json({ sucesso: true, local: true, mensagem: 'Sem conexão de banco, salvo localmente.' });
        }

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
    try {
        if (!process.env.DATABASE_URL) {
            return res.status(404).json({ sucesso: false, mensagem: 'Projeto não encontrado no servidor.' });
        }
        const { rows } = await pool.query(`SELECT * FROM plantas WHERE id = $1`, [req.params.id]);
        if (!rows[0]) return res.status(404).json({ sucesso: false, mensagem: 'Projeto não encontrado.' });
        return res.json(rows[0]);
    } catch (err) {
        return res.status(404).json({ sucesso: false, mensagem: 'Projeto não encontrado.' });
    }
});

app.put('/api/plantas/:id', async (req, res) => {
    try {
        if (!process.env.DATABASE_URL) {
            return res.json({ sucesso: true, local: true });
        }
        const { name, data, owner } = req.body || {};
        const payload = JSON.stringify({ project: data || {} });
        await pool.query(`UPDATE plantas SET nome = $1, dados = $2, usuario = $3, updated_at = NOW() WHERE id = $4`, [name || 'Projeto', payload, owner || 'demo', req.params.id]);
        return res.json({ sucesso: true });
    } catch (err) {
        return res.json({ sucesso: true, local: true });
    }
});

app.delete('/api/plantas/:id', async (req, res) => {
    try {
        if (!process.env.DATABASE_URL) {
            return res.json({ sucesso: true, local: true });
        }
        await pool.query(`DELETE FROM plantas WHERE id = $1`, [req.params.id]);
        return res.json({ sucesso: true });
    } catch (err) {
        return res.json({ sucesso: true, local: true });
    }
});

// exporta o app para o vercel
if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => {
        console.log('Servidor rodando na porta 3000 localmente');
    });
}
module.exports = app;

