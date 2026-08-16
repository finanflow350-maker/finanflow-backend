import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ===== AUTENTICAÇÃO =====
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Token inválido' });

  req.user = user;
  next();
};

// ===== ROTA DE TESTE =====
app.get('/api/health', (req, res) => {
  res.json({ status: 'FinanFlow backend rodando!' });
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
    .insert([{ user_id: req.user.id, type, name, goal: goal || 0 }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// ===== TRANSAÇÕES =====
app.get('/api/transactions', authenticate, async (req, res) => {
  const { wallet_id } = req.query;
  let query = supabase
    .from('transactions')
    .select(`*, categories(name, type)`)
    .eq('user_id', req.user.id)
    .order('date', { ascending: false });

  if (wallet_id) query = query.eq('wallet_id', wallet_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/transactions', authenticate, async (req, res) => {
  const { wallet_id, type, amount, description, date, category_id, payment_method } = req.body;

  if (!wallet_id || !amount) {
    return res.status(400).json({ error: 'Carteira e Valor são obrigatórios' });
  }

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
      category_id,
      payment_method
    }])
    .select(`*, categories(name)`)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.delete('/api/transactions/:id', authenticate, async (req, res) => {
  const { id } = req.params;

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

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Transação excluída com sucesso' });
});

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => console.log(`🔥 FinanFlow Backend rodando na porta ${PORT}`));