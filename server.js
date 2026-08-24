import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();

// ===== CORS CONFIGURADO =====
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ===== CONEXÃO SUPABASE =====
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERRO: Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================
//  ROTAS PÚBLICAS
// ============================================================

// ===== ROTA DE SAÚDE =====
app.get('/api/health', (req, res) => {
  res.json({ status: 'FinanFlow backend rodando! 🚀' });
});

// ===== REGISTRO (CORRIGIDO) =====
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

    // 2. Cria perfil na tabela profiles com o nome
    const displayName = name || email.split('@')[0];
    const { error: profileError } = await supabase
      .from('profiles')
      .insert([{ 
        id: authData.user.id, 
        email: email, 
        name: displayName 
      }]);

    if (profileError) {
      console.warn('⚠️ Erro ao criar perfil:', profileError);
      // Não retorna erro pois o usuário já foi criado
    }

    console.log('✅ Usuário registrado com sucesso!');
    res.status(201).json({
      message: 'Usuário criado com sucesso!',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        name: displayName
      }
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

    // Busca o nome do usuário na tabela profiles
    let displayName = email.split('@')[0];
    if (data.user) {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', data.user.id)
        .single();
      
      if (!profileError && profileData) {
        displayName = profileData.name || displayName;
      }
    }

    console.log('✅ Login bem-sucedido!');
    res.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        name: displayName
      },
      token: data.session.access_token
    });
  } catch (error) {
    console.error('❌ Erro no login:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
//  ROTAS PROTEGIDAS
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

// ===== CARTEIRAS =====
app.get('/api/wallets', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wallets', authenticate, async (req, res) => {
  const { type, name, goal } = req.body;

  if (!type || !name) {
    return res.status(400).json({ error: 'Tipo e nome são obrigatórios' });
  }

  try {
    const { data, error } = await supabase
      .from('wallets')
      .insert([{
        user_id: req.user.id,
        type,
        name,
        goal: goal || 0,
        balance: 0,
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/wallets/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { name, goal } = req.body;

  try {
    const { data, error } = await supabase
      .from('wallets')
      .update({ name, goal })
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/wallets/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: wallet, error: findError } = await supabase
      .from('wallets')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (findError || !wallet) {
      return res.status(404).json({ error: 'Carteira não encontrada' });
    }

    const { error } = await supabase
      .from('wallets')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Carteira excluída com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== CATEGORIAS =====
app.get('/api/categories', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/categories', authenticate, async (req, res) => {
  const { name, type, monthly_limit } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: 'Nome e tipo são obrigatórios' });
  }

  try {
    const { data, error } = await supabase
      .from('categories')
      .insert([{
        user_id: req.user.id,
        name,
        type,
        monthly_limit: monthly_limit || null,
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/categories/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { name, monthly_limit } = req.body;

  try {
    const { data, error } = await supabase
      .from('categories')
      .update({ name, monthly_limit })
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/categories/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: category, error: findError } = await supabase
      .from('categories')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (findError || !category) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Categoria excluída com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== TRANSAÇÕES =====
app.get('/api/transactions', authenticate, async (req, res) => {
  const { wallet_id, category_id, start_date, end_date } = req.query;

  try {
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('date', { ascending: false });

    if (wallet_id) query = query.eq('wallet_id', wallet_id);
    if (category_id) query = query.eq('category_id', category_id);
    if (start_date) query = query.gte('date', start_date);
    if (end_date) query = query.lte('date', end_date);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/transactions', authenticate, async (req, res) => {
  const {
    wallet_id,
    type,
    amount,
    description,
    date,
    category_id,
    payment_method,
    is_transfer,
    transfer_pair_id,
  } = req.body;

  if (!wallet_id || !amount) {
    return res.status(400).json({ error: 'Carteira e valor são obrigatórios' });
  }

  try {
    // Verifica se a carteira pertence ao usuário
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id')
      .eq('id', wallet_id)
      .eq('user_id', req.user.id)
      .single();

    if (walletError || !wallet) {
      return res.status(403).json({ error: 'Carteira não encontrada ou sem permissão' });
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert([{
        user_id: req.user.id,
        wallet_id,
        type,
        amount,
        description: description || '',
        date: date || new Date().toISOString().split('T')[0],
        category_id: category_id || null,
        payment_method: payment_method || null,
        is_transfer: is_transfer || false,
        transfer_pair_id: transfer_pair_id || null,
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/transactions/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { description, amount, date, category_id, payment_method } = req.body;

  try {
    const { data: tx, error: findError } = await supabase
      .from('transactions')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (findError || !tx) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    const { data, error } = await supabase
      .from('transactions')
      .update({
        description,
        amount,
        date,
        category_id,
        payment_method,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/transactions/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: tx, error: findError } = await supabase
      .from('transactions')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (findError || !tx) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Transação excluída com sucesso' });
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
