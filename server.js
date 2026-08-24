import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();

// ============================================================
//  🔥 CORS CONFIGURADO CORRETAMENTE (SOLUÇÃO PARA FETCH FAILED)
// ============================================================
app.use(cors({
  origin: '*', // Permite requisições de qualquer origem (inclusive seu frontend)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ===== CONEXÃO COM SUPABASE =====
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================
//  ROTAS
// ============================================================

// ===== ROTA DE SAÚDE (TESTE) =====
app.get('/api/health', (req, res) => {
  res.json({ status: 'FinanFlow backend rodando! 🚀' });
});

// ===== REGISTRO =====
app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    console.log('📝 Tentando registrar:', { name, email });

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
    }

    // Cria usuário no Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      console.error('❌ Erro no Supabase (registro):', error);
      return res.status(400).json({ error: error.message });
    }

    // Cria perfil na tabela profiles
    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{ id: data.user.id, email, name }]);

      if (profileError) {
        console.error('❌ Erro ao criar perfil:', profileError);
        // Não retorna erro pois o usuário já foi criado
      }
    }

    console.log('✅ Usuário registrado com sucesso!');
    res.status(201).json({
      message: 'Usuário criado com sucesso!',
      user: data.user
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
    console.log('🔑 Tentando login:', { email });

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
    }

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
//  PORTA
// ============================================================
const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`🔥 FinanFlow Backend rodando na porta ${PORT}`);
  console.log(`📍 URL: https://finanflow-backend.onrender.com`);
});
