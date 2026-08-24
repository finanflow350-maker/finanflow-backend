import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();

// ===== CORS CONFIGURADO =====
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ===== CONEXÃO SUPABASE =====
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ===== ROTA DE TESTE =====
app.get('/api/health', (req, res) => {
  res.json({ status: 'FinanFlow backend rodando! 🚀' });
});

// ===== REGISTRO =====
app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
    }

    // Cria usuário no Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      console.error('Erro no Supabase:', error);
      return res.status(400).json({ error: error.message });
    }

    // Cria perfil na tabela profiles
    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{ id: data.user.id, email, name }]);

      if (profileError) {
        console.warn('Erro ao criar perfil:', profileError);
      }
    }

    res.status(201).json({
      message: 'Usuário criado com sucesso!',
      user: data.user
    });
  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== LOGIN =====
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('Erro no login:', error);
      return res.status(400).json({ error: error.message });
    }

    res.json({
      user: data.user,
      token: data.session.access_token
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== PORTA =====
const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`🔥 FinanFlow Backend rodando na porta ${PORT}`);
});
