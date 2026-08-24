import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();

// ===== CORS =====
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ===== SUPABASE =====
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERRO: Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ===== ROTA DE SAÚDE =====
app.get('/api/health', (req, res) => {
  res.json({ status: 'FinanFlow backend rodando! 🚀' });
});

// ============================================================
//  AUTENTICAÇÃO
// ============================================================

// ===== REGISTRO =====
app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validação
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
    }

    console.log('📝 Tentando registrar:', { name, email });

    // 1. Cria usuário no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      console.error('❌ Erro no Auth:', authError);
      return res.status(400).json({ error: authError.message });
    }

    if (!authData.user) {
      return res.status(400).json({ error: 'Erro ao criar usuário' });
    }

    // 2. Cria perfil na tabela profiles
    const { error: profileError } = await supabase
      .from('profiles')
      .insert([{ id: authData.user.id, email, name }]);

    if (profileError) {
      console.warn('⚠️ Erro ao criar perfil:', profileError);
      // Não retorna erro pois o usuário já foi criado
    }

    console.log('✅ Usuário registrado com sucesso!');
    res.status(201).json({
      message: 'Usuário criado com sucesso!',
      user: authData.user
    });
  } catch (error) {
    console.error('❌ Erro no registro:', error);
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

    console.log('🔑 Tentando login:', { email });

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('❌ Erro no login:', error);
      return res.status(400).json({ error: error.message });
    }

    console.log('✅ Login bem-sucedido!');
    res.json({
      user: data.user,
      token: data.session.access_token
    });
  } catch (error) {
    console.error('❌ Erro no login:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
//  ROTAS PROTEGIDAS (EXEMPLO)
// ============================================================

// ===== MIDDLEWARE DE AUTENTICAÇÃO =====
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Erro ao autenticar' });
  }
};

// ===== PERFIL =====
app.get('/api/profile', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
//  PORTA
// ============================================================
const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`🔥 FinanFlow Backend rodando na porta ${PORT}`);
  console.log(`📍 URL: https://finanflow-backend.onrender.com`);
});
