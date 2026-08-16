import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ===== CONEXÃO COM SUPABASE =====
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ===== MIDDLEWARE DE AUTENTICAÇÃO =====
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  req.user = user;
  next();
};

// ===== ROTA DE SAÚDE (TESTE) =====
app.get('/api/health', (req, res) => {
  res.json({ status: 'FinanFlow backend rodando! 🚀' });
});

// ===== PERFIL =====
app.get('/api/profile', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', req.user.id)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ===== CARTEIRAS =====
app.get('/api/wallets', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/wallets', authenticate, async (req, res) => {
  const { type, name, goal } = req.body;

  const { data, error } = await supabase
    .from('wallets')
    .insert([{
      user_id: req.user.id,
      type,
      name,
      goal: goal || 0,
      balance: 0
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/wallets/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { name, goal } = req.body;

  const { data, error } = await supabase
    .from('wallets')
    .update({ name, goal })
    .eq('id', id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/wallets/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('wallets')
    .delete()
    .eq('id', id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Carteira excluída com sucesso' });
});

// ===== CATEGORIAS =====
app.get('/api/categories', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/categories', authenticate, async (req, res) => {
  const { name, type, monthly_limit } = req.body;

  const { data, error } = await supabase
    .from('categories')
    .insert([{
      user_id: req.user.id,
      name,
      type,
      monthly_limit: monthly_limit || null
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/categories/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { name, monthly_limit } = req.body;

  const { data, error } = await supabase
    .from('categories')
    .update({ name, monthly_limit })
    .eq('id', id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/categories/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Categoria excluída com sucesso' });
});

// ===== TRANSAÇÕES =====
app.get('/api/transactions', authenticate, async (req, res) => {
  const { wallet_id, category_id, start_date, end_date } = req.query;

  let query = supabase
    .from('transactions')
    .select('*, categories(name, type)')
    .eq('user_id', req.user.id)
    .order('date', { ascending: false });

  if (wallet_id) query = query.eq('wallet_id', wallet_id);
  if (category_id) query = query.eq('category_id', category_id);
  if (start_date) query = query.gte('date', start_date);
  if (end_date) query = query.lte('date', end_date);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
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
    transfer_pair_id
  } = req.body;

  if (!wallet_id || !amount) {
    return res.status(400).json({ error: 'Carteira e Valor são obrigatórios' });
  }

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
      description,
      date: date || new Date().toISOString().split('T')[0],
      category_id: category_id || null,
      payment_method: payment_method || null,
      is_transfer: is_transfer || false,
      transfer_pair_id: transfer_pair_id || null
    }])
    .select('*, categories(name)')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.put('/api/transactions/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { description, amount, date, category_id, payment_method } = req.body;

  const { data, error } = await supabase
    .from('transactions')
    .update({
      description,
      amount,
      date,
      category_id,
      payment_method
    })
    .eq('id', id)
    .eq('user_id', req.user.id)
    .select('*, categories(name)')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/transactions/:id', authenticate, async (req, res) => {
  const { id } = req.params;

  // Verifica se a transação existe e pertence ao usuário
  const { data: tx, error: findError } = await supabase
    .from('transactions')
    .select('id, wallet_id, amount')
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

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Transação excluída com sucesso' });
});

// ===== DASHBOARD (RESUMO) =====
app.get('/api/dashboard', authenticate, async (req, res) => {
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', req.user.id);

  if (error) return res.status(500).json({ error: error.message });

  const totalReceitas = transactions
    .filter(t => t.type === 'RECEITA')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDespesas = transactions
    .filter(t => t.type === 'DESPESA')
    .reduce((sum, t) => sum + t.amount, 0);

  const { data: wallets, error: walletError } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', req.user.id);

  if (walletError) return res.status(500).json({ error: walletError.message });

  res.json({
    totalReceitas,
    totalDespesas,
    saldoTotal: totalReceitas - totalDespesas,
    wallets
  });
});

// ===== PORTA =====
const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`🔥 FinanFlow Backend rodando na porta ${PORT}`);
});
